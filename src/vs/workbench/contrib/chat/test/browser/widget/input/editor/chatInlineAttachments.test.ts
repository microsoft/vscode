/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../../../../base/browser/dom.js';
import { timeout } from '../../../../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../../base/test/common/utils.js';
import { EditorAutoIndentStrategy } from '../../../../../../../../editor/common/config/editorOptions.js';
import { Position } from '../../../../../../../../editor/common/core/position.js';
import { Range } from '../../../../../../../../editor/common/core/range.js';
import { Selection } from '../../../../../../../../editor/common/core/selection.js';
import { MoveLinesCommand } from '../../../../../../../../editor/contrib/linesOperations/browser/moveLinesCommand.js';
import { CopyLinesCommand } from '../../../../../../../../editor/contrib/linesOperations/browser/copyLinesCommand.js';
import { createCodeEditorServices, instantiateTestCodeEditor, ITestCodeEditor } from '../../../../../../../../editor/test/browser/testCodeEditor.js';
import { instantiateTextModel } from '../../../../../../../../editor/test/common/testTextModel.js';
import { IConfigurationService } from '../../../../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../../../../platform/contextkey/common/contextkey.js';
import { TestConfigurationService } from '../../../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IFileService, IFileSystemWatcher } from '../../../../../../../../platform/files/common/files.js';
import { ServiceCollection } from '../../../../../../../../platform/instantiation/common/serviceCollection.js';
import { TestInstantiationService } from '../../../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILabelService } from '../../../../../../../../platform/label/common/label.js';
import { ISharedWebContentExtractorService } from '../../../../../../../../platform/webContentExtractor/common/webContentExtractor.js';
import { ChatAttachmentModel } from '../../../../../browser/attachments/chatAttachmentModel.js';
import { ChatDynamicVariableModel } from '../../../../../browser/attachments/chatDynamicVariables.js';
import { IChatAttachmentResolveService } from '../../../../../browser/attachments/chatAttachmentResolveService.js';
import { IChatWidget } from '../../../../../browser/chat.js';
import { ChatInlineAttachments } from '../../../../../browser/widget/input/editor/chatInlineAttachments.js';
import { IChatWidgetContrib } from '../../../../../browser/widget/chatWidget.js';
import { ChatContextKeys } from '../../../../../common/actions/chatContextKeys.js';
import { IChatRequestVariableEntry } from '../../../../../common/attachments/chatVariableEntries.js';
import { IDynamicVariable, toAttachedContextDynamicVariable } from '../../../../../common/attachments/chatVariables.js';
import { ChatConfiguration } from '../../../../../common/constants.js';
import { IParsedChatRequest } from '../../../../../common/requestParser/chatParserTypes.js';

