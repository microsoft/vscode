/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PromptElement, PromptElementProps, PromptSizing, SystemMessage, UserMessage } from '@vscode/prompt-tsx';
import assert from 'assert';
import type * as vscode from 'vscode';
import { IResponsePart } from '../../../../platform/chat/common/chatMLFetcher';
import { ChatLocation } from '../../../../platform/chat/common/commonTypes';
import { IIgnoreService } from '../../../../platform/ignore/common/ignoreService';
import { IChatEndpoint } from '../../../../platform/networking/common/networking';
import { IParserService, treeSitterOffsetRangeToVSCodeRange as toRange, vscodeToTreeSitterOffsetRange as toTSOffsetRange } from '../../../../platform/parser/node/parserService';
import { IWorkspaceService } from '../../../../platform/workspace/common/workspaceService';
import { CancellationToken } from '../../../../util/vs/base/common/cancellation';
import * as path from '../../../../util/vs/base/common/path';
import { assertType } from '../../../../util/vs/base/common/types';
import { URI } from '../../../../util/vs/base/common/uri';
import { StringEdit } from '../../../../util/vs/editor/common/core/edits/stringEdit';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { ChatResponseMovePart, Range, Uri } from '../../../../vscodeTypes';
import { IBuildPromptContext } from '../../../prompt/common/intents';
import { IDocumentContext } from '../../../prompt/node/documentContext';
import { EarlyStopping, IIntentInvocation, IResponseProcessorContext, LeadingMarkdownStreaming } from '../../../prompt/node/intents';
import { PseudoStopStartResponseProcessor } from '../../../prompt/node/pseudoStartStopConversationCallback';
import { InsertionStreamingEdits, TextPieceClassifiers } from '../../../prompt/node/streamingEdits';
import { TestExample, TestExampleFile } from '../../../prompt/node/testExample';
import { isTestFile, suggestUntitledTestFileLocation, TestFileFinder } from '../../../prompt/node/testFiles';
import { CopilotIdentityRules } from '../../../prompts/node/base/copilotIdentity';
import { InstructionMessage } from '../../../prompts/node/base/instructionMessage';
import { PromptRenderer } from '../../../prompts/node/base/promptRenderer';
import { SafetyRules } from '../../../prompts/node/base/safetyRules';
import { Tag } from '../../../prompts/node/base/tag';
import { createPromptingSummarizedDocument, InlineReplyInterpreter } from '../../../prompts/node/inline/promptingSummarizedDocument';
import { ISummarizedDocumentSettings, ProjectedDocument, RemovableNode } from '../../../prompts/node/inline/summarizedDocument/summarizeDocument';
import { summarizeDocument } from '../../../prompts/node/inline/summarizedDocument/summarizeDocumentHelpers';
import { replaceStringInStream, StreamPipe } from '../../../prompts/node/inline/utils/streaming';
import { ChatToolReferences, ChatVariables } from '../../../prompts/node/panel/chatVariables';
import { HistoryWithInstructions } from '../../../prompts/node/panel/conversationHistory';
import { CustomInstructions } from '../../../prompts/node/panel/customInstructions';
import { CodeBlock } from '../../../prompts/node/panel/safeElements';
import { TestDeps } from './testDeps';
import { TestsIntent } from './testIntent';
import { formatRequestAndUserQuery, relativeToWorkspace } from './testPromptUtil';


type TestFileToWriteTo = {
	kind: 'existing' | 'new';
	uri: Uri;
};

/**
 * Invoke from within a non-test file
 */
export class TestFromSourceInvocation implements IIntentInvocation {

	private _testFileToWriteTo: TestFileToWriteTo | undefined;
	private _additionalResponseParts: vscode.ExtendedChatResponsePart[] | undefined;
	private _testFileFinder: TestFileFinder;

	constructor(
		readonly intent: TestsIntent,
		readonly endpoint: IChatEndpoint,
		readonly location: ChatLocation,
		private readonly documentContext: IDocumentContext,
		private readonly alreadyConsumedChatVariable: vscode.ChatPromptReference | undefined,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IWorkspaceService private readonly workspaceService: IWorkspaceService,
		@IIgnoreService private readonly ignoreService: IIgnoreService,
		@IParserService private readonly _parserService: IParserService,
	) {
		this._testFileFinder = this.instantiationService.createInstance(TestFileFinder);
	}

