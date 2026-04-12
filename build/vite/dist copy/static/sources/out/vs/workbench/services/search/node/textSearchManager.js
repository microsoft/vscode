/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { toCanonicalName } from '../../textfile/common/encoding.js';
import * as pfs from '../../../../base/node/pfs.js';
import { TextSearchManager } from '../common/textSearchManager.js';
export class NativeTextSearchManager extends TextSearchManager {
    constructor(query, provider, _pfs = pfs, processType = 'searchProcess') {
        super({ query, provider }, {
            readdir: resource => _pfs.Promises.readdir(resource.fsPath),
            toCanonicalName: name => toCanonicalName(name)
        }, processType);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGV4dFNlYXJjaE1hbmFnZXIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMvc2VhcmNoL25vZGUvdGV4dFNlYXJjaE1hbmFnZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3BFLE9BQU8sS0FBSyxHQUFHLE1BQU0sOEJBQThCLENBQUM7QUFHcEQsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFFbkUsTUFBTSxPQUFPLHVCQUF3QixTQUFRLGlCQUFpQjtJQUU3RCxZQUFZLEtBQWlCLEVBQUUsUUFBNkIsRUFBRSxPQUFtQixHQUFHLEVBQUUsY0FBd0MsZUFBZTtRQUM1SSxLQUFLLENBQUMsRUFBRSxLQUFLLEVBQUUsUUFBUSxFQUFFLEVBQUU7WUFDMUIsT0FBTyxFQUFFLFFBQVEsQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQztZQUMzRCxlQUFlLEVBQUUsSUFBSSxDQUFDLEVBQUUsQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDO1NBQzlDLEVBQUUsV0FBVyxDQUFDLENBQUM7SUFDakIsQ0FBQztDQUNEIn0=