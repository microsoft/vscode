/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert = require('assert');
import { mock } from 'vs/base/test/common/mock';
import { IEditorTabDto, MainThreadEditorTabsShape, TabKind } from 'vs/workbench/api/common/extHost.protocol';
import { ExtHostEditorTabs } from 'vs/workbench/api/common/extHostEditorTabs';
import { SingleProxyRPCProtocol } from 'vs/workbench/api/test/common/testRPCProtocol';

suite('ExtHostEditorTabs', function () {


	test('empty', function () {

		const extHostEditorTabs = new ExtHostEditorTabs(
			SingleProxyRPCProtocol(new class extends mock<MainThreadEditorTabsShape>() {
				// override/implement $moveTab or $closeTab
			})
		);

		assert.strictEqual(extHostEditorTabs.tabGroups.all.length, 0);
		assert.strictEqual(extHostEditorTabs.tabGroups.activeTabGroup, undefined);
	});

	test('single tab', function () {

		const extHostEditorTabs = new ExtHostEditorTabs(
			SingleProxyRPCProtocol(new class extends mock<MainThreadEditorTabsShape>() {
				// override/implement $moveTab or $closeTab
			})
		);

		const tab: IEditorTabDto = {
			isActive: true,
			isDirty: true,
			isPinned: true,
			label: 'label1',
			viewColumn: 0,
			additionalResourcesAndViewIds: [],
			kind: TabKind.Other
		};

		extHostEditorTabs.$acceptEditorTabModel([{
			isActive: true,
			viewColumn: 0,
			groupId: 12,
			tabs: [tab],
			activeTab: { ...tab }
		}]);
		assert.strictEqual(extHostEditorTabs.tabGroups.all.length, 1);
		const [first] = extHostEditorTabs.tabGroups.all;
		assert.ok(first.activeTab);
		assert.strictEqual(first.tabs.indexOf(first.activeTab), 0);

		{
			extHostEditorTabs.$acceptEditorTabModel([{
				isActive: true,
				viewColumn: 0,
				groupId: 12,
				tabs: [tab],
				activeTab: undefined! // TODO@lramos15 unused
			}]);
			assert.strictEqual(extHostEditorTabs.tabGroups.all.length, 1);
			const [first] = extHostEditorTabs.tabGroups.all;
			assert.ok(first.activeTab);
			assert.strictEqual(first.tabs.indexOf(first.activeTab), 0);
		}
	});

	test('Empty tab group', function () {
		const extHostEditorTabs = new ExtHostEditorTabs(
			SingleProxyRPCProtocol(new class extends mock<MainThreadEditorTabsShape>() {
				// override/implement $moveTab or $closeTab
			})
		);

		extHostEditorTabs.$acceptEditorTabModel([{
			isActive: true,
			viewColumn: 0,
			groupId: 12,
			tabs: [],
			activeTab: undefined
		}]);
		assert.strictEqual(extHostEditorTabs.tabGroups.all.length, 1);
		const [first] = extHostEditorTabs.tabGroups.all;
		assert.strictEqual(first.activeTab, undefined);
		assert.strictEqual(first.tabs.length, 0);
	});
});
