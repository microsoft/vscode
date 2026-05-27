/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BasePromptElementProps, PromptElement, PromptPiece, PromptSizing, UserMessage } from '@vscode/prompt-tsx';
import { ITerminalService } from '../../../../platform/terminal/common/terminalService';

export interface ProjectLabelsProps extends BasePromptElementProps { }

export class TerminalSelection extends PromptElement<ProjectLabelsProps, string> {
	constructor(
		props: ProjectLabelsProps,
		@ITerminalService private readonly _terminalService: ITerminalService
	) {
		super(props);
	}

	override async prepare(): Promise<string> {
		return this._terminalService.terminalSelection;
	}

	override render(state: string, sizing: PromptSizing): PromptPiece<any, any> | undefined {
		if (state.trim().length === 0) {
			return (<>
				<UserMessage priority={this.props.priority}>
					The active terminal has no selection.
				</UserMessage >
			</>);
		}

		return (<>
			<UserMessage priority={this.props.priority}>
				The active terminal's selection:<br />
				{state}
			</UserMessage >
		</>);
	}
}
