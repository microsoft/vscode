/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Queue } from '../../../../base/common/async.js';
import { IStringDictionary } from '../../../../base/common/collections.js';
import { LRUCache } from '../../../../base/common/map.js';
import { Schemas } from '../../../../base/common/network.js';
import { IProcessEnvironment } from '../../../../base/common/platform.js';
import * as Types from '../../../../base/common/types.js';
import { URI as uri } from '../../../../base/common/uri.js';
import { ICodeEditor, isCodeEditor, isDiffEditor } from '../../../../editor/browser/editorBrowser.js';
import * as nls from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ConfigurationTarget, IConfigurationOverrides, IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { IInputOptions, IPickOptions, IQuickInputService, IQuickPickItem } from '../../../../platform/quickinput/common/quickInput.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IWorkspaceContextService, IWorkspaceFolder, WorkbenchState } from '../../../../platform/workspace/common/workspace.js';
import { EditorResourceAccessor, SideBySideEditor } from '../../../common/editor.js';
import { ConfiguredInput } from '../common/configurationResolver.js';
import { AbstractVariableResolverService } from '../common/variableResolver.js';
import { IEditorService } from '../../editor/common/editorService.js';
import { IExtensionService } from '../../extensions/common/extensions.js';
import { IPathService } from '../../path/common/pathService.js';

const LAST_INPUT_STORAGE_KEY = 'configResolveInputLru';
const LAST_INPUT_CACHE_SIZE = 5;

export abstract class BaseConfigurationResolverService extends AbstractVariableResolverService {

	static readonly INPUT_OR_COMMAND_VARIABLES_PATTERN = /\${((input|command):(.*?))}/g;

	private userInputAccessQueue = new Queue<string | IQuickPickItem | undefined>();

	constructor(
		context: {
			getAppRoot: () => string | undefined;
			getExecPath: () => string | undefined;
		},
		envVariablesPromise: Promise<IProcessEnvironment>,
		editorService: IEditorService,
		private readonly configurationService: IConfigurationService,
		private readonly commandService: ICommandService,
		private readonly workspaceContextService: IWorkspaceContextService,
		private readonly quickInputService: IQuickInputService,
		private readonly labelService: ILabelService,
		private readonly pathService: IPathService,
		extensionService: IExtensionService,
		private readonly storageService: IStorageService,
	) {
		super({
			getFolderUri: (folderName: string): uri | undefined => {
				const folder = workspaceContextService.getWorkspace().folders.filter(f => f.name === folderName).pop();
				return folder ? folder.uri : undefined;
			},
			getWorkspaceFolderCount: (): number => {
				return workspaceContextService.getWorkspace().folders.length;
			},
			getConfigurationValue: (folderUri: uri | undefined, suffix: string): string | undefined => {
				return configurationService.getValue<string>(suffix, folderUri ? { resource: folderUri } : {});
			},
			getAppRoot: (): string | undefined => {
				return context.getAppRoot();
			},
			getExecPath: (): string | undefined => {
				return context.getExecPath();
			},
			getFilePath: (): string | undefined => {
				const fileResource = EditorResourceAccessor.getOriginalUri(editorService.activeEditor, {
					supportSideBySide: SideBySideEditor.PRIMARY,
					filterByScheme: [Schemas.file, Schemas.vscodeUserData, this.pathService.defaultUriScheme]
				});
				if (!fileResource) {
					return undefined;
				}
				return this.labelService.getUriLabel(fileResource, { noPrefix: true });
			},
			getWorkspaceFolderPathForFile: (): string | undefined => {
				const fileResource = EditorResourceAccessor.getOriginalUri(editorService.activeEditor, {
					supportSideBySide: SideBySideEditor.PRIMARY,
					filterByScheme: [Schemas.file, Schemas.vscodeUserData, this.pathService.defaultUriScheme]
				});
				if (!fileResource) {
					return undefined;
				}
				const wsFolder = workspaceContextService.getWorkspaceFolder(fileResource);
				if (!wsFolder) {
					return undefined;
				}
				return this.labelService.getUriLabel(wsFolder.uri, { noPrefix: true });
			},
			getSelectedText: (): string | undefined => {
				const activeTextEditorControl = editorService.activeTextEditorControl;

				let activeControl: ICodeEditor | null = null;

				if (isCodeEditor(activeTextEditorControl)) {
					activeControl = activeTextEditorControl;
				} else if (isDiffEditor(activeTextEditorControl)) {
					const original = activeTextEditorControl.getOriginalEditor();
					const modified = activeTextEditorControl.getModifiedEditor();
					activeControl = original.hasWidgetFocus() ? original : modified;
				}

				const activeModel = activeControl?.getModel();
				const activeSelection = activeControl?.getSelection();
				if (activeModel && activeSelection) {
					return activeModel.getValueInRange(activeSelection);
				}
				return undefined;
			},
			getLineNumber: (): string | undefined => {
				const activeTextEditorControl = editorService.activeTextEditorControl;
				if (isCodeEditor(activeTextEditorControl)) {
					const selection = activeTextEditorControl.getSelection();
					if (selection) {
						const lineNumber = selection.positionLineNumber;
						return String(lineNumber);
					}
				}
				return undefined;
			},
			getExtension: id => {
				return extensionService.getExtension(id);
			},
		}, labelService, pathService.userHome().then(home => home.path), envVariablesPromise);
	}

