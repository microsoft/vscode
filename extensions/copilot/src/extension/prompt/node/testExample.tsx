/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PromptElement, PromptElementProps, PromptReference, PromptSizing } from '@vscode/prompt-tsx';
import type { Progress } from 'vscode';
import { TextDocumentSnapshot } from '../../../platform/editing/common/textDocumentSnapshot';
import { IParserService } from '../../../platform/parser/node/parserService';
import { IWorkspaceService } from '../../../platform/workspace/common/workspaceService';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import * as path from '../../../util/vs/base/common/path';
import { URI } from '../../../util/vs/base/common/uri';
import { ChatResponseProgressPart, Range } from '../../../vscodeTypes';
import { Tag } from '../../prompts/node/base/tag';
import { summarizeDocument } from '../../prompts/node/inline/summarizedDocument/summarizeDocumentHelpers';
import { CodeBlock } from '../../prompts/node/panel/safeElements';

// Finds the file that is testing a given file. Uses the findFiles API and file name
// heuristics for this.

export type TestExampleFile = {
	kind: 'candidateTestFile' | 'anyTestFile';
	testExampleFile: URI;
};

type Props = PromptElementProps<TestExampleFile>;

/**
 * @remark Does NOT respected copilot-ignore. Parent element must make sure the URI is not copilot-ignored.
 */
export class TestExample extends PromptElement<Props> {

	constructor(
		props: Props,
		@IParserService private readonly parserService: IParserService,
		@IWorkspaceService private readonly workspaceService: IWorkspaceService
	) {
		super(props);
	}

	override async render(state: void, sizing: PromptSizing, progress?: Progress<ChatResponseProgressPart> | undefined, token?: CancellationToken | undefined) {

		const { kind, testExampleFile } = this.props;

		let testDocument: TextDocumentSnapshot;
		try {
			testDocument = await this.workspaceService.openTextDocumentAndSnapshot(testExampleFile);
		} catch (e) {
			return undefined;
		}

		const codeExcerpt = await summarizeDocument(
			this.parserService,
			testDocument,
			undefined,
			new Range(0, 0, 0, 0),
			sizing.tokenBudget
		);

		const references = [new PromptReference(testExampleFile)];

		const workspaceOfTestFile = this.workspaceService.getWorkspaceFolders().find(folder => testExampleFile.path.startsWith(folder.path));
		let pathToTestFile: string = testExampleFile.path;
		if (workspaceOfTestFile !== undefined) {
			pathToTestFile = path.relative(workspaceOfTestFile.path, testExampleFile.path);
			// Convert the path separator to be platform-independent
			pathToTestFile = pathToTestFile.split(path.sep).join('/');
		}

		switch (kind) {
			case 'candidateTestFile': {
				return (
					<Tag name='testExample' priority={this.props.priority}>
						<references value={references} />
						Excerpt of the existing test file at `{pathToTestFile}`:<br />
						<CodeBlock uri={testExampleFile} code={codeExcerpt.text} languageId={codeExcerpt.languageId} /><br />
						Because a test file exists: <br />
						- Do not generate preambles, like imports, copyright headers etc.<br />
						- Do generate code that can be appended to the existing test file.
					</Tag>
				);
			}
			case 'anyTestFile': {
				return (
					<Tag name='testExample' priority={this.props.priority}>
						This is a sample test file:<br />
						<CodeBlock uri={testExampleFile} code={codeExcerpt.text} languageId={codeExcerpt.languageId} />
					</Tag>
				);
			}
		}
	}
}
