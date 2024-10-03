/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IJSONSchema } from '../../../../base/common/jsonSchema.js';
import { Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import { isFalsyOrWhitespace } from '../../../../base/common/strings.js';
import { localize } from '../../../../nls.js';
import { MenuId, MenuRegistry, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { IExtensionManifest } from '../../../../platform/extensions/common/extensions.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IWorkbenchContribution, WorkbenchPhase, registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { SignOutOfAccountAction } from './actions/signOutOfAccountAction.js';
import { AuthenticationProviderInformation, IAuthenticationService } from '../../../services/authentication/common/authentication.js';
import { IBrowserWorkbenchEnvironmentService } from '../../../services/environment/browser/environmentService.js';
import { Extensions, IExtensionFeatureTableRenderer, IExtensionFeaturesRegistry, IRenderedData, IRowData, ITableData } from '../../../services/extensionManagement/common/extensionFeatures.js';
import { ExtensionsRegistry } from '../../../services/extensions/common/extensionsRegistry.js';
import { ManageTrustedExtensionsForAccountAction } from './actions/manageTrustedExtensionsForAccountAction.js';
import { ManageAccountPreferencesForExtensionAction } from './actions/manageAccountPreferencesForExtensionAction.js';
import { IAuthenticationUsageService } from '../../../services/authentication/browser/authenticationUsageService.js';

const codeExchangeProxyCommand = CommandsRegistry.registerCommand('workbench.getCodeExchangeProxyEndpoints', function (accessor, _) {
	const environmentService = accessor.get(IBrowserWorkbenchEnvironmentService);
	return environmentService.options?.codeExchangeProxyEndpoints;
});

const authenticationDefinitionSchema: IJSONSchema = {
	type: 'object',
	additionalProperties: false,
	properties: {
		id: {
			type: 'string',
			description: localize('authentication.id', 'The id of the authentication provider.')
		},
		label: {
			type: 'string',
			description: localize('authentication.label', 'The human readable name of the authentication provider.'),
		}
	}
};

const authenticationExtPoint = ExtensionsRegistry.registerExtensionPoint<AuthenticationProviderInformation[]>({
	extensionPoint: 'authentication',
	jsonSchema: {
		description: localize({ key: 'authenticationExtensionPoint', comment: [`'Contributes' means adds here`] }, 'Contributes authentication'),
		type: 'array',
		items: authenticationDefinitionSchema
	},
	activationEventsGenerator: (authenticationProviders, result) => {
		for (const authenticationProvider of authenticationProviders) {
			if (authenticationProvider.id) {
				result.push(`onAuthenticationRequest:${authenticationProvider.id}`);
			}
		}
	}
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
		];

		const rows: IRowData[][] = authentication
			.sort((a, b) => a.label.localeCompare(b.label))
			.map(auth => {
				return [
					auth.label,
					auth.id,
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

	private _placeholderMenuItem: IDisposable | undefined = MenuRegistry.appendMenuItem(MenuId.AccountsContext, {
		command: {
			id: 'noAuthenticationProviders',
			title: localize('authentication.Placeholder', "No accounts requested yet..."),
			precondition: ContextKeyExpr.false()
		},
	});

	constructor(@IAuthenticationService private readonly _authenticationService: IAuthenticationService) {
		super();
		this._register(codeExchangeProxyCommand);
		this._register(extensionFeature);

		// Clear the placeholder menu item if there are already providers registered.
		if (_authenticationService.getProviderIds().length) {
			this._clearPlaceholderMenuItem();
		}
		this._registerHandlers();
		this._registerAuthenticationExtentionPointHandler();
		this._registerActions();
	}

	private _registerAuthenticationExtentionPointHandler(): void {
		authenticationExtPoint.setHandler((extensions, { added, removed }) => {
			added.forEach(point => {
				for (const provider of point.value) {
					if (isFalsyOrWhitespace(provider.id)) {
						point.collector.error(localize('authentication.missingId', 'An authentication contribution must specify an id.'));
						continue;
					}

					if (isFalsyOrWhitespace(provider.label)) {
						point.collector.error(localize('authentication.missingLabel', 'An authentication contribution must specify a label.'));
						continue;
					}

					if (!this._authenticationService.declaredProviders.some(p => p.id === provider.id)) {
						this._authenticationService.registerDeclaredAuthenticationProvider(provider);
					} else {
						point.collector.error(localize('authentication.idConflict', "This authentication id '{0}' has already been registered", provider.id));
					}
				}
			});

			const removedExtPoints = removed.flatMap(r => r.value);
			removedExtPoints.forEach(point => {
				const provider = this._authenticationService.declaredProviders.find(provider => provider.id === point.id);
				if (provider) {
					this._authenticationService.unregisterDeclaredAuthenticationProvider(provider.id);
				}
			});
		});
	}

	private _registerHandlers(): void {
		this._register(this._authenticationService.onDidRegisterAuthenticationProvider(_e => {
			this._clearPlaceholderMenuItem();
		}));
		this._register(this._authenticationService.onDidUnregisterAuthenticationProvider(_e => {
			if (!this._authenticationService.getProviderIds().length) {
				this._placeholderMenuItem = MenuRegistry.appendMenuItem(MenuId.AccountsContext, {
					command: {
						id: 'noAuthenticationProviders',
						title: localize('loading', "Loading..."),
						precondition: ContextKeyExpr.false()
					}
				});
			}
		}));
	}

	private _registerActions(): void {
		this._register(registerAction2(SignOutOfAccountAction));
		this._register(registerAction2(ManageTrustedExtensionsForAccountAction));
		this._register(registerAction2(ManageAccountPreferencesForExtensionAction));
	}

	private _clearPlaceholderMenuItem(): void {
		this._placeholderMenuItem?.dispose();
		this._placeholderMenuItem = undefined;
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

registerWorkbenchContribution2(AuthenticationContribution.ID, AuthenticationContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(AuthenticationUsageContribution.ID, AuthenticationUsageContribution, WorkbenchPhase.Eventually);
