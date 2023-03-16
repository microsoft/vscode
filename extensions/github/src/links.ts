/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { API as GitAPI, Repository } from './typings/git';
import { getRepositoryFromUrl } from './util';

export function isFileInRepo(repository: Repository, file: vscode.Uri): boolean {
	return file.path.toLowerCase() === repository.rootUri.path.toLowerCase() ||
		(file.path.toLowerCase().startsWith(repository.rootUri.path.toLowerCase()) &&
			file.path.substring(repository.rootUri.path.length).startsWith('/'));
}

export function getRepositoryForFile(gitAPI: GitAPI, file: vscode.Uri): Repository | undefined {
	for (const repository of gitAPI.repositories) {
		if (isFileInRepo(repository, file)) {
			return repository;
		}
	}
	return undefined;
}

enum LinkType {
	File = 1,
	Notebook = 2
}

interface IFilePosition {
	type: LinkType.File;
	uri: vscode.Uri;
	range: vscode.Range | undefined;
}

interface INotebookPosition {
	type: LinkType.Notebook;
	uri: vscode.Uri;
	cellIndex: number;
	range: vscode.Range | undefined;
}

interface EditorContext {
	uri: vscode.Uri;
	ranges: vscode.Range[];
}

interface EditorLineNumberContext {
	uri: vscode.Uri;
	lineNumber: number;
}

interface ScmResourceContext {
	resourceUri: vscode.Uri;
}

export type LinkContext = vscode.Uri | EditorContext | EditorLineNumberContext | undefined | ScmResourceContext;

function extractContext(context: LinkContext): { fileUri: vscode.Uri | undefined; ranges: vscode.Range[] | undefined } {
	if (context instanceof vscode.Uri) {
		return { fileUri: context, ranges: undefined };
	} else if (context !== undefined && 'ranges' in context && 'uri' in context) {
		return { fileUri: context.uri, ranges: context.ranges };
	} else if (context !== undefined && 'lineNumber' in context && 'uri' in context) {
		return { fileUri: context.uri, ranges: [new vscode.Range(context.lineNumber - 1, 0, context.lineNumber - 1, 1)] };
	} else if (context !== undefined && 'resourceUri' in context) {
		return { fileUri: context.resourceUri, ranges: undefined };
	} else {
		return { fileUri: undefined, ranges: undefined };
	}
}

function getFileAndPosition(context: LinkContext): IFilePosition | INotebookPosition | undefined {
	let range: vscode.Range | undefined;

	const { fileUri, ranges: selections } = extractContext(context);
	const uri = fileUri;

	if (uri) {
		if (uri.scheme === 'vscode-notebook-cell' && vscode.window.activeNotebookEditor?.notebook.uri.fsPath === uri.fsPath) {
			// if the active editor is a notebook editor and the focus is inside any a cell text editor
			// generate deep link for text selection for the notebook cell.
			const cell = vscode.window.activeNotebookEditor.notebook.getCells().find(cell => cell.document.uri.fragment === uri?.fragment);
			const cellIndex = cell?.index ?? vscode.window.activeNotebookEditor.selection.start;

			const range = selections?.[0];
			return { type: LinkType.Notebook, uri, cellIndex, range };
		} else {
			// the active editor is a text editor
			range = selections?.[0];
			return { type: LinkType.File, uri, range };
		}
	}

	if (vscode.window.activeNotebookEditor) {
		// if the active editor is a notebook editor but the focus is not inside any cell text editor, generate deep link for the cell selection in the notebook document.
		return { type: LinkType.Notebook, uri: vscode.window.activeNotebookEditor.notebook.uri, cellIndex: vscode.window.activeNotebookEditor.selection.start, range: undefined };
	}

	return undefined;
}

function rangeString(range: vscode.Range | undefined) {
	if (!range) {
		return '';
	}
	let hash = `#L${range.start.line + 1}`;
	if (range.start.line !== range.end.line) {
		hash += `-L${range.end.line + 1}`;
	}
	return hash;
}

export function notebookCellRangeString(index: number | undefined, range: vscode.Range | undefined) {
	if (index === undefined) {
		return '';
	}

	if (!range) {
		return `#C${index + 1}`;
	}

	let hash = `#C${index + 1}:L${range.start.line + 1}`;
	if (range.start.line !== range.end.line) {
		hash += `-L${range.end.line + 1}`;
	}
	return hash;
}

export function getLink(gitAPI: GitAPI, useSelection: boolean, hostPrefix?: string, linkType: 'permalink' | 'headlink' = 'permalink', context?: LinkContext, useRange?: boolean): string | undefined {
	hostPrefix = hostPrefix ?? 'https://github.com';
	const fileAndPosition = getFileAndPosition(context);
	const uri = fileAndPosition?.uri;

	// Use the first repo if we cannot determine a repo from the uri.
	const gitRepo = (uri ? getRepositoryForFile(gitAPI, uri) : gitAPI.repositories[0]) ?? gitAPI.repositories[0];
	if (!gitRepo) {
		return;
	}
	let repo: { owner: string; repo: string } | undefined;
	gitRepo.state.remotes.find(remote => {
		if (remote.fetchUrl) {
			const foundRepo = getRepositoryFromUrl(remote.fetchUrl);
			if (foundRepo && (remote.name === gitRepo.state.HEAD?.upstream?.remote)) {
				repo = foundRepo;
				return;
			} else if (foundRepo && !repo) {
				repo = foundRepo;
			}
		}
		return;
	});
	if (!repo) {
		return;
	}

	const blobSegment = (gitRepo.state.HEAD?.ahead === 0) ? `/blob/${linkType === 'headlink' ? gitRepo.state.HEAD.name : gitRepo.state.HEAD?.commit}` : '';
	const fileSegments = fileAndPosition && uri ? (fileAndPosition.type === LinkType.File
		? (useSelection ? `${uri.path.substring(gitRepo.rootUri.path.length)}${useRange ? rangeString(fileAndPosition.range) : ''}` : '')
		: (useSelection ? `${uri.path.substring(gitRepo.rootUri.path.length)}${useRange ? notebookCellRangeString(fileAndPosition.cellIndex, fileAndPosition.range) : ''}` : ''))
		: '';

	return `${hostPrefix}/${repo.owner}/${repo.repo}${blobSegment
		}${fileSegments}`;
}
