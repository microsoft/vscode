/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as l10n from '@vscode/l10n';
import { PromptElement, PromptReference, PromptSizing, SystemMessage, TextChunk, UserMessage } from '@vscode/prompt-tsx';
import type { CancellationToken, ChatResponseStream, ChatVulnerability, MarkdownString } from 'vscode';
import { IResponsePart } from '../../../../platform/chat/common/chatMLFetcher';
import { ConfigKey, IConfigurationService } from '../../../../platform/configuration/common/configurationService';
import { IFileSystemService } from '../../../../platform/filesystem/common/fileSystemService';
import { IIgnoreService } from '../../../../platform/ignore/common/ignoreService';
import { ILanguageDiagnosticsService } from '../../../../platform/languages/common/languageDiagnosticsService';
import { KnownSources } from '../../../../platform/languageServer/common/languageContextService';
import { ILogService } from '../../../../platform/log/common/logService';
import { IParserService } from '../../../../platform/parser/node/parserService';
import { IPromptPathRepresentationService } from '../../../../platform/prompts/common/promptPathRepresentationService';
import { isNotebookCellOrNotebookChatInput } from '../../../../util/common/notebooks';
import { illegalArgument } from '../../../../util/vs/base/common/errors';
import { isEqual } from '../../../../util/vs/base/common/resources';
import { URI } from '../../../../util/vs/base/common/uri';
import { StringEdit } from '../../../../util/vs/editor/common/core/edits/stringEdit';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { Range, TextEdit, Uri } from '../../../../vscodeTypes';
import { CodeBlockInfo, CodeBlockProcessor, isCodeBlockWithResource } from '../../../codeBlocks/node/codeBlockProcessor';
import { findDiagnosticForSelectionAndPrompt } from '../../../context/node/resolvers/fixSelection';
import { InlineFixProps } from '../../../context/node/resolvers/inlineFixIntentInvocation';
import { getStructure } from '../../../context/node/resolvers/selectionContextHelpers';
import { OutcomeAnnotation, OutcomeAnnotationLabel } from '../../../inlineChat/node/promptCraftingTypes';
import { IResponseProcessorContext, ReplyInterpreter, ReplyInterpreterMetaData } from '../../../prompt/node/intents';
import { CompositeElement } from '../base/common';
import { InstructionMessage } from '../base/instructionMessage';
import { LegacySafetyRules } from '../base/safetyRules';
import { Tag } from '../base/tag';
import { ICodeMapperService, IMapCodeRequest, IMapCodeResult } from '../codeMapper/codeMapperService';
import { getCustomMarker, getPatchEditReplyProcessor, PatchEditExamplePatch, PatchEditInputCodeBlock, PatchEditInputCodeBlockProps, PatchEditReplyProcessor, PatchEditRules } from '../codeMapper/patchEditGeneration';
import { ChatToolReferences, renderChatVariables, UserQuery } from '../panel/chatVariables';
import { CodeBlockFormattingRules } from '../panel/codeBlockFormattingRules';
import { HistoryWithInstructions } from '../panel/conversationHistory';
import { CustomInstructions } from '../panel/customInstructions';
import { CodeBlock } from '../panel/safeElements';
import { Diagnostics } from './diagnosticsContext';
import { InlineChatWorkspaceSearch } from './inlineChatWorkspaceSearch';
import { LanguageServerContextPrompt } from './languageServerContextPrompt';
import { ProjectedDocument } from './summarizedDocument/summarizeDocument';
import { summarizeDocumentSync } from './summarizedDocument/summarizeDocumentHelpers';

export class InlineFix3Prompt extends PromptElement<InlineFixProps> {

	constructor(props: InlineFixProps,
		@IIgnoreService private readonly ignoreService: IIgnoreService,
		@IFileSystemService private readonly fileSystemService: IFileSystemService,
		@IParserService private readonly parserService: IParserService,
		@ILanguageDiagnosticsService private readonly languageDiagnosticsService: ILanguageDiagnosticsService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super(props);
	}

