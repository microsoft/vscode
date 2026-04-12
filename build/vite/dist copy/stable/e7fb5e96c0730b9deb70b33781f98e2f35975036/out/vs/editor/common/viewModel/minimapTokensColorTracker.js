/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Emitter } from '../../../base/common/event.js';
import { Disposable, markAsSingleton } from '../../../base/common/lifecycle.js';
import { RGBA8 } from '../core/misc/rgba.js';
import { TokenizationRegistry } from '../languages.js';
import { BugIndicatingError, onUnexpectedError } from '../../../base/common/errors.js';
export class MinimapTokensColorTracker extends Disposable {
    static { this._INSTANCE = null; }
    static getInstance() {
        if (!this._INSTANCE) {
            this._INSTANCE = markAsSingleton(new MinimapTokensColorTracker());
        }
        return this._INSTANCE;
    }
    constructor() {
        super();
        this._onDidChange = this._register(new Emitter());
        this.onDidChange = this._onDidChange.event;
        this._updateColorMap();
        this._register(TokenizationRegistry.onDidChange(e => {
            if (e.changedColorMap) {
                this._updateColorMap();
            }
        }));
    }
    _updateColorMap() {
        const colorMap = TokenizationRegistry.getColorMap();
        if (!colorMap) {
            this._colors = [];
            for (let i = 0; i <= 2 /* ColorId.DefaultBackground */; i++) {
                this._colors[i] = RGBA8.Empty;
            }
            this._backgroundIsLight = true;
            return;
        }
        this._colors = [RGBA8.Empty];
        for (let colorId = 1; colorId < colorMap.length; colorId++) {
            const source = colorMap[colorId].rgba;
            // Use a VM friendly data-type
            this._colors[colorId] = new RGBA8(source.r, source.g, source.b, Math.round(source.a * 255));
        }
        const backgroundLuminosity = colorMap[2 /* ColorId.DefaultBackground */].getRelativeLuminance();
        this._backgroundIsLight = backgroundLuminosity >= 0.5;
        this._onDidChange.fire(undefined);
    }
    getColor(colorId) {
        if (colorId < 1 || colorId >= this._colors.length) {
            // background color (basically invisible)
            colorId = 2 /* ColorId.DefaultBackground */;
        }
        let color = this._colors[colorId];
        if (!color) {
            onUnexpectedError(new BugIndicatingError(`Missing color for colorId ${colorId}`));
            color = RGBA8.Empty;
        }
        return color;
    }
    backgroundIsLight() {
        return this._backgroundIsLight;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWluaW1hcFRva2Vuc0NvbG9yVHJhY2tlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9jb21tb24vdmlld01vZGVsL21pbmltYXBUb2tlbnNDb2xvclRyYWNrZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLE9BQU8sRUFBUyxNQUFNLCtCQUErQixDQUFDO0FBQy9ELE9BQU8sRUFBRSxVQUFVLEVBQUUsZUFBZSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDaEYsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLHNCQUFzQixDQUFDO0FBQzdDLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLGlCQUFpQixDQUFDO0FBRXZELE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxpQkFBaUIsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBRXZGLE1BQU0sT0FBTyx5QkFBMEIsU0FBUSxVQUFVO2FBQ3pDLGNBQVMsR0FBcUMsSUFBSSxBQUF6QyxDQUEwQztJQUMzRCxNQUFNLENBQUMsV0FBVztRQUN4QixJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDO1lBQ3JCLElBQUksQ0FBQyxTQUFTLEdBQUcsZUFBZSxDQUFDLElBQUkseUJBQXlCLEVBQUUsQ0FBQyxDQUFDO1FBQ25FLENBQUM7UUFDRCxPQUFPLElBQUksQ0FBQyxTQUFTLENBQUM7SUFDdkIsQ0FBQztJQVFEO1FBQ0MsS0FBSyxFQUFFLENBQUM7UUFKUSxpQkFBWSxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxPQUFPLEVBQVEsQ0FBQyxDQUFDO1FBQ3BELGdCQUFXLEdBQWdCLElBQUksQ0FBQyxZQUFZLENBQUMsS0FBSyxDQUFDO1FBSWxFLElBQUksQ0FBQyxlQUFlLEVBQUUsQ0FBQztRQUN2QixJQUFJLENBQUMsU0FBUyxDQUFDLG9CQUFvQixDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsRUFBRTtZQUNuRCxJQUFJLENBQUMsQ0FBQyxlQUFlLEVBQUUsQ0FBQztnQkFDdkIsSUFBSSxDQUFDLGVBQWUsRUFBRSxDQUFDO1lBQ3hCLENBQUM7UUFDRixDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUVPLGVBQWU7UUFDdEIsTUFBTSxRQUFRLEdBQUcsb0JBQW9CLENBQUMsV0FBVyxFQUFFLENBQUM7UUFDcEQsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO1lBQ2YsSUFBSSxDQUFDLE9BQU8sR0FBRyxFQUFFLENBQUM7WUFDbEIsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxxQ0FBNkIsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO2dCQUNyRCxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUM7WUFDL0IsQ0FBQztZQUNELElBQUksQ0FBQyxrQkFBa0IsR0FBRyxJQUFJLENBQUM7WUFDL0IsT0FBTztRQUNSLENBQUM7UUFDRCxJQUFJLENBQUMsT0FBTyxHQUFHLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQzdCLEtBQUssSUFBSSxPQUFPLEdBQUcsQ0FBQyxFQUFFLE9BQU8sR0FBRyxRQUFRLENBQUMsTUFBTSxFQUFFLE9BQU8sRUFBRSxFQUFFLENBQUM7WUFDNUQsTUFBTSxNQUFNLEdBQUcsUUFBUSxDQUFDLE9BQU8sQ0FBQyxDQUFDLElBQUksQ0FBQztZQUN0Qyw4QkFBOEI7WUFDOUIsSUFBSSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsR0FBRyxJQUFJLEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxDQUFDLEVBQUUsTUFBTSxDQUFDLENBQUMsRUFBRSxJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFDLEdBQUcsR0FBRyxDQUFDLENBQUMsQ0FBQztRQUM3RixDQUFDO1FBQ0QsTUFBTSxvQkFBb0IsR0FBRyxRQUFRLG1DQUEyQixDQUFDLG9CQUFvQixFQUFFLENBQUM7UUFDeEYsSUFBSSxDQUFDLGtCQUFrQixHQUFHLG9CQUFvQixJQUFJLEdBQUcsQ0FBQztRQUN0RCxJQUFJLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQztJQUNuQyxDQUFDO0lBRU0sUUFBUSxDQUFDLE9BQWdCO1FBQy9CLElBQUksT0FBTyxHQUFHLENBQUMsSUFBSSxPQUFPLElBQUksSUFBSSxDQUFDLE9BQU8sQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUNuRCx5Q0FBeUM7WUFDekMsT0FBTyxvQ0FBNEIsQ0FBQztRQUNyQyxDQUFDO1FBQ0QsSUFBSSxLQUFLLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUNsQyxJQUFJLENBQUMsS0FBSyxFQUFFLENBQUM7WUFDWixpQkFBaUIsQ0FBQyxJQUFJLGtCQUFrQixDQUFDLDZCQUE2QixPQUFPLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDbEYsS0FBSyxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUM7UUFDckIsQ0FBQztRQUNELE9BQU8sS0FBSyxDQUFDO0lBQ2QsQ0FBQztJQUVNLGlCQUFpQjtRQUN2QixPQUFPLElBQUksQ0FBQyxrQkFBa0IsQ0FBQztJQUNoQyxDQUFDIn0=