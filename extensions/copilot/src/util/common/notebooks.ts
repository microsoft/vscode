/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { Uri } from '../../vscodeTypes';
import * as glob from '../vs/base/common/glob';
import { Schemas } from '../vs/base/common/network';
import { basename } from '../vs/base/common/path';
import { isEqual } from '../vs/base/common/resources';
import { URI } from '../vs/base/common/uri';


export interface INotebookSection {
	title: string;
	content: string;
}

export interface INotebookOutline {
	description: string;
	sections: INotebookSection[];
}

export interface INotebookExclusiveDocumentFilter {
	include?: string | vscode.RelativePattern;
	exclude?: string | vscode.RelativePattern;
}

export interface INotebookFilenamePattern {
	filenamePattern: string;
	excludeFileNamePattern?: string;
}

export type NotebookSelector = vscode.GlobPattern | INotebookExclusiveDocumentFilter | INotebookFilenamePattern;

export enum RegisteredEditorPriority {
	builtin = 'builtin',
	option = 'option',
	exclusive = 'exclusive',
	default = 'default'
}

export interface INotebookEditorContribution {
	readonly type: string;
	readonly displayName: string;
	readonly priority?: RegisteredEditorPriority;

	selector: NotebookSelector[];
}

export interface EditorAssociation {
	viewType: string;
	filenamePattern?: string;
}

/**
 * Find a notebook document by uri or cell uri.
 */
export function findNotebook(uri: vscode.Uri, notebookDocuments: readonly vscode.NotebookDocument[]): vscode.NotebookDocument | undefined {
	return notebookDocuments.find(doc => isEqual(doc.uri, uri) || doc.uri.path === uri.path || findCell(uri, doc));
}

export function findCell(cellUri: vscode.Uri, notebook: vscode.NotebookDocument): vscode.NotebookCell | undefined {
	if (cellUri.scheme === Schemas.vscodeNotebookCell || cellUri.scheme === Schemas.vscodeNotebookCellOutput) {
		// Fragment is not unique to a notebook, hence ensure we compaure the path as well.
		const index = notebook.getCells().findIndex(cell => isEqual(cell.document.uri, cellUri) || (cell.document.uri.fragment === cellUri.fragment && cell.document.uri.path === cellUri.path));
		if (index !== -1) {
			return notebook.getCells()[index];
		}
	}
}


export function getNotebookCellOutput(outputUri: Uri, notebookDocuments: readonly vscode.NotebookDocument[]): [vscode.NotebookDocument, vscode.NotebookCell, vscode.NotebookCellOutput] | undefined {
	if (outputUri.scheme !== Schemas.vscodeNotebookCellOutput) {
		return undefined;
	}
	const params = new URLSearchParams(outputUri.query);
	const [notebook, cell] = getNotebookAndCellFromUri(outputUri, notebookDocuments);
	if (!cell || !cell.outputs.length) {
		return undefined;
	}
	const outputIndex = (params.get('outputIndex') ? parseInt(params.get('outputIndex') || '', 10) : undefined) || 0;
	if (outputIndex > (cell.outputs.length - 1)) {
		return;
	}
	return [notebook, cell, cell.outputs[outputIndex]] as const;
}

export function getNotebookAndCellFromUri(uri: Uri, notebookDocuments: readonly vscode.NotebookDocument[]): [undefined, undefined] | [vscode.NotebookDocument, vscode.NotebookCell | undefined] {
	const notebook = findNotebook(uri, notebookDocuments) || notebookDocuments.find(doc => doc.uri.path === uri.path);
	if (!notebook) {
		return [undefined, undefined];
	}
	const cell = findCell(uri, notebook);
	if (cell === undefined) {
		// Possible the cell has since been deleted.
		return [notebook, undefined];
	}
	return [notebook, cell];
}

export function isNotebookCellOrNotebookChatInput(uri: vscode.Uri): boolean {
	return uri.scheme === Schemas.vscodeNotebookCell
		// Support the experimental cell chat widget
		|| (uri.scheme === 'untitled' && uri.fragment.startsWith('notebook-chat-input'));
}

export function isNotebookCell(uri: vscode.Uri): boolean {
	return uri.scheme === Schemas.vscodeNotebookCell;
}

export function isJupyterNotebookUri(uri: vscode.Uri): boolean {
	return uri.path.endsWith('.ipynb');
}

export function isJupyterNotebook(notebook: vscode.NotebookDocument): boolean {
	return notebook.notebookType === 'jupyter-notebook';
}


export function serializeNotebookDocument(document: vscode.NotebookDocument, features: { cell_uri_fragment?: boolean } = {}): string {
	return JSON.stringify({
		cells: document.getCells().map(cell => ({
			uri_fragment: features.cell_uri_fragment ? cell.document.uri.fragment : undefined,
			cell_type: cell.kind,
			source: cell.document.getText().split(/\r?\n/),
		}))
	});
}

export function extractNotebookOutline(response: string): INotebookOutline | undefined {
	try {
		const trimmedResponse = response.replace(/\n/g, '');
		const regex = /```(?:json)?(.+)/g;
		const match = regex.exec(trimmedResponse);
		if (match) {
			const prefixTrimed = match[1];
			// remove content after ```
			const suffixBacktick = prefixTrimed.indexOf('```');
			const json = suffixBacktick === -1 ? prefixTrimed : prefixTrimed.substring(0, suffixBacktick);
			return JSON.parse(json) as INotebookOutline;
		}
	} catch (ex) { }

	return undefined;
}