	async render(state: void, sizing: PromptSizing) {
		const { document, wholeRange, fileIndentInfo, selection, language } = this.props.documentContext;
		const isIgnored = await this.ignoreService.isCopilotIgnored(document.uri);
		if (isIgnored) {
			return <ignoredFiles value={[document.uri]} />;
		}
		if (isNotebookCellOrNotebookChatInput(document.uri)) {
			throw illegalArgument('InlineFix3PlusPrompt should not be used with a notebook!');
		}

		const inputDocCharLimit = (sizing.endpoint.modelMaxPromptTokens / 3) * 4; // consume one 3rd of the model window, estimating roughly 4 chars per token;
		let projectedDocument: ProjectedDocument;
		let isSummarized = false;
		if (document.getText().length > inputDocCharLimit) {
			// only compute the summarized document if needed
			const structure = await getStructure(this.parserService, document, fileIndentInfo);
			projectedDocument = summarizeDocumentSync(inputDocCharLimit, document, wholeRange, structure, { tryPreserveTypeChecking: true });
			isSummarized = true;
		} else {
			projectedDocument = new ProjectedDocument(document.getText(), StringEdit.empty, document.languageId);
		}

		const { query, history, chatVariables, } = this.props.promptContext;
		const { useWorkspaceChunksFromDiagnostics, useWorkspaceChunksFromSelection } = this.props.features;

		const adjustedSelection = projectedDocument.projectRange(selection);
		const selectedLinesContent = document.getText(new Range(selection.start.line, 0, selection.end.line + 1, 0)).trimEnd();

		const diagnostics = findDiagnosticForSelectionAndPrompt(this.languageDiagnosticsService, document.uri, selection, query);

		const enableCodeMapper = this.configurationService.getConfig(ConfigKey.TeamInternal.InlineChatUseCodeMapper);

		const replyInterpreter = enableCodeMapper ?
			this.instantiationService.createInstance(CodeMapperFixReplyInterpreter, document.uri) :
			this.instantiationService.createInstance(PatchEditFixReplyInterpreter, projectedDocument, document.uri, adjustedSelection);

		const GenerationRulesAndExample = enableCodeMapper ? CodeMapperRulesAndExample : PatchEditFixRulesAndExample;
		const InputCodeBlock = enableCodeMapper ? CodeMapperInputCodeBlock : PatchEditInputCodeBlock;

		const renderedChatVariables = await renderChatVariables(chatVariables, this.fileSystemService);

		return (
			<>
				<references value={[new PromptReference(document.uri)]} />
				<meta value={new ReplyInterpreterMetaData(replyInterpreter)} />
				<SystemMessage priority={1000}>
					You are an AI programming assistant.<br />
					When asked for your name, you must respond with "GitHub Copilot".<br />
					The user has a {language.languageId} file opened in a code editor.<br />
					The user expects you to propose a fix for one or more problems in that file.<br />
					<LegacySafetyRules />
				</SystemMessage>
				<HistoryWithInstructions inline={true} historyPriority={700} passPriority history={history}>
					<InstructionMessage priority={1000}>
						For the response always follow these instructions:<br />
						Describe in a single sentence how you would solve the problem. After that sentence, add an empty line. Then provide code changes or a terminal command to run.<br />
						<GenerationRulesAndExample />
					</InstructionMessage>
				</HistoryWithInstructions>

				<UserMessage priority={700}>
					<CustomInstructions /*priority={700}*/ languageId={language.languageId} chatVariables={chatVariables} />
					<LanguageServerContextPrompt priority={700} document={document} position={selection.start} requestId={this.props.promptContext.requestId} source={KnownSources.fix} />
					<CompositeElement priority={750} >{...renderedChatVariables}</CompositeElement>
					<CompositeElement priority={600} >
						{
							projectedDocument.text.length > 0 ?
								<>
									I have the following code open in the editor, starting from line 1 to line {projectedDocument.lineCount}.<br />
								</> :
								<>
									I am in an empty file:<br />
								</>
						}
						<InputCodeBlock uri={document.uri} languageId={language.languageId} code={projectedDocument.text} shouldTrim={false} isSummarized={isSummarized} /><br />
					</CompositeElement >
					<CompositeElement /*priority={500}*/>
						{
							selection.isEmpty ?
								<>
									I have the selection at line {adjustedSelection.start.line + 1}, column {adjustedSelection.start.character + 1}<br />
								</> :
								<>
									I have currently selected from line {adjustedSelection.start.line + 1}, column {adjustedSelection.start.character + 1} to line {adjustedSelection.end.line + 1} column {adjustedSelection.end.character + 1}.<br />
								</>
						}
					</CompositeElement >
					<CompositeElement /*priority={500}*/>
						{
							selectedLinesContent.length && !diagnostics.some(d => d.range.contains(selection)) &&
							<>
								The content of the lines at the selection is
								<CodeBlock uri={document.uri} languageId={language.languageId} code={selectedLinesContent} shouldTrim={false} /><br />
							</>
						}
					</CompositeElement >
					<Diagnostics /*priority={500}*/ documentContext={this.props.documentContext} diagnostics={diagnostics} />
					<InlineChatWorkspaceSearch /*priority={200}*/ diagnostics={diagnostics} documentContext={this.props.documentContext} useWorkspaceChunksFromDiagnostics={useWorkspaceChunksFromDiagnostics} useWorkspaceChunksFromSelection={useWorkspaceChunksFromSelection} />
					<ChatToolReferences promptContext={this.props.promptContext} />

					<Tag name='userPrompt'>
						<TextChunk /*priority={700}*/>
							Please find a fix for my code so that the result is without any errors.
						</TextChunk>
						<UserQuery chatVariables={chatVariables} query={query} /><br />
					</Tag>
				</UserMessage>
			</>
		);
	}
}

