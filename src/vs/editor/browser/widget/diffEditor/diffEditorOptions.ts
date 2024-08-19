/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IObservable, ISettableObservable, derived, observableFromEvent, observableValue } from 'vs/base/common/observable';
import { derivedConstOnceDefined } from 'vs/base/common/observableInternal/utils';
import { Constants } from 'vs/base/common/uint';
import { allowsTrueInlineDiffRendering } from 'vs/editor/browser/widget/diffEditor/components/diffEditorViewZones/diffEditorViewZones';
import { DiffEditorViewModel, DiffState } from 'vs/editor/browser/widget/diffEditor/diffEditorViewModel';
import { diffEditorDefaultOptions } from 'vs/editor/common/config/diffEditor';
import { IDiffEditorBaseOptions, IDiffEditorOptions, IEditorOptions, ValidDiffEditorBaseOptions, clampedFloat, clampedInt, boolean as validateBooleanOption, stringSet as validateStringSetOption } from 'vs/editor/common/config/editorOptions';
import { LineRangeMapping } from 'vs/editor/common/diff/rangeMapping';
import { IAccessibilityService } from 'vs/platform/accessibility/common/accessibility';

export class DiffEditorOptions {
	private readonly _options: ISettableObservable<IEditorOptions & Required<IDiffEditorBaseOptions>, { changedOptions: IDiffEditorOptions }>;

	public get editorOptions(): IObservable<IEditorOptions, { changedOptions: IEditorOptions }> { return this._options; }

	private readonly _diffEditorWidth = observableValue<number>(this, 0);

	private readonly _screenReaderMode = observableFromEvent(this, this._accessibilityService.onDidChangeScreenReaderOptimized, () => this._accessibilityService.isScreenReaderOptimized());

	constructor(
		options: Readonly<IDiffEditorOptions>,
		@IAccessibilityService private readonly _accessibilityService: IAccessibilityService,
	) {
		const optionsCopy = { ...options, ...validateDiffEditorOptions(options, diffEditorDefaultOptions) };
		this._options = observableValue(this, optionsCopy);
	}

	public readonly couldShowInlineViewBecauseOfSize = derived(this, reader =>
		this._options.read(reader).renderSideBySide && this._diffEditorWidth.read(reader) <= this._options.read(reader).renderSideBySideInlineBreakpoint
	);

	public readonly renderOverviewRuler = derived(this, reader => this._options.read(reader).renderOverviewRuler);
	public readonly renderSideBySide = derived(this, reader => {
		if (this.compactMode.read(reader)) {
			if (this.shouldRenderInlineViewInSmartMode.read(reader)) {
				return false;
			}
		}

		return this._options.read(reader).renderSideBySide
			&& !(this._options.read(reader).useInlineViewWhenSpaceIsLimited && this.couldShowInlineViewBecauseOfSize.read(reader) && !this._screenReaderMode.read(reader));
	});
	public readonly readOnly = derived(this, reader => this._options.read(reader).readOnly);

	public readonly shouldRenderOldRevertArrows = derived(this, reader => {
		if (!this._options.read(reader).renderMarginRevertIcon) { return false; }
		if (!this.renderSideBySide.read(reader)) { return false; }
		if (this.readOnly.read(reader)) { return false; }
		if (this.shouldRenderGutterMenu.read(reader)) { return false; }
		return true;
	});

