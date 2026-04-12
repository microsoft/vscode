/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { normalizeDriveLetter } from '../../../../base/common/labels.js';
import * as paths from '../../../../base/common/path.js';
import { isWindows } from '../../../../base/common/platform.js';
import * as process from '../../../../base/common/process.js';
import * as types from '../../../../base/common/types.js';
import { localize } from '../../../../nls.js';
import { allVariableKinds, VariableError, VariableKind } from './configurationResolver.js';
import { ConfigurationResolverExpression } from './configurationResolverExpression.js';
export class AbstractVariableResolverService {
    constructor(_context, _labelService, _userHomePromise, _envVariablesPromise) {
        this._contributedVariables = new Map();
        this.resolvableVariables = new Set(allVariableKinds);
        this._context = _context;
        this._labelService = _labelService;
        this._userHomePromise = _userHomePromise;
        if (_envVariablesPromise) {
            this._envVariablesPromise = _envVariablesPromise.then(envVariables => {
                return this.prepareEnv(envVariables);
            });
        }
    }
    prepareEnv(envVariables) {
        // windows env variables are case insensitive
        if (isWindows) {
            const ev = Object.create(null);
            Object.keys(envVariables).forEach(key => {
                ev[key.toLowerCase()] = envVariables[key];
            });
            return ev;
        }
        return envVariables;
    }
    async resolveWithEnvironment(environment, folder, value) {
        const expr = ConfigurationResolverExpression.parse(value);
        for (const replacement of expr.unresolved()) {
            const resolvedValue = await this.evaluateSingleVariable(replacement, folder?.uri, environment);
            if (resolvedValue !== undefined) {
                expr.resolve(replacement, String(resolvedValue));
            }
        }
        return expr.toObject();
    }
    async resolveAsync(folder, config) {
        const expr = ConfigurationResolverExpression.parse(config);
        for (const replacement of expr.unresolved()) {
            const resolvedValue = await this.evaluateSingleVariable(replacement, folder?.uri);
            if (resolvedValue !== undefined) {
                expr.resolve(replacement, String(resolvedValue));
            }
        }
        return expr.toObject();
    }
    resolveWithInteractionReplace(folder, config) {
        throw new Error('resolveWithInteractionReplace not implemented.');
    }
    resolveWithInteraction(folder, config) {
        throw new Error('resolveWithInteraction not implemented.');
    }
    contributeVariable(variable, resolution) {
        if (this._contributedVariables.has(variable)) {
            throw new Error('Variable ' + variable + ' is contributed twice.');
        }
        else {
            this.resolvableVariables.add(variable);
            this._contributedVariables.set(variable, resolution);
        }
    }
    fsPath(displayUri) {
        return this._labelService ? this._labelService.getUriLabel(displayUri, { noPrefix: true }) : displayUri.fsPath;
    }
    async evaluateSingleVariable(replacement, folderUri, processEnvironment, commandValueMapping) {
        const environment = {
            env: (processEnvironment !== undefined) ? this.prepareEnv(processEnvironment) : await this._envVariablesPromise,
            userHome: (processEnvironment !== undefined) ? undefined : await this._userHomePromise
        };
        const { name: variable, arg: argument } = replacement;
        // common error handling for all variables that require an open editor
        const getFilePath = (variableKind) => {
            const filePath = this._context.getFilePath();
            if (filePath) {
                return normalizeDriveLetter(filePath);
            }
            throw new VariableError(variableKind, (localize('canNotResolveFile', "Variable {0} can not be resolved. Please open an editor.", replacement.id)));
        };
        // common error handling for all variables that require an open editor
        const getFolderPathForFile = (variableKind) => {
            const filePath = getFilePath(variableKind); // throws error if no editor open
            if (this._context.getWorkspaceFolderPathForFile) {
                const folderPath = this._context.getWorkspaceFolderPathForFile();
                if (folderPath) {
                    return normalizeDriveLetter(folderPath);
                }
            }
            throw new VariableError(variableKind, localize('canNotResolveFolderForFile', "Variable {0}: can not find workspace folder of '{1}'.", replacement.id, paths.basename(filePath)));
        };
        // common error handling for all variables that require an open folder and accept a folder name argument
        const getFolderUri = (variableKind) => {
            if (argument) {
                const folder = this._context.getFolderUri(argument);
                if (folder) {
                    return folder;
                }
                throw new VariableError(variableKind, localize('canNotFindFolder', "Variable {0} can not be resolved. No such folder '{1}'.", variableKind, argument));
            }
            if (folderUri) {
                return folderUri;
            }
            if (this._context.getWorkspaceFolderCount() > 1) {
                throw new VariableError(variableKind, localize('canNotResolveWorkspaceFolderMultiRoot', "Variable {0} can not be resolved in a multi folder workspace. Scope this variable using ':' and a workspace folder name.", variableKind));
            }
            throw new VariableError(variableKind, localize('canNotResolveWorkspaceFolder', "Variable {0} can not be resolved. Please open a folder.", variableKind));
        };
        switch (variable) {
            case 'env':
                if (argument) {
                    if (environment.env) {
                        const env = environment.env[isWindows ? argument.toLowerCase() : argument];
                        if (types.isString(env)) {
                            return env;
                        }
                    }
                    return '';
                }
                throw new VariableError(VariableKind.Env, localize('missingEnvVarName', "Variable {0} can not be resolved because no environment variable name is given.", replacement.id));
            case 'config':
                if (argument) {
                    const config = this._context.getConfigurationValue(folderUri, argument);
                    if (types.isUndefinedOrNull(config)) {
                        throw new VariableError(VariableKind.Config, localize('configNotFound', "Variable {0} can not be resolved because setting '{1}' not found.", replacement.id, argument));
                    }
                    if (types.isObject(config)) {
                        throw new VariableError(VariableKind.Config, localize('configNoString', "Variable {0} can not be resolved because '{1}' is a structured value.", replacement.id, argument));
                    }
                    return config;
                }
                throw new VariableError(VariableKind.Config, localize('missingConfigName', "Variable {0} can not be resolved because no settings name is given.", replacement.id));
            case 'command':
                return this.resolveFromMap(VariableKind.Command, replacement.id, argument, commandValueMapping, 'command');
            case 'input':
                return this.resolveFromMap(VariableKind.Input, replacement.id, argument, commandValueMapping, 'input');
            case 'extensionInstallFolder':
                if (argument) {
                    const ext = await this._context.getExtension(argument);
                    if (!ext) {
                        throw new VariableError(VariableKind.ExtensionInstallFolder, localize('extensionNotInstalled', "Variable {0} can not be resolved because the extension {1} is not installed.", replacement.id, argument));
                    }
                    return this.fsPath(ext.extensionLocation);
                }
                throw new VariableError(VariableKind.ExtensionInstallFolder, localize('missingExtensionName', "Variable {0} can not be resolved because no extension name is given.", replacement.id));
            default: {
                switch (variable) {
                    case 'workspaceRoot':
                    case 'workspaceFolder': {
                        const uri = getFolderUri(VariableKind.WorkspaceFolder);
                        return uri ? normalizeDriveLetter(this.fsPath(uri)) : undefined;
                    }
                    case 'cwd': {
                        if (!folderUri && !argument) {
                            return process.cwd();
                        }
                        const uri = getFolderUri(VariableKind.Cwd);
                        return uri ? normalizeDriveLetter(this.fsPath(uri)) : undefined;
                    }
                    case 'workspaceRootFolderName':
                    case 'workspaceFolderBasename': {
                        const uri = getFolderUri(VariableKind.WorkspaceFolderBasename);
                        return uri ? normalizeDriveLetter(paths.basename(this.fsPath(uri))) : undefined;
                    }
                    case 'userHome':
                        if (environment.userHome) {
                            return environment.userHome;
                        }
                        throw new VariableError(VariableKind.UserHome, localize('canNotResolveUserHome', "Variable {0} can not be resolved. UserHome path is not defined", replacement.id));
                    case 'lineNumber': {
                        const lineNumber = this._context.getLineNumber();
                        if (lineNumber) {
                            return lineNumber;
                        }
                        throw new VariableError(VariableKind.LineNumber, localize('canNotResolveLineNumber', "Variable {0} can not be resolved. Make sure to have a line selected in the active editor.", replacement.id));
                    }
                    case 'columnNumber': {
                        const columnNumber = this._context.getColumnNumber();
                        if (columnNumber) {
                            return columnNumber;
                        }
                        throw new Error(localize('canNotResolveColumnNumber', "Variable {0} can not be resolved. Make sure to have a column selected in the active editor.", replacement.id));
                    }
                    case 'selectedText': {
                        const selectedText = this._context.getSelectedText();
                        if (selectedText) {
                            return selectedText;
                        }
                        throw new VariableError(VariableKind.SelectedText, localize('canNotResolveSelectedText', "Variable {0} can not be resolved. Make sure to have some text selected in the active editor.", replacement.id));
                    }
                    case 'file':
                        return getFilePath(VariableKind.File);
                    case 'fileWorkspaceFolder':
                        return getFolderPathForFile(VariableKind.FileWorkspaceFolder);
                    case 'fileWorkspaceFolderBasename':
                        return paths.basename(getFolderPathForFile(VariableKind.FileWorkspaceFolderBasename));
                    case 'relativeFile':
                        if (folderUri || argument) {
                            return paths.relative(this.fsPath(getFolderUri(VariableKind.RelativeFile)), getFilePath(VariableKind.RelativeFile));
                        }
                        return getFilePath(VariableKind.RelativeFile);
                    case 'relativeFileDirname': {
                        const dirname = paths.dirname(getFilePath(VariableKind.RelativeFileDirname));
                        if (folderUri || argument) {
                            const relative = paths.relative(this.fsPath(getFolderUri(VariableKind.RelativeFileDirname)), dirname);
                            return relative.length === 0 ? '.' : relative;
                        }
                        return dirname;
                    }
                    case 'fileDirname':
                        return paths.dirname(getFilePath(VariableKind.FileDirname));
                    case 'fileExtname':
                        return paths.extname(getFilePath(VariableKind.FileExtname));
                    case 'fileBasename':
                        return paths.basename(getFilePath(VariableKind.FileBasename));
                    case 'fileBasenameNoExtension': {
                        const basename = paths.basename(getFilePath(VariableKind.FileBasenameNoExtension));
                        return (basename.slice(0, basename.length - paths.extname(basename).length));
                    }
                    case 'fileDirnameBasename':
                        return paths.basename(paths.dirname(getFilePath(VariableKind.FileDirnameBasename)));
                    case 'execPath': {
                        const ep = this._context.getExecPath();
                        if (ep) {
                            return ep;
                        }
                        return replacement.id;
                    }
                    case 'execInstallFolder': {
                        const ar = this._context.getAppRoot();
                        if (ar) {
                            return ar;
                        }
                        return replacement.id;
                    }
                    case 'pathSeparator':
                    case '/':
                        return paths.sep;
                    default: {
                        try {
                            return this.resolveFromMap(VariableKind.Unknown, replacement.id, argument, commandValueMapping, undefined);
                        }
                        catch {
                            return replacement.id;
                        }
                    }
                }
            }
        }
    }
    resolveFromMap(variableKind, match, argument, commandValueMapping, prefix) {
        if (argument && commandValueMapping) {
            const v = (prefix === undefined) ? commandValueMapping[argument] : commandValueMapping[prefix + ':' + argument];
            if (typeof v === 'string') {
                return v;
            }
            throw new VariableError(variableKind, localize('noValueForCommand', "Variable {0} can not be resolved because the command has no value.", match));
        }
        return match;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmFyaWFibGVSZXNvbHZlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9jb25maWd1cmF0aW9uUmVzb2x2ZXIvY29tbW9uL3ZhcmlhYmxlUmVzb2x2ZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFHaEcsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDekUsT0FBTyxLQUFLLEtBQUssTUFBTSxpQ0FBaUMsQ0FBQztBQUN6RCxPQUFPLEVBQXVCLFNBQVMsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQ3JGLE9BQU8sS0FBSyxPQUFPLE1BQU0sb0NBQW9DLENBQUM7QUFDOUQsT0FBTyxLQUFLLEtBQUssTUFBTSxrQ0FBa0MsQ0FBQztBQUUxRCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFHOUMsT0FBTyxFQUFFLGdCQUFnQixFQUFpQyxhQUFhLEVBQUUsWUFBWSxFQUFFLE1BQU0sNEJBQTRCLENBQUM7QUFDMUgsT0FBTyxFQUFFLCtCQUErQixFQUErQixNQUFNLHNDQUFzQyxDQUFDO0FBa0JwSCxNQUFNLE9BQWdCLCtCQUErQjtJQVlwRCxZQUFZLFFBQWlDLEVBQUUsYUFBNkIsRUFBRSxnQkFBa0MsRUFBRSxvQkFBbUQ7UUFKM0osMEJBQXFCLEdBQW1ELElBQUksR0FBRyxFQUFFLENBQUM7UUFFNUUsd0JBQW1CLEdBQUcsSUFBSSxHQUFHLENBQVMsZ0JBQWdCLENBQUMsQ0FBQztRQUd2RSxJQUFJLENBQUMsUUFBUSxHQUFHLFFBQVEsQ0FBQztRQUN6QixJQUFJLENBQUMsYUFBYSxHQUFHLGFBQWEsQ0FBQztRQUNuQyxJQUFJLENBQUMsZ0JBQWdCLEdBQUcsZ0JBQWdCLENBQUM7UUFDekMsSUFBSSxvQkFBb0IsRUFBRSxDQUFDO1lBQzFCLElBQUksQ0FBQyxv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