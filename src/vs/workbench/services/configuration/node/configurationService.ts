/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
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
import {IConfigurationService} from 'vs/platform/configuration/common/configuration';

import fs = require('fs');

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

		return TPromise.join(resources.map((resource) => {
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
			extfs.readdir(resource.fsPath, (error, children) => {
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
						children: children.map((child) => {
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

	private registerListeners(): void {
		this.toDispose = this.eventService.addListener(EventType.WORKBENCH_OPTIONS_CHANGED, (e) => this.onOptionsChanged(e));
	}

	private onOptionsChanged(e: OptionsChangeEvent): void {
		if (e.key === 'globalSettings') {
			this.reloadAndEmit();
		}
	}

	protected loadWorkspaceConfiguration(section?: string): TPromise<{ [relativeWorkspacePath: string]: IConfigFile }> {

		// Return early if we don't have a workspace
		if (!this.contextService.getWorkspace()) {
			return TPromise.as({});
		}

		// Migrate as needed (.settings => .vscode)
		return super.loadWorkspaceConfiguration(section);
	}

	protected loadGlobalConfiguration(): TPromise<{ contents: any; parseErrors?: string[]; }> {
		return super.loadGlobalConfiguration().then((defaults) => {
			let globalSettings = this.contextService.getOptions().globalSettings;
			return {
				contents: objects.mixin(
					objects.clone(defaults.contents),	// target: default values (but don't modify!)
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