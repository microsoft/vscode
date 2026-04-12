/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { IEditorPaneService } from '../common/editorPaneService.js';
import { EditorPaneDescriptor } from '../../../browser/editor.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
export class EditorPaneService {
    constructor() {
        this.onWillInstantiateEditorPane = EditorPaneDescriptor.onWillInstantiateEditorPane;
    }
    didInstantiateEditorPane(typeId) {
        return EditorPaneDescriptor.didInstantiateEditorPane(typeId);
    }
}
registerSingleton(IEditorPaneService, EditorPaneService, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWRpdG9yUGFuZVNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMvZWRpdG9yL2Jyb3dzZXIvZWRpdG9yUGFuZVNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDcEUsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sNEJBQTRCLENBQUM7QUFDbEUsT0FBTyxFQUFxQixpQkFBaUIsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBRS9HLE1BQU0sT0FBTyxpQkFBaUI7SUFBOUI7UUFJVSxnQ0FBMkIsR0FBRyxvQkFBb0IsQ0FBQywyQkFBMkIsQ0FBQztJQUt6RixDQUFDO0lBSEEsd0JBQXdCLENBQUMsTUFBYztRQUN0QyxPQUFPLG9CQUFvQixDQUFDLHdCQUF3QixDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBQzlELENBQUM7Q0FDRDtBQUVELGlCQUFpQixDQUFDLGtCQUFrQixFQUFFLGlCQUFpQixvQ0FBNEIsQ0FBQyJ9