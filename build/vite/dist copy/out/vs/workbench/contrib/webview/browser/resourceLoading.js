/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { isUNC } from '../../../../base/common/extpath.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { FileOperationError } from '../../../../platform/files/common/files.js';
import { getWebviewContentMimeType } from '../../../../platform/webview/common/mimeTypes.js';
export var WebviewResourceResponse;
(function (WebviewResourceResponse) {
    let Type;
    (function (Type) {
        Type[Type["Success"] = 0] = "Success";
        Type[Type["Failed"] = 1] = "Failed";
        Type[Type["AccessDenied"] = 2] = "AccessDenied";
        Type[Type["NotModified"] = 3] = "NotModified";
    })(Type = WebviewResourceResponse.Type || (WebviewResourceResponse.Type = {}));
    class StreamSuccess {
        constructor(stream, etag, mtime, mimeType) {
            this.stream = stream;
            this.etag = etag;
            this.mtime = mtime;
            this.mimeType = mimeType;
            this.type = Type.Success;
        }
    }
    WebviewResourceResponse.StreamSuccess = StreamSuccess;
    WebviewResourceResponse.Failed = { type: Type.Failed };
    WebviewResourceResponse.AccessDenied = { type: Type.AccessDenied };
    class NotModified {
        constructor(mimeType, mtime) {
            this.mimeType = mimeType;
            this.mtime = mtime;
            this.type = Type.NotModified;
        }
    }
    WebviewResourceResponse.NotModified = NotModified;
})(WebviewResourceResponse || (WebviewResourceResponse = {}));
export async function loadLocalResource(requestUri, options, uriIdentityService, fileService, logService, token) {
    const resourceToLoad = getResourceToLoad(requestUri, options.roots, uriIdentityService);
    logService.trace(`Webview.loadLocalResource - trying to load resource. requestUri=${requestUri}, resourceToLoad=${resourceToLoad}`);
    if (!resourceToLoad) {
        logService.trace(`Webview.loadLocalResource - access denied. requestUri=${requestUri}, resourceToLoad=${resourceToLoad}`);
        return WebviewResourceResponse.AccessDenied;
    }
    const mime = getWebviewContentMimeType(requestUri); // Use the original path for the mime
    try {
        const result = await fileService.readFileStream(resourceToLoad, { etag: options.ifNoneMatch }, token);
        logService.trace(`Webview.loadLocalResource - Loaded. requestUri=${requestUri}, resourceToLoad=${resourceToLoad}`);
        return new WebviewResourceResponse.StreamSuccess(result.value, result.etag, result.mtime, mime);
    }
    catch (err) {
        if (err instanceof FileOperationError) {
            const result = err.fileOperationResult;
            // NotModified status is expected and can be handled gracefully
            if (result === 2 /* FileOperationResult.FILE_NOT_MODIFIED_SINCE */) {
                logService.trace(`Webview.loadLocalResource - not modified. requestUri=${requestUri}, resourceToLoad=${resourceToLoad}`);
                return new WebviewResourceResponse.NotModified(mime, err.options?.mtime);
            }
        }
        // Otherwise the error is unexpected.
        logService.error(`Webview.loadLocalResource - Error using fileReader. requestUri=${requestUri}, resourceToLoad=${resourceToLoad}`);
        return WebviewResourceResponse.Failed;
    }
}
export function getResourceToLoad(requestUri, roots, uriIdentityService) {
    const requestUriNoQueryString = requestUri.with({ query: '' });
    for (const root of roots) {
        if (containsResource(root, requestUriNoQueryString, uriIdentityService)) {
            return normalizeResourcePath(requestUri);
        }
    }
    return undefined;
}
function containsResource(root, resource, uriIdentityService) {
    if (uriIdentityService.extUri.isEqual(root, resource, /* ignoreFragment */ true)) {
        return false;
    }
    // Compare unc paths case-insensitively
    if (root.scheme === Schemas.file && isUNC(root.fsPath)) {
        if (resource.scheme === Schemas.file && isUNC(resource.fsPath)) {
            return uriIdentityService.extUri.isEqualOrParent(resource.with({
                path: resource.path.toLowerCase(),
                authority: resource.authority.toLowerCase()
            }), root.with({
                path: root.path.toLowerCase(),
                authority: root.authority.toLowerCase()
            }), 
            /* ignoreFragment */ true);
        }
        return false;
    }
    return uriIdentityService.extUri.isEqualOrParent(resource, root, /* ignoreFragment */ true);
}
function normalizeResourcePath(resource) {
    // Rewrite remote uris to a path that the remote file system can understand
    if (resource.scheme === Schemas.vscodeRemote) {
        return URI.from({
            scheme: Schemas.vscodeRemote,
            authority: resource.authority,
            path: '/vscode-resource',
            query: JSON.stringify({
                requestResourcePath: resource.path
            })
        });
    }
    return resource;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVzb3VyY2VMb2FkaW5nLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvd2Vidmlldy9icm93c2VyL3Jlc291cmNlTG9hZGluZy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUloRyxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDM0QsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQzdELE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUNyRCxPQUFPLEVBQUUsa0JBQWtCLEVBQXdELE1BQU0sNENBQTRDLENBQUM7QUFHdEksT0FBTyxFQUFFLHlCQUF5QixFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFFN0YsTUFBTSxLQUFXLHVCQUF1QixDQTJCdkM7QUEzQkQsV0FBaUIsdUJBQXVCO0lBQ3ZDLElBQVksSUFBbUQ7SUFBL0QsV0FBWSxJQUFJO1FBQUcscUNBQU8sQ0FBQTtRQUFFLG1DQUFNLENBQUE7UUFBRSwrQ0FBWSxDQUFBO1FBQUUsNkNBQVcsQ0FBQTtJQUFDLENBQUMsRUFBbkQsSUFBSSxHQUFKLDRCQUFJLEtBQUosNEJBQUksUUFBK0M7SUFFL0QsTUFBYSxhQUFhO1FBR3pCLFlBQ2lCLE1BQThCLEVBQzlCLElBQXdCLEVBQ3hCLEtBQXlCLEVBQ3pCLFFBQWdCO1lBSGhCLFdBQU0sR0FBTixNQUFNLENBQXdCO1lBQzlCLFNBQUksR0FBSixJQUFJLENBQW9CO1lBQ3hCLFVBQUssR0FBTCxLQUFLLENBQW9CO1lBQ3pCLGFBQVEsR0FBUixRQUFRLENBQVE7WUFOeEIsU0FBSSxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUM7UUFPekIsQ0FBQztLQUNMO0lBVFkscUNBQWEsZ0JBU3pCLENBQUE7SUFFWSw4QkFBTSxHQUFHLEVBQUUsSUFBSSxFQUFF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