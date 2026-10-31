/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert';
import { afterAll, afterEach, beforeEach, suite, test, vi } from 'vitest';
import * as vscode from 'vscode';
import { TestLogService } from '../../../../platform/testing/common/testLogService';
import { createTextDocumentData } from '../../../../util/common/test/shims/textDocument';
import { CancellationToken } from '../../../../util/vs/base/common/cancellation';
import { DisposableStore } from '../../../../util/vs/base/common/lifecycle';
import { StructuralDiffContribution } from '../structuralDiffContribution';

const mocks = vi.hoisted(() => {
	const listeners: ((event: vscode.ConfigurationChangeEvent) => void)[] = [];
	return {
		available: true,
		useTs7: true,
		created: 0,
		listeners,
		onConfigurationChange: vi.fn<(listener: (event: vscode.ConfigurationChangeEvent) => void) => vscode.Disposable>(),
		register: vi.fn<(selector: vscode.DocumentSelector, provider: vscode.StructuralDiffProvider) => vscode.Disposable>(),
		unregister: vi.fn(),
		provide: vi.fn<vscode.StructuralDiffProvider['provideStructuralDiff']>(),
		dispose: vi.fn(),
	};
});

vi.mock('vscode', async importOriginal => {
	const original = await importOriginal<typeof import('vscode')>();
	return {
		...original,
		languages: {
			get registerStructuralDiffProvider() { return mocks.available ? mocks.register : undefined; },
		},
		workspace: {
			onDidChangeConfiguration: mocks.onConfigurationChange,
			getConfiguration: () => ({
				inspect: () => ({ key: 'experimental.useTsgo', globalValue: mocks.useTs7 }),
				get: () => mocks.useTs7,
			}),
		},
	};
});

vi.mock('../ts7/structuralDiffProvider', () => ({
	TS7StructuralDiffProvider: class {
		readonly provideStructuralDiff = mocks.provide;
		readonly dispose = mocks.dispose;
		constructor() { mocks.created++; }
	},
}));

suite('TypeScript structural diff contribution', () => {
	const store = new DisposableStore();

	beforeEach(() => {
		vi.resetAllMocks();
		mocks.available = true;
		mocks.useTs7 = true;
		mocks.created = 0;
		mocks.listeners.length = 0;
		mocks.onConfigurationChange.mockImplementation(listener => {
			mocks.listeners.push(listener);
			return { dispose: () => { mocks.listeners.splice(mocks.listeners.indexOf(listener), 1); } };
		});
		mocks.register.mockImplementation(() => ({ dispose: mocks.unregister }));
	});

	afterEach(() => store.clear());
	afterAll(() => store.dispose());

	test('registers TypeScript and TSX providers for working files and Git snapshots and disposes their resources', () => {
		const contribution = store.add(new StructuralDiffContribution(new TestLogService()));
		const selectors = mocks.register.mock.calls.map(([selector]) => selector);
		contribution.dispose();
		assert.deepStrictEqual({
			selectors, created: mocks.created, disposed: mocks.dispose.mock.calls.length, unregistered: mocks.unregister.mock.calls.length,
		}, {
			selectors: [[
				{ language: 'typescript', scheme: 'file' },
				{ language: 'typescriptreact', scheme: 'file' },
				{ language: 'typescript', scheme: 'git' },
				{ language: 'typescriptreact', scheme: 'git' },
			]],
			created: 1, disposed: 1, unregistered: 1,
		});
	});

	test('delegates requests only while the TypeScript 7 backend is active', async () => {
		store.add(new StructuralDiffContribution(new TestLogService()));
		const provider = mocks.register.mock.calls[0][1];
		const original = createTextDocumentData(vscode.Uri.parse('git:/file.ts'), '', 'typescript').document;
		const modified = createTextDocumentData(vscode.Uri.file('file.ts'), '', 'typescript').document;
		const context = { changes: [] };
		const range = new vscode.Range(0, 0, 0, 0);
		const entity = { name: 'file.ts', kind: vscode.SymbolKind.File, range };
		const expected: vscode.StructuralDiff = {
			root: { id: 'file', original: entity, modified: entity, originalChanges: [], modifiedChanges: [], children: [] },
			isIncomplete: false,
		};
		mocks.provide.mockReturnValue(expected);
		mocks.useTs7 = false;
		const ts6Result = await provider.provideStructuralDiff(original, modified, context, CancellationToken.None);
		mocks.useTs7 = true;
		const ts7Result = await provider.provideStructuralDiff(original, modified, context, CancellationToken.None);
		assert.deepStrictEqual({
			ts6Result, ts7Result, calls: mocks.provide.mock.calls, registrations: mocks.register.mock.calls.length,
		}, {
			ts6Result: undefined, ts7Result: expected, calls: [[original, modified, context, CancellationToken.None]], registrations: 1,
		});
	});

	test('does not construct a provider when the host does not support the proposal', () => {
		mocks.available = false;
		store.add(new StructuralDiffContribution(new TestLogService()));
		assert.deepStrictEqual({ registrations: mocks.register.mock.calls.length, created: mocks.created }, { registrations: 0, created: 0 });
	});

	test('updates registry availability when the active TypeScript backend changes', () => {
		mocks.useTs7 = false;
		store.add(new StructuralDiffContribution(new TestLogService()));
		const initial = mocks.register.mock.calls.length;
		mocks.useTs7 = true;
		mocks.listeners[0]({ affectsConfiguration: () => true });
		const enabled = mocks.register.mock.calls.length;
		mocks.useTs7 = false;
		mocks.listeners[0]({ affectsConfiguration: () => true });
		assert.deepStrictEqual({
			initial, enabled, created: mocks.created,
			disposed: mocks.dispose.mock.calls.length, unregistered: mocks.unregister.mock.calls.length,
		}, { initial: 0, enabled: 1, created: 1, disposed: 1, unregistered: 1 });
	});
});
