/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Emitter } from '../../../base/common/event.js';
import { URI } from '../../../base/common/uri.js';
export class ExtHostNotebookDocuments {
    constructor(_notebooksAndEditors) {
        this._notebooksAndEditors = _notebooksAndEditors;
        this._onDidSaveNotebookDocument = new Emitter();
        this.onDidSaveNotebookDocument = this._onDidSaveNotebookDocument.event;
        this._onDidChangeNotebookDocument = new Emitter();
        this.onDidChangeNotebookDocument = this._onDidChangeNotebookDocument.event;
    }
    $acceptModelChanged(uri, event, isDirty, newMetadata) {
        const document = this._notebooksAndEditors.getNotebookDocument(URI.revive(uri));
        const e = document.acceptModelChanged(event.value, isDirty, newMetadata);
        this._onDidChangeNotebookDocument.fire(e);
    }
    $acceptDirtyStateChanged(uri, isDirty) {
        const document = this._notebooksAndEditors.getNotebookDocument(URI.revive(uri));
        document.acceptDirty(isDirty);
    }
    $acceptModelSaved(uri) {
        const document = this._notebooksAndEditors.getNotebookDocument(URI.revive(uri));
        this._onDidSaveNotebookDocument.fire(document.apiNotebook);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0SG9zdE5vdGVib29rRG9jdW1lbnRzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2FwaS9jb21tb24vZXh0SG9zdE5vdGVib29rRG9jdW1lbnRzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUN4RCxPQUFPLEVBQUUsR0FBRyxFQUFpQixNQUFNLDZCQUE2QixDQUFDO0FBT2pFLE1BQU0sT0FBTyx3QkFBd0I7SUFRcEMsWUFDa0Isb0JBQStDO1FBQS9DLHlCQUFvQixHQUFwQixvQkFBb0IsQ0FBMkI7UUFQaEQsK0JBQTBCLEdBQUcsSUFBSSxPQUFPLEVBQTJCLENBQUM7UUFDNUUsOEJBQXlCLEdBQUcsSUFBSSxDQUFDLDBCQUEwQixDQUFDLEtBQUssQ0FBQztRQUUxRCxpQ0FBNEIsR0FBRyxJQUFJLE9BQU8sRUFBc0MsQ0FBQztRQUN6RixnQ0FBMkIsR0FBRyxJQUFJLENBQUMsNEJBQTRCLENBQUMsS0FBSyxDQUFDO0lBSTNFLENBQUM7SUFFTCxtQkFBbUIsQ0FBQyxHQUFrQixFQUFFLEtBQWtGLEVBQUUsT0FBZ0IsRUFBRSxXQUFzQztRQUNuTCxNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsb0JBQW9CLENBQUMsbUJBQW1CLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO1FBQ2hGLE1BQU0sQ0FBQyxHQUFHLFFBQVEsQ0FBQyxrQkFBa0IsQ0FBQyxLQUFLLENBQUMsS0FBSyxFQUFFLE9BQU8sRUFBRSxXQUFXLENBQUMsQ0FBQztRQUN6RSxJQUFJLENBQUMsNEJBQTRCLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQzNDLENBQUM7SUFFRCx3QkFBd0IsQ0FBQyxHQUFrQixFQUFFLE9BQWdCO1FBQzVELE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxtQkFBbUIsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFDaEYsUUFBUSxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsQ0FBQztJQUMvQixDQUFDO0lBRUQsaUJBQWlCLENBQUMsR0FBa0I7UUFDbkMsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLG9CQUFvQixDQUFDLG1CQUFtQixDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztRQUNoRixJQUFJLENBQUMsMEJBQTBCLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxXQUFXLENBQUMsQ0FBQztJQUM1RCxDQUFDO0NBQ0QifQ==