/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { AbstractInitializer } from 'vs/platform/userDataSync/common/abstractSynchronizer';
import { ExtensionsInitializer } from 'vs/platform/userDataSync/common/extensionsSync';
import { GlobalStateInitializer } from 'vs/platform/userDataSync/common/globalStateSync';
import { KeybindingsInitializer } from 'vs/platform/userDataSync/common/keybindingsSync';
import { SettingsInitializer } from 'vs/platform/userDataSync/common/settingsSync';
import { SnippetsInitializer } from 'vs/platform/userDataSync/common/snippetsSync';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IFileService } from 'vs/platform/files/common/files';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';
import { UserDataSyncStoreClient } from 'vs/platform/userDataSync/common/userDataSyncStoreService';
import { IProductService } from 'vs/platform/product/common/productService';
import { IRequestService } from 'vs/platform/request/common/request';
import { CONFIGURATION_SYNC_STORE_KEY } from 'vs/platform/userDataSync/common/userDataSync';
import { URI } from 'vs/base/common/uri';
import { getAuthenticationSession } from 'vs/workbench/services/authentication/browser/authenticationService';

export function initializeUserData(
	environmentService: IWorkbenchEnvironmentService,
	fileService: IFileService,
	storageService: IStorageService,
	productService: IProductService,
	requestService: IRequestService,
	logService: ILogService,
): Promise<void> {
	const initializers: AbstractInitializer[] = [
		new SettingsInitializer(fileService, environmentService, logService),
		new KeybindingsInitializer(fileService, environmentService, logService),
		new SnippetsInitializer(fileService, environmentService, logService),
		new GlobalStateInitializer(storageService, fileService, environmentService, logService),
	];
	return initialize(initializers, 'user data', environmentService, fileService, storageService, productService, requestService, logService);
}

export function initializeExtensions(instantiationService: IInstantiationService): Promise<void> {
	return instantiationService.invokeFunction(accessor => {
		return initialize([instantiationService.createInstance(ExtensionsInitializer)], 'extensions',
			accessor.get(IWorkbenchEnvironmentService),
			accessor.get(IFileService),
			accessor.get(IStorageService),
			accessor.get(IProductService),
			accessor.get(IRequestService),
			accessor.get(ILogService));
	});
}

async function initialize(
	initializers: AbstractInitializer[],
	userDataLabel: string,
	environmentService: IWorkbenchEnvironmentService,
	fileService: IFileService,
	storageService: IStorageService,
	productService: IProductService,
	requestService: IRequestService,
	logService: ILogService,
): Promise<void> {

	if (!environmentService.options?.enableSyncByDefault) {
		logService.trace(`Skipping initializing ${userDataLabel} as sync is not enabled by default`);
		return;
	}

	if (!storageService.isNew(StorageScope.GLOBAL)) {
		logService.trace(`Skipping initializing ${userDataLabel} as application was opened before`);
		return;
	}

	if (!storageService.isNew(StorageScope.WORKSPACE)) {
		logService.trace(`Skipping initializing ${userDataLabel} as workspace was opened before`);
		return;
	}

	const userDataSyncStore = productService[CONFIGURATION_SYNC_STORE_KEY];
	if (!userDataSyncStore) {
		logService.trace(`Skipping initializing ${userDataLabel} as sync service is not provided`);
		return;
	}

	if (!environmentService.options?.credentialsProvider) {
		return;
	}

	let authenticationSession;
	try {
		authenticationSession = await getAuthenticationSession(environmentService.options.credentialsProvider, productService);
	} catch (error) {
		logService.error(error);
	}
	if (!authenticationSession) {
		logService.trace(`Skipping initializing ${userDataLabel} as authentication session is not set`);
		return;
	}

	const userDataSyncStoreClient = new UserDataSyncStoreClient(URI.parse(userDataSyncStore.url), productService, requestService, logService, environmentService, fileService, storageService);
	try {
		userDataSyncStoreClient.setAuthToken(authenticationSession.accessToken, authenticationSession.providerId);
		logService.info(`Started initializing ${userDataLabel}`);
		for (const initializer of initializers) {
			try {
				const userData = await userDataSyncStoreClient.read(initializer.resource, null);
				await initializer.initialize(userData);
			} catch (error) {
				logService.info(`Error while initializing ${initializer.resource}`);
				logService.error(error);
			}
		}
		logService.info(`Initializing ${userDataLabel} completed`);
	} finally {
		userDataSyncStoreClient.dispose();
	}
}
