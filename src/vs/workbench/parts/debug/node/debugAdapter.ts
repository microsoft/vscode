/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs = require('fs');
import path = require('path');
import * as nls from 'vs/nls';
import { TPromise } from 'vs/base/common/winjs.base';
import * as strings from 'vs/base/common/strings';
import * as objects from 'vs/base/common/objects';
import * as paths from 'vs/base/common/paths';
import * as platform from 'vs/base/common/platform';
import { IJSONSchema, IJSONSchemaSnippet } from 'vs/base/common/jsonSchema';
import { IRawAdapter, IAdapterExecutable } from 'vs/workbench/parts/debug/common/debug';
import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { IConfigurationResolverService } from 'vs/workbench/services/configurationResolver/common/configurationResolver';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ICommandService } from 'vs/platform/commands/common/commands';

export class Adapter {

	constructor(private rawAdapter: IRawAdapter, public extensionDescription: IExtensionDescription,
		@IConfigurationResolverService private configurationResolverService: IConfigurationResolverService,
		@IConfigurationService private configurationService: IConfigurationService,
		@ICommandService private commandService: ICommandService
	) {
		if (rawAdapter.windows) {
			rawAdapter.win = rawAdapter.windows;
		}
	}

	public getAdapterExecutable(verifyAgainstFS = true): TPromise<IAdapterExecutable> {

		if (this.rawAdapter.adapterExecutableCommand) {
			return this.commandService.executeCommand<IAdapterExecutable>(this.rawAdapter.adapterExecutableCommand).then(ad => {
				return this.verifyAdapterDetails(ad, verifyAgainstFS);
			});
		}

		const adapterExecutable = <IAdapterExecutable>{
			command: this.getProgram(),
			args: this.getAttributeBasedOnPlatform('args')
		};
		const runtime = this.getRuntime();
		if (runtime) {
			const runtimeArgs = this.getAttributeBasedOnPlatform('runtimeArgs');
			adapterExecutable.args = (runtimeArgs || []).concat([adapterExecutable.command]).concat(adapterExecutable.args || []);
			adapterExecutable.command = runtime;
		}
		return this.verifyAdapterDetails(adapterExecutable, verifyAgainstFS);
	}

	private verifyAdapterDetails(details: IAdapterExecutable, verifyAgainstFS: boolean): TPromise<IAdapterExecutable> {

		if (details.command) {
			if (verifyAgainstFS) {
				if (path.isAbsolute(details.command)) {
					return new TPromise<IAdapterExecutable>((c, e) => {
						fs.exists(details.command, exists => {
							if (exists) {
								c(details);
							} else {
								e(new Error(nls.localize('debugAdapterBinNotFound', "Debug adapter executable '{0}' does not exist.", details.command)));
							}
						});
					});
				} else {
					// relative path
					if (details.command.indexOf('/') < 0 && details.command.indexOf('\\') < 0) {
						// no separators: command looks like a runtime name like 'node' or 'mono'
						return TPromise.as(details);	// TODO: check that the runtime is available on PATH
					}
				}
			} else {
				return TPromise.as(details);
			}
		}

		return TPromise.wrapError(new Error(nls.localize('debugAdapterCannotDetermineExecutable', "Cannot determine executable for debug adapter '{0}'.", details.command)));
	}

	private getRuntime(): string {
		let runtime = this.getAttributeBasedOnPlatform('runtime');
		if (runtime && runtime.indexOf('./') === 0) {
			runtime = this.configurationResolverService ? this.configurationResolverService.resolve(runtime) : runtime;
			runtime = paths.join(this.extensionDescription.extensionFolderPath, runtime);
		}
		return runtime;
	}

	private getProgram(): string {
		let program = this.getAttributeBasedOnPlatform('program');
		if (program) {
			program = this.configurationResolverService ? this.configurationResolverService.resolve(program) : program;
			program = paths.join(this.extensionDescription.extensionFolderPath, program);
		}
		return program;
	}

	public get aiKey(): string {
		return this.rawAdapter.aiKey;
	}

	public get label(): string {
		return this.rawAdapter.label || this.rawAdapter.type;
	}

	public get type(): string {
		return this.rawAdapter.type;
	}

	public get variables(): { [key: string]: string } {
		return this.rawAdapter.variables;
	}

	public get configurationSnippets(): IJSONSchemaSnippet[] {
		return this.rawAdapter.configurationSnippets;
	}

	public get languages(): string[] {
		return this.rawAdapter.languages;
	}

	public get startSessionCommand(): string {
		return this.rawAdapter.startSessionCommand;
	}

