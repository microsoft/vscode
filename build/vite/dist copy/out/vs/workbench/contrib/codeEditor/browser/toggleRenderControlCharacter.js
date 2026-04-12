/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { localize, localize2 } from '../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
export class ToggleRenderControlCharacterAction extends Action2 {
    static { this.ID = 'editor.action.toggleRenderControlCharacter'; }
    constructor() {
        super({
            id: ToggleRenderControlCharacterAction.ID,
            title: {
                ...localize2('toggleRenderControlCharacters', "Toggle Control Characters"),
                mnemonicTitle: localize({ key: 'miToggleRenderControlCharacters', comment: ['&& denotes a mnemonic'] }, "Render &&Control Characters"),
            },
            category: Categories.View,
            f1: true,
            toggled: ContextKeyExpr.equals('config.editor.renderControlCharacters', true),
            menu: {
                id: MenuId.MenubarAppearanceMenu,
                group: '4_editor',
                order: 5
            }
        });
    }
    run(accessor) {
        const configurationService = accessor.get(IConfigurationService);
        const newRenderControlCharacters = !configurationService.getValue('editor.renderControlCharacters');
        return configurationService.updateValue('editor.renderControlCharacters', newRenderControlCharacters);
    }
}
registerAction2(ToggleRenderControlCharacterAction);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidG9nZ2xlUmVuZGVyQ29udHJvbENoYXJhY3Rlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NvZGVFZGl0b3IvYnJvd3Nlci90b2dnbGVSZW5kZXJDb250cm9sQ2hhcmFjdGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxRQUFRLEVBQUUsU0FBUyxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDekQsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLEVBQUUsZUFBZSxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDbEcsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDbkcsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQ3RGLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSw4REFBOEQsQ0FBQztBQUcxRixNQUFNLE9BQU8sa0NBQW1DLFNBQVEsT0FBTzthQUU5QyxPQUFFLEdBQUcsNENBQTRDLENBQUM7SUFFbEU7UUFDQyxLQUFLLENBQUM7WUFDTCxFQUFFLEVBQUUsa0NBQWtDLENBQUMsRUFBRTtZQUN6QyxLQUFLLEVBQUU7Z0JBQ04sR0FBRyxTQUFTLENBQUMsK0JBQStCLEVBQUUsMkJBQTJCLENBQUM7Z0JBQzFFLGFBQWEsRUFBRSxRQUFRLENBQUMsRUFBRSxHQUFHLEVBQUUsaUNBQWlDLEVBQUUsT0FBTyxFQUFFLENBQUMsdUJBQXVCLENBQUMsRUFBRSxFQUFFLDZCQUE2QixDQUFDO2FBQ3RJO1lBQ0QsUUFBUSxFQUFFLFVBQVUsQ0FBQyxJQUFJO1lBQ3pCLEVBQUUsRUFBRSxJQUFJO1lBQ1IsT0FBTyxFQUFFLGNBQWMsQ0FBQyxNQUFNLENBQUMsdUNBQXVDLEVBQUUsSUFBSSxDQUFDO1lBQzdFLElBQUksRUFBRTtnQkFDTCxFQUFFLEVBQUUsTUFBTSxDQUFDLHFCQUFxQjtnQkFDaEMsS0FBSyxFQUFFLFVBQVU7Z0JBQ2pCLEtBQUssRUFBRSxDQUFDO2FBQ1I7U0FDRCxDQUFDLENBQUM7SUFDSixDQUFDO0lBRVEsR0FBRyxDQUFDLFFBQTBCO1FBQ3RDLE1BQU0sb0JBQW9CLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDO1FBRWpFLE1BQU0sMEJBQTBCLEdBQUcsQ0FBQyxvQkFBb0IsQ0FBQyxRQUFRLENBQVUsZ0NBQWdDLENBQUMsQ0FBQztRQUM3RyxPQUFPLG9CQUFvQixDQUFDLFdBQVcsQ0FBQyxnQ0FBZ0MsRUFBRSwwQkFBMEIsQ0FBQyxDQUFDO0lBQ3ZHLENBQUM7O0FBR0YsZUFBZSxDQUFDLGtDQUFrQyxDQUFDLENBQUMifQ==