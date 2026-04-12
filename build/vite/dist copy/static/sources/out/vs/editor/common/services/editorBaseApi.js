/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { CancellationTokenSource } from '../../../base/common/cancellation.js';
import { Emitter } from '../../../base/common/event.js';
import { KeyChord } from '../../../base/common/keyCodes.js';
import { URI } from '../../../base/common/uri.js';
import { Position } from '../core/position.js';
import { Range } from '../core/range.js';
import { Selection } from '../core/selection.js';
import { Token } from '../languages.js';
import * as standaloneEnums from '../standalone/standaloneEnums.js';
export class KeyMod {
    static { this.CtrlCmd = 2048 /* ConstKeyMod.CtrlCmd */; }
    static { this.Shift = 1024 /* ConstKeyMod.Shift */; }
    static { this.Alt = 512 /* ConstKeyMod.Alt */; }
    static { this.WinCtrl = 256 /* ConstKeyMod.WinCtrl */; }
    static chord(firstPart, secondPart) {
        return KeyChord(firstPart, secondPart);
    }
}
export function createMonacoBaseAPI() {
    return {
        editor: undefined, // undefined override expected here
        languages: undefined, // undefined override expected here
        CancellationTokenSource: CancellationTokenSource,
        Emitter: Emitter,
        KeyCode: standaloneEnums.KeyCode,
        KeyMod: KeyMod,
        Position: Position,
        Range: Range,
        Selection: Selection,
        SelectionDirection: standaloneEnums.SelectionDirection,
        MarkerSeverity: standaloneEnums.MarkerSeverity,
        MarkerTag: standaloneEnums.MarkerTag,
        Uri: URI,
        Token: Token
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWRpdG9yQmFzZUFwaS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9jb21tb24vc2VydmljZXMvZWRpdG9yQmFzZUFwaS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUMvRSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDeEQsT0FBTyxFQUFFLFFBQVEsRUFBeUIsTUFBTSxrQ0FBa0MsQ0FBQztBQUNuRixPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFDbEQsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHFCQUFxQixDQUFDO0FBQy9DLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxrQkFBa0IsQ0FBQztBQUN6QyxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sc0JBQXNCLENBQUM7QUFDakQsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLGlCQUFpQixDQUFDO0FBQ3hDLE9BQU8sS0FBSyxlQUFlLE1BQU0sa0NBQWtDLENBQUM7QUFFcEUsTUFBTSxPQUFPLE1BQU07YUFDSyxZQUFPLGtDQUErQjthQUN0QyxVQUFLLGdDQUE2QjthQUNsQyxRQUFHLDZCQUEyQjthQUM5QixZQUFPLGlDQUErQjtJQUV0RCxNQUFNLENBQUMsS0FBSyxDQUFDLFNBQWlCLEVBQUUsVUFBa0I7UUFDeEQsT0FBTyxRQUFRLENBQUMsU0FBUyxFQUFFLFVBQVUsQ0FBQyxDQUFDO0lBQ3hDLENBQUM7O0FBR0YsTUFBTSxVQUFVLG1CQUFtQjtJQUNsQyxPQUFPO1FBQ04sTUFBTSxFQUFFLFNBQVUsRUFBRSxtQ0FBbUM7UUFDdkQsU0FBUyxFQUFFLFNBQVUsRUFBRSxtQ0FBbUM7UUFDMUQsdUJBQXVCLEVBQUUsdUJBQXVCO1FBQ2hELE9BQU8sRUFBRSxPQUFPO1FBQ2hCLE9BQU8sRUFBRSxlQUFlLENBQUMsT0FBTztRQUNoQyxNQUFNLEVBQUUsTUFBTTtRQUNkLFFBQVEsRUFBRSxRQUFRO1FBQ2xCLEtBQUssRUFBRSxLQUFLO1FBQ1osU0FBUyxFQUFFLFNBQStDO1FBQzFELGtCQUFrQixFQUFFLGVBQWUsQ0FBQyxrQkFBa0I7UUFDdEQsY0FBYyxFQUFFLGVBQWUsQ0FBQyxjQUFjO1FBQzlDLFNBQVMsRUFBRSxlQUFlLENBQUMsU0FBUztRQUNwQyxHQUFHLEVBQUUsR0FBbUM7UUFDeEMsS0FBSyxFQUFFLEtBQUs7S0FDWixDQUFDO0FBQ0gsQ0FBQyJ9