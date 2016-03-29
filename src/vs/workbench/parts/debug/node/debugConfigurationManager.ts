/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import path = require('path');
import nls = require('vs/nls');
import { TPromise } from 'vs/base/common/winjs.base';
import strings = require('vs/base/common/strings');
import objects = require('vs/base/common/objects');
import uri from 'vs/base/common/uri';
import { Schemas } from 'vs/base/common/network';
import paths = require('vs/base/common/paths');
import { IJSONSchema } from 'vs/base/common/jsonSchema';
import editor = require('vs/editor/common/editorCommon');
import extensionsRegistry = require('vs/platform/extensions/common/extensionsRegistry');
import platform = require('vs/platform/platform');
import jsonContributionRegistry = require('vs/platform/jsonschemas/common/jsonContributionRegistry');
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IFileService } from 'vs/platform/files/common/files';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import debug = require('vs/workbench/parts/debug/common/debug');
import { SystemVariables } from 'vs/workbench/parts/lib/node/systemVariables';
import { Adapter } from 'vs/workbench/parts/debug/node/debugAdapter';
import { IWorkspaceContextService } from 'vs/workbench/services/workspace/common/contextService';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IQuickOpenService } from 'vs/workbench/services/quickopen/common/quickOpenService';

// debuggers extension point

export var debuggersExtPoint = extensionsRegistry.ExtensionsRegistry.registerExtensionPoint<debug.IRawAdapter[]>('debuggers', {
	description: nls.localize('vscode.extension.contributes.debuggers', 'Contributes debug adapters.'),
	type: 'array',
	defaultSnippets: [{ body: [{ type: '', extensions: [] }] }],
	items: {
		type: 'object',
		defaultSnippets: [{ body: { type: '', program: '', runtime: '', enableBreakpointsFor: { languageIds: [ '' ] } } }],
		properties: {
			type: {
				description: nls.localize('vscode.extension.contributes.debuggers.type', "Unique identifier for this debug adapter."),
				type: 'string'
			},
			label: {
				description: nls.localize('vscode.extension.contributes.debuggers.label', "Display name for this debug adapter."),
				type: 'string'
			},
			enableBreakpointsFor: {
				description: nls.localize('vscode.extension.contributes.debuggers.enableBreakpointsFor', "Allow breakpoints for these languages."),
				type: 'object',
				properties: {
					languageIds : {
						description: nls.localize('vscode.extension.contributes.debuggers.enableBreakpointsFor.languageIds', "List of languages."),
						type: 'array',
						items: {
							type: 'string'
						}
					}
				}
			},
			program: {
				description: nls.localize('vscode.extension.contributes.debuggers.program', "Path to the debug adapter program. Path is either absolute or relative to the extension folder."),
				type: 'string'
			},
			args: {
				description: nls.localize('vscode.extension.contributes.debuggers.args', "Optional arguments to pass to the adapter."),
				type: 'array'
			},
			runtime : {
				description: nls.localize('vscode.extension.contributes.debuggers.runtime', "Optional runtime in case the program attribute is not an executable but requires a runtime."),
				type: 'string'
			},
			runtimeArgs : {
				description: nls.localize('vscode.extension.contributes.debuggers.runtimeArgs', "Optional runtime arguments."),
				type: 'array'
			},
			initialConfigurations: {
				description: nls.localize('vscode.extension.contributes.debuggers.initialConfigurations', "Configurations for generating the initial \'launch.json\'."),
				type: 'array',
			},
			configurationAttributes: {
				description: nls.localize('vscode.extension.contributes.debuggers.configurationAttributes', "JSON schema configurations for validating \'launch.json\'."),
				type: 'object'
			},
			windows: {
				description: nls.localize('vscode.extension.contributes.debuggers.windows', "Windows specific settings."),
				type: 'object',
				properties: {
					runtime : {
						description: nls.localize('vscode.extension.contributes.debuggers.windows.runtime', "Runtime used for Windows."),
						type: 'string'
					}
				}
			},
			osx: {
				description: nls.localize('vscode.extension.contributes.debuggers.osx', "OS X specific settings."),
				type: 'object',
				properties: {
					runtime : {
						description: nls.localize('vscode.extension.contributes.debuggers.osx.runtime', "Runtime used for OSX."),
						type: 'string'
					}
				}
			},
			linux: {
				description: nls.localize('vscode.extension.contributes.debuggers.linux', "Linux specific settings."),
				type: 'object',
				properties: {
					runtime : {
						description: nls.localize('vscode.extension.contributes.debuggers.linux.runtime', "Runtime used for Linux."),
						type: 'string'
					}
				}
			}
		}
	}
});