suite('ChatInlineAttachments', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	interface ITestInput {
		readonly editor: ITestCodeEditor;
		readonly attachments: ChatAttachmentModel;
		readonly controller: ChatInlineAttachments;
		readonly instantiationService: TestInstantiationService;
		/** Adds a reference to the input, as accepting a completion does. */
		addReference(reference: IDynamicVariable): void;
		/** Whether the pill right before the cursor is active, which Enter opens. */
		isActive(): boolean;
		/** The prompt that the input stands for, and the ids of its attachments. */
		state(): { prompt: string; attachments: string[] };
	}

	/**
	 * @param showsPills Whether the input's host shows pills, which a host
	 * whose chat widget does not own the input, such as the Automation dialog's,
	 * does not.
	 */
	function createInput(text: string, showsPills = true): ITestInput {
		const disposables = store.add(new DisposableStore());
		const configurationService = new TestConfigurationService({ [ChatConfiguration.InlineAttachmentsEnabled]: true });
		const instantiationService = createCodeEditorServices(disposables, new ServiceCollection([IConfigurationService, configurationService]));
		instantiationService.stub(ILabelService, new class extends mock<ILabelService>() {
			override getUriLabel(uri: URI): string { return uri.path; }
		});
		instantiationService.stub(IFileService, new class extends mock<IFileService>() {
			override createWatcher(): IFileSystemWatcher { return { onDidChange: Event.None, dispose: () => { } }; }
		});
		instantiationService.stub(ISharedWebContentExtractorService, new class extends mock<ISharedWebContentExtractorService>() { });
		instantiationService.stub(IChatAttachmentResolveService, new class extends mock<IChatAttachmentResolveService>() { });

		const model = disposables.add(instantiateTextModel(instantiationService, text));
		const editor = disposables.add(instantiateTestCodeEditor(instantiationService, model));
		const attachments = disposables.add(instantiationService.createInstance(ChatAttachmentModel));
		const onDidChangeParsedInput = disposables.add(new Emitter<void>());
		const onDidChangeReferences = disposables.add(new Emitter<void>());
		const references: IDynamicVariable[] = [];
		const dynamicVariableModel = upcastPartial<ChatDynamicVariableModel>({
			variables: references,
			onDidChangeReferences: onDidChangeReferences.event,
			addReference: reference => {
				references.push(reference);
				onDidChangeReferences.fire();
			},
		});
		const widget = new class extends mock<IChatWidget>() {
			override readonly inputEditor = editor;
			override readonly parsedInput: IParsedChatRequest = { text: '', parts: [] };
			override readonly onDidChangeParsedInput = onDidChangeParsedInput.event;
			override getContrib<T extends IChatWidgetContrib>(id: string): T | undefined {
				return id === ChatDynamicVariableModel.ID ? dynamicVariableModel as IChatWidgetContrib as T : undefined;
			}
			override refreshParsedInput(): void { }
		};
		const controller = disposables.add(instantiationService.createInstance(ChatInlineAttachments, editor, attachments, {
			widget: showsPills ? widget : undefined,
			createAttachmentWidget: (attachment: IChatRequestVariableEntry, container: HTMLElement) => {
				const element = dom.append(container, dom.$('span.chat-attached-context-attachment', undefined, attachment.name));
				return { element, onDidDelete: Event.None, onDidOpen: Event.None, dispose: () => element.remove() };
			},
			removeAttachments: (removed: readonly IChatRequestVariableEntry[]) => attachments.delete(...removed.map(attachment => attachment.id)),
		}));

		return {
			editor,
			attachments,
			controller,
			instantiationService,
			addReference: reference => dynamicVariableModel.addReference(reference),
			isActive: () => !!editor.invokeWithinContext(accessor => accessor.get(IContextKeyService).getContextKeyValue<boolean>(ChatContextKeys.inputInlineAttachmentActive.key)),
			state: () => ({
				prompt: controller.project()?.text ?? editor.getValue(),
				attachments: attachments.attachments.map(attachment => attachment.id),
			}),
		};
	}

	function file(name: string): IChatRequestVariableEntry {
		return { kind: 'file', id: `file:${name}`, name, value: URI.file(`/${name}`) };
	}

	/** Lets the pills catch up with the input, which they do once the current task settled. */
	function settle(): Promise<void> {
		return timeout(0);
	}

	test('moving a line moves the pills on it, and undo moves them back', async () => {
		const input = createInput('summarize\nreview ');
		input.editor.setPosition(new Position(2, 8));
		input.attachments.addContext(file('a.ts'));
		await settle();
		const added = input.state();

		input.editor.setPosition(new Position(1, 1));
		input.editor.executeCommand('test', input.instantiationService.createInstance(MoveLinesCommand, input.editor.getSelection()!, true, EditorAutoIndentStrategy.None));
		await settle();
		const moved = input.state();

		input.editor.getModel()!.undo();
		await settle();
		const undone = input.state();

		assert.deepStrictEqual({ added, moved, undone }, {
			added: { prompt: 'summarize\nreview #attachment:a.ts ', attachments: ['file:a.ts'] },
			moved: { prompt: 'review #attachment:a.ts \nsummarize', attachments: ['file:a.ts'] },
			undone: { prompt: 'summarize\nreview #attachment:a.ts ', attachments: ['file:a.ts'] },
		});
	});

	test('undo brings back the pill that the undone edit removed, rather than one removed later at the same place', async () => {
		const input = createInput('fix ');
		input.editor.setPosition(new Position(1, 5));
		input.attachments.addContext(file('a.ts'));
		await settle();

		// Delete the pill and the space after it, as Backspace would.
		input.editor.executeEdits('test', [{ range: new Range(1, 5, 1, 7), text: '' }]);
		input.editor.pushUndoStop();
		await settle();
		const removed = input.state();

		input.attachments.addContext(file('b.ts'));
		await settle();
		const replaced = input.state();

		input.editor.getModel()!.undo();
		await settle();
		const undoneAdd = input.state();

		input.editor.getModel()!.undo();
		await settle();
		const undoneRemove = input.state();

		input.editor.getModel()!.redo();
		await settle();
		const redoneRemove = input.state();

		assert.deepStrictEqual({ removed, replaced, undoneAdd, undoneRemove, redoneRemove }, {
			removed: { prompt: 'fix ', attachments: [] },
			replaced: { prompt: 'fix #attachment:b.ts ', attachments: ['file:b.ts'] },
			undoneAdd: { prompt: 'fix ', attachments: [] },
			undoneRemove: { prompt: 'fix #attachment:a.ts ', attachments: ['file:a.ts'] },
			redoneRemove: { prompt: 'fix ', attachments: [] },
		});
	});

	test('undo brings back a pill whose attachment was removed, along with the attachment', async () => {
		const input = createInput('explain ');
		input.editor.setPosition(new Position(1, 9));
		input.attachments.addContext(file('a.ts'));
		await settle();

		input.attachments.delete('file:a.ts');
		await settle();
		const removed = input.state();

		input.editor.getModel()!.undo();
		await settle();
		const undone = input.state();

		assert.deepStrictEqual({ removed, undone }, {
			removed: { prompt: 'explain ', attachments: [] },
			undone: { prompt: 'explain #attachment:a.ts ', attachments: ['file:a.ts'] },
		});
	});

	test('shows an attachment inline only once a pill stands for it', async () => {
		const withPills = createInput('explain ');
		const withoutPills = createInput('explain ', false);
		const attachment = file('a.ts');
		for (const input of [withPills, withoutPills]) {
			input.editor.setPosition(new Position(1, 9));
			input.attachments.addContext(attachment);
		}
		const beforePill = withPills.controller.isShownInline(attachment);
		await settle();

		assert.deepStrictEqual({
			beforePill,
			withPills: { input: withPills.editor.getValue(), shownInline: withPills.controller.isShownInline(attachment) },
			withoutPills: { input: withoutPills.editor.getValue(), shownInline: withoutPills.controller.isShownInline(attachment) },
		}, {
			beforePill: false,
			withPills: { input: 'explain \uFFFC ', shownInline: true },
			withoutPills: { input: 'explain ', shownInline: false },
		});
	});

	test('copying a line copies the pills on it, which stand for the same attachment', async () => {
		const input = createInput('review ');
		input.editor.setPosition(new Position(1, 8));
		input.attachments.addContext(file('a.ts'));
		await settle();

		input.editor.setPosition(new Position(1, 1));
		input.editor.executeCommand('test', new CopyLinesCommand(input.editor.getSelection()!, true));
		await settle();
		const copied = input.state();

		input.editor.getModel()!.undo();
		await settle();
		const undone = input.state();

		input.editor.getModel()!.redo();
		await settle();
		const redone = input.state();

		assert.deepStrictEqual({ copied, undone, redone }, {
			copied: { prompt: 'review #attachment:a.ts \nreview #attachment:a.ts ', attachments: ['file:a.ts'] },
			undone: { prompt: 'review #attachment:a.ts ', attachments: ['file:a.ts'] },
			redone: { prompt: 'review #attachment:a.ts \nreview #attachment:a.ts ', attachments: ['file:a.ts'] },
		});
	});

	test('undoing the pills that mentions became leaves each mention standing for its attachment', async () => {
		const input = createInput('');
		input.editor.executeEdits('test', [{ range: new Range(1, 1, 1, 1), text: '#attachment:a.ts #attachment:b.ts' }]);
		input.editor.pushUndoStop();
		input.attachments.addContext(file('a.ts'), file('b.ts'));
		await settle();
		const collapsed = { input: input.editor.getValue(), ...input.state() };

		input.editor.getModel()!.undo();
		await settle();
		const undone = { input: input.editor.getValue(), ...input.state() };

		assert.deepStrictEqual({ collapsed, undone }, {
			collapsed: { input: '\uFFFC \uFFFC', prompt: '#attachment:a.ts #attachment:b.ts', attachments: ['file:a.ts', 'file:b.ts'] },
			undone: { input: '#attachment:a.ts #attachment:b.ts', prompt: '#attachment:a.ts #attachment:b.ts', attachments: ['file:a.ts', 'file:b.ts'] },
		});
	});

	test('the prompt for the model reads each pill as the name and location of its attachment, which is attached once', async () => {
		const input = createInput('review ');
		input.editor.setPosition(new Position(1, 8));
		input.attachments.addContext(file('a.ts'));
		await settle();
		input.editor.setPosition(new Position(1, 1));
		input.editor.executeCommand('test', new CopyLinesCommand(input.editor.getSelection()!, true));
		await settle();

		const forModel = input.controller.project([], { forModel: true });
		const persisted = input.controller.project();
		assert.deepStrictEqual({
			text: persisted?.text,
			forModel: forModel?.references.map(reference => [reference.id, reference.promptText]),
			persisted: persisted?.references.map(reference => [reference.id, reference.promptText]),
			attachments: input.state().attachments,
		}, {
			text: 'review #attachment:a.ts \nreview #attachment:a.ts ',
			forModel: [['file:a.ts', '[a.ts](file:///a.ts)'], ['file:a.ts', '[a.ts](file:///a.ts)']],
			persisted: [['file:a.ts', undefined], ['file:a.ts', undefined]],
			attachments: ['file:a.ts'],
		});
	});

	test('shows images inline', async () => {
		const input = createInput('look at ');
		input.editor.setPosition(new Position(1, 9));
		const image: IChatRequestVariableEntry = { kind: 'image', id: 'image', name: 'Pasted Image', value: new Uint8Array([1]) };
		input.attachments.addContext(image);
		await settle();

		assert.deepStrictEqual({
			input: input.editor.getValue(),
			...input.state(),
			shownInline: input.controller.isShownInline(image),
			forModel: input.controller.project([], { forModel: true })?.references.map(reference => reference.promptText),
		}, {
			input: 'look at \uFFFC ',
			prompt: 'look at #attachment:Pasted Image ',
			attachments: ['image'],
			shownInline: true,
			forModel: ['Pasted Image'],
		});
	});

	test('a completion that becomes a pill leaves the cursor right after the pill, which it highlights', async () => {
		const complete = async (insertText: string) => {
			const input = createInput('fix ');
			input.editor.setPosition(new Position(1, 5));
			// A completion inserts the text of a reference, and then adds the reference.
			input.editor.executeEdits('snippet', [{ range: new Range(1, 5, 1, 5), text: insertText }], () => [new Selection(1, 5 + insertText.length, 1, 5 + insertText.length)]);
			const referenceText = insertText.trimEnd();
			input.addReference({ id: 'file:///a.ts', range: new Range(1, 5, 1, 5 + referenceText.length), data: URI.file('/a.ts'), isFile: true });
			await settle();
			return { input: input.editor.getValue(), cursor: input.editor.getPosition()?.toString(), active: input.isActive() };
		};

		assert.deepStrictEqual({
			withSpace: await complete('#file:a.ts '),
			withoutSpace: await complete('#a.ts'),
		}, {
			withSpace: { input: 'fix \uFFFC', cursor: '(1,6)', active: true },
			withoutSpace: { input: 'fix \uFFFC', cursor: '(1,6)', active: true },
		});
	});

	test('undo brings back every pill that an edit removed', async () => {
		const input = createInput('');
		input.attachments.addContext(...Array.from({ length: 60 }, (_, i) => file(`f${i}.ts`)));
		await settle();
		const added = input.state().attachments.length;

		const model = input.editor.getModel()!;
		input.editor.executeEdits('test', [{ range: model.getFullModelRange(), text: '' }]);
		input.editor.pushUndoStop();
		await settle();
		const removed = input.state().attachments.length;

		model.undo();
		await settle();
		const undone = input.state();

		assert.deepStrictEqual({ added, removed, undone: undone.attachments.length, mentions: undone.prompt.split('#attachment:').length - 1 }, { added: 60, removed: 0, undone: 60, mentions: 60 });
	});

	test('finds the references that pills stand for, from the edit that adds the pills until their anchors are removed', async () => {
		// As the Integrated Browser comments on an element: it attaches the element, mentions it, and follows the mention with the comment.
		const input = createInput('');
		const element = file('a.ts');
		input.attachments.addContext(element);
		input.editor.executeEdits('comment', [{ range: new Range(1, 1, 1, 1), text: '@a.ts fix like #file:b.ts' }]);
		input.addReference(toAttachedContextDynamicVariable(element, new Range(1, 1, 1, 6)));
		input.addReference({ id: 'file:///b.ts', range: new Range(1, 16, 1, 26), data: URI.file('/b.ts'), isFile: true });
		input.editor.setPosition(new Position(1, 26));
		const pillReferences = () => input.controller.getPillReferences().map(reference => `${reference.id} ${Range.lift(reference.range)}${reference.isAttachmentReference ? ' attachment' : ''}`);
		// The input's references change while the pills replace their text, before the pills exist.
		const whileReplaced: string[][] = [];
		const listener = input.editor.onDidChangeModelContent(() => whileReplaced.push(pillReferences()));
		await settle();
		listener.dispose();
		const model = input.editor.getModel()!;
		const pills = { input: model.getValue(), references: pillReferences(), comment: input.controller.getPromptText(new Range(1, 2, 1, model.getLineMaxColumn(1))) };
		input.editor.executeEdits('test', [{ range: model.getFullModelRange(), text: '' }]);

		assert.deepStrictEqual({ whileReplaced, pills, removed: pillReferences() }, {
			whileReplaced: [['file:a.ts [1,1 -> 1,2] attachment', 'file:///b.ts [1,12 -> 1,13]']],
			pills: { input: '\uFFFC fix like \uFFFC', references: ['file:a.ts [1,1 -> 1,2] attachment', 'file:///b.ts [1,12 -> 1,13]'], comment: ' fix like #file:b.ts' },
			removed: [],
		});
		await settle();
	});
});
