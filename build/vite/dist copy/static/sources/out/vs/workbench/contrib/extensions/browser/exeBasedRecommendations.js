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
import { IExtensionTipsService } from '../../../../platform/extensionManagement/common/extensionManagement.js';
import { ExtensionRecommendations } from './extensionRecommendations.js';
import { localize } from '../../../../nls.js';
let ExeBasedRecommendations = class ExeBasedRecommendations extends ExtensionRecommendations {
    get otherRecommendations() { return this._otherTips.map(tip => this.toExtensionRecommendation(tip)); }
    get importantRecommendations() { return this._importantTips.map(tip => this.toExtensionRecommendation(tip)); }
    get recommendations() { return [...this.importantRecommendations, ...this.otherRecommendations]; }
    constructor(extensionTipsService) {
        super();
        this.extensionTipsService = extensionTipsService;
        this._otherTips = [];
        this._importantTips = [];
    }
    getRecommendations(exe) {
        const important = this._importantTips
            .filter(tip => tip.exeName.toLowerCase() === exe.toLowerCase())
            .map(tip => this.toExtensionRecommendation(tip));
        const others = this._otherTips
            .filter(tip => tip.exeName.toLowerCase() === exe.toLowerCase())
            .map(tip => this.toExtensionRecommendation(tip));
        return { important, others };
    }
    async doActivate() {
        this._otherTips = await this.extensionTipsService.getOtherExecutableBasedTips();
        await this.fetchImportantExeBasedRecommendations();
    }
    async fetchImportantExeBasedRecommendations() {
        if (!this._importantExeBasedRecommendations) {
            this._importantExeBasedRecommendations = this.doFetchImportantExeBasedRecommendations();
        }
        return this._importantExeBasedRecommendations;
    }
    async doFetchImportantExeBasedRecommendations() {
        const importantExeBasedRecommendations = new Map();
        this._importantTips = await this.extensionTipsService.getImportantExecutableBasedTips();
        this._importantTips.forEach(tip => importantExeBasedRecommendations.set(tip.extensionId.toLowerCase(), tip));
        return importantExeBasedRecommendations;
    }
    toExtensionRecommendation(tip) {
        return {
            extension: tip.extensionId.toLowerCase(),
            reason: {
                reasonId: 2 /* ExtensionRecommendationReason.Executable */,
                reasonText: localize('exeBasedRecommendation', "This extension is recommended because you have {0} installed.", tip.exeFriendlyName)
            }
        };
    }
};
ExeBasedRecommendations = __decorate([
    __param(0, IExtensionTipsService)
], ExeBasedRecommendations);
export { ExeBasedRecommendations };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXhlQmFzZWRSZWNvbW1lbmRhdGlvbnMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9leHRlbnNpb25zL2Jyb3dzZXIvZXhlQmFzZWRSZWNvbW1lbmRhdGlvbnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLHFCQUFxQixFQUFnQyxNQUFNLHdFQUF3RSxDQUFDO0FBQzdJLE9BQU8sRUFBRSx3QkFBd0IsRUFBMkIsTUFBTSwrQkFBK0IsQ0FBQztBQUNsRyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFHdkMsSUFBTSx1QkFBdUIsR0FBN0IsTUFBTSx1QkFBd0IsU0FBUSx3QkFBd0I7SUFLcEUsSUFBSSxvQkFBb0IsS0FBNkMsT0FBTyxJQUFJLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyx5QkFBeUIsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUM5SSxJQUFJLHdCQUF3QixLQUE2QyxPQUFPLElBQUksQ0FBQyxjQUFjLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLHlCQUF5QixDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBRXRKLElBQUksZUFBZSxLQUE2QyxPQUFPLENBQUMsR0FBRyxJQUFJLENBQUMsd0JBQXdCLEVBQUUsR0FBRyxJQUFJLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFFMUksWUFDd0Isb0JBQTREO1FBRW5GLEtBQUssRUFBRSxDQUFDO1FBRmdDLHlCQUFvQixHQUFwQixvQkFBb0IsQ0FBdUI7UUFUNUUsZUFBVSxHQUFtQyxFQUFFLENBQUM7UUFDaEQsbUJBQWMsR0FBbUMsRUFBRSxDQUFDO0lBVzVELENBQUM7SUFFRCxrQkFBa0IsQ0FBQyxHQUFXO1FBQzdCLE1BQU0sU0FBUyxHQUFHLElBQUksQ0FBQyxjQUFjO2FBQ25DLE1BQU0sQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsV0FBVyxFQUFFLEtBQUssR0FBRyxDQUFDLFdBQVcsRUFBRSxDQUFDO2FBQzlELEdBQUcsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyx5QkFBeUIsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO1FBRWxELE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxVQUFVO2FBQzVCLE1BQU0sQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsV0FBVyxFQUFFLEtBQUssR0FBRyxDQUFDLFdBQVcsRUFBRSxDQUFDO2FBQzlELEdBQUcsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyx5QkFBeUIsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO1FBRWxELE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxFQUFFLENBQUM7SUFDOUIsQ0FBQztJQUVTLEtBQUssQ0FBQyxVQUFVO1FBQ3pCLElBQUksQ0FBQyxVQUFVLEdBQUcsTUFBTSxJQUFJLENBQUMsb0JBQW9CLENBQUMsMkJBQTJCLEVBQUUsQ0FBQztRQUNoRixNQUFNLElBQUksQ0FBQyxxQ0FBcUMsRUFBRSxDQUFDO0lBQ3BELENBQUM7SUFHTyxLQUFLLENBQUMscUNBQXFDO1FBQ2xELElBQUksQ0FBQyxJQUFJLENBQUMsaUNBQWlDLEVBQUUsQ0FBQztZQUM3QyxJQUFJLENBQUMsaUNBQWlDLEdBQUcsSUFBSSxDQUFDLHVDQUF1QyxFQUFFLENBQUM7UUFDekYsQ0FBQztRQUNELE9BQU8sSUFBSSxDQUFDLGlDQUFpQyxDQUFDO0lBQy9DLENBQUM7SUFFTyxLQUFLLENBQUMsdUNBQXVDO1FBQ3BELE1BQU0sZ0NBQWdDLEdBQUcsSUFBSSxHQUFHLEVBQXdDLENBQUM7UUFDekYsSUFBSSxDQUFDLGNBQWMsR0FBRyxNQUFNLElBQUksQ0FBQyxvQkFBb0IsQ0FBQywrQkFBK0IsRUFBRSxDQUFDO1FBQ3hGLElBQUksQ0FBQyxjQUFjLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsZ0NBQWdDLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxXQUFXLENBQUMsV0FBVyxFQUFFLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQztRQUM3RyxPQUFPLGdDQUFnQyxDQUFDO0lBQ3pDLENBQUM7SUFFTyx5QkFBeUIsQ0FBQyxHQUFpQztRQUNsRSxPQUFPO1lBQ04sU0FBUyxFQUFFLEdBQUcsQ0FBQyxXQUFXLENBQUMsV0FBVyxFQUFFO1lBQ3hDLE1BQU0sRUFBRTtnQkFDUCxRQUFRLGtEQUEwQztnQkFDbEQsVUFBVSxFQUFFLFFBQVEsQ0FBQyx3QkFBd0IsRUFBRSwrREFBK0QsRUFBRSxHQUFHLENBQUMsZUFBZSxDQUFDO2FBQ3BJO1NBQ0QsQ0FBQztJQUNILENBQUM7Q0FFRCxDQUFBO0FBMURZLHVCQUF1QjtJQVdqQyxXQUFBLHFCQUFxQixDQUFBO0dBWFgsdUJBQXVCLENBMERuQyJ9