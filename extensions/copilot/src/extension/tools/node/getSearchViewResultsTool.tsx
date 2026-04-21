/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { IRunCommandExecutionService } from '../../../platform/commands/common/runCommandExecutionService';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { LanguageModelTextPart, LanguageModelToolResult } from '../../../vscodeTypes';
import { ToolName } from '../common/toolNames';
import { ICopilotTool, ToolRegistry } from '../common/toolsRegistry';

export class GetSearchViewResultsTool implements ICopilotTool<void> {
	public static readonly toolName = ToolName.SearchViewResults;

	constructor(
		@IRunCommandExecutionService private readonly _commandService: IRunCommandExecutionService,
	) {
	}

	async invoke(options: vscode.LanguageModelToolInvocationOptions<void>, token: CancellationToken): Promise<vscode.LanguageModelToolResult> {
		const results: string[] = [];

		try {
			const searchResults = await this._commandService.executeCommand('search.action.getSearchResults');
			if (searchResults) {
				results.push(searchResults);
			}
		} catch {
			// no results yet
		}

		return new LanguageModelToolResult([
			new LanguageModelTextPart(`The following are the results from the search view:\n${results.join('\n')}`)
		]);
	}
}

ToolRegistry.registerTool(GetSearchViewResultsTool);