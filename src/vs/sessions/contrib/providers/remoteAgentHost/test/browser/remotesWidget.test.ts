/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../../base/browser/dom.js';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { Disposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { OperatingSystem } from '../../../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { workbenchInstantiationService } from '../../../../../../workbench/test/browser/workbenchTestServices.js';
import { ICustomizationRemote, IRemotesModel, RemoteKind } from '../../browser/remotesModel.js';
import { RemotesWidget } from '../../browser/remotesWidget.js';

class TestRemotesModel extends Disposable implements IRemotesModel {
	readonly remotes = observableValue<readonly ICustomizationRemote[]>(this, [
		{ id: 'ssh:build', kind: 'ssh', name: 'Build server', detail: 'build.example.com', enabled: true },
		{ id: 'wsl:Ubuntu', kind: 'wsl', name: 'Ubuntu', detail: 'Ubuntu', enabled: true },
		{ id: 'tunnel:laptop', kind: 'tunnel', name: 'Laptop', detail: 'work-laptop', enabled: false },
		{ id: 'container:project', kind: 'devContainer', name: 'Project', detail: '/project', enabled: true },
	]);
	readonly changes: { id: string; enabled: boolean }[] = [];
	pendingChange: DeferredPromise<void> | undefined;
	failedKinds: readonly RemoteKind[] = [];
	pendingRefresh: DeferredPromise<readonly RemoteKind[]> | undefined;

	async refresh(): Promise<readonly RemoteKind[]> { return this.pendingRefresh?.p ?? this.failedKinds; }

	async setEnabled(id: string, enabled: boolean): Promise<void> {
		this.changes.push({ id, enabled });
		await this.pendingChange?.p;
		this.remotes.set(this.remotes.get().map(remote => remote.id === id ? { ...remote, enabled } : remote), undefined);
	}
}

