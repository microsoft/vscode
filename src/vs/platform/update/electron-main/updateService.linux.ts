/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IConfigurationService } from '../../configuration/common/configuration.js';
import { IEnvironmentMainService } from '../../environment/electron-main/environmentMainService.js';
import { ILifecycleMainService, IRelaunchHandler, IRelaunchOptions } from '../../lifecycle/electron-main/lifecycleMainService.js';
import { ILogService } from '../../log/common/log.js';
import { IProductService } from '../../product/common/productService.js';
import { IRequestService } from '../../request/common/request.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { DisablementReason, State, UpdateType } from '../common/update.js';
import { AbstractUpdateService } from './abstractUpdateService.js';

export class LinuxUpdateService extends AbstractUpdateService implements IRelaunchHandler {

	constructor(
		@ILifecycleMainService lifecycleMainService: ILifecycleMainService,
		@IConfigurationService configurationService: IConfigurationService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IEnvironmentMainService environmentMainService: IEnvironmentMainService,
		@IRequestService requestService: IRequestService,
		@ILogService logService: ILogService,
		@IProductService productService: IProductService
	) {
		super(lifecycleMainService, configurationService, environmentMainService, requestService, logService, productService);

		lifecycleMainService.setRelaunchHandler(this);
	}

	handleRelaunch(_options?: IRelaunchOptions): boolean {
		return false;
	}

	protected override async initialize(): Promise<void> {
		this.logService.info('LinuxUpdateService: updates are currently disabled (legacy S3 JSON flow removed).');
		this.setState(State.Disabled(DisablementReason.InvalidConfiguration));
	}

	protected buildUpdateFeedUrl(_quality: string): string | undefined {
		return undefined;
	}

	protected doCheckForUpdates(explicit: boolean): void {
		if (explicit) {
			this.logService.info('LinuxUpdateService: manual check ignored (updates disabled).');
		}
	}

	protected override doQuitAndInstall(): void {
		this.logService.info('LinuxUpdateService: quitAndInstall requested but updates are disabled.');
	}

	protected override getUpdateType(): UpdateType {
		return UpdateType.Archive;
	}
}
