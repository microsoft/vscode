/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as nls from '../../../../nls.js';
import { URI } from '../../../../base/common/uri.js';
import { normalize, isAbsolute } from '../../../../base/common/path.js';
import * as resources from '../../../../base/common/resources.js';
import { DEBUG_SCHEME } from './debug.js';
import { SIDE_GROUP, ACTIVE_GROUP } from '../../../services/editor/common/editorService.js';
import { Schemas } from '../../../../base/common/network.js';
import { isUriString } from './debugUtils.js';
export const UNKNOWN_SOURCE_LABEL = nls.localize('unknownSource', "Unknown Source");
/**
 * Debug URI format
 *
 * a debug URI represents a Source object and the debug session where the Source comes from.
 *
 *       debug:arbitrary_path?session=123e4567-e89b-12d3-a456-426655440000&ref=1016
 *       \___/ \____________/ \__________________________________________/ \______/
 *         |          |                             |                          |
 *      scheme   source.path                    session id            source.reference
 *
 *
 */
export class Source {
    constructor(raw_, sessionId, uriIdentityService, logService) {
        let path;
        if (raw_) {
            this.raw = raw_;
            path = this.raw.path || this.raw.name || '';
            this.available = true;
        }
        else {
            this.raw = { name: UNKNOWN_SOURCE_LABEL };
            this.available = false;
            path = `${DEBUG_SCHEME}:${UNKNOWN_SOURCE_LABEL}`;
        }
        this.uri = getUriFromSource(this.raw, path, sessionId, uriIdentityService, logService);
    }
    get name() {
        return this.raw.name || resources.basenameOrAuthority(this.uri);
    }
    get origin() {
        return this.raw.origin;
    }
    get presentationHint() {
        return this.raw.presentationHint;
    }
    get reference() {
        return this.raw.sourceReference;
    }
    get inMemory() {
        return this.uri.scheme === DEBUG_SCHEME;
    }
    openInEditor(editorService, selection, preserveFocus, sideBySide, pinned) {
        return !this.available ? Promise.resolve(undefined) : editorService.openEditor({
            resource: this.uri,
            description: this.origin,
            options: {
                preserveFocus,
                selection,
                revealIfOpened: true,
                selectionRevealType: 1 /* TextEditorSelectionRevealType.CenterIfOutsideViewport */,
                pinned
            }
        }, sideBySide ? SIDE_GROUP : ACTIVE_GROUP);
    }
    static getEncodedDebugData(modelUri) {
        let path;
        let sourceReference;
        let sessionId;
        switch (modelUri.scheme) {
            case Schemas.file:
                path = normalize(modelUri.fsPath);
                break;
            case DEBUG_SCHEME:
                path = modelUri.path;
                if (modelUri.query) {
                    const keyvalues = modelUri.query.split('&');
                    for (const keyvalue of keyvalues) {
                        const pair = keyvalue.split('=');
                        if (pair.length === 2) {
                            switch (pair[0]) {
                                case 'session':
                                    sessionId = pair[1];
                                    break;
                                case 'ref':
                                    sourceReference = parseInt(pair[1]);
                                    break;
                            }
                        }
                    }
                }
                break;
            default:
                path = modelUri.toString();
                break;
        }
        return {
            name: resources.basenameOrAuthority(modelUri),
            path,
            sourceReference,
            sessionId
        };
    }
}
export function getUriFromSource(raw, path, sessionId, uriIdentityService, logService) {
    const _getUriFromSource = (path) => {
        if (typeof raw.sourceReference === 'number' && raw.sourceReference > 0) {
            return URI.from({
                scheme: DEBUG_SCHEME,
                path: path?.replace(/^\/+/g, '/'), // #174054
                query: `session=${sessionId}&ref=${raw.sourceReference}`
            });
        }
        if (path && isUriString(path)) { // path looks like a uri
            return uriIdentityService.asCanonicalUri(URI.parse(path));
        }
        // assume a filesystem path
        if (path && isAbsolute(path)) {
            return uriIdentityService.asCanonicalUri(URI.file(path));
        }
        // path is relative: since VS Code cannot deal with this by itself
        // create a debug url that will result in a DAP 'source' request when the url is resolved.
        return uriIdentityService.asCanonicalUri(URI.from({
            scheme: DEBUG_SCHEME,
            path,
            query: `session=${sessionId}`
        }));
    };
    try {
        return _getUriFromSource(path);
    }
    catch (err) {
        logService.error('Invalid path from debug adapter: ' + path);
        return _getUriFromSource('/invalidDebugSource');
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVidWdTb3VyY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9kZWJ1Zy9jb21tb24vZGVidWdTb3VyY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSxvQkFBb0IsQ0FBQztBQUMxQyxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDckQsT0FBTyxFQUFFLFNBQVMsRUFBRSxVQUFVLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUN4RSxPQUFPLEtBQUssU0FBUyxNQUFNLHNDQUFzQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxZQUFZLENBQUM7QUFFMUMsT0FBTyxFQUFrQixVQUFVLEVBQUUsWUFBWSxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDNUcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQzdELE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxpQkFBaUIsQ0FBQztBQU05QyxNQUFNLENBQUMsTUFBTSxvQkFBb0IsR0FBRyxHQUFHLENBQUMsUUFBUSxDQUFDLGVBQWUsRUFBRSxnQkFBZ0IsQ0FBQyxDQUFDO0FBRXBGOzs7Ozs7Ozs7OztHQVdHO0FBRUgsTUFBTSxPQUFPLE1BQU07SUFNbEIsWUFBWSxJQUFzQyxFQUFFLFNBQWlCLEVBQUUsa0JBQXVDLEVBQUUsVUFBdUI7UUFDdEksSUFBSSxJQUFZLENBQUM7UUFDakIsSUFBSSxJQUFJLEVBQUUsQ0FBQztZQUNWLElBQUksQ0FBQyxHQUFHLEdBQUcsSUFBSSxDQUFDO1lBQ2hCLElBQUksR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksSUFBSSxJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksSUFBSSxFQUFFLENBQUM7WUFDNUMsSUFBSSxDQUFD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