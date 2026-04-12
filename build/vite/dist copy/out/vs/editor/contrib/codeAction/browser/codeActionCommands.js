/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { HierarchicalKind } from '../../../../base/common/hierarchicalKind.js';
import { escapeRegExpCharacters } from '../../../../base/common/strings.js';
import { EditorAction, EditorAction2, EditorCommand } from '../../../browser/editorExtensions.js';
import { EditorContextKeys } from '../../../common/editorContextKeys.js';
import { autoFixCommandId, codeActionCommandId, fixAllCommandId, organizeImportsCommandId, quickFixCommandId, refactorCommandId, sourceActionCommandId } from './codeAction.js';
import * as nls from '../../../../nls.js';
import { MenuId } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { CodeActionCommandArgs, CodeActionKind, CodeActionTriggerSource } from '../common/types.js';
import { CodeActionController } from './codeActionController.js';
import { SUPPORTED_CODE_ACTIONS } from './codeActionModel.js';
import { Codicon } from '../../../../base/common/codicons.js';
function contextKeyForSupportedActions(kind) {
    return ContextKeyExpr.regex(SUPPORTED_CODE_ACTIONS.keys()[0], new RegExp('(\\s|^)' + escapeRegExpCharacters(kind.value) + '\\b'));
}
const argsSchema = {
    type: 'object',
    defaultSnippets: [{ body: { kind: '' } }],
    properties: {
        'kind': {
            type: 'string',
            description: nls.localize('args.schema.kind', "Kind of the code action to run."),
        },
        'apply': {
            type: 'string',
            description: nls.localize('args.schema.apply', "Controls when the returned actions are applied."),
            default: "ifSingle" /* CodeActionAutoApply.IfSingle */,
            enum: ["first" /* CodeActionAutoApply.First */, "ifSingle" /* CodeActionAutoApply.IfSingle */, "never" /* CodeActionAutoApply.Never */],
            enumDescriptions: [
                nls.localize('args.schema.apply.first', "Always apply the first returned code action."),
                nls.localize('args.schema.apply.ifSingle', "Apply the first returned code action if it is the only one."),
                nls.localize('args.schema.apply.never', "Do not apply the returned code actions."),
            ]
        },
        'preferred': {
            type: 'boolean',
            default: false,
            description: nls.localize('args.schema.preferred', "Controls if only preferred code actions should be returned."),
        }
    }
};
function triggerCodeActionsForEditorSelection(editor, notAvailableMessage, filter, autoApply, triggerAction = CodeActionTriggerSource.Default) {
    if (editor.hasModel()) {
        const controller = CodeActionController.get(editor);
        controller?.manualTriggerAtCurrentPosition(notAvailableMessage, triggerAction, filter, autoApply);
    }
}
export class QuickFixAction extends EditorAction2 {
    constructor() {
        super({
            id: quickFixCommandId,
            title: nls.localize2('quickfix.trigger.label', "Quick Fix..."),
            precondition: ContextKeyExpr.and(EditorContextKeys.writable, EditorContextKeys.hasCodeActionsProvider),
            icon: Codicon.lightBulb,
            f1: true,
            keybinding: {
                when: EditorContextKeys.textInputFocus,
                primary: 2048 /* KeyMod.CtrlCmd */ | 89 /* KeyCode.Period */,
                weight: 100 /* KeybindingWeight.EditorContrib */
            },
            menu: {
                id: MenuId.InlineChatEditorAffordance,
                group: '1_quickfix',
                order: 0,
                when: ContextKeyExpr.and(EditorContextKeys.writable, EditorContextKeys.hasCodeActionsProvider)
            }
        });
    }
    runEditorCommand(_accessor, editor) {
        return triggerCodeActionsForEditorSelection(editor, nls.localize('editor.action.quickFix.noneMessage', "No code actions available"), undefined, undefined, CodeActionTriggerSource.QuickFix);
    }
}
export class CodeActionCommand extends EditorCommand {
    constructor() {
        super({
            id: codeActionCommandId,
            precondition: ContextKeyExpr.and(EditorContextKeys.writable, EditorContextKeys.hasCodeActionsProvider),
            metadata: {
                description: 'Trigger a code action',
                args: [{ name: 'args', schema: argsSchema, }]
            }
        });
    }
    runEditorCommand(_accessor, editor, userArgs) {
        const args = CodeActionCommandArgs.fromUser(userArgs, {
            kind: HierarchicalKind.Empty,
            apply: "ifSingle" /* CodeActionAutoApply.IfSingle */,
        });
        return triggerCodeActionsForEditorSelection(editor, typeof userArgs?.kind === 'string'
            ? args.preferred
                ? nls.localize('editor.action.codeAction.noneMessage.preferred.kind', "No preferred code actions for '{0}' available", userArgs.kind)
                : nls.localize('editor.action.codeAction.noneMessage.kind', "No code actions for '{0}' available", userArgs.kind)
            : args.preferred
                ? nls.localize('editor.action.codeAction.noneMessage.preferred', "No preferred code actions available")
                : nls.localize('editor.action.codeAction.noneMessage', "No code actions available"), {
            include: args.kind,
            includeSourceActions: true,
            onlyIncludePreferredActions: args.preferred,
        }, args.apply);
    }
}
export class RefactorAction extends EditorAction {
    constructor() {
        super({
            id: refactorCommandId,
            label: nls.localize2('refactor.label', "Refactor..."),
            precondition: ContextKeyExpr.and(EditorContextKeys.writable, EditorContextKeys.hasCodeActionsProvider),
            kbOpts: {
                kbExpr: EditorContextKeys.textInputFocus,
                primary: 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 48 /* KeyCode.KeyR */,
                mac: {
                    primary: 256 /* KeyMod.WinCtrl */ | 1024 /* KeyMod.Shift */ | 48 /* KeyCode.KeyR */
                },
                weight: 100 /* KeybindingWeight.EditorContrib */
            },
            contextMenuOpts: {
                group: '1_modification',
                order: 2,
                when: ContextKeyExpr.and(EditorContextKeys.writable, contextKeyForSupportedActions(CodeActionKind.Refactor)),
            },
            metadata: {
                description: 'Refactor...',
                args: [{ name: 'args', schema: argsSchema }]
            }
        });
    }
    run(_accessor, editor, userArgs) {
        const args = CodeActionCommandArgs.fromUser(userArgs, {
            kind: CodeActionKind.Refactor,
            apply: "never" /* CodeActionAutoApply.Never */
        });
        return triggerCodeActionsForEditorSelection(editor, typeof userArgs?.kind === 'string'
            ? args.preferred
                ? nls.localize('editor.action.refactor.noneMessage.preferred.kind', "No preferred refactorings for '{0}' available", userArgs.kind)
                : nls.localize('editor.action.refactor.noneMessage.kind', "No refactorings for '{0}' available", userArgs.kind)
            : args.preferred
                ? nls.localize('editor.action.refactor.noneMessage.preferred', "No preferred refactorings available")
                : nls.localize('editor.action.refactor.noneMessage', "No refactorings available"), {
            include: CodeActionKind.Refactor.contains(args.kind) ? args.kind : HierarchicalKind.None,
            onlyIncludePreferredActions: args.preferred
        }, args.apply, CodeActionTriggerSource.Refactor);
    }
}
export class SourceAction extends EditorAction {
    constructor() {
        super({
            id: sourceActionCommandId,
            label: nls.localize2('source.label', "Source Action..."),
            precondition: ContextKeyExpr.and(EditorContextKeys.writable, EditorContextKeys.hasCodeActionsProvider),
            contextMenuOpts: {
                group: '1_modification',
                order: 2.1,
                when: ContextKeyExpr.and(EditorContextKeys.writable, contextKeyForSupportedActions(CodeActionKind.Source)),
            },
            metadata: {
                description: 'Source Action...',
                args: [{ name: 'args', schema: argsSchema }]
            }
        });
    }
    run(_accessor, editor, userArgs) {
        const args = CodeActionCommandArgs.fromUser(userArgs, {
            kind: CodeActionKind.Source,
            apply: "never" /* CodeActionAutoApply.Never */
        });
        return triggerCodeActionsForEditorSelection(editor, typeof userArgs?.kind === 'string'
            ? args.preferred
                ? nls.localize('editor.action.source.noneMessage.preferred.kind', "No preferred source actions for '{0}' available", userArgs.kind)
                : nls.localize('editor.action.source.noneMessage.kind', "No source actions for '{0}' available", userArgs.kind)
            : args.preferred
                ? nls.localize('editor.action.source.noneMessage.preferred', "No preferred source actions available")
                : nls.localize('editor.action.source.noneMessage', "No source actions available"), {
            include: CodeActionKind.Source.contains(args.kind) ? args.kind : HierarchicalKind.None,
            includeSourceActions: true,
            onlyIncludePreferredActions: args.preferred,
        }, args.apply, CodeActionTriggerSource.SourceAction);
    }
}
export class OrganizeImportsAction extends EditorAction {
    constructor() {
        super({
            id: organizeImportsCommandId,
            label: nls.localize2('organizeImports.label', "Organize Imports"),
            precondition: ContextKeyExpr.and(EditorContextKeys.writable, contextKeyForSupportedActions(CodeActionKind.SourceOrganizeImports)),
            kbOpts: {
                kbExpr: EditorContextKeys.textInputFocus,
                primary: 1024 /* KeyMod.Shift */ | 512 /* KeyMod.Alt */ | 45 /* KeyCode.KeyO */,
                weight: 100 /* KeybindingWeight.EditorContrib */
            },
            metadata: {
                description: nls.localize2('organizeImports.description', "Organize imports in the current file. Also called 'Optimize Imports' by some tools")
            }
        });
    }
    run(_accessor, editor) {
        return triggerCodeActionsForEditorSelection(editor, nls.localize('editor.action.organize.noneMessage', "No organize imports action available"), { include: CodeActionKind.SourceOrganizeImports, includeSourceActions: true }, "ifSingle" /* CodeActionAutoApply.IfSingle */, CodeActionTriggerSource.OrganizeImports);
    }
}
export class FixAllAction extends EditorAction {
    constructor() {
        super({
            id: fixAllCommandId,
            label: nls.localize2('fixAll.label', "Fix All"),
            precondition: ContextKeyExpr.and(EditorContextKeys.writable, contextKeyForSupportedActions(CodeActionKind.SourceFixAll))
        });
    }
    run(_accessor, editor) {
        return triggerCodeActionsForEditorSelection(editor, nls.localize('fixAll.noneMessage', "No fix all action available"), { include: CodeActionKind.SourceFixAll, includeSourceActions: true }, "ifSingle" /* CodeActionAutoApply.IfSingle */, CodeActionTriggerSource.FixAll);
    }
}
export class AutoFixAction extends EditorAction {
    constructor() {
        super({
            id: autoFixCommandId,
            label: nls.localize2('autoFix.label', "Auto Fix..."),
            precondition: ContextKeyExpr.and(EditorContextKeys.writable, contextKeyForSupportedActions(CodeActionKind.QuickFix)),
            kbOpts: {
                kbExpr: EditorContextKeys.textInputFocus,
                primary: 512 /* KeyMod.Alt */ | 1024 /* KeyMod.Shift */ | 89 /* KeyCode.Period */,
                mac: {
                    primary: 2048 /* KeyMod.CtrlCmd */ | 512 /* KeyMod.Alt */ | 89 /* KeyCode.Period */
                },
                weight: 100 /* KeybindingWeight.EditorContrib */
            }
        });
    }
    run(_accessor, editor) {
        return triggerCodeActionsForEditorSelection(editor, nls.localize('editor.action.autoFix.noneMessage', "No auto fixes available"), {
            include: CodeActionKind.QuickFix,
            onlyIncludePreferredActions: true
        }, "ifSingle" /* CodeActionAutoApply.IfSingle */, CodeActionTriggerSource.AutoFix);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29kZUFjdGlvbkNvbW1hbmRzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL2NvbnRyaWIvY29kZUFjdGlvbi9icm93c2VyL2NvZGVBY3Rpb25Db21tYW5kcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUcvRSxPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUU1RSxPQUFPLEVBQUUsWUFBWSxFQUFFLGFBQWEsRUFBRSxhQUFhLEVBQW9CLE1BQU0sc0NBQXNDLENBQUM7QUFDcEgsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDekUsT0FBTyxFQUFFLGdCQUFnQixFQUFFLG1CQUFtQixFQUFFLGVBQWUsRUFBRSx3QkFBd0IsRUFBRSxpQkFBaUIsRUFBRSxpQkFBaUIsRUFBRSxxQkFBcUIsRUFBRSxNQUFNLGlCQUFpQixDQUFDO0FBQ2hMLE9BQU8sS0FBSyxHQUFHLE1BQU0sb0JBQW9CLENBQUM7QUFDMUMsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ3hFLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUV0RixPQUFPLEVBQXVCLHFCQUFxQixFQUFvQixjQUFjLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUMzSSxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSwyQkFBMkIsQ0FBQztBQUNqRSxPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSxzQkFBc0IsQ0FBQztBQUM5RCxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFFOUQsU0FBUyw2QkFBNkIsQ0FBQyxJQUFzQjtJQUM1RCxPQUFPLGNBQWMsQ0FBQyxL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