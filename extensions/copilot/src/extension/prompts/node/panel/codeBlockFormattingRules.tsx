/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BasePromptElementProps, PromptElement, PromptSizing } from '@vscode/prompt-tsx';
import { filepathCodeBlockMarker } from '../../../../util/common/markdown';
import { ExampleCodeBlock } from './safeElements';

export interface CodeBlockFormattingRulesPromptProps extends BasePromptElementProps {
	readonly disableCodeBlockUris?: boolean;
}

export const EXISTING_CODE_MARKER = '...existing code...';

export class CodeBlockFormattingRules extends PromptElement<CodeBlockFormattingRulesPromptProps> {

	public override render(state: void, sizing: PromptSizing) {
		return (
			<>
				When suggesting code changes or new content, use Markdown code blocks.<br />
				To start a code block, use 4 backticks.<br />
				After the backticks, add the programming language name.<br />
				{
					!this.props.disableCodeBlockUris &&
					<>
						If the code modifies an existing file or should be placed at a specific location, add a line comment with '{filepathCodeBlockMarker}' and the file path.<br />
						If you want the user to decide where to place the code, do not add the file path comment.<br />
					</>
				}
				In the code block, use a line comment with '{EXISTING_CODE_MARKER}' to indicate code that is already present in the file.<br />
				<ExampleCodeBlock languageId='languageId' examplePath={'/path/to/file'} includeFilepath={true} minNumberOfBackticks={4}
					code={
						[
							`// ${EXISTING_CODE_MARKER}`,
							`{ changed code }`,
							`// ${EXISTING_CODE_MARKER}`,
							`{ changed code }`,
							`// ${EXISTING_CODE_MARKER}`
						].join('\n')
					}
				/>
			</>
		);
	}
}