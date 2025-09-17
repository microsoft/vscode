/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IPlanningModeService } from '../common/planningMode.js';
import { PlanningModeEditorController } from './planningModeEditorController.js';
import { PlanningModeStatusBarController } from './planningModeStatusBarController.js';
import { PlanningModeContextKeyController } from './planningModeContextKeyController.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import './planningModeActions.js'; // Register actions
import '../common/planningModeConfiguration.js'; // Register configuration

export class PlanningModeController extends Disposable {

	constructor(
		@IPlanningModeService planningModeService: IPlanningModeService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();

		// Initialize sub-controllers - these are kept alive through disposal registration
		this._register(this.instantiationService.createInstance(PlanningModeEditorController));
		this._register(this.instantiationService.createInstance(PlanningModeStatusBarController));
		this._register(this.instantiationService.createInstance(PlanningModeContextKeyController));

		// Track MCP tool usage for conversation logging
		this._setupMcpToolTracking(planningModeService);
	}

	private _setupMcpToolTracking(planningModeService: IPlanningModeService): void {
		// Note: In a real implementation, we would hook into the MCP tool execution
		// to automatically log tool calls to the conversation. For now, this is a placeholder
		// that demonstrates where this integration would happen.

		// This would be implemented by listening to MCP tool execution events
		// and automatically adding conversation entries for each tool call.

		// Example integration point:
		// this._register(mcpService.onDidExecuteTool(event => {
		//   planningModeService.addConversationEntry({
		//     type: 'tool-call',
		//     content: `Called ${event.toolName}`,
		//     metadata: { toolName: event.toolName, toolParams: event.params }
		//   });
		// }));
	}
}
