/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import { mainWindow } from '../../../../../../../base/browser/window.js';
import { Separator } from '../../../../../../../base/common/actions.js';
import { Emitter } from '../../../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../../../base/common/htmlContent.js';
import { toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { IMarkdownRendererService } from '../../../../../../../platform/markdown/browser/markdownRenderer.js';
import { workbenchInstantiationService } from '../../../../../../test/browser/workbenchTestServices.js';
import { ChatCustomConfirmationWidget, ChatQueryTitlePart, type IChatConfirmationButton } from '../../../../browser/widget/chatContentParts/chatConfirmationWidget.js';
import type { IChatContentPartRenderContext } from '../../../../browser/widget/chatContentParts/chatContentParts.js';

suite('ChatQueryTitlePart', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	teardown(() => sinon.restore());

	test('renders plain tool titles without the markdown pipeline', () => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		const render = sinon.spy(instantiationService.get(IMarkdownRendererService), 'render');
		const titles: string[] = [];
		for (let i = 0; i < 200; i++) {
			const container = document.createElement('div');
			const title = `<tool-${i}> **literal** [details] $(check)`;
			store.add(instantiationService.createInstance(ChatQueryTitlePart, container, title, undefined, undefined));
			titles.push(container.textContent?.replace(/\u00a0/g, ' ') ?? '');
			assert.strictEqual(container.querySelector('a, img, strong, .codicon'), null);
		}
		assert.deepStrictEqual({ markdownRenders: render.callCount, first: titles[0], last: titles[199] }, {
			markdownRenders: 0,
			first: '<tool-0> **literal** [details] $(check)',
			last: '<tool-199> **literal** [details] $(check)',
		});
	});

	test('keeps markdown titles on the sanitized rendering path', () => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		const render = sinon.spy(instantiationService.get(IMarkdownRendererService), 'render');
		const container = document.createElement('div');
		const title = new MarkdownString('Read **file** [details](https://example.com)<script>alert(1)</script>');
		const part = store.add(instantiationService.createInstance(ChatQueryTitlePart, container, title, undefined, undefined));
		const formatted = !!container.querySelector('strong');
		const unsafe = !!container.querySelector('script');
		part.title = 'Done';
		assert.deepStrictEqual({ formatted, unsafe, text: container.textContent, markdownRenders: render.callCount }, {
			formatted: true, unsafe: false, text: 'Done', markdownRenders: 1,
		});
	});

	test('preserves the markup of escaped plain text, links, and multiline titles', () => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		const renderer = instantiationService.get(IMarkdownRendererService);
		for (const text of ['', 'Read file.ts', '  spaced\ttext  ', '<img src=x onerror=alert(1)> **literal** $(check)', '&copy; &amp;', 'Visit https://example.com', 'Contact test@example.com', 'First line\nSecond line', 'x'.repeat(100_001)]) {
			const expected = store.add(renderer.render(new MarkdownString('', { supportThemeIcons: true }).appendText(text)));
			const container = document.createElement('div');
			store.add(instantiationService.createInstance(ChatQueryTitlePart, container, text, undefined, undefined));
			assert.strictEqual(container.firstElementChild?.outerHTML, expected.element.outerHTML, text.slice(0, 100));
		}
	});

	test('applies initial markdown options without rendering the title twice', () => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		const render = sinon.spy(instantiationService.get(IMarkdownRendererService), 'render');
		const container = document.createElement('div');
		store.add(instantiationService.createInstance(ChatQueryTitlePart, container, new MarkdownString('Visit https://example.com'), undefined, {
			markdownRenderOptions: { markedOptions: { gfm: false } },
		}));
		assert.deepStrictEqual({ markdownRenders: render.callCount, hasLink: !!container.querySelector('a') }, {
			markdownRenders: 1, hasLink: false,
		});
	});
});

