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
import { AsyncIterableProducer } from '../../../../../base/common/async.js';
import { Range } from '../../../../common/core/range.js';
import { ColorDetector } from '../colorDetector.js';
import { ColorPickerWidget } from '../colorPickerWidget.js';
import { RenderedHoverParts } from '../../../hover/browser/hoverTypes.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import * as nls from '../../../../../nls.js';
import { createColorHover, updateColorPresentations, updateEditorModel } from '../colorPickerParticipantUtils.js';
import { Dimension } from '../../../../../base/browser/dom.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
export class ColorHover {
    constructor(owner, range, model, provider) {
        this.owner = owner;
        this.range = range;
        this.model = model;
        this.provider = provider;
        /**
         * Force the hover to always be rendered at this specific range,
         * even in the case of multiple hover parts.
         */
        this.forceShowAtRange = true;
    }
    isValidForHoverAnchor(anchor) {
        return (anchor.type === 1 /* HoverAnchorType.Range */
            && this.range.startColumn <= anchor.range.startColumn
            && this.range.endColumn >= anchor.range.endColumn);
    }
    static fromBaseColor(owner, color) {
        return new ColorHover(owner, color.range, color.model, color.provider);
    }
}
let HoverColorPickerParticipant = class HoverColorPickerParticipant {
    constructor(_editor, _themeService) {
        this._editor = _editor;
        this._themeService = _themeService;
        this.hoverOrdinal = 2;
    }
    computeSync(_anchor, _lineDecorations, source) {
        return [];
    }
    computeAsync(anchor, lineDecorations, source, token) {
        return AsyncIterableProducer.fromPromise(this._computeAsync(anchor, lineDecorations, source));
    }
    async _computeAsync(_anchor, lineDecorations, source) {
        if (!this._editor.hasModel()) {
            return [];
        }
        if (!this._isValidRequest(source)) {
            return [];
        }
        const colorDetector = ColorDetector.get(this._editor);
        if (!colorDetector) {
            return [];
        }
        for (const d of lineDecorations) {
            if (!colorDetector.isColorDecoration(d)) {
                continue;
            }
            const colorData = colorDetector.getColorData(d.range.getStartPosition());
            if (colorData) {
                const colorHover = ColorHover.fromBaseColor(this, await createColorHover(this._editor.getModel(), colorData.colorInfo, colorData.provider));
                return [colorHover];
            }
        }
        return [];
    }
    _isValidRequest(source) {
        const decoratorActivatedOn = this._editor.getOption(168 /* EditorOption.colorDecoratorsActivatedOn */);
        switch (source) {
            case 0 /* HoverStartSource.Mouse */:
                return decoratorActivatedOn === 'hover' || decoratorActivatedOn === 'clickAndHover';
            case 1 /* HoverStartSource.Click */:
                return decoratorActivatedOn === 'click' || decoratorActivatedOn === 'clickAndHover';
            case 2 /* HoverStartSource.Keyboard */:
                return true;
        }
    }
    renderHoverParts(context, hoverParts) {
        const editor = this._editor;
        if (hoverParts.length === 0 || !editor.hasModel()) {
            return new RenderedHoverParts([]);
        }
        const minimumHeight = editor.getOption(75 /* EditorOption.lineHeight */) + 8;
        context.setMinimumDimensions(new Dimension(302, minimumHeight));
        const disposables = new DisposableStore();
        const colorHover = hoverParts[0];
        const editorModel = editor.getModel();
        const model = colorHover.model;
        this._colorPicker = disposables.add(new ColorPickerWidget(context.fragment, model, editor.getOption(163 /* EditorOption.pixelRatio */), this._themeService, "hover" /* ColorPickerWidgetType.Hover */));
        let editorUpdatedByColorPicker = false;
        let range = new Range(colorHover.range.startLineNumber, colorHover.range.startColumn, colorHover.range.endLineNumber, colorHover.range.endColumn);
        disposables.add(model.onColorFlushed(async (color) => {
            await updateColorPresentations(editorModel, model, color, range, colorHover);
            editorUpdatedByColorPicker = true;
            range = updateEditorModel(editor, range, model);
        }));
        disposables.add(model.onDidChangeColor((color) => {
            updateColorPresentations(editorModel, model, color, range, colorHover);
        }));
        disposables.add(editor.onDidChangeModelContent((e) => {
            if (editorUpdatedByColorPicker) {
                editorUpdatedByColorPicker = false;
            }
            else {
                context.hide();
                editor.focus();
            }
        }));
        const renderedHoverPart = {
            hoverPart: ColorHover.fromBaseColor(this, colorHover),
            hoverElement: this._colorPicker.domNode,
            dispose() { disposables.dispose(); }
        };
        return new RenderedHoverParts([renderedHoverPart]);
    }
    getAccessibleContent(hoverPart) {
        return nls.localize('hoverAccessibilityColorParticipant', 'There is a color picker here.');
    }
    handleResize() {
        this._colorPicker?.layout();
    }
    handleContentsChanged() {
        this._colorPicker?.layout();
    }
    handleHide() {
        this._colorPicker?.dispose();
        this._colorPicker = undefined;
    }
    isColorPickerVisible() {
        return !!this._colorPicker;
    }
};
HoverColorPickerParticipant = __decorate([
    __param(1, IThemeService)
], HoverColorPickerParticipant);
export { HoverColorPickerParticipant };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaG92ZXJDb2xvclBpY2tlclBhcnRpY2lwYW50LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbnRyaWIvY29sb3JQaWNrZXIvYnJvd3Nlci9ob3ZlckNvbG9yUGlja2VyL2hvdmVyQ29sb3JQaWNrZXJQYXJ0aWNpcGFudC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUc1RSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFHekQsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLHFCQUFxQixDQUFDO0FBRXBELE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHlCQUF5QixDQUFDO0FBQzVELE9BQU8sRUFBeUksa0JBQWtCLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNqTixPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDckYsT0FBTyxLQUFLLEdBQUcsTUFBTSx1QkFBdUIsQ0FBQztBQUM3QyxPQUFPLEVBQW9DLGdCQUFnQixFQUFFLHdCQUF3QixFQUFFLGlCQUFpQixFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFFcEosT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQy9ELE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUkxRSxNQUFNLE9BQU8sVUFBVTtJQVF0QixZQUNpQixLQUEwQyxFQUMxQyxLQUFZLEVBQ1osS0FBdUIsRUFDdkIsUUFBK0I7UUFIL0IsVUFBSyxHQUFMLEtBQUssQ0FBcUM7UUFDMUMsVUFBSyxHQUFMLEtBQUssQ0FBTztRQUNaLFVBQUssR0FBTCxLQUFLLENBQWtCO1FBQ3ZCLGFBQVEsR0FBUixRQUFRLENBQXVCO1FBVmhEOzs7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