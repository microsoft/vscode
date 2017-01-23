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
import { IDisposable, Disposable } from 'vs/base/common/lifecycle';
import { readFile } from 'vs/base/node/pfs';
import errors = require('vs/base/common/errors');
import { ScopedConfigModel, WorkspaceConfigModel, TrustedWorkspaceSettingsConfigModel } from 'vs/workbench/services/configuration/common/model';
import { IConfigurationServiceEvent, ConfigurationSource, getConfigurationValue, IConfigModel, IConfigurationOptions } from 'vs/platform/configuration/common/configuration';
import { ConfigModel } from 'vs/platform/configuration/common/model';
import { ConfigurationService as BaseConfigurationService } from 'vs/platform/configuration/node/configurationService';
import { IWorkspaceConfigurationValues, IWorkspaceConfigurationService, IWorkspaceTrust, IWorkspaceConfigurationValue, CONFIG_DEFAULT_NAME, WORKSPACE_CONFIG_FOLDER_DEFAULT_NAME, WORKSPACE_STANDALONE_CONFIGURATIONS, WORKSPACE_CONFIG_DEFAULT_PATH } from 'vs/workbench/services/configuration/common/configuration';
import { FileChangeType, FileChangesEvent } from 'vs/platform/files/common/files';
import Event, { Emitter } from 'vs/base/common/event';
import { Registry } from 'vs/platform/platform';
import { IConfigurationRegistry, IConfigurationNode, Extensions, ISecurityConfiguration } from 'vs/platform/configuration/common/configurationRegistry';


interface IStat {
	resource: uri;
	isDirectory?: boolean;
	children?: { resource: uri; }[];
}

interface IContent {
	resource: uri;
	value: string;
}

interface IWorkspaceConfiguration<T> {
	workspace: T;
	consolidated: any;
}

export class WorkspaceTrust implements IWorkspaceTrust {

	constructor(private contextService: IWorkspaceContextService, private baseConfigurationService: BaseConfigurationService<any>) { }

	public isTrusted(): boolean {
		let workspace = this.contextService.getWorkspace();
		if (workspace) {
			let path = workspace.resource.fsPath;
			let securityConfiguration = this.baseConfigurationService.getConfiguration<ISecurityConfiguration>();
			let whiteList = securityConfiguration.security.workspacesTrustedToSpecifyExecutables;
			return whiteList && whiteList[path];
		}
		return false;
	}

	public allKnownConfigKeysForExecutables(): { [key: string]: any } {
		const configKeys: { [key: string]: boolean } = {};
		const configurations: IConfigurationNode[] = Registry.as<IConfigurationRegistry>(Extensions.Configuration).getConfigurations();
		configurations.forEach((config) => {
			const properties = config.properties;
			if (properties) {
				Object.keys(properties).map((key) => {
					const property = properties[key];
					if (property && property.isExecutable) {
						configKeys[key] = true;
					}
				});
			}
		});
		return configKeys;
	}
}

/**
 * Wraps around the basic configuration service and adds knowledge about workspace settings.
 */
export class WorkspaceConfigurationService extends Disposable implements IWorkspaceConfigurationService, IDisposable {

	public _serviceBrand: any;

	private static RELOAD_CONFIGURATION_DELAY = 50;

	private _onDidUpdateConfiguration: Emitter<IConfigurationServiceEvent>;
	private baseConfigurationService: BaseConfigurationService<any>;

	private cachedConfig: ConfigModel<any>;
	private cachedWorkspaceConfig: WorkspaceConfigModel<any>;

	private bulkFetchFromWorkspacePromise: TPromise<any>;
	private workspaceFilePathToConfiguration: { [relativeWorkspacePath: string]: TPromise<IConfigModel<any>> };
	private reloadConfigurationScheduler: RunOnceScheduler;

	private workspaceTrust: IWorkspaceTrust;

