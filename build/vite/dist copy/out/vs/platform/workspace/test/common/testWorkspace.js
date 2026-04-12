/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { isLinux, isWindows } from '../../../../base/common/platform.js';
import { URI } from '../../../../base/common/uri.js';
import { toWorkspaceFolder, Workspace as BaseWorkspace } from '../../common/workspace.js';
export class Workspace extends BaseWorkspace {
    constructor(id, folders = [], configuration = null, ignorePathCasing = () => !isLinux) {
        super(id, folders, false, configuration, ignorePathCasing);
    }
}
const wsUri = URI.file(isWindows ? 'C:\\testWorkspace' : '/testWorkspace');
export const TestWorkspace = testWorkspace(wsUri);
export function testWorkspace(...resource) {
    return new Workspace('test-workspace', resource.map(toWorkspaceFolder));
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVzdFdvcmtzcGFjZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL3dvcmtzcGFjZS90ZXN0L2NvbW1vbi90ZXN0V29ya3NwYWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDekUsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ3JELE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxTQUFTLElBQUksYUFBYSxFQUFtQixNQUFNLDJCQUEyQixDQUFDO0FBRTNHLE1BQU0sT0FBTyxTQUFVLFNBQVEsYUFBYTtJQUMzQyxZQUNDLEVBQVUsRUFDVixVQUE2QixFQUFFLEVBQy9CLGdCQUE0QixJQUFJLEVBQ2hDLG1CQUEwQyxHQUFHLEVBQUUsQ0FBQyxDQUFDLE9BQU87UUFFeEQsS0FBSyxDQUFDLEVBQUUsRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLGFBQWEsRUFBRSxnQkFBZ0IsQ0FBQyxDQUFDO0lBQzVELENBQUM7Q0FDRDtBQUVELE1BQU0sS0FBSyxHQUFHLEdBQUcsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztBQUMzRSxNQUFNLENBQUMsTUFBTSxhQUFhLEdBQUcsYUFBYSxDQUFDLEtBQUssQ0FBQyxDQUFDO0FBRWxELE1BQU0sVUFBVSxhQUFhLENBQUMsR0FBRyxRQUFlO0lBQy9DLE9BQU8sSUFBSSxTQUFTLENBQUMsZ0JBQWdCLEVBQUUsUUFBUSxDQUFDLEdBQUcsQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLENBQUM7QUFDekUsQ0FBQyJ9