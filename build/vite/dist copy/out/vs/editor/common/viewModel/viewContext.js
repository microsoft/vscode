/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { EditorTheme } from '../editorTheme.js';
export class ViewContext {
    constructor(configuration, theme, model) {
        this.configuration = configuration;
        this.theme = new EditorTheme(theme);
        this.viewModel = model;
        this.viewLayout = model.viewLayout;
    }
    addEventHandler(eventHandler) {
        this.viewModel.addViewEventHandler(eventHandler);
    }
    removeEventHandler(eventHandler) {
        this.viewModel.removeViewEventHandler(eventHandler);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmlld0NvbnRleHQuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvY29tbW9uL3ZpZXdNb2RlbC92aWV3Q29udGV4dC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQU1oRyxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sbUJBQW1CLENBQUM7QUFFaEQsTUFBTSxPQUFPLFdBQVc7SUFPdkIsWUFDQyxhQUFtQyxFQUNuQyxLQUFrQixFQUNsQixLQUFpQjtRQUVqQixJQUFJLENBQUMsYUFBYSxHQUFHLGFBQWEsQ0FBQztRQUNuQyxJQUFJLENBQUMsS0FBSyxHQUFHLElBQUksV0FBVyxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ3BDLElBQUksQ0FBQyxTQUFTLEdBQUcsS0FBSyxDQUFDO1FBQ3ZCLElBQUksQ0FBQyxVQUFVLEdBQUcsS0FBSyxDQUFDLFVBQVUsQ0FBQztJQUNwQyxDQUFDO0lBRU0sZUFBZSxDQUFDLFlBQThCO1FBQ3BELElBQUksQ0FBQyxTQUFTLENBQUMsbUJBQW1CLENBQUMsWUFBWSxDQUFDLENBQUM7SUFDbEQsQ0FBQztJQUVNLGtCQUFrQixDQUFDLFlBQThCO1FBQ3ZELElBQUksQ0FBQyxTQUFTLENBQUMsc0JBQXNCLENBQUMsWUFBWSxDQUFDLENBQUM7SUFDckQsQ0FBQztDQUNEIn0=