	public readonly shouldRenderGutterMenu = derived(this, reader => this._options.read(reader).renderGutterMenu);
	public readonly renderIndicators = derived(this, reader => this._options.read(reader).renderIndicators);
	public readonly enableSplitViewResizing = derived(this, reader => this._options.read(reader).enableSplitViewResizing);
	public readonly splitViewDefaultRatio = derived(this, reader => this._options.read(reader).splitViewDefaultRatio);
	public readonly ignoreTrimWhitespace = derived(this, reader => this._options.read(reader).ignoreTrimWhitespace);
	public readonly maxComputationTimeMs = derived(this, reader => this._options.read(reader).maxComputationTime);
	public readonly showMoves = derived(this, reader => this._options.read(reader).experimental.showMoves! && this.renderSideBySide.read(reader));
	public readonly isInEmbeddedEditor = derived(this, reader => this._options.read(reader).isInEmbeddedEditor);
	public readonly diffWordWrap = derived(this, reader => this._options.read(reader).diffWordWrap);
	public readonly originalEditable = derived(this, reader => this._options.read(reader).originalEditable);
	public readonly diffCodeLens = derived(this, reader => this._options.read(reader).diffCodeLens);
	public readonly accessibilityVerbose = derived(this, reader => this._options.read(reader).accessibilityVerbose);
	public readonly diffAlgorithm = derived(this, reader => this._options.read(reader).diffAlgorithm);
	public readonly showEmptyDecorations = derived(this, reader => this._options.read(reader).experimental.showEmptyDecorations!);
	public readonly onlyShowAccessibleDiffViewer = derived(this, reader => this._options.read(reader).onlyShowAccessibleDiffViewer);
	public readonly compactMode = derived(this, reader => this._options.read(reader).compactMode);
	private readonly trueInlineDiffRenderingEnabled: IObservable<boolean> = derived(this, reader =>
		this._options.read(reader).experimental.useTrueInlineView!
	);

	public readonly useTrueInlineDiffRendering: IObservable<boolean> = derived(this, reader =>
		!this.renderSideBySide.read(reader) && this.trueInlineDiffRenderingEnabled.read(reader)
	);

	public readonly hideUnchangedRegions = derived(this, reader => this._options.read(reader).hideUnchangedRegions.enabled!);
	public readonly hideUnchangedRegionsRevealLineCount = derived(this, reader => this._options.read(reader).hideUnchangedRegions.revealLineCount!);
	public readonly hideUnchangedRegionsContextLineCount = derived(this, reader => this._options.read(reader).hideUnchangedRegions.contextLineCount!);
	public readonly hideUnchangedRegionsMinimumLineCount = derived(this, reader => this._options.read(reader).hideUnchangedRegions.minimumLineCount!);

	public updateOptions(changedOptions: IDiffEditorOptions): void {
		const newDiffEditorOptions = validateDiffEditorOptions(changedOptions, this._options.get());
		const newOptions = { ...this._options.get(), ...changedOptions, ...newDiffEditorOptions };
		this._options.set(newOptions, undefined, { changedOptions: changedOptions });
	}

	public setWidth(width: number): void {
		this._diffEditorWidth.set(width, undefined);
	}

	private readonly _model = observableValue<DiffEditorViewModel | undefined>(this, undefined);

	public setModel(model: DiffEditorViewModel | undefined) {
		this._model.set(model, undefined);
	}

	private readonly shouldRenderInlineViewInSmartMode = this._model
		.map(this, model => derivedConstOnceDefined(this, reader => {
			const diffs = model?.diff.read(reader);
			return diffs ? isSimpleDiff(diffs, this.trueInlineDiffRenderingEnabled.read(reader)) : undefined;
		}))
		.flatten()
		.map(this, v => !!v);

	public readonly inlineViewHideOriginalLineNumbers = this.compactMode;
}

function isSimpleDiff(diff: DiffState, supportsTrueDiffRendering: boolean): boolean {
	return diff.mappings.every(m => isInsertion(m.lineRangeMapping) || isDeletion(m.lineRangeMapping) || (supportsTrueDiffRendering && allowsTrueInlineDiffRendering(m.lineRangeMapping)));
}

function isInsertion(mapping: LineRangeMapping): boolean {
	return mapping.original.length === 0;
}

function isDeletion(mapping: LineRangeMapping): boolean {
	return mapping.modified.length === 0;
}