suite('RemotesWidget', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createWidget(operatingSystem = OperatingSystem.Macintosh) {
		const parent = dom.append(document.body, dom.$('div'));
		parent.style.width = '700px';
		parent.style.height = '640px';
		store.add(toDisposable(() => parent.remove()));
		const instantiationService = workbenchInstantiationService(undefined, store);
		const errors: Parameters<INotificationService['error']>[0][] = [];
		const hoverContents = new Map<HTMLElement, string>();
		instantiationService.stub(INotificationService, 'error', (error: Parameters<INotificationService['error']>[0]) => { errors.push(error); });
		instantiationService.stub(IHoverService, new class extends mock<IHoverService>() {
			override setupDelayedHover(...args: Parameters<IHoverService['setupDelayedHover']>) {
				const options = typeof args[1] === 'function' ? args[1]() : args[1];
				if (typeof options.content === 'string') {
					hoverContents.set(args[0], options.content);
				}
				return Disposable.None;
			}
		}());
		const model = store.add(new TestRemotesModel());
		const widget = store.add(instantiationService.createInstance(RemotesWidget, parent, model, operatingSystem));
		widget.layout();
		return { widget, parent, model, errors, hoverContents };
	}

	function getSwitch(parent: HTMLElement, id: string): HTMLButtonElement {
		const row = [...parent.querySelectorAll<HTMLElement>('[data-remote-id]')].find(row => row.dataset.remoteId === id);
		const control = row?.querySelector<HTMLButtonElement>('[role="switch"]');
		assert.ok(control, `Missing switch for ${id}`);
		return control;
	}

	for (const operatingSystem of [OperatingSystem.Windows, OperatingSystem.Macintosh, OperatingSystem.Linux]) {
		test(`uses a grouped tree and switches with platform-specific roots (${operatingSystem})`, () => {
			const { parent, widget } = createWidget(operatingSystem);
			assert.deepStrictEqual({
				trees: parent.querySelectorAll('[role="tree"]').length,
				roots: [...parent.querySelectorAll('.group-label')].map(element => element.textContent),
				switches: parent.querySelectorAll('[role="switch"]').length,
				checkboxes: parent.querySelectorAll('[role="checkbox"]').length,
				accessibleWSL: widget.getAccessibilityContent().includes('Ubuntu'),
			}, {
				trees: 1,
				roots: operatingSystem === OperatingSystem.Windows ? ['WSL', 'SSH', 'Tunnels', 'Dev Containers'] : ['SSH', 'Tunnels', 'Dev Containers'],
				switches: operatingSystem === OperatingSystem.Windows ? 4 : 3,
				checkboxes: 0,
				accessibleWSL: operatingSystem === OperatingSystem.Windows,
			});
		});
	}

	test('updates the switch without losing its DOM focus or duplicating an in-flight change', async () => {
		const { parent, model } = createWidget();
		const control = getSwitch(parent, 'ssh:build');
		control.focus();
		model.pendingChange = new DeferredPromise<void>();
		control.click();
		control.click();
		await model.pendingChange.complete();
		await timeout(0);
		assert.deepStrictEqual({
			changes: model.changes,
			sameControl: getSwitch(parent, 'ssh:build') === control,
			focused: dom.getActiveElement() === control,
			checked: control.getAttribute('aria-checked'),
		}, { changes: [{ id: 'ssh:build', enabled: false }], sameControl: true, focused: true, checked: 'false' });
	});

	test('allows native switch keyboard activation instead of tree expansion or selection', () => {
		const { parent } = createWidget();
		const control = getSwitch(parent, 'ssh:build');
		control.focus();
		const events = [
			new KeyboardEvent('keydown', { key: ' ', keyCode: 32, bubbles: true, cancelable: true }),
			new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true }),
		];
		for (const event of events) {
			control.dispatchEvent(event);
		}
		assert.deepStrictEqual(events.map(event => event.defaultPrevented), [false, false]);
	});

	test('restores the switch and surfaces a failed visibility change', async () => {
		const { parent, model, errors } = createWidget();
		model.pendingChange = new DeferredPromise<void>();
		const control = getSwitch(parent, 'tunnel:laptop');
		control.click();
		const error = new Error('Could not register tunnel');
		await model.pendingChange.error(error);
		await timeout(0);
		assert.deepStrictEqual({
			checked: getSwitch(parent, 'tunnel:laptop').getAttribute('aria-checked'),
			errors,
		}, { checked: 'false', errors: [error] });
	});

	test('preserves collapsed groups through inventory updates', () => {
		const { parent, model } = createWidget();
		parent.querySelector('.monaco-tl-twistie')!.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
		const expandedBeforeUpdate = parent.querySelector('.ai-customization-group-header')!.closest('.monaco-list-row')?.getAttribute('aria-expanded');
		model.remotes.set([...model.remotes.get()], undefined);
		const firstGroup = parent.querySelector('.ai-customization-group-header')!.closest('.monaco-list-row');
		assert.deepStrictEqual({
			expandedBeforeUpdate,
			expanded: firstGroup?.getAttribute('aria-expanded'),
			sshRows: parent.querySelectorAll('[data-remote-id="ssh:build"]').length,
			switches: parent.querySelectorAll('[role="switch"]').length,
		}, { expandedBeforeUpdate: 'false', expanded: 'false', sshRows: 0, switches: 2 });
	});

	test('search matches names, details and groups and filters the accessible view', () => {
		const { parent, widget } = createWidget();
		const matches: string[][] = [];
		for (const query of ['build.example', 'Tunnels', 'no match', '']) {
			widget.setSearchQuery(query);
			matches.push([...parent.querySelectorAll<HTMLElement>('[data-remote-id]')].map(row => row.dataset.remoteId!));
			if (query === 'Tunnels') {
				assert.ok(!widget.getAccessibilityContent().includes('Build server'));
			}
		}
		assert.deepStrictEqual(matches, [['ssh:build'], ['tunnel:laptop'], [], ['ssh:build', 'tunnel:laptop', 'container:project']]);
	});

	test('shows unavailable remotes with disabled switches', () => {
		const { parent, model } = createWidget();
		model.remotes.set([{ id: 'container:unsupported', kind: 'devContainer', name: 'Unsupported', detail: 'volume', enabled: false, unavailableReason: 'No local source folder' }], undefined);
		const control = getSwitch(parent, 'container:unsupported');
		control.click();
		assert.deepStrictEqual({ disabled: control.disabled, changes: model.changes }, { disabled: true, changes: [] });
	});

	test('shows refresh warnings on the failed groups, with simple tooltips and accessible labels', async () => {
		const { parent, model, widget, hoverContents } = createWidget();
		model.remotes.set(model.remotes.get().filter(remote => remote.kind !== 'devContainer'), undefined);
		model.failedKinds = ['tunnel', 'devContainer'];
		widget.setVisible(true);
		await timeout(0);
		const warnings = [...parent.querySelectorAll<HTMLElement>('.remotes-refresh-warning')].map(icon => {
			const group = icon.closest('.ai-customization-group-header')!;
			return {
				group: group.querySelector('.group-label')?.textContent,
				tooltip: hoverContents.get(icon),
				announced: group.closest('.monaco-list-row')?.getAttribute('aria-label')?.includes(hoverContents.get(icon)!),
			};
		});
		assert.deepStrictEqual({
			warnings,
			message: parent.querySelector('.remotes-message')?.textContent,
			retainedHosts: parent.querySelectorAll('[data-remote-id]').length,
			accessibleWarnings: widget.getAccessibilityContent().match(/See the Window log for more details\./g)?.length,
		}, {
			warnings: [
				{ group: 'Tunnels', tooltip: 'Could not refresh tunnels. Check your sign-in and network connection. See the Window log for more details.', announced: true },
				{ group: 'Dev Containers', tooltip: 'Could not refresh Dev Containers. Check that Docker is running. See the Window log for more details.', announced: true },
			],
			message: '', retainedHosts: 2, accessibleWarnings: 2,
		});
	});

	test('retains warnings during retry and clears only the recovered groups', async () => {
		const { parent, model, widget } = createWidget();
		const warningGroups = () => [...parent.querySelectorAll('.remotes-refresh-warning')].map(icon => icon.closest('.ai-customization-group-header')?.querySelector('.group-label')?.textContent);
		const refresh = () => parent.querySelector<HTMLElement>('.section-title-actions .monaco-button')!.click();
		model.failedKinds = ['ssh', 'tunnel'];
		widget.setVisible(true);
		await timeout(0);
		const initial = warningGroups();
		model.pendingRefresh = new DeferredPromise<readonly RemoteKind[]>();
		refresh();
		const pending = warningGroups();
		await model.pendingRefresh.complete(['devContainer']);
		await timeout(0);
		const retried = warningGroups();
		model.pendingRefresh = undefined;
		model.failedKinds = [];
		refresh();
		await timeout(0);
		assert.deepStrictEqual({ initial, pending, retried, recovered: warningGroups() }, {
			initial: ['SSH', 'Tunnels'], pending: ['SSH', 'Tunnels'], retried: ['Dev Containers'], recovered: [],
		});
	});

	test('does not publish warnings from a canceled refresh or for platform-hidden groups', async () => {
		const { parent, model, widget } = createWidget();
		model.pendingRefresh = new DeferredPromise<readonly RemoteKind[]>();
		widget.setVisible(true);
		widget.setVisible(false);
		await model.pendingRefresh.complete(['tunnel']);
		await timeout(0);
		const canceled = parent.querySelectorAll('.remotes-refresh-warning').length;
		model.pendingRefresh = undefined;
		model.failedKinds = ['wsl'];
		widget.setVisible(true);
		await timeout(0);
		assert.deepStrictEqual({
			canceled,
			hidden: parent.querySelectorAll('.remotes-refresh-warning').length,
			accessibleWarning: widget.getAccessibilityContent().includes('Window log'),
		}, { canceled: 0, hidden: 0, accessibleWarning: false });
	});
});
