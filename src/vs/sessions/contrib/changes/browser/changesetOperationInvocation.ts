/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isCancellationError } from '../../../../base/common/errors.js';
import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { localize } from '../../../../nls.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { ISessionChangeset, ISessionChangesetOperation, ISessionChangesetOperationTarget } from '../../../services/sessions/common/session.js';

/**
 * Invokes a changeset operation for a user action and reports a failure as an
 * error notification, so a failed operation is never silent.
 *
 * Use this from UI entry points (buttons, toolbars) whose action runners do not
 * surface errors themselves. Errors are reported rather than rethrown so that
 * callers that also report run errors do not show them twice.
 */
export async function invokeChangesetOperationAndReportErrors(
	changeset: ISessionChangeset,
	operation: Pick<ISessionChangesetOperation, 'id' | 'label'>,
	target: ISessionChangesetOperationTarget | undefined,
	notificationService: INotificationService,
	logService: ILogService,
): Promise<void> {
	try {
		await (target ? changeset.invokeOperation(operation.id, target) : changeset.invokeOperation(operation.id));
	} catch (error) {
		if (isCancellationError(error)) {
			return;
		}
		logService.error(`[Changes] Changeset operation '${operation.id}' failed`, error);
		notificationService.error(localize('changesetOperation.failed', "{0}: {1}", operation.label, toErrorMessage(error)));
	}
}
