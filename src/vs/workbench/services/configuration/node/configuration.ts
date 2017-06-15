/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import * as paths from 'vs/base/common/paths';
import { TPromise } from 'vs/base/common/winjs.base';
import Event, { Emitter } from 'vs/base/common/event';
import { distinct, equals } from "vs/base/common/arrays";
import * as objects from 'vs/base/common/objects';
import * as errors from 'vs/base/common/errors';
import * as collections from 'vs/base/common/collections';
import { Disposable } from "vs/base/common/lifecycle";
import { Schemas } from "vs/base/common/network";
import { RunOnceScheduler } from 'vs/base/common/async';
import { readFile } from 'vs/base/node/pfs';
import * as extfs from 'vs/base/node/extfs';
import { IWorkspaceContextService, IWorkspace2, Workspace as SingleRootWorkspace, IWorkspace } from "vs/platform/workspace/common/workspace";
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { FileChangeType, FileChangesEvent, isEqual } from 'vs/platform/files/common/files';
import { ScopedConfigModel, WorkspaceConfigModel, WorkspaceSettingsConfigModel } from 'vs/workbench/services/configuration/common/configurationModels';
import { IConfigurationServiceEvent, ConfigurationSource, getConfigurationValue, IConfigurationOptions, Configuration } from 'vs/platform/configuration/common/configuration';
import { IWorkspaceConfigurationValues, IWorkspaceConfigurationService, IWorkspaceConfigurationValue, WORKSPACE_CONFIG_FOLDER_DEFAULT_NAME, WORKSPACE_STANDALONE_CONFIGURATIONS, WORKSPACE_CONFIG_DEFAULT_PATH } from 'vs/workbench/services/configuration/common/configuration';
import { ConfigurationService as GlobalConfigurationService } from 'vs/platform/configuration/node/configurationService';
import { createHash } from "crypto";
import { basename } from "path";

interface IStat {
	resource: URI;
	isDirectory?: boolean;
	children?: { resource: URI; }[];
}

interface IContent {
	resource: URI;
	value: string;
}

interface IWorkspaceConfiguration<T> {
	workspace: T;
	consolidated: any;
}

type IWorkspaceFoldersConfiguration = { [rootFolder: string]: { folders: string[]; } };

class Workspace implements IWorkspace2 {
	private _name: string;

	constructor(
		public readonly id: string,
		private _roots: URI[]
	) {
		//
	}

	public set roots(roots: URI[]) {
		this._roots = roots;
		this._name = null; // will be recomputed based on roots next time accessed
	}

	public get roots(): URI[] {
		return this._roots;
	}

	public get name(): string {
		if (!this._name) {
			this._name = this.roots.map(root => basename(root.fsPath)).join(', ');
		}

		return this._name;
	}
}

export class WorkspaceConfigurationService extends Disposable implements IWorkspaceContextService, IWorkspaceConfigurationService {

	private static RELOAD_CONFIGURATION_DELAY = 50;

	public _serviceBrand: any;

	private readonly _onDidChangeWorkspaceRoots: Emitter<URI[]> = this._register(new Emitter<URI[]>());
	public readonly onDidChangeWorkspaceRoots: Event<URI[]> = this._onDidChangeWorkspaceRoots.event;

	private readonly _onDidUpdateConfiguration: Emitter<IConfigurationServiceEvent> = this._register(new Emitter<IConfigurationServiceEvent>());
	public readonly onDidUpdateConfiguration: Event<IConfigurationServiceEvent> = this._onDidUpdateConfiguration.event;

	private baseConfigurationService: GlobalConfigurationService<any>;

	private cachedConfig: Configuration<any>;
	private cachedWorkspaceConfig: WorkspaceConfigModel<any>;

	private bulkFetchFromWorkspacePromise: TPromise<any>;
	private workspaceFilePathToConfiguration: { [relativeWorkspacePath: string]: TPromise<Configuration<any>> };
	private reloadConfigurationScheduler: RunOnceScheduler;

	private readonly workspace: Workspace;

