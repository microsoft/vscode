/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { BaseLanguageClient, LanguageClientOptions, NotebookDocumentSyncRegistrationType, Range, TextEdit } from 'vscode-languageclient';
import { IMdParser } from '../markdownEngine';
import { IDisposable } from '../util/dispose';
import { looksLikeMarkdownPath, markdownFileExtensions, markdownLanguageIds } from '../util/file';
import { rawHttpUriFromHref } from '../util/url';
import { FileWatcherManager } from './fileWatchingManager';
import { InMemoryDocument } from './inMemoryDocument';
import * as proto from './protocol';
import { VsCodeMdWorkspace } from './workspace';

export type LanguageClientConstructor = (name: string, description: string, clientOptions: LanguageClientOptions) => BaseLanguageClient;

export class MdLanguageClient implements IDisposable {

	readonly #client: BaseLanguageClient;
	readonly #workspace: VsCodeMdWorkspace;

	constructor(
		client: BaseLanguageClient,
		workspace: VsCodeMdWorkspace,
	) {
		this.#client = client;
		this.#workspace = workspace;
	}

	dispose(): void {
		this.#client.stop();
		this.#workspace.dispose();
	}

	resolveLinkTarget(linkText: string, uri: vscode.Uri): Promise<proto.ResolvedDocumentLinkTarget> {
		return this.#client.sendRequest(proto.resolveLinkTarget, { linkText, uri: uri.toString() });
	}

	getEditForFileRenames(files: ReadonlyArray<{ oldUri: string; newUri: string }>, token: vscode.CancellationToken) {
		return this.#client.sendRequest(proto.getEditForFileRenames, files, token);
	}

	getReferencesToFileInWorkspace(resource: vscode.Uri, token: vscode.CancellationToken) {
		return this.#client.sendRequest(proto.getReferencesToFileInWorkspace, { uri: resource.toString() }, token);
	}

	prepareUpdatePastedLinks(doc: vscode.Uri, ranges: readonly vscode.Range[], token: vscode.CancellationToken) {
		return this.#client.sendRequest(proto.prepareUpdatePastedLinks, {
			uri: doc.toString(),
			ranges: ranges.map(range => Range.create(range.start.line, range.start.character, range.end.line, range.end.character)),
		}, token);
	}

	getUpdatePastedLinksEdit(pastingIntoDoc: vscode.Uri, edits: readonly vscode.TextEdit[], metadata: string, token: vscode.CancellationToken) {
		return this.#client.sendRequest(proto.getUpdatePastedLinksEdit, {
			metadata,
			pasteIntoDoc: pastingIntoDoc.toString(),
			edits: edits.map(edit => TextEdit.replace(edit.range, edit.newText)),
		}, token);
	}
}

