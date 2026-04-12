/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { KeyCodeChord, Keybinding } from '../../../../base/common/keybindings.js';
import { USLayoutResolvedKeybinding } from '../../../../platform/keybinding/common/usLayoutResolvedKeybinding.js';
/**
 * A keyboard mapper to be used when reading the keymap from the OS fails.
 */
export class FallbackKeyboardMapper {
    constructor(_mapAltGrToCtrlAlt, _OS) {
        this._mapAltGrToCtrlAlt = _mapAltGrToCtrlAlt;
        this._OS = _OS;
    }
    dumpDebugInfo() {
        return 'FallbackKeyboardMapper dispatching on keyCode';
    }
    resolveKeyboardEvent(keyboardEvent) {
        const ctrlKey = keyboardEvent.ctrlKey || (this._mapAltGrToCtrlAlt && keyboardEvent.altGraphKey);
        const altKey = keyboardEvent.altKey || (this._mapAltGrToCtrlAlt && keyboardEvent.altGraphKey);
        const chord = new KeyCodeChord(ctrlKey, keyboardEvent.shiftKey, altKey, keyboardEvent.metaKey, keyboardEvent.keyCode);
        const result = this.resolveKeybinding(new Keybinding([chord]));
        return result[0];
    }
    resolveKeybinding(keybinding) {
        return USLayoutResolvedKeybinding.resolveKeybinding(keybinding, this._OS);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZmFsbGJhY2tLZXlib2FyZE1hcHBlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9rZXliaW5kaW5nL2NvbW1vbi9mYWxsYmFja0tleWJvYXJkTWFwcGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBc0IsWUFBWSxFQUFFLFVBQVUsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBR3RHLE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxNQUFNLHNFQUFzRSxDQUFDO0FBR2xIOztHQUVHO0FBQ0gsTUFBTSxPQUFPLHNCQUFzQjtJQUVsQyxZQUNrQixrQkFBMkIsRUFDM0IsR0FBb0I7UUFEcEIsdUJBQWtCLEdBQWxCLGtCQUFrQixDQUFTO1FBQzNCLFFBQUcsR0FBSCxHQUFHLENBQWlCO0lBQ2xDLENBQUM7SUFFRSxhQUFhO1FBQ25CLE9BQU8sK0NBQStDLENBQUM7SUFDeEQsQ0FBQztJQUVNLG9CQUFvQixDQUFDLGFBQTZCO1FBQ3hELE1BQU0sT0FBTyxHQUFHLGFBQWEsQ0FBQyxPQUFPLElBQUksQ0FBQyxJQUFJLENBQUMsa0JBQWtCLElBQUksYUFBYSxDQUFDLFdBQVcsQ0FBQyxDQUFDO1FBQ2hHLE1BQU0sTUFBTSxHQUFHLGFBQWEsQ0FBQyxNQUFNLElBQUksQ0FBQyxJQUFJLENBQUMsa0JBQWtCLElBQUksYUFBYSxDQUFDLFdBQVcsQ0FBQyxDQUFDO1FBQzlGLE1BQU0sS0FBSyxHQUFHLElBQUksWUFBWSxDQUM3QixPQUFPLEVBQ1AsYUFBYSxDQUFDLFFBQVEsRUFDdEIsTUFBTSxFQUNOLGFBQWEsQ0FBQyxPQUFPLEVBQ3JCLGFBQWEsQ0FBQyxPQUFPLENBQ3JCLENBQUM7UUFDRixNQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsaUJBQWlCLENBQUMsSUFBSSxVQUFVLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDL0QsT0FBTyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDbEIsQ0FBQztJQUVNLGlCQUFpQixDQUFDLFVBQXNCO1FBQzlDLE9BQU8sMEJBQTBCLENBQUMsaUJBQWlCLENBQUMsVUFBVSxFQUFFLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztJQUMzRSxDQUFDO0NBQ0QifQ==