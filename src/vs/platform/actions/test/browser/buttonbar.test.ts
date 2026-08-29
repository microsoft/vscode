/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $ } from '../../../../base/browser/dom.js';
import { Separator, SubmenuAction, toAction, type IAction } from '../../../../base/common/actions.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IContextMenuService } from '../../../contextview/browser/contextView.js';
import { IHoverService } from '../../../hover/browser/hover.js';
import { TestInstantiationService } from '../../../instantiation/test/common/instantiationServiceMock.js';
import { IKeybindingService } from '../../../keybinding/common/keybinding.js';
import { ITelemetryService } from '../../../telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../telemetry/common/telemetryUtils.js';
import { WorkbenchButtonBar, type IButtonConfigProvider } from '../../browser/buttonbar.js';

const SPINNER_SELECTOR = '.monaco-pixel-spinner';

suite('WorkbenchButtonBar', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createButtonBar(buttonConfigProvider: IButtonConfigProvider): { readonly bar: WorkbenchButtonBar; readonly container: HTMLElement } {
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(ITelemetryService, NullTelemetryService);
		instantiationService.stub(IContextMenuService, new class extends mock<IContextMenuService>() {
			override showContextMenu(): void { }
		}());
		instantiationService.stub(IKeybindingService, new class extends mock<IKeybindingService>() {
			override appendKeybinding(label: string): string { return label; }
		}());
		instantiationService.stub(IHoverService, new class extends mock<IHoverService>() {
			override setupManagedHover() { return Disposable.None as never; }
		}());

		const container = $('div');
		const bar = disposables.add(instantiationService.createInstance(WorkbenchButtonBar, container, { buttonConfigProvider }));
		return { bar, container };
	}

	function action(id: string): IAction {
		return toAction({ id, label: id, run: () => { } });
	}

	test('renders the spinner only for buttons that ask for it', () => {
		const { bar, container } = createButtonBar((_action, index) => ({ showLabel: true, showSpinner: index === 0 }));

		bar.update([action('busy'), action('idle')], []);
		const button = bar.buttons[0].element;

		assert.deepStrictEqual({
			total: container.querySelectorAll(SPINNER_SELECTOR).length,
			onIdle: bar.buttons[1].element.querySelectorAll(SPINNER_SELECTOR).length,
			// The spinner leads the label rather than replacing it.
			leads: button.firstElementChild?.classList.contains('monaco-pixel-spinner'),
			label: button.textContent,
		}, {
			total: 1,
			onIdle: 0,
			leads: true,
			label: 'busy',
		});
	});

	test('renders the spinner on the primary half of a dropdown button', () => {
		const { bar } = createButtonBar(() => ({ showLabel: true, showSpinner: true }));

		bar.update([new SubmenuAction('id', 'Merge', [action('Merge'), new Separator(), action('Other')])], []);
		const button = bar.buttons[0].element;

		assert.deepStrictEqual({
			spinners: button.querySelectorAll(SPINNER_SELECTOR).length,
			// Not on the dropdown chevron, which is a sibling button.
			onDropdown: button.querySelector('.monaco-dropdown-button')?.querySelectorAll(SPINNER_SELECTOR).length,
		}, {
			spinners: 1,
			onDropdown: 0,
		});
	});
});
