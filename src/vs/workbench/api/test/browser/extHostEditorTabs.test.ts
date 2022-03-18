/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import assert = require('assert');
import { URI } from 'vs/base/common/uri';
import { mock } from 'vs/base/test/common/mock';
import { IEditorTabDto, MainThreadEditorTabsShape, TabInputKind, TextInputDto } from 'vs/workbench/api/common/extHost.protocol';
import { ExtHostEditorTabs } from 'vs/workbench/api/common/extHostEditorTabs';
import { SingleProxyRPCProtocol } from 'vs/workbench/api/test/common/testRPCProtocol';
import { TextTabInput } from 'vs/workbench/api/common/extHostTypes';

suite('ExtHostEditorTabs', function () {

	const defaultTabDto: IEditorTabDto = {
		id: 'uniquestring',
		input: { kind: TabInputKind.TextInput, uri: URI.parse('file://abc/def.txt') },
		isActive: true,
		isDirty: true,
		isPinned: true,
		isPreview: false,
		label: 'label1',
	};

	function createTabDto(dto?: Partial<IEditorTabDto>): IEditorTabDto {
		return { ...defaultTabDto, ...dto };
	}

	test('empty', function () {

		const extHostEditorTabs = new ExtHostEditorTabs(
			SingleProxyRPCProtocol(new class extends mock<MainThreadEditorTabsShape>() {
				// override/implement $moveTab or $closeTab
			})
		);

		assert.strictEqual(extHostEditorTabs.tabGroups.groups.length, 0);
		assert.strictEqual(extHostEditorTabs.tabGroups.activeTabGroup, undefined);
	});

	test('single tab', function () {

		const extHostEditorTabs = new ExtHostEditorTabs(
			SingleProxyRPCProtocol(new class extends mock<MainThreadEditorTabsShape>() {
				// override/implement $moveTab or $closeTab
			})
		);

		const tab: IEditorTabDto = createTabDto({
			id: 'uniquestring',
			isActive: true,
			isDirty: true,
			isPinned: true,
			label: 'label1',
		});

		extHostEditorTabs.$acceptEditorTabModel([{
			isActive: true,
			viewColumn: 0,
			groupId: 12,
			tabs: [tab]
		}]);
		assert.strictEqual(extHostEditorTabs.tabGroups.groups.length, 1);
		const [first] = extHostEditorTabs.tabGroups.groups;
		assert.ok(first.activeTab);
		assert.strictEqual(first.tabs.indexOf(first.activeTab), 0);

		{
			extHostEditorTabs.$acceptEditorTabModel([{
				isActive: true,
				viewColumn: 0,
				groupId: 12,
				tabs: [tab]
			}]);
			assert.strictEqual(extHostEditorTabs.tabGroups.groups.length, 1);
			const [first] = extHostEditorTabs.tabGroups.groups;
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
			tabs: []
		}]);
		assert.strictEqual(extHostEditorTabs.tabGroups.groups.length, 1);
		const [first] = extHostEditorTabs.tabGroups.groups;
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


		assert.strictEqual(extHostEditorTabs.tabGroups.groups.length, 0);
		assert.strictEqual(extHostEditorTabs.tabGroups.activeTabGroup, undefined);
		assert.strictEqual(count, 0);
		extHostEditorTabs.$acceptEditorTabModel([{
			isActive: true,
			viewColumn: 0,
			groupId: 12,
			tabs: []
		}]);
		assert.ok(extHostEditorTabs.tabGroups.activeTabGroup);
		const activeTabGroup: vscode.TabGroup = extHostEditorTabs.tabGroups.activeTabGroup;
		assert.strictEqual(extHostEditorTabs.tabGroups.groups.length, 1);
		assert.strictEqual(activeTabGroup.tabs.length, 0);
		assert.strictEqual(count, 1);
	});

	test('Ensure reference equality for activeTab and activeGroup', function () {
		const extHostEditorTabs = new ExtHostEditorTabs(
			SingleProxyRPCProtocol(new class extends mock<MainThreadEditorTabsShape>() {
				// override/implement $moveTab or $closeTab
			})
		);
		const tab = createTabDto({
			id: 'uniquestring',
			isActive: true,
			isDirty: true,
			isPinned: true,
			label: 'label1',
			editorId: 'default',
		});

		extHostEditorTabs.$acceptEditorTabModel([{
			isActive: true,
			viewColumn: 0,
			groupId: 12,
			tabs: [tab]
		}]);
		assert.strictEqual(extHostEditorTabs.tabGroups.groups.length, 1);
		const [first] = extHostEditorTabs.tabGroups.groups;
		assert.ok(first.activeTab);
		assert.strictEqual(first.tabs.indexOf(first.activeTab), 0);
		assert.strictEqual(first.activeTab, first.tabs[0]);
		assert.strictEqual(extHostEditorTabs.tabGroups.activeTabGroup, first);
	});

	// TODO @lramos15 Change this test because now it only fires when id changes
	test.skip('onDidChangeActiveTabGroup fires properly', function () {
		const extHostEditorTabs = new ExtHostEditorTabs(
			SingleProxyRPCProtocol(new class extends mock<MainThreadEditorTabsShape>() {
				// override/implement $moveTab or $closeTab
			})
		);

		let count = 0;
		let activeTabGroupFromEvent: vscode.TabGroup | undefined = undefined;
		extHostEditorTabs.tabGroups.onDidChangeActiveTabGroup((tabGroup) => {
			count++;
			activeTabGroupFromEvent = tabGroup;
		});


		assert.strictEqual(extHostEditorTabs.tabGroups.groups.length, 0);
		assert.strictEqual(extHostEditorTabs.tabGroups.activeTabGroup, undefined);
		assert.strictEqual(count, 0);
		const tabModel = [{
			isActive: true,
			viewColumn: 0,
			groupId: 12,
			tabs: [],
			activeTab: undefined
		}];
		extHostEditorTabs.$acceptEditorTabModel(tabModel);
		assert.ok(extHostEditorTabs.tabGroups.activeTabGroup);
		let activeTabGroup: vscode.TabGroup = extHostEditorTabs.tabGroups.activeTabGroup;
		assert.strictEqual(count, 1);
		assert.strictEqual(activeTabGroup, activeTabGroupFromEvent);
		// Firing again with same model shouldn't cause a change
		extHostEditorTabs.$acceptEditorTabModel(tabModel);
		assert.strictEqual(count, 1);
		// Changing a property should fire a change
		tabModel[0].viewColumn = 1;
		extHostEditorTabs.$acceptEditorTabModel(tabModel);
		assert.strictEqual(count, 2);
		activeTabGroup = extHostEditorTabs.tabGroups.activeTabGroup;
		assert.strictEqual(activeTabGroup, activeTabGroupFromEvent);
		// Changing the active tab group should fire a change
		tabModel[0].isActive = false;
		tabModel.push({
			isActive: true,
			viewColumn: 0,
			groupId: 13,
			tabs: [],
			activeTab: undefined
		});
		extHostEditorTabs.$acceptEditorTabModel(tabModel);
		assert.strictEqual(count, 3);
		activeTabGroup = extHostEditorTabs.tabGroups.activeTabGroup;
		assert.strictEqual(activeTabGroup, activeTabGroupFromEvent);

		// Empty tab model should fire a change and return undefined
		extHostEditorTabs.$acceptEditorTabModel([]);
		assert.strictEqual(count, 4);
		activeTabGroup = extHostEditorTabs.tabGroups.activeTabGroup;
		assert.strictEqual(activeTabGroup, undefined);
		assert.strictEqual(activeTabGroup, activeTabGroupFromEvent);
	});

	test('Ensure reference stability', function () {

		const extHostEditorTabs = new ExtHostEditorTabs(
			SingleProxyRPCProtocol(new class extends mock<MainThreadEditorTabsShape>() {
				// override/implement $moveTab or $closeTab
			})
		);
		const tabDto = createTabDto();

		// single dirty tab

		extHostEditorTabs.$acceptEditorTabModel([{
			isActive: true,
			viewColumn: 0,
			groupId: 12,
			tabs: [tabDto]
		}]);
		let all = extHostEditorTabs.tabGroups.groups.map(group => group.tabs).flat();
		assert.strictEqual(all.length, 1);
		const apiTab1 = all[0];
		assert.ok(apiTab1.input instanceof TextTabInput);
		assert.strictEqual(tabDto.input.kind, TabInputKind.TextInput);
		const dtoResource = (tabDto.input as TextInputDto).uri;
		assert.strictEqual(apiTab1.input.uri.toString(), URI.revive(dtoResource).toString());
		assert.strictEqual(apiTab1.isDirty, true);


		// NOT DIRTY anymore

		const tabDto2: IEditorTabDto = { ...tabDto, isDirty: false };
		// Accept a simple update
		extHostEditorTabs.$acceptTabUpdate(12, tabDto2);

		all = extHostEditorTabs.tabGroups.groups.map(group => group.tabs).flat();
		assert.strictEqual(all.length, 1);
		const apiTab2 = all[0];
		assert.ok(apiTab1.input instanceof TextTabInput);
		assert.strictEqual(apiTab1.input.uri.toString(), URI.revive(dtoResource).toString());
		assert.strictEqual(apiTab2.isDirty, false);

		assert.strictEqual(apiTab1 === apiTab2, true);
	});

	test('Tab.isActive working', function () {

		const extHostEditorTabs = new ExtHostEditorTabs(
			SingleProxyRPCProtocol(new class extends mock<MainThreadEditorTabsShape>() {
				// override/implement $moveTab or $closeTab
			})
		);
		const tabDtoAAA = createTabDto({
			id: 'AAA',
			isActive: true,
			isDirty: true,
			isPinned: true,
			label: 'label1',
			input: { kind: TabInputKind.TextInput, uri: URI.parse('file://abc/AAA.txt') },
			editorId: 'default'
		});

		const tabDtoBBB = createTabDto({
			id: 'BBB',
			isActive: false,
			isDirty: true,
			isPinned: true,
			label: 'label1',
			input: { kind: TabInputKind.TextInput, uri: URI.parse('file://abc/BBB.txt') },
			editorId: 'default'
		});

		// single dirty tab

		extHostEditorTabs.$acceptEditorTabModel([{
			isActive: true,
			viewColumn: 0,
			groupId: 12,
			tabs: [tabDtoAAA, tabDtoBBB]
		}]);

		let all = extHostEditorTabs.tabGroups.groups.map(group => group.tabs).flat();
		assert.strictEqual(all.length, 2);

		const activeTab1 = extHostEditorTabs.tabGroups.activeTabGroup?.activeTab;
		assert.ok(activeTab1?.input instanceof TextTabInput);
		assert.strictEqual(tabDtoAAA.input.kind, TabInputKind.TextInput);
		const dtoAAAResource = (tabDtoAAA.input as TextInputDto).uri;
		assert.strictEqual(activeTab1?.input?.uri.toString(), URI.revive(dtoAAAResource)?.toString());
		assert.strictEqual(activeTab1?.isActive, true);

		extHostEditorTabs.$acceptTabUpdate(12, { ...tabDtoBBB, isActive: true }); /// BBB is now active

		const activeTab2 = extHostEditorTabs.tabGroups.activeTabGroup?.activeTab;
		assert.ok(activeTab2?.input instanceof TextTabInput);
		assert.strictEqual(tabDtoBBB.input.kind, TabInputKind.TextInput);
		const dtoBBBResource = (tabDtoBBB.input as TextInputDto).uri;
		assert.strictEqual(activeTab2?.input?.uri.toString(), URI.revive(dtoBBBResource)?.toString());
		assert.strictEqual(activeTab2?.isActive, true);
		assert.strictEqual(activeTab1?.isActive, false);
	});

	test('vscode.window.tagGroups is immutable', function () {

		const extHostEditorTabs = new ExtHostEditorTabs(
			SingleProxyRPCProtocol(new class extends mock<MainThreadEditorTabsShape>() {
				// override/implement $moveTab or $closeTab
			})
		);

		assert.throws(() => {
			// @ts-expect-error write to readonly prop
			extHostEditorTabs.tabGroups.activeTabGroup = undefined;
		});
		assert.throws(() => {
			// @ts-expect-error write to readonly prop
			extHostEditorTabs.tabGroups.groups.length = 0;
		});
		assert.throws(() => {
			// @ts-expect-error write to readonly prop
			extHostEditorTabs.tabGroups.onDidChangeActiveTabGroup = undefined;
		});
		assert.throws(() => {
			// @ts-expect-error write to readonly prop
			extHostEditorTabs.tabGroups.onDidChangeTabGroup = undefined;
		});
	});

	test('Ensure close is called with all tab ids', function () {
		let closedTabIds: string[][] = [];
		const extHostEditorTabs = new ExtHostEditorTabs(
			SingleProxyRPCProtocol(new class extends mock<MainThreadEditorTabsShape>() {
				// override/implement $moveTab or $closeTab
				override async $closeTab(tabIds: string[], preserveFocus?: boolean) {
					closedTabIds.push(tabIds);
				}
			})
		);
		const tab: IEditorTabDto = createTabDto({
			id: 'uniquestring',
			isActive: true,
			isDirty: true,
			isPinned: true,
			label: 'label1',
			editorId: 'default'
		});

		extHostEditorTabs.$acceptEditorTabModel([{
			isActive: true,
			viewColumn: 0,
			groupId: 12,
			tabs: [tab]
		}]);
		assert.strictEqual(extHostEditorTabs.tabGroups.groups.length, 1);
		const activeTab = extHostEditorTabs.tabGroups.activeTabGroup?.activeTab;
		assert.ok(activeTab);
		extHostEditorTabs.tabGroups.close(activeTab, false);
		assert.strictEqual(closedTabIds.length, 1);
		assert.deepStrictEqual(closedTabIds[0], ['uniquestring']);
		// Close with array
		extHostEditorTabs.tabGroups.close([activeTab], false);
		assert.strictEqual(closedTabIds.length, 2);
		assert.deepStrictEqual(closedTabIds[1], ['uniquestring']);
	});

	test('Update tab only sends tab change event', async function () {
		let closedTabIds: string[][] = [];
		const extHostEditorTabs = new ExtHostEditorTabs(
			SingleProxyRPCProtocol(new class extends mock<MainThreadEditorTabsShape>() {
				// override/implement $moveTab or $closeTab
				override async $closeTab(tabIds: string[], preserveFocus?: boolean) {
					closedTabIds.push(tabIds);
				}
			})
		);
		const tabDto: IEditorTabDto = createTabDto({
			id: 'uniquestring',
			isActive: true,
			isDirty: true,
			isPinned: true,
			label: 'label1',
			editorId: 'default'
		});

		extHostEditorTabs.$acceptEditorTabModel([{
			isActive: true,
			viewColumn: 0,
			groupId: 12,
			tabs: [tabDto]
		}]);

		assert.strictEqual(extHostEditorTabs.tabGroups.groups.length, 1);
		assert.strictEqual(extHostEditorTabs.tabGroups.groups.map(g => g.tabs).flat().length, 1);

		const tab = extHostEditorTabs.tabGroups.groups[0].tabs[0];

		const p = new Promise<vscode.Tab>(resolve => extHostEditorTabs.tabGroups.onDidChangeTab(resolve));

		extHostEditorTabs.$acceptTabUpdate(12, { ...tabDto, label: 'NEW LABEL' });

		const changedTab = await p;

		assert.ok(tab === changedTab);
		assert.strictEqual(changedTab.label, 'NEW LABEL');

	});

	test('Active tab', function () {

		const extHostEditorTabs = new ExtHostEditorTabs(
			SingleProxyRPCProtocol(new class extends mock<MainThreadEditorTabsShape>() {
				// override/implement $moveTab or $closeTab
			})
		);

		const tab1: IEditorTabDto = createTabDto({
			id: 'uniquestring',
			isActive: true,
			isDirty: true,
			isPinned: true,
			label: 'label1',
		});

		const tab2: IEditorTabDto = createTabDto({
			isActive: false,
			id: 'uniquestring2',
		});

		const tab3: IEditorTabDto = createTabDto({
			isActive: false,
			id: 'uniquestring3',
		});

		extHostEditorTabs.$acceptEditorTabModel([{
			isActive: true,
			viewColumn: 0,
			groupId: 12,
			tabs: [tab1, tab2, tab3]
		}]);

		assert.strictEqual(extHostEditorTabs.tabGroups.groups.length, 1);
		assert.strictEqual(extHostEditorTabs.tabGroups.groups.map(g => g.tabs).flat().length, 3);

		// Active tab is correct
		assert.strictEqual(extHostEditorTabs.tabGroups.activeTabGroup?.activeTab, extHostEditorTabs.tabGroups.activeTabGroup?.tabs[0]);

		// Switching active tab works
		tab1.isActive = false;
		tab2.isActive = true;
		extHostEditorTabs.$acceptTabUpdate(12, tab1);
		extHostEditorTabs.$acceptTabUpdate(12, tab2);
		assert.strictEqual(extHostEditorTabs.tabGroups.activeTabGroup?.activeTab, extHostEditorTabs.tabGroups.activeTabGroup?.tabs[1]);

		//Closing tabs out works
		tab3.isActive = true;
		extHostEditorTabs.$acceptEditorTabModel([{
			isActive: true,
			viewColumn: 0,
			groupId: 12,
			tabs: [tab3]
		}]);
		assert.strictEqual(extHostEditorTabs.tabGroups.groups.length, 1);
		assert.strictEqual(extHostEditorTabs.tabGroups.groups.map(g => g.tabs).flat().length, 1);
		assert.strictEqual(extHostEditorTabs.tabGroups.activeTabGroup?.activeTab, extHostEditorTabs.tabGroups.activeTabGroup?.tabs[0]);

		// Closing out all tabs returns undefine active tab
		extHostEditorTabs.$acceptEditorTabModel([{
			isActive: true,
			viewColumn: 0,
			groupId: 12,
			tabs: []
		}]);
		assert.strictEqual(extHostEditorTabs.tabGroups.groups.length, 1);
		assert.strictEqual(extHostEditorTabs.tabGroups.groups.map(g => g.tabs).flat().length, 0);
		assert.strictEqual(extHostEditorTabs.tabGroups.activeTabGroup?.activeTab, undefined);
	});
});
