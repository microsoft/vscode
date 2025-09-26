/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Lotas Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { URI } from '../../../../base/common/uri.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { INotebookEditor } from '../../../contrib/notebook/browser/notebookBrowser.js';
import { NotebookDiffHighlightContribution } from '../../../contrib/notebook/browser/contrib/diff/notebookDiffHighlight.js';
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
	applyNotebookDiffHighlighting(uri: URI, conversationId: string, cellDiffs: ICellDiffData[]): void;

	/**
	 * Clear diff highlighting for a notebook
	 */
	clearNotebookDiffHighlighting(uri: URI): void;

	/**
	 * Clear all diff highlighting
	 */
	clearAllDiffHighlighting(): void;

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

	public applyNotebookDiffHighlighting(uri: URI, conversationId: string, cellDiffs: ICellDiffData[]): void {
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
		contribution.applyDiffHighlighting(uri, conversationId, cellDiffs);
	}

	public clearNotebookDiffHighlighting(uri: URI): void {
		const uriString = uri.toString();

		const editor = this._activeNotebookEditors.get(uriString);
		if (editor) {
			const contribution = editor.getContribution<NotebookDiffHighlightContribution>(NotebookDiffHighlightContribution.id);
			if (contribution) {
				contribution.clearDiffHighlighting();
			}
		}
	}

	public clearAllDiffHighlighting(): void {
		// Clear all currently open notebook editors, not just registered ones
		const allNotebookEditors = this.notebookEditorService.listNotebookEditors();
		
		allNotebookEditors.forEach((editor) => {
			const contribution = editor.getContribution<NotebookDiffHighlightContribution>(NotebookDiffHighlightContribution.id);
			if (contribution) {
				contribution.clearDiffHighlighting();
			}
		});
	}

	override dispose(): void {
		this.clearAllDiffHighlighting();
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
