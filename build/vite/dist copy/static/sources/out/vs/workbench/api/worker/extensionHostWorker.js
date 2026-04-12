/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { VSBuffer } from '../../../base/common/buffer.js';
import { Emitter } from '../../../base/common/event.js';
import { isMessageOfType, createMessageOfType } from '../../services/extensions/common/extensionHostProtocol.js';
import { ExtensionHostMain } from '../common/extensionHostMain.js';
import { NestedWorker } from '../../services/extensions/worker/polyfillNestedWorker.js';
import * as path from '../../../base/common/path.js';
import * as performance from '../../../base/common/performance.js';
import '../common/extHost.common.services.js';
import './extHost.worker.services.js';
import { FileAccess } from '../../../base/common/network.js';
import { URI } from '../../../base/common/uri.js';
const nativeClose = self.close.bind(self);
self.close = () => console.trace(`'close' has been blocked`);
const nativePostMessage = postMessage.bind(self);
self.postMessage = () => console.trace(`'postMessage' has been blocked`);
function shouldTransformUri(uri) {
    // In principle, we could convert any URI, but we have concerns
    // that parsing https URIs might end up decoding escape characters
    // and result in an unintended transformation
    return /^(file|vscode-remote):/i.test(uri);
}
const nativeFetch = fetch.bind(self);
function patchFetching(asBrowserUri) {
    self.fetch = async function (input, init) {
        if (input instanceof Request) {
            // Request object - massage not supported
            return nativeFetch(input, init);
        }
        if (shouldTransformUri(String(input))) {
            input = (await asBrowserUri(URI.parse(String(input)))).toString(true);
        }
        return nativeFetch(input, init);
    };
    self.XMLHttpRequest = class extends XMLHttpRequest {
        open(method, url, async, username, password) {
            (async () => {
                if (shouldTransformUri(url.toString())) {
                    url = (await asBrowserUri(URI.parse(url.toString()))).toString(true);
                }
                super.open(method, url, async ?? true, username, password);
            })();
        }
    };
}
self.importScripts = () => { throw new Error(`'importScripts' has been blocked`); };
// const nativeAddEventListener = addEventListener.bind(self);
self.addEventListener = () => console.trace(`'addEventListener' has been blocked`);
// eslint-disable-next-line local/code-no-any-casts
self['AMDLoader'] = undefined;
// eslint-disable-next-line local/code-no-any-casts
self['NLSLoaderPlugin'] = undefined;
// eslint-disable-next-line local/code-no-any-casts
self['define'] = undefined;
// eslint-disable-next-line local/code-no-any-casts
self['require'] = undefined;
// eslint-disable-next-line local/code-no-any-casts
self['webkitRequestFileSystem'] = undefined;
// eslint-disable-next-line local/code-no-any-casts
self['webkitRequestFileSystemSync'] = undefined;
// eslint-disable-next-line local/code-no-any-casts
self['webkitResolveLocalFileSystemSyncURL'] = undefined;
// eslint-disable-next-line local/code-no-any-casts
self['webkitResolveLocalFileSystemURL'] = undefined;
// eslint-disable-next-line local/code-no-any-casts
if (self.Worker) {
    // make sure new Worker(...) always uses blob: (to maintain current origin)
    // eslint-disable-next-line local/code-no-any-casts
    const _Worker = self.Worker;
    // eslint-disable-next-line local/code-no-any-casts
    Worker = function (stringUrl, options) {
        if (/^file:/i.test(stringUrl.toString())) {
            stringUrl = FileAccess.uriToBrowserUri(URI.parse(stringUrl.toString())).toString(true);
        }
        else if (/^vscode-remote:/i.test(stringUrl.toString())) {
            // Supporting transformation of vscode-remote URIs requires an async call to the main thread,
            // but we cannot do this call from within the embedded Worker, and the only way out would be
            // to use templating instead of a function in the web api (`resourceUriProvider`)
            throw new Error(`Creating workers from remote extensions is currently not supported.`);
        }
        // IMPORTANT: bootstrapFn is stringified and injected as worker blob-url. Because of that it CANNOT
        // have dependencies on other functions or variables. Only constant values are supported. Due to
        // that logic of FileAccess.asBrowserUri had to be copied, see `asWorkerBrowserUrl` (below).
        const bootstrapFnSource = (function bootstrapFn(workerUrl) {
            function asWorkerBrowserUrl(url) {
                if (typeof url === 'string' || url instanceof URL) {
                    return String(url).replace(/^file:\/\//i, 'vscode-file://vscode-app');
                }
                return url;
            }
            const nativeFetch = fetch.bind(self);
            self.fetch = function (input, init) {
                if (input instanceof Request) {
                    // Request object - massage not supported
                    return nativeFetch(input, init);
                }
                return nativeFetch(asWorkerBrowserUrl(input), init);
            };
            self.XMLHttpRequest = class extends XMLHttpRequest {
                open(method, url, async, username, password) {
                    return super.open(method, asWorkerBrowserUrl(url), async ?? true, username, password);
                }
            };
            const nativeImportScripts = importScripts.bind(self);
            self.importScripts = (...urls) => {
                nativeImportScripts(...urls.map(asWorkerBrowserUrl));
            };
            nativeImportScripts(workerUrl);
        }).toString();
        const js = `(${bootstrapFnSource}('${stringUrl}'))`;
        options = options || {};
        options.name = `${name} -> ${options.name || path.basename(stringUrl.toString())}`;
        const blob = new Blob([js], { type: 'application/javascript' });
        const blobUrl = URL.createObjectURL(blob);
        return new _Worker(blobUrl, options);
    };
}
else {
    // eslint-disable-next-line local/code-no-any-casts
    self.Worker = class extends NestedWorker {
        constructor(stringOrUrl, options) {
            super(nativePostMessage, stringOrUrl, { name: path.basename(stringOrUrl.toString()), ...options });
        }
    };
}
//#endregion ---
const hostUtil = new class {
    constructor() {
        this.pid = undefined;
    }
    exit(_code) {
        nativeClose();
    }
};
class ExtensionWorker {
    constructor() {
        const channel = new MessageChannel();
        const emitter = new Emitter();
        let terminating = false;
        // send over port2, keep port1
        nativePostMessage(channel.port2, [channel.port2]);
        channel.port1.onmessage = event => {
            const { data } = event;
            if (!(data instanceof ArrayBuffer)) {
                console.warn('UNKNOWN data received', data);
                return;
            }
            const msg = VSBuffer.wrap(new Uint8Array(data, 0, data.byteLength));
            if (isMessageOfType(msg, 2 /* MessageType.Terminate */)) {
                // handle terminate-message right here
                terminating = true;
                onTerminate('received terminate message from renderer');
                return;
            }
            // emit non-terminate messages to the outside
            emitter.fire(msg);
        };
        this.protocol = {
            onMessage: emitter.event,
            send: vsbuf => {
                if (!terminating) {
                    const data = vsbuf.buffer.buffer.slice(vsbuf.buffer.byteOffset, vsbuf.buffer.byteOffset + vsbuf.buffer.byteLength);
                    channel.port1.postMessage(data, [data]);
                }
            }
        };
    }
}
function connectToRenderer(protocol) {
    return new Promise(resolve => {
        const once = protocol.onMessage(raw => {
            once.dispose();
            const initData = JSON.parse(raw.toString());
            protocol.send(createMessageOfType(0 /* MessageType.Initialized */));
            resolve({ protocol, initData });
        });
        protocol.send(createMessageOfType(1 /* MessageType.Ready */));
    });
}
let onTerminate = (reason) => nativeClose();
function isInitMessage(a) {
    return !!a && typeof a === 'object' && a.type === 'vscode.init' && a.data instanceof Map;
}
export function create() {
    performance.mark(`code/extHost/willConnectToRenderer`);
    const res = new ExtensionWorker();
    return {
        onmessage(message) {
            if (!isInitMessage(message)) {
                return; // silently ignore foreign messages
            }
            connectToRenderer(res.protocol).then(data => {
                performance.mark(`code/extHost/didWaitForInitData`);
                const extHostMain = new ExtensionHostMain(data.protocol, data.initData, hostUtil, null, message.data);
                patchFetching(uri => extHostMain.asBrowserUri(uri));
                onTerminate = (reason) => extHostMain.terminate(reason);
            });
        }
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9uSG9zdFdvcmtlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9hcGkvd29ya2VyL2V4dGVuc2lvbkhvc3RXb3JrZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFHaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQzFELE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUN4RCxPQUFPLEVBQUUsZUFBZSxFQUFlLG1CQUFtQixFQUEwQixNQUFNLDJEQUEyRCxDQUFDO0FBQ3RKLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBRW5FLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSwwREFBMEQsQ0FBQztBQUN4RixPQUFPLEtBQUssSUFBSSxNQUFNLDhCQUE4QixDQUFDO0FBQ3JELE9BQU8sS0FBSyxXQUFXLE1BQU0scUNBQXFDLENBQUM7QUFFbkUsT0FBTyxzQ0FBc0MsQ0FBQztBQUM5QyxPQUFPLDhCQUE4QixDQUFDO0FBQ3RDLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUM3RCxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFxQmxELE1BQU0sV0FBVyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO0FBQzFDLElBQUksQ0FBQyxLQUFLLEdBQUcsR0FBRyxFQUFFLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQywwQkFBMEIsQ0FBQyxDQUFDO0FBRTdELE1BQU0saUJBQWlCLEdBQUcsV0FBVyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztBQUNqRCxJQUFJLENBQUMsV0FBVyxHQUFHLEdBQUcsRUFBRSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMs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