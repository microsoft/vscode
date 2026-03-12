/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { IBannerService } from '../../../services/banner/browser/bannerService.js';
import { asJson, IRequestService } from '../../../../platform/request/common/request.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { arch, platform } from '../../../../base/common/process.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { equals } from '../../../../base/common/arrays.js';
import { IntervalTimer } from '../../../../base/common/async.js';
import { mainWindow } from '../../../../base/browser/window.js';

interface IEmergencyAlert {
	readonly commit: string;
	readonly platform?: string;
	readonly arch?: string;
	readonly message: string;
	readonly actions?: ReadonlyArray<{
		readonly label: string;
		readonly href: string;
	}>;
}

interface IEmergencyAlerts {
	readonly alerts: IEmergencyAlert[];
}

const POLLING_INTERVAL = 60 * 60 * 1000; // 1 hour
const BANNER_ID = 'emergencyAlert.banner';

export class EmergencyAlert extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.emergencyAlert';

	private currentAlertMessage: string | undefined;
	private currentAlertActions: IEmergencyAlert['actions'] | undefined;

	constructor(
		@IBannerService private readonly bannerService: IBannerService,
		@IRequestService private readonly requestService: IRequestService,
		@IProductService private readonly productService: IProductService,
		@ILogService private readonly logService: ILogService
	) {
		super();

		const emergencyAlertUrl = productService.emergencyAlertUrl;
		if (!emergencyAlertUrl) {
			return; // no emergency alert configured
		}

		this.fetchAlerts(emergencyAlertUrl);

		const pollingTimer = this._register(new IntervalTimer());
		pollingTimer.cancelAndSet(() => this.fetchAlerts(emergencyAlertUrl), POLLING_INTERVAL, mainWindow);
	}

	private async fetchAlerts(url: string): Promise<void> {
		try {
			await this.doFetchAlerts(url);
		} catch (e) {
			this.logService.error(e);
		}
	}

	private async doFetchAlerts(url: string): Promise<void> {
		const requestResult = await this.requestService.request({ type: 'GET', url, disableCache: true, timeout: 20000 }, CancellationToken.None);

		if (requestResult.res.statusCode !== 200) {
			throw new Error(`Failed to fetch emergency alerts: HTTP ${requestResult.res.statusCode}`);
		}

		const emergencyAlerts = await asJson<IEmergencyAlerts>(requestResult);
		if (!emergencyAlerts || !Array.isArray(emergencyAlerts.alerts)) {
			this.dismissAlert();
			return;
		}

		// Find the first matching alert
		const matchingAlert = emergencyAlerts.alerts.find(alert =>
			alert.commit === this.productService.commit &&
			(!alert.platform || alert.platform === platform) &&
			(!alert.arch || alert.arch === arch)
		);

		if (!matchingAlert) {
			// No matching alert, dismiss the banner if it was shown
			this.dismissAlert();
			return;
		}

		// Don't update the banner if message and actions didn't change
		if (
			this.currentAlertMessage === matchingAlert.message &&
			equals(this.currentAlertActions ?? [], matchingAlert.actions ?? [], (a, b) => a.label === b.label && a.href === b.href)
		) {
			return;
		}

		this.currentAlertMessage = matchingAlert.message;
		this.currentAlertActions = matchingAlert.actions;
		this.bannerService.show({
			id: BANNER_ID,
			icon: Codicon.warning,
			message: matchingAlert.message,
			actions: matchingAlert.actions
		});
	}

	private dismissAlert(): void {
		if (this.currentAlertMessage !== undefined) {
			this.currentAlertMessage = undefined;
			this.currentAlertActions = undefined;
			this.bannerService.hide(BANNER_ID);
		}
	}
}

registerWorkbenchContribution2(EmergencyAlert.ID, EmergencyAlert, WorkbenchPhase.Eventually);
