/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IRemoteAuthorityResolverService, ResolvedAuthority, IResolvingProgressEvent } from 'vs/platform/remote/common/remoteAuthorityResolver';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ILogService } from 'vs/platform/log/common/log';
import { Disposable } from 'vs/base/common/lifecycle';
import { Emitter, Event } from 'vs/base/common/event';
import { IExtensionManagementService } from 'vs/platform/extensionManagement/common/extensionManagement';

export class RemoteAuthorityResolverService extends Disposable implements IRemoteAuthorityResolverService {

	_serviceBrand: any;

	private _onResolvingProgress: Emitter<IResolvingProgressEvent> = this._register(new Emitter<IResolvingProgressEvent>());
	readonly onResolvingProgress: Event<IResolvingProgressEvent> = this._onResolvingProgress.event;

	constructor(
		@IEnvironmentService environmentService: IEnvironmentService,
		@IConfigurationService configurationService: IConfigurationService,
		@ILogService logService: ILogService,
		@IExtensionManagementService extensionManagementService: IExtensionManagementService
	) {
		super();
	}

	async resolveAuthority(authority: string): Promise<ResolvedAuthority> {
		throw new Error(`Not implemented`);
	}

	async getLabel(authority: string): Promise<string | null> {
		throw new Error(`Not implemented`);
	}
}