	public override async resolveWithInteractionReplace(folder: IWorkspaceFolder | undefined, config: any, section?: string, variables?: IStringDictionary<string>, target?: ConfigurationTarget): Promise<any> {
		// resolve any non-interactive variables and any contributed variables
		config = await this.resolveAnyAsync(folder, config);

		// resolve input variables in the order in which they are encountered
		return this.resolveWithInteraction(folder, config, section, variables, target).then(mapping => {
			// finally substitute evaluated command variables (if there are any)
			if (!mapping) {
				return null;
			} else if (mapping.size > 0) {
				return this.resolveAnyAsync(folder, config, Object.fromEntries(mapping));
			} else {
				return config;
			}
		});
	}

	public override async resolveWithInteraction(folder: IWorkspaceFolder | undefined, config: any, section?: string, variables?: IStringDictionary<string>, target?: ConfigurationTarget): Promise<Map<string, string> | undefined> {
		// resolve any non-interactive variables and any contributed variables
		const resolved = await this.resolveAnyMap(folder, config);
		config = resolved.newConfig;
		const allVariableMapping: Map<string, string> = resolved.resolvedVariables;

		// resolve input and command variables in the order in which they are encountered
		return this.resolveWithInputAndCommands(folder, config, variables, section, target).then(inputOrCommandMapping => {
			if (this.updateMapping(inputOrCommandMapping, allVariableMapping)) {
				return allVariableMapping;
			}
			return undefined;
		});
	}

	/**
	 * Add all items from newMapping to fullMapping. Returns false if newMapping is undefined.
	 */
	private updateMapping(newMapping: IStringDictionary<string> | undefined, fullMapping: Map<string, string>): boolean {
		if (!newMapping) {
			return false;
		}
		for (const [key, value] of Object.entries(newMapping)) {
			fullMapping.set(key, value);
		}
		return true;
	}

