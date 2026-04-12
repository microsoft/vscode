/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ExtHostEditorTabs } from '../../common/extHostEditorTabs.js';
import { SingleProxyRPCProtocol } from '../common/testRPCProtocol.js';
import { TextMergeTabInput, TextTabInput } from '../../common/extHostTypes.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
suite('ExtHostEditorTabs', function () {
    const defaultTabDto = {
        id: 'uniquestring',
        input: { kind: 1 /* TabInputKind.TextInput */, uri: URI.parse('file://abc/def.txt') },
        isActive: true,
        isDirty: true,
        isPinned: true,
        isPreview: false,
        label: 'label1',
    };
    function createTabDto(dto) {
        return { ...defaultTabDto, ...dto };
    }
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    test('Ensure empty model throws when accessing active group', function () {
        const extHostEditorTabs = new ExtHostEditorTabs(SingleProxyRPCProtocol(new class extends mock() {
        }));
        assert.strictEqual(extHostEditorTabs.tabGroups.all.length, 0);
        // Active group should never be undefined (there is always an active group). Ensure accessing it undefined throws.
        // TODO @lramos15 Add a throw on the main side when a model is sent without an active group
        assert.throws(() => extHostEditorTabs.tabGroups.activeTabGroup);
    });
    test('single tab', function () {
        const extHostEditorTabs = new ExtHostEditorTabs(SingleProxyRPCProtocol(new class extends mock() {
        }));
        const tab = createTabDto({
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
        assert.strictEqual(extHostEditorTabs.tabGroups.all.length, 1);
        const [first] = extHostEditorTabs.tabGroups.all;
        assert.ok(first.activeTab);
        assert.strictEqual(first.tabs.indexOf(first.activeTab), 0);
        {
            extHostEditorTabs.$acceptEditorTabModel([{
                    isActive: true,
                    viewColumn: 0,
                    groupId: 12,
                    tabs: [tab]
                }]);
            assert.strictEqual(extHostEditorTabs.tabGroups.all.length, 1);
            const [first] = extHostEditorTabs.tabGroups.all;
            assert.ok(first.activeTab);
            assert.strictEqual(first.tabs.indexOf(first.activeTab), 0);
        }
    });
    test('Empty tab group', function () {
        const extHostEditorTabs = new ExtHostEditorTabs(SingleProxyRPCProtocol(new class extends mock() {
        }));
        extHostEditorTabs.$acceptEditorTabModel([{
                isActive: true,
                viewColumn: 0,
                groupId: 12,
                tabs: []
            }]);
        assert.strictEqual(extHostEditorTabs.tabGroups.all.length, 1);
        const [first] = extHostEditorTabs.tabGroups.all;
        assert.strictEqual(first.activeTab, undefined);
        assert.strictEqual(first.tabs.length, 0);
    });
    test('Ensure tabGroup change events fires', function () {
        const extHostEditorTabs = new ExtHostEditorTabs(SingleProxyRPCProtocol(new class extends mock() {
        }));
        let count = 0;
        store.add(extHostEditorTabs.tabGroups.onDidChangeTabGroups(() => count++));
        assert.strictEqual(count, 0);
        extHostEditorTabs.$acceptEditorTabModel([{
                isActive: true,
                viewColumn: 0,
                groupId: 12,
                tabs: []
            }]);
        assert.ok(extHostEditorTabs.tabGroups.activeTabGroup);
        const activeTabGroup = extHostEditorTabs.tabGroups.activeTabGroup;
        assert.strictEqual(extHostEditorTabs.tabGroups.all.length, 1);
        assert.strictEqual(activeTabGroup.tabs.length, 0);
        assert.strictEqual(count, 1);
    });
    test('Check TabGroupChangeEvent properties', function () {
        const extHostEditorTabs = new ExtHostEditorTabs(SingleProxyRPCProtocol(new class extends mock() {
        }));
        const group1Data = {
            isActive: true,
            viewColumn: 0,
            groupId: 12,
            tabs: []
        };
        const group2Data = { ...group1Data, groupId: 13 };
        const events = [];
        store.add(extHostEditorTabs.tabGroups.onDidChangeTabGroups(e => events.push(e)));
        // OPEN
        extHostEditorTabs.$acceptEditorTabModel([group1Data]);
        assert.deepStrictEqual(events, [{
                changed: [],
                closed: [],
                opened: [extHostEditorTabs.tabGroups.activeTabGroup]
            }]);
        // OPEN, CHANGE
        events.length = 0;
        extHostEditorTabs.$acceptEditorTabModel([{ ...group1Data, isActive: false }, group2Data]);
        assert.deepStrictEqual(events, [{
                changed: [extHostEditorTabs.tabGroups.all[0]],
                closed: [],
                opened: [extHostEditorTabs.tabGroups.all[1]]
            }]);
        // CHANGE
        events.length = 0;
        extHostEditorTabs.$acceptEditorTabModel([group1Data, { ...group2Data, isActive: false }]);
        assert.deepStrictEqual(events, [{
                changed: extHostEditorTabs.tabGroups.all,
                closed: [],
                opened: []
            }]);
        // CLOSE, CHANGE
        events.length = 0;
        const oldActiveGroup = extHostEditorTabs.tabGroups.activeTabGroup;
        extHostEditorTabs.$acceptEditorTabModel([group2Data]);
        assert.deepStrictEqual(events, [{
                changed: extHostEditorTabs.tabGroups.all,
                closed: [oldActiveGroup],
                opened: []
            }]);
    });
    test('Ensure reference equality for activeTab and activeGroup', function () {
        const extHostEditorTabs = new ExtHostEditorTabs(SingleProxyRPCProtocol(new class extends mock() {
        }));
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
        assert.strictEqual(extHostEditorTabs.tabGroups.all.length, 1);
        const [first] = extHostEditorTabs.tabGroups.all;
        assert.ok(first.activeTab);
        assert.strictEqual(first.tabs.indexOf(first.activeTab), 0);
        assert.strictEqual(first.activeTab, first.tabs[0]);
        assert.strictEqual(extHostEditorTabs.tabGroups.activeTabGroup, first);
    });
    test('TextMergeTabInput surfaces in the UI', function () {
        const extHostEditorTabs = new ExtHostEditorTabs(SingleProxyRPCProtocol(new class extends mock() {
        }));
        const tab = createTabDto({
            input: {
                kind: 3 /* TabInputKind.TextMergeInput */,
                base: URI.from({ scheme: 'test', path: 'base' }),
                input1: URI.from({ scheme: 'test', path: 'input1' }),
                input2: URI.from({ scheme: 'test', path: 'input2' }),
                result: URI.from({ scheme: 'test', path: 'result' }),
            }
        });
        extHostEditorTabs.$acceptEditorTabModel([{
                isActive: true,
                viewColumn: 0,
                groupId: 12,
                tabs: [tab]
            }]);
        assert.strictEqual(extHostEditorTabs.tabGroups.all.length, 1);
        const [first] = extHostEditorTabs.tabGroups.all;
        assert.ok(first.activeTab);
        assert.strictEqual(first.tabs.indexOf(first.activeTab), 0);
        assert.ok(first.activeTab.input instanceof TextMergeTabInput);
    });
    test('Ensure reference stability', function () {
        const extHostEditorTabs = new ExtHostEditorTabs(SingleProxyRPCProtocol(new class extends mock() {
        }));
        const tabDto = createTabDto();
        // single dirty tab
        extHostEditorTabs.$acceptEditorTabModel([{
                isActive: true,
                viewColumn: 0,
                groupId: 12,
                tabs: [tabDto]
            }]);
        let all = extHostEditorTabs.tabGroups.all.map(group => group.tabs).flat();
        assert.strictEqual(all.length, 1);
        const apiTab1 = all[0];
        assert.ok(apiTab1.input instanceof TextTabInput);
        assert.strictEqual(tabDto.input.kind, 1 /* TabInputKind.TextInput */);
        const dtoResource = tabDto.input.uri;
        assert.strictEqual(apiTab1.input.uri.toString(), URI.revive(dtoResource).toString());
        assert.strictEqual(apiTab1.isDirty, true);
        // NOT DIRTY anymore
        const tabDto2 = { ...tabDto, isDirty: false };
        // Accept a simple update
        extHostEditorTabs.$acceptTabOperation({
            kind: 2 /* TabModelOperationKind.TAB_UPDATE */,
            index: 0,
            tabDto: tabDto2,
            groupId: 12
        });
        all = extHostEditorTabs.tabGroups.all.map(group => group.tabs).flat();
        assert.strictEqual(all.length, 1);
        const apiTab2 = all[0];
        assert.ok(apiTab1.input instanceof TextTabInput);
        assert.strictEqual(apiTab1.input.uri.toString(), URI.revive(dtoResource).toString());
        assert.strictEqual(apiTab2.isDirty, false);
        assert.strictEqual(apiTab1 === apiTab2, true);
    });
    test('Tab.isActive working', function () {
        const extHostEditorTabs = new ExtHostEditorTabs(SingleProxyRPCProtocol(new class extends mock() {
        }));
        const tabDtoAAA = createTabDto({
            id: 'AAA',
            isActive: true,
            isDirty: true,
            isPinned: true,
            label: 'label1',
            input: { kind: 1 /* TabInputKind.TextInput */, uri: URI.parse('file://abc/AAA.txt') },
            editorId: 'default'
        });
        const tabDtoBBB = createTabDto({
            id: 'BBB',
            isActive: false,
            isDirty: true,
            isPinned: true,
            label: 'label1',
            input: { kind: 1 /* TabInputKind.TextInput */, uri: URI.parse('file://abc/BBB.txt') },
            editorId: 'default'
        });
        // single dirty tab
        extHostEditorTabs.$acceptEditorTabModel([{
                isActive: true,
                viewColumn: 0,
                groupId: 12,
                tabs: [tabDtoAAA, tabDtoBBB]
            }]);
        const all = extHostEditorTabs.tabGroups.all.map(group => group.tabs).flat();
        assert.strictEqual(all.length, 2);
        const activeTab1 = extHostEditorTabs.tabGroups.activeTabGroup?.activeTab;
        assert.ok(activeTab1?.input instanceof TextTabInput);
        assert.strictEqual(tabDtoAAA.input.kind, 1 /* TabInputKind.TextInput */);
        const dtoAAAResource = tabDtoAAA.input.uri;
        assert.strictEqual(activeTab1?.input?.uri.toString(), URI.revive(dtoAAAResource)?.toString());
        assert.strictEqual(activeTab1?.isActive, true);
        extHostEditorTabs.$acceptTabOperation({
            groupId: 12,
            index: 1,
            kind: 2 /* TabModelOperationKind.TAB_UPDATE */,
            tabDto: { ...tabDtoBBB, isActive: true } /// BBB is now active
        });
        const activeTab2 = extHostEditorTabs.tabGroups.activeTabGroup?.activeTab;
        assert.ok(activeTab2?.input instanceof TextTabInput);
        assert.strictEqual(tabDtoBBB.input.kind, 1 /* TabInputKind.TextInput */);
        const dtoBBBResource = tabDtoBBB.input.uri;
        assert.strictEqual(activeTab2?.input?.uri.toString(), URI.revive(dtoBBBResource)?.toString());
        assert.strictEqual(activeTab2?.isActive, true);
        assert.strictEqual(activeTab1?.isActive, false);
    });
    test('vscode.window.tagGroups is immutable', function () {
        const extHostEditorTabs = new ExtHostEditorTabs(SingleProxyRPCProtocol(new class extends mock() {
        }));
        assert.throws(() => {
            // @ts-expect-error write to readonly prop
            extHostEditorTabs.tabGroups.activeTabGroup = undefined;
        });
        assert.throws(() => {
            // @ts-expect-error write to readonly prop
            extHostEditorTabs.tabGroups.all.length = 0;
        });
        assert.throws(() => {
            // @ts-expect-error write to readonly prop
            extHostEditorTabs.tabGroups.onDidChangeActiveTabGroup = undefined;
        });
        assert.throws(() => {
            // @ts-expect-error write to readonly prop
            extHostEditorTabs.tabGroups.onDidChangeTabGroups = undefined;
        });
    });
    test('Ensure close is called with all tab ids', function () {
        const closedTabIds = [];
        const extHostEditorTabs = new ExtHostEditorTabs(SingleProxyRPCProtocol(new class extends mock() {
            // override/implement $moveTab or $closeTab
            async $closeTab(tabIds, preserveFocus) {
                closedTabIds.push(tabIds);
                return true;
            }
        }));
        const tab = createTabDto({
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
        assert.strictEqual(extHostEditorTabs.tabGroups.all.length, 1);
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
        const closedTabIds = [];
        const extHostEditorTabs = new ExtHostEditorTabs(SingleProxyRPCProtocol(new class extends mock() {
            // override/implement $moveTab or $closeTab
            async $closeTab(tabIds, preserveFocus) {
                closedTabIds.push(tabIds);
                return true;
            }
        }));
        const tabDto = createTabDto({
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
        assert.strictEqual(extHostEditorTabs.tabGroups.all.length, 1);
        assert.strictEqual(extHostEditorTabs.tabGroups.all.map(g => g.tabs).flat().length, 1);
        const tab = extHostEditorTabs.tabGroups.all[0].tabs[0];
        const p = new Promise(resolve => store.add(extHostEditorTabs.tabGroups.onDidChangeTabs(resolve)));
        extHostEditorTabs.$acceptTabOperation({
            groupId: 12,
            index: 0,
            kind: 2 /* TabModelOperationKind.TAB_UPDATE */,
            tabDto: { ...tabDto, label: 'NEW LABEL' }
        });
        const changedTab = (await p).changed[0];
        assert.ok(tab === changedTab);
        assert.strictEqual(changedTab.label, 'NEW LABEL');
    });
    test('Active tab', function () {
        const extHostEditorTabs = new ExtHostEditorTabs(SingleProxyRPCProtocol(new class extends mock() {
        }));
        const tab1 = createTabDto({
            id: 'uniquestring',
            isActive: true,
            isDirty: true,
            isPinned: true,
            label: 'label1',
        });
        const tab2 = createTabDto({
            isActive: false,
            id: 'uniquestring2',
        });
        const tab3 = createTabDto({
            isActive: false,
            id: 'uniquestring3',
        });
        extHostEditorTabs.$acceptEditorTabModel([{
                isActive: true,
                viewColumn: 0,
                groupId: 12,
                tabs: [tab1, tab2, tab3]
            }]);
        assert.strictEqual(extHostEditorTabs.tabGroups.all.length, 1);
        assert.strictEqual(extHostEditorTabs.tabGroups.all.map(g => g.tabs).flat().length, 3);
        // Active tab is correct
        assert.strictEqual(extHostEditorTabs.tabGroups.activeTabGroup?.activeTab, extHostEditorTabs.tabGroups.activeTabGroup?.tabs[0]);
        // Switching active tab works
        tab1.isActive = false;
        tab2.isActive = true;
        extHostEditorTabs.$acceptTabOperation({
            groupId: 12,
            index: 0,
            kind: 2 /* TabModelOperationKind.TAB_UPDATE */,
            tabDto: tab1
        });
        extHostEditorTabs.$acceptTabOperation({
            groupId: 12,
            index: 1,
            kind: 2 /* TabModelOperationKind.TAB_UPDATE */,
            tabDto: tab2
        });
        assert.strictEqual(extHostEditorTabs.tabGroups.activeTabGroup?.activeTab, extHostEditorTabs.tabGroups.activeTabGroup?.tabs[1]);
        //Closing tabs out works
        tab3.isActive = true;
        extHostEditorTabs.$acceptEditorTabModel([{
                isActive: true,
                viewColumn: 0,
                groupId: 12,
                tabs: [tab3]
            }]);
        assert.strictEqual(extHostEditorTabs.tabGroups.all.length, 1);
        assert.strictEqual(extHostEditorTabs.tabGroups.all.map(g => g.tabs).flat().length, 1);
        assert.strictEqual(extHostEditorTabs.tabGroups.activeTabGroup?.activeTab, extHostEditorTabs.tabGroups.activeTabGroup?.tabs[0]);
        // Closing out all tabs returns undefine active tab
        extHostEditorTabs.$acceptEditorTabModel([{
                isActive: true,
                viewColumn: 0,
                groupId: 12,
                tabs: []
            }]);
        assert.strictEqual(extHostEditorTabs.tabGroups.all.length, 1);
        assert.strictEqual(extHostEditorTabs.tabGroups.all.map(g => g.tabs).flat().length, 0);
        assert.strictEqual(extHostEditorTabs.tabGroups.activeTabGroup?.activeTab, undefined);
    });
    test('Tab operations patches open and close correctly', function () {
        const extHostEditorTabs = new ExtHostEditorTabs(SingleProxyRPCProtocol(new class extends mock() {
        }));
        const tab1 = createTabDto({
            id: 'uniquestring',
            isActive: true,
            label: 'label1',
        });
        const tab2 = createTabDto({
            isActive: false,
            id: 'uniquestring2',
            label: 'label2',
        });
        const tab3 = createTabDto({
            isActive: false,
            id: 'uniquestring3',
            label: 'label3',
        });
        extHostEditorTabs.$acceptEditorTabModel([{
                isActive: true,
                viewColumn: 0,
                groupId: 12,
                tabs: [tab1, tab2, tab3]
            }]);
        assert.strictEqual(extHostEditorTabs.tabGroups.all.length, 1);
        assert.strictEqual(extHostEditorTabs.tabGroups.all.map(g => g.tabs).flat().length, 3);
        // Close tab 2
        extHostEditorTabs.$acceptTabOperation({
            groupId: 12,
            index: 1,
            kind: 1 /* TabModelOperationKind.TAB_CLOSE */,
            tabDto: tab2
        });
        assert.strictEqual(extHostEditorTabs.tabGroups.all.length, 1);
        assert.strictEqual(extHostEditorTabs.tabGroups.all.map(g => g.tabs).flat().length, 2);
        // Close active tab and update tab 3 to be active
        extHostEditorTabs.$acceptTabOperation({
            groupId: 12,
            index: 0,
            kind: 1 /* TabModelOperationKind.TAB_CLOSE */,
            tabDto: tab1
        });
        assert.strictEqual(extHostEditorTabs.tabGroups.all.length, 1);
        assert.strictEqual(extHostEditorTabs.tabGroups.all.map(g => g.tabs).flat().length, 1);
        tab3.isActive = true;
        extHostEditorTabs.$acceptTabOperation({
            groupId: 12,
            index: 0,
            kind: 2 /* TabModelOperationKind.TAB_UPDATE */,
            tabDto: tab3
        });
        assert.strictEqual(extHostEditorTabs.tabGroups.all.length, 1);
        assert.strictEqual(extHostEditorTabs.tabGroups.all.map(g => g.tabs).flat().length, 1);
        assert.strictEqual(extHostEditorTabs.tabGroups.all[0]?.activeTab?.label, 'label3');
        // Open tab 2 back
        extHostEditorTabs.$acceptTabOperation({
            groupId: 12,
            index: 1,
            kind: 0 /* TabModelOperationKind.TAB_OPEN */,
            tabDto: tab2
        });
        assert.strictEqual(extHostEditorTabs.tabGroups.all.length, 1);
        assert.strictEqual(extHostEditorTabs.tabGroups.all.map(g => g.tabs).flat().length, 2);
        assert.strictEqual(extHostEditorTabs.tabGroups.all[0]?.tabs[1]?.label, 'label2');
    });
    test('Tab operations patches move correctly', function () {
        const extHostEditorTabs = new ExtHostEditorTabs(SingleProxyRPCProtocol(new class extends mock() {
        }));
        const tab1 = createTabDto({
            id: 'uniquestring',
            isActive: true,
            label: 'label1',
        });
        const tab2 = createTabDto({
            isActive: false,
            id: 'uniquestring2',
            label: 'label2',
        });
        const tab3 = createTabDto({
            isActive: false,
            id: 'uniquestring3',
            label: 'label3',
        });
        extHostEditorTabs.$acceptEditorTabModel([{
                isActive: true,
                viewColumn: 0,
                groupId: 12,
                tabs: [tab1, tab2, tab3]
            }]);
        assert.strictEqual(extHostEditorTabs.tabGroups.all.length, 1);
        assert.strictEqual(extHostEditorTabs.tabGroups.all.map(g => g.tabs).flat().length, 3);
        // Move tab 2 to index 0
        extHostEditorTabs.$acceptTabOperation({
            groupId: 12,
            index: 0,
            oldIndex: 1,
            kind: 3 /* TabModelOperationKind.TAB_MOVE */,
            tabDto: tab2
        });
        assert.strictEqual(extHostEditorTabs.tabGroups.all.length, 1);
        assert.strictEqual(extHostEditorTabs.tabGroups.all.map(g => g.tabs).flat().length, 3);
        assert.strictEqual(extHostEditorTabs.tabGroups.all[0]?.tabs[0]?.label, 'label2');
        // Move tab 3 to index 1
        extHostEditorTabs.$acceptTabOperation({
            groupId: 12,
            index: 1,
            oldIndex: 2,
            kind: 3 /* TabModelOperationKind.TAB_MOVE */,
            tabDto: tab3
        });
        assert.strictEqual(extHostEditorTabs.tabGroups.all.length, 1);
        assert.strictEqual(extHostEditorTabs.tabGroups.all.map(g => g.tabs).flat().length, 3);
        assert.strictEqual(extHostEditorTabs.tabGroups.all[0]?.tabs[1]?.label, 'label3');
        assert.strictEqual(extHostEditorTabs.tabGroups.all[0]?.tabs[0]?.label, 'label2');
        assert.strictEqual(extHostEditorTabs.tabGroups.all[0]?.tabs[2]?.label, 'label1');
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0SG9zdEVkaXRvclRhYnMudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9hcGkvdGVzdC9icm93c2VyL2V4dEhvc3RFZGl0b3JUYWJzLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFHaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUNyRCxPQUFPLEVBQUUsSUFBSSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFFNUQsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDdEUsT0FBTyxFQUFFLHNCQUFzQixFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFDdEUsT0FBTyxFQUFFLGlCQUFpQixFQUFFLFlBQVksRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBQy9FLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBRWhHLEtBQUssQ0FBQyxtQkFBbUIsRUFBRTtJQUUxQixNQUFNLGFBQWEsR0FBa0I7UUFDcEMsRUFBRSxFQUFFLGNBQWM7UUFDbEIsS0FBSyxFQUFFLEVBQUUsSUFBSSxnQ0FBd0IsRUFBRSxHQUFHLEVBQUUsR0FBRyxDQUFDLEtBQUssQ0FBQyxvQkFBb0IsQ0FBQyxFQUFFO1FBQzdFLFFBQVEsRUFBRSxJQUFJO1FBQ2QsT0FBTyxFQUFFLElBQUk7UUFDYixRQUFRLEVBQUUsSUFBSTtRQUNkLFNBQVMsRUFBRSxLQUFLO1FBQ2hCLEtBQUssRUFBRSxRQUFRO0tBQ2YsQ0FBQztJQUVGLFNBQVMsWUFBWSxDQUFDLEdBQTRCO1FBQ2pELE9BQU8sRUFBRSxHQUFHLGFBQWEsRUFBRSxHQUFHLEdBQUcsRUFBRSxDQUFDO0lBQ3JDLENBQUM7SUFFRCxNQUFNLEtBQUssR0FBRyx1Q0FBdUMs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