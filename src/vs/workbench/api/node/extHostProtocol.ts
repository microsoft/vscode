/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {
	createMainContextProxyIdentifier as createMainId,
	createExtHostContextProxyIdentifier as createExtId,
	ProxyIdentifier, IThreadService} from 'vs/workbench/services/thread/common/threadService';

// --- main thread addressable
import {MainThreadCommands} from './mainThreadCommands';
import {MainThreadConfiguration} from './mainThreadConfiguration';
import {MainThreadDiagnostics} from './mainThreadDiagnostics';
import {MainThreadDocuments} from './mainThreadDocuments';
import {MainThreadEditors} from './mainThreadEditors';
import {MainThreadErrors} from './mainThreadErrors';
import {MainThreadLanguageFeatures} from './mainThreadLanguageFeatures';
import {MainThreadLanguages} from './mainThreadLanguages';
import {MainThreadMessageService} from './mainThreadMessageService';
import {MainThreadOutputService} from './mainThreadOutputService';
import {MainThreadQuickOpen} from './mainThreadQuickOpen';
import {MainThreadStatusBar} from './mainThreadStatusBar';
import {MainThreadStorage} from './mainThreadStorage';
import {MainThreadTelemetry} from './mainThreadTelemetry';
import {MainThreadWorkspace} from './mainThreadWorkspace';
import {MainProcessExtensionService} from './mainThreadExtensionService';

// --- ext host addressable
import {ExtHostCommands} from './extHostCommands';
import {ExtHostConfiguration} from './extHostConfiguration';
import {ExtHostDiagnostics} from './extHostDiagnostics';
import {ExtHostDocuments} from './extHostDocuments';
import {ExtHostEditors} from './extHostEditors';
import {ExtHostFileSystemEventService} from './extHostFileSystemEventService';
import {ExtHostLanguageFeatures} from './extHostLanguageFeatures';
import {ExtHostQuickOpen} from './extHostQuickOpen';
import {ExtHostExtensionService} from './extHostExtensionService';

let mainCounter = 0;
export const MainContext = {
	MainThreadCommands: createMainId<MainThreadCommands>(++mainCounter),
	MainThreadConfiguration: createMainId<MainThreadConfiguration>(++mainCounter),
	MainThreadDiagnostics: createMainId<MainThreadDiagnostics>(++mainCounter),
	MainThreadDocuments: createMainId<MainThreadDocuments>(++mainCounter),
	MainThreadEditors: createMainId<MainThreadEditors>(++mainCounter),
	MainThreadErrors: createMainId<MainThreadErrors>(++mainCounter),
	MainThreadLanguageFeatures: createMainId<MainThreadLanguageFeatures>(++mainCounter),
	MainThreadLanguages: createMainId<MainThreadLanguages>(++mainCounter),
	MainThreadMessageService: createMainId<MainThreadMessageService>(++mainCounter),
	MainThreadOutputService: createMainId<MainThreadOutputService>(++mainCounter),
	MainThreadQuickOpen: createMainId<MainThreadQuickOpen>(++mainCounter),
	MainThreadStatusBar: createMainId<MainThreadStatusBar>(++mainCounter),
	MainThreadStorage: createMainId<MainThreadStorage>(++mainCounter),
	MainThreadTelemetry: createMainId<MainThreadTelemetry>(++mainCounter),
	MainThreadWorkspace: createMainId<MainThreadWorkspace>(++mainCounter),
	MainProcessExtensionService: createMainId<MainProcessExtensionService>(++mainCounter),
};

let extCounter = 0;
export const ExtHostContext = {
	ExtHostCommands: createExtId<ExtHostCommands>(++extCounter),
	ExtHostConfiguration: createExtId<ExtHostConfiguration>(++extCounter),
	ExtHostDiagnostics: createExtId<ExtHostDiagnostics>(++extCounter),
	ExtHostDocuments: createExtId<ExtHostDocuments>(++extCounter),
	ExtHostEditors: createExtId<ExtHostEditors>(++extCounter),
	ExtHostFileSystemEventService: createExtId<ExtHostFileSystemEventService>(++extCounter),
	ExtHostLanguageFeatures: createExtId<ExtHostLanguageFeatures>(++extCounter),
	ExtHostQuickOpen: createExtId<ExtHostQuickOpen>(++extCounter),
	ExtHostExtensionService: createExtId<ExtHostExtensionService>(++extCounter),
};

export interface InstanceSetter<T> {
	set(instance:T): T;
}

export class InstanceCollection {
	private _items: {[id:string]:any;};

	constructor() {
		this._items = Object.create(null);
	}

	public define<T>(id:ProxyIdentifier<T>): InstanceSetter<T> {
		let that = this;
		return new class {
			set(value:T) {
				that._set(id, value);
				return value;
			}
		};
	}

	_set<T>(id:ProxyIdentifier<T>, value:T): void {
		this._items[id.id] = value;
	}

	public finish(isMain:boolean, threadService:IThreadService): void {
		let expected = (isMain ? MainContext : ExtHostContext);
		Object.keys(expected).forEach((key) => {
			let id = expected[key];
			let value = this._items[id.id];

			if (!value) {
				throw new Error(`Missing actor ${key} (isMain: ${id.isMain}, id:  ${id.id})`);
			}
			threadService.set<any>(id, value);
		});
	}
}
