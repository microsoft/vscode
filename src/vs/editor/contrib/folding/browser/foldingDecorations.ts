/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from 'vs/base/common/codicons';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { IModelDecorationOptions, IModelDecorationsChangeAccessor, InjectedTextCursorStops, InjectedTextOptions, MinimapPosition, TrackedRangeStickiness } from 'vs/editor/common/model';
import { ModelDecorationOptions } from 'vs/editor/common/model/textModel';
import { IDecorationProvider } from 'vs/editor/contrib/folding/browser/foldingModel';
import { localize } from 'vs/nls';
import { editorSelectionBackground, iconForeground, registerColor, transparent } from 'vs/platform/theme/common/colorRegistry';
import { registerIcon } from 'vs/platform/theme/common/iconRegistry';
import { themeColorFromId, ThemeIcon } from 'vs/platform/theme/common/themeService';

const foldBackground = registerColor('editor.foldBackground', { light: transparent(editorSelectionBackground, 0.3), dark: transparent(editorSelectionBackground, 0.3), hcDark: null, hcLight: null }, localize('foldBackgroundBackground', "Background color behind folded ranges. The color must not be opaque so as not to hide underlying decorations."), true);
registerColor('editorGutter.foldingControlForeground', { dark: iconForeground, light: iconForeground, hcDark: iconForeground, hcLight: iconForeground }, localize('editorGutter.foldingControlForeground', 'Color of the folding control in the editor gutter.'));

export const foldingExpandedIcon = registerIcon('folding-expanded', Codicon.chevronDown, localize('foldingExpandedIcon', 'Icon for expanded ranges in the editor glyph margin.'));
export const foldingCollapsedIcon = registerIcon('folding-collapsed', Codicon.chevronRight, localize('foldingCollapsedIcon', 'Icon for collapsed ranges in the editor glyph margin.'));
export const foldingManualCollapsedIcon = registerIcon('folding-manual-collapsed', foldingCollapsedIcon, localize('foldingManualCollapedIcon', 'Icon for manually collapsed ranges in the editor glyph margin.'));
export const foldingManualExpandedIcon = registerIcon('folding-manual-expanded', foldingExpandedIcon, localize('foldingManualExpandedIcon', 'Icon for manually expanded ranges in the editor glyph margin.'));

const foldedBackgroundMinimap = { color: themeColorFromId(foldBackground), position: MinimapPosition.Inline };

export class FoldingDecorationProvider implements IDecorationProvider {

	private static readonly DEFAULT_COLLAPSED_TEXT = '\u22EF'; /* ellipses unicode character */

	//To always keep decoration in injectedTextTree between toggles, otherwise would crash
	private static EMPTY_INJECTED_TEXT: InjectedTextOptions = { content: '' };

	private static readonly COLLAPSED_VISUAL_DECORATION: IModelDecorationOptions = {
		description: 'folding-collapsed-visual-decoration',
		stickiness: TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges,
		isWholeLine: true,
		firstLineDecorationClassName: ThemeIcon.asClassName(foldingCollapsedIcon),
		hideContent: true,
	};

	private static readonly COLLAPSED_HIGHLIGHTED_VISUAL_DECORATION: IModelDecorationOptions = {
		description: 'folding-collapsed-highlighted-visual-decoration',
		stickiness: TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges,
		className: 'folded-background',
		minimap: foldedBackgroundMinimap,
		isWholeLine: true,
		firstLineDecorationClassName: ThemeIcon.asClassName(foldingCollapsedIcon),
		hideContent: true
	};

	private static readonly MANUALLY_COLLAPSED_VISUAL_DECORATION: IModelDecorationOptions = {
		description: 'folding-manually-collapsed-visual-decoration',
		stickiness: TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges,
		isWholeLine: true,
		firstLineDecorationClassName: ThemeIcon.asClassName(foldingManualCollapsedIcon),
		hideContent: true
	};

	private static readonly MANUALLY_COLLAPSED_HIGHLIGHTED_VISUAL_DECORATION: IModelDecorationOptions = {
		description: 'folding-manually-collapsed-highlighted-visual-decoration',
		stickiness: TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges,
		className: 'folded-background',
		minimap: foldedBackgroundMinimap,
		isWholeLine: true,
		firstLineDecorationClassName: ThemeIcon.asClassName(foldingManualCollapsedIcon),
		hideContent: true
	};

	private static readonly NO_CONTROLS_COLLAPSED_RANGE_DECORATION: IModelDecorationOptions = {
		description: 'folding-no-controls-range-decoration',
		stickiness: TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges,
		isWholeLine: true,
		hideContent: true
	};

	private static readonly NO_CONTROLS_COLLAPSED_HIGHLIGHTED_RANGE_DECORATION: IModelDecorationOptions = {
		description: 'folding-no-controls-range-decoration',
		stickiness: TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges,
		className: 'folded-background',
		minimap: foldedBackgroundMinimap,
		isWholeLine: true,
		hideContent: true
	};

	private static readonly EXPANDED_VISUAL_DECORATION = ModelDecorationOptions.register({
		description: 'folding-expanded-visual-decoration',
		stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
		isWholeLine: true,
		firstLineDecorationClassName: 'alwaysShowFoldIcons ' + ThemeIcon.asClassName(foldingExpandedIcon),
		before: FoldingDecorationProvider.EMPTY_INJECTED_TEXT
	});

