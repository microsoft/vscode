/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { Registry } from 'vs/platform/registry/common/platform';
import { ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { localize } from 'vs/nls';
import { Action2, registerAction2 } from 'vs/platform/actions/common/actions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { CellToolbarLocation, CompactView, ConsolidatedRunButton, FocusIndicator, GlobalToolbar, InsertToolbarLocation, ShowCellStatusBar, UndoRedoPerCell } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { ITASExperimentService } from 'vs/workbench/services/experiment/common/experimentService';
import { Extensions as WorkbenchExtensions, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';

export enum NotebookProfileType {
	default = 'default',
	jupyter = 'jupyter',
	colab = 'colab'
}

const profiles = {
	[NotebookProfileType.default]: {
		[FocusIndicator]: 'gutter',
		[InsertToolbarLocation]: 'both',
		[GlobalToolbar]: true,
		[CellToolbarLocation]: { default: 'right' },
		[CompactView]: true,
		[ShowCellStatusBar]: 'visible',
		[ConsolidatedRunButton]: true,
		[UndoRedoPerCell]: false
	},
	[NotebookProfileType.jupyter]: {
		[FocusIndicator]: 'gutter',
		[InsertToolbarLocation]: 'notebookToolbar',
		[GlobalToolbar]: true,
		[CellToolbarLocation]: { default: 'left' },
		[CompactView]: true,
		[ShowCellStatusBar]: 'visible',
		[ConsolidatedRunButton]: false,
		[UndoRedoPerCell]: true
	},
	[NotebookProfileType.colab]: {
		[FocusIndicator]: 'border',
		[InsertToolbarLocation]: 'betweenCells',
		[GlobalToolbar]: false,
		[CellToolbarLocation]: { default: 'right' },
		[CompactView]: false,
		[ShowCellStatusBar]: 'hidden',
		[ConsolidatedRunButton]: true,
		[UndoRedoPerCell]: false
	}
};

async function applyProfile(configService: IConfigurationService, profile: Record<string, any>): Promise<void> {
	const promises = [];
	for (let settingKey in profile) {
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

export class NotebookProfileContribution extends Disposable {
	constructor(@IConfigurationService configService: IConfigurationService, @ITASExperimentService private readonly experimentService: ITASExperimentService) {
		super();

		if (this.experimentService) {
			this.experimentService.getTreatment<NotebookProfileType.default | NotebookProfileType.jupyter | NotebookProfileType.colab>('notebookprofile').then(treatment => {
				if (treatment === undefined) {
					return;
				} else {
					// check if settings are already modified
					const focusIndicator = configService.getValue(FocusIndicator);
					const insertToolbarPosition = configService.getValue(InsertToolbarLocation);
					const globalToolbar = configService.getValue(GlobalToolbar);
					// const cellToolbarLocation = configService.getValue(CellToolbarLocation);
					const compactView = configService.getValue(CompactView);
					const showCellStatusBar = configService.getValue(ShowCellStatusBar);
					const consolidatedRunButton = configService.getValue(ConsolidatedRunButton);
					if (focusIndicator === 'border'
						&& insertToolbarPosition === 'both'
						&& globalToolbar === false
						// && cellToolbarLocation === undefined
						&& compactView === true
						&& showCellStatusBar === 'visible'
						&& consolidatedRunButton === true
					) {
						applyProfile(configService, profiles[treatment] ?? profiles[NotebookProfileType.default]);
					}
				}
			});
		}
	}
}

const workbenchContributionsRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
workbenchContributionsRegistry.registerWorkbenchContribution(NotebookProfileContribution, LifecyclePhase.Ready);

