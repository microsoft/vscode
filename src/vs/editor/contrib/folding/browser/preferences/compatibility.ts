/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../../../base/common/lifecycle.js';
import { ICodeEditor } from '../../../../browser/editorBrowser.js';
import { ConfigurationChangedEvent, EditorFoldingPreferences, EditorOption } from '../../../../common/config/editorOptions.js';
import { RangeProvider } from '../folding.js';
import { FoldingRegions, FoldRange } from '../foldingRanges.js';
import { CompatibilityAdjuster, CompatibilityAdjusterIncludeClosures } from './adjusters.js';

/**
 * Adjustments are applied in declaration order.
 * If multiple adjusters are active, the result of one
 * is passed as input to the next.
 */
const compatibilityPipeline = [
	new CompatibilityAdjusterIncludeClosures()
] as const satisfies readonly CompatibilityAdjuster<keyof EditorFoldingPreferences>[];

/**
 * Applies compatibility adjustments to folding regions when:
 *  - A folding preference participating in the compatibility pipeline
 *    is explicitly set (not `'auto'`), and
 *  - The active folding provider does not declare native support for it.
 *
 * Adjustments are applied in a deterministic pipeline order.
 */
export class FoldingPreferencesCompatibility implements IDisposable {
	private _preferences: EditorFoldingPreferences;

	// Avoids unnecessary allocations and loops
	private _isAnyAdjusterActive: boolean;

	private readonly _disposable: IDisposable;

	constructor(
		private readonly editor: ICodeEditor,
		onPreferencesChanged: () => void
	) {
		this._preferences = this.editor.getOption(EditorOption.foldingPreferences);
		this._isAnyAdjusterActive = this.isAnyAdjusterActive();

		this._disposable = editor.onDidChangeConfiguration((e: ConfigurationChangedEvent) => {
			if (e.hasChanged(EditorOption.foldingPreferences)) {
				if (this.updatePreferences()) {
					this._isAnyAdjusterActive = this.isAnyAdjusterActive();
					onPreferencesChanged();
				}
			}
		});
	}

	/**
	 * Synchronizes cached folding preferences with the editor configuration.
	 *
	 * @returns `true` if any preference that participates in the
	 * compatibility pipeline changed.
	 */
	private updatePreferences(): boolean {
		const previous = this._preferences;
		const next = this.editor.getOption(EditorOption.foldingPreferences);

		if (next === previous) {
			return false;
		}

		this._preferences = next;

		for (const adjuster of compatibilityPipeline) {
			const preference = adjuster.preference;
			if (next[preference] !== previous[preference]) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Computes whether any compatibility adjuster is active
	 * by the current preferences (i.e. set to a non-`'auto'`
	 * value and willing to modify).
	 */
	private isAnyAdjusterActive(): boolean {
		const preferences = this._preferences;
		for (const adjuster of compatibilityPipeline) {
			if (preferences[adjuster.preference] === 'auto') {
				continue;
			}
			if (adjuster.willModify(preferences)) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Applies adjustments based on user preferences and
	 * provider-declared capabilities.
	 *
	 * Returns a new FoldingRegions instance if any adjustment
	 * is applied. Otherwise, the original instance is returned.
	 */
	public apply(provider: RangeProvider, foldingRegions: FoldingRegions): FoldingRegions {
		if (
			!this._isAnyAdjusterActive ||
			foldingRegions.length === 0
		) {
			return foldingRegions;
		}

		const model = this.editor.getModel();
		if (!model) {
			return foldingRegions;
		}

		let adjusted = false;
		let foldRanges: FoldRange[] | undefined;
		const preferences = this._preferences;
		for (const adjuster of compatibilityPipeline) {
			const preference = adjuster.preference;

			if (
				preferences[preference] === 'auto' ||
				provider.capabilities[preference] === true ||
				!adjuster.willModify(preferences)
			) {
				continue;
			}

			// Lazily create a mutable copy of fold ranges.
			// Although _isAnyAdjusterActive is true, the provider may
			// declare native support and bypass all compatibility adjustments
			if (foldRanges === undefined) {
				const regionsLength = foldingRegions.length;
				foldRanges = new Array<FoldRange>(regionsLength);
				for (let i = 0; i < regionsLength; i++) {
					foldRanges[i] = foldingRegions.toFoldRange(i);
				}
			}

			if (adjuster.apply(model, foldRanges, preferences)) {
				adjusted = true;
			}
		}

		return adjusted && foldRanges !== undefined
			? FoldingRegions.fromFoldRanges(foldRanges)
			: foldingRegions;
	}

	public dispose() {
		this._disposable.dispose();
	}
}
