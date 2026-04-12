/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ViewPart } from '../../view/viewPart.js';
import { Color } from '../../../../base/common/color.js';
import { editorRuler } from '../../../common/core/editorColorRegistry.js';
import { autorun } from '../../../../base/common/observable.js';
/**
 * Rulers are vertical lines that appear at certain columns in the editor. There can be >= 0 rulers
 * at a time.
 */
export class RulersGpu extends ViewPart {
    constructor(context, _viewGpuContext) {
        super(context);
        this._viewGpuContext = _viewGpuContext;
        this._gpuShapes = [];
        this._register(autorun(reader => this._updateEntries(reader)));
    }
    // --- begin event handlers
    onConfigurationChanged(e) {
        this._updateEntries(undefined);
        return true;
    }
    // --- end event handlers
    prepareRender(ctx) {
        // Nothing to read
    }
    render(ctx) {
        // Rendering is handled by RectangleRenderer
    }
    _updateEntries(reader) {
        const options = this._context.configuration.options;
        const rulers = options.get(116 /* EditorOption.rulers */);
        const typicalHalfwidthCharacterWidth = options.get(59 /* EditorOption.fontInfo */).typicalHalfwidthCharacterWidth;
        const devicePixelRatio = this._viewGpuContext.devicePixelRatio.read(reader);
        for (let i = 0, len = rulers.length; i < len; i++) {
            const ruler = rulers[i];
            const shape = this._gpuShapes[i];
            const color = ruler.color ? Color.fromHex(ruler.color) : this._context.theme.getColor(editorRuler) ?? Color.white;
            const rulerData = [
                ruler.column * typicalHalfwidthCharacterWidth * devicePixelRatio,
                0,
                Math.max(1, Math.ceil(devicePixelRatio)),
                Number.MAX_SAFE_INTEGER,
                color.rgba.r / 255,
                color.rgba.g / 255,
                color.rgba.b / 255,
                color.rgba.a,
            ];
            if (!shape) {
                this._gpuShapes[i] = this._viewGpuContext.rectangleRenderer.register(...rulerData);
            }
            else {
                shape.setRaw(rulerData);
            }
        }
        while (this._gpuShapes.length > rulers.length) {
            this._gpuShapes.splice(-1, 1)[0].dispose();
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicnVsZXJzR3B1LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2Jyb3dzZXIvdmlld1BhcnRzL3J1bGVyc0dwdS9ydWxlcnNHcHUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHdCQUF3QixDQUFDO0FBUWxELE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUN6RCxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDMUUsT0FBTyxFQUFFLE9BQU8sRUFBZ0IsTUFBTSx1Q0FBdUMsQ0FBQztBQUU5RTs7O0dBR0c7QUFDSCxNQUFNLE9BQU8sU0FBVSxTQUFRLFFBQVE7SUFJdEMsWUFDQyxPQUFvQixFQUNILGVBQStCO1FBRWhELEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUZFLG9CQUFlLEdBQWYsZUFBZSxDQUFnQjtRQUpoQyxlQUFVLEdBQStELEVBQUUsQ0FBQztRQU81RixJQUFJLENBQUMsU0FBUyxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ2hFLENBQUM7SUFFRCwyQkFBMkI7SUFFWCxzQkFBc0IsQ0FBQyxDQUEyQztRQUNqRixJQUFJLENBQUMsY0FBYyxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQy9CLE9BQU8sSUFBSSxDQUFDO0lBQ2IsQ0FBQztJQUVELHlCQUF5QjtJQUVsQixhQUFhLENBQUMsR0FBcUI7UUFDekMsa0JBQWtCO0lBQ25CLENBQUM7SUFFTSxNQUFNLENBQUMsR0FBK0I7UUFDNUMsNENBQTRDO0lBQzdDLENBQUM7SUFFTyxjQUFjLENBQUMsTUFBMkI7UUFDakQsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxhQUFhLENBQUMsT0FBTyxDQUFDO1FBQ3BELE1BQU0sTUFBTSxHQUFHLE9BQU8sQ0FBQyxHQUFHLCtCQUFxQixDQUFDO1FBQ2hELE1BQU0sOEJBQThCLEdBQUcsT0FBTyxDQUFDLEdBQUcsZ0NBQXVCLENBQUMsOEJBQThCLENBQUM7UUFDekcsTUFBTSxnQkFBZ0IsR0FBRyxJQUFJLENBQUMsZUFBZSxDQUFDLGdCQUFnQixDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUM1RSxLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxHQUFHLEdBQUcsTUFBTSxDQUFDLE1BQU0sRUFBRSxDQUFDLEdBQUcsR0FBRyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDbkQsTUFBTSxLQUFLLEdBQUcsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ3hCLE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDakMsTUFBTSxLQUFLLEdBQUcsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxXQUFXLENBQUMsSUFBSSxLQUFLLENBQUMsS0FBSyxDQUFDO1lBQ2xILE1BQU0sU0FBUyxHQUE4QztnQkFDNUQsS0FBSyxDQUFDLE1BQU0sR0FBRyw4QkFBOEIsR0FBRyxnQkFBZ0I7Z0JBQ2hFLENBQUM7Z0JBQ0QsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUUsSUFBSSxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO2dCQUN4QyxNQUFNLENBQUMsZ0JBQWdCO2dCQUN2QixLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsR0FBRyxHQUFHO2dCQUNsQixLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsR0FBRyxHQUFHO2dCQUNsQixLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsR0FBRyxHQUFHO2dCQUNsQixLQUFLLENBQUMsSUFBSSxDQUFDLENBQUM7YUFDWixDQUFDO1lBQ0YsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO2dCQUNaLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLEdBQUcsSUFBSSxDQUFDLGVBQWUsQ0FBQyxpQkFBaUIsQ0FBQyxRQUFRLENBQUMsR0FBRyxTQUFTLENBQUMsQ0FBQztZQUNwRixDQUFDO2lCQUFNLENBQUM7Z0JBQ1AsS0FBSyxDQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUMsQ0FBQztZQUN6QixDQUFDO1FBQ0YsQ0FBQztRQUNELE9BQU8sSUFBSSxDQUFDLFVBQVUsQ0FBQyxNQUFNLEdBQUcsTUFBTSxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQy9DLElBQUksQ0FBQyxVQUFVLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQzVDLENBQUM7SUFDRixDQUFDO0NBQ0QifQ==