	private static readonly EXPANDED_AUTO_HIDE_VISUAL_DECORATION = ModelDecorationOptions.register({
		description: 'folding-expanded-auto-hide-visual-decoration',
		stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
		isWholeLine: true,
		firstLineDecorationClassName: ThemeIcon.asClassName(foldingExpandedIcon),
		before: FoldingDecorationProvider.EMPTY_INJECTED_TEXT
	});

	private static readonly MANUALLY_EXPANDED_VISUAL_DECORATION = ModelDecorationOptions.register({
		description: 'folding-manually-expanded-visual-decoration',
		stickiness: TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges,
		isWholeLine: true,
		firstLineDecorationClassName: 'alwaysShowFoldIcons ' + ThemeIcon.asClassName(foldingManualExpandedIcon),
		before: FoldingDecorationProvider.EMPTY_INJECTED_TEXT
	});

	private static readonly MANUALLY_EXPANDED_AUTO_HIDE_VISUAL_DECORATION = ModelDecorationOptions.register({
		description: 'folding-manually-expanded-auto-hide-visual-decoration',
		stickiness: TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges,
		isWholeLine: true,
		firstLineDecorationClassName: ThemeIcon.asClassName(foldingManualExpandedIcon),
		before: FoldingDecorationProvider.EMPTY_INJECTED_TEXT
	});

	private static readonly NO_CONTROLS_EXPANDED_RANGE_DECORATION = ModelDecorationOptions.register({
		description: 'folding-no-controls-range-decoration',
		stickiness: TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges,
		isWholeLine: true,
		before: FoldingDecorationProvider.EMPTY_INJECTED_TEXT
	});

	private static readonly HIDDEN_RANGE_DECORATION = ModelDecorationOptions.register({
		description: 'folding-hidden-range-decoration',
		stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
		before: FoldingDecorationProvider.EMPTY_INJECTED_TEXT
	});

	public showFoldingControls: 'always' | 'never' | 'mouseover' = 'mouseover';

	public showFoldingHighlights: boolean = true;

	constructor(private readonly editor: ICodeEditor) {
	}

	getDecorationOption(isCollapsed: boolean, isHidden: boolean, isManual: boolean, collapsedText = FoldingDecorationProvider.DEFAULT_COLLAPSED_TEXT): IModelDecorationOptions {
		if (isHidden) { // is inside another collapsed region
			return FoldingDecorationProvider.HIDDEN_RANGE_DECORATION;
		}

		if (this.showFoldingControls === 'never') {
			if (isCollapsed) {
				return this.addCollapsedText(
					collapsedText,
					this.showFoldingHighlights ? FoldingDecorationProvider.NO_CONTROLS_COLLAPSED_HIGHLIGHTED_RANGE_DECORATION : FoldingDecorationProvider.NO_CONTROLS_COLLAPSED_RANGE_DECORATION
				);
			}
			return FoldingDecorationProvider.NO_CONTROLS_EXPANDED_RANGE_DECORATION;
		}
		if (isCollapsed) {
			return this.addCollapsedText(collapsedText, isManual ?
				(this.showFoldingHighlights ? FoldingDecorationProvider.MANUALLY_COLLAPSED_HIGHLIGHTED_VISUAL_DECORATION : FoldingDecorationProvider.MANUALLY_COLLAPSED_VISUAL_DECORATION)
				: (this.showFoldingHighlights ? FoldingDecorationProvider.COLLAPSED_HIGHLIGHTED_VISUAL_DECORATION : FoldingDecorationProvider.COLLAPSED_VISUAL_DECORATION));
		} else if (this.showFoldingControls === 'mouseover') {
			return isManual ? FoldingDecorationProvider.MANUALLY_EXPANDED_AUTO_HIDE_VISUAL_DECORATION : FoldingDecorationProvider.EXPANDED_AUTO_HIDE_VISUAL_DECORATION;
		} else {
			return isManual ? FoldingDecorationProvider.MANUALLY_EXPANDED_VISUAL_DECORATION : FoldingDecorationProvider.EXPANDED_VISUAL_DECORATION;
		}
	}

	private addCollapsedText(collapsedText: string, decorationOption: IModelDecorationOptions): IModelDecorationOptions {
		const before: InjectedTextOptions = {
			content: this.fixSpace(collapsedText),
			inlineClassName: 'collapsed-text',
			inlineClassNameAffectsLetterSpacing: true,
			cursorStops: InjectedTextCursorStops.None
		};
		return ModelDecorationOptions.register({ ...decorationOption, before });
	}

	// Prevents the view from potentially visible whitespace
	private fixSpace(str: string): string {
		const noBreakWhitespace = '\xa0';
		return str.replace(/[ \t]/g, noBreakWhitespace);
	}

	changeDecorations<T>(callback: (changeAccessor: IModelDecorationsChangeAccessor) => T): T {
		return this.editor.changeDecorations(callback);
	}

	removeDecorations(decorationIds: string[]): void {
		this.editor.removeDecorations(decorationIds);
	}
}
