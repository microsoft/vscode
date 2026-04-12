/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/**
 * Typings for the https://wicg.github.io/file-system-access
 *
 * Use `supported(window)` to find out if the browser supports this kind of API.
 */
export var WebFileSystemAccess;
(function (WebFileSystemAccess) {
    function supported(obj) {
        if (typeof obj?.showDirectoryPicker === 'function') {
            return true;
        }
        return false;
    }
    WebFileSystemAccess.supported = supported;
    function isFileSystemHandle(handle) {
        const candidate = handle;
        if (!candidate) {
            return false;
        }
        return typeof candidate.kind === 'string' && typeof candidate.queryPermission === 'function' && typeof candidate.requestPermission === 'function';
    }
    WebFileSystemAccess.isFileSystemHandle = isFileSystemHandle;
    function isFileSystemFileHandle(handle) {
        return handle.kind === 'file';
    }
    WebFileSystemAccess.isFileSystemFileHandle = isFileSystemFileHandle;
    function isFileSystemDirectoryHandle(handle) {
        return handle.kind === 'directory';
    }
    WebFileSystemAccess.isFileSystemDirectoryHandle = isFileSystemDirectoryHandle;
})(WebFileSystemAccess || (WebFileSystemAccess = {}));
export var WebFileSystemObserver;
(function (WebFileSystemObserver) {
    function supported(obj) {
        return typeof obj?.FileSystemObserver === 'function';
    }
    WebFileSystemObserver.supported = supported;
})(WebFileSystemObserver || (WebFileSystemObserver = {}));
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2ViRmlsZVN5c3RlbUFjY2Vzcy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL2ZpbGVzL2Jyb3dzZXIvd2ViRmlsZVN5c3RlbUFjY2Vzcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRzs7OztHQUlHO0FBQ0gsTUFBTSxLQUFXLG1CQUFtQixDQTBCbkM7QUExQkQsV0FBaUIsbUJBQW1CO0lBRW5DLFNBQWdCLFNBQVMsQ0FBQyxHQUFzQjtRQUMvQyxJQUFJLE9BQVEsR0FBNkQsRUFBRSxtQkFBbUIsS0FBSyxVQUFVLEVBQUUsQ0FBQztZQUMvRyxPQUFPLElBQUksQ0FBQztRQUNiLENBQUM7UUFFRCxPQUFPLEtBQUssQ0FBQztJQUNkLENBQUM7SUFOZSw2QkFBUyxZQU14QixDQUFBO0lBRUQsU0FBZ0Isa0JBQWtCLENBQUMsTUFBZTtRQUNqRCxNQUFNLFNBQVMsR0FBRyxNQUFzQyxDQUFDO1FBQ3pELElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQztZQUNoQixPQUFPLEtBQUssQ0FBQztRQUNkLENBQUM7UUFFRCxPQUFPLE9BQU8sU0FBUyxDQUFDLElBQUksS0FBSyxRQUFRLElBQUksT0FBTyxTQUFTLENBQUMsZUFBZSxLQUFLLFVBQVUsSUFBSSxPQUFPLFNBQVMsQ0FBQyxpQkFBaUIsS0FBSyxVQUFVLENBQUM7SUFDbkosQ0FBQztJQVBlLHNDQUFrQixxQkFPakMsQ0FBQTtJQUVELFNBQWdCLHNCQUFzQixDQUFDLE1BQXdCO1FBQzlELE9BQU8sTUFBTSxDQUFDLElBQUksS0FBSyxNQUFNLENBQUM7SUFDL0IsQ0FBQztJQUZlLDBDQUFzQix5QkFFckMsQ0FBQTtJQUVELFNBQWdCLDJCQUEyQixDQUFDLE1BQXdCO1FBQ25FLE9BQU8sTUFBTSxDQUFDLElBQUksS0FBSyxXQUFXLENBQUM7SUFDcEMsQ0FBQztJQUZlLCtDQUEyQiw4QkFFMUMsQ0FBQTtBQUNGLENBQUMsRUExQmdCLG1CQUFtQixLQUFuQixtQkFBbUIsUUEwQm5DO0FBRUQsTUFBTSxLQUFXLHFCQUFxQixDQUtyQztBQUxELFdBQWlCLHFCQUFxQjtJQUVyQyxTQUFnQixTQUFTLENBQUMsR0FBc0I7UUFDL0MsT0FBTyxPQUFRLEdBQTRELEVBQUUsa0JBQWtCLEtBQUssVUFBVSxDQUFDO0lBQ2hILENBQUM7SUFGZSwrQkFBUyxZQUV4QixDQUFBO0FBQ0YsQ0FBQyxFQUxnQixxQkFBcUIsS0FBckIscUJBQXFCLFFBS3JDIn0=