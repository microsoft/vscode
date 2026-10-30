/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../../../base/browser/window.js';
import { Event } from '../../../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../../../base/common/htmlContent.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { createTextModel } from '../../../../../../../editor/test/common/testTextModel.js';
import { ILinkPresentationService } from '../../../../../../../platform/dataChannel/common/dataChannel.js';
import { workbenchInstantiationService } from '../../../../../../test/browser/workbenchTestServices.js';
import { IChatPetService } from '../../../../browser/chatPetService.js';
import { IChatToolRiskAssessmentService } from '../../../../browser/tools/chatToolRiskAssessmentService.js';
import { ChatContentMarkdownRenderer } from '../../../../browser/widget/chatContentMarkdownRenderer.js';
import { EditorPool } from '../../../../browser/widget/chatContentParts/chatContentCodePools.js';
import { IChatContentPartRenderContext } from '../../../../browser/widget/chatContentParts/chatContentParts.js';
import { ChatMarkdownAnchorService, IChatMarkdownAnchorService } from '../../../../browser/widget/chatContentParts/chatMarkdownAnchorService.js';
import { CodeBlockPart, ICodeBlockData } from '../../../../browser/widget/chatContentParts/codeBlockPart.js';
import { ToolConfirmationSubPart } from '../../../../browser/widget/chatContentParts/toolInvocationParts/chatToolConfirmationSubPart.js';
import { ChatTerminalToolConfirmationSubPart } from '../../../../browser/widget/chatContentParts/toolInvocationParts/chatTerminalToolConfirmationSubPart.js';
import { IChatTerminalToolInvocationData } from '../../../../common/chatService/chatService.js';
import { ChatToolInvocation } from '../../../../common/model/chatProgressTypes/chatToolInvocation.js';
import { IChatResponseViewModel } from '../../../../common/model/chatViewModel.js';
import { IChatSessionsService } from '../../../../common/chatSessionsService.js';
import { ILanguageModelToolsConfirmationService } from '../../../../common/tools/languageModelToolsConfirmationService.js';
import { ILanguageModelToolsService, ToolDataSource } from '../../../../common/tools/languageModelToolsService.js';
import { MockChatSessionsService } from '../../../common/mockChatSessionsService.js';
import { ITerminalChatService } from '../../../../../terminal/browser/terminal.js';
import { IChatWidgetService } from '../../../../browser/chat.js';

