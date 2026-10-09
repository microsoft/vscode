/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IReader } from '../../../../../base/common/observable.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { IAutomationRun } from '../../../../../workbench/contrib/chat/common/automations/automation.js';
import { IChatModel } from '../../../../../workbench/contrib/chat/common/model/chatModel.js';

/** Overlays newer local conversation progress without changing authoritative history. */
export function automationRunWithLocalProgress(run: IAutomationRun, models: Iterable<IChatModel>, reader?: IReader): IAutomationRun {
	if (!run.externalResource || !run.sessionResource) {
		return run;
	}
	for (const model of models) {
		if (!isEqual(model.sessionResource, run.sessionResource)) {
			continue;
		}
		if (model.requestInProgress.read(reader)) {
			const request = model.lastRequestObs.read(reader);
			return {
				...run, status: 'running', needsInput: !!model.requestNeedsInput.read(reader), statusDescription: undefined, errorMessage: undefined,
				...(request ? { updatedAt: new Date(request.timestamp).toISOString() } : {}),
			};
		}
		const response = model.lastRequestObs.read(reader)?.response;
		if (response?.isComplete && !response.isCanceled && response.completionTimestamp !== undefined
			&& response.completionTimestamp > Date.parse(run.updatedAt ?? run.completedAt ?? run.startedAt)) {
			return {
				...run,
				status: response.result?.errorDetails ? 'failed' : 'completed',
				updatedAt: new Date(response.completionTimestamp).toISOString(),
				completedAt: new Date(response.completionTimestamp).toISOString(),
				needsInput: false,
				statusDescription: undefined,
				errorMessage: response.result?.errorDetails?.message,
			};
		}
		break;
	}
	return run;
}
