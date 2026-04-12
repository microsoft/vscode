/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import './colorPicker.css';
import { PixelRatio } from '../../../../base/browser/pixelRatio.js';
import * as dom from '../../../../base/browser/dom.js';
import { Widget } from '../../../../base/browser/ui/widget.js';
import { ColorPickerBody } from './colorPickerParts/colorPickerBody.js';
import { ColorPickerHeader } from './colorPickerParts/colorPickerHeader.js';
const $ = dom.$;
export class ColorPickerWidget extends Widget {
    static { this.ID = 'editor.contrib.colorPickerWidget'; }
    constructor(container, model, pixelRatio, themeService, type) {
        super();
        this.model = model;
        this.pixelRatio = pixelRatio;
        this._register(PixelRatio.getInstance(dom.getWindow(container)).onDidChange(() => this.layout()));
        this._domNode = $('.colorpicker-widget');
        container.appendChild(this._domNode);
        this.header = this._register(new ColorPickerHeader(this._domNode, this.model, themeService, type));
        this.body = this._register(new ColorPickerBody(this._domNode, this.model, this.pixelRatio, type));
    }
    getId() {
        return ColorPickerWidget.ID;
    }
    layout() {
        this.body.layout();
    }
    get domNode() {
        return this._domNode;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29sb3JQaWNrZXJXaWRnZXQuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvY29udHJpYi9jb2xvclBpY2tlci9icm93c2VyL2NvbG9yUGlja2VyV2lkZ2V0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sbUJBQW1CLENBQUM7QUFDM0IsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ3BFLE9BQU8sS0FBSyxHQUFHLE1BQU0saUNBQWlDLENBQUM7QUFDdkQsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBSS9ELE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUN4RSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUc1RSxNQUFNLENBQUMsR0FBRyxHQUFHLENBQUMsQ0FBQyxDQUFDO0FBRWhCLE1BQU0sT0FBTyxpQkFBa0IsU0FBUSxNQUFNO2FBRXBCLE9BQUUsR0FBRyxrQ0FBa0MsQ0FBQztJQU1oRSxZQUFZLFNBQWUsRUFBVyxLQUF1QixFQUFVLFVBQWtCLEVBQUUsWUFBMkIsRUFBRSxJQUEyQjtRQUNsSixLQUFLLEVBQUUsQ0FBQztRQUQ2QixVQUFLLEdBQUwsS0FBSyxDQUFrQjtRQUFVLGVBQVUsR0FBVixVQUFVLENBQVE7UUFHeEYsSUFBSSxDQUFDLFNBQVMsQ0FBQyxVQUFVLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxXQUFXLENBQUMsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztRQUVsRyxJQUFJLENBQUMsUUFBUSxHQUFHLENBQUMsQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDO1FBQ3pDLFNBQVMsQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBRXJDLElBQUksQ0FBQyxNQUFNLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLGlCQUFpQixDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsSUFBSSxDQUFDLEtBQUssRUFBRSxZQUFZLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQztRQUNuRyxJQUFJLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxlQUFlLENBQUMsSUFBSSxDQUFDLFFBQVEsRUFBRSxJQUFJLENBQUMsS0FBSyxFQUFFLElBQUksQ0FBQyxVQUFVLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQztJQUNuRyxDQUFDO0lBRUQsS0FBSztRQUNKLE9BQU8saUJBQWlCLENBQUMsRUFBRSxDQUFDO0lBQzdCLENBQUM7SUFFRCxNQUFNO1FBQ0wsSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQztJQUNwQixDQUFDO0lBRUQsSUFBSSxPQUFPO1FBQ1YsT0FBTyxJQUFJLENBQUMsUUFBUSxDQUFDO0lBQ3RCLENBQUMifQ==