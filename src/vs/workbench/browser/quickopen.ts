/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Action } from 'vs/base/common/actions';
import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';

export const CLOSE_ON_FOCUS_LOST_CONFIG = 'workbench.quickOpen.closeOnFocusLost';
export const PRESERVE_INPUT_CONFIG = 'workbench.quickOpen.preserveInput';
export const ENABLE_EXPERIMENTAL_VERSION_CONFIG = 'workbench.quickOpen.enableExperimentalNewVersion';
export const SEARCH_EDITOR_HISTORY = 'search.quickOpen.includeHistory';

export interface IWorkbenchQuickOpenConfiguration {
	workbench: {
		commandPalette: {
			history: number;
			preserveInput: boolean;
		},
		quickOpen: {
			enableExperimentalNewVersion: boolean;
			preserveInput: boolean;
		}
	};
}

export class QuickOpenAction extends Action {
	private prefix: string;

	constructor(
		id: string,
		label: string,
		prefix: string,
		@IQuickInputService protected readonly quickInputService: IQuickInputService
	) {
		super(id, label);

		this.prefix = prefix;
	}

	async run(): Promise<void> {
		this.quickInputService.quickAccess.show(this.prefix);
	}
}
