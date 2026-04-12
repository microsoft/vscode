/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var ExtHostDecorations_1;
import { URI } from '../../../base/common/uri.js';
import { MainContext } from './extHost.protocol.js';
import { Disposable, FileDecoration } from './extHostTypes.js';
import { createDecorator } from '../../../platform/instantiation/common/instantiation.js';
import { IExtHostRpcService } from './extHostRpcService.js';
import { ILogService } from '../../../platform/log/common/log.js';
import { asArray, groupBy } from '../../../base/common/arrays.js';
import { compare, count } from '../../../base/common/strings.js';
import { dirname } from '../../../base/common/path.js';
import { checkProposedApiEnabled } from '../../services/extensions/common/extensions.js';
let ExtHostDecorations = class ExtHostDecorations {
    static { ExtHostDecorations_1 = this; }
    static { this._handlePool = 0; }
    static { this._maxEventSize = 250; }
    constructor(extHostRpc, _logService) {
        this._logService = _logService;
        this._provider = new Map();
        this._proxy = extHostRpc.getProxy(MainContext.MainThreadDecorations);
    }
    registerFileDecorationProvider(provider, extensionDescription) {
        const handle = ExtHostDecorations_1._handlePool++;
        this._provider.set(handle, { provider, extensionDescription });
        this._proxy.$registerDecorationProvider(handle, extensionDescription.identifier.value);
        const listener = provider.onDidChangeFileDecorations && provider.onDidChangeFileDecorations(e => {
            if (!e) {
                this._proxy.$onDidChange(handle, null);
                return;
            }
            const array = asArray(e);
            if (array.length <= ExtHostDecorations_1._maxEventSize) {
                this._proxy.$onDidChange(handle, array);
                return;
            }
            // too many resources per event. pick one resource per folder, starting
            // with parent folders
            this._logService.warn('[Decorations] CAPPING events from decorations provider', extensionDescription.identifier.value, array.length);
            const mapped = array.map(uri => ({ uri, rank: count(uri.path, '/') }));
            const groups = groupBy(mapped, (a, b) => a.rank - b.rank || compare(a.uri.path, b.uri.path));
            const picked = [];
            outer: for (const uris of groups) {
                let lastDirname;
                for (const obj of uris) {
                    const myDirname = dirname(obj.uri.path);
                    if (lastDirname !== myDirname) {
                        lastDirname = myDirname;
                        if (picked.push(obj.uri) >= ExtHostDecorations_1._maxEventSize) {
                            break outer;
                        }
                    }
                }
            }
            this._proxy.$onDidChange(handle, picked);
        });
        return new Disposable(() => {
            listener?.dispose();
            this._proxy.$unregisterDecorationProvider(handle);
            this._provider.delete(handle);
        });
    }
    async $provideDecorations(handle, requests, token) {
        if (!this._provider.has(handle)) {
            // might have been unregistered in the meantime
            return Object.create(null);
        }
        const result = Object.create(null);
        const { provider, extensionDescription: extensionId } = this._provider.get(handle);
        await Promise.all(requests.map(async (request) => {
            try {
                const { uri, id } = request;
                const data = await Promise.resolve(provider.provideFileDecoration(URI.revive(uri), token));
                if (!data) {
                    return;
                }
                try {
                    FileDecoration.validate(data);
                    if (data.badge && typeof data.badge !== 'string') {
                        checkProposedApiEnabled(extensionId, 'codiconDecoration');
                    }
                    result[id] = [data.propagate, data.tooltip, data.badge, data.color];
                }
                catch (e) {
                    this._logService.warn(`INVALID decoration from extension '${extensionId.identifier.value}': ${e}`);
                }
            }
            catch (err) {
                this._logService.error(err);
            }
        }));
        return result;
    }
};
ExtHostDecorations = ExtHostDecorations_1 = __decorate([
    __param(0, IExtHostRpcService),
    __param(1, ILogService)
], ExtHostDecorations);
export { ExtHostDecorations };
export const IExtHostDecorations = createDecorator('IExtHostDecorations');
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0SG9zdERlY29yYXRpb25zLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2FwaS9jb21tb24vZXh0SG9zdERlY29yYXRpb25zLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUdoRyxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFDbEQsT0FBTyxFQUFFLFdBQVcsRUFBMkcsTUFBTSx1QkFBdUIsQ0FBQztBQUM3SixPQUFPLEVBQUUsVUFBVSxFQUFFLGNBQWMsRUFBRSxNQUFNLG1CQUFtQixDQUFDO0FBRy9ELE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUMxRixPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSx3QkFBd0IsQ0FBQztBQUM1RCxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDbEUsT0FBTyxFQUFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQ2pFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUN2RCxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQU9sRixJQUFNLGtCQUFrQixHQUF4QixNQUFNLGtCQUFrQjs7YUFFZixnQkFBVyxHQUFHLENBQUMsQUFBSixDQUFLO2FBQ2hCLGtCQUFhLEdBQUcsR0FBRyxBQUFOLENBQU87SUFNbkMsWUFDcUIsVUFBOEIsRUFDckMsV0FBeUM7UUFBeEIsZ0JBQVcsR0FBWCxXQUFXLENBQWE7UUFMdEMsY0FBUyxHQUFHLElBQUksR0FBRyxFQUF3QixDQUFDO1FBTzVELElBQUksQ0FBQyxNQUFNLEdBQUcsVUFBVSxDQUFD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