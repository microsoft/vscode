/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import paths = require('vs/base/common/paths');
import winjs = require('vs/base/common/winjs.base');
import eventEmitter = require('vs/base/common/eventEmitter');
import objects = require('vs/base/common/objects');
import errors = require('vs/base/common/errors');
import uri from 'vs/base/common/uri';
import model = require('./model');
import lifecycle = require('vs/base/common/lifecycle');
import collections = require('vs/base/common/collections');
import {IConfigurationService, ConfigurationServiceEventTypes}  from './configuration';
import {IEventService} from 'vs/platform/event/common/event';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';
import Files = require('vs/platform/files/common/files');
import {IConfigurationRegistry, Extensions} from './configurationRegistry';
import {Registry} from 'vs/platform/platform';
import Event, {fromEventEmitter} from 'vs/base/common/event';


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
	merged: any;
	consolidated: { contents: any; parseErrors: string[]; };
	globals: { contents: any; parseErrors: string[]; };
}

export abstract class ConfigurationService extends eventEmitter.EventEmitter implements IConfigurationService, lifecycle.IDisposable {
	public serviceId = IConfigurationService;

	public onDidUpdateConfiguration: Event<{ config: any }>;

	protected contextService: IWorkspaceContextService;
	protected eventService: IEventService;
	protected workspaceSettingsRootFolder: string;

	private loadConfigurationPromise: winjs.TPromise<any>;
	private bulkFetchFromWorkspacePromise: winjs.TPromise<any>;
	private workspaceFilePathToConfiguration: { [relativeWorkspacePath: string]: winjs.TPromise<model.IConfigFile> };
	private callOnDispose: Function;

	constructor(contextService: IWorkspaceContextService, eventService: IEventService, workspaceSettingsRootFolder: string = '.vscode') {
		super();

		this.contextService = contextService;
		this.eventService = eventService;

		this.workspaceSettingsRootFolder = workspaceSettingsRootFolder;
		this.workspaceFilePathToConfiguration = Object.create(null);

		let unbind = this.eventService.addListener(Files.EventType.FILE_CHANGES, (events) => this.handleFileEvents(events));
		let subscription = (<IConfigurationRegistry>Registry.as(Extensions.Configuration)).onDidRegisterConfiguration(() => this.reloadAndEmit());
		this.callOnDispose = () => {
			unbind();
			subscription.dispose();
		};

		this.onDidUpdateConfiguration = fromEventEmitter(this, ConfigurationServiceEventTypes.UPDATED);
	}

	protected abstract resolveContents(resource: uri[]): winjs.TPromise<IContent[]>;

	protected abstract resolveContent(resource: uri): winjs.TPromise<IContent>;

	protected abstract resolveStat(resource: uri): winjs.TPromise<IStat>;

	public dispose(): void {
		this.callOnDispose = lifecycle.cAll(this.callOnDispose);

		super.dispose();
	}

	public loadConfiguration(section?: string): winjs.TPromise<any> {
		if (!this.loadConfigurationPromise) {
			this.loadConfigurationPromise = this.doLoadConfiguration();
		}

		return this.loadConfigurationPromise.then((res: ILoadConfigResult) => {
			let result = section ? res.merged[section] : res.merged;

			let parseErrors = res.consolidated.parseErrors;
			if (res.globals.parseErrors) {
				parseErrors.push.apply(parseErrors, res.globals.parseErrors);
			}

			if (parseErrors.length > 0) {
				if (!result) {
					result = {};
				}
				result.$parseErrors = parseErrors;
			}

			return result;
		});
	}

	private doLoadConfiguration(): winjs.TPromise<ILoadConfigResult> {

		// Load globals
		return this.loadGlobalConfiguration().then((globals) => {

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

				return {
					merged: merged,
					consolidated: consolidated,
					globals: globals
				};
			});
		});
	}

	protected loadGlobalConfiguration(): winjs.TPromise<{ contents: any; parseErrors: string[]; }> {
		return winjs.TPromise.as({
			contents: model.getDefaultValues()
		});
	}

	public hasWorkspaceConfiguration(): boolean {
		return !!this.workspaceFilePathToConfiguration['.vscode/' + model.CONFIG_DEFAULT_NAME + '.json'];
	}

	protected loadWorkspaceConfiguration(section?: string): winjs.TPromise<{ [relativeWorkspacePath: string]: model.IConfigFile }> {

		// once: when invoked for the first time we fetch *all* json
		// files using the bulk stats and content routes
		if (!this.bulkFetchFromWorkspacePromise) {
			this.bulkFetchFromWorkspacePromise = this.resolveStat(this.contextService.toResource(this.workspaceSettingsRootFolder)).then((stat) => {
				if (!stat.isDirectory) {
					return winjs.TPromise.as([]);
				}

				return this.resolveContents(stat.children.filter((stat) => paths.extname(stat.resource.fsPath) === '.json').map(stat => stat.resource));
			}, (err) => {
				if (err) {
					return []; // never fail this call
				}
			}).then((contents: IContent[]) => {
				contents.forEach(content => this.workspaceFilePathToConfiguration[this.contextService.toWorkspaceRelativePath(content.resource)] = winjs.TPromise.as(model.newConfigFile(content.value)));
			}, errors.onUnexpectedError);
		}

		// on change: join on *all* configuration file promises so that
		// we can merge them into a single configuration object. this
		// happens whenever a config file changes, is deleted, or added
		return this.bulkFetchFromWorkspacePromise.then(() => {
			return winjs.TPromise.join(this.workspaceFilePathToConfiguration);
		});
	}

	protected reloadAndEmit(): winjs.TPromise<void> {
		return this.reloadConfiguration().then((config) => this.emit(ConfigurationServiceEventTypes.UPDATED, { config: config }));
	}

	private reloadConfiguration(section?: string): winjs.TPromise<any> {
		this.loadConfigurationPromise = null;

		return this.loadConfiguration(section);
	}

	private handleFileEvents(event: Files.FileChangesEvent): void {
		let events = event.changes;
		let affectedByChanges = false;
		for (let i = 0, len = events.length; i < len; i++) {
			let workspacePath = this.contextService.toWorkspaceRelativePath(events[i].resource);
			if (!workspacePath) {
				continue; // event is not inside workspace
			}

			// Handle case where ".vscode" got deleted
			if (workspacePath === this.workspaceSettingsRootFolder && events[i].type === Files.FileChangeType.DELETED) {
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
				case Files.FileChangeType.DELETED:
					affectedByChanges = collections.remove(this.workspaceFilePathToConfiguration, workspacePath);
					break;
				case Files.FileChangeType.UPDATED:
				case Files.FileChangeType.ADDED:
					this.workspaceFilePathToConfiguration[workspacePath] = this.resolveContent(events[i].resource).then(content => model.newConfigFile(content.value), errors.onUnexpectedError);
					affectedByChanges = true;
			}
		}

		if (affectedByChanges) {
			this.reloadAndEmit();
		}
	}
}
