/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../base/browser/window.js';
import { Emitter } from '../../../base/common/event.js';
import { mock } from '../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { ICommandService } from '../../../platform/commands/common/commands.js';
import { TestAccessibilityService } from '../../../platform/accessibility/test/common/testAccessibilityService.js';
import { ScreenReaderOptimizedButton, TitlebarPart } from '../../browser/parts/titlebarPart.js';

suite('Sessions - Titlebar Part', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const updateTitleBarToolBarOverflow = Reflect.get(TitlebarPart.prototype, 'updateTitleBarToolBarOverflow') as (this: TitlebarPart) => void;

	test('hides optional toolbar groups when a titlebar section overflows', () => {
		let centerClientWidth = 100;
		let rightClientWidth = 100;
		const root = createMeasuredElement(() => 100, () => 100);
		const left = createMeasuredElement(() => 20, () => 20);
		const toolBars = [20, 20, 20, 20, 20, 20].map(() => mainWindow.document.createElement('div'));
		const center = createMeasuredElement(
			() => centerClientWidth,
			() => 40 + visibleWidth(toolBars[1], 20) + visibleWidth(toolBars[2], 20)
		);
		const right = createMeasuredElement(
			() => rightClientWidth,
			() => 40 + visibleWidth(toolBars[0], 20) + visibleWidth(toolBars[3], 20) + visibleWidth(toolBars[4], 20) + visibleWidth(toolBars[5], 20)
		);
		const titlebarPart = Object.create(TitlebarPart.prototype) as TitlebarPart;
		Reflect.set(titlebarPart, 'rootContainer', root);
		Reflect.set(titlebarPart, 'leftContent', left);
		Reflect.set(titlebarPart, 'centerContent', center);
		Reflect.set(titlebarPart, 'rightContent', right);
		Reflect.set(titlebarPart, 'overflowManagedToolBarElements', toolBars);

		updateTitleBarToolBarOverflow.call(titlebarPart);
		const prioritized = toolBars.map(element => element.classList.contains('overflowing'));

		centerClientWidth = 200;
		rightClientWidth = 200;
		updateTitleBarToolBarOverflow.call(titlebarPart);
		const expanded = toolBars.map(element => element.classList.contains('overflowing'));

		assert.deepStrictEqual({ prioritized, expanded }, {
			prioritized: [true, false, false, false, false, false],
			expanded: [false, false, false, false, false, false],
		});
	});

	test('screen reader button reacts to mode changes and toggles the mode', () => {
		const container = mainWindow.document.createElement('div');
		const accessibilityService = new MutableTestAccessibilityService();
		const executedCommands: string[] = [];
		const button = new ScreenReaderOptimizedButton(
			container,
			accessibilityService,
			new class extends mock<ICommandService>() {
				override async executeCommand(commandId: string): Promise<undefined> {
					executedCommands.push(commandId);
					return undefined;
				}
			},
			() => { }
		);

		const initiallyVisible = button.element.style.display !== 'none';
		accessibilityService.setScreenReaderOptimized(true);
		const visibleAfterEnablement = button.element.style.display !== 'none';
		button.element.click();
		button.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
		accessibilityService.setScreenReaderOptimized(false);
		const visibleAfterDisablement = button.element.style.display !== 'none';
		button.dispose();
		accessibilityService.dispose();

		assert.deepStrictEqual({
			initiallyVisible,
			visibleAfterEnablement,
			visibleAfterDisablement,
			tabIndex: button.element.tabIndex,
			executedCommands,
		}, {
			initiallyVisible: false,
			visibleAfterEnablement: true,
			visibleAfterDisablement: false,
			tabIndex: 0,
			executedCommands: [
				'editor.action.toggleScreenReaderAccessibilityMode',
				'editor.action.toggleScreenReaderAccessibilityMode',
			],
		});
	});
});

class MutableTestAccessibilityService extends TestAccessibilityService {
	private readonly onDidChangeEmitter = new Emitter<void>();
	override readonly onDidChangeScreenReaderOptimized = this.onDidChangeEmitter.event;
	private screenReaderOptimized = false;

	override isScreenReaderOptimized(): boolean {
		return this.screenReaderOptimized;
	}

	setScreenReaderOptimized(value: boolean): void {
		this.screenReaderOptimized = value;
		this.onDidChangeEmitter.fire();
	}

	dispose(): void {
		this.onDidChangeEmitter.dispose();
	}
}

function createMeasuredElement(clientWidth: () => number, scrollWidth: () => number): HTMLElement {
	const element = mainWindow.document.createElement('div');
	Object.defineProperties(element, {
		clientWidth: { get: clientWidth },
		scrollWidth: { get: scrollWidth },
	});
	return element;
}

function visibleWidth(element: HTMLElement, width: number): number {
	return element.classList.contains('overflowing') || element.classList.contains('has-no-actions') ? 0 : width;
}
