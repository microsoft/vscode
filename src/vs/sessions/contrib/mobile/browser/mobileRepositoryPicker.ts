/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { raceCancellationError, RunOnceScheduler } from '../../../../base/common/async.js';
import { cancelOnDispose, CancellationToken } from '../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
// eslint-disable-next-line local/code-translation-remind -- Experimental entry is excluded from production translation resources.
import { localize } from '../../../../nls.js';
import { ILayoutService } from '../../../../platform/layout/browser/layoutService.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IRepositoryPickResult } from '../../../../workbench/contrib/chat/browser/agentSessions/repositoryPicker.js';
import { isMobilePickerSheetTarget, showMobileContentSheet } from '../../../browser/parts/mobile/mobilePickerSheet.js';

export class MobileRepositoryPicker extends Disposable {
	private readonly currentPick = this._register(new MutableDisposable<DisposableStore>());
	private previousFocus: HTMLElement | undefined;

	constructor(
		@ILayoutService private readonly layoutService: ILayoutService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
	}

	async pickRepository(
		getRepositories: (query: string, token: CancellationToken) => Promise<readonly string[]>,
		token: CancellationToken = CancellationToken.None,
	): Promise<IRepositoryPickResult | undefined> {
		if (this._store.isDisposed || token.isCancellationRequested) {
			return undefined;
		}

		const focusedElement = dom.getActiveElement();
		const previousFocus = dom.isHTMLElement(focusedElement) && !isMobilePickerSheetTarget(focusedElement) ? focusedElement : this.previousFocus;
		this.previousFocus = previousFocus;
		const store = new DisposableStore();
		this.currentPick.value = store;
		const pickToken = cancelOnDispose(store);
		let selection: IRepositoryPickResult | undefined;

		try {
			await showMobileContentSheet(this.layoutService.mainContainer, localize('mobileRepositoryPicker.title', "Choose repository"), (body, api) => {
				const sheetStore = new DisposableStore();
				const requests = sheetStore.add(new DisposableStore());
				const rowsStore = sheetStore.add(new DisposableStore());
				const searchRow = dom.append(body, dom.$('.mobile-picker-sheet-search'));
				const input = dom.append(searchRow, dom.$<HTMLInputElement>('input.mobile-picker-sheet-search-input', {
					type: 'search', autocomplete: 'off', autocorrect: 'off', autocapitalize: 'off', spellcheck: 'false',
					'aria-label': localize('mobileRepositoryPicker.search', "Search repositories"),
				}));
				input.placeholder = localize('mobileRepositoryPicker.search', "Search repositories");
				const status = dom.append(body, dom.$('.mobile-picker-sheet-search-status', { role: 'status', 'aria-atomic': 'true' }));
				const list = dom.append(body, dom.$('.mobile-picker-sheet-list', { role: 'list', 'aria-label': localize('mobileRepositoryPicker.results', "Repositories") }));
				let buttons: HTMLButtonElement[] = [];

				const clearRows = () => {
					if (list.contains(dom.getActiveElement())) {
						input.focus();
					}
					rowsStore.clear();
					dom.clearNode(list);
					buttons = [];
					api.setBodyFocusTargets([input]);
				};
				const addRow = (label: string, accept: () => void) => {
					const item = dom.append(list, dom.$('div', { role: 'listitem' }));
					// Native buttons preserve scrolling without the Button widget's touch gesture interception.
					const button = dom.append(item, dom.$<HTMLButtonElement>('button.mobile-picker-sheet-item', { type: 'button' }));
					const text = dom.append(button, dom.$('span.mobile-picker-sheet-text'));
					dom.append(text, dom.$('span.mobile-picker-sheet-label')).textContent = label;
					rowsStore.add(dom.addDisposableListener(button, dom.EventType.CLICK, event => {
						dom.EventHelper.stop(event, true);
						accept();
					}));
					buttons.push(button);
					api.setBodyFocusTargets([input, ...buttons]);
				};
				const showLoading = () => {
					requests.clear();
					clearRows();
					status.setAttribute('role', 'status');
					status.textContent = localize('mobileRepositoryPicker.loading', "Loading repositories…");
					list.setAttribute('aria-busy', 'true');
				};
				const updateItems = async () => {
					const requestToken = cancelOnDispose(requests);
					try {
						const repositories = await raceCancellationError(getRepositories(input.value, requestToken), requestToken);
						if (requestToken.isCancellationRequested) {
							return;
						}
						status.textContent = repositories.length
							? repositories.length === 1
								? localize('mobileRepositoryPicker.oneRepository', "1 repository")
								: localize('mobileRepositoryPicker.count', "{0} repositories", repositories.length)
							: localize('mobileRepositoryPicker.empty', "No repositories found. Try a different search.");
						for (const repository of [...repositories].sort((a, b) => a.localeCompare(b))) {
							addRow(repository, () => {
								selection = { repository };
								api.close();
							});
						}
					} catch (error) {
						if (requestToken.isCancellationRequested) {
							return;
						}
						if (isCancellationError(error)) {
							api.close();
							return;
						}
						this.logService.error('Error fetching repositories', error);
						status.setAttribute('role', 'alert');
						status.textContent = localize('mobileRepositoryPicker.loadFailed', "Could not load repositories. Check your GitHub sign-in and connection, then try again.");
						addRow(localize('mobileRepositoryPicker.retry', "Try again"), () => {
							showLoading();
							void updateItems();
						});
					} finally {
						if (!requestToken.isCancellationRequested) {
							list.setAttribute('aria-busy', 'false');
						}
					}
				};
				const search = sheetStore.add(new RunOnceScheduler(() => void updateItems(), 300));
				sheetStore.add(dom.addDisposableListener(input, dom.EventType.INPUT, () => {
					showLoading();
					search.schedule();
				}));
				sheetStore.add(dom.addDisposableListener(body, dom.EventType.KEY_DOWN, (event: KeyboardEvent) => {
					if (event.isComposing) {
						return;
					}
					const index = buttons.findIndex(button => button === event.target);
					if (event.target !== input && index < 0) {
						return;
					}
					let target: HTMLElement | undefined;
					switch (event.key) {
						case 'ArrowDown':
							target = buttons[index + 1] ?? buttons[0];
							break;
						case 'ArrowUp':
							target = index === -1 ? buttons[buttons.length - 1] : buttons[index - 1] ?? input;
							break;
						case 'Home':
							target = index >= 0 ? buttons[0] : undefined;
							break;
						case 'End':
							target = index >= 0 ? buttons[buttons.length - 1] : undefined;
							break;
						case 'Enter':
							dom.EventHelper.stop(event, true);
							buttons[Math.max(index, 0)]?.click();
							return;
						case ' ':
							if (index >= 0) {
								dom.EventHelper.stop(event, true);
								buttons[index].click();
							}
							return;
					}
					if (target) {
						dom.EventHelper.stop(event, true);
						target.focus();
					}
				}));
				sheetStore.add(token.onCancellationRequested(() => api.close()));
				sheetStore.add(pickToken.onCancellationRequested(() => api.close()));
				showLoading();
				input.focus();
				// Start after the shell has registered sheetStore so synchronous cancellation also cleans up.
				search.schedule(0);
				return sheetStore;
			}, {
				doneLabel: localize('mobileRepositoryPicker.cancel', "Cancel"),
				trapFocus: true,
			});
			return token.isCancellationRequested || pickToken.isCancellationRequested ? undefined : selection;
		} finally {
			store.dispose();
			if (this.currentPick.value === store) {
				this.currentPick.clear();
				this.previousFocus = undefined;
			} else if (this._store.isDisposed) {
				this.previousFocus = undefined;
			}
			if (dom.isHTMLElement(previousFocus) && previousFocus.isConnected && dom.getActiveElement() === previousFocus.ownerDocument.body) {
				previousFocus.focus();
			}
		}
	}
}
