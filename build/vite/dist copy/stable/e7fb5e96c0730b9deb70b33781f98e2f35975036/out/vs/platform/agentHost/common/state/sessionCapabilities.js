/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// Protocol version constants and capability derivation.
// See protocol.md -> Versioning for the full design.
//
// The authoritative version numbers and action-filtering logic live in
// versions/versionRegistry.ts. This file re-exports them and provides the
// capability-object API that client code uses to gate features.
export const PROTOCOL_VERSION = 1;
export const MIN_PROTOCOL_VERSION = 1;
/**
 * Derives the set of capabilities available at a given protocol version.
 * Newer clients use this to determine which features the server supports.
 */
export function capabilitiesForVersion(version) {
    if (version < 1) {
        throw new Error(`Unsupported protocol version: ${version}`);
    }
    return {
        sessions: true,
        tools: true,
        permissions: true,
        // Future versions add fields here:
        // ...(version >= 2 ? { reasoning: true as const } : {}),
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2Vzc2lvbkNhcGFiaWxpdGllcy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvc2Vzc2lvbkNhcGFiaWxpdGllcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyx3REFBd0Q7QUFDeEQscURBQXFEO0FBQ3JELEVBQUU7QUFDRix1RUFBdUU7QUFDdkUsMEVBQTBFO0FBQzFFLGdFQUFnRTtBQUVoRSxNQUFNLENBQUMsTUFBTSxnQkFBZ0IsR0FBRyxDQUFDLENBQUM7QUFDbEMsTUFBTSxDQUFDLE1BQU0sb0JBQW9CLEdBQUcsQ0FBQyxDQUFDO0FBY3RDOzs7R0FHRztBQUNILE1BQU0sVUFBVSxzQkFBc0IsQ0FBQyxPQUFlO0lBQ3JELElBQUksT0FBTyxHQUFHLENBQUMsRUFBRSxDQUFDO1FBQ2pCLE1BQU0sSUFBSSxLQUFLLENBQUMsaUNBQWlDLE9BQU8sRUFBRSxDQUFDLENBQUM7SUFDN0QsQ0FBQztJQUVELE9BQU87UUFDTixRQUFRLEVBQUUsSUFBSTtRQUNkLEtBQUssRUFBRSxJQUFJO1FBQ1gsV0FBVyxFQUFFLElBQUk7UUFDakIsbUNBQW1DO1FBQ25DLHlEQUF5RDtLQUN6RCxDQUFDO0FBQ0gsQ0FBQyJ9