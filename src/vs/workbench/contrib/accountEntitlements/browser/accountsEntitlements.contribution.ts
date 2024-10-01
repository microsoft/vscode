/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Registry } from '../../../../platform/registry/common/platform.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { ContextKeyExpr, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { AuthenticationSession, IAuthenticationService } from '../../../services/authentication/common/authentication.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IActivityService, NumberBadge } from '../../../services/activity/common/activity.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IExtensionManagementService } from '../../../../platform/extensionManagement/common/extensionManagement.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions, ConfigurationScope, } from '../../../../platform/configuration/common/configurationRegistry.js';
import { applicationConfigurationNodeBase } from '../../../common/configuration.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IRequestService, asText } from '../../../../platform/request/common/request.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { isWeb } from '../../../../base/common/platform.js';

const accountsBadgeConfigKey = 'workbench.accounts.experimental.showEntitlements';

type EntitlementEnablementClassification = {
	enabled: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Flag indicating if the entitlement is enabled' };
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
	private readonly accountsMenuBadgeDisposable = this._register(new MutableDisposable());

	constructor(
		@IContextKeyService private readonly contextService: IContextKeyService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IAuthenticationService private readonly authenticationService: IAuthenticationService,
		@IProductService private readonly productService: IProductService,
		@IStorageService private readonly storageService: IStorageService,
		@IExtensionManagementService private readonly extensionManagementService: IExtensionManagementService,
		@IActivityService private readonly activityService: IActivityService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IRequestService private readonly requestService: IRequestService) {
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

		if (this.storageService.getBoolean(accountsBadgeConfigKey, StorageScope.APPLICATION) === false) {
			// we have already shown the entitlements. Do not show again
			return;
		}

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
				this.accountsMenuBadgeDisposable.clear();
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
		const orgs: { login: string; name: string }[] = parsedResult['organization_list'] as { login: string; name: string }[];
		return [true, orgs && orgs.length > 0 ? (orgs[0].name ? orgs[0].name : orgs[0].login) : undefined];
	}

	private async enableEntitlements(session: AuthenticationSession | undefined) {
		if (!session) {
			return;
		}

		const installedExtensions = await this.extensionManagementService.getInstalled();
		const installed = installedExtensions.find(value => ExtensionIdentifier.equals(value.identifier.id, this.productService.gitHubEntitlement!.extensionId));
		if (installed) {
			this.disableEntitlements();
			return;
		}

		const showAccountsBadge = this.configurationService.inspect<boolean>(accountsBadgeConfigKey).value ?? false;

		const [enabled, org] = await this.getEntitlementsInfo(session);
		if (enabled && showAccountsBadge) {
			this.createAccountsBadge(org);
			this.showAccountsBadgeContextKey.set(showAccountsBadge);
			this.telemetryService.publicLog2<{ enabled: boolean }, EntitlementEnablementClassification>(accountsBadgeConfigKey, { enabled: true });
		}
	}

	private disableEntitlements() {
		this.storageService.store(accountsBadgeConfigKey, false, StorageScope.APPLICATION, StorageTarget.MACHINE);
		this.showAccountsBadgeContextKey.set(false);
		this.accountsMenuBadgeDisposable.clear();
	}

	private async createAccountsBadge(org: string | undefined) {

		const menuTitle = org ? this.productService.gitHubEntitlement!.command.title.replace('{{org}}', org) : this.productService.gitHubEntitlement!.command.titleWithoutPlaceHolder;

		const badge = new NumberBadge(1, () => menuTitle);
		this.accountsMenuBadgeDisposable.value = this.activityService.showAccountsActivity({ badge });

		this.contextService.onDidChangeContext(e => {
			if (e.affectsSome(new Set([accountsBadgeConfigKey]))) {
				if (!this.contextService.getContextKeyValue<boolean>(accountsBadgeConfigKey)) {
					this.accountsMenuBadgeDisposable.clear();
				}
			}
		});

		this._register(registerAction2(class extends Action2 {
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

				const contextKey = new RawContextKey<boolean>(accountsBadgeConfigKey, false).bindTo(contextKeyService);
				contextKey.set(false);
				storageService.store(accountsBadgeConfigKey, false, StorageScope.APPLICATION, StorageTarget.MACHINE);
			}
		}));
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

registerWorkbenchContribution2('workbench.contrib.entitlements', EntitlementsContribution, WorkbenchPhase.BlockRestore);
