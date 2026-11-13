/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { DeferredPromise } from '../../../../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../../../../base/common/observable.js';
import { URI } from '../../../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../../base/test/common/utils.js';
import { IEditorMouseEvent, MouseTargetType } from '../../../../../../../../editor/browser/editorBrowser.js';
import { ICodeEditorService } from '../../../../../../../../editor/browser/services/codeEditorService.js';
import { Position } from '../../../../../../../../editor/common/core/position.js';
import { Range } from '../../../../../../../../editor/common/core/range.js';
import { OffsetRange } from '../../../../../../../../editor/common/core/ranges/offsetRange.js';
import { Selection } from '../../../../../../../../editor/common/core/selection.js';
import { IDecorationOptions } from '../../../../../../../../editor/common/editorCommon.js';
import { withTestCodeEditor } from '../../../../../../../../editor/test/browser/testCodeEditor.js';
import { isIMenuItem, MenuId, MenuRegistry } from '../../../../../../../../platform/actions/common/actions.js';
import { agentHostConnectionKinds } from '../../../../../../../../platform/agentHost/test/common/testAgentHostResourceUriMappers.js';
import { CommandsRegistry } from '../../../../../../../../platform/commands/common/commands.js';
import { TestConfigurationService } from '../../../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../../../../platform/contextkey/browser/contextKeyService.js';
import { IResourceEditorInput } from '../../../../../../../../platform/editor/common/editor.js';
import { TestInstantiationService } from '../../../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILabelService } from '../../../../../../../../platform/label/common/label.js';
import { TestThemeService } from '../../../../../../../../platform/theme/test/common/testThemeService.js';
import { IEditorService } from '../../../../../../../services/editor/common/editorService.js';
import { IChatWidget, IChatWidgetService } from '../../../../../browser/chat.js';
import { ChatWidget } from '../../../../../browser/widget/chatWidget.js';
import '../../../../../browser/widget/input/editor/chatInputEditorContrib.js';
import { ChatContextKeys } from '../../../../../common/actions/chatContextKeys.js';
import { AgentHostCompletionReferenceKind, IChatRequestVariableEntry, toAgentHostCompletionVariableEntry } from '../../../../../common/attachments/chatVariableEntries.js';
import { IChatMode } from '../../../../../common/chatModes.js';
import { ICustomizationHarnessService } from '../../../../../common/customizationHarnessService.js';
import { IChatAgentService } from '../../../../../common/participants/chatAgents.js';
import { IPromptsService, IResolvedChatPromptSlashCommand } from '../../../../../common/promptSyntax/service/promptsService.js';
import { ChatRequestDynamicVariablePart, ChatRequestSlashPromptPart, ChatRequestTextPart, IParsedChatRequestPart } from '../../../../../common/requestParser/chatParserTypes.js';
import { ChatRequestParser } from '../../../../../common/requestParser/chatRequestParser.js';
import { IChatVariablesService } from '../../../../../common/attachments/chatVariables.js';
import { IChatSlashCommandService } from '../../../../../common/participants/chatSlashCommands.js';
import { IChatRequestViewModel } from '../../../../../common/model/chatViewModel.js';
import { ToolAndToolSetEnablementMap } from '../../../../../common/tools/languageModelToolsService.js';
import { messageAttachmentsToVariableData } from '../../../../../browser/agentSessions/agentHost/stateToProgressAdapter.js';
import { MessageAttachmentKind } from '../../../../../../../../platform/agentHost/common/state/protocol/state.js';

