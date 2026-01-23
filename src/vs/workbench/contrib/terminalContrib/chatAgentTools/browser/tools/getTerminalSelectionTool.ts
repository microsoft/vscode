/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../../nls.js';
import { ToolDataSource, type IPreparedToolInvocation, type IToolData, type IToolImpl, type IToolInvocation, type IToolInvocationPreparationContext, type IToolResult, type CountTokensCallback, type ToolProgress } from '../../../../chat/common/tools/languageModelToolsService.js';
import { ITerminalService } from '../../../../terminal/browser/terminal.js';

export const GetTerminalSelectionToolData: IToolData = {
	id: 'terminal_selection',
	toolReferenceName: 'terminalSelection',
	legacyToolReferenceFullNames: ['runCommands/terminalSelection'],
	displayName: localize('terminalSelectionTool.displayName', 'Get Terminal Selection'),
	modelDescription: 'Get the current selection in the active terminal.',
	source: ToolDataSource.Internal,
	icon: Codicon.terminal,
};

export class GetTerminalSelectionTool extends Disposable implements IToolImpl {

	constructor(
		@ITerminalService private readonly _terminalService: ITerminalService,
	) {
		super();
	}

	async prepareToolInvocation(context: IToolInvocationPreparationContext, token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		return {
			invocationMessage: localize('getTerminalSelection.progressive', "Reading terminal selection"),
			pastTenseMessage: localize('getTerminalSelection.past', "Read terminal selection"),
		};
	}

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, token: CancellationToken): Promise<IToolResult> {
		const activeInstance = this._terminalService.activeInstance;
		if (!activeInstance) {
			return {
				content: [{
					kind: 'text',
					value: 'No active terminal instance found.'
				}]
			};
		}

		const selection = activeInstance.selection;
		if (!selection) {
			return {
				content: [{
					kind: 'text',
					value: 'No text is currently selected in the active terminal.'
				}]
			};
		}

		return {
			content: [{
				kind: 'text',
				value: `The active terminal's selection:\n${selection}`
			}]
		};
	}
}
