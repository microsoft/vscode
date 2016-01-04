/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import nls = require('vs/nls');
import {TPromise} from 'vs/base/common/winjs.base';
import errors = require('vs/base/common/errors');
import arrays = require('vs/base/common/arrays');
import Severity from 'vs/base/common/severity';
import {OpenGlobalSettingsAction} from 'vs/workbench/browser/actions/openSettings';
import {IPartService} from 'vs/workbench/services/part/common/partService';
import {IStorageService, StorageScope} from 'vs/platform/storage/common/storage';
import {IMessageService, CloseAction} from 'vs/platform/message/common/message';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {IKeybindingService} from 'vs/platform/keybinding/common/keybindingService';
import {IWorkspaceContextService}from 'vs/workbench/services/workspace/common/contextService';
import {IWindowService}from 'vs/workbench/services/window/electron-browser/windowService';
import {IWindowConfiguration} from 'vs/workbench/electron-browser/window';
import {IConfigurationService, IConfigurationServiceEvent, ConfigurationServiceEventTypes} from 'vs/platform/configuration/common/configuration';

import win = require('vs/workbench/electron-browser/window');

import remote = require('remote');
import ipc = require('ipc');
import webFrame = require('web-frame');

export class ElectronIntegration {

	constructor(
		@IInstantiationService private instantiationService: IInstantiationService,
		@IWindowService private windowService: IWindowService,
		@IPartService private partService: IPartService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@ITelemetryService private telemetryService: ITelemetryService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IKeybindingService private keybindingService: IKeybindingService,
		@IStorageService private storageService: IStorageService,
		@IMessageService private messageService: IMessageService
	) {
	}

	public integrate(shellContainer: HTMLElement): void {

		// Register the active window
		let activeWindow = this.instantiationService.createInstance(win.ElectronWindow, remote.getCurrentWindow(), shellContainer);
		this.windowService.registerWindow(activeWindow);

		// Support runAction event
		ipc.on('vscode:runAction', (actionId: string) => {
			this.keybindingService.executeCommand(actionId, { from: 'menu' }).done(undefined, err => this.messageService.show(Severity.Error, err));
		});

		// Support options change
		ipc.on('vscode:optionsChange', (options: string) => {
			let optionsData = JSON.parse(options);
			for (let key in optionsData) {
				if (optionsData.hasOwnProperty(key)) {
					let value = optionsData[key];
					this.contextService.updateOptions(key, value);
				}
			}
		});

		// Support resolve keybindings event
		ipc.on('vscode:resolveKeybindings', (rawActionIds: string) => {
			let actionIds: string[] = [];
			try {
				actionIds = JSON.parse(rawActionIds);
			} catch (error) {
				// should not happen
			}

			// Resolve keys using the keybinding service and send back to browser process
			this.resolveKeybindings(actionIds).done((keybindings) => {
				if (keybindings.length) {
					ipc.send('vscode:keybindingsResolved', JSON.stringify(keybindings));
				}
			}, () => errors.onUnexpectedError);
		});

		ipc.on('vscode:telemetry', ({ eventName, data }) => {
			this.telemetryService.publicLog(eventName, data);
		});

		ipc.on('vscode:reportError', (error) => {
			if (error) {
				let errorParsed = JSON.parse(error);
				errorParsed.mainProcess = true;
				errors.onUnexpectedError(errorParsed);
			}
		});

		// Emit event when vscode has loaded
		this.partService.joinCreation().then(() => {
			ipc.send('vscode:workbenchLoaded', this.windowService.getWindowId());
		});

		// Theme changes
		ipc.on('vscode:changeTheme', (theme: string) => {
			this.storageService.store('workbench.theme', theme, StorageScope.GLOBAL);
		});

		// Configuration changes
		let previousConfiguredZoomLevel: number;
		this.configurationService.addListener(ConfigurationServiceEventTypes.UPDATED, (e: IConfigurationServiceEvent) => {
			let windowConfig: IWindowConfiguration = e.config;

			let newZoomLevel = 0;
			if (windowConfig.window && typeof windowConfig.window.zoomLevel === 'number') {
				newZoomLevel = windowConfig.window.zoomLevel;

				// Leave early if the configured zoom level did not change (https://github.com/Microsoft/vscode/issues/1536)
				if (previousConfiguredZoomLevel === newZoomLevel) {
					return;
				}

				previousConfiguredZoomLevel = newZoomLevel;
			}

			if (webFrame.getZoomLevel() !== newZoomLevel) {
				webFrame.setZoomLevel(newZoomLevel);
			}
		});

		// Auto Save Info (TODO@Ben remove me in a couple of versions)
		ipc.on('vscode:showAutoSaveInfo', () => {
			this.messageService.show(
				Severity.Info, {
					message: nls.localize('autoSaveInfo', "The **File | Auto Save** option moved into settings. Please configure **files.autoSaveDelay: 1** to restore the old behavior."),
					actions: [
						CloseAction,
						this.instantiationService.createInstance(OpenGlobalSettingsAction, OpenGlobalSettingsAction.ID, OpenGlobalSettingsAction.LABEL)
					]
			});
		});
	}

	private resolveKeybindings(actionIds: string[]): TPromise<{ id: string; binding: number; }[]> {
		return this.partService.joinCreation().then(() => {
			return arrays.coalesce(actionIds.map((id) => {
				let bindings = this.keybindingService.lookupKeybindings(id);

				// return the first binding that can be represented by electron
				for (let i = 0; i < bindings.length; i++) {
					let binding = bindings[i];
					let electronAccelerator = this.keybindingService.getElectronAcceleratorFor(binding);
					if (electronAccelerator) {
						return {
							id: id,
							binding: binding.value
						};
					}
				}

				return null;
			}));
		});
	}
}