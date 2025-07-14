/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { Event } from '../../../../base/common/event.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IExtensionManagementService, ILocalExtension, IExtensionIdentifier, InstallOperation } from '../../../../platform/extensionManagement/common/extensionManagement.js';
import { IWorkbenchExtensionEnablementService, EnablementState } from '../../../services/extensionManagement/common/extensionManagement.js';
import { IExtensionRecommendationsService } from '../../../services/extensionRecommendations/common/extensionRecommendations.js';
import { ILifecycleService } from '../../../services/lifecycle/common/lifecycle.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { ServicesAccessor, IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { areSameExtensions } from '../../../../platform/extensionManagement/common/extensionManagementUtil.js';
import { Severity, INotificationService } from '../../../../platform/notification/common/notification.js';

export interface IExtensionStatus {
	identifier: IExtensionIdentifier;
	local: ILocalExtension;
	globallyEnabled: boolean;
}

export class KeymapExtensions extends Disposable implements IWorkbenchContribution {

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IWorkbenchExtensionEnablementService private readonly extensionEnablementService: IWorkbenchExtensionEnablementService,
		@IExtensionRecommendationsService private readonly tipsService: IExtensionRecommendationsService,
		@ILifecycleService lifecycleService: ILifecycleService,
		@INotificationService private readonly notificationService: INotificationService,
	) {
		super();
		this._register(lifecycleService.onDidShutdown(() => this.dispose()));
		this._register(instantiationService.invokeFunction(onExtensionChanged)((identifiers => {
			Promise.all(identifiers.map(identifier => this.checkForOtherKeymaps(identifier)))
				.then(undefined, onUnexpectedError);
		})));
	}

	private checkForOtherKeymaps(extensionIdentifier: IExtensionIdentifier): Promise<void> {
		return this.instantiationService.invokeFunction(getInstalledExtensions).then(extensions => {
			const keymaps = extensions.filter(extension => isKeymapExtension(this.tipsService, extension));
			const extension = keymaps.find(extension => areSameExtensions(extension.identifier, extensionIdentifier));
			if (extension && extension.globallyEnabled) {
				const otherKeymaps = keymaps.filter(extension => !areSameExtensions(extension.identifier, extensionIdentifier) && extension.globallyEnabled);
				if (otherKeymaps.length) {
					return this.promptForDisablingOtherKeymaps(extension, otherKeymaps);
				}
			}
			return undefined;
		});
	}

	private promptForDisablingOtherKeymaps(newKeymap: IExtensionStatus, oldKeymaps: IExtensionStatus[]): void {
		const onPrompt = (confirmed: boolean) => {
			if (confirmed) {
				this.extensionEnablementService.setEnablement(oldKeymaps.map(keymap => keymap.local), EnablementState.DisabledGlobally);
			}
		};

		this.notificationService.prompt(Severity.Info, localize('disableOtherKeymapsConfirmation', "Disable other keymaps ({0}) to avoid conflicts between keybindings?", oldKeymaps.map(k => `'${k.local.manifest.displayName}'`).join(', ')),
			[{
				label: localize('yes', "Yes"),
				run: () => onPrompt(true)
			}, {
				label: localize('no', "No"),
				run: () => onPrompt(false)
			}]
		);
	}
}

function onExtensionChanged(accessor: ServicesAccessor): Event<IExtensionIdentifier[]> {
	const extensionService = accessor.get(IExtensionManagementService);
	const extensionEnablementService = accessor.get(IWorkbenchExtensionEnablementService);
	const onDidInstallExtensions = Event.chain(extensionService.onDidInstallExtensions, $ =>
		$.filter(e => e.some(({ operation }) => operation === InstallOperation.Install))
			.map(e => e.map(({ identifier }) => identifier))
	);
	return Event.debounce<IExtensionIdentifier[], IExtensionIdentifier[]>(Event.any(
		Event.any(onDidInstallExtensions, Event.map(extensionService.onDidUninstallExtension, e => [e.identifier])),
		Event.map(extensionEnablementService.onEnablementChanged, extensions => extensions.map(e => e.identifier))
	), (result: IExtensionIdentifier[] | undefined, identifiers: IExtensionIdentifier[]) => {
		result = result || [];
		for (const identifier of identifiers) {
			if (result.some(l => !areSameExtensions(l, identifier))) {
				result.push(identifier);
			}
		}
		return result;
	});
}

export async function getInstalledExtensions(accessor: ServicesAccessor): Promise<IExtensionStatus[]> {
	const extensionService = accessor.get(IExtensionManagementService);
	const extensionEnablementService = accessor.get(IWorkbenchExtensionEnablementService);
	const extensions = await extensionService.getInstalled();
	return extensions.map(extension => {
		return {
			identifier: extension.identifier,
			local: extension,
			globallyEnabled: extensionEnablementService.isEnabled(extension)
		};
	});
}

function isKeymapExtension(tipsService: IExtensionRecommendationsService, extension: IExtensionStatus): boolean {
	const cats = extension.local.manifest.categories;
	return cats && cats.indexOf('Keymaps') !== -1 || tipsService.getKeymapRecommendations().some(extensionId => areSameExtensions({ id: extensionId }, extension.local.identifier));
}
