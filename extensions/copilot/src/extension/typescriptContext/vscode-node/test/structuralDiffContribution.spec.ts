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
		hasNativeExtension: true,
		listeners,
		extensionListeners: [] as (() => void)[],
		events: [] as string[],
		onConfigurationChange: vi.fn<(listener: (event: vscode.ConfigurationChangeEvent) => void) => vscode.Disposable>(),
		onExtensionsChange: vi.fn<(listener: () => void) => vscode.Disposable>(),
		register: vi.fn<(selector: vscode.DocumentSelector, provider: vscode.StructuralDiffProvider) => vscode.Disposable>(),
		provide: {
			TS6: vi.fn<vscode.StructuralDiffProvider['provideStructuralDiff']>(),
			TS7: vi.fn<vscode.StructuralDiffProvider['provideStructuralDiff']>(),
		},
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
		extensions: {
			getExtension: (extensionId: string) => mocks.hasNativeExtension && extensionId === 'typescriptteam.vscode-typescript' ? { id: extensionId } : undefined,
			onDidChange: mocks.onExtensionsChange,
		},
	};
});

vi.mock('../ts6/structuralDiffProvider', () => ({
	TS6StructuralDiffProvider: class {
		readonly provideStructuralDiff = mocks.provide.TS6;
		constructor() { mocks.events.push('create TS6'); }
		dispose() { mocks.events.push('dispose TS6'); }
	},
}));

vi.mock('../ts7/structuralDiffProvider', () => ({
	TS7StructuralDiffProvider: class {
		readonly provideStructuralDiff = mocks.provide.TS7;
		constructor() { mocks.events.push('create TS7'); }
		dispose() { mocks.events.push('dispose TS7'); }
	},
}));

suite('TypeScript structural diff contribution', () => {
	const store = new DisposableStore();

	beforeEach(() => {
		vi.resetAllMocks();
		mocks.available = true;
		mocks.useTs7 = true;
		mocks.hasNativeExtension = true;
		mocks.listeners.length = 0;
		mocks.extensionListeners.length = 0;
		mocks.events.length = 0;
		mocks.onConfigurationChange.mockImplementation(listener => {
			mocks.listeners.push(listener);
			return { dispose: () => { mocks.listeners.splice(mocks.listeners.indexOf(listener), 1); } };
		});
		mocks.onExtensionsChange.mockImplementation(listener => {
			mocks.extensionListeners.push(listener);
			return { dispose: () => { mocks.extensionListeners.splice(mocks.extensionListeners.indexOf(listener), 1); } };
		});
		mocks.register.mockImplementation(() => {
			mocks.events.push('register');
			return { dispose: () => mocks.events.push('unregister') };
		});
	});

	afterEach(() => store.clear());
	afterAll(() => store.dispose());

	test('registers TypeScript and TSX providers for working files and Git snapshots and disposes their resources', () => {
		const contribution = store.add(new StructuralDiffContribution(new TestLogService()));
		const selectors = mocks.register.mock.calls.map(([selector]) => selector);
		contribution.dispose();
		assert.deepStrictEqual({ selectors, events: mocks.events }, {
			selectors: [[
				{ language: 'typescript', scheme: 'file' },
				{ language: 'typescriptreact', scheme: 'file' },
				{ language: 'typescript', scheme: 'git' },
				{ language: 'typescriptreact', scheme: 'git' },
			]],
			events: ['create TS7', 'register', 'dispose TS7', 'unregister'],
		});
	});

	for (const version of ['TS6', 'TS7'] as const) {
		test(`delegates requests to the ${version} provider only while ${version} is active`, async () => {
			mocks.useTs7 = version === 'TS7';
			store.add(new StructuralDiffContribution(new TestLogService()));
			const provider = mocks.register.mock.calls[0][1];
			const original = createTextDocumentData(vscode.Uri.parse('git:/file.ts'), '', 'typescript').document;
			const modified = createTextDocumentData(vscode.Uri.file('file.ts'), '', 'typescript').document;
			const context = { changes: [] };
			const range = new vscode.Range(0, 0, 0, 0);
			const entity = { name: 'file.ts', kind: vscode.SymbolKind.File, range };
			const expected: vscode.StructuralDiff = {
				root: { id: 'file', originalItem: entity, modifiedItem: entity, originalChanges: [], modifiedChanges: [], children: [] },
				isIncomplete: false,
			};
			mocks.provide[version].mockReturnValue(expected);
			const active = await provider.provideStructuralDiff(original, modified, context, CancellationToken.None);
			// The version changed, but the configuration listener has not yet replaced the registration.
			mocks.useTs7 = !mocks.useTs7;
			const inactive = await provider.provideStructuralDiff(original, modified, context, CancellationToken.None);
			assert.deepStrictEqual({
				active, inactive, TS6: mocks.provide.TS6.mock.calls, TS7: mocks.provide.TS7.mock.calls,
			}, {
				active: expected, inactive: undefined,
				TS6: version === 'TS6' ? [[original, modified, context, CancellationToken.None]] : [],
				TS7: version === 'TS7' ? [[original, modified, context, CancellationToken.None]] : [],
			});
		});
	}

	test('does not construct a provider when the host does not support the proposal', () => {
		mocks.available = false;
		store.add(new StructuralDiffContribution(new TestLogService()));
		assert.deepStrictEqual(mocks.events, []);
	});

	test('replaces the provider when the active TypeScript version changes', () => {
		mocks.useTs7 = false;
		store.add(new StructuralDiffContribution(new TestLogService()));
		mocks.useTs7 = true;
		mocks.listeners[0]({ affectsConfiguration: () => true });
		mocks.useTs7 = false;
		mocks.listeners[0]({ affectsConfiguration: () => true });
		assert.deepStrictEqual(mocks.events, [
			'create TS6', 'register',
			'dispose TS6', 'unregister', 'create TS7', 'register',
			'dispose TS7', 'unregister', 'create TS6', 'register',
		]);
	});

	test('registers the TS6 provider while TS7 is enabled but no native TypeScript extension is installed', () => {
		mocks.hasNativeExtension = false;
		store.add(new StructuralDiffContribution(new TestLogService()));
		assert.deepStrictEqual(mocks.events, ['create TS6', 'register']);
	});

	test('replaces the provider when a native TypeScript extension is installed or removed', () => {
		mocks.hasNativeExtension = false;
		store.add(new StructuralDiffContribution(new TestLogService()));
		mocks.hasNativeExtension = true;
		mocks.extensionListeners[0]();
		// Changes of other extensions keep the provider.
		mocks.extensionListeners[0]();
		mocks.hasNativeExtension = false;
		mocks.extensionListeners[0]();
		assert.deepStrictEqual(mocks.events, [
			'create TS6', 'register',
			'dispose TS6', 'unregister', 'create TS7', 'register',
			'dispose TS7', 'unregister', 'create TS6', 'register',
		]);
	});
});
