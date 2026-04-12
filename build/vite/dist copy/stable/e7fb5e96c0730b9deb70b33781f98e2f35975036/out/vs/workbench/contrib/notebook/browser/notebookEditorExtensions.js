/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
class EditorContributionRegistry {
    static { this.INSTANCE = new EditorContributionRegistry(); }
    constructor() {
        this.editorContributions = [];
    }
    registerEditorContribution(id, ctor) {
        this.editorContributions.push({ id, ctor: ctor });
    }
    getEditorContributions() {
        return this.editorContributions.slice(0);
    }
}
export function registerNotebookContribution(id, ctor) {
    EditorContributionRegistry.INSTANCE.registerEditorContribution(id, ctor);
}
export var NotebookEditorExtensionsRegistry;
(function (NotebookEditorExtensionsRegistry) {
    function getEditorContributions() {
        return EditorContributionRegistry.INSTANCE.getEditorContributions();
    }
    NotebookEditorExtensionsRegistry.getEditorContributions = getEditorContributions;
    function getSomeEditorContributions(ids) {
        return EditorContributionRegistry.INSTANCE.getEditorContributions().filter(c => ids.indexOf(c.id) >= 0);
    }
    NotebookEditorExtensionsRegistry.getSomeEditorContributions = getSomeEditorContributions;
})(NotebookEditorExtensionsRegistry || (NotebookEditorExtensionsRegistry = {}));
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm90ZWJvb2tFZGl0b3JFeHRlbnNpb25zLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvbm90ZWJvb2svYnJvd3Nlci9ub3RlYm9va0VkaXRvckV4dGVuc2lvbnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFNaEcsTUFBTSwwQkFBMEI7YUFDUixhQUFRLEdBQUcsSUFBSSwwQkFBMEIsRUFBRSxDQUFDO0lBR25FO1FBQ0MsSUFBSSxDQUFDLG1CQUFtQixHQUFHLEVBQUUsQ0FBQztJQUMvQixDQUFDO0lBRU0sMEJBQTBCLENBQW9DLEVBQVUsRUFBRSxJQUEwRjtRQUMxSyxJQUFJLENBQUMsbUJBQW1CLENBQUMsSUFBSSxDQUFDLEVBQUUsRUFBRSxFQUFFLElBQUksRUFBRSxJQUF1QyxFQUFFLENBQUMsQ0FBQztJQUN0RixDQUFDO0lBRU0sc0JBQXNCO1FBQzVCLE9BQU8sSUFBSSxDQUFDLG1CQUFtQixDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUMxQyxDQUFDOztBQUdGLE1BQU0sVUFBVSw0QkFBNEIsQ0FBb0MsRUFBVSxFQUFFLElBQTBGO0lBQ3JMLDBCQUEwQixDQUFDLFFBQVEsQ0FBQywwQkFBMEIsQ0FBQyxFQUFFLEVBQUUsSUFBSSxDQUFDLENBQUM7QUFDMUUsQ0FBQztBQUVELE1BQU0sS0FBVyxnQ0FBZ0MsQ0FTaEQ7QUFURCxXQUFpQixnQ0FBZ0M7SUFFaEQsU0FBZ0Isc0JBQXNCO1FBQ3JDLE9BQU8sMEJBQTBCLENBQUMsUUFBUSxDQUFDLHNCQUFzQixFQUFFLENBQUM7SUFDckUsQ0FBQztJQUZlLHVEQUFzQix5QkFFckMsQ0FBQTtJQUVELFNBQWdCLDBCQUEwQixDQUFDLEdBQWE7UUFDdkQsT0FBTywwQkFBMEIsQ0FBQyxRQUFRLENBQUMsc0JBQXNCLEVBQUUsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxHQUFHLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztJQUN6RyxDQUFDO0lBRmUsMkRBQTBCLDZCQUV6QyxDQUFBO0FBQ0YsQ0FBQyxFQVRnQixnQ0FBZ0MsS0FBaEMsZ0NBQWdDLFFBU2hEIn0=