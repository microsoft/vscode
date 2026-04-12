/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { clearNode } from '../../../base/browser/dom.js';
import { createCSSRule, createStyleSheet } from '../../../base/browser/domStylesheets.js';
import { RunOnceScheduler } from '../../../base/common/async.js';
export var ZIndex;
(function (ZIndex) {
    ZIndex[ZIndex["Base"] = 0] = "Base";
    ZIndex[ZIndex["Sash"] = 35] = "Sash";
    ZIndex[ZIndex["SuggestWidget"] = 40] = "SuggestWidget";
    ZIndex[ZIndex["Hover"] = 50] = "Hover";
    ZIndex[ZIndex["DragImage"] = 1000] = "DragImage";
    ZIndex[ZIndex["MenubarMenuItemsHolder"] = 2000] = "MenubarMenuItemsHolder";
    ZIndex[ZIndex["ContextView"] = 2500] = "ContextView";
    ZIndex[ZIndex["ModalDialog"] = 2600] = "ModalDialog";
    ZIndex[ZIndex["PaneDropOverlay"] = 10000] = "PaneDropOverlay";
})(ZIndex || (ZIndex = {}));
const ZIndexValues = Object.keys(ZIndex).filter(key => !isNaN(Number(key))).map(key => Number(key)).sort((a, b) => b - a);
function findBase(z) {
    for (const zi of ZIndexValues) {
        if (z >= zi) {
            return zi;
        }
    }
    return -1;
}
class ZIndexRegistry {
    constructor() {
        this.styleSheet = createStyleSheet();
        this.zIndexMap = new Map();
        this.scheduler = new RunOnceScheduler(() => this.updateStyleElement(), 200);
    }
    registerZIndex(relativeLayer, z, name) {
        if (this.zIndexMap.get(name)) {
            throw new Error(`z-index with name ${name} has already been registered.`);
        }
        const proposedZValue = relativeLayer + z;
        if (findBase(proposedZValue) !== relativeLayer) {
            throw new Error(`Relative layer: ${relativeLayer} + z-index: ${z} exceeds next layer ${proposedZValue}.`);
        }
        this.zIndexMap.set(name, proposedZValue);
        this.scheduler.schedule();
        return this.getVarName(name);
    }
    getVarName(name) {
        return `--z-index-${name}`;
    }
    updateStyleElement() {
        clearNode(this.styleSheet);
        let ruleBuilder = '';
        this.zIndexMap.forEach((zIndex, name) => {
            ruleBuilder += `${this.getVarName(name)}: ${zIndex};\n`;
        });
        createCSSRule(':root', ruleBuilder, this.styleSheet);
    }
}
const zIndexRegistry = new ZIndexRegistry();
export function registerZIndex(relativeLayer, z, name) {
    return zIndexRegistry.registerZIndex(relativeLayer, z, name);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiekluZGV4UmVnaXN0cnkuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9sYXlvdXQvYnJvd3Nlci96SW5kZXhSZWdpc3RyeS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFDekQsT0FBTyxFQUFFLGFBQWEsRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQzFGLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBRWpFLE1BQU0sQ0FBTixJQUFZLE1BVVg7QUFWRCxXQUFZLE1BQU07SUFDakIsbUNBQVEsQ0FBQTtJQUNSLG9DQUFTLENBQUE7SUFDVCxzREFBa0IsQ0FBQTtJQUNsQixzQ0FBVSxDQUFBO0lBQ1YsZ0RBQWdCLENBQUE7SUFDaEIsMEVBQTZCLENBQUE7SUFDN0Isb0RBQWtCLENBQUE7SUFDbEIsb0RBQWtCLENBQUE7SUFDbEIsNkRBQXVCLENBQUE7QUFDeEIsQ0FBQyxFQVZXLE1BQU0sS0FBTixNQUFNLFFBVWpCO0FBRUQsTUFBTSxZQUFZLEdBQUcsTUFBTSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztBQUMxSCxTQUFTLFFBQVEsQ0FBQyxDQUFTO0lBQzFCLEtBQUssTUFBTSxFQUFFLElBQUksWUFBWSxFQUFFLENBQUM7UUFDL0IsSUFBSSxDQUFDLElBQUksRUFBRSxFQUFFLENBQUM7WUFDYixPQUFPLEVBQUUsQ0FBQztRQUNYLENBQUM7SUFDRixDQUFDO0lBRUQsT0FBTyxDQUFDLENBQUMsQ0FBQztBQUNYLENBQUM7QUFFRCxNQUFNLGNBQWM7SUFJbkI7UUFDQyxJQUFJLENBQUMsVUFBVSxHQUFHLGdCQUFnQixFQUFFLENBQUM7UUFDckMsSUFBSSxDQUFDLFNBQVMsR0FBRyxJQUFJLEdBQUcsRUFBa0IsQ0FBQztRQUMzQyxJQUFJLENBQUMsU0FBUyxHQUFHLElBQUksZ0JBQWdCLENBQUMsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLGtCQUFrQixFQUFFLEVBQUUsR0FBRyxDQUFDLENBQUM7SUFDN0UsQ0FBQztJQUVELGNBQWMsQ0FBQyxhQUFxQixFQUFFLENBQVMsRUFBRSxJQUFZO1FBQzVELElBQUksSUFBSSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQztZQUM5QixNQUFNLElBQUksS0FBSyxDQUFDLHFCQUFxQixJQUFJLCtCQUErQixDQUFDLENBQUM7UUFDM0UsQ0FBQztRQUVELE1BQU0sY0FBYyxHQUFHLGFBQWEsR0FBRyxDQUFDLENBQUM7UUFDekMsSUFBSSxRQUFRLENBQUMsY0FBYyxDQUFDLEtBQUssYUFBYSxFQUFFLENBQUM7WUFDaEQsTUFBTSxJQUFJLEtBQUssQ0FBQyxtQkFBbUIsYUFBYSxlQUFlLENBQUMsdUJBQXVCLGNBQWMsR0FBRyxDQUFDLENBQUM7UUFDM0csQ0FBQztRQUVELElBQUksQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLElBQUksRUFBRSxjQUFjLENBQUMsQ0FBQztRQUN6QyxJQUFJLENBQUMsU0FBUyxDQUFDLFFBQVEsRUFBRSxDQUFDO1FBQzFCLE9BQU8sSUFBSSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUM5QixDQUFDO0lBRU8sVUFBVSxDQUFDLElBQVk7UUFDOUIsT0FBTyxhQUFhLElBQUksRUFBRSxDQUFDO0lBQzVCLENBQUM7SUFFTyxrQkFBa0I7UUFDekIsU0FBUyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUMzQixJQUFJLFdBQVcsR0FBRyxFQUFFLENBQUM7UUFDckIsSUFBSSxDQUFDLFNBQVMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxNQUFNLEVBQUUsSUFBSSxFQUFFLEVBQUU7WUFDdkMsV0FBVyxJQUFJLEdBQUcsSUFBSSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsS0FBSyxNQUFNLEtBQUssQ0FBQztRQUN6RCxDQUFDLENBQUMsQ0FBQztRQUNILGFBQWEsQ0FBQyxPQUFPLEVBQUUsV0FBVyxFQUFFLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQztJQUN0RCxDQUFDO0NBQ0Q7QUFFRCxNQUFNLGNBQWMsR0FBRyxJQUFJLGNBQWMsRUFBRSxDQUFDO0FBRTVDLE1BQU0sVUFBVSxjQUFjLENBQUMsYUFBcUIsRUFBRSxDQUFTLEVBQUUsSUFBWTtJQUM1RSxPQUFPLGNBQWMsQ0FBQyxjQUFjLENBQUMsYUFBYSxFQUFFLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQztBQUM5RCxDQUFDIn0=