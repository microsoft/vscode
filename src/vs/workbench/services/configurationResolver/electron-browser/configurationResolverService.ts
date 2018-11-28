/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI as uri } from 'vs/base/common/uri';
import * as nls from 'vs/nls';
import * as paths from 'vs/base/common/paths';
import * as platform from 'vs/base/common/platform';
import * as Objects from 'vs/base/common/objects';
import * as Types from 'vs/base/common/types';
import { Schemas } from 'vs/base/common/network';
import { TPromise } from 'vs/base/common/winjs.base';
import { sequence } from 'vs/base/common/async';
import { toResource } from 'vs/workbench/common/editor';
import { IStringDictionary, size, forEach } from 'vs/base/common/collections';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IWorkspaceFolder, IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { AbstractVariableResolverService } from 'vs/workbench/services/configurationResolver/node/variableResolver';
import { isCodeEditor } from 'vs/editor/browser/editorBrowser';
import { DiffEditorInput } from 'vs/workbench/common/editor/diffEditorInput';
import { IQuickInputService, IInputOptions, IQuickPickItem, IPickOptions } from 'vs/platform/quickinput/common/quickInput';
import { ConfiguredInput, ConfiguredInputType } from 'vs/workbench/services/configurationResolver/common/configurationResolver';

export class ConfigurationResolverService extends AbstractVariableResolverService {

	constructor(
		envVariables: platform.IProcessEnvironment,
		@IEditorService editorService: IEditorService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IConfigurationService private configurationService: IConfigurationService,
		@ICommandService private commandService: ICommandService,
		@IWorkspaceContextService private workspaceContextService: IWorkspaceContextService,
		@IQuickInputService private quickInputService: IQuickInputService
	) {
		super({
			getFolderUri: (folderName: string): uri => {
				const folder = workspaceContextService.getWorkspace().folders.filter(f => f.name === folderName).pop();
				return folder ? folder.uri : undefined;
			},
			getWorkspaceFolderCount: (): number => {
				return workspaceContextService.getWorkspace().folders.length;
			},
			getConfigurationValue: (folderUri: uri, suffix: string) => {
				return configurationService.getValue<string>(suffix, folderUri ? { resource: folderUri } : undefined);
			},
			getExecPath: () => {
				return environmentService['execPath'];
			},
			getFilePath: (): string | undefined => {
				let activeEditor = editorService.activeEditor;
				if (activeEditor instanceof DiffEditorInput) {
					activeEditor = activeEditor.modifiedInput;
				}
				const fileResource = toResource(activeEditor, { filter: Schemas.file });
				if (!fileResource) {
					return undefined;
				}
				return paths.normalize(fileResource.fsPath, true);
			},
			getSelectedText: (): string | undefined => {
				const activeTextEditorWidget = editorService.activeTextEditorWidget;
				if (isCodeEditor(activeTextEditorWidget)) {
					const editorModel = activeTextEditorWidget.getModel();
					const editorSelection = activeTextEditorWidget.getSelection();
					if (editorModel && editorSelection) {
						return editorModel.getValueInRange(editorSelection);
					}
				}
				return undefined;
			},
			getLineNumber: (): string => {
				const activeTextEditorWidget = editorService.activeTextEditorWidget;
				if (isCodeEditor(activeTextEditorWidget)) {
					const lineNumber = activeTextEditorWidget.getSelection().positionLineNumber;
					return String(lineNumber);
				}
				return undefined;
			}
		}, envVariables);
	}

	public resolveWithInteraction(folder: IWorkspaceFolder, config: any, variables?: IStringDictionary<string>): TPromise<any> {
		// then substitute remaining variables in VS Code core
		config = this.resolveAny(folder, config);

		return this.resolveWithCommands(config, variables).then(commandMapping => {
			if (!commandMapping) {
				return undefined;
			}

			return this.resolveWithInputs(folder, config).then(inputMapping => {
				if (!inputMapping) {
					return undefined;
				}

				forEach(commandMapping, (entry) => {
					inputMapping[entry.key] = entry.value;
				});

				// finally substitute evaluated command variables (if there are any)
				if (size<string>(inputMapping) > 0) {
					return this.resolveAny(folder, config, inputMapping);
				} else {
					return config;
				}
			});
		});
	}

	private resolveWithCommands(config: any, variables?: IStringDictionary<string>): TPromise<IStringDictionary<string>> {
		// now evaluate command variables (which might have a UI)
		return this.executeCommandVariables(config, variables);
	}

	/**
	 * Finds and executes all command variables in the given configuration and returns their values as a dictionary.
	 * Please note: this method does not substitute the command variables (so the configuration is not modified).
	 * The returned dictionary can be passed to "resolvePlatform" for the substitution.
	 * See #6569.
	 */
	private executeCommandVariables(configuration: any, variableToCommandMap: IStringDictionary<string>): TPromise<IStringDictionary<string>> {

		if (!configuration) {
			return TPromise.as(undefined);
		}

		// use an array to preserve order of first appearance
		const cmd_var = /\${command:(.*?)}/g;
		const commands: string[] = [];
		this.findVariables(cmd_var, configuration, commands);
		let cancelled = false;
		const commandValueMapping: IStringDictionary<string> = Object.create(null);

		const factory: { (): TPromise<any> }[] = commands.map(commandVariable => {
			return () => {

				let commandId = variableToCommandMap ? variableToCommandMap[commandVariable] : undefined;
				if (!commandId) {
					// Just launch any command if the interactive variable is not contributed by the adapter #12735
					commandId = commandVariable;
				}

				return this.commandService.executeCommand<string>(commandId, configuration).then(result => {
					if (typeof result === 'string') {
						commandValueMapping[commandVariable] = result;
					} else if (Types.isUndefinedOrNull(result)) {
						cancelled = true;
					} else {
						throw new Error(nls.localize('stringsOnlySupported', "Command '{0}' did not return a string result. Only strings are supported as results for commands used for variable substitution.", commandVariable));
					}
				});
			};
		});

		return sequence(factory).then(() => cancelled ? undefined : commandValueMapping);
	}

