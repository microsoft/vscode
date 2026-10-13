/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IToolDeferralService } from '../../../platform/networking/common/toolDeferralService';
import { ToolName } from './toolNames';
import { ToolRegistry } from './toolsRegistry';

/**
 * Tool names not registered via ToolRegistry.registerTool that should also
 * be non-deferred. These are core tools provided by VS Code or dynamically
 * injected tools.
 */
const additionalNonDeferredToolNames = new Set<string>([
	// Core tools provided by VS Code (not registered via ToolRegistry.registerTool)
	ToolName.CoreRunInTerminal,
	ToolName.CoreGetTerminalOutput,
	ToolName.CoreSendToTerminal,
	ToolName.CoreKillTerminal,
	ToolName.CoreRunSubagent,
	ToolName.CoreRunTest,
	ToolName.CoreAskQuestions,
	// Model-specific tool registered via ToolRegistry.registerModelSpecificTool
	ToolName.ToolSearch,
	// Dynamically injected tools (no ToolName enum entry)
	'task_complete',
	// VS Code built-in language tools that should always be available
	'vscode_renameSymbol',
	'vscode_listCodeUsages',
]);

/**
 * Service implementation for tool deferral checks.
 * Registered in the DI container so consumers can access it via accessor.get().
 */
export class ToolDeferralService implements IToolDeferralService {
	readonly _serviceBrand: undefined;

	isNonDeferredTool(name: string): boolean {
		return ToolRegistry.nonDeferredToolNames.has(name) || additionalNonDeferredToolNames.has(name);
	}
}
