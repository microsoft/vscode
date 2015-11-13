/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import errors = require('vs/base/common/errors');
import arrays = require('vs/base/common/arrays');
import {IPartService} from 'vs/workbench/services/part/common/partService';
import {IStorageService, StorageScope} from 'vs/platform/storage/common/storage';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {IKeybindingService} from 'vs/platform/keybinding/common/keybindingService';
import {IWorkspaceContextService}from 'vs/workbench/services/workspace/common/contextService';
import {IWindowService}from 'vs/workbench/services/window/electron-browser/windowService';

import win = require('vs/workbench/electron-browser/window');

import remote = require('remote');
import ipc = require('ipc');

export class ElectronIntegration {

	constructor(
		@IInstantiationService private instantiationService: IInstantiationService,
		@IWindowService private windowService: IWindowService,
		@IPartService private partService: IPartService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@ITelemetryService private telemetryService: ITelemetryService,
		@IKeybindingService private keybindingService: IKeybindingService,
		@IStorageService private storageService: IStorageService
	) {
	}

	public integrate(shellContainer: HTMLElement): void {

		// Register the active window
		let activeWindow = this.instantiationService.createInstance(win.ElectronWindow, remote.getCurrentWindow(), shellContainer);
		this.windowService.registerWindow(activeWindow);

		// Support runAction event
		ipc.on('vscode:runAction', (actionId: string) => {
			this.keybindingService.executeCommand(actionId, { from: 'menu' });
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
		ipc.on('vscode:changeTheme', (theme:string) => {
			this.storageService.store('workbench.theme', theme, StorageScope.GLOBAL);
		});
	}

	private resolveKeybindings(actionIds: string[]): TPromise<{ id: string; binding: number; }[]> {
		return this.partService.joinCreation().then(() => {
			return arrays.coalesce(actionIds.map((id) => {
				let bindings = this.keybindingService.lookupKeybindings(id);
				if (bindings.length) {
					return {
						id: id,
						binding: bindings[0].value	// take first user configured binding
					};
				}

				return null;
			}));
		});
	}
}