/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { EditorAction, registerEditorAction } from '../../../../editor/browser/editorExtensions.js';
import { EditorContextKeys } from '../../../../editor/common/editorContextKeys.js';
import * as nls from '../../../../nls.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IExtensionsWorkbenchService } from '../../extensions/common/extensions.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { ILanguageFeaturesService } from '../../../../editor/common/services/languageFeatures.js';
registerEditorAction(class FormatDocumentMultipleAction extends EditorAction {
    constructor() {
        super({
            id: 'editor.action.formatDocument.none',
            label: nls.localize2('formatDocument.label.multiple', "Format Document"),
            precondition: ContextKeyExpr.and(EditorContextKeys.writable, EditorContextKeys.hasDocumentFormattingProvider.toNegated()),
            kbOpts: {
                kbExpr: EditorContextKeys.editorTextFocus,
                primary: 1024 /* KeyMod.Shift */ | 512 /* KeyMod.Alt */ | 36 /* KeyCode.KeyF */,
                linux: { primary: 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 39 /* KeyCode.KeyI */ },
                weight: 100 /* KeybindingWeight.EditorContrib */,
            }
        });
    }
    async run(accessor, editor) {
        if (!editor.hasModel()) {
            return;
        }
        const commandService = accessor.get(ICommandService);
        const extensionsWorkbenchService = accessor.get(IExtensionsWorkbenchService);
        const notificationService = accessor.get(INotificationService);
        const dialogService = accessor.get(IDialogService);
        const languageFeaturesService = accessor.get(ILanguageFeaturesService);
        const model = editor.getModel();
        const formatterCount = languageFeaturesService.documentFormattingEditProvider.all(model).length;
        if (formatterCount > 1) {
            return commandService.executeCommand('editor.action.formatDocument.multiple');
        }
        else if (formatterCount === 1) {
            return commandService.executeCommand('editor.action.formatDocument');
        }
        else if (model.isTooLargeForSyncing()) {
            notificationService.warn(nls.localize('too.large', "This file cannot be formatted because it is too large"));
        }
        else {
            const langName = model.getLanguageId();
            const message = nls.localize('no.provider', "There is no formatter for '{0}' files installed.", langName);
            const { confirmed } = await dialogService.confirm({
                message,
                primaryButton: nls.localize({ key: 'install.formatter', comment: ['&& denotes a mnemonic'] }, "&&Install Formatter...")
            });
            if (confirmed) {
                extensionsWorkbenchService.openSearch(`category:formatters ${langName}`);
            }
        }
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZm9ybWF0QWN0aW9uc05vbmUuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9mb3JtYXQvYnJvd3Nlci9mb3JtYXRBY3Rpb25zTm9uZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUloRyxPQUFPLEVBQUUsWUFBWSxFQUFFLG9CQUFvQixFQUFvQixNQUFNLGdEQUFnRCxDQUFDO0FBQ3RILE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ25GLE9BQU8sS0FBSyxHQUFHLE1BQU0sb0JBQW9CLENBQUM7QUFDMUMsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBRXRGLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUNuRixPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSwwREFBMEQsQ0FBQztBQUNoRyxPQUFPLEVBQUUsMkJBQTJCLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNwRixPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDaEYsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sd0RBQXdELENBQUM7QUFFbEcsb0JBQW9CLENBQUMsTUFBTSw0QkFBNkIsU0FBUSxZQUFZO0lBRTNFO1FBQ0MsS0FBSyxDQUFDO1lBQ0wsRUFBRSxFQUFFLG1DQUFtQztZQUN2QyxLQUFLLEVBQUUsR0FBRyxDQUFDLFNBQVMsQ0FBQywrQkFBK0IsRUFBRSxpQkFBaUIsQ0FBQztZQUN4RSxZQUFZLEVBQUUsY0FBYyxDQUFDLEdBQUcsQ0FBQyxpQkFBaUIsQ0FBQyxRQUFRLEVBQUUsaUJBQWlCLENBQUMsNkJBQTZCLENBQUMsU0FBUyxFQUFFLENBQUM7WUFDekgsTUFBTSxFQUFFO2dCQUNQLE1BQU0sRUFBRSxpQkFBaUIsQ0FBQyxlQUFlO2dCQUN6QyxPQUFPLEVBQUUsOENBQXlCLHdCQUFlO2dCQUNqRCxLQUFLLEVBQUUsRUFBRSxPQUFPLEVBQUUsbURBQTZCLHdCQUFlLEVBQUU7Z0JBQ2hFLE1BQU0sMENBQWdDO2FBQ3RDO1NBQ0QsQ0FBQyxDQUFDO0lBQ0osQ0FBQztJQUVELEtBQUssQ0FBQyxHQUFHLENBQUMsUUFBMEIsRUFBRSxNQUFtQjtRQUN4RCxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsRUFBRSxFQUFFLENBQUM7WUFDeEIsT0FBTztRQUNSLENBQUM7UUFFRCxNQUFNLGNBQWMsR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLGVBQWUsQ0FBQyxDQUFDO1FBQ3JELE1BQU0sMEJBQTBCLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQywyQkFBMkIsQ0FBQyxDQUFDO1FBQzdFLE1BQU0sbUJBQW1CLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDO1FBQy9ELE1BQU0sYUFBYSxHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsY0FBYyxDQUFDLENBQUM7UUFDbkQsTUFBTSx1QkFBdUIsR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLHdCQUF3QixDQUFDLENBQUM7UUFFdkUsTUFBTSxLQUFLLEdBQUcsTUFBTSxDQUFDLFFBQVEsRUFBRSxDQUFDO1FBQ2hDLE1BQU0sY0FBYyxHQUFHLHVCQUF1QixDQUFDLDhCQUE4QixDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQyxNQUFNLENBQUM7UUFFaEcsSUFBSSxjQUFjLEdBQUcsQ0FBQyxFQUFFLENBQUM7WUFDeEIsT0FBTyxjQUFjLENBQUMsY0FBYyxDQUFDLHVDQUF1QyxDQUFDLENBQUM7UUFDL0UsQ0FBQzthQUFNLElBQUksY0FBYyxLQUFLLENBQUMsRUFBRSxDQUFDO1lBQ2pDLE9BQU8sY0FBYyxDQUFDLGNBQWMsQ0FBQyw4QkFBOEIsQ0FBQyxDQUFDO1FBQ3RFLENBQUM7YUFBTSxJQUFJLEtBQUssQ0FBQyxvQkFBb0IsRUFBRSxFQUFFLENBQUM7WUFDekMsbUJBQW1CLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsV0FBVyxFQUFFLHVEQUF1RCxDQUFDLENBQUMsQ0FBQztRQUM5RyxDQUFDO2FBQU0sQ0FBQztZQUNQLE1BQU0sUUFBUSxHQUFHLEtBQUssQ0FBQyxhQUFhLEVBQUUsQ0FBQztZQUN2QyxNQUFNLE9BQU8sR0FBRyxHQUFHLENBQUMsUUFBUSxDQUFDLGFBQWEsRUFBRSxrREFBa0QsRUFBRSxRQUFRLENBQUMsQ0FBQztZQUMxRyxNQUFNLEVBQUUsU0FBUyxFQUFFLEdBQUcsTUFBTSxhQUFhLENBQUMsT0FBTyxDQUFDO2dCQUNqRCxPQUFPO2dCQUNQLGFBQWEsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLEVBQUUsR0FBRyxFQUFFLG1CQUFtQixFQUFFLE9BQU8sRUFBRSxDQUFDLHVCQUF1QixDQUFDLEVBQUUsRUFBRSx3QkFBd0IsQ0FBQzthQUN2SCxDQUFDLENBQUM7WUFDSCxJQUFJLFNBQVMsRUFBRSxDQUFDO2dCQUNmLDBCQUEwQixDQUFDLFVBQVUsQ0FBQyx1QkFBdUIsUUFBUSxFQUFFLENBQUMsQ0FBQztZQUMxRSxDQUFDO1FBQ0YsQ0FBQztJQUNGLENBQUM7Q0FDRCxDQUFDLENBQUMifQ==