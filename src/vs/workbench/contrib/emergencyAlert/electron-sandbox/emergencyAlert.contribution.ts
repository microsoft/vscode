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

interface IEmergencyAlert {
	readonly commit: string;
	readonly platform?: string;
	readonly arch?: string;
	readonly message: string;
	readonly actions?: [{
		readonly label: string;
		readonly href: string;
	}];
}

interface IEmergencyAlerts {
	readonly alerts: IEmergencyAlert[];
}

export class EmergencyAlert implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.emergencyAlert';

	constructor(
		@IBannerService private readonly bannerService: IBannerService,
		@IRequestService private readonly requestService: IRequestService,
		@IProductService private readonly productService: IProductService,
		@ILogService private readonly logService: ILogService
	) {
		if (productService.quality !== 'insider') {
			return; // only enabled in insiders for now
		}

		const emergencyAlertUrl = productService.emergencyAlertUrl;
		if (!emergencyAlertUrl) {
			return; // no emergency alert configured
		}

		this.fetchAlerts(emergencyAlertUrl);
	}

	private async fetchAlerts(url: string): Promise<void> {
		try {
			await this.doFetchAlerts(url);
		} catch (e) {
			this.logService.error(e);
		}
	}

	private async doFetchAlerts(url: string): Promise<void> {
		const requestResult = await this.requestService.request({ type: 'GET', url, disableCache: true }, CancellationToken.None);

		if (requestResult.res.statusCode !== 200) {
			throw new Error(`Failed to fetch emergency alerts: HTTP ${requestResult.res.statusCode}`);
		}

		const emergencyAlerts = await asJson<IEmergencyAlerts>(requestResult);
		if (!emergencyAlerts) {
			return;
		}

		for (const emergencyAlert of emergencyAlerts.alerts) {
			if (
				(emergencyAlert.commit !== this.productService.commit) ||				// version mismatch
				(emergencyAlert.platform && emergencyAlert.platform !== platform) ||	// platform mismatch
				(emergencyAlert.arch && emergencyAlert.arch !== arch)					// arch mismatch
			) {
				return;
			}

			this.bannerService.show({
				id: 'emergencyAlert.banner',
				icon: Codicon.warning,
				message: emergencyAlert.message,
				actions: emergencyAlert.actions
			});

			break;
		}
	}
}

registerWorkbenchContribution2('workbench.emergencyAlert', EmergencyAlert, WorkbenchPhase.Eventually);
