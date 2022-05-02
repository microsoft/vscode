/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as nls from 'vscode-nls';
import { MarkdownEngine } from '../markdownEngine';
import { TableOfContents } from '../tableOfContents';
import { noopToken } from '../test/util';
import { Disposable } from '../util/dispose';
import { isMarkdownFile } from '../util/file';
import { MdWorkspaceContents, SkinnyTextDocument } from '../workspaceContents';
import { InternalHref, LinkDefinitionSet, MdLink, MdLinkProvider } from './documentLinkProvider';
import { tryFindMdDocumentForLink } from './references';

const localize = nls.loadMessageBundle();

export interface DiagnosticConfiguration {
	/**
	 * Fired when the configuration changes.
	 */
	readonly onDidChange: vscode.Event<void>;

	/**
	 * Is validation enabled for {@linkcode resource}?
	 */
	validateEnabled(resource: vscode.Uri): boolean;
}

class VSCodeDiagnosticConfiguration extends Disposable implements DiagnosticConfiguration {

	private readonly _onDidChange = this._register(new vscode.EventEmitter<void>());
	public readonly onDidChange = this._onDidChange.event;

	constructor() {
		super();

		this._register(vscode.workspace.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('markdown.experimental.validate.enabled')) {
				this._onDidChange.fire();
			}
		}));
	}

	public validateEnabled(resource: vscode.Uri): boolean {
		return vscode.workspace.getConfiguration('markdown', resource).get<boolean>('experimental.validate.enabled', false);
	}
}

export class DiagnosticManager extends Disposable {

	private readonly collection: vscode.DiagnosticCollection;

	constructor(
		private readonly engine: MarkdownEngine,
		private readonly workspaceContents: MdWorkspaceContents,
		private readonly linkProvider: MdLinkProvider,
		private readonly configuration: DiagnosticConfiguration,
	) {
		super();

		this.collection = this._register(vscode.languages.createDiagnosticCollection('markdown'));

		this._register(this.configuration.onDidChange(() => {
			this.rebuild();
		}));

		this._register(vscode.workspace.onDidChangeTextDocument(e => {
			this.update(e.document);
		}));

		this.rebuild();
	}

	private async rebuild() {
		this.collection.clear();

		const openedTabDocs = new Map<string, vscode.Uri>();
		for (const group of vscode.window.tabGroups.all) {
			for (const tab of group.tabs) {
				if (tab.input instanceof vscode.TabInputText) {
					openedTabDocs.set(tab.input.uri.toString(), tab.input.uri);
				}
			}
		}

		await Promise.all(
			vscode.workspace.textDocuments
				.filter(doc => openedTabDocs.has(doc.uri.toString()) && isMarkdownFile(doc))
				.map(doc => this.update(doc)));
	}

	private async update(doc: vscode.TextDocument): Promise<void> {
		const diagnostics = await this.getDiagnostics(doc, noopToken);
		this.collection.set(doc.uri, diagnostics);
	}

	public async getDiagnostics(doc: SkinnyTextDocument, token: vscode.CancellationToken): Promise<vscode.Diagnostic[]> {
		if (!this.configuration.validateEnabled(doc.uri)) {
			return [];
		}

		const links = await this.linkProvider.getAllLinks(doc, token);
		return (await Promise.all([
			this.getInvalidFileLinks(doc, links),
			Array.from(this.getInvalidReferenceLinks(links)),
			this.getInvalidHeaderLinks(doc, links),
		])).flat();
	}

	private async getInvalidHeaderLinks(doc: SkinnyTextDocument, links: readonly MdLink[]): Promise<vscode.Diagnostic[]> {
		const toc = await TableOfContents.create(this.engine, doc);

		const diagnostics: vscode.Diagnostic[] = [];
		for (const link of links) {
			if (link.href.kind === 'internal' && link.href.path.toString() === doc.uri.toString() && link.href.fragment) {
				if (!toc.lookup(link.href.fragment)) {
					diagnostics.push(new vscode.Diagnostic(link.source.hrefRange, localize('invalidHeaderLink', 'No header found: \'{0}\'', link.href.fragment)));
				}
			}
		}

		return diagnostics;
	}

	private *getInvalidReferenceLinks(links: readonly MdLink[]): Iterable<vscode.Diagnostic> {
		const definitionSet = new LinkDefinitionSet(links);
		for (const link of links) {
			if (link.href.kind === 'reference') {
				if (!definitionSet.lookup(link.href.ref)) {
					yield new vscode.Diagnostic(link.source.hrefRange, localize('invalidReferenceLink', 'No link reference found: \'{0}\'', link.href.ref));
				}
			}
		}
	}

	private async getInvalidFileLinks(doc: SkinnyTextDocument, links: readonly MdLink[]): Promise<vscode.Diagnostic[]> {
		const tocs = new Map<string, TableOfContents>();

		const diagnostics: vscode.Diagnostic[] = [];
		for (const link of links) {
			if (link.href.kind === 'internal') {
				const hrefDoc = await tryFindMdDocumentForLink(link.href, this.workspaceContents);
				if (hrefDoc && hrefDoc.uri.toString() === doc.uri.toString()) {
					continue;
				}

				if (!hrefDoc && !await this.workspaceContents.fileExists(link.href.path)) {
					diagnostics.push(
						new vscode.Diagnostic(link.source.hrefRange, localize('invalidPathLink', 'File does not exist at path: {0}', (link.href as InternalHref).path.toString(true))));
				} else if (hrefDoc) {
					if (link.href.fragment) {
						// validate fragment looks valid
						let hrefDocToc = tocs.get(link.href.path.toString());
						if (!hrefDocToc) {
							hrefDocToc = await TableOfContents.create(this.engine, hrefDoc);
							tocs.set(link.href.path.toString(), hrefDocToc);
						}

						if (!hrefDocToc.lookup(link.href.fragment)) {
							diagnostics.push(
								new vscode.Diagnostic(link.source.hrefRange, localize('invalidLinkToHeaderInOtherFile', 'Header does not exist in file: {0}', (link.href as InternalHref).path.fragment)));
						}
					}
				}
			}
		}

		return diagnostics;
	}
}

export function register(
	engine: MarkdownEngine,
	workspaceContents: MdWorkspaceContents,
	linkProvider: MdLinkProvider,
): vscode.Disposable {
	const configuration = new VSCodeDiagnosticConfiguration();
	const manager = new DiagnosticManager(engine, workspaceContents, linkProvider, configuration);
	return vscode.Disposable.from(configuration, manager);
}
