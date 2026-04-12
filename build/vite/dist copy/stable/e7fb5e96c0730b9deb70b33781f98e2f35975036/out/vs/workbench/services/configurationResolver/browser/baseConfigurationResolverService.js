/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Queue } from '../../../../base/common/async.js';
import { Iterable } from '../../../../base/common/iterator.js';
import { LRUCache } from '../../../../base/common/map.js';
import { Schemas } from '../../../../base/common/network.js';
import * as Types from '../../../../base/common/types.js';
import { isCodeEditor, isDiffEditor } from '../../../../editor/browser/editorBrowser.js';
import { localize } from '../../../../nls.js';
import { EditorResourceAccessor, SideBySideEditor } from '../../../common/editor.js';
import { VariableError, VariableKind } from '../common/configurationResolver.js';
import { ConfigurationResolverExpression } from '../common/configurationResolverExpression.js';
import { AbstractVariableResolverService } from '../common/variableResolver.js';
const LAST_INPUT_STORAGE_KEY = 'configResolveInputLru';
const LAST_INPUT_CACHE_SIZE = 5;
export class BaseConfigurationResolverService extends AbstractVariableResolverService {
    static { this.INPUT_OR_COMMAND_VARIABLES_PATTERN = /\${((input|command):(.*?))}/g; }
    constructor(context, envVariablesPromise, editorService, configurationService, commandService, workspaceContextService, quickInputService, labelService, pathService, extensionService, storageService) {
        super({
            getFolderUri: (folderName) => {
                const folder = workspaceContextService.getWorkspace().folders.filter(f => f.name === folderName).pop();
                return folder ? folder.uri : undefined;
            },
            getWorkspaceFolderCount: () => {
                return workspaceContextService.getWorkspace().folders.length;
            },
            getConfigurationValue: (folderUri, section) => {
                return configurationService.getValue(section, folderUri ? { resource: folderUri } : {});
            },
            getAppRoot: () => {
                return context.getAppRoot();
            },
            getExecPath: () => {
                return context.getExecPath();
            },
            getFilePath: () => {
                const fileResource = EditorResourceAccessor.getOriginalUri(editorService.activeEditor, {
                    supportSideBySide: SideBySideEditor.PRIMARY,
                    filterByScheme: [Schemas.file, Schemas.vscodeUserData, this.pathService.defaultUriScheme]
                });
                if (!fileResource) {
                    return undefined;
                }
                return this.labelService.getUriLabel(fileResource, { noPrefix: true });
            },
            getWorkspaceFolderPathForFile: () => {
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
            getSelectedText: () => {
                const activeTextEditorControl = editorService.activeTextEditorControl;
                let activeControl = null;
                if (isCodeEditor(activeTextEditorControl)) {
                    activeControl = activeTextEditorControl;
                }
                else if (isDiffEditor(activeTextEditorControl)) {
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
            getLineNumber: () => {
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
            getColumnNumber: () => {
                const activeTextEditorControl = editorService.activeTextEditorControl;
                if (isCodeEditor(activeTextEditorControl)) {
                    const selection = activeTextEditorControl.getSelection();
                    if (selection) {
                        const columnNumber = selection.positionColumn;
                        return String(columnNumber);
                    }
                }
                return undefined;
            },
            getExtension: id => {
                return extensionService.getExtension(id);
            },
        }, labelService, pathService.userHome().then(home => home.path), envVariablesPromise);
        this.configurationService = configurationService;
        this.commandService = commandService;
        this.quickInputService = quickInputService;
        this.labelService = labelService;
        this.pathService = pathService;
        this.storageService = storageService;
        this.userInputAccessQueue = new Queue();
        this.resolvableVariables.add('command');
        this.resolvableVariables.add('input');
    }
    async resolveWithInteractionReplace(folder, config, section, variables, target) {
        const parsed = ConfigurationResolverExpression.parse(config);
        const resolved = await this.resolveWithInteraction(folder, parsed, section, variables, target);
        // Skip if input variable was canceled
        if (resolved === undefined) {
            return undefined;
        }
        return parsed.toObject();
    }
    async resolveWithInteraction(folder, config, section, variableToCommandMap, target) {
        const expr = ConfigurationResolverExpression.parse(config);
        // Get values for input variables from UI
        for (const variable of expr.unresolved()) {
            let result;
            // Command
            if (variable.name === 'command') {
                const commandId = (variableToCommandMap ? variableToCommandMap[variable.arg] : undefined) || variable.arg;
                const value = await this.commandService.executeCommand(commandId, expr.toObject());
                if (!Types.isUndefinedOrNull(value)) {
                    if (typeof value !== 'string') {
                        throw new VariableError(VariableKind.Command, localize('commandVariable.noStringType', "Cannot substitute command variable '{0}' because command did not return a result of type string.", commandId));
                    }
                    result = { value };
                }
            }
            // Input
            else if (variable.name === 'input') {
                result = await this.showUserInput(section, variable.arg, await this.resolveInputs(folder, section, target), variableToCommandMap);
            }
            // Contributed variable
            else if (this._contributedVariables.has(variable.inner)) {
                result = { value: await this._contributedVariables.get(variable.inner)() };
            }
            else {
                // Fallback to parent evaluation
                const resolvedValue = await this.evaluateSingleVariable(variable, folder?.uri);
                if (resolvedValue === undefined) {
                    // Not something we can handle
                    continue;
                }
                result = typeof resolvedValue === 'string' ? { value: resolvedValue } : resolvedValue;
            }
            if (result === undefined) {
                // Skip the entire flow if any input variable was canceled
                return undefined;
            }
            expr.resolve(variable, result);
        }
        return new Map(Iterable.map(expr.resolved(), ([key, value]) => [key.inner, value.value]));
    }
    async resolveInputs(folder, section, target) {
        if (!section) {
            return undefined;
        }
        // Look at workspace configuration
        let inputs;
        const overrides = folder ? { resource: folder.uri } : {};
        const result = this.configurationService.inspect(section, overrides);
        if (result) {
            switch (target) {
                case 8 /* ConfigurationTarget.MEMORY */:
                    inputs = result.memoryValue?.inputs;
                    break;
                case 7 /* ConfigurationTarget.DEFAULT */:
                    inputs = result.defaultValue?.inputs;
                    break;
                case 2 /* ConfigurationTarget.USER */:
                    inputs = result.userValue?.inputs;
                    break;
                case 3 /* ConfigurationTarget.USER_LOCAL */:
                    inputs = result.userLocalValue?.inputs;
                    break;
                case 4 /* ConfigurationTarget.USER_REMOTE */:
                    inputs = result.userRemoteValue?.inputs;
                    break;
                case 1 /* ConfigurationTarget.APPLICATION */:
                    inputs = result.applicationValue?.inputs;
                    break;
                case 5 /* ConfigurationTarget.WORKSPACE */:
                    inputs = result.workspaceValue?.inputs;
                    break;
                case 6 /* ConfigurationTarget.WORKSPACE_FOLDER */:
                default:
                    inputs = result.workspaceFolderValue?.inputs;
                    break;
            }
        }
        inputs ??= this.configurationService.getValue(section, overrides)?.inputs;
        return inputs;
    }
    readInputLru() {
        const contents = this.storageService.get(LAST_INPUT_STORAGE_KEY, 1 /* StorageScope.WORKSPACE */);
        const lru = new LRUCache(LAST_INPUT_CACHE_SIZE);
        try {
            if (contents) {
                lru.fromJSON(JSON.parse(contents));
            }
        }
        catch {
            // ignored
        }
        return lru;
    }
    storeInputLru(lru) {
        this.storageService.store(LAST_INPUT_STORAGE_KEY, JSON.stringify(lru.toJSON()), 1 /* StorageScope.WORKSPACE */, 1 /* StorageTarget.MACHINE */);
    }
    async showUserInput(section, variable, inputInfos, variableToCommandMap) {
        if (!inputInfos) {
            throw new VariableError(VariableKind.Input, localize('inputVariable.noInputSection', "Variable '{0}' must be defined in an '{1}' section of the debug or task configuration.", variable, 'inputs'));
        }
        // Find info for the given input variable
        const info = inputInfos.filter(item => item.id === variable).pop();
        if (info) {
            const missingAttribute = (attrName) => {
                throw new VariableError(VariableKind.Input, localize('inputVariable.missingAttribute', "Input variable '{0}' is of type '{1}' and must include '{2}'.", variable, info.type, attrName));
            };
            const defaultValueMap = this.readInputLru();
            const defaultValueKey = `${section}.${variable}`;
            const previousPickedValue = defaultValueMap.get(defaultValueKey);
            switch (info.type) {
                case 'promptString': {
                    if (!Types.isString(info.description)) {
                        missingAttribute('description');
                    }
                    const inputOptions = { prompt: info.description, ignoreFocusLost: true, value: variableToCommandMap?.[`input:${variable}`] ?? previousPickedValue ?? info.default };
                    if (info.password) {
                        inputOptions.password = info.password;
                    }
                    return this.userInputAccessQueue.queue(() => this.quickInputService.input(inputOptions)).then(resolvedInput => {
                        if (typeof resolvedInput === 'string' && !info.password) {
                            this.storeInputLru(defaultValueMap.set(defaultValueKey, resolvedInput));
                        }
                        return resolvedInput !== undefined ? { value: resolvedInput, input: info } : undefined;
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
                    }
                    else {
                        missingAttribute('options');
                    }
                    const picks = new Array();
                    for (const pickOption of info.options) {
                        const value = Types.isString(pickOption) ? pickOption : pickOption.value;
                        const label = Types.isString(pickOption) ? undefined : pickOption.label;
                        const item = {
                            label: label ? `${label}: ${value}` : value,
                            value: value
                        };
                        const topValue = variableToCommandMap?.[`input:${variable}`] ?? previousPickedValue ?? info.default;
                        if (value === info.default) {
                            item.description = localize('inputVariable.defaultInputValue', "(Default)");
                            picks.unshift(item);
                        }
                        else if (value === topValue) {
                            picks.unshift(item);
                        }
                        else {
                            picks.push(item);
                        }
                    }
                    const pickOptions = { placeHolder: info.description, matchOnDetail: true, ignoreFocusLost: true };
                    return this.userInputAccessQueue.queue(() => this.quickInputService.pick(picks, pickOptions, undefined)).then(resolvedInput => {
                        if (resolvedInput) {
                            const value = resolvedInput.value;
                            this.storeInputLru(defaultValueMap.set(defaultValueKey, value));
                            return { value, input: info };
                        }
                        return undefined;
                    });
                }
                case 'command': {
                    if (!Types.isString(info.command)) {
                        missingAttribute('command');
                    }
                    return this.userInputAccessQueue.queue(() => this.commandService.executeCommand(info.command, info.args)).then(result => {
                        if (typeof result === 'string' || Types.isUndefinedOrNull(result)) {
                            return { value: result, input: info };
                        }
                        throw new VariableError(VariableKind.Input, localize('inputVariable.command.noStringType', "Cannot substitute input variable '{0}' because command '{1}' did not return a result of type string.", variable, info.command));
                    });
                }
                default:
                    throw new VariableError(VariableKind.Input, localize('inputVariable.unknownType', "Input variable '{0}' can only be of type 'promptString', 'pickString', or 'command'.", variable));
            }
        }
        throw new VariableError(VariableKind.Input, localize('inputVariable.undefinedVariable', "Undefined input variable '{0}' encountered. Remove or define '{0}' to continue.", variable));
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmFzZUNvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMvY29uZmlndXJhdGlvblJlc29sdmVyL2Jyb3dzZXIvYmFzZUNvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFDaEcsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBRXpELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUMvRCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDMUQsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBRTdELE9BQU8sS0FBSyxLQUFLLE1BQU0sa0NBQWtDLENBQUM7QUFFMUQsT0FBTyxFQUFlLFlBQVksRUFBRSxZQUFZLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUN0RyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFPOUMsT0FBTyxFQUFFLHNCQUFzQixFQUFFLGdCQUFnQixFQUFFLE1BQU0sMkJBQTJCLENBQUM7QUFJckYsT0FBTyxFQUFtQixhQUFhLEVBQUUsWUFBWSxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDbEcsT0FBTyxFQUFFLCtCQUErQixFQUFrQixNQUFNLDhDQUE4QyxDQUFDO0FBQy9HLE9BQU8sRUFBRSwrQkFBK0IsRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBRWhGLE1BQU0sc0JBQXNCLEdBQUcsdUJBQXVCLENBQUM7QUFDdkQsTUFBTSxxQkFBcUIsR0FBRyxDQUFDLENBQUM7QUFFaEMsTUFBTSxPQUFnQixnQ0FBaUMsU0FBUSwrQkFBK0I7YUFFN0UsdUNBQWtDLEdBQUcsOEJBQThCLEFBQWpDLENBQWtD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