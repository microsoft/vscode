/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { Client as TelemetryClient } from 'vs/base/parts/ipc/node/ipc.cp';
import * as strings from 'vs/base/common/strings';
import * as objects from 'vs/base/common/objects';
import { TelemetryAppenderClient } from 'vs/platform/telemetry/node/telemetryIpc';
import { IJSONSchema, IJSONSchemaSnippet } from 'vs/base/common/jsonSchema';
import { IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import { IConfig, IDebuggerContribution, IDebugAdapterExecutable, INTERNAL_CONSOLE_OPTIONS_SCHEMA, IConfigurationManager, IDebugAdapter, IDebugConfiguration, ITerminalSettings, IDebugger, IDebugSession, IAdapterDescriptor, IDebugAdapterServer } from 'vs/workbench/parts/debug/common/debug';
import { IExtensionDescription } from 'vs/workbench/services/extensions/common/extensions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IOutputService } from 'vs/workbench/parts/output/common/output';
import { ExecutableDebugAdapter, SocketDebugAdapter } from 'vs/workbench/parts/debug/node/debugAdapter';
import { IConfigurationResolverService } from 'vs/workbench/services/configurationResolver/common/configurationResolver';
import * as ConfigurationResolverUtils from 'vs/workbench/services/configurationResolver/common/configurationResolverUtils';
import { TelemetryService } from 'vs/platform/telemetry/common/telemetryService';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { memoize } from 'vs/base/common/decorators';
import { TaskDefinitionRegistry } from 'vs/workbench/parts/tasks/common/taskDefinitionRegistry';
import { getPathFromAmdModule } from 'vs/base/common/amd';
import { ITextResourcePropertiesService } from 'vs/editor/common/services/resourceConfiguration';
import { URI } from 'vs/base/common/uri';
import { Schemas } from 'vs/base/common/network';

export class Debugger implements IDebugger {

	private mergedExtensionDescriptions: IExtensionDescription[];

	constructor(private configurationManager: IConfigurationManager, private debuggerContribution: IDebuggerContribution, public extensionDescription: IExtensionDescription,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ITextResourcePropertiesService private readonly resourcePropertiesService: ITextResourcePropertiesService,
		@ICommandService private readonly commandService: ICommandService,
		@IConfigurationResolverService private readonly configurationResolverService: IConfigurationResolverService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
	) {
		this.mergedExtensionDescriptions = [extensionDescription];
	}

	public createDebugAdapter(session: IDebugSession, outputService: IOutputService): Promise<IDebugAdapter> {
		return this.configurationManager.activateDebuggers('onDebugAdapterProtocolTracker', this.type).then(_ => {
			if (this.inExtHost()) {
				const da = this.configurationManager.createDebugAdapter(session);
				if (da) {
					return Promise.resolve(da);
				}
				throw new Error(nls.localize('cannot.find.da', "Cannot find debug adapter for type '{0}'.", this.type));
			} else {
				return this.getAdapterDescriptor(session).then(adapterDescriptor => {
					switch (adapterDescriptor.type) {
						case 'executable':
							return new ExecutableDebugAdapter(adapterDescriptor, this.type, outputService);
						case 'server':
							return new SocketDebugAdapter(adapterDescriptor);
						case 'implementation':
							// TODO@AW: this.inExtHost() should now return true
							return Promise.resolve(this.configurationManager.createDebugAdapter(session));
						default:
							throw new Error('unknown descriptor type');
					}
				}).catch(err => {
					if (err && err.message) {
						throw new Error(nls.localize('cannot.create.da.with.err', "Cannot create debug adapter ({0}).", err.message));
					} else {
						throw new Error(nls.localize('cannot.create.da', "Cannot create debug adapter."));
					}
				});
			}
		});
	}

	private getAdapterDescriptor(session: IDebugSession): Promise<IAdapterDescriptor> {

		// a "debugServer" attribute in the launch config takes precedence
		if (typeof session.configuration.debugServer === 'number') {
			return Promise.resolve(<IDebugAdapterServer>{
				type: 'server',
				port: session.configuration.debugServer
			});
		}

		// try the new "createDebugAdapterDescriptor" and the deprecated "provideDebugAdapter" API
		return this.configurationManager.getDebugAdapterDescriptor(session).then(adapter => {

			if (adapter) {
				return adapter;
			}

			// try deprecated command based extension API "adapterExecutableCommand" to determine the executable
			if (this.debuggerContribution.adapterExecutableCommand) {
				console.info('debugAdapterExecutable attribute in package.json is deprecated and support for it will be removed soon; please use DebugAdapterDescriptorFactory.createDebugAdapterDescriptor instead.');
				const rootFolder = session.root ? session.root.uri.toString() : undefined;
				return this.commandService.executeCommand<IDebugAdapterExecutable>(this.debuggerContribution.adapterExecutableCommand, rootFolder).then((ae: { command: string, args: string[] }) => {
					return <IAdapterDescriptor>{
						type: 'executable',
						command: ae.command,
						args: ae.args || []
					};
				});
			}

			// fallback: use executable information from package.json
			const ae = ExecutableDebugAdapter.platformAdapterExecutable(this.mergedExtensionDescriptions, this.type);
			if (ae === undefined) {
				throw new Error('no executable specified in package.json');
			}
			return ae;
		});
	}

	substituteVariables(folder: IWorkspaceFolder, config: IConfig): Promise<IConfig> {
		if (this.inExtHost()) {
			return this.configurationManager.substituteVariables(this.type, folder, config).then(config => {
				return this.configurationResolverService.resolveWithInteractionReplace(folder, config, 'launch', this.variables);
			});
		} else {
			return this.configurationResolverService.resolveWithInteractionReplace(folder, config, 'launch', this.variables);
		}
	}

	runInTerminal(args: DebugProtocol.RunInTerminalRequestArguments): Promise<number | undefined> {
		const config = this.configurationService.getValue<ITerminalSettings>('terminal');
		return this.configurationManager.runInTerminal(this.inExtHost() ? this.type : '*', args, config);
	}

	private inExtHost(): boolean {
		const debugConfigs = this.configurationService.getValue<IDebugConfiguration>('debug');
		return debugConfigs.extensionHostDebugAdapter || this.configurationManager.needsToRunInExtHost(this.type) || this.extensionDescription.extensionLocation.scheme !== 'file';
	}

	get label(): string {
		return this.debuggerContribution.label || this.debuggerContribution.type;
	}

	get type(): string {
		return this.debuggerContribution.type;
	}

	get variables(): { [key: string]: string } {
		return this.debuggerContribution.variables;
	}

	get configurationSnippets(): IJSONSchemaSnippet[] {
		return this.debuggerContribution.configurationSnippets;
	}

	get languages(): string[] {
		return this.debuggerContribution.languages;
	}

	merge(secondRawAdapter: IDebuggerContribution, extensionDescription: IExtensionDescription): void {

		// remember all ext descriptions that are the source of this debugger
		this.mergedExtensionDescriptions.push(extensionDescription);

		// Give priority to built in debug adapters
		if (extensionDescription.isBuiltin) {
			this.extensionDescription = extensionDescription;
		}
		objects.mixin(this.debuggerContribution, secondRawAdapter, extensionDescription.isBuiltin);
	}

	hasInitialConfiguration(): boolean {
		return !!this.debuggerContribution.initialConfigurations;
	}

	hasConfigurationProvider(): boolean {
		return this.configurationManager.hasDebugConfigurationProvider(this.type);
	}

	getInitialConfigurationContent(initialConfigs?: IConfig[]): Promise<string> {
		// at this point we got some configs from the package.json and/or from registered DebugConfigurationProviders
		let initialConfigurations = this.debuggerContribution.initialConfigurations || [];
		if (initialConfigs) {
			initialConfigurations = initialConfigurations.concat(initialConfigs);
		}

		const eol = this.resourcePropertiesService.getEOL(URI.from({ scheme: Schemas.untitled, path: '1' })) === '\r\n' ? '\r\n' : '\n';
		const configs = JSON.stringify(initialConfigurations, null, '\t').split('\n').map(line => '\t' + line).join(eol).trim();
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
		].join(eol);

		// fix formatting
		const editorConfig = this.configurationService.getValue<any>();
		if (editorConfig.editor && editorConfig.editor.insertSpaces) {
			content = content.replace(new RegExp('\t', 'g'), strings.repeat(' ', editorConfig.editor.tabSize));
		}

		return Promise.resolve(content);
	}

	@memoize
	getCustomTelemetryService(): Promise<TelemetryService> {
		if (!this.debuggerContribution.aiKey) {
			return Promise.resolve(undefined);
		}

		return this.telemetryService.getTelemetryInfo().then(info => {
			const telemetryInfo: { [key: string]: string } = Object.create(null);
			telemetryInfo['common.vscodemachineid'] = info.machineId;
			telemetryInfo['common.vscodesessionid'] = info.sessionId;
			return telemetryInfo;
		}).then(data => {
			const client = new TelemetryClient(
				getPathFromAmdModule(require, 'bootstrap-fork'),
				{
					serverName: 'Debug Telemetry',
					timeout: 1000 * 60 * 5,
					args: [`${this.extensionDescription.publisher}.${this.type}`, JSON.stringify(data), this.debuggerContribution.aiKey],
					env: {
						ELECTRON_RUN_AS_NODE: 1,
						PIPE_LOGGING: 'true',
						AMD_ENTRYPOINT: 'vs/workbench/parts/debug/node/telemetryApp'
					}
				}
			);

			const channel = client.getChannel('telemetryAppender');
			const appender = new TelemetryAppenderClient(channel);

			return new TelemetryService({ appender }, this.configurationService);
		});
	}

	getSchemaAttributes(): IJSONSchema[] {
		if (!this.debuggerContribution.configurationAttributes) {
			return null;
		}
		// fill in the default configuration attributes shared by all adapters.
		const taskSchema = TaskDefinitionRegistry.getJsonSchema();
		return Object.keys(this.debuggerContribution.configurationAttributes).map(request => {
			const attributes: IJSONSchema = this.debuggerContribution.configurationAttributes[request];
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
				anyOf: [taskSchema, {
					type: ['string', 'null'],
				}],
				default: '',
				description: nls.localize('debugPrelaunchTask', "Task to run before debug session starts.")
			};
			properties['postDebugTask'] = {
				anyOf: [taskSchema, {
					type: ['string', 'null'],
				}],
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
				ConfigurationResolverUtils.applyDeprecatedVariableMessage(attributes.properties[name]);
			});

			return attributes;
		});
	}
}