	async buildPrompt(
		promptContext: IBuildPromptContext,
		progress: vscode.Progress<vscode.ChatResponseProgressPart | vscode.ChatResponseReferencePart>,
		token: vscode.CancellationToken
	) {
		assert(!isTestFile(this.documentContext.document), 'TestFromSourceInvocation should not be invoked from a test file');

		// identify in which file generated tests will be placed at

		const testExampleFile = await this.findTestFileForSourceFile(token);

		if (testExampleFile !== null && testExampleFile.kind === 'candidateTestFile') {
			this._testFileToWriteTo = {
				kind: 'existing',
				uri: testExampleFile.testExampleFile,
			};
		} else {
			const testFileUri = suggestUntitledTestFileLocation(this.documentContext.document);
			this._testFileToWriteTo = {
				kind: 'new',
				uri: testFileUri,
			};
		}

		let range: Range;
		if (this._testFileToWriteTo.kind === 'new') {
			range = new Range(0, 0, 0, 0);
		} else {

			const testFileUri = this._testFileToWriteTo.uri;

			const testFile = await this.workspaceService.openTextDocument(testFileUri);

			const testFileAST = this._parserService.getTreeSitterAST(testFile);

			const lastTest = testFileAST ? await testFileAST.findLastTest() : null;

			if (lastTest === null) {
				range = new Range(testFile.lineCount, 0, testFile.lineCount, 0);
			} else {
				const lastLineOfTest = testFile.positionAt(lastTest.endIndex);
				const lineAfterLastLine = lastLineOfTest.line + 1;
				range = new Range(lastLineOfTest.line, lastLineOfTest.character, lineAfterLastLine, 0);
			}
		}

		progress.report(new ChatResponseMovePart(this._testFileToWriteTo.uri, range) as any); // FIXME@ulugbekna

		if (this.location === ChatLocation.Panel && !promptContext.query) {
			promptContext = { ...promptContext, query: 'Write a set of detailed unit test functions for the code above.', };
		}

		const renderer = PromptRenderer.create(this.instantiationService, this.endpoint, Prompt, {
			context: this.documentContext,
			endpoint: this.endpoint,
			location: this.location,
			testExampleFile,
			testFileToWriteTo: this._testFileToWriteTo,
			promptContext,
			alreadyConsumedChatVariable: this.alreadyConsumedChatVariable,
		});

		const result = await renderer.render(progress as any, token); // FIXME@ulugbekna

		return result;
	}

	async processResponse(context: IResponseProcessorContext, inputStream: AsyncIterable<IResponsePart>, outputStream: vscode.ChatResponseStream, token: CancellationToken): Promise<void> {

		if (this.location === ChatLocation.Panel) {
			const responseProcessor = this.instantiationService.createInstance(PseudoStopStartResponseProcessor, [], undefined);
			await responseProcessor.processResponse(context, inputStream, outputStream, token);
			return;
		}

		const doc = this.documentContext.document;

		const additionalParts = this._additionalResponseParts;
		this._additionalResponseParts = undefined;

		const testFileKind = this._testFileToWriteTo?.kind;
		const testFileUri = this._testFileToWriteTo?.uri;
		this._testFileToWriteTo = undefined;

		if (testFileKind === undefined || testFileUri === undefined) {

			assertType(additionalParts, 'Expected to have a textual response without a test file');

		} else if (testFileKind === 'new') {

			const range = new Range(0, 0, 0, 0);

			const projectedDoc = new ProjectedDocument('', StringEdit.empty, doc.languageId);

			const replyInterpreter = new InlineReplyInterpreter(
				testFileUri,
				projectedDoc,
				this.documentContext.fileIndentInfo,
				LeadingMarkdownStreaming.Emit,
				EarlyStopping.StopAfterFirstCodeBlock,
				(lineFilter, streamingWorkingCopyDocument) => new InsertionStreamingEdits(
					streamingWorkingCopyDocument,
					range.start,
					lineFilter
				),
				TextPieceClassifiers.createCodeBlockClassifier(),
				_ => true,
			);

			await replyInterpreter.processResponse(context, inputStream, outputStream, token);

		} else {

			const testFile = await this.workspaceService.openTextDocumentAndSnapshot(testFileUri);

			const testFileAST = this._parserService.getTreeSitterAST(testFile);

			const lastTest = testFileAST ? await testFileAST.findLastTest() : null;

			let range: Range;
			if (lastTest === null) {
				range = new Range(testFile.lineCount, 0, testFile.lineCount, 0);
			} else {
				const lastLineOfTest = testFile.positionAt(lastTest.endIndex);
				const lineAfterLastLine = lastLineOfTest.line + 1;
				range = new Range(lastLineOfTest.line, lastLineOfTest.character, lineAfterLastLine, 0);
			}

			const summarizedDocument = await createPromptingSummarizedDocument(
				this._parserService,
				testFile,
				this.documentContext.fileIndentInfo,
				range,
				testFile.getText().length // @ulugbekna: we shouldn't be restricted on the token size because we're not sending it in the prompt
			);

			const splitDoc = summarizedDocument.splitAroundOriginalSelectionEnd();

			// FIXME@ulugbekna: we shouldn't need this
			// const { codeAbove, hasContent, codeBelow } = splitDoc;
			const placeHolder = '$PLACEHOLDER$';
			// const code = `${codeAbove}${placeHolder}${codeBelow}`;

			const replyInterpreter = splitDoc.createReplyInterpreter(
				StreamPipe.chain(
					markdownStream => replaceStringInStream(markdownStream, '`' + placeHolder + '`', 'selection'),
					markdownStream => replaceStringInStream(markdownStream, placeHolder, 'selection'),
				),
				EarlyStopping.StopAfterFirstCodeBlock,
				splitDoc.insertStreaming,
				TextPieceClassifiers.createCodeBlockClassifier(),
				line => line.value.trim() !== placeHolder
			);

			await replyInterpreter.processResponse(context, inputStream, outputStream, token);
		}

		additionalParts?.forEach(p => outputStream.push(p));
	}


