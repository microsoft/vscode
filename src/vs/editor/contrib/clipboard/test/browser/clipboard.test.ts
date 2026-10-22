/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { createStringDataTransferItem, IReadonlyVSDataTransfer, VSDataTransfer } from '../../../../../base/common/dataTransfer.js';
import { HierarchicalKind } from '../../../../../base/common/hierarchicalKind.js';
import { isNative } from '../../../../../base/common/platform.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IActionWidgetService } from '../../../../../platform/actionWidget/browser/actionWidget.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { TestClipboardService } from '../../../../../platform/clipboard/test/common/testClipboardService.js';
import { CommandsRegistry, ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IProgressService } from '../../../../../platform/progress/common/progress.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { InMemoryClipboardMetadataManager } from '../../../../browser/controller/editContext/clipboardUtils.js';
import { MultiCommand } from '../../../../browser/editorExtensions.js';
import { IBulkEditService, ResourceEdit, ResourceTextEdit } from '../../../../browser/services/bulkEditService.js';
import { Selection } from '../../../../common/core/selection.js';
import { Handler } from '../../../../common/editorCommon.js';
import { ILanguageService } from '../../../../common/languages/language.js';
import { WorkspaceEdit } from '../../../../common/languages.js';
import { ILanguageFeaturesService } from '../../../../common/services/languageFeatures.js';
import { ITestCodeEditor, TestCodeEditorInstantiationOptions, withAsyncTestCodeEditor } from '../../../../test/browser/testCodeEditor.js';
import { TestCommandService } from '../../../../test/browser/editorTestServices.js';
import { CopyAction, CutAction, PasteAction } from '../../browser/clipboard.js';
import { CopyPasteController } from '../../../dropOrPasteInto/browser/copyPasteController.js';
import { SnippetParser } from '../../../snippet/browser/snippetParser.js';

interface ClipboardTestContext {
	editor: ITestCodeEditor;
	clipboard: TestClipboardService;
	instantiationService: TestInstantiationService;
	run(command: MultiCommand | undefined): Promise<void>;
}

function textData(text: string): VSDataTransfer {
	const data = new VSDataTransfer();
	data.replace('text/plain', createStringDataTransferItem(text));
	return data;
}

async function withClipboardEditor(text: string, options: TestCodeEditorInstantiationOptions, callback: (context: ClipboardTestContext) => Promise<void>): Promise<void> {
	let failure: { error: unknown } | undefined;
	await withAsyncTestCodeEditor(text, { copyWithSyntaxHighlighting: false, ...options }, async (editor, _viewModel, instantiationService) => {
		sinon.stub(editor, 'hasTextFocus').returns(true);
		const clipboard = new TestClipboardService();
		instantiationService.stub(IClipboardService, clipboard);
		try {
			await callback({
				editor,
				clipboard,
				instantiationService,
				run: async command => {
					assert.ok(command);
					await instantiationService.invokeFunction(accessor => command.runCommand(accessor, undefined));
				},
			});
		} catch (error) {
			failure = { error };
		}
	});
	if (failure) {
		throw failure.error;
	}
}