// debug general schema

export var schemaId = 'vscode://schemas/launch';
const schema: IJSONSchema = {
	id: schemaId,
	type: 'object',
	title: nls.localize('app.launch.json.title', "Launch configuration"),
	required: ['version', 'configurations'],
	properties: {
		version: {
			type: 'string',
			description: nls.localize('app.launch.json.version', "Version of this file format."),
			default: '0.2.0'
		},
		configurations: {
			type: 'array',
			description: nls.localize('app.launch.json.configurations', "List of configurations. Add new configurations or edit existing ones."),
			items: {
				oneOf: []
			}
		}
	}
};

const jsonRegistry = <jsonContributionRegistry.IJSONContributionRegistry>platform.Registry.as(jsonContributionRegistry.Extensions.JSONContribution);
jsonRegistry.registerSchema(schemaId, schema);
jsonRegistry.addSchemaFileAssociation('/.vscode/launch.json', schemaId);

export class ConfigurationManager {

	private configuration: debug.IConfig;
	private systemVariables: SystemVariables;
	private adapters: Adapter[];
	private allModeIdsForBreakpoints: { [key: string]: boolean };

	constructor(
		configName: string,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IFileService private fileService: IFileService,
		@ITelemetryService private telemetryService: ITelemetryService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IQuickOpenService private quickOpenService: IQuickOpenService
	) {
		this.systemVariables = this.contextService.getWorkspace() ? new SystemVariables(this.editorService, this.contextService) : null;
		this.setConfiguration(configName);
		this.adapters = [];
		this.registerListeners();
		this.allModeIdsForBreakpoints = {};
	}

	private registerListeners(): void {
		debuggersExtPoint.setHandler((extensions) => {

			extensions.forEach(extension => {
				extension.value.forEach(rawAdapter => {
					const adapter = new Adapter(rawAdapter, this.systemVariables, extension.description.extensionFolderPath);
					const duplicate = this.adapters.filter(a => a.type === adapter.type)[0];
					if (!rawAdapter.type || (typeof rawAdapter.type !== 'string')) {
						extension.collector.error(nls.localize('debugNoType', "Debug adapter 'type' can not be omitted and must be of type 'string'."));
					}

					if (duplicate) {
						Object.keys(adapter).forEach(attribute => {
							if (adapter[attribute]) {
								if (attribute === 'enableBreakpointsFor') {
									Object.keys(adapter.enableBreakpointsFor).forEach(languageId => duplicate.enableBreakpointsFor[languageId] = true);
								} else if (duplicate[attribute] && attribute !== 'type') {
									// give priority to the later registered extension.
									duplicate[attribute] = adapter[attribute];
									extension.collector.error(nls.localize('duplicateDebuggerType', "Debug type '{0}' is already registered and has attribute '{1}', ignoring attribute '{1}'.", adapter.type, attribute));
								} else {
									duplicate[attribute] = adapter[attribute];
								}
							}
						});
					} else {
						this.adapters.push(adapter);
					}

					if (adapter.enableBreakpointsFor) {
						adapter.enableBreakpointsFor.languageIds.forEach(modeId => {
							this.allModeIdsForBreakpoints[modeId] = true;
						});
					}
				});
			});

			// update the schema to include all attributes and types from extensions.
			// debug.schema.properties['configurations'].items.properties.type.enum = this.adapters.map(adapter => adapter.type);
			this.adapters.forEach(adapter => {
				const schemaAttributes = adapter.getSchemaAttributes();
				if (schemaAttributes) {
					(<IJSONSchema> schema.properties['configurations'].items).oneOf.push(...schemaAttributes);
				}
			});
		});
	}

