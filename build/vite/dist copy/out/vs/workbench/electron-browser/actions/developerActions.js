/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { localize, localize2 } from '../../../nls.js';
import { INativeHostService } from '../../../platform/native/common/native.js';
import { IEditorService } from '../../services/editor/common/editorService.js';
import { Action2, MenuId } from '../../../platform/actions/common/actions.js';
import { Categories } from '../../../platform/action/common/actionCommonCategories.js';
import { IWorkbenchEnvironmentService } from '../../services/environment/common/environmentService.js';
import { IsDevelopmentContext } from '../../../platform/contextkey/common/contextkeys.js';
import { INativeWorkbenchEnvironmentService } from '../../services/environment/electron-browser/environmentService.js';
import { URI } from '../../../base/common/uri.js';
import { getActiveWindow } from '../../../base/browser/dom.js';
import { IProgressService } from '../../../platform/progress/common/progress.js';
import { IDialogService } from '../../../platform/dialogs/common/dialogs.js';
import { IStatusbarService } from '../../services/statusbar/browser/statusbar.js';
export class ToggleDevToolsAction extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.toggleDevTools',
            title: localize2('toggleDevTools', 'Toggle Developer Tools'),
            category: Categories.Developer,
            f1: true,
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */ + 50,
                when: IsDevelopmentContext,
                primary: 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 39 /* KeyCode.KeyI */,
                mac: { primary: 2048 /* KeyMod.CtrlCmd */ | 512 /* KeyMod.Alt */ | 39 /* KeyCode.KeyI */ }
            },
            menu: {
                id: MenuId.MenubarHelpMenu,
                group: '5_tools',
                order: 1
            }
        });
    }
    async run(accessor) {
        const nativeHostService = accessor.get(INativeHostService);
        return nativeHostService.toggleDevTools({ targetWindowId: getActiveWindow().vscodeWindowId });
    }
}
export class ConfigureRuntimeArgumentsAction extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.configureRuntimeArguments',
            title: localize2('configureRuntimeArguments', 'Configure Runtime Arguments'),
            category: Categories.Preferences,
            f1: true
        });
    }
    async run(accessor) {
        const editorService = accessor.get(IEditorService);
        const environmentService = accessor.get(IWorkbenchEnvironmentService);
        await editorService.openEditor({
            resource: environmentService.argvResource,
            options: { pinned: true }
        });
    }
}
export class ReloadWindowWithExtensionsDisabledAction extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.reloadWindowWithExtensionsDisabled',
            title: localize2('reloadWindowWithExtensionsDisabled', 'Reload with Extensions Disabled'),
            category: Categories.Developer,
            f1: true
        });
    }
    async run(accessor) {
        return accessor.get(INativeHostService).reload({ disableExtensions: true });
    }
}
export class OpenUserDataFolderAction extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.revealUserDataFolder',
            title: localize2('revealUserDataFolder', 'Reveal User Data Folder'),
            category: Categories.Developer,
            f1: true
        });
    }
    async run(accessor) {
        const nativeHostService = accessor.get(INativeHostService);
        const environmentService = accessor.get(INativeWorkbenchEnvironmentService);
        return nativeHostService.showItemInFolder(URI.file(environmentService.userDataPath).fsPath);
    }
}
export class ShowGPUInfoAction extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.showGPUInfo',
            title: localize2('showGPUInfo', 'Show GPU Info'),
            category: Categories.Developer,
            f1: true
        });
    }
    run(accessor) {
        const nativeHostService = accessor.get(INativeHostService);
        nativeHostService.openGPUInfoWindow();
    }
}
export class ShowContentTracingAction extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.showContentTracing',
            title: localize2('showContentTracing', 'Show Content Tracing'),
            category: Categories.Developer,
            f1: true
        });
    }
    run(accessor) {
        const nativeHostService = accessor.get(INativeHostService);
        nativeHostService.openContentTracingWindow();
    }
}
let activeTracingEntry;
export class StartTracing extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.startTracing',
            title: localize2('startTracing', 'Start Tracing'),
            category: Categories.Developer,
            f1: true
        });
    }
    async run(accessor) {
        const nativeHostService = accessor.get(INativeHostService);
        const statusbarService = accessor.get(IStatusbarService);
        const categories = [
            'content',
            'renderer_host',
            'browser',
            'renderer',
            'blink',
            'blink.user_timing',
            'netlog',
            'net',
            'v8',
            'disabled-by-default-v8.cpu_profiler',
            'disabled-by-default-devtools.timeline',
            'disabled-by-default-network',
            'disabled-by-default-net',
            'disabled-by-default-v8.gc_stats',
            'disabled-by-default-v8.stack_trace',
        ];
        await nativeHostService.startTracing(categories.join(','));
        activeTracingEntry?.dispose();
        activeTracingEntry = statusbarService.addEntry({
            name: localize('startTracing.name', "Performance Trace"),
            text: '$(record) ' + localize('startTracing.recording', "Recording trace (click to stop)"),
            ariaLabel: localize('startTracing.ariaLabel', "Recording performance trace. Click to stop recording."),
            tooltip: localize('startTracing.tooltip', "Click to stop recording"),
            kind: 'error',
            command: StopTracing.ID
        }, 'status.tracing', 0 /* StatusbarAlignment.LEFT */, -Number.MAX_VALUE);
    }
}
export class StopTracing extends Action2 {
    static { this.ID = 'workbench.action.stopTracing'; }
    constructor() {
        super({
            id: StopTracing.ID,
            title: localize2('stopTracing', 'Stop Tracing'),
            category: Categories.Developer,
            f1: true
        });
    }
    async run(accessor) {
        const nativeHostService = accessor.get(INativeHostService);
        const environmentService = accessor.get(INativeWorkbenchEnvironmentService);
        const dialogService = accessor.get(IDialogService);
        const progressService = accessor.get(IProgressService);
        if (!activeTracingEntry && !environmentService.args.trace) {
            const { confirmed } = await dialogService.confirm({
                message: localize('stopTracing.message', "No tracing session is in progress. Use 'Developer: Start Tracing' or launch with a '--trace' argument to begin tracing."),
                primaryButton: localize({ key: 'stopTracing.button', comment: ['&& denotes a mnemonic'] }, "&&Relaunch and Enable Tracing"),
            });
            if (confirmed) {
                return nativeHostService.relaunch({ addArgs: ['--trace'] });
            }
            return;
        }
        await progressService.withProgress({
            location: 20 /* ProgressLocation.Dialog */,
            title: localize('stopTracing.title', "Creating trace file..."),
            cancellable: false,
            detail: localize('stopTracing.detail', "This can take up to one minute to complete.")
        }, () => nativeHostService.stopTracing());
        activeTracingEntry?.dispose();
        activeTracingEntry = undefined;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGV2ZWxvcGVyQWN0aW9ucy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9lbGVjdHJvbi1icm93c2VyL2FjdGlvbnMvZGV2ZWxvcGVyQWN0aW9ucy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsUUFBUSxFQUFFLFNBQVMsRUFBRSxNQUFNLGlCQUFpQixDQUFDO0FBQ3RELE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQy9FLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUMvRSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQzlFLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSwyREFBMkQsQ0FBQztBQUV2RixPQUFPLEVBQUUsNEJBQTRCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUV2RyxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUUxRixPQUFPLEVBQUUsa0NBQWtDLEVBQUUsTUFBTSxtRUFBbUUsQ0FBQztBQUN2SCxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFDbEQsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBQy9ELE9BQU8sRUFBRSxnQkFBZ0IsRUFBb0IsTUFBTSwrQ0FBK0MsQ0FBQztBQUNuRyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDN0UsT0FBTyxFQUEyQixpQkFBaUIsRUFBc0IsTUFBTSwrQ0FBK0MsQ0FBQztBQUUvSCxNQUFNLE9BQU8sb0JBQXFCLFNBQVEsT0FBTztJQUVoRDtRQUNDLEtBQUssQ0FBQztZQUNMLEVBQUUsRUFBRSxpQ0FBaUM7WUFDckMsS0FBSyxFQUFFLFNBQVMsQ0FBQyxnQkFBZ0IsRUFBRSx3QkFBd0IsQ0FBQztZQUM1RCxRQUFRLEVBQUUsVUFBVSxDQUFDLFNBQVM7WUFDOUIsRUFBRSxFQUFFLElBQUk7WUFDUixVQUFVLEVBQUU7Z0JBQ1gsTUFBTSxFQUFFLDhDQUFvQyxFQUFFO2dCQUM5QyxJQUFJLEVBQUUsb0JBQW9CO2dCQUMxQixPQUFPLEVBQUUsbURBQTZCLHdCQUFlO2dCQUNyRCxHQUFHLEVBQUUsRUFBRSxPQUFPLEVBQUUsZ0RBQTJCLHdCQUFlLEVBQUU7YUFDNUQ7WUFDRCxJQUFJLEVBQUU7Z0JBQ0wsRUFBRSxFQUFFLE1BQU0sQ0FBQyxlQUFlO2dCQUMxQixLQUFLLEVBQUUsU0FBUztnQkFDaEIsS0FBSyxFQUFFLENBQUM7YUFDUjtTQUNELENBQUMsQ0FBQztJQUNKLENBQUM7SUFFRCxLQUFLLENBQUMsR0FBRyxDQUFDLFFBQTBCO1FBQ25DLE1BQU0saUJBQWlCLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO1FBRTNELE9BQU8saUJBQWlCLENBQUMsY0FBYyxDQUFDLEVBQUUsY0FBYyxFQUFFLGVBQWUsRUFBRSxDQUFDLGNBQWMsRUFBRSxDQUFDLENBQUM7SUFDL0YsQ0FBQztDQUNEO0FBRUQsTUFBTSxPQUFPLCtCQUFnQyxTQUFRLE9BQU87SUFFM0Q7UUFDQyxLQUFLLENBQUM7WUFDTCxFQUFFLEVBQUUsNENBQTRDO1lBQ2hELEtBQUssRUFBRSxTQUFTLENBQUMsMkJBQTJCLEVBQUUsNkJBQTZCLENBQUM7WUFDNUUsUUFBUSxFQUFFLFVBQVUsQ0FBQyxXQUFXO1lBQ2hDLEVBQUUsRUFBRSxJQUFJO1NBQ1IsQ0FBQyxDQUFDO0lBQ0osQ0FBQztJQUVELEtBQUssQ0FBQyxHQUFHLENBQUMsUUFBMEI7UUFDbkMsTUFBTSxhQUFhLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxjQUFjLENBQUMsQ0FBQztRQUNuRCxNQUFNLGtCQUFrQixHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsNEJBQTRCLENBQUMsQ0FBQztRQUV0RSxNQUFNLGFBQWEsQ0FBQyxVQUFVLENBQUM7WUFDOUIsUUFBUSxFQUFFLGtCQUFrQixDQUFDLFlBQVk7WUFDekMsT0FBTyxFQUFFLEVBQUUsTUFBTSxFQUFFLElBQUksRUFBRTtTQUN6QixDQUFDLENBQUM7SUFDSixDQUFDO0NBQ0Q7QUFFRCxNQUFNLE9BQU8sd0NBQXlDLFNBQVEsT0FBTztJQUVwRTtRQUNDLEtBQUssQ0FBQztZQUNMLEVBQUUsRUFBRSxxREFBcUQ7WUFDekQsS0FBSyxFQUFFLFNBQVMsQ0FBQyxvQ0FBb0MsRUFBRSxpQ0FBaUMsQ0FBQztZQUN6RixRQUFRLEVBQUUsVUFBVSxDQUFDLFNBQVM7WUFDOUIsRUFBRSxFQUFFLElBQUk7U0FDUixDQUFDLENBQUM7SUFDSixDQUFDO0lBRUQsS0FBSyxDQUFDLEdBQUcsQ0FBQyxRQUEwQjtRQUNuQyxPQUFPLFFBQVEsQ0FBQyxHQUFHLENBQUMsa0JBQWtCLENBQUMsQ0FBQyxNQUFNLENBQUMsRUFBRSxpQkFBaUIsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO0lBQzdFLENBQUM7Q0FDRDtBQUVELE1BQU0sT0FBTyx3QkFBeUIsU0FBUSxPQUFPO0lBRXBEO1FBQ0MsS0FBSyxDQUFDO1lBQ0wsRUFBRSxFQUFFLHVDQUF1QztZQUMzQyxLQUFLLEVBQUUsU0FBUyxDQUFDLHNCQUFzQixFQUFFLHlCQUF5QixDQUFDO1lBQ25FLFFBQVEsRUFBRSxVQUFVLENBQUMsU0FBUztZQUM5QixFQUFFLEVBQUUsSUFBSTtTQUNSLENBQUMsQ0FBQztJQUNKLENBQUM7SUFFRCxLQUFLLENBQUMsR0FBRyxDQUFDLFFBQTBCO1FBQ25DLE1BQU0saUJBQWlCLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO1FBQzNELE1BQU0sa0JBQWtCLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxrQ0FBa0MsQ0FBQyxDQUFDO1FBRTVFLE9BQU8saUJBQWlCLENBQUMsZ0JBQWdCLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxZQUFZLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQztJQUM3RixDQUFDO0NBQ0Q7QUFFRCxNQUFNLE9BQU8saUJBQWtCLFNBQVEsT0FBTztJQUU3QztRQUNDLEtBQUssQ0FBQztZQUNMLEVBQUUsRUFBRSw4QkFBOEI7WUFDbEMsS0FBSyxFQUFFLFNBQVMsQ0FBQyxhQUFhLEVBQUUsZUFBZSxDQUFDO1lBQ2hELFFBQVEsRUFBRSxVQUFVLENBQUMsU0FBUztZQUM5QixFQUFFLEVBQUUsSUFBSTtTQUNSLENBQUMsQ0FBQztJQUNKLENBQUM7SUFFRCxHQUFHLENBQUMsUUFBMEI7UUFDN0IsTUFBTSxpQkFBaUIsR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLGtCQUFrQixDQUFDLENBQUM7UUFDM0QsaUJBQWlCLENBQUMsaUJBQWlCLEVBQUUsQ0FBQztJQUN2QyxDQUFDO0NBQ0Q7QUFFRCxNQUFNLE9BQU8sd0JBQXlCLFNBQVEsT0FBTztJQUVwRDtRQUNDLEtBQUssQ0FBQztZQUNMLEVBQUUsRUFBRSxxQ0FBcUM7WUFDekMsS0FBSyxFQUFFLFNBQVMsQ0FBQyxvQkFBb0IsRUFBRSxzQkFBc0IsQ0FBQztZQUM5RCxRQUFRLEVBQUUsVUFBVSxDQUFDLFNBQVM7WUFDOUIsRUFBRSxFQUFFLElBQUk7U0FDUixDQUFDLENBQUM7SUFDSixDQUFDO0lBRUQsR0FBRyxDQUFDLFFBQTBCO1FBQzdCLE1BQU0saUJBQWlCLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO1FBQzNELGlCQUFpQixDQUFDLHdCQUF3QixFQUFFLENBQUM7SUFDOUMsQ0FBQztDQUNEO0FBRUQsSUFBSSxrQkFBdUQsQ0FBQztBQUU1RCxNQUFNLE9BQU8sWUFBYSxTQUFRLE9BQU87SUFFeEM7UUFDQyxLQUFLLENBQUM7WUFDTCxFQUFFLEVBQUUsK0JBQStCO1lBQ25DLEtBQUssRUFBRSxTQUFTLENBQUMsY0FBYyxFQUFFLGVBQWUsQ0FBQztZQUNqRCxRQUFRLEVBQUUsVUFBVSxDQUFDLFNBQVM7WUFDOUIsRUFBRSxFQUFFLElBQUk7U0FDUixDQUFDLENBQUM7SUFDSixDQUFDO0lBRVEsS0FBSyxDQUFDLEdBQUcsQ0FBQyxRQUEwQjtRQUM1QyxNQUFNLGlCQUFpQixHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsa0JBQWtCLENBQUMsQ0FBQztRQUMzRCxNQUFNLGdCQUFnQixHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsaUJBQWlCLENBQUMsQ0FBQztRQUV6RCxNQUFNLFVBQVUsR0FBRztZQUNsQixTQUFTO1lBQ1QsZUFBZTtZQUNmLFNBQVM7WUFDVCxVQUFVO1lBQ1YsT0FBTztZQUNQLG1CQUFtQjtZQUNuQixRQUFRO1lBQ1IsS0FBSztZQUNMLElBQUk7WUFDSixxQ0FBcUM7WUFDckMsdUNBQXVDO1lBQ3ZDLDZCQUE2QjtZQUM3Qix5QkFBeUI7WUFDekIsaUNBQWlDO1lBQ2pDLG9DQUFvQztTQUNwQyxDQUFDO1FBQ0YsTUFBTSxpQkFBaUIsQ0FBQyxZQUFZLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO1FBRTNELGtCQUFrQixFQUFFLE9BQU8sRUFBRSxDQUFDO1FBQzlCLGtCQUFrQixHQUFHLGdCQUFnQixDQUFDLFFBQVEsQ0FBQztZQUM5QyxJQUFJLEVBQUUsUUFBUSxDQUFDLG1CQUFtQixFQUFFLG1CQUFtQixDQUFDO1lBQ3hELElBQUksRUFBRSxZQUFZLEdBQUcsUUFBUSxDQUFDLHdCQUF3QixFQUFFLGlDQUFpQyxDQUFDO1lBQzFGLFNBQVMsRUFBRSxRQUFRLENBQUMsd0JBQXdCLEVBQUUsdURBQXVELENBQUM7WUFDdEcsT0FBTyxFQUFFLFFBQVEsQ0FBQyxzQkFBc0IsRUFBRSx5QkFBeUIsQ0FBQztZQUNwRSxJQUFJLEVBQUUsT0FBTztZQUNiLE9BQU8sRUFBRSxXQUFXLENBQUMsRUFBRTtTQUN2QixFQUFFLGdCQUFnQixtQ0FBMkIsQ0FBQyxNQUFNLENBQUMsU0FBUyxDQUFDLENBQUM7SUFDbEUsQ0FBQztDQUNEO0FBRUQsTUFBTSxPQUFPLFdBQVksU0FBUSxPQUFPO2FBRXZCLE9BQUUsR0FBRyw4QkFBOEIsQ0FBQztJQUVwRDtRQUNDLEtBQUssQ0FBQztZQUNMLEVBQUUsRUFBRSxXQUFXLENBQUMsRUFBRTtZQUNsQixLQUFLLEVBQUUsU0FBUyxDQUFDLGFBQWEsRUFBRSxjQUFjLENBQUM7WUFDL0MsUUFBUSxFQUFFLFVBQVUsQ0FBQyxTQUFTO1lBQzlCLEVBQUUsRUFBRSxJQUFJO1NBQ1IsQ0FBQyxDQUFDO0lBQ0osQ0FBQztJQUVRLEtBQUssQ0FBQyxHQUFHLENBQUMsUUFBMEI7UUFDNUMsTUFBTSxpQkFBaUIsR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLGtCQUFrQixDQUFDLENBQUM7UUFDM0QsTUFBTSxrQkFBa0IsR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLGtDQUFrQyxDQUFDLENBQUM7UUFDNUUsTUFBTSxhQUFhLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxjQUFjLENBQUMsQ0FBQztRQUNuRCxNQUFNLGVBQWUsR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLGdCQUFnQixDQUFDLENBQUM7UUFFdkQsSUFBSSxDQUFDLGtCQUFrQixJQUFJLENBQUMsa0JBQWtCLENBQUMsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO1lBQzNELE1BQU0sRUFBRSxTQUFTLEVBQUUsR0FBRyxNQUFNLGFBQWEsQ0FBQyxPQUFPLENBQUM7Z0JBQ2pELE9BQU8sRUFBRSxRQUFRLENBQUMscUJBQXFCLEVBQUUseUhBQXlILENBQUM7Z0JBQ25LLGFBQWEsRUFBRSxRQUFRLENBQUMsRUFBRSxHQUFHLEVBQUUsb0JBQW9CLEVBQUUsT0FBTyxFQUFFLENBQUMsdUJBQXVCLENBQUMsRUFBRSxFQUFFLCtCQUErQixDQUFDO2FBQzNILENBQUMsQ0FBQztZQUVILElBQUksU0FBUyxFQUFFLENBQUM7Z0JBQ2YsT0FBTyxpQkFBaUIsQ0FBQyxRQUFRLENBQUMsRUFBRSxPQUFPLEVBQUUsQ0FBQyxTQUFTLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDN0QsQ0FBQztZQUVELE9BQU87UUFDUixDQUFDO1FBRUQsTUFBTSxlQUFlLENBQUMsWUFBWSxDQUFDO1lBQ2xDLFFBQVEsa0NBQXlCO1lBQ2pDLEtBQUssRUFBRSxRQUFRLENBQUMsbUJBQW1CLEVBQUUsd0JBQXdCLENBQUM7WUFDOUQsV0FBVyxFQUFFLEtBQUs7WUFDbEIsTUFBTSxFQUFFLFFBQVEsQ0FBQyxvQkFBb0IsRUFBRSw2Q0FBNkMsQ0FBQztTQUNyRixFQUFFLEdBQUcsRUFBRSxDQUFDLGlCQUFpQixDQUFDLFdBQVcsRUFBRSxDQUFDLENBQUM7UUFFMUMsa0JBQWtCLEVBQUUsT0FBTyxFQUFFLENBQUM7UUFDOUIsa0JBQWtCLEdBQUcsU0FBUyxDQUFDO0lBQ2hDLENBQUMifQ==