export async function startClient(factory: LanguageClientConstructor, parser: IMdParser): Promise<MdLanguageClient> {

	const mdFileGlob = `**/*.{${markdownFileExtensions.join(',')}}`;

	const clientOptions: LanguageClientOptions = {
		documentSelector: markdownLanguageIds,
		synchronize: {
			configurationSection: ['markdown'],
			fileEvents: vscode.workspace.createFileSystemWatcher(mdFileGlob),
		},
		initializationOptions: {
			markdownFileExtensions,
			i10lLocation: vscode.l10n.uri?.toJSON(),
		},
		diagnosticPullOptions: {
			onChange: true,
			onTabs: true,
			match(_documentSelector, resource) {
				return looksLikeMarkdownPath(resource);
			},
		},
		markdown: {
			supportHtml: true,
		},
		middleware: {
			provideDocumentLinks: async (document, token, next) => {
				const links = await next(document, token);
				if (!links) {
					return links;
				}
				// The language server may have decoded percent-encoded characters in
				// external URLs (e.g. %2F in paths or %2D in text fragments).  Recover
				// the original URL by reading it back from the document source so that
				// the browser receives the URL exactly as the author wrote it.
				return links.map(link => {
					if (!link.target) {
						return link;
					}
					const { scheme } = link.target;
					if (scheme !== 'http' && scheme !== 'https') {
						return link;
					}
					// Read the href text from the document source.  For markdown inline
					// links like [text](URL) the range covers only the URL itself; the
					// same is true for reference link definitions and angle-bracket links.
					const hrefText = document.getText(link.range);
					// Only apply the fix for plain markdown URLs.  HTML links in
					// markdown (e.g. <a href="...&amp;...">) have their '&' HTML-entity-
					// encoded as '&amp;' in the source; the language server already
					// HTML-decodes those hrefs before building the target URI, so the
					// source text cannot be used directly without first decoding the
					// HTML entities.  Skipping them avoids introducing a regression
					// while still fixing the common case of markdown inline links.
					if (
						(hrefText.startsWith('http://') || hrefText.startsWith('https://')) &&
						!hrefText.includes('&amp;')
					) {
						link.target = rawHttpUriFromHref(hrefText);
					}
					return link;
				});
			},
		},
	};

	const client = factory('markdown', vscode.l10n.t("Markdown Language Server"), clientOptions);

	client.registerProposedFeatures();

	const notebookFeature = client.getFeature(NotebookDocumentSyncRegistrationType.method);
	if (notebookFeature !== undefined) {
		notebookFeature.register({
			id: String(Date.now()),
			registerOptions: {
				notebookSelector: [{
					notebook: '*',
					cells: [{ language: 'markdown' }]
				}]
			}
		});
	}

	const workspace = new VsCodeMdWorkspace();

	client.onRequest(proto.parse, async (e) => {
		const uri = vscode.Uri.parse(e.uri);
		if (typeof e.text === 'string') {
			return parser.tokenize(new InMemoryDocument(uri, e.text, -1));
		} else {
			const doc = await workspace.getOrLoadMarkdownDocument(uri);
			if (doc) {
				return parser.tokenize(doc);
			} else {
				return [];
			}
		}
	});

	client.onRequest(proto.fs_readFile, async (e): Promise<number[]> => {
		const uri = vscode.Uri.parse(e.uri);
		return Array.from(await vscode.workspace.fs.readFile(uri));
	});

	client.onRequest(proto.fs_stat, async (e): Promise<{ isDirectory: boolean } | undefined> => {
		const uri = vscode.Uri.parse(e.uri);
		try {
			const stat = await vscode.workspace.fs.stat(uri);
			return { isDirectory: stat.type === vscode.FileType.Directory };
		} catch {
			return undefined;
		}
	});

	client.onRequest(proto.fs_readDirectory, async (e): Promise<[string, { isDirectory: boolean }][]> => {
		const uri = vscode.Uri.parse(e.uri);
		const result = await vscode.workspace.fs.readDirectory(uri);
		return result.map(([name, type]) => [name, { isDirectory: type === vscode.FileType.Directory }]);
	});

	client.onRequest(proto.findMarkdownFilesInWorkspace, async (): Promise<string[]> => {
		return (await vscode.workspace.findFiles(mdFileGlob, '**/node_modules/**')).map(x => x.toString());
	});

	const watchers = new FileWatcherManager();

	client.onRequest(proto.fs_watcher_create, async (params): Promise<void> => {
		const id = params.id;
		const uri = vscode.Uri.parse(params.uri);

		const sendWatcherChange = (kind: 'create' | 'change' | 'delete') => {
			client.sendRequest(proto.fs_watcher_onChange, { id, uri: params.uri, kind });
		};

		watchers.create(id, uri, params.watchParentDirs, {
			create: params.options.ignoreCreate ? undefined : () => sendWatcherChange('create'),
			change: params.options.ignoreChange ? undefined : () => sendWatcherChange('change'),
			delete: params.options.ignoreDelete ? undefined : () => sendWatcherChange('delete'),
		});
	});

	client.onRequest(proto.fs_watcher_delete, async (params): Promise<void> => {
		watchers.delete(params.id);
	});

	vscode.commands.registerCommand('vscodeMarkdownLanguageservice.open', (uri, args) => {
		return vscode.commands.executeCommand('vscode.open', uri, args);
	});

	vscode.commands.registerCommand('vscodeMarkdownLanguageservice.rename', (uri, pos) => {
		return vscode.commands.executeCommand('editor.action.rename', [vscode.Uri.from(uri), new vscode.Position(pos.line, pos.character)]);
	});

	await client.start();

	return new MdLanguageClient(client, workspace);
}
