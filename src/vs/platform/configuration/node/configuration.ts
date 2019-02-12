/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { onUnexpectedError } from 'vs/base/common/errors';
import { ConfigurationModelParser, ConfigurationModel } from 'vs/platform/configuration/common/configurationModels';
import { ConfigWatcher } from 'vs/base/node/config';
import { Event, Emitter } from 'vs/base/common/event';

export class UserConfiguration extends Disposable {

	private userConfigModelWatcher: ConfigWatcher<ConfigurationModelParser>;
	private initializePromise: Promise<void>;

	private readonly _onDidChangeConfiguration: Emitter<ConfigurationModel> = this._register(new Emitter<ConfigurationModel>());
	readonly onDidChangeConfiguration: Event<ConfigurationModel> = this._onDidChangeConfiguration.event;

	constructor(private settingsPath: string) {
		super();
	}

	initialize(): Promise<ConfigurationModel> {
		if (!this.initializePromise) {
			this.initializePromise = new Promise<void>((c, e) => {
				this.userConfigModelWatcher = new ConfigWatcher(this.settingsPath, {
					changeBufferDelay: 300, onError: error => onUnexpectedError(error), defaultConfig: new ConfigurationModelParser(this.settingsPath), parse: (content: string, parseErrors: any[]) => {
						const userConfigModelParser = new ConfigurationModelParser(this.settingsPath);
						userConfigModelParser.parse(content);
						parseErrors = [...userConfigModelParser.errors];
						return userConfigModelParser;
					}, initCallback: () => c(undefined)
				});
				this._register(this.userConfigModelWatcher);

				// Listeners
				this._register(this.userConfigModelWatcher.onDidUpdateConfiguration(() => this._onDidChangeConfiguration.fire(this.userConfigModelWatcher.getConfig().configurationModel)));
			});
		}
		return this.initializePromise.then(() => this.userConfigModelWatcher.getConfig().configurationModel);
	}

	initializeSync(): ConfigurationModel {
		this.initialize();
		return this.userConfigModelWatcher.getConfig().configurationModel;
	}

	reload(): Promise<ConfigurationModel> {
		return this.initialize().then(() => new Promise<ConfigurationModel>(c => this.userConfigModelWatcher.reload(userConfigModelParser => c(userConfigModelParser.configurationModel))));
	}

}