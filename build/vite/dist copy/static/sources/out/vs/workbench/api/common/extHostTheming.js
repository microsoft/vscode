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
import { ColorTheme, ColorThemeKind } from './extHostTypes.js';
import { IExtHostRpcService } from './extHostRpcService.js';
import { Emitter } from '../../../base/common/event.js';
let ExtHostTheming = class ExtHostTheming {
    constructor(_extHostRpc) {
        this._actual = new ColorTheme(ColorThemeKind.Dark);
        this._onDidChangeActiveColorTheme = new Emitter();
    }
    get activeColorTheme() {
        return this._actual;
    }
    $onColorThemeChange(type) {
        let kind;
        switch (type) {
            case 'light':
                kind = ColorThemeKind.Light;
                break;
            case 'hcDark':
                kind = ColorThemeKind.HighContrast;
                break;
            case 'hcLight':
                kind = ColorThemeKind.HighContrastLight;
                break;
            default:
                kind = ColorThemeKind.Dark;
        }
        this._actual = new ColorTheme(kind);
        this._onDidChangeActiveColorTheme.fire(this._actual);
    }
    get onDidChangeActiveColorTheme() {
        return this._onDidChangeActiveColorTheme.event;
    }
};
ExtHostTheming = __decorate([
    __param(0, IExtHostRpcService)
], ExtHostTheming);
export { ExtHostTheming };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0SG9zdFRoZW1pbmcuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvYXBpL2NvbW1vbi9leHRIb3N0VGhlbWluZy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsVUFBVSxFQUFFLGNBQWMsRUFBRSxNQUFNLG1CQUFtQixDQUFDO0FBQy9ELE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHdCQUF3QixDQUFDO0FBRTVELE9BQU8sRUFBRSxPQUFPLEVBQVMsTUFBTSwrQkFBK0IsQ0FBQztBQUV4RCxJQUFNLGNBQWMsR0FBcEIsTUFBTSxjQUFjO0lBTzFCLFlBQ3FCLFdBQStCO1FBRW5ELElBQUksQ0FBQyxPQUFPLEdBQUcsSUFBSSxVQUFVLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ25ELElBQUksQ0FBQyw0QkFBNEIsR0FBRyxJQUFJLE9BQU8sRUFBYyxDQUFDO0lBQy9ELENBQUM7SUFFRCxJQUFXLGdCQUFnQjtRQUMxQixPQUFPLElBQUksQ0FBQyxPQUFPLENBQUM7SUFDckIsQ0FBQztJQUVELG1CQUFtQixDQUFDLElBQVk7UUFDL0IsSUFBSSxJQUFJLENBQUM7UUFDVCxRQUFRLElBQUksRUFBRSxDQUFDO1lBQ2QsS0FBSyxPQUFPO2dCQUFFLElBQUksR0FBRyxjQUFjLENBQUMsS0FBSyxDQUFDO2dCQUFDLE1BQU07WUFDakQsS0FBSyxRQUFRO2dCQUFFLElBQUksR0FBRyxjQUFjLENBQUMsWUFBWSxDQUFDO2dCQUFDLE1BQU07WUFDekQsS0FBSyxTQUFTO2dCQUFFLElBQUksR0FBRyxjQUFjLENBQUMsaUJBQWlCLENBQUM7Z0JBQUMsTUFBTTtZQUMvRDtnQkFDQyxJQUFJLEdBQUcsY0FBYyxDQUFDLElBQUksQ0FBQztRQUM3QixDQUFDO1FBQ0QsSUFBSSxDQUFDLE9BQU8sR0FBRyxJQUFJLFVBQVUsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNwQyxJQUFJLENBQUMsNEJBQTRCLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQztJQUN0RCxDQUFDO0lBRUQsSUFBVywyQkFBMkI7UUFDckMsT0FBTyxJQUFJLENBQUMsNEJBQTRCLENBQUMsS0FBSyxDQUFDO0lBQ2hELENBQUM7Q0FDRCxDQUFBO0FBbENZLGNBQWM7SUFReEIsV0FBQSxrQkFBa0IsQ0FBQTtHQVJSLGNBQWMsQ0FrQzFCIn0=