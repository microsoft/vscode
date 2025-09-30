/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Lotas Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { URI } from '../../../../base/common/uri.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { INotebookEditor } from '../../../contrib/notebook/browser/notebookBrowser.js';
import { NotebookDiffHighlightContribution, NotebookAutoAcceptContribution } from '../../../contrib/notebook/browser/contrib/diff/notebookDiffHighlight.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { INotebookEditorService } from '../../../contrib/notebook/browser/services/notebookEditorService.js';
import { getNotebookEditorFromEditorPane } from '../../../contrib/notebook/browser/notebookBrowser.js';

export const INotebookDiffService = createDecorator<INotebookDiffService>('notebookDiffService');

export interface ICellDiffData {
	cellIndex: number;
	type: 'modified';
	lineDiffs: Array<{
		type: 'added' | 'deleted';
		content: string;
		lineNumber: number;
	}>;
}

export interface INotebookDiffService {
	readonly _serviceBrand: undefined;

	/**
	 * Access to the notebook editor service
	 */
	readonly notebookEditorService: INotebookEditorService;

	/**
	 * Register a notebook editor for diff highlighting
	 */
	registerNotebookEditor(uri: URI, editor: INotebookEditor): void;

	/**
	 * Apply diff highlighting to a notebook
	 */
	notebookApplyFileChangeHighlighting(uri: URI, conversationId: string, cellDiffs: ICellDiffData[]): void;

	/**
	 * Apply only auto-accept decorations (green highlighting) to a notebook without zone widgets
	 */
	notebookApplyAutoAcceptDecorations(uri: URI, conversationId: string, cellDiffs: ICellDiffData[], fileChangeTracker: any): void;

	/**
	 * Clear diff highlighting for a notebook
	 */
	notebookClearFileHighlighting(uri: URI): void;

	/**
	 * Clear only auto-accept highlighting for a notebook (leave regular diff highlighting intact)
	 */
	notebookClearAutoAcceptHighlighting(uri: URI): void;

	/**
	 * Clear all diff highlighting
	 */
	notebookClearAllFileHighlighting(): void;

	/**
	 * Find notebook editor for a given URI
	 */
	findNotebookEditorForUri(uri: URI): INotebookEditor | undefined;
}

export class NotebookDiffService extends Disposable implements INotebookDiffService {
	declare readonly _serviceBrand: undefined;

	private _activeNotebookEditors = new Map<string, INotebookEditor>();

	constructor(
		@IEditorService private readonly editorService: IEditorService,
		@INotebookEditorService public readonly notebookEditorService: INotebookEditorService
	) {
		super();
	}

	public registerNotebookEditor(uri: URI, editor: INotebookEditor): void {
		const uriString = uri.toString();
		
		// Only register if not already registered and not disposed
		if (!this._activeNotebookEditors.has(uriString) && !editor.isDisposed) {
			this._activeNotebookEditors.set(uriString, editor);
		}
	}

	public notebookApplyFileChangeHighlighting(uri: URI, conversationId: string, cellDiffs: ICellDiffData[]): void {
		// Use the public method to find the editor
		const editor = this.findNotebookEditorForUri(uri);
		if (!editor) {
			return;
		}

		// Always get a fresh contribution from the editor - no caching
		const contribution = editor.getContribution<NotebookDiffHighlightContribution>(NotebookDiffHighlightContribution.id);
		
		if (!contribution) {
			return;
		}

		// Apply the diff highlighting
		contribution.applyFileChangeHighlighting(uri, conversationId, cellDiffs);
	}

	public notebookClearFileHighlighting(uri: URI): void {
		const editor = this.findNotebookEditorForUri(uri);
		if (!editor) {
			return;
		}

		const contribution = editor.getContribution<NotebookDiffHighlightContribution>(NotebookDiffHighlightContribution.id);
		if (contribution) {
			contribution.clearFileHighlighting();
		}
	}

	public notebookClearAutoAcceptHighlighting(uri: URI): void {
		// Clear only auto-accept highlighting, leave regular diff highlighting intact
		const editor = this.findNotebookEditorForUri(uri);
		if (!editor) {
			return;
		}

		const contribution = editor.getContribution<NotebookAutoAcceptContribution>(NotebookAutoAcceptContribution.id);
		if (contribution) {
			contribution.clearAutoAcceptHighlighting();
		}
	}

	public notebookApplyAutoAcceptDecorations(uri: URI, conversationId: string, cellDiffs: ICellDiffData[], fileChangeTracker: any): void {		
		// Use the public method to find the editor
		const editor = this.findNotebookEditorForUri(uri);
		if (!editor) {
			return;
		}

		// Always get a fresh contribution from the editor - no caching
		const contribution = editor.getContribution<NotebookAutoAcceptContribution>(NotebookAutoAcceptContribution.id);
		
		if (!contribution) {
			return;
		}

		// Apply only the auto-accept decorations (green highlighting), no zone widgets
		contribution.applyAutoAcceptDecorations(cellDiffs, uri);
	}

	public notebookClearAllFileHighlighting(): void {
		// Clear all currently open notebook editors, not just registered ones
		const allNotebookEditors = this.notebookEditorService.listNotebookEditors();
		
		allNotebookEditors.forEach((editor) => {
			const contribution = editor.getContribution<NotebookDiffHighlightContribution>(NotebookDiffHighlightContribution.id);
			if (contribution) {
				contribution.clearFileHighlighting();
			}
		});
	}

	override dispose(): void {
		this.notebookClearAllFileHighlighting();
		this._activeNotebookEditors.clear();
		super.dispose();
	}

	public findNotebookEditorForUri(uri: URI): INotebookEditor | undefined {
		const activeEditorPane = this.editorService.activeEditorPane;
		const activeNotebookEditor = getNotebookEditorFromEditorPane(activeEditorPane);
		if (activeNotebookEditor && activeNotebookEditor.textModel?.uri.toString() === uri.toString()) {
			return activeNotebookEditor;
		}
		
		// Search through all notebook editors
		const notebookEditors = this.notebookEditorService.listNotebookEditors();
		const matchingEditor = notebookEditors.find(editor => editor.textModel?.uri.toString() === uri.toString());
		return matchingEditor;
	}
}