	constructor(private environmentService: IEnvironmentService, private singleRootWorkspace?: SingleRootWorkspace, private workspaceSettingsRootFolder: string = WORKSPACE_CONFIG_FOLDER_DEFAULT_NAME) {
		super();

		this.workspace = singleRootWorkspace ? new Workspace(createHash('md5').update(singleRootWorkspace.resource.toString()).digest('hex'), [singleRootWorkspace.resource]) : null; // TODO@Ben for now use the first root folder as id, but revisit this later

		this.workspaceFilePathToConfiguration = Object.create(null);
		this.cachedConfig = new Configuration<any>();
		this.cachedWorkspaceConfig = new WorkspaceConfigModel(new WorkspaceSettingsConfigModel(null), []);

		this.baseConfigurationService = this._register(new GlobalConfigurationService(environmentService));
		this.reloadConfigurationScheduler = this._register(new RunOnceScheduler(() => this.doLoadConfiguration()
			.then(config => this._onDidUpdateConfiguration.fire({
				config: config.consolidated,
				source: ConfigurationSource.Workspace,
				sourceConfig: config.workspace
			}))
			.done(null, errors.onUnexpectedError), WorkspaceConfigurationService.RELOAD_CONFIGURATION_DELAY));

		this._register(this.baseConfigurationService.onDidUpdateConfiguration(e => this.onBaseConfigurationChanged(e)));
		this._register(this.onDidUpdateConfiguration(e => this.resolveAdditionalFolders(true)));
	}

	private resolveAdditionalFolders(notify?: boolean): void {
		if (!this.workspace) {
			return; // no additional folders for empty workspaces
		}

		// Resovled configured folders for workspace
		let [master] = this.workspace.roots;
		let configuredFolders: URI[] = [master];
		const config = this.getConfiguration<IWorkspaceFoldersConfiguration>('workspace');
		if (config) {
			const workspaceConfig = config[master.toString()];
			if (workspaceConfig) {
				const additionalFolders = workspaceConfig.folders
					.map(f => URI.parse(f))
					.filter(r => r.scheme === Schemas.file); // only support files for now

				configuredFolders.push(...additionalFolders);
			}
		}

		// Remove duplicates
		configuredFolders = distinct(configuredFolders, r => r.toString());

		// Find changes
		const changed = !equals(this.workspace.roots, configuredFolders, (r1, r2) => r1.toString() === r2.toString());

		this.workspace.roots = configuredFolders;

		if (notify && changed) {
			this._onDidChangeWorkspaceRoots.fire(configuredFolders);
		}
	}

	public getWorkspace(): IWorkspace {
		return this.singleRootWorkspace;
	}

	public getWorkspace2(): IWorkspace2 {
		return this.workspace;
	}

	public hasWorkspace(): boolean {
		return !!this.workspace;
	}

	public isInsideWorkspace(resource: URI): boolean {
		return this.workspace ? this.singleRootWorkspace.isInsideWorkspace(resource) : false;
	}

	public toWorkspaceRelativePath(resource: URI, toOSPath?: boolean): string {
		return this.workspace ? this.singleRootWorkspace.toWorkspaceRelativePath(resource, toOSPath) : null;
	}

	public toResource(workspaceRelativePath: string): URI {
		return this.workspace ? this.singleRootWorkspace.toResource(workspaceRelativePath) : null;
	}

	private onBaseConfigurationChanged(event: IConfigurationServiceEvent): void {
		if (event.source === ConfigurationSource.Default) {
			this.cachedWorkspaceConfig.update();
		}

		// update cached config when base config changes
		const configModel = <Configuration<any>>this.baseConfigurationService.getCache().consolidated		// global/default values (do NOT modify)
			.merge(this.cachedWorkspaceConfig);		// workspace configured values

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
		const configModel = options.overrideIdentifier ? this.cachedConfig.override<C>(options.overrideIdentifier) : this.cachedConfig;
		return options.section ? configModel.getContentsFor<C>(options.section) : configModel.contents;
	}

