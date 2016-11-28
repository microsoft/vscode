/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import uri from 'vs/base/common/uri';
import paths = require('vs/base/common/paths');
import extfs = require('vs/base/node/extfs');
import objects = require('vs/base/common/objects');
import { RunOnceScheduler } from 'vs/base/common/async';
import collections = require('vs/base/common/collections');
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IEventService } from 'vs/platform/event/common/event';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { readFile } from 'vs/base/node/pfs';
import errors = require('vs/base/common/errors');
import { IConfigFile, consolidate, newConfigFile } from 'vs/workbench/services/configuration/common/model';
import { IConfigurationServiceEvent, ConfigurationSource, getConfigurationValue } from 'vs/platform/configuration/common/configuration';
import { ConfigurationService as BaseConfigurationService } from 'vs/platform/configuration/node/configurationService';
import { IWorkspaceConfigurationValues, IWorkspaceConfigurationService, IWorkspaceConfigurationValue, CONFIG_DEFAULT_NAME, WORKSPACE_CONFIG_FOLDER_DEFAULT_NAME, WORKSPACE_STANDALONE_CONFIGURATIONS, WORKSPACE_CONFIG_DEFAULT_PATH } from 'vs/workbench/services/configuration/common/configuration';
import { EventType as FileEventType, FileChangeType, FileChangesEvent } from 'vs/platform/files/common/files';
import Event, { Emitter } from 'vs/base/common/event';

interface IStat {
	resource: uri;
	isDirectory?: boolean;
	children?: { resource: uri; }[];
}

interface IContent {
	resource: uri;
	value: string;
}

interface IConfiguration<T> {
	workspace: T;
	consolidated: T;
}

/**
 * Wraps around the basic configuration service and adds knowledge about workspace settings.
 */
export class WorkspaceConfigurationService implements IWorkspaceConfigurationService, IDisposable {

	public _serviceBrand: any;

	private static RELOAD_CONFIGURATION_DELAY = 50;

	private _onDidUpdateConfiguration: Emitter<IConfigurationServiceEvent>;
	private toDispose: IDisposable[];
	private baseConfigurationService: BaseConfigurationService<any>;

	private cachedConfig: any;
	private cachedWorkspaceConfig: any;
	private cachedWorkspaceKeys: string[];

	private bulkFetchFromWorkspacePromise: TPromise<any>;
	private workspaceFilePathToConfiguration: { [relativeWorkspacePath: string]: TPromise<IConfigFile> };
	private reloadConfigurationScheduler: RunOnceScheduler;

	constructor(
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IEventService private eventService: IEventService,
		@IEnvironmentService environmentService: IEnvironmentService,
		private workspaceSettingsRootFolder: string = WORKSPACE_CONFIG_FOLDER_DEFAULT_NAME
	) {
		this.toDispose = [];
		this.workspaceFilePathToConfiguration = Object.create(null);

		this.cachedConfig = Object.create(null);
		this.cachedWorkspaceConfig = Object.create(null);

		this._onDidUpdateConfiguration = new Emitter<IConfigurationServiceEvent>();
		this.toDispose.push(this._onDidUpdateConfiguration);

		this.baseConfigurationService = new BaseConfigurationService(environmentService);
		this.toDispose.push(this.baseConfigurationService);

		this.reloadConfigurationScheduler = new RunOnceScheduler(() => this.doLoadConfiguration()
			.then(config => this._onDidUpdateConfiguration.fire({
				config: config.consolidated,
				source: ConfigurationSource.Workspace,
				sourceConfig: config.workspace
			}))
			.done(null, errors.onUnexpectedError), WorkspaceConfigurationService.RELOAD_CONFIGURATION_DELAY);
		this.toDispose.push(this.reloadConfigurationScheduler);

		this.registerListeners();
	}

	get onDidUpdateConfiguration(): Event<IConfigurationServiceEvent> {
		return this._onDidUpdateConfiguration.event;
	}

	private registerListeners(): void {
		this.toDispose.push(this.eventService.addListener2(FileEventType.FILE_CHANGES, events => this.handleWorkspaceFileEvents(events)));
		this.toDispose.push(this.baseConfigurationService.onDidUpdateConfiguration(e => this.onBaseConfigurationChanged(e)));
	}

