/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { registerAction2 } from '../../../../platform/actions/common/actions.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { IExtensionManifest } from '../../../../platform/extensions/common/extensions.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IWorkbenchContribution, WorkbenchPhase, registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { SignOutOfAccountAction } from './actions/signOutOfAccountAction.js';
import { IBrowserWorkbenchEnvironmentService } from '../../../services/environment/browser/environmentService.js';
import { Extensions, IExtensionFeatureTableRenderer, IExtensionFeaturesRegistry, IRenderedData, IRowData, ITableData } from '../../../services/extensionManagement/common/extensionFeatures.js';
import { ManageTrustedExtensionsForAccountAction } from './actions/manageTrustedExtensionsForAccountAction.js';
import { ManageAccountPreferencesForExtensionAction } from './actions/manageAccountPreferencesForExtensionAction.js';
import { IAuthenticationUsageService } from '../../../services/authentication/browser/authenticationUsageService.js';
import { ManageAccountPreferencesForMcpServerAction } from './actions/manageAccountPreferencesForMcpServerAction.js';
import { ManageTrustedMcpServersForAccountAction } from './actions/manageTrustedMcpServersForAccountAction.js';
import { RemoveDynamicAuthenticationProvidersAction } from './actions/manageDynamicAuthenticationProvidersAction.js';
import { ManageAccountsAction } from './actions/manageAccountsAction.js';

const codeExchangeProxyCommand = CommandsRegistry.registerCommand('workbench.getCodeExchangeProxyEndpoints', function (accessor, _) {
	const environmentService = accessor.get(IBrowserWorkbenchEnvironmentService);
	return environmentService.options?.codeExchangeProxyEndpoints;
});

class AuthenticationDataRenderer extends Disposable implements IExtensionFeatureTableRenderer {

	readonly type = 'table';

	shouldRender(manifest: IExtensionManifest): boolean {
		return !!manifest.contributes?.authentication;
	}

	render(manifest: IExtensionManifest): IRenderedData<ITableData> {
		const authentication = manifest.contributes?.authentication || [];
		if (!authentication.length) {
			return { data: { headers: [], rows: [] }, dispose: () => { } };
		}

		const headers = [
			localize('authenticationlabel', "Label"),
			localize('authenticationid', "ID"),
			localize('authenticationMcpAuthorizationServers', "MCP Authorization Servers")
		];

		const rows: IRowData[][] = authentication
			.sort((a, b) => a.label.localeCompare(b.label))
			.map(auth => {
				return [
					auth.label,
					auth.id,
					(auth.authorizationServerGlobs ?? []).join(',\n')
				];
			});

		return {
			data: {
				headers,
				rows
			},
			dispose: () => { }
		};
	}
}

const extensionFeature = Registry.as<IExtensionFeaturesRegistry>(Extensions.ExtensionFeaturesRegistry).registerExtensionFeature({
	id: 'authentication',
	label: localize('authentication', "Authentication"),
	access: {
		canToggle: false
	},
	renderer: new SyncDescriptor(AuthenticationDataRenderer),
});

class AuthenticationContribution extends Disposable implements IWorkbenchContribution {
	static ID = 'workbench.contrib.authentication';

	constructor() {
		super();
		this._register(codeExchangeProxyCommand);
		this._register(extensionFeature);

		this._registerActions();
	}

	private _registerActions(): void {
		this._register(registerAction2(ManageAccountsAction));
		this._register(registerAction2(SignOutOfAccountAction));
		this._register(registerAction2(ManageTrustedExtensionsForAccountAction));
		this._register(registerAction2(ManageAccountPreferencesForExtensionAction));
		this._register(registerAction2(ManageTrustedMcpServersForAccountAction));
		this._register(registerAction2(ManageAccountPreferencesForMcpServerAction));
		this._register(registerAction2(RemoveDynamicAuthenticationProvidersAction));
	}
}

class AuthenticationUsageContribution implements IWorkbenchContribution {
	static ID = 'workbench.contrib.authenticationUsage';

	constructor(
		@IAuthenticationUsageService private readonly _authenticationUsageService: IAuthenticationUsageService,
	) {
		this._initializeExtensionUsageCache();
	}

	private async _initializeExtensionUsageCache() {
		await this._authenticationUsageService.initializeExtensionUsageCache();
	}
}

// class AuthenticationExtensionsContribution extends Disposable implements IWorkbenchContribution {
// 	static ID = 'workbench.contrib.authenticationExtensions';