	constructor(
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IEnvironmentService environmentService: IEnvironmentService,
		private workspaceSettingsRootFolder: string = WORKSPACE_CONFIG_FOLDER_DEFAULT_NAME
	) {
		super();
		this.workspaceFilePathToConfiguration = Object.create(null);

		this.cachedConfig = new ConfigModel<any>(null);
		this.cachedWorkspaceConfig = new WorkspaceConfigModel(new TrustedWorkspaceSettingsConfigModel(null), []);

		this._onDidUpdateConfiguration = this._register(new Emitter<IConfigurationServiceEvent>());

		this.baseConfigurationService = this._register(new BaseConfigurationService(environmentService));

		this.reloadConfigurationScheduler = this._register(new RunOnceScheduler(() => this.doLoadConfiguration()
			.then(config => this._onDidUpdateConfiguration.fire({
				config: config.consolidated,
				source: ConfigurationSource.Workspace,
				sourceConfig: config.workspace
			}))
			.done(null, errors.onUnexpectedError), WorkspaceConfigurationService.RELOAD_CONFIGURATION_DELAY));

		this._register(this.baseConfigurationService.onDidUpdateConfiguration(e => this.onBaseConfigurationChanged(e)));

		this.workspaceTrust = new WorkspaceTrust(this.contextService, this.baseConfigurationService);
	}

	get onDidUpdateConfiguration(): Event<IConfigurationServiceEvent> {
		return this._onDidUpdateConfiguration.event;
	}

	private onBaseConfigurationChanged(event: IConfigurationServiceEvent): void {

		this.cachedWorkspaceConfig.refilter();

		// update cached config when base config changes
		const configModel = new ConfigModel<any>(null)
			.merge(this.baseConfigurationService.getCache().consolidated)		// global/default values (do NOT modify)
			.merge(this.cachedWorkspaceConfig);									// workspace configured values

		// emit this as update to listeners if changed
		if (!objects.equals(this.cachedConfig.contents, configModel.contents)) {
			this.cachedConfig = configModel;
			this._onDidUpdateConfiguration.fire({
				config: this.cachedConfig.contents,
				source: event.source,
				sourceConfig: event.sourceConfig
			});
		}
	}

	public initialize(): TPromise<void> {
		return this.doLoadConfiguration().then(() => null);
	}

	public getConfiguration<C>(section?: string): C
	public getConfiguration<C>(options?: IConfigurationOptions): C
	public getConfiguration<C>(arg?: any): C {
		const options = this.toOptions(arg);
		const configModel = options.overrideIdentifier ? this.cachedConfig.configWithOverrides<C>(options.overrideIdentifier) : this.cachedConfig;
		return options.section ? configModel.config<C>(options.section).contents : configModel.contents;
	}

	public lookup<C>(key: string, overrideIdentifier?: string): IWorkspaceConfigurationValue<C> {
		const configurationValue = this.baseConfigurationService.lookup<C>(key, overrideIdentifier);
		return {
			default: configurationValue.default,
			user: configurationValue.user,
			workspace: objects.clone(getConfigurationValue<C>(overrideIdentifier ? this.cachedWorkspaceConfig.configWithOverrides(overrideIdentifier).contents : this.cachedWorkspaceConfig.contents, key)),
			value: objects.clone(getConfigurationValue<C>(overrideIdentifier ? this.cachedConfig.configWithOverrides(overrideIdentifier).contents : this.cachedConfig.contents, key))
		};
	}