	private onBaseConfigurationChanged(e: IConfigurationServiceEvent): void {

		// update cached config when base config changes
		const newConfig = objects.mixin(
			objects.clone(this.baseConfigurationService.getConfiguration()),	// target: global/default values (do NOT modify)
			this.cachedWorkspaceConfig,											// source: workspace configured values
			true																// overwrite
		);

		// emit this as update to listeners if changed
		if (!objects.equals(this.cachedConfig, newConfig)) {
			this.cachedConfig = newConfig;
			this._onDidUpdateConfiguration.fire({
				config: this.cachedConfig,
				source: e.source,
				sourceConfig: e.sourceConfig
			});
		}
	}

	public initialize(): TPromise<void> {
		return this.doLoadConfiguration().then(() => null);
	}

	public getConfiguration<T>(section?: string): T {
		return section ? this.cachedConfig[section] : this.cachedConfig;
	}

	public lookup<C>(key: string): IWorkspaceConfigurationValue<C> {
		const configurationValue = this.baseConfigurationService.lookup<C>(key);

		return {
			default: configurationValue.default,
			user: configurationValue.user,
			workspace: getConfigurationValue<C>(this.cachedWorkspaceConfig, key),
			value: getConfigurationValue<C>(this.cachedConfig, key)
		};
	}

	public keys() {
		const keys = this.baseConfigurationService.keys();

		return {
			default: keys.default,
			user: keys.user,
			workspace: this.cachedWorkspaceKeys
		};
	}

	public values(): IWorkspaceConfigurationValues {
		const result: IWorkspaceConfigurationValues = Object.create(null);
		const keyset = this.keys();
		const keys = [...keyset.workspace, ...keyset.user, ...keyset.default].sort();

		let lastKey: string;
		for (const key of keys) {
			if (key !== lastKey) {
				lastKey = key;
				result[key] = this.lookup(key);
			}
		}

		return result;
	}

	public reloadConfiguration(section?: string): TPromise<any> {

		// Reset caches to ensure we are hitting the disk
		this.bulkFetchFromWorkspacePromise = null;
		this.workspaceFilePathToConfiguration = Object.create(null);

		// Load configuration
		return this.baseConfigurationService.reloadConfiguration().then(() => {
			return this.doLoadConfiguration().then(configuration => {
				return section ? configuration.consolidated[section] : configuration.consolidated;
			});
		});
	}

	private doLoadConfiguration<T>(): TPromise<IConfiguration<T>> {

		// Load workspace locals
		return this.loadWorkspaceConfigFiles().then(workspaceConfigFiles => {

			// Consolidate (support *.json files in the workspace settings folder)
			const workspaceConfig = consolidate(workspaceConfigFiles).contents;
			this.cachedWorkspaceConfig = workspaceConfig;

			// Cache keys
			const workspaceConfigKeys = [];
			Object.keys(workspaceConfigFiles).forEach(path => {
				if (path === WORKSPACE_CONFIG_DEFAULT_PATH) {
					workspaceConfigKeys.push(...Object.keys(workspaceConfigFiles[path].raw));
				} else {
					const workspaceConfigs = Object.keys(WORKSPACE_STANDALONE_CONFIGURATIONS);
					workspaceConfigs.forEach(workspaceConfig => {
						if (path === WORKSPACE_STANDALONE_CONFIGURATIONS[workspaceConfig]) {
							workspaceConfigKeys.push(...Object.keys(workspaceConfigFiles[path].raw).map(key => `${workspaceConfig}.${key}`));
						}
					});
				}
			});
			this.cachedWorkspaceKeys = workspaceConfigKeys;

			// Override base (global < user) with workspace locals (global < user < workspace)
			this.cachedConfig = objects.mixin(
				objects.clone(this.baseConfigurationService.getConfiguration()), 	// target: global/default values (do NOT modify)
				this.cachedWorkspaceConfig,											// source: workspace configured values
				true																// overwrite
			);
			return {
				consolidated: this.cachedConfig,
				workspace: this.cachedWorkspaceConfig
			};
		});
	}

	public hasWorkspaceConfiguration(): boolean {
		return !!this.workspaceFilePathToConfiguration[`${this.workspaceSettingsRootFolder}/${CONFIG_DEFAULT_NAME}.json`];
	}

	public dispose(): void {
		this.toDispose = dispose(this.toDispose);
	}

