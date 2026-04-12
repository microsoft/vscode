/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
/**
 * Root from which resources in webviews are loaded.
 *
 * This is hardcoded because we never expect to actually hit it. Instead these requests
 * should always go to a service worker.
 */
export const webviewResourceBaseHost = 'vscode-cdn.net';
export const webviewRootResourceAuthority = `vscode-resource.${webviewResourceBaseHost}`;
export const webviewGenericCspSource = `'self' https://*.${webviewResourceBaseHost}`;
/**
 * Construct a uri that can load resources inside a webview
 *
 * We encode the resource component of the uri so that on the main thread
 * we know where to load the resource from (remote or truly local):
 *
 * ```txt
 * ${scheme}+${resource-authority}.vscode-resource.vscode-cdn.net/${path}
 * ```
 *
 * @param resource Uri of the resource to load.
 * @param remoteInfo Optional information about the remote that specifies where `resource` should be resolved from.
 */
export function asWebviewUri(resource, remoteInfo) {
    if (resource.scheme === Schemas.http || resource.scheme === Schemas.https) {
        return resource;
    }
    if (remoteInfo && remoteInfo.authority && remoteInfo.isRemote && resource.scheme === Schemas.file) {
        resource = URI.from({
            scheme: Schemas.vscodeRemote,
            authority: remoteInfo.authority,
            path: resource.path,
        });
    }
    return URI.from({
        scheme: Schemas.https,
        authority: `${resource.scheme}+${encodeAuthority(resource.authority)}.${webviewRootResourceAuthority}`,
        path: resource.path,
        fragment: resource.fragment,
        query: resource.query,
    });
}
function encodeAuthority(authority) {
    return authority.replace(/./g, char => {
        const code = char.charCodeAt(0);
        if ((code >= 97 /* CharCode.a */ && code <= 122 /* CharCode.z */)
            || (code >= 65 /* CharCode.A */ && code <= 90 /* CharCode.Z */)
            || (code >= 48 /* CharCode.Digit0 */ && code <= 57 /* CharCode.Digit9 */)) {
            return char;
        }
        return '-' + code.toString(16).padStart(4, '0');
    });
}
export function decodeAuthority(authority) {
    return authority.replace(/-([0-9a-f]{4})/g, (_, code) => String.fromCharCode(parseInt(code, 16)));
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2Vidmlldy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3dlYnZpZXcvY29tbW9uL3dlYnZpZXcudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFHaEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQzdELE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQU9yRDs7Ozs7R0FLRztBQUNILE1BQU0sQ0FBQyxNQUFNLHVCQUF1QixHQUFHLGdCQUFnQixDQUFDO0FBRXhELE1BQU0sQ0FBQyxNQUFNLDRCQUE0QixHQUFHLG1CQUFtQix1QkFBdUIsRUFBRSxDQUFDO0FBRXpGLE1BQU0sQ0FBQyxNQUFNLHVCQUF1QixHQUFHLG9CQUFvQix1QkFBdUIsRUFBRSxDQUFDO0FBRXJGOzs7Ozs7Ozs7Ozs7R0FZRztBQUNILE1BQU0sVUFBVSxZQUFZLENBQUMsUUFBYSxFQUFFLFVBQThCO0lBQ3pFLElBQUksUUFBUSxDQUFDLE1BQU0sS0FBSyxPQUFPLENBQUMsSUFBSSxJQUFJLFFBQVEsQ0FBQyxNQUFNLEtBQUssT0FBTyxDQUFDLEtBQUssRUFBRSxDQUFDO1FBQzNFLE9BQU8sUUFBUSxDQUFDO0lBQ2pCLENBQUM7SUFFRCxJQUFJLFVBQVUsSUFBSSxVQUFVLENBQUMsU0FBUyxJQUFJLFVBQVUsQ0FBQyxRQUFRLElBQUksUUFBUSxDQUFDLE1BQU0sS0FBSyxPQUFPLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDbkcsUUFBUSxHQUFHLEdBQUcsQ0FBQyxJQUFJLENBQUM7WUFDbkIsTUFBTSxFQUFFLE9BQU8sQ0FBQyxZQUFZO1lBQzVCLFNBQVMsRUFBRSxVQUFVLENBQUMsU0FBUztZQUMvQixJQUFJLEVBQUUsUUFBUSxDQUFDLElBQUk7U0FDbkIsQ0FBQyxDQUFDO0lBQ0osQ0FBQztJQUVELE9BQU8sR0FBRyxDQUFDLElBQUksQ0FBQztRQUNmLE1BQU0sRUFBRSxPQUFPLENBQUMsS0FBSztRQUNyQixTQUFTLEVBQUUsR0FBRyxRQUFRLENBQUMsTUFBTSxJQUFJLGVBQWUsQ0FBQyxRQUFRLENBQUMsU0FBUyxDQUFDLElBQUksNEJBQTRCLEVBQUU7UUFDdEcsSUFBSSxFQUFFLFFBQVEsQ0FBQyxJQUFJO1FBQ25CLFFBQVEsRUFBRSxRQUFRLENBQUMsUUFBUTtRQUMzQixLQUFLLEVBQUUsUUFBUSxDQUFDLEtBQUs7S0FDckIsQ0FBQyxDQUFDO0FBQ0osQ0FBQztBQUVELFNBQVMsZUFBZSxDQUFDLFNBQWlCO0lBQ3pDLE9BQU8sU0FBUyxDQUFDLE9BQU8sQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLEVBQUU7UUFDckMsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNoQyxJQUNDLENBQUMsSUFBSSx1QkFBYyxJQUFJLElBQUksd0JBQWMsQ0FBQztlQUN2QyxDQUFDLElBQUksdUJBQWMsSUFBSSxJQUFJLHVCQUFjLENBQUM7ZUFDMUMsQ0FBQyxJQUFJLDRCQUFtQixJQUFJLElBQUksNEJBQW1CLENBQUMsRUFDdEQsQ0FBQztZQUNGLE9BQU8sSUFBSSxDQUFDO1FBQ2IsQ0FBQztRQUNELE9BQU8sR0FBRyxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsRUFBRSxHQUFHLENBQUMsQ0FBQztJQUNqRCxDQUFDLENBQUMsQ0FBQztBQUNKLENBQUM7QUFFRCxNQUFNLFVBQVUsZUFBZSxDQUFDLFNBQWlCO0lBQ2hELE9BQU8sU0FBUyxDQUFDLE9BQU8sQ0FBQyxpQkFBaUIsRUFBRSxDQUFDLENBQUMsRUFBRSxJQUFJLEVBQUUsRUFBRSxDQUFDLE1BQU0sQ0FBQyxZQUFZLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDbkcsQ0FBQyJ9