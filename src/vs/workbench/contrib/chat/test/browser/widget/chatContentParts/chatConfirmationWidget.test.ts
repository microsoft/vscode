/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../../../base/browser/window.js';
import { Emitter } from '../../../../../../../base/common/event.js';
import { toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { workbenchInstantiationService } from '../../../../../../test/browser/workbenchTestServices.js';
import { ChatCustomConfirmationWidget, type IChatConfirmationButton } from '../../../../browser/widget/chatContentParts/chatConfirmationWidget.js';
import type { IChatContentPartRenderContext } from '../../../../browser/widget/chatContentParts/chatContentParts.js';

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
