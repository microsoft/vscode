/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { onUnexpectedError } from 'vs/base/common/errors';
import { Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { localize } from 'vs/nls';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { INotificationService, Severity } from 'vs/platform/notification/common/notification';
import { getInstalledExtensions, IExtensionStatus } from 'vs/workbench/contrib/extensions/common/extensionsUtils';
import { INotebookKeymapService } from 'vs/workbench/contrib/notebook/common/notebookKeymapService';
import { EnablementState, IWorkbenchExtensionEnablementService } from 'vs/workbench/services/extensionManagement/common/extensionManagement';
import { ILifecycleService } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { IExtensionIdentifier, IExtensionManagementService, InstallOperation } from 'vs/platform/extensionManagement/common/extensionManagement';
import { areSameExtensions } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { Memento, MementoObject } from 'vs/workbench/common/memento';
import { distinct } from 'vs/base/common/arrays';

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
		result = result || (identifiers.length ? [identifiers[0]] : []);
		for (const identifier of identifiers) {
			if (result.some(l => !areSameExtensions(l, identifier))) {
				result.push(identifier);
			}
		}

		return result;
	});
}

const hasRecommendedKeymapKey = 'hasRecommendedKeymap';

export class NotebookKeymapService extends Disposable implements INotebookKeymapService {
	_serviceBrand: undefined;

	private notebookKeymapMemento: Memento;
	private notebookKeymap: MementoObject;

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IWorkbenchExtensionEnablementService private readonly extensionEnablementService: IWorkbenchExtensionEnablementService,
		@INotificationService private readonly notificationService: INotificationService,
		@IStorageService storageService: IStorageService,
		@ILifecycleService lifecycleService: ILifecycleService,
	) {
		super();

		this.notebookKeymapMemento = new Memento('notebookKeymap', storageService);
		this.notebookKeymap = this.notebookKeymapMemento.getMemento(StorageScope.PROFILE, StorageTarget.USER);

		this._register(lifecycleService.onDidShutdown(() => this.dispose()));
		this._register(this.instantiationService.invokeFunction(onExtensionChanged)((identifiers => {
			Promise.all(identifiers.map(identifier => this.checkForOtherKeymaps(identifier)))
				.then(undefined, onUnexpectedError);
		})));
	}

	private checkForOtherKeymaps(extensionIdentifier: IExtensionIdentifier): Promise<void> {
		return this.instantiationService.invokeFunction(getInstalledExtensions).then(extensions => {
			const keymaps = extensions.filter(extension => isNotebookKeymapExtension(extension));
			const extension = keymaps.find(extension => areSameExtensions(extension.identifier, extensionIdentifier));
			if (extension && extension.globallyEnabled) {
				// there is already a keymap extension
				this.notebookKeymap[hasRecommendedKeymapKey] = true;
				this.notebookKeymapMemento.saveMemento();
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

		this.notificationService.prompt(Severity.Info, localize('disableOtherKeymapsConfirmation', "Disable other keymaps ({0}) to avoid conflicts between keybindings?", distinct(oldKeymaps.map(k => k.local.manifest.displayName)).map(name => `'${name}'`).join(', ')),
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

export function isNotebookKeymapExtension(extension: IExtensionStatus): boolean {
	if (extension.local.manifest.extensionPack) {
		return false;
	}

	const keywords = extension.local.manifest.keywords;
	if (!keywords) {
		return false;
	}

	return keywords.indexOf('notebook-keymap') !== -1;
}
