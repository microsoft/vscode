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
import { IFileService, FileChangesEvent, FileChangeType } from 'vs/platform/files/common/files';
import * as resources from 'vs/base/common/resources';
import { IDisposable } from 'vscode-xterm';

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

	private fileWatcherDisposable: IDisposable = Disposable.None;
	private directoryWatcherDisposable: IDisposable = Disposable.None;
	private exists: boolean = false;

	constructor(
		private readonly configurationResource: URI,
		private readonly fileService: IFileService
	) {
		super();

		this._register(fileService.onFileChanges(e => this.handleFileEvents(e)));
		this.reloadConfigurationScheduler = this._register(new RunOnceScheduler(() => this.reload().then(configurationModel => this._onDidChangeConfiguration.fire(configurationModel)), 50));

		this.watchResource();
		this._register(toDisposable(() => this.stopWatchingResource()));
		this.watchDirectory();
		this._register(toDisposable(() => this.stopWatchingDirectory()));

		fileService.exists(this.configurationResource)
			.then(exists => {
				this.exists = exists;
				if (this.exists) {
					// If exists stop watching directory
					this.stopWatchingDirectory();
				} else {
					// Otherwise stop watching resource
					this.stopWatchingResource();
				}
			});
	}

	private watchResource(): void {
		this.fileService.watch(this.configurationResource);
		this.fileWatcherDisposable = toDisposable(() => this.fileService.unwatch(this.configurationResource));
	}

	private stopWatchingResource(): void {
		this.fileWatcherDisposable.dispose();
		this.fileWatcherDisposable = Disposable.None;
	}

	private watchDirectory(): void {
		const directory = resources.dirname(this.configurationResource);
		this.fileService.watch(directory);
		this.directoryWatcherDisposable = toDisposable(() => this.fileService.unwatch(directory));
	}

	private stopWatchingDirectory(): void {
		this.directoryWatcherDisposable.dispose();
		this.directoryWatcherDisposable = Disposable.None;
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

	private async handleFileEvents(event: FileChangesEvent): Promise<void> {
		const events = event.changes;

		let affectedByChanges = false;

		// Find changes that affect the resource
		for (const event of events) {
			affectedByChanges = resources.isEqual(this.configurationResource, event.resource);
			if (affectedByChanges) {
				if (event.type !== FileChangeType.DELETED) {
					this.exists = false;
					// Resource deleted. Stop watching resource and start watching directory
					this.stopWatchingResource();
					this.watchDirectory();
				}
				break;
			}
		}

		if (!affectedByChanges && !this.exists) {
			// Find changes if resource is added
			const directory = resources.dirname(this.configurationResource);
			for (const { resource } of events) {
				if (resources.isEqual(directory, resource)) {
					this.exists = affectedByChanges = await this.fileService.exists(this.configurationResource);
					if (affectedByChanges) {
						// Resource is created. Stop watching directory and start watching resource
						this.stopWatchingDirectory();
						this.watchResource();
					}
					break;
				}
			}
		}

		if (affectedByChanges) {
			this.reloadConfigurationScheduler.schedule();
		}
	}
}