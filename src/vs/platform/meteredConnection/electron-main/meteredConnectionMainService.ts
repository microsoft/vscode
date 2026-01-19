/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { IMeteredConnectionService, METERED_CONNECTION_SETTING_KEY } from '../common/meteredConnection.js';

/**
 * Electron-main implementation of the metered connection service.
 * This implementation receives metered connection updates via IPC from the renderer process.
 */
export class MeteredConnectionMainService extends Disposable implements IMeteredConnectionService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeIsConnectionMetered = this._register(new Emitter<boolean>());
	readonly onDidChangeIsConnectionMetered = this._onDidChangeIsConnectionMetered.event;

	private _isConnectionMetered: boolean = false;
	private _respectMeteredConnections: boolean = true;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super();

		this._respectMeteredConnections = this.configurationService.getValue<boolean>(METERED_CONNECTION_SETTING_KEY) ?? true;

		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(METERED_CONNECTION_SETTING_KEY)) {
				const value = this.configurationService.getValue<boolean>(METERED_CONNECTION_SETTING_KEY) ?? true;
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

	/**
	 * Called by the IPC handler when the renderer process reports a change in metered connection status.
	 */
	updateIsConnectionMetered(isMetered: boolean): void {
		if (this._isConnectionMetered !== isMetered) {
			this._isConnectionMetered = isMetered;
			if (this._respectMeteredConnections) {
				this._onDidChangeIsConnectionMetered.fire(this.isConnectionMetered);
			}
		}
	}
}
