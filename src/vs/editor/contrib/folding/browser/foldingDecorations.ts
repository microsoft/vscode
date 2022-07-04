/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from 'vs/base/common/codicons';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { IModelDecorationsChangeAccessor, TrackedRangeStickiness } from 'vs/editor/common/model';
import { ModelDecorationOptions } from 'vs/editor/common/model/textModel';
import { IDecorationProvider } from 'vs/editor/contrib/folding/browser/foldingModel';
import { localize } from 'vs/nls';
import { registerIcon } from 'vs/platform/theme/common/iconRegistry';
import { ThemeIcon } from 'vs/platform/theme/common/themeService';

export const foldingExpandedIcon = registerIcon('folding-expanded', Codicon.chevronDown, localize('foldingExpandedIcon', 'Icon for expanded ranges in the editor glyph margin.'));
export const foldingCollapsedIcon = registerIcon('folding-collapsed', Codicon.chevronRight, localize('foldingCollapsedIcon', 'Icon for collapsed ranges in the editor glyph margin.'));
export class FoldingDecorationProvider implements IDecorationProvider {

	private static readonly COLLAPSED_VISUAL_DECORATION = ModelDecorationOptions.register({
		description: 'folding-collapsed-visual-decoration',
		stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
		afterContentClassName: 'inline-folded',
		isWholeLine: true,
		firstLineDecorationClassName: ThemeIcon.asClassName(foldingCollapsedIcon)
	});

	private static readonly COLLAPSED_HIGHLIGHTED_VISUAL_DECORATION = ModelDecorationOptions.register({
		description: 'folding-collapsed-highlighted-visual-decoration',
		stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
		afterContentClassName: 'inline-folded',
		className: 'folded-background',
		isWholeLine: true,
		firstLineDecorationClassName: ThemeIcon.asClassName(foldingCollapsedIcon)
	});

	private static readonly EXPANDED_AUTO_HIDE_VISUAL_DECORATION = ModelDecorationOptions.register({
		description: 'folding-expanded-auto-hide-visual-decoration',
		stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
		isWholeLine: true,
		firstLineDecorationClassName: ThemeIcon.asClassName(foldingExpandedIcon)
	});

	private static readonly EXPANDED_VISUAL_DECORATION = ModelDecorationOptions.register({
		description: 'folding-expanded-visual-decoration',
		stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
		isWholeLine: true,
		firstLineDecorationClassName: 'alwaysShowFoldIcons ' + ThemeIcon.asClassName(foldingExpandedIcon)
	});

	private static readonly HIDDEN_RANGE_DECORATION = ModelDecorationOptions.register({
		description: 'folding-hidden-range-decoration',
		stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
	});

	public autoHideFoldingControls: boolean = true;

	public showFoldingHighlights: boolean = true;

	constructor(private readonly editor: ICodeEditor) {
	}

	getDecorationOption(isCollapsed: boolean, isHidden: boolean): ModelDecorationOptions {
		if (isHidden) {
			return FoldingDecorationProvider.HIDDEN_RANGE_DECORATION;
		}
		if (isCollapsed) {
			return this.showFoldingHighlights ? FoldingDecorationProvider.COLLAPSED_HIGHLIGHTED_VISUAL_DECORATION : FoldingDecorationProvider.COLLAPSED_VISUAL_DECORATION;
		} else if (this.autoHideFoldingControls) {
			return FoldingDecorationProvider.EXPANDED_AUTO_HIDE_VISUAL_DECORATION;
		} else {
			return FoldingDecorationProvider.EXPANDED_VISUAL_DECORATION;
		}
	}

	changeDecorations<T>(callback: (changeAccessor: IModelDecorationsChangeAccessor) => T): T {
		return this.editor.changeDecorations(callback);
	}

	removeDecorations(decorationIds: string[]): void {
		this.editor.removeDecorations(decorationIds);
	}
}
