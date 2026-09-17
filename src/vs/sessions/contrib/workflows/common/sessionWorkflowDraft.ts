/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IObservable, observableValue, transaction } from '../../../../base/common/observable.js';
import { isObject } from '../../../../base/common/types.js';
import { localize } from '../../../../nls.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { WorkflowSnapshot } from '../../../../platform/workflow/common/workflow.js';
import { validateWorkflowInputs, validateWorkflowObject, validateWorkflowSnapshot } from '../../../../platform/workflow/common/workflowValidation.js';
import { SessionWorkflowSelection } from '../../../services/sessions/common/sessionsProvider.js';

const storageKey = 'sessions.workflowDraft';

export class SessionWorkflowDraft {
	private readonly selected = observableValue<SessionWorkflowSelection | undefined>(this, undefined);
	readonly selection: IObservable<SessionWorkflowSelection | undefined> = this.selected;
	private readonly restoreError = observableValue<string | undefined>(this, undefined);
	readonly error: IObservable<string | undefined> = this.restoreError;

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@ILogService private readonly logService: ILogService,
	) {
		const raw = storageService.get(storageKey, StorageScope.WORKSPACE);
		if (raw) {
			try {
				this.selected.set(this.parseSelection(raw), undefined);
			} catch (error) {
				this.logService.error('Failed to restore workflow selection', error);
				this.restoreError.set(localize('workflow.invalidDraft', "The saved workflow could not be restored. Choose a workflow or remove it before sending. {0}", String(error)), undefined);
			}
		}
	}

	setSelection(selection: SessionWorkflowSelection | undefined): void {
		const serialized = selection ? JSON.stringify(selection) : undefined;
		const validated = serialized ? this.parseSelection(serialized) : undefined;
		if (serialized) {
			this.storageService.store(storageKey, serialized, StorageScope.WORKSPACE, StorageTarget.MACHINE);
		} else {
			this.storageService.remove(storageKey, StorageScope.WORKSPACE);
		}
		transaction(tx => {
			this.restoreError.set(undefined, tx);
			this.selected.set(validated, tx);
		});
	}

	private parseSelection(raw: string): SessionWorkflowSelection {
		const value: Record<string, unknown> = JSON.parse(raw);
		if (!isObject(value) || !Object.hasOwn(value, 'snapshot') || !Object.hasOwn(value, 'stopAfter') || typeof value.stopAfter !== 'string'
			|| Object.keys(value).some(key => !['snapshot', 'stopAfter', 'inputs', 'origin'].includes(key))) {
			throw new Error(localize('workflow.invalidDraftShape', "The saved workflow selection has an invalid shape."));
		}
		const snapshot = value.snapshot as WorkflowSnapshot;
		validateWorkflowSnapshot(snapshot);
		if (!snapshot.checkpoints.some(checkpoint => checkpoint.id === value.stopAfter)) {
			throw new Error(localize('workflow.invalidDraftStop', "The saved stopping point does not belong to this workflow."));
		}
		const inputs = Object.hasOwn(value, 'inputs') ? value.inputs : {};
		validateWorkflowInputs(inputs, snapshot.inputSchema);
		let origin: SessionWorkflowSelection['origin'];
		if (Object.hasOwn(value, 'origin')) {
			validateWorkflowObject(value.origin);
			if (typeof value.origin.runId !== 'string' || !value.origin.runId
				|| typeof value.origin.checkpointId !== 'string' || !value.origin.checkpointId
				|| Object.keys(value.origin).some(key => key !== 'runId' && key !== 'checkpointId')) {
				throw new Error(localize('workflow.invalidDraftOrigin', "The source checkpoint of the saved workflow is invalid."));
			}
			origin = { runId: value.origin.runId, checkpointId: value.origin.checkpointId };
		}
		return { snapshot, stopAfter: value.stopAfter, ...(Object.hasOwn(value, 'inputs') ? { inputs } : {}), ...(origin ? { origin } : {}) };
	}
}
