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
import { IEditorService } from '../../../services/editor/common/editorService.js';
import './planningModeActions.js'; // Register actions
import '../common/planningModeConfiguration.js'; // Register configuration
import { IChatEditorOptions } from '../../../contrib/chat/browser/chatEditor.js';
import { ChatEditorUri } from '../../../contrib/chat/browser/chatEditorInput.js';
import { localize } from '../../../../nls.js';
import { IWorkbenchLayoutService, Parts } from '../../layout/browser/layoutService.js';

export class PlanningModeController extends Disposable {

	private planningChatEditorPromise: Promise<void> | undefined;

	constructor(
		@IPlanningModeService private readonly planningModeService: IPlanningModeService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IEditorService private readonly editorService: IEditorService,
		// @ICommandService private readonly commandService: ICommandService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
	) {
		super();

		// Initialize sub-controllers - these are kept alive through disposal registration
		this._register(this.instantiationService.createInstance(PlanningModeEditorController));
		this._register(this.instantiationService.createInstance(PlanningModeStatusBarController));
		this._register(this.instantiationService.createInstance(PlanningModeContextKeyController));

		// Listen for planning mode changes to open/close chat editor
		this._register(this.planningModeService.onDidChange(isActive => {
			if (isActive) {
				this._openPlanningChatEditor();
			} else {
				this._closePlanningChatEditor();
			}
		}));

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

	private async _openPlanningChatEditor(): Promise<void> {
		if (this.planningChatEditorPromise) {
			return this.planningChatEditorPromise;
		}

		this.planningChatEditorPromise = this._doOpenPlanningChatEditor();
		this.layoutService.setPartHidden(true, Parts.SIDEBAR_PART);
		this.layoutService.setPartHidden(true, Parts.AUXILIARYBAR_PART);
		return this.planningChatEditorPromise;
	}

	private async _doOpenPlanningChatEditor(): Promise<void> {
		try {
			// Create a new untitled file for the planning chat
			// const content = this._generateInitialChatContent();

			const options: IChatEditorOptions = {
				preferredTitle: localize('planningModeChatTitle', 'Planning')

			}

			await this.editorService.openEditor({
				resource: ChatEditorUri.generate(999),
				options,
			});

			// Set the editor to read-only after it opens
			setTimeout(() => {
				const activeEditor = this.editorService.activeTextEditorControl;
				if (activeEditor && typeof activeEditor.updateOptions === 'function') {
					activeEditor.updateOptions({
						readOnly: true,
						readOnlyMessage: {
							value: '**Planning Mode Chat**: This is a dedicated planning conversation area. Use the Command Palette to interact with MCP tools and plan your work.'
						}
					});
				}
			}, 100);

		} catch (error) {
			console.error('Failed to open planning chat editor:', error);
		}
	}

	private async _closePlanningChatEditor(): Promise<void> {
		// The chat editor will remain open when planning mode is deactivated
		// This allows users to keep their planning notes
		this.planningChatEditorPromise = undefined;
	}

	// 	private _generateInitialChatContent(): string {
	// 		const timestamp = new Date().toLocaleString();
	// 		return `# Planning Mode Session

	// **Started:** ${timestamp}
	// **Status:** Active - File editing is restricted

	// ## Planning Workspace

	// This is your dedicated planning area. While in Planning Mode:

	// - ✅ **Research freely**: Use MCP tools to analyze your codebase
	// - ✅ **Ask questions**: Get AI assistance for planning and analysis
	// - ✅ **Take notes**: Document your findings and decisions
	// - ❌ **No file editing**: All code changes are blocked for safety

	// ## Your Planning Notes

	// Start documenting your research and planning here...

	// ---

	// **Commands available:**
	// - \`Toggle Planning Mode\` - Exit planning mode
	// - \`Export Planning Conversation\` - Save complete planning summary
	// - \`Clear Planning Conversation\` - Reset conversation history

	// `;
	// 	}
}
