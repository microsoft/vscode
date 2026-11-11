/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type * as vscode from 'vscode';
import { DeferredPromise } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Emitter } from '../../../../base/common/event.js';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { nullExtensionDescription } from '../../../services/extensions/common/extensions.js';
import { MainThreadCustomEditorsShape } from '../../common/extHost.protocol.js';
import { ExtHostCustomEditors } from '../../common/extHostCustomEditors.js';
import { ExtHostDocuments } from '../../common/extHostDocuments.js';
import { Range, Selection } from '../../common/extHostTypes.js';
import { ExtHostWebview, ExtHostWebviews } from '../../common/extHostWebview.js';
import { ExtHostWebviewPanels } from '../../common/extHostWebviewPanels.js';
import { SingleProxyRPCProtocol } from './testRPCProtocol.js';

suite('ExtHostCustomTextEditorNavigation', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const resource = URI.file('/test/document');
	const viewType = 'test.navigation';
	const extension = { ...nullExtensionDescription, enabledApiProposals: ['customTextEditorNavigation'] };

	function setupNavigation(resolve?: vscode.CustomTextEditorProvider['resolveCustomTextEditorNavigation']) {
		const changes: unknown[] = [];
		const disposed = store.add(new Emitter<void>());
		const selectionChanged = store.add(new Emitter<vscode.Selection | undefined>());
		type Panel = ReturnType<ExtHostWebviewPanels['createNewWebviewPanel']>;
		const panels = new Map<string, Panel>();
		const revealed: unknown[] = [];
		const restored: unknown[] = [];
		let disposeCount = 0;
		let captured: unknown = { scroll: 42, nonSerializable: () => 1 };
		const controller: vscode.CustomTextEditorNavigation = {
			selection: new Selection(1, 2, 1, 5),
			onDidChangeSelection: selectionChanged.event,
			revealRange: (range, options, token) => { revealed.push({ range, options, canceled: token.isCancellationRequested }); },
			captureViewState: () => captured,
			restoreViewState: state => { restored.push(state); },
			dispose: () => { disposeCount++; }
		};
		const proxy = new class extends mock<MainThreadCustomEditorsShape>() {
			override $registerTextEditorProvider(): void { }
			override $unregisterEditorProvider(): void { }
			override $onDidChangeCustomTextEditorSelection(handle: string, selection: unknown): void { changes.push({ handle, selection }); }
		};
		const documents = new class extends mock<ExtHostDocuments>() {
			override getDocument(): vscode.TextDocument { return new class extends mock<vscode.TextDocument>() { override uri = resource; }; }
		};
		const webviews = new class extends mock<ExtHostWebviews>() {
			override createNewWebview(): ExtHostWebview { return new class extends mock<ExtHostWebview>() { }; }
			override ensureDefaultContentOptions(): void { }
		};
		const webviewPanels = new class extends mock<ExtHostWebviewPanels>() {
			override createNewWebviewPanel(handle: string): Panel {
				const panel = new class extends mock<Panel>() { override onDidDispose = disposed.event; };
				panels.set(handle, panel);
				return panel;
			}
			override getWebviewPanel(handle: string): Panel | undefined { return panels.get(handle); }
		};
		const editors = new ExtHostCustomEditors(SingleProxyRPCProtocol(proxy), documents, undefined, webviews, webviewPanels);
		let resolved = false;
		const registration = store.add(editors.registerCustomEditorProvider(extension, viewType, {
			resolveCustomTextEditor: () => { resolved = true; },
			resolveCustomTextEditorNavigation: resolve ?? (() => {
				assert.strictEqual(resolved, true);
				return controller;
			})
		}, {}));
		async function open(handle = 'panel', token = CancellationToken.None) {
			await editors.$resolveCustomEditor(resource, handle, viewType, { title: '', contentOptions: {}, options: {}, active: true }, 0, token);
			return editors.$resolveCustomTextEditorNavigation(handle, viewType, resource, token);
		}
		return { editors, open, registration, controller, changes, revealed, restored, selectionChanged, disposed, setCapture: (value: unknown) => { captured = value; }, disposeCount: () => disposeCount };
	}

	test('resolves after the panel and reports directional selection and clearing per panel', async () => {
		const fixture = setupNavigation();
		assert.deepStrictEqual(await fixture.open(), { selection: { selectionStartLineNumber: 2, selectionStartColumn: 3, positionLineNumber: 2, positionColumn: 6 } });
		fixture.selectionChanged.fire(new Selection(3, 4, 2, 1));
		fixture.selectionChanged.fire(undefined);
		assert.deepStrictEqual(fixture.changes, [
			{ handle: 'panel', selection: { selectionStartLineNumber: 4, selectionStartColumn: 5, positionLineNumber: 3, positionColumn: 2 } },
			{ handle: 'panel', selection: undefined }
		]);
	});

	test('preview has no selection and captured opaque state never leaves the host', async () => {
		const fixture = setupNavigation();
		await fixture.open();
		const range = { startLineNumber: 2, startColumn: 3, endLineNumber: 4, endColumn: 5 };
		await fixture.editors.$revealCustomTextEditorRange('panel', range, undefined, true, CancellationToken.None);
		assert.deepStrictEqual(fixture.revealed, [{ range: new Range(1, 2, 3, 4), options: { selection: undefined, preserveFocus: true }, canceled: false }]);
		const opaque = { callback: () => 42 };
		fixture.setCapture(Promise.resolve(opaque));
		assert.strictEqual(await fixture.editors.$captureCustomTextEditorViewState('panel', 1), undefined);
		await fixture.editors.$restoreCustomTextEditorViewState('panel', 1, CancellationToken.None);
		await fixture.editors.$restoreCustomTextEditorViewState('panel', 1, CancellationToken.None);
		assert.deepStrictEqual(fixture.restored, [opaque]);
	});

	test('released asynchronous captures cannot resurrect retained states', async () => {
		const fixture = setupNavigation();
		await fixture.open();
		const pending = new DeferredPromise<unknown>();
		fixture.setCapture(pending.p);
		const capture = fixture.editors.$captureCustomTextEditorViewState('panel', 7);
		fixture.editors.$releaseCustomTextEditorViewState('panel', 7);
		await pending.complete({ scroll: 10 });
		await capture;
		await fixture.editors.$restoreCustomTextEditorViewState('panel', 7, CancellationToken.None);
		assert.deepStrictEqual(fixture.restored, []);
	});

	test('cancellation consumes captured states and prevents reveal', async () => {
		const fixture = setupNavigation();
		await fixture.open();
		await fixture.editors.$captureCustomTextEditorViewState('panel', 1);
		await fixture.editors.$restoreCustomTextEditorViewState('panel', 1, CancellationToken.Cancelled);
		await fixture.editors.$restoreCustomTextEditorViewState('panel', 1, CancellationToken.None);
		await fixture.editors.$revealCustomTextEditorRange('panel', { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 }, undefined, true, CancellationToken.Cancelled);
		assert.deepStrictEqual({ restored: fixture.restored, revealed: fixture.revealed }, { restored: [], revealed: [] });
	});

	test('panel and provider disposal unsubscribe and dispose controllers exactly once', async () => {
		const fixture = setupNavigation();
		await fixture.open();
		fixture.disposed.fire();
		fixture.selectionChanged.fire(undefined);
		fixture.registration.dispose();
		assert.deepStrictEqual({ disposed: fixture.disposeCount(), changes: fixture.changes }, { disposed: 1, changes: [] });
	});

	test('provider disposal while resolving disposes the late controller', async () => {
		const pending = new DeferredPromise<vscode.CustomTextEditorNavigation>();
		const fixture = setupNavigation(() => pending.p);
		const resolution = fixture.open();
		await Promise.resolve();
		fixture.registration.dispose();
		await pending.complete(fixture.controller);
		assert.strictEqual(await resolution, undefined);
		assert.strictEqual(fixture.disposeCount(), 1);
	});

	test('navigation requires the proposal before registering a provider', () => {
		const editors = new ExtHostCustomEditors(SingleProxyRPCProtocol(new class extends mock<MainThreadCustomEditorsShape>() { }),
			new class extends mock<ExtHostDocuments>() { }, undefined, new class extends mock<ExtHostWebviews>() { }, new class extends mock<ExtHostWebviewPanels>() { });
		assert.throws(() => editors.registerCustomEditorProvider(nullExtensionDescription, viewType, { resolveCustomTextEditor: () => { }, resolveCustomTextEditorNavigation: () => { throw new Error('not reached'); } }, {}), /customTextEditorNavigation/);
	});

	test('controller state handles are isolated between split panels', async () => {
		const fixture = setupNavigation();
		await fixture.open('first');
		await fixture.open('second');
		const first = { scroll: 1 };
		const second = { scroll: 2 };
		fixture.setCapture(first);
		await fixture.editors.$captureCustomTextEditorViewState('first', 1);
		fixture.setCapture(second);
		await fixture.editors.$captureCustomTextEditorViewState('second', 1);
		await fixture.editors.$restoreCustomTextEditorViewState('second', 1, CancellationToken.None);
		await fixture.editors.$restoreCustomTextEditorViewState('first', 1, CancellationToken.None);
		assert.deepStrictEqual(fixture.restored, [second, first]);
	});
});
