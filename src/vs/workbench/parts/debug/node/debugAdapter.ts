/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import paths = require('vs/base/common/paths');
import platform = require('vs/base/common/platform');
import debug = require('vs/workbench/parts/debug/common/debug');
import { SystemVariables } from 'vs/workbench/parts/lib/node/systemVariables';

export class Adapter {

	public runtime: string;
	public program: string;
	public runtimeArgs: string[];
	public args: string[];
	public type: string;
	private _label: string;
	private configurationAttributes: any;
	public initialConfigurations: any[];
	public enableBreakpointsFor: { languageIds: string[] };

	constructor(rawAdapter: debug.IRawAdapter, systemVariables: SystemVariables, extensionFolderPath: string) {

		if (platform.isWindows && rawAdapter.win) {
			this.runtime = rawAdapter.win.runtime;
			this.runtimeArgs = rawAdapter.win.runtimeArgs;
			this.program = rawAdapter.win.program;
			this.args = rawAdapter.win.args;
		}
		if (platform.isMacintosh && rawAdapter.osx) {
			this.runtime = rawAdapter.osx.runtime;
			this.runtimeArgs = rawAdapter.osx.runtimeArgs;
			this.program = rawAdapter.osx.program;
			this.args = rawAdapter.osx.args;
		}
		if (platform.isLinux && rawAdapter.linux) {
			this.runtime = rawAdapter.linux.runtime;
			this.runtimeArgs = rawAdapter.linux.runtimeArgs;
			this.program = rawAdapter.linux.program;
			this.args = rawAdapter.linux.args;
		}

		this.runtime = this.runtime || rawAdapter.runtime;
		this.runtimeArgs = this.runtimeArgs || rawAdapter.runtimeArgs;
		this.program = this.program || rawAdapter.program;
		this.args = this.args || rawAdapter.args;

		if (this.program) {
			this.program = systemVariables ? systemVariables.resolve(this.program) : this.program;
			this.program = paths.join(extensionFolderPath, this.program);
		}
		if (this.runtime && this.runtime.indexOf('./') === 0) {
			this.runtime = systemVariables ? systemVariables.resolve(this.runtime) : this.runtime;
			this.runtime = paths.join(extensionFolderPath, this.runtime);
		}

		this.type = rawAdapter.type;
		this.configurationAttributes = rawAdapter.configurationAttributes;
		this.initialConfigurations = rawAdapter.initialConfigurations;
		this._label = rawAdapter.label;
		this.enableBreakpointsFor = rawAdapter.enableBreakpointsFor;
	}

	public get label() {
		return this._label || this.type;
	}

	public getSchemaAttributes(): any[] {
		// Fill in the default configuration attributes shared by all adapters.
		if (this.configurationAttributes) {
			return Object.keys(this.configurationAttributes).map(request => {
				const attributes = this.configurationAttributes[request];
				const defaultRequired = ['name', 'type', 'request'];
				attributes["required"] = attributes["required"] && attributes["required"].length ? defaultRequired.concat(attributes["required"]) : defaultRequired;
				attributes['additionalProperties'] = false;
				attributes['type'] = 'object';
				if (!attributes['properties']) {
					attributes['properties'] = { };
				}
				attributes['properties']['type'] = {
					enum: [this.type],
					description: 'Type of configuration.',
				};
				attributes['properties']['name'] = {
					type: 'string',
					description: 'Name of configuration; appears in the launch configuration drop down menu.',
					default: 'Launch'
				};
				attributes['properties']['request'] = {
					enum: [request],
					description: 'Request type of configuration. Can be "launch" or "attach".',
				};
				attributes['properties']['preLaunchTask'] = {
					type: 'string',
					description: 'Task to run before debug session starts.'
				};

				return attributes;
			});
		}

		return null;
	}
}
