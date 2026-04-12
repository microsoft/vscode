/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { isSearchTreeFileMatch } from '../searchTreeModel/searchTreeCommon.js';
export function isNotebookFileMatch(obj) {
    return obj &&
        typeof obj.bindNotebookEditorWidget === 'function' &&
        typeof obj.updateMatchesForEditorWidget === 'function' &&
        typeof obj.unbindNotebookEditorWidget === 'function' &&
        typeof obj.updateNotebookHighlights === 'function'
        && isSearchTreeFileMatch(obj);
}
export function isIMatchInNotebook(obj) {
    return typeof obj === 'object' &&
        obj !== null &&
        typeof obj.parent === 'function' &&
        typeof obj.cellParent === 'object' &&
        typeof obj.isWebviewMatch === 'function' &&
        typeof obj.cellIndex === 'number' &&
        (typeof obj.webviewIndex === 'number' || obj.webviewIndex === undefined) &&
        (typeof obj.cell === 'object' || obj.cell === undefined);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm90ZWJvb2tTZWFyY2hNb2RlbEJhc2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9zZWFyY2gvYnJvd3Nlci9ub3RlYm9va1NlYXJjaC9ub3RlYm9va1NlYXJjaE1vZGVsQmFzZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQU1oRyxPQUFPLEVBQTBDLHFCQUFxQixFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFjdkgsTUFBTSxVQUFVLG1CQUFtQixDQUFDLEdBQVE7SUFDM0MsT0FBTyxHQUFHO1FBQ1QsT0FBTyxHQUFHLENBQUMsd0JBQXdCLEtBQUssVUFBVTtRQUNsRCxPQUFPLEdBQUcsQ0FBQyw0QkFBNEIsS0FBSyxVQUFVO1FBQ3RELE9BQU8sR0FBRyxDQUFDLDBCQUEwQixLQUFLLFVBQVU7UUFDcEQsT0FBTyxHQUFHLENBQUMsd0JBQXdCLEtBQUssVUFBVTtXQUMvQyxxQkFBcUIsQ0FBQyxHQUFHLENBQUMsQ0FBQztBQUNoQyxDQUFDO0FBVUQsTUFBTSxVQUFVLGtCQUFrQixDQUFDLEdBQVE7SUFDMUMsT0FBTyxPQUFPLEdBQUcsS0FBSyxRQUFRO1FBQzdCLEdBQUcsS0FBSyxJQUFJO1FBQ1osT0FBTyxHQUFHLENBQUMsTUFBTSxLQUFLLFVBQVU7UUFDaEMsT0FBTyxHQUFHLENBQUMsVUFBVSxLQUFLLFFBQVE7UUFDbEMsT0FBTyxHQUFHLENBQUMsY0FBYyxLQUFLLFVBQVU7UUFDeEMsT0FBTyxHQUFHLENBQUMsU0FBUyxLQUFLLFFBQVE7UUFDakMsQ0FBQyxPQUFPLEdBQUcsQ0FBQyxZQUFZLEtBQUssUUFBUSxJQUFJLEdBQUcsQ0FBQyxZQUFZLEtBQUssU0FBUyxDQUFDO1FBQ3hFLENBQUMsT0FBTyxHQUFHLENBQUMsSUFBSSxLQUFLLFFBQVEsSUFBSSxHQUFHLENBQUMsSUFBSSxLQUFLLFNBQVMsQ0FBQyxDQUFDO0FBQzNELENBQUMifQ==