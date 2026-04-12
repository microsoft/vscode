/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { localize } from '../../../../../../nls.js';
import { Action2, registerAction2 } from '../../../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { NotebookSetting } from '../../../common/notebookCommon.js';
export var NotebookProfileType;
(function (NotebookProfileType) {
    NotebookProfileType["default"] = "default";
    NotebookProfileType["jupyter"] = "jupyter";
    NotebookProfileType["colab"] = "colab";
})(NotebookProfileType || (NotebookProfileType = {}));
const profiles = {
    [NotebookProfileType.default]: {
        [NotebookSetting.focusIndicator]: 'gutter',
        [NotebookSetting.insertToolbarLocation]: 'both',
        [NotebookSetting.globalToolbar]: true,
        [NotebookSetting.cellToolbarLocation]: { default: 'right' },
        [NotebookSetting.compactView]: true,
        [NotebookSetting.showCellStatusBar]: 'visible',
        [NotebookSetting.consolidatedRunButton]: true,
        [NotebookSetting.undoRedoPerCell]: false
    },
    [NotebookProfileType.jupyter]: {
        [NotebookSetting.focusIndicator]: 'gutter',
        [NotebookSetting.insertToolbarLocation]: 'notebookToolbar',
        [NotebookSetting.globalToolbar]: true,
        [NotebookSetting.cellToolbarLocation]: { default: 'left' },
        [NotebookSetting.compactView]: true,
        [NotebookSetting.showCellStatusBar]: 'visible',
        [NotebookSetting.consolidatedRunButton]: false,
        [NotebookSetting.undoRedoPerCell]: true
    },
    [NotebookProfileType.colab]: {
        [NotebookSetting.focusIndicator]: 'border',
        [NotebookSetting.insertToolbarLocation]: 'betweenCells',
        [NotebookSetting.globalToolbar]: false,
        [NotebookSetting.cellToolbarLocation]: { default: 'right' },
        [NotebookSetting.compactView]: false,
        [NotebookSetting.showCellStatusBar]: 'hidden',
        [NotebookSetting.consolidatedRunButton]: true,
        [NotebookSetting.undoRedoPerCell]: false
    }
};
async function applyProfile(configService, profile) {
    const promises = [];
    for (const settingKey in profile) {
        promises.push(configService.updateValue(settingKey, profile[settingKey]));
    }
    await Promise.all(promises);
}
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'notebook.setProfile',
            title: localize('setProfileTitle', "Set Profile")
        });
    }
    async run(accessor, args) {
        if (!isSetProfileArgs(args)) {
            return;
        }
        const configService = accessor.get(IConfigurationService);
        return applyProfile(configService, profiles[args.profile]);
    }
});
function isSetProfileArgs(args) {
    const setProfileArgs = args;
    return setProfileArgs.profile === NotebookProfileType.colab ||
        setProfileArgs.profile === NotebookProfileType.default ||
        setProfileArgs.profile === NotebookProfileType.jupyter;
}
// export class NotebookProfileContribution extends Disposable {
// 	static readonly ID = 'workbench.contrib.notebookProfile';
// 	constructor(@IConfigurationService configService: IConfigurationService, @IWorkbenchAssignmentService private readonly experimentService: IWorkbenchAssignmentService) {
// 		super();
// 		if (this.experimentService) {
// 			this.experimentService.getTreatment<NotebookProfileType.default | NotebookProfileType.jupyter | NotebookProfileType.colab>('notebookprofile').then(treatment => {
// 				if (treatment === undefined) {
// 					return;
// 				} else {
// 					// check if settings are already modified
// 					const focusIndicator = configService.getValue(NotebookSetting.focusIndicator);
// 					const insertToolbarPosition = configService.getValue(NotebookSetting.insertToolbarLocation);
// 					const globalToolbar = configService.getValue(NotebookSetting.globalToolbar);
// 					// const cellToolbarLocation = configService.getValue(NotebookSetting.cellToolbarLocation);
// 					const compactView = configService.getValue(NotebookSetting.compactView);
// 					const showCellStatusBar = configService.getValue(NotebookSetting.showCellStatusBar);
// 					const consolidatedRunButton = configService.getValue(NotebookSetting.consolidatedRunButton);
// 					if (focusIndicator === 'border'
// 						&& insertToolbarPosition === 'both'
// 						&& globalToolbar === false
// 						// && cellToolbarLocation === undefined
// 						&& compactView === true
// 						&& showCellStatusBar === 'visible'
// 						&& consolidatedRunButton === true
// 					) {
// 						applyProfile(configService, profiles[treatment] ?? profiles[NotebookProfileType.default]);
// 					}
// 				}
// 			});
// 		}
// 	}
// }
// registerWorkbenchContribution2(NotebookProfileContribution.ID, NotebookProfileContribution, WorkbenchPhase.BlockRestore);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm90ZWJvb2tQcm9maWxlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvbm90ZWJvb2svYnJvd3Nlci9jb250cmliL3Byb2ZpbGUvbm90ZWJvb2tQcm9maWxlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBR2hHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQztBQUNwRCxPQUFPLEVBQUUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQ2hHLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLGtFQUFrRSxDQUFDO0FBQ3pHLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUVwRSxNQUFNLENBQU4sSUFBWSxtQkFJWDtBQUpELFdBQVksbUJBQW1CO0lBQzlCLDBDQUFtQixDQUFBO0lBQ25CLDBDQUFtQixDQUFBO0lBQ25CLHNDQUFlLENBQUE7QUFDaEIsQ0FBQyxFQUpXLG1CQUFtQixLQUFuQixtQkFBbUIsUUFJOUI7QUFFRCxNQUFNLFFBQVEsR0FBRztJQUNoQixDQUFDLG1CQUFtQixDQUFDLE9BQU8sQ0FBQyxFQUFFO1FBQzlCLENBQUMsZUFBZSxDQUFDLGNBQWMsQ0FBQyxFQUFFLFFBQVE7UUFDMUMsQ0FBQyxlQUFlLENBQUMscUJBQXFCLENBQUMsRUFBRSxNQUFNO1FBQy9DLENBQUMsZUFBZSxDQUFDLGFBQWEsQ0FBQyxFQUFFLElBQUk7UUFDckMsQ0FBQyxlQUFlLENBQUMsbUJBQW1CLENBQUMsRUFBRSxFQUFFLE9BQU8sRUFBRSxPQUFPLEVBQUU7UUFDM0QsQ0FBQyxlQUFlLENBQUMsV0FBVyxDQUFDLEVBQUUsSUFBSTtRQUNuQyxDQUFDLGVBQWUsQ0FBQyxpQkFBaUIsQ0FBQyxFQUFFLFNBQVM7UUFDOUMsQ0FBQyxlQUFlLENBQUMscUJBQXFC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