/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append } from '../../../../../base/browser/dom.js';
import { DisposableStore, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ContextMenuHandler } from '../../../../../platform/contextview/browser/contextMenuHandler.js';
import { IContextViewDelegate, IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { renderIssueReporterRepositoryPicker } from '../../browser/issueReporterRepositoryPicker.js';
import { IssueReporterData, IssueSource } from '../../common/issue.js';

suite('Issue reporter inline repository picker', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('keeps a long selected repository inline with an ellipsis and a full accessible label', () => {
		const container = append(document.body, $('div'));
		store.add(toDisposable(() => container.remove()));
		container.style.width = '280px';
		container.style.font = '13px monospace';
		const repository = `owner/${'long-repository-'.repeat(6)}`;
		store.add(renderIssueReporterRepositoryPicker(container, {
			styles: {}, zoomLevel: 0, enabledExtensions: [], restrictedMode: false,
			isInstallationPure: true, isSessionsWindow: false, githubAccessToken: '',
			additionalRepositories: [repository], issueRepository: repository,
		}, { reportIssueUrl: 'https://github.com/microsoft/vscode/issues/new' }, { showContextMenu: () => { } }, () => { }));
		const button = container.querySelector<HTMLElement>('.issue-reporter-repository-picker')!;
		const label = button.querySelector<HTMLElement>('span:not(.codicon)')!;
		assert.deepStrictEqual({
			overflows: container.scrollWidth > container.clientWidth,
			truncated: label.scrollWidth > label.clientWidth,
			fullLabel: button.getAttribute('aria-label'),
			decorativeIcon: button.querySelector('.codicon')?.getAttribute('aria-hidden'),
		}, {
			overflows: false, truncated: true, fullLabel: `Choose Issue Repository: ${repository}`, decorativeIcon: 'true',
		});
	});

	for (const activation of [{ key: 'Enter', keyCode: 13 }, { key: ' ', keyCode: 32 }, { key: 'ArrowDown', keyCode: 40 }]) {
		test(`opens with ${activation.key}, navigates a real menu, selects and restores focus on Escape`, async () => {
			const container = append(document.body, $('div'));
			const menuContainer = append(document.body, $('div'));
			store.add(toDisposable(() => { container.remove(); menuContainer.remove(); }));
			const menuLifetime = store.add(new MutableDisposable<DisposableStore>());
			let currentDelegate: IContextViewDelegate | undefined;
			const contextViewService = new class extends mock<IContextViewService>() {
				override showContextView(delegate: IContextViewDelegate) {
					currentDelegate = delegate;
					const menuStore = new DisposableStore();
					menuLifetime.value = menuStore;
					menuStore.add(delegate.render(menuContainer));
					delegate.focus?.();
					return { close: () => this.hideContextView() };
				}
				override hideContextView(didCancel?: boolean) {
					const delegate = currentDelegate;
					currentDelegate = undefined;
					menuLifetime.clear();
					menuContainer.replaceChildren();
					delegate?.onHide?.(didCancel);
				}
				override getContextViewElement() { return menuContainer; }
			}();
			store.add(toDisposable(() => contextViewService.hideContextView()));
			const contextMenu = new ContextMenuHandler(
				contextViewService, NullTelemetryService,
				new class extends mock<INotificationService>() { override error(error: Error): void { throw error; } }(),
				new class extends mock<IKeybindingService>() { override lookupKeybinding() { return undefined; } }(),
			);
			contextMenu.configure({ blockMouse: false });
			const data: IssueReporterData = {
				styles: {}, zoomLevel: 0, enabledExtensions: [], restrictedMode: false,
				isInstallationPure: true, isSessionsWindow: false, githubAccessToken: '',
				issueSource: IssueSource.VSCode, additionalRepositories: ['owner/second', 'team/third'],
			};
			const picker = store.add(new MutableDisposable());
			const render = () => {
				picker.clear();
				picker.value = renderIssueReporterRepositoryPicker(container, data, { reportIssueUrl: 'https://github.com/microsoft/vscode/issues/new' }, contextMenu, repository => {
					data.issueRepository = repository;
					render();
				});
			};
			const getTrigger = () => container.querySelector<HTMLElement>('.issue-reporter-repository-picker')!;
			const key = (event: { key: string; keyCode: number }) => document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { ...event, bubbles: true, cancelable: true }));
			render();
			getTrigger().focus();
			key(activation);
			const initial = {
				expanded: getTrigger().getAttribute('aria-expanded'),
				labels: Array.from(menuContainer.querySelectorAll('.action-label'), element => element.textContent),
				focused: document.activeElement?.textContent,
			};
			key({ key: 'ArrowDown', keyCode: 40 });
			key({ key: 'ArrowDown', keyCode: 40 });
			key({ key: 'Enter', keyCode: 13 });
			await Promise.resolve();
			const selected = {
				repository: data.issueRepository,
				text: container.textContent,
				focused: document.activeElement === getTrigger(),
				expanded: getTrigger().getAttribute('aria-expanded'),
			};
			key(activation);
			key({ key: 'Escape', keyCode: 27 });
			assert.deepStrictEqual({
				initial, selected,
				cancelled: { focused: document.activeElement === getTrigger(), expanded: getTrigger().getAttribute('aria-expanded'), menu: !!menuContainer.querySelector('[role="menu"]') },
			}, {
				initial: { expanded: 'true', labels: ['microsoft/vscode', 'owner/second', 'team/third'], focused: 'microsoft/vscode' },
				selected: { repository: 'team/third', text: 'Issue will be opened in team/third', focused: true, expanded: 'false' },
				cancelled: { focused: true, expanded: 'false', menu: false },
			});
		});
	}
});
