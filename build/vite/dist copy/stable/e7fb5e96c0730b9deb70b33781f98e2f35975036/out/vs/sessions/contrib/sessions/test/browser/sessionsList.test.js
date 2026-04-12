/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { Codicon } from '../../../../../base/common/codicons.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { groupByWorkspace, sortSessions, SessionsSorting } from '../../browser/views/sessionsList.js';
function createSession(id, opts) {
    const createdAt = opts.createdAt ?? new Date();
    const updatedAt = opts.updatedAt ?? createdAt;
    return {
        sessionId: id,
        resource: URI.parse(`session://${id}`),
        providerId: 'test',
        sessionType: 'test',
        icon: Codicon.account,
        createdAt,
        workspace: observableValue(`workspace-${id}`, opts.workspaceLabel !== undefined ? {
            label: opts.workspaceLabel,
            icon: Codicon.folder,
            repositories: [],
            requiresWorkspaceTrust: false,
        } : undefined),
        title: observableValue(`title-${id}`, id),
        updatedAt: observableValue(`updatedAt-${id}`, updatedAt),
        status: observableValue(`status-${id}`, 3 /* SessionStatus.Completed */),
        changes: observableValue(`changes-${id}`, []),
        modelId: observableValue(`modelId-${id}`, undefined),
        mode: observableValue(`mode-${id}`, undefined),
        loading: observableValue(`loading-${id}`, false),
        isArchived: observableValue(`isArchived-${id}`, opts.isArchived ?? false),
        isRead: observableValue(`isRead-${id}`, true),
        description: observableValue(`description-${id}`, undefined),
        lastTurnEnd: observableValue(`lastTurnEnd-${id}`, undefined),
        gitHubInfo: observableValue(`gitHubInfo-${id}`, undefined),
        chats: observableValue(`chats-${id}`, []),
        mainChat: undefined,
    };
}
suite('Sessions - SessionsList Helpers', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    suite('groupByWorkspace', () => {
        test('groups are sorted alphabetically regardless of insertion order', () => {
            const sessions = [
                createSession('1', { workspaceLabel: 'Zebra' }),
                createSession('2', { workspaceLabel: 'Apple' }),
                createSession('3', { workspaceLabel: 'Mango' }),
            ];
            const groups = groupByWorkspace(sessions);
            assert.deepStrictEqual(groups.map(g => g.label), ['Apple', 'Mango', 'Zebra']);
        });
        test('sessions without workspace are grouped under "Unknown"', () => {
            const sessions = [
                createSession('1', { workspaceLabel: 'Beta' }),
                createSession('2', {}),
                createSession('3', { workspaceLabel: 'Alpha' }),
            ];
            const groups = groupByWorkspace(sessions);
            assert.deepStrictEqual(groups.map(g => g.label), ['Alpha', 'Beta', 'Unknown']);
        });
        test('multiple sessions in same workspace are grouped together', () => {
            const sessions = [
                createSession('1', { workspaceLabel: 'Repo-B' }),
                createSession('2', { workspaceLabel: 'Repo-A' }),
                createSession('3', { workspaceLabel: 'Repo-B' }),
            ];
            const groups = groupByWorkspace(sessions);
            assert.deepStrictEqual(groups.map(g => g.label), ['Repo-A', 'Repo-B']);
            assert.strictEqual(groups[0].sessions.length, 1);
            assert.strictEqual(groups[1].sessions.length, 2);
        });
        test('"No Workspace" appears after workspaces that sort alphabetically later', () => {
            const sessions = [
                createSession('1', {}),
                createSession('2', { workspaceLabel: 'Zulu' }),
                createSession('3', { workspaceLabel: 'Alpha' }),
            ];
            const groups = groupByWorkspace(sessions);
            assert.deepStrictEqual(groups.map(g => g.label), ['Alpha', 'Zulu', 'Unknown']);
        });
        test('empty workspace label is treated as "Unknown"', () => {
            const sessions = [
                createSession('1', { workspaceLabel: 'Zulu' }),
                createSession('2', { workspaceLabel: '' }),
            ];
            const groups = groupByWorkspace(sessions);
            assert.deepStrictEqual(groups.map(g => g.label), ['Zulu', 'Unknown']);
            assert.strictEqual(groups[1].sessions.length, 1);
        });
        test('group ids are prefixed with workspace:', () => {
            const sessions = [
                createSession('1', { workspaceLabel: 'MyProject' }),
            ];
            const groups = groupByWorkspace(sessions);
            assert.strictEqual(groups[0].id, 'workspace:MyProject');
        });
    });
    suite('sortSessions', () => {
        test('sorts by createdAt descending when sorting is Created', () => {
            const sessions = [
                createSession('old', { createdAt: new Date('2024-01-01') }),
                createSession('new', { createdAt: new Date('2024-06-01') }),
                createSession('mid', { createdAt: new Date('2024-03-01') }),
            ];
            const sorted = sortSessions(sessions, SessionsSorting.Created);
            assert.deepStrictEqual(sorted.map(s => s.sessionId), ['new', 'mid', 'old']);
        });
        test('sorts by updatedAt descending when sorting is Updated', () => {
            const sessions = [
                createSession('a', { createdAt: new Date('2024-06-01'), updatedAt: new Date('2024-07-01') }),
                createSession('b', { createdAt: new Date('2024-01-01'), updatedAt: new Date('2024-09-01') }),
                createSession('c', { createdAt: new Date('2024-03-01'), updatedAt: new Date('2024-08-01') }),
            ];
            const sorted = sortSessions(sessions, SessionsSorting.Updated);
            assert.deepStrictEqual(sorted.map(s => s.sessionId), ['b', 'c', 'a']);
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2Vzc2lvbnNMaXN0LnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9zZXNzaW9ucy9jb250cmliL3Nlc3Npb25zL3Rlc3QvYnJvd3Nlci9zZXNzaW9uc0xpc3QudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ2pFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUMzRSxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDeEQsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFFbkcsT0FBTyxFQUFFLGdCQUFnQixFQUFFLFlBQVksRUFBRSxlQUFlLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUV0RyxTQUFTLGFBQWEsQ0FBQyxFQUFVLEVBQUUsSUFLbEM7SUFDQSxNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsU0FBUyxJQUFJLElBQUksSUFBSSxFQUFFLENBQUM7SUFDL0MsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLFNBQVMsSUFBSSxTQUFTLENBQUM7SUFDOUMsT0FBTztRQUNOLFNBQVMsRUFBRSxFQUFFO1FBQ2IsUUFBUSxFQUFFLEdBQUcsQ0FBQyxLQUFLLENBQUMsYUFBYSxFQUFFLEVBQUUsQ0FBQztRQUN0QyxVQUFVLEVBQUUsTUFBTTtRQUNsQixXQUFXLEVBQUUsTUFBTTtRQUNuQixJQUFJLEVBQUUsT0FBTyxDQUFDLE9BQU87UUFDckIsU0FBUztRQUNULFNBQVMsRUFBRSxlQUFlLENBQUMsYUFBYSxFQUFFLEVBQUUsRUFBRSxJQUFJLENBQUMsY0FBYyxLQUFLLFNBQVMsQ0FBQyxDQUFDLENBQUM7WUFDakYsS0FBSyxFQUFF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