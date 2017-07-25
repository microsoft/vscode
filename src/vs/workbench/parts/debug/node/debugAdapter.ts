/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs = require('fs');
import path = require('path');
import * as nls from 'vs/nls';
import uri from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import * as strings from 'vs/base/common/strings';
import * as objects from 'vs/base/common/objects';
import * as paths from 'vs/base/common/paths';
import * as platform from 'vs/base/common/platform';
import { IJSONSchema, IJSONSchemaSnippet } from 'vs/base/common/jsonSchema';
import { IRawAdapter, IAdapterExecutable, INTERNAL_CONSOLE_OPTIONS_SCHEMA } from 'vs/workbench/parts/debug/common/debug';
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

	public getAdapterExecutable(root: uri, verifyAgainstFS = true): TPromise<IAdapterExecutable> {

		if (this.rawAdapter.adapterExecutableCommand) {
			return this.commandService.executeCommand<IAdapterExecutable>(this.rawAdapter.adapterExecutableCommand, root.toString()).then(ad => {
				return this.verifyAdapterDetails(ad, verifyAgainstFS);
			});
		}

		const adapterExecutable = <IAdapterExecutable>{
			command: this.getProgram(root),
			args: this.getAttributeBasedOnPlatform('args')
		};
		const runtime = this.getRuntime(root);
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

		return TPromise.wrapError(new Error(nls.localize({ key: 'debugAdapterCannotDetermineExecutable', comment: ['Adapter executable file not found'] },
			"Cannot determine executable for debug adapter '{0}'.", details.command)));
	}

	private getRuntime(root: uri): string {
		let runtime = this.getAttributeBasedOnPlatform('runtime');
		if (runtime && runtime.indexOf('./') === 0) {
			runtime = root ? this.configurationResolverService.resolve(root, runtime) : runtime;
			runtime = paths.join(this.extensionDescription.extensionFolderPath, runtime);
		}
		return runtime;
	}

	private getProgram(root: uri): string {
		let program = this.getAttributeBasedOnPlatform('program');
		if (program) {
			program = root ? this.configurationResolverService.resolve(root, program) : program;
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

	public getInitialConfigurationContent(folderUri: uri): TPromise<string> {
		const editorConfig = this.configurationService.getConfiguration<any>();
		if (typeof this.rawAdapter.initialConfigurations === 'string') {
			// Contributed initialConfigurations is a command that needs to be invoked
			// Debug adapter will dynamically provide the full launch.json
			return this.commandService.executeCommand<string>(<string>this.rawAdapter.initialConfigurations, folderUri).then(content => {
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
				description: nls.localize('debugType', "Type of configuration."),
				pattern: '^(?!node2)',
				errorMessage: nls.localize('debugTypeNotRecognised', "The debug type is not recognized. Make sure that you have a corresponding debug extension installed and that it is enabled."),
				patternErrorMessage: nls.localize('node2NotSupported', "\"node2\" is no longer supported, use \"node\" instead and set the \"protocol\" attribute to \"inspector\".")
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
				description: nls.localize('debugServer', "For debug extension development only: if a port is specified VS Code tries to connect to a debug adapter running in server mode"),
				default: 4711
			};
			properties['preLaunchTask'] = {
				type: ['string', 'null'],
				default: null,
				description: nls.localize('debugPrelaunchTask', "Task to run before debug session starts.")
			};
			properties['internalConsoleOptions'] = INTERNAL_CONSOLE_OPTIONS_SCHEMA;

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
			Object.keys(attributes.properties).forEach(name => {
				// Use schema allOf property to get independent error reporting #21113
				attributes.properties[name].pattern = attributes.properties[name].pattern || '^(?!.*\\$\\{(env|config|command)\\.)';
				attributes.properties[name].patternErrorMessage = attributes.properties[name].patternErrorMessage ||
					nls.localize('deprecatedVariables', "'env.', 'config.' and 'command.' are deprecated, use 'env:', 'config:' and 'command:' instead.");
			});

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
