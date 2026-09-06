/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { NotebookCell, NotebookDocument } from 'vscode';
import { ILogService } from '../../../platform/log/common/logService';
import { CellIdPatternRe, getCellIdMap } from '../../../platform/notebook/common/helpers';
import { IWorkspaceService } from '../../../platform/workspace/common/workspaceService';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { LinkifiedPart, LinkifiedText, LinkifyLocationAnchor } from '../common/linkifiedText';
import { IContributedLinkifier, LinkifierContext } from '../common/linkifyService';
import { Disposable, IDisposable } from '../../../util/vs/base/common/lifecycle';

/**
 * Linkifies notebook cell IDs in chat responses.
 * The linkified text will show as "<Cell ID> (Cell <number>)" where number is the cell's index + 1.
 */
export class NotebookCellLinkifier extends Disposable implements IDisposable, IContributedLinkifier {
	private cells = new Map<string, WeakRef<NotebookCell>>();
	private notebookCellIds = new WeakMap<NotebookDocument, Set<string>>();
	private initialized = false;
	constructor(
		@IWorkspaceService private readonly workspaceService: IWorkspaceService,
		@ILogService private readonly logger: ILogService,
	) {
		super();
	}

	async linkify(text: string, context: LinkifierContext, token: CancellationToken): Promise<LinkifiedText> {
		const parts: LinkifiedPart[] = [];

		// Safety check
		if (!text || !this.workspaceService?.notebookDocuments) {
			return { parts: [text] };
		}

		// Early bail if no notebook documents are open
		const notebookDocuments = this.workspaceService.notebookDocuments;
		if (!notebookDocuments || notebookDocuments.length === 0) {
			return { parts: [text] };
		}

		let lastIndex = 0;
		for (const match of text.matchAll(CellIdPatternRe)) {
			const fullMatch = match[0];
			const cellId = match[2];
			const index = match.index!;

			// Add text before the match
			if (index > lastIndex) {
				parts.push(text.slice(lastIndex, index));
			}

			// Try to resolve the cell ID to a linkable cell
			const resolved = this.resolveCellId(cellId);
			if (resolved) {
				parts.push(fullMatch.slice(0, fullMatch.indexOf(cellId) + cellId.length));
				parts.push(' ');
				parts.push(resolved);
				parts.push(fullMatch.slice(fullMatch.indexOf(cellId) + cellId.length));
			} else {
				parts.push(fullMatch);
			}
			lastIndex = index + fullMatch.length;
		}

		// Add remaining text after the last match
		if (lastIndex < text.length) {
			parts.push(text.slice(lastIndex));
		}

		return { parts };
	}

	private resolveCellId(cellId: string): LinkifyLocationAnchor | undefined {
		try {
			this.initializeCellIds();
			const cell = this.cells.get(cellId)?.deref();
			if (!cell) {
				return;
			}
			return new LinkifyLocationAnchor(cell.document.uri, `Cell ${cell.index + 1}`);
		} catch (error) {
			this.logger.error(error, `Error resolving cell ID: ${cellId}`);
			return undefined;
		}
	}

	private initializeCellIds() {
		if (this.initialized) {
			return;
		}
		const updateNbCellIds = (notebook: NotebookDocument) => {
			const ids = this.notebookCellIds.get(notebook) ?? new Set<string>();
			ids.forEach(id => this.cells.delete(id));
			getCellIdMap(notebook).forEach((cell, cellId) => {
				this.cells.set(cellId, new WeakRef(cell));
				ids.add(cellId);
			});
			this.notebookCellIds.set(notebook, ids);
		};

		this._register(this.workspaceService.onDidOpenNotebookDocument(notebook => updateNbCellIds(notebook)));
		this._register(this.workspaceService.onDidCloseNotebookDocument(notebook => {
			if (this.workspaceService.notebookDocuments.length === 0) {
				this.cells.clear();
				return;
			}
			const ids = this.notebookCellIds.get(notebook) ?? new Set<string>();
			ids.forEach(id => this.cells.delete(id));
		}));
		this._register(this.workspaceService.onDidChangeNotebookDocument(e => {
			if (e.contentChanges.length) {
				updateNbCellIds(e.notebook);
			}
		}));
		this.workspaceService.notebookDocuments.forEach(notebook => updateNbCellIds(notebook));
	}
}