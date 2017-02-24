/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as arrays from 'vs/base/common/arrays';
import * as nls from 'vs/nls';
import Event, { chain, any, debounceEvent } from 'vs/base/common/event';
import { onUnexpectedError, canceled } from 'vs/base/common/errors';
import { TPromise } from 'vs/base/common/winjs.base';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IExtensionManagementService, ILocalExtension, IExtensionEnablementService, IExtensionTipsService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { IChoiceService } from 'vs/platform/message/common/message';
import Severity from 'vs/base/common/severity';
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { ServicesAccessor, IInstantiationService } from 'vs/platform/instantiation/common/instantiation';

export interface IKeymapExtension {
	identifier: string;
	local: ILocalExtension;
	globallyEnabled: boolean;
}

export class KeymapExtensions implements IWorkbenchContribution {

	private disposables: IDisposable[] = [];

	constructor(
		@IInstantiationService private instantiationService: IInstantiationService,
		@IExtensionEnablementService private extensionEnablementService: IExtensionEnablementService,
		@IChoiceService private choiceService: IChoiceService,
		@ILifecycleService lifecycleService: ILifecycleService,
		@ITelemetryService private telemetryService: ITelemetryService,
	) {
		this.disposables.push(
			lifecycleService.onShutdown(() => this.dispose()),
			instantiationService.invokeFunction(onKeymapExtensionChanged)((ids => {
				TPromise.join(ids.map(id => this.checkForOtherKeymaps(id)))
					.then(null, onUnexpectedError);
			}))
		);
	}

	getId(): string {
		return 'vs.extensions.keymapExtensions';
	}

	private checkForOtherKeymaps(extensionId: string): TPromise<void> {
		return this.instantiationService.invokeFunction(getInstalledKeymaps).then(extensions => {
			const extension = arrays.first(extensions, extension => extension.identifier === extensionId);
			if (extension && extension.globallyEnabled) {
				const otherKeymaps = extensions.filter(extension => extension.identifier !== extensionId && extension.globallyEnabled);
				if (otherKeymaps.length) {
					return this.promptForDisablingOtherKeymaps(extension, otherKeymaps);
				}
			}
			return undefined;
		});
	}

	private promptForDisablingOtherKeymaps(newKeymap: IKeymapExtension, oldKeymaps: IKeymapExtension[]): TPromise<void> {
		const telemetryData: { [key: string]: any; } = {
			newKeymap: newKeymap.identifier,
			oldKeymaps: oldKeymaps.map(k => k.identifier)
		};
		this.telemetryService.publicLog('disableOtherKeymapsConfirmation', telemetryData);
		const message = nls.localize('disableOtherKeymapsConfirmation', "Disable other keymaps to avoid conflicts between keybindings?");
		const options = [
			nls.localize('yes', "Yes"),
			nls.localize('no', "No")
		];
		return this.choiceService.choose(Severity.Info, message, options, false)
			.then<void>(value => {
				const confirmed = value === 0;
				telemetryData['confirmed'] = confirmed;
				this.telemetryService.publicLog('disableOtherKeymaps', telemetryData);
				if (confirmed) {
					return TPromise.join(oldKeymaps.map(keymap => {
						return this.extensionEnablementService.setEnablement(keymap.identifier, false);
					}));
				}
				return undefined;
			}, error => TPromise.wrapError(canceled()));
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
	}
}

export function onKeymapExtensionChanged(accessor: ServicesAccessor): Event<string[]> {
	const extensionService = accessor.get(IExtensionManagementService);
	const extensionEnablementService = accessor.get(IExtensionEnablementService);
	return debounceEvent<string, string[]>(any(
		chain(any(extensionService.onDidInstallExtension, extensionService.onDidUninstallExtension))
			.map(e => stripVersion(e.id))
			.event,
		extensionEnablementService.onEnablementChanged
	), (list, id) => {
		if (!list) {
			return [id];
		} else if (list.indexOf(id) === -1) {
			list.push(id);
		}
		return list;
	});
}

export function getInstalledKeymaps(accessor: ServicesAccessor): TPromise<IKeymapExtension[]> {
	const extensionService = accessor.get(IExtensionManagementService);
	const extensionEnablementService = accessor.get(IExtensionEnablementService);
	const tipsService = accessor.get(IExtensionTipsService);
	return extensionService.getInstalled().then(extensions => {
		const globallyDisabled = extensionEnablementService.getGloballyDisabledExtensions();
		const installedExtensions = extensions.map(extension => {
			const identifier = stripVersion(extension.id);
			return {
				identifier,
				local: extension,
				globallyEnabled: globallyDisabled.indexOf(identifier) === -1
			};
		});
		return installedExtensions.filter(extension => isKeymapExtension(tipsService, extension));
	});
}

function isKeymapExtension(tipsService: IExtensionTipsService, extension: IKeymapExtension): boolean {
	const cats = extension.local.manifest.categories;
	return cats && cats.indexOf('Keymaps') !== -1 || tipsService.getKeymapRecommendations().indexOf(extension.identifier) !== -1;
}

function stripVersion(id: string): string {
	return id.replace(/-\d+\.\d+\.\d+$/, '');
}