	public lookup<C>(key: string, overrideIdentifier?: string): IWorkspaceConfigurationValue<C> {
		const configurationValue = this.baseConfigurationService.lookup<C>(key, overrideIdentifier);
		return {
			default: configurationValue.default,
			user: configurationValue.user,
			workspace: objects.clone(getConfigurationValue<C>(overrideIdentifier ? this.cachedWorkspaceConfig.override(overrideIdentifier).contents : this.cachedWorkspaceConfig.contents, key)),
			value: objects.clone(getConfigurationValue<C>(overrideIdentifier ? this.cachedConfig.override(overrideIdentifier).contents : this.cachedConfig.contents, key))
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
			const current = this.cachedConfig;
			return this.doLoadConfiguration().then(configuration => {
				// emit this as update to listeners if changed
				if (!objects.equals(current, this.cachedConfig)) {
					this._onDidUpdateConfiguration.fire({
						config: configuration.consolidated,
						source: ConfigurationSource.Workspace,
						sourceConfig: configuration.workspace
					});
				}
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
			const workspaceSettingsConfig = <WorkspaceSettingsConfigModel<T>>workspaceConfigFiles[WORKSPACE_CONFIG_DEFAULT_PATH] || new WorkspaceSettingsConfigModel<T>(null);
			const otherConfigModels = Object.keys(workspaceConfigFiles).filter(key => key !== WORKSPACE_CONFIG_DEFAULT_PATH).map(key => <ScopedConfigModel<T>>workspaceConfigFiles[key]);
			this.cachedWorkspaceConfig = new WorkspaceConfigModel<T>(workspaceSettingsConfig, otherConfigModels);

			// Override base (global < user) with workspace locals (global < user < workspace)
			this.cachedConfig = <Configuration<any>>this.baseConfigurationService.getCache().consolidated		// global/default values (do NOT modify)
				.merge(this.cachedWorkspaceConfig);		// workspace configured values

			return {
				consolidated: this.cachedConfig.contents,
				workspace: this.cachedWorkspaceConfig.contents
			};
		});
	}

	private loadWorkspaceConfigFiles<T>(): TPromise<{ [relativeWorkspacePath: string]: Configuration<T> }> {

		// Return early if we don't have a workspace
		if (!this.workspace) {
			return TPromise.as(Object.create(null));
		}

		// once: when invoked for the first time we fetch json files that contribute settings
		if (!this.bulkFetchFromWorkspacePromise) {
			this.bulkFetchFromWorkspacePromise = resolveStat(this.toResource(this.workspaceSettingsRootFolder)).then(stat => {
				if (!stat.isDirectory) {
					return TPromise.as([]);
				}

				return resolveContents(stat.children.filter(stat => {
					const isJson = paths.extname(stat.resource.fsPath) === '.json';
					if (!isJson) {
						return false; // only JSON files
					}

					return this.isWorkspaceConfigurationFile(this.toWorkspaceRelativePath(stat.resource)); // only workspace config files
				}).map(stat => stat.resource));
			}, err => [] /* never fail this call */)
				.then((contents: IContent[]) => {
					contents.forEach(content => this.workspaceFilePathToConfiguration[this.toWorkspaceRelativePath(content.resource)] = TPromise.as(this.createConfigModel(content)));
				}, errors.onUnexpectedError);
		}

		// on change: join on *all* configuration file promises so that we can merge them into a single configuration object. this
		// happens whenever a config file changes, is deleted, or added
		return this.bulkFetchFromWorkspacePromise.then(() => TPromise.join(this.workspaceFilePathToConfiguration));
	}

	public handleWorkspaceFileEvents(event: FileChangesEvent): void {
		if (!this.workspace) {
			return; // only enabled when we have a known workspace
		}

		const events = event.changes;
		let affectedByChanges = false;

		// Find changes that affect workspace configuration files
		for (let i = 0, len = events.length; i < len; i++) {
			const resource = events[i].resource;
			const isJson = paths.extname(resource.fsPath) === '.json';
			const isDeletedSettingsFolder = (events[i].type === FileChangeType.DELETED && isEqual(paths.basename(resource.fsPath), this.workspaceSettingsRootFolder));
			if (!isJson && !isDeletedSettingsFolder) {
				continue; // only JSON files or the actual settings folder
			}

			const workspacePath = this.toWorkspaceRelativePath(resource);
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

	private createConfigModel<T>(content: IContent): Configuration<T> {
		const path = this.toWorkspaceRelativePath(content.resource);
		if (path === WORKSPACE_CONFIG_DEFAULT_PATH) {
			return new WorkspaceSettingsConfigModel<T>(content.value, content.resource.toString());
		} else {
			const matches = /\/([^\.]*)*\.json/.exec(path);
			if (matches && matches[1]) {
				return new ScopedConfigModel<T>(content.value, content.resource.toString(), matches[1]);
			}
		}

		return new Configuration<T>();
	}

	private isWorkspaceConfigurationFile(workspaceRelativePath: string): boolean {
		return [WORKSPACE_CONFIG_DEFAULT_PATH, WORKSPACE_STANDALONE_CONFIGURATIONS.launch, WORKSPACE_STANDALONE_CONFIGURATIONS.tasks].some(p => p === workspaceRelativePath);
	}

	public getUnsupportedWorkspaceKeys(): string[] {
		return this.cachedWorkspaceConfig.workspaceSettingsConfig.unsupportedKeys;
	}

}

// node.hs helper functions

function resolveContents(resources: URI[]): TPromise<IContent[]> {
	const contents: IContent[] = [];

	return TPromise.join(resources.map(resource => {
		return resolveContent(resource).then(content => {
			contents.push(content);
		});
	})).then(() => contents);
}

function resolveContent(resource: URI): TPromise<IContent> {
	return readFile(resource.fsPath).then(contents => ({ resource, value: contents.toString() }));
}

function resolveStat(resource: URI): TPromise<IStat> {
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
					children: children.map(child => { return { resource: URI.file(paths.join(resource.fsPath, child)) }; })
				});
			}
		});
	});
}
