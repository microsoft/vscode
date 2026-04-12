/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { derived, derivedConstOnceDefined, observableFromEvent, observableValue } from '../../../../base/common/observable.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { diffEditorDefaultOptions } from '../../../common/config/diffEditor.js';
import { clampedFloat, clampedInt, boolean as validateBooleanOption, stringSet as validateStringSetOption } from '../../../common/config/editorOptions.js';
import { allowsTrueInlineDiffRendering } from './components/diffEditorViewZones/diffEditorViewZones.js';
let DiffEditorOptions = class DiffEditorOptions {
    get editorOptions() { return this._options; }
    constructor(options, _accessibilityService) {
        this._accessibilityService = _accessibilityService;
        this._diffEditorWidth = observableValue(this, 0);
        this._screenReaderMode = observableFromEvent(this, this._accessibilityService.onDidChangeScreenReaderOptimized, () => this._accessibilityService.isScreenReaderOptimized());
        this.couldShowInlineViewBecauseOfSize = derived(this, reader => this._options.read(reader).renderSideBySide && this._diffEditorWidth.read(reader) <= this._options.read(reader).renderSideBySideInlineBreakpoint);
        this.renderOverviewRuler = derived(this, reader => this._options.read(reader).renderOverviewRuler);
        this.renderSideBySide = derived(this, reader => {
            if (this.compactMode.read(reader)) {
                if (this.shouldRenderInlineViewInSmartMode.read(reader)) {
                    return false;
                }
            }
            return this._options.read(reader).renderSideBySide
                && !(this._options.read(reader).useInlineViewWhenSpaceIsLimited && this.couldShowInlineViewBecauseOfSize.read(reader) && !this._screenReaderMode.read(reader));
        });
        this.readOnly = derived(this, reader => this._options.read(reader).readOnly);
        this.shouldRenderOldRevertArrows = derived(this, reader => {
            if (!this._options.read(reader).renderMarginRevertIcon) {
                return false;
            }
            if (!this.renderSideBySide.read(reader)) {
                return false;
            }
            if (this.readOnly.read(reader)) {
                return false;
            }
            if (this.shouldRenderGutterMenu.read(reader)) {
                return false;
            }
            return true;
        });
        this.shouldRenderGutterMenu = derived(this, reader => this._options.read(reader).renderGutterMenu);
        this.renderIndicators = derived(this, reader => this._options.read(reader).renderIndicators);
        this.enableSplitViewResizing = derived(this, reader => this._options.read(reader).enableSplitViewResizing);
        this.splitViewDefaultRatio = derived(this, reader => this._options.read(reader).splitViewDefaultRatio);
        this.ignoreTrimWhitespace = derived(this, reader => this._options.read(reader).ignoreTrimWhitespace);
        this.maxComputationTimeMs = derived(this, reader => this._options.read(reader).maxComputationTime);
        this.showMoves = derived(this, reader => this._options.read(reader).experimental.showMoves && this.renderSideBySide.read(reader));
        this.isInEmbeddedEditor = derived(this, reader => this._options.read(reader).isInEmbeddedEditor);
        this.diffWordWrap = derived(this, reader => this._options.read(reader).diffWordWrap);
        this.originalEditable = derived(this, reader => this._options.read(reader).originalEditable);
        this.diffCodeLens = derived(this, reader => this._options.read(reader).diffCodeLens);
        this.accessibilityVerbose = derived(this, reader => this._options.read(reader).accessibilityVerbose);
        this.diffAlgorithm = derived(this, reader => this._options.read(reader).diffAlgorithm);
        this.showEmptyDecorations = derived(this, reader => this._options.read(reader).experimental.showEmptyDecorations);
        this.onlyShowAccessibleDiffViewer = derived(this, reader => this._options.read(reader).onlyShowAccessibleDiffViewer);
        this.compactMode = derived(this, reader => this._options.read(reader).compactMode);
        this.trueInlineDiffRenderingEnabled = derived(this, reader => this._options.read(reader).experimental.useTrueInlineView);
        this.useTrueInlineDiffRendering = derived(this, reader => !this.renderSideBySide.read(reader) && this.trueInlineDiffRenderingEnabled.read(reader));
        this.hideUnchangedRegions = derived(this, reader => this._options.read(reader).hideUnchangedRegions.enabled);
        this.hideUnchangedRegionsRevealLineCount = derived(this, reader => this._options.read(reader).hideUnchangedRegions.revealLineCount);
        this.hideUnchangedRegionsContextLineCount = derived(this, reader => this._options.read(reader).hideUnchangedRegions.contextLineCount);
        this.hideUnchangedRegionsMinimumLineCount = derived(this, reader => this._options.read(reader).hideUnchangedRegions.minimumLineCount);
        this._model = observableValue(this, undefined);
        this.shouldRenderInlineViewInSmartMode = this._model
            .map(this, model => derivedConstOnceDefined(this, reader => {
            const diffs = model?.diff.read(reader);
            return diffs ? isSimpleDiff(diffs, this.trueInlineDiffRenderingEnabled.read(reader)) : undefined;
        }))
            .flatten()
            .map(this, v => !!v);
        this.inlineViewHideOriginalLineNumbers = this.compactMode;
        const optionsCopy = { ...options, ...validateDiffEditorOptions(options, diffEditorDefaultOptions) };
        this._options = observableValue(this, optionsCopy);
    }
    updateOptions(changedOptions) {
        const newDiffEditorOptions = validateDiffEditorOptions(changedOptions, this._options.get());
        const newOptions = { ...this._options.get(), ...changedOptions, ...newDiffEditorOptions };
        this._options.set(newOptions, undefined, { changedOptions: changedOptions });
    }
    setWidth(width) {
        this._diffEditorWidth.set(width, undefined);
    }
    setModel(model) {
        this._model.set(model, undefined);
    }
};
DiffEditorOptions = __decorate([
    __param(1, IAccessibilityService)
], DiffEditorOptions);
export { DiffEditorOptions };
function isSimpleDiff(diff, supportsTrueDiffRendering) {
    return diff.mappings.every(m => isInsertion(m.lineRangeMapping) || isDeletion(m.lineRangeMapping) || (supportsTrueDiffRendering && allowsTrueInlineDiffRendering(m.lineRangeMapping)));
}
function isInsertion(mapping) {
    return mapping.original.length === 0;
}
function isDeletion(mapping) {
    return mapping.modified.length === 0;
}
function validateDiffEditorOptions(options, defaults) {
    return {
        enableSplitViewResizing: validateBooleanOption(options.enableSplitViewResizing, defaults.enableSplitViewResizing),
        splitViewDefaultRatio: clampedFloat(options.splitViewDefaultRatio, 0.5, 0.1, 0.9),
        renderSideBySide: validateBooleanOption(options.renderSideBySide, defaults.renderSideBySide),
        renderMarginRevertIcon: validateBooleanOption(options.renderMarginRevertIcon, defaults.renderMarginRevertIcon),
        maxComputationTime: clampedInt(options.maxComputationTime, defaults.maxComputationTime, 0, 1073741824 /* Constants.MAX_SAFE_SMALL_INTEGER */),
        maxFileSize: clampedInt(options.maxFileSize, defaults.maxFileSize, 0, 1073741824 /* Constants.MAX_SAFE_SMALL_INTEGER */),
        ignoreTrimWhitespace: validateBooleanOption(options.ignoreTrimWhitespace, defaults.ignoreTrimWhitespace),
        renderIndicators: validateBooleanOption(options.renderIndicators, defaults.renderIndicators),
        originalEditable: validateBooleanOption(options.originalEditable, defaults.originalEditable),
        diffCodeLens: validateBooleanOption(options.diffCodeLens, defaults.diffCodeLens),
        renderOverviewRuler: validateBooleanOption(options.renderOverviewRuler, defaults.renderOverviewRuler),
        diffWordWrap: validateStringSetOption(options.diffWordWrap, defaults.diffWordWrap, ['off', 'on', 'inherit']),
        diffAlgorithm: validateStringSetOption(options.diffAlgorithm, defaults.diffAlgorithm, ['legacy', 'advanced'], { 'smart': 'legacy', 'experimental': 'advanced' }),
        accessibilityVerbose: validateBooleanOption(options.accessibilityVerbose, defaults.accessibilityVerbose),
        experimental: {
            showMoves: validateBooleanOption(options.experimental?.showMoves, defaults.experimental.showMoves),
            showEmptyDecorations: validateBooleanOption(options.experimental?.showEmptyDecorations, defaults.experimental.showEmptyDecorations),
            useTrueInlineView: validateBooleanOption(options.experimental?.useTrueInlineView, defaults.experimental.useTrueInlineView),
        },
        hideUnchangedRegions: {
            // eslint-disable-next-line local/code-no-any-casts, @typescript-eslint/no-explicit-any
            enabled: validateBooleanOption(options.hideUnchangedRegions?.enabled ?? options.experimental?.collapseUnchangedRegions, defaults.hideUnchangedRegions.enabled),
            contextLineCount: clampedInt(options.hideUnchangedRegions?.contextLineCount, defaults.hideUnchangedRegions.contextLineCount, 0, 1073741824 /* Constants.MAX_SAFE_SMALL_INTEGER */),
            minimumLineCount: clampedInt(options.hideUnchangedRegions?.minimumLineCount, defaults.hideUnchangedRegions.minimumLineCount, 0, 1073741824 /* Constants.MAX_SAFE_SMALL_INTEGER */),
            revealLineCount: clampedInt(options.hideUnchangedRegions?.revealLineCount, defaults.hideUnchangedRegions.revealLineCount, 0, 1073741824 /* Constants.MAX_SAFE_SMALL_INTEGER */),
        },
        isInEmbeddedEditor: validateBooleanOption(options.isInEmbeddedEditor, defaults.isInEmbeddedEditor),
        onlyShowAccessibleDiffViewer: validateBooleanOption(options.onlyShowAccessibleDiffViewer, defaults.onlyShowAccessibleDiffViewer),
        renderSideBySideInlineBreakpoint: clampedInt(options.renderSideBySideInlineBreakpoint, defaults.renderSideBySideInlineBreakpoint, 0, 1073741824 /* Constants.MAX_SAFE_SMALL_INTEGER */),
        useInlineViewWhenSpaceIsLimited: validateBooleanOption(options.useInlineViewWhenSpaceIsLimited, defaults.useInlineViewWhenSpaceIsLimited),
        renderGutterMenu: validateBooleanOption(options.renderGutterMenu, defaults.renderGutterMenu),
        compactMode: validateBooleanOption(options.compactMode, defaults.compactMode),
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGlmZkVkaXRvck9wdGlvbnMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvYnJvd3Nlci93aWRnZXQvZGlmZkVkaXRvci9kaWZmRWRpdG9yT3B0aW9ucy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQTJELE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxtQkFBbUIsRUFBRSxlQUFlLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUV4TCxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNuRyxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNoRixPQUFPLEVBQTBGLFlBQVksRUFBRSxVQUFVLEVBQUUsT0FBTyxJQUFJLHFCQUFxQixFQUFFLFNBQVMsSUFBSSx1QkFBdUIsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBRW5QLE9BQU8sRUFBRSw2QkFBNkIsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBR2pHLElBQU0saUJBQWlCLEdBQXZCLE1BQU0saUJBQWlCO0lBRzdCLElBQVcsYUFBYSxLQUFnRixPQUFPLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDO0lBTS9ILFlBQ0MsT0FBcUMsRUFDRyxxQkFBNEM7UUFBNUMsMEJBQXFCLEdBQXJCLHFCQUFxQixDQUF1QjtRQUVwRixJQUFJLENBQUMsZ0JBQWdCLEdBQUcsZUFBZSxDQUFTLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQztRQUN6RCxJQUFJLENBQUMsaUJBQWlCLEdBQUcsbUJBQW1CLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxnQ0FBZ0MsRUFBRSxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMscUJBQXFCLENBQUMsdUJBQXVCLEVBQUUsQ0FBQyxDQUFDO1FBQzVLLElBQUksQ0FB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