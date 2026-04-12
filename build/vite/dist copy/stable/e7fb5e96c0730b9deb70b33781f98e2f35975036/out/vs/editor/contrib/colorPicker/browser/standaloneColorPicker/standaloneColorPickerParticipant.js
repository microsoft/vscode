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
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { getColors } from '../color.js';
import { ColorDetector } from '../colorDetector.js';
import { createColorHover, updateColorPresentations, updateEditorModel } from '../colorPickerParticipantUtils.js';
import { ColorPickerWidget } from '../colorPickerWidget.js';
import { Range } from '../../../../common/core/range.js';
import { Dimension } from '../../../../../base/browser/dom.js';
export class StandaloneColorPickerHover {
    constructor(owner, range, model, provider) {
        this.owner = owner;
        this.range = range;
        this.model = model;
        this.provider = provider;
    }
    static fromBaseColor(owner, color) {
        return new StandaloneColorPickerHover(owner, color.range, color.model, color.provider);
    }
}
export class StandaloneColorPickerRenderedParts extends Disposable {
    constructor(editor, context, colorHover, themeService) {
        super();
        const editorModel = editor.getModel();
        const colorPickerModel = colorHover.model;
        this.color = colorHover.model.color;
        this.colorPicker = this._register(new ColorPickerWidget(context.fragment, colorPickerModel, editor.getOption(163 /* EditorOption.pixelRatio */), themeService, "standalone" /* ColorPickerWidgetType.Standalone */));
        this._register(colorPickerModel.onColorFlushed((color) => {
            this.color = color;
        }));
        this._register(colorPickerModel.onDidChangeColor((color) => {
            updateColorPresentations(editorModel, colorPickerModel, color, colorHover.range, colorHover);
        }));
        let editorUpdatedByColorPicker = false;
        this._register(editor.onDidChangeModelContent((e) => {
            if (editorUpdatedByColorPicker) {
                editorUpdatedByColorPicker = false;
            }
            else {
                context.hide();
                editor.focus();
            }
        }));
        updateColorPresentations(editorModel, colorPickerModel, this.color, colorHover.range, colorHover);
    }
}
let StandaloneColorPickerParticipant = class StandaloneColorPickerParticipant {
    constructor(_editor, _themeService) {
        this._editor = _editor;
        this._themeService = _themeService;
        this.hoverOrdinal = 2;
    }
    async createColorHover(defaultColorInfo, defaultColorProvider, colorProviderRegistry) {
        if (!this._editor.hasModel()) {
            return null;
        }
        const colorDetector = ColorDetector.get(this._editor);
        if (!colorDetector) {
            return null;
        }
        const colors = await getColors(colorProviderRegistry, this._editor.getModel(), CancellationToken.None);
        let foundColorInfo = null;
        let foundColorProvider = null;
        for (const colorData of colors) {
            const colorInfo = colorData.colorInfo;
            if (Range.containsRange(colorInfo.range, defaultColorInfo.range)) {
                foundColorInfo = colorInfo;
                foundColorProvider = colorData.provider;
            }
        }
        const colorInfo = foundColorInfo ?? defaultColorInfo;
        const colorProvider = foundColorProvider ?? defaultColorProvider;
        const foundInEditor = !!foundColorInfo;
        const colorHover = StandaloneColorPickerHover.fromBaseColor(this, await createColorHover(this._editor.getModel(), colorInfo, colorProvider));
        return { colorHover, foundInEditor };
    }
    async updateEditorModel(colorHoverData) {
        if (!this._editor.hasModel()) {
            return;
        }
        const colorPickerModel = colorHoverData.model;
        let range = new Range(colorHoverData.range.startLineNumber, colorHoverData.range.startColumn, colorHoverData.range.endLineNumber, colorHoverData.range.endColumn);
        if (this._color) {
            await updateColorPresentations(this._editor.getModel(), colorPickerModel, this._color, range, colorHoverData);
            range = updateEditorModel(this._editor, range, colorPickerModel);
        }
    }
    renderHoverParts(context, hoverParts) {
        if (hoverParts.length === 0 || !this._editor.hasModel()) {
            return undefined;
        }
        this._setMinimumDimensions(context);
        this._renderedParts = new StandaloneColorPickerRenderedParts(this._editor, context, hoverParts[0], this._themeService);
        return this._renderedParts;
    }
    _setMinimumDimensions(context) {
        const minimumHeight = this._editor.getOption(75 /* EditorOption.lineHeight */) + 8;
        context.setMinimumDimensions(new Dimension(302, minimumHeight));
    }
    get _color() {
        return this._renderedParts?.color;
    }
};
StandaloneColorPickerParticipant = __decorate([
    __param(1, IThemeService)
], StandaloneColorPickerParticipant);
export { StandaloneColorPickerParticipant };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RhbmRhbG9uZUNvbG9yUGlja2VyUGFydGljaXBhbnQuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvY29udHJpYi9jb2xvclBpY2tlci9icm93c2VyL3N0YW5kYWxvbmVDb2xvclBpY2tlci9zdGFuZGFsb25lQ29sb3JQaWNrZXJQYXJ0aWNpcGFudC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUUvRSxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDckUsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBS3JGLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxhQUFhLENBQUM7QUFDeEMsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLHFCQUFxQixDQUFDO0FBRXBELE9BQU8sRUFBb0MsZ0JBQWdCLEVBQUUsd0JBQXdCLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUNwSixPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUM1RCxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFFekQsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBRS9ELE1BQU0sT0FBTywwQkFBMEI7SUFDdEMsWUFDaUIsS0FBdUMsRUFDdkMsS0FBWSxFQUNaLEtBQXVCLEVBQ3ZCLFFBQStCO1FBSC9CLFVBQUssR0FBTCxLQUFLLENBQWtDO1FBQ3ZDLFVBQUssR0FBTCxLQUFLLENBQU87UUFDWixVQUFLLEdBQUwsS0FBSyxDQUFrQjtRQUN2QixhQUFRLEdBQVIsUUFBUSxDQUF1QjtJQUM1QyxDQUFDO0lBRUUsTUFBTSxDQUFDLGFBQWEsQ0FBQyxLQUF1QyxFQUFFLEtBQWdCO1FBQ3BGLE9BQU8sSUFBSSwwQkFBMEIsQ0FBQyxLQUFLLEVBQUUsS0FBSyxDQUFDLEtBQUssRUFBRSxLQUFLLENBQUMsS0FBSyxFQUFFLEtBQUssQ0FBQyxRQUFRLENBQUMsQ0FBQztJQUN4RixDQUFDO0NBQ0Q7QUFFRCxNQUFNLE9BQU8sa0NBQW1DLFNBQVEsVUFBVTtJQU1qRSxZQUFZLE1BQXlCLEVBQUUsT0FBa0MsRUFBRSxVQUFzQyxFQUFFLFlBQTJCO1FBQzdJLEtBQUssRUFBRSxDQUFDO1FBQ1IsTUFBTSxXQUFXLEdBQUcsTUFBTSxDQUFDLFFBQVEsRUFBRSxDQUFDO1FBQ3RDLE1BQU0sZ0JBQWdCLEdBQUcsVUFBVSxDQUFDLEtBQUssQ0FBQztRQUUxQyxJQUFJLENBQUMsS0FBSyxHQUFHLFVBQVUsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDO1FBQ3BDLElBQUksQ0FBQyxXQUFXLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLGlCQUFpQixDQUN0RCxPQUFPLENBQUMsUUFBUSxFQUNoQixnQkFBZ0IsRUFDaEIsTUFBTSxDQUFDLFNBQVMsbUNBQXlCLEVBQ3pDLFlBQVksc0RBRVosQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLFNBQVMsQ0FBQyxnQkFBZ0IsQ0FBQyxjQUFjLENBQUMsQ0FBQyxLQUFZLEVBQUUsRUFBRTtZQUMvRCxJQUFJLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQztRQUNwQixDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ0osSUFBSSxDQUFDLFNBQVMsQ0FBQyxnQkFBZ0IsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLEtBQVksRUFBRSxFQUFFO1lBQ2pFLHdCQUF3QixDQUFDLFdBQVcsRUFBRSxnQkFBZ0IsRUFBRSxLQUFLLEVBQUUsVUFBVSxDQUFDLEtBQUssRUFBRSxVQUFVLENBQUMsQ0FBQztRQUM5RixDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ0osSUFBSSwwQkFBMEIsR0FBRyxLQUFLLENBQUM7UUFDdkMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsdUJBQXVCLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRTtZQUNuRCxJQUFJLDBCQUEwQixFQUFFLENBQUM7Z0JBQ2hDLDBCQUEwQixHQUFHLEtBQUssQ0FBQztZQUNwQyxDQUFDO2lCQUFNLENBQUM7Z0JBQ1AsT0FBTyxDQUFDLElBQUksRUFBRSxDQUFDO2dCQUNmLE1BQU0sQ0FBQyxLQUFLLEVBQUUsQ0FBQztZQUNoQixDQUFDO1FBQ0YsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNKLHdCQUF3QixDQUFDLFdBQVcsRUFBRSxnQkFBZ0IsRUFBRSxJQUFJLENBQUMsS0FBSyxFQUFFLFVBQVUsQ0FBQyxLQUFLLEVBQUUsVUFBVSxDQUFDLENBQUM7SUFDbkcsQ0FBQztDQUNEO0FBRU0sSUFBTSxnQ0FBZ0MsR0FBdEMsTUFBTSxnQ0FBZ0M7SUFLNUMsWUFDa0IsT0FBb0IsRUFDdEIsYUFBNkM7UUFEM0MsWUFBTyxHQUFQLE9BQU8sQ0FBYTtRQUNMLGtCQUFhLEdBQWIsYUFBYSxDQUFlO1FBTDdDLGlCQUFZLEdBQVcsQ0FBQyxDQUFDO0lBTXJDLENBQUM7SUFFRSxLQUFLLENBQUMsZ0JBQWdCLENBQUMsZ0JBQW1DLEVBQUUsb0JBQTJDLEVBQUUscUJBQXFFO1FBQ3BMLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLFFBQVEsRUFBRSxFQUFFLENBQUM7WUFDOUIsT0FBTyxJQUFJLENBQUM7UUFDYixDQUFDO1FBQ0QsTUFBTSxhQUFhLEdBQUcsYUFBYSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDdEQsSUFBSSxDQUFDLGFBQWEsRUFBRSxDQUFDO1lBQ3BCLE9BQU8sSUFBSSxDQUFDO1FBQ2IsQ0FBQztRQUNELE1BQU0sTUFBTSxHQUFHLE1BQU0sU0FBUyxDQUFDLHFCQUFxQixFQUFFLElBQUksQ0FBQyxPQUFPLENBQUMsUUFBUSxFQUFFLEVBQUUsaUJBQWlCLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDdkcsSUFBSSxjQUFjLEdBQTZCLElBQUksQ0FBQztRQUNwRCxJQUFJLGtCQUFrQixHQUFpQyxJQUFJLENBQUM7UUFDNUQsS0FBSyxNQUFNLFNBQVMsSUFBSSxNQUFNLEVBQUUsQ0FBQztZQUNoQyxNQUFNLFNBQVMsR0FBRyxTQUFTLENBQUMsU0FBUyxDQUFDO1lBQ3RDLElBQUksS0FBSyxDQUFDLGFBQWEsQ0FBQyxTQUFTLENBQUMsS0FBSyxFQUFFLGdCQUFnQixDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUM7Z0JBQ2xFLGNBQWMsR0FBRyxTQUFTLENBQUM7Z0JBQzNCLGtCQUFrQixHQUFHLFNBQVMsQ0FBQyxRQUFRLENBQUM7WUFDekMsQ0FBQztRQUNGLENBQUM7UUFDRCxNQUFNLFNBQVMsR0FBRyxjQUFjLElBQUksZ0JBQWdCLENBQUM7UUFDckQsTUFBTSxhQUFhLEdBQUcsa0JBQWtCLElBQUksb0JBQW9CLENBQUM7UUFDakUsTUFBTSxhQUFhLEdBQUcsQ0FBQyxDQUFDLGNBQWMsQ0FBQztRQUN2QyxNQUFNLFVBQVUsR0FBRywwQkFBMEIsQ0FBQyxhQUFhLENBQUMsSUFBSSxFQUFFLE1BQU0sZ0JBQWdCLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxRQUFRLEVBQUUsRUFBRSxTQUFTLEVBQUUsYUFBYSxDQUFDLENBQUMsQ0FBQztRQUM3SSxPQUFPLEVBQUUsVUFBVSxFQUFFLGFBQWEsRUFBRSxDQUFDO0lBQ3RDLENBQUM7SUFFTSxLQUFLLENBQUMsaUJBQWlCLENBQUMsY0FBMEM7UUFDeEUsSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsUUFBUSxFQUFFLEVBQUUsQ0FBQztZQUM5QixPQUFPO1FBQ1IsQ0FBQztRQUNELE1BQU0sZ0JBQWdCLEdBQUcsY0FBYyxDQUFDLEtBQUssQ0FBQztRQUM5QyxJQUFJLEtBQUssR0FBRyxJQUFJLEtBQUssQ0FBQyxjQUFjLENBQUMsS0FBSyxDQUFDLGVBQWUsRUFBRSxjQUFjLENBQUMsS0FBSyxDQUFDLFdBQVcsRUFBRSxjQUFjLENBQUMsS0FBSyxDQUFDLGFBQWEsRUFBRSxjQUFjLENBQUMsS0FBSyxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQ2xLLElBQUksSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQ2pCLE1BQU0sd0JBQXdCLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxRQUFRLEVBQUUsRUFBRSxnQkFBZ0IsRUFBRSxJQUFJLENBQUMsTUFBTSxFQUFFLEtBQUssRUFBRSxjQUFjLENBQUMsQ0FBQztZQUM5RyxLQUFLLEdBQUcsaUJBQWlCLENBQUMsSUFBSSxDQUFDLE9BQU8sRUFBRSxLQUFLLEVBQUUsZ0JBQWdCLENBQUMsQ0FBQztRQUNsRSxDQUFDO0lBQ0YsQ0FBQztJQUVNLGdCQUFnQixDQUFDLE9BQWtDLEVBQUUsVUFBd0M7UUFDbkcsSUFBSSxVQUFVLENBQUMsTUFBTSxLQUFLLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsUUFBUSxFQUFFLEVBQUUsQ0FBQztZQUN6RCxPQUFPLFNBQVMsQ0FBQztRQUNsQixDQUFDO1FBQ0QsSUFBSSxDQUFDLHFCQUFxQixDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQ3BDLElBQUksQ0FBQyxjQUFjLEdBQUcsSUFBSSxrQ0FBa0MsQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLE9BQU8sRUFBRSxVQUFVLENBQUMsQ0FBQyxDQUFDLEVBQUUsSUFBSSxDQUFDLGFBQWEsQ0FBQyxDQUFDO1FBQ3ZILE9BQU8sSUFBSSxDQUFDLGNBQWMsQ0FBQztJQUM1QixDQUFDO0lBRU8scUJBQXFCLENBQUMsT0FBa0M7UUFDL0QsTUFBTSxhQUFhLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxTQUFTLGtDQUF5QixHQUFHLENBQUMsQ0FBQztRQUMxRSxPQUFPLENBQUMsb0JBQW9CLENBQUMsSUFBSSxTQUFTLENBQUMsR0FBRyxFQUFFLGFBQWEsQ0FBQyxDQUFDLENBQUM7SUFDakUsQ0FBQztJQUVELElBQVksTUFBTTtRQUNqQixPQUFPLElBQUksQ0FBQyxjQUFjLEVBQUUsS0FBSyxDQUFDO0lBQ25DLENBQUM7Q0FDRCxDQUFBO0FBaEVZLGdDQUFnQztJQU8xQyxXQUFBLGFBQWEsQ0FBQTtHQVBILGdDQUFnQyxDQWdFNUMifQ==