/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { IEditorHoverRenderContext } from 'vs/editor/contrib/hover/browser/hoverTypes';
import { ContentWidgetPositionPreference, ICodeEditor, IContentWidget, IContentWidgetPosition } from 'vs/editor/browser/editorBrowser';
import { PositionAffinity } from 'vs/editor/common/model';
import { Position } from 'vs/editor/common/core/position';
import { StandaloneColorPickerHover, StandaloneColorPickerParticipant } from 'vs/editor/contrib/colorPicker/browser/colorHoverParticipant';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { EditorHoverStatusBar } from 'vs/editor/contrib/hover/browser/contentHover';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { ColorPickerWidget, InsertButton } from 'vs/editor/contrib/colorPicker/browser/colorPickerWidget';
import { Emitter } from 'vs/base/common/event';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { IColorInformation } from 'vs/editor/common/languages';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { EditorContributionInstantiation, registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IRange } from 'vs/editor/common/core/range';
import { IModelService } from 'vs/editor/common/services/model';
import { ILanguageConfigurationService } from 'vs/editor/common/languages/languageConfigurationRegistry';
import { DefaultDocumentColorProvider } from 'vs/editor/contrib/colorPicker/browser/defaultDocumentColorProvider';
import * as dom from 'vs/base/browser/dom';
import 'vs/css!./colorPicker';

export class StandaloneColorPickerController extends Disposable implements IEditorContribution {

	public static ID = 'editor.contrib.standaloneColorPickerController';
	private _standaloneColorPickerWidget: StandaloneColorPickerWidget | null = null;
	private _standaloneColorPickerVisible: IContextKey<boolean>;
	private _standaloneColorPickerFocused: IContextKey<boolean>;

	constructor(
		private readonly _editor: ICodeEditor,
		@IContextKeyService _contextKeyService: IContextKeyService,
		@IModelService private readonly _modelService: IModelService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ILanguageFeaturesService private readonly _languageFeatureService: ILanguageFeaturesService,
		@ILanguageConfigurationService private readonly _languageConfigurationService: ILanguageConfigurationService
	) {
		super();
		this._standaloneColorPickerVisible = EditorContextKeys.standaloneColorPickerVisible.bindTo(_contextKeyService);
		this._standaloneColorPickerFocused = EditorContextKeys.standaloneColorPickerFocused.bindTo(_contextKeyService);
	}

	public showOrFocus() {
		if (!this._editor.hasModel()) {
			return;
		}
		if (!this._standaloneColorPickerVisible.get()) {
			this._standaloneColorPickerWidget = new StandaloneColorPickerWidget(this._editor, this._standaloneColorPickerVisible, this._standaloneColorPickerFocused, this._instantiationService, this._modelService, this._keybindingService, this._languageFeatureService, this._languageConfigurationService);
		} else if (!this._standaloneColorPickerFocused.get()) {
			this._standaloneColorPickerWidget?.focus();
		}
	}

	public hide() {
		this._standaloneColorPickerFocused.set(false);
		this._standaloneColorPickerVisible.set(false);
		this._standaloneColorPickerWidget?.hide();
		this._editor.focus();
	}

	public insertColor() {
		this._standaloneColorPickerWidget?.updateEditor();
		this.hide();
	}

	public static get(editor: ICodeEditor) {
		return editor.getContribution<StandaloneColorPickerController>(StandaloneColorPickerController.ID);
	}
}

registerEditorContribution(StandaloneColorPickerController.ID, StandaloneColorPickerController, EditorContributionInstantiation.AfterFirstRender);

const PADDING = 8;
const CLOSE_BUTTON_WIDTH = 22;

export class StandaloneColorPickerWidget extends Disposable implements IContentWidget {

	static readonly ID = 'editor.contrib.standaloneColorPickerWidget';
	readonly allowEditorOverflow = true;

	private body: HTMLElement = document.createElement('div');

	private readonly _position: Position | undefined = undefined;
	private readonly _standaloneColorPickerParticipant: StandaloneColorPickerParticipant;

	private _colorHover: StandaloneColorPickerHover | null = null;
	private _selectionSetInEditor: boolean = false;

	private readonly _onResult = this._register(new Emitter<StandaloneColorPickerResult>());
	public readonly onResult = this._onResult.event;

	constructor(
		private readonly _editor: ICodeEditor,
		private readonly _standaloneColorPickerVisible: IContextKey<boolean>,
		private readonly _standaloneColorPickerFocused: IContextKey<boolean>,
		@IInstantiationService _instantiationService: IInstantiationService,
		@IModelService private readonly _modelService: IModelService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
		@ILanguageFeaturesService private readonly _languageFeaturesService: ILanguageFeaturesService,
		@ILanguageConfigurationService private readonly _languageConfigurationService: ILanguageConfigurationService
	) {
		super();
		this._standaloneColorPickerVisible.set(true);
		this._standaloneColorPickerParticipant = _instantiationService.createInstance(StandaloneColorPickerParticipant, this._editor);
		this._position = this._editor._getViewModel()?.getPrimaryCursorState().modelState.position;
		const editorSelection = this._editor.getSelection();
		const selection = editorSelection ?
			{
				startLineNumber: editorSelection.startLineNumber,
				startColumn: editorSelection.startColumn,
				endLineNumber: editorSelection.endLineNumber,
				endColumn: editorSelection.endColumn
			} : { startLineNumber: 0, endLineNumber: 0, endColumn: 0, startColumn: 0 };
		const focusTracker = this._register(dom.trackFocus(this.body));
		this._register(focusTracker.onDidBlur(_ => {
			this.hide();
		}));
		this._register(focusTracker.onDidFocus(_ => {
			this.focus();
		}));
		// When the cursor position changes, hide the color picker
		this._register(this._editor.onDidChangeCursorPosition(() => {
			// Do not hide the color picker when the cursor changes position due to the keybindings
			if (!this._selectionSetInEditor) {
				this.hide();
			} else {
				this._selectionSetInEditor = false;
			}
		}));
		this._register(this._editor.onMouseMove((e) => {
			const classList = e.target.element?.classList;
			if (classList && classList.contains('colorpicker-color-decoration')) {
				this.hide();
			}
		}));
		this._register(this.onResult((result) => {
			this._render(result.value, result.foundInEditor);
		}));
		this._start(selection);
		this._editor.addContentWidget(this);
	}

