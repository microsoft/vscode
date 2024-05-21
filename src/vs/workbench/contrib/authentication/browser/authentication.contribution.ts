/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IJSONSchema } from 'vs/base/common/jsonSchema';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { isFalsyOrWhitespace } from 'vs/base/common/strings';
import { localize } from 'vs/nls';
import { MenuId, MenuRegistry, registerAction2 } from 'vs/platform/actions/common/actions';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { IExtensionManifest } from 'vs/platform/extensions/common/extensions';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { Registry } from 'vs/platform/registry/common/platform';
import { IWorkbenchContribution, WorkbenchPhase, registerWorkbenchContribution2 } from 'vs/workbench/common/contributions';
import { SignOutOfAccountAction } from 'vs/workbench/contrib/authentication/browser/actions/signOutOfAccountAction';
import { AuthenticationProviderInformation, IAuthenticationService } from 'vs/workbench/services/authentication/common/authentication';
import { IBrowserWorkbenchEnvironmentService } from 'vs/workbench/services/environment/browser/environmentService';
import { Extensions, IExtensionFeatureTableRenderer, IExtensionFeaturesRegistry, IRenderedData, IRowData, ITableData } from 'vs/workbench/services/extensionManagement/common/extensionFeatures';
import { ExtensionsRegistry } from 'vs/workbench/services/extensions/common/extensionsRegistry';
import { ManageTrustedExtensionsForAccountAction } from './actions/manageTrustedExtensionsForAccountAction';

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

export class AuthenticationContribution extends Disposable implements IWorkbenchContribution {
	static ID = 'workbench.contrib.authentication';

	private _placeholderMenuItem: IDisposable | undefined = MenuRegistry.appendMenuItem(MenuId.AccountsContext, {
		command: {
			id: 'noAuthenticationProviders',
			title: localize('authentication.Placeholder', "No accounts requested yet..."),
			precondition: ContextKeyExpr.false()
		},
	});

	constructor(
		@IAuthenticationService private readonly _authenticationService: IAuthenticationService,
		@IBrowserWorkbenchEnvironmentService private readonly _environmentService: IBrowserWorkbenchEnvironmentService
	) {
		super();
		this._register(codeExchangeProxyCommand);
		this._register(extensionFeature);

		// Clear the placeholder menu item if there are already providers registered.
		if (_authenticationService.getProviderIds().length) {
			this._clearPlaceholderMenuItem();
		}
		this._registerHandlers();
		this._registerAuthenticationExtentionPointHandler();
		this._registerEnvContributedAuthenticationProviders();
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

	private _registerEnvContributedAuthenticationProviders(): void {
		if (!this._environmentService.options?.authenticationProviders?.length) {
			return;
		}
		for (const provider of this._environmentService.options.authenticationProviders) {
			this._authenticationService.registerAuthenticationProvider(provider.id, provider);
		}
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
	}

	private _clearPlaceholderMenuItem(): void {
		this._placeholderMenuItem?.dispose();
		this._placeholderMenuItem = undefined;
	}
}

registerWorkbenchContribution2(AuthenticationContribution.ID, AuthenticationContribution, WorkbenchPhase.AfterRestored);
