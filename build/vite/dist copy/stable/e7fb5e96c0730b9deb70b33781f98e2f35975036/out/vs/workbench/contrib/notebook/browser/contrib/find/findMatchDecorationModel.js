/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { FindDecorations } from '../../../../../../editor/contrib/find/browser/findDecorations.js';
import { overviewRulerSelectionHighlightForeground, overviewRulerFindMatchForeground } from '../../../../../../platform/theme/common/colorRegistry.js';
import { NotebookOverviewRulerLane, } from '../../notebookBrowser.js';
export class FindMatchDecorationModel extends Disposable {
    constructor(_notebookEditor, ownerID) {
        super();
        this._notebookEditor = _notebookEditor;
        this.ownerID = ownerID;
        this._allMatchesDecorations = [];
        this._currentMatchCellDecorations = [];
        this._allMatchesCellDecorations = [];
        this._currentMatchDecorations = null;
    }
    get currentMatchDecorations() {
        return this._currentMatchDecorations;
    }
    clearDecorations() {
        this.clearCurrentFindMatchDecoration();
        this.setAllFindMatchesDecorations([]);
    }
    async highlightCurrentFindMatchDecorationInCell(cell, cellRange) {
        this.clearCurrentFindMatchDecoration();
        // match is an editor FindMatch, we update find match decoration in the editor
        // we will highlight the match in the webview
        this._notebookEditor.changeModelDecorations(accessor => {
            const findMatchesOptions = FindDecorations._CURRENT_FIND_MATCH_DECORATION;
            const decorations = [
                { range: cellRange, options: findMatchesOptions }
            ];
            const deltaDecoration = {
                ownerId: cell.handle,
                decorations: decorations
            };
            this._currentMatchDecorations = {
                kind: 'input',
                decorations: accessor.deltaDecorations(this._currentMatchDecorations?.kind === 'input' ? this._currentMatchDecorations.decorations : [], [deltaDecoration])
            };
        });
        this._currentMatchCellDecorations = this._notebookEditor.deltaCellDecorations(this._currentMatchCellDecorations, [{
                handle: cell.handle,
                options: {
                    overviewRuler: {
                        color: overviewRulerSelectionHighlightForeground,
                        modelRanges: [cellRange],
                        includeOutput: false,
                        position: NotebookOverviewRulerLane.Center
                    }
                }
            }]);
        return null;
    }
    async highlightCurrentFindMatchDecorationInWebview(cell, index) {
        this.clearCurrentFindMatchDecoration();
        const offset = await this._notebookEditor.findHighlightCurrent(index, this.ownerID);
        this._currentMatchDecorations = { kind: 'output', index: index };
        this._currentMatchCellDecorations = this._notebookEditor.deltaCellDecorations(this._currentMatchCellDecorations, [{
                handle: cell.handle,
                options: {
                    overviewRuler: {
                        color: overviewRulerSelectionHighlightForeground,
                        modelRanges: [],
                        includeOutput: true,
                        position: NotebookOverviewRulerLane.Center
                    }
                }
            }]);
        return offset;
    }
    clearCurrentFindMatchDecoration() {
        if (this._currentMatchDecorations?.kind === 'input') {
            this._notebookEditor.changeModelDecorations(accessor => {
                accessor.deltaDecorations(this._currentMatchDecorations?.kind === 'input' ? this._currentMatchDecorations.decorations : [], []);
                this._currentMatchDecorations = null;
            });
        }
        else if (this._currentMatchDecorations?.kind === 'output') {
            this._notebookEditor.findUnHighlightCurrent(this._currentMatchDecorations.index, this.ownerID);
        }
        this._currentMatchCellDecorations = this._notebookEditor.deltaCellDecorations(this._currentMatchCellDecorations, []);
    }
    setAllFindMatchesDecorations(cellFindMatches) {
        this._notebookEditor.changeModelDecorations((accessor) => {
            const findMatchesOptions = FindDecorations._FIND_MATCH_DECORATION;
            const deltaDecorations = cellFindMatches.map(cellFindMatch => {
                // Find matches
                const newFindMatchesDecorations = new Array(cellFindMatch.contentMatches.length);
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
        this._notebookEditor.findStop(this.ownerID);
    }
    dispose() {
        this.clearDecorations();
        super.dispose();
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZmluZE1hdGNoRGVjb3JhdGlvbk1vZGVsLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvbm90ZWJvb2svYnJvd3Nlci9jb250cmliL2ZpbmQvZmluZE1hdGNoRGVjb3JhdGlvbk1vZGVsLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBQ2hHLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUd4RSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sa0VBQWtFLENBQUM7QUFFbkcsT0FBTyxFQUFFLHlDQUF5QyxFQUFFLGdDQUFnQyxFQUFFLE1BQU0sMERBQTBELENBQUM7QUFDdkosT0FBTyxFQUF3SSx5QkFBeUIsR0FBRyxNQUFNLDBCQUEwQixDQUFDO0FBRTVNLE1BQU0sT0FBTyx3QkFBeUIsU0FBUSxVQUFVO0lBTXZELFlBQ2tCLGVBQWdDLEVBQ2hDLE9BQWU7UUFFaEMsS0FBSyxFQUFFLENBQUM7UUFIUyxvQkFBZSxHQUFmLGVBQWUsQ0FBaUI7UUFDaEMsWUFBTyxHQUFQLE9BQU8sQ0FBUTtRQVB6QiwyQkFBc0IsR0FBNEIsRUFBRSxDQUFDO1FBQ3JELGlDQUE0QixHQUFhLEVBQUUsQ0FBQztRQUM1QywrQkFBMEIsR0FBYSxFQUFFLENBQUM7UUFDMUMsNkJBQXdCLEdBQXVHLElBQUksQ0FBQztJQU81SSxDQUFDO0lBRUQsSUFBVyx1QkFBdUI7UUFDakMsT0FBTyxJQUFJLENBQUMsd0JBQXdCLENBQUM7SUFDdEMsQ0FBQztJQUVPLGdCQUFnQjtRQUN2QixJQUFJLENBQUMsK0JBQStCLEVBQUUsQ0FBQztRQUN2QyxJQUFJLENBQUMsNEJBQTRCLENBQUMsRUFBRSxDQUFDLENBQUM7SUFDdkMsQ0FBQztJQUdNLEtBQUssQ0FBQyx5Q0FBeUMsQ0FBQyxJQUFvQixFQUFFLFNBQWdCO1FBRTVGLElBQUks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