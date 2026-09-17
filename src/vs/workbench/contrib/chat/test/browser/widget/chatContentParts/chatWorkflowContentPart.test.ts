/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../../../base/browser/dom.js';
import { toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { upcastPartial } from '../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { IHoverService } from '../../../../../../../platform/hover/browser/hover.js';
import { buildWorkflowPrompt } from '../../../../../../../platform/workflow/common/workflowPrompt.js';
import { ChatWorkflowContentPart } from '../../../../browser/widget/chatContentParts/chatWorkflowContentPart.js';

suite('ChatWorkflowContentPart', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const presentation = { kind: 'workflow', workflowLabel: 'Feature', checkpointLabel: 'Plan', reason: 'start' } as const;
	const instructions = 'Add keyboard navigation and write the implementation plan.';
	const proofSchema = { type: 'object' as const, properties: { plan: { type: 'string' as const, format: 'uri' } }, required: ['plan'] };
	const message = buildWorkflowPrompt(instructions, proofSchema);
	const hoverService = upcastPartial<IHoverService>({ setupDelayedHover: () => toDisposable(() => { }) });

	test('starts collapsed with only the checkpoint summary and workflow attribution', () => {
		const part = store.add(new ChatWorkflowContentPart(presentation, message, undefined, hoverService));
		assert.deepStrictEqual({
			collapsed: part.domNode.classList.contains('collapsed'),
			title: part.domNode.querySelector('.chat-automated-request-title')?.textContent,
			participant: part.domNode.querySelector('.chat-automated-request-participant')?.textContent,
			expanded: part.domNode.querySelector('[aria-expanded]')?.getAttribute('aria-expanded'),
			label: part.domNode.querySelector('[aria-expanded]')?.getAttribute('aria-label'),
			extraMessageToggle: !!part.domNode.querySelector('.chat-automated-request-message-toggle'),
		}, {
			collapsed: true, title: 'Plan', participant: 'Workflow Feature',
			expanded: 'false', label: 'Plan, Workflow Feature', extraMessageToggle: true,
		});
	});

	test('disclosure toggles inspection without altering the full agent message', () => {
		const part = store.add(new ChatWorkflowContentPart(presentation, message, undefined, hoverService));
		const button = part.domNode.querySelector<HTMLElement>('.chat-automated-request-header-disclosure')!;
		const state = () => ({
			collapsed: part.domNode.classList.contains('collapsed'),
			expanded: button.getAttribute('aria-expanded'),
			message: part.domNode.querySelector('.chat-automated-request-message-body')?.textContent,
		});
		button.click();
		const expanded = state();
		button.click();
		assert.deepStrictEqual([expanded, state()], [
			{ collapsed: false, expanded: 'true', message },
			{ collapsed: true, expanded: 'false', message },
		]);
	});

	test('expanded details show instructions and proof schema, with protocol behind Agent Message', () => {
		const part = store.add(new ChatWorkflowContentPart(presentation, message, undefined, hoverService));
		const header = part.domNode.querySelector<HTMLElement>('.chat-automated-request-header-disclosure')!;
		const eye = part.domNode.querySelector<HTMLElement>('.chat-automated-request-message-toggle')!;
		const initialTabIndex = eye.tabIndex;
		header.click();
		const details = part.domNode.querySelector<HTMLElement>('.chat-automated-request-details')!;
		const expanded = {
			instructions: details.querySelector('.chat-workflow-instructions')?.textContent,
			proof: details.querySelector('.chat-workflow-proof-schema')?.textContent,
			label: details.querySelector('.chat-workflow-proof-label')?.textContent,
			protocol: details.textContent?.includes('[Fixed workflow protocol]'),
			tabIndex: eye.tabIndex,
		};
		eye.click();
		const showingMessage = part.domNode.classList.contains('showing-agent-message');
		eye.click();
		assert.deepStrictEqual({
			initialTabIndex, expanded, showingMessage,
			showingDetails: !part.domNode.classList.contains('showing-agent-message'),
			raw: part.domNode.querySelector('.chat-automated-request-message-body')?.textContent,
		}, {
			initialTabIndex: -1,
			expanded: { instructions, proof: JSON.stringify(proofSchema, null, 2), label: 'Proof Schema:', protocol: false, tabIndex: 0 },
			showingMessage: true, showingDetails: true, raw: message,
		});
	});

	test('treats labels and instructions as text, not trusted markup', () => {
		const part = store.add(new ChatWorkflowContentPart(
			{ ...presentation, workflowLabel: '<b>Feature</b>', checkpointLabel: '<i>Plan</i>' },
			'<a href="command:test">Instructions</a>', undefined, hoverService,
		));
		assert.deepStrictEqual({
			title: part.domNode.querySelector('.chat-automated-request-title')?.textContent,
			participant: part.domNode.querySelector('.chat-automated-request-participant')?.textContent,
			message: part.domNode.querySelector('.chat-automated-request-message-body')?.textContent,
			markup: part.domNode.querySelectorAll('b, i, a[href]').length,
			messageToggle: !!part.domNode.querySelector('.chat-automated-request-message-toggle'),
		}, {
			title: '<i>Plan</i>', participant: 'Workflow <b>Feature</b>',
			message: '<a href="command:test">Instructions</a>', markup: 0, messageToggle: false,
		});
	});

	test('renders structured instructions and proof schemas as literal text', () => {
		const text = '<a href="command:run">Run a command</a>';
		const schema = { ...proofSchema, description: '<img src="https://example.com/tracker">' };
		const part = store.add(new ChatWorkflowContentPart(presentation, buildWorkflowPrompt(text, schema), undefined, hoverService));
		assert.deepStrictEqual({
			instructions: part.domNode.querySelector('.chat-workflow-instructions')?.textContent,
			proof: part.domNode.querySelector('.chat-workflow-proof-schema')?.textContent,
			markup: part.domNode.querySelectorAll('img, a[href]').length,
		}, { instructions: text, proof: JSON.stringify(schema, null, 2), markup: 0 });
	});

	test('keeps the card border inside a narrow message in both disclosure states', () => {
		const part = store.add(new ChatWorkflowContentPart(
			{ ...presentation, checkpointLabel: 'Plan the keyboard navigation and accessibility improvements for the workflow editor' },
			message, undefined, hoverService,
		));
		part.domNode.style.width = '320px';
		part.domNode.style.setProperty('--vscode-strokeThickness', '1px');
		dom.getWindow(part.domNode).document.body.appendChild(part.domNode);
		store.add(toDisposable(() => part.domNode.remove()));
		const card = part.domNode.querySelector<HTMLElement>('.chat-automated-request-card')!;
		const widths = () => ({
			container: part.domNode.getBoundingClientRect().width,
			card: card.getBoundingClientRect().width,
			scroll: part.domNode.scrollWidth,
		});
		const collapsed = widths();
		part.domNode.querySelector<HTMLElement>('.chat-automated-request-header-disclosure')!.click();
		assert.deepStrictEqual({ collapsed, expanded: widths() }, {
			collapsed: { container: 320, card: 320, scroll: 320 },
			expanded: { container: 320, card: 320, scroll: 320 },
		});
	});

	test('renders proof requirements at content contrast, not metadata contrast', () => {
		const part = store.add(new ChatWorkflowContentPart(presentation, message, undefined, hoverService));
		part.domNode.style.setProperty('--vscode-foreground', 'rgb(204, 204, 204)');
		part.domNode.style.setProperty('--vscode-descriptionForeground', 'rgb(140, 140, 140)');
		dom.getWindow(part.domNode).document.body.appendChild(part.domNode);
		store.add(toDisposable(() => part.domNode.remove()));
		const schema = part.domNode.querySelector<HTMLElement>('.chat-workflow-proof-schema')!;
		assert.strictEqual(dom.getWindow(schema).getComputedStyle(schema).color, 'rgb(204, 204, 204)');
	});

	test('shows attribution at full theme contrast on keyboard focus', () => {
		const container = dom.$('.monaco-reduce-motion');
		dom.getWindow(container).document.body.appendChild(container);
		store.add(toDisposable(() => container.remove()));
		const part = store.add(new ChatWorkflowContentPart(presentation, message, undefined, hoverService));
		container.appendChild(part.domNode);
		part.domNode.querySelector<HTMLElement>('.chat-automated-request-header-disclosure')!.focus();
		const metadata = part.domNode.querySelector<HTMLElement>('.chat-automated-request-metadata')!;
		assert.strictEqual(dom.getWindow(metadata).getComputedStyle(metadata).opacity, '1');
	});
});
