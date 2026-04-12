/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { isEqual } from '../../../../base/common/resources.js';
import { isIChatSessionFileChange2 } from '../common/chatSessionsService.js';
export function editingEntriesContainResource(entries, resourceUri) {
    for (const entry of entries) {
        if (isEqual(entry.modifiedURI, resourceUri) || isEqual(entry.originalURI, resourceUri)) {
            return true;
        }
    }
    return false;
}
export function agentSessionContainsResource(session, resourceUri) {
    if (!(session.changes instanceof Array)) {
        return false;
    }
    for (const change of session.changes) {
        if (isIChatSessionFileChange2(change)) {
            if (isEqual(change.uri, resourceUri) || (change.originalUri && isEqual(change.originalUri, resourceUri)) || (change.modifiedUri && isEqual(change.modifiedUri, resourceUri))) {
                return true;
            }
        }
        else if (isEqual(change.modifiedUri, resourceUri) || (change.originalUri && isEqual(change.originalUri, resourceUri))) {
            return true;
        }
    }
    return false;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2Vzc2lvblJlc291cmNlTWF0Y2hpbmcuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvc2Vzc2lvblJlc291cmNlTWF0Y2hpbmcudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBRS9ELE9BQU8sRUFBRSx5QkFBeUIsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBSTdFLE1BQU0sVUFBVSw2QkFBNkIsQ0FBQyxPQUFzQyxFQUFFLFdBQWdCO0lBQ3JHLEtBQUssTUFBTSxLQUFLLElBQUksT0FBTyxFQUFFLENBQUM7UUFDN0IsSUFBSSxPQUFPLENBQUMsS0FBSyxDQUFDLFdBQVcsRUFBRSxXQUFXLENBQUMsSUFBSSxPQUFPLENBQUMsS0FBSyxDQUFDLFdBQVcsRUFBRSxXQUFXLENBQUMsRUFBRSxDQUFDO1lBQ3hGLE9BQU8sSUFBSSxDQUFDO1FBQ2IsQ0FBQztJQUNGLENBQUM7SUFFRCxPQUFPLEtBQUssQ0FBQztBQUNkLENBQUM7QUFFRCxNQUFNLFVBQVUsNEJBQTRCLENBQUMsT0FBc0IsRUFBRSxXQUFnQjtJQUNwRixJQUFJLENBQUMsQ0FBQyxPQUFPLENBQUMsT0FBTyxZQUFZLEtBQUssQ0FBQyxFQUFFLENBQUM7UUFDekMsT0FBTyxLQUFLLENBQUM7SUFDZCxDQUFDO0lBRUQsS0FBSyxNQUFNLE1BQU0sSUFBSSxPQUFPLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDdEMsSUFBSSx5QkFBeUIsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDO1lBQ3ZDLElBQUksT0FBTyxDQUFDLE1BQU0sQ0FBQyxHQUFHLEVBQUUsV0FBVyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsV0FBVyxJQUFJLE9BQU8sQ0FBQyxNQUFNLENBQUMsV0FBVyxFQUFFLFdBQVcsQ0FBQyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsV0FBVyxJQUFJLE9BQU8sQ0FBQyxNQUFNLENBQUMsV0FBVyxFQUFFLFdBQVcsQ0FBQyxDQUFDLEVBQUUsQ0FBQztnQkFDOUssT0FBTyxJQUFJLENBQUM7WUFDYixDQUFDO1FBQ0YsQ0FBQzthQUFNLElBQUksT0FBTyxDQUFDLE1BQU0sQ0FBQyxXQUFXLEVBQUUsV0FBVyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsV0FBVyxJQUFJLE9BQU8sQ0FBQyxNQUFNLENBQUMsV0FBVyxFQUFFLFdBQVcsQ0FBQyxDQUFDLEVBQUUsQ0FBQztZQUN6SCxPQUFPLElBQUksQ0FBQztRQUNiLENBQUM7SUFDRixDQUFDO0lBRUQsT0FBTyxLQUFLLENBQUM7QUFDZCxDQUFDIn0=