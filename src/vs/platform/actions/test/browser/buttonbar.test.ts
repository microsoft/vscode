/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $ } from '../../../../base/browser/dom.js';
import { Separator, SubmenuAction, toAction, type IAction } from '../../../../base/common/actions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IContextMenuService } from '../../../contextview/browser/contextView.js';
import { IContextKeyService } from '../../../contextkey/common/contextkey.js';
import { ICommandService } from '../../../commands/common/commands.js';
import { MenuItemAction } from '../../common/actions.js';
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

	/** An action carrying an icon the way any non-menu action does: as a CSS class. */
	function iconAction(id: string): IAction {
		return toAction({ id, label: id, class: ThemeIcon.asClassName(Codicon.gitCommit), run: () => { } });
	}

	/**
	 * A menu action carrying its icon the way the production title bar supplies
	 * one: declared on the command rather than as a CSS class.
	 */
	function menuIconAction(id: string): MenuItemAction {
		return new MenuItemAction(
			{ id, title: id, icon: Codicon.gitCommit },
			undefined,
			undefined,
			undefined,
			undefined,
			new class extends mock<IContextKeyService>() {
				override contextMatchesRules(): boolean { return true; }
			}(),
			new class extends mock<ICommandService>() {
				override async executeCommand(): Promise<undefined> { return undefined; }
			}(),
		);
	}

	/**
	 * Classes of the button's leading slot, minus the animation-state class an
	 * observer toggles on the spinner.
	 */
	function leadingSlot(button: HTMLElement): string | undefined {
		const leading = button.firstElementChild;
		return leading
			? Array.from(leading.classList).filter(name => name !== 'monaco-pixel-spinner-paused').join(' ')
			: undefined;
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

	test('the spinner takes the place of the icon in the shared leading slot', () => {
		const { bar } = createButtonBar((_action, index) => ({ showLabel: true, showIcon: true, showSpinner: index === 0 }));

		bar.update([iconAction('busy'), iconAction('idle')], []);
		const busy = bar.buttons[0].element;
		const idle = bar.buttons[1].element;

		assert.deepStrictEqual({
			busyLeading: leadingSlot(busy),
			busyIcons: busy.querySelectorAll('.codicon').length,
			busyLabel: busy.textContent,
			idleLeading: leadingSlot(idle),
			idleSpinners: idle.querySelectorAll(SPINNER_SELECTOR).length,
			idleLabel: idle.textContent,
		}, {
			busyLeading: 'monaco-pixel-spinner monaco-button-leading-icon',
			busyIcons: 0,
			busyLabel: 'busy',
			idleLeading: 'codicon codicon-git-commit monaco-button-leading-icon',
			idleSpinners: 0,
			idleLabel: 'idle',
		});
	});

	test('the spinner stands in for the icon of an icon-only button', () => {
		const { bar } = createButtonBar((_action, index) => ({ showLabel: false, showIcon: true, showSpinner: index === 0 }));

		bar.update([iconAction('busy'), iconAction('idle')], []);
		const busy = bar.buttons[0].element;
		const idle = bar.buttons[1].element;

		assert.deepStrictEqual({
			// An icon-only button wears its icon as a class on the button itself,
			// so it has to come off while the spinner stands in for it.
			busyWearsIcon: busy.classList.contains('codicon-git-commit'),
			busyLeading: leadingSlot(busy),
			idleWearsIcon: idle.classList.contains('codicon-git-commit'),
			idleLeading: leadingSlot(idle),
		}, {
			busyWearsIcon: false,
			busyLeading: 'monaco-pixel-spinner monaco-button-leading-icon monaco-button-leading-icon-only',
			idleWearsIcon: true,
			idleLeading: undefined,
		});
	});

	test('a menu action gets its declared icon in the leading slot, replaced by the spinner', () => {
		// The production title bar supplies `MenuItemAction`s, whose icon is
		// declared on the command rather than carried as a CSS class.
		const { bar } = createButtonBar((_action, index) => ({ showLabel: true, showIcon: true, showSpinner: index === 0 }));

		bar.update([menuIconAction('busy'), menuIconAction('idle')], []);
		const busy = bar.buttons[0].element;
		const idle = bar.buttons[1].element;

		assert.deepStrictEqual({
			busyLeading: leadingSlot(busy),
			busyIcons: busy.querySelectorAll('.codicon').length,
			busyLabel: busy.textContent,
			idleLeading: leadingSlot(idle),
			idleSpinners: idle.querySelectorAll(SPINNER_SELECTOR).length,
			// The icon renders in its own slot rather than inline in the label.
			idleLabel: idle.textContent,
		}, {
			busyLeading: 'monaco-pixel-spinner monaco-button-leading-icon',
			busyIcons: 0,
			busyLabel: 'busy',
			idleLeading: 'codicon codicon-git-commit monaco-button-leading-icon',
			idleSpinners: 0,
			idleLabel: 'idle',
		});
	});

	test('an icon-only menu action wears its declared icon, and only the spinner while busy', () => {
		const { bar } = createButtonBar((_action, index) => ({ showLabel: false, showIcon: true, showSpinner: index === 0 }));

		bar.update([menuIconAction('busy'), menuIconAction('idle')], []);
		const busy = bar.buttons[0].element;
		const idle = bar.buttons[1].element;

		assert.deepStrictEqual({
			busyWearsIcon: busy.classList.contains('codicon-git-commit'),
			busyLeading: leadingSlot(busy),
			idleWearsIcon: idle.classList.contains('codicon-git-commit'),
			idleLeading: leadingSlot(idle),
		}, {
			busyWearsIcon: false,
			busyLeading: 'monaco-pixel-spinner monaco-button-leading-icon monaco-button-leading-icon-only',
			idleWearsIcon: true,
			idleLeading: undefined,
		});
	});
});
