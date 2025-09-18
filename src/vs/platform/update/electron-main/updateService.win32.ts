/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IConfigurationService } from '../../configuration/common/configuration.js';
import { IEnvironmentMainService } from '../../environment/electron-main/environmentMainService.js';
import { ILifecycleMainService, IRelaunchHandler, IRelaunchOptions } from '../../lifecycle/electron-main/lifecycleMainService.js';
import { ILogService } from '../../log/common/log.js';
import { INativeHostMainService } from '../../native/electron-main/nativeHostMainService.js';
import { IProductService } from '../../product/common/productService.js';
import { IRequestService } from '../../request/common/request.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { DisablementReason, State, UpdateType } from '../common/update.js';
import { AbstractUpdateService } from './abstractUpdateService.js';

export class Win32UpdateService extends AbstractUpdateService implements IRelaunchHandler {

	constructor(
		@ILifecycleMainService lifecycleMainService: ILifecycleMainService,
		@IConfigurationService configurationService: IConfigurationService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IEnvironmentMainService environmentMainService: IEnvironmentMainService,
		@IRequestService requestService: IRequestService,
		@ILogService logService: ILogService,
		@INativeHostMainService private readonly nativeHostMainService: INativeHostMainService,
		@IProductService productService: IProductService
	) {
		super(lifecycleMainService, configurationService, environmentMainService, requestService, logService, productService);

		lifecycleMainService.setRelaunchHandler(this);
	}

	handleRelaunch(_options?: IRelaunchOptions): boolean {
		return false;
	}

	protected override async initialize(): Promise<void> {
		if (this.productService.target === 'user' && await this.nativeHostMainService.isAdmin(undefined)) {
			this.logService.info('update#ctor - updates are disabled due to running as Admin in user setup');
			this.setState(State.Disabled(DisablementReason.RunningAsAdmin));
			return;
		}

		this.logService.info('Win32UpdateService: updates are currently disabled (legacy S3 JSON flow removed).');
		this.setState(State.Disabled(DisablementReason.InvalidConfiguration));
	}

	protected buildUpdateFeedUrl(_quality: string): string | undefined {
		return undefined;
	}

	protected doCheckForUpdates(explicit: boolean): void {
		if (explicit) {
			this.logService.info('Win32UpdateService: manual check ignored (updates disabled).');
		}
	}

	protected override doQuitAndInstall(): void {
		this.logService.info('Win32UpdateService: quitAndInstall requested but updates are disabled.');
	}

	protected override getUpdateType(): UpdateType {
		return UpdateType.Archive;
	}
}
