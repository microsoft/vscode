/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../../../../base/common/lifecycle.js';
import { constObservable } from '../../../../../../../../base/common/observable.js';
import { URI } from '../../../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../../base/test/common/utils.js';
import { mock } from '../../../../../../../../base/test/common/mock.js';
import { IEditorMouseEvent, MouseTargetType } from '../../../../../../../../editor/browser/editorBrowser.js';
import { Position } from '../../../../../../../../editor/common/core/position.js';
import { Range } from '../../../../../../../../editor/common/core/range.js';
import { OffsetRange } from '../../../../../../../../editor/common/core/ranges/offsetRange.js';
import { IDecorationOptions } from '../../../../../../../../editor/common/editorCommon.js';
import { withAsyncTestCodeEditor, withTestCodeEditor } from '../../../../../../../../editor/test/browser/testCodeEditor.js';
import { ILabelService } from '../../../../../../../../platform/label/common/label.js';
import { IThemeService } from '../../../../../../../../platform/theme/common/themeService.js';
import { TestThemeService } from '../../../../../../../../platform/theme/test/common/testThemeService.js';
import { IEditorService } from '../../../../../../../services/editor/common/editorService.js';
import { IUntypedEditorInput, isResourceEditorInput } from '../../../../../../../common/editor.js';
import { AgentHostCompletionReferenceKind, toAgentHostCompletionVariableEntry } from '../../../../../common/attachments/chatVariableEntries.js';
import { ICustomizationHarnessService } from '../../../../../common/customizationHarnessService.js';
import { IResolvedChatPromptSlashCommand, PromptsStorage } from '../../../../../common/promptSyntax/service/promptsService.js';
import { PromptsType } from '../../../../../common/promptSyntax/promptTypes.js';
import { IChatAgentService } from '../../../../../common/participants/chatAgents.js';
import { ChatRequestDynamicVariablePart, ChatRequestTextPart, IParsedChatRequestPart } from '../../../../../common/requestParser/chatParserTypes.js';
import { IChatWidget } from '../../../../../browser/chat.js';
import { ChatWidget } from '../../../../../browser/widget/chatWidget.js';
import { InputEditorDecorations } from '../../../../../browser/widget/input/editor/chatInputEditorContrib.js';

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

	ensureNoDisposablesAreLeakedInTestSuite();

	function createSkillPart(name: string, uri: URI, startCol: number, description?: string): ChatRequestDynamicVariablePart {
		const text = `/${name}`;
		const entry = toAgentHostCompletionVariableEntry(AgentHostCompletionReferenceKind.Skill, text, uri, { uri: uri.toString(), description });
		return new ChatRequestDynamicVariablePart(
			new OffsetRange(startCol - 1, startCol - 1 + text.length),
			new Range(1, startCol, 1, startCol + text.length),
			text,
			entry.id,
			description,
			entry.value,
			text,
			undefined,
			false,
			false,
			entry._meta
		);
	}

	test('clicking a /skill chip in the chat input opens its SKILL.md', async () => {
		const skillUri = URI.file('/workspace/skills/review/SKILL.md');
		const skillPart = createSkillPart('review', skillUri, 1, 'Review changes');
		const textPart = new ChatRequestTextPart(new OffsetRange(7, 8), new Range(1, 8, 1, 9), ' ');
		const parts: IParsedChatRequestPart[] = [skillPart, textPart];

		await withAsyncTestCodeEditor('/review ', {}, async (editor, _vm, instantiationService) => {
			const store = new DisposableStore();
			try {
				const openedResources: URI[] = [];
				const setDecorations = new Map<string, IDecorationOptions[]>();
				const realSetDecorationsByType = editor.setDecorationsByType.bind(editor);
				editor.setDecorationsByType = ((desc: string, key: string, opts: IDecorationOptions[]) => {
					setDecorations.set(key, opts);
					return realSetDecorationsByType(desc, key, opts);
				}) as typeof editor.setDecorationsByType;

				const mouseDownEmitter = store.add(new Emitter<IEditorMouseEvent>());
				const mouseUpEmitter = store.add(new Emitter<IEditorMouseEvent>());

				const parsedInputEmitter = store.add(new Emitter<void>());
				const viewModelEmitter = store.add(new Emitter<void>());
				const activeInputEditorEmitter = store.add(new Emitter<void>());
				const submitAgentEmitter = store.add(new Emitter<{ agent: any; slashCommand?: any }>());

				const sessionResource = URI.parse('agent-host-copilot:/session');
				const widget = {
					inputEditor: Object.assign(editor, {
						onMouseDown: mouseDownEmitter.event,
						onMouseUp: mouseUpEmitter.event,
					}),
					parsedInput: { parts },
					onDidChangeParsedInput: parsedInputEmitter.event,
					onDidChangeViewModel: viewModelEmitter.event,
					onDidChangeActiveInputEditor: activeInputEditorEmitter.event,
					onDidSubmitAgent: submitAgentEmitter.event,
					viewModel: { sessionResource, onDidChange: Event.None },
					input: {
						sandboxToggleChecked: constObservable(false),
						currentModeObs: constObservable(undefined),
					},
				} as unknown as IChatWidget;

				instantiationService.stub(IThemeService, new TestThemeService());
				instantiationService.stub(IChatAgentService, {
					onDidChangeAgents: Event.None,
				});
				instantiationService.stub(ILabelService, {
					getUriLabel: (uri: URI) => uri.path,
				});
				instantiationService.stub(ICustomizationHarnessService, new class extends mock<ICustomizationHarnessService>() {
					override readonly onDidChangeSlashCommands = Event.None;
					override async resolvePromptSlashCommand(): Promise<IResolvedChatPromptSlashCommand | undefined> {
						return {
							name: 'review',
							uri: skillUri,
							description: 'Review changes',
							type: PromptsType.skill,
							storage: PromptsStorage.local,
							userInvocable: true,
						};
					}
				}());
				instantiationService.stub(IEditorService, new class extends mock<IEditorService>() {
					override async openEditor(editor: IUntypedEditorInput) {
						if (isResourceEditorInput(editor)) {
							openedResources.push(editor.resource);
						}
						return undefined;
					}
				}());

				const decorations = store.add(instantiationService.createInstance(InputEditorDecorations, widget));
				await decorations.updateAsyncInputEditorDecorations(CancellationToken.None);

				const clickableDecorations = setDecorations.get('chat-session-clickable-text');
				assert.ok(clickableDecorations && clickableDecorations.length === 1);
				assert.strictEqual(clickableDecorations[0].range.startColumn, 1);
				assert.strictEqual(clickableDecorations[0].range.endColumn, 8);
				assert.ok(clickableDecorations[0].hoverMessage);

				mouseDownEmitter.fire({
					event: { leftButton: true },
					target: { type: MouseTargetType.CONTENT_TEXT, position: new Position(1, 3) }
				} as unknown as IEditorMouseEvent);
				mouseUpEmitter.fire({
					event: { leftButton: true },
					target: { type: MouseTargetType.CONTENT_TEXT, position: new Position(1, 3) }
				} as unknown as IEditorMouseEvent);

				assert.strictEqual(openedResources.length, 1);
				assert.strictEqual(openedResources[0].toString(), skillUri.toString());
			} finally {
				store.dispose();
			}
		});
	});

	test('clicking multiple skill chips opens each respective SKILL.md', async () => {
		const skillUri1 = URI.file('/workspace/skills/commit/SKILL.md');
		const skillUri2 = URI.file('/workspace/skills/review/SKILL.md');
		const skillPart1 = createSkillPart('commit', skillUri1, 1, 'Commit code');
		const textPart = new ChatRequestTextPart(new OffsetRange(7, 8), new Range(1, 8, 1, 9), ' ');
		const skillPart2 = createSkillPart('review', skillUri2, 9, 'Review code');
		const parts: IParsedChatRequestPart[] = [skillPart1, textPart, skillPart2];

		await withAsyncTestCodeEditor('/commit /review', {}, async (editor, _vm, instantiationService) => {
			const store = new DisposableStore();
			try {
				const openedResources: URI[] = [];
				const setDecorations = new Map<string, IDecorationOptions[]>();
				const realSetDecorationsByType = editor.setDecorationsByType.bind(editor);
				editor.setDecorationsByType = ((desc: string, key: string, opts: IDecorationOptions[]) => {
					setDecorations.set(key, opts);
					return realSetDecorationsByType(desc, key, opts);
				}) as typeof editor.setDecorationsByType;

				const mouseDownEmitter = store.add(new Emitter<IEditorMouseEvent>());
				const mouseUpEmitter = store.add(new Emitter<IEditorMouseEvent>());

				const parsedInputEmitter = store.add(new Emitter<void>());
				const viewModelEmitter = store.add(new Emitter<void>());
				const activeInputEditorEmitter = store.add(new Emitter<void>());
				const submitAgentEmitter = store.add(new Emitter<{ agent: any; slashCommand?: any }>());

				const sessionResource = URI.parse('agent-host-copilot:/session');
				const widget = {
					inputEditor: Object.assign(editor, {
						onMouseDown: mouseDownEmitter.event,
						onMouseUp: mouseUpEmitter.event,
					}),
					parsedInput: { parts },
					onDidChangeParsedInput: parsedInputEmitter.event,
					onDidChangeViewModel: viewModelEmitter.event,
					onDidChangeActiveInputEditor: activeInputEditorEmitter.event,
					onDidSubmitAgent: submitAgentEmitter.event,
					viewModel: { sessionResource, onDidChange: Event.None },
					input: {
						sandboxToggleChecked: constObservable(false),
						currentModeObs: constObservable(undefined),
					},
				} as unknown as IChatWidget;

				instantiationService.stub(IThemeService, new TestThemeService());
				instantiationService.stub(IChatAgentService, {
					onDidChangeAgents: Event.None,
				});
				instantiationService.stub(ILabelService, {
					getUriLabel: (uri: URI) => uri.path,
				});
				instantiationService.stub(ICustomizationHarnessService, new class extends mock<ICustomizationHarnessService>() {
					override readonly onDidChangeSlashCommands = Event.None;
					override async resolvePromptSlashCommand(name: string): Promise<IResolvedChatPromptSlashCommand | undefined> {
						if (name === 'commit') {
							return { name: 'commit', uri: skillUri1, description: 'Commit code', type: PromptsType.skill, storage: PromptsStorage.local, userInvocable: true };
						}
						if (name === 'review') {
							return { name: 'review', uri: skillUri2, description: 'Review code', type: PromptsType.skill, storage: PromptsStorage.local, userInvocable: true };
						}
						return undefined;
					}
				}());
				instantiationService.stub(IEditorService, new class extends mock<IEditorService>() {
					override async openEditor(editor: IUntypedEditorInput) {
						if (isResourceEditorInput(editor)) {
							openedResources.push(editor.resource);
						}
						return undefined;
					}
				}());

				const decorations = store.add(instantiationService.createInstance(InputEditorDecorations, widget));
				await decorations.updateAsyncInputEditorDecorations(CancellationToken.None);

				const clickableDecorations = setDecorations.get('chat-session-clickable-text');
				assert.ok(clickableDecorations && clickableDecorations.length === 2);

				// Click on second chip (/review)
				mouseDownEmitter.fire({
					event: { leftButton: true },
					target: { type: MouseTargetType.CONTENT_TEXT, position: new Position(1, 11) }
				} as unknown as IEditorMouseEvent);
				mouseUpEmitter.fire({
					event: { leftButton: true },
					target: { type: MouseTargetType.CONTENT_TEXT, position: new Position(1, 11) }
				} as unknown as IEditorMouseEvent);

				assert.strictEqual(openedResources.length, 1);
				assert.strictEqual(openedResources[0].toString(), skillUri2.toString());
			} finally {
				store.dispose();
			}
		});
	});
});
