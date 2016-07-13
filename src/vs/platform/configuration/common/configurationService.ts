/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import paths = require('vs/base/common/paths');
import {TPromise} from 'vs/base/common/winjs.base';
import objects = require('vs/base/common/objects');
import errors = require('vs/base/common/errors');
import uri from 'vs/base/common/uri';
import model = require('./model');
import {RunOnceScheduler} from 'vs/base/common/async';
import {IDisposable} from 'vs/base/common/lifecycle';
import collections = require('vs/base/common/collections');
import {IConfigurationService, IConfigurationServiceEvent}  from './configuration';
import {IEventService} from 'vs/platform/event/common/event';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';
import {EventType, FileChangeType, FileChangesEvent} from 'vs/platform/files/common/files';
import {IConfigurationRegistry, Extensions} from './configurationRegistry';
import {Registry} from 'vs/platform/platform';
import Event, {Emitter} from 'vs/base/common/event';
import {JSONPath} from 'vs/base/common/json';


// ---- service abstract implementation

export interface IStat {
	resource: uri;
	isDirectory: boolean;
	children?: { resource: uri; }[];
}

export interface IContent {
	resource: uri;
	value: string;
}

interface ILoadConfigResult {
	config: any;
	parseErrors?: string[];
}

export abstract class ConfigurationService implements IConfigurationService, IDisposable {

	public _serviceBrand: any;

	private static RELOAD_CONFIGURATION_DELAY = 50;

	private _onDidUpdateConfiguration = new Emitter<IConfigurationServiceEvent>();

	protected contextService: IWorkspaceContextService;
	protected eventService: IEventService;
	protected workspaceSettingsRootFolder: string;

	private cachedConfig: ILoadConfigResult;

	private bulkFetchFromWorkspacePromise: TPromise<any>;
	private workspaceFilePathToConfiguration: { [relativeWorkspacePath: string]: TPromise<model.IConfigFile> };
	private callOnDispose: IDisposable;
	private reloadConfigurationScheduler: RunOnceScheduler;

	constructor(contextService: IWorkspaceContextService, eventService: IEventService, workspaceSettingsRootFolder: string = '.vscode') {

		this.contextService = contextService;
		this.eventService = eventService;

		this.workspaceSettingsRootFolder = workspaceSettingsRootFolder;
		this.workspaceFilePathToConfiguration = Object.create(null);
		this.cachedConfig = {
			config: {}
		};

		this.registerListeners();
	}

	get onDidUpdateConfiguration(): Event<IConfigurationServiceEvent> {
		return this._onDidUpdateConfiguration.event;
	}

	protected registerListeners(): void {
		let unbind = this.eventService.addListener2(EventType.FILE_CHANGES, (events) => this.handleFileEvents(events));
		let subscription = Registry.as<IConfigurationRegistry>(Extensions.Configuration).onDidRegisterConfiguration(() => this.onDidRegisterConfiguration());
		this.callOnDispose = {
			dispose: () => {
				unbind.dispose();
				subscription.dispose();
			}
		};
	}

	public initialize(): TPromise<void> {
		return this.doLoadConfiguration().then(() => null);
	}

	protected abstract resolveContents(resource: uri[]): TPromise<IContent[]>;

	protected abstract resolveContent(resource: uri): TPromise<IContent>;

	protected abstract resolveStat(resource: uri): TPromise<IStat>;

	public abstract setUserConfiguration(key: string | JSONPath, value: any) : Thenable<void>;

	public getConfiguration<T>(section?: string): T {
		let result = section ? this.cachedConfig.config[section] : this.cachedConfig.config;

		let parseErrors = this.cachedConfig.parseErrors;
		if (parseErrors && parseErrors.length > 0) {
			if (!result) {
				result = {};
			}
			result.$parseErrors = parseErrors;
		}

		return result;
	}

	public loadConfiguration(section?: string): TPromise<any> {

		// Reset caches to ensure we are hitting the disk
		this.bulkFetchFromWorkspacePromise = null;
		this.workspaceFilePathToConfiguration = Object.create(null);

		// Load configuration
		return this.doLoadConfiguration(section);
	}

	private doLoadConfiguration(section?: string): TPromise<any> {

		// Load globals
		const globals = this.loadGlobalConfiguration();

		// Load workspace locals
		return this.loadWorkspaceConfiguration().then((values) => {

			// Consolidate
			let consolidated = model.consolidate(values);

			// Override with workspace locals
			let merged = objects.mixin(
				objects.clone(globals.contents), 	// target: global/default values (but dont modify!)
				consolidated.contents,				// source: workspace configured values
				true								// overwrite
			);

			let parseErrors = [];
			if (consolidated.parseErrors) {
				parseErrors = consolidated.parseErrors;
			}
			if (globals.parseErrors) {
				parseErrors.push.apply(parseErrors, globals.parseErrors);
			}

			return {
				config: merged,
				parseErrors
			};
		}).then((res: ILoadConfigResult) => {
			this.cachedConfig = res;

			return this.getConfiguration(section);
		});
	}

