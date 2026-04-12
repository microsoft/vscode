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
var StandaloneColorPickerWidget_1;
import '../colorPicker.css';
import { Disposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { EditorHoverStatusBar } from '../../../hover/browser/contentHoverStatusBar.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { Emitter } from '../../../../../base/common/event.js';
import { ILanguageFeaturesService } from '../../../../common/services/languageFeatures.js';
import { DefaultDocumentColorProvider } from '../defaultDocumentColorProvider.js';
import { IEditorWorkerService } from '../../../../common/services/editorWorker.js';
import { StandaloneColorPickerParticipant } from './standaloneColorPickerParticipant.js';
import * as dom from '../../../../../base/browser/dom.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
class StandaloneColorPickerResult {
    // The color picker result consists of: an array of color results and a boolean indicating if the color was found in the editor
    constructor(value, foundInEditor) {
        this.value = value;
        this.foundInEditor = foundInEditor;
    }
}
const PADDING = 8;
const CLOSE_BUTTON_WIDTH = 22;
let StandaloneColorPickerWidget = class StandaloneColorPickerWidget extends Disposable {
    static { StandaloneColorPickerWidget_1 = this; }
    static { this.ID = 'editor.contrib.standaloneColorPickerWidget'; }
    constructor(_editor, _standaloneColorPickerVisible, _standaloneColorPickerFocused, _instantiationService, _keybindingService, _languageFeaturesService, _editorWorkerService, _hoverService) {
        super();
        this._editor = _editor;
        this._standaloneColorPickerVisible = _standaloneColorPickerVisible;
        this._standaloneColorPickerFocused = _standaloneColorPickerFocused;
        this._keybindingService = _keybindingService;
        this._languageFeaturesService = _languageFeaturesService;
        this._editorWorkerService = _editorWorkerService;
        this._hoverService = _hoverService;
        this.allowEditorOverflow = true;
        this._position = undefined;
        this._body = document.createElement('div');
        this._colorHover = null;
        this._selectionSetInEditor = false;
        this._onResult = this._register(new Emitter());
        this.onResult = this._onResult.event;
        this._renderedHoverParts = this._register(new MutableDisposable());
        this._renderedStatusBar = this._register(new MutableDisposable());
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
        const focusTracker = this._register(dom.trackFocus(this._body));
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
            }
            else {
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
        this._body.style.zIndex = '50';
        this._editor.addContentWidget(this);
    }
    updateEditor() {
        if (this._colorHover) {
            this._standaloneColorPickerParticipant.updateEditorModel(this._colorHover);
        }
    }
    getId() {
        return StandaloneColorPickerWidget_1.ID;
    }
    getDomNode() {
        return this._body;
    }
    getPosition() {
        if (!this._position) {
            return null;
        }
        const positionPreference = this._editor.getOption(69 /* EditorOption.hover */).above;
        return {
            position: this._position,
            secondaryPosition: this._position,
            preference: positionPreference ? [1 /* ContentWidgetPositionPreference.ABOVE */, 2 /* ContentWidgetPositionPreference.BELOW */] : [2 /* ContentWidgetPositionPreference.BELOW */, 1 /* ContentWidgetPositionPreference.ABOVE */],
            positionAffinity: 2 /* PositionAffinity.None */
        };
    }
    hide() {
        this.dispose();
        this._standaloneColorPickerVisible.set(false);
        this._standaloneColorPickerFocused.set(false);
        this._editor.removeContentWidget(this);
        this._editor.focus();
    }
    focus() {
        this._standaloneColorPickerFocused.set(true);
        this._body.focus();
    }
    async _start(selection) {
        const computeAsyncResult = await this._computeAsync(selection);
        if (!computeAsyncResult) {
            return;
        }
        this._onResult.fire(new StandaloneColorPickerResult(computeAsyncResult.result, computeAsyncResult.foundInEditor));
    }
    async _computeAsync(range) {
        if (!this._editor.hasModel()) {
            return null;
        }
        const colorInfo = {
            range: range,
            color: { red: 0, green: 0, blue: 0, alpha: 1 }
        };
        const colorHoverResult = await this._standaloneColorPickerParticipant.createColorHover(colorInfo, new DefaultDocumentColorProvider(this._editorWorkerService), this._languageFeaturesService.colorProvider);
        if (!colorHoverResult) {
            return null;
        }
        return { result: colorHoverResult.colorHover, foundInEditor: colorHoverResult.foundInEditor };
    }
    _render(colorHover, foundInEditor) {
        const fragment = document.createDocumentFragment();
        this._renderedStatusBar.value = this._register(new EditorHoverStatusBar(this._keybindingService, this._hoverService));
        const context = {
            fragment,
            statusBar: this._renderedStatusBar.value,
            onContentsChanged: () => { },
            setMinimumDimensions: () => { },
            hide: () => this.hide(),
            focus: () => this.focus()
        };
        this._colorHover = colorHover;
        this._renderedHoverParts.value = this._standaloneColorPickerParticipant.renderHoverParts(context, [colorHover]);
        if (!this._renderedHoverParts.value) {
            this._renderedStatusBar.clear();
            this._renderedHoverParts.clear();
            return;
        }
        const colorPicker = this._renderedHoverParts.value.colorPicker;
        this._body.classList.add('standalone-colorpicker-body');
        this._body.style.maxHeight = Math.max(this._editor.getLayoutInfo().height / 4, 250) + 'px';
        this._body.style.maxWidth = Math.max(this._editor.getLayoutInfo().width * 0.66, 500) + 'px';
        this._body.tabIndex = 0;
        this._body.appendChild(fragment);
        colorPicker.layout();
        const colorPickerBody = colorPicker.body;
        const saturationBoxWidth = colorPickerBody.saturationBox.domNode.clientWidth;
        const widthOfOriginalColorBox = colorPickerBody.domNode.clientWidth - saturationBoxWidth - CLOSE_BUTTON_WIDTH - PADDING;
        const enterButton = colorPicker.body.enterButton;
        enterButton?.onClicked(() => {
            this.updateEditor();
            this.hide();
        });
        const colorPickerHeader = colorPicker.header;
        const pickedColorNode = colorPickerHeader.pickedColorNode;
        pickedColorNode.style.width = saturationBoxWidth + PADDING + 'px';
        const originalColorNode = colorPickerHeader.originalColorNode;
        originalColorNode.style.width = widthOfOriginalColorBox + 'px';
        const closeButton = colorPicker.header.closeButton;
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
};
StandaloneColorPickerWidget = StandaloneColorPickerWidget_1 = __decorate([
    __param(3, IInstantiationService),
    __param(4, IKeybindingService),
    __param(5, ILanguageFeaturesService),
    __param(6, IEditorWorkerService),
    __param(7, IHoverService)
], StandaloneColorPickerWidget);
export { StandaloneColorPickerWidget };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RhbmRhbG9uZUNvbG9yUGlja2VyV2lkZ2V0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbnRyaWIvY29sb3JQaWNrZXIvYnJvd3Nlci9zdGFuZGFsb25lQ29sb3JQaWNrZXIvc3RhbmRhbG9uZUNvbG9yUGlja2VyV2lkZ2V0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUVoRyxPQUFPLG9CQUFvQixDQUFDO0FBQzVCLE9BQU8sRUFBRSxVQUFVLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUt4RixPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUN0RyxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQUN2RixPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUM3RixPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFHOUQsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0saURBQWlELENBQUM7QUFHM0YsT0FBTyxFQUFFLDRCQUE0QixFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDbEYsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDbkYsT0FBTyxFQUE4QixnQ0FBZ0MsRUFBc0MsTUFBTSx1Q0FBdUMsQ0FBQztBQUN6SixPQUFPLEtBQUssR0FBRyxNQUFNLG9DQUFvQyxDQUFDO0FBRTFELE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUUvRSxNQUFNLDJCQUEyQjtJQUNoQywrSEFBK0g7SUFDL0gsWUFDaUIsS0FBaUMsRUFDakMsYUFBc0I7UUFEdEIsVUFBSyxHQUFMLEtBQUssQ0FBNEI7UUFDakMsa0JBQWEsR0FBYixhQUFhLENBQVM7SUFDbkMs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