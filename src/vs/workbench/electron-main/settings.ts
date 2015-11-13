/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


'use strict';

import fs = require('fs');
import events = require('events');
import path = require('path');
import app = require('app');

import env = require('vs/workbench/electron-main/env');
import json = require('vs/base/common/json');
import objects = require('vs/base/common/objects');

const eventEmitter = new events.EventEmitter();

const EventTypes = {
	CHANGE: 'change'
};

export interface ISettings {
	settings: any;
	settingsParseErrors?: string[];
	keybindings: any
}

export function onChange<T>(clb: (settings: ISettings) => void): () => void {
	eventEmitter.addListener(EventTypes.CHANGE, clb);

	return () => eventEmitter.removeListener(EventTypes.CHANGE, clb);
}

export class SettingsManager {

	private static CHANGE_BUFFER_DELAY = 300;

	private timeoutHandle: number;
	public globalSettings: ISettings;

	constructor() {
		this.registerWatchers();
	}

	public getValue(key: string, fallback?:any): any {
		if (!key) {
			return fallback;
		}

		let value = this.globalSettings.settings;

		let parts = key.split('\.');
		while (parts.length && value) {
			let part = parts.shift();
			value = value[part];
		}

		return typeof value !== 'undefined' ? value : fallback;
	}

	private registerWatchers(): void {
		let watcher = fs.watch(path.dirname(env.appSettingsPath));
		watcher.on('change', (eventType: string, fileName: string) => this.onSettingsFileChange(eventType, fileName));

		app.on('will-quit', () => {
			watcher.close();
		});
	}

	private onSettingsFileChange(eventType: string, fileName: string): void {

		// we can get multiple change events for one change, so we buffer through a timeout
		if (this.timeoutHandle) {
			global.clearTimeout(this.timeoutHandle);
			delete this.timeoutHandle;
		}

		this.timeoutHandle = global.setTimeout(() => {

			// Reload
			let didChange = this.load();

			// Emit event
			if (didChange) {
				eventEmitter.emit(EventTypes.CHANGE, this.globalSettings);
			}

		}, SettingsManager.CHANGE_BUFFER_DELAY);
	}

	public load(): boolean {
		let loadedSettings = this.doLoad();
		if (!objects.equals(loadedSettings, this.globalSettings)) {

			// Keep in class
			this.globalSettings = loadedSettings;

			// Store into global so that any renderer can access the value with remote.getGlobal()
			global.globalSettingsValue = JSON.stringify(this.globalSettings);

			return true; // changed value
		}

		return false; // no changed value
	}

	private doLoad(): ISettings {
		let settings = this.doLoadSettings();

		return {
			settings: settings.contents,
			settingsParseErrors: settings.parseErrors,
			keybindings: this.doLoadKeybindings()
		};
	}

	private doLoadSettings(): { contents: any; parseErrors?: string[]; } {

		function setNode(root: any, key: string, value: any): any {
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


		try {
			let root = {};
			let content = '{}';
			try {
				content = fs.readFileSync(env.appSettingsPath).toString();
			} catch (error) {
				// ignore
			}

			let contents = json.parse(content) || {};
			for (let key in contents) {
				setNode(root, key, contents[key]);
			}
			return {
				contents: root
			};
		} catch (error) {
			// parse problem
			return {
				contents: {},
				parseErrors: [env.appSettingsPath]
			};
		}
	}

	private doLoadKeybindings(): any {
		try {
			return json.parse(fs.readFileSync(env.appKeybindingsPath).toString());
		} catch (error) {
			// Ignore loading and parsing errors
		}

		return [];
	}
}

export const manager = new SettingsManager();