const exampleUri = Uri.file('/someFolder/myFile.cs');

class PatchEditFixRulesAndExample extends PromptElement {

	render() {
		return (
			<>
				When proposing to fix the problem by running a terminal command, write `{getCustomMarker('TERMINAL')}` and provide a code block that starts with ```bash and contains the terminal script inside.<br />
				<PatchEditRules />
				<Tag name='example' priority={100}>
					<Tag name='user'>
						I have the following code open in the editor.<br />
						<PatchEditInputCodeBlock
							uri={exampleUri}
							languageId='csharp'
							code={['// This is my class', 'class C { }', '', 'new C().Field = 9;']}
						/>
					</Tag>
					<Tag name='assistant'>
						The problem is that the class 'C' does not have a field or property named 'Field'. To fix this, you need to add a 'Field' property to the 'C' class.<br />
						<br />
						<PatchEditExamplePatch
							changes={
								[
									{
										uri: exampleUri,
										find: ['// This is my class', 'class C { }'],
										replace: ['// This is my class', 'class C {', 'public int Field { get; set; }', '}']
									},
									{
										uri: exampleUri,
										find: ['new C().Field = 9;'],
										replace: ['// set the field to 9', 'new C().Field = 9;']
									}
								]
							}
						/>
					</Tag>
				</Tag>
			</>
		);
	}
}

export class PatchEditFixReplyInterpreter implements ReplyInterpreter {
	private _lastText: string = '';
	private readonly _replyProcessor: PatchEditReplyProcessor;

	constructor(
		private readonly projectedDocument: ProjectedDocument,
		private readonly documentUri: URI,
		private readonly adjustedSelection: Range,
		@ILogService private readonly logService: ILogService,
		@IPromptPathRepresentationService private readonly promptPathRepresentationService: IPromptPathRepresentationService

	) {
		this._replyProcessor = getPatchEditReplyProcessor(promptPathRepresentationService);
	}

	async processResponse(context: IResponseProcessorContext, inputStream: AsyncIterable<IResponsePart>, outputStream: ChatResponseStream, token: CancellationToken): Promise<void> {
		let inFirstParagraph = true; // print only the frist paragraph
		let charactersSent = 0;
		let newText = '';
		for await (const part of inputStream) {
			if (token.isCancellationRequested) {
				return;
			}
			newText += part.delta.text;
			if (newText.length > this._lastText.length) {
				this._lastText = newText; // the new complete text
				if (inFirstParagraph) {
					// test if the new text added made the first paragraph complete
					const paragraph = this._replyProcessor.getFirstParagraph(newText);
					if (paragraph.length > charactersSent) {
						// still in the first paragraph
						outputStream.markdown(paragraph.substring(charactersSent));
						charactersSent = paragraph.length;
					} else {
						// the first paragraph is complete
						inFirstParagraph = false;
						outputStream.markdown('\n\n');
						outputStream.progress(l10n.t('Generating edits...'));
					}
				}
			}
		}
		if (this._lastText.length === 0) {
			outputStream.warning(l10n.t('Copilot did not provide a response. Please try again.'));
			return;
		}

		const res = this._replyProcessor.process(this._lastText, this.projectedDocument.text, this.documentUri, this.adjustedSelection.start.line);
		if (res.otherSections.length) {
			for (const section of res.otherSections) {
				outputStream.markdown(section.content.join('\n\n'));
			}
		}
		if (res.otherPatches.length) {
			for (const patch of res.otherPatches) {
				if (patch.replace.length) {
					const uri = this.promptPathRepresentationService.resolveFilePath(patch.filePath, this.documentUri.scheme);
					if (uri) {
						outputStream.markdown(patch.replace[0]);
						outputStream.codeblockUri(uri);
						outputStream.markdown(patch.replace.slice(1).join('\n'));
					} else {
						outputStream.markdown(patch.replace.join('\n'));
					}
				}
			}
		}
		let edits = res.edits;
		if (edits.length) {
			edits = this.projectedDocument.projectBackTextEdit(edits);
			if (res.edits.length !== edits.length) {
				res.annotations.push({ message: 'Some edits were not applied because they were out of bounds.', label: OutcomeAnnotationLabel.SUMMARIZE_CONFLICT, severity: 'error' });
			} else {
				const annot = this._validateTextEditProject(res.edits, edits, this.projectedDocument);
				if (annot) {
					res.annotations.push(annot);
				}
			}
		}
		context.addAnnotations(res.annotations);
		if (edits.length) {
			outputStream.textEdit(this.documentUri, edits);
		} else if (!res.otherPatches.length && !res.otherSections.length) {
			outputStream.warning(l10n.t('The edit generation was not successful. Please try again.'));
		}
		if (res.annotations.length) {
			this.logService.info(`[inline fix] Problems generating edits: ${res.annotations.map(a => `${a.message} [${a.label}]`).join(', ')}, invalid patches: ${res.invalidPatches.length}`);
		}
	}

	private _validateTextEditProject(edits: TextEdit[], projectedBackEdits: TextEdit[], projectedDocument: ProjectedDocument): OutcomeAnnotation | undefined {
		for (let i = 0; i < edits.length; i++) {
			const projEditString = projectedDocument.positionOffsetTransformer.toOffsetRange(edits[i].range).substring(projectedDocument.text);
			const origEditString = projectedDocument.originalPositionOffsetTransformer.toOffsetRange(projectedBackEdits[i].range).substring(projectedDocument.originalText);
			if (projEditString !== origEditString) {
				return { message: `Problem projecting edits: '${projEditString}' does not match '${origEditString}' (projectecBack)`, label: OutcomeAnnotationLabel.INVALID_PROJECTION, severity: 'error' };
			}
		}
		return undefined;
	}
}

class CodeMapperInputCodeBlock extends PromptElement<PatchEditInputCodeBlockProps> {
	render() {
		return (
			<CodeBlock
				uri={this.props.uri}
				languageId={this.props.languageId}
				code={Array.isArray(this.props.code) ? this.props.code.join('\n') : this.props.code}
				shouldTrim={this.props.shouldTrim}
				includeFilepath={true}
			/>
		);
	}
}

class CodeMapperRulesAndExample extends PromptElement {
	render() {
		return (
			<>
				When proposing to fix the problem by running a terminal command, provide a code block that starts with ```bash and contains the terminal script inside.<br />
				<CodeBlockFormattingRules />
				<Tag name='example' priority={100}>
					<Tag name='user'>
						I have the following code open in the editor.<br />
						<CodeMapperInputCodeBlock
							uri={exampleUri}
							languageId='csharp'
							code={['// This is my class', 'class C { }', '', 'new C().Field = 9;'].join('\n')}
							shouldTrim={false}
						/>
					</Tag>
					<Tag name='assistant'>
						The problem is that the class 'C' does not have a field or property named 'Field'. To fix this, you need to add a 'Field' property to the 'C' class.<br />
						<br />
						<CodeMapperInputCodeBlock
							uri={exampleUri}
							languageId='csharp'
							code={['// This is my class', 'class C {', '  public int Field { get; set; }', '}', ''].join('\n')}
							shouldTrim={false}
						/>
					</Tag>
				</Tag>
			</>
		);
	}
}

