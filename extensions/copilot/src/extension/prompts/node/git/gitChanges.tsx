/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { BasePromptElementProps, PromptElement } from '@vscode/prompt-tsx';
import { Diff } from '../../../../platform/git/common/gitDiffService';
import { basename } from '../../../../util/vs/base/common/path';
import { FilePathMode, FileVariable } from '../panel/fileVariable';
import { UnsafeCodeBlock } from '../panel/unsafeElements';

export interface GitChangesProps extends BasePromptElementProps {
	readonly diffs: Diff[];
}

export class GitChanges extends PromptElement<GitChangesProps> {
	render() {
		return (
			<>
				{this.props.diffs.map((diff) => (
					<>
						<FileVariable passPriority={true} variableName={basename(diff.uri.toString())} variableValue={diff.uri} filePathMode={FilePathMode.AsComment} omitReferences />
						<UnsafeCodeBlock passPriority={true} code={diff.diff} languageId='diff' /><br />
					</>
				))}

			</>
		);
	}
}
