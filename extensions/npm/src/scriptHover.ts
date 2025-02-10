/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { dirname } from 'path';
import {
	CancellationToken, commands, ExtensionContext,
	Hover, HoverProvider, MarkdownString, l10n, Position, ProviderResult,
	tasks, TextDocument,
	Uri, workspace
} from 'vscode';
import { INpmScriptInfo, readScripts } from './readScripts';
import {
	createScriptRunnerTask,
	startDebugging
} from './tasks';


let cachedDocument: Uri | undefined = undefined;
let cachedScripts: INpmScriptInfo | undefined = undefined;

export function invalidateHoverScriptsCache(document?: TextDocument) {
	if (!document) {
		cachedDocument = undefined;
		return;
	}
	if (document.uri === cachedDocument) {
		cachedDocument = undefined;
	}
}

export class NpmScriptHoverProvider implements HoverProvider {
	private enabled: boolean;

	constructor(private context: ExtensionContext) {
		context.subscriptions.push(commands.registerCommand('npm.runScriptFromHover', this.runScriptFromHover, this));
		context.subscriptions.push(commands.registerCommand('npm.debugScriptFromHover', this.debugScriptFromHover, this));
		context.subscriptions.push(workspace.onDidChangeTextDocument((e) => {
			invalidateHoverScriptsCache(e.document);
		}));

		const isEnabled = () => workspace.getConfiguration('npm').get<boolean>('scriptHover', true);
		this.enabled = isEnabled();
		context.subscriptions.push(workspace.onDidChangeConfiguration((e) => {
			if (e.affectsConfiguration('npm.scriptHover')) {
				this.enabled = isEnabled();
			}
		}));
	}

	public provideHover(document: TextDocument, position: Position, _token: CancellationToken): ProviderResult<Hover> {
		if (!this.enabled) {
			return;
		}

		let hover: Hover | undefined = undefined;

		if (!cachedDocument || cachedDocument.fsPath !== document.uri.fsPath) {
			cachedScripts = readScripts(document);
			cachedDocument = document.uri;
		}

		cachedScripts?.scripts.forEach(({ name, nameRange }) => {
			if (nameRange.contains(position)) {
				const contents: MarkdownString = new MarkdownString();
				contents.isTrusted = true;
				contents.appendMarkdown(this.createRunScriptMarkdown(name, document.uri));
				contents.appendMarkdown(this.createDebugScriptMarkdown(name, document.uri));
				hover = new Hover(contents);
			}
		});
		return hover;
	}

	private createRunScriptMarkdown(script: string, documentUri: Uri): string {
		const args = {
			documentUri: documentUri,
			script: script,
		};
		return this.createMarkdownLink(
			l10n.t("Run Script"),
			'npm.runScriptFromHover',
			args,
			l10n.t("Run the script as a task")
		);
	}

	private createDebugScriptMarkdown(script: string, documentUri: Uri): string {
		const args = {
			documentUri: documentUri,
			script: script,
		};
		return this.createMarkdownLink(
			l10n.t("Debug Script"),
			'npm.debugScriptFromHover',
			args,
			l10n.t("Runs the script under the debugger"),
			'|'
		);
	}

	private createMarkdownLink(label: string, cmd: string, args: any, tooltip: string, separator?: string): string {
		const encodedArgs = encodeURIComponent(JSON.stringify(args));
		let prefix = '';
		if (separator) {
			prefix = ` ${separator} `;
		}
		return `${prefix}[${label}](command:${cmd}?${encodedArgs} "${tooltip}")`;
	}

	public async runScriptFromHover(args: any) {
		const script = args.script;
		const documentUri = args.documentUri;
		const folder = workspace.getWorkspaceFolder(documentUri);
		if (folder) {
			const task = await createScriptRunnerTask(this.context, script, folder, documentUri);
			await tasks.executeTask(task);
		}
	}

	public debugScriptFromHover(args: { script: string; documentUri: Uri }) {
		const script = args.script;
		const documentUri = args.documentUri;
		const folder = workspace.getWorkspaceFolder(documentUri);
		if (folder) {
			startDebugging(this.context, script, dirname(documentUri.fsPath), folder);
		}
	}
}
