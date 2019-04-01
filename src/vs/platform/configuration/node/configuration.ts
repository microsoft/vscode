/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, toDisposable } from 'vs/base/common/lifecycle';
import { onUnexpectedError } from 'vs/base/common/errors';
import { ConfigurationModelParser, ConfigurationModel } from 'vs/platform/configuration/common/configurationModels';
import { ConfigWatcher } from 'vs/base/node/config';
import { Event, Emitter } from 'vs/base/common/event';
import { RunOnceScheduler } from 'vs/base/common/async';
import { URI } from 'vs/base/common/uri';
import { IFileService, FileChangesEvent } from 'vs/platform/files/common/files';
import * as resources from 'vs/base/common/resources';

export class NodeBasedUserConfiguration extends Disposable {

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

export class FileServiceBasedUserConfiguration extends Disposable {

	private readonly reloadConfigurationScheduler: RunOnceScheduler;
	protected readonly _onDidChangeConfiguration: Emitter<ConfigurationModel> = this._register(new Emitter<ConfigurationModel>());
	readonly onDidChangeConfiguration: Event<ConfigurationModel> = this._onDidChangeConfiguration.event;

	constructor(
		private readonly configurationResource: URI,
		private readonly fileService: IFileService
	) {
		super();

		this._register(fileService.onFileChanges(e => this.handleFileEvents(e)));
		this.reloadConfigurationScheduler = this._register(new RunOnceScheduler(() => this.reload().then(configurationModel => this._onDidChangeConfiguration.fire(configurationModel)), 50));
		this.fileService.watch(this.configurationResource);
		this._register(toDisposable(() => this.fileService.unwatch(this.configurationResource)));
	}

	initialize(): Promise<ConfigurationModel> {
		return this.reload();
	}

	reload(): Promise<ConfigurationModel> {
		return this.fileService.resolveContent(this.configurationResource)
			.then(content => content.value, () => {
				// File not found
				return '';
			}).then(content => {
				const parser = new ConfigurationModelParser(this.configurationResource.toString());
				parser.parse(content);
				return parser.configurationModel;
			});
	}

	private handleFileEvents(event: FileChangesEvent): void {
		const events = event.changes;

		let affectedByChanges = false;
		// Find changes that affect workspace file
		for (let i = 0, len = events.length; i < len && !affectedByChanges; i++) {
			affectedByChanges = resources.isEqual(this.configurationResource, events[i].resource);
		}

		if (affectedByChanges) {
			this.reloadConfigurationScheduler.schedule();
		}
	}
}