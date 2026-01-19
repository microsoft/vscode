/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../base/common/lifecycle.js';
import { ipcRenderer } from '../../../base/parts/sandbox/electron-browser/globals.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { InstantiationType, registerSingleton } from '../../instantiation/common/extensions.js';
import { getIsConnectionMetered, IMeteredConnectionService, METERED_CONNECTION_CHANGED_CHANNEL, METERED_CONNECTION_SETTING_KEY, NavigatorWithConnection } from '../common/meteredConnection.js';

/**
 * Electron-browser implementation of the metered connection service.
 * This implementation monitors navigator.connection and reports changes to the main process via IPC.
 */
export class NativeMeteredConnectionService extends Disposable implements IMeteredConnectionService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeIsConnectionMetered = this._register(new Emitter<boolean>());
	readonly onDidChangeIsConnectionMetered = this._onDidChangeIsConnectionMetered.event;

	private _isConnectionMetered = false;
	private _respectMeteredConnections = false;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super();

		const connection = (navigator as NavigatorWithConnection).connection;
		if (!connection) {
			return;
		}

		this._respectMeteredConnections = this.configurationService.getValue<boolean>(METERED_CONNECTION_SETTING_KEY);
		this._isConnectionMetered = getIsConnectionMetered();

		const onChange = () => {
			const value = getIsConnectionMetered();
			if (this._isConnectionMetered !== value) {
				this._isConnectionMetered = value;
				this.notifyMainProcess(value);
				if (this._respectMeteredConnections) {
					this._onDidChangeIsConnectionMetered.fire(this.isConnectionMetered);
				}
			}
		};

		connection.addEventListener('change', onChange);
		this._register(toDisposable(() => connection.removeEventListener('change', onChange)));

		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(METERED_CONNECTION_SETTING_KEY)) {
				const value = this.configurationService.getValue<boolean>(METERED_CONNECTION_SETTING_KEY);
				if (this._respectMeteredConnections !== value) {
					this._respectMeteredConnections = value;
					this._onDidChangeIsConnectionMetered.fire(this.isConnectionMetered);
				}
			}
		}));
	}

	get isConnectionMetered(): boolean {
		return this._respectMeteredConnections && this._isConnectionMetered;
	}

	private notifyMainProcess(isMetered: boolean): void {
		ipcRenderer.send(METERED_CONNECTION_CHANGED_CHANNEL, isMetered);
	}
}

registerSingleton(IMeteredConnectionService, NativeMeteredConnectionService, InstantiationType.Delayed);
