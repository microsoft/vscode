/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { VSBuffer } from '../../../base/common/buffer.js';
import { generateUuid, isUUID } from '../../../base/common/uuid.js';
export async function getServiceMachineId(environmentService, fileService, storageService) {
    let uuid = storageService ? storageService.get('storage.serviceMachineId', -1 /* StorageScope.APPLICATION */) || null : null;
    if (uuid) {
        return uuid;
    }
    try {
        const contents = await fileService.readFile(environmentService.serviceMachineIdResource);
        const value = contents.value.toString();
        uuid = isUUID(value) ? value : null;
    }
    catch (e) {
        uuid = null;
    }
    if (!uuid) {
        uuid = generateUuid();
        try {
            await fileService.writeFile(environmentService.serviceMachineIdResource, VSBuffer.fromString(uuid));
        }
        catch (error) {
            //noop
        }
    }
    storageService?.store('storage.serviceMachineId', uuid, -1 /* StorageScope.APPLICATION */, 1 /* StorageTarget.MACHINE */);
    return uuid;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VydmljZU1hY2hpbmVJZC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL2V4dGVybmFsU2VydmljZXMvY29tbW9uL3NlcnZpY2VNYWNoaW5lSWQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQzFELE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFLcEUsTUFBTSxDQUFDLEtBQUssVUFBVSxtQkFBbUIsQ0FBQyxrQkFBdUMsRUFBRSxXQUF5QixFQUFFLGNBQTJDO0lBQ3hKLElBQUksSUFBSSxHQUFrQixjQUFjLENBQUMsQ0FBQyxDQUFDLGNBQWMsQ0FBQyxHQUFHLENBQUMsMEJBQTBCLG9DQUEyQixJQUFJLElBQUksQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDO0lBQ25JLElBQUksSUFBSSxFQUFFLENBQUM7UUFDVixPQUFPLElBQUksQ0FBQztJQUNiLENBQUM7SUFDRCxJQUFJLENBQUM7UUFDSixNQUFNLFFBQVEsR0FBRyxNQUFNLFdBQVcsQ0FBQyxRQUFRLENBQUMsa0JBQWtCLENBQUMsd0JBQXdCLENBQUMsQ0FBQztRQUN6RixNQUFNLEtBQUssR0FBRyxRQUFRLENBQUMsS0FBSyxDQUFDLFFBQVEsRUFBRSxDQUFDO1FBQ3hDLElBQUksR0FBRyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDO0lBQ3JDLENBQUM7SUFBQyxPQUFPLENBQUMsRUFBRSxDQUFDO1FBQ1osSUFBSSxHQUFHLElBQUksQ0FBQztJQUNiLENBQUM7SUFFRCxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDWCxJQUFJLEdBQUcsWUFBWSxFQUFFLENBQUM7UUFDdEIsSUFBSSxDQUFDO1lBQ0osTUFBTSxXQUFXLENBQUMsU0FBUyxDQUFDLGtCQUFrQixDQUFDLHdCQUF3QixFQUFFLFFBQVEsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztRQUNyRyxDQUFDO1FBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztZQUNoQixNQUFNO1FBQ1AsQ0FBQztJQUNGLENBQUM7SUFFRCxjQUFjLEVBQUUsS0FBSyxDQUFDLDBCQUEwQixFQUFFLElBQUksbUVBQWtELENBQUM7SUFFekcsT0FBTyxJQUFJLENBQUM7QUFDYixDQUFDIn0=