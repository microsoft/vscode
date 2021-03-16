/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { hash } from 'vs/base/common/hash';

interface NotificationMetrics {
	id: number;
	source?: string;
}

type NotificationMetricsClassification = {
	id: { classification: 'SystemMetaData', purpose: 'FeatureInsight' };
	source?: { classification: 'SystemMetaData', purpose: 'FeatureInsight' }
};

export class NotificationsTelemetry extends Disposable implements IWorkbenchContribution {

	constructor(
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@INotificationService private readonly notificationService: INotificationService
	) {
		super();
		this.registerListeners();
	}

	private registerListeners(): void {
		this._register(this.notificationService.onDidAddNotification(notification => {
			if (!notification.silent) {
				this.telemetryService.publicLog2<NotificationMetrics, NotificationMetricsClassification>('notification:show', {
					id: hash(notification.message.toString()),
					source: notification.source
				});
			}
		}));

		this._register(this.notificationService.onDidRemoveNotification(notification => {
			if (!notification.silent) {
				this.telemetryService.publicLog2<NotificationMetrics, NotificationMetricsClassification>('notification:close', {
					id: hash(notification.message.toString()),
					source: notification.source
				});
			}
		}));
	}
}
