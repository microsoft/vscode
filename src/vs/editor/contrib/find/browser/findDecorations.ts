/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as strings from '../../../../base/common/strings.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { IActiveCodeEditor } from '../../../browser/editorBrowser.js';
import { Position } from '../../../common/core/position.js';
import { Range } from '../../../common/core/range.js';
import { FindMatch, IModelDecorationOptions, IModelDecorationsChangeAccessor, IModelDeltaDecoration, MinimapPosition, OverviewRulerLane, TrackedRangeStickiness } from '../../../common/model.js';
import { ModelDecorationOptions } from '../../../common/model/textModel.js';
import { minimapFindMatch, overviewRulerFindMatchForeground } from '../../../../platform/theme/common/colorRegistry.js';
import { themeColorFromId } from '../../../../platform/theme/common/themeService.js';

export class FindDecorations implements IDisposable {

	private readonly _editor: IActiveCodeEditor;
	private _decorations: string[];
	private _overviewRulerApproximateDecorations: string[];
	private _findScopeDecorationIds: string[];
	private _rangeHighlightDecorationId: string | null;
	private _highlightedDecorationId: string | null;
	private _useFindMatchOverviewRuler: boolean;
	private _startPosition: Position;

	constructor(editor: IActiveCodeEditor) {
		this._editor = editor;
		this._decorations = [];
		this._overviewRulerApproximateDecorations = [];
		this._findScopeDecorationIds = [];
		this._rangeHighlightDecorationId = null;
		this._highlightedDecorationId = null;
		this._useFindMatchOverviewRuler = true;
		this._startPosition = this._editor.getPosition();
	}

	public dispose(): void {
		this._editor.removeDecorations(this._allDecorations());

		this._decorations = [];
		this._overviewRulerApproximateDecorations = [];
		this._findScopeDecorationIds = [];
		this._rangeHighlightDecorationId = null;
		this._highlightedDecorationId = null;
		this._useFindMatchOverviewRuler = true;
	}

	public reset(): void {
		this._decorations = [];
		this._overviewRulerApproximateDecorations = [];
		this._findScopeDecorationIds = [];
		this._rangeHighlightDecorationId = null;
		this._highlightedDecorationId = null;
		this._useFindMatchOverviewRuler = true;
	}

	public getCount(): number {
		return this._decorations.length;
	}

	/** @deprecated use getFindScopes to support multiple selections */
	public getFindScope(): Range | null {
		if (this._findScopeDecorationIds[0]) {
			return this._editor.getModel().getDecorationRange(this._findScopeDecorationIds[0]);
		}
		return null;
	}

	public getFindScopes(): Range[] | null {
		if (this._findScopeDecorationIds.length) {
			const scopes = this._findScopeDecorationIds.map(findScopeDecorationId =>
				this._editor.getModel().getDecorationRange(findScopeDecorationId)
			).filter(element => !!element);
			if (scopes.length) {
				return scopes;
			}
		}
		return null;
	}

	public getStartPosition(): Position {
		return this._startPosition;
	}

	public setStartPosition(newStartPosition: Position): void {
		this._startPosition = newStartPosition;
		this.setCurrentFindMatch(null);
	}

	private _getDecorationIndex(decorationId: string): number {
		const index = this._decorations.indexOf(decorationId);
		if (index >= 0) {
			return index + 1;
		}
		return 1;
	}

	public getDecorationRangeAt(index: number): Range | null {
		const decorationId = index < this._decorations.length ? this._decorations[index] : null;
		if (decorationId) {
			return this._editor.getModel().getDecorationRange(decorationId);
		}
		return null;
	}

