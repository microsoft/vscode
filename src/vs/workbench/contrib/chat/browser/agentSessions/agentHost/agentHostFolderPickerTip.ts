/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../../base/common/codicons.js';
import { onUnexpectedError } from '../../../../../../base/common/errors.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize } from '../../../../../../nls.js';
import { IActionWidgetDropdownListOptionsProvider } from '../../../../../../platform/actionWidget/browser/actionWidgetDropdown.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';

export const FOLDER_PICKER_TIP_DISMISSED_STORAGE_KEY = 'chat.agentHost.folderPickerTipDismissed1';
export const FOLDER_PICKER_TIP_LEARN_MORE_URL = 'https://aka.ms/vscodeMultirootWorkspaceChatFolderPicker';
export const FOLDER_PICKER_TIP_CLASS = 'agent-host-folder-picker-tip';

/** Provides dynamic list options for the dismissible folder picker tip. */
export function createFolderPickerTip(storageService: IStorageService): IActionWidgetDropdownListOptionsProvider {
	const headerText = localize('chat.agentHost.folderPickerTip.text', "Select a primary directory");
	const headerLink = {
		label: localize('chat.agentHost.folderPickerTip.learnMore', "Learn more"),
		uri: URI.parse(FOLDER_PICKER_TIP_LEARN_MORE_URL),
	};

	const isDismissed = (): boolean => {
		try {
			return storageService.getBoolean(FOLDER_PICKER_TIP_DISMISSED_STORAGE_KEY, StorageScope.APPLICATION, false);
		} catch (error) {
			onUnexpectedError(error);
			return false;
		}
	};

	const dismiss = (): void => {
		try {
			storageService.store(FOLDER_PICKER_TIP_DISMISSED_STORAGE_KEY, true, StorageScope.APPLICATION, StorageTarget.USER);
		} catch (error) {
			onUnexpectedError(error);
		}
	};

	return {
		getListOptions: () => {
			// To be fixed once we have a proper URI for the link.
			if (isDismissed()) {
				return { widgetClassName: FOLDER_PICKER_TIP_CLASS };
			}
			return {
				widgetClassName: FOLDER_PICKER_TIP_CLASS,
				headerText,
				headerIcon: Codicon.info,
				headerLink,
				headerDismiss: dismiss,
			};
		},
	};
}
