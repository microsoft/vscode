/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { NKeyMap } from '../../../../base/common/map.js';
export class DecorationStyleCache {
    constructor() {
        this._nextId = 1;
        this._cacheById = new Map();
        this._cacheByStyle = new NKeyMap();
    }
    getOrCreateEntry(color, bold, opacity, strikethrough, strikethroughThickness, strikethroughColor) {
        if (color === undefined && bold === undefined && opacity === undefined && strikethrough === undefined && strikethroughThickness === undefined && strikethroughColor === undefined) {
            return 0;
        }
        const result = this._cacheByStyle.get(color ?? 0, bold ? 1 : 0, opacity === undefined ? '' : opacity.toFixed(2), strikethrough ? 1 : 0, strikethroughThickness === undefined ? '' : strikethroughThickness.toFixed(2), strikethroughColor ?? 0);
        if (result) {
            return result.id;
        }
        const id = this._nextId++;
        const entry = {
            id,
            color,
            bold,
            opacity,
            strikethrough,
            strikethroughThickness,
            strikethroughColor,
        };
        this._cacheById.set(id, entry);
        this._cacheByStyle.set(entry, color ?? 0, bold ? 1 : 0, opacity === undefined ? '' : opacity.toFixed(2), strikethrough ? 1 : 0, strikethroughThickness === undefined ? '' : strikethroughThickness.toFixed(2), strikethroughColor ?? 0);
        return id;
    }
    getStyleSet(id) {
        if (id === 0) {
            return undefined;
        }
        return this._cacheById.get(id);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVjb3JhdGlvblN0eWxlQ2FjaGUuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvYnJvd3Nlci9ncHUvY3NzL2RlY29yYXRpb25TdHlsZUNhY2hlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQW9DekQsTUFBTSxPQUFPLG9CQUFvQjtJQUFqQztRQUVTLFlBQU8sR0FBRyxDQUFDLENBQUM7UUFFSCxlQUFVLEdBQUcsSUFBSSxHQUFHLEVBQXNDLENBQUM7UUFDM0Qsa0JBQWEsR0FBRyxJQUFJLE9BQU8sRUFBZ0YsQ0FBQztJQW9EOUgsQ0FBQztJQWxEQSxnQkFBZ0IsQ0FDZixLQUF5QixFQUN6QixJQUF5QixFQUN6QixPQUEyQixFQUMzQixhQUFrQyxFQUNsQyxzQkFBMEMsRUFDMUMsa0JBQXNDO1FBRXRDLElBQUksS0FBSyxLQUFLLFNBQVMsSUFBSSxJQUFJLEtBQUssU0FBUyxJQUFJLE9BQU8sS0FBSyxTQUFTLElBQUksYUFBYSxLQUFLLFNBQVMsSUFBSSxzQkFBc0IsS0FBSyxTQUFTLElBQUksa0JBQWtCLEtBQUssU0FBUyxFQUFFLENBQUM7WUFDbkwsT0FBTyxDQUFDLENBQUM7UUFDVixDQUFDO1FBQ0QsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLGFBQWEsQ0FBQyxHQUFHLENBQ3BDLEtBQUssSUFBSSxDQUFDLEVBQ1YsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFDWixPQUFPLEtBQUssU0FBUyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLEVBQy9DLGFBQWEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQ3JCLHNCQUFzQixLQUFLLFNBQVMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxzQkFBc0IsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLEVBQzdFLGtCQUFrQixJQUFJLENBQUMsQ0FDdkIsQ0FBQztRQUNGLElBQUksTUFBTSxFQUFFLENBQUM7WUFDWixPQUFPLE1BQU0sQ0FBQyxFQUFFLENBQUM7UUFDbEIsQ0FBQztRQUNELE1BQU0sRUFBRSxHQUFHLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUMxQixNQUFNLEtBQUssR0FBK0I7WUFDekMsRUFBRTtZQUNGLEtBQUs7WUFDTCxJQUFJO1lBQ0osT0FBTztZQUNQLGFBQWE7WUFDYixzQkFBc0I7WUFDdEIsa0JBQWtCO1NBQ2xCLENBQUM7UUFDRixJQUFJLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDL0IsSUFBSSxDQUFDLGFBQWEsQ0FBQyxHQUFHLENBQUMsS0FBSyxFQUMzQixLQUFLLElBQUksQ0FBQyxFQUNWLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQ1osT0FBTyxLQUFLLFNBQVMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxFQUMvQyxhQUFhLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUNyQixzQkFBc0IsS0FBSyxTQUFTLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsc0JBQXNCLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxFQUM3RSxrQkFBa0IsSUFBSSxDQUFDLENBQ3ZCLENBQUM7UUFDRixPQUFPLEVBQUUsQ0FBQztJQUNYLENBQUM7SUFFRCxXQUFXLENBQUMsRUFBVTtRQUNyQixJQUFJLEVBQUUsS0FBSyxDQUFDLEVBQUUsQ0FBQztZQUNkLE9BQU8sU0FBUyxDQUFDO1FBQ2xCLENBQUM7UUFDRCxPQUFPLElBQUksQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxDQUFDO0lBQ2hDLENBQUM7Q0FDRCJ9