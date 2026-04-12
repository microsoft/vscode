/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { localize } from '../../../../nls.js';
import { WalkThroughInput } from './walkThroughInput.js';
import { WalkThroughPart } from './walkThroughPart.js';
import { WalkThroughArrowUp, WalkThroughArrowDown, WalkThroughPageUp, WalkThroughPageDown } from './walkThroughActions.js';
import { WalkThroughSnippetContentProvider } from '../common/walkThroughContentProvider.js';
import { EditorWalkThroughAction, EditorWalkThroughInputSerializer } from './editor/editorWalkThrough.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { EditorExtensions } from '../../../common/editor.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { MenuRegistry, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { EditorPaneDescriptor } from '../../../browser/editor.js';
import { KeybindingsRegistry } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
Registry.as(EditorExtensions.EditorPane)
    .registerEditorPane(EditorPaneDescriptor.create(WalkThroughPart, WalkThroughPart.ID, localize('walkThrough.editor.label', "Playground")), [new SyncDescriptor(WalkThroughInput)]);
registerAction2(EditorWalkThroughAction);
Registry.as(EditorExtensions.EditorFactory).registerEditorSerializer(EditorWalkThroughInputSerializer.ID, EditorWalkThroughInputSerializer);
registerWorkbenchContribution2(WalkThroughSnippetContentProvider.ID, WalkThroughSnippetContentProvider, { editorTypeId: WalkThroughPart.ID });
KeybindingsRegistry.registerCommandAndKeybindingRule(WalkThroughArrowUp);
KeybindingsRegistry.registerCommandAndKeybindingRule(WalkThroughArrowDown);
KeybindingsRegistry.registerCommandAndKeybindingRule(WalkThroughPageUp);
KeybindingsRegistry.registerCommandAndKeybindingRule(WalkThroughPageDown);
MenuRegistry.appendMenuItem(MenuId.MenubarHelpMenu, {
    group: '1_welcome',
    command: {
        id: 'workbench.action.showInteractivePlayground',
        title: localize({ key: 'miPlayground', comment: ['&& denotes a mnemonic'] }, "Editor Playgrou&&nd")
    },
    order: 3
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2Fsa1Rocm91Z2guY29udHJpYnV0aW9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvd2VsY29tZVdhbGt0aHJvdWdoL2Jyb3dzZXIvd2Fsa1Rocm91Z2guY29udHJpYnV0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUM5QyxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUN6RCxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sc0JBQXNCLENBQUM7QUFDdkQsT0FBTyxFQUFFLGtCQUFrQixFQUFFLG9CQUFvQixFQUFFLGlCQUFpQixFQUFFLG1CQUFtQixFQUFFLE1BQU0seUJBQXlCLENBQUM7QUFDM0gsT0FBTyxFQUFFLGlDQUFpQyxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDNUYsT0FBTyxFQUFFLHVCQUF1QixFQUFFLGdDQUFnQyxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDMUcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQzVFLE9BQU8sRUFBRSxnQkFBZ0IsRUFBMEIsTUFBTSwyQkFBMkIsQ0FBQztBQUNyRixPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sMERBQTBELENBQUM7QUFDMUYsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLEVBQUUsZUFBZSxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDdkcsT0FBTyxFQUFFLDhCQUE4QixFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDbEYsT0FBTyxFQUF1QixvQkFBb0IsRUFBRSxNQUFNLDRCQUE0QixDQUFDO0FBQ3ZGLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBRXBHLFFBQVEsQ0FBQyxFQUFFLENBQXNCLGdCQUFnQixDQUFDLFVBQVUsQ0FBQztLQUMzRCxrQkFBa0IsQ0FBQyxvQkFBb0IsQ0FBQyxNQUFNLENBQzlDLGVBQWUsRUFDZixlQUFlLENBQUMsRUFBRSxFQUNsQixRQUFRLENBQUMsMEJBQTBCLEVBQUUsWUFBWSxDQUFDLENBQ2xELEVBQ0EsQ0FBQyxJQUFJLGNBQWMsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUUxQyxlQUFlLENBQUMsdUJBQXVCLENBQUMsQ0FBQztBQUV6QyxRQUFRLENBQUMsRUFBRSxDQUF5QixnQkFBZ0IsQ0FBQyxhQUFhLENBQUMsQ0FBQyx3QkFBd0IsQ0FBQyxnQ0FBZ0MsQ0FBQyxFQUFFLEVBQUUsZ0NBQWdDLENBQUMsQ0FBQztBQUVwSyw4QkFBOEIsQ0FBQyxpQ0FBaUMsQ0FBQyxFQUFFLEVBQUUsaUNBQWlDLEVBQUUsRUFBRSxZQUFZLEVBQUUsZUFBZSxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7QUFFOUksbUJBQW1CLENBQUMsZ0NBQWdDLENBQUMsa0JBQWtCLENBQUMsQ0FBQztBQUV6RSxtQkFBbUIsQ0FBQyxnQ0FBZ0MsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDO0FBRTNFLG1CQUFtQixDQUFDLGdDQUFnQyxDQUFDLGlCQUFpQixDQUFDLENBQUM7QUFFeEUsbUJBQW1CLENBQUMsZ0NBQWdDLENBQUMsbUJBQW1CLENBQUMsQ0FBQztBQUUxRSxZQUFZLENBQUMsY0FBYyxDQUFDLE1BQU0sQ0FBQyxlQUFlLEVBQUU7SUFDbkQsS0FBSyxFQUFFLFdBQVc7SUFDbEIsT0FBTyxFQUFFO1FBQ1IsRUFBRSxFQUFFLDRDQUE0QztRQUNoRCxLQUFLLEVBQUUsUUFBUSxDQUFDLEVBQUUsR0FBRyxFQUFFLGNBQWMsRUFBRSxPQUFPLEVBQUUsQ0FBQyx1QkFBdUIsQ0FBQyxFQUFFLEVBQUUscUJBQXFCLENBQUM7S0FDbkc7SUFDRCxLQUFLLEVBQUUsQ0FBQztDQUNSLENBQUMsQ0FBQyJ9