	public getCurrentMatchesPosition(desiredRange: Range): number {
		const candidates = this._editor.getModel().getDecorationsInRange(desiredRange);
		for (const candidate of candidates) {
			const candidateOpts = candidate.options;
			if (
				candidateOpts === FindDecorations._FIND_MATCH_DECORATION
				|| candidateOpts === FindDecorations._FIND_MATCH_BIDI_DECORATION
				|| candidateOpts === FindDecorations._FIND_MATCH_NO_OVERVIEW_DECORATION
				|| candidateOpts === FindDecorations._FIND_MATCH_NO_OVERVIEW_BIDI_DECORATION
				|| candidateOpts === FindDecorations._CURRENT_FIND_MATCH_DECORATION
				|| candidateOpts === FindDecorations._CURRENT_FIND_MATCH_BIDI_DECORATION
			) {
				return this._getDecorationIndex(candidate.id);
			}
		}
		// We don't know the current match position, so returns zero to show '?' in find widget
		return 0;
	}

	public setCurrentFindMatch(nextMatch: Range | null): number {
		let newCurrentDecorationId: string | null = null;
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
			this._editor.changeDecorations((changeAccessor: IModelDecorationsChangeAccessor) => {
				if (this._highlightedDecorationId !== null) {
					const highlightedRange = this._editor.getModel().getDecorationRange(this._highlightedDecorationId);
					if (highlightedRange) {
						changeAccessor.changeDecorationOptions(this._highlightedDecorationId, this._getFindMatchDecorationOptions(highlightedRange, this._useFindMatchOverviewRuler));
					}
					this._highlightedDecorationId = null;
				}
				if (newCurrentDecorationId !== null) {
					this._highlightedDecorationId = newCurrentDecorationId;
					const newCurrentRange = this._editor.getModel().getDecorationRange(this._highlightedDecorationId);
					if (newCurrentRange) {
						changeAccessor.changeDecorationOptions(this._highlightedDecorationId, this._getCurrentFindMatchDecorationOptions(newCurrentRange));
					}
				}
				if (this._rangeHighlightDecorationId !== null) {
					changeAccessor.removeDecoration(this._rangeHighlightDecorationId);
					this._rangeHighlightDecorationId = null;
				}
				if (newCurrentDecorationId !== null) {
					let rng = this._editor.getModel().getDecorationRange(newCurrentDecorationId)!;
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

	public set(findMatches: FindMatch[], findScopes: Range[] | null): void {
		this._editor.changeDecorations((accessor) => {
			const model = this._editor.getModel();
			const lineContainsRTLCache = model.mightContainRTL() ? new Map<number, boolean>() : undefined;

			this._useFindMatchOverviewRuler = true;
			const newOverviewRulerApproximateDecorations: IModelDeltaDecoration[] = [];

			if (findMatches.length > 1000) {
				// we go into a mode where the overview ruler gets "approximate" decorations
				// the reason is that the overview ruler paints all the decorations in the file and we don't want to cause freezes
				this._useFindMatchOverviewRuler = false;

				// approximate a distance in lines where matches should be merged
				const lineCount = model.getLineCount();
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
					} else {
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
			const newFindMatchesDecorations: IModelDeltaDecoration[] = new Array<IModelDeltaDecoration>(findMatches.length);
			for (let i = 0, len = findMatches.length; i < len; i++) {
				newFindMatchesDecorations[i] = {
					range: findMatches[i].range,
					options: this._getFindMatchDecorationOptions(findMatches[i].range, this._useFindMatchOverviewRuler, lineContainsRTLCache)
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

	private _getFindMatchDecorationOptions(range: Range, includeOverviewRuler: boolean, lineContainsRTLCache?: Map<number, boolean>): ModelDecorationOptions {
		if (this._rangeContainsRTL(range, lineContainsRTLCache)) {
			return includeOverviewRuler ? FindDecorations._FIND_MATCH_BIDI_DECORATION : FindDecorations._FIND_MATCH_NO_OVERVIEW_BIDI_DECORATION;
		}

		return includeOverviewRuler ? FindDecorations._FIND_MATCH_DECORATION : FindDecorations._FIND_MATCH_NO_OVERVIEW_DECORATION;
	}

	private _getCurrentFindMatchDecorationOptions(range: Range): ModelDecorationOptions {
		return this._rangeContainsRTL(range) ? FindDecorations._CURRENT_FIND_MATCH_BIDI_DECORATION : FindDecorations._CURRENT_FIND_MATCH_DECORATION;
	}

	private _rangeContainsRTL(range: Range, lineContainsRTLCache?: Map<number, boolean>): boolean {
		const model = this._editor.getModel();
		if (!model.mightContainRTL()) {
			return false;
		}

		for (let lineNumber = range.startLineNumber; lineNumber <= range.endLineNumber; lineNumber++) {
			let containsRTL = lineContainsRTLCache?.get(lineNumber);
			if (containsRTL === undefined) {
				containsRTL = strings.containsRTL(model.getLineContent(lineNumber));
				lineContainsRTLCache?.set(lineNumber, containsRTL);
			}

			if (containsRTL) {
				return true;
			}
		}

		return false;
	}

	public matchBeforePosition(position: Position): Range | null {
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

	public matchAfterPosition(position: Position): Range | null {
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

	private _allDecorations(): string[] {
		let result: string[] = [];
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

	private static _createCurrentFindMatchDecorationOptions(description: string, inlineClassName?: string): IModelDecorationOptions {
		return {
			description,
			stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
			zIndex: 13,
			className: 'currentFindMatch',
			inlineClassName,
			showIfCollapsed: true,
			overviewRuler: {
				color: themeColorFromId(overviewRulerFindMatchForeground),
				position: OverviewRulerLane.Center
			},
			minimap: {
				color: themeColorFromId(minimapFindMatch),
				position: MinimapPosition.Inline
			}
		};
	}

	private static _createFindMatchDecorationOptions(description: string, includeOverviewRuler: boolean, zIndex?: number, inlineClassName?: string): IModelDecorationOptions {
		return {
			description,
			stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
			zIndex,
			className: 'findMatch',
			inlineClassName,
			showIfCollapsed: true,
			overviewRuler: includeOverviewRuler ? {
				color: themeColorFromId(overviewRulerFindMatchForeground),
				position: OverviewRulerLane.Center
			} : undefined,
			minimap: includeOverviewRuler ? {
				color: themeColorFromId(minimapFindMatch),
				position: MinimapPosition.Inline
			} : undefined
		};
	}

	public static readonly _CURRENT_FIND_MATCH_DECORATION = ModelDecorationOptions.register(FindDecorations._createCurrentFindMatchDecorationOptions('current-find-match', 'currentFindMatchInline'));

	public static readonly _CURRENT_FIND_MATCH_BIDI_DECORATION = ModelDecorationOptions.register(FindDecorations._createCurrentFindMatchDecorationOptions('current-find-match-bidi'));

	public static readonly _FIND_MATCH_DECORATION = ModelDecorationOptions.register(FindDecorations._createFindMatchDecorationOptions('find-match', true, 10, 'findMatchInline'));

	public static readonly _FIND_MATCH_BIDI_DECORATION = ModelDecorationOptions.register(FindDecorations._createFindMatchDecorationOptions('find-match-bidi', true, 10));

	public static readonly _FIND_MATCH_NO_OVERVIEW_DECORATION = ModelDecorationOptions.register(FindDecorations._createFindMatchDecorationOptions('find-match-no-overview', false));

	public static readonly _FIND_MATCH_NO_OVERVIEW_BIDI_DECORATION = FindDecorations._FIND_MATCH_NO_OVERVIEW_DECORATION;

	private static readonly _FIND_MATCH_ONLY_OVERVIEW_DECORATION = ModelDecorationOptions.register({
		description: 'find-match-only-overview',
		stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
		overviewRuler: {
			color: themeColorFromId(overviewRulerFindMatchForeground),
			position: OverviewRulerLane.Center
		}
	});

	private static readonly _RANGE_HIGHLIGHT_DECORATION = ModelDecorationOptions.register({
		description: 'find-range-highlight',
		stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
		className: 'rangeHighlight',
		isWholeLine: true
	});

	private static readonly _FIND_SCOPE_DECORATION = ModelDecorationOptions.register({
		description: 'find-scope',
		className: 'findScope',
		isWholeLine: true
	});
}
