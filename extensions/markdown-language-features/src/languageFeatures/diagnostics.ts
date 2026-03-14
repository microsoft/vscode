/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { MdLanguageClient } from '../client/client';
import { CommandManager } from '../commandManager';
import { Disposable } from '../util/dispose';
import { isMarkdownFile, markdownFileExtensions } from '../util/file';


// Copied from markdown language service
export enum DiagnosticCode {
	link_noSuchReferences = 'link.no-such-reference',
	link_noSuchHeaderInOwnFile = 'link.no-such-header-in-own-file',
	link_noSuchFile = 'link.no-such-file',
	link_noSuchHeaderInFile = 'link.no-such-header-in-file',
}


class AddToIgnoreLinksQuickFixProvider implements vscode.CodeActionProvider {

	static readonly #addToIgnoreLinksCommandId = '_markdown.addToIgnoreLinks';

	static readonly #metadata: vscode.CodeActionProviderMetadata = {
		providedCodeActionKinds: [
			vscode.CodeActionKind.QuickFix
		],
	};

	public static register(selector: vscode.DocumentSelector, commandManager: CommandManager): vscode.Disposable {
		const reg = vscode.languages.registerCodeActionsProvider(selector, new AddToIgnoreLinksQuickFixProvider(), AddToIgnoreLinksQuickFixProvider.#metadata);
		const commandReg = commandManager.register({
			id: AddToIgnoreLinksQuickFixProvider.#addToIgnoreLinksCommandId,
			execute(resource: vscode.Uri, path: string) {
				const settingId = 'validate.ignoredLinks';
				const config = vscode.workspace.getConfiguration('markdown', resource);
				const paths = new Set(config.get<string[]>(settingId, []));
				paths.add(path);
				config.update(settingId, [...paths], vscode.ConfigurationTarget.WorkspaceFolder);
			}
		});
		return vscode.Disposable.from(reg, commandReg);
	}

	provideCodeActions(document: vscode.TextDocument, _range: vscode.Range | vscode.Selection, context: vscode.CodeActionContext, _token: vscode.CancellationToken): vscode.ProviderResult<(vscode.CodeAction | vscode.Command)[]> {
		const fixes: vscode.CodeAction[] = [];

		for (const diagnostic of context.diagnostics) {
			switch (diagnostic.code) {
				case DiagnosticCode.link_noSuchReferences:
				case DiagnosticCode.link_noSuchHeaderInOwnFile:
				case DiagnosticCode.link_noSuchFile:
				case DiagnosticCode.link_noSuchHeaderInFile: {
					const hrefText = (diagnostic as unknown as Record<string, any>).data?.hrefText;
					if (hrefText) {
						const fix = new vscode.CodeAction(
							vscode.l10n.t("Exclude '{0}' from link validation.", hrefText),
							vscode.CodeActionKind.QuickFix);

						fix.command = {
							command: AddToIgnoreLinksQuickFixProvider.#addToIgnoreLinksCommandId,
							title: '',
							arguments: [document.uri, hrefText],
						};
						fixes.push(fix);
					}
					break;
				}
			}
		}

		return fixes;
	}
}

function registerMarkdownStatusItem(selector: vscode.DocumentSelector, commandManager: CommandManager): vscode.Disposable {
	const statusItem = vscode.languages.createLanguageStatusItem('markdownStatus', selector);

	const enabledSettingId = 'validate.enabled';
	const commandId = '_markdown.toggleValidation';

	const commandSub = commandManager.register({
		id: commandId,
		execute: (enabled: boolean) => {
			vscode.workspace.getConfiguration('markdown').update(enabledSettingId, enabled);
		}
	});

	const update = () => {
		const activeDoc = vscode.window.activeTextEditor?.document;
		const markdownDoc = activeDoc && isMarkdownFile(activeDoc) ? activeDoc : undefined;

		const enabled = vscode.workspace.getConfiguration('markdown', markdownDoc).get(enabledSettingId);
		if (enabled) {
			statusItem.text = vscode.l10n.t('Markdown link validation enabled');
			statusItem.command = {
				command: commandId,
				arguments: [false],
				title: vscode.l10n.t('Disable'),
				tooltip: vscode.l10n.t('Disable validation of Markdown links'),
			};
		} else {
			statusItem.text = vscode.l10n.t('Markdown link validation disabled');
			statusItem.command = {
				command: commandId,
				arguments: [true],
				title: vscode.l10n.t('Enable'),
				tooltip: vscode.l10n.t('Enable validation of Markdown links'),
			};
		}
	};
	update();

	return vscode.Disposable.from(
		statusItem,
		commandSub,
		vscode.workspace.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('markdown.' + enabledSettingId)) {
				update();
			}
		}),
	);
}

class WorkspaceDiagnosticManager extends Disposable {

	private readonly _collection: vscode.DiagnosticCollection;
	private readonly _pendingDiagnostics = new Set<string>();

	private _validateDelayHandle: ReturnType<typeof setTimeout> | undefined;
	private _currentCancelSource: vscode.CancellationTokenSource | undefined;

