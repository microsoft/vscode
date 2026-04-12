/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { VSBuffer } from '../../../../base/common/buffer.js';
export var UIKind;
(function (UIKind) {
    UIKind[UIKind["Desktop"] = 1] = "Desktop";
    UIKind[UIKind["Web"] = 2] = "Web";
})(UIKind || (UIKind = {}));
export var ExtensionHostExitCode;
(function (ExtensionHostExitCode) {
    // nodejs uses codes 1-13 and exit codes >128 are signal exits
    ExtensionHostExitCode[ExtensionHostExitCode["VersionMismatch"] = 55] = "VersionMismatch";
    ExtensionHostExitCode[ExtensionHostExitCode["UnexpectedError"] = 81] = "UnexpectedError";
})(ExtensionHostExitCode || (ExtensionHostExitCode = {}));
export var MessageType;
(function (MessageType) {
    MessageType[MessageType["Initialized"] = 0] = "Initialized";
    MessageType[MessageType["Ready"] = 1] = "Ready";
    MessageType[MessageType["Terminate"] = 2] = "Terminate";
})(MessageType || (MessageType = {}));
export function createMessageOfType(type) {
    const result = VSBuffer.alloc(1);
    switch (type) {
        case 0 /* MessageType.Initialized */:
            result.writeUInt8(1, 0);
            break;
        case 1 /* MessageType.Ready */:
            result.writeUInt8(2, 0);
            break;
        case 2 /* MessageType.Terminate */:
            result.writeUInt8(3, 0);
            break;
    }
    return result;
}
export function isMessageOfType(message, type) {
    if (message.byteLength !== 1) {
        return false;
    }
    switch (message.readUInt8(0)) {
        case 1: return type === 0 /* MessageType.Initialized */;
        case 2: return type === 1 /* MessageType.Ready */;
        case 3: return type === 2 /* MessageType.Terminate */;
        default: return false;
    }
}
export var NativeLogMarkers;
(function (NativeLogMarkers) {
    NativeLogMarkers["Start"] = "START_NATIVE_LOG";
    NativeLogMarkers["End"] = "END_NATIVE_LOG";
})(NativeLogMarkers || (NativeLogMarkers = {}));
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9uSG9zdFByb3RvY29sLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbkhvc3RQcm90b2NvbC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUEwRjdELE1BQU0sQ0FBTixJQUFZLE1BR1g7QUFIRCxXQUFZLE1BQU07SUFDakIseUNBQVcsQ0FBQTtJQUNYLGlDQUFPLENBQUE7QUFDUixDQUFDLEVBSFcsTUFBTSxLQUFOLE1BQU0sUUFHakI7QUFFRCxNQUFNLENBQU4sSUFBa0IscUJBSWpCO0FBSkQsV0FBa0IscUJBQXFCO0lBQ3RDLDhEQUE4RDtJQUM5RCx3RkFBb0IsQ0FBQTtJQUNwQix3RkFBb0IsQ0FBQTtBQUNyQixDQUFDLEVBSmlCLHFCQUFxQixLQUFyQixxQkFBcUIsUUFJdEM7QUFrQkQsTUFBTSxDQUFOLElBQWtCLFdBSWpCO0FBSkQsV0FBa0IsV0FBVztJQUM1QiwyREFBVyxDQUFBO0lBQ1gsK0NBQUssQ0FBQTtJQUNMLHVEQUFTLENBQUE7QUFDVixDQUFDLEVBSmlCLFdBQVcsS0FBWCxXQUFXLFFBSTVCO0FBRUQsTUFBTSxVQUFVLG1CQUFtQixDQUFDLElBQWlCO0lBQ3BELE1BQU0sTUFBTSxHQUFHLFFBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFFakMsUUFBUSxJQUFJLEVBQUUsQ0FBQztRQUNkO1lBQThCLE1BQU0sQ0FBQyxVQUFVLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQUMsTUFBTTtRQUM3RDtZQUF3QixNQUFNLENBQUMsVUFBVSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztZQUFDLE1BQU07UUFDdkQ7WUFBNEIsTUFBTSxDQUFDLFVBQVUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFBQyxNQUFNO0lBQzVELENBQUM7SUFFRCxPQUFPLE1BQU0sQ0FBQztBQUNmLENBQUM7QUFFRCxNQUFNLFVBQVUsZUFBZSxDQUFDLE9BQWlCLEVBQUUsSUFBaUI7SUFDbkUsSUFBSSxPQUFPLENBQUMsVUFBVSxLQUFLLENBQUMsRUFBRSxDQUFDO1FBQzlCLE9BQU8sS0FBSyxDQUFDO0lBQ2QsQ0FBQztJQUVELFFBQVEsT0FBTyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO1FBQzlCLEtBQUssQ0FBQyxDQUFDLENBQUMsT0FBTyxJQUFJLG9DQUE0QixDQUFDO1FBQ2hELEtBQUssQ0FBQyxDQUFDLENBQUMsT0FBTyxJQUFJLDhCQUFzQixDQUFDO1FBQzFDLEtBQUssQ0FBQyxDQUFDLENBQUMsT0FBTyxJQUFJLGtDQUEwQixDQUFDO1FBQzlDLE9BQU8sQ0FBQyxDQUFDLE9BQU8sS0FBSyxDQUFDO0lBQ3ZCLENBQUM7QUFDRixDQUFDO0FBRUQsTUFBTSxDQUFOLElBQWtCLGdCQUdqQjtBQUhELFdBQWtCLGdCQUFnQjtJQUNqQyw4Q0FBMEIsQ0FBQTtJQUMxQiwwQ0FBc0IsQ0FBQTtBQUN2QixDQUFDLEVBSGlCLGdCQUFnQixLQUFoQixnQkFBZ0IsUUFHakMifQ==