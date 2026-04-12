/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { onUnexpectedError } from '../../../base/common/errors.js';
import { URI } from '../../../base/common/uri.js';
import { Disposable } from './extHostTypes.js';
import { MainContext } from './extHost.protocol.js';
import { Schemas } from '../../../base/common/network.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { splitLines } from '../../../base/common/strings.js';
export class ExtHostDocumentContentProvider {
    static { this._handlePool = 0; }
    constructor(mainContext, _documentsAndEditors, _logService) {
        this._documentsAndEditors = _documentsAndEditors;
        this._logService = _logService;
        this._documentContentProviders = new Map();
        this._proxy = mainContext.getProxy(MainContext.MainThreadDocumentContentProviders);
    }
    registerTextDocumentContentProvider(scheme, provider) {
        // todo@remote
        // check with scheme from fs-providers!
        if (Object.keys(Schemas).indexOf(scheme) >= 0) {
            throw new Error(`scheme '${scheme}' already registered`);
        }
        const handle = ExtHostDocumentContentProvider._handlePool++;
        this._documentContentProviders.set(handle, provider);
        this._proxy.$registerTextContentProvider(handle, scheme);
        let subscription;
        if (typeof provider.onDidChange === 'function') {
            let lastEvent;
            subscription = provider.onDidChange(async (uri) => {
                if (uri.scheme !== scheme) {
                    this._logService.warn(`Provider for scheme '${scheme}' is firing event for schema '${uri.scheme}' which will be IGNORED`);
                    return;
                }
                if (!this._documentsAndEditors.getDocument(uri)) {
                    // ignore event if document isn't open
                    return;
                }
                if (lastEvent) {
                    await lastEvent;
                }
                const thisEvent = this.$provideTextDocumentContent(handle, uri)
                    .then(async (value) => {
                    if (!value && typeof value !== 'string') {
                        return;
                    }
                    const document = this._documentsAndEditors.getDocument(uri);
                    if (!document) {
                        // disposed in the meantime
                        return;
                    }
                    // create lines and compare
                    const lines = splitLines(value);
                    // broadcast event when content changed
                    if (!document.equalLines(lines)) {
                        return this._proxy.$onVirtualDocumentChange(uri, value);
                    }
                })
                    .catch(onUnexpectedError)
                    .finally(() => {
                    if (lastEvent === thisEvent) {
                        lastEvent = undefined;
                    }
                });
                lastEvent = thisEvent;
            });
        }
        return new Disposable(() => {
            if (this._documentContentProviders.delete(handle)) {
                this._proxy.$unregisterTextContentProvider(handle);
            }
            if (subscription) {
                subscription.dispose();
                subscription = undefined;
            }
        });
    }
    $provideTextDocumentContent(handle, uri) {
        const provider = this._documentContentProviders.get(handle);
        if (!provider) {
            return Promise.reject(new Error(`unsupported uri-scheme: ${uri.scheme}`));
        }
        return Promise.resolve(provider.provideTextDocumentContent(URI.revive(uri), CancellationToken.None));
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0SG9zdERvY3VtZW50Q29udGVudFByb3ZpZGVycy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9hcGkvY29tbW9uL2V4dEhvc3REb2N1bWVudENvbnRlbnRQcm92aWRlcnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDbkUsT0FBTyxFQUFFLEdBQUcsRUFBaUIsTUFBTSw2QkFBNkIsQ0FBQztBQUVqRSxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sbUJBQW1CLENBQUM7QUFFL0MsT0FBTyxFQUFFLFdBQVcsRUFBK0YsTUFBTSx1QkFBdUIsQ0FBQztBQUVqSixPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFFMUQsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDekUsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBRTdELE1BQU0sT0FBTyw4QkFBOEI7YUFFM0IsZ0JBQVcsR0FBRyxDQUFDLEFBQUosQ0FBSztJQUsvQixZQUNDLFdBQXlCLEVBQ1Isb0JBQWdELEVBQ2hELFdBQXdCO1FBRHhCLHlCQUFvQixHQUFwQixvQkFBb0IsQ0FBNEI7UUFDaEQsZ0JBQVcsR0FBWCxXQUFXLENBQWE7UUFOekIsOEJBQXlCLEdBQUcsSUFBSSxHQUFHLEVBQThDLENBQUM7UUFRbEcsSUFBSSxDQUFDLE1BQU0sR0FBRyxXQUFXLENBQUMsUUFBUSxDQUFDLFdBQVcsQ0FBQyxrQ0FBa0MsQ0FBQyxDQUFDO0lBQ3BGLENBQUM7SUFFRCxtQ0FBbUMsQ0FBQyxNQUFjLEVBQUUsUUFBNEM7UUFDL0YsY0FBYztRQUNkLHVDQUF1QztRQUN2QyxJQUFJLE1BQU0sQ0FBQyxJQUFJLENBQUMsT0FBTyxD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