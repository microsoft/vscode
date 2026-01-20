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

	const effectiveType = connection.effectiveType;
	return effectiveType === '2g' || effectiveType === 'slow-2g';
}

/**
 * Abstract base class for metered connection services.
 */
export abstract class AbstractMeteredConnectionService extends Disposable implements IMeteredConnectionService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeIsConnectionMetered = this._register(new Emitter<boolean>());
	public readonly onDidChangeIsConnectionMetered = this._onDidChangeIsConnectionMetered.event;

	private _isConnectionMetered: boolean;
	private _connectionState: boolean;
	private _respectMeteredConnections: boolean;

	constructor(configurationService: IConfigurationService, connectionState: boolean) {
		super();

		this._connectionState = connectionState;
		this._respectMeteredConnections = configurationService.getValue<boolean>(METERED_CONNECTION_SETTING_KEY);
		this._isConnectionMetered = this._respectMeteredConnections && this._connectionState;

		this._register(configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(METERED_CONNECTION_SETTING_KEY)) {
				const value = configurationService.getValue<boolean>(METERED_CONNECTION_SETTING_KEY);
				if (value !== this._respectMeteredConnections) {
					this._respectMeteredConnections = value;
					this.onUpdated();
				}
			}
		}));
	}

	public get isConnectionMetered(): boolean {
		return this._isConnectionMetered;
	}

	protected get connectionState(): boolean {
		return this._connectionState;
	}

	public setConnectionState(value: boolean) {
		if (value !== this._connectionState) {
			this._connectionState = value;
			this.onChangeConnectionState();
		}
	}

	protected onChangeConnectionState() {
		this.onUpdated();
	}

	protected onUpdated() {
		const value = this._respectMeteredConnections && this._connectionState;
		if (value !== this._isConnectionMetered) {
			this._isConnectionMetered = value;
			this.onChangeIsConnectionMetered();
		}
	}

	protected onChangeIsConnectionMetered() {
		this._onDidChangeIsConnectionMetered.fire(this._isConnectionMetered);
	}
}
