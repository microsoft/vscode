/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Emitter } from '../../../base/common/event.js';
import { MainContext } from './extHost.protocol.js';
import { ExtHostNotebookEditor } from './extHostNotebookEditor.js';
export class ExtHostNotebookRenderers {
    constructor(mainContext, _extHostNotebook) {
        this._extHostNotebook = _extHostNotebook;
        this._rendererMessageEmitters = new Map();
        this.proxy = mainContext.getProxy(MainContext.MainThreadNotebookRenderers);
    }
    $postRendererMessage(editorId, rendererId, message) {
        const editor = this._extHostNotebook.getEditorById(editorId);
        this._rendererMessageEmitters.get(rendererId)?.fire({ editor: editor.apiEditor, message });
    }
    createRendererMessaging(manifest, rendererId) {
        if (!manifest.contributes?.notebookRenderer?.some(r => r.id === rendererId)) {
            throw new Error(`Extensions may only call createRendererMessaging() for renderers they contribute (got ${rendererId})`);
        }
        const messaging = {
            onDidReceiveMessage: (listener, thisArg, disposables) => {
                return this.getOrCreateEmitterFor(rendererId).event(listener, thisArg, disposables);
            },
            postMessage: (message, editorOrAlias) => {
                if (ExtHostNotebookEditor.apiEditorsToExtHost.has(message)) { // back compat for swapped args
                    [message, editorOrAlias] = [editorOrAlias, message];
                }
                const extHostEditor = editorOrAlias && ExtHostNotebookEditor.apiEditorsToExtHost.get(editorOrAlias);
                return this.proxy.$postMessage(extHostEditor?.id, rendererId, message);
            },
        };
        return messaging;
    }
    getOrCreateEmitterFor(rendererId) {
        let emitter = this._rendererMessageEmitters.get(rendererId);
        if (emitter) {
            return emitter;
        }
        emitter = new Emitter({
            onDidRemoveLastListener: () => {
                emitter?.dispose();
                this._rendererMessageEmitters.delete(rendererId);
            }
        });
        this._rendererMessageEmitters.set(rendererId, emitter);
        return emitter;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0SG9zdE5vdGVib29rUmVuZGVyZXJzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2FwaS9jb21tb24vZXh0SG9zdE5vdGVib29rUmVuZGVyZXJzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUV4RCxPQUFPLEVBQStDLFdBQVcsRUFBb0MsTUFBTSx1QkFBdUIsQ0FBQztBQUVuSSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0QkFBNEIsQ0FBQztBQUluRSxNQUFNLE9BQU8sd0JBQXdCO0lBSXBDLFlBQVksV0FBeUIsRUFBbUIsZ0JBQTJDO1FBQTNDLHFCQUFnQixHQUFoQixnQkFBZ0IsQ0FBMkI7UUFIbEYsNkJBQXdCLEdBQUcsSUFBSSxHQUFHLEVBQXlGLENBQUM7UUFJNUksSUFBSSxDQUFDLEtBQUssR0FBRyxXQUFXLENBQUMsUUFBUSxDQUFDLFdBQVcsQ0FBQywyQkFBMkIsQ0FBQyxDQUFDO0lBQzVFLENBQUM7SUFFTSxvQkFBb0IsQ0FBQyxRQUFnQixFQUFFLFVBQWtCLEVBQUUsT0FBZ0I7UUFDakYsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLGdCQUFnQixDQUFDLGFBQWEsQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUM3RCxJQUFJLENBQUMsd0JBQXdCLENBQUMsR0FBRyxDQUFDLFVBQVUsQ0FBQyxFQUFFLElBQUksQ0FBQyxFQUFFLE1BQU0sRUFBRSxNQUFNLENBQUMsU0FBUyxFQUFFLE9BQU8sRUFBRSxDQUFDLENBQUM7SUFDNUYsQ0FBQztJQUVNLHVCQUF1QixDQUFDLFFBQStCLEVBQUUsVUFBa0I7UUFDakYsSUFBSSxDQUFDLFFBQVEsQ0FBQyxXQUFXLEVBQUUsZ0JBQWdCLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUUsS0FBSyxVQUFVLENBQUMsRUFBRSxDQUFDO1lBQzdFLE1BQU0sSUFBSSxLQUFLLENBQUMseUZBQXlGLFVBQVUsR0FBRyxDQUFDLENBQUM7UUFDekgsQ0FBQztRQUVELE1BQU0sU0FBUyxHQUFxQztZQUNuRCxtQkFBbUIsRUFBRSxDQUFDLFFBQVEsRUFBRSxPQUFPLEVBQUUsV0FBVyxFQUFFLEVBQUU7Z0JBQ3ZELE9BQU8sSUFBSSxDQUFDLHFCQUFxQixDQUFDLFVBQVUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxRQUFRLEVBQUUsT0FBTyxFQUFFLFdBQVcsQ0FBQyxDQUFDO1lBQ3JGLENBQUM7WUFDRCxXQUFXLEVBQUUsQ0FBQyxPQUFPLEVBQUUsYUFBYSxFQUFFLEVBQUU7Z0JBQ3ZDLElBQUkscUJBQXFCLENBQUMsbUJBQW1CLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsQ0FBQywrQkFBK0I7b0JBQzVGLENBQUMsT0FBTyxFQUFFLGFBQWEsQ0FBQyxHQUFHLENBQUMsYUFBYSxFQUFFLE9BQU8sQ0FBQyxDQUFDO2dCQUNyRCxDQUFDO2dCQUVELE1BQU0sYUFBYSxHQUFHLGFBQWEsSUFBSSxxQkFBcUIsQ0FBQyxtQkFBbUIsQ0FBQyxHQUFHLENBQUMsYUFBYSxDQUFDLENBQUM7Z0JBQ3BHLE9BQU8sSUFBSSxDQUFDLEtBQUssQ0FBQyxZQUFZLENBQUMsYUFBYSxFQUFFLEVBQUUsRUFBRSxVQUFVLEVBQUUsT0FBTyxDQUFDLENBQUM7WUFDeEUsQ0FBQztTQUNELENBQUM7UUFFRixPQUFPLFNBQVMsQ0FBQztJQUNsQixDQUFDO0lBRU8scUJBQXFCLENBQUMsVUFBa0I7UUFDL0MsSUFBSSxPQUFPLEdBQUcsSUFBSSxDQUFDLHdCQUF3QixDQUFDLEdBQUcsQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUM1RCxJQUFJLE9BQU8sRUFBRSxDQUFDO1lBQ2IsT0FBTyxPQUFPLENBQUM7UUFDaEIsQ0FBQztRQUVELE9BQU8sR0FBRyxJQUFJLE9BQU8sQ0FBQztZQUNyQix1QkFBdUIsRUFBRSxHQUFHLEVBQUU7Z0JBQzdCLE9BQU8sRUFBRSxPQUFPLEVBQUUsQ0FBQztnQkFDbkIsSUFBSSxDQUFDLHdCQUF3QixDQUFDLE1BQU0sQ0FBQyxVQUFVLENBQUMsQ0FBQztZQUNsRCxDQUFDO1NBQ0QsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLHdCQUF3QixDQUFDLEdBQUcsQ0FBQyxVQUFVLEVBQUUsT0FBTyxDQUFDLENBQUM7UUFFdkQsT0FBTyxPQUFPLENBQUM7SUFDaEIsQ0FBQztDQUNEIn0=