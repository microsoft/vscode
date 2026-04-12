/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { encodeBase64, VSBuffer, decodeBase64 } from '../../../../../base/common/buffer.js';
import { Schemas } from '../../../../../base/common/network.js';
import { URI } from '../../../../../base/common/uri.js';
import { localChatSessionType } from '../chatSessionsService.js';
export var LocalChatSessionUri;
(function (LocalChatSessionUri) {
    LocalChatSessionUri.scheme = Schemas.vscodeLocalChatSession;
    function forSession(sessionId) {
        const encodedId = encodeBase64(VSBuffer.wrap(new TextEncoder().encode(sessionId)), false, true);
        return URI.from({ scheme: LocalChatSessionUri.scheme, authority: localChatSessionType, path: '/' + encodedId });
    }
    LocalChatSessionUri.forSession = forSession;
    function getNewSessionUri() {
        const handle = Math.floor(Math.random() * 1e9);
        return forSession(`chat-${handle}`);
    }
    LocalChatSessionUri.getNewSessionUri = getNewSessionUri;
    function parseLocalSessionId(resource) {
        const parsed = parse(resource);
        return parsed?.chatSessionType === localChatSessionType ? parsed.sessionId : undefined;
    }
    LocalChatSessionUri.parseLocalSessionId = parseLocalSessionId;
    function isLocalSession(resource) {
        return !!parseLocalSessionId(resource);
    }
    LocalChatSessionUri.isLocalSession = isLocalSession;
    function parse(resource) {
        if (resource.scheme !== LocalChatSessionUri.scheme) {
            return undefined;
        }
        if (!resource.authority) {
            return undefined;
        }
        const parts = resource.path.split('/');
        if (parts.length !== 2) {
            return undefined;
        }
        const chatSessionType = resource.authority;
        const decodedSessionId = decodeBase64(parts[1]);
        return { chatSessionType, sessionId: new TextDecoder().decode(decodedSessionId.buffer) };
    }
})(LocalChatSessionUri || (LocalChatSessionUri = {}));
/**
 * Converts a chat session resource URI to a string ID.
 *
 * This exists mainly for backwards compatibility with existing code that uses string IDs in telemetry and storage.
 */
export function chatSessionResourceToId(resource) {
    // If we have a local session, prefer using just the id part
    const localId = LocalChatSessionUri.parseLocalSessionId(resource);
    if (localId) {
        return localId;
    }
    return resource.toString();
}
/**
 * Extracts the chat session type from a resource URI.
 *
 * @param resource - The chat session resource URI
 * @returns The session type string. Returns `localChatSessionType` for local sessions
 *          (vscodeChatEditor and vscodeLocalChatSession schemes), or the scheme/authority
 *          for contributed sessions.
 */
export function getChatSessionType(resource) {
    if (resource.scheme === Schemas.vscodeChatEditor) {
        return localChatSessionType;
    }
    if (resource.scheme === LocalChatSessionUri.scheme) {
        return resource.authority || localChatSessionType;
    }
    return resource.scheme;
}
export function isUntitledChatSession(resource) {
    return resource.path.startsWith('/untitled-');
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFVyaS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL21vZGVsL2NoYXRVcmkudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFlBQVksRUFBRSxRQUFRLEVBQUUsWUFBWSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDNUYsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ2hFLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUN4RCxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSwyQkFBMkIsQ0FBQztBQVFqRSxNQUFNLEtBQVcsbUJBQW1CLENBeUNuQztBQXpDRCxXQUFpQixtQkFBbUI7SUFFdEIsMEJBQU0sR0FBRyxPQUFPLENBQUMsc0JBQXNCLENBQUM7SUFFckQsU0FBZ0IsVUFBVSxDQUFDLFNBQWlCO1FBQzNDLE1BQU0sU0FBUyxHQUFHLFlBQVksQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLElBQUksV0FBVyxFQUFFLENBQUMsTUFBTSxDQUFDLFNBQVMsQ0FBQyxDQUFDLEVBQUUsS0FBSyxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQ2hHLE9BQU8sR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLE1BQU0sRUFBTixvQkFBQSxNQUFNLEVBQUUsU0FBUyxFQUFFLG9CQUFvQixFQUFFLElBQUksRUFBRSxHQUFHLEdBQUcsU0FBUyxFQUFFLENBQUMsQ0FBQztJQUNyRixDQUFDO0lBSGUsOEJBQVUsYUFHekIsQ0FBQTtJQUVELFNBQWdCLGdCQUFnQjtRQUMvQixNQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUUsR0FBRyxHQUFHLENBQUMsQ0FBQztRQUMvQyxPQUFPLFVBQVUsQ0FB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