// 	constructor(
// 		@IExtensionService private readonly _extensionService: IExtensionService,
// 		@IAuthenticationQueryService private readonly _authenticationQueryService: IAuthenticationQueryService,
// 		@IAuthenticationService private readonly _authenticationService: IAuthenticationService
// 	) {
// 		super();
// 		void this.run();
// 		this._register(this._extensionService.onDidChangeExtensions(this._onDidChangeExtensions, this));
// 		this._register(
// 			Event.any(
// 				this._authenticationService.onDidChangeDeclaredProviders,
// 				this._authenticationService.onDidRegisterAuthenticationProvider
// 			)(() => this._cleanupRemovedExtensions())
// 		);
// 	}

// 	async run(): Promise<void> {
// 		await this._extensionService.whenInstalledExtensionsRegistered();
// 		this._cleanupRemovedExtensions();
// 	}

// 	private _onDidChangeExtensions(delta: { readonly added: readonly IExtensionDescription[]; readonly removed: readonly IExtensionDescription[] }): void {
// 		if (delta.removed.length > 0) {
// 			this._cleanupRemovedExtensions(delta.removed);
// 		}
// 	}

// 	private _cleanupRemovedExtensions(removedExtensions?: readonly IExtensionDescription[]): void {
// 		const extensionIdsToRemove = removedExtensions
// 			? new Set(removedExtensions.map(e => e.identifier.value))
// 			: new Set(this._extensionService.extensions.map(e => e.identifier.value));

// 		// If we are cleaning up specific removed extensions, we only remove those.
// 		const isTargetedCleanup = !!removedExtensions;

// 		const providerIds = this._authenticationQueryService.getProviderIds();
// 		for (const providerId of providerIds) {
// 			this._authenticationQueryService.provider(providerId).forEachAccount(account => {
// 				account.extensions().forEach(extension => {
// 					const shouldRemove = isTargetedCleanup
// 						? extensionIdsToRemove.has(extension.extensionId)
// 						: !extensionIdsToRemove.has(extension.extensionId);

// 					if (shouldRemove) {
// 						extension.removeUsage();
// 						extension.setAccessAllowed(false);
// 					}
// 				});
// 			});
// 		}
// 	}
// }

// class AuthenticationMcpContribution extends Disposable implements IWorkbenchContribution {
// 	static ID = 'workbench.contrib.authenticationMcp';

// 	constructor(
// 		@IMcpRegistry private readonly _mcpRegistry: IMcpRegistry,
// 		@IAuthenticationQueryService private readonly _authenticationQueryService: IAuthenticationQueryService,
// 		@IAuthenticationService private readonly _authenticationService: IAuthenticationService
// 	) {
// 		super();
// 		this._cleanupRemovedMcpServers();

// 		// Listen for MCP collections changes using autorun with observables
// 		this._register(autorun(reader => {
// 			// Read the collections observable to register dependency
// 			this._mcpRegistry.collections.read(reader);
// 			// Schedule cleanup for next tick to avoid running during observable updates
// 			queueMicrotask(() => this._cleanupRemovedMcpServers());
// 		}));
// 		this._register(
// 			Event.any(
// 				this._authenticationService.onDidChangeDeclaredProviders,
// 				this._authenticationService.onDidRegisterAuthenticationProvider
// 			)(() => this._cleanupRemovedMcpServers())
// 		);
// 	}

// 	private _cleanupRemovedMcpServers(): void {
// 		const currentServerIds = new Set(this._mcpRegistry.collections.get().flatMap(c => c.serverDefinitions.get()).map(s => s.id));
// 		const providerIds = this._authenticationQueryService.getProviderIds();
// 		for (const providerId of providerIds) {
// 			this._authenticationQueryService.provider(providerId).forEachAccount(account => {
// 				account.mcpServers().forEach(server => {
// 					if (!currentServerIds.has(server.mcpServerId)) {
// 						server.removeUsage();
// 						server.setAccessAllowed(false);
// 					}
// 				});
// 			});
// 		}
// 	}
// }

registerWorkbenchContribution2(AuthenticationContribution.ID, AuthenticationContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(AuthenticationUsageContribution.ID, AuthenticationUsageContribution, WorkbenchPhase.Eventually);
// registerWorkbenchContribution2(AuthenticationExtensionsContribution.ID, AuthenticationExtensionsContribution, WorkbenchPhase.Eventually);
// registerWorkbenchContribution2(AuthenticationMcpContribution.ID, AuthenticationMcpContribution, WorkbenchPhase.Eventually);
