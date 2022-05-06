/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as nls from 'vscode-nls';
import { MarkdownEngine } from '../markdownEngine';
import { TableOfContents } from '../tableOfContents';
import { Delayer } from '../util/async';
import { noopToken } from '../util/cancellation';
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

	getOptions(resource: vscode.Uri): DiagnosticOptions;
}

export enum DiagnosticLevel {
	ignore = 'ignore',
	warning = 'warning',
	error = 'error',
}

export interface DiagnosticOptions {
	readonly enabled: boolean;
	readonly validateReferences: DiagnosticLevel;
	readonly validateOwnHeaders: DiagnosticLevel;
	readonly validateFilePaths: DiagnosticLevel;
}

function toSeverity(level: DiagnosticLevel): vscode.DiagnosticSeverity | undefined {
	switch (level) {
		case DiagnosticLevel.error: return vscode.DiagnosticSeverity.Error;
		case DiagnosticLevel.warning: return vscode.DiagnosticSeverity.Warning;
		case DiagnosticLevel.ignore: return undefined;
	}
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

	public getOptions(resource: vscode.Uri): DiagnosticOptions {
		const config = vscode.workspace.getConfiguration('markdown', resource);
		return {
			enabled: config.get<boolean>('experimental.validate.enabled', false),
			validateReferences: config.get<DiagnosticLevel>('experimental.validate.referenceLinks', DiagnosticLevel.ignore),
			validateOwnHeaders: config.get<DiagnosticLevel>('experimental.validate.headerLinks', DiagnosticLevel.ignore),
			validateFilePaths: config.get<DiagnosticLevel>('experimental.validate.fileLinks', DiagnosticLevel.ignore),
		};
	}
}

export class DiagnosticManager extends Disposable {

	private readonly collection: vscode.DiagnosticCollection;

	private readonly pendingDiagnostics = new Set<vscode.Uri>();
	private readonly diagnosticDelayer: Delayer<void>;

	constructor(
		private readonly computer: DiagnosticComputer,
		private readonly configuration: DiagnosticConfiguration,
	) {
		super();

		this.diagnosticDelayer = new Delayer(300);

		this.collection = this._register(vscode.languages.createDiagnosticCollection('markdown'));

		this._register(this.configuration.onDidChange(() => {
			this.rebuild();
		}));

		const onDocUpdated = (doc: vscode.TextDocument) => {
			if (isMarkdownFile(doc)) {
				this.pendingDiagnostics.add(doc.uri);
				this.diagnosticDelayer.trigger(() => this.recomputePendingDiagnostics());
			}
		};

		this._register(vscode.workspace.onDidOpenTextDocument(doc => {
			onDocUpdated(doc);
		}));

		this._register(vscode.workspace.onDidChangeTextDocument(e => {
			onDocUpdated(e.document);
		}));

		this._register(vscode.workspace.onDidCloseTextDocument(doc => {
			this.pendingDiagnostics.delete(doc.uri);
			this.collection.delete(doc.uri);
		}));

		this.rebuild();
	}

	private recomputePendingDiagnostics(): void {
		const pending = [...this.pendingDiagnostics];
		this.pendingDiagnostics.clear();

		for (const resource of pending) {
			const doc = vscode.workspace.textDocuments.find(doc => doc.uri.fsPath === resource.fsPath);
			if (doc) {
				this.update(doc);
			}
		}
	}

	private async rebuild() {
		this.collection.clear();

		const allOpenedTabResources = this.getAllTabResources();
		await Promise.all(
			vscode.workspace.textDocuments
				.filter(doc => allOpenedTabResources.has(doc.uri.toString()) && isMarkdownFile(doc))
				.map(doc => this.update(doc)));
	}

	private getAllTabResources() {
		const openedTabDocs = new Map<string, vscode.Uri>();
		for (const group of vscode.window.tabGroups.all) {
			for (const tab of group.tabs) {
				if (tab.input instanceof vscode.TabInputText) {
					openedTabDocs.set(tab.input.uri.toString(), tab.input.uri);
				}
			}
		}
		return openedTabDocs;
	}

	private async update(doc: vscode.TextDocument): Promise<void> {
		const diagnostics = await this.getDiagnostics(doc, noopToken);
		this.collection.set(doc.uri, diagnostics);
	}

