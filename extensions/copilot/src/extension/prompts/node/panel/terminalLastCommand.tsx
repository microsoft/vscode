/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BasePromptElementProps, PromptElement, PromptPiece, PromptSizing, UserMessage } from '@vscode/prompt-tsx';
import type { TerminalExecutedCommand } from 'vscode';
import { ITerminalService } from '../../../../platform/terminal/common/terminalService';

export interface ProjectLabelsProps extends BasePromptElementProps { }

export class TerminalLastCommand extends PromptElement<ProjectLabelsProps, TerminalExecutedCommand | undefined> {
	constructor(
		props: ProjectLabelsProps,
		@ITerminalService private readonly _terminalService: ITerminalService
	) {
		super(props);
	}

	override async prepare(): Promise<TerminalExecutedCommand | undefined> {
		return this._terminalService.terminalLastCommand;
	}

	override render(state: TerminalExecutedCommand | undefined, sizing: PromptSizing): PromptPiece<any, any> | undefined {
		if (!state) {
			return undefined;
		}

		const userPrompt: string[] = [];
		if (state.commandLine) {
			userPrompt.push(`The following is the last command run in the terminal:`);
			userPrompt.push(state.commandLine);
		}
		if (state.cwd) {
			userPrompt.push(`It was run in the directory:`);
			userPrompt.push(typeof state.cwd === 'object' ? state.cwd.toString() : state.cwd);
		}
		if (state.output) {
			userPrompt.push(`It has the following output:`);
			userPrompt.push(state.output);
		}

		const prompt = userPrompt.join('\n');
		return (<>
			<UserMessage priority={this.props.priority}>
				The active terminal's last run command:<br />
				{prompt}
			</UserMessage >
		</>);
	}
}
