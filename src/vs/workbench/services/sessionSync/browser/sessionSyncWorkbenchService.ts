/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { localize } from 'vs/nls';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IFileService } from 'vs/platform/files/common/files';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { ILogService } from 'vs/platform/log/common/log';
import { IProductService } from 'vs/platform/product/common/productService';
import { IQuickInputService, IQuickPickItem } from 'vs/platform/quickinput/common/quickInput';
import { IRequestService } from 'vs/platform/request/common/request';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IAuthenticationProvider } from 'vs/platform/userDataSync/common/userDataSync';
import { UserDataSyncStoreClient } from 'vs/platform/userDataSync/common/userDataSyncStoreService';
import { AuthenticationSession, IAuthenticationService } from 'vs/workbench/services/authentication/common/authentication';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { EditSession, ISessionSyncWorkbenchService } from 'vs/workbench/services/sessionSync/common/sessionSync';

export class SessionSyncWorkbenchService extends Disposable implements ISessionSyncWorkbenchService {

	_serviceBrand = undefined;

	private serverConfiguration = this.productService['sessionSync.store']!;
	private storeClient: UserDataSyncStoreClient;

	#authenticationInfo: { sessionId: string; token: string; providerId: string } | undefined;

	constructor(
		@IFileService private readonly fileService: IFileService,
		@IStorageService private readonly storageService: IStorageService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IAuthenticationService private readonly authenticationService: IAuthenticationService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@ILogService private readonly logService: ILogService,
		@IProductService private readonly productService: IProductService,
		@IRequestService private readonly requestService: IRequestService,
	) {
		super();

		this.storeClient = new UserDataSyncStoreClient(URI.parse(this.serverConfiguration.url), this.productService, this.requestService, this.logService, this.environmentService, this.fileService, this.storageService);
	}

	async write(editSession: EditSession): Promise<void> {
		const initialized = await this.waitAndInitialize();
		if (!initialized) {
			throw new Error('Unable to store edit session.');
		}

		await this.storeClient.write('editSessions', JSON.stringify(editSession), null);
	}

	async read(): Promise<EditSession | undefined> {
		const initialized = await this.waitAndInitialize();
		if (!initialized) {
			throw new Error('Unable to apply latest edit session.');
		}

		// Pull latest session data from service
		const sessionData = await this.storeClient?.read('editSessions', null);
		if (!sessionData?.content) {
			return;
		}

		// TODO@joyceerhl Validate session data, check schema version
		return JSON.parse(sessionData.content);
	}

	/**
	 *
	 * Ensure that the store client is initialized
	 * meaning that authentication is available and it
	 * can be used to communicate with the settings sync server
	 */
	private async waitAndInitialize(): Promise<boolean> {
		// Wait for authentication extensions to be registered
		await this.extensionService.whenInstalledExtensionsRegistered();

		// If we already have an existing auth session, use that
		if (this.#authenticationInfo !== undefined) {
			return true;
		}

		// Ask the user to pick a preferred account
		const session = await this.getAccountPreference();
		if (session !== undefined) {
			this.#authenticationInfo = { sessionId: session?.id, token: session.accessToken, providerId: session.providerId };
			this.storeClient.setAuthToken(this.#authenticationInfo.token, this.#authenticationInfo.providerId);
			return true;
		}

		return false;
	}

	private async getAccountPreference(): Promise<AuthenticationSession & { providerId: string } | undefined> {
		const quickpick = this.quickInputService.createQuickPick<IQuickPickItem & { session: AuthenticationSession & { providerId: string } }>();
		quickpick.title = localize('account preference', 'Edit Sessions');
		quickpick.ok = false;
		quickpick.placeholder = localize('choose account placeholder', "Select an account to sign in");
		quickpick.ignoreFocusOut = true;

		const options = [];
		const authenticationProviders = await this.getAuthenticationProviders();
		for (const provider of authenticationProviders) {
			const sessions = await this.authenticationService.getSessions(provider.id, provider.scopes);

			for (const session of sessions) {
				options.push({
					label: session.account.id,
					session: { ...session, providerId: provider.id }
				});
			}
		}

		quickpick.items = options;

		return new Promise((resolve, reject) => {
			quickpick.onDidHide((e) => quickpick.dispose());
			quickpick.onDidAccept((e) => resolve(quickpick.selectedItems[0].session));
			quickpick.show();
		});
	}

	private async getAuthenticationProviders() {
		// Get the list of authentication providers configured in product.json
		const configuredAuthenticationProviders = Object.keys(this.serverConfiguration.authenticationProviders).reduce<IAuthenticationProvider[]>((result, id) => {
			result.push({ id, scopes: this.serverConfiguration.authenticationProviders[id].scopes });
			return result;
		}, []);

		// Filter out anything that isn't currently available through the authenticationService
		const availableAuthenticationProviders = this.authenticationService.declaredProviders;

		return configuredAuthenticationProviders.filter(({ id }) => availableAuthenticationProviders.some(provider => provider.id === id));
	}
}

registerSingleton(ISessionSyncWorkbenchService, SessionSyncWorkbenchService);
