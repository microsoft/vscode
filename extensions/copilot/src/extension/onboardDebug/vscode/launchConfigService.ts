/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as JSONC from 'jsonc-parser';
import * as vscode from 'vscode';
import { OffsetLineColumnConverter } from '../../../platform/editing/common/offsetLineColumnConverter';
import { cloneAndChange } from '../../../util/vs/base/common/objects';
import { URI } from '../../../util/vs/base/common/uri';
import { ICommandInteractor, ILaunchConfigService, ILaunchJSON } from '../common/launchConfigService';

export class LaunchConfigService implements ILaunchConfigService {
	declare readonly _serviceBrand: undefined;


	/** @inheritdoc */
	async add(workspaceFolder: URI | undefined, toAdd: { configurations: vscode.DebugConfiguration[]; inputs?: unknown[] }): Promise<void> {
		const config = vscode.workspace.getConfiguration('launch', workspaceFolder);

		const existingConfigs = config.get<vscode.DebugConfiguration[]>('configurations');
		if (toAdd.configurations.length) {
			await config.update(
				'configurations',
				[...toAdd.configurations, ...(existingConfigs || [])],
				vscode.ConfigurationTarget.WorkspaceFolder,
			);
		}

		const existingInputs = config.get<unknown[]>('inputs');
		if (toAdd.inputs?.length) {
			await config.update(
				'inputs',
				[...toAdd.inputs, ...(existingInputs || [])],
				vscode.ConfigurationTarget.WorkspaceFolder,
			);
		}
	}

	/** @inheritdoc */
	async show(workspaceFolder: URI, showConfigName?: string): Promise<void> {
		const fileUri = URI.joinPath(workspaceFolder, '.vscode', 'launch.json');
		let document: vscode.TextDocument | undefined;
		try {
			document = await vscode.workspace.openTextDocument(fileUri);
		} catch {
			return;
		}

		let range: vscode.Range | undefined;
		if (showConfigName) {
			try {
				const text = document.getText();
				const objectOffsetStack: number[] = [];
				let didFind = false;
				JSONC.visit(text, {
					onObjectBegin(offset) {
						objectOffsetStack.push(offset);
					},
					onObjectEnd(endOffset, length) {
						const startOffset = objectOffsetStack.pop()!;
						if (didFind) {
							didFind = false;

							const convert = new OffsetLineColumnConverter(text);
							const start = convert.offsetToPosition(startOffset);
							const end = convert.offsetToPosition(endOffset + length);
							range = new vscode.Range(start.lineNumber - 1, start.column - 1, end.lineNumber - 1, end.column - 1);
						}
					},
					onLiteralValue(value, _offset, _length, _startLine, _startCharacter, pathSupplier) {
						if (value === showConfigName) {
							const path = pathSupplier();
							if (path[path.length - 1] === 'name') {
								didFind = true;
							}
						}
					},
				});
			} catch {
				// ignored
			}
		}

		await vscode.window.showTextDocument(document, { selection: range });
	}

	/** @inheritdoc */
	async launch(config: vscode.DebugConfiguration | ILaunchJSON): Promise<void> {
		const debugConfig: vscode.DebugConfiguration | undefined = 'configurations' in config && config.configurations.length ? config.configurations[0] : config;
		if (!debugConfig) {
			return;
		}
		await vscode.debug.startDebugging(undefined, debugConfig);
	}

	async resolveConfigurationInputs(launchJson: ILaunchJSON, defaults?: Map<string, string>, interactor?: ICommandInteractor) {
		if (!interactor) {
			interactor = {
				isGenerating: () => { },
				ensureTask: () => Promise.resolve(true),
				prompt: async (text: string, defaultValue?: string) => {
					return await vscode.window.showInputBox({
						prompt: text,
						value: defaultValue,
						ignoreFocusOut: true,
					});
				},
			};
		}

		const inputs = new Map<string, string>();
		for (const input of launchJson.inputs || []) {
			const key = `\${input:${input.id}}`;
			const value = await interactor.prompt(input.description, defaults?.get(key));
			if (value === undefined) {
				return undefined;
			}

			inputs.set(key, value);
		}

		const config: vscode.DebugConfiguration = cloneAndChange(launchJson.configurations[0], orig => {
			if (typeof orig === 'string') {
				for (const [key, value] of inputs) {
					orig = orig.replaceAll(key, value);
				}
				return orig;
			}
		});

		return { config, inputs };
	}
}
