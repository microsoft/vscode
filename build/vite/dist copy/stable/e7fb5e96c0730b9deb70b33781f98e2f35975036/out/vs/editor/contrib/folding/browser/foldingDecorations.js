/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Codicon } from '../../../../base/common/codicons.js';
import { ModelDecorationOptions } from '../../../common/model/textModel.js';
import { localize } from '../../../../nls.js';
import { editorSelectionBackground, iconForeground, registerColor, transparent } from '../../../../platform/theme/common/colorRegistry.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { themeColorFromId } from '../../../../platform/theme/common/themeService.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
const foldBackground = registerColor('editor.foldBackground', { light: transparent(editorSelectionBackground, 0.3), dark: transparent(editorSelectionBackground, 0.3), hcDark: null, hcLight: null }, localize('foldBackgroundBackground', "Background color behind folded ranges. The color must not be opaque so as not to hide underlying decorations."), true);
registerColor('editor.foldPlaceholderForeground', { light: '#808080', dark: '#808080', hcDark: null, hcLight: null }, localize('collapsedTextColor', "Color of the collapsed text after the first line of a folded range."));
registerColor('editorGutter.foldingControlForeground', iconForeground, localize('editorGutter.foldingControlForeground', 'Color of the folding control in the editor gutter.'));
export const foldingExpandedIcon = registerIcon('folding-expanded', Codicon.chevronDown, localize('foldingExpandedIcon', 'Icon for expanded ranges in the editor glyph margin.'));
export const foldingCollapsedIcon = registerIcon('folding-collapsed', Codicon.chevronRight, localize('foldingCollapsedIcon', 'Icon for collapsed ranges in the editor glyph margin.'));
export const foldingManualCollapsedIcon = registerIcon('folding-manual-collapsed', foldingCollapsedIcon, localize('foldingManualCollapedIcon', 'Icon for manually collapsed ranges in the editor glyph margin.'));
export const foldingManualExpandedIcon = registerIcon('folding-manual-expanded', foldingExpandedIcon, localize('foldingManualExpandedIcon', 'Icon for manually expanded ranges in the editor glyph margin.'));
const foldedBackgroundMinimap = { color: themeColorFromId(foldBackground), position: 1 /* MinimapPosition.Inline */ };
const collapsed = localize('linesCollapsed', "Click to expand the range.");
const expanded = localize('linesExpanded', "Click to collapse the range.");
export class FoldingDecorationProvider {
    static { this.COLLAPSED_VISUAL_DECORATION = ModelDecorationOptions.register({
        description: 'folding-collapsed-visual-decoration',
        stickiness: 0 /* TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges */,
        afterContentClassName: 'inline-folded',
        isWholeLine: true,
        linesDecorationsTooltip: collapsed,
        firstLineDecorationClassName: ThemeIcon.asClassName(foldingCollapsedIcon),
    }); }
    static { this.COLLAPSED_HIGHLIGHTED_VISUAL_DECORATION = ModelDecorationOptions.register({
        description: 'folding-collapsed-highlighted-visual-decoration',
        stickiness: 0 /* TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges */,
        afterContentClassName: 'inline-folded',
        className: 'folded-background',
        minimap: foldedBackgroundMinimap,
        isWholeLine: true,
        linesDecorationsTooltip: collapsed,
        firstLineDecorationClassName: ThemeIcon.asClassName(foldingCollapsedIcon)
    }); }
    static { this.MANUALLY_COLLAPSED_VISUAL_DECORATION = ModelDecorationOptions.register({
        description: 'folding-manually-collapsed-visual-decoration',
        stickiness: 0 /* TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges */,
        afterContentClassName: 'inline-folded',
        isWholeLine: true,
        linesDecorationsTooltip: collapsed,
        firstLineDecorationClassName: ThemeIcon.asClassName(foldingManualCollapsedIcon)
    }); }
    static { this.MANUALLY_COLLAPSED_HIGHLIGHTED_VISUAL_DECORATION = ModelDecorationOptions.register({
        description: 'folding-manually-collapsed-highlighted-visual-decoration',
        stickiness: 0 /* TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges */,
        afterContentClassName: 'inline-folded',
        className: 'folded-background',
        minimap: foldedBackgroundMinimap,
        isWholeLine: true,
        linesDecorationsTooltip: collapsed,
        firstLineDecorationClassName: ThemeIcon.asClassName(foldingManualCollapsedIcon)
    }); }
    static { this.NO_CONTROLS_COLLAPSED_RANGE_DECORATION = ModelDecorationOptions.register({
        description: 'folding-no-controls-range-decoration',
        stickiness: 0 /* TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges */,
        afterContentClassName: 'inline-folded',
        isWholeLine: true,
        linesDecorationsTooltip: collapsed,
    }); }
    static { this.NO_CONTROLS_COLLAPSED_HIGHLIGHTED_RANGE_DECORATION = ModelDecorationOptions.register({
        description: 'folding-no-controls-range-decoration',
        stickiness: 0 /* TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges */,
        afterContentClassName: 'inline-folded',
        className: 'folded-background',
        minimap: foldedBackgroundMinimap,
        isWholeLine: true,
        linesDecorationsTooltip: collapsed,
    }); }
    static { this.EXPANDED_VISUAL_DECORATION = ModelDecorationOptions.register({
        description: 'folding-expanded-visual-decoration',
        stickiness: 1 /* TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges */,
        isWholeLine: true,
        firstLineDecorationClassName: 'alwaysShowFoldIcons ' + ThemeIcon.asClassName(foldingExpandedIcon),
        linesDecorationsTooltip: expanded,
    }); }
    static { this.EXPANDED_AUTO_HIDE_VISUAL_DECORATION = ModelDecorationOptions.register({
        description: 'folding-expanded-auto-hide-visual-decoration',
        stickiness: 1 /* TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges */,
        isWholeLine: true,
        firstLineDecorationClassName: ThemeIcon.asClassName(foldingExpandedIcon),
        linesDecorationsTooltip: expanded,
    }); }
    static { this.MANUALLY_EXPANDED_VISUAL_DECORATION = ModelDecorationOptions.register({
        description: 'folding-manually-expanded-visual-decoration',
        stickiness: 0 /* TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges */,
        isWholeLine: true,
        firstLineDecorationClassName: 'alwaysShowFoldIcons ' + ThemeIcon.asClassName(foldingManualExpandedIcon),
        linesDecorationsTooltip: expanded,
    }); }
    static { this.MANUALLY_EXPANDED_AUTO_HIDE_VISUAL_DECORATION = ModelDecorationOptions.register({
        description: 'folding-manually-expanded-auto-hide-visual-decoration',
        stickiness: 0 /* TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges */,
        isWholeLine: true,
        firstLineDecorationClassName: ThemeIcon.asClassName(foldingManualExpandedIcon),
        linesDecorationsTooltip: expanded,
    }); }
    static { this.NO_CONTROLS_EXPANDED_RANGE_DECORATION = ModelDecorationOptions.register({
        description: 'folding-no-controls-range-decoration',
        stickiness: 0 /* TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges */,
        isWholeLine: true
    }); }
    static { this.HIDDEN_RANGE_DECORATION = ModelDecorationOptions.register({
        description: 'folding-hidden-range-decoration',
        stickiness: 1 /* TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges */
    }); }
    constructor(editor) {
        this.editor = editor;
        this.showFoldingControls = 'mouseover';
        this.showFoldingHighlights = true;
    }
    getDecorationOption(isCollapsed, isHidden, isManual) {
        if (isHidden) { // is inside another collapsed region
            return FoldingDecorationProvider.HIDDEN_RANGE_DECORATION;
        }
        if (this.showFoldingControls === 'never') {
            if (isCollapsed) {
                return this.showFoldingHighlights ? FoldingDecorationProvider.NO_CONTROLS_COLLAPSED_HIGHLIGHTED_RANGE_DECORATION : FoldingDecorationProvider.NO_CONTROLS_COLLAPSED_RANGE_DECORATION;
            }
            return FoldingDecorationProvider.NO_CONTROLS_EXPANDED_RANGE_DECORATION;
        }
        if (isCollapsed) {
            return isManual ?
                (this.showFoldingHighlights ? FoldingDecorationProvider.MANUALLY_COLLAPSED_HIGHLIGHTED_VISUAL_DECORATION : FoldingDecorationProvider.MANUALLY_COLLAPSED_VISUAL_DECORATION)
                : (this.showFoldingHighlights ? FoldingDecorationProvider.COLLAPSED_HIGHLIGHTED_VISUAL_DECORATION : FoldingDecorationProvider.COLLAPSED_VISUAL_DECORATION);
        }
        else if (this.showFoldingControls === 'mouseover') {
            return isManual ? FoldingDecorationProvider.MANUALLY_EXPANDED_AUTO_HIDE_VISUAL_DECORATION : FoldingDecorationProvider.EXPANDED_AUTO_HIDE_VISUAL_DECORATION;
        }
        else {
            return isManual ? FoldingDecorationProvider.MANUALLY_EXPANDED_VISUAL_DECORATION : FoldingDecorationProvider.EXPANDED_VISUAL_DECORATION;
        }
    }
    changeDecorations(callback) {
        return this.editor.changeDecorations(callback);
    }
    removeDecorations(decorationIds) {
        this.editor.removeDecorations(decorationIds);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZm9sZGluZ0RlY29yYXRpb25zLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbnRyaWIvZm9sZGluZy9icm93c2VyL2ZvbGRpbmdEZWNvcmF0aW9ucy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFHOUQsT0FBTyxFQUFFLHNCQUFzQixFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFFNUUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQzlDLE9BQU8sRUFBRSx5QkFBeUIsRUFBRSxjQUFjLEVBQUUsYUFBYSxFQUFFLFdBQVcsRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FBQzNJLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUNqRixPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUNyRixPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFFakUsTUFBTSxjQUFjLEdBQUcsYUFBYSxDQUFDLHVCQUF1QixFQUFFLEVBQUUsS0FBSyxFQUFFLFdBQVcsQ0FBQyx5QkFBeUIsRUFBRSxHQUFHLENBQUMsRUFBRSxJQUFJLEVBQUUsV0FBVyxDQUFDLHlCQUF5QixFQUFFLEdBQUcsQ0FBQyxFQUFFLE1BQU0sRUFBRSxJQUFJLEVBQUUsT0FBTyxFQUFFLElBQUksRUFBRSxFQUFFLFFBQVEsQ0FBQywwQkFBMEIsRUFBRSwrR0FBK0csQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDO0FBQ25XLGFBQWEsQ0FBQyxrQ0FBa0MsRUFBRSxFQUFFLEtBQUssRUFBRSxTQUFTLEVBQUUsSUFBSSxFQUFFLFNBQVMsRUFBRSxNQUFNLEVBQUUsSUFBSSxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsRUFB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