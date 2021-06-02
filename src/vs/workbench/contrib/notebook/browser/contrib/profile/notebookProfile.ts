/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { localize } from 'vs/nls';
import { Action2, registerAction2 } from 'vs/platform/actions/common/actions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { CellToolbarLocation, CompactView, ConsolidatedRunButton, FocusIndicator, GlobalToolbar, InsertToolbarPosition, ShowCellStatusBarAfterExecuteKey, ShowCellStatusBarKey, UndoRedoPerCell } from 'vs/workbench/contrib/notebook/common/notebookCommon';

export enum NotebookProfileType {
	default = 'default',
	jupyter = 'jupyter',
	colab = 'colab'
}

const profiles = {
	[NotebookProfileType.default]: {
		[FocusIndicator]: 'border',
		[InsertToolbarPosition]: 'both',
		[GlobalToolbar]: false,
		[CellToolbarLocation]: { default: 'right' },
		[CompactView]: true,
		[ShowCellStatusBarKey]: true,
		[ShowCellStatusBarAfterExecuteKey]: false,
		[ConsolidatedRunButton]: true
	},
	[NotebookProfileType.jupyter]: {
		[FocusIndicator]: 'gutter',
		[InsertToolbarPosition]: 'notebookToolbar',
		[GlobalToolbar]: true,
		[CellToolbarLocation]: { default: 'left' },
		[CompactView]: true,
		[ShowCellStatusBarKey]: true,
		[ConsolidatedRunButton]: false,
		[UndoRedoPerCell]: true
	},
	[NotebookProfileType.colab]: {
		[FocusIndicator]: 'border',
		[InsertToolbarPosition]: 'betweenCells',
		[GlobalToolbar]: false,
		[CellToolbarLocation]: { default: 'right' },
		[CompactView]: false,
		[ShowCellStatusBarKey]: false,
		[ConsolidatedRunButton]: true
	}
};

async function applyProfile(accessor: ServicesAccessor, profile: Record<string, any>): Promise<void> {
	const configService = accessor.get(IConfigurationService);
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

		return applyProfile(accessor, profiles[args.profile]);
	}
});

function isSetProfileArgs(args: unknown): args is ISetProfileArgs {
	const setProfileArgs = args as ISetProfileArgs;
	return setProfileArgs.profile === NotebookProfileType.colab ||
		setProfileArgs.profile === NotebookProfileType.default ||
		setProfileArgs.profile === NotebookProfileType.jupyter;
}