	/**
	 * Finds either a test file corresponding to the source file or any test file within the workspace.
	 * The found test file is used in the prompt.
	 *
	 * @remark respects copilot-ignored
	 */
	private async findTestFileForSourceFile(token: CancellationToken): Promise<TestExampleFile | null> {

		let kind: 'anyTestFile' | 'candidateTestFile';

		let testExampleFile = await this._testFileFinder.findTestFileForSourceFile(this.documentContext.document, token);

		if (token.isCancellationRequested) {
			return null;
		}

		if (testExampleFile !== undefined) {
			kind = 'candidateTestFile';
		} else {
			const anyTestFile = await this._testFileFinder.findAnyTestFileForSourceFile(this.documentContext.document, token);

			if (token.isCancellationRequested) {
				return null;
			}

			kind = 'anyTestFile';
			testExampleFile = anyTestFile;
		}

		if (testExampleFile === undefined || (await this.ignoreService.isCopilotIgnored(testExampleFile))) {
			return null;
		}

		return { kind, testExampleFile };
	}
}

type Props = PromptElementProps<{
	/**
	 * @remark Assumes the document has already been checked for copilot-ignore, ie, don't pass copilot-ignored files.
	 */
	context: IDocumentContext;
	endpoint: IChatEndpoint;
	location: ChatLocation;
	testExampleFile: TestExampleFile | null;
	testFileToWriteTo: TestFileToWriteTo;
	promptContext: IBuildPromptContext;
	alreadyConsumedChatVariable: vscode.ChatPromptReference | undefined;
}>;

class Prompt extends PromptElement<Props> {

	constructor(
		props: Props,
		@IParserService private readonly parserService: IParserService,
		@IWorkspaceService private readonly workspaceService: IWorkspaceService
	) {
		super(props);
	}

