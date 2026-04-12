/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Emitter } from '../../../../../../base/common/event.js';
import { XtermAddonImporter } from '../../../browser/xterm/xtermAddonImporter.js';
export class TestWebglAddon {
    static { this.shouldThrow = false; }
    static { this.isEnabled = false; }
    constructor(preserveDrawingBuffer) {
        this._onChangeTextureAtlas = new Emitter();
        this._onAddTextureAtlasCanvas = new Emitter();
        this._onRemoveTextureAtlasCanvas = new Emitter();
        this._onContextLoss = new Emitter();
        this.onChangeTextureAtlas = this._onChangeTextureAtlas.event;
        this.onAddTextureAtlasCanvas = this._onAddTextureAtlasCanvas.event;
        this.onRemoveTextureAtlasCanvas = this._onRemoveTextureAtlasCanvas.event;
        this.onContextLoss = this._onContextLoss.event;
    }
    activate() {
        TestWebglAddon.isEnabled = !TestWebglAddon.shouldThrow;
        if (TestWebglAddon.shouldThrow) {
            throw new Error('Test webgl set to throw');
        }
    }
    dispose() {
        TestWebglAddon.isEnabled = false;
        this._onChangeTextureAtlas.dispose();
        this._onAddTextureAtlasCanvas.dispose();
        this._onRemoveTextureAtlasCanvas.dispose();
        this._onContextLoss.dispose();
    }
    clearTextureAtlas() { }
}
export class TestXtermAddonImporter extends XtermAddonImporter {
    async importAddon(name) {
        if (name === 'webgl') {
            return TestWebglAddon;
        }
        return super.importAddon(name);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoieHRlcm1UZXN0VXRpbHMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi90ZXJtaW5hbC90ZXN0L2Jyb3dzZXIveHRlcm0veHRlcm1UZXN0VXRpbHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFJaEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ2pFLE9BQU8sRUFBRSxrQkFBa0IsRUFBOEIsTUFBTSw4Q0FBOEMsQ0FBQztBQUU5RyxNQUFNLE9BQU8sY0FBYzthQUNuQixnQkFBVyxHQUFHLEtBQUssQUFBUixDQUFTO2FBQ3BCLGNBQVMsR0FBRyxLQUFLLEFBQVIsQ0FBUztJQVN6QixZQUFZLHFCQUErQjtRQVIxQiwwQkFBcUIsR0FBRyxJQUFJLE9BQU8sRUFBcUIsQ0FBQztRQUN6RCw2QkFBd0IsR0FBRyxJQUFJLE9BQU8sRUFBcUIsQ0FBQztRQUM1RCxnQ0FBMkIsR0FBRyxJQUFJLE9BQU8sRUFBcUIsQ0FBQztRQUMvRCxtQkFBYyxHQUFHLElBQUksT0FBTyxFQUFRLENBQUM7UUFDN0MseUJBQW9CLEdBQUcsSUFBSSxDQUFDLHFCQUFxQixDQUFDLEtBQWtDLENBQUM7UUFDckYsNEJBQXVCLEdBQUcsSUFBSSxDQUFDLHdCQUF3QixDQUFDLEtBQWtDLENBQUM7UUFDM0YsK0JBQTBCLEdBQUcsSUFBSSxDQUFDLDJCQUEyQixDQUFDLEtBQXdDLENBQUM7UUFDdkcsa0JBQWEsR0FBRyxJQUFJLENBQUMsY0FBYyxDQUFDLEtBQXFCLENBQUM7SUFFbkUsQ0FBQztJQUNELFFBQVE7UUFDUCxjQUFjLENBQUMsU0FBUyxHQUFHLENBQUMsY0FBYyxDQUFDLFdBQVcsQ0FBQztRQUN2RCxJQUFJLGNBQWMsQ0FBQyxXQUFXLEVBQUUsQ0FBQztZQUNoQyxNQUFNLElBQUksS0FBSyxDQUFDLHlCQUF5QixDQUFDLENBQUM7UUFDNUMsQ0FBQztJQUNGLENBQUM7SUFDRCxPQUFPO1FBQ04sY0FBYyxDQUFDLFNBQVMsR0FBRyxLQUFLLENBQUM7UUFDakMsSUFBSSxDQUFDLHFCQUFxQixDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ3JDLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUN4QyxJQUFJLENBQUMsMkJBQTJCLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDM0MsSUFBSSxDQUFDLGNBQWMsQ0FBQyxPQUFPLEVBQUUsQ0FBQztJQUMvQixDQUFDO0lBQ0QsaUJBQWlCLEtBQVcsQ0FBQzs7QUFHOUIsTUFBTSxPQUFPLHNCQUF1QixTQUFRLGtCQUFrQjtJQUNwRCxLQUFLLENBQUMsV0FBVyxDQUF3QyxJQUFPO1FBQ3hFLElBQUksSUFBSSxLQUFLLE9BQU8sRUFBRSxDQUFDO1lBQ3RCLE9BQU8sY0FBcUQsQ0FBQztRQUM5RCxDQUFDO1FBQ0QsT0FBTyxLQUFLLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQ2hDLENBQUM7Q0FDRCJ9