suite('ToolConfirmationSubPart', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function renderConfirmation(message: string | MarkdownString, rawInput?: object, disclaimer?: MarkdownString, terminalData?: IChatTerminalToolInvocationData) {
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(ILanguageModelToolsService, { getTool: () => undefined });
		instantiationService.stub(ILanguageModelToolsConfirmationService, { getPreConfirmActions: () => [] });
		instantiationService.stub(IChatToolRiskAssessmentService, { isEnabled: () => false });
		instantiationService.stub(IChatPetService, { unlockAchievement: () => false });
		instantiationService.stub(IChatWidgetService, {});
		instantiationService.stub(ITerminalChatService, {});
		instantiationService.stub(IChatSessionsService, new MockChatSessionsService());
		instantiationService.stub(IChatMarkdownAnchorService, store.add(new ChatMarkdownAnchorService()));
		instantiationService.stub(ILinkPresentationService, {
			onDidChangeLinkPresentationRules: Event.None,
			linkPresentationRules: [],
			getLinkPresentationRule: () => undefined,
			createLinkPresentationWatcher: () => undefined,
		});
		const model = store.add(createTextModel(''));
		const renderedInputs: ICodeBlockData[] = [];
		const editorPool = new class extends mock<EditorPool>() {
			override get() {
				const element = mainWindow.document.createElement('div');
				return {
					object: new class extends mock<CodeBlockPart>() {
						override readonly element = element;
						override readonly editor = new class extends mock<CodeBlockPart['editor']>() {
							override getModel() { return model; }
						}();
						override render(data: ICodeBlockData): void {
							renderedInputs.push(data);
							model.setValue(data.text);
							element.textContent = data.text;
						}
						override focus(): void { }
					}(),
					isStale: () => false,
					dispose: () => { },
				};
			}
		}();
		const context = upcastPartial<IChatContentPartRenderContext>({
			element: upcastPartial<IChatResponseViewModel>({
				id: 'response',
				sessionResource: URI.parse('chat-session://test/session'),
				isComplete: true,
			}),
			container: mainWindow.document.createElement('div'),
			content: [{ kind: 'markdownContent', content: new MarkdownString('') }],
			contentIndex: 0,
		});
		const invocation = new ChatToolInvocation({
			confirmationMessages: { title: terminalData ? 'Run in terminal?' : 'Allow tool call?', message, disclaimer },
			toolSpecificData: terminalData ?? (rawInput ? { kind: 'input', rawInput, editable: false } : undefined),
		}, {
			id: 'rename_chat',
			displayName: 'Rename Chat',
			modelDescription: 'Rename Chat',
			source: ToolDataSource.Internal,
		}, 'hook-tool-call', undefined, {});
		const renderer = instantiationService.createInstance(ChatContentMarkdownRenderer);
		const part = store.add(terminalData
			? instantiationService.createInstance(ChatTerminalToolConfirmationSubPart, invocation, terminalData, context, renderer, editorPool, () => 500, 0)
			: instantiationService.createInstance(ToolConfirmationSubPart, invocation, context, renderer, editorPool, () => 500, 0));
		return { part, renderedInputs };
	}

	function messageText(part: { readonly domNode: HTMLElement }): string | undefined {
		return part.domNode.querySelector('.message-wrapper')?.textContent?.replace(/\u00a0/g, ' ').trim();
	}

	for (const markdown of [false, true]) {
		test(`shows read-only arguments with a ${markdown ? 'markdown' : 'plain-text'} message`, () => {
			const reason = 'Please review this tool call before it runs.';
			const input = { title: 'Run echo foo', automatic: true };
			const { part, renderedInputs } = renderConfirmation(markdown ? new MarkdownString(reason) : reason, input);
			assert.deepStrictEqual({
				message: messageText(part),
				inputTitle: part.domNode.querySelector('.editor h3')?.textContent,
				inputs: renderedInputs.map(data => ({
					input: JSON.parse(data.text),
					readOnly: data.renderOptions?.editorOptions?.readOnly,
					ariaLabel: data.renderOptions?.editorOptions?.ariaLabel,
				})),
			}, {
				message: reason,
				inputTitle: 'Input',
				inputs: [{ input, readOnly: true, ariaLabel: 'Allow tool call?' }],
			});
		});
	}

	test('keeps plain-text reasons literal when displaying tool arguments', () => {
		const reason = '[Review](command:workbench.action.reloadWindow) **before** running <script>alert(1)</script>';
		const { part } = renderConfirmation(reason, { title: 'Test' });
		assert.deepStrictEqual({
			message: messageText(part),
			links: part.domNode.querySelectorAll('.message-wrapper a').length,
			scripts: part.domNode.querySelectorAll('.message-wrapper script').length,
		}, { message: reason, links: 0, scripts: 0 });
	});

	for (const input of [undefined, {}]) {
		test(`preserves the compact plain-text display with ${JSON.stringify(input)} input`, () => {
			const { part, renderedInputs } = renderConfirmation('Review this tool call.', input);
			assert.deepStrictEqual({
				messageVisible: part.domNode.textContent?.includes('Review this tool call.'),
				inputs: renderedInputs.length,
			}, { messageVisible: true, inputs: 0 });
		});

		test(`keeps Markdown-looking reasons literal with ${JSON.stringify(input)} input`, () => {
			const reason = '**Review** [this](https://example.com) <script>alert(1)</script>';
			const { part } = renderConfirmation(reason, input);
			const message = part.domNode.querySelector('.chat-confirmation-widget-message');
			assert.deepStrictEqual({
				text: message?.textContent?.trim(),
				links: message?.querySelectorAll('a').length,
				emphasis: message?.querySelectorAll('strong').length,
				scripts: message?.querySelectorAll('script').length,
			}, { text: reason, links: 0, emphasis: 0, scripts: 0 });
		});
	}

	for (const markdown of [false, true]) {
		test(`shows a ${markdown ? 'Markdown' : 'plain-text'} terminal explanation alongside the command`, () => {
			const reason = markdown ? new MarkdownString('Review **before** running.') : 'Review **before** running.';
			const { part, renderedInputs } = renderConfirmation(reason, undefined, undefined, {
				kind: 'terminal',
				commandLine: { original: 'echo review-me' },
				language: 'bash',
				editable: false,
			});
			const message = part.domNode.querySelector('.chat-confirmation-message-terminal-reason');
			assert.deepStrictEqual({
				message: message?.textContent?.replace(/\u00a0/g, ' ').trim(),
				emphasis: message?.querySelectorAll('strong').length,
				inputs: renderedInputs.map(data => ({
					text: data.text,
					readOnly: data.renderOptions?.editorOptions?.readOnly,
					ariaLabel: data.renderOptions?.editorOptions?.ariaLabel,
				})),
			}, {
				message: markdown ? 'Review before running.' : reason,
				emphasis: markdown ? 1 : 0,
				inputs: [{
					text: 'echo review-me',
					readOnly: true,
					ariaLabel: `Run in terminal?\n${markdown ? 'Review before running.' : reason}`,
				}],
			});
		});
	}

	for (const message of ['', new MarkdownString('`echo review-me`')]) {
		test(`does not add an empty or duplicate terminal explanation for ${JSON.stringify(message)}`, () => {
			const { part, renderedInputs } = renderConfirmation(message, undefined, undefined, {
				kind: 'terminal',
				commandLine: { original: 'echo review-me' },
				language: 'bash',
				editable: false,
			});
			assert.deepStrictEqual({
				messagePresent: !!part.domNode.querySelector('.chat-confirmation-message-terminal-reason'),
				ariaLabel: renderedInputs[0].renderOptions?.editorOptions?.ariaLabel,
			}, { messagePresent: false, ariaLabel: 'Run in terminal?' });
		});
	}

	test('keeps plain-text reasons literal when a disclaimer requires rich content', () => {
		const reason = '**Review** this tool call.';
		const { part } = renderConfirmation(reason, undefined, new MarkdownString('A disclaimer.'));
		assert.deepStrictEqual({
			message: messageText(part),
			disclaimer: part.domNode.querySelector('.disclaimer')?.textContent?.trim(),
		}, { message: reason, disclaimer: 'A disclaimer.' });
	});
});