	/**
	 * Finds and executes all input and command variables in the given configuration and returns their values as a dictionary.
	 * Please note: this method does not substitute the input or command variables (so the configuration is not modified).
	 * The returned dictionary can be passed to "resolvePlatform" for the actual substitution.
	 * See #6569.
	 *
	 * @param variableToCommandMap Aliases for commands
	 */
	private async resolveWithInputAndCommands(folder: IWorkspaceFolder | undefined, configuration: any, variableToCommandMap?: IStringDictionary<string>, section?: string, target?: ConfigurationTarget): Promise<IStringDictionary<string> | undefined> {

		if (!configuration) {
			return Promise.resolve(undefined);
		}

		// get all "inputs"
		let inputs: ConfiguredInput[] = [];
		if (this.workspaceContextService.getWorkbenchState() !== WorkbenchState.EMPTY && section) {
			const overrides: IConfigurationOverrides = folder ? { resource: folder.uri } : {};
			const result = this.configurationService.inspect(section, overrides);
			if (result && (result.userValue || result.workspaceValue || result.workspaceFolderValue)) {
				switch (target) {
					case ConfigurationTarget.USER: inputs = (<any>result.userValue)?.inputs; break;
					case ConfigurationTarget.WORKSPACE: inputs = (<any>result.workspaceValue)?.inputs; break;
					default: inputs = (<any>result.workspaceFolderValue)?.inputs;
				}
			} else {
				const valueResult = this.configurationService.getValue<any>(section, overrides);
				if (valueResult) {
					inputs = valueResult.inputs;
				}
			}
		}

		// extract and dedupe all "input" and "command" variables and preserve their order in an array
		const variables: string[] = [];
		this.findVariables(configuration, variables);

		const variableValues: IStringDictionary<string> = Object.create(null);

		for (const variable of variables) {

			const [type, name] = variable.split(':', 2);

			let result: string | undefined;

			switch (type) {

				case 'input':
					result = await this.showUserInput(section, name, inputs);
					break;

				case 'command': {
					// use the name as a command ID #12735
					const commandId = (variableToCommandMap ? variableToCommandMap[name] : undefined) || name;
					result = await this.commandService.executeCommand(commandId, configuration);
					if (typeof result !== 'string' && !Types.isUndefinedOrNull(result)) {
						throw new Error(nls.localize('commandVariable.noStringType', "Cannot substitute command variable '{0}' because command did not return a result of type string.", commandId));
					}
					break;
				}
				default:
					// Try to resolve it as a contributed variable
					if (this._contributedVariables.has(variable)) {
						result = await this._contributedVariables.get(variable)!();
					}
			}

			if (typeof result === 'string') {
				variableValues[variable] = result;
			} else {
				return undefined;
			}
		}

		return variableValues;
	}

	/**
	 * Recursively finds all command or input variables in object and pushes them into variables.
	 * @param object object is searched for variables.
	 * @param variables All found variables are returned in variables.
	 */
	private findVariables(object: any, variables: string[]) {
		if (typeof object === 'string') {
			let matches;
			while ((matches = BaseConfigurationResolverService.INPUT_OR_COMMAND_VARIABLES_PATTERN.exec(object)) !== null) {
				if (matches.length === 4) {
					const command = matches[1];
					if (variables.indexOf(command) < 0) {
						variables.push(command);
					}
				}
			}
			for (const contributed of this._contributedVariables.keys()) {
				if ((variables.indexOf(contributed) < 0) && (object.indexOf('${' + contributed + '}') >= 0)) {
					variables.push(contributed);
				}
			}
		} else if (Array.isArray(object)) {
			for (const value of object) {
				this.findVariables(value, variables);

			}
		} else if (object) {
			for (const value of Object.values(object)) {
				this.findVariables(value, variables);

			}
		}
	}

