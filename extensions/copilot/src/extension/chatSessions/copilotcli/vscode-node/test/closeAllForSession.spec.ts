/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TestLogService } from '../../../../../platform/testing/common/testLogService';

vi.mock('vscode', () => ({
	Uri: {
		file: (path: string) => ({ fsPath: path, scheme: 'file' }),
	},
	window: {
		tabGroups: {
			activeTabGroup: {
				activeTab: null,
			},
			all: [],
			onDidChangeTabGroups: () => ({ dispose: () => { } }),
			onDidChangeTabs: () => ({ dispose: () => { } }),
		},
	},
	commands: {
		executeCommand: vi.fn().mockResolvedValue(undefined),
	},
	TabInputTextDiff: class TabInputTextDiff {
		constructor(public original: any, public modified: any) { }
	},
}));

import {
	DiffStateManager,
	type ActiveDiff,
} from '../diffState';

describe('DiffStateManager.closeAllForSession', () => {
	const logger = new TestLogService();
	let diffState: DiffStateManager;

	const createMockDiff = (tabName: string, sessionId?: string, diffIdSuffix?: string): ActiveDiff => ({
		diffId: `/tmp/modified-${diffIdSuffix ?? tabName}.ts`,
		sessionId,
		tabName: tabName,
		originalUri: { fsPath: `/path/to/original-${tabName}.ts`, scheme: 'file' } as any,
		modifiedUri: { fsPath: `/tmp/modified-${diffIdSuffix ?? tabName}.ts`, scheme: 'file' } as any,
		newContents: `// new contents for ${tabName}`,
		cleanup: vi.fn(),
		resolve: vi.fn(),
	});

	beforeEach(() => {
		diffState = new DiffStateManager(logger);
	});

	it('should close all diffs for a given session', () => {
		const diff1 = createMockDiff('Diff A', 'session-1', 'a');
		const diff2 = createMockDiff('Diff B', 'session-1', 'b');
		diffState.register(diff1);
		diffState.register(diff2);

		diffState.closeAllForSession('session-1');

		expect(diff1.resolve).toHaveBeenCalledWith({ status: 'REJECTED', trigger: 'client_disconnected' });
		expect(diff2.resolve).toHaveBeenCalledWith({ status: 'REJECTED', trigger: 'client_disconnected' });
	});

	it('should not close diffs belonging to other sessions', () => {
		const diff1 = createMockDiff('Diff A', 'session-1', 'a');
		const diff2 = createMockDiff('Diff B', 'session-2', 'b');
		diffState.register(diff1);
		diffState.register(diff2);

		diffState.closeAllForSession('session-1');

		expect(diff1.resolve).toHaveBeenCalledWith({ status: 'REJECTED', trigger: 'client_disconnected' });
		expect(diff2.resolve).not.toHaveBeenCalled();
	});

	it('should not close diffs with no session id', () => {
		const diff = createMockDiff('Diff A', undefined, 'a');
		diffState.register(diff);

		diffState.closeAllForSession('session-1');

		expect(diff.resolve).not.toHaveBeenCalled();
	});

	it('should be a no-op for an unknown session id', () => {
		const diff = createMockDiff('Diff A', 'session-1', 'a');
		diffState.register(diff);

		diffState.closeAllForSession('unknown-session');

		expect(diff.resolve).not.toHaveBeenCalled();
	});

	it('should handle an empty diff map', () => {
		expect(() => diffState.closeAllForSession('session-1')).not.toThrow();
	});
});
