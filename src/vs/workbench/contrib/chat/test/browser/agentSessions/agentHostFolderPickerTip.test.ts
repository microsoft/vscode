/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { InMemoryStorageService, StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';
import {
	createFolderPickerTip,
	FOLDER_PICKER_TIP_CLASS,
	FOLDER_PICKER_TIP_DISMISSED_STORAGE_KEY,
	FOLDER_PICKER_TIP_LEARN_MORE_URL,
} from '../../../browser/agentSessions/agentHost/agentHostFolderPickerTip.js';

suite('AgentHostFolderPickerTip', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('provides existing ActionList header options', () => {
		const storage = store.add(new InMemoryStorageService());
		const tip = createFolderPickerTip(storage);
		const listOptions = tip.getListOptions();

		assert.deepStrictEqual({
			widgetClassName: listOptions.widgetClassName,
			headerText: listOptions.headerText,
			headerIcon: listOptions.headerIcon?.id,
			headerLinkLabel: listOptions.headerLink?.label,
			headerLinkUri: listOptions.headerLink?.uri.toString(),
			hasHeaderDismiss: typeof listOptions.headerDismiss === 'function',
		}, {
			widgetClassName: FOLDER_PICKER_TIP_CLASS,
			headerText: 'Select a primary directory',
			headerIcon: Codicon.info.id,
			headerLinkLabel: 'Learn more',
			headerLinkUri: FOLDER_PICKER_TIP_LEARN_MORE_URL,
			hasHeaderDismiss: true,
		});
	});

	test('dismisses and persists, hiding the header on the next open', () => {
		const storage = store.add(new InMemoryStorageService());
		const tip = createFolderPickerTip(storage);

		tip.getListOptions().headerDismiss?.();
		const listOptions = tip.getListOptions();

		assert.deepStrictEqual({
			dismissed: storage.getBoolean(FOLDER_PICKER_TIP_DISMISSED_STORAGE_KEY, StorageScope.APPLICATION, false),
			widgetClassName: listOptions.widgetClassName,
			headerText: listOptions.headerText,
			headerLink: listOptions.headerLink,
			headerDismiss: listOptions.headerDismiss,
		}, {
			dismissed: true,
			widgetClassName: FOLDER_PICKER_TIP_CLASS,
			headerText: undefined,
			headerLink: undefined,
			headerDismiss: undefined,
		});
	});

	test('starts hidden when storage is already dismissed', () => {
		const storage = store.add(new InMemoryStorageService());
		storage.store(FOLDER_PICKER_TIP_DISMISSED_STORAGE_KEY, true, StorageScope.APPLICATION, StorageTarget.USER);
		const tip = createFolderPickerTip(storage);
		const listOptions = tip.getListOptions();

		assert.deepStrictEqual({
			widgetClassName: listOptions.widgetClassName,
			headerText: listOptions.headerText,
			headerLink: listOptions.headerLink,
			headerDismiss: listOptions.headerDismiss,
		}, {
			widgetClassName: FOLDER_PICKER_TIP_CLASS,
			headerText: undefined,
			headerLink: undefined,
			headerDismiss: undefined,
		});
	});

	test('reflects a dismissal storage change on the next open', () => {
		const storage = store.add(new InMemoryStorageService());
		const tip = createFolderPickerTip(storage);

		storage.store(FOLDER_PICKER_TIP_DISMISSED_STORAGE_KEY, true, StorageScope.APPLICATION, StorageTarget.USER);
		const listOptions = tip.getListOptions();

		assert.deepStrictEqual({
			headerText: listOptions.headerText,
			headerLink: listOptions.headerLink,
			headerDismiss: listOptions.headerDismiss,
		}, {
			headerText: undefined,
			headerLink: undefined,
			headerDismiss: undefined,
		});
	});
});