	protected loadGlobalConfiguration(): { contents: any; parseErrors?: string[]; } {
		return {
			contents: model.getDefaultValues()
		};
	}

	public hasWorkspaceConfiguration(): boolean {
		return !!this.workspaceFilePathToConfiguration['.vscode/' + model.CONFIG_DEFAULT_NAME + '.json'];
	}

	protected loadWorkspaceConfiguration(section?: string): TPromise<{ [relativeWorkspacePath: string]: model.IConfigFile }> {

		// once: when invoked for the first time we fetch *all* json
		// files using the bulk stats and content routes
		if (!this.bulkFetchFromWorkspacePromise) {
			this.bulkFetchFromWorkspacePromise = this.resolveStat(this.contextService.toResource(this.workspaceSettingsRootFolder)).then((stat) => {
				if (!stat.isDirectory) {
					return TPromise.as([]);
				}

				return this.resolveContents(stat.children.filter((stat) => paths.extname(stat.resource.fsPath) === '.json').map(stat => stat.resource));
			}, (err) => {
				if (err) {
					return []; // never fail this call
				}
			}).then((contents: IContent[]) => {
				contents.forEach(content => this.workspaceFilePathToConfiguration[this.contextService.toWorkspaceRelativePath(content.resource)] = TPromise.as(model.newConfigFile(content.value)));
			}, errors.onUnexpectedError);
		}

		// on change: join on *all* configuration file promises so that
		// we can merge them into a single configuration object. this
		// happens whenever a config file changes, is deleted, or added
		return this.bulkFetchFromWorkspacePromise.then(() => {
			return TPromise.join(this.workspaceFilePathToConfiguration);
		});
	}

	private onDidRegisterConfiguration(): void {

		// a new configuration was registered (e.g. from an extension) and this means we do have a new set of
		// configuration defaults. since we already loaded the merged set of configuration (defaults < global < workspace),
		// we want to update the defaults with the new values. So we take our cached config and mix it into the new
		// defaults that we got, overwriting any value present.
		this.cachedConfig.config = objects.mixin(objects.clone(model.getDefaultValues()), this.cachedConfig.config, true /* overwrite */);

		// emit this as update to listeners
		this._onDidUpdateConfiguration.fire({ config: this.cachedConfig.config });
	}

	protected handleConfigurationChange(): void {
		if (!this.reloadConfigurationScheduler) {
			this.reloadConfigurationScheduler = new RunOnceScheduler(() => {
				this.doLoadConfiguration().then((config) => this._onDidUpdateConfiguration.fire({ config: config })).done(null, errors.onUnexpectedError);
			}, ConfigurationService.RELOAD_CONFIGURATION_DELAY);
		}

		if (!this.reloadConfigurationScheduler.isScheduled()) {
			this.reloadConfigurationScheduler.schedule();
		}
	}

	private handleFileEvents(event: FileChangesEvent): void {
		let events = event.changes;
		let affectedByChanges = false;
		for (let i = 0, len = events.length; i < len; i++) {
			let workspacePath = this.contextService.toWorkspaceRelativePath(events[i].resource);
			if (!workspacePath) {
				continue; // event is not inside workspace
			}

			// Handle case where ".vscode" got deleted
			if (workspacePath === this.workspaceSettingsRootFolder && events[i].type === FileChangeType.DELETED) {
				this.workspaceFilePathToConfiguration = Object.create(null);
				affectedByChanges = true;
			}

			// outside my folder or not a *.json file
			if (paths.extname(workspacePath) !== '.json' || !paths.isEqualOrParent(workspacePath, this.workspaceSettingsRootFolder)) {
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
					this.workspaceFilePathToConfiguration[workspacePath] = this.resolveContent(events[i].resource).then(content => model.newConfigFile(content.value), errors.onUnexpectedError);
					affectedByChanges = true;
			}
		}

		if (affectedByChanges) {
			this.handleConfigurationChange();
		}
	}

	public dispose(): void {
		if (this.reloadConfigurationScheduler) {
			this.reloadConfigurationScheduler.dispose();
		}
		this.callOnDispose.dispose();
		this._onDidUpdateConfiguration.dispose();
	}
}