	constructor(
		private readonly _client: MdLanguageClient,
	) {
		super();

		this._collection = this._register(vscode.languages.createDiagnosticCollection('markdown-workspace'));

		if (this._isEnabled()) {
			this._validateWorkspace();
		}

		this._register(vscode.workspace.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('markdown.validate.enabled') || e.affectsConfiguration('markdown.validate.workspaceEnabled')) {
				if (this._isEnabled()) {
					this._validateWorkspace();
				} else {
					this._cancelPending();
					this._collection.clear();
				}
			}
		}));

		const mdFileGlob = `**/*.{${markdownFileExtensions.join(',')}}`;
		const watcher = this._register(vscode.workspace.createFileSystemWatcher(mdFileGlob));

		this._register(watcher.onDidChange(uri => {
			if (this._isEnabled()) {
				this._queueValidation(uri);
			}
		}));

		this._register(watcher.onDidCreate(uri => {
			if (this._isEnabled()) {
				this._queueValidation(uri);
			}
		}));

		this._register(watcher.onDidDelete(uri => {
			this._collection.delete(uri);
		}));

		// When a document is opened, remove it from workspace diagnostics
		// to avoid duplicates with the pull-based diagnostics
		this._register(vscode.workspace.onDidOpenTextDocument(doc => {
			if (isMarkdownFile(doc)) {
				this._collection.delete(doc.uri);
			}
		}));

		// When a document is closed, re-validate it for workspace diagnostics
		this._register(vscode.workspace.onDidCloseTextDocument(doc => {
			if (isMarkdownFile(doc) && this._isEnabled()) {
				this._queueValidation(doc.uri);
			}
		}));
	}

	private _isEnabled(): boolean {
		const config = vscode.workspace.getConfiguration('markdown');
		return !!config.get<boolean>('validate.enabled') && !!config.get<boolean>('validate.workspaceEnabled');
	}

	private _cancelPending(): void {
		this._currentCancelSource?.cancel();
		this._currentCancelSource?.dispose();
		this._currentCancelSource = undefined;
		if (this._validateDelayHandle) {
			clearTimeout(this._validateDelayHandle);
			this._validateDelayHandle = undefined;
		}
		this._pendingDiagnostics.clear();
	}

	private _queueValidation(uri: vscode.Uri): void {
		this._pendingDiagnostics.add(uri.toString());

		if (this._validateDelayHandle) {
			clearTimeout(this._validateDelayHandle);
		}

		this._validateDelayHandle = setTimeout(() => {
			this._validateDelayHandle = undefined;
			this._validatePending();
		}, 500);
	}

	private async _validatePending(): Promise<void> {
		const uris = [...this._pendingDiagnostics].map(u => vscode.Uri.parse(u));
		this._pendingDiagnostics.clear();

		const openDocUris = new Set(
			vscode.workspace.textDocuments
				.filter(isMarkdownFile)
				.map(doc => doc.uri.toString())
		);

		const source = new vscode.CancellationTokenSource();
		this._currentCancelSource = source;

		for (const uri of uris) {
			if (source.token.isCancellationRequested) {
				break;
			}

			// Skip open documents to avoid duplicate diagnostics
			if (openDocUris.has(uri.toString())) {
				continue;
			}

			try {
				const diagnostics = await this._client.computeDiagnostics(uri, source.token);
				if (!source.token.isCancellationRequested) {
					this._collection.set(uri, diagnostics);
				}
			} catch {
				// File might have been deleted or become inaccessible
			}
		}
	}

	private async _validateWorkspace(): Promise<void> {
		this._cancelPending();

		const source = new vscode.CancellationTokenSource();
		this._currentCancelSource = source;

		const mdFileGlob = `**/*.{${markdownFileExtensions.join(',')}}`;
		const files = await vscode.workspace.findFiles(mdFileGlob, '**/node_modules/**');

		if (source.token.isCancellationRequested) {
			return;
		}

		const openDocUris = new Set(
			vscode.workspace.textDocuments
				.filter(isMarkdownFile)
				.map(doc => doc.uri.toString())
		);

		this._collection.clear();

		const concurrencyLimit = 5;
		for (let i = 0; i < files.length; i += concurrencyLimit) {
			if (source.token.isCancellationRequested) {
				break;
			}

			const batch = files.slice(i, i + concurrencyLimit);
			const results = await Promise.all(
				batch
					.filter(uri => !openDocUris.has(uri.toString()))
					.map(async uri => {
						try {
							const diagnostics = await this._client.computeDiagnostics(uri, source.token);
							return { uri, diagnostics };
						} catch {
							return undefined;
						}
					})
			);

			if (source.token.isCancellationRequested) {
				break;
			}

			for (const result of results) {
				if (result) {
					this._collection.set(result.uri, result.diagnostics);
				}
			}
		}
	}

	public override dispose(): void {
		this._cancelPending();
		super.dispose();
	}
}

export function registerDiagnosticSupport(
	selector: vscode.DocumentSelector,
	commandManager: CommandManager,
	client: MdLanguageClient,
): vscode.Disposable {
	return vscode.Disposable.from(
		AddToIgnoreLinksQuickFixProvider.register(selector, commandManager),
		registerMarkdownStatusItem(selector, commandManager),
		new WorkspaceDiagnosticManager(client),
	);
}
