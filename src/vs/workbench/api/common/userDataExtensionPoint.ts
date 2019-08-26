/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { IJSONSchema } from 'vs/base/common/jsonSchema';
import { ExtensionMessageCollector, ExtensionsRegistry, IExtensionPoint, IExtensionPointUser } from 'vs/workbench/services/extensions/common/extensionsRegistry';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions, IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';
import { Registry } from 'vs/platform/registry/common/platform';
import { IUserIdentityService, IUserIdentity } from 'vs/workbench/services/userData/common/userData';

export interface IUserFriendlyUserIdentityDescriptor {
	id: string;
	title: string;
	iconText: string;
}

export const userIdentityContribution: IJSONSchema = {
	description: localize('vscode.extension.contributes.userIdentity', 'Contributes user identity to the editor'),
	type: 'object',
	properties: {
		id: {
			description: localize({ key: 'vscode.extension.contributes.user.identity.id', comment: ['Contribution refers to those that an extension contributes to VS Code through an extension/contribution point. '] }, "Unique id to identify the user user identity"),
			type: 'string',
			pattern: '^[a-zA-Z0-9_-]+$'
		},
		title: {
			description: localize('vscode.extension.contributes.views.containers.title', 'Human readable string used to render the user identity'),
			type: 'string'
		},
		iconText: {
			description: localize('vscode.extension.contributes.views.containers.icon', "Path to the user identity icon."),
			type: 'string'
		}
	}
};


const viewsContainersExtensionPoint: IExtensionPoint<IUserFriendlyUserIdentityDescriptor> = ExtensionsRegistry.registerExtensionPoint<IUserFriendlyUserIdentityDescriptor>({
	extensionPoint: 'userData',
	jsonSchema: userIdentityContribution
});

class UserIdentityExtensionHandler implements IWorkbenchContribution {

	constructor(
		@IUserIdentityService private readonly userIdentityService: IUserIdentityService
	) {
		this.handleAndRegisterUserIdentities();
	}

	private handleAndRegisterUserIdentities() {
		viewsContainersExtensionPoint.setHandler((extensions, { added, removed }) => {
			if (removed.length) {
				this.removeUserIdentities(removed);
			}
			if (added.length) {
				this.addUserIdentities(added);
			}
		});
	}

	private addUserIdentities(extensionPoints: readonly IExtensionPointUser<IUserFriendlyUserIdentityDescriptor>[]) {
		const userIdentities: IUserIdentity[] = [];
		for (let { value, collector } of extensionPoints) {
			if (!this.isValidUserIdentity(value, collector)) {
				return;
			}
			userIdentities.push({
				identity: value.id,
				title: value.title,
				iconText: `$(${value.iconText})`
			});
		}
		if (userIdentities.length) {
			this.userIdentityService.registerUserIdentities(userIdentities);
		}
	}

	private removeUserIdentities(extensionPoints: readonly IExtensionPointUser<IUserFriendlyUserIdentityDescriptor>[]) {
		const identities = extensionPoints.map(({ value }) => value.id);
		if (identities.length) {
			this.userIdentityService.deregisterUserIdentities(identities);
		}
	}


	private isValidUserIdentity(userIdentityDescriptor: IUserFriendlyUserIdentityDescriptor, collector: ExtensionMessageCollector): boolean {
		if (typeof userIdentityDescriptor.id !== 'string') {
			collector.error(localize('requireidstring', "property `{0}` is mandatory and must be of type `string`. Only alphanumeric characters, '_', and '-' are allowed.", 'id'));
			return false;
		}
		if (!(/^[a-z0-9_-]+$/i.test(userIdentityDescriptor.id))) {
			collector.error(localize('requireidstring', "property `{0}` is mandatory and must be of type `string`. Only alphanumeric characters, '_', and '-' are allowed.", 'id'));
			return false;
		}
		if (typeof userIdentityDescriptor.title !== 'string') {
			collector.error(localize('requirestring', "property `{0}` is mandatory and must be of type `string`", 'title'));
			return false;
		}
		if (typeof userIdentityDescriptor.iconText !== 'string') {
			collector.error(localize('requirestring', "property `{0}` is mandatory and must be of type `string`", 'icon'));
			return false;
		}
		return true;
	}

}

const workbenchRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
workbenchRegistry.registerWorkbenchContribution(UserIdentityExtensionHandler, LifecyclePhase.Starting);
