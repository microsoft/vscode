/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Disposable } from 'vs/base/common/lifecycle';
import { FindMatch, IModelDeltaDecoration } from 'vs/editor/common/model';
import { ModelDecorationOptions } from 'vs/editor/common/model/textModel';
import { FindDecorations } from 'vs/editor/contrib/find/browser/findDecorations';
import { overviewRulerSelectionHighlightForeground, overviewRulerFindMatchForeground } from 'vs/platform/theme/common/colorRegistry';
import { CellFindMatchWithIndex, CellWebviewFindMatch, ICellModelDecorations, ICellModelDeltaDecorations, ICellViewModel, INotebookDeltaDecoration, INotebookEditor, NotebookOverviewRulerLane, } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';

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

	public async highlightCurrentFindMatchDecoration(cell: ICellViewModel, match: FindMatch | CellWebviewFindMatch): Promise<number | null> {

		if (match instanceof FindMatch) {
			this.clearCurrentFindMatchDecoration();

			// match is an editor FindMatch, we update find match decoration in the editor
			// we will highlight the match in the webview
			this._notebookEditor.changeModelDecorations(accessor => {
				const findMatchesOptions: ModelDecorationOptions = FindDecorations._CURRENT_FIND_MATCH_DECORATION;

				const decorations: IModelDeltaDecoration[] = [
					{ range: match.range, options: findMatchesOptions }
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
						modelRanges: [match.range],
						includeOutput: false,
						position: NotebookOverviewRulerLane.Center
					}
				}
			} as INotebookDeltaDecoration]);

			return null;
		} else {
			this.clearCurrentFindMatchDecoration();

			const offset = await this._notebookEditor.highlightFind(cell, match.index);
			this._currentMatchDecorations = { kind: 'output', index: match.index };

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
				const newFindMatchesDecorations: IModelDeltaDecoration[] = new Array<IModelDeltaDecoration>(cellFindMatch.length);
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

}
