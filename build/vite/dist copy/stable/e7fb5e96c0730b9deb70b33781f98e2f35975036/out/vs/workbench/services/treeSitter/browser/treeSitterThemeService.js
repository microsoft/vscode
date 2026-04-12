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
import { derived, observableFromEvent } from '../../../../base/common/observable.js';
import { findMetadata } from '../../themes/common/colorThemeData.js';
import { IWorkbenchThemeService } from '../../themes/common/workbenchThemeService.js';
let TreeSitterThemeService = class TreeSitterThemeService {
    constructor(_themeService) {
        this._themeService = _themeService;
        this._colorTheme = observableFromEvent(this._themeService.onDidColorThemeChange, () => this._themeService.getColorTheme());
        this.onChange = derived(this, (reader) => {
            this._colorTheme.read(reader);
            reader.reportChange(void 0);
        });
    }
    findMetadata(captureNames, languageId, bracket, reader) {
        return findMetadata(this._colorTheme.read(reader), captureNames, languageId, bracket);
    }
};
TreeSitterThemeService = __decorate([
    __param(0, IWorkbenchThemeService)
], TreeSitterThemeService);
export { TreeSitterThemeService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHJlZVNpdHRlclRoZW1lU2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy90cmVlU2l0dGVyL2Jyb3dzZXIvdHJlZVNpdHRlclRoZW1lU2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsT0FBTyxFQUF3QixtQkFBbUIsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBRTNHLE9BQU8sRUFBa0IsWUFBWSxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDckYsT0FBTyxFQUFFLHNCQUFzQixFQUFFLE1BQU0sOENBQThDLENBQUM7QUFFL0UsSUFBTSxzQkFBc0IsR0FBNUIsTUFBTSxzQkFBc0I7SUFLbEMsWUFDMEMsYUFBcUM7UUFBckMsa0JBQWEsR0FBYixhQUFhLENBQXdCO1FBRTlFLElBQUksQ0FBQyxXQUFXLEdBQUcsbUJBQW1CLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxxQkFBcUIsRUFBRSxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLGFBQWEsRUFBb0IsQ0FBQyxDQUFDO1FBQzdJLElBQUksQ0FBQyxRQUFRLEdBQUcsT0FBTyxDQUFDLElBQUksRUFBRSxDQUFDLE1BQU0sRUFBRSxFQUFFO1lBQ3hDLElBQUksQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQzlCLE1BQU0sQ0FBQyxZQUFZLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztRQUM3QixDQUFDLENBQUMsQ0FBQztJQUNKLENBQUM7SUFFRCxZQUFZLENBQUMsWUFBc0IsRUFBRSxVQUFrQixFQUFFLE9BQWdCLEVBQUUsTUFBMkI7UUFDckcsT0FBTyxZQUFZLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLEVBQUUsWUFBWSxFQUFFLFVBQVUsRUFBRSxPQUFPLENBQUMsQ0FBQztJQUN2RixDQUFDO0NBQ0QsQ0FBQTtBQWxCWSxzQkFBc0I7SUFNaEMsV0FBQSxzQkFBc0IsQ0FBQTtHQU5aLHNCQUFzQixDQWtCbEMifQ==