/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
export const IInteractiveDocumentService = createDecorator('IInteractiveDocumentService');
export class InteractiveDocumentService extends Disposable {
    constructor() {
        super();
        this._onWillAddInteractiveDocument = this._register(new Emitter());
        this.onWillAddInteractiveDocument = this._onWillAddInteractiveDocument.event;
        this._onWillRemoveInteractiveDocument = this._register(new Emitter());
        this.onWillRemoveInteractiveDocument = this._onWillRemoveInteractiveDocument.event;
    }
    willCreateInteractiveDocument(notebookUri, inputUri, languageId) {
        this._onWillAddInteractiveDocument.fire({
            notebookUri,
            inputUri,
            languageId
        });
    }
    willRemoveInteractiveDocument(notebookUri, inputUri) {
        this._onWillRemoveInteractiveDocument.fire({
            notebookUri,
            inputUri
        });
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW50ZXJhY3RpdmVEb2N1bWVudFNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9pbnRlcmFjdGl2ZS9icm93c2VyL2ludGVyYWN0aXZlRG9jdW1lbnRTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxPQUFPLEVBQVMsTUFBTSxrQ0FBa0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFFbEUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBRTdGLE1BQU0sQ0FBQyxNQUFNLDJCQUEyQixHQUFHLGVBQWUsQ0FBOEIsNkJBQTZCLENBQUMsQ0FBQztBQVV2SCxNQUFNLE9BQU8sMEJBQTJCLFNBQVEsVUFBVTtJQU96RDtRQUNDLEtBQUssRUFBRSxDQUFDO1FBTlEsa0NBQTZCLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLE9BQU8sRUFBMkQsQ0FBQyxDQUFDO1FBQ3hJLGlDQUE0QixHQUFHLElBQUksQ0FBQyw2QkFBNkIsQ0FBQyxLQUFLLENBQUM7UUFDdkQscUNBQWdDLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLE9BQU8sRUFBdUMsQ0FBQyxDQUFDO1FBQ3ZILG9DQUErQixHQUFHLElBQUksQ0FBQyxnQ0FBZ0MsQ0FBQyxLQUFLLENBQUM7SUFJOUUsQ0FBQztJQUVELDZCQUE2QixDQUFDLFdBQWdCLEVBQUUsUUFBYSxFQUFFLFVBQWtCO1FBQ2hGLElBQUksQ0FBQyw2QkFBNkIsQ0FBQyxJQUFJLENBQUM7WUFDdkMsV0FBVztZQUNYLFFBQVE7WUFDUixVQUFVO1NBQ1YsQ0FBQyxDQUFDO0lBQ0osQ0FBQztJQUVELDZCQUE2QixDQUFDLFdBQWdCLEVBQUUsUUFBYTtRQUM1RCxJQUFJLENBQUMsZ0NBQWdDLENBQUMsSUFBSSxDQUFDO1lBQzFDLFdBQVc7WUFDWCxRQUFRO1NBQ1IsQ0FBQyxDQUFDO0lBQ0osQ0FBQztDQUNEIn0=