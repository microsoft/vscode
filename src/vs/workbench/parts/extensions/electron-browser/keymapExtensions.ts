/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import arrays = require('vs/base/common/arrays');
import nls = require('vs/nls');
import { chain, any } from 'vs/base/common/event';
import { onUnexpectedError, canceled } from 'vs/base/common/errors';
import { TPromise } from 'vs/base/common/winjs.base';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IExtensionManagementService, ILocalExtension, IExtensionEnablementService, IExtensionTipsService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { IChoiceService } from 'vs/platform/message/common/message';
import Severity from 'vs/base/common/severity';
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';

interface IExtension {
	identifier: string;
	local: ILocalExtension;
}

export class KeymapExtensions implements IWorkbenchContribution {

	private disposables: IDisposable[] = [];

	constructor(
		@IExtensionManagementService private extensionService: IExtensionManagementService,
		@IExtensionEnablementService private extensionEnablementService: IExtensionEnablementService,
		@IExtensionTipsService private tipsService: IExtensionTipsService,
		@IChoiceService private choiceService: IChoiceService,
		@ILifecycleService lifecycleService: ILifecycleService,
		@ITelemetryService private telemetryService: ITelemetryService,
	) {
		this.disposables.push(
			lifecycleService.onShutdown(() => this.dispose()),
			any(
				chain(extensionService.onDidInstallExtension)
					.map(e => stripVersion(e.id))
					.event,
				extensionEnablementService.onEnablementChanged
			)((id => {
				this.checkForOtherKeymaps(id)
					.then(null, onUnexpectedError);
			}))
		);
	}

	getId(): string {
		return 'vs.extensions.keymapExtensions';
	}

	private checkForOtherKeymaps(extensionId: string): TPromise<void> {
		return this.extensionService.getInstalled().then(extensions => {
			const installedExtensions = extensions.map(ext => ({ identifier: stripVersion(ext.id), local: ext }));
			const extension = arrays.first(installedExtensions, ext => ext.identifier === extensionId);
			const globallyDisabled = this.extensionEnablementService.getGloballyDisabledExtensions();
			if (extension && this.isKeymapExtension(extension) && globallyDisabled.indexOf(extensionId) === -1) {
				const otherKeymaps = installedExtensions.filter(ext => ext.identifier !== extensionId &&
					this.isKeymapExtension(ext) &&
					globallyDisabled.indexOf(ext.identifier) === -1);
				if (otherKeymaps.length) {
					return this.promptForDisablingOtherKeymaps(extension, otherKeymaps);
				}
			}
			return undefined;
		});
	}

	private isKeymapExtension(extension: IExtension): boolean {
		const cats = extension.local.manifest.categories;
		return cats && cats.indexOf('Keymaps') !== -1 || this.tipsService.getKeymapRecommendations().indexOf(extension.identifier) !== -1;
	}

	private promptForDisablingOtherKeymaps(newKeymap: IExtension, oldKeymaps: IExtension[]): TPromise<void> {
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

function stripVersion(id: string): string {
	return id.replace(/-\d+\.\d+\.\d+$/, '');
}
