/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { registerEditorContribution } from '../../../browser/editorExtensions.js';
import { MessageController } from '../../message/browser/messageController.js';
import * as nls from '../../../../nls.js';
export class ReadOnlyMessageController extends Disposable {
    static { this.ID = 'editor.contrib.readOnlyMessageController'; }
    constructor(editor) {
        super();
        this.editor = editor;
        this._register(this.editor.onDidAttemptReadOnlyEdit(() => this._onDidAttemptReadOnlyEdit()));
    }
    _onDidAttemptReadOnlyEdit() {
        const messageController = MessageController.get(this.editor);
        if (messageController && this.editor.hasModel()) {
            let message = this.editor.getOptions().get(105 /* EditorOption.readOnlyMessage */);
            if (!message) {
                if (this.editor.isSimpleWidget) {
                    message = new MarkdownString(nls.localize('editor.simple.readonly', "Cannot edit in read-only input"));
                }
                else {
                    message = new MarkdownString(nls.localize('editor.readonly', "Cannot edit in read-only editor"));
                }
            }
            messageController.showMessage(message, this.editor.getPosition());
        }
    }
}
registerEditorContribution(ReadOnlyMessageController.ID, ReadOnlyMessageController, 2 /* EditorContributionInstantiation.BeforeFirstInteraction */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29udHJpYnV0aW9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbnRyaWIvcmVhZE9ubHlNZXNzYWdlL2Jyb3dzZXIvY29udHJpYnV0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUN4RSxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFFbEUsT0FBTyxFQUFtQywwQkFBMEIsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBR25ILE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQy9FLE9BQU8sS0FBSyxHQUFHLE1BQU0sb0JBQW9CLENBQUM7QUFFMUMsTUFBTSxPQUFPLHlCQUEwQixTQUFRLFVBQVU7YUFFakMsT0FBRSxHQUFHLDBDQUEwQyxDQUFDO0lBRXZFLFlBQ2tCLE1BQW1CO1FBRXBDLEtBQUssRUFBRSxDQUFDO1FBRlMsV0FBTSxHQUFOLE1BQU0sQ0FBYTtRQUdwQyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsd0JBQXdCLENBQUMsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLHlCQUF5QixFQUFFLENBQUMsQ0FBQyxDQUFDO0lBQzlGLENBQUM7SUFFTyx5QkFBeUI7UUFDaEMsTUFBTSxpQkFBaUIsR0FBRyxpQkFBaUIsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQzdELElBQUksaUJBQWlCLElBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLEVBQUUsRUFBRSxDQUFDO1lBQ2pELElBQUksT0FBTyxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsVUFBVSxFQUFFLENBQUMsR0FBRyx3Q0FBOEIsQ0FBQztZQUN6RSxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7Z0JBQ2QsSUFBSSxJQUFJLENBQUMsTUFBTSxDQUFDLGNBQWMsRUFBRSxDQUFDO29CQUNoQyxPQUFPLEdBQUcsSUFBSSxjQUFjLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyx3QkFBd0IsRUFBRSxnQ0FBZ0MsQ0FBQyxDQUFDLENBQUM7Z0JBQ3hHLENBQUM7cUJBQU0sQ0FBQztvQkFDUCxPQUFPLEdBQUcsSUFBSSxjQUFjLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxpQkFBaUIsRUFBRSxpQ0FBaUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ2xHLENBQUM7WUFDRixDQUFDO1lBRUQsaUJBQWlCLENBQUMsV0FBVyxDQUFDLE9BQU8sRUFBRSxJQUFJLENBQUMsTUFBTSxDQUFDLFdBQVcsRUFBRSxDQUFDLENBQUM7UUFDbkUsQ0FBQztJQUNGLENBQUM7O0FBR0YsMEJBQTBCLENBQUMseUJBQXlCLENBQUMsRUFBRSxFQUFFLHlCQUF5QixpRUFBeUQsQ0FBQyJ9