class CodeMapperFixReplyInterpreter implements ReplyInterpreter {

	constructor(
		private readonly documentUri: URI,
		@IPromptPathRepresentationService private readonly promptPathRepresentationService: IPromptPathRepresentationService,
		@ICodeMapperService private readonly codeMapperService: ICodeMapperService,
	) {
	}

	async processResponse(context: IResponseProcessorContext, inputStream: AsyncIterable<IResponsePart>, outputStream: ChatResponseStream, token: CancellationToken): Promise<void> {
		let currentCodeBlock: CodeBlockInfo | undefined = undefined;
		let applyCodeBlock = false;
		let inFirstSentence = true;
		const codeMapperWork: Promise<IMapCodeResult | undefined>[] = [];
		const codeblockProcessor = new CodeBlockProcessor(
			path => {
				return this.promptPathRepresentationService.resolveFilePath(path);
			},
			(markdown: MarkdownString, codeBlockInfo: CodeBlockInfo | undefined, vulnerabilities: ChatVulnerability[] | undefined) => {
				if (codeBlockInfo) {
					inFirstSentence = false;
					if (codeBlockInfo !== currentCodeBlock) {
						// first time we see this code block
						currentCodeBlock = codeBlockInfo;
						applyCodeBlock = isEqual(codeBlockInfo.resource, this.documentUri);
						if (!applyCodeBlock && codeBlockInfo.resource) {
							outputStream.codeblockUri(codeBlockInfo.resource);
						}
					}
					if (applyCodeBlock) {
						return;
					}
				} else {
					if (!inFirstSentence) {
						return;
					}
				}
				if (vulnerabilities) {
					outputStream.markdownWithVulnerabilities(markdown, vulnerabilities);
				} else {
					outputStream.markdown(markdown);
				}
			},
			codeBlock => {
				if (isCodeBlockWithResource(codeBlock) && isEqual(codeBlock.resource, this.documentUri)) {
					const request: IMapCodeRequest = { codeBlock };
					outputStream.markdown('\n\n');
					outputStream.progress(l10n.t('Generating edits...'));
					const task = this.codeMapperService.mapCode(request, outputStream, { chatRequestId: context.turn.id, chatRequestSource: 'inline1Fix3', isAgent: false }, token).finally(() => {
						if (!token.isCancellationRequested) {
							// signal being done with this uri
							outputStream.textEdit(codeBlock.resource, true);
						}
					});
					codeMapperWork.push(task);
				}
			}

		);

		for await (const { delta } of inputStream) {
			if (token.isCancellationRequested) {
				return;
			}
			codeblockProcessor.processMarkdown(delta.text, delta.codeVulnAnnotations?.map(a => ({ title: a.details.type, description: a.details.description })));
		}
		codeblockProcessor.flush();

		const results = await Promise.all(codeMapperWork);
		for (const result of results) {
			if (!result) {
				context.addAnnotations([{ severity: 'error', label: 'cancelled', message: 'CodeMapper cancelled' }]);
			} else if (result.annotations) {
				context.addAnnotations(result.annotations);
			}
		}
		for (const result of results) {
			if (result && result.errorDetails) {
				outputStream.warning(`CodeMapper error: ${result.errorDetails}`);
			}
		}
	}
}
