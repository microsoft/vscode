/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Registry } from 'vs/platform/registry/common/platform';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from 'vs/workbench/common/contributions';
import { Disposable, MutableDisposable } from 'vs/base/common/lifecycle';
import { ContextKeyExpr, IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { AuthenticationSession, IAuthenticationService } from 'vs/workbench/services/authentication/common/authentication';
import { Action2, MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { IActivityService, NumberBadge } from 'vs/workbench/services/activity/common/activity';
import { IProductService } from 'vs/platform/product/common/productService';
import { IExtensionManagementService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions, ConfigurationScope, } from 'vs/platform/configuration/common/configurationRegistry';
import { applicationConfigurationNodeBase } from 'vs/workbench/common/configuration';
import { localize } from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IRequestService, asText } from 'vs/platform/request/common/request';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { isWeb } from 'vs/base/common/platform';
import { isInternalTelemetry } from 'vs/platform/telemetry/common/telemetryUtils';

const accountsBadgeConfigKey = 'workbench.accounts.experimental.showEntitlements';
const chatWelcomeViewConfigKey = 'workbench.chat.experimental.showWelcomeView';

type EntitlementEnablementClassification = {
	enabled: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Flag indicating if the entitlement is enabled' };
	owner: 'bhavyaus';
	comment: 'Reporting when the entitlement is shown';
};

type EntitlementActionClassification = {
	command: { classification: 'PublicNonPersonalData'; purpose: 'FeatureInsight'; comment: 'The command being executed by the entitlement action' };
	owner: 'bhavyaus';
	comment: 'Reporting the entitlement action';
};

class EntitlementsContribution extends Disposable implements IWorkbenchContribution {

	private isInitialized = false;
	private showAccountsBadgeContextKey = new RawContextKey<boolean>(accountsBadgeConfigKey, false).bindTo(this.contextService);
	private showChatWelcomeViewContextKey = new RawContextKey<boolean>(chatWelcomeViewConfigKey, false).bindTo(this.contextService);

	constructor(
		@IContextKeyService readonly contextService: IContextKeyService,
		@ICommandService readonly commandService: ICommandService,
		@ITelemetryService readonly telemetryService: ITelemetryService,
		@IAuthenticationService readonly authenticationService: IAuthenticationService,
		@IProductService readonly productService: IProductService,
		@IStorageService readonly storageService: IStorageService,
		@IExtensionManagementService readonly extensionManagementService: IExtensionManagementService,
		@IActivityService readonly activityService: IActivityService,
		@IExtensionService readonly extensionService: IExtensionService,
		@IConfigurationService readonly configurationService: IConfigurationService,
		@IRequestService readonly requestService: IRequestService) {
		super();

		if (!this.productService.gitHubEntitlement || isWeb) {
			return;
		}

		this.extensionManagementService.getInstalled().then(async exts => {
			const installed = exts.find(value => ExtensionIdentifier.equals(value.identifier.id, this.productService.gitHubEntitlement!.extensionId));
			if (installed) {
				this.disableEntitlements();
			} else {
				this.registerListeners();
			}
		});
	}

	private registerListeners() {

		this._register(this.extensionService.onDidChangeExtensions(async (result) => {
			for (const ext of result.added) {
				if (ExtensionIdentifier.equals(this.productService.gitHubEntitlement!.extensionId, ext.identifier)) {
					this.disableEntitlements();
					return;
				}
			}
		}));

		this._register(this.authenticationService.onDidChangeSessions(async (e) => {
			if (e.providerId === this.productService.gitHubEntitlement!.providerId && e.event.added?.length) {
				await this.enableEntitlements(e.event.added[0]);
			} else if (e.providerId === this.productService.gitHubEntitlement!.providerId && e.event.removed?.length) {
				this.showAccountsBadgeContextKey.set(false);
				this.showChatWelcomeViewContextKey.set(false);
			}
		}));

		this._register(this.authenticationService.onDidRegisterAuthenticationProvider(async e => {
			if (e.id === this.productService.gitHubEntitlement!.providerId) {
				await this.enableEntitlements((await this.authenticationService.getSessions(e.id))[0]);
			}
		}));
	}

	private async getEntitlementsInfo(session: AuthenticationSession): Promise<[enabled: boolean, org: string | undefined]> {

		if (this.isInitialized) {
			return [false, ''];
		}

		const context = await this.requestService.request({
			type: 'GET',
			url: this.productService.gitHubEntitlement!.entitlementUrl,
			headers: {
				'Authorization': `Bearer ${session.accessToken}`
			}
		}, CancellationToken.None);

		if (context.res.statusCode && context.res.statusCode !== 200) {
			return [false, ''];
		}
		const result = await asText(context);
		if (!result) {
			return [false, ''];
		}

		let parsedResult: any;
		try {
			parsedResult = JSON.parse(result);
		}
		catch (err) {
			//ignore
			return [false, ''];
		}

		if (!(this.productService.gitHubEntitlement!.enablementKey in parsedResult) || !parsedResult[this.productService.gitHubEntitlement!.enablementKey]) {
			this.telemetryService.publicLog2<{ enabled: boolean }, EntitlementEnablementClassification>('entitlements.enabled', { enabled: false });
			return [false, ''];
		}
		this.telemetryService.publicLog2<{ enabled: boolean }, EntitlementEnablementClassification>('entitlements.enabled', { enabled: true });
		this.isInitialized = true;
		const orgs = parsedResult['organization_login_list'] as any[];
		return [true, orgs ? orgs[orgs.length - 1] : undefined];
	}

	private async enableEntitlements(session: AuthenticationSession) {
		const isInternal = isInternalTelemetry(this.productService, this.configurationService) ?? true;
		const showAccountsBadge = this.configurationService.inspect<boolean>(accountsBadgeConfigKey).value ?? false;
		const showWelcomeView = this.configurationService.inspect<boolean>(chatWelcomeViewConfigKey).value ?? false;

		const [enabled, org] = await this.getEntitlementsInfo(session);
		if (enabled) {
			if (isInternal && showWelcomeView) {
				this.showChatWelcomeViewContextKey.set(true);
				this.telemetryService.publicLog2<{ enabled: boolean }, EntitlementEnablementClassification>(chatWelcomeViewConfigKey, { enabled: true });
			}
			if (showAccountsBadge) {
				this.createAccountsBadge(org);
				this.showAccountsBadgeContextKey.set(showAccountsBadge);
				this.telemetryService.publicLog2<{ enabled: boolean }, EntitlementEnablementClassification>(accountsBadgeConfigKey, { enabled: true });
			}
		}
	}

	private disableEntitlements() {
		this.storageService.store(accountsBadgeConfigKey, false, StorageScope.APPLICATION, StorageTarget.MACHINE);
		this.storageService.store(chatWelcomeViewConfigKey, false, StorageScope.APPLICATION, StorageTarget.MACHINE);
		this.showAccountsBadgeContextKey.set(false);
		this.showChatWelcomeViewContextKey.set(false);
	}

	private async createAccountsBadge(org: string | undefined) {

		const menuTitle = org ? this.productService.gitHubEntitlement!.command.title.replace('{{org}}', org) : this.productService.gitHubEntitlement!.command.titleWithoutPlaceHolder;

		const badge = new NumberBadge(1, () => menuTitle);
		const accountsMenuBadgeDisposable = this._register(new MutableDisposable());
		accountsMenuBadgeDisposable.value = this.activityService.showAccountsActivity({ badge, });

		registerAction2(class extends Action2 {
			constructor() {
				super({
					id: 'workbench.action.entitlementAction',
					title: menuTitle,
					f1: false,
					menu: {
						id: MenuId.AccountsContext,
						group: '5_AccountsEntitlements',
						when: ContextKeyExpr.equals(accountsBadgeConfigKey, true),
					}
				});
			}

			public async run(
				accessor: ServicesAccessor
			) {
				const productService = accessor.get(IProductService);
				const commandService = accessor.get(ICommandService);
				const contextKeyService = accessor.get(IContextKeyService);
				const storageService = accessor.get(IStorageService);
				const dialogService = accessor.get(IDialogService);
				const telemetryService = accessor.get(ITelemetryService);

				const confirmation = await dialogService.confirm({
					type: 'question',
					message: productService.gitHubEntitlement!.confirmationMessage,
					primaryButton: productService.gitHubEntitlement!.confirmationAction,
				});

				if (confirmation.confirmed) {
					commandService.executeCommand(productService.gitHubEntitlement!.command.action, productService.gitHubEntitlement!.extensionId!);
					telemetryService.publicLog2<{ command: string }, EntitlementActionClassification>('accountsEntitlements.action', {
						command: productService.gitHubEntitlement!.command.action,
					});
				} else {
					telemetryService.publicLog2<{ command: string }, EntitlementActionClassification>('accountsEntitlements.action', {
						command: productService.gitHubEntitlement!.command.action + '-dismissed',
					});
				}

				accountsMenuBadgeDisposable.clear();
				const contextKey = new RawContextKey<boolean>(accountsBadgeConfigKey, true).bindTo(contextKeyService);
				contextKey.set(false);
				storageService.store(accountsBadgeConfigKey, false, StorageScope.APPLICATION, StorageTarget.MACHINE);
			}
		});
	}
}

const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
configurationRegistry.registerConfiguration({
	...applicationConfigurationNodeBase,
	properties: {
		'workbench.accounts.experimental.showEntitlements': {
			scope: ConfigurationScope.MACHINE,
			type: 'boolean',
			default: false,
			tags: ['experimental'],
			description: localize('workbench.accounts.showEntitlements', "When enabled, available entitlements for the account will be show in the accounts menu.")
		}
	}
});

configurationRegistry.registerConfiguration({
	...applicationConfigurationNodeBase,
	properties: {
		'workbench.chat.experimental.showWelcomeView': {
			scope: ConfigurationScope.MACHINE,
			type: 'boolean',
			default: false,
			tags: ['experimental'],
			description: localize('workbench.chat.showWelcomeView', "When enabled, the chat panel welcome view will be shown.")
		}
	}
});

registerWorkbenchContribution2('workbench.contrib.entitlements', EntitlementsContribution, WorkbenchPhase.BlockRestore);
