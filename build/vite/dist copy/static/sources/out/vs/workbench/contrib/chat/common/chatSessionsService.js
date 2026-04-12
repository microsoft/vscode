/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
export var ChatSessionStatus;
(function (ChatSessionStatus) {
    ChatSessionStatus[ChatSessionStatus["Failed"] = 0] = "Failed";
    ChatSessionStatus[ChatSessionStatus["Completed"] = 1] = "Completed";
    ChatSessionStatus[ChatSessionStatus["InProgress"] = 2] = "InProgress";
    ChatSessionStatus[ChatSessionStatus["NeedsInput"] = 3] = "NeedsInput";
})(ChatSessionStatus || (ChatSessionStatus = {}));
/**
 * The session type used for local agent chat sessions.
 */
export const localChatSessionType = 'local';
export var ChatSessionOptionsMap;
(function (ChatSessionOptionsMap) {
    function fromRecord(obj) {
        return new Map(Object.entries(obj));
    }
    ChatSessionOptionsMap.fromRecord = fromRecord;
    function toRecord(map) {
        const record = Object.create(null);
        const entries = ensureIterable(map);
        for (const [key, value] of entries) {
            record[key] = value;
        }
        return record;
    }
    ChatSessionOptionsMap.toRecord = toRecord;
    function toStrValueArray(map) {
        if (!map) {
            return undefined;
        }
        const entries = ensureIterable(map);
        return Array.from(entries, ([optionId, value]) => ({ optionId, value: typeof value === 'string' ? value : value.id }));
    }
    ChatSessionOptionsMap.toStrValueArray = toStrValueArray;
    /**
     * Ensures the input is iterable. If a plain object is passed (e.g. due to
     * serialization across process boundaries losing the Map prototype), it is
     * converted to Map entries on the fly.
     */
    function ensureIterable(map) {
        if (map instanceof Map) {
            return map;
        }
        // Fallback: treat as a plain record (e.g. from JSON deserialization)
        return Object.entries(map);
    }
})(ChatSessionOptionsMap || (ChatSessionOptionsMap = {}));
export const IChatSessionsService = createDecorator('chatSessionsService');
export function isSessionInProgressStatus(state) {
    return state === 2 /* ChatSessionStatus.InProgress */ || state === 3 /* ChatSessionStatus.NeedsInput */;
}
export function isIChatSessionFileChange2(obj) {
    const candidate = obj;
    return candidate && candidate.uri instanceof URI && typeof candidate.insertions === 'number' && typeof candidate.deletions === 'number';
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFNlc3Npb25zU2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2NoYXRTZXNzaW9uc1NlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFRaEcsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ3JELE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQU83RixNQUFNLENBQU4sSUFBa0IsaUJBS2pCO0FBTEQsV0FBa0IsaUJBQWlCO0lBQ2xDLDZEQUFVLENBQUE7SUFDVixtRUFBYSxDQUFBO0lBQ2IscUVBQWMsQ0FBQTtJQUNkLHFFQUFjLENBQUE7QUFDZixDQUFDLEVBTGlCLGlCQUFpQixLQUFqQixpQkFBaUIsUUFLbEM7QUFxSUQ7O0dBRUc7QUFDSCxNQUFNLENBQUMsTUFBTSxvQkFBb0IsR0FBRyxPQUFPLENBQUM7QUErRjVDLE1BQU0sS0FBVyxxQkFBcUIsQ0FrQ3JDO0FBbENELFdBQWlCLHFCQUFxQjtJQUNyQyxTQUFnQixVQUFVLENBQUMsR0FBK0Q7UUFDekYsT0FBTyxJQUFJLEdBQUcsQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7SUFDckMsQ0FBQztJQUZlLGdDQUFVLGFBRXpCLENBQUE7SUFFRCxTQUFnQixRQUFRLENBQUMsR0FBa0M7UUFDMUQsTUFBTSxNQUFNLEdBQTRELE1BQU0sQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDNUYsTUFBTSxPQUFPLEdBQUcsY0FBYyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ3BDLEtBQUssTUFBTSxDQUFDLEdBQUcsRUFBRSxLQUFLLENBQUMsSUFBSSxPQUFPLEVBQUUsQ0FBQztZQUNwQyxNQUFNLENBQUMsR0FBRyxDQUFDLEdBQUcsS0FBSyxDQUFDO1FBQ3JCLENBQUM7UUFDRCxPQUFPLE1BQU0sQ0FBQztJQUNmLENBQUM7SUFQZSw4QkFBUSxXQU92QixDQUFBO0lBRUQsU0FBZ0IsZUFBZSxDQUFDLEdBQThDO1FBQzdFLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQztZQUNWLE9BQU8sU0FBUyxDQUFDO1FBQ2xCLENBQUM7UUFDRCxNQUFNLE9BQU8sR0FBRyxjQUFjLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDcEMsT0FBTyxLQUFLLENBQUMsSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUMsUUFBUSxFQUFFLEtBQUssQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLEVBQUUsUUFBUSxFQUFFLEtBQUssRUFBRSxPQUFPLEtBQUssS0FBSyxRQUFRLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQztJQUN4SCxDQUFDO0lBTmUscUNBQWUsa0JBTTlCLENBQUE7SUFFRDs7OztPQUlHO0lBQ0gsU0FBUyxjQUFjLENBQUMsR0FBa0M7UUFDekQsSUFBSSxHQUFHLFlBQVksR0FBRyxFQUFFLENBQUM7WUFDeEIsT0FBTyxHQUFHLENBQUM7UUFDWixDQUFDO1FBQ0QscUVBQXFFO1FBQ3JFLE9BQU8sTUFBTSxDQUFDLE9BQU8sQ0FBQyxHQUF5RSxDQUFDLENBQUM7SUFDbEcsQ0FBQztBQUNGLENBQUMsRUFsQ2dCLHFCQUFxQixLQUFyQixxQkFBcUIsUUFrQ3JDO0FBbUNELE1BQU0sQ0FBQyxNQUFNLG9CQUFvQixHQUFHLGVBQWUsQ0FBdUIscUJBQXFCLENBQUMsQ0FBQztBQThJakcsTUFBTSxVQUFVLHlCQUF5QixDQUFDLEtBQXdCO0lBQ2pFLE9BQU8sS0FBSyx5Q0FBaUMsSUFBSSxLQUFLLHlDQUFpQyxDQUFDO0FBQ3pGLENBQUM7QUFFRCxNQUFNLFVBQVUseUJBQXlCLENBQUMsR0FBWTtJQUNyRCxNQUFNLFNBQVMsR0FBRyxHQUE4QixDQUFDO0lBQ2pELE9BQU8sU0FBUyxJQUFJLFNBQVMsQ0FBQyxHQUFHLFlBQVksR0FBRyxJQUFJLE9BQU8sU0FBUyxDQUFDLFVBQVUsS0FBSyxRQUFRLElBQUksT0FBTyxTQUFTLENBQUMsU0FBUyxLQUFLLFFBQVEsQ0FBQztBQUN6SSxDQUFDIn0=