/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import { BasePromptElementProps, PromptElement, PromptElementProps, PromptSizing } from '@vscode/prompt-tsx';
import type * as vscode from 'vscode';
import { TextDocumentSnapshot } from '../../../platform/editing/common/textDocumentSnapshot';
import { IIgnoreService } from '../../../platform/ignore/common/ignoreService';
import { IPromptPathRepresentationService } from '../../../platform/prompts/common/promptPathRepresentationService';
import { IWorkspaceService } from '../../../platform/workspace/common/workspaceService';
import { isLocation } from '../../../util/common/types';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { Disposable } from '../../../util/vs/base/common/lifecycle';

import { URI } from '../../../util/vs/base/common/uri';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { ExtendedLanguageModelToolResult, LanguageModelPromptTsxPart, MarkdownString } from '../../../vscodeTypes';
import { IBuildPromptContext } from '../../prompt/common/intents';
import { isTestFile, TestFileFinder } from '../../prompt/node/testFiles';
import { renderPromptElementJSON } from '../../prompts/node/base/promptRenderer';
import { Tag } from '../../prompts/node/base/tag';

import { IParserService } from '../../../platform/parser/node/parserService';
import { TestDeps } from '../../intents/node/testIntent/testDeps';
import { ProjectedDocument } from '../../prompts/node/inline/summarizedDocument/summarizeDocument';
import { summarizeDocuments, SummarizeDocumentsItem } from '../../prompts/node/inline/summarizedDocument/summarizeDocumentHelpers';
import { CodeBlock } from '../../prompts/node/panel/safeElements';
import { ToolName } from '../common/toolNames';
import { ICopilotTool, ToolRegistry } from '../common/toolsRegistry';
import { formatUriForFileWidget } from '../common/toolUtils';
import { checkCancellation, resolveToolInputPath } from './toolUtils';


interface IFindTestFilesToolsParams {
	readonly filePaths: string[];
	// sparse array of ranges, as numbers because it goes through JSON
	readonly ranges?: ([a: number, b: number, c: number, d: number] | undefined)[];
}