/**
 * Checks if the provided pattern is a document exclude pattern
 */
export function isDocumentExcludePattern(pattern: string | vscode.RelativePattern | INotebookExclusiveDocumentFilter | INotebookFilenamePattern): pattern is INotebookExclusiveDocumentFilter {
	const arg = pattern as INotebookExclusiveDocumentFilter;

	// Check if it has include property (exclude is optional)
	return typeof arg === 'object' && arg !== null &&
		(typeof arg.include === 'string' || isRelativePattern(arg.include));
}

/**
 * Checks if the provided pattern is a filename pattern
 */
export function isFilenamePattern(pattern: string | vscode.RelativePattern | INotebookExclusiveDocumentFilter | INotebookFilenamePattern): pattern is INotebookFilenamePattern {
	const arg = pattern as INotebookFilenamePattern;

	// Check if it has filenamePattern property
	return typeof arg === 'object' && arg !== null && typeof arg.filenamePattern === 'string';
}

/**a
 * Checks if the provided object is a RelativePattern
 */
export function isRelativePattern(obj: unknown): obj is vscode.RelativePattern {
	const rp = obj as vscode.RelativePattern | undefined | null;
	if (!rp) {
		return false;
	}

	return typeof rp.base === 'string' && typeof rp.pattern === 'string';
}

/**
 * Checks if the provided object is a valid INotebookEditorContribution
 */
export function isNotebookEditorContribution(contrib: unknown): contrib is INotebookEditorContribution {
	const candidate = contrib as INotebookEditorContribution | undefined;
	return !!candidate && !!candidate.type && !!candidate.displayName && !!candidate.selector;
}

/**
 * Extracts editor associations from the raw editor association config object
 *
 * @param raw The raw editor association config object
 * @returns An array of EditorAssociation objects
 */
export function extractEditorAssociation(raw: { [fileNamePattern: string]: string }): EditorAssociation[] {
	const associations: EditorAssociation[] = [];
	for (const [filenamePattern, viewType] of Object.entries(raw)) {
		if (viewType) {
			associations.push({ filenamePattern, viewType });
		}
	}
	return associations;
}

/**
 * Checks if a resource matches a selector
 */
export function notebookSelectorMatches(resource: URI, selector: NotebookSelector): boolean {
	if (typeof selector === 'string') {
		// selector as string
		if (glob.match(selector.toLowerCase(), basename(resource.fsPath).toLowerCase())) {
			return true;
		}
	}

	if (isDocumentExcludePattern(selector)) {
		// selector as INotebookExclusiveDocumentFilter
		const filenamePattern = selector.include;
		const excludeFilenamePattern = selector.exclude;

		if (!filenamePattern) {
			return false;
		}

		if (glob.match(filenamePattern, basename(resource.fsPath).toLowerCase())) {
			if (excludeFilenamePattern && glob.match(excludeFilenamePattern, basename(resource.fsPath).toLowerCase())) {
				return false;
			}
			return true;
		}
	}

	if (isFilenamePattern(selector)) {
		// selector as INotebookFilenamePattern
		if (glob.match(selector.filenamePattern, basename(resource.fsPath).toLowerCase())) {
			if (selector.excludeFileNamePattern && glob.match(selector.excludeFileNamePattern, basename(resource.fsPath).toLowerCase())) {
				return false;
			}
			return true;
		}
	}

	return false;
}

/**
 * Returns all associations that match the glob of the provided resource
 */
export function getNotebookEditorAssociations(resource: Uri, editorAssociations: EditorAssociation[]): EditorAssociation[] {
	const validAssociations: EditorAssociation[] = [];
	for (const a of editorAssociations) {
		if (a.filenamePattern && glob.match(a.filenamePattern.toLowerCase(), basename(resource.fsPath).toLowerCase())) {
			validAssociations.push({ filenamePattern: a.filenamePattern, viewType: a.viewType });
		}
	}

	return validAssociations;
}

/**
 * Checks if the provided resource has a supported notebook provider
 */
export function _hasSupportedNotebooks(uri: Uri, workspaceNotebookDocuments: readonly vscode.NotebookDocument[], notebookEditorContributions: INotebookEditorContribution[], editorAssociations: EditorAssociation[]): boolean {
	if (findNotebook(uri, workspaceNotebookDocuments)) {
		return true;
	}

	const validNotebookEditorContribs: INotebookEditorContribution[] = notebookEditorContributions.filter(notebookEditorContrib => notebookEditorContrib.selector.some(selector => notebookSelectorMatches(uri, selector)));
	if (validNotebookEditorContribs.length === 0) {
		return false;
	}

	const validAssociations = getNotebookEditorAssociations(uri, editorAssociations);
	for (const association of validAssociations) {
		if (validNotebookEditorContribs.some(notebookEditorContrib => notebookEditorContrib.type === association.viewType)) {
			return true;
		}
	}

	// often users won't have associations that take priority, so check the priority of our valid providers
	// a provider with priority !default will only be chosen if there is an association that matches, so we need default at this point
	// In VS Code, if priority is empty, it defaults to `default`, vscode/main/src/vs/workbench/contrib/notebook/browser/notebookExtensionPoint.ts#L110
	if (validNotebookEditorContribs.some(notebookEditorContrib => (notebookEditorContrib.priority ?? RegisteredEditorPriority.default) === RegisteredEditorPriority.default)) {
		return true;
	} else {
		return false;
	}
}
