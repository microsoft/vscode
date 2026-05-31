/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import {
	CodeLens,
	CodeLensProvider,
	Disposable,
	EventEmitter,
	languages,
	TextDocument,
	Uri,
	workspace,
	l10n
} from 'vscode';
import { readScripts } from './readScripts';
import { getRunScriptCommand } from './tasks';


const enum Constants {
	ConfigKey = 'debug.javascript.codelens.npmScripts',
}

const getFreshLensLocation = () => workspace.getConfiguration().get(Constants.ConfigKey);

/**
 * Npm script lens provider implementation. Can show a "Debug" text above any
 * npm script, or the npm scripts section.
 */
export class NpmScriptLensProvider implements CodeLensProvider, Disposable {
	private lensLocation = getFreshLensLocation();
	private readonly changeEmitter = new EventEmitter<void>();
	private subscriptions: Disposable[] = [];

	/**
	 * @inheritdoc
	 */
	public readonly onDidChangeCodeLenses = this.changeEmitter.event;

	constructor() {
		this.subscriptions.push(
			this.changeEmitter,
			workspace.onDidChangeConfiguration(evt => {
				if (evt.affectsConfiguration(Constants.ConfigKey)) {
					this.lensLocation = getFreshLensLocation();
					this.changeEmitter.fire();
				}
			}),
			languages.registerCodeLensProvider(
				{
					language: 'json',
					pattern: '**/package.json',
				},
				this,
			)
		);
	}

	/**
	 * @inheritdoc
	 */
	public async provideCodeLenses(document: TextDocument): Promise<CodeLens[]> {
		if (this.lensLocation === 'never') {
			return [];
		}

		const tokens = readScripts(document);
		if (!tokens) {
			return [];
		}

		const title = '$(debug-start) ' + l10n.t("Debug");
		const cwd = path.dirname(document.uri.fsPath);
		if (this.lensLocation === 'top') {
			return [
				new CodeLens(
					tokens.location.range,
					{
						title,
						command: 'extension.js-debug.npmScript',
						arguments: [cwd],
					},
				),
			];
		}

		if (this.lensLocation === 'all') {
			const folder = Uri.joinPath(document.uri, '..');
			return Promise.all(tokens.scripts.map(
				async ({ name, nameRange }) => {
					const runScriptCommand = await getRunScriptCommand(name, folder);
					return new CodeLens(
						nameRange,
						{
							title,
							command: 'extension.js-debug.createDebuggerTerminal',
							arguments: [runScriptCommand.join(' '), workspace.getWorkspaceFolder(document.uri), { cwd }],
						},
					);
				},
			));
		}

		return [];
	}

	/**
	 * @inheritdoc
	 */
	public dispose() {
		this.subscriptions.forEach(s => s.dispose());
	}
}
