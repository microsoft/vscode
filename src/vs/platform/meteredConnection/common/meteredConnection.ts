/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';

export const IMeteredConnectionService = createDecorator<IMeteredConnectionService>('meteredConnectionService');

/**
 * Service to report on metered connection status.
 */
export interface IMeteredConnectionService {
	readonly _serviceBrand: undefined;

	/**
	 * Whether the current network connection is metered.
	 * Always returns `false` if the `update.respectMeteredConnections` setting is disabled.
	 */
	readonly isConnectionMetered: boolean;

	/**
	 * Event that fires when the metered connection status changes.
	 */
	readonly onDidChangeIsConnectionMetered: Event<boolean>;
}

export const METERED_CONNECTION_SETTING_KEY = 'update.respectMeteredConnections';
export const METERED_CONNECTION_CHANGED_CHANNEL = 'vscode:meteredConnectionChanged';

/**
 * Network Information API
 * See https://developer.mozilla.org/en-US/docs/Web/API/Network_Information_API
 */
export interface NetworkInformation {
	saveData?: boolean;
	metered?: boolean;
	effectiveType?: 'slow-2g' | '2g' | '3g' | '4g';
	addEventListener(type: 'change', listener: () => void): void;
	removeEventListener(type: 'change', listener: () => void): void;
}

/**
 * Extended Navigator interface for Network Information API
 */
export interface NavigatorWithConnection {
	readonly connection?: NetworkInformation;
}

/**
 * Check if the current network connection is metered according to the Network Information API.
 */
export function getIsConnectionMetered() {
	const connection = (navigator as NavigatorWithConnection).connection;
	if (!connection) {
		return false;
	}

	if (connection.saveData || connection.metered) {
		return true;
	}

	//const effectiveType = connection.effectiveType;
	return true; // effectiveType === '2g' || effectiveType === 'slow-2g';
}

/**
 * Abstract base class for metered connection services.
 */
export class AbstractMeteredConnectionService extends Disposable implements IMeteredConnectionService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeIsConnectionMetered = this._register(new Emitter<boolean>());
	public readonly onDidChangeIsConnectionMetered = this._onDidChangeIsConnectionMetered.event;

	private _isConnectionMetered = false;
	private _respectMeteredConnections: boolean;

	constructor(private readonly configurationService: IConfigurationService) {
		super();

		this._respectMeteredConnections = this.configurationService.getValue<boolean>(METERED_CONNECTION_SETTING_KEY);

		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(METERED_CONNECTION_SETTING_KEY)) {
				const value = this.configurationService.getValue<boolean>(METERED_CONNECTION_SETTING_KEY);
				if (this._respectMeteredConnections !== value) {
					const oldValue = this.isConnectionMetered;
					this._respectMeteredConnections = value;
					if (oldValue !== this.isConnectionMetered) {
						this._onDidChangeIsConnectionMetered.fire(this.isConnectionMetered);
					}
				}
			}
		}));
	}

	public get isConnectionMetered(): boolean {
		return this._respectMeteredConnections && this._isConnectionMetered;
	}

	public setIsConnectionMetered(isMetered: boolean): void {
		if (this._isConnectionMetered !== isMetered) {
			const oldValue = this.isConnectionMetered;
			this._isConnectionMetered = isMetered;
			if (oldValue !== this.isConnectionMetered) {
				this._onDidChangeIsConnectionMetered.fire(this.isConnectionMetered);
			}
		}
	}
}
