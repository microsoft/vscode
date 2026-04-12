/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as nls from '../../../../../nls.js';
import { EmmetEditorAction } from '../emmetActions.js';
import { registerEditorAction } from '../../../../../editor/browser/editorExtensions.js';
import { EditorContextKeys } from '../../../../../editor/common/editorContextKeys.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IsSessionsWindowContext } from '../../../../common/contextkeys.js';
import { MenuId } from '../../../../../platform/actions/common/actions.js';
class ExpandAbbreviationAction extends EmmetEditorAction {
    constructor() {
        super({
            id: 'editor.emmet.action.expandAbbreviation',
            label: nls.localize2('expandAbbreviationAction', "Emmet: Expand Abbreviation"),
            precondition: EditorContextKeys.writable,
            actionName: 'expand_abbreviation',
            kbOpts: {
                primary: 2 /* KeyCode.Tab */,
                kbExpr: ContextKeyExpr.and(EditorContextKeys.editorTextFocus, EditorContextKeys.tabDoesNotMoveFocus, ContextKeyExpr.has('config.emmet.triggerExpansionOnTab')),
                weight: 100 /* KeybindingWeight.EditorContrib */
            },
            menuOpts: {
                menuId: MenuId.MenubarEditMenu,
                group: '5_insert',
                title: nls.localize({ key: 'miEmmetExpandAbbreviation', comment: ['&& denotes a mnemonic'] }, "Emmet: E&&xpand Abbreviation"),
                order: 3,
                when: IsSessionsWindowContext.negate()
            }
        });
    }
}
registerEditorAction(ExpandAbbreviationAction);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXhwYW5kQWJicmV2aWF0aW9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvZW1tZXQvYnJvd3Nlci9hY3Rpb25zL2V4cGFuZEFiYnJldmlhdGlvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUNoRyxPQUFPLEtBQUssR0FBRyxNQUFNLHVCQUF1QixDQUFDO0FBQzdDLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQ3ZELE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ3pGLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBRXRGLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUN6RixPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUU1RSxPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFFM0UsTUFBTSx3QkFBeUIsU0FBUSxpQkFBaUI7SUFFdkQ7UUFDQyxLQUFLLENBQUM7WUFDTCxFQUFFLEVBQUUsd0NBQXdDO1lBQzVDLEtBQUssRUFBRSxHQUFHLENBQUMsU0FBUyxDQUFDLDBCQUEwQixFQUFFLDRCQUE0QixDQUFDO1lBQzlFLFlBQVksRUFBRSxpQkFBaUIsQ0FBQyxRQUFRO1lBQ3hDLFVBQVUsRUFBRSxxQkFBcUI7WUFDakMsTUFBTSxFQUFFO2dCQUNQLE9BQU8scUJBQWE7Z0JBQ3BCLE1BQU0sRUFBRSxjQUFjLENBQUMsR0FBRyxDQUN6QixpQkFBaUIsQ0FBQyxlQUFlLEVBQ2pDLGlCQUFpQixDQUFDLG1CQUFtQixFQUNyQyxjQUFjLENBQUMsR0FBRyxDQUFDLG9DQUFvQyxDQUFDLENBQ3hEO2dCQUNELE1BQU0sMENBQWdDO2FBQ3RDO1lBQ0QsUUFBUSxFQUFFO2dCQUNULE1BQU0sRUFBRSxNQUFNLENBQUMsZUFBZTtnQkFDOUIsS0FBSyxFQUFFLFVBQVU7Z0JBQ2pCLEtBQUssRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLEVBQUUsR0FBRyxFQUFFLDJCQUEyQixFQUFFLE9BQU8sRUFBRSxDQUFDLHVCQUF1QixDQUFDLEVBQUUsRUFBRSw4QkFBOEIsQ0FBQztnQkFDN0gsS0FBSyxFQUFFLENBQUM7Z0JBQ1IsSUFBSSxFQUFFLHVCQUF1QixDQUFDLE1BQU0sRUFBRTthQUN0QztTQUNELENBQUMsQ0FBQztJQUVKLENBQUM7Q0FDRDtBQUVELG9CQUFvQixDQUFDLHdCQUF3QixDQUFDLENBQUMifQ==