suite('ChatTokenDeleter', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function getChatTokenDeleterCtor() {
		const ctor = ChatWidget.CONTRIBS.find(contrib => contrib.name === 'ChatTokenDeleter');
		assert.ok(ctor, 'ChatTokenDeleter should be registered as a chat widget contribution');
		return ctor;
	}

	function createWidget(editor: IChatWidget['inputEditor'], onRefreshParsedInput: () => void): IChatWidget {
		return {
			inputEditor: editor,
			refreshParsedInput: onRefreshParsedInput,
		} as unknown as IChatWidget;
	}

	test('deletes inserted slash, agent, and variable tokens on immediate backspace', () => {
		const testCases = [
			{ initialValue: '/', insertedText: '/fix ', deleteRange: new Range(1, 5, 1, 6) },
			{ initialValue: '/', insertedText: '/fork ', deleteRange: new Range(1, 6, 1, 7) },
			{ initialValue: '@', insertedText: '@workspace ', deleteRange: new Range(1, 11, 1, 12) },
			{ initialValue: '#', insertedText: '#selection', deleteRange: new Range(1, 10, 1, 11) },
		];

		for (const testCase of testCases) {
			withTestCodeEditor(testCase.initialValue, {}, editor => {
				let refreshCount = 0;
				const store = new DisposableStore();
				try {
					const widget = createWidget(editor, () => {
						refreshCount++;
					});
					const ChatTokenDeleterCtor = getChatTokenDeleterCtor();
					store.add(new ChatTokenDeleterCtor(widget));

					editor.executeEdits('test', [{ range: new Range(1, 1, 1, 2), text: testCase.insertedText }]);
					assert.strictEqual(editor.getValue(), testCase.insertedText);

					editor.executeEdits('test', [{ range: testCase.deleteRange, text: '' }]);
					assert.strictEqual(editor.getValue(), '');
					assert.strictEqual(refreshCount, 1);
				} finally {
					store.dispose();
				}
			});
		}
	});

	test('does not delete the whole token when backspacing inside the inserted token', () => {
		withTestCodeEditor('@', {}, editor => {
			let refreshCount = 0;
			const store = new DisposableStore();
			try {
				const widget = createWidget(editor, () => {
					refreshCount++;
				});
				const ChatTokenDeleterCtor = getChatTokenDeleterCtor();
				store.add(new ChatTokenDeleterCtor(widget));

				editor.executeEdits('test', [{ range: new Range(1, 1, 1, 2), text: '@workspace ' }]);
				editor.executeEdits('test', [{ range: new Range(1, 5, 1, 6), text: '' }]);

				assert.strictEqual(editor.getValue(), '@worspace ');
				assert.strictEqual(refreshCount, 0);
			} finally {
				store.dispose();
			}
		});
	});

	test('only deletes on the immediate next backspace after token insertion', () => {
		withTestCodeEditor('@', {}, editor => {
			let refreshCount = 0;
			const store = new DisposableStore();
			try {
				const widget = createWidget(editor, () => {
					refreshCount++;
				});
				const ChatTokenDeleterCtor = getChatTokenDeleterCtor();
				store.add(new ChatTokenDeleterCtor(widget));

				editor.executeEdits('test', [{ range: new Range(1, 1, 1, 2), text: '@workspace ' }]);
				editor.executeEdits('test', [{ range: new Range(1, 11, 1, 11), text: 'x' }]);
				editor.executeEdits('test', [{ range: new Range(1, 11, 1, 12), text: '' }]);

				assert.strictEqual(editor.getValue(), '@workspace ');
				assert.strictEqual(refreshCount, 0);
			} finally {
				store.dispose();
			}
		});
	});
});

