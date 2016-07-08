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
import {IDisposable} from 'vs/base/common/lifecycle';
import {readFile, writeFile} from 'vs/base/node/pfs';
import {JSONPath} from 'vs/base/common/json';
import {applyEdits} from 'vs/base/common/jsonFormatter';
import {setProperty} from 'vs/base/common/jsonEdit';

export class ConfigurationService extends CommonConfigurationService {

	public _serviceBrand: any;

	protected contextService: IWorkspaceContextService;
	private toDispose: IDisposable;

	constructor(contextService: IWorkspaceContextService, eventService: IEventService) {
		super(contextService, eventService);

		this.registerListeners();
	}

	protected registerListeners(): void {
		super.registerListeners();

		this.toDispose = this.eventService.addListener2(EventType.WORKBENCH_OPTIONS_CHANGED, (e) => this.onOptionsChanged(e));
	}

	private onOptionsChanged(e: OptionsChangeEvent): void {
		if (e.key === 'globalSettings') {
			this.handleConfigurationChange();
		}
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
		return readFile(resource.fsPath).then(contents => ({resource, value: contents.toString()}));
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

	protected loadWorkspaceConfiguration(section?: string): TPromise<{ [relativeWorkspacePath: string]: IConfigFile }> {

		// Return early if we don't have a workspace
		if (!this.contextService.getWorkspace()) {
			return TPromise.as({});
		}

		return super.loadWorkspaceConfiguration(section);
	}

	protected loadGlobalConfiguration(): { contents: any; parseErrors?: string[]; } {
		const defaults = super.loadGlobalConfiguration();
		const globalSettings = this.contextService.getOptions().globalSettings;

		return {
			contents: objects.mixin(
				objects.clone(defaults.contents),	// target: default values (but don't modify!)
				globalSettings.settings,			// source: global configured values
				true								// overwrite
			),
			parseErrors: globalSettings.settingsParseErrors
		};
	}

	public setUserConfiguration(key: any, value: any) : Thenable<void> {
		let appSettingsPath = this.contextService.getConfiguration().env.appSettingsPath;
		return readFile(appSettingsPath, 'utf8').then(content => {
			let {tabSize, insertSpaces} = this.getConfiguration<{ tabSize: number; insertSpaces: boolean }>('editor');
			let path: JSONPath = typeof key === 'string' ? (<string> key).split('.') : <JSONPath> key;
			let edits = setProperty(content, path, value, {insertSpaces, tabSize, eol: '\n'});
			content = applyEdits(content, edits);
			return writeFile(appSettingsPath, content, 'utf8');
		});
	}

	public dispose(): void {
		super.dispose();

		this.toDispose.dispose();
	}
}