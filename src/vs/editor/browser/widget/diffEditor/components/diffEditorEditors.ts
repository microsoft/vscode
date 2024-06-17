/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { IReader, autorunHandleChanges, derived, derivedOpts, observableFromEvent } from 'vs/base/common/observable';
import { IEditorConstructionOptions } from 'vs/editor/browser/config/editorConfiguration';
import { IDiffEditorConstructionOptions } from 'vs/editor/browser/editorBrowser';
import { observableCodeEditor } from 'vs/editor/browser/observableCodeEditor';
import { CodeEditorWidget, ICodeEditorWidgetOptions } from 'vs/editor/browser/widget/codeEditor/codeEditorWidget';
import { IDiffCodeEditorWidgetOptions } from 'vs/editor/browser/widget/diffEditor/diffEditorWidget';
import { OverviewRulerFeature } from 'vs/editor/browser/widget/diffEditor/features/overviewRulerFeature';
import { EditorOptions, IEditorOptions } from 'vs/editor/common/config/editorOptions';
import { Position } from 'vs/editor/common/core/position';
import { IContentSizeChangedEvent } from 'vs/editor/common/editorCommon';
import { localize } from 'vs/nls';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { DiffEditorOptions } from '../diffEditorOptions';

export class DiffEditorEditors extends Disposable {
	public readonly original = this._register(this._createLeftHandSideEditor(this._options.editorOptions.get(), this._argCodeEditorWidgetOptions.originalEditor || {}));
	public readonly modified = this._register(this._createRightHandSideEditor(this._options.editorOptions.get(), this._argCodeEditorWidgetOptions.modifiedEditor || {}));

	private readonly _onDidContentSizeChange = this._register(new Emitter<IContentSizeChangedEvent>());
	public get onDidContentSizeChange() { return this._onDidContentSizeChange.event; }

	public readonly modifiedScrollTop = observableFromEvent(this, this.modified.onDidScrollChange, () => /** @description modified.getScrollTop */ this.modified.getScrollTop());
	public readonly modifiedScrollHeight = observableFromEvent(this, this.modified.onDidScrollChange, () => /** @description modified.getScrollHeight */ this.modified.getScrollHeight());

	public readonly modifiedModel = observableCodeEditor(this.modified).model;

	public readonly modifiedSelections = observableFromEvent(this, this.modified.onDidChangeCursorSelection, () => this.modified.getSelections() ?? []);
	public readonly modifiedCursor = derivedOpts({ owner: this, equalsFn: Position.equals }, reader => this.modifiedSelections.read(reader)[0]?.getPosition() ?? new Position(1, 1));

	public readonly originalCursor = observableFromEvent(this, this.original.onDidChangeCursorPosition, () => this.original.getPosition() ?? new Position(1, 1));

	public readonly isOriginalFocused = observableCodeEditor(this.original).isFocused;
	public readonly isModifiedFocused = observableCodeEditor(this.modified).isFocused;

	public readonly isFocused = derived(this, reader => this.isOriginalFocused.read(reader) || this.isModifiedFocused.read(reader));

	constructor(
		private readonly originalEditorElement: HTMLElement,
		private readonly modifiedEditorElement: HTMLElement,
		private readonly _options: DiffEditorOptions,
		private _argCodeEditorWidgetOptions: IDiffCodeEditorWidgetOptions,
		private readonly _createInnerEditor: (instantiationService: IInstantiationService, container: HTMLElement, options: Readonly<IEditorOptions>, editorWidgetOptions: ICodeEditorWidgetOptions) => CodeEditorWidget,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService
	) {
		super();

		this._argCodeEditorWidgetOptions = null as any;

		this._register(autorunHandleChanges({
			createEmptyChangeSummary: (): IDiffEditorConstructionOptions => ({}),
			handleChange: (ctx, changeSummary) => {
				if (ctx.didChange(_options.editorOptions)) {
					Object.assign(changeSummary, ctx.change.changedOptions);
				}
				return true;
			}
		}, (reader, changeSummary) => {
			/** @description update editor options */
			_options.editorOptions.read(reader);

			this._options.renderSideBySide.read(reader);

			this.modified.updateOptions(this._adjustOptionsForRightHandSide(reader, changeSummary));
			this.original.updateOptions(this._adjustOptionsForLeftHandSide(reader, changeSummary));
		}));
	}

	private _createLeftHandSideEditor(options: Readonly<IDiffEditorConstructionOptions>, codeEditorWidgetOptions: ICodeEditorWidgetOptions): CodeEditorWidget {
		const leftHandSideOptions = this._adjustOptionsForLeftHandSide(undefined, options);
		const editor = this._constructInnerEditor(this._instantiationService, this.originalEditorElement, leftHandSideOptions, codeEditorWidgetOptions);
		editor.setContextValue('isInDiffLeftEditor', true);
		return editor;
	}

