/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { DataTransfers } from '../../base/browser/dnd.js';
import { createFileDataTransferItem, createStringDataTransferItem, UriList, VSDataTransfer } from '../../base/common/dataTransfer.js';
import { Mimes } from '../../base/common/mime.js';
import { URI } from '../../base/common/uri.js';
import { CodeDataTransfers, getPathForFile } from '../../platform/dnd/browser/dnd.js';
export function toVSDataTransfer(dataTransfer) {
    const vsDataTransfer = new VSDataTransfer();
    for (const item of dataTransfer.items) {
        const type = item.type;
        if (item.kind === 'string') {
            const asStringValue = new Promise(resolve => item.getAsString(resolve));
            vsDataTransfer.append(type, createStringDataTransferItem(asStringValue));
        }
        else if (item.kind === 'file') {
            const file = item.getAsFile();
            if (file) {
                vsDataTransfer.append(type, createFileDataTransferItemFromFile(file));
            }
        }
    }
    return vsDataTransfer;
}
function createFileDataTransferItemFromFile(file) {
    const path = getPathForFile(file);
    const uri = path ? URI.parse(path) : undefined;
    return createFileDataTransferItem(file.name, uri, async () => {
        return new Uint8Array(await file.arrayBuffer());
    });
}
const INTERNAL_DND_MIME_TYPES = Object.freeze([
    CodeDataTransfers.EDITORS,
    CodeDataTransfers.FILES,
    DataTransfers.RESOURCES,
    DataTransfers.INTERNAL_URI_LIST,
]);
export function toExternalVSDataTransfer(sourceDataTransfer, overwriteUriList = false) {
    const vsDataTransfer = toVSDataTransfer(sourceDataTransfer);
    // Try to expose the internal uri-list type as the standard type
    const uriList = vsDataTransfer.get(DataTransfers.INTERNAL_URI_LIST);
    if (uriList) {
        vsDataTransfer.replace(Mimes.uriList, uriList);
    }
    else {
        if (overwriteUriList || !vsDataTransfer.has(Mimes.uriList)) {
            // Otherwise, fallback to adding dragged resources to the uri list
            const editorData = [];
            for (const item of sourceDataTransfer.items) {
                const file = item.getAsFile();
                if (file) {
                    const path = getPathForFile(file);
                    try {
                        if (path) {
                            editorData.push(URI.file(path).toString());
                        }
                        else {
                            editorData.push(URI.parse(file.name, true).toString());
                        }
                    }
                    catch {
                        // Parsing failed. Leave out from list
                    }
                }
            }
            if (editorData.length) {
                vsDataTransfer.replace(Mimes.uriList, createStringDataTransferItem(UriList.create(editorData)));
            }
        }
    }
    for (const internal of INTERNAL_DND_MIME_TYPES) {
        vsDataTransfer.delete(internal);
    }
    return vsDataTransfer;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGF0YVRyYW5zZmVyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2Jyb3dzZXIvZGF0YVRyYW5zZmVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSwyQkFBMkIsQ0FBQztBQUMxRCxPQUFPLEVBQUUsMEJBQTBCLEVBQUUsNEJBQTRCLEVBQXFCLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUN6SixPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sMkJBQTJCLENBQUM7QUFDbEQsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQy9DLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxjQUFjLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUd0RixNQUFNLFVBQVUsZ0JBQWdCLENBQUMsWUFBMEI7SUFDMUQsTUFBTSxjQUFjLEdBQUcsSUFBSSxjQUFjLEVBQUUsQ0FBQztJQUM1QyxLQUFLLE1BQU0sSUFBSSxJQUFJLFlBQVksQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUN2QyxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDO1FBQ3ZCLElBQUksSUFBSSxDQUFDLElBQUksS0FBSyxRQUFRLEVBQUUsQ0FBQztZQUM1QixNQUFNLGFBQWEsR0FBRyxJQUFJLE9BQU8sQ0FBUyxPQUFPLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztZQUNoRixjQUFjLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSw0QkFBNEIsQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDO1FBQzFFLENBQUM7YUFBTSxJQUFJLElBQUksQ0FBQyxJQUFJLEtBQUssTUFBTSxFQUFFLENBQUM7WUFDakMsTUFBTSxJQUFJLEdBQUcsSUFBSSxD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