/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from 'vs/base/common/buffer';
import { generateUuid, isUUID } from 'vs/base/common/uuid';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IFileService } from 'vs/platform/files/common/files';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';

export async function getServiceMachineId(environmentService: IEnvironmentService, fileService: IFileService, storageService: IStorageService | undefined): Promise<string> {
	let uuid: string | null = storageService ? storageService.get('storage.serviceMachineId', StorageScope.APPLICATION) || null : null;
	if (uuid) {
		return uuid;
	}
	try {
		const contents = await fileService.readFile(environmentService.serviceMachineIdResource);
		const value = contents.value.toString();
		uuid = isUUID(value) ? value : null;
	} catch (e) {
		uuid = null;
	}

	if (!uuid) {
		uuid = generateUuid();
		try {
			await fileService.writeFile(environmentService.serviceMachineIdResource, VSBuffer.fromString(uuid));
		} catch (error) {
			//noop
		}
	}

	storageService?.store('storage.serviceMachineId', uuid, StorageScope.APPLICATION, StorageTarget.MACHINE);

	return uuid;
}
