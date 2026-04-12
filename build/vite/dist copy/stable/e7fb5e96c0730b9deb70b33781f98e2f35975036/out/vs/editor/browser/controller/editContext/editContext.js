/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Emitter } from '../../../../base/common/event.js';
import { ViewPart } from '../../view/viewPart.js';
export class AbstractEditContext extends ViewPart {
    constructor() {
        super(...arguments);
        // Clipboard events - emitted before the default clipboard handling
        this._onWillCopy = this._register(new Emitter());
        this.onWillCopy = this._onWillCopy.event;
        this._onWillCut = this._register(new Emitter());
        this.onWillCut = this._onWillCut.event;
        this._onWillPaste = this._register(new Emitter());
        this.onWillPaste = this._onWillPaste.event;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWRpdENvbnRleHQuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvYnJvd3Nlci9jb250cm9sbGVyL2VkaXRDb250ZXh0L2VkaXRDb250ZXh0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBR2hHLE9BQU8sRUFBRSxPQUFPLEVBQVMsTUFBTSxrQ0FBa0MsQ0FBQztBQUdsRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sd0JBQXdCLENBQUM7QUFHbEQsTUFBTSxPQUFnQixtQkFBb0IsU0FBUSxRQUFRO0lBQTFEOztRQVNDLG1FQUFtRTtRQUNoRCxnQkFBVyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxPQUFPLEVBQXVCLENBQUMsQ0FBQztRQUNwRSxlQUFVLEdBQStCLElBQUksQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDO1FBRTdELGVBQVUsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksT0FBTyxFQUF1QixDQUFDLENBQUM7UUFDbkUsY0FBUyxHQUErQixJQUFJLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQztRQUUzRCxpQkFBWSxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxPQUFPLEVBQXdCLENBQUMsQ0FBQztRQUN0RSxnQkFBVyxHQUFnQyxJQUFJLENBQUMsWUFBWSxDQUFDLEtBQUssQ0FBQztJQUNwRixDQUFDO0NBQUEifQ==