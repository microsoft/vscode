/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import path = require('path');
import nls = require('vs/nls');
import { Promise, TPromise } from 'vs/base/common/winjs.base';
import uri from 'vs/base/common/uri';
import { schemas } from 'vs/base/common/network';
import paths = require('vs/base/common/paths');
import { IJSONSchema } from 'vs/base/common/jsonSchema';
import platform = require('vs/platform/platform');
import pluginsRegistry = require('vs/platform/plugins/common/pluginsRegistry');
import editor = require('vs/editor/common/editorCommon');
import jsonContributionRegistry = require('vs/languages/json/common/jsonContributionRegistry');
import debug = require('vs/workbench/parts/debug/common/debug');
import { SystemVariables } from 'vs/workbench/parts/lib/node/systemVariables';
import { Adapter } from 'vs/workbench/parts/debug/node/debugAdapter';
import { IWorkspaceContextService } from 'vs/workbench/services/workspace/common/contextService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IFileService } from 'vs/platform/files/common/files';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IQuickOpenService } from 'vs/workbench/services/quickopen/browser/quickOpenService';

// Debuggers extension point

export var debuggersExtPoint = pluginsRegistry.PluginsRegistry.registerExtensionPoint<debug.IRawAdapter[]>('debuggers', {
	description: nls.localize('vscode.extension.contributes.debuggers', 'Contributes debug adapters.'),
	type: 'array',
	default: [{ type: '', extensions: [] }],
	items: {
		type: 'object',
		default: { type: '', program: '', runtime: '', enableBreakpointsFor: { languageIds: [ '' ] } },
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

// Debug General Schema

export var schemaId = 'local://schemas/launch';
var schema: IJSONSchema = {
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
}

var jsonRegistry = <jsonContributionRegistry.IJSONContributionRegistry>platform.Registry.as(jsonContributionRegistry.Extensions.JSONContribution);
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
									// Give priority to the later registered extension.
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

					adapter.enableBreakpointsFor.languageIds.forEach(modeId => {
						this.allModeIdsForBreakpoints[modeId] = true;
					});
				});
			});

			// Update the schema to include all attributes and types from extensions.
			// debug.schema.properties['configurations'].items.properties.type.enum = this.adapters.map(adapter => adapter.type);
			this.adapters.forEach(adapter => {
				const schemaAttributes = adapter.getSchemaAttributes();
				if (schemaAttributes) {
					schema.properties['configurations'].items.oneOf.push(...schemaAttributes);
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
		return this.adapters.filter(adapter => adapter.type === this.configuration.type).pop();
	}

	public setConfiguration(name: string): Promise {
		return this.loadLaunchConfig().then(config => {
			if (!config || !config.configurations) {
				this.configuration = null;
				return;
			}

			// If the configuration name is not set yet, take the first launch config (can happen if debug viewlet has not been opened yet).
			const filtered = name ? config.configurations.filter(cfg => cfg.name === name) : [config.configurations[0]];

			// Massage configuration attributes - append workspace path to relatvie paths, substitute variables in paths.
			this.configuration = filtered.length === 1 ? filtered[0] : null;
			if (this.configuration && this.systemVariables) {
				this.configuration.debugServer = config.debugServer;
				this.configuration.outDir = this.resolvePath(this.systemVariables.resolve(this.configuration.outDir));
				this.configuration.address = this.configuration.address || 'localhost';
				this.configuration.program = this.resolvePath(this.systemVariables.resolve(this.configuration.program));
				this.configuration.stopOnEntry = this.configuration.stopOnEntry === undefined ? false : this.configuration.stopOnEntry;
				this.configuration.args = this.configuration.args && this.configuration.args.length > 0 ? this.systemVariables.resolve(this.configuration.args) : null;
				this.configuration.env = <{ [key: string]: string; }> this.systemVariables.resolve(this.configuration.env);
				this.configuration.cwd = this.resolvePath(this.systemVariables.resolve(this.configuration.cwd) || '.', false);
				this.configuration.runtimeExecutable = this.resolvePath(this.systemVariables.resolve(this.configuration.runtimeExecutable));
				this.configuration.runtimeArgs = this.configuration.runtimeArgs && this.configuration.runtimeArgs.length > 0 ? this.systemVariables.resolve(this.configuration.runtimeArgs) : null;
				this.configuration.outDir = this.resolvePath(this.configuration.outDir);
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
		return this.quickOpenService.pick(this.adapters, { placeHolder: nls.localize('selectDebug', "Select Debug Environment") })
		.then(adapter => {
			if (!adapter) {
				return null;
			}

			return this.massageInitialConfigurations(adapter).then(() =>
				JSON.stringify({
					version: '0.2.0',
					configurations: adapter.initialConfigurations ? adapter.initialConfigurations : []
				}, null, '\t')
			)
		});
	}

	private massageInitialConfigurations(adapter: Adapter): Promise {
		if (!adapter || !adapter.initialConfigurations || adapter.type !== 'node') {
			return Promise.as(true);
		}

		// Check package.json for 'main' or 'scripts' so we generate a more pecise 'program' attribute in launch.json.
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
		}, err => null).then(program => {
			adapter.initialConfigurations.forEach(config => {
				if (program && config["program"]) {
					config["program"] = program;
				}
			});
		});
	}

	public canSetBreakpointsIn(model: editor.IModel, lineNumber: number): boolean {
		if (model.getLineLastNonWhitespaceColumn(lineNumber) === 0) {
			return false;
		}
		if (model.getAssociatedResource().scheme === schemas.inMemory) {
			return false;
		}

		var mode = model ? model.getMode() : null;
		var modeId = mode ? mode.getId() : null;

		return !!this.allModeIdsForBreakpoints[modeId];
	}

	private resolvePath(p: string, showError = true): string {
		if (!p) {
			return null;
		}
		if (path.isAbsolute(p)) {
			return paths.normalize(p, true);
		}

		return paths.normalize(uri.file(paths.join(this.contextService.getWorkspace().resource.fsPath, p)).fsPath, true);
	}

	public loadLaunchConfig(): TPromise<debug.IGlobalConfig> {
		return this.configurationService.loadConfiguration('launch');
	}
}
