/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../../../base/browser/keyboardEvent.js';
import { IHoverDelegate } from '../../../../../../base/browser/ui/hover/hoverDelegate.js';
import { DomScrollableElement } from '../../../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { KeyCode } from '../../../../../../base/common/keyCodes.js';
import { Disposable, DisposableMap, DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { ScrollbarVisibility } from '../../../../../../base/common/scrollable.js';
import { localize } from '../../../../../../nls.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { IRemoteTableRow, RemotesTableRenderer, RemoteRowAction, RemoteTableEntry } from './remotesTable.js';

export class RemotesCards extends Disposable {
	readonly domNode: HTMLElement;
	private readonly content: HTMLElement;
	private readonly scrollable: DomScrollableElement;
	private readonly cards = this._register(new DisposableMap<string, {
		readonly element: HTMLElement;
		readonly focusTarget: HTMLElement;
		readonly groupContent?: HTMLElement;
		update(row: IRemoteTableRow, index: number): void;
		dispose(): void;
	}>());
	private readonly renderers: RemotesTableRenderer[];
	private focusedId: string | undefined;
	private ids: string[] = [];
	private rows: readonly IRemoteTableRow[] = [];

	constructor(
		container: HTMLElement,
		private readonly onAction: (entry: RemoteTableEntry, action: RemoteRowAction) => void,
		hoverDelegate: IHoverDelegate,
		@IInstantiationService instantiationService: IInstantiationService,
		@IHoverService hoverService: IHoverService,
		@IOpenerService openerService: IOpenerService,
	) {
		super();
		this.domNode = dom.append(container, dom.$('.remotes-cards-container'));
		this.content = dom.$('.remotes-cards', { role: 'list', 'aria-label': localize('remotes.cards', "Remote environments") });
		this.scrollable = this._register(new DomScrollableElement(this.content, {
			horizontal: ScrollbarVisibility.Hidden, vertical: ScrollbarVisibility.Auto,
		}));
		this.domNode.appendChild(this.scrollable.getDomNode());
		this.renderers = (['name', 'status', 'type', 'system', 'activity', 'actions'] as const).map(column =>
			new RemotesTableRenderer(column, onAction, hoverDelegate, instantiationService, hoverService, openerService));
		this._register(dom.addDisposableListener(this.content, dom.EventType.KEY_DOWN, event => {
			const keyboardEvent = new StandardKeyboardEvent(event);
			const index = this.ids.indexOf(this.focusedId ?? '');
			const entry = this.rows[index]?.entry;
			const onCard = event.target === this.cards.get(this.focusedId ?? '')?.focusTarget;
			if (onCard && entry?.type === 'group' && (
				keyboardEvent.keyCode === KeyCode.LeftArrow || keyboardEvent.keyCode === KeyCode.RightArrow
			)) {
				dom.EventHelper.stop(event, true);
				if (entry.collapsed !== (keyboardEvent.keyCode === KeyCode.LeftArrow)) {
					onAction(entry, 'toggleGroup');
				}
				return;
			}
			const next = keyboardEvent.keyCode === KeyCode.DownArrow || keyboardEvent.keyCode === KeyCode.RightArrow ? Math.min(this.ids.length - 1, index + 1)
				: keyboardEvent.keyCode === KeyCode.UpArrow || keyboardEvent.keyCode === KeyCode.LeftArrow ? Math.max(0, index - 1)
					: keyboardEvent.keyCode === KeyCode.Home ? 0
						: keyboardEvent.keyCode === KeyCode.End ? this.ids.length - 1 : undefined;
			if (next !== undefined && onCard) {
				dom.EventHelper.stop(event, true);
				this.focus(this.ids[next]);
			}
		}));
	}

	render(rows: readonly IRemoteTableRow[], getAriaLabel: (row: IRemoteTableRow) => string): void {
		const active = dom.getActiveElement();
		const hadFocus = !!active && this.domNode.contains(active);
		this.rows = rows;
		this.ids = rows.map(row => row.id);
		const ids = new Set(this.ids);
		for (const id of this.cards.keys()) {
			if (!ids.has(id)) {
				this.cards.deleteAndDispose(id);
			}
		}
		if (!this.focusedId || !ids.has(this.focusedId)) {
			this.focusedId = this.ids[0];
		}
		let next = this.content.firstElementChild;
		let groupContent: HTMLElement | undefined;
		let nextInGroup: Element | null = null;
		for (const [index, row] of rows.entries()) {
			if (row.entry.type === 'remote' && row.entry.ungrouped) {
				groupContent = undefined;
			}
			let card = this.cards.get(row.id);
			if (!card) {
				const store = new DisposableStore();
				const details = row.entry.type === 'group' ? dom.$<HTMLDetailsElement>('details.remotes-card-slot', { role: 'listitem' }) : undefined;
				const element = details ?? dom.$('.remotes-card-slot', { role: 'listitem' });
				element.dataset.remoteCardId = row.id;
				const summary = details ? dom.append(details, dom.$('summary.remotes-card-summary.agent-sessions-interactive.agent-sessions-interactive-list.sessions-disclosure')) : undefined;
				const body = dom.append(summary ?? element, dom.$('.remotes-card'));
				const children = details ? dom.append(details, dom.$('.remotes-card-grid', { role: 'list' })) : undefined;
				let collapsed: boolean | undefined;
				if (details) {
					store.add(dom.addDisposableListener(details, 'toggle', () => {
						const entry = this.rows.find(item => item.id === row.id)?.entry;
						if (entry?.type === 'group' && details.open === entry.collapsed) {
							this.onAction(entry, 'toggleGroup');
						}
					}));
				}
				const cells = this.renderers.map(renderer => {
					const cell = dom.append(body, dom.$('div'));
					const template = renderer.renderTemplate(cell);
					store.add({ dispose: () => renderer.disposeTemplate(template) });
					return { renderer, template };
				});
				const metadata = dom.$('.remotes-card-metadata');
				const focusTarget = summary ?? element;
				const header = dom.$('.remotes-card-header');
				for (const { template } of cells) {
					if (template.column === 'type' || template.column === 'system' || template.column === 'activity') {
						metadata.appendChild(template.container);
					} else if (template.column === 'name' || template.column === 'status') {
						header.appendChild(template.container);
					}
				}
				body.prepend(header);
				body.insertBefore(metadata, cells[cells.length - 1].template.container);
				if (row.entry.type === 'remote') {
					element.classList.add('agent-sessions-interactive', 'agent-sessions-interactive-list', 'agent-sessions-interactive-bordered');
					const actions = cells[cells.length - 1].template.container;
					store.add(dom.addDisposableListener(actions, dom.EventType.MOUSE_ENTER, () => element.classList.add('remotes-card-actions-hover')));
					store.add(dom.addDisposableListener(actions, dom.EventType.MOUSE_LEAVE, () => element.classList.remove('remotes-card-actions-hover')));
					store.add(dom.addDisposableListener(actions, dom.EventType.FOCUS_IN, () => element.classList.add('remotes-card-actions-focus')));
					store.add(dom.addDisposableListener(actions, dom.EventType.FOCUS_OUT, event => {
						if (!dom.isHTMLElement(event.relatedTarget) || !actions.contains(event.relatedTarget)) {
							element.classList.remove('remotes-card-actions-focus');
						}
					}));
				}
				store.add(dom.addDisposableListener(element, dom.EventType.FOCUS_IN, event => {
					if (!summary || event.target === summary) {
						this.setFocusedId(row.id);
					}
				}));
				card = {
					element, focusTarget, groupContent: children,
					update: (row, index) => {
						element.classList.toggle('remotes-card-section', row.entry.type !== 'remote');
						body.classList.toggle('remotes-card-group', row.entry.type !== 'remote');
						metadata.hidden = row.entry.type !== 'remote';
						for (const { renderer, template } of cells) {
							renderer.renderElement(row, index, template);
						}
						element.setAttribute('aria-label', getAriaLabel(row));
						if (details && summary && row.entry.type === 'group') {
							summary.setAttribute('aria-label', getAriaLabel(row));
							if (collapsed !== row.entry.collapsed) {
								collapsed = row.entry.collapsed;
								details.open = !collapsed;
							}
						}
					},
					dispose: () => { store.dispose(); element.remove(); },
				};
				this.cards.set(row.id, card);
			}
			if (row.entry.type === 'group' || !groupContent) {
				if (card.element !== next) {
					this.content.insertBefore(card.element, next);
				}
				next = card.element.nextElementSibling;
				groupContent = card.groupContent;
				nextInGroup = groupContent?.firstElementChild ?? null;
			} else {
				if (card.element !== nextInGroup) {
					groupContent.insertBefore(card.element, nextInGroup);
				}
				nextInGroup = card.element.nextElementSibling;
			}
			card.update(row, index);
		}
		this.setFocusedId(this.focusedId);
		if (hadFocus && (!this.domNode.contains(dom.getActiveElement()) || dom.isHTMLElement(active) && active.hidden)) {
			this.focus(this.focusedId);
		}
		this.layout();
	}

	private setFocusedId(id: string | undefined): void {
		this.focusedId = id;
		for (const [key, card] of this.cards) {
			if (!card.groupContent) {
				card.element.tabIndex = key === id ? 0 : -1;
			}
		}
		for (const renderer of this.renderers) {
			renderer.setFocusedId(id);
		}
	}

	scrollToTop(): void {
		this.scrollable.setScrollPosition({ scrollTop: 0 });
	}

	focus(id?: string): void {
		const card = this.cards.get(id ?? this.focusedId ?? '') ?? this.cards.get(this.ids[0]);
		if (card) {
			card.focusTarget.focus();
			this.scrollable.scanDomNode();
			const top = card.element.offsetTop;
			const bottom = top + card.element.offsetHeight;
			if (top < this.content.scrollTop) {
				this.content.scrollTop = top;
			} else if (bottom > this.content.scrollTop + this.content.clientHeight) {
				this.content.scrollTop = bottom - this.content.clientHeight;
			}
		}
	}

	layout(): void {
		this.scrollable.scanDomNode();
	}
}