	private _createRightHandSideEditor(options: Readonly<IDiffEditorConstructionOptions>, codeEditorWidgetOptions: ICodeEditorWidgetOptions): CodeEditorWidget {
		const rightHandSideOptions = this._adjustOptionsForRightHandSide(undefined, options);
		const editor = this._constructInnerEditor(this._instantiationService, this.modifiedEditorElement, rightHandSideOptions, codeEditorWidgetOptions);
		editor.setContextValue('isInDiffRightEditor', true);
		return editor;
	}

	private _constructInnerEditor(instantiationService: IInstantiationService, container: HTMLElement, options: Readonly<IEditorConstructionOptions>, editorWidgetOptions: ICodeEditorWidgetOptions): CodeEditorWidget {
		const editor = this._createInnerEditor(instantiationService, container, options, editorWidgetOptions);

		this._register(editor.onDidContentSizeChange(e => {
			const width = this.original.getContentWidth() + this.modified.getContentWidth() + OverviewRulerFeature.ENTIRE_DIFF_OVERVIEW_WIDTH;
			const height = Math.max(this.modified.getContentHeight(), this.original.getContentHeight());

			this._onDidContentSizeChange.fire({
				contentHeight: height,
				contentWidth: width,
				contentHeightChanged: e.contentHeightChanged,
				contentWidthChanged: e.contentWidthChanged
			});
		}));
		return editor;
	}

	private _adjustOptionsForLeftHandSide(_reader: IReader | undefined, changedOptions: Readonly<IDiffEditorConstructionOptions>): IEditorConstructionOptions {
		const result = this._adjustOptionsForSubEditor(changedOptions);
		if (!this._options.renderSideBySide.get()) {
			// never wrap hidden editor
			result.wordWrapOverride1 = 'off';
			result.wordWrapOverride2 = 'off';
			result.stickyScroll = { enabled: false };

			// Disable unicode highlighting for the original side in inline mode, as they are not shown anyway.
			result.unicodeHighlight = { nonBasicASCII: false, ambiguousCharacters: false, invisibleCharacters: false };
		} else {
			result.unicodeHighlight = this._options.editorOptions.get().unicodeHighlight || {};
			result.wordWrapOverride1 = this._options.diffWordWrap.get();
		}
		result.glyphMargin = this._options.renderSideBySide.get();

		if (changedOptions.originalAriaLabel) {
			result.ariaLabel = changedOptions.originalAriaLabel;
		}
		result.ariaLabel = this._updateAriaLabel(result.ariaLabel);
		result.readOnly = !this._options.originalEditable.get();
		result.dropIntoEditor = { enabled: !result.readOnly };
		result.extraEditorClassName = 'original-in-monaco-diff-editor';
		return result;
	}

	private _adjustOptionsForRightHandSide(reader: IReader | undefined, changedOptions: Readonly<IDiffEditorConstructionOptions>): IEditorConstructionOptions {
		const result = this._adjustOptionsForSubEditor(changedOptions);
		if (changedOptions.modifiedAriaLabel) {
			result.ariaLabel = changedOptions.modifiedAriaLabel;
		}
		result.ariaLabel = this._updateAriaLabel(result.ariaLabel);
		result.wordWrapOverride1 = this._options.diffWordWrap.get();
		result.revealHorizontalRightPadding = EditorOptions.revealHorizontalRightPadding.defaultValue + OverviewRulerFeature.ENTIRE_DIFF_OVERVIEW_WIDTH;
		result.scrollbar!.verticalHasArrows = false;
		result.extraEditorClassName = 'modified-in-monaco-diff-editor';
		return result;
	}

	private _adjustOptionsForSubEditor(options: Readonly<IDiffEditorConstructionOptions>): IEditorConstructionOptions {
		const clonedOptions = {
			...options,
			dimension: {
				height: 0,
				width: 0
			},
		};
		clonedOptions.inDiffEditor = true;
		clonedOptions.automaticLayout = false;

		// Clone scrollbar options before changing them
		clonedOptions.scrollbar = { ...(clonedOptions.scrollbar || {}) };
		clonedOptions.folding = false;
		clonedOptions.codeLens = this._options.diffCodeLens.get();
		clonedOptions.fixedOverflowWidgets = true;

		// Clone minimap options before changing them
		clonedOptions.minimap = { ...(clonedOptions.minimap || {}) };
		clonedOptions.minimap.enabled = false;

		if (this._options.hideUnchangedRegions.get()) {
			clonedOptions.stickyScroll = { enabled: false };
		} else {
			clonedOptions.stickyScroll = this._options.editorOptions.get().stickyScroll;
		}
		return clonedOptions;
	}

	private _updateAriaLabel(ariaLabel: string | undefined): string | undefined {
		if (!ariaLabel) {
			ariaLabel = '';
		}
		const ariaNavigationTip = localize('diff-aria-navigation-tip', ' use {0} to open the accessibility help.', this._keybindingService.lookupKeybinding('editor.action.accessibilityHelp')?.getAriaLabel());
		if (this._options.accessibilityVerbose.get()) {
			return ariaLabel + ariaNavigationTip;
		} else if (ariaLabel) {
			return ariaLabel.replaceAll(ariaNavigationTip, '');
		}
		return '';
	}
}
