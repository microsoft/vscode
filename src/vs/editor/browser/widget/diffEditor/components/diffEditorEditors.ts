/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IReader, autorunHandleChanges, derived, derivedOpts, observableFromEvent } from '../../../../../base/common/observable.js';
import { IEditorConstructionOptions } from '../../../config/editorConfiguration.js';
import { IDiffEditorConstructionOptions } from '../../../editorBrowser.js';
import { observableCodeEditor } from '../../../observableCodeEditor.js';
import { CodeEditorWidget, ICodeEditorWidgetOptions } from '../../codeEditor/codeEditorWidget.js';
import { IDiffCodeEditorWidgetOptions } from '../diffEditorWidget.js';
import { OverviewRulerFeature } from '../features/overviewRulerFeature.js';
import { EditorOptions, IEditorOptions } from '../../../../common/config/editorOptions.js';
import { Position } from '../../../../common/core/position.js';
import { IContentSizeChangedEvent } from '../../../../common/editorCommon.js';
import { localize } from '../../../../../nls.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { DiffEditorOptions } from '../diffEditorOptions.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';

export class DiffEditorEditors extends Disposable {
	public readonly original;
	public readonly modified;

	private readonly _onDidContentSizeChange;
	public get onDidContentSizeChange() { return this._onDidContentSizeChange.event; }

	public readonly modifiedScrollTop;
	public readonly modifiedScrollHeight;

	public readonly modifiedObs;
	public readonly originalObs;

	public readonly modifiedModel;

	public readonly modifiedSelections;
	public readonly modifiedCursor;

	public readonly originalCursor;

	public readonly isOriginalFocused;
	public readonly isModifiedFocused;

	public readonly isFocused;

	constructor(
		private readonly originalEditorElement: HTMLElement,
		private readonly modifiedEditorElement: HTMLElement,
		private readonly _options: DiffEditorOptions,
		private _argCodeEditorWidgetOptions: IDiffCodeEditorWidgetOptions,
		private readonly _createInnerEditor: (instantiationService: IInstantiationService, container: HTMLElement, options: Readonly<IEditorOptions>, editorWidgetOptions: ICodeEditorWidgetOptions) => CodeEditorWidget,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService
	) {
		super();
		this.original = this._register(this._createLeftHandSideEditor(this._options.editorOptions.get(), this._argCodeEditorWidgetOptions.originalEditor || {}));
		this.modified = this._register(this._createRightHandSideEditor(this._options.editorOptions.get(), this._argCodeEditorWidgetOptions.modifiedEditor || {}));
		this._onDidContentSizeChange = this._register(new Emitter<IContentSizeChangedEvent>());
		this.modifiedScrollTop = observableFromEvent(this, this.modified.onDidScrollChange, () => /** @description modified.getScrollTop */ this.modified.getScrollTop());
		this.modifiedScrollHeight = observableFromEvent(this, this.modified.onDidScrollChange, () => /** @description modified.getScrollHeight */ this.modified.getScrollHeight());
		this.modifiedObs = observableCodeEditor(this.modified);
		this.originalObs = observableCodeEditor(this.original);
		this.modifiedModel = this.modifiedObs.model;
		this.modifiedSelections = observableFromEvent(this, this.modified.onDidChangeCursorSelection, () => this.modified.getSelections() ?? []);
		this.modifiedCursor = derivedOpts({ owner: this, equalsFn: Position.equals }, reader => this.modifiedSelections.read(reader)[0]?.getPosition() ?? new Position(1, 1));
		this.originalCursor = observableFromEvent(this, this.original.onDidChangeCursorPosition, () => this.original.getPosition() ?? new Position(1, 1));
		this.isOriginalFocused = observableCodeEditor(this.original).isFocused;
		this.isModifiedFocused = observableCodeEditor(this.modified).isFocused;
		this.isFocused = derived(this, reader => this.isOriginalFocused.read(reader) || this.isModifiedFocused.read(reader));

		// eslint-disable-next-line local/code-no-any-casts, @typescript-eslint/no-explicit-any
		this._argCodeEditorWidgetOptions = null as any;

		this._register(autorunHandleChanges({
			changeTracker: {
				createChangeSummary: (): IDiffEditorConstructionOptions => ({}),
				handleChange: (ctx, changeSummary) => {
					if (ctx.didChange(_options.editorOptions)) {
						Object.assign(changeSummary, ctx.change.changedOptions);
					}
					return true;
				}
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

		const isInDiffLeftEditorKey = this._contextKeyService.createKey<boolean>('isInDiffLeftEditor', editor.hasWidgetFocus());
		this._register(editor.onDidFocusEditorWidget(() => isInDiffLeftEditorKey.set(true)));
		this._register(editor.onDidBlurEditorWidget(() => isInDiffLeftEditorKey.set(false)));

		return editor;
	}

	private _createRightHandSideEditor(options: Readonly<IDiffEditorConstructionOptions>, codeEditorWidgetOptions: ICodeEditorWidgetOptions): CodeEditorWidget {
		const rightHandSideOptions = this._adjustOptionsForRightHandSide(undefined, options);
		const editor = this._constructInnerEditor(this._instantiationService, this.modifiedEditorElement, rightHandSideOptions, codeEditorWidgetOptions);

		const isInDiffRightEditorKey = this._contextKeyService.createKey<boolean>('isInDiffRightEditor', editor.hasWidgetFocus());
		this._register(editor.onDidFocusEditorWidget(() => isInDiffRightEditorKey.set(true)));
		this._register(editor.onDidBlurEditorWidget(() => isInDiffRightEditorKey.set(false)));

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
		clonedOptions.allowVariableLineHeights = false;
		clonedOptions.allowVariableFonts = false;
		clonedOptions.allowVariableFontsInAccessibilityMode = false;

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