	public updateEditor() {
		if (this._colorHover) {
			this._standaloneColorPickerParticipant.updateEditorModel(this._colorHover);
		}
	}

	public getId(): string {
		return StandaloneColorPickerWidget.ID;
	}

	public getDomNode(): HTMLElement {
		return this.body;
	}

	public getPosition(): IContentWidgetPosition | null {
		if (!this._position) {
			return null;
		}
		const positionPreference = this._editor.getOption(EditorOption.hover).above;
		return {
			position: this._position,
			secondaryPosition: this._position,
			preference: positionPreference ? [ContentWidgetPositionPreference.ABOVE, ContentWidgetPositionPreference.BELOW] : [ContentWidgetPositionPreference.BELOW, ContentWidgetPositionPreference.ABOVE],
			positionAffinity: PositionAffinity.None
		};
	}

	public hide(): void {
		this.dispose();
		this._standaloneColorPickerVisible.set(false);
		this._standaloneColorPickerFocused.set(false);
		this._editor.removeContentWidget(this);
		this._editor.focus();
	}

	public focus(): void {
		this._standaloneColorPickerFocused.set(true);
		this.body.focus();
	}

	private async _start(selection: IRange) {
		const computeAsyncResult = await this._computeAsync(selection);
		if (!computeAsyncResult) {
			return;
		}
		this._onResult.fire(new StandaloneColorPickerResult(computeAsyncResult.result, computeAsyncResult.foundInEditor));
	}

	private async _computeAsync(range: IRange): Promise<{ result: StandaloneColorPickerHover; foundInEditor: boolean } | null> {
		if (!this._editor.hasModel()) {
			return null;
		}
		const colorInfo: IColorInformation = {
			range: range,
			color: { red: 0, green: 0, blue: 0, alpha: 1 }
		};
		const colorHoverResult: { colorHover: StandaloneColorPickerHover; foundInEditor: boolean } | null = await this._standaloneColorPickerParticipant.createColorHover(colorInfo, new DefaultDocumentColorProvider(this._modelService, this._languageConfigurationService), this._languageFeaturesService.colorProvider);
		if (!colorHoverResult) {
			return null;
		}
		return { result: colorHoverResult.colorHover, foundInEditor: colorHoverResult.foundInEditor };
	}

	private _render(colorHover: StandaloneColorPickerHover, foundInEditor: boolean) {
		const fragment = document.createDocumentFragment();
		const statusBar = this._register(new EditorHoverStatusBar(this._keybindingService));
		let colorPickerWidget: ColorPickerWidget | undefined;

		const context: IEditorHoverRenderContext = {
			fragment,
			statusBar,
			setColorPicker: (widget: ColorPickerWidget) => colorPickerWidget = widget,
			onContentsChanged: () => { },
			hide: () => this.hide()
		};

		this._colorHover = colorHover;
		this._register(this._standaloneColorPickerParticipant.renderHoverParts(context, [colorHover]));
		if (colorPickerWidget === undefined) {
			return;
		}
		this.body.classList.add('standalone-colorpicker-body');
		this.body.style.maxHeight = Math.max(this._editor.getLayoutInfo().height / 4, 250) + 'px';
		this.body.style.maxWidth = Math.max(this._editor.getLayoutInfo().width * 0.66, 500) + 'px';
		this.body.tabIndex = 0;
		this.body.appendChild(fragment);
		colorPickerWidget.layout();

		const colorPickerBody = colorPickerWidget.body;
		const saturationBoxWidth = colorPickerBody.saturationBox.domNode.clientWidth;
		const widthOfOriginalColorBox = colorPickerBody.domNode.clientWidth - saturationBoxWidth - CLOSE_BUTTON_WIDTH - PADDING;
		const enterButton: InsertButton | null = colorPickerWidget.body.enterButton;
		enterButton?.onClicked(() => {
			this.updateEditor();
			this.hide();
		});
		const colorPickerHeader = colorPickerWidget.header;
		const pickedColorNode = colorPickerHeader.pickedColorNode;
		pickedColorNode.style.width = saturationBoxWidth + PADDING + 'px';
		const originalColorNode = colorPickerHeader.originalColorNode;
		originalColorNode.style.width = widthOfOriginalColorBox + 'px';
		const closeButton = colorPickerWidget.header.closeButton;
		closeButton?.onClicked(() => {
			this.hide();
		});
		// When found in the editor, highlight the selection in the editor
		if (foundInEditor) {
			if (enterButton) {
				enterButton.button.textContent = 'Replace';
			}
			this._selectionSetInEditor = true;
			this._editor.setSelection(colorHover.range);
		}
		this._editor.layoutContentWidget(this);
	}
}

class StandaloneColorPickerResult {
	// The color picker result consists of: an array of color results and a boolean indicating if the color was found in the editor
	constructor(
		public readonly value: StandaloneColorPickerHover,
		public readonly foundInEditor: boolean
	) { }
}