	public resolveWithInputs(folder: IWorkspaceFolder, config: any): Promise<IStringDictionary<string>> {
		if (folder) {
			let result = this.workspaceContextService.getWorkbenchState() !== WorkbenchState.EMPTY
				? Objects.deepClone(this.configurationService.getValue<any>('tasks', { resource: folder.uri }))
				: undefined;
			let inputsArray = result ? this.parseConfigurationInputs(result.inputs) : undefined;
			const inputs = new Map<string, ConfiguredInput>();
			inputsArray.forEach(input => {
				inputs.set(input.label, input);
			});

			// now evaluate input variables (which have a UI)
			return this.showUserInput(config, inputs);
		} else {
			return Promise.resolve(Object.create(null));
		}
	}

	private showUserInput(configuration: any, inputs: Map<string, ConfiguredInput> | undefined): Promise<IStringDictionary<string>> {

		if (!configuration) {
			return Promise.resolve(undefined);
		}

		// use an array to preserve order of first appearance
		const input_var = /\${input:(.*?)}/g;
		const commands: string[] = [];
		this.findVariables(input_var, configuration, commands);
		let cancelled = false;
		const commandValueMapping: IStringDictionary<string> = Object.create(null);

		const factory: { (): Promise<any> }[] = commands.map(commandVariable => {
			return () => {
				if (inputs && inputs.has(commandVariable)) {
					const input = inputs.get(commandVariable);
					if (input.type === ConfiguredInputType.prompt) {
						let inputOptions: IInputOptions = { prompt: input.description };
						if (input.default) {
							inputOptions.value = input.default;
							commandValueMapping[commandVariable] = input.default;
						}

						return this.quickInputService.input(inputOptions).then(resolvedInput => {
							if (resolvedInput) {
								commandValueMapping[commandVariable] = resolvedInput;
							}
						});
					} else { // input.type === ConfiguredInputType.pick
						let picks = new Array<IQuickPickItem>();
						if (input.options) {
							input.options.forEach(pickOption => {
								let item: IQuickPickItem = { label: pickOption };
								if (input.default && (pickOption === input.default)) {
									commandValueMapping[commandVariable] = input.default;
									item.description = nls.localize('defaultInputValue', "Default");
									picks.unshift(item);
								} else {
									picks.push(item);
								}
							});
						}
						let pickOptions: IPickOptions<IQuickPickItem> = { placeHolder: input.description };
						return this.quickInputService.pick(picks, pickOptions, undefined).then(resolvedInput => {
							if (resolvedInput) {
								commandValueMapping[commandVariable] = resolvedInput.label;
							}
						});
					}

				}

				return Promise.resolve();
			};
		}, reason => {
			return Promise.reject(reason);
		});

		return sequence(factory).then(() => cancelled ? undefined : commandValueMapping);
	}

	private findVariables(cmdVar: RegExp, object: any, commands: string[]) {
		if (!object) {
			return;
		} else if (typeof object === 'string') {
			let matches;
			while ((matches = cmdVar.exec(object)) !== null) {
				if (matches.length === 2) {
					const command = matches[1];
					if (commands.indexOf(command) < 0) {
						commands.push(command);
					}
				}
			}
		} else if (Types.isArray(object)) {
			object.forEach(value => {
				this.findVariables(cmdVar, value, commands);
			});
		} else {
			Object.keys(object).forEach(key => {
				const value = object[key];
				this.findVariables(cmdVar, value, commands);
			});
		}
	}

	private parseConfigurationInputs(object: any[]): ConfiguredInput[] | undefined {
		let inputs = new Array<ConfiguredInput>();
		if (object) {
			object.forEach(item => {
				if (Types.isString(item.label) && Types.isString(item.description) && Types.isString(item.type)) {
					let type: ConfiguredInputType;
					switch (item.type) {
						case 'prompt': type = ConfiguredInputType.prompt; break;
						case 'pick': type = ConfiguredInputType.pick; break;
						default: {
							throw new Error(nls.localize('unknownInputTypeProvided', "Input '{0}' can only be of type 'prompt' or 'pick'.", item.label));
						}
					}
					let options: string[];
					if (type === ConfiguredInputType.pick) {
						if (Types.isStringArray(item.options)) {
							options = item.options;
						} else {
							throw new Error(nls.localize('pickRequiresOptions', "Input '{0}' is of type 'pick' and must include 'options'.", item.label));
						}
					}
					inputs.push({ label: item.label, description: item.description, type, default: item.default, options });
				}
			});
		}

		return inputs;
	}
}