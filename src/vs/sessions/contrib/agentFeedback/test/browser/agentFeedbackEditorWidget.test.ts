/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { withTestCodeEditor } from '../../../../../editor/test/browser/testCodeEditor.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { IMarkdownRendererService, MarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { ICodeReviewService } from '../../../codeReview/browser/codeReviewService.js';
import { AgentFeedbackEditorWidget } from '../../browser/agentFeedbackEditorWidgetContribution.js';
import { AgentFeedbackKind, IAgentFeedbackService } from '../../browser/agentFeedbackService.js';
import { ISessionEditorComment, SessionEditorCommentSource } from '../../browser/sessionEditorComments.js';

suite('AgentFeedbackEditorWidget', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const sessionResource = URI.parse('vscode-agent-session://test/session-1');
	const fileResource = URI.parse('inmemory://model/agent-feedback-widget-test.ts');

	const comment: ISessionEditorComment = {
		id: 'agentFeedback:feedback-1',
		sourceId: 'feedback-1',
		source: SessionEditorCommentSource.AgentFeedback,
		kind: AgentFeedbackKind.UserReview,
		sessionResource,
		resourceUri: fileResource,
		range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 },
		text: 'Original comment',
		canConvertToAgentFeedback: false,
	};

	function withWidget(callback: (domNode: HTMLElement) => void): void {
		const services = new ServiceCollection();
		services.set(IAgentFeedbackService, new class extends mock<IAgentFeedbackService>() {
			override setNavigationAnchor(): void { }
			override updateFeedback(): void { }
		});
		services.set(ICodeReviewService, new class extends mock<ICodeReviewService>() { });
		services.set(IMarkdownRendererService, new SyncDescriptor(MarkdownRendererService));

		withTestCodeEditor(['first line', 'second line'], { serviceCollection: services }, (editor, _viewModel, instantiationService) => {
			const store = new DisposableStore();
			try {
				const widget = store.add(instantiationService.createInstance(AgentFeedbackEditorWidget, editor, [comment], sessionResource, undefined));
				const domNode = widget.getDomNode();
				// The test editor has no real view, so the overlay widget is
				// never attached: put it in the document ourselves so focus
				// behaves like it does in production.
				mainWindow.document.body.appendChild(domNode);
				try {
					widget.expand();
					callback(domNode);
				} finally {
					domNode.remove();
				}
			} finally {
				store.dispose();
			}
		});
	}

	function triggerAction(domNode: HTMLElement, codiconClass: string): void {
		domNode.querySelector<HTMLElement>(`.agent-feedback-widget-item-actions .action-label.${codiconClass}`)!.click();
	}

	function composer(domNode: HTMLElement): HTMLTextAreaElement | null {
		return domNode.querySelector<HTMLTextAreaElement>('textarea.agent-feedback-widget-edit-textarea');
	}

	function dispatchEscape(target: HTMLElement): void {
		const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
		Object.defineProperty(event, 'keyCode', { get: () => 27 });
		target.dispatchEvent(event);
	}

	test('clicking inside the edit composer keeps it open and focused', () => {
		withWidget(domNode => {
			triggerAction(domNode, 'codicon-edit');
			const textarea = composer(domNode)!;

			textarea.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
			textarea.dispatchEvent(new MouseEvent('click', { bubbles: true }));

			assert.deepStrictEqual({
				stillOpen: composer(domNode) === textarea,
				focused: mainWindow.document.activeElement === textarea,
			}, { stillOpen: true, focused: true });
		});
	});

	test('the edit composer survives losing focus and is closed by Escape from the widget', () => {
		withWidget(domNode => {
			triggerAction(domNode, 'codicon-edit');
			const textarea = composer(domNode)!;
			textarea.value = 'edited text';

			// Simulate clicking on the comment text of the widget, which pulls
			// focus to the widget so the DOM selection can be copied.
			domNode.querySelector<HTMLElement>('.agent-feedback-widget-text')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
			textarea.blur();
			const openAfterBlur = composer(domNode) === textarea;

			dispatchEscape(domNode);

			assert.deepStrictEqual({
				openAfterBlur,
				openAfterEscape: composer(domNode) !== null,
			}, { openAfterBlur: true, openAfterEscape: false });
		});
	});

	test('the empty reply composer survives losing focus and is closed by Escape', () => {
		withWidget(domNode => {
			triggerAction(domNode, 'codicon-comment-discussion');
			const textarea = composer(domNode)!;

			textarea.blur();
			const openAfterBlur = composer(domNode) === textarea;

			dispatchEscape(textarea);

			assert.deepStrictEqual({
				openAfterBlur,
				openAfterEscape: composer(domNode) !== null,
			}, { openAfterBlur: true, openAfterEscape: false });
		});
	});
});