suite('InputEditorDecorations', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	teardown(() => sinon.restore());

	function referencePart(startColumn: number, entry: IChatRequestVariableEntry): ChatRequestDynamicVariablePart {
		const endColumn = startColumn + entry.name.length;
		return new ChatRequestDynamicVariablePart(
			new OffsetRange(startColumn - 1, endColumn - 1), new Range(1, startColumn, 1, endColumn),
			entry.name, entry.id, entry.modelDescription, entry.value, undefined, undefined, false, false, entry._meta,
		);
	}

	function textPart(startColumn: number, text: string): ChatRequestTextPart {
		return new ChatRequestTextPart(new OffsetRange(startColumn - 1, startColumn - 1 + text.length), new Range(1, startColumn, 1, startColumn + text.length), text);
	}

	function createDecorations(parts: readonly IParsedChatRequestPart[], prompt?: IResolvedChatPromptSlashCommand) {
		const ctor = ChatWidget.CONTRIBS.find(contrib => contrib.name === 'InputEditorDecorations');
		assert.ok(ctor, 'InputEditorDecorations should be registered as a chat widget contribution');
		const activeEditorChanged = store.add(new Emitter<void>());
		const parsedInputChanged = store.add(new Emitter<void>());
		const decorations = new Map<string, IDecorationOptions[]>();
		const openedResources: string[] = [];
		const openEditor = sinon.stub().callsFake(async (input: IResourceEditorInput) => {
			openedResources.push(input.resource.toString());
			return undefined;
		});
		const resolvePromptSlashCommand = sinon.stub().resolves(prompt);
		let updated = new DeferredPromise<void>();
		function createEditor(parts: readonly IParsedChatRequestPart[]) {
			let parsedInput = { parts, text: parts.map(part => part.text).join('') };
			let selection = new Selection(1, 1, 1, 1);
			const mouseDown = store.add(new Emitter<IEditorMouseEvent>());
			const mouseUp = store.add(new Emitter<IEditorMouseEvent>());
			const inputEditor = upcastPartial<IChatWidget['inputEditor']>({
				getValue: () => parsedInput.text,
				getPosition: () => selection.getPosition(),
				getSelection: () => selection,
				hasTextFocus: () => false,
				getModel: () => null,
				getId: () => 'test-chat-input',
				onDidChangeModelContent: Event.None,
				onDidChangeConfiguration: Event.None,
				onMouseDown: mouseDown.event,
				onMouseUp: mouseUp.event,
				setDecorationsByType: (_owner, key, options) => {
					decorations.set(key, options);
					if (key === 'chat-variable-text') {
						updated.complete();
					}
					return [];
				},
			});
			return {
				inputEditor,
				get parsedInput() { return parsedInput; },
				setPosition: (column: number) => { selection = new Selection(1, column, 1, column); },
				setSelection: (startColumn: number, endColumn: number) => { selection = new Selection(1, startColumn, 1, endColumn); },
				setInput: (parts: readonly IParsedChatRequestPart[]) => {
					updated = new DeferredPromise<void>();
					parsedInput = { parts, text: parts.map(part => part.text).join('') };
					parsedInputChanged.fire();
					return updated.p;
				},
				click: (column: number) => {
					mouseDown.fire(mouseEvent(column));
					mouseUp.fire(mouseEvent(column));
				},
				drag: (from: number, to: number) => {
					mouseDown.fire(mouseEvent(from));
					mouseUp.fire(mouseEvent(to));
				},
				rightClick: (column: number) => {
					mouseDown.fire(mouseEvent(column, false));
					mouseUp.fire(mouseEvent(column, false));
				},
				mouseDown: (column: number) => mouseDown.fire(mouseEvent(column)),
				mouseUp: (column: number) => mouseUp.fire(mouseEvent(column)),
			};
		}
		const mainEditor = createEditor(parts);
		let activeEditor = mainEditor;
		const widget = upcastPartial<IChatWidget>({
			get inputEditor() { return activeEditor.inputEditor; },
			get parsedInput() { return activeEditor.parsedInput; },
			getContrib: () => undefined,
			viewModel: upcastPartial<NonNullable<IChatWidget['viewModel']>>({
				sessionResource: URI.parse('agent-host-copilot:/test'),
				onDidChange: Event.None,
				get editing() { return activeEditor === mainEditor ? undefined : upcastPartial<IChatRequestViewModel>({}); },
			}),
			input: upcastPartial<IChatWidget['input']>({
				sandboxToggleChecked: observableValue('sandboxToggleChecked', false),
				currentModeObs: constObservable(upcastPartial<IChatMode>({ description: constObservable(undefined) })),
			}),
			onDidChangeParsedInput: parsedInputChanged.event,
			onDidChangeViewModel: Event.None,
			onDidSubmitAgent: Event.None,
			onDidChangeActiveInputEditor: activeEditorChanged.event,
		});
		const contribution = store.add(new ctor(
			widget,
			upcastPartial<ICodeEditorService>({ registerDecorationType: () => Disposable.None }),
			new TestThemeService(),
			upcastPartial<IChatAgentService>({ onDidChangeAgents: Event.None }),
			upcastPartial<ILabelService>({ getUriLabel: uri => uri.path }),
			upcastPartial<ICustomizationHarnessService>({ onDidChangeSlashCommands: Event.None, resolvePromptSlashCommand }),
			upcastPartial<IEditorService>({ openEditor }),
		));
		sinon.stub(widget, 'getContrib').withArgs(contribution.id).returns(contribution);
		const instantiation = store.add(new TestInstantiationService());
		instantiation.stub(IChatWidgetService, upcastPartial<IChatWidgetService>({ lastFocusedWidget: widget }));

		function mouseEvent(column: number, leftButton = true): IEditorMouseEvent {
			return {
				event: upcastPartial<IEditorMouseEvent['event']>({ leftButton }),
				target: {
					type: MouseTargetType.CONTENT_TEXT,
					position: new Position(1, column),
					range: new Range(1, column, 1, column),
					element: null,
					mouseColumn: column,
					detail: { mightBeForeignElement: false, injectedText: null },
				},
			};
		}

		return {
			...mainEditor,
			openedResources,
			resolvePromptSlashCommand,
			decorations,
			openSkillAtCursor: async () => {
				const command = CommandsRegistry.getCommand('workbench.action.chat.openSkillAtCursor');
				assert.ok(command, 'Open Skill at Cursor should be registered');
				await instantiation.invokeFunction(command.handler);
			},
			whenUpdated: () => updated.p,
			editSentMessage: (editParts: readonly IParsedChatRequestPart[] = parts) => {
				updated = new DeferredPromise<void>();
				activeEditor = createEditor(editParts);
				activeEditorChanged.fire();
				return { ...activeEditor, whenUpdated: () => updated.p };
			},
			returnToMainInput: () => {
				updated = new DeferredPromise<void>();
				activeEditor = mainEditor;
				activeEditorChanged.fire();
				return updated.p;
			},
			setInput: (parts: readonly IParsedChatRequestPart[]) => activeEditor.setInput(parts),
		};
	}

	test('offers keyboard skill navigation in the Command Palette only for enabled chat inputs', () => {
		const configuration = new TestConfigurationService();
		store.add(configuration.onDidChangeConfigurationEmitter);
		const context = store.add(new ContextKeyService(configuration));
		const enabled = ChatContextKeys.enabled.bindTo(context);
		const inInput = ChatContextKeys.inChatInput.bindTo(context);
		const item = MenuRegistry.getMenuItems(MenuId.CommandPalette).filter(isIMenuItem)
			.find(item => item.command.id === 'workbench.action.chat.openSkillAtCursor');
		assert.ok(item);

		enabled.set(true);
		inInput.set(true);
		const inChatInput = context.contextMatchesRules(item.when);
		inInput.set(false);
		const outsideInput = context.contextMatchesRules(item.when);
		inInput.set(true);
		enabled.set(false);

		assert.deepStrictEqual({
			inChatInput,
			outsideInput,
			aiDisabled: context.contextMatchesRules(item.when),
		}, { inChatInput: true, outsideInput: false, aiDisabled: false });
	});

	test('opens a restored sent-message skill from the active edit input and releases old editor listeners', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const text = '/review changes';
		const uri = URI.file('/workspace/review/SKILL.md');
		const variable = messageAttachmentsToVariableData([{
			type: MessageAttachmentKind.Resource, uri: uri.toString(), label: '/review', displayKind: 'skill',
			range: { start: { line: 0, character: 0 }, end: { line: 0, character: 7 } },
		}], 'local', text)!.variables[0];
		const parser = new ChatRequestParser(
			upcastPartial<IChatAgentService>({ getDefaultAgent: () => undefined }),
			upcastPartial<IChatVariablesService>({}),
			upcastPartial<IChatSlashCommandService>({ getCommands: () => [] }),
			upcastPartial<IPromptsService>({ hasPromptSlashCommand: () => false, isValidSlashCommandName: () => false }),
		);
		const parsed = parser.parseChatRequestWithReferences([{
			id: variable.id, data: variable.value, range: new Range(1, 1, 1, 8),
		}], ToolAndToolSetEnablementMap.fromEntries([]), text);
		const fixture = createDecorations(parsed.parts);
		await fixture.whenUpdated();
		fixture.mouseDown(2);
		const editing = fixture.editSentMessage();
		await editing.whenUpdated();
		editing.setPosition(2);
		await fixture.openSkillAtCursor();
		editing.mouseUp(2);
		fixture.click(2);
		editing.drag(2, 3);
		editing.rightClick(2);
		editing.click(10);
		editing.click(2);
		await fixture.returnToMainInput();
		editing.click(2);
		fixture.click(2);
		fixture.setPosition(2);
		await fixture.openSkillAtCursor();
		const secondEdit = fixture.editSentMessage();
		await secondEdit.whenUpdated();
		editing.click(2);
		secondEdit.click(2);
		assert.deepStrictEqual(fixture.openedResources, Array(5).fill(uri.toString()));
	}));

	test('keyboard navigation uses only the active input and restores the composer after editing', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const mainUri = URI.file('/workspace/main/SKILL.md');
		const editUri = URI.file('/workspace/edit/SKILL.md');
		const skill = (resource: URI) => referencePart(1, toAgentHostCompletionVariableEntry(AgentHostCompletionReferenceKind.Skill, '/review', resource, undefined));
		const fixture = createDecorations([skill(mainUri), textPart(8, ' more')]);
		fixture.setPosition(2);
		await fixture.openSkillAtCursor();

		const editing = fixture.editSentMessage([skill(editUri), textPart(8, ' changes')]);
		editing.setPosition(10);
		await fixture.openSkillAtCursor();
		editing.setPosition(2);
		await fixture.openSkillAtCursor();
		fixture.setPosition(10);
		await fixture.openSkillAtCursor();

		const restored = fixture.returnToMainInput();
		await fixture.openSkillAtCursor();
		editing.setPosition(10);
		fixture.setPosition(2);
		await fixture.openSkillAtCursor();
		await restored;

		assert.deepStrictEqual(fixture.openedResources, [mainUri, editUri, editUri, mainUri].map(resource => resource.toString()));
	}));

	test('keyboard navigation requires a caret inside the current bound skill, without waiting for decorations', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const oldUri = URI.file('/workspace/old/SKILL.md');
		const currentUri = URI.file('/workspace/current/SKILL.md');
		const parts = (resource: URI) => [
			textPart(1, 'changes '),
			referencePart(9, toAgentHostCompletionVariableEntry(AgentHostCompletionReferenceKind.Skill, '/review', resource, undefined)),
			textPart(16, ' more'),
		];
		const fixture = createDecorations(parts(oldUri));
		await fixture.whenUpdated();
		void fixture.setInput(parts(currentUri));
		for (const column of [1, 8, 9, 15, 16, 20]) {
			fixture.setPosition(column);
			await fixture.openSkillAtCursor();
		}
		for (const [start, end] of [[9, 16], [10, 19], [19, 10]]) {
			fixture.setSelection(start, end);
			await fixture.openSkillAtCursor();
		}
		const removed = fixture.setInput([textPart(1, 'changes /review more')]);
		fixture.setPosition(10);
		await fixture.openSkillAtCursor();
		await removed;

		assert.deepStrictEqual(fixture.openedResources, [currentUri.toString(), currentUri.toString()]);
	}));

	for (const kind of agentHostConnectionKinds) {
		test(`opens each same-name skill's bound resource by mouse and keyboard without a name lookup (${kind.name})`, () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const resources = [URI.file('/workspace/one/SKILL.md'), URI.file('/workspace/two/SKILL.md')].map(kind.toClient);
			const entries = resources.map(resource => toAgentHostCompletionVariableEntry(
				AgentHostCompletionReferenceKind.Skill, '/review', resource, { uri: 'file:///host/other/SKILL.md' },
			));
			const fixture = createDecorations([
				referencePart(1, entries[0]), textPart(8, ' '), referencePart(9, entries[1]), textPart(16, ' '),
			], upcastPartial<IResolvedChatPromptSlashCommand>({ name: 'review', uri: URI.file('/wrong/review.prompt.md') }));
			fixture.setPosition(2);
			await fixture.openSkillAtCursor();
			fixture.setPosition(10);
			await fixture.openSkillAtCursor();
			await fixture.whenUpdated();
			fixture.click(2);
			fixture.click(10);

			assert.deepStrictEqual({
				opens: fixture.openedResources,
				lookups: fixture.resolvePromptSlashCommand.callCount,
				ranges: fixture.decorations.get('chat-session-clickable-text')?.map(decoration => decoration.range),
			}, {
				opens: [...resources, ...resources].map(resource => resource.toString()),
				lookups: 0,
				ranges: [new Range(1, 1, 1, 8), new Range(1, 9, 1, 16)],
			});
		}));
	}

	test('ignores missing resources, commands, and ordinary variables', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const uri = URI.file('/workspace/SKILL.md');
		const entries: IChatRequestVariableEntry[] = [
			toAgentHostCompletionVariableEntry(AgentHostCompletionReferenceKind.Skill, '/review', undefined, { uri: uri.toString() }),
			toAgentHostCompletionVariableEntry(AgentHostCompletionReferenceKind.Command, '/review', 'review', { uri: uri.toString() }),
			{ kind: 'generic', name: '/review', id: uri.toString(), value: uri },
		];
		const fixture = createDecorations(entries.flatMap((entry, index) => [referencePart(1 + index * 8, entry), textPart(8 + index * 8, ' ')]));
		await fixture.whenUpdated();
		for (let column = 2; column < 24; column += 8) {
			fixture.click(column);
			fixture.setPosition(column);
			await fixture.openSkillAtCursor();
		}
		assert.deepStrictEqual({
			opens: fixture.openedResources,
			lookups: fixture.resolvePromptSlashCommand.callCount,
			decorations: fixture.decorations.get('chat-session-clickable-text'),
		}, { opens: [], lookups: 0, decorations: [] });
	}));

	test('preserves ordinary slash prompt navigation and argument hints alongside bound skills', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const promptUri = URI.file('/workspace/review.prompt.md');
		const skillUri = URI.file('/workspace/review/SKILL.md');
		const prompt = new ChatRequestSlashPromptPart(new OffsetRange(0, 7), new Range(1, 1, 1, 8), 'review');
		const fixture = createDecorations([prompt, textPart(8, ' ')], upcastPartial<IResolvedChatPromptSlashCommand>({
			name: 'review', uri: promptUri, argumentHint: 'Files to review',
		}));
		await fixture.whenUpdated();
		const argumentHint = fixture.decorations.get('chat-session-detail')?.[0].renderOptions?.after?.contentText;
		fixture.setPosition(2);
		await fixture.openSkillAtCursor();
		fixture.click(2);
		await fixture.setInput([
			prompt, textPart(8, ' '),
			referencePart(9, toAgentHostCompletionVariableEntry(AgentHostCompletionReferenceKind.Skill, '/review', skillUri, undefined)),
		]);
		fixture.click(2);
		fixture.click(10);
		assert.deepStrictEqual({
			opens: fixture.openedResources,
			lookups: fixture.resolvePromptSlashCommand.callCount,
			argumentHint,
		}, {
			opens: [promptUri.toString(), promptUri.toString(), skillUri.toString()],
			lookups: 2,
			argumentHint: 'Files to review',
		});
	}));

	test('does not navigate on drags, right clicks, outside clicks, or removed references', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const entry = toAgentHostCompletionVariableEntry(AgentHostCompletionReferenceKind.Skill, '/review', URI.file('/workspace/SKILL.md'), undefined);
		const fixture = createDecorations([referencePart(1, entry), textPart(8, ' more')]);
		await fixture.whenUpdated();
		fixture.drag(2, 3);
		fixture.drag(2, 10);
		fixture.rightClick(2);
		fixture.click(8);
		fixture.click(10);
		await fixture.setInput([textPart(1, '/review more')]);
		fixture.click(2);
		assert.deepStrictEqual(fixture.openedResources, []);
	}));
});
