/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TestLogService } from '../../../../../platform/testing/common/testLogService';

const { mockRegisterCommand, mockTabGroups } = vi.hoisted(() => ({
	mockRegisterCommand: vi.fn(),
	mockTabGroups: {
		activeTabGroup: { activeTab: null as unknown },
		all: [] as unknown[],
		close: vi.fn().mockResolvedValue(undefined),
		onDidChangeTabGroups: () => ({ dispose: () => { } }),
		onDidChangeTabs: vi.fn(() => ({ dispose: () => { } })),
	},
}));

vi.mock('vscode', () => ({
	window: {
		tabGroups: mockTabGroups,
	},
	commands: {
		registerCommand: (...args: unknown[]) => mockRegisterCommand(...args),
		executeCommand: vi.fn().mockResolvedValue(undefined),
	},
	TabInputTextDiff: class TabInputTextDiff {
		constructor(public original: unknown, public modified: unknown) { }
	},
}));

import * as vscode from 'vscode';
import { DiffStateManager, type ActiveDiff } from '../diffState';
import { registerDiffCommands, ACCEPT_DIFF_COMMAND, REJECT_DIFF_COMMAND } from '../commands/diffCommands';

function createTestDiff(tabName: string): ActiveDiff {
	const modifiedUri = { toString: () => 'modified://' + tabName } as unknown as vscode.Uri;
	const originalUri = { toString: () => 'original://' + tabName } as unknown as vscode.Uri;
	return {
		diffId: 'diff-' + tabName,
		tabName,
		originalUri,
		modifiedUri,
		newContents: 'new content',
		cleanup: vi.fn(),
		resolve: vi.fn(),
	};
}

function createDiffTab(tabName: string, modifiedUri: vscode.Uri) {
	return {
		label: tabName,
		input: new vscode.TabInputTextDiff(
			{ scheme: 'copilot-cli-readonly' } as unknown as vscode.Uri,
			modifiedUri,
		),
	};
}

describe('diff accept/reject commands', () => {
	const logger = new TestLogService();
	let diffState: DiffStateManager;
	let registeredCommands: Map<string, (...args: unknown[]) => void>;

	beforeEach(() => {
		vi.clearAllMocks();
		diffState = new DiffStateManager(logger);
		registeredCommands = new Map();

		mockRegisterCommand.mockImplementation((name: string, callback: (...args: unknown[]) => void) => {
			registeredCommands.set(name, callback);
			return { dispose: () => { } };
		});

		mockTabGroups.activeTabGroup = { activeTab: null };
		mockTabGroups.all = [];
	});

	it('should register accept and reject commands', () => {
		registerDiffCommands(logger, diffState);

		expect(registeredCommands.has(ACCEPT_DIFF_COMMAND)).toBe(true);
		expect(registeredCommands.has(REJECT_DIFF_COMMAND)).toBe(true);
	});

	it('should resolve diff as SAVED when accept command is executed', () => {
		registerDiffCommands(logger, diffState);

		const diff = createTestDiff('Test Diff');
		diffState.register(diff);

		const tab = createDiffTab('Test Diff', diff.modifiedUri);
		mockTabGroups.activeTabGroup = { activeTab: tab };

		registeredCommands.get(ACCEPT_DIFF_COMMAND)!();

		expect(diff.cleanup).toHaveBeenCalled();
		expect(diff.resolve).toHaveBeenCalledWith(
			expect.objectContaining({ status: 'SAVED', trigger: 'accepted_via_button' }),
		);
	});

	it('should resolve diff as REJECTED when reject command is executed', () => {
		registerDiffCommands(logger, diffState);

		const diff = createTestDiff('Reject Diff');
		diffState.register(diff);

		const tab = createDiffTab('Reject Diff', diff.modifiedUri);
		mockTabGroups.activeTabGroup = { activeTab: tab };

		registeredCommands.get(REJECT_DIFF_COMMAND)!();

		expect(diff.cleanup).toHaveBeenCalled();
		expect(diff.resolve).toHaveBeenCalledWith(
			expect.objectContaining({ status: 'REJECTED', trigger: 'rejected_via_button' }),
		);
	});

	it('should not resolve when active tab is not a diff tab', () => {
		registerDiffCommands(logger, diffState);

		mockTabGroups.activeTabGroup = { activeTab: { label: 'Not A Diff', input: {} } };

		// Should not throw
		registeredCommands.get(ACCEPT_DIFF_COMMAND)!();
	});

	it('should not resolve when there is no active tab', () => {
		registerDiffCommands(logger, diffState);

		mockTabGroups.activeTabGroup = { activeTab: null };

		registeredCommands.get(REJECT_DIFF_COMMAND)!();
	});

	it('should not close the tab (tab closing is handled by closeDiff tool)', () => {
		registerDiffCommands(logger, diffState);

		const diff = createTestDiff('Close Test');
		diffState.register(diff);

		const tab = createDiffTab('Close Test', diff.modifiedUri);
		mockTabGroups.activeTabGroup = { activeTab: tab };

		registeredCommands.get(ACCEPT_DIFF_COMMAND)!();

		// diffCommands resolves the diff but does NOT close the tab
		expect(diff.resolve).toHaveBeenCalled();
		expect(mockTabGroups.close).not.toHaveBeenCalled();
	});
});
