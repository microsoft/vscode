/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { Action2, registerAction2 } from 'vs/platform/actions/common/actions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { CompactView, FocusIndicator, GlobalToolbar, InsertToolbarPosition, ShowCellStatusBarKey } from 'vs/workbench/contrib/notebook/common/notebookCommon';

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
		[CompactView]: false,
		[ShowCellStatusBarKey]: true,
	},
	[NotebookProfileType.jupyter]: {
		[FocusIndicator]: 'gutter',
		[InsertToolbarPosition]: 'notebookToolbar',
		[GlobalToolbar]: true,
		[CompactView]: true,
		[ShowCellStatusBarKey]: true,
	},
	[NotebookProfileType.colab]: {
		[FocusIndicator]: 'border',
		[InsertToolbarPosition]: 'betweenCells',
		[GlobalToolbar]: false,
		[CompactView]: true,
		[ShowCellStatusBarKey]: false,
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
