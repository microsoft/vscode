/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IObservable, IObservableWithChange, ISettableObservable, derived, derivedConstOnceDefined, observableFromEvent, observableValue } from '../../../../base/common/observable.js';
import { Constants } from '../../../../base/common/uint.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { diffEditorDefaultOptions } from '../../../common/config/diffEditor.js';
import { IDiffEditorBaseOptions, IDiffEditorOptions, IEditorOptions, ValidDiffEditorBaseOptions, clampedFloat, clampedInt, boolean as validateBooleanOption, stringSet as validateStringSetOption } from '../../../common/config/editorOptions.js';
import { LineRangeMapping } from '../../../common/diff/rangeMapping.js';
import { allowsTrueInlineDiffRendering } from './components/diffEditorViewZones/diffEditorViewZones.js';
import { DiffEditorViewModel, DiffState } from './diffEditorViewModel.js';

export class DiffEditorOptions {
	private readonly _options: ISettableObservable<IEditorOptions & Required<IDiffEditorBaseOptions>, { changedOptions: IDiffEditorOptions }>;

	public get editorOptions(): IObservableWithChange<IEditorOptions, { changedOptions: IEditorOptions }> { return this._options; }

	private readonly _diffEditorWidth;

	private readonly _screenReaderMode;

	constructor(
		options: Readonly<IDiffEditorOptions>,
		@IAccessibilityService private readonly _accessibilityService: IAccessibilityService,
	) {
		this._diffEditorWidth = observableValue<number>(this, 0);
		this._screenReaderMode = observableFromEvent(this, this._accessibilityService.onDidChangeScreenReaderOptimized, () => this._accessibilityService.isScreenReaderOptimized());
		this.couldShowInlineViewBecauseOfSize = derived(this, reader =>
			this._options.read(reader).renderSideBySide && this._diffEditorWidth.read(reader) <= this._options.read(reader).renderSideBySideInlineBreakpoint
		);
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
			if (!this._options.read(reader).renderMarginRevertIcon) { return false; }
			if (!this.renderSideBySide.read(reader)) { return false; }
			if (this.readOnly.read(reader)) { return false; }
			if (this.shouldRenderGutterMenu.read(reader)) { return false; }
			return true;
		});
		this.shouldRenderGutterMenu = derived(this, reader => this._options.read(reader).renderGutterMenu);
		this.renderIndicators = derived(this, reader => this._options.read(reader).renderIndicators);
		this.enableSplitViewResizing = derived(this, reader => this._options.read(reader).enableSplitViewResizing);
		this.splitViewDefaultRatio = derived(this, reader => this._options.read(reader).splitViewDefaultRatio);
		this.ignoreTrimWhitespace = derived(this, reader => this._options.read(reader).ignoreTrimWhitespace);
		this.maxComputationTimeMs = derived(this, reader => this._options.read(reader).maxComputationTime);
		this.showMoves = derived(this, reader => this._options.read(reader).experimental.showMoves! && this.renderSideBySide.read(reader));
		this.isInEmbeddedEditor = derived(this, reader => this._options.read(reader).isInEmbeddedEditor);
		this.diffWordWrap = derived(this, reader => this._options.read(reader).diffWordWrap);
		this.originalEditable = derived(this, reader => this._options.read(reader).originalEditable);
		this.diffCodeLens = derived(this, reader => this._options.read(reader).diffCodeLens);
		this.accessibilityVerbose = derived(this, reader => this._options.read(reader).accessibilityVerbose);
		this.diffAlgorithm = derived(this, reader => this._options.read(reader).diffAlgorithm);
		this.showEmptyDecorations = derived(this, reader => this._options.read(reader).experimental.showEmptyDecorations!);
		this.onlyShowAccessibleDiffViewer = derived(this, reader => this._options.read(reader).onlyShowAccessibleDiffViewer);
		this.compactMode = derived(this, reader => this._options.read(reader).compactMode);
		this.trueInlineDiffRenderingEnabled = derived(this, reader =>
			this._options.read(reader).experimental.useTrueInlineView!
		);
		this.useTrueInlineDiffRendering = derived(this, reader =>
			!this.renderSideBySide.read(reader) && this.trueInlineDiffRenderingEnabled.read(reader)
		);
		this.hideUnchangedRegions = derived(this, reader => this._options.read(reader).hideUnchangedRegions.enabled!);
		this.hideUnchangedRegionsRevealLineCount = derived(this, reader => this._options.read(reader).hideUnchangedRegions.revealLineCount!);
		this.hideUnchangedRegionsContextLineCount = derived(this, reader => this._options.read(reader).hideUnchangedRegions.contextLineCount!);
		this.hideUnchangedRegionsMinimumLineCount = derived(this, reader => this._options.read(reader).hideUnchangedRegions.minimumLineCount!);
		this._model = observableValue<DiffEditorViewModel | undefined>(this, undefined);
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

	public readonly couldShowInlineViewBecauseOfSize;

	public readonly renderOverviewRuler;
	public readonly renderSideBySide;
	public readonly readOnly;

	public readonly shouldRenderOldRevertArrows;

	public readonly shouldRenderGutterMenu;
	public readonly renderIndicators;
	public readonly enableSplitViewResizing;
	public readonly splitViewDefaultRatio;
	public readonly ignoreTrimWhitespace;
	public readonly maxComputationTimeMs;
	public readonly showMoves;
	public readonly isInEmbeddedEditor;
	public readonly diffWordWrap;
	public readonly originalEditable;
	public readonly diffCodeLens;
	public readonly accessibilityVerbose;
	public readonly diffAlgorithm;
	public readonly showEmptyDecorations;
	public readonly onlyShowAccessibleDiffViewer;
	public readonly compactMode;
	private readonly trueInlineDiffRenderingEnabled: IObservable<boolean>;

	public readonly useTrueInlineDiffRendering: IObservable<boolean>;

	public readonly hideUnchangedRegions;
	public readonly hideUnchangedRegionsRevealLineCount;
	public readonly hideUnchangedRegionsContextLineCount;
	public readonly hideUnchangedRegionsMinimumLineCount;

	public updateOptions(changedOptions: IDiffEditorOptions): void {
		const newDiffEditorOptions = validateDiffEditorOptions(changedOptions, this._options.get());
		const newOptions = { ...this._options.get(), ...changedOptions, ...newDiffEditorOptions };
		this._options.set(newOptions, undefined, { changedOptions: changedOptions });
	}

	public setWidth(width: number): void {
		this._diffEditorWidth.set(width, undefined);
	}

	private readonly _model;

	public setModel(model: DiffEditorViewModel | undefined) {
		this._model.set(model, undefined);
	}

	private readonly shouldRenderInlineViewInSmartMode;

	public readonly inlineViewHideOriginalLineNumbers;
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
			// eslint-disable-next-line local/code-no-any-casts, @typescript-eslint/no-explicit-any
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
