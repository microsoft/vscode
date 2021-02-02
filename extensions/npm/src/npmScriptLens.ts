/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { JSONVisitor, visit } from 'jsonc-parser';
import * as path from 'path';
import {
	CodeLens,
	CodeLensProvider,
	Disposable,
	EventEmitter,
	ExtensionContext,
	languages,
	Position,
	Range,
	TextDocument,
	Uri,
	workspace,
} from 'vscode';
import * as nls from 'vscode-nls';
import { findPreferredPM } from './preferred-pm';

const localize = nls.loadMessageBundle();

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
	private changeEmitter = new EventEmitter<void>();
	private subscriptions: Disposable[] = [];

	/**
	 * @inheritdoc
	 */
	public onDidChangeCodeLenses = this.changeEmitter.event;

	constructor() {
		this.subscriptions.push(
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

		const tokens = this.tokenizeScripts(document);
		if (!tokens) {
			return [];
		}

		const title = localize('codelens.debug', '{0} Debug', '$(debug-start)');
		const cwd = path.dirname(document.uri.fsPath);
		if (this.lensLocation === 'top') {
			return [
				new CodeLens(
					new Range(tokens.scriptStart, tokens.scriptStart),
					{
						title,
						command: 'extension.js-debug.npmScript',
						arguments: [cwd],
					},
				),
			];
		}

		if (this.lensLocation === 'all') {
			const packageManager = await findPreferredPM(Uri.joinPath(document.uri, '..').fsPath);
			return tokens.scripts.map(
				({ name, position }) =>
					new CodeLens(
						new Range(position, position),
						{
							title,
							command: 'extension.js-debug.createDebuggerTerminal',
							arguments: [`${packageManager} run ${name}`, workspace.getWorkspaceFolder(document.uri), { cwd }],
						},
					),
			);
		}

		return [];
	}

	/**
	 * @inheritdoc
	 */
	public dispose() {
		this.subscriptions.forEach(s => s.dispose());
	}

	/**
	 * Returns position data about the "scripts" section of the current JSON
	 * document.
	 */
	private tokenizeScripts(document: TextDocument) {
		let scriptStart: Position | undefined;
		let inScripts = false;
		let buildingScript: { name: string; position: Position } | void;
		let level = 0;
		const text = document.getText();
		const getPos = (offset: number) => {
			const line = text.slice(0, offset).match(/\n/g)?.length ?? 0;
			const character = offset - Math.max(0, text.lastIndexOf('\n', offset));
			return new Position(line, character);
		};

		const scripts: { name: string; value: string; position: Position }[] = [];

		const visitor: JSONVisitor = {
			onError() {
				// no-op
			},
			onObjectBegin() {
				level++;
			},
			onObjectEnd() {
				if (inScripts) {
					inScripts = false;
				}
				level--;
			},
			onLiteralValue(value: unknown) {
				if (buildingScript && typeof value === 'string') {
					scripts.push({ ...buildingScript, value });
					buildingScript = undefined;
				}
			},
			onObjectProperty(property: string, offset: number) {
				if (level === 1 && property === 'scripts') {
					inScripts = true;
					scriptStart = getPos(offset);
				} else if (inScripts) {
					buildingScript = { name: property, position: getPos(offset) };
				}
			},
		};

		visit(text, visitor);

		return scriptStart !== undefined ? { scriptStart, scripts } : undefined;
	}
}

export const registerNpmScriptLens = (context: ExtensionContext) => {
	const provider = new NpmScriptLensProvider();

	context.subscriptions.push(provider);
	context.subscriptions.push(
		languages.registerCodeLensProvider(
			{
				language: 'json',
				pattern: '**/package.json',
			},
			provider,
		),
	);
};
