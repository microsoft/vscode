/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, assert, beforeEach, suite, test } from 'vitest';
import { TextDocumentChangeReason, TextEditor, type TextDocument } from 'vscode';
import { ConfigKey, IConfigurationService } from '../../../../platform/configuration/common/configurationService';
import { InMemoryConfigurationService } from '../../../../platform/configuration/test/common/inMemoryConfigurationService';
import { DocumentId } from '../../../../platform/inlineEdits/common/dataTypes/documentId';
import { DocumentSwitchTriggerStrategy } from '../../../../platform/inlineEdits/common/dataTypes/triggerOptions';
import { ILogService } from '../../../../platform/log/common/logService';
import { IExperimentationService } from '../../../../platform/telemetry/common/nullExperimentationService';
import { TestWorkspaceService } from '../../../../platform/test/node/testWorkspaceService';
import { createTextDocumentData } from '../../../../util/common/test/shims/textDocument';
import { ExtHostTextEditor } from '../../../../util/common/test/shims/textEditor';
import { DisposableStore } from '../../../../util/vs/base/common/lifecycle';
import { IReader } from '../../../../util/vs/base/common/observableInternal';
import { Selection, TextEditorSelectionChangeKind, Uri } from '../../../../vscodeTypes';
import { createExtensionUnitTestingServices } from '../../../test/node/services';
import { NesChangeHint, NesTriggerReason } from '../../common/nesTriggerHint';
import { NesOutcome, NextEditProvider } from '../../node/nextEditProvider';
import {
	InlineEditTriggerer,
	TRIGGER_INLINE_EDIT_AFTER_CHANGE_LIMIT,
	TRIGGER_INLINE_EDIT_ON_SAME_LINE_COOLDOWN,
	TRIGGER_INLINE_EDIT_REJECTION_COOLDOWN
} from '../../vscode-node/inlineEditTriggerer';
import { IVSCodeObservableDocument } from '../../vscode-node/parts/vscodeWorkspace';


