/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {
	createMainContextProxyIdentifier as createMainId,
	createExtHostContextProxyIdentifier as createExtId,
	ProxyIdentifier, IThreadService} from 'vs/platform/thread/common/thread';

import {MainProcessVSCodeAPIHelper} from './extHost.api.impl';
import {ExtHostCommands, MainThreadCommands} from './extHostCommands';
import {ExtHostConfiguration, MainThreadConfiguration} from './extHostConfiguration';
import {ExtHostDiagnostics, MainThreadDiagnostics} from './extHostDiagnostics';
import {ExtHostModelService, MainThreadDocuments} from './extHostDocuments';
import {ExtHostEditors, MainThreadEditors} from './extHostEditors';
import {ExtHostFileSystemEventService} from './extHostFileSystemEventService';
import {ExtHostLanguageFeatures, MainThreadLanguageFeatures} from './extHostLanguageFeatures';
import {MainThreadLanguages} from './extHostLanguages';
import {MainThreadMessageService} from './extHostMessageService';
import {MainThreadOutputService} from './extHostOutputService';
import {ExtHostQuickOpen, MainThreadQuickOpen} from './extHostQuickOpen';
import {MainThreadStatusBar} from './extHostStatusBar';
import {MainThreadStorage} from './extHostStorage';
import {MainThreadTelemetry} from './extHostTelemetry';
import {MainThreadWorkspace} from './extHostWorkspace';
import {ExtHostExtensionService, MainProcessExtensionService} from './nativeExtensionService';

let mainCounter = 0;
export const MainContext = {
	MainProcessVSCodeAPIHelper: createMainId<MainProcessVSCodeAPIHelper>(++mainCounter),
	MainThreadCommands: createMainId<MainThreadCommands>(++mainCounter),
	MainThreadConfiguration: createMainId<MainThreadConfiguration>(++mainCounter),
	MainThreadDiagnostics: createMainId<MainThreadDiagnostics>(++mainCounter),
	MainThreadDocuments: createMainId<MainThreadDocuments>(++mainCounter),
	MainThreadEditors: createMainId<MainThreadEditors>(++mainCounter),
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
	ExtHostModelService: createExtId<ExtHostModelService>(++extCounter),
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
