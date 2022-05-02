/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { coalesce } from './util/arrays';
import { Disposable } from './util/dispose';
import { isMarkdownFile } from './util/file';
import { InMemoryDocument } from './util/inMemoryDocument';
import { Limiter } from './util/limiter';

/**
 * Minimal version of {@link vscode.TextLine}. Used for mocking out in testing.
 */
export interface SkinnyTextLine {
	readonly text: string;
	readonly isEmptyOrWhitespace: boolean;
}

/**
 * Minimal version of {@link vscode.TextDocument}. Used for mocking out in testing.
 */
export interface SkinnyTextDocument {
	readonly uri: vscode.Uri;
	readonly version: number;
	readonly lineCount: number;

	getText(range?: vscode.Range): string;
	lineAt(line: number): SkinnyTextLine;
	positionAt(offset: number): vscode.Position;
}

/**
 * Provides set of markdown files in the current workspace.
 */
export interface MdWorkspaceContents {
	/**
	 * Get list of all known markdown files.
	 */
	getAllMarkdownDocuments(): Promise<Iterable<SkinnyTextDocument>>;

	getMarkdownDocument(resource: vscode.Uri): Promise<SkinnyTextDocument | undefined>;

	fileExists(resource: vscode.Uri): Promise<boolean>;

	readonly onDidChangeMarkdownDocument: vscode.Event<SkinnyTextDocument>;
	readonly onDidCreateMarkdownDocument: vscode.Event<SkinnyTextDocument>;
	readonly onDidDeleteMarkdownDocument: vscode.Event<vscode.Uri>;
}

/**
 * Provides set of markdown files known to VS Code.
 *
 * This includes both opened text documents and markdown files in the workspace.
 */
export class VsCodeMdWorkspaceContents extends Disposable implements MdWorkspaceContents {

	private readonly _onDidChangeMarkdownDocumentEmitter = this._register(new vscode.EventEmitter<SkinnyTextDocument>());
	private readonly _onDidCreateMarkdownDocumentEmitter = this._register(new vscode.EventEmitter<SkinnyTextDocument>());
	private readonly _onDidDeleteMarkdownDocumentEmitter = this._register(new vscode.EventEmitter<vscode.Uri>());

	private _watcher: vscode.FileSystemWatcher | undefined;

	private readonly utf8Decoder = new TextDecoder('utf-8');

	/**
	 * Reads and parses all .md documents in the workspace.
	 * Files are processed in batches, to keep the number of open files small.
	 *
	 * @returns Array of processed .md files.
	 */
	async getAllMarkdownDocuments(): Promise<SkinnyTextDocument[]> {
		const maxConcurrent = 20;

		const foundFiles = new Set<string>();
		const limiter = new Limiter<SkinnyTextDocument | undefined>(maxConcurrent);

		// Add files on disk
		const resources = await vscode.workspace.findFiles('**/*.md', '**/node_modules/**');
		const onDiskResults = await Promise.all(resources.map(resource => {
			return limiter.queue(async () => {
				const doc = await this.getMarkdownDocument(resource);
				if (doc) {
					foundFiles.add(doc.uri.toString());
				}
				return doc;
			});
		}));

		// Add opened files (such as untitled files)
		const openTextDocumentResults = await Promise.all(vscode.workspace.textDocuments
			.filter(doc => !foundFiles.has(doc.uri.toString()) && isMarkdownFile(doc)));

		return coalesce([...onDiskResults, ...openTextDocumentResults]);
	}

	public get onDidChangeMarkdownDocument() {
		this.ensureWatcher();
		return this._onDidChangeMarkdownDocumentEmitter.event;
	}

	public get onDidCreateMarkdownDocument() {
		this.ensureWatcher();
		return this._onDidCreateMarkdownDocumentEmitter.event;
	}

	public get onDidDeleteMarkdownDocument() {
		this.ensureWatcher();
		return this._onDidDeleteMarkdownDocumentEmitter.event;
	}

	private ensureWatcher(): void {
		if (this._watcher) {
			return;
		}

		this._watcher = this._register(vscode.workspace.createFileSystemWatcher('**/*.md'));

		this._register(this._watcher.onDidChange(async resource => {
			const document = await this.getMarkdownDocument(resource);
			if (document) {
				this._onDidChangeMarkdownDocumentEmitter.fire(document);
			}
		}));

		this._register(this._watcher.onDidCreate(async resource => {
			const document = await this.getMarkdownDocument(resource);
			if (document) {
				this._onDidCreateMarkdownDocumentEmitter.fire(document);
			}
		}));

		this._register(this._watcher.onDidDelete(resource => {
			this._onDidDeleteMarkdownDocumentEmitter.fire(resource);
		}));

		this._register(vscode.workspace.onDidChangeTextDocument(e => {
			if (isMarkdownFile(e.document)) {
				this._onDidChangeMarkdownDocumentEmitter.fire(e.document);
			}
		}));
	}

	public async getMarkdownDocument(resource: vscode.Uri): Promise<SkinnyTextDocument | undefined> {
		const matchingDocument = vscode.workspace.textDocuments.find((doc) => doc.uri.toString() === resource.toString());
		if (matchingDocument) {
			return matchingDocument;
		}

		try {
			const bytes = await vscode.workspace.fs.readFile(resource);

			// We assume that markdown is in UTF-8
			const text = this.utf8Decoder.decode(bytes);
			return new InMemoryDocument(resource, text, 0);
		} catch {
			return undefined;
		}
	}

	public async fileExists(target: vscode.Uri): Promise<boolean> {
		let targetResourceStat: vscode.FileStat | undefined;
		try {
			targetResourceStat = await vscode.workspace.fs.stat(target);
		} catch {
			return false;
		}
		return targetResourceStat.type === vscode.FileType.File;
	}
}