suite('Editor clipboard commands', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	teardown(() => sinon.restore());

	test('registers cut and copy commands', () => {
		assert.deepStrictEqual([CutAction, CopyAction].map(action => action && CommandsRegistry.getCommand(action.id)?.id), [
			'editor.action.clipboardCutAction',
			'editor.action.clipboardCopyAction',
		]);
	});

	test('round trips multiple selections and copy hook metadata without in-memory metadata', async () => {
		await withClipboardEditor('one\ntwo\nthree', {}, async ({ editor, clipboard, run }) => {
			editor.setSelections([new Selection(1, 1, 1, 4), new Selection(3, 1, 3, 6)]);
			let copies = 0;
			let pastes = 0;
			let customData: string | undefined;
			disposables.add(editor.onWillCopy(event => {
				++copies;
				event.clipboardData.setData('application/x-test-copy', 'from copy hook');
			}));
			disposables.add(editor.onWillPaste(event => {
				++pastes;
				customData = event.clipboardData.getData('application/x-test-copy');
			}));
			const legacyPaste = sinon.spy(clipboard, 'triggerPaste');

			await run(CopyAction);
			const copiedData = await clipboard.readData();
			const copiedText = await copiedData?.get('text/plain')?.asString();
			const metadata = JSON.parse(await copiedData?.get('application/vnd.code.editor-data')?.asString() ?? '');
			InMemoryClipboardMetadataManager.INSTANCE.get('clear cached clipboard metadata');
			editor.setValue('A\nB');
			editor.setSelections([new Selection(1, 2, 1, 2), new Selection(2, 2, 2, 2)]);
			await run(PasteAction);

			assert.deepStrictEqual({
				copiedText,
				multicursorText: metadata.multicursorText,
				text: editor.getValue(),
				copies,
				pastes,
				customData,
				legacyPastes: legacyPaste.callCount,
			}, {
				copiedText: 'one\nthree',
				multicursorText: ['one', 'three'],
				text: 'Aone\nBthree',
				copies: 1,
				pastes: 1,
				customData: 'from copy hook',
				legacyPastes: 0,
			});
		});
	});

	test('preserves whole-line copy and paste', async () => {
		await withClipboardEditor('first\nsecond', {}, async ({ editor, run }) => {
			editor.setPosition({ lineNumber: 1, column: 3 });
			await run(CopyAction);
			editor.setPosition({ lineNumber: 2, column: 3 });
			await run(PasteAction);
			assert.strictEqual(editor.getValue(), 'first\nfirst\nsecond');
		});
	});

	test('does not copy an empty selection when empty-selection clipboard is disabled', async () => {
		await withClipboardEditor('unchanged', { emptySelectionClipboard: false }, async ({ editor, clipboard, run }) => {
			await clipboard.writeText('previous clipboard');
			const write = sinon.spy(clipboard, 'writeData');
			await run(CopyAction);
			await run(CutAction);
			assert.deepStrictEqual({
				text: editor.getValue(),
				clipboard: await clipboard.readText(),
				writes: write.callCount,
			}, {
				text: 'unchanged',
				clipboard: 'previous clipboard',
				writes: 0,
			});
		});
	});

	test('cuts only after the clipboard write succeeds and preserves undo', async () => {
		await withClipboardEditor('hello world', {}, async ({ editor, clipboard, run }) => {
			editor.setSelection(new Selection(1, 1, 1, 6));
			const written = new DeferredPromise<void>();
			sinon.stub(clipboard, 'writeData').returns(written.p);
			let cuts = 0;
			let copies = 0;
			disposables.add(editor.onWillCut(() => ++cuts));
			disposables.add(editor.onWillCopy(() => ++copies));

			const cut = run(CutAction);
			const beforeWrite = editor.getValue();
			written.complete();
			await cut;
			const afterWrite = editor.getValue();
			await editor.getModel().undo();
			assert.deepStrictEqual({ beforeWrite, afterWrite, afterUndo: editor.getValue(), cuts, copies }, {
				beforeWrite: 'hello world',
				afterWrite: ' world',
				afterUndo: 'hello world',
				cuts: 1,
				copies: 0,
			});
		});
	});

	test('a failed clipboard write never deletes the selection', async () => {
		await withClipboardEditor('keep this text', {}, async ({ editor, clipboard, run }) => {
			editor.setSelection(new Selection(1, 1, 1, 5));
			const error = new Error('Clipboard write failed');
			sinon.stub(clipboard, 'writeData').rejects(error);
			await assert.rejects(run(CutAction), err => err === error);
			assert.strictEqual(editor.getValue(), 'keep this text');
		});
	});

	test('a selection change during a pending cut does not delete a different selection', async () => {
		await withClipboardEditor('first second', {}, async ({ editor, clipboard, run }) => {
			editor.setSelection(new Selection(1, 1, 1, 6));
			const written = new DeferredPromise<void>();
			sinon.stub(clipboard, 'writeData').returns(written.p);
			const cut = run(CutAction);
			editor.setSelection(new Selection(1, 7, 1, 13));
			written.complete();
			await cut;
			assert.deepStrictEqual({ text: editor.getValue(), selection: editor.getSelection() }, {
				text: 'first second',
				selection: new Selection(1, 7, 1, 13),
			});
		});
	});

	test('pastes once with either input implementation', async () => {
		for (const editContext of [false, true]) {
			await withClipboardEditor('', { editContext }, async ({ editor, clipboard, run }) => {
				await clipboard.writeText('paste once');
				let pastes = 0;
				disposables.add(editor.onDidPaste(() => ++pastes));
				const legacyPaste = sinon.spy(clipboard, 'triggerPaste');
				await run(PasteAction);
				assert.deepStrictEqual({ text: editor.getValue(), pastes, legacyPastes: legacyPaste.callCount }, {
					text: 'paste once',
					pastes: 1,
					legacyPastes: 0,
				});
			});
		}
	});

	test('a handled paste is not applied a second time', async () => {
		await withClipboardEditor('', {}, async ({ editor, clipboard, run }) => {
			await clipboard.writeText('default');
			disposables.add(editor.onWillPaste(event => {
				event.setHandled();
				editor.trigger('keyboard', Handler.Paste, { text: 'handled' });
			}));
			await run(PasteAction);
			assert.strictEqual(editor.getValue(), 'handled');
		});
	});

	test('surfaces unexpected clipboard read failures without pasting', async () => {
		await withClipboardEditor('unchanged', {}, async ({ editor, clipboard, run }) => {
			const error = new Error('Clipboard read failed');
			sinon.stub(clipboard, 'readData').rejects(error);
			const legacyPaste = sinon.spy(clipboard, 'triggerPaste');
			await assert.rejects(run(PasteAction), err => err === error);
			assert.deepStrictEqual({ text: editor.getValue(), legacyPastes: legacyPaste.callCount }, {
				text: 'unchanged',
				legacyPastes: 0,
			});
		});
	});

	test('waits for prepared copy data and paste providers for Paste and Paste As', async () => {
		for (const { customMetadataAvailable, pasteAs } of [
			{ customMetadataAvailable: true, pasteAs: false },
			{ customMetadataAvailable: false, pasteAs: false },
			{ customMetadataAvailable: true, pasteAs: true },
			{ customMetadataAvailable: false, pasteAs: true },
		]) {
			await withClipboardEditor('source', { pasteAs: { enabled: true, showPasteSelector: 'never' } }, async ({ editor, clipboard, run, instantiationService }) => {
				instantiationService.stub(createDecorator<{ add(): () => void }>('IEditorCancelService'), { add: () => () => { } });
				instantiationService.stub(ICommandService, new TestCommandService(instantiationService));
				instantiationService.stub(IActionWidgetService, new class extends mock<IActionWidgetService>() { });
				instantiationService.stub(IQuickInputService, new class extends mock<IQuickInputService>() { });
				instantiationService.stub(IProgressService, new class extends mock<IProgressService>() {
					override withProgress: IProgressService['withProgress'] = (_options, task) => task({ report() { } });
				});
				instantiationService.stub(IBulkEditService, new class extends mock<IBulkEditService>() {
					override async apply(edit: ResourceEdit[] | WorkspaceEdit) {
						const edits = (Array.isArray(edit) ? edit : edit.edits).map(edit => {
							assert.ok(ResourceTextEdit.is(edit));
							return { range: edit.textEdit.range, text: new SnippetParser().parse(edit.textEdit.text).toString() };
						});
						editor.executeEdits('paste-provider-test', edits);
						return { isApplied: true, ariaSummary: '' };
					}
				});

				const prepared = new DeferredPromise<void>();
				const pasteStarted = new DeferredPromise<void>();
				const finishPaste = new DeferredPromise<void>();
				const mime = 'application/x-clipboard-test';
				const kind = new HierarchicalKind('clipboard.test');
				disposables.add(instantiationService.get(ILanguageFeaturesService).documentPasteEditProvider.register('*', {
					copyMimeTypes: [mime],
					pasteMimeTypes: [mime],
					providedPasteEditKinds: [kind],
					async prepareDocumentPaste(model, ranges) {
						const value = model.getValueInRange(ranges[0]);
						await prepared.p;
						const data = new VSDataTransfer();
						data.replace(mime, createStringDataTransferItem(`prepared:${value}`));
						return data;
					},
					async provideDocumentPasteEdits(_model, _selections, data) {
						pasteStarted.complete();
						await finishPaste.p;
						return {
							edits: [{ title: 'Test paste', insertText: `pasted:${await data.get(mime)?.asString()}`, kind }],
							dispose() { },
						};
					},
				}));
				const controller = editor.registerAndInstantiateContribution(CopyPasteController.ID, CopyPasteController);
				editor.setSelection(new Selection(1, 1, 1, 7));
				await run(CopyAction);
				if (!customMetadataAvailable) {
					await clipboard.writeText(await clipboard.readText());
				}
				editor.setValue('');
				let pasteFinished = false;
				const paste = (pasteAs ? controller.pasteAs({ only: kind }) : run(PasteAction)).then(() => { pasteFinished = true; });
				prepared.complete();
				try {
					await Promise.race([pasteStarted.p, paste.then(() => { throw new Error('Paste completed without invoking the provider'); })]);
					const beforeProviderFinished = { text: editor.getValue(), pasteFinished };
					finishPaste.complete();
					await paste;
					assert.deepStrictEqual({ beforeProviderFinished, text: editor.getValue(), pasteFinished }, {
						beforeProviderFinished: { text: '', pasteFinished: false },
						text: 'pasted:prepared:source',
						pasteFinished: true,
					}, JSON.stringify({ customMetadataAvailable, pasteAs }));
				} finally {
					if (!finishPaste.isSettled) {
						finishPaste.complete();
					}
					await paste;
				}
			});
		}
	});

	test('empty clipboard data and empty text are no-ops without a native paste fallback', async () => {
		for (const emptyData of [false, true]) {
			await withClipboardEditor('keep', {}, async ({ editor, clipboard, run }) => {
				await clipboard.writeData(emptyData ? new VSDataTransfer() : textData(''));
				editor.setSelection(new Selection(1, 1, 1, 5));
				const legacyPaste = sinon.spy(clipboard, 'triggerPaste');
				await run(PasteAction);
				assert.deepStrictEqual({ text: editor.getValue(), legacyPastes: legacyPaste.callCount }, {
					text: 'keep',
					legacyPastes: 0,
				});
			});
		}
	});

	test('does not paste into a read-only editor', async () => {
		await withClipboardEditor('read only', { readOnly: true }, async ({ editor, clipboard, run }) => {
			await clipboard.writeText('not inserted');
			await run(PasteAction);
			assert.strictEqual(editor.getValue(), 'read only');
		});
	});

	test('uses the current selection when a pending clipboard read finishes', async () => {
		await withClipboardEditor('first second', {}, async ({ editor, clipboard, run }) => {
			editor.setSelection(new Selection(1, 1, 1, 6));
			const read = new DeferredPromise<IReadonlyVSDataTransfer>();
			sinon.stub(clipboard, 'readData').returns(read.p);
			const paste = run(PasteAction);
			editor.setSelection(new Selection(1, 7, 1, 13));
			read.complete(textData('replacement'));
			await paste;
			assert.strictEqual(editor.getValue(), 'first replacement');
		});
	});

	test('does not cancel a pending clipboard read when another paste starts', async () => {
		await withClipboardEditor('', {}, async ({ editor, clipboard, run }) => {
			const first = new DeferredPromise<IReadonlyVSDataTransfer>();
			const second = new DeferredPromise<IReadonlyVSDataTransfer>();
			sinon.stub(clipboard, 'readData').onFirstCall().returns(first.p).onSecondCall().returns(second.p);
			const oldPaste = run(PasteAction);
			const newPaste = run(PasteAction);
			second.complete(textData('new'));
			await newPaste;
			first.complete(textData('old'));
			await oldPaste;
			assert.strictEqual(editor.getValue(), 'newold');
		});
	});

	test('copy with syntax highlighting overrides the setting and the automatic size limit', async () => {
		const text = 'x'.repeat(65537);
		await withClipboardEditor(text, {}, async ({ editor, clipboard, instantiationService }) => {
			disposables.add(instantiationService.get(ILanguageService).registerLanguage({ id: 'clipboard-test' }));
			editor.getModel().setLanguage('clipboard-test');
			sinon.stub(instantiationService.get(IContextKeyService), 'contextMatchesRules').callsFake(rules => !rules);
			editor.setSelection(new Selection(1, 1, 1, text.length + 1));
			const action = editor.getAction('editor.action.clipboardCopyWithSyntaxHighlightingAction');
			assert.ok(action);
			await action.run();
			const data = await clipboard.readData();
			assert.deepStrictEqual({
				textMatches: await data?.get('text/plain')?.asString() === text,
				hasHtml: data?.has('text/html'),
			}, {
				textMatches: true,
				hasHtml: true,
			});
		});
	});

	if (isNative) {
		test('uses the native text clipboard only when Clipboard API writes are unavailable', async () => {
			await withClipboardEditor('copy this', {}, async ({ editor, clipboard, run }) => {
				editor.setSelection(new Selection(1, 1, 1, 5));
				sinon.stub(clipboard, 'writeData').rejects(new DOMException('Document is not focused', 'NotAllowedError'));
				const writeText = sinon.spy(clipboard, 'writeText');
				await run(CutAction);
				assert.deepStrictEqual({
					text: editor.getValue(),
					clipboard: await clipboard.readText(),
					nativeWrites: writeText.callCount,
				}, {
					text: ' this',
					clipboard: 'copy',
					nativeWrites: 1,
				});
			});
		});

		test('uses one native paste event when Clipboard API reads are unavailable', async () => {
			await withClipboardEditor('', {}, async ({ clipboard, run }) => {
				sinon.stub(clipboard, 'readData').rejects(new DOMException('Document is not focused', 'NotAllowedError'));
				const legacyPaste = sinon.spy(clipboard, 'triggerPaste');
				await run(PasteAction);
				assert.strictEqual(legacyPaste.callCount, 1);
			});
		});

		test('uses the native paste event only for unsupported native formats', async () => {
			await withClipboardEditor('', {}, async ({ clipboard, run }) => {
				sinon.stub(clipboard, 'readData').resolves(undefined);
				const legacyPaste = sinon.spy(clipboard, 'triggerPaste');
				await run(PasteAction);
				assert.strictEqual(legacyPaste.callCount, 1);
			});
		});
	}
});
