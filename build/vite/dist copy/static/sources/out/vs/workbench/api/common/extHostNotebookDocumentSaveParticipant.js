/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { AsyncEmitter } from '../../../base/common/event.js';
import { URI } from '../../../base/common/uri.js';
import { TextDocumentSaveReason, WorkspaceEdit as WorksapceEditConverter } from './extHostTypeConverters.js';
import { WorkspaceEdit } from './extHostTypes.js';
import { SerializableObjectWithBuffers } from '../../services/extensions/common/proxyIdentifier.js';
export class ExtHostNotebookDocumentSaveParticipant {
    constructor(_logService, _notebooksAndEditors, _mainThreadBulkEdits, _thresholds = { timeout: 1500, errors: 3 }) {
        this._logService = _logService;
        this._notebooksAndEditors = _notebooksAndEditors;
        this._mainThreadBulkEdits = _mainThreadBulkEdits;
        this._thresholds = _thresholds;
        this._onWillSaveNotebookDocumentEvent = new AsyncEmitter();
    }
    dispose() {
    }
    getOnWillSaveNotebookDocumentEvent(extension) {
        return (listener, thisArg, disposables) => {
            const wrappedListener = function wrapped(e) { listener.call(thisArg, e); };
            wrappedListener.extension = extension;
            return this._onWillSaveNotebookDocumentEvent.event(wrappedListener, undefined, disposables);
        };
    }
    async $participateInSave(resource, reason, token) {
        const revivedUri = URI.revive(resource);
        const document = this._notebooksAndEditors.getNotebookDocument(revivedUri);
        if (!document) {
            throw new Error('Unable to resolve notebook document');
        }
        const edits = [];
        await this._onWillSaveNotebookDocumentEvent.fireAsync({ notebook: document.apiNotebook, reason: TextDocumentSaveReason.to(reason) }, token, async (thenable, listener) => {
            const now = Date.now();
            const data = await await Promise.resolve(thenable);
            if (Date.now() - now > this._thresholds.timeout) {
                this._logService.warn('onWillSaveNotebookDocument-listener from extension', listener.extension.identifier);
            }
            if (token.isCancellationRequested) {
                return;
            }
            if (data) {
                if (data instanceof WorkspaceEdit) {
                    edits.push(data);
                }
                else {
                    // ignore invalid data
                    this._logService.warn('onWillSaveNotebookDocument-listener from extension', listener.extension.identifier, 'ignored due to invalid data');
                }
            }
            return;
        });
        if (token.isCancellationRequested) {
            return false;
        }
        if (edits.length === 0) {
            return true;
        }
        const dto = { edits: [] };
        for (const edit of edits) {
            const { edits } = WorksapceEditConverter.from(edit);
            dto.edits = dto.edits.concat(edits);
        }
        return this._mainThreadBulkEdits.$tryApplyWorkspaceEdit(new SerializableObjectWithBuffers(dto));
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0SG9zdE5vdGVib29rRG9jdW1lbnRTYXZlUGFydGljaXBhbnQuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvYXBpL2NvbW1vbi9leHRIb3N0Tm90ZWJvb2tEb2N1bWVudFNhdmVQYXJ0aWNpcGFudC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUdoRyxPQUFPLEVBQUUsWUFBWSxFQUFTLE1BQU0sK0JBQStCLENBQUM7QUFDcEUsT0FBTyxFQUFFLEdBQUcsRUFBaUIsTUFBTSw2QkFBNkIsQ0FBQztBQUtqRSxPQUFPLEVBQUUsc0JBQXNCLEVBQUUsYUFBYSxJQUFJLHNCQUFzQixFQUFFLE1BQU0sNEJBQTRCLENBQUM7QUFDN0csT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLG1CQUFtQixDQUFDO0FBRWxELE9BQU8sRUFBRSw2QkFBNkIsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBUXBHLE1BQU0sT0FBTyxzQ0FBc0M7SUFJbEQsWUFDa0IsV0FBd0IsRUFDeEIsb0JBQStDLEVBQy9DLG9CQUE4QyxFQUM5QyxjQUFtRCxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLENBQUMsRUFBRTtRQUgvRSxnQkFBVyxHQUFYLFdBQVcsQ0FBYTtRQUN4Qix5QkFBb0IsR0FBcEIsb0JBQW9CLENBQTJCO1FBQy9DLHlCQUFvQixHQUFwQixvQkFBb0IsQ0FBMEI7UUFDOUMsZ0JBQVcsR0FBWCxXQUFXLENBQW9FO1FBTmhGLHFDQUFnQyxHQUFHLElBQUksWUFBWSxFQUFpQyxDQUFDO0lBUXRHLENBQUM7SUFFRCxPQUFPO0lBQ1AsQ0FBQztJQUVELGtDQUFrQyxDQUFDLFNBQWdDO1FBQ2xFLE9BQU8sQ0FBQyxRQUFRLEVBQUUsT0FBTyxFQUFFLFdBQVcsRUFBRSxFQUFFO1lBQ3pDLE1BQU0sZUFBZSxHQUFzRCxTQUFTLE9BQU8sQ0FB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