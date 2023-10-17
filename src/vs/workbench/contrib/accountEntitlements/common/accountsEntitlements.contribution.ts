/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions as WorkbenchExtensions, IWorkbenchContributionsRegistry, IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { Disposable, MutableDisposable } from 'vs/base/common/lifecycle';
import { ContextKeyExpr, ContextKeyTrueExpr, IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IOpenerService } from 'vs/platform/opener/common/opener';
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

const configurationKey = 'workbench.accounts.experimental.showEntitlements';

class AccountsEntitlement extends Disposable implements IWorkbenchContribution {
	private isInitialized = false;
	private contextKey = new RawContextKey<boolean>(configurationKey, true).bindTo(this.contextService);

	constructor(
		@IContextKeyService readonly contextService: IContextKeyService,
		@IInstantiationService readonly instantiationService: IInstantiationService,
		@ICommandService readonly commandService: ICommandService,
		@ITelemetryService readonly telemetryService: ITelemetryService,
		@IOpenerService readonly openerService: IOpenerService,
		@IAuthenticationService readonly authenticationService: IAuthenticationService,
		@IProductService readonly productService: IProductService,
		@IStorageService readonly storageService: IStorageService,
		@IExtensionManagementService readonly extensionManagementService: IExtensionManagementService,
		@IActivityService readonly activityService: IActivityService,
		@IExtensionService readonly extensionService: IExtensionService,
		@IConfigurationService readonly configurationService: IConfigurationService,
		@IContextKeyService readonly contextKeyService: IContextKeyService
	) {
		super();

		if (!this.productService.entitlement) {
			return;
		}

		// if previously shown, do not show again.
		const showEntitlements = this.storageService.getBoolean(configurationKey, StorageScope.APPLICATION, true);
		if (!showEntitlements) {
			return;
		}

		const setting = this.configurationService.inspect<boolean>(configurationKey);
		if (!setting.value) {
			return;
		}

		this.extensionManagementService.getInstalled().then(exts => {
			const installed = exts.find(value => ExtensionIdentifier.equals(value.identifier.id, this.productService.entitlement!.extensionId));
			if (installed) {
				this.storageService.store(configurationKey, false, StorageScope.APPLICATION, StorageTarget.MACHINE);
				this.contextKey.set(false);
				return;
			} else {
				this.registerListeners();
			}
		});
	}

	private registerListeners() {
		this._register(this.extensionService.onDidChangeExtensions(async (result) => {
			for (const ext of result.added) {
				if (ExtensionIdentifier.equals(this.productService.entitlement!.extensionId, ext.identifier)) {
					this.storageService.store(configurationKey, false, StorageScope.APPLICATION, StorageTarget.MACHINE);
					this.contextKey.set(false);
					return;
				}
			}
		}));

		this._register(this.authenticationService.onDidChangeSessions(async (e) => {
			if (e.providerId === this.productService.entitlement!.providerId && e.event.added.length > 0 && !this.isInitialized) {
				this.onSessionChange(e.event.added[0]);
			} else if (e.providerId === this.productService.entitlement!.providerId && e.event.removed.length > 0) {
				this.contextKey.set(false);
			}
		}));

		this._register(this.authenticationService.onDidRegisterAuthenticationProvider(async e => {
			if (e.id === this.productService.entitlement!.providerId && !this.isInitialized) {
				const session = await this.authenticationService.getSessions(e.id);
				this.onSessionChange(session[0]);
			}
		}));
	}

	private async onSessionChange(session: AuthenticationSession) {

		this.isInitialized = true;

		const init = {
			method: 'GET',
			headers: new Headers({
				'Authorization': `Bearer ${session.accessToken}`
			}),
		};

		const response = await window.fetch(this.productService.entitlement!.entitlementUrl, init);
		if (!response.ok) {
			return;
		}

		const item = await response.blob();
		const reader = new FileReader();
		const accountsMenuBadgeDisposable = this._register(new MutableDisposable());
		reader.addEventListener('load', async () => {
			const result = reader.result;
			try {
				const parsedResult = JSON.parse(result as string);

				if (parsedResult) {
					const orgs = parsedResult['organization_login_list'] as any[];
					if (orgs.length === 0) {
						return;
					}

					this.contextKey.set(true);
					const badge = new NumberBadge(1, () => menuTitle);
					accountsMenuBadgeDisposable.value = this.activityService.showAccountsActivity({ badge });

					const menuTitle = this.productService.entitlement!.command.title.replace('{{org}}', orgs[orgs.length - 1])!;

					registerAction2(class extends Action2 {
						constructor() {
							super({
								id: 'workbench.action.entitlementAction',
								title: menuTitle,
								f1: false,
								menu: {
									id: MenuId.AccountsContext,
									group: '5_AccountsEntitlements',
									when: ContextKeyExpr.equals(configurationKey, true),
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
							commandService.executeCommand(productService.entitlement!.command.action, productService.entitlement!.extensionId!);
							accountsMenuBadgeDisposable.clear();
							const contextKey = new RawContextKey<boolean>(configurationKey, true).bindTo(contextKeyService);
							contextKey.set(false);
							storageService.store(configurationKey, false, StorageScope.APPLICATION, StorageTarget.MACHINE);
						}
					});

					const altMenuTitle = this.productService.entitlement!.altCommand.title!;
					const altContextKey = this.productService.entitlement!.altCommand.when;

					registerAction2(class extends Action2 {
						constructor() {
							super({
								id: 'workbench.action.entitlementAltAction',
								title: altMenuTitle,
								f1: false,
								toggled: ContextKeyTrueExpr.INSTANCE,
								menu: {
									id: MenuId.AccountsContext,
									group: '5_AccountsEntitlements',
									when: ContextKeyExpr.equals(altContextKey, true),
								}
							});
						}

						public async run(
							accessor: ServicesAccessor
						) {
							const productService = accessor.get(IProductService);
							const commandService = accessor.get(ICommandService);
							commandService.executeCommand(productService.entitlement!.altCommand.action, productService.entitlement!.extensionId!);
						}
					});
				}
			} catch (e) {
				console.error(e);
			}
		});

		reader.readAsText(item);
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench)
	.registerWorkbenchContribution(AccountsEntitlement, LifecyclePhase.Eventually);


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
