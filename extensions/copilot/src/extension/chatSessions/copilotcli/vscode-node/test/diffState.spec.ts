/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TestLogService } from '../../../../../platform/testing/common/testLogService';
import {
	DiffStateManager,
	type ActiveDiff,
} from '../diffState';

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

describe('diffState', () => {
	let diffState: DiffStateManager;

	const createMockDiff = (tabName: string, diffIdSuffix?: string): ActiveDiff => ({
		diffId: `/tmp/modified-${diffIdSuffix ?? tabName}.ts`,
		tabName: tabName,
		originalUri: { fsPath: `/path/to/original-${tabName}.ts`, scheme: 'file' } as any,
		modifiedUri: { fsPath: `/tmp/modified-${diffIdSuffix ?? tabName}.ts`, scheme: 'file' } as any,
		newContents: `// new contents for ${tabName}`,
		cleanup: vi.fn(),
		resolve: vi.fn(),
	});

	beforeEach(() => {
		diffState = new DiffStateManager(new TestLogService());
	});

	describe('register and getByTabName', () => {
		it('should register and retrieve a diff by tabName', () => {
			const diff = createMockDiff('Test Diff 1');
			diffState.register(diff);

			const retrieved = diffState.getByTabName('Test Diff 1');
			expect(retrieved).toBe(diff);
		});

		it('should return undefined for non-existent tabName', () => {
			const retrieved = diffState.getByTabName('non-existent');
			expect(retrieved).toBeUndefined();
		});
	});

	describe('unregister', () => {
		it('should remove a registered diff', () => {
			const diff = createMockDiff('Test Diff 2');
			diffState.register(diff);
			expect(diffState.getByTabName('Test Diff 2')).toBe(diff);

			diffState.unregister(diff.diffId);
			expect(diffState.getByTabName('Test Diff 2')).toBeUndefined();
		});

		it('should not throw when unregistering non-existent diff', () => {
			expect(() => diffState.unregister('/tmp/non-existent.ts')).not.toThrow();
		});
	});

	describe('getByTabName', () => {
		it('should find diff by tab name', () => {
			const diff1 = createMockDiff('My Diff Tab');
			const diff2 = createMockDiff('Another Tab');
			diffState.register(diff1);
			diffState.register(diff2);

			const found = diffState.getByTabName('My Diff Tab');
			expect(found).toBe(diff1);

			const found2 = diffState.getByTabName('Another Tab');
			expect(found2).toBe(diff2);
		});

		it('should return undefined for non-existent tab name', () => {
			const diff = createMockDiff('Existing Tab');
			diffState.register(diff);

			const found = diffState.getByTabName('Non-existent Tab');
			expect(found).toBeUndefined();
		});

		it('should allow multiple diffs with same tab name but different diffIds', () => {
			const diff1 = createMockDiff('Duplicate Name', 'diff1');
			const diff2 = createMockDiff('Duplicate Name', 'diff2');
			diffState.register(diff1);
			diffState.register(diff2);

			const found = diffState.getByTabName('Duplicate Name');
			expect(found).toBe(diff1);

			diffState.unregister(diff1.diffId);
			const foundAfter = diffState.getByTabName('Duplicate Name');
			expect(foundAfter).toBe(diff2);
		});
	});

	describe('hasActiveDiffs', () => {
		it('should return false when no diffs are registered', () => {
			expect(diffState.hasActiveDiffs()).toBe(false);
		});

		it('should return true when diffs are registered', () => {
			const diff = createMockDiff('Test Diff 3');
			diffState.register(diff);
			expect(diffState.hasActiveDiffs()).toBe(true);
		});

		it('should return false after all diffs are unregistered', () => {
			const diff = createMockDiff('Test Diff 3');
			diffState.register(diff);
			expect(diffState.hasActiveDiffs()).toBe(true);

			diffState.unregister(diff.diffId);
			expect(diffState.hasActiveDiffs()).toBe(false);
		});
	});

	describe('edge cases', () => {
		it('should handle multiple diffs for the same original file', () => {
			const diff1: ActiveDiff = {
				diffId: '/tmp/modified-v1.ts',
				tabName: 'file.ts (version 1)',
				originalUri: { fsPath: '/path/to/file.ts', scheme: 'file' } as any,
				modifiedUri: { fsPath: '/tmp/modified-v1.ts', scheme: 'file' } as any,
				newContents: '// version 1',
				cleanup: vi.fn(),
				resolve: vi.fn(),
			};
			const diff2: ActiveDiff = {
				diffId: '/tmp/modified-v2.ts',
				tabName: 'file.ts (version 2)',
				originalUri: { fsPath: '/path/to/file.ts', scheme: 'file' } as any,
				modifiedUri: { fsPath: '/tmp/modified-v2.ts', scheme: 'file' } as any,
				newContents: '// version 2',
				cleanup: vi.fn(),
				resolve: vi.fn(),
			};

			diffState.register(diff1);
			diffState.register(diff2);

			expect(diffState.getByTabName('file.ts (version 1)')).toBe(diff1);
			expect(diffState.getByTabName('file.ts (version 2)')).toBe(diff2);

			diffState.unregister(diff1.diffId);
			diffState.unregister(diff2.diffId);
		});

		it('should handle re-registering same diffId (overwrites)', () => {
			const diff1 = createMockDiff('Original Tab');
			const diff2: ActiveDiff = {
				diffId: diff1.diffId,
				tabName: 'New Tab',
				originalUri: { fsPath: '/path/to/new.ts', scheme: 'file' } as any,
				modifiedUri: { fsPath: '/tmp/new-modified.ts', scheme: 'file' } as any,
				newContents: '// new content',
				cleanup: vi.fn(),
				resolve: vi.fn(),
			};

			diffState.register(diff1);
			expect(diffState.getByTabName('Original Tab')).toBe(diff1);

			diffState.register(diff2);
			expect(diffState.getByTabName('Original Tab')).toBeUndefined();
			expect(diffState.getByTabName('New Tab')).toBe(diff2);
		});

		it('should handle concurrent registrations', () => {
			const diffs = Array.from({ length: 10 }, (_, i) =>
				createMockDiff(`Concurrent Tab ${i}`)
			);

			diffs.forEach(diff => diffState.register(diff));

			diffs.forEach((diff, i) => {
				expect(diffState.getByTabName(`Concurrent Tab ${i}`)).toBe(diff);
			});

			diffs.forEach(diff => diffState.unregister(diff.diffId));
		});
	});
});
