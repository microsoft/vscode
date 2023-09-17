/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IObservable, ISettableObservable, derived, observableValue } from 'vs/base/common/observable';
import { Constants } from 'vs/base/common/uint';
import { IDiffEditorConstructionOptions } from 'vs/editor/browser/editorBrowser';
import { IDiffEditorBaseOptions, IDiffEditorOptions, IEditorOptions, ValidDiffEditorBaseOptions, clampedFloat, clampedInt, boolean as validateBooleanOption, stringSet as validateStringSetOption } from 'vs/editor/common/config/editorOptions';

export class DiffEditorOptions {

	private readonly _options: ISettableObservable<IEditorOptions & Required<IDiffEditorBaseOptions>, { changedOptions: IDiffEditorOptions }>;

	public get editorOptions(): IObservable<IEditorOptions, { changedOptions: IEditorOptions }> { return this._options; }

	constructor(options: Readonly<IDiffEditorConstructionOptions>, private readonly diffEditorWidth: IObservable<number>) {
		const optionsCopy = { ...options, ...validateDiffEditorOptions(options, diffEditorDefaultOptions) };
		this._options = observableValue('options', optionsCopy);
	}

	public readonly couldShowInlineViewBecauseOfSize = derived(reader => /** @description couldShowInlineViewBecauseOfSize */ this._options.read(reader).renderSideBySide && this.diffEditorWidth.read(reader) <= this._options.read(reader).renderSideBySideInlineBreakpoint
	);

	public readonly renderOverviewRuler = derived(reader => /** @description renderOverviewRuler */ this._options.read(reader).renderOverviewRuler);
	public readonly renderSideBySide = derived(reader => /** @description renderSideBySide */ this._options.read(reader).renderSideBySide
		&& !(this._options.read(reader).useInlineViewWhenSpaceIsLimited && this.couldShowInlineViewBecauseOfSize.read(reader))
	);
	public readonly readOnly = derived(reader => /** @description readOnly */ this._options.read(reader).readOnly);

	public readonly shouldRenderRevertArrows = derived(reader => {
		/** @description shouldRenderRevertArrows */
		if (!this._options.read(reader).renderMarginRevertIcon) { return false; }
		if (!this.renderSideBySide.read(reader)) { return false; }
		if (this.readOnly.read(reader)) { return false; }
		return true;
	});
	public readonly renderIndicators = derived(reader => /** @description renderIndicators */ this._options.read(reader).renderIndicators);
	public readonly enableSplitViewResizing = derived(reader => /** @description enableSplitViewResizing */ this._options.read(reader).enableSplitViewResizing);
	public readonly collapseUnchangedRegions = derived(reader => /** @description hideUnchangedRegions */ this._options.read(reader).experimental.collapseUnchangedRegions!);
	public readonly splitViewDefaultRatio = derived(reader => /** @description splitViewDefaultRatio */ this._options.read(reader).splitViewDefaultRatio);
	public readonly ignoreTrimWhitespace = derived(reader => /** @description ignoreTrimWhitespace */ this._options.read(reader).ignoreTrimWhitespace);
	public readonly maxComputationTimeMs = derived(reader => /** @description maxComputationTime */ this._options.read(reader).maxComputationTime);
	public readonly showMoves = derived(reader => {
		/** @description showMoves */
		const o = this._options.read(reader);
		return o.experimental.showMoves! && o.renderSideBySide;
	});
	public readonly isInEmbeddedEditor = derived(reader => /** @description isInEmbeddedEditor */ this._options.read(reader).isInEmbeddedEditor);
	public readonly diffWordWrap = derived(reader => /** @description diffWordWrap */ this._options.read(reader).diffWordWrap);
	public readonly originalEditable = derived(reader => /** @description originalEditable */ this._options.read(reader).originalEditable);
	public readonly diffCodeLens = derived(reader => /** @description diffCodeLens */ this._options.read(reader).diffCodeLens);
	public readonly accessibilityVerbose = derived(reader => /** @description accessibilityVerbose */ this._options.read(reader).accessibilityVerbose);
	public readonly diffAlgorithm = derived(reader => /** @description diffAlgorithm */ this._options.read(reader).diffAlgorithm);
	public readonly showEmptyDecorations = derived(reader => /** @description showEmptyDecorations */ this._options.read(reader).experimental.showEmptyDecorations!);
	public readonly onlyShowAccessibleDiffViewer = derived(reader => /** @description onlyShowAccessibleDiffViewer */ this._options.read(reader).onlyShowAccessibleDiffViewer);

	public updateOptions(changedOptions: IDiffEditorOptions): void {
		const newDiffEditorOptions = validateDiffEditorOptions(changedOptions, this._options.get());
		const newOptions = { ...this._options.get(), ...changedOptions, ...newDiffEditorOptions };
		this._options.set(newOptions, undefined, { changedOptions: changedOptions });
	}
}

const diffEditorDefaultOptions: ValidDiffEditorBaseOptions = {
	enableSplitViewResizing: true,
	splitViewDefaultRatio: 0.5,
	renderSideBySide: true,
	renderMarginRevertIcon: true,
	maxComputationTime: 5000,
	maxFileSize: 50,
	ignoreTrimWhitespace: true,
	renderIndicators: true,
	originalEditable: false,
	diffCodeLens: false,
	renderOverviewRuler: true,
	diffWordWrap: 'inherit',
	diffAlgorithm: 'advanced',
	accessibilityVerbose: false,
	experimental: {
		collapseUnchangedRegions: false,
		showMoves: false,
		showEmptyDecorations: true,
	},
	isInEmbeddedEditor: false,
	onlyShowAccessibleDiffViewer: false,
	renderSideBySideInlineBreakpoint: 900,
	useInlineViewWhenSpaceIsLimited: true,
};

function validateDiffEditorOptions(options: Readonly<IDiffEditorOptions>, defaults: ValidDiffEditorBaseOptions): ValidDiffEditorBaseOptions {
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
			collapseUnchangedRegions: validateBooleanOption(options.experimental?.collapseUnchangedRegions, defaults.experimental.collapseUnchangedRegions!),
			showMoves: validateBooleanOption(options.experimental?.showMoves, defaults.experimental.showMoves!),
			showEmptyDecorations: validateBooleanOption(options.experimental?.showEmptyDecorations, defaults.experimental.showEmptyDecorations!),
		},
		isInEmbeddedEditor: validateBooleanOption(options.isInEmbeddedEditor, defaults.isInEmbeddedEditor),
		onlyShowAccessibleDiffViewer: validateBooleanOption(options.onlyShowAccessibleDiffViewer, defaults.onlyShowAccessibleDiffViewer),
		renderSideBySideInlineBreakpoint: clampedInt(options.renderSideBySideInlineBreakpoint, defaults.renderSideBySideInlineBreakpoint, 0, Constants.MAX_SAFE_SMALL_INTEGER),
		useInlineViewWhenSpaceIsLimited: validateBooleanOption(options.useInlineViewWhenSpaceIsLimited, defaults.useInlineViewWhenSpaceIsLimited),
	};
}
