/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Range } from '../../../common/core/range.js';
import { OverviewRulerLane } from '../../../common/model.js';
import { ModelDecorationOptions } from '../../../common/model/textModel.js';
import { minimapFindMatch, overviewRulerFindMatchForeground } from '../../../../platform/theme/common/colorRegistry.js';
import { themeColorFromId } from '../../../../platform/theme/common/themeService.js';
export class FindDecorations {
    constructor(editor) {
        this._editor = editor;
        this._decorations = [];
        this._overviewRulerApproximateDecorations = [];
        this._findScopeDecorationIds = [];
        this._rangeHighlightDecorationId = null;
        this._highlightedDecorationId = null;
        this._startPosition = this._editor.getPosition();
    }
    dispose() {
        this._editor.removeDecorations(this._allDecorations());
        this._decorations = [];
        this._overviewRulerApproximateDecorations = [];
        this._findScopeDecorationIds = [];
        this._rangeHighlightDecorationId = null;
        this._highlightedDecorationId = null;
    }
    reset() {
        this._decorations = [];
        this._overviewRulerApproximateDecorations = [];
        this._findScopeDecorationIds = [];
        this._rangeHighlightDecorationId = null;
        this._highlightedDecorationId = null;
    }
    getCount() {
        return this._decorations.length;
    }
    /** @deprecated use getFindScopes to support multiple selections */
    getFindScope() {
        if (this._findScopeDecorationIds[0]) {
            return this._editor.getModel().getDecorationRange(this._findScopeDecorationIds[0]);
        }
        return null;
    }
    getFindScopes() {
        if (this._findScopeDecorationIds.length) {
            const scopes = this._findScopeDecorationIds.map(findScopeDecorationId => this._editor.getModel().getDecorationRange(findScopeDecorationId)).filter(element => !!element);
            if (scopes.length) {
                return scopes;
            }
        }
        return null;
    }
    getStartPosition() {
        return this._startPosition;
    }
    setStartPosition(newStartPosition) {
        this._startPosition = newStartPosition;
        this.setCurrentFindMatch(null);
    }
    _getDecorationIndex(decorationId) {
        const index = this._decorations.indexOf(decorationId);
        if (index >= 0) {
            return index + 1;
        }
        return 1;
    }
    getDecorationRangeAt(index) {
        const decorationId = index < this._decorations.length ? this._decorations[index] : null;
        if (decorationId) {
            return this._editor.getModel().getDecorationRange(decorationId);
        }
        return null;
    }
    getCurrentMatchesPosition(desiredRange) {
        const candidates = this._editor.getModel().getDecorationsInRange(desiredRange);
        for (const candidate of candidates) {
            const candidateOpts = candidate.options;
            if (candidateOpts === FindDecorations._FIND_MATCH_DECORATION || candidateOpts === FindDecorations._FIND_MATCH_NO_OVERVIEW_DECORATION || candidateOpts === FindDecorations._CURRENT_FIND_MATCH_DECORATION) {
                return this._getDecorationIndex(candidate.id);
            }
        }
        // We don't know the current match position, so returns zero to show '?' in find widget
        return 0;
    }
    setCurrentFindMatch(nextMatch) {
        let newCurrentDecorationId = null;
        let matchPosition = 0;
        if (nextMatch) {
            for (let i = 0, len = this._decorations.length; i < len; i++) {
                const range = this._editor.getModel().getDecorationRange(this._decorations[i]);
                if (nextMatch.equalsRange(range)) {
                    newCurrentDecorationId = this._decorations[i];
                    matchPosition = (i + 1);
                    break;
                }
            }
        }
        if (this._highlightedDecorationId !== null || newCurrentDecorationId !== null) {
            this._editor.changeDecorations((changeAccessor) => {
                if (this._highlightedDecorationId !== null) {
                    changeAccessor.changeDecorationOptions(this._highlightedDecorationId, FindDecorations._FIND_MATCH_DECORATION);
                    this._highlightedDecorationId = null;
                }
                if (newCurrentDecorationId !== null) {
                    this._highlightedDecorationId = newCurrentDecorationId;
                    changeAccessor.changeDecorationOptions(this._highlightedDecorationId, FindDecorations._CURRENT_FIND_MATCH_DECORATION);
                }
                if (this._rangeHighlightDecorationId !== null) {
                    changeAccessor.removeDecoration(this._rangeHighlightDecorationId);
                    this._rangeHighlightDecorationId = null;
                }
                if (newCurrentDecorationId !== null) {
                    let rng = this._editor.getModel().getDecorationRange(newCurrentDecorationId);
                    if (rng.startLineNumber !== rng.endLineNumber && rng.endColumn === 1) {
                        const lineBeforeEnd = rng.endLineNumber - 1;
                        const lineBeforeEndMaxColumn = this._editor.getModel().getLineMaxColumn(lineBeforeEnd);
                        rng = new Range(rng.startLineNumber, rng.startColumn, lineBeforeEnd, lineBeforeEndMaxColumn);
                    }
                    this._rangeHighlightDecorationId = changeAccessor.addDecoration(rng, FindDecorations._RANGE_HIGHLIGHT_DECORATION);
                }
            });
        }
        return matchPosition;
    }
    set(findMatches, findScopes) {
        this._editor.changeDecorations((accessor) => {
            let findMatchesOptions = FindDecorations._FIND_MATCH_DECORATION;
            const newOverviewRulerApproximateDecorations = [];
            if (findMatches.length > 1000) {
                // we go into a mode where the overview ruler gets "approximate" decorations
                // the reason is that the overview ruler paints all the decorations in the file and we don't want to cause freezes
                findMatchesOptions = FindDecorations._FIND_MATCH_NO_OVERVIEW_DECORATION;
                // approximate a distance in lines where matches should be merged
                const lineCount = this._editor.getModel().getLineCount();
                const height = this._editor.getLayoutInfo().height;
                const approxPixelsPerLine = height / lineCount;
                const mergeLinesDelta = Math.max(2, Math.ceil(3 / approxPixelsPerLine));
                // merge decorations as much as possible
                let prevStartLineNumber = findMatches[0].range.startLineNumber;
                let prevEndLineNumber = findMatches[0].range.endLineNumber;
                for (let i = 1, len = findMatches.length; i < len; i++) {
                    const range = findMatches[i].range;
                    if (prevEndLineNumber + mergeLinesDelta >= range.startLineNumber) {
                        if (range.endLineNumber > prevEndLineNumber) {
                            prevEndLineNumber = range.endLineNumber;
                        }
                    }
                    else {
                        newOverviewRulerApproximateDecorations.push({
                            range: new Range(prevStartLineNumber, 1, prevEndLineNumber, 1),
                            options: FindDecorations._FIND_MATCH_ONLY_OVERVIEW_DECORATION
                        });
                        prevStartLineNumber = range.startLineNumber;
                        prevEndLineNumber = range.endLineNumber;
                    }
                }
                newOverviewRulerApproximateDecorations.push({
                    range: new Range(prevStartLineNumber, 1, prevEndLineNumber, 1),
                    options: FindDecorations._FIND_MATCH_ONLY_OVERVIEW_DECORATION
                });
            }
            // Find matches
            const newFindMatchesDecorations = new Array(findMatches.length);
            for (let i = 0, len = findMatches.length; i < len; i++) {
                newFindMatchesDecorations[i] = {
                    range: findMatches[i].range,
                    options: findMatchesOptions
                };
            }
            this._decorations = accessor.deltaDecorations(this._decorations, newFindMatchesDecorations);
            // Overview ruler approximate decorations
            this._overviewRulerApproximateDecorations = accessor.deltaDecorations(this._overviewRulerApproximateDecorations, newOverviewRulerApproximateDecorations);
            // Range highlight
            if (this._rangeHighlightDecorationId) {
                accessor.removeDecoration(this._rangeHighlightDecorationId);
                this._rangeHighlightDecorationId = null;
            }
            // Find scope
            if (this._findScopeDecorationIds.length) {
                this._findScopeDecorationIds.forEach(findScopeDecorationId => accessor.removeDecoration(findScopeDecorationId));
                this._findScopeDecorationIds = [];
            }
            if (findScopes?.length) {
                this._findScopeDecorationIds = findScopes.map(findScope => accessor.addDecoration(findScope, FindDecorations._FIND_SCOPE_DECORATION));
            }
        });
    }
    matchBeforePosition(position) {
        if (this._decorations.length === 0) {
            return null;
        }
        for (let i = this._decorations.length - 1; i >= 0; i--) {
            const decorationId = this._decorations[i];
            const r = this._editor.getModel().getDecorationRange(decorationId);
            if (!r || r.endLineNumber > position.lineNumber) {
                continue;
            }
            if (r.endLineNumber < position.lineNumber) {
                return r;
            }
            if (r.endColumn > position.column) {
                continue;
            }
            return r;
        }
        return this._editor.getModel().getDecorationRange(this._decorations[this._decorations.length - 1]);
    }
    matchAfterPosition(position) {
        if (this._decorations.length === 0) {
            return null;
        }
        for (let i = 0, len = this._decorations.length; i < len; i++) {
            const decorationId = this._decorations[i];
            const r = this._editor.getModel().getDecorationRange(decorationId);
            if (!r || r.startLineNumber < position.lineNumber) {
                continue;
            }
            if (r.startLineNumber > position.lineNumber) {
                return r;
            }
            if (r.startColumn < position.column) {
                continue;
            }
            return r;
        }
        return this._editor.getModel().getDecorationRange(this._decorations[0]);
    }
    _allDecorations() {
        let result = [];
        result = result.concat(this._decorations);
        result = result.concat(this._overviewRulerApproximateDecorations);
        if (this._findScopeDecorationIds.length) {
            result.push(...this._findScopeDecorationIds);
        }
        if (this._rangeHighlightDecorationId) {
            result.push(this._rangeHighlightDecorationId);
        }
        return result;
    }
    static { this._CURRENT_FIND_MATCH_DECORATION = ModelDecorationOptions.register({
        description: 'current-find-match',
        stickiness: 1 /* TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges */,
        zIndex: 13,
        className: 'currentFindMatch',
        inlineClassName: 'currentFindMatchInline',
        showIfCollapsed: true,
        overviewRuler: {
            color: themeColorFromId(overviewRulerFindMatchForeground),
            position: OverviewRulerLane.Center
        },
        minimap: {
            color: themeColorFromId(minimapFindMatch),
            position: 1 /* MinimapPosition.Inline */
        }
    }); }
    static { this._FIND_MATCH_DECORATION = ModelDecorationOptions.register({
        description: 'find-match',
        stickiness: 1 /* TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges */,
        zIndex: 10,
        className: 'findMatch',
        inlineClassName: 'findMatchInline',
        showIfCollapsed: true,
        overviewRuler: {
            color: themeColorFromId(overviewRulerFindMatchForeground),
            position: OverviewRulerLane.Center
        },
        minimap: {
            color: themeColorFromId(minimapFindMatch),
            position: 1 /* MinimapPosition.Inline */
        }
    }); }
    static { this._FIND_MATCH_NO_OVERVIEW_DECORATION = ModelDecorationOptions.register({
        description: 'find-match-no-overview',
        stickiness: 1 /* TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges */,
        className: 'findMatch',
        showIfCollapsed: true
    }); }
    static { this._FIND_MATCH_ONLY_OVERVIEW_DECORATION = ModelDecorationOptions.register({
        description: 'find-match-only-overview',
        stickiness: 1 /* TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges */,
        overviewRuler: {
            color: themeColorFromId(overviewRulerFindMatchForeground),
            position: OverviewRulerLane.Center
        }
    }); }
    static { this._RANGE_HIGHLIGHT_DECORATION = ModelDecorationOptions.register({
        description: 'find-range-highlight',
        stickiness: 1 /* TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges */,
        className: 'rangeHighlight',
        isWholeLine: true
    }); }
    static { this._FIND_SCOPE_DECORATION = ModelDecorationOptions.register({
        description: 'find-scope',
        className: 'findScope',
        isWholeLine: true
    }); }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZmluZERlY29yYXRpb25zLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbnRyaWIvZmluZC9icm93c2VyL2ZpbmREZWNvcmF0aW9ucy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUtoRyxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDdEQsT0FBTyxFQUFzRixpQkFBaUIsRUFBMEIsTUFBTSwwQkFBMEIsQ0FBQztBQUN6SyxPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUM1RSxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsZ0NBQWdDLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUN4SCxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUVyRixNQUFNLE9BQU8sZUFBZTtJQVUzQixZQUFZLE1BQXlCO1FBQ3BDLElBQUksQ0FBQyxPQUFPLEdBQUcsTUFBTSxDQUFDO1FBQ3RCLElBQUksQ0FBQyxZQUFZLEdBQUcsRUFBRSxDQUFDO1FBQ3ZCLElBQUksQ0FBQyxvQ0FBb0MsR0FBRyxFQUFFLENBQUM7UUFDL0MsSUFBSSxDQUFDLHVCQUF1QixHQUFHLEVBQUUsQ0FBQztRQUNsQyxJQUFJLENBQUMsMkJBQTJCLEdBQUcsSUFBSSxDQUFDO1FBQ3hDLElBQUksQ0FBQyx3QkFBd0IsR0FBRyxJQUFJLENBQUM7UUFDckMsSUFBSSxDQUFDLGNBQWMsR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLFdBQVcsRUFBRSxDQUFDO0lBQ2xELENBQUM7SUFFTSxPQUFPO1FBQ2IsSUFBSSxDQUFDLE9BQU8sQ0FBQyxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsZUFBZSxFQUFFLENBQUMsQ0FBQztRQUV2RCxJQUFJLENBQUMsWUFBWSxHQUFHLEVBQUUsQ0FBQztRQUN2QixJQUFJLENBQUMsb0NB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