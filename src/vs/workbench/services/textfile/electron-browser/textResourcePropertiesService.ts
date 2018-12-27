/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ITextResourcePropertiesService } from 'vs/editor/common/services/resourceConfiguration';
import { OperatingSystem, OS } from 'vs/base/common/platform';
import { IRemoteAgentService, IRemoteAgentEnvironment } from 'vs/workbench/services/remote/node/remoteAgentService';
import { Schemas } from 'vs/base/common/network';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { IWindowService } from 'vs/platform/windows/common/windows';

export class TextResourcePropertiesService implements ITextResourcePropertiesService {

	_serviceBrand: any;

	private remoteEnvironment: IRemoteAgentEnvironment | null = null;

	constructor(
		@IConfigurationService private configurationService: IConfigurationService,
		@IRemoteAgentService remoteAgentService: IRemoteAgentService,
		@IWindowService private windowService: IWindowService,
		@IStorageService private storageService: IStorageService
	) {
		const remoteAgentConnection = remoteAgentService.getConnection();
		if (remoteAgentConnection) {
			remoteAgentConnection.getEnvironment().then(remoteEnv => this.remoteEnvironment = remoteEnv);
		}
	}

	getEOL(resource: URI, language?: string): string {
		const filesConfiguration = this.configurationService.getValue<{ eol: string }>('files', { overrideIdentifier: language, resource });
		if (filesConfiguration && filesConfiguration.eol && filesConfiguration.eol !== 'auto') {
			return filesConfiguration.eol;
		}
		const os = this.getOS(resource);
		return os === OperatingSystem.Linux || os === OperatingSystem.Macintosh ? '\n' : '\r\n';
	}

	private getOS(resource: URI): OperatingSystem {
		let os = OS;
		const remoteAuthority = this.windowService.getConfiguration().remoteAuthority;
		if (remoteAuthority) {
			if (resource.scheme !== Schemas.file) {
				const osCacheKey = `resource.authority.os.${remoteAuthority}`;
				os = this.remoteEnvironment ? this.remoteEnvironment.os : /* Get it from cache */ this.storageService.getInteger(osCacheKey, StorageScope.WORKSPACE, OS);
				this.storageService.store(osCacheKey, os, StorageScope.WORKSPACE);
			}
		}
		return os;
	}

}