class FindTestFilesTool extends Disposable implements ICopilotTool<IFindTestFilesToolsParams> {
	public static readonly toolName = ToolName.FindTestFiles;
	private readonly _testFileFinder: TestFileFinder;

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IWorkspaceService private readonly workspaceService: IWorkspaceService,
		@IPromptPathRepresentationService private readonly promptPathRepresentationService: IPromptPathRepresentationService,
		@IIgnoreService private readonly ignoreService: IIgnoreService,
	) {
		super();
		this._testFileFinder = this.instantiationService.createInstance(TestFileFinder);
	}

	async invoke(options: vscode.LanguageModelToolInvocationOptions<IFindTestFilesToolsParams>, token: CancellationToken): Promise<vscode.LanguageModelToolResult> {

		let languageId: string | undefined;
		const inputUris: URI[] = [];
		const testFiles: IRelatedExistingFile[] = [];
		const anyTestFiles: IRelatedExistingFile[] = [];
		const srcFiles: IRelatedExistingFile[] = [];

		let lookForAnyTestFile: TextDocumentSnapshot | undefined;

		await Promise.all(options.input.filePaths.map(async filePath => {
			const uri = this.promptPathRepresentationService.resolveFilePath(filePath);
			if (!uri) {
				throw new Error(`Invalid input path ${filePath}`);
			}
			if (await this.ignoreService.isCopilotIgnored(uri)) {
				return;
			}
			const document = await this.workspaceService.openTextDocumentAndSnapshot(uri);
			inputUris.push(document.uri);
			if (languageId === undefined) {
				languageId = document.languageId;
			}

			if (token.isCancellationRequested) {
				return;
			}

			if (isTestFile(document)) {
				const srcFileUri = await this._testFileFinder.findFileForTestFile(document, token);
				if (srcFileUri && !await this.ignoreService.isCopilotIgnored(srcFileUri)) {
					const srcFileDocument = await this.workspaceService.openTextDocumentAndSnapshot(srcFileUri);
					srcFiles.push({ srcFile: srcFileUri, testFile: document.uri, document: srcFileDocument });
				}
			} else {
				const testFileUri = await this._testFileFinder.findTestFileForSourceFile(document, token);
				if (testFileUri) {
					const testFileDocument = await this.workspaceService.openTextDocumentAndSnapshot(testFileUri);
					testFiles.push({ srcFile: document.uri, testFile: testFileUri, document: testFileDocument });
				}
			}
		}));

		checkCancellation(token);

		if (testFiles.length === 0 && lookForAnyTestFile) {
			const testFileUri = await this._testFileFinder.findAnyTestFileForSourceFile(lookForAnyTestFile, token);
			if (testFileUri && !await this.ignoreService.isCopilotIgnored(testFileUri)) {
				const testFileDocument = await this.workspaceService.openTextDocumentAndSnapshot(testFileUri);
				anyTestFiles.push({ srcFile: lookForAnyTestFile.uri, testFile: testFileUri, document: testFileDocument });
			}
		}


		const nTestFilesFound = testFiles.length + srcFiles.length + anyTestFiles.length;

		const props: IFindTestFilesToolOutputProps = {
			languageId: languageId!,
			testFiles,
			srcFiles,
			anyTestFiles

		};
		const result = new ExtendedLanguageModelToolResult([
			new LanguageModelPromptTsxPart(
				await renderPromptElementJSON(this.instantiationService, FindTestFilesToolOutput, props, options.tokenizationOptions, token)
			)
		]);

		result.toolResultMessage = nTestFilesFound === 0 ?
			new MarkdownString(l10n.t`Checked ${this.formatURIs(inputUris)} for test related files, none found`) :
			nTestFilesFound === 1 ?
				new MarkdownString(l10n.t`Checked ${this.formatURIs(inputUris)}, 1 file found`) :
				new MarkdownString(l10n.t`Checked ${this.formatURIs(inputUris)}, ${nTestFilesFound} files found`);
		return result;
	}

	prepareInvocation(options: vscode.LanguageModelToolInvocationPrepareOptions<IFindTestFilesToolsParams>, token: vscode.CancellationToken): vscode.ProviderResult<vscode.PreparedToolInvocation> {
		if (!options.input.filePaths?.length) {
			throw new Error('Invalid input');
		}

		const uris = options.input.filePaths.map(filePath => resolveToolInputPath(filePath, this.promptPathRepresentationService));
		if (uris.some(uri => uri === undefined)) {
			throw new Error('Invalid input');
		}

		return {
			invocationMessage: new MarkdownString(l10n.t`Checking ${this.formatURIs(uris)}`),
		};
	}

	private formatURIs(uris: URI[]): string {
		return uris.map(uri => formatUriForFileWidget(uri)).join(', ');
	}

	async provideInput(promptContext: IBuildPromptContext): Promise<IFindTestFilesToolsParams | undefined> {
		const seen = new Set<string>();

		const filePaths: string[] = [];
		const ranges: ([a: number, b: number, c: number, d: number] | undefined)[] = [];

		function addPath(path: string, range: vscode.Range | undefined) {
			if (!seen.has(path)) {
				seen.add(path);
				filePaths.push(path);
				ranges.push(range && [range.start.line, range.start.character, range.end.line, range.end.character]);
			}
		}

		for (const ref of promptContext.chatVariables) {
			if (URI.isUri(ref.value)) {
				addPath(this.promptPathRepresentationService.getFilePath(ref.value), undefined);
			} else if (isLocation(ref.value)) {
				addPath(this.promptPathRepresentationService.getFilePath(ref.value.uri), ref.value.range);
			}
		}

		if (promptContext.workingSet) {
			for (const file of promptContext.workingSet) {
				addPath(this.promptPathRepresentationService.getFilePath(file.document.uri), file.range);
			}
		}

		if (!filePaths.length) {
			// no context variables or working set
		}

		return {
			filePaths,
			ranges
		};
	}
}

interface IRelatedExistingFile {
	readonly srcFile: URI;
	readonly testFile: URI;
	readonly document: TextDocumentSnapshot;
}

ToolRegistry.registerTool(FindTestFilesTool);