	public merge(secondRawAdapter: IRawAdapter, extensionDescription: IExtensionDescription): void {
		// Give priority to built in debug adapters
		if (extensionDescription.isBuiltin) {
			this.extensionDescription = extensionDescription;
		}
		objects.mixin(this.rawAdapter, secondRawAdapter, extensionDescription.isBuiltin);
	}

	public hasInitialConfiguration(): boolean {
		return !!this.rawAdapter.initialConfigurations;
	}

	public getInitialConfigurationContent(): TPromise<string> {
		const editorConfig = this.configurationService.getConfiguration<any>();
		if (typeof this.rawAdapter.initialConfigurations === 'string') {
			// Contributed initialConfigurations is a command that needs to be invoked
			// Debug adapter will dynamically provide the full launch.json
			return this.commandService.executeCommand<string>(<string>this.rawAdapter.initialConfigurations).then(content => {
				// Debug adapter returned the full content of the launch.json - return it after format
				if (editorConfig.editor.insertSpaces) {
					content = content.replace(new RegExp('\t', 'g'), strings.repeat(' ', editorConfig.editor.tabSize));
				}

				return content;
			});
		}

		return TPromise.as(JSON.stringify(
			{
				version: '0.2.0',
				configurations: this.rawAdapter.initialConfigurations || []
			},
			null,
			editorConfig.editor && editorConfig.editor.insertSpaces ? strings.repeat(' ', editorConfig.editor.tabSize) : '\t'
		));
	};

	public getSchemaAttributes(): IJSONSchema[] {
		if (!this.rawAdapter.configurationAttributes) {
			return null;
		}
		// fill in the default configuration attributes shared by all adapters.
		return Object.keys(this.rawAdapter.configurationAttributes).map(request => {
			const attributes: IJSONSchema = this.rawAdapter.configurationAttributes[request];
			const defaultRequired = ['name', 'type', 'request'];
			attributes.required = attributes.required && attributes.required.length ? defaultRequired.concat(attributes.required) : defaultRequired;
			attributes.additionalProperties = false;
			attributes.type = 'object';
			if (!attributes.properties) {
				attributes.properties = {};
			}
			const properties = attributes.properties;
			properties['type'] = {
				enum: [this.type],
				description: nls.localize('debugType', "Type of configuration.")
			};
			properties['name'] = {
				type: 'string',
				description: nls.localize('debugName', "Name of configuration; appears in the launch configuration drop down menu."),
				default: 'Launch'
			};
			properties['request'] = {
				enum: [request],
				description: nls.localize('debugRequest', "Request type of configuration. Can be \"launch\" or \"attach\"."),
			};
			properties['debugServer'] = {
				type: 'number',
				description: nls.localize('debugServer', "For debug extension development only: if a port is specified VS Code tries to connect to a debug adapter running in server mode")
			};
			properties['preLaunchTask'] = {
				type: ['string', 'null'],
				default: null,
				description: nls.localize('debugPrelaunchTask', "Task to run before debug session starts.")
			};
			properties['internalConsoleOptions'] = {
				enum: ['neverOpen', 'openOnSessionStart', 'openOnFirstSessionStart'],
				default: 'openOnFirstSessionStart',
				description: nls.localize('internalConsoleOptions', "Controls behavior of the internal debug console.")
			};

			const osProperties = objects.deepClone(properties);
			properties['windows'] = {
				type: 'object',
				description: nls.localize('debugWindowsConfiguration', "Windows specific launch configuration attributes."),
				properties: osProperties
			};
			properties['osx'] = {
				type: 'object',
				description: nls.localize('debugOSXConfiguration', "OS X specific launch configuration attributes."),
				properties: osProperties
			};
			properties['linux'] = {
				type: 'object',
				description: nls.localize('debugLinuxConfiguration', "Linux specific launch configuration attributes."),
				properties: osProperties
			};

			return attributes;
		});
	}

	private getAttributeBasedOnPlatform(key: string): any {
		let result: any;
		if (platform.isWindows && !process.env.hasOwnProperty('PROCESSOR_ARCHITEW6432') && this.rawAdapter.winx86) {
			result = this.rawAdapter.winx86[key];
		} else if (platform.isWindows && this.rawAdapter.win) {
			result = this.rawAdapter.win[key];
		} else if (platform.isMacintosh && this.rawAdapter.osx) {
			result = this.rawAdapter.osx[key];
		} else if (platform.isLinux && this.rawAdapter.linux) {
			result = this.rawAdapter.linux[key];
		}

		return result || this.rawAdapter[key];
	}
}
