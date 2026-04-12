/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { buffer, ExtractError } from '../../../base/node/zip.js';
import { localize } from '../../../nls.js';
import { toExtensionManagementError } from '../common/abstractExtensionManagementService.js';
import { ExtensionManagementError } from '../common/extensionManagement.js';
export function fromExtractError(e) {
    let errorCode = "Extract" /* ExtensionManagementErrorCode.Extract */;
    if (e instanceof ExtractError) {
        if (e.type === 'CorruptZip') {
            errorCode = "CorruptZip" /* ExtensionManagementErrorCode.CorruptZip */;
        }
        else if (e.type === 'Incomplete') {
            errorCode = "IncompleteZip" /* ExtensionManagementErrorCode.IncompleteZip */;
        }
    }
    return toExtensionManagementError(e, errorCode);
}
export async function getManifest(vsixPath) {
    let data;
    try {
        data = await buffer(vsixPath, 'extension/package.json');
    }
    catch (e) {
        throw fromExtractError(e);
    }
    try {
        return JSON.parse(data.toString('utf8'));
    }
    catch (err) {
        throw new ExtensionManagementError(localize('invalidManifest', "VSIX invalid: package.json is not a JSON file."), "Invalid" /* ExtensionManagementErrorCode.Invalid */);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9uTWFuYWdlbWVudFV0aWwuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9leHRlbnNpb25NYW5hZ2VtZW50L25vZGUvZXh0ZW5zaW9uTWFuYWdlbWVudFV0aWwudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLE1BQU0sRUFBRSxZQUFZLEVBQUUsTUFBTSwyQkFBMkIsQ0FBQztBQUNqRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0saUJBQWlCLENBQUM7QUFDM0MsT0FBTyxFQUFFLDBCQUEwQixFQUFFLE1BQU0saURBQWlELENBQUM7QUFDN0YsT0FBTyxFQUFFLHdCQUF3QixFQUFnQyxNQUFNLGtDQUFrQyxDQUFDO0FBRzFHLE1BQU0sVUFBVSxnQkFBZ0IsQ0FBQyxDQUFRO0lBQ3hDLElBQUksU0FBUyx1REFBdUMsQ0FBQztJQUNyRCxJQUFJLENBQUMsWUFBWSxZQUFZLEVBQUUsQ0FBQztRQUMvQixJQUFJLENBQUMsQ0FBQyxJQUFJLEtBQUssWUFBWSxFQUFFLENBQUM7WUFDN0IsU0FBUyw2REFBMEMsQ0FBQztRQUNyRCxDQUFDO2FBQU0sSUFBSSxDQUFDLENBQUMsSUFBSSxLQUFLLFlBQVksRUFBRSxDQUFDO1lBQ3BDLFNBQVMsbUVBQTZDLENBQUM7UUFDeEQsQ0FBQztJQUNGLENBQUM7SUFDRCxPQUFPLDBCQUEwQixDQUFDLENBQUMsRUFBRSxTQUFTLENBQUMsQ0FBQztBQUNqRCxDQUFDO0FBRUQsTUFBTSxDQUFDLEtBQUssVUFBVSxXQUFXLENBQUMsUUFBZ0I7SUFDakQsSUFBSSxJQUFJLENBQUM7SUFDVCxJQUFJLENBQUM7UUFDSixJQUFJLEdBQUcsTUFBTSxNQUFNLENBQUMsUUFBUSxFQUFFLHdCQUF3QixDQUFDLENBQUM7SUFDekQsQ0FBQztJQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7UUFDWixNQUFNLGdCQUFnQixDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQzNCLENBQUM7SUFFRCxJQUFJLENBQUM7UUFDSixPQUFPLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO0lBQzFDLENBQUM7SUFBQyxPQUFPLEdBQUcsRUFBRSxDQUFDO1FBQ2QsTUFBTSxJQUFJLHdCQUF3QixDQUFDLFFBQVEsQ0FBQyxpQkFBaUIsRUFBRSxnREFBZ0QsQ0FBQyx1REFBdUMsQ0FBQztJQUN6SixDQUFDO0FBQ0YsQ0FBQyJ9