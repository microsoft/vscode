/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import uri from 'vs/base/common/uri';
import * as paths from 'vs/base/common/paths';
import { Schemas } from 'vs/base/common/network';
import { TPromise } from 'vs/base/common/winjs.base';
import { sequence } from 'vs/base/common/async';
import { toResource } from 'vs/workbench/common/editor';
import { IStringDictionary } from 'vs/base/common/collections';
import { IConfigurationResolverService } from 'vs/workbench/services/configurationResolver/common/configurationResolver';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IWorkspaceFolder, IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IProcessEnvironment } from 'vs/base/common/platform';
import { VariableResolver } from 'vs/workbench/services/configurationResolver/node/variableResolver';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { DiffEditorInput } from 'vs/workbench/common/editor/diffEditorInput';
import { isUndefinedOrNull } from 'vs/base/common/types';
import { localize } from 'vs/nls';


export class ConfigurationResolverService implements IConfigurationResolverService {
	_serviceBrand: any;
	private resolver: VariableResolver;

	constructor(
		envVariables: IProcessEnvironment,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService,
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
				let input = editorService.getActiveEditorInput();
				if (input instanceof DiffEditorInput) {
					input = input.modifiedInput;
				}
				const fileResource = toResource(input, { filter: Schemas.file });
				if (!fileResource) {
					return undefined;
				}
				return paths.normalize(fileResource.fsPath, true);
			},
			getSelectedText: (): string | undefined => {
				const activeEditor = editorService.getActiveEditor();
				if (activeEditor) {
					const editorControl = (<ICodeEditor>activeEditor.getControl());
					if (editorControl) {
						const editorModel = editorControl.getModel();
						const editorSelection = editorControl.getSelection();
						if (editorModel && editorSelection) {
							return editorModel.getValueInRange(editorSelection);
						}
					}
				}
				return undefined;
			},
			getLineNumber: (): string => {
				const activeEditor = editorService.getActiveEditor();
				if (activeEditor) {
					const editorControl = (<ICodeEditor>activeEditor.getControl());
					if (editorControl) {
						const lineNumber = editorControl.getSelection().positionLineNumber;
						return String(lineNumber);
					}
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

	/**
	 * Finds and executes all command variables (see #6569)
	 */
	public executeCommandVariables(configuration: any, variableToCommandMap: IStringDictionary<string>): TPromise<IStringDictionary<string>> {

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

		const factory: { (): TPromise<any> }[] = commands.map(interactiveVariable => {
			return () => {

				let commandId = variableToCommandMap ? variableToCommandMap[interactiveVariable] : null;
				if (!commandId) {
					// Just launch any command if the interactive variable is not contributed by the adapter #12735
					commandId = interactiveVariable;
				}

				return this.commandService.executeCommand<string>(commandId, configuration).then(result => {
					if (typeof result === 'string') {
						commandValueMapping[interactiveVariable] = result;
					} else if (isUndefinedOrNull(result)) {
						cancelled = true;
					} else {
						throw new Error(localize('stringsOnlySupported', "Command {0} did not return a string result. Only strings are supported as results for commands used for variable substitution.", commandId));
					}
				});
			};
		});

		return sequence(factory).then(() => cancelled ? null : commandValueMapping);
	}
}
