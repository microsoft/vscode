/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { HierarchicalKind } from '../../../../base/common/hierarchicalKind.js';
import * as nls from '../../../../nls.js';
import { EditorAction, EditorCommand, registerEditorAction, registerEditorCommand, registerEditorContribution } from '../../../browser/editorExtensions.js';
import { EditorContextKeys } from '../../../common/editorContextKeys.js';
import { registerEditorFeature } from '../../../common/editorFeatures.js';
import { CopyPasteController, changePasteTypeCommandId, pasteWidgetVisibleCtx } from './copyPasteController.js';
import { DefaultPasteProvidersFeature, DefaultTextPasteOrDropEditProvider } from './defaultProviders.js';
export const pasteAsCommandId = 'editor.action.pasteAs';
registerEditorContribution(CopyPasteController.ID, CopyPasteController, 0 /* EditorContributionInstantiation.Eager */); // eager because it listens to events on the container dom node of the editor
registerEditorFeature(DefaultPasteProvidersFeature);
registerEditorCommand(new class extends EditorCommand {
    constructor() {
        super({
            id: changePasteTypeCommandId,
            precondition: pasteWidgetVisibleCtx,
            kbOpts: {
                weight: 100 /* KeybindingWeight.EditorContrib */,
                primary: 2048 /* KeyMod.CtrlCmd */ | 89 /* KeyCode.Period */,
            }
        });
    }
    runEditorCommand(_accessor, editor) {
        return CopyPasteController.get(editor)?.changePasteType();
    }
});
registerEditorCommand(new class extends EditorCommand {
    constructor() {
        super({
            id: 'editor.hidePasteWidget',
            precondition: pasteWidgetVisibleCtx,
            kbOpts: {
                weight: 100 /* KeybindingWeight.EditorContrib */,
                primary: 9 /* KeyCode.Escape */,
            }
        });
    }
    runEditorCommand(_accessor, editor) {
        CopyPasteController.get(editor)?.clearWidgets();
    }
});
registerEditorAction(class PasteAsAction extends EditorAction {
    static { this.argsSchema = {
        oneOf: [
            {
                type: 'object',
                required: ['kind'],
                properties: {
                    kind: {
                        type: 'string',
                        description: nls.localize('pasteAs.kind', "The kind of the paste edit to try pasting with.\nIf there are multiple edits for this kind, the editor will show a picker. If there are no edits of this kind, the editor will show an error message."),
                    }
                },
            },
            {
                type: 'object',
                required: ['preferences'],
                properties: {
                    preferences: {
                        type: 'array',
                        description: nls.localize('pasteAs.preferences', "List of preferred paste edit kind to try applying.\nThe first edit matching the preferences will be applied."),
                        items: { type: 'string' }
                    }
                },
            }
        ]
    }; }
    constructor() {
        super({
            id: pasteAsCommandId,
            label: nls.localize2('pasteAs', "Paste As..."),
            precondition: EditorContextKeys.writable,
            metadata: {
                description: 'Paste as',
                args: [{
                        name: 'args',
                        schema: PasteAsAction.argsSchema
                    }]
            },
            canTriggerInlineEdits: true,
        });
    }
    run(_accessor, editor, args) {
        let preference;
        if (args) {
            if ('kind' in args) {
                preference = { only: new HierarchicalKind(args.kind) };
            }
            else if ('preferences' in args) {
                preference = { preferences: args.preferences.map(kind => new HierarchicalKind(kind)) };
            }
        }
        return CopyPasteController.get(editor)?.pasteAs(preference);
    }
});
registerEditorAction(class extends EditorAction {
    constructor() {
        super({
            id: 'editor.action.pasteAsText',
            label: nls.localize2('pasteAsText', "Paste as Text"),
            precondition: EditorContextKeys.writable,
            canTriggerInlineEdits: true,
        });
    }
    run(_accessor, editor) {
        return CopyPasteController.get(editor)?.pasteAs({ providerId: DefaultTextPasteOrDropEditProvider.id });
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29weVBhc3RlQ29udHJpYnV0aW9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbnRyaWIvZHJvcE9yUGFzdGVJbnRvL2Jyb3dzZXIvY29weVBhc3RlQ29udHJpYnV0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBRy9FLE9BQU8sS0FBSyxHQUFHLE1BQU0sb0JBQW9CLENBQUM7QUFHMUMsT0FBTyxFQUFFLFlBQVksRUFBRSxhQUFhLEVBQXFELG9CQUFvQixFQUFFLHFCQUFxQixFQUFFLDBCQUEwQixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDL00sT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDekUsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDMUUsT0FBTyxFQUFFLG1CQUFtQixFQUFtQix3QkFBd0IsRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQ2pJLE9BQU8sRUFBRSw0QkFBNEIsRUFBRSxrQ0FBa0MsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBRXpHLE1BQU0sQ0FBQyxNQUFNLGdCQUFnQixHQUFHLHVCQUF1QixDQUFDO0FBRXhELDBCQUEwQixDQUFDLG1CQUFtQixDQUFDLEVBQUUsRUFBRSxtQkFBbUIsZ0RBQXdDLENBQUMsQ0FBQyw2RUFBNkU7QUFDN0wscUJBQXFCLENBQUMsNEJBQTRCLENBQUMsQ0FBQztBQUVwRCxxQkFBcUIsQ0FBQyxJQUFJLEtBQU0sU0FBUSxhQUFhO0lBQ3BEO1FBQ0MsS0FBSyxDQUFDO1lBQ0wsRUFBRSxFQUFFLHdCQUF3QjtZQUM1QixZQUFZLEVBQUUscUJBQXFCO1lBQ25DLE1BQU0sRUFBRTtnQkFDUCxNQUFNLDBDQUFnQztn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