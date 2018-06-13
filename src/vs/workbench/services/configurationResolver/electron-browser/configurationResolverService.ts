/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import uri from 'vs/base/common/uri';
import * as nls from 'vs/nls';
import * as paths from 'vs/base/common/paths';
import * as platform from 'vs/base/common/platform';
import * as objects from 'vs/base/common/objects';
import { Schemas } from 'vs/base/common/network';
import { TPromise } from 'vs/base/common/winjs.base';
import { sequence } from 'vs/base/common/async';
import { toResource } from 'vs/workbench/common/editor';
import { IStringDictionary, size } from 'vs/base/common/collections';
import { IConfigurationResolverService } from 'vs/workbench/services/configurationResolver/common/configurationResolver';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IWorkspaceFolder, IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { VariableResolver } from 'vs/workbench/services/configurationResolver/node/variableResolver';
import { isCodeEditor } from 'vs/editor/browser/editorBrowser';
import { DiffEditorInput } from 'vs/workbench/common/editor/diffEditorInput';
import { isUndefinedOrNull } from 'vs/base/common/types';

export class ConfigurationResolverService implements IConfigurationResolverService {

	_serviceBrand: any;
	private resolver: VariableResolver;

	constructor(
		envVariables: platform.IProcessEnvironment,
		@IEditorService editorService: IEditorService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IConfigurationService configurationService: IConfigurationService,
		@ICommandService private commandService: ICommandService,
		@IWorkspaceContextService workspaceContextService: IWorkspaceContextService
	) {
		this.resolver = new VariableResolver({
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

	public resolve(root: IWorkspaceFolder, value: string): string;
	public resolve(root: IWorkspaceFolder, value: string[]): string[];
	public resolve(root: IWorkspaceFolder, value: IStringDictionary<string>): IStringDictionary<string>;
	public resolve(root: IWorkspaceFolder, value: any): any {
		return this.resolver.resolveAny(root ? root.uri : undefined, value);
	}

	public resolveAny(root: IWorkspaceFolder, value: any, commandValueMapping?: IStringDictionary<string>): any {
		return this.resolver.resolveAny(root ? root.uri : undefined, value, commandValueMapping);
	}

	public resolveWithCommands(folder: IWorkspaceFolder, config: any, variables?: IStringDictionary<string>): TPromise<any> {

		// then substitute remaining variables in VS Code core
		config = this.substituteVariables(folder, config);

		// now evaluate command variables (which might have a UI)
		return this.executeCommandVariables(config, variables).then(commandValueMapping => {

			if (!commandValueMapping) { // cancelled by user
				return null;
			}

			// finally substitute evaluated command variables (if there are any)
			if (size<string>(commandValueMapping) > 0) {
				return this.substituteVariables(folder, config, commandValueMapping);
			} else {
				return config;
			}
		});
	}

	private substituteVariables(workspaceFolder: IWorkspaceFolder, config: any, commandValueMapping?: IStringDictionary<string>): any {

		const result = objects.deepClone(config) as any;

		// hoist platform specific attributes to top level
		if (platform.isWindows && result.windows) {
			Object.keys(result.windows).forEach(key => result[key] = result.windows[key]);
		} else if (platform.isMacintosh && result.osx) {
			Object.keys(result.osx).forEach(key => result[key] = result.osx[key]);
		} else if (platform.isLinux && result.linux) {
			Object.keys(result.linux).forEach(key => result[key] = result.linux[key]);
		}

		// delete all platform specific sections
		delete result.windows;
		delete result.osx;
		delete result.linux;

		// substitute all variables in string values
		return this.resolveAny(workspaceFolder, result, commandValueMapping);
	}

	/**
	 * Finds and executes all command variables (see #6569)
	 */
	private executeCommandVariables(configuration: any, variableToCommandMap: IStringDictionary<string>): TPromise<IStringDictionary<string>> {

		if (!configuration) {
			return TPromise.as(null);
		}

		// use an array to preserve order of first appearance
		const commands: string[] = [];

		const cmd_var = /\${command:(.*?)}/g;

		const findCommandVariables = (object: any) => {
			Object.keys(object).forEach(key => {
				const value = object[key];
				if (value && typeof value === 'object') {
					findCommandVariables(value);
				} else if (typeof value === 'string') {
					let matches;
					while ((matches = cmd_var.exec(value)) !== null) {
						if (matches.length === 2) {
							const command = matches[1];
							if (commands.indexOf(command) < 0) {
								commands.push(command);
							}
						}
					}
				}
			});
		};

		findCommandVariables(configuration);

		let cancelled = false;
		const commandValueMapping: IStringDictionary<string> = Object.create(null);

		const factory: { (): TPromise<any> }[] = commands.map(commandVariable => {
			return () => {

				let commandId = variableToCommandMap ? variableToCommandMap[commandVariable] : null;
				if (!commandId) {
					// Just launch any command if the interactive variable is not contributed by the adapter #12735
					commandId = commandVariable;
				}

				return this.commandService.executeCommand<string>(commandId, configuration).then(result => {
					if (typeof result === 'string') {
						commandValueMapping[commandVariable] = result;
					} else if (isUndefinedOrNull(result)) {
						cancelled = true;
					} else {
						throw new Error(nls.localize('stringsOnlySupported', "Command '{0}' did not return a string result. Only strings are supported as results for commands used for variable substitution.", commandVariable));
					}
				});
			};
		});

		return sequence(factory).then(() => cancelled ? null : commandValueMapping);
	}
}
