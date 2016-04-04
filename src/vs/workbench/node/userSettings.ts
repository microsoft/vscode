/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


'use strict';

import fs = require('fs');
import path = require('path');

import json = require('vs/base/common/json');
import objects = require('vs/base/common/objects');
import {TPromise} from 'vs/base/common/winjs.base';
import Event, {Emitter} from 'vs/base/common/event';
import {IWorkspaceContextService} from 'vs/workbench/services/workspace/common/contextService';

export interface ISettings {
	settings: any;
	settingsParseErrors?: string[];
	keybindings: any;
}

export class UserSettings {

	private static CHANGE_BUFFER_DELAY = 300;

	public globalSettings: ISettings;

	private timeoutHandle: number;
	private watcher: fs.FSWatcher;
	private appSettingsPath: string;
	private appKeybindingsPath: string;

	private _onChange: Emitter<ISettings>;

	constructor(appSettingsPath: string, appKeybindingsPath: string) {
		this.appSettingsPath = appSettingsPath;
		this.appKeybindingsPath = appKeybindingsPath;
		this._onChange = new Emitter<ISettings>();

		this.registerWatchers();
	}

	public static getValue(contextService: IWorkspaceContextService, key: string, fallback?: any): TPromise<any> {
		return new TPromise((c, e) => {
			const appSettingsPath = contextService.getConfiguration().env.appSettingsPath;

			fs.readFile(appSettingsPath, (error /* ignore */, fileContents) => {
				let root = Object.create(null);
				let content = fileContents ? fileContents.toString() : '{}';

				let contents = Object.create(null);
				try {
					contents = json.parse(content);
				} catch (error) {
					// ignore parse problem
				}

				for (let key in contents) {
					UserSettings.setNode(root, key, contents[key]);
				}

				return c(UserSettings.doGetValue(root, key, fallback));
			});
		});
	}

	public get onChange(): Event<ISettings> {
		return this._onChange.event;
	}

	public getValue(key: string, fallback?: any): any {
		return UserSettings.doGetValue(this.globalSettings.settings, key, fallback);
	}

	private static doGetValue(globalSettings: any, key: string, fallback?: any): any {
		if (!key) {
			return fallback;
		}

		let value = globalSettings;

		let parts = key.split('\.');
		while (parts.length && value) {
			let part = parts.shift();
			value = value[part];
		}

		return typeof value !== 'undefined' ? value : fallback;
	}

	private registerWatchers(): void {
		this.watcher = fs.watch(path.dirname(this.appSettingsPath));
		this.watcher.on('change', (eventType: string, fileName: string) => this.onSettingsFileChange(eventType, fileName));
	}

	private onSettingsFileChange(eventType: string, fileName: string): void {

		// we can get multiple change events for one change, so we buffer through a timeout
		if (this.timeoutHandle) {
			global.clearTimeout(this.timeoutHandle);
			this.timeoutHandle = null;
		}

		this.timeoutHandle = global.setTimeout(() => {

			// Reload
			let didChange = this.loadSync();

			// Emit event
			if (didChange) {
				this._onChange.fire(this.globalSettings);
			}

		}, UserSettings.CHANGE_BUFFER_DELAY);
	}

	public loadSync(): boolean {
		let loadedSettings = this.doLoadSync();
		if (!objects.equals(loadedSettings, this.globalSettings)) {

			// Keep in class
			this.globalSettings = loadedSettings;

			return true; // changed value
		}

		return false; // no changed value
	}

	private doLoadSync(): ISettings {
		let settings = this.doLoadSettingsSync();

		return {
			settings: settings.contents,
			settingsParseErrors: settings.parseErrors,
			keybindings: this.doLoadKeybindingsSync()
		};
	}

	private doLoadSettingsSync(): { contents: any; parseErrors?: string[]; } {
		let root = Object.create(null);
		let content = '{}';
		try {
			content = fs.readFileSync(this.appSettingsPath).toString();
		} catch (error) {
			// ignore
		}

		let contents = Object.create(null);
		try {
			contents = json.parse(content);
		} catch (error) {
			// parse problem
			return {
				contents: Object.create(null),
				parseErrors: [this.appSettingsPath]
			};
		}

		for (let key in contents) {
			UserSettings.setNode(root, key, contents[key]);
		}

		return {
			contents: root
		};
	}

	private static setNode(root: any, key: string, value: any): any {
		let segments = key.split('.');
		let last = segments.pop();

		let curr = root;
		segments.forEach((s) => {
			let obj = curr[s];
			switch (typeof obj) {
				case 'undefined':
					obj = curr[s] = {};
					break;
				case 'object':
					break;
				default:
					console.log('Conflicting user settings: ' + key + ' at ' + s + ' with ' + JSON.stringify(obj));
			}
			curr = obj;
		});
		curr[last] = value;
	}

	private doLoadKeybindingsSync(): any {
		try {
			return json.parse(fs.readFileSync(this.appKeybindingsPath).toString());
		} catch (error) {
			// Ignore loading and parsing errors
		}

		return [];
	}

	public dispose(): void {
		if (this.watcher) {
			this.watcher.close();
			this.watcher = null;
		}
	}
}