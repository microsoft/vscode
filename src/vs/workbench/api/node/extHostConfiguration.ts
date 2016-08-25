/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {mixin} from 'vs/base/common/objects';
import {illegalState} from 'vs/base/common/errors';
import Event, {Emitter} from 'vs/base/common/event';
import {WorkspaceConfiguration} from 'vscode';
import {ExtHostConfigurationShape, MainContext, MainThreadConfigurationShape} from './extHost.protocol';
import {IThreadService} from 'vs/workbench/services/thread/common/threadService';

export class ExtHostConfiguration extends ExtHostConfigurationShape {

	private _proxy: MainThreadConfigurationShape;
	private _hasConfig: boolean;
	private _config: any;
	private _onDidChangeConfiguration: Emitter<void>;

	constructor(threadService: IThreadService) {
		super();
		this._proxy = threadService.get(MainContext.MainThreadConfiguration);
		this._onDidChangeConfiguration = new Emitter<void>();
	}

	get onDidChangeConfiguration(): Event<void> {
		return this._onDidChangeConfiguration && this._onDidChangeConfiguration.event;
	}

	public $acceptConfigurationChanged(config: any) {
		this._config = config;
		this._hasConfig = true;
		this._onDidChangeConfiguration.fire(undefined);
	}

	public getConfiguration(section?: string): WorkspaceConfiguration {
		if (!this._hasConfig) {
			throw illegalState('missing config');
		}

		const config = section
			? ExtHostConfiguration._lookUp(section, this._config)
			: this._config;

		const result: WorkspaceConfiguration = {
			has(key: string): boolean {
				return typeof ExtHostConfiguration._lookUp(key, config) !== 'undefined';
			},
			get<T>(key: string, defaultValue?: T): T {
				let result = ExtHostConfiguration._lookUp(key, config);
				if (typeof result === 'undefined') {
					result = defaultValue;
				}
				return result;
			}
		};

		if (typeof config === 'object') {
			mixin(result, config, false);
		}

		return Object.freeze(result);
	}

	private static _lookUp(section: string, config: any) {
		if (!section) {
			return;
		}
		let parts = section.split('.');
		let node = config;
		while (node && parts.length) {
			node = node[parts.shift()];
		}

		return node;
	}
}
