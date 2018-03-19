/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import product from 'vs/platform/node/product';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { INotificationService, Severity } from 'vs/platform/notification/common/notification';
import URI from 'vs/base/common/uri';
import { localize } from 'vs/nls';
import { onUnexpectedError } from 'vs/base/common/errors';
import { IWindowService } from 'vs/platform/windows/common/windows';

export class TelemetryOptOut implements IWorkbenchContribution {

	private static TELEMETRY_OPT_OUT_SHOWN = 'workbench.telemetryOptOutShown';

	constructor(
		@IStorageService storageService: IStorageService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IOpenerService openerService: IOpenerService,
		@INotificationService notificationService: INotificationService,
		@IWindowService windowService: IWindowService,
		@ITelemetryService telemetryService: ITelemetryService
	) {
		if (!product.telemetryOptOutUrl || storageService.get(TelemetryOptOut.TELEMETRY_OPT_OUT_SHOWN)) {
			return;
		}
		windowService.isFocused().then(focused => {
			if (!focused) {
				return null;
			}
			storageService.store(TelemetryOptOut.TELEMETRY_OPT_OUT_SHOWN, true);

			const optOutUrl = product.telemetryOptOutUrl;
			const privacyUrl = product.privacyStatementUrl || product.telemetryOptOutUrl;
			return notificationService.prompt(Severity.Info, localize('telemetryOptOut.notice', "Help improve VS Code by allowing Microsoft to collect usage data. Read our [privacy statement]({0}) and learn how to [opt out]({1}).", privacyUrl, optOutUrl), [localize('telemetryOptOut.readMore', "Read More")])
				.then(() => openerService.open(URI.parse(optOutUrl)));
		})
			.then(null, onUnexpectedError);
	}
}