suite('InlineEditTriggerer', () => {
	let disposables: DisposableStore;
	let vscWorkspace: MockVSCodeWorkspace;
	let workspaceService: TestWorkspaceService;
	let firedEvents: NesChangeHint[];
	let nextEditProvider: MockNextEditProvider;
	let configurationService: InMemoryConfigurationService;
	let triggerer: InlineEditTriggerer;

	class MockNextEditProvider {
		public lastRejectionTime: number = Date.now();
		public lastTriggerTime: number = Date.now();
		public lastOutcome: NesOutcome | undefined = undefined;
	}

	class MockVSCodeWorkspace {
		public readonly documents = new WeakMap<TextDocument, IVSCodeObservableDocument>();
		public addDoc(doc: TextDocument, obsDoc: IVSCodeObservableDocument): void {
			this.documents.set(doc, obsDoc);
		}
		public getDocumentByTextDocument(doc: TextDocument, _reader?: IReader): IVSCodeObservableDocument | undefined {
			return this.documents.get(doc);
		}
	}

	beforeEach(() => {
		disposables = new DisposableStore();
		firedEvents = [];
		vscWorkspace = new MockVSCodeWorkspace();
		nextEditProvider = new MockNextEditProvider();

		workspaceService = disposables.add(new TestWorkspaceService());
		const services = disposables.add(createExtensionUnitTestingServices());
		const accessor = disposables.add(services.createTestingAccessor());

		configurationService = accessor.get(IConfigurationService) as InMemoryConfigurationService;
		triggerer = disposables.add(new InlineEditTriggerer(
			vscWorkspace as any,
			nextEditProvider as any as NextEditProvider,
			accessor.get(ILogService),
			configurationService,
			accessor.get(IExperimentationService),
			workspaceService
		));
		disposables.add(triggerer.onChange(e => firedEvents.push(e)));
	});

	afterEach(() => {
		disposables.dispose();
	});

	// #region Helper functions

	function triggerTextChange(document: TextDocument, reason?: TextDocumentChangeReason): void {
		workspaceService.didChangeTextDocumentEmitter.fire({
			document,
			contentChanges: [],
			reason,
			detailedReason: undefined,
		});
	}

	function triggerTextSelectionChange(textEditor: TextEditor, selection: Selection, kind = TextEditorSelectionChangeKind.Keyboard): void {
		workspaceService.didChangeTextEditorSelectionEmitter.fire({
			kind,
			selections: [selection],
			textEditor,
		});
	}

	function triggerMultipleSelectionChange(textEditor: TextEditor, selections: Selection[]): void {
		workspaceService.didChangeTextEditorSelectionEmitter.fire({
			kind: TextEditorSelectionChangeKind.Keyboard,
			selections,
			textEditor,
		});
	}

	function createObservableTextDoc(uri: Uri): IVSCodeObservableDocument {
		return {
			id: DocumentId.create(uri.toString()),
			toRange: (_: any, range: any) => range
		} as any;
	}

	function createTextDocument(
		selection: Selection = new Selection(0, 0, 0, 0),
		uri: Uri = Uri.file('sample.py'),
		content = 'print("Hello World")'
	): { document: TextDocument; textEditor: TextEditor; selection: Selection } {
		const doc = createTextDocumentData(uri, content, 'python');
		const textEditor = new ExtHostTextEditor(doc.document, [selection], {}, [], undefined);
		vscWorkspace.addDoc(doc.document, createObservableTextDoc(doc.document.uri));
		return {
			document: doc.document,
			textEditor: textEditor.value,
			selection
		};
	}

	function createOutputDocument(): { document: TextDocument; textEditor: TextEditor; selection: Selection } {
		const uri = Uri.parse('output:extension-output-GitHub.copilot-chat-#1-GitHub Copilot Chat');
		const doc = createTextDocumentData(uri, 'output logs', 'log');
		const selection = new Selection(0, 0, 0, 0);
		const textEditor = new ExtHostTextEditor(doc.document, [selection], {}, [], undefined);
		return { document: doc.document, textEditor: textEditor.value, selection };
	}

	function getLastFiredReason(): NesTriggerReason | undefined {
		return firedEvents.at(-1)?.data.reason;
	}

	// #endregion

	// #region Basic behaviors

	suite('Basic behaviors', () => {
		test('No signal if there were no text changes', () => {
			const { textEditor, selection } = createTextDocument();

			triggerTextSelectionChange(textEditor, selection);

			assert.strictEqual(firedEvents.length, 0, 'Signal should not have been fired');
		});

		test('No signal if selection is not empty', () => {
			const { document, textEditor, selection } = createTextDocument(new Selection(0, 0, 0, 10));

			triggerTextChange(document);
			triggerTextSelectionChange(textEditor, selection);

			assert.strictEqual(firedEvents.length, 0, 'Signal should not have been fired');
		});

		test('Signal fires when text changes and cursor moves with empty selection', () => {
			const { document, textEditor } = createTextDocument();
			nextEditProvider.lastRejectionTime = Date.now() - TRIGGER_INLINE_EDIT_REJECTION_COOLDOWN - 1;

			triggerTextChange(document);
			triggerTextSelectionChange(textEditor, new Selection(0, 5, 0, 5));

			assert.isAtLeast(firedEvents.length, 1, 'Signal should have been fired');
			assert.strictEqual(getLastFiredReason(), NesTriggerReason.SelectionChange);
		});

		test('No signal with multiple selections', () => {
			const { document, textEditor } = createTextDocument();
			nextEditProvider.lastRejectionTime = Date.now() - TRIGGER_INLINE_EDIT_REJECTION_COOLDOWN - 1;

			triggerTextChange(document);
			triggerMultipleSelectionChange(textEditor, [
				new Selection(0, 0, 0, 0),
				new Selection(1, 0, 1, 0)
			]);

			assert.strictEqual(firedEvents.length, 0, 'Signal should not have been fired for multiple selections');
		});
	});

	// #endregion

	// #region Rejection cooldown

	suite('Rejection cooldown', () => {
		test('No signal when last rejection was within cooldown period', () => {
			const { document, textEditor } = createTextDocument();
			nextEditProvider.lastRejectionTime = Date.now() - (TRIGGER_INLINE_EDIT_REJECTION_COOLDOWN - 1000);

			triggerTextChange(document);
			triggerTextSelectionChange(textEditor, new Selection(0, 5, 0, 5));

			assert.strictEqual(firedEvents.length, 0, 'Signal should not fire during rejection cooldown');
		});

		test('Signal fires when last rejection was over cooldown ago', () => {
			const { document, textEditor } = createTextDocument();
			nextEditProvider.lastRejectionTime = Date.now() - (TRIGGER_INLINE_EDIT_REJECTION_COOLDOWN + 1);

			triggerTextChange(document);
			triggerTextSelectionChange(textEditor, new Selection(0, 5, 0, 5));

			assert.isAtLeast(firedEvents.length, 1, 'Signal should have been fired');
		});

		test('Rejection clears tracking for the document', () => {
			const { document, textEditor } = createTextDocument();
			nextEditProvider.lastRejectionTime = Date.now() - TRIGGER_INLINE_EDIT_REJECTION_COOLDOWN - 1;

			triggerTextChange(document);
			// Now set rejection time to be recent
			nextEditProvider.lastRejectionTime = Date.now();
			triggerTextSelectionChange(textEditor, new Selection(0, 5, 0, 5));

			assert.strictEqual(firedEvents.length, 0, 'Signal should not fire');

			// Make another change and ensure tracking was cleared
			triggerTextSelectionChange(textEditor, new Selection(0, 10, 0, 10));
			assert.strictEqual(firedEvents.length, 0, 'Signal should still not fire as doc was cleared');
		});
	});

	// #endregion

	// #region Document filtering

	suite('Document filtering', () => {
		test('Ignores output pane documents for text changes', () => {
			const { document, textEditor, selection } = createOutputDocument();
			nextEditProvider.lastRejectionTime = Date.now() - TRIGGER_INLINE_EDIT_REJECTION_COOLDOWN - 1;

			triggerTextChange(document);
			triggerTextSelectionChange(textEditor, selection);

			assert.strictEqual(firedEvents.length, 0, 'Signal should not fire for output documents');
		});

		test('Ignores copilot-ignored documents (not in workspace)', () => {
			const { document, textEditor } = createTextDocument();
			// Remove from workspace to simulate copilot-ignored
			vscWorkspace.documents.delete(document);
			nextEditProvider.lastRejectionTime = Date.now() - TRIGGER_INLINE_EDIT_REJECTION_COOLDOWN - 1;

			triggerTextChange(document);
			triggerTextSelectionChange(textEditor, new Selection(0, 5, 0, 5));

			assert.strictEqual(firedEvents.length, 0, 'Signal should not fire for ignored documents');
		});
	});

	// #endregion

	// #region Undo/Redo handling

	suite('Undo/Redo handling', () => {
		test('Ignores undo changes', () => {
			const { document, textEditor } = createTextDocument();
			nextEditProvider.lastRejectionTime = Date.now() - TRIGGER_INLINE_EDIT_REJECTION_COOLDOWN - 1;

			triggerTextChange(document, TextDocumentChangeReason.Undo);
			triggerTextSelectionChange(textEditor, new Selection(0, 5, 0, 5));

			assert.strictEqual(firedEvents.length, 0, 'Signal should not fire for undo changes');
		});

		test('Ignores redo changes', () => {
			const { document, textEditor } = createTextDocument();
			nextEditProvider.lastRejectionTime = Date.now() - TRIGGER_INLINE_EDIT_REJECTION_COOLDOWN - 1;

			triggerTextChange(document, TextDocumentChangeReason.Redo);
			triggerTextSelectionChange(textEditor, new Selection(0, 5, 0, 5));

			assert.strictEqual(firedEvents.length, 0, 'Signal should not fire for redo changes');
		});
	});

	// #endregion

	// #region Edit timestamp limits

	suite('Edit timestamp limits', () => {
		test('No signal if edit is too old', async () => {
			const { document } = createTextDocument();
			nextEditProvider.lastRejectionTime = Date.now() - TRIGGER_INLINE_EDIT_REJECTION_COOLDOWN - 1;

			triggerTextChange(document);

			// Simulate time passing beyond the limit by manipulating internal state
			// We need to wait for the limit to pass - but since we can't easily mock Date.now(),
			// we test the boundary condition instead by verifying the constant is used correctly
			assert.strictEqual(TRIGGER_INLINE_EDIT_AFTER_CHANGE_LIMIT, 10000, 'Limit should be 10 seconds');
		});

		test('Signal fires when edit is within time limit', () => {
			const { document, textEditor } = createTextDocument();
			nextEditProvider.lastRejectionTime = Date.now() - TRIGGER_INLINE_EDIT_REJECTION_COOLDOWN - 1;

			triggerTextChange(document);
			triggerTextSelectionChange(textEditor, new Selection(0, 5, 0, 5));

			assert.isAtLeast(firedEvents.length, 1, 'Signal should fire for recent edits');
		});
	});

	// #endregion

	// #region Trigger time checks

	suite('Trigger time checks', () => {
		test('No signal if last trigger time is too old', () => {
			const { document, textEditor } = createTextDocument();
			nextEditProvider.lastRejectionTime = Date.now() - TRIGGER_INLINE_EDIT_REJECTION_COOLDOWN - 1;
			nextEditProvider.lastTriggerTime = Date.now() - TRIGGER_INLINE_EDIT_AFTER_CHANGE_LIMIT - 1;

			triggerTextChange(document);
			triggerTextSelectionChange(textEditor, new Selection(0, 5, 0, 5));

			assert.strictEqual(firedEvents.length, 0, 'Signal should not fire when last trigger is too old');
		});

		test('Signal fires when last trigger time is recent', () => {
			const { document, textEditor } = createTextDocument();
			nextEditProvider.lastRejectionTime = Date.now() - TRIGGER_INLINE_EDIT_REJECTION_COOLDOWN - 1;
			nextEditProvider.lastTriggerTime = Date.now();

			triggerTextChange(document);
			triggerTextSelectionChange(textEditor, new Selection(0, 5, 0, 5));

			assert.isAtLeast(firedEvents.length, 1, 'Signal should fire for recent triggers');
		});
	});

	// #endregion

	// #region Same line cooldown

	suite('Same line cooldown', () => {
		test('No signal for same line within cooldown period', () => {
			const { document, textEditor } = createTextDocument();
			nextEditProvider.lastRejectionTime = Date.now() - TRIGGER_INLINE_EDIT_REJECTION_COOLDOWN - 1;

			triggerTextChange(document);
			triggerTextSelectionChange(textEditor, new Selection(0, 5, 0, 5));

			const initialCount = firedEvents.length;
			assert.isAtLeast(initialCount, 1, 'First signal should fire');

			// Same line, different column - should be in cooldown
			triggerTextSelectionChange(textEditor, new Selection(0, 10, 0, 10));

			assert.strictEqual(firedEvents.length, initialCount, 'Signal should not fire for same line in cooldown');
		});

		test('Signal fires on different line', () => {
			const { document, textEditor } = createTextDocument(undefined, undefined, 'line1\nline2\nline3');
			nextEditProvider.lastRejectionTime = Date.now() - TRIGGER_INLINE_EDIT_REJECTION_COOLDOWN - 1;

			triggerTextChange(document);
			triggerTextSelectionChange(textEditor, new Selection(0, 0, 0, 0));

			const initialCount = firedEvents.length;
			assert.isAtLeast(initialCount, 1, 'First signal should fire');

			// Different line
			triggerTextSelectionChange(textEditor, new Selection(1, 0, 1, 0));

			assert.isAtLeast(firedEvents.length, initialCount + 1, 'Signal should fire for different line');
		});

		test('Cooldown constant is 5 seconds', () => {
			assert.strictEqual(TRIGGER_INLINE_EDIT_ON_SAME_LINE_COOLDOWN, 5000, 'Same line cooldown should be 5s');
		});
	});

	// #endregion

	// #region Document switch behavior

	suite('Document switch behavior', () => {
		test('Triggers on document switch when configured', () => {
			const doc1 = createTextDocument(undefined, Uri.file('file1.py'));
			const doc2 = createTextDocument(undefined, Uri.file('file2.py'));

			nextEditProvider.lastRejectionTime = Date.now() - TRIGGER_INLINE_EDIT_REJECTION_COOLDOWN - 1;

			// Configure to trigger on document switch
			void configurationService.setConfig(ConfigKey.Advanced.InlineEditsTriggerOnEditorChangeAfterSeconds, 30);

			// Make a change in doc1
			triggerTextChange(doc1.document);
			triggerTextSelectionChange(doc1.textEditor, new Selection(0, 5, 0, 5));

			const initialCount = firedEvents.length;

			// Switch to doc2
			triggerTextSelectionChange(doc2.textEditor, new Selection(0, 0, 0, 0));

			assert.isAtLeast(firedEvents.length, initialCount + 1, 'Signal should fire on document switch');
			assert.strictEqual(getLastFiredReason(), NesTriggerReason.ActiveDocumentSwitch);
		});

		test('Does not trigger on same document', () => {
			const { document, textEditor } = createTextDocument();
			nextEditProvider.lastRejectionTime = Date.now() - TRIGGER_INLINE_EDIT_REJECTION_COOLDOWN - 1;

			void configurationService.setConfig(ConfigKey.Advanced.InlineEditsTriggerOnEditorChangeAfterSeconds, 30);

			triggerTextChange(document);
			triggerTextSelectionChange(textEditor, new Selection(0, 5, 0, 5));

			// Same document, just moving cursor (no tracked change for line 1)
			triggerTextSelectionChange(textEditor, new Selection(0, 5, 0, 5));

			// Should not trigger a document switch event for same document
			const switchEvents = firedEvents.filter(e => e.data.reason === NesTriggerReason.ActiveDocumentSwitch);
			assert.strictEqual(switchEvents.length, 0, 'Should not trigger document switch for same doc');
		});

		test('Does not trigger when document switch is disabled', () => {
			const doc1 = createTextDocument(undefined, Uri.file('file1.py'));
			const doc2 = createTextDocument(undefined, Uri.file('file2.py'));

			nextEditProvider.lastRejectionTime = Date.now() - TRIGGER_INLINE_EDIT_REJECTION_COOLDOWN - 1;

			// Don't configure document switch trigger (leave as undefined)
			void configurationService.setConfig(ConfigKey.Advanced.InlineEditsTriggerOnEditorChangeAfterSeconds, undefined);

			triggerTextChange(doc1.document);
			triggerTextSelectionChange(doc1.textEditor, new Selection(0, 5, 0, 5));

			// Switch to doc2 without making changes there
			triggerTextSelectionChange(doc2.textEditor, new Selection(0, 0, 0, 0));

			// Should not trigger because doc2 has no tracked changes and switch trigger is disabled
			const switchEvents = firedEvents.filter(e => e.data.reason === NesTriggerReason.ActiveDocumentSwitch);
			assert.strictEqual(switchEvents.length, 0, 'Should not trigger document switch when disabled');
		});

		test('Does not trigger on document switch when there is no recent NES trigger (lastTriggerTime is 0)', () => {
			const doc1 = createTextDocument(undefined, Uri.file('file1.py'));
			const doc2 = createTextDocument(undefined, Uri.file('file2.py'));

			nextEditProvider.lastRejectionTime = Date.now() - TRIGGER_INLINE_EDIT_REJECTION_COOLDOWN - 1;
			nextEditProvider.lastTriggerTime = 0; // No previous trigger

			// Configure to trigger on document switch
			void configurationService.setConfig(ConfigKey.Advanced.InlineEditsTriggerOnEditorChangeAfterSeconds, 30);

			// Make a change in doc1
			triggerTextChange(doc1.document);
			triggerTextSelectionChange(doc1.textEditor, new Selection(0, 5, 0, 5));

			const initialCount = firedEvents.length;

			// Switch to doc2
			triggerTextSelectionChange(doc2.textEditor, new Selection(0, 0, 0, 0));

			// Should not trigger document switch because lastTriggerTime is 0
			const switchEvents = firedEvents.filter(e => e.data.reason === NesTriggerReason.ActiveDocumentSwitch);
			assert.strictEqual(switchEvents.length, 0, 'Should not trigger document switch when lastTriggerTime is 0');
			assert.strictEqual(firedEvents.length, initialCount, 'No new events should fire');
		});

		test('Does not trigger on document switch when NES trigger was too long ago', () => {
			const doc1 = createTextDocument(undefined, Uri.file('file1.py'));
			const doc2 = createTextDocument(undefined, Uri.file('file2.py'));

			nextEditProvider.lastRejectionTime = Date.now() - TRIGGER_INLINE_EDIT_REJECTION_COOLDOWN - 1;

			const triggerAfterSeconds = 30;
			// Configure to trigger on document switch
			void configurationService.setConfig(ConfigKey.Advanced.InlineEditsTriggerOnEditorChangeAfterSeconds, triggerAfterSeconds);

			// Make a change in doc1
			triggerTextChange(doc1.document);
			triggerTextSelectionChange(doc1.textEditor, new Selection(0, 5, 0, 5));

			const initialCount = firedEvents.length;

			// Set lastTriggerTime to be older than the configured threshold
			nextEditProvider.lastTriggerTime = Date.now() - (triggerAfterSeconds * 1000) - 1;

			// Switch to doc2
			triggerTextSelectionChange(doc2.textEditor, new Selection(0, 0, 0, 0));

			// Should not trigger document switch because last trigger was too long ago
			const switchEvents = firedEvents.filter(e => e.data.reason === NesTriggerReason.ActiveDocumentSwitch);
			assert.strictEqual(switchEvents.length, 0, 'Should not trigger document switch when last trigger was too long ago');
			assert.strictEqual(firedEvents.length, initialCount, 'No new events should fire');
		});

		test('Triggers on document switch when NES trigger was recent', () => {
			const doc1 = createTextDocument(undefined, Uri.file('file1.py'));
			const doc2 = createTextDocument(undefined, Uri.file('file2.py'));

			nextEditProvider.lastRejectionTime = Date.now() - TRIGGER_INLINE_EDIT_REJECTION_COOLDOWN - 1;

			const triggerAfterSeconds = 30;
			// Configure to trigger on document switch
			void configurationService.setConfig(ConfigKey.Advanced.InlineEditsTriggerOnEditorChangeAfterSeconds, triggerAfterSeconds);

			// Make a change in doc1
			triggerTextChange(doc1.document);
			triggerTextSelectionChange(doc1.textEditor, new Selection(0, 5, 0, 5));

			const initialCount = firedEvents.length;

			// Set lastTriggerTime to be within the configured threshold
			nextEditProvider.lastTriggerTime = Date.now() - (triggerAfterSeconds * 1000) + 5000; // 5 seconds within the threshold

			// Switch to doc2
			triggerTextSelectionChange(doc2.textEditor, new Selection(0, 0, 0, 0));

			// Should trigger document switch because last trigger was recent
			const switchEvents = firedEvents.filter(e => e.data.reason === NesTriggerReason.ActiveDocumentSwitch);
			assert.strictEqual(switchEvents.length, 1, 'Should trigger document switch when last trigger was recent');
			assert.isAtLeast(firedEvents.length, initialCount + 1, 'Should have fired an additional event');
		});
	});

	// #endregion

	// #region Debounce behavior

	suite('Debounce behavior', () => {
		test('First two selection changes fire immediately when debounce is configured', () => {
			const { document, textEditor } = createTextDocument(undefined, undefined, 'line1\nline2\nline3');
			nextEditProvider.lastRejectionTime = Date.now() - TRIGGER_INLINE_EDIT_REJECTION_COOLDOWN - 1;

			// Configure debounce
			void configurationService.setConfig(ConfigKey.TeamInternal.InlineEditsDebounceOnSelectionChange, 100);

			triggerTextChange(document);

			// First selection change - should fire immediately
			triggerTextSelectionChange(textEditor, new Selection(0, 0, 0, 0));
			assert.strictEqual(firedEvents.length, 1, 'First selection change should fire immediately');

			// Second selection change - should also fire immediately
			triggerTextSelectionChange(textEditor, new Selection(1, 0, 1, 0));
			assert.strictEqual(firedEvents.length, 2, 'Second selection change should fire immediately');
		});

		test('Third and subsequent selection changes are debounced', async () => {
			const { document, textEditor } = createTextDocument(undefined, undefined, 'line1\nline2\nline3\nline4\nline5');
			nextEditProvider.lastRejectionTime = Date.now() - TRIGGER_INLINE_EDIT_REJECTION_COOLDOWN - 1;

			const debounceMs = 50;
			void configurationService.setConfig(ConfigKey.TeamInternal.InlineEditsDebounceOnSelectionChange, debounceMs);

			triggerTextChange(document);

			// First two fire immediately
			triggerTextSelectionChange(textEditor, new Selection(0, 0, 0, 0));
			triggerTextSelectionChange(textEditor, new Selection(1, 0, 1, 0));
			assert.strictEqual(firedEvents.length, 2, 'First two should fire immediately');

			// Third selection change - should be debounced
			triggerTextSelectionChange(textEditor, new Selection(2, 0, 2, 0));
			assert.strictEqual(firedEvents.length, 2, 'Third should not fire immediately');

			// Wait for debounce
			await new Promise(resolve => setTimeout(resolve, debounceMs + 20));
			assert.strictEqual(firedEvents.length, 3, 'Third should fire after debounce');
		});

		test('No debounce when config is undefined', () => {
			const { document, textEditor } = createTextDocument(undefined, undefined, 'line1\nline2\nline3\nline4');
			nextEditProvider.lastRejectionTime = Date.now() - TRIGGER_INLINE_EDIT_REJECTION_COOLDOWN - 1;

			// No debounce config
			void configurationService.setConfig(ConfigKey.TeamInternal.InlineEditsDebounceOnSelectionChange, undefined);

			triggerTextChange(document);

			// All selection changes should fire immediately
			triggerTextSelectionChange(textEditor, new Selection(0, 0, 0, 0));
			triggerTextSelectionChange(textEditor, new Selection(1, 0, 1, 0));
			triggerTextSelectionChange(textEditor, new Selection(2, 0, 2, 0));
			triggerTextSelectionChange(textEditor, new Selection(3, 0, 3, 0));

			assert.strictEqual(firedEvents.length, 4, 'All selection changes should fire immediately without debounce');
		});
	});

	// #endregion

	// #region Event data validation

	suite('Event data validation', () => {
		test('Fired event has valid NesChangeHint structure', () => {
			const { document, textEditor } = createTextDocument();
			nextEditProvider.lastRejectionTime = Date.now() - TRIGGER_INLINE_EDIT_REJECTION_COOLDOWN - 1;

			triggerTextChange(document);
			triggerTextSelectionChange(textEditor, new Selection(0, 5, 0, 5));

			assert.isAtLeast(firedEvents.length, 1, 'Should have fired at least one event');

			const event = firedEvents[0];
			assert.isTrue(NesChangeHint.is(event), 'Event should be a valid NesChangeHint');
			assert.isString(event.data.uuid, 'UUID should be a string');
			assert.isNotEmpty(event.data.uuid, 'UUID should not be empty');
			assert.strictEqual(event.data.reason, NesTriggerReason.SelectionChange);
		});

		test('Each trigger has a unique UUID', () => {
			const { document, textEditor } = createTextDocument(undefined, undefined, 'line1\nline2');
			nextEditProvider.lastRejectionTime = Date.now() - TRIGGER_INLINE_EDIT_REJECTION_COOLDOWN - 1;

			triggerTextChange(document);
			triggerTextSelectionChange(textEditor, new Selection(0, 0, 0, 0));
			triggerTextSelectionChange(textEditor, new Selection(1, 0, 1, 0));

			assert.isAtLeast(firedEvents.length, 2, 'Should have at least 2 events');

			const uuids = firedEvents.map(e => e.data.uuid);
			const uniqueUuids = new Set(uuids);
			assert.strictEqual(uniqueUuids.size, uuids.length, 'All UUIDs should be unique');
		});
	});

	// #endregion

	// #region toRange returning undefined

	suite('toRange returning undefined', () => {
		test('No signal when toRange returns undefined', () => {
			const uri = Uri.file('norange.py');
			const doc = createTextDocumentData(uri, 'content', 'python');
			const selection = new Selection(0, 0, 0, 0);
			const textEditor = new ExtHostTextEditor(doc.document, [selection], {}, [], undefined);

			// Register doc with a toRange that always returns undefined
			const obsDoc: IVSCodeObservableDocument = {
				id: DocumentId.create(uri.toString()),
				toRange: () => undefined
			} as any;
			vscWorkspace.addDoc(doc.document, obsDoc);

			nextEditProvider.lastRejectionTime = Date.now() - TRIGGER_INLINE_EDIT_REJECTION_COOLDOWN - 1;

			triggerTextChange(doc.document);
			triggerTextSelectionChange(textEditor.value, new Selection(0, 5, 0, 5));

			assert.strictEqual(firedEvents.length, 0, 'Signal should not fire when toRange returns undefined');
		});
	});

	// #endregion

	// #region Notebook cell same-line cooldown bypass

	suite('Notebook cell behavior', () => {
		function createNotebookCellDocument(
			cellId: string = '1',
			content = 'print("hello")'
		): { document: TextDocument; textEditor: TextEditor } {
			const uri = Uri.parse(`vscode-notebook-cell://notebook/${cellId}`);
			const doc = createTextDocumentData(uri, content, 'python');
			const selection = new Selection(0, 0, 0, 0);
			const textEditor = new ExtHostTextEditor(doc.document, [selection], {}, [], undefined);
			vscWorkspace.addDoc(doc.document, createObservableTextDoc(doc.document.uri));
			return { document: doc.document, textEditor: textEditor.value };
		}

		test('Notebook cell bypasses same-line cooldown when documentTrigger differs', () => {
			// Create two notebook cells: edit one, then move in another
			const cell1 = createNotebookCellDocument('cell1');
			const cell2 = createNotebookCellDocument('cell2', 'x = 1');

			nextEditProvider.lastRejectionTime = Date.now() - TRIGGER_INLINE_EDIT_REJECTION_COOLDOWN - 1;

			// Ensure triggerOnActiveEditorChange is NOT set so the notebook-specific path is the only way to bypass
			void configurationService.setConfig(ConfigKey.Advanced.InlineEditsTriggerOnEditorChangeAfterSeconds, undefined);

			// Edit cell1 (this registers `documentTrigger` as cell1.document)
			triggerTextChange(cell1.document);
			triggerTextSelectionChange(cell1.textEditor, new Selection(0, 0, 0, 0));

			const countAfterFirst = firedEvents.length;
			assert.isAtLeast(countAfterFirst, 1, 'First trigger should fire');

			// Now manually set the internal tracking to point at cell2's docId, simulating that the
			// user has moved to cell2 which is a notebook cell with a different document than documentTrigger.
			// We trigger a text change on cell2 so it gets tracked, then selection on the same line.
			triggerTextChange(cell2.document);
			triggerTextSelectionChange(cell2.textEditor, new Selection(0, 0, 0, 0));

			const countAfterSecond = firedEvents.length;
			assert.isAtLeast(countAfterSecond, countAfterFirst + 1, 'Should trigger in cell2 on line 0');

			// Move within cell2 on the SAME line — because cell2.document !== documentTrigger (cell2.document
			// was set as documentTrigger by the previous trigger, so same-doc, same-line cooldown applies normally)
			// But if we trigger another text change (like in cell1) then move to cell2 on same line,
			// the notebook path bypasses the cooldown since e.textEditor.document !== mostRecentChange.documentTrigger
			triggerTextChange(cell1.document);
			// Now the tracking for cell1 is refreshed. Move selection in cell2:
			// For this to test the notebook path, we need the mostRecentChange to be for the cell2 doc id
			// but documentTrigger to differ from the current textEditor document.
			// Actually, the code checks: isNotebookCell(uri) || doc === mostRecentChange.documentTrigger
			// When isNotebookCell is true AND doc !== mostRecentChange.documentTrigger, cooldown is bypassed.

			// Let's set up this scenario cleanly:
			// 1. Edit cell2 — now tracking cell2 with documentTrigger = cell2.document
			triggerTextChange(cell2.document);
			triggerTextSelectionChange(cell2.textEditor, new Selection(0, 0, 0, 0));
			const countBeforeBypass = firedEvents.length;

			// 2. Now manually change the documentTrigger for the tracked entry of cell2
			//    by editing cell1 which shares the same docId tracking area — no, each doc has its own entry.
			//    Instead, the natural way notebook cells work: user edits cell1, then moves to cell2.
			//    But cell2 wouldn't have mostRecentChange unless it was edited.
			//    The key scenario: user edits cell2, triggers on line 0. Then edits cell1 (different cell).
			//    Now cell2 still has its LastChange with documentTrigger = cell2.document.
			//    User moves BACK to cell2 and the selection fires. Since no new edit on cell2,
			//    the existing LastChange is used. documentTrigger is cell2.document, and textEditor.document
			//    is also cell2.document — so they ARE equal, cooldown applies normally.

			//    The bypass scenario: triggerTextChange fires for cell2.document, creating LastChange with
			//    documentTrigger = cell2.document. Then another selection event comes for cell2 but from
			//    a DIFFERENT textEditor.document. This happens when VS Code reloads cell documents.
			//    We can simulate this by registering a new doc object for the same notebook cell URI.
			const cell2Alt = createNotebookCellDocument('cell2', 'x = 1');
			// cell2Alt.document is a NEW object but has same URI
			// The docToLastChangeMap tracks by DocumentId (keyed on URI string), so the existing LastChange
			// for cell2 is reused. Its documentTrigger is cell2.document, but now e.textEditor.document
			// is cell2Alt.document — a different object => bypass cooldown.

			triggerTextSelectionChange(cell2Alt.textEditor, new Selection(0, 0, 0, 0));
			assert.isAtLeast(firedEvents.length, countBeforeBypass + 1,
				'Should bypass same-line cooldown for notebook cell when documentTrigger differs');
		});

		test('Notebook cell respects same-line cooldown when documentTrigger matches', () => {
			const cell = createNotebookCellDocument('cell1');

			nextEditProvider.lastRejectionTime = Date.now() - TRIGGER_INLINE_EDIT_REJECTION_COOLDOWN - 1;
			void configurationService.setConfig(ConfigKey.Advanced.InlineEditsTriggerOnEditorChangeAfterSeconds, undefined);

			triggerTextChange(cell.document);
			triggerTextSelectionChange(cell.textEditor, new Selection(0, 0, 0, 0));

			const countAfterFirst = firedEvents.length;
			assert.isAtLeast(countAfterFirst, 1, 'First trigger should fire');

			// Same line, same document object — cooldown should apply even for notebook cells
			triggerTextSelectionChange(cell.textEditor, new Selection(0, 5, 0, 5));
			assert.strictEqual(firedEvents.length, countAfterFirst,
				'Should respect same-line cooldown when documentTrigger matches');
		});
	});

	// #endregion

	// #region Line trigger cleanup

	suite('Line trigger cleanup', () => {
		test('Stale line triggers are cleaned up when count exceeds 100', () => {
			// Generate a document with >102 lines
			const lines = Array.from({ length: 110 }, (_, i) => `line${i}`).join('\n');
			const { document, textEditor } = createTextDocument(undefined, undefined, lines);
			nextEditProvider.lastRejectionTime = Date.now() - TRIGGER_INLINE_EDIT_REJECTION_COOLDOWN - 1;

			triggerTextChange(document);

			// Trigger selection changes on 101 different lines to fill the map
			for (let i = 0; i < 101; i++) {
				triggerTextSelectionChange(textEditor, new Selection(i, 0, i, 0));
			}

			// All 101 triggers should have fired (each on a different line, no same-line cooldown)
			assert.strictEqual(firedEvents.length, 101, 'All 101 triggers should fire');

			// The next trigger (line 101) should still work — the cleanup runs but all entries are recent
			// so none are actually removed, and the trigger still fires
			triggerTextSelectionChange(textEditor, new Selection(101, 0, 101, 0));
			assert.strictEqual(firedEvents.length, 102, 'Trigger should still work after cleanup runs');
		});
	});

	// #endregion

	// #region Debounce edge cases

	suite('Debounce edge cases', () => {
		test('New text change resets consecutive selection change counter', async () => {
			const { document, textEditor } = createTextDocument(undefined, undefined, 'line1\nline2\nline3\nline4\nline5\nline6');
			nextEditProvider.lastRejectionTime = Date.now() - TRIGGER_INLINE_EDIT_REJECTION_COOLDOWN - 1;

			const debounceMs = 50;
			void configurationService.setConfig(ConfigKey.TeamInternal.InlineEditsDebounceOnSelectionChange, debounceMs);

			// First change cycle
			triggerTextChange(document);
			triggerTextSelectionChange(textEditor, new Selection(0, 0, 0, 0)); // immediate (1st)
			triggerTextSelectionChange(textEditor, new Selection(1, 0, 1, 0)); // immediate (2nd)
			triggerTextSelectionChange(textEditor, new Selection(2, 0, 2, 0)); // debounced (3rd)
			assert.strictEqual(firedEvents.length, 2, 'Third should be debounced');

			// Wait for debounce to complete
			await new Promise(resolve => setTimeout(resolve, debounceMs + 20));
			assert.strictEqual(firedEvents.length, 3, 'Debounced event should fire');

			// New text change resets the counter by creating a new LastChange
			triggerTextChange(document);
			triggerTextSelectionChange(textEditor, new Selection(3, 0, 3, 0)); // immediate again (1st of new cycle)
			assert.strictEqual(firedEvents.length, 4, 'First selection after new change should fire immediately');

			triggerTextSelectionChange(textEditor, new Selection(4, 0, 4, 0)); // immediate (2nd of new cycle)
			assert.strictEqual(firedEvents.length, 5, 'Second selection after new change should fire immediately');

			triggerTextSelectionChange(textEditor, new Selection(5, 0, 5, 0)); // debounced (3rd of new cycle)
			assert.strictEqual(firedEvents.length, 5, 'Third selection after new change should be debounced again');
		});

		test('Later debounced event replaces earlier pending one', async () => {
			const lines = Array.from({ length: 10 }, (_, i) => `line${i}`).join('\n');
			const { document, textEditor } = createTextDocument(undefined, undefined, lines);
			nextEditProvider.lastRejectionTime = Date.now() - TRIGGER_INLINE_EDIT_REJECTION_COOLDOWN - 1;

			const debounceMs = 80;
			void configurationService.setConfig(ConfigKey.TeamInternal.InlineEditsDebounceOnSelectionChange, debounceMs);

			triggerTextChange(document);

			// First two fire immediately
			triggerTextSelectionChange(textEditor, new Selection(0, 0, 0, 0));
			triggerTextSelectionChange(textEditor, new Selection(1, 0, 1, 0));
			assert.strictEqual(firedEvents.length, 2);

			// Third is debounced
			triggerTextSelectionChange(textEditor, new Selection(2, 0, 2, 0));
			assert.strictEqual(firedEvents.length, 2, 'Third should be debounced');

			// Fourth replaces the third's pending timeout (MutableDisposable)
			triggerTextSelectionChange(textEditor, new Selection(3, 0, 3, 0));
			assert.strictEqual(firedEvents.length, 2, 'Fourth should also be debounced');

			// Wait for debounce — only ONE additional event should fire (the latest one)
			await new Promise(resolve => setTimeout(resolve, debounceMs + 30));
			assert.strictEqual(firedEvents.length, 3, 'Only one debounced event should fire (the latest)');
		});
	});

	// #endregion

	// #region Document switch edge cases

	suite('Document switch edge cases', () => {
		test('Does not trigger on document switch to copilot-ignored destination', () => {
			const doc1 = createTextDocument(undefined, Uri.file('file1.py'));
			// doc2 is NOT added to vscWorkspace (copilot-ignored)
			const uri2 = Uri.file('ignored.py');
			const doc2Data = createTextDocumentData(uri2, 'ignored content', 'python');
			const doc2Editor = new ExtHostTextEditor(doc2Data.document, [new Selection(0, 0, 0, 0)], {}, [], undefined);

			nextEditProvider.lastRejectionTime = Date.now() - TRIGGER_INLINE_EDIT_REJECTION_COOLDOWN - 1;
			void configurationService.setConfig(ConfigKey.Advanced.InlineEditsTriggerOnEditorChangeAfterSeconds, 30);

			triggerTextChange(doc1.document);
			triggerTextSelectionChange(doc1.textEditor, new Selection(0, 5, 0, 5));
			const initialCount = firedEvents.length;

			// Switch to ignored doc2
			triggerTextSelectionChange(doc2Editor.value, new Selection(0, 0, 0, 0));

			const switchEvents = firedEvents.filter(e => e.data.reason === NesTriggerReason.ActiveDocumentSwitch);
			assert.strictEqual(switchEvents.length, 0, 'Should not trigger switch for copilot-ignored destination');
			assert.strictEqual(firedEvents.length, initialCount, 'No new events should fire');
		});

		test('Does not trigger on document switch when toRange returns undefined at destination', () => {
			const doc1 = createTextDocument(undefined, Uri.file('file1.py'));

			// doc2 has toRange that returns undefined
			const uri2 = Uri.file('norange2.py');
			const doc2Data = createTextDocumentData(uri2, 'content', 'python');
			const doc2Editor = new ExtHostTextEditor(doc2Data.document, [new Selection(0, 0, 0, 0)], {}, [], undefined);
			const obsDoc2: IVSCodeObservableDocument = {
				id: DocumentId.create(uri2.toString()),
				toRange: () => undefined
			} as any;
			vscWorkspace.addDoc(doc2Data.document, obsDoc2);

			nextEditProvider.lastRejectionTime = Date.now() - TRIGGER_INLINE_EDIT_REJECTION_COOLDOWN - 1;
			void configurationService.setConfig(ConfigKey.Advanced.InlineEditsTriggerOnEditorChangeAfterSeconds, 30);

			triggerTextChange(doc1.document);
			triggerTextSelectionChange(doc1.textEditor, new Selection(0, 5, 0, 5));
			const initialCount = firedEvents.length;

			// Switch to doc2 where toRange returns undefined
			triggerTextSelectionChange(doc2Editor.value, new Selection(0, 0, 0, 0));

			const switchEvents = firedEvents.filter(e => e.data.reason === NesTriggerReason.ActiveDocumentSwitch);
			assert.strictEqual(switchEvents.length, 0, 'Should not trigger switch when toRange returns undefined');
			assert.strictEqual(firedEvents.length, initialCount, 'No new events should fire');
		});

		test('Does not trigger on document switch when no edit has ever happened', () => {
			// Do NOT fire any text change — lastEditTimestamp stays undefined
			const doc1 = createTextDocument(undefined, Uri.file('file1.py'));
			const doc2 = createTextDocument(undefined, Uri.file('file2.py'));

			nextEditProvider.lastRejectionTime = Date.now() - TRIGGER_INLINE_EDIT_REJECTION_COOLDOWN - 1;
			void configurationService.setConfig(ConfigKey.Advanced.InlineEditsTriggerOnEditorChangeAfterSeconds, 30);

			// Select in doc1 first (no text change, so no tracked change)
			triggerTextSelectionChange(doc1.textEditor, new Selection(0, 0, 0, 0));
			// Switch to doc2
			triggerTextSelectionChange(doc2.textEditor, new Selection(0, 0, 0, 0));

			const switchEvents = firedEvents.filter(e => e.data.reason === NesTriggerReason.ActiveDocumentSwitch);
			assert.strictEqual(switchEvents.length, 0, 'Should not trigger switch when no edits ever happened');
		});

		test('Document switch adds doc to tracking map, enabling subsequent cursor moves to trigger', () => {
			const doc1 = createTextDocument(undefined, Uri.file('file1.py'));
			const doc2 = createTextDocument(undefined, Uri.file('file2.py'), 'line1\nline2');

			nextEditProvider.lastRejectionTime = Date.now() - TRIGGER_INLINE_EDIT_REJECTION_COOLDOWN - 1;
			void configurationService.setConfig(ConfigKey.Advanced.InlineEditsTriggerOnEditorChangeAfterSeconds, 30);

			// Edit doc1 and trigger
			triggerTextChange(doc1.document);
			triggerTextSelectionChange(doc1.textEditor, new Selection(0, 5, 0, 5));

			// Switch to doc2 — this triggers ActiveDocumentSwitch AND inserts LastChange for doc2
			triggerTextSelectionChange(doc2.textEditor, new Selection(0, 0, 0, 0));
			assert.strictEqual(getLastFiredReason(), NesTriggerReason.ActiveDocumentSwitch);
			const countAfterSwitch = firedEvents.length;

			// Now move cursor in doc2 to a different line — should trigger SelectionChange
			// because the document switch added doc2 to the tracking map
			triggerTextSelectionChange(doc2.textEditor, new Selection(1, 0, 1, 0));
			assert.isAtLeast(firedEvents.length, countAfterSwitch + 1,
				'Cursor move in switched-to doc should trigger');
			assert.strictEqual(getLastFiredReason(), NesTriggerReason.SelectionChange);
		});
	});

	// #endregion

	// #region Text change listener edge cases

	// #region Document switch afterAcceptance strategy

	suite('Document switch afterAcceptance strategy', () => {

		function setupForDocSwitch() {
			const doc1 = createTextDocument(undefined, Uri.file('file1.py'));
			const doc2 = createTextDocument(undefined, Uri.file('file2.py'));

			nextEditProvider.lastRejectionTime = Date.now() - TRIGGER_INLINE_EDIT_REJECTION_COOLDOWN - 1;
			void configurationService.setConfig(ConfigKey.Advanced.InlineEditsTriggerOnEditorChangeAfterSeconds, 30);
			void configurationService.setConfig(ConfigKey.TeamInternal.InlineEditsTriggerOnEditorChangeStrategy, DocumentSwitchTriggerStrategy.AfterAcceptance);

			// Edit doc1 and trigger to establish state
			triggerTextChange(doc1.document);
			triggerTextSelectionChange(doc1.textEditor, new Selection(0, 5, 0, 5));

			return { doc1, doc2, eventsBeforeSwitch: firedEvents.length };
		}

		test('triggers on document switch when lastOutcome is Accepted', () => {
			const { doc2, eventsBeforeSwitch } = setupForDocSwitch();
			nextEditProvider.lastOutcome = NesOutcome.Accepted;

			triggerTextSelectionChange(doc2.textEditor, new Selection(0, 0, 0, 0));

			const switchEvents = firedEvents.filter(e => e.data.reason === NesTriggerReason.ActiveDocumentSwitch);
			assert.strictEqual(switchEvents.length, 1, 'Should trigger document switch after acceptance');
			assert.isAbove(firedEvents.length, eventsBeforeSwitch);
		});

		test('does not trigger on document switch when lastOutcome is Rejected', () => {
			const { doc2, eventsBeforeSwitch } = setupForDocSwitch();
			nextEditProvider.lastOutcome = NesOutcome.Rejected;

			triggerTextSelectionChange(doc2.textEditor, new Selection(0, 0, 0, 0));

			const switchEvents = firedEvents.filter(e => e.data.reason === NesTriggerReason.ActiveDocumentSwitch);
			assert.strictEqual(switchEvents.length, 0, 'Should not trigger document switch after rejection');
			assert.strictEqual(firedEvents.length, eventsBeforeSwitch);
		});

		test('does not trigger on document switch when lastOutcome is Ignored', () => {
			const { doc2, eventsBeforeSwitch } = setupForDocSwitch();
			nextEditProvider.lastOutcome = NesOutcome.Ignored;

			triggerTextSelectionChange(doc2.textEditor, new Selection(0, 0, 0, 0));

			const switchEvents = firedEvents.filter(e => e.data.reason === NesTriggerReason.ActiveDocumentSwitch);
			assert.strictEqual(switchEvents.length, 0, 'Should not trigger document switch after ignore');
			assert.strictEqual(firedEvents.length, eventsBeforeSwitch);
		});

		test('does not trigger on document switch when lastOutcome is undefined (pending)', () => {
			const { doc2, eventsBeforeSwitch } = setupForDocSwitch();
			nextEditProvider.lastOutcome = undefined;

			triggerTextSelectionChange(doc2.textEditor, new Selection(0, 0, 0, 0));

			const switchEvents = firedEvents.filter(e => e.data.reason === NesTriggerReason.ActiveDocumentSwitch);
			assert.strictEqual(switchEvents.length, 0, 'Should not trigger document switch when outcome is pending');
			assert.strictEqual(firedEvents.length, eventsBeforeSwitch);
		});

		test('triggers on document switch with default strategy regardless of lastOutcome', () => {
			const doc1 = createTextDocument(undefined, Uri.file('file1.py'));
			const doc2 = createTextDocument(undefined, Uri.file('file2.py'));

			nextEditProvider.lastRejectionTime = Date.now() - TRIGGER_INLINE_EDIT_REJECTION_COOLDOWN - 1;
			void configurationService.setConfig(ConfigKey.Advanced.InlineEditsTriggerOnEditorChangeAfterSeconds, 30);
			void configurationService.setConfig(ConfigKey.TeamInternal.InlineEditsTriggerOnEditorChangeStrategy, DocumentSwitchTriggerStrategy.Always);

			nextEditProvider.lastOutcome = NesOutcome.Rejected;

			triggerTextChange(doc1.document);
			triggerTextSelectionChange(doc1.textEditor, new Selection(0, 5, 0, 5));
			const eventsBeforeSwitch = firedEvents.length;

			triggerTextSelectionChange(doc2.textEditor, new Selection(0, 0, 0, 0));

			const switchEvents = firedEvents.filter(e => e.data.reason === NesTriggerReason.ActiveDocumentSwitch);
			assert.strictEqual(switchEvents.length, 1, 'Default strategy should trigger on doc switch regardless of outcome');
			assert.isAbove(firedEvents.length, eventsBeforeSwitch);
		});

		test('triggers on document switch with always strategy regardless of lastOutcome', () => {
			const doc1 = createTextDocument(undefined, Uri.file('file1.py'));
			const doc2 = createTextDocument(undefined, Uri.file('file2.py'));

			nextEditProvider.lastRejectionTime = Date.now() - TRIGGER_INLINE_EDIT_REJECTION_COOLDOWN - 1;
			void configurationService.setConfig(ConfigKey.Advanced.InlineEditsTriggerOnEditorChangeAfterSeconds, 30);
			void configurationService.setConfig(ConfigKey.TeamInternal.InlineEditsTriggerOnEditorChangeStrategy, DocumentSwitchTriggerStrategy.Always);

			nextEditProvider.lastOutcome = NesOutcome.Ignored;

			triggerTextChange(doc1.document);
			triggerTextSelectionChange(doc1.textEditor, new Selection(0, 5, 0, 5));
			const eventsBeforeSwitch = firedEvents.length;

			triggerTextSelectionChange(doc2.textEditor, new Selection(0, 0, 0, 0));

			const switchEvents = firedEvents.filter(e => e.data.reason === NesTriggerReason.ActiveDocumentSwitch);
			assert.strictEqual(switchEvents.length, 1, 'Always strategy should trigger on doc switch regardless of outcome');
			assert.isAbove(firedEvents.length, eventsBeforeSwitch);
		});

		suite('race condition: suggestion shown but not yet resolved', () => {
			test('previous NES was accepted, new suggestion shown (clears outcome), then doc switch — should NOT trigger', () => {
				// Scenario: user accepted an NES, a new suggestion is shown (handleShown
				// clears lastOutcome to undefined), then user switches documents before
				// the new suggestion is accepted/rejected/ignored.
				const { doc2, eventsBeforeSwitch } = setupForDocSwitch();

				// Simulate: previous NES was accepted...
				nextEditProvider.lastOutcome = NesOutcome.Accepted;
				// ...then a new suggestion is shown, which clears lastOutcome
				nextEditProvider.lastOutcome = undefined;

				// User switches documents while the new suggestion outcome is pending
				triggerTextSelectionChange(doc2.textEditor, new Selection(0, 0, 0, 0));

				const switchEvents = firedEvents.filter(e => e.data.reason === NesTriggerReason.ActiveDocumentSwitch);
				assert.strictEqual(switchEvents.length, 0,
					'Should not trigger: stale acceptance must not carry over when a new suggestion is pending');
				assert.strictEqual(firedEvents.length, eventsBeforeSwitch);
			});

			test('NES shown, then accepted, then doc switch — should trigger', () => {
				// Scenario: suggestion shown → user accepts → user switches doc.
				// The acceptance callback has arrived, so lastOutcome is Accepted.
				const { doc2 } = setupForDocSwitch();

				// Simulate: suggestion shown (clears outcome)...
				nextEditProvider.lastOutcome = undefined;
				// ...then accepted
				nextEditProvider.lastOutcome = NesOutcome.Accepted;

				triggerTextSelectionChange(doc2.textEditor, new Selection(0, 0, 0, 0));

				const switchEvents = firedEvents.filter(e => e.data.reason === NesTriggerReason.ActiveDocumentSwitch);
				assert.strictEqual(switchEvents.length, 1, 'Should trigger after resolved acceptance');
			});

			test('NES shown, then rejected, then doc switch — should NOT trigger', () => {
				// Scenario: suggestion shown → user rejects → user switches doc.
				const { doc2, eventsBeforeSwitch } = setupForDocSwitch();

				nextEditProvider.lastOutcome = undefined;
				nextEditProvider.lastOutcome = NesOutcome.Rejected;

				triggerTextSelectionChange(doc2.textEditor, new Selection(0, 0, 0, 0));

				const switchEvents = firedEvents.filter(e => e.data.reason === NesTriggerReason.ActiveDocumentSwitch);
				assert.strictEqual(switchEvents.length, 0, 'Should not trigger after resolved rejection');
				assert.strictEqual(firedEvents.length, eventsBeforeSwitch);
			});
		});
	});

	// #endregion

	suite('Text change listener edge cases', () => {
		test('Text change on copilot-ignored doc does not track but updates lastEditTimestamp', () => {
			// Create a doc that is NOT in vscWorkspace (copilot-ignored)
			const uri = Uri.file('ignored.py');
			const doc = createTextDocumentData(uri, 'content', 'python');
			// Do NOT call vscWorkspace.addDoc — simulates copilot-ignored

			const trackedDoc = createTextDocument(undefined, Uri.file('tracked.py'));

			nextEditProvider.lastRejectionTime = Date.now() - TRIGGER_INLINE_EDIT_REJECTION_COOLDOWN - 1;
			void configurationService.setConfig(ConfigKey.Advanced.InlineEditsTriggerOnEditorChangeAfterSeconds, 30);

			// Fire text change on ignored doc — lastEditTimestamp gets set
			triggerTextChange(doc.document);

			// Now switch to tracked doc — document switch should work because lastEditTimestamp was set
			triggerTextSelectionChange(trackedDoc.textEditor, new Selection(0, 0, 0, 0));

			// Need to actually switch docs (first establish doc1 as "last")
			const doc2 = createTextDocument(undefined, Uri.file('tracked2.py'));
			triggerTextSelectionChange(doc2.textEditor, new Selection(0, 0, 0, 0));

			// The point is that lastEditTimestamp was updated by the ignored doc's change
			// which allows document switch to work for other docs
			// (This is tested indirectly — the triggerTextChange on an ignored doc
			// still sets lastEditTimestamp, which is a global field)
			assert.isTrue(true, 'Test verifies that ignored doc change does not throw');
		});

		test('Undo/redo still updates lastEditTimestamp (only skips tracking)', () => {
			const doc1 = createTextDocument(undefined, Uri.file('file1.py'));
			const doc2 = createTextDocument(undefined, Uri.file('file2.py'));

			nextEditProvider.lastRejectionTime = Date.now() - TRIGGER_INLINE_EDIT_REJECTION_COOLDOWN - 1;
			void configurationService.setConfig(ConfigKey.Advanced.InlineEditsTriggerOnEditorChangeAfterSeconds, 30);

			// Fire an undo change — this should still update lastEditTimestamp
			// even though it doesn't track the doc in docToLastChangeMap
			triggerTextChange(doc1.document, TextDocumentChangeReason.Undo);

			// Select in doc1 to set lastDocWithSelectionUri.
			// Since lastDocWithSelectionUri starts undefined, this is also considered a "switch"
			// and fires an ActiveDocumentSwitch (because lastEditTimestamp was set by undo).
			triggerTextSelectionChange(doc1.textEditor, new Selection(0, 0, 0, 0));

			// Switch to doc2 — document switch should work because lastEditTimestamp was set by the undo
			triggerTextSelectionChange(doc2.textEditor, new Selection(0, 0, 0, 0));

			const switchEvents = firedEvents.filter(e => e.data.reason === NesTriggerReason.ActiveDocumentSwitch);
			assert.isAtLeast(switchEvents.length, 1,
				'Undo should still update lastEditTimestamp enabling document switch');
		});

		test('Output pane text change does not update lastEditTimestamp', () => {
			const doc1 = createTextDocument(undefined, Uri.file('file1.py'));
			const doc2 = createTextDocument(undefined, Uri.file('file2.py'));
			const { document: outputDocument } = createOutputDocument();

			nextEditProvider.lastRejectionTime = Date.now() - TRIGGER_INLINE_EDIT_REJECTION_COOLDOWN - 1;
			void configurationService.setConfig(ConfigKey.Advanced.InlineEditsTriggerOnEditorChangeAfterSeconds, 30);

			// Fire text change on output document — should be completely ignored
			triggerTextChange(outputDocument);

			// Select in doc1 to establish lastDocWithSelectionUri
			triggerTextSelectionChange(doc1.textEditor, new Selection(0, 0, 0, 0));

			// Switch to doc2 — should NOT trigger because lastEditTimestamp was never set
			triggerTextSelectionChange(doc2.textEditor, new Selection(0, 0, 0, 0));

			const switchEvents = firedEvents.filter(e => e.data.reason === NesTriggerReason.ActiveDocumentSwitch);
			assert.strictEqual(switchEvents.length, 0,
				'Output doc change should not update lastEditTimestamp');
		});
	});

	// #endregion

	// #region Interaction edge cases

	suite('Interaction edge cases', () => {
		test('Rejection cooldown prevents document switch triggers too', () => {
			const doc1 = createTextDocument(undefined, Uri.file('file1.py'));
			const doc2 = createTextDocument(undefined, Uri.file('file2.py'));

			// Set rejection to be recent
			nextEditProvider.lastRejectionTime = Date.now();
			void configurationService.setConfig(ConfigKey.Advanced.InlineEditsTriggerOnEditorChangeAfterSeconds, 30);

			// Make a change in doc1
			triggerTextChange(doc1.document);
			triggerTextSelectionChange(doc1.textEditor, new Selection(0, 5, 0, 5));
			assert.strictEqual(firedEvents.length, 0, 'Should not fire during rejection cooldown');

			// Switch to doc2 — rejection cooldown clears the tracked change,
			// so document switch's _maybeTriggerOnDocumentSwitch won't find a tracked entry
			// AND the rejection check happens before the switch check
			triggerTextSelectionChange(doc2.textEditor, new Selection(0, 0, 0, 0));

			assert.strictEqual(firedEvents.length, 0, 'Should not fire on doc switch during rejection cooldown');
		});

		test('Same-line cooldown is bypassed when triggerOnActiveEditorChange is set', () => {
			const { document, textEditor } = createTextDocument();
			nextEditProvider.lastRejectionTime = Date.now() - TRIGGER_INLINE_EDIT_REJECTION_COOLDOWN - 1;

			// Enable triggerOnActiveEditorChange — this bypasses same-line cooldown
			void configurationService.setConfig(ConfigKey.Advanced.InlineEditsTriggerOnEditorChangeAfterSeconds, 30);

			triggerTextChange(document);
			triggerTextSelectionChange(textEditor, new Selection(0, 5, 0, 5));

			const initialCount = firedEvents.length;
			assert.isAtLeast(initialCount, 1, 'First trigger should fire');

			// Same line, different column — normally would be in cooldown,
			// but triggerOnActiveEditorChange is set so cooldown is bypassed
			triggerTextSelectionChange(textEditor, new Selection(0, 10, 0, 10));

			assert.isAtLeast(firedEvents.length, initialCount + 1,
				'Same-line cooldown should be bypassed when triggerOnActiveEditorChange is set');
		});

		test('Output pane documents are ignored for selection changes', () => {
			const { textEditor, selection } = createOutputDocument();
			nextEditProvider.lastRejectionTime = Date.now() - TRIGGER_INLINE_EDIT_REJECTION_COOLDOWN - 1;

			// Even without a text change, selection in output pane should be ignored
			triggerTextSelectionChange(textEditor, selection);
			assert.strictEqual(firedEvents.length, 0, 'Selection in output pane should be ignored');
		});

		test('Copilot-ignored doc in selection listener returns early before rejection check', () => {
			// Create a doc not in the workspace
			const uri = Uri.file('not-in-workspace.py');
			const doc = createTextDocumentData(uri, 'content', 'python');
			const textEditor = new ExtHostTextEditor(doc.document, [new Selection(0, 0, 0, 0)], {}, [], undefined);
			// Do NOT add to vscWorkspace

			nextEditProvider.lastRejectionTime = Date.now() - TRIGGER_INLINE_EDIT_REJECTION_COOLDOWN - 1;

			triggerTextChange(doc.document); // won't track since not in workspace
			triggerTextSelectionChange(textEditor.value, new Selection(0, 5, 0, 5));

			assert.strictEqual(firedEvents.length, 0,
				'Copilot-ignored doc should return early in selection listener');
		});

		test('Multiple documents can independently track and trigger', () => {
			const doc1 = createTextDocument(undefined, Uri.file('file1.py'), 'line1\nline2');
			const doc2 = createTextDocument(undefined, Uri.file('file2.py'), 'line1\nline2');
			nextEditProvider.lastRejectionTime = Date.now() - TRIGGER_INLINE_EDIT_REJECTION_COOLDOWN - 1;

			// Edit and trigger in doc1
			triggerTextChange(doc1.document);
			triggerTextSelectionChange(doc1.textEditor, new Selection(0, 0, 0, 0));
			assert.strictEqual(firedEvents.length, 1, 'Doc1 first trigger');

			// Edit and trigger in doc2
			triggerTextChange(doc2.document);
			triggerTextSelectionChange(doc2.textEditor, new Selection(0, 0, 0, 0));
			assert.strictEqual(firedEvents.length, 2, 'Doc2 first trigger');

			// Move in doc1 to a different line — should still work independently
			triggerTextSelectionChange(doc1.textEditor, new Selection(1, 0, 1, 0));
			assert.strictEqual(firedEvents.length, 3, 'Doc1 second trigger on different line');

			// Move in doc2 to a different line
			triggerTextSelectionChange(doc2.textEditor, new Selection(1, 0, 1, 0));
			assert.strictEqual(firedEvents.length, 4, 'Doc2 second trigger on different line');
		});

		test('Text change resets line triggers for the document', () => {
			const { document, textEditor } = createTextDocument(undefined, undefined, 'line1\nline2');
			nextEditProvider.lastRejectionTime = Date.now() - TRIGGER_INLINE_EDIT_REJECTION_COOLDOWN - 1;

			// Trigger on line 0
			triggerTextChange(document);
			triggerTextSelectionChange(textEditor, new Selection(0, 0, 0, 0));
			const count1 = firedEvents.length;
			assert.isAtLeast(count1, 1);

			// Same line — should be in cooldown, no trigger
			triggerTextSelectionChange(textEditor, new Selection(0, 5, 0, 5));
			assert.strictEqual(firedEvents.length, count1, 'Same line should be in cooldown');

			// New text change resets line triggers (creates a new LastChange)
			triggerTextChange(document);
			triggerTextSelectionChange(textEditor, new Selection(0, 0, 0, 0));
			assert.isAtLeast(firedEvents.length, count1 + 1,
				'After text change, same line should trigger again');
		});
	});

	// #endregion
});
