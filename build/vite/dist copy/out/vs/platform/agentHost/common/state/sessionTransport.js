/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/** Type guard for transports that require an explicit connection step. */
export function isClientTransport(transport) {
    return typeof transport.connect === 'function';
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2Vzc2lvblRyYW5zcG9ydC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvc2Vzc2lvblRyYW5zcG9ydC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQTRDaEcsMEVBQTBFO0FBQzFFLE1BQU0sVUFBVSxpQkFBaUIsQ0FBQyxTQUE2QjtJQUM5RCxPQUFPLE9BQVEsU0FBOEIsQ0FBQyxPQUFPLEtBQUssVUFBVSxDQUFDO0FBQ3RFLENBQUMifQ==