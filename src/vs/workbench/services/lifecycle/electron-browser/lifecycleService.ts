/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import errors = require('vs/base/common/errors');
import {IMessageService} from 'vs/platform/message/common/message';
import {BaseLifecycleService} from 'vs/platform/lifecycle/common/baseLifecycleService';
import {IWindowService} from 'vs/workbench/services/window/electron-browser/windowService';
import severity from 'vs/base/common/severity';

import {ipcRenderer as ipc} from 'electron';

export class LifecycleService extends BaseLifecycleService {

	constructor(
		private messageService: IMessageService,
		private windowService: IWindowService
	) {
		super();

		this.registerListeners();
	}

	private registerListeners(): void {
		let windowId = this.windowService.getWindowId();

		// Main side indicates that window is about to unload, check for vetos
		ipc.on('vscode:beforeUnload', (event, reply: { okChannel: string, cancelChannel: string }) => {
			let veto = this.beforeUnload();

			if (typeof veto === 'boolean') {
				ipc.send(veto ? reply.cancelChannel : reply.okChannel, windowId);
			}

			else {
				veto.done(v => ipc.send(v ? reply.cancelChannel : reply.okChannel, windowId));
			}
		});
	}

	private beforeUnload(): boolean|TPromise<boolean> {
		let veto = this.vetoShutdown();

		if (typeof veto === 'boolean') {
			return this.handleVeto(veto);
		}

		else {
			return veto.then(v => this.handleVeto(v));
		}
	}

	private handleVeto(veto: boolean): boolean {
		if (!veto) {
			try {
				this.fireShutdown();
			} catch (error) {
				errors.onUnexpectedError(error); // unexpected program error and we cause shutdown to cancel in this case

				return false;
			}
		}

		return veto;
	}

	private vetoShutdown(): boolean|TPromise<boolean> {
		let participants = this.beforeShutdownParticipants;
		let vetoPromises: TPromise<void>[] = [];
		let hasPromiseWithVeto = false;

		for (let i = 0; i < participants.length; i++) {
			let participantVeto = participants[i].beforeShutdown();
			if (participantVeto === true) {
				return true; // return directly when any veto was provided
			}

			else if (participantVeto === false) {
				continue; // skip
			}

			// We have a promise
			let vetoPromise = (<TPromise<boolean>>participantVeto).then(veto => {
				if (veto) {
					hasPromiseWithVeto = true;
				}
			}, (error) => {
				hasPromiseWithVeto = true;
				this.messageService.show(severity.Error, errors.toErrorMessage(error));
			});

			vetoPromises.push(vetoPromise);
		}

		if (vetoPromises.length === 0) {
			return false; // return directly when no veto was provided
		}

		return TPromise.join(vetoPromises).then(() => hasPromiseWithVeto);
	}
}