	public getConfiguration(): debug.IConfig {
		return this.configuration;
	}

	public getConfigurationName(): string {
		return this.configuration ? this.configuration.name : null;
	}

	public getAdapter(): Adapter {
		return this.adapters.filter(adapter => strings.equalsIgnoreCase(adapter.type, this.configuration.type)).pop();
	}

	public setConfiguration(name: string): TPromise<void> {
		return this.loadLaunchConfig().then(config => {
			if (!config || !config.configurations) {
				this.configuration = null;
				return;
			}

			// if the configuration name is not set yet, take the first launch config (can happen if debug viewlet has not been opened yet).
			const filtered = name ? config.configurations.filter(cfg => cfg.name === name) : [config.configurations[0]];

			// massage configuration attributes - append workspace path to relatvie paths, substitute variables in paths.
			this.configuration = filtered.length === 1 ? objects.deepClone(filtered[0]) : null;
			if (this.configuration) {
				if (this.systemVariables) {
					Object.keys(this.configuration).forEach(key => {
						this.configuration[key] = this.systemVariables.resolveAny(this.configuration[key]);
					});
				}
				this.configuration.debugServer = config.debugServer;
			}
		});
	}

	public openConfigFile(sideBySide: boolean): TPromise<boolean> {
		const resource = uri.file(paths.join(this.contextService.getWorkspace().resource.fsPath, '/.vscode/launch.json'));

		return this.fileService.resolveContent(resource).then(content => true, err =>
			this.getInitialConfigFileContent().then(content => {
				if (!content) {
					return false;
				}

				return this.fileService.updateContent(resource, content).then(() => true);
			}
		)).then(configFileCreated => {
			if (!configFileCreated) {
				return false;
			}
			this.telemetryService.publicLog('debugConfigure');

			return this.editorService.openEditor({
				resource: resource,
				options: {
					forceOpen: true
				}
			}, sideBySide).then(() => true);
		}, (error) => {
			throw new Error(nls.localize('DebugConfig.failed', "Unable to create 'launch.json' file inside the '.vscode' folder ({0}).", error));
		});
	}

	private getInitialConfigFileContent(): TPromise<string> {
		return this.quickOpenService.pick(this.adapters, { placeHolder: nls.localize('selectDebug', "Select Environment") })
		.then(adapter => {
			if (!adapter) {
				return null;
			}

			return this.massageInitialConfigurations(adapter).then(() =>
				JSON.stringify({
					version: '0.2.0',
					configurations: adapter.initialConfigurations ? adapter.initialConfigurations : []
				}, null, '\t')
			);
		});
	}

	private massageInitialConfigurations(adapter: Adapter): TPromise<void> {
		if (!adapter || !adapter.initialConfigurations || adapter.type !== 'node') {
			return TPromise.as(undefined);
		}

		// check package.json for 'main' or 'scripts' so we generate a more pecise 'program' attribute in launch.json.
		const packageJsonUri = uri.file(paths.join(this.contextService.getWorkspace().resource.fsPath, '/package.json'));
		return this.fileService.resolveContent(packageJsonUri).then(jsonContent => {
			try {
				const jsonObject = JSON.parse(jsonContent.value);
				if (jsonObject.main) {
					return jsonObject.main;
				} else if (jsonObject.scripts && typeof jsonObject.scripts.start === 'string') {
					return (<string>jsonObject.scripts.start).split(' ').pop();
				}

			} catch (error) { }

			return null;
		}, err => null).then((program: string) => {
			adapter.initialConfigurations.forEach(config => {
				if (program && config.program) {
					if (!path.isAbsolute(program)) {
						program = paths.join('${workspaceRoot}', program);
					}

					config.program = program;
				}
			});
		});
	}

	public canSetBreakpointsIn(model: editor.IModel): boolean {
		if (model.getAssociatedResource().scheme === Schemas.inMemory) {
			return false;
		}

		const mode = model ? model.getMode() : null;
		const modeId = mode ? mode.getId() : null;

		return !!this.allModeIdsForBreakpoints[modeId];
	}

	public loadLaunchConfig(): TPromise<debug.IGlobalConfig> {
		return this.configurationService.loadConfiguration('launch');
	}
}
