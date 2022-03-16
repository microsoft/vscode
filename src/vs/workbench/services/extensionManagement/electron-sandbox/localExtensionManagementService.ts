/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IExtensionManagementService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { TargetPlatform } from 'vs/platform/extensions/common/extensions';
import { ExtensionManagementChannelClient } from 'vs/platform/extensionManagement/common/extensionManagementIpc';
import { IChannel } from 'vs/base/parts/ipc/common/ipc';
import { IFileService } from 'vs/platform/files/common/files';
import { computeTargetPlatform } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { ILogService } from 'vs/platform/log/common/log';

export class NativeLocalExtensionManagementService extends ExtensionManagementChannelClient implements IExtensionManagementService {

	constructor(
		channel: IChannel,
		@IFileService private readonly fileService: IFileService,
		@ILogService private readonly logService: ILogService,
	) {
		super(channel);
	}

	override getTargetPlatform(): Promise<TargetPlatform> {
		if (!this._targetPlatformPromise) {
			this._targetPlatformPromise = computeTargetPlatform(this.fileService, this.logService);
		}
		return this._targetPlatformPromise;
	}
}
