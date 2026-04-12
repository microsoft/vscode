/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { URI } from '../../../../../base/common/uri.js';
export function isChatViewTitleActionContext(obj) {
    return !!obj &&
        URI.isUri(obj.sessionResource)
        && obj.$mid === 19 /* MarshalledId.ChatViewContext */;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdEFjdGlvbnMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9hY3Rpb25zL2NoYXRBY3Rpb25zLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBR2hHLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQU94RCxNQUFNLFVBQVUsNEJBQTRCLENBQUMsR0FBWTtJQUN4RCxPQUFPLENBQUMsQ0FBQyxHQUFHO1FBQ1gsR0FBRyxDQUFDLEtBQUssQ0FBRSxHQUFtQyxDQUFDLGVBQWUsQ0FBQztXQUMzRCxHQUFtQyxDQUFDLElBQUksMENBQWlDLENBQUM7QUFDaEYsQ0FBQyJ9