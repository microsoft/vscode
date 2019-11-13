/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { Event, Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { RawContextKey, IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IConfigurationService, ConfigurationTarget } from 'vs/platform/configuration/common/configuration';
import { IFilesConfiguration, AutoSaveConfiguration } from 'vs/platform/files/common/files';
import { isUndefinedOrNull } from 'vs/base/common/types';

export const AutoSaveContext = new RawContextKey<string>('config.files.autoSave', undefined);

export interface IAutoSaveConfiguration {
	autoSaveDelay?: number;
	autoSaveFocusChange: boolean;
	autoSaveApplicationChange: boolean;
}

export const enum AutoSaveMode {
	OFF,
	AFTER_SHORT_DELAY,
	AFTER_LONG_DELAY,
	ON_FOCUS_CHANGE,
	ON_WINDOW_CHANGE
}

export const IAutoSaveConfigurationService = createDecorator<IAutoSaveConfigurationService>('autoSaveConfigurationService');

export interface IAutoSaveConfigurationService {

	_serviceBrand: undefined;

	readonly onAutoSaveConfigurationChange: Event<IAutoSaveConfiguration>;

	getAutoSaveMode(): AutoSaveMode;

	getAutoSaveConfiguration(): IAutoSaveConfiguration;

	toggleAutoSave(): Promise<void>;
}

export class AutoSaveConfigurationService extends Disposable implements IAutoSaveConfigurationService {

	_serviceBrand: undefined;

	private readonly _onAutoSaveConfigurationChange = this._register(new Emitter<IAutoSaveConfiguration>());
	readonly onAutoSaveConfigurationChange = this._onAutoSaveConfigurationChange.event;

	private configuredAutoSaveDelay?: number;
	private configuredAutoSaveOnFocusChange: boolean | undefined;
	private configuredAutoSaveOnWindowChange: boolean | undefined;

	private autoSaveContext: IContextKey<string>;

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		super();

		this.autoSaveContext = AutoSaveContext.bindTo(contextKeyService);

		const configuration = configurationService.getValue<IFilesConfiguration>();
		this.onFilesConfigurationChange(configuration);

		this.registerListeners();
	}

	private registerListeners(): void {

		// Files configuration changes
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('files')) {
				this.onFilesConfigurationChange(this.configurationService.getValue<IFilesConfiguration>());
			}
		}));
	}

	private onFilesConfigurationChange(configuration: IFilesConfiguration): void {
		const autoSaveMode = configuration?.files?.autoSave || AutoSaveConfiguration.OFF;
		this.autoSaveContext.set(autoSaveMode);
		switch (autoSaveMode) {
			case AutoSaveConfiguration.AFTER_DELAY:
				this.configuredAutoSaveDelay = configuration?.files?.autoSaveDelay;
				this.configuredAutoSaveOnFocusChange = false;
				this.configuredAutoSaveOnWindowChange = false;
				break;

			case AutoSaveConfiguration.ON_FOCUS_CHANGE:
				this.configuredAutoSaveDelay = undefined;
				this.configuredAutoSaveOnFocusChange = true;
				this.configuredAutoSaveOnWindowChange = false;
				break;

			case AutoSaveConfiguration.ON_WINDOW_CHANGE:
				this.configuredAutoSaveDelay = undefined;
				this.configuredAutoSaveOnFocusChange = false;
				this.configuredAutoSaveOnWindowChange = true;
				break;

			default:
				this.configuredAutoSaveDelay = undefined;
				this.configuredAutoSaveOnFocusChange = false;
				this.configuredAutoSaveOnWindowChange = false;
				break;
		}

		// Emit as event
		this._onAutoSaveConfigurationChange.fire(this.getAutoSaveConfiguration());
	}

	getAutoSaveMode(): AutoSaveMode {
		if (this.configuredAutoSaveOnFocusChange) {
			return AutoSaveMode.ON_FOCUS_CHANGE;
		}

		if (this.configuredAutoSaveOnWindowChange) {
			return AutoSaveMode.ON_WINDOW_CHANGE;
		}

		if (this.configuredAutoSaveDelay && this.configuredAutoSaveDelay > 0) {
			return this.configuredAutoSaveDelay <= 1000 ? AutoSaveMode.AFTER_SHORT_DELAY : AutoSaveMode.AFTER_LONG_DELAY;
		}

		return AutoSaveMode.OFF;
	}

	getAutoSaveConfiguration(): IAutoSaveConfiguration {
		return {
			autoSaveDelay: this.configuredAutoSaveDelay && this.configuredAutoSaveDelay > 0 ? this.configuredAutoSaveDelay : undefined,
			autoSaveFocusChange: !!this.configuredAutoSaveOnFocusChange,
			autoSaveApplicationChange: !!this.configuredAutoSaveOnWindowChange
		};
	}

	async toggleAutoSave(): Promise<void> {
		const setting = this.configurationService.inspect('files.autoSave');
		let userAutoSaveConfig = setting.user;
		if (isUndefinedOrNull(userAutoSaveConfig)) {
			userAutoSaveConfig = setting.default; // use default if setting not defined
		}

		let newAutoSaveValue: string;
		if ([AutoSaveConfiguration.AFTER_DELAY, AutoSaveConfiguration.ON_FOCUS_CHANGE, AutoSaveConfiguration.ON_WINDOW_CHANGE].some(s => s === userAutoSaveConfig)) {
			newAutoSaveValue = AutoSaveConfiguration.OFF;
		} else {
			newAutoSaveValue = AutoSaveConfiguration.AFTER_DELAY;
		}

		return this.configurationService.updateValue('files.autoSave', newAutoSaveValue, ConfigurationTarget.USER);
	}
}

registerSingleton(IAutoSaveConfigurationService, AutoSaveConfigurationService);
