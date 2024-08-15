/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ILoggerService } from 'vs/platform/log/common/log';
import { RequestService } from 'vs/platform/request/browser/requestService';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { AuthInfo, Credentials, IRequestService } from 'vs/platform/request/common/request';
import { INativeHostService } from 'vs/platform/native/common/native';

export class NativeRequestService extends RequestService {

	constructor(
		@IConfigurationService configurationService: IConfigurationService,
		@ILoggerService loggerService: ILoggerService,
		@INativeHostService private nativeHostService: INativeHostService
	) {
		super(configurationService, loggerService);
	}

	override async resolveProxy(url: string): Promise<string | undefined> {
		return this.nativeHostService.resolveProxy(url);
	}

	override async lookupAuthorization(authInfo: AuthInfo): Promise<Credentials | undefined> {
		return this.nativeHostService.lookupAuthorization(authInfo);
	}

	override async lookupKerberosAuthorization(url: string): Promise<string | undefined> {
		return this.nativeHostService.lookupKerberosAuthorization(url);
	}

	override async loadCertificates(): Promise<string[]> {
		return this.nativeHostService.loadCertificates();
	}
}

registerSingleton(IRequestService, NativeRequestService, InstantiationType.Delayed);
