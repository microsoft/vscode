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

export class DiagnosticManager extends Disposable {

	private readonly collection: vscode.DiagnosticCollection;

	constructor(
		private readonly engine: MarkdownEngine,
		private readonly workspaceContents: MdWorkspaceContents,
		private readonly linkProvider: MdLinkProvider,
	) {
		super();

		this.collection = this._register(vscode.languages.createDiagnosticCollection('markdown'));

		vscode.workspace.onDidChangeTextDocument(e => {
			this.update(e.document);
		}, null, this._disposables);

		for (const doc of vscode.workspace.textDocuments) {
			if (isMarkdownFile(doc)) {
				this.update(doc);
			}
		}
	}

	async update(doc: vscode.TextDocument): Promise<void> {
		const diagnostics = await this.getDiagnostics(doc, noopToken);
		this.collection.set(doc.uri, diagnostics);
	}

	public async getDiagnostics(doc: SkinnyTextDocument, _token: vscode.CancellationToken): Promise<vscode.Diagnostic[]> {
		const links = await this.linkProvider.getAllLinks(doc);
		return (await Promise.all([
			this.getInvalidFileLinks(doc, links),
			this.getInvalidReferenceLinks(links),
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

	private async getInvalidReferenceLinks(links: readonly MdLink[]): Promise<vscode.Diagnostic[]> {
		const definitionSet = new LinkDefinitionSet(links);

		const diagnostics: vscode.Diagnostic[] = [];
		for (const link of links) {
			if (link.href.kind === 'reference') {
				if (!definitionSet.lookup(link.href.ref)) {
					diagnostics.push(new vscode.Diagnostic(link.source.hrefRange, localize('invalidReferenceLink', 'No link reference found: \'{0}\'', link.href.ref)));
				}
			}
		}

		return diagnostics;
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
	return new DiagnosticManager(engine, workspaceContents, linkProvider);
}