function validateDiffEditorOptions(options: Readonly<IDiffEditorOptions>, defaults: typeof diffEditorDefaultOptions | ValidDiffEditorBaseOptions): ValidDiffEditorBaseOptions {
	return {
		enableSplitViewResizing: validateBooleanOption(options.enableSplitViewResizing, defaults.enableSplitViewResizing),
		splitViewDefaultRatio: clampedFloat(options.splitViewDefaultRatio, 0.5, 0.1, 0.9),
		renderSideBySide: validateBooleanOption(options.renderSideBySide, defaults.renderSideBySide),
		renderMarginRevertIcon: validateBooleanOption(options.renderMarginRevertIcon, defaults.renderMarginRevertIcon),
		maxComputationTime: clampedInt(options.maxComputationTime, defaults.maxComputationTime, 0, Constants.MAX_SAFE_SMALL_INTEGER),
		maxFileSize: clampedInt(options.maxFileSize, defaults.maxFileSize, 0, Constants.MAX_SAFE_SMALL_INTEGER),
		ignoreTrimWhitespace: validateBooleanOption(options.ignoreTrimWhitespace, defaults.ignoreTrimWhitespace),
		renderIndicators: validateBooleanOption(options.renderIndicators, defaults.renderIndicators),
		originalEditable: validateBooleanOption(options.originalEditable, defaults.originalEditable),
		diffCodeLens: validateBooleanOption(options.diffCodeLens, defaults.diffCodeLens),
		renderOverviewRuler: validateBooleanOption(options.renderOverviewRuler, defaults.renderOverviewRuler),
		diffWordWrap: validateStringSetOption<'off' | 'on' | 'inherit'>(options.diffWordWrap, defaults.diffWordWrap, ['off', 'on', 'inherit']),
		diffAlgorithm: validateStringSetOption(options.diffAlgorithm, defaults.diffAlgorithm, ['legacy', 'advanced'], { 'smart': 'legacy', 'experimental': 'advanced' }),
		accessibilityVerbose: validateBooleanOption(options.accessibilityVerbose, defaults.accessibilityVerbose),
		experimental: {
			showMoves: validateBooleanOption(options.experimental?.showMoves, defaults.experimental.showMoves!),
			showEmptyDecorations: validateBooleanOption(options.experimental?.showEmptyDecorations, defaults.experimental.showEmptyDecorations!),
			useTrueInlineView: validateBooleanOption(options.experimental?.useTrueInlineView, defaults.experimental.useTrueInlineView!),
		},
		hideUnchangedRegions: {
			enabled: validateBooleanOption(options.hideUnchangedRegions?.enabled ?? (options.experimental as any)?.collapseUnchangedRegions, defaults.hideUnchangedRegions.enabled!),
			contextLineCount: clampedInt(options.hideUnchangedRegions?.contextLineCount, defaults.hideUnchangedRegions.contextLineCount!, 0, Constants.MAX_SAFE_SMALL_INTEGER),
			minimumLineCount: clampedInt(options.hideUnchangedRegions?.minimumLineCount, defaults.hideUnchangedRegions.minimumLineCount!, 0, Constants.MAX_SAFE_SMALL_INTEGER),
			revealLineCount: clampedInt(options.hideUnchangedRegions?.revealLineCount, defaults.hideUnchangedRegions.revealLineCount!, 0, Constants.MAX_SAFE_SMALL_INTEGER),
		},
		isInEmbeddedEditor: validateBooleanOption(options.isInEmbeddedEditor, defaults.isInEmbeddedEditor),
		onlyShowAccessibleDiffViewer: validateBooleanOption(options.onlyShowAccessibleDiffViewer, defaults.onlyShowAccessibleDiffViewer),
		renderSideBySideInlineBreakpoint: clampedInt(options.renderSideBySideInlineBreakpoint, defaults.renderSideBySideInlineBreakpoint, 0, Constants.MAX_SAFE_SMALL_INTEGER),
		useInlineViewWhenSpaceIsLimited: validateBooleanOption(options.useInlineViewWhenSpaceIsLimited, defaults.useInlineViewWhenSpaceIsLimited),
		renderGutterMenu: validateBooleanOption(options.renderGutterMenu, defaults.renderGutterMenu),
		compactMode: validateBooleanOption(options.compactMode, defaults.compactMode),
	};
}
