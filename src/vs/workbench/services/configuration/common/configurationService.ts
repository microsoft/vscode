/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import nls = require('vs/nls');
import {TPromise, Promise} from 'vs/base/common/winjs.base';
import uri from 'vs/base/common/uri';
import strings = require('vs/base/common/strings');
import platform = require('vs/base/common/platform');
import paths = require('vs/base/common/paths');
import extfs = require('vs/base/node/extfs');
import {IConfigFile} from 'vs/platform/configuration/common/model';
import objects = require('vs/base/common/objects');
import {IStat, IContent, ConfigurationService as CommonConfigurationService} from 'vs/platform/configuration/common/configurationService';
import {IWorkspaceContextService} from 'vs/workbench/services/workspace/common/contextService';
import {OptionsChangeEvent, EventType} from 'vs/workbench/common/events';
import {IEventService} from 'vs/platform/event/common/event';
import {IMessageService} from 'vs/platform/message/common/message';
import {IConfigurationService} from 'vs/platform/configuration/common/configuration';
import severity from 'vs/base/common/severity';

import fs = require('fs');
import flow = require('vs/base/node/flow');

export class ConfigurationService extends CommonConfigurationService {

	public serviceId = IConfigurationService;
	protected contextService: IWorkspaceContextService;
	private toDispose: Function;

	constructor(contextService: IWorkspaceContextService, eventService: IEventService) {
		super(contextService, eventService);
		this.registerListeners();
	}

	protected resolveContents(resources: uri[]): TPromise<IContent[]> {
		let contents: IContent[] = [];

		return Promise.join(resources.map((resource) => {
			return this.resolveContent(resource).then((content) => {
				contents.push(content);
			});
		})).then(() => contents);
	}

	protected resolveContent(resource: uri): TPromise<IContent> {
		return new TPromise<IContent>((c, e) => {
			fs.readFile(resource.fsPath, (error, contents) => {
				if (error) {
					e(error);
				} else {
					c({
						resource: resource,
						value: contents.toString()
					});
				}
			});
		});
	}

	protected resolveStat(resource: uri): TPromise<IStat> {
		return new TPromise<IStat>((c, e) => {
			extfs.readdir(resource.fsPath, (error, childs) => {
				if (error) {
					if ((<any>error).code === 'ENOTDIR') {
						c({
							resource: resource,
							isDirectory: false
						});
					} else {
						e(error);
					}
				} else {
					c({
						resource: resource,
						isDirectory: true,
						children: childs.map((child) => {
							if (platform.isMacintosh) {
								child = strings.normalizeNFC(child); // Mac: uses NFD unicode form on disk, but we want NFC
							}

							return {
								resource: uri.file(paths.join(resource.fsPath, child))
							};
						})
					});
				}
			});
		});
	}

	// TODO@Ben migration: remove this code after some versions
	protected migrateSettingsOnce(): TPromise<void> {
		return TPromise.as<void>(null);
	}

	private registerListeners(): void {
		this.toDispose = this.eventService.addListener(EventType.WORKBENCH_OPTIONS_CHANGED, (e) => this.onOptionsChanged(e));
	}

	private onOptionsChanged(e: OptionsChangeEvent): void {
		if (e.key === 'globalSettings') {
			this.reloadAndEmit();
		}
	}

	protected loadWorkspaceConfiguration(section?: string): TPromise<{ [relativeWorkspacePath: string]: IConfigFile }> {

		// Return early if we dont have a workspace
		if (!this.contextService.getWorkspace()) {
			return Promise.as({});
		}

		// Migrate as needed (.settings => .vscode)
		return this.migrateSettingsOnce().then(() => super.loadWorkspaceConfiguration(section));
	}

	protected loadGlobalConfiguration(): TPromise<{ contents: any; parseErrors?: string[]; }> {
		return super.loadGlobalConfiguration().then((defaults) => {
			let globalSettings = this.contextService.getOptions().globalSettings;
			return {
				contents: objects.mixin(
					objects.clone(defaults.contents),	// target: default values (but dont modify!)
					globalSettings.settings,			// source: global configured values
					true								// overwrite
				),
				parseErrors: globalSettings.settingsParseErrors
			};
		});
	}

	public dispose(): void {
		this.toDispose();
	}
}

export class MigrationConfigurationService extends ConfigurationService {

	protected messageService: IMessageService;
	private settingsMigrationPromise: TPromise<void>;

	constructor(contextService: IWorkspaceContextService, eventService: IEventService, messageService: IMessageService) {
		super(contextService, eventService);
		this.messageService = messageService;
	}

	// TODO@Ben migration: remove this code after some versions
	protected migrateSettingsOnce(): TPromise<void> {
		if (!this.settingsMigrationPromise) {
			this.settingsMigrationPromise = new TPromise<void>((c, e) => {
				let newSettingsFolder = this.contextService.toResource(this.workspaceSettingsRootFolder).fsPath;
				let oldSettingsFolder = this.contextService.toResource('.settings').fsPath;

				return fs.exists(newSettingsFolder, (exists) => {
					if (exists) {
						return c(null); // we never migrate more than once
					}

					return extfs.readdir(oldSettingsFolder, (error, children) => {
						if (error) {
							return c(null); // old .settings folder does not exist or is a file
						}

						let knownSettingsFiles = ['team.settings.json', 'settings.json', 'tasks.json', 'launch.json', 'team.tasks.json', 'team.launch.json'];
						let filesToMove: string[] = [];
						children.forEach(child => {
							if (knownSettingsFiles.some(f => child === f)) {
								filesToMove.push(child);
							}
						});

						if (filesToMove.length === 0) {
							return c(null); // .settings folder does not contain files we expect
						}

						return fs.mkdir(newSettingsFolder, (error) => {
							if (error) {
								return c(null); // abort if we cannot create the new settings folder
							}

							return flow.loop(filesToMove, (fileToMove, callback) => {
								return fs.rename(paths.join(oldSettingsFolder, fileToMove), paths.join(newSettingsFolder, fileToMove), (error) => {
									callback(null, null); // ignore any errors
								});
							}, () => {
								this.messageService.show(severity.Info, nls.localize('settingsMigrated', "VSCode is now using a top level '.vscode' folder to store settings. We moved your existing settings files from the '.settings' folder."));

								return extfs.readdir(oldSettingsFolder, (error, children) => {
									if (error || children.length > 0) {
										return c(null); // done
									}

									return fs.rmdir(oldSettingsFolder, () => {
										return c(null);
									});
								});
							})
						});
					});
				});
			});
		}

		return this.settingsMigrationPromise;
	}
}