	public async getDiagnostics(doc: SkinnyTextDocument, token: vscode.CancellationToken): Promise<vscode.Diagnostic[]> {
		const config = this.configuration.getOptions(doc.uri);
		if (!config.enabled) {
			return [];
		}
		return this.computer.getDiagnostics(doc, config, token);
	}
}

export class DiagnosticComputer {

	constructor(
		private readonly engine: MarkdownEngine,
		private readonly workspaceContents: MdWorkspaceContents,
		private readonly linkProvider: MdLinkProvider,
	) { }

	public async getDiagnostics(doc: SkinnyTextDocument, options: DiagnosticOptions, token: vscode.CancellationToken): Promise<vscode.Diagnostic[]> {
		const links = await this.linkProvider.getAllLinks(doc, token);
		if (token.isCancellationRequested) {
			return [];
		}

		return (await Promise.all([
			this.validateFileLinks(doc, options, links, token),
			Array.from(this.validateReferenceLinks(options, links)),
			this.validateOwnHeaderLinks(doc, options, links, token),
		])).flat();
	}

	private async validateOwnHeaderLinks(doc: SkinnyTextDocument, options: DiagnosticOptions, links: readonly MdLink[], token: vscode.CancellationToken): Promise<vscode.Diagnostic[]> {
		const severity = toSeverity(options.validateOwnHeaders);
		if (typeof severity === 'undefined') {
			return [];
		}

		const toc = await TableOfContents.create(this.engine, doc);
		if (token.isCancellationRequested) {
			return [];
		}

		const diagnostics: vscode.Diagnostic[] = [];
		for (const link of links) {
			if (link.href.kind === 'internal'
				&& link.href.path.toString() === doc.uri.toString()
				&& link.href.fragment
				&& !toc.lookup(link.href.fragment)
			) {
				diagnostics.push(new vscode.Diagnostic(
					link.source.hrefRange,
					localize('invalidHeaderLink', 'No header found: \'{0}\'', link.href.fragment),
					severity));
			}
		}

		return diagnostics;
	}

	private *validateReferenceLinks(options: DiagnosticOptions, links: readonly MdLink[]): Iterable<vscode.Diagnostic> {
		const severity = toSeverity(options.validateReferences);
		if (typeof severity === 'undefined') {
			return [];
		}

		const definitionSet = new LinkDefinitionSet(links);
		for (const link of links) {
			if (link.href.kind === 'reference' && !definitionSet.lookup(link.href.ref)) {
				yield new vscode.Diagnostic(
					link.source.hrefRange,
					localize('invalidReferenceLink', 'No link reference found: \'{0}\'', link.href.ref),
					severity);
			}
		}
	}

	private async validateFileLinks(doc: SkinnyTextDocument, options: DiagnosticOptions, links: readonly MdLink[], token: vscode.CancellationToken): Promise<vscode.Diagnostic[]> {
		const severity = toSeverity(options.validateFilePaths);
		if (typeof severity === 'undefined') {
			return [];
		}

		const tocs = new Map<string, TableOfContents>();

		// TODO: cache links so we don't recompute duplicate hrefs
		// TODO: parallelize

		const diagnostics: vscode.Diagnostic[] = [];
		for (const link of links) {
			if (token.isCancellationRequested) {
				return [];
			}

			if (link.href.kind !== 'internal') {
				continue;
			}

			const hrefDoc = await tryFindMdDocumentForLink(link.href, this.workspaceContents);
			if (hrefDoc && hrefDoc.uri.toString() === doc.uri.toString()) {
				continue;
			}

			if (!hrefDoc && !await this.workspaceContents.pathExists(link.href.path)) {
				diagnostics.push(
					new vscode.Diagnostic(
						link.source.hrefRange,
						localize('invalidPathLink', 'File does not exist at path: {0}', (link.href as InternalHref).path.toString(true)),
						severity));
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
							new vscode.Diagnostic(
								link.source.hrefRange,
								localize('invalidLinkToHeaderInOtherFile', 'Header does not exist in file: {0}', (link.href as InternalHref).path.fragment),
								severity));
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
	const manager = new DiagnosticManager(new DiagnosticComputer(engine, workspaceContents, linkProvider), configuration);
	return vscode.Disposable.from(configuration, manager);
}
