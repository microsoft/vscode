/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Lotas Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILogService } from '../../../../platform/log/common/log.js';
import { IAutoAcceptHandler, IWidgetDecisionSetter } from '../common/autoAcceptHandler.js';
import { IErdosAiSettingsService } from '../../erdosAiSettings/common/settingsService.js';
import { IStreamingOrchestrator } from '../../erdosAi/common/streamingOrchestrator.js';
import { IParallelFunctionBranchManager } from '../../erdosAi/browser/parallelFunctionBranchManager.js';

export class AutoAcceptHandler implements IAutoAcceptHandler {
	readonly _serviceBrand: undefined;
	
	private widgetDecisionSetter: IWidgetDecisionSetter | null = null;

	constructor(
		@ILogService private readonly logService: ILogService,
		@IErdosAiSettingsService private readonly settingsService: IErdosAiSettingsService,
		@IStreamingOrchestrator private readonly streamingOrchestrator: IStreamingOrchestrator,
		@IParallelFunctionBranchManager private readonly branchManager: IParallelFunctionBranchManager
	) {}
	
	/**
	 * Set the widget decision setter (called by the service core to avoid circular dependency)
	 */
	setWidgetDecisionSetter(setter: IWidgetDecisionSetter): void {
		this.widgetDecisionSetter = setter;
	}

	/**
	 * Check for auto-accept conditions and automatically set widget decisions
	 */
	async checkAndHandleAutoAccept(): Promise<boolean> {
		if (!this.widgetDecisionSetter) {
			this.logService.warn('[AUTO-ACCEPT] Widget decision setter not set');
			return false;
		}

		// Get current batch
		const currentBatchId = this.streamingOrchestrator.getCurrentBatchId();
		if (!currentBatchId) {
			this.logService.info('[AUTO-ACCEPT] No current batch ID');
			return false;
		}

		const branches = this.branchManager.getBatchBranches(currentBatchId);
		
		// Check for auto-accept edits (search_replace)
		const autoAcceptEdits = await this.settingsService.getAutoAcceptEdits();
		if (autoAcceptEdits) {
			const pendingSearchReplace = branches.find(branch => 
				branch.functionCall.name === 'search_replace' && 
				branch.status === 'waiting_user'
			);

			if (pendingSearchReplace) {
				this.widgetDecisionSetter.setWidgetDecision(
					'search_replace',
					pendingSearchReplace.messageId,
					'accept',
					'', // Content is not needed for search_replace acceptance
					pendingSearchReplace.requestId
				);
				
				return true;
			}
		}

		// Check for auto-accept deletes (delete_file)
		const autoAcceptDeletes = await this.settingsService.getAutoAcceptDeletes();
		if (autoAcceptDeletes) {
			const pendingDeleteFile = branches.find(branch => 
				branch.functionCall.name === 'delete_file' && 
				branch.status === 'waiting_user'
			);

			if (pendingDeleteFile) {
				this.widgetDecisionSetter.setWidgetDecision(
					'delete_file',
					pendingDeleteFile.messageId,
					'accept',
					'', // Content is not needed for delete_file acceptance
					pendingDeleteFile.requestId
				);
				
				return true;
			}
		}

		return false;
	}
}