suite('ChatCustomConfirmationWidget', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createWidget(buttons: IChatConfirmationButton<boolean>[]): ChatCustomConfirmationWidget<boolean> {
		const instantiationService = workbenchInstantiationService(undefined, store);
		const message = mainWindow.document.createElement('div');
		const widget = store.add(instantiationService.createInstance(
			ChatCustomConfirmationWidget<boolean>,
			{} as IChatContentPartRenderContext,
			{ title: 'Confirm', message, buttons }
		));
		mainWindow.document.body.appendChild(widget.domNode);
		store.add(toDisposable(() => widget.domNode.remove()));
		return widget;
	}

	function button(label: string, moreActions?: IChatConfirmationButton<boolean>[]): IChatConfirmationButton<boolean> {
		return { label, data: true, moreActions };
	}

	test('runs the current primary action with its original button data', () => {
		const widget = createWidget([button('Allow Once', [button('Always Allow')]), button('Skip')]);
		const clicks: { label: string; data: boolean; isTouchClick: boolean }[] = [];
		store.add(widget.onDidClick(({ button, isTouchClick }) => clicks.push({ label: button.label, data: button.data, isTouchClick })));

		widget.runPrimaryAction();
		widget.updateButtons([{ label: 'Deny Once', data: false, moreActions: [button('Always Deny')] }]);
		widget.runPrimaryAction();
		widget.updateButtons([]);
		widget.runPrimaryAction();

		assert.deepStrictEqual(clicks, [
			{ label: 'Allow Once', data: true, isTouchClick: false },
			{ label: 'Deny Once', data: false, isTouchClick: false },
		]);
	});

	test('does not run a disabled primary action or fall through to a secondary action', () => {
		const disablement = store.add(new Emitter<boolean>());
		const widget = createWidget([
			{ ...button('Reveal Selected'), disabled: true, onDidChangeDisablement: disablement.event },
			{ label: 'Cancel', data: false, isSecondary: true },
		]);
		const clicks: string[] = [];
		store.add(widget.onDidClick(({ button }) => clicks.push(button.label)));

		widget.runPrimaryAction();
		const initiallyDisabled = [...clicks];
		disablement.fire(false);
		widget.runPrimaryAction();
		disablement.fire(true);
		widget.runPrimaryAction();

		assert.deepStrictEqual({ initiallyDisabled, clicks }, { initiallyDisabled: [], clicks: ['Reveal Selected'] });
	});

	test('renders a dropdown only when a button has an additional action', () => {
		const widget = createWidget([
			button('Allow'),
			button('Allow Empty', []),
			{ ...button('Allow Separator'), moreActions: [new Separator()] },
			button('Allow More', [button('Always Allow')]),
		]);

		assert.deepStrictEqual(
			[...widget.domNode.querySelectorAll('.monaco-button-dropdown')].map(element => element.textContent),
			['Allow More']
		);
	});

	test('preserves focused button when buttons reorder', () => {
		const widget = createWidget([button('Allow'), button('Skip')]);
		const initialButtons = widget.domNode.querySelectorAll<HTMLElement>('.monaco-button');
		initialButtons[1].focus();

		const updatedButtons = [button('Skip'), button('Allow', [button('Always Allow')])];
		widget.updateButtons(updatedButtons);
		const renderedButtons = widget.domNode.querySelectorAll<HTMLElement>('.monaco-button');
		assert.strictEqual(mainWindow.document.activeElement, renderedButtons[0]);
	});

	test('preserves focus on dropdown control', () => {
		const widget = createWidget([button('Allow', [button('Always Allow')]), button('Skip')]);
		let renderedButtons = widget.domNode.querySelectorAll<HTMLElement>('.monaco-button');
		renderedButtons[1].focus();

		widget.updateButtons([button('Skip'), button('Allow', [button('Always Allow')])]);
		renderedButtons = widget.domNode.querySelectorAll<HTMLElement>('.monaco-button');
		assert.strictEqual(mainWindow.document.activeElement, renderedButtons[2]);
	});

	test('does not move focus when focused button is removed', () => {
		const widget = createWidget([button('Allow'), button('Skip')]);
		const initialButtons = widget.domNode.querySelectorAll<HTMLElement>('.monaco-button');
		initialButtons[1].focus();

		widget.updateButtons([button('Allow')]);
		const renderedButton = widget.domNode.querySelector<HTMLElement>('.monaco-button');
		assert.notStrictEqual(mainWindow.document.activeElement, renderedButton);
	});

	test('does not move focus from outside the widget', () => {
		const widget = createWidget([button('Allow'), button('Skip')]);
		const externalButton = mainWindow.document.createElement('button');
		mainWindow.document.body.appendChild(externalButton);
		store.add(toDisposable(() => externalButton.remove()));
		externalButton.focus();

		widget.updateButtons([button('Skip'), button('Allow')]);
		assert.strictEqual(mainWindow.document.activeElement, externalButton);
	});
});
