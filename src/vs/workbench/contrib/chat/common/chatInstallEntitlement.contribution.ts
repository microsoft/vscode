/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { AuthenticationSession, IAuthenticationService } from '../../../services/authentication/common/authentication.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IExtensionManagementService } from '../../../../platform/extensionManagement/common/extensionManagement.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { IRequestService, asText } from '../../../../platform/request/common/request.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { CONTEXT_CHAT_INSTALL_ENTITLED } from './chatContextKeys.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';

// TODO@bpasero revisit this flow

type ChatInstallEntitlementEnablementClassification = {
	entitled: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Flag indicating if the user is chat install entitled' };
	owner: 'bpasero';
	comment: 'Reporting if the user is chat install entitled';
};

type ChatInstallEntitlementEnablementEvent = {
	entitled: boolean;
};

class ChatInstallEntitlementContribution extends Disposable implements IWorkbenchContribution {

	private static readonly CHAT_EXTENSION_INSTALLED_KEY = 'chat.extensionInstalled';

	private readonly chatInstallEntitledContextKey = CONTEXT_CHAT_INSTALL_ENTITLED.bindTo(this.contextService);
	private readonly listeners = this._register(new DisposableStore());

	private didResolveEntitlement = false;

	constructor(
		@IContextKeyService private readonly contextService: IContextKeyService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IAuthenticationService private readonly authenticationService: IAuthenticationService,
		@IProductService private readonly productService: IProductService,
		@IExtensionManagementService private readonly extensionManagementService: IExtensionManagementService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@IRequestService private readonly requestService: IRequestService,
		@IStorageService private readonly storageService: IStorageService
	) {
		super();

		if (!this.productService.gitHubEntitlement) {
			return;
		}

		this.init();
	}

	private async init(): Promise<void> {
		const extensions = await this.extensionManagementService.getInstalled();

		const installed = extensions.find(value => ExtensionIdentifier.equals(value.identifier.id, this.productService.gitHubEntitlement?.extensionId));
		if (!installed) {
			this.registerListeners();
		} else {
			this.disableEntitlement(true);
		}
	}

	private registerListeners(): void {
		this.listeners.add(this.extensionService.onDidChangeExtensions(result => {
			for (const extension of result.added) {
				if (ExtensionIdentifier.equals(this.productService.gitHubEntitlement?.extensionId, extension.identifier)) {
					this.disableEntitlement(true);
					return;
				}
			}
		}));

		this.listeners.add(this.authenticationService.onDidChangeSessions(async e => {
			if (e.providerId === this.productService.gitHubEntitlement?.providerId && e.event.added?.length) {
				await this.resolveEntitlement(e.event.added[0]);
			} else if (e.providerId === this.productService.gitHubEntitlement?.providerId && e.event.removed?.length) {
				this.disableEntitlement(false);
			}
		}));

		this.listeners.add(this.authenticationService.onDidRegisterAuthenticationProvider(async e => {
			if (e.id === this.productService.gitHubEntitlement?.providerId) {
				this.resolveEntitlement((await this.authenticationService.getSessions(e.id))[0]);
			}
		}));
	}

	private async resolveEntitlement(session: AuthenticationSession | undefined) {
		if (!session) {
			return;
		}

		const installedExtensions = await this.extensionManagementService.getInstalled();
		const installed = installedExtensions.find(value => ExtensionIdentifier.equals(value.identifier.id, this.productService.gitHubEntitlement?.extensionId));
		if (installed) {
			this.disableEntitlement(true);
			return;
		}

		const entitled = await this.doResolveEntitlement(session);
		this.chatInstallEntitledContextKey.set(entitled);
	}

	private async doResolveEntitlement(session: AuthenticationSession): Promise<boolean> {
		if (this.didResolveEntitlement) {
			return false;
		}

		const cts = new CancellationTokenSource();
		this._register(toDisposable(() => cts.dispose(true)));

		const context = await this.requestService.request({
			type: 'GET',
			url: this.productService.gitHubEntitlement!.entitlementUrl,
			headers: {
				'Authorization': `Bearer ${session.accessToken}`
			}
		}, cts.token);

		if (context.res.statusCode && context.res.statusCode !== 200) {
			return false;
		}

		const result = await asText(context);
		if (!result) {
			return false;
		}

		let parsedResult: any;
		try {
			parsedResult = JSON.parse(result);
		} catch (err) {
			return false; //ignore
		}

		this.didResolveEntitlement = true;

		const entitled = Boolean(parsedResult[this.productService.gitHubEntitlement!.enablementKey]);
		this.telemetryService.publicLog2<ChatInstallEntitlementEnablementEvent, ChatInstallEntitlementEnablementClassification>('chatInstallEntitlement', { entitled });

		return entitled;
	}

	private disableEntitlement(isExtensionInstalled: boolean): void {
		if (isExtensionInstalled) {
			this.storageService.store(ChatInstallEntitlementContribution.CHAT_EXTENSION_INSTALLED_KEY, true, StorageScope.PROFILE, StorageTarget.MACHINE);
		}
		this.chatInstallEntitledContextKey.set(false);
		this.listeners.dispose();
	}
}

registerWorkbenchContribution2('workbench.chat.installEntitlement', ChatInstallEntitlementContribution, WorkbenchPhase.BlockRestore);
