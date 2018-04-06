/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import * as nls from 'vs/nls';
import { TPromise } from 'vs/base/common/winjs.base';
import * as strings from 'vs/base/common/strings';
import * as objects from 'vs/base/common/objects';
import * as paths from 'vs/base/common/paths';
import * as platform from 'vs/base/common/platform';
import { IJSONSchema, IJSONSchemaSnippet } from 'vs/base/common/jsonSchema';
import { IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import { IConfig, IRawAdapter, IAdapterExecutable, INTERNAL_CONSOLE_OPTIONS_SCHEMA, IConfigurationManager } from 'vs/workbench/parts/debug/common/debug';
import { IExtensionDescription } from 'vs/workbench/services/extensions/common/extensions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ICommandService } from 'vs/platform/commands/common/commands';

export class Adapter {

	constructor(private configurationManager: IConfigurationManager, private rawAdapter: IRawAdapter, public extensionDescription: IExtensionDescription,
		@IConfigurationService private configurationService: IConfigurationService,
		@ICommandService private commandService: ICommandService
	) {
		if (rawAdapter.windows) {
			rawAdapter.win = rawAdapter.windows;
		}
	}

	public hasConfigurationProvider = false;

	public getAdapterExecutable(root: IWorkspaceFolder, verifyAgainstFS = true): TPromise<IAdapterExecutable> {

		return this.configurationManager.debugAdapterExecutable(root ? root.uri : undefined, this.rawAdapter.type).then(adapterExecutable => {

			if (adapterExecutable) {
				return this.verifyAdapterDetails(adapterExecutable, verifyAgainstFS);
			}

			// try deprecated command based extension API
			if (this.rawAdapter.adapterExecutableCommand) {
				return this.commandService.executeCommand<IAdapterExecutable>(this.rawAdapter.adapterExecutableCommand, root ? root.uri.toString() : undefined).then(ad => {
					return this.verifyAdapterDetails(ad, verifyAgainstFS);
				});
			}

			// fallback: executable contribution specified in package.json
			adapterExecutable = <IAdapterExecutable>{
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
		});
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
			"Cannot determine executable for debug adapter '{0}'.", this.type)));
	}

	private getRuntime(): string {
		let runtime = this.getAttributeBasedOnPlatform('runtime');
		if (runtime && runtime.indexOf('./') === 0) {
			runtime = paths.join(this.extensionDescription.extensionFolderPath, runtime);
		}
		return runtime;
	}

	private getProgram(): string {
		let program = this.getAttributeBasedOnPlatform('program');
		if (program) {
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

	public getInitialConfigurationContent(initialConfigs?: IConfig[]): TPromise<string> {
		// at this point we got some configs from the package.json and/or from registered DebugConfigurationProviders
		let initialConfigurations = this.rawAdapter.initialConfigurations || [];
		if (initialConfigs) {
			initialConfigurations = initialConfigurations.concat(initialConfigs);
		}

		const configs = JSON.stringify(initialConfigurations, null, '\t').split('\n').map(line => '\t' + line).join('\n').trim();
		const comment1 = nls.localize('launch.config.comment1', "Use IntelliSense to learn about possible attributes.");
		const comment2 = nls.localize('launch.config.comment2', "Hover to view descriptions of existing attributes.");
		const comment3 = nls.localize('launch.config.comment3', "For more information, visit: {0}", 'https://go.microsoft.com/fwlink/?linkid=830387');

		let content = [
			'{',
			`\t// ${comment1}`,
			`\t// ${comment2}`,
			`\t// ${comment3}`,
			`\t"version": "0.2.0",`,
			`\t"configurations": ${configs}`,
			'}'
		].join('\n');

		// fix formatting
		const editorConfig = this.configurationService.getValue<any>();
		if (editorConfig.editor && editorConfig.editor.insertSpaces) {
			content = content.replace(new RegExp('\t', 'g'), strings.repeat(' ', editorConfig.editor.tabSize));
		}

		return TPromise.as(content);
	}

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
				default: '',
				description: nls.localize('debugPrelaunchTask', "Task to run before debug session starts.")
			};
			properties['postDebugTask'] = {
				type: ['string', 'null'],
				default: '',
				description: nls.localize('debugPostDebugTask', "Task to run after debug session ends.")
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
