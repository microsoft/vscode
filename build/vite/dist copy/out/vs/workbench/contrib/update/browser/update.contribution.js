/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import '../../../../platform/update/common/update.config.contribution.js';
import { localize, localize2 } from '../../../../nls.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { Extensions as WorkbenchExtensions } from '../../../common/contributions.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { MenuId, registerAction2, Action2 } from '../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { ProductContribution, UpdateContribution, CONTEXT_UPDATE_STATE, SwitchProductQualityContribution, showReleaseNotesInEditor, DefaultAccountUpdateContribution } from './update.js';
import { UpdateTitleBarContribution } from './updateTitleBarEntry.js';
import product from '../../../../platform/product/common/product.js';
import { IUpdateService } from '../../../../platform/update/common/update.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { isWindows } from '../../../../base/common/platform.js';
import { IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { mnemonicButtonLabel } from '../../../../base/common/labels.js';
import { ShowCurrentReleaseNotesActionId, ShowCurrentReleaseNotesFromCurrentFileActionId } from '../common/update.js';
import { IsWebContext } from '../../../../platform/contextkey/common/contextkeys.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { URI } from '../../../../base/common/uri.js';
const workbench = Registry.as(WorkbenchExtensions.Workbench);
workbench.registerWorkbenchContribution(ProductContribution, 3 /* LifecyclePhase.Restored */);
workbench.registerWorkbenchContribution(UpdateContribution, 3 /* LifecyclePhase.Restored */);
workbench.registerWorkbenchContribution(SwitchProductQualityContribution, 3 /* LifecyclePhase.Restored */);
workbench.registerWorkbenchContribution(DefaultAccountUpdateContribution, 4 /* LifecyclePhase.Eventually */);
workbench.registerWorkbenchContribution(UpdateTitleBarContribution, 3 /* LifecyclePhase.Restored */);
// Release notes
export class ShowReleaseNotesAction extends Action2 {
    static { this.AVAILABLE = !!product.releaseNotesUrl; }
    constructor() {
        super({
            id: ShowCurrentReleaseNotesActionId,
            title: {
                ...localize2('showReleaseNotes', "Show Release Notes"),
                mnemonicTitle: localize({ key: 'mshowReleaseNotes', comment: ['&& denotes a mnemonic'] }, "Show &&Release Notes"),
            },
            category: { value: product.nameShort, original: product.nameShort },
            f1: true,
            menu: [{
                    id: MenuId.MenubarHelpMenu,
                    group: '1_welcome',
                    order: 5,
                }]
        });
    }
    async run(accessor, version) {
        const instantiationService = accessor.get(IInstantiationService);
        const productService = accessor.get(IProductService);
        const openerService = accessor.get(IOpenerService);
        const targetVersion = version ?? productService.version;
        try {
            await showReleaseNotesInEditor(instantiationService, targetVersion, false);
        }
        catch (err) {
            if (productService.releaseNotesUrl) {
                await openerService.open(URI.parse(productService.releaseNotesUrl));
            }
            else {
                throw new Error(localize('update.noReleaseNotesOnline', "This version of {0} does not have release notes online", productService.nameLong));
            }
        }
    }
}
export class ShowCurrentReleaseNotesFromCurrentFileAction extends Action2 {
    constructor() {
        super({
            id: ShowCurrentReleaseNotesFromCurrentFileActionId,
            title: {
                ...localize2('showReleaseNotesCurrentFile', "Open Current File as Release Notes"),
                mnemonicTitle: localize({ key: 'mshowReleaseNotes', comment: ['&& denotes a mnemonic'] }, "Show &&Release Notes"),
            },
            category: localize2('developerCategory', "Developer"),
            f1: true,
        });
    }
    async run(accessor) {
        const instantiationService = accessor.get(IInstantiationService);
        const productService = accessor.get(IProductService);
        try {
            await showReleaseNotesInEditor(instantiationService, productService.version, true);
        }
        catch (err) {
            throw new Error(localize('releaseNotesFromFileNone', "Cannot open the current file as Release Notes"));
        }
    }
}
if (ShowReleaseNotesAction.AVAILABLE) {
    registerAction2(ShowReleaseNotesAction);
}
registerAction2(ShowCurrentReleaseNotesFromCurrentFileAction);
// Update
export class CheckForUpdateAction extends Action2 {
    constructor() {
        super({
            id: 'update.checkForUpdate',
            title: localize2('checkForUpdates', 'Check for Updates...'),
            category: { value: product.nameShort, original: product.nameShort },
            f1: true,
            precondition: CONTEXT_UPDATE_STATE.isEqualTo("idle" /* StateType.Idle */),
        });
    }
    async run(accessor) {
        const updateService = accessor.get(IUpdateService);
        return updateService.checkForUpdates(true);
    }
}
class DownloadUpdateAction extends Action2 {
    constructor() {
        super({
            id: 'update.downloadUpdate',
            title: localize2('downloadUpdate', 'Download Update'),
            category: { value: product.nameShort, original: product.nameShort },
            f1: true,
            precondition: CONTEXT_UPDATE_STATE.isEqualTo("available for download" /* StateType.AvailableForDownload */)
        });
    }
    async run(accessor) {
        await accessor.get(IUpdateService).downloadUpdate(true);
    }
}
class InstallUpdateAction extends Action2 {
    constructor() {
        super({
            id: 'update.installUpdate',
            title: localize2('installUpdate', 'Install Update'),
            category: { value: product.nameShort, original: product.nameShort },
            f1: true,
            precondition: CONTEXT_UPDATE_STATE.isEqualTo("downloaded" /* StateType.Downloaded */)
        });
    }
    async run(accessor) {
        await accessor.get(IUpdateService).applyUpdate();
    }
}
class RestartToUpdateAction extends Action2 {
    constructor() {
        super({
            id: 'update.restartToUpdate',
            title: localize2('restartToUpdate', 'Restart to Update'),
            category: { value: product.nameShort, original: product.nameShort },
            f1: true,
            precondition: CONTEXT_UPDATE_STATE.isEqualTo("ready" /* StateType.Ready */)
        });
    }
    async run(accessor) {
        await accessor.get(IUpdateService).quitAndInstall();
    }
}
class DownloadAction extends Action2 {
    static { this.ID = 'workbench.action.download'; }
    static { this.AVAILABLE = !!product.downloadUrl; }
    constructor() {
        super({
            id: DownloadAction.ID,
            title: localize2('openDownloadPage', "Download {0}", product.nameLong),
            precondition: IsWebContext, // Only show when running in a web browser
            f1: true,
            menu: [{
                    id: MenuId.StatusBarWindowIndicatorMenu,
                    when: IsWebContext
                }]
        });
    }
    run(accessor) {
        const productService = accessor.get(IProductService);
        const openerService = accessor.get(IOpenerService);
        if (productService.downloadUrl) {
            openerService.open(URI.parse(productService.downloadUrl));
        }
    }
}
if (DownloadAction.AVAILABLE) {
    registerAction2(DownloadAction);
}
registerAction2(CheckForUpdateAction);
registerAction2(DownloadUpdateAction);
registerAction2(InstallUpdateAction);
registerAction2(RestartToUpdateAction);
if (isWindows) {
    class DeveloperApplyUpdateAction extends Action2 {
        constructor() {
            super({
                id: '_update.applyupdate',
                title: localize2('applyUpdate', 'Apply Update...'),
                category: Categories.Developer,
                f1: true,
                precondition: CONTEXT_UPDATE_STATE.isEqualTo("idle" /* StateType.Idle */)
            });
        }
        async run(accessor) {
            const updateService = accessor.get(IUpdateService);
            const fileDialogService = accessor.get(IFileDialogService);
            const updatePath = await fileDialogService.showOpenDialog({
                title: localize('pickUpdate', "Apply Update"),
                filters: [{ name: 'Setup', extensions: ['exe'] }],
                canSelectFiles: true,
                openLabel: mnemonicButtonLabel(localize({ key: 'updateButton', comment: ['&& denotes a mnemonic'] }, "&&Update"))
            });
            if (!updatePath || !updatePath[0]) {
                return;
            }
            await updateService._applySpecificUpdate(updatePath[0].fsPath);
        }
    }
    registerAction2(DeveloperApplyUpdateAction);
}
registerAction2(class ShowUpdateInfoAction extends Action2 {
    constructor() {
        super({
            id: 'update.showUpdateInfo',
            title: localize2('showUpdateInfo', "Show Update Info"),
            category: Categories.Developer,
            f1: true,
            precondition: IsWebContext.negate(),
        });
    }
    async run(accessor) {
        const commandService = accessor.get(ICommandService);
        const quickInputService = accessor.get(IQuickInputService);
        const markdown = await quickInputService.input({ prompt: localize('showUpdateInfo.prompt', "Enter markdown to render (leave empty to load from URL)") });
        if (markdown === undefined) {
            return; // cancelled
        }
        await commandService.executeCommand('_update.showUpdateInfo', markdown || undefined);
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXBkYXRlLmNvbnRyaWJ1dGlvbi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3VwZGF0ZS9icm93c2VyL3VwZGF0ZS5jb250cmlidXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxrRUFBa0UsQ0FBQztBQUMxRSxPQUFPLEVBQUUsUUFBUSxFQUFFLFNBQVMsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQ3pELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUM1RSxPQUFPLEVBQW1DLFVBQVUsSUFBSSxtQkFBbUIsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3RILE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSw4REFBOEQsQ0FBQztBQUMxRixPQUFPLEVBQUUsTUFBTSxFQUFFLGVBQWUsRUFBRSxPQUFPLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUNsRyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDbkYsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDMUYsT0FBTyxFQUFFLG1CQUFtQixFQUFFLGtCQUFrQixFQUFFLG9CQUFvQixFQUFFLGdDQUFnQyxFQUFFLHdCQUF3QixFQUFFLGdDQUFnQyxFQUFFLE1BQU0sYUFBYSxDQUFDO0FBQzFMLE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBRXRFLE9BQU8sT0FBTyxNQUFNLGdEQUFnRCxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxjQUFjLEVBQWEsTUFBTSw4Q0FBOEMsQ0FBQztBQUN6RixPQUFPLEVBQUUscUJBQXFCLEVBQW9CLE1BQU0sNERBQTRELENBQUM7QUFDckgsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQ2hFLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ3BGLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3hFLE9BQU8sRUFBRSwrQkFBK0IsRUFBRSw4Q0FBOEMsRUFBRSxNQUFNLHFCQUFxQixDQUFDO0FBQ3RILE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUNyRixPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sOENBQThDLENBQUM7QUFDOUUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBQ3hGLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUVyRCxNQUFNLFNBQVMsR0FBRyxRQUFRLENBQUMsRUFBRSxDQUFrQyxtQkFBbUIsQ0FBQyxTQUFTLENBQUMsQ0FBQztBQUU5RixTQUFTLENBQUMsNkJBQTZCLENBQUMsbUJBQW1CLGtDQUEwQixDQUFDO0FBQ3RGLFNBQVMsQ0FBQyw2QkFBNkIsQ0FBQyxrQkFBa0Isa0NBQTBCLENBQUM7QUFDckYsU0FBUyxDQUFDLDZCQUE2QixDQUFDLGdDQUFnQyxrQ0FBMEIsQ0FBQztBQUNuRyxTQUFTLENBQUMsNkJBQTZCLENBQUMsZ0NBQWdDLG9DQUE0QixDQUFDO0FBQ3JHLFNBQVMsQ0FBQyw2QkFBNkIsQ0FBQywwQkFBMEIsa0NBQTBCLENBQUM7QUFFN0YsZ0JBQWdCO0FBRWhCLE1BQU0sT0FBTyxzQkFBdUIsU0FBUSxPQUFPO2FBRWxDLGNBQVMsR0FBRyxDQUFDLENBQUMsT0FBTyxDQUFDLGVBQWUsQ0FBQztJQUV0RDtRQUNDLEtBQUssQ0FBQztZQUNMLEVBQUUsRUFBRSwrQkFBK0I7WUFDbkMsS0FBSyxFQUFFO2dCQUNOLEdBQUcsU0FBUyxDQUFDLGtCQUFrQixFQUFFLG9CQUFvQixDQUFDO2dCQUN0RCxhQUFhLEVBQUUsUUFBUSxDQUFDLEVBQUUsR0FBRyxFQUFFLG1CQUFtQixFQUFFLE9BQU8sRUFBRSxDQUFDLHVCQUF1QixDQUFDLEVBQUUsRUFBRSxzQkFBc0IsQ0FBQzthQUNqSDtZQUNELFFBQVEsRUFBRSxFQUFFLEtBQUssRUFBRSxPQUFPLENBQUMsU0FBUyxFQUFFLFFBQVEsRUFBRSxPQUFPLENBQUMsU0FBUyxFQUFFO1lBQ25FLEVBQUUsRUFBRSxJQUFJO1lBQ1IsSUFBSSxFQUFFLENBQUM7b0JBQ04sRUFBRSxFQUFFLE1BQU0sQ0FBQyxlQUFlO29CQUMxQixLQUFLLEVBQUUsV0FBVztvQkFDbEIsS0FBSyxFQUFFLENBQUM7aUJBQ1IsQ0FBQztTQUNGLENBQUMsQ0FBQztJQUNKLENBQUM7SUFFRCxLQUFLLENBQUMsR0FBRyxDQUFDLFFBQTBCLEVBQUUsT0FBZ0I7UUFDckQsTUFBTSxvQkFBb0IsR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLHFCQUFxQixDQUFDLENBQUM7UUFDakUsTUFBTSxjQUFjLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxlQUFlLENBQUMsQ0FBQztRQUNyRCxNQUFNLGFBQWEsR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLGNBQWMsQ0FBQyxDQUFDO1FBQ25ELE1BQU0sYUFBYSxHQUFHLE9BQU8sSUFBSSxjQUFjLENBQUMsT0FBTyxDQUFDO1FBRXhELElBQUksQ0FBQztZQUNKLE1BQU0sd0JBQXdCLENBQUMsb0JBQW9CLEVBQUUsYUFBYSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQzVFLENBQUM7UUFBQyxPQUFPLEdBQUcsRUFBRSxDQUFDO1lBQ2QsSUFBSSxjQUFjLENBQUMsZUFBZSxFQUFFLENBQUM7Z0JBQ3BDLE1BQU0sYUFBYSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLGNBQWMsQ0FBQyxlQUFlLENBQUMsQ0FBQyxDQUFDO1lBQ3JFLENBQUM7aUJBQU0sQ0FBQztnQkFDUCxNQUFNLElBQUksS0FBSyxDQUFDLFFBQVEsQ0FBQyw2QkFBNkIsRUFBRSx3REFBd0QsRUFBRSxjQUFjLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQztZQUM3SSxDQUFDO1FBQ0YsQ0FBQztJQUNGLENBQUM7O0FBR0YsTUFBTSxPQUFPLDRDQUE2QyxTQUFRLE9BQU87SUFFeEU7UUFDQyxLQUFLLENBQUM7WUFDTCxFQUFFLEVBQUUsOENBQThDO1lBQ2xELEtBQUssRUFBRTtnQkFDTixHQUFHLFNBQVMsQ0FBQyw2QkFBNkIsRUFBRSxvQ0FBb0MsQ0FBQztnQkFDakYsYUFBYSxFQUFFLFFBQVEsQ0FBQyxFQUFFLEdBQUcsRUFBRSxtQkFBbUIsRUFBRSxPQUFPLEVBQUUsQ0FBQyx1QkFBdUIsQ0FBQyxFQUFFLEVBQUUsc0JBQXNCLENBQUM7YUFDakg7WUFDRCxRQUFRLEVBQUUsU0FBUyxDQUFDLG1CQUFtQixFQUFFLFdBQVcsQ0FBQztZQUNyRCxFQUFFLEVBQUUsSUFBSTtTQUNSLENBQUMsQ0FBQztJQUNKLENBQUM7SUFFRCxLQUFLLENBQUMsR0FBRyxDQUFDLFFBQTBCO1FBQ25DLE1BQU0sb0JBQW9CLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDO1FBQ2pFLE1BQU0sY0FBYyxHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsZUFBZSxDQUFDLENBQUM7UUFFckQsSUFBSSxDQUFDO1lBQ0osTUFBTSx3QkFBd0IsQ0FBQyxvQkFBb0IsRUFBRSxjQUFjLENBQUMsT0FBTyxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQ3BGLENBQUM7UUFBQyxPQUFPLEdBQUcsRUFBRSxDQUFDO1lBQ2QsTUFBTSxJQUFJLEtBQUssQ0FBQyxRQUFRLENBQUMsMEJBQTBCLEVBQUUsK0NBQStDLENBQUMsQ0FBQyxDQUFDO1FBQ3hHLENBQUM7SUFDRixDQUFDO0NBQ0Q7QUFFRCxJQUFJLHNCQUFzQixDQUFDLFNBQVMsRUFBRSxDQUFDO0lBQ3RDLGVBQWUsQ0FBQyxzQkFBc0IsQ0FBQyxDQUFDO0FBQ3pDLENBQUM7QUFDRCxlQUFlLENBQUMsNENBQTRDLENBQUMsQ0FBQztBQUU5RCxTQUFTO0FBRVQsTUFBTSxPQUFPLG9CQUFxQixTQUFRLE9BQU87SUFFaEQ7UUFDQyxLQUFLLENBQUM7WUFDTCxFQUFFLEVBQUUsdUJBQXVCO1lBQzNCLEtBQUssRUFBRSxTQUFTLENBQUMsaUJBQWlCLEVBQUUsc0JBQXNCLENBQUM7WUFDM0QsUUFBUSxFQUFFLEVBQUUsS0FBSyxFQUFFLE9BQU8sQ0FBQyxTQUFTLEVBQUUsUUFBUSxFQUFFLE9BQU8sQ0FBQyxTQUFTLEVBQUU7WUFDbkUsRUFBRSxFQUFFLElBQUk7WUFDUixZQUFZLEVBQUUsb0JBQW9CLENBQUMsU0FBUyw2QkFBZ0I7U0FDNUQsQ0FBQyxDQUFDO0lBQ0osQ0FBQztJQUVELEtBQUssQ0FBQyxHQUFHLENBQUMsUUFBMEI7UUFDbkMsTUFBTSxhQUFhLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxjQUFjLENBQUMsQ0FBQztRQUNuRCxPQUFPLGFBQWEsQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDNUMsQ0FBQztDQUNEO0FBRUQsTUFBTSxvQkFBcUIsU0FBUSxPQUFPO0lBQ3pDO1FBQ0MsS0FBSyxDQUFDO1lBQ0wsRUFBRSxFQUFFLHVCQUF1QjtZQUMzQixLQUFLLEVBQUUsU0FBUyxDQUFDLGdCQUFnQixFQUFFLGlCQUFpQixDQUFDO1lBQ3JELFFBQVEsRUFBRSxFQUFFLEtBQUssRUFBRSxPQUFPLENBQUMsU0FBUyxFQUFFLFFBQVEsRUFBRSxPQUFPLENBQUMsU0FBUyxFQUFFO1lBQ25FLEVBQUUsRUFBRSxJQUFJO1lBQ1IsWUFBWSxFQUFFLG9CQUFvQixDQUFDLFNBQVMsK0RBQWdDO1NBQzVFLENBQUMsQ0FBQztJQUNKLENBQUM7SUFFRCxLQUFLLENBQUMsR0FBRyxDQUFDLFFBQTBCO1FBQ25DLE1BQU0sUUFBUSxDQUFDLEdBQUcsQ0FBQyxjQUFjLENBQUMsQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDekQsQ0FBQztDQUNEO0FBRUQsTUFBTSxtQkFBb0IsU0FBUSxPQUFPO0lBQ3hDO1FBQ0MsS0FBSyxDQUFDO1lBQ0wsRUFBRSxFQUFFLHNCQUFzQjtZQUMxQixLQUFLLEVBQUUsU0FBUyxDQUFDLGVBQWUsRUFBRSxnQkFBZ0IsQ0FBQztZQUNuRCxRQUFRLEVBQUUsRUFBRSxLQUFLLEVBQUUsT0FBTyxDQUFDLFNBQVMsRUFBRSxRQUFRLEVBQUUsT0FBTyxDQUFDLFNBQVMsRUFBRTtZQUNuRSxFQUFFLEVBQUUsSUFBSTtZQUNSLFlBQVksRUFBRSxvQkFBb0IsQ0FBQyxTQUFTLHlDQUFzQjtTQUNsRSxDQUFDLENBQUM7SUFDSixDQUFDO0lBRUQsS0FBSyxDQUFDLEdBQUcsQ0FBQyxRQUEwQjtRQUNuQyxNQUFNLFFBQVEsQ0FBQyxHQUFHLENBQUMsY0FBYyxDQUFDLENBQUMsV0FBVyxFQUFFLENBQUM7SUFDbEQsQ0FBQztDQUNEO0FBRUQsTUFBTSxxQkFBc0IsU0FBUSxPQUFPO0lBQzFDO1FBQ0MsS0FBSyxDQUFDO1lBQ0wsRUFBRSxFQUFFLHdCQUF3QjtZQUM1QixLQUFLLEVBQUUsU0FBUyxDQUFDLGlCQUFpQixFQUFFLG1CQUFtQixDQUFDO1lBQ3hELFFBQVEsRUFBRSxFQUFFLEtBQUssRUFBRSxPQUFPLENBQUMsU0FBUyxFQUFFLFFBQVEsRUFBRSxPQUFPLENBQUMsU0FBUyxFQUFFO1lBQ25FLEVBQUUsRUFBRSxJQUFJO1lBQ1IsWUFBWSxFQUFFLG9CQUFvQixDQUFDLFNBQVMsK0JBQWlCO1NBQzdELENBQUMsQ0FBQztJQUNKLENBQUM7SUFFRCxLQUFLLENBQUMsR0FBRyxDQUFDLFFBQTBCO1FBQ25DLE1BQU0sUUFBUSxDQUFDLEdBQUcsQ0FBQyxjQUFjLENBQUMsQ0FBQyxjQUFjLEVBQUUsQ0FBQztJQUNyRCxDQUFDO0NBQ0Q7QUFFRCxNQUFNLGNBQWUsU0FBUSxPQUFPO2FBRW5CLE9BQUUsR0FBRywyQkFBMkIsQ0FBQzthQUNqQyxjQUFTLEdBQUcsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxXQUFXLENBQUM7SUFFbEQ7UUFDQyxLQUFLLENBQUM7WUFDTCxFQUFFLEVBQUUsY0FBYyxDQUFDLEVBQUU7WUFDckIsS0FBSyxFQUFFLFNBQVMsQ0FBQyxrQkFBa0IsRUFBRSxjQUFjLEVBQUUsT0FBTyxDQUFDLFFBQVEsQ0FBQztZQUN0RSxZQUFZLEVBQUUsWUFBWSxFQUFFLDBDQUEwQztZQUN0RSxFQUFFLEVBQUUsSUFBSTtZQUNSLElBQUksRUFBRSxDQUFDO29CQUNOLEVBQUUsRUFBRSxNQUFNLENBQUMsNEJBQTRCO29CQUN2QyxJQUFJLEVBQUUsWUFBWTtpQkFDbEIsQ0FBQztTQUNGLENBQUMsQ0FBQztJQUNKLENBQUM7SUFFRCxHQUFHLENBQUMsUUFBMEI7UUFDN0IsTUFBTSxjQUFjLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxlQUFlLENBQUMsQ0FBQztRQUNyRCxNQUFNLGFBQWEsR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLGNBQWMsQ0FBQyxDQUFDO1FBRW5ELElBQUksY0FBYyxDQUFDLFdBQVcsRUFBRSxDQUFDO1lBQ2hDLGFBQWEsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxjQUFjLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQztRQUMzRCxDQUFDO0lBQ0YsQ0FBQzs7QUFHRixJQUFJLGNBQWMsQ0FBQyxTQUFTLEVBQUUsQ0FBQztJQUM5QixlQUFlLENBQUMsY0FBYyxDQUFDLENBQUM7QUFDakMsQ0FBQztBQUNELGVBQWUsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDO0FBQ3RDLGVBQWUsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDO0FBQ3RDLGVBQWUsQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDO0FBQ3JDLGVBQWUsQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDO0FBRXZDLElBQUksU0FBUyxFQUFFLENBQUM7SUFDZixNQUFNLDBCQUEyQixTQUFRLE9BQU87UUFDL0M7WUFDQyxLQUFLLENBQUM7Z0JBQ0wsRUFBRSxFQUFFLHFCQUFxQjtnQkFDekIsS0FBSyxFQUFFLFNBQVMsQ0FBQyxhQUFhLEVBQUUsaUJBQWlCLENBQUM7Z0JBQ2xELFFBQVEsRUFBRSxVQUFVLENBQUMsU0FBUztnQkFDOUIsRUFBRSxFQUFFLElBQUk7Z0JBQ1IsWUFBWSxFQUFFLG9CQUFvQixDQUFDLFNBQVMsNkJBQWdCO2FBQzVELENBQUMsQ0FBQztRQUNKLENBQUM7UUFFRCxLQUFLLENBQUMsR0FBRyxDQUFDLFFBQTBCO1lBQ25DLE1BQU0sYUFBYSxHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsY0FBYyxDQUFDLENBQUM7WUFDbkQsTUFBTSxpQkFBaUIsR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLGtCQUFrQixDQUFDLENBQUM7WUFFM0QsTUFBTSxVQUFVLEdBQUcsTUFBTSxpQkFBaUIsQ0FBQyxjQUFjLENBQUM7Z0JBQ3pELEtBQUssRUFBRSxRQUFRLENBQUMsWUFBWSxFQUFFLGNBQWMsQ0FBQztnQkFDN0MsT0FBTyxFQUFFLENBQUMsRUFBRSxJQUFJLEVBQUUsT0FBTyxFQUFFLFVBQVUsRUFBRSxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUM7Z0JBQ2pELGNBQWMsRUFBRSxJQUFJO2dCQUNwQixTQUFTLEVBQUUsbUJBQW1CLENBQUMsUUFBUSxDQUFDLEVBQUUsR0FBRyxFQUFFLGNBQWMsRUFBRSxPQUFPLEVBQUUsQ0FBQyx1QkFBdUIsQ0FBQyxFQUFFLEVBQUUsVUFBVSxDQUFDLENBQUM7YUFDakgsQ0FBQyxDQUFDO1lBRUgsSUFBSSxDQUFDLFVBQVUsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO2dCQUNuQyxPQUFPO1lBQ1IsQ0FBQztZQUVELE1BQU0sYUFBYSxDQUFDLG9CQUFvQixDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUNoRSxDQUFDO0tBQ0Q7SUFFRCxlQUFlLENBQUMsMEJBQTBCLENBQUMsQ0FBQztBQUM3QyxDQUFDO0FBRUQsZUFBZSxDQUFDLE1BQU0sb0JBQXFCLFNBQVEsT0FBTztJQUN6RDtRQUNDLEtBQUssQ0FBQztZQUNMLEVBQUUsRUFBRSx1QkFBdUI7WUFDM0IsS0FBSyxFQUFFLFNBQVMsQ0FBQyxnQkFBZ0IsRUFBRSxrQkFBa0IsQ0FBQztZQUN0RCxRQUFRLEVBQUUsVUFBVSxDQUFDLFNBQVM7WUFDOUIsRUFBRSxFQUFFLElBQUk7WUFDUixZQUFZLEVBQUUsWUFBWSxDQUFDLE1BQU0sRUFBRTtTQUNuQyxDQUFDLENBQUM7SUFDSixDQUFDO0lBRUQsS0FBSyxDQUFDLEdBQUcsQ0FBQyxRQUEwQjtRQUNuQyxNQUFNLGNBQWMsR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLGVBQWUsQ0FBQyxDQUFDO1FBQ3JELE1BQU0saUJBQWlCLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO1FBQzNELE1BQU0sUUFBUSxHQUFHLE1BQU0saUJBQWlCLENBQUMsS0FBSyxDQUFDLEVBQUUsTUFBTSxFQUFFLFFBQVEsQ0FBQyx1QkFBdUIsRUFBRSx5REFBeUQsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUN6SixJQUFJLFFBQVEsS0FBSyxTQUFTLEVBQUUsQ0FBQztZQUM1QixPQUFPLENBQUMsWUFBWTtRQUNyQixDQUFDO1FBQ0QsTUFBTSxjQUFjLENBQUMsY0FBYyxDQUFDLHdCQUF3QixFQUFFLFFBQVEsSUFBSSxTQUFTLENBQUMsQ0FBQztJQUN0RixDQUFDO0NBQ0QsQ0FBQyxDQUFDIn0=