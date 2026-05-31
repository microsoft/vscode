/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ServicesAccessor } from '../../../../../../editor/browser/editorExtensions.js';
import { localize } from '../../../../../../nls.js';
import { Action2, registerAction2 } from '../../../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { NotebookSetting } from '../../../common/notebookCommon.js';

export enum NotebookProfileType {
	default = 'default',
	jupyter = 'jupyter',
	colab = 'colab'
}

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

async function applyProfile(configService: IConfigurationService, profile: Record<string, any>): Promise<void> {
	const promises = [];
	for (const settingKey in profile) {
		promises.push(configService.updateValue(settingKey, profile[settingKey]));
	}

	await Promise.all(promises);
}

export interface ISetProfileArgs {
	profile: NotebookProfileType;
}

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'notebook.setProfile',
			title: localize('setProfileTitle', "Set Profile")
		});
	}

	async run(accessor: ServicesAccessor, args: unknown): Promise<void> {
		if (!isSetProfileArgs(args)) {
			return;
		}

		const configService = accessor.get(IConfigurationService);
		return applyProfile(configService, profiles[args.profile]);
	}
});

function isSetProfileArgs(args: unknown): args is ISetProfileArgs {
	const setProfileArgs = args as ISetProfileArgs;
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