	private loadWorkspaceConfigFiles(): TPromise<{ [relativeWorkspacePath: string]: IConfigFile }> {

		// Return early if we don't have a workspace
		if (!this.contextService.getWorkspace()) {
			return TPromise.as(Object.create(null));
		}

		// once: when invoked for the first time we fetch json files that contribute settings
		if (!this.bulkFetchFromWorkspacePromise) {
			this.bulkFetchFromWorkspacePromise = resolveStat(this.contextService.toResource(this.workspaceSettingsRootFolder)).then(stat => {
				if (!stat.isDirectory) {
					return TPromise.as([]);
				}

				return resolveContents(stat.children.filter(stat => {
					const isJson = paths.extname(stat.resource.fsPath) === '.json';
					if (!isJson) {
						return false; // only JSON files
					}

					return this.isWorkspaceConfigurationFile(this.contextService.toWorkspaceRelativePath(stat.resource)); // only workspace config files
				}).map(stat => stat.resource));
			}, (err) => {
				if (err) {
					return []; // never fail this call
				}
			}).then((contents: IContent[]) => {
				contents.forEach(content => this.workspaceFilePathToConfiguration[this.contextService.toWorkspaceRelativePath(content.resource)] = TPromise.as(newConfigFile(content.value)));
			}, errors.onUnexpectedError);
		}

		// on change: join on *all* configuration file promises so that we can merge them into a single configuration object. this
		// happens whenever a config file changes, is deleted, or added
		return this.bulkFetchFromWorkspacePromise.then(() => TPromise.join(this.workspaceFilePathToConfiguration));
	}

	private handleWorkspaceFileEvents(event: FileChangesEvent): void {
		const events = event.changes;
		let affectedByChanges = false;

		// Find changes that affect workspace configuration files
		for (let i = 0, len = events.length; i < len; i++) {
			const resource = events[i].resource;
			const isJson = paths.extname(resource.fsPath) === '.json';
			if (!isJson) {
				continue; // only JSON files
			}

			const workspacePath = this.contextService.toWorkspaceRelativePath(resource);
			if (!workspacePath) {
				continue; // event is not inside workspace
			}

			// Handle case where ".vscode" got deleted
			if (workspacePath === this.workspaceSettingsRootFolder && events[i].type === FileChangeType.DELETED) {
				this.workspaceFilePathToConfiguration = Object.create(null);
				affectedByChanges = true;
			}

			// only valid workspace config files
			if (!this.isWorkspaceConfigurationFile(workspacePath)) {
				continue;
			}

			// insert 'fetch-promises' for add and update events and
			// remove promises for delete events
			switch (events[i].type) {
				case FileChangeType.DELETED:
					affectedByChanges = collections.remove(this.workspaceFilePathToConfiguration, workspacePath);
					break;
				case FileChangeType.UPDATED:
				case FileChangeType.ADDED:
					this.workspaceFilePathToConfiguration[workspacePath] = resolveContent(resource).then(content => newConfigFile(content.value), errors.onUnexpectedError);
					affectedByChanges = true;
			}
		}

		// trigger reload of the configuration if we are affected by changes
		if (affectedByChanges && !this.reloadConfigurationScheduler.isScheduled()) {
			this.reloadConfigurationScheduler.schedule();
		}
	}

	private isWorkspaceConfigurationFile(workspaceRelativePath: string): boolean {
		return [WORKSPACE_CONFIG_DEFAULT_PATH, WORKSPACE_STANDALONE_CONFIGURATIONS.launch, WORKSPACE_STANDALONE_CONFIGURATIONS.tasks].some(p => p === workspaceRelativePath);
	}
}

// node.hs helper functions

function resolveContents(resources: uri[]): TPromise<IContent[]> {
	const contents: IContent[] = [];

	return TPromise.join(resources.map(resource => {
		return resolveContent(resource).then(content => {
			contents.push(content);
		});
	})).then(() => contents);
}

function resolveContent(resource: uri): TPromise<IContent> {
	return readFile(resource.fsPath).then(contents => ({ resource, value: contents.toString() }));
}

function resolveStat(resource: uri): TPromise<IStat> {
	return new TPromise<IStat>((c, e) => {
		extfs.readdir(resource.fsPath, (error, children) => {
			if (error) {
				if ((<any>error).code === 'ENOTDIR') {
					c({ resource });
				} else {
					e(error);
				}
			} else {
				c({
					resource,
					isDirectory: true,
					children: children.map(child => { return { resource: uri.file(paths.join(resource.fsPath, child)) }; })
				});
			}
		});
	});
}