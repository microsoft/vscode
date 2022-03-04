/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert = require('assert');
import { URI } from 'vs/base/common/uri';
import { mock } from 'vs/base/test/common/mock';
import { IEditorTabDto, MainThreadEditorTabsShape, TabKind } from 'vs/workbench/api/common/extHost.protocol';
import { ExtHostEditorTabs, IEditorTabGroup } from 'vs/workbench/api/common/extHostEditorTabs';
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
			additionalResourcesAndViewTypes: [],
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

	test('Ensure tabGroup change events fires', function () {
		const extHostEditorTabs = new ExtHostEditorTabs(
			SingleProxyRPCProtocol(new class extends mock<MainThreadEditorTabsShape>() {
				// override/implement $moveTab or $closeTab
			})
		);

		let count = 0;
		extHostEditorTabs.tabGroups.onDidChangeTabGroup(() => count++);


		assert.strictEqual(extHostEditorTabs.tabGroups.all.length, 0);
		assert.strictEqual(extHostEditorTabs.tabGroups.activeTabGroup, undefined);
		assert.strictEqual(count, 0);
		extHostEditorTabs.$acceptEditorTabModel([{
			isActive: true,
			viewColumn: 0,
			groupId: 12,
			tabs: [],
			activeTab: undefined
		}]);
		assert.ok(extHostEditorTabs.tabGroups.activeTabGroup);
		const activeTabGroup: IEditorTabGroup = extHostEditorTabs.tabGroups.activeTabGroup;
		assert.strictEqual(extHostEditorTabs.tabGroups.all.length, 1);
		assert.strictEqual(activeTabGroup.tabs.length, 0);
		assert.strictEqual(count, 1);
	});

	test('Ensure reference equality for activeTab and activeGroup', function () {
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
			resource: URI.parse('file://abc/def.txt'),
			editorId: 'default',
			viewColumn: 0,
			additionalResourcesAndViewTypes: [],
			kind: TabKind.Singular
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
		assert.strictEqual(first.activeTab, first.tabs[0]);
		assert.strictEqual(extHostEditorTabs.tabGroups.activeTabGroup, first);
	});
});
