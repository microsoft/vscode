/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IWorkbenchContribution, IWorkbenchContributionsRegistry, Extensions } from 'vs/workbench/common/contributions';
import { Registry } from 'vs/platform/registry/common/platform';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { hash } from 'vs/base/common/hash';

interface NotificationMetrics {
	id: number;
	source?: string;
}

type NotificationMetricsClassification = {
	id: { classification: 'SystemMetaData', purpose: 'FeatureInsight' };
	source?: { classification: 'SystemMetaData', purpose: 'FeatureInsight' }
};

class NotificationsTelemetryContribution extends Disposable implements IWorkbenchContribution {

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@INotificationService notificationService: INotificationService
	) {
		super();
		this._register(notificationService.onDidAddNotification(notification => {
			if (!notification.silent) {
				telemetryService.publicLog2<NotificationMetrics, NotificationMetricsClassification>('notification:show', {
					id: hash(notification.message.toString()),
					source: notification.source
				});
			}
		}));

		this._register(notificationService.onDidRemoveNotification(notification => {
			if (!notification.silent) {
				telemetryService.publicLog2<NotificationMetrics, NotificationMetricsClassification>('notification:close', {
					id: hash(notification.message.toString()),
					source: notification.source
				});
			}
		}));
	}
}

export function registerNotificationTelemetry() {
	Registry.as<IWorkbenchContributionsRegistry>(Extensions.Workbench).registerWorkbenchContribution(NotificationsTelemetryContribution, LifecyclePhase.Restored);
}


