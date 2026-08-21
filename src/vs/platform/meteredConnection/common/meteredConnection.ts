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
	 * Always returns `false` if the `network.meteredConnection` setting is `off`.
	 * Always returns `true` if the `network.meteredConnection` setting is `on`.
	 * Implementations may conservatively return `true` until {@link whenInitialized} resolves.
	 */
	readonly isConnectionMetered: boolean;

	/**
	 * Resolves once the initial connection state is available.
	 */
	readonly whenInitialized: Promise<void>;

	/**
	 * Event that fires when the metered connection status changes.
	 */
	readonly onDidChangeIsConnectionMetered: Event<boolean>;
}

export const METERED_CONNECTION_SETTING_KEY = 'network.meteredConnection';
export type MeteredConnectionSettingValue = 'on' | 'off' | 'auto';

/**
 * Abstract base class for metered connection services.
 */
export abstract class AbstractMeteredConnectionService extends Disposable implements IMeteredConnectionService {
	declare readonly _serviceBrand: undefined;

	public readonly whenInitialized = Promise.resolve();

	private readonly _onDidChangeIsConnectionMetered = this._register(new Emitter<boolean>());
	public readonly onDidChangeIsConnectionMetered = this._onDidChangeIsConnectionMetered.event;

	private _isConnectionMetered: boolean;
	private _isUnderlyingConnectionMetered: boolean;
	private _meteredConnectionSetting: MeteredConnectionSettingValue;

	constructor(configurationService: IConfigurationService, isUnderlyingConnectionMetered: boolean) {
		super();

		this._isUnderlyingConnectionMetered = isUnderlyingConnectionMetered;
		this._meteredConnectionSetting = configurationService.getValue<MeteredConnectionSettingValue>(METERED_CONNECTION_SETTING_KEY);
		this._isConnectionMetered = this._meteredConnectionSetting === 'on' || (this._meteredConnectionSetting !== 'off' && this._isUnderlyingConnectionMetered);

		this._register(configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(METERED_CONNECTION_SETTING_KEY)) {
				const value = configurationService.getValue<MeteredConnectionSettingValue>(METERED_CONNECTION_SETTING_KEY);
				if (value !== this._meteredConnectionSetting) {
					this._meteredConnectionSetting = value;
					this.onUpdated();
				}
			}
		}));
	}

	public get isConnectionMetered(): boolean {
		return this._isConnectionMetered;
	}

	protected get isUnderlyingConnectionMetered(): boolean {
		return this._isUnderlyingConnectionMetered;
	}

	protected setIsUnderlyingConnectionMetered(value: boolean) {
		if (value !== this._isUnderlyingConnectionMetered) {
			this._isUnderlyingConnectionMetered = value;
			this.onChangeUnderlyingConnection();
		}
	}

	protected onChangeUnderlyingConnection() {
		this.onUpdated();
	}

	protected onUpdated() {
		const value = this._meteredConnectionSetting === 'on' || (this._meteredConnectionSetting !== 'off' && this._isUnderlyingConnectionMetered);
		if (value !== this._isConnectionMetered) {
			this._isConnectionMetered = value;
			this.onChangeIsConnectionMetered();
		}
	}

	protected onChangeIsConnectionMetered() {
		this._onDidChangeIsConnectionMetered.fire(this._isConnectionMetered);
	}
}
