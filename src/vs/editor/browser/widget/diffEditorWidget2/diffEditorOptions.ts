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

	constructor(options: Readonly<IDiffEditorConstructionOptions>) {
		const optionsCopy = { ...options, ...validateDiffEditorOptions(options, diffEditorDefaultOptions) };
		this._options = observableValue('options', optionsCopy);
	}

	public readonly renderOverviewRuler = derived('renderOverviewRuler', reader => this._options.read(reader).renderOverviewRuler);
	public readonly renderSideBySide = derived('renderSideBySide', reader => this._options.read(reader).renderSideBySide);
	public readonly readOnly = derived('readOnly', reader => this._options.read(reader).readOnly);

	public readonly shouldRenderRevertArrows = derived('shouldRenderRevertArrows', (reader) => {
		if (!this._options.read(reader).renderMarginRevertIcon) { return false; }
		if (!this.renderSideBySide.read(reader)) { return false; }
		if (this.readOnly.read(reader)) { return false; }
		return true;
	});
	public readonly renderIndicators = derived('renderIndicators', reader => this._options.read(reader).renderIndicators);
	public readonly enableSplitViewResizing = derived('enableSplitViewResizing', reader => this._options.read(reader).enableSplitViewResizing);
	public readonly collapseUnchangedRegions = derived('hideUnchangedRegions', reader => this._options.read(reader).experimental.collapseUnchangedRegions!);
	public readonly splitViewDefaultRatio = derived('splitViewDefaultRatio', reader => this._options.read(reader).splitViewDefaultRatio);
	public readonly ignoreTrimWhitespace = derived('ignoreTrimWhitespace', reader => this._options.read(reader).ignoreTrimWhitespace);
	public readonly maxComputationTimeMs = derived('maxComputationTime', reader => this._options.read(reader).maxComputationTime);
	public readonly showMoves = derived('showMoves', reader => {
		const o = this._options.read(reader);
		return o.experimental.showMoves! && o.renderSideBySide;
	});
	public readonly isInEmbeddedEditor = derived('isInEmbeddedEditor', reader => this._options.read(reader).isInEmbeddedEditor);
	public readonly diffWordWrap = derived('diffWordWrap', reader => this._options.read(reader).diffWordWrap);
	public readonly originalEditable = derived('originalEditable', reader => this._options.read(reader).originalEditable);
	public readonly diffCodeLens = derived('diffCodeLens', reader => this._options.read(reader).diffCodeLens);
	public readonly accessibilityVerbose = derived('accessibilityVerbose', reader => this._options.read(reader).accessibilityVerbose);
	public readonly diffAlgorithm = derived('diffAlgorithm', reader => this._options.read(reader).diffAlgorithm);
	public readonly showEmptyDecorations = derived('showEmptyDecorations', reader => this._options.read(reader).experimental.showEmptyDecorations!);

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
	};
}
