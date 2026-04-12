/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { registerAction2 } from '../../../../platform/actions/common/actions.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { SignOutOfAccountAction } from './actions/signOutOfAccountAction.js';
import { IBrowserWorkbenchEnvironmentService } from '../../../services/environment/browser/environmentService.js';
import { Extensions } from '../../../services/extensionManagement/common/extensionFeatures.js';
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
class AuthenticationDataRenderer extends Disposable {
    constructor() {
        super(...arguments);
        this.type = 'table';
    }
    shouldRender(manifest) {
        return !!manifest.contributes?.authentication;
    }
    render(manifest) {
        const authentication = manifest.contributes?.authentication || [];
        if (!authentication.length) {
            return { data: { headers: [], rows: [] }, dispose: () => { } };
        }
        const headers = [
            localize('authenticationlabel', "Label"),
            localize('authenticationid', "ID"),
            localize('authenticationMcpAuthorizationServers', "MCP Authorization Servers")
        ];
        const rows = authentication
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
const extensionFeature = Registry.as(Extensions.ExtensionFeaturesRegistry).registerExtensionFeature({
    id: 'authentication',
    label: localize('authentication', "Authentication"),
    access: {
        canToggle: false
    },
    renderer: new SyncDescriptor(AuthenticationDataRenderer),
});
class AuthenticationContribution extends Disposable {
    static { this.ID = 'workbench.contrib.authentication'; }
    constructor() {
        super();
        this._register(codeExchangeProxyCommand);
        this._register(extensionFeature);
        this._registerActions();
    }
    _registerActions() {
        this._register(registerAction2(ManageAccountsAction));
        this._register(registerAction2(SignOutOfAccountAction));
        this._register(registerAction2(ManageTrustedExtensionsForAccountAction));
        this._register(registerAction2(ManageAccountPreferencesForExtensionAction));
        this._register(registerAction2(ManageTrustedMcpServersForAccountAction));
        this._register(registerAction2(ManageAccountPreferencesForMcpServerAction));
        this._register(registerAction2(RemoveDynamicAuthenticationProvidersAction));
    }
}
let AuthenticationUsageContribution = class AuthenticationUsageContribution {
    static { this.ID = 'workbench.contrib.authenticationUsage'; }
    constructor(_authenticationUsageService) {
        this._authenticationUsageService = _authenticationUsageService;
        this._initializeExtensionUsageCache();
    }
    async _initializeExtensionUsageCache() {
        await this._authenticationUsageService.initializeExtensionUsageCache();
    }
};
AuthenticationUsageContribution = __decorate([
    __param(0, IAuthenticationUsageService)
], AuthenticationUsageContribution);
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
registerWorkbenchContribution2(AuthenticationContribution.ID, AuthenticationContribution, 3 /* WorkbenchPhase.AfterRestored */);
registerWorkbenchContribution2(AuthenticationUsageContribution.ID, AuthenticationUsageContribution, 4 /* WorkbenchPhase.Eventually */);
// registerWorkbenchContribution2(AuthenticationExtensionsContribution.ID, AuthenticationExtensionsContribution, WorkbenchPhase.Eventually);
// registerWorkbenchContribution2(AuthenticationMcpContribution.ID, AuthenticationMcpContribution, WorkbenchPhase.Eventually);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXV0aGVudGljYXRpb24uY29udHJpYnV0aW9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvYXV0aGVudGljYXRpb24vYnJvd3Nlci9hdXRoZW50aWNhdGlvbi5jb250cmlidXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUM5QyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDakYsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFFcEYsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBQzFGLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUM1RSxPQUFPLEVBQTBDLDhCQUE4QixFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDMUgsT0FBTyxFQUFFLHNCQUFzQixFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDN0UsT0FBTyxFQUFFLG1DQUFtQyxFQUFFLE1BQU0sNkRBQTZELENBQUM7QUFDbEgsT0FBTyxFQUFFLFVBQVUsRUFBbUcsTUFBTSxtRUFBbUUsQ0FBQztBQUNoTSxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUMvRyxPQUFPLEVBQUUsMENBQTBDLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUNySCxPQUFPLEVBQUUsMkJBQTJCLEVBQUUsTUFBTSx3RUFBd0UsQ0FBQztBQUNySCxPQUFPLEVBQUUsMENBQTBDLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUNySCxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSxzREFB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