	override async render(state: void, sizing: PromptSizing) {

		const { history, query, chatVariables, } = this.props.promptContext;
		const { context, testExampleFile, testFileToWriteTo, location, alreadyConsumedChatVariable } = this.props;

		// get testable node

		const treeSitterAST = this.parserService.getTreeSitterAST(context.document);

		let userSelection: vscode.Range = context.selection;
		let testedSymbolIdentifier: string | undefined;
		let nodeKind: string | undefined;
		if (treeSitterAST !== undefined) {
			const node = await treeSitterAST.getNodeToDocument(toTSOffsetRange(context.selection, context.document));
			userSelection = toRange(context.document, node.nodeToDocument);
			testedSymbolIdentifier = node.nodeIdentifier;
			nodeKind = node.nodeToDocument.type;
		}

		const documentSummarizationSettings: ISummarizedDocumentSettings | undefined =
			(
				// special score function for TS/TSX classes and methods
				// we want to preserve constructor's and other methods' signatures
				['typescript', 'typescriptreact'].includes(context.document.languageId) &&
				nodeKind !== undefined && ['class_declaration', 'method_definition'].includes(nodeKind)
			)
				? {
					costFnOverride: (node: RemovableNode, currentScore: number) => {
						return !node ? currentScore : node.kind === 'constructor' || node.kind === 'method_definition' ? 0 : currentScore;
					}
				}
				: undefined
			;

		const summarization = await summarizeDocument(
			this.parserService,
			context.document,
			context.fileIndentInfo,
			userSelection,
			sizing.tokenBudget / 2, // leave half of token budget to response
			documentSummarizationSettings,
		);

		// get test frameworks info


		const languageId = context.language.languageId;

		const extraContext = await this.computeLangSpecificExtraGuidelines(context, testExampleFile);

		const requestAndUserQuery = formatRequestAndUserQuery({
			workspaceService: this.workspaceService,
			chatVariables,
			userQuery: query,
			testFileToWriteTo: testFileToWriteTo.uri,
			testedSymbolIdentifier,
			context,
		});

		const srcFilePath = relativeToWorkspace(this.workspaceService, context.document.uri.path) ?? path.basename(context.document.uri.path);

		const filteredChatVariables = alreadyConsumedChatVariable === undefined ? chatVariables : chatVariables.filter(v => v.reference !== alreadyConsumedChatVariable);

		return (
			<>
				<SystemMessage priority={1000}>
					You are an AI programming assistant.<br />
					<CopilotIdentityRules /><br />
					<SafetyRules />
				</SystemMessage>
				<HistoryWithInstructions history={history} passPriority historyPriority={700}>
					<InstructionMessage priority={1000}>
						{location === ChatLocation.Editor
							? <>
								The user has a {languageId} file opened in a code editor.<br />
								The user includes some code snippets from the file.<br />
								Answer with a single {languageId} code block.
							</>
							: location === ChatLocation.Panel
								? <>
									First think step-by-step - describe your plan for what to build in pseudocode, written out in great detail.<br />
									Then output the code in a single code block.<br />
									Minimize any other prose.<br />
									Use Markdown formatting in your answers.<br />
									Make sure to include the programming language name at the start of the Markdown code blocks.<br />
									Avoid wrapping the whole response in triple backticks.<br />
									The user works in an IDE called Visual Studio Code which has a concept for editors with open files, integrated unit test support, an output pane that shows the output of running the code as well as an integrated terminal.<br />
									The active document is the source code the user is looking at right now.<br />
									You can only give one reply for each conversation turn.
								</>
								: undefined // @ulugbekna: should be unreachable
						}
						{extraContext.length > 0 && <><br /> {extraContext}</>}
					</InstructionMessage>
				</HistoryWithInstructions>
				<UserMessage>
					<TestDeps languageId={languageId} priority={750} />
					<CustomInstructions chatVariables={filteredChatVariables} languageId={context.language.languageId} includeTestGenerationInstructions={true} priority={725} />

					<ChatToolReferences priority={750} promptContext={this.props.promptContext} flexGrow={1} />
					<ChatVariables priority={750} chatVariables={filteredChatVariables} />
					{
						testExampleFile !== null && <TestExample priority={750} {...testExampleFile} />
					}
					<Tag name='currentFile' priority={900}>
						Here is the current file at `{srcFilePath}`:<br />
						<br />
						<CodeBlock uri={context.document.uri} languageId={context.document.languageId} code={summarization.text} /><br />
						<br />
						{requestAndUserQuery}
					</Tag>
				</UserMessage>
			</>
		);
	}

	private async computeLangSpecificExtraGuidelines(context: IDocumentContext, testExampleFile: TestExampleFile | null): Promise<string> {
		const extraContext = [];

		if (context.document.languageId === 'python') {
			const usingExistingTestFile = testExampleFile !== null && testExampleFile.kind === 'candidateTestFile';

			if (!usingExistingTestFile) {

				extraContext.push('Make sure your answer imports the function to test as this is a total new file.');

				// this will be true if there is not a candidate test file so goal is creating a new test file which will require imports
				const parent: string = path.dirname(context.document.uri.fsPath);
				const init_search: string = path.join(parent, '__init__.py');
				const workspaceRootPath: URI | undefined = this.workspaceService.getWorkspaceFolder(context.document.uri);
				try {
					await this.workspaceService.openTextDocument(Uri.file(init_search));
					if (workspaceRootPath !== undefined && path.resolve(parent) === path.resolve(workspaceRootPath?.fsPath ?? '')) {
						/* current file is at the root of the workspace */
						extraContext.push('The file is in the root of the workspace, which has an __init__.py but use an absolute import to import the function to test.');
					} else {
						extraContext.push('The parent directory of the given file has an __init__.py file making it a regular package. Use a relative import to import the function to test.');
					}
				} catch (error) {
					extraContext.push('The parent directory of the given file has no __init__.py file making it a namespace package. Use an absolute import to import the function to test.');
				}
			}
		}
		return extraContext.join('\n');
	}
}
