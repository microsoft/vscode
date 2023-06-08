/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Disposable } from 'vs/base/common/lifecycle';
import { IModelDeltaDecoration } from 'vs/editor/common/model';
import { ModelDecorationOptions } from 'vs/editor/common/model/textModel';
import { FindDecorations } from 'vs/editor/contrib/find/browser/findDecorations';
import { Range } from 'vs/editor/common/core/range';
import { overviewRulerSelectionHighlightForeground, overviewRulerFindMatchForeground } from 'vs/platform/theme/common/colorRegistry';
import { CellFindMatchWithIndex, ICellModelDecorations, ICellModelDeltaDecorations, ICellViewModel, INotebookDeltaDecoration, INotebookEditor, NotebookOverviewRulerLane, } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';

export class FindMatchDecorationModel extends Disposable {
	private _allMatchesDecorations: ICellModelDecorations[] = [];
	private _currentMatchCellDecorations: string[] = [];
	private _allMatchesCellDecorations: string[] = [];
	private _currentMatchDecorations: { kind: 'input'; decorations: ICellModelDecorations[] } | { kind: 'output'; index: number } | null = null;

	constructor(
		private readonly _notebookEditor: INotebookEditor
	) {
		super();
	}

	public get currentMatchDecorations() {
		return this._currentMatchDecorations;
	}

	public clearDecorations() {
		this.clearCurrentFindMatchDecoration();
		this.setAllFindMatchesDecorations([]);
	}


	public async highlightCurrentFindMatchDecorationInCell(cell: ICellViewModel, cellRange: Range): Promise<number | null> {

		this.clearCurrentFindMatchDecoration();

		// match is an editor FindMatch, we update find match decoration in the editor
		// we will highlight the match in the webview
		this._notebookEditor.changeModelDecorations(accessor => {
			const findMatchesOptions: ModelDecorationOptions = FindDecorations._CURRENT_FIND_MATCH_DECORATION;

			const decorations: IModelDeltaDecoration[] = [
				{ range: cellRange, options: findMatchesOptions }
			];
			const deltaDecoration: ICellModelDeltaDecorations = {
				ownerId: cell.handle,
				decorations: decorations
			};

			this._currentMatchDecorations = {
				kind: 'input',
				decorations: accessor.deltaDecorations(this._currentMatchDecorations?.kind === 'input' ? this._currentMatchDecorations.decorations : [], [deltaDecoration])
			};
		});

		this._currentMatchCellDecorations = this._notebookEditor.deltaCellDecorations(this._currentMatchCellDecorations, [{
			ownerId: cell.handle,
			handle: cell.handle,
			options: {
				overviewRuler: {
					color: overviewRulerSelectionHighlightForeground,
					modelRanges: [cellRange],
					includeOutput: false,
					position: NotebookOverviewRulerLane.Center
				}
			}
		} as INotebookDeltaDecoration]);

		return null;
	}

	public async highlightCurrentFindMatchDecorationInWebview(cell: ICellViewModel, index: number): Promise<number | null> {

		this.clearCurrentFindMatchDecoration();

		const offset = await this._notebookEditor.highlightFind(index);
		this._currentMatchDecorations = { kind: 'output', index: index };

		this._currentMatchCellDecorations = this._notebookEditor.deltaCellDecorations(this._currentMatchCellDecorations, [{
			ownerId: cell.handle,
			handle: cell.handle,
			options: {
				overviewRuler: {
					color: overviewRulerSelectionHighlightForeground,
					modelRanges: [],
					includeOutput: true,
					position: NotebookOverviewRulerLane.Center
				}
			}
		} as INotebookDeltaDecoration]);

		return offset;
	}

	public clearCurrentFindMatchDecoration() {
		if (this._currentMatchDecorations?.kind === 'input') {
			this._notebookEditor.changeModelDecorations(accessor => {
				accessor.deltaDecorations(this._currentMatchDecorations?.kind === 'input' ? this._currentMatchDecorations.decorations : [], []);
				this._currentMatchDecorations = null;
			});
		} else if (this._currentMatchDecorations?.kind === 'output') {
			this._notebookEditor.unHighlightFind(this._currentMatchDecorations.index);
		}

		this._currentMatchCellDecorations = this._notebookEditor.deltaCellDecorations(this._currentMatchCellDecorations, []);
	}

	public setAllFindMatchesDecorations(cellFindMatches: CellFindMatchWithIndex[]) {
		this._notebookEditor.changeModelDecorations((accessor) => {

			const findMatchesOptions: ModelDecorationOptions = FindDecorations._FIND_MATCH_DECORATION;

			const deltaDecorations: ICellModelDeltaDecorations[] = cellFindMatches.map(cellFindMatch => {
				// Find matches
				const newFindMatchesDecorations: IModelDeltaDecoration[] = new Array<IModelDeltaDecoration>(cellFindMatch.contentMatches.length);
				for (let i = 0; i < cellFindMatch.contentMatches.length; i++) {
					newFindMatchesDecorations[i] = {
						range: cellFindMatch.contentMatches[i].range,
						options: findMatchesOptions
					};
				}

				return { ownerId: cellFindMatch.cell.handle, decorations: newFindMatchesDecorations };
			});

			this._allMatchesDecorations = accessor.deltaDecorations(this._allMatchesDecorations, deltaDecorations);
		});

		this._allMatchesCellDecorations = this._notebookEditor.deltaCellDecorations(this._allMatchesCellDecorations, cellFindMatches.map(cellFindMatch => {
			return {
				ownerId: cellFindMatch.cell.handle,
				handle: cellFindMatch.cell.handle,
				options: {
					overviewRuler: {
						color: overviewRulerFindMatchForeground,
						modelRanges: cellFindMatch.contentMatches.map(match => match.range),
						includeOutput: cellFindMatch.webviewMatches.length > 0,
						position: NotebookOverviewRulerLane.Center
					}
				}
			};
		}));
	}

	stopWebviewFind() {
		this._notebookEditor.findStop();
	}

	override dispose() {
		this.clearDecorations();
		super.dispose();
	}

}
