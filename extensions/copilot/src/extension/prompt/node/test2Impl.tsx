/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PromptElement, PromptElementProps, PromptSizing } from '@vscode/prompt-tsx';
import assert from 'assert';
import type * as vscode from 'vscode';
import { IIgnoreService } from '../../../platform/ignore/common/ignoreService';
import { IWorkspaceService } from '../../../platform/workspace/common/workspaceService';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { URI } from '../../../util/vs/base/common/uri';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { ITestGenInfo } from '../../intents/node/testIntent/testInfoStorage';
import { Tag } from '../../prompts/node/base/tag';
import { DocumentSummarizer } from '../../prompts/node/inline/summarizedDocument/summarizeDocumentHelpers';
import { CodeBlock } from '../../prompts/node/panel/safeElements';
import { PromptReference } from '../common/conversation';
import { IDocumentContext } from './documentContext';
import { TestFileFinder, isTestFile } from './testFiles';

type Props = PromptElementProps<{
	/**
	 * Document here is expected to be a test file.
	 */
	documentContext: IDocumentContext;
	/**
	 * Src (ie impl) file to include if already known.
	 */
	srcFile?: ITestGenInfo;
}>;

/**
 * @remark Respects copilot-ignore.
 */
export class Test2Impl extends PromptElement<Props> {

	constructor(
		props: Props,
		@IInstantiationService private readonly instaService: IInstantiationService,
		@IIgnoreService private readonly ignoreService: IIgnoreService,
		@IWorkspaceService private readonly workspaceService: IWorkspaceService,
	) {
		super(props);
	}

	override async render(state: void, sizing: PromptSizing) {

		const { documentContext, srcFile, } = this.props;

		assert(isTestFile(documentContext.document), 'Test2Impl must be invoked on a test file.');

		let candidateFile: URI | undefined;
		let selection: vscode.Range | undefined;

		if (srcFile) {
			candidateFile = srcFile.uri;
			selection = srcFile.target;
		} else {
			// @ulugbekna: find file that this test file corresponds to
			const finder = this.instaService.createInstance(TestFileFinder);
			candidateFile = await finder.findFileForTestFile(documentContext.document, CancellationToken.None);
		}

		if (candidateFile === undefined || await this.ignoreService.isCopilotIgnored(candidateFile)) {
			return undefined;
		}

		const doc = await this.workspaceService.openTextDocumentAndSnapshot(candidateFile);

		const docSummarizer = this.instaService.createInstance(DocumentSummarizer);

		const summarizedDoc = await docSummarizer.summarizeDocument(
			doc,
			documentContext.fileIndentInfo,
			selection,
			sizing.tokenBudget,
		);

		const references = [new PromptReference(candidateFile)];

		return (
			<Tag name='codeToTest' priority={this.props.priority}>
				<references value={references} />
				Below is the file located at {candidateFile.path}:<br />
				<CodeBlock
					code={summarizedDoc.text}
					uri={candidateFile}
					languageId={documentContext.document.languageId}
				/>
			</Tag>
		);
	}

}