interface IFindTestFilesToolOutputProps extends BasePromptElementProps {
	readonly languageId: string;
	readonly testFiles: IRelatedExistingFile[];
	readonly anyTestFiles: IRelatedExistingFile[];
	readonly srcFiles: IRelatedExistingFile[];
}

class FindTestFilesToolOutput extends PromptElement<IFindTestFilesToolOutputProps> {
	constructor(
		props: PromptElementProps<IFindTestFilesToolOutputProps>,
		@IParserService private readonly parserService: IParserService,
	) {
		super(props);
	}

	async render(_state: void, sizing: PromptSizing) {
		if (this.props.testFiles.length === 0 && this.props.srcFiles.length === 0 && this.props.anyTestFiles.length === 0) {
			return <>No test related files found.</>;
		}

		const tokenSizing = Math.min(sizing.tokenBudget, 32_000);

		const documentData: SummarizeDocumentsItem[] = [...this.props.testFiles, ...this.props.anyTestFiles, ...this.props.srcFiles].map(info => ({ document: info.document, formattingOptions: undefined, selection: undefined }));
		const docs = await summarizeDocuments(this.parserService, documentData, tokenSizing);

		let index = 0;
		return <>
			<TestDeps languageId={this.props.languageId} />

			The following files are useful when writing tests: <br />
			{
				this.props.testFiles.map(info => <RelatedTestDescription info={info} projectedDoc={docs[index++]} />)
			}
			{
				this.props.anyTestFiles.map(info => <ExampleTestDescription info={info} projectedDoc={docs[index++]} />)
			}
			{
				this.props.srcFiles.map(info => <RelatedSourceDescription info={info} projectedDoc={docs[index++]} />)
			}
		</ >;
	}
}

interface IRelatedSourceDescriptionProps extends BasePromptElementProps {
	readonly projectedDoc: ProjectedDocument;
	readonly info: IRelatedExistingFile;
}


class RelatedSourceDescription extends PromptElement<IRelatedSourceDescriptionProps> {
	constructor(
		props: PromptElementProps<IRelatedSourceDescriptionProps>,
		@IPromptPathRepresentationService private readonly promptPathRepresentationService: IPromptPathRepresentationService,
	) {
		super(props);
	}


	render(state: void, sizing: PromptSizing) {
		const document = this.props.info.document;
		return <Tag name='relatedSource'>
			The test file {this.promptPathRepresentationService.getFilePath(this.props.info.testFile)} contains tests for the following file:<br />
			<CodeBlock code={this.props.projectedDoc.text} uri={document.uri} languageId={document.languageId} includeFilepath={true} /><br />
		</Tag>;
	}
}


interface IRelatedTestDescriptionProps extends BasePromptElementProps {
	readonly projectedDoc: ProjectedDocument;
	readonly info: IRelatedExistingFile;
}


class RelatedTestDescription extends PromptElement<IRelatedTestDescriptionProps> {
	constructor(
		props: PromptElementProps<IRelatedTestDescriptionProps>,
		@IPromptPathRepresentationService private readonly promptPathRepresentationService: IPromptPathRepresentationService,
	) {
		super(props);
	}

	render(state: void, sizing: PromptSizing) {
		const document = this.props.info.document;
		return <Tag name='relatedTest'>
			Tests for {this.promptPathRepresentationService.getFilePath(this.props.info.srcFile)} can go into the following existing file:<br />
			<CodeBlock code={this.props.projectedDoc.text} uri={document.uri} languageId={document.languageId} includeFilepath={true} /><br />
		</Tag>;
	}
}

interface IExampleTestDescriptionProps extends BasePromptElementProps {
	readonly info: IRelatedExistingFile;
	readonly projectedDoc: ProjectedDocument;
}


class ExampleTestDescription extends PromptElement<IExampleTestDescriptionProps> {
	constructor(
		props: PromptElementProps<IExampleTestDescriptionProps>,
	) {
		super(props);
	}

	render(state: void, sizing: PromptSizing) {
		return <Tag name='sampleTest'>
			This is a sample test file:<br />
			<CodeBlock code={this.props.projectedDoc.text} uri={this.props.info.document.uri} languageId={this.props.info.document.languageId} includeFilepath={true} /><br />
		</Tag>;
	}
}

