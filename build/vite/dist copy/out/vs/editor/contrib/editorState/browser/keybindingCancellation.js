/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { EditorCommand, registerEditorCommand } from '../../../browser/editorExtensions.js';
import { IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { LinkedList } from '../../../../base/common/linkedList.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { localize } from '../../../../nls.js';
const IEditorCancellationTokens = createDecorator('IEditorCancelService');
const ctxCancellableOperation = new RawContextKey('cancellableOperation', false, localize('cancellableOperation', 'Whether the editor runs a cancellable operation, e.g. like \'Peek References\''));
registerSingleton(IEditorCancellationTokens, class {
    constructor() {
        this._tokens = new WeakMap();
    }
    add(editor, cts) {
        let data = this._tokens.get(editor);
        if (!data) {
            data = editor.invokeWithinContext(accessor => {
                const key = ctxCancellableOperation.bindTo(accessor.get(IContextKeyService));
                const tokens = new LinkedList();
                return { key, tokens };
            });
            this._tokens.set(editor, data);
        }
        let removeFn;
        data.key.set(true);
        removeFn = data.tokens.push(cts);
        return () => {
            // remove w/o cancellation
            if (removeFn) {
                removeFn();
                data.key.set(!data.tokens.isEmpty());
                removeFn = undefined;
            }
        };
    }
    cancel(editor) {
        const data = this._tokens.get(editor);
        if (!data) {
            return;
        }
        // remove with cancellation
        const cts = data.tokens.pop();
        if (cts) {
            cts.cancel();
            data.key.set(!data.tokens.isEmpty());
        }
    }
}, 1 /* InstantiationType.Delayed */);
export class EditorKeybindingCancellationTokenSource extends CancellationTokenSource {
    constructor(editor, parent) {
        super(parent);
        this.editor = editor;
        this._unregister = editor.invokeWithinContext(accessor => accessor.get(IEditorCancellationTokens).add(editor, this));
    }
    dispose() {
        this._unregister();
        super.dispose();
    }
}
registerEditorCommand(new class extends EditorCommand {
    constructor() {
        super({
            id: 'editor.cancelOperation',
            kbOpts: {
                weight: 100 /* KeybindingWeight.EditorContrib */,
                primary: 9 /* KeyCode.Escape */
            },
            precondition: ctxCancellableOperation
        });
    }
    runEditorCommand(accessor, editor) {
        accessor.get(IEditorCancellationTokens).cancel(editor);
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoia2V5YmluZGluZ0NhbmNlbGxhdGlvbi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9jb250cmliL2VkaXRvclN0YXRlL2Jyb3dzZXIva2V5YmluZGluZ0NhbmNlbGxhdGlvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUdoRyxPQUFPLEVBQUUsYUFBYSxFQUFFLHFCQUFxQixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFFNUYsT0FBTyxFQUFFLGtCQUFrQixFQUFFLGFBQWEsRUFBZSxNQUFNLHNEQUFzRCxDQUFDO0FBRXRILE9BQU8sRUFBRSx1QkFBdUIsRUFBcUIsTUFBTSx5Q0FBeUMsQ0FBQztBQUNyRyxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDbkUsT0FBTyxFQUFFLGVBQWUsRUFBb0IsTUFBTSw0REFBNEQsQ0FBQztBQUMvRyxPQUFPLEVBQXFCLGlCQUFpQixFQUFFLE1BQU0seURBQXlELENBQUM7QUFDL0csT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBRzlDLE1BQU0seUJBQXlCLEdBQUcsZUFBZSxDQUE0QixzQkFBc0IsQ0FBQyxDQUFDO0FBUXJHLE1BQU0sdUJBQXVCLEdBQUcsSUFBSSxhQUFhLENBQUMsc0JBQXNCLEVBQUUsS0FBSyxFQUFFLFFBQVEsQ0FBQyxzQkFBc0IsRUFBRSxnRkFBZ0YsQ0FBQyxDQUFDLENBQUM7QUFFck0saUJBQWlCLENBQUMseUJBQXlCLEVBQUU7SUFBQTtRQUkzQixZQUFPLEdBQUcsSUFBSSxPQUFPLEVBQTJGLENBQUM7SUF5Q25JLENBQUM7SUF2Q0EsR0FBRyxDQUFDLE1BQW1CLEVBQUUsR0FBNEI7UUFDcEQsSUFBSSxJQUFJLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDcEMsSUFBSSxD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