	public keys() {
		const keys = this.baseConfigurationService.keys();

		return {
			default: keys.default,
			user: keys.user,
			workspace: this.cachedWorkspaceConfig.keys
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

	private toOptions(arg: any): IConfigurationOptions {
		if (typeof arg === 'string') {
			return { section: arg };
		}
		if (typeof arg === 'object') {
			return arg;
		}
		return {};
	}

	private doLoadConfiguration<T>(): TPromise<IWorkspaceConfiguration<T>> {

		// Load workspace locals
		return this.loadWorkspaceConfigFiles().then(workspaceConfigFiles => {

			// Consolidate (support *.json files in the workspace settings folder)
			let workspaceSettingsModel: TrustedWorkspaceSettingsConfigModel<T> = <TrustedWorkspaceSettingsConfigModel<T>>workspaceConfigFiles[WORKSPACE_CONFIG_DEFAULT_PATH] || new TrustedWorkspaceSettingsConfigModel<T>(null);
			let otherConfigModels = Object.keys(workspaceConfigFiles).filter(key => key !== WORKSPACE_CONFIG_DEFAULT_PATH).map(key => <ScopedConfigModel<T>>workspaceConfigFiles[key]);

			this.cachedWorkspaceConfig = new WorkspaceConfigModel<T>(workspaceSettingsModel, otherConfigModels);

			// Override base (global < user) with workspace locals (global < user < workspace)
			this.cachedConfig = new ConfigModel(null)
				.merge(this.baseConfigurationService.getCache().consolidated)		// global/default values (do NOT modify)
				.merge(this.cachedWorkspaceConfig);										// workspace configured values

			return {
				consolidated: this.cachedConfig.contents,
				workspace: this.cachedWorkspaceConfig.contents
			};
		});
	}

	public hasWorkspaceConfiguration(): boolean {
		return !!this.workspaceFilePathToConfiguration[`${this.workspaceSettingsRootFolder}/${CONFIG_DEFAULT_NAME}.json`];
	}

	private loadWorkspaceConfigFiles<T>(): TPromise<{ [relativeWorkspacePath: string]: IConfigModel<T> }> {

		// Return early if we don't have a workspace
		if (!this.contextService.hasWorkspace()) {
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
			}, err => [] /* never fail this call */)
				.then((contents: IContent[]) => {
					contents.forEach(content => this.workspaceFilePathToConfiguration[this.contextService.toWorkspaceRelativePath(content.resource)] = TPromise.as(this.createConfigModel(content)));
				}, errors.onUnexpectedError);
		}

		// on change: join on *all* configuration file promises so that we can merge them into a single configuration object. this
		// happens whenever a config file changes, is deleted, or added
		return this.bulkFetchFromWorkspacePromise.then(() => TPromise.join(this.workspaceFilePathToConfiguration));
	}

	public handleWorkspaceFileEvents(event: FileChangesEvent): void {
		const events = event.changes;
		let affectedByChanges = false;

		// Find changes that affect workspace configuration files
		for (let i = 0, len = events.length; i < len; i++) {
			const resource = events[i].resource;
			const isJson = paths.extname(resource.fsPath) === '.json';
			const isDeletedSettingsFolder = (events[i].type === FileChangeType.DELETED && paths.basename(resource.fsPath) === this.workspaceSettingsRootFolder);
			if (!isJson && !isDeletedSettingsFolder) {
				continue; // only JSON files or the actual settings folder
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
					this.workspaceFilePathToConfiguration[workspacePath] = resolveContent(resource).then(content => this.createConfigModel(content), errors.onUnexpectedError);
					affectedByChanges = true;
			}
		}

		// trigger reload of the configuration if we are affected by changes
		if (affectedByChanges && !this.reloadConfigurationScheduler.isScheduled()) {
			this.reloadConfigurationScheduler.schedule();
		}
	}

	private createConfigModel<T>(content: IContent): IConfigModel<T> {
		const path = this.contextService.toWorkspaceRelativePath(content.resource);
		if (path === WORKSPACE_CONFIG_DEFAULT_PATH) {
			return new TrustedWorkspaceSettingsConfigModel<T>(content.value, content.resource.toString(), this.workspaceTrust);
		} else {
			const matches = /\/([^\.]*)*\.json/.exec(path);
			if (matches && matches[1]) {
				return new ScopedConfigModel<T>(content.value, content.resource.toString(), matches[1]);
			}
		}
		return new TrustedWorkspaceSettingsConfigModel<T>(null);
	}

	private isWorkspaceConfigurationFile(workspaceRelativePath: string): boolean {
		return [WORKSPACE_CONFIG_DEFAULT_PATH, WORKSPACE_STANDALONE_CONFIGURATIONS.launch, WORKSPACE_STANDALONE_CONFIGURATIONS.tasks].some(p => p === workspaceRelativePath);
	}

	public getUntrustedConfigurations(): string[] {
		return this.cachedWorkspaceConfig.untrustedKeys;
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