	/**
	 * Takes the provided input info and shows the quick pick so the user can provide the value for the input
	 * @param variable Name of the input variable.
	 * @param inputInfos Information about each possible input variable.
	 */
	private showUserInput(section: string | undefined, variable: string, inputInfos: ConfiguredInput[]): Promise<string | undefined> {

		if (!inputInfos) {
			return Promise.reject(new Error(nls.localize('inputVariable.noInputSection', "Variable '{0}' must be defined in an '{1}' section of the debug or task configuration.", variable, 'inputs')));
		}

		// find info for the given input variable
		const info = inputInfos.filter(item => item.id === variable).pop();
		if (info) {

			const missingAttribute = (attrName: string) => {
				throw new Error(nls.localize('inputVariable.missingAttribute', "Input variable '{0}' is of type '{1}' and must include '{2}'.", variable, info.type, attrName));
			};

			const defaultValueMap = this.readInputLru();
			const defaultValueKey = `${section}.${variable}`;
			const previousPickedValue = defaultValueMap.get(defaultValueKey);

			switch (info.type) {

				case 'promptString': {
					if (!Types.isString(info.description)) {
						missingAttribute('description');
					}
					const inputOptions: IInputOptions = { prompt: info.description, ignoreFocusLost: true, value: previousPickedValue };
					if (info.default) {
						inputOptions.value = info.default;
					}
					if (info.password) {
						inputOptions.password = info.password;
					}
					return this.userInputAccessQueue.queue(() => this.quickInputService.input(inputOptions)).then(resolvedInput => {
						if (typeof resolvedInput === 'string') {
							this.storeInputLru(defaultValueMap.set(defaultValueKey, resolvedInput));
						}
						return resolvedInput as string;
					});
				}

				case 'pickString': {
					if (!Types.isString(info.description)) {
						missingAttribute('description');
					}
					if (Array.isArray(info.options)) {
						for (const pickOption of info.options) {
							if (!Types.isString(pickOption) && !Types.isString(pickOption.value)) {
								missingAttribute('value');
							}
						}
					} else {
						missingAttribute('options');
					}
					interface PickStringItem extends IQuickPickItem {
						value: string;
					}
					const picks = new Array<PickStringItem>();
					for (const pickOption of info.options) {
						const value = Types.isString(pickOption) ? pickOption : pickOption.value;
						const label = Types.isString(pickOption) ? undefined : pickOption.label;

						// If there is no label defined, use value as label
						const item: PickStringItem = {
							label: label ? `${label}: ${value}` : value,
							value: value
						};

						if (value === info.default) {
							item.description = nls.localize('inputVariable.defaultInputValue', "(Default)");
							picks.unshift(item);
						} else if (!info.default && value === previousPickedValue) {
							picks.unshift(item);
						} else {
							picks.push(item);
						}
					}
					const pickOptions: IPickOptions<PickStringItem> = { placeHolder: info.description, matchOnDetail: true, ignoreFocusLost: true };
					return this.userInputAccessQueue.queue(() => this.quickInputService.pick(picks, pickOptions, undefined)).then(resolvedInput => {
						if (resolvedInput) {
							const value = (resolvedInput as PickStringItem).value;
							this.storeInputLru(defaultValueMap.set(defaultValueKey, value));
							return value;
						}
						return undefined;
					});
				}

				case 'command': {
					if (!Types.isString(info.command)) {
						missingAttribute('command');
					}
					return this.userInputAccessQueue.queue(() => this.commandService.executeCommand<string>(info.command, info.args)).then(result => {
						if (typeof result === 'string' || Types.isUndefinedOrNull(result)) {
							return result;
						}
						throw new Error(nls.localize('inputVariable.command.noStringType', "Cannot substitute input variable '{0}' because command '{1}' did not return a result of type string.", variable, info.command));
					});
				}

				default:
					throw new Error(nls.localize('inputVariable.unknownType', "Input variable '{0}' can only be of type 'promptString', 'pickString', or 'command'.", variable));
			}
		}
		return Promise.reject(new Error(nls.localize('inputVariable.undefinedVariable', "Undefined input variable '{0}' encountered. Remove or define '{0}' to continue.", variable)));
	}

	private storeInputLru(lru: LRUCache<string, string>): void {
		this.storageService.store(LAST_INPUT_STORAGE_KEY, JSON.stringify(lru.toJSON()), StorageScope.WORKSPACE, StorageTarget.MACHINE);
	}

	private readInputLru(): LRUCache<string, string> {
		const contents = this.storageService.get(LAST_INPUT_STORAGE_KEY, StorageScope.WORKSPACE);
		const lru = new LRUCache<string, string>(LAST_INPUT_CACHE_SIZE);
		try {
			if (contents) {
				lru.fromJSON(JSON.parse(contents));
			}
		} catch {
			// ignored
		}

		return lru;
	}
}
