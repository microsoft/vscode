/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


'use strict';

import path = require('path');
import fs = require('fs');
import events = require('events');

import env = require('vs/workbench/electron-main/env');

const dbPath = path.join(env.appHome, 'storage.json');
let database: any = null;

const EventTypes = {
	STORE: 'store'
};

const eventEmitter = new events.EventEmitter();

export function onStore<T>(clb: (key: string, oldValue: T, newValue: T) => void): () => void {
	eventEmitter.addListener(EventTypes.STORE, clb);

	return () => eventEmitter.removeListener(EventTypes.STORE, clb);
}

export function getItem<T>(key: string): T {
	if (!database) {
		database = load();
	}

	return database[key];
}

export function setItem(key: string, data: any): void {
	if (!database) {
		database = load();
	}

	// Shortcut for primitives that did not change
	if (typeof data === 'string' || typeof data === 'number' || typeof data === 'boolean') {
		if (database[key] === data) {
			return;
		}
	}

	let oldValue = database[key];
	database[key] = data;
	save();

	eventEmitter.emit(EventTypes.STORE, key, oldValue, data);
}

export function removeItem(key: string): void {
	if (!database) {
		database = load();
	}

	if (database[key]) {
		let oldValue = database[key];
		delete database[key];
		save();

		eventEmitter.emit(EventTypes.STORE, key, oldValue, null);
	}
}

function load(): any {
	try {
		return JSON.parse(fs.readFileSync(dbPath).toString());
	} catch (error) {
		if (env.cliArgs.verboseLogging) {
			console.error(error);
		}

		return {};
	}
}

function save(): void {
	fs.writeFileSync(dbPath, JSON.stringify(database, null, 4));
}