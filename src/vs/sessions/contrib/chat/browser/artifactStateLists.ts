/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, addDisposableListener, append, EventHelper, EventType, getActiveElement, isAncestorOfActiveElement, reset } from '../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { Button, ButtonWithIcon } from '../../../../base/browser/ui/button/button.js';
import { IHoverWidget } from '../../../../base/browser/ui/hover/hover.js';
import { DomScrollableElement } from '../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { Disposable, DisposableMap, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { ScrollbarVisibility } from '../../../../base/common/scrollable.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { ArtifactDetailsItem, ArtifactDetailsItemRenderer, getArtifactDetailsItemLabel, renderArtifactIcon } from '../../../../platform/artifactIntegrations/browser/artifactDetailsList.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { WorkbenchList } from '../../../../platform/list/browser/listService.js';
import { defaultButtonStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { ArtifactButtons } from './artifactButtons.js';
import { placeArtifactChildren } from './artifactDetailsCard.js';
import { IArtifactActionViewData, IArtifactListViewData } from './artifactDetailsView.js';
import './media/artifactStateLists.css';

class ArtifactStateList extends Disposable {
	readonly element = $('.artifact-state-list', { id: generateUuid(), role: 'tabpanel', tabIndex: -1 });
	private readonly message = append(this.element, $('p.artifact-state-list-message'));
	private readonly itemsContainer = append(this.element, $('.artifact-details-list'));
	private readonly items: WorkbenchList<ArtifactDetailsItem>;
	private readonly more: ArtifactButtons;
	private data: IArtifactListViewData;

	constructor(data: IArtifactListViewData, instantiationService: IInstantiationService, hoverService: IHoverService) {
		super();
		this.data = data;
		const renderer = new ArtifactDetailsItemRenderer(hoverService);
		this.items = this._register(instantiationService.createInstance(
			WorkbenchList<ArtifactDetailsItem>, 'ArtifactStateList', this.itemsContainer,
			{ getHeight: () => renderer.rowHeight, getTemplateId: () => renderer.templateId }, [renderer],
			{
				multipleSelectionSupport: false, openOnSingleClick: true,
				identityProvider: { getId: item => item.id },
				keyboardNavigationLabelProvider: { getKeyboardNavigationLabel: item => item.label },
				accessibilityProvider: { getWidgetAriaLabel: () => this.data.title, getAriaLabel: getArtifactDetailsItemLabel },
			},
		));
		this._register(this.items.onDidOpen(event => {
			if (event.element) {
				this.data.openItem(event.element);
			}
		}));
		this.more = this._register(new ArtifactButtons(append(this.element, $('.artifact-controls')), hoverService, 'quiet'));
		this._register(toDisposable(() => this.element.remove()));
		this.items.splice(0, 0, data.items);
		this.update(data);
	}

	update(data: IArtifactListViewData): void {
		const previous = this.data;
		this.data = data;
		if (data.items !== previous.items) {
			const focused = isAncestorOfActiveElement(this.itemsContainer);
			const index = this.items.getFocus()[0] ?? 0;
			this.items.splice(0, this.items.length, data.items);
			if (focused && !this.items.getFocus().length) {
				if (data.items.length) {
					this.items.setFocus([Math.min(index, data.items.length - 1)]);
				} else {
					this.element.tabIndex = 0;
					this.element.focus({ preventScroll: true });
				}
			}
		}
		this.items.getHTMLElement().setAttribute('aria-label', data.title);
		this.itemsContainer.hidden = !data.items.length;
		this.element.tabIndex = data.items.length ? -1 : 0;
		this.message.textContent = data.message;
		this.message.hidden = !data.message;
		this.element.setAttribute('aria-description', data.message);
		this.more.update(data.more ? [data.more] : []);
	}

	layout(): void {
		this.items.layout(this.itemsContainer.clientHeight, this.itemsContainer.clientWidth);
	}

	focus(firstItem = false): void {
		this.layout();
		if (this.items.length) {
			if (firstItem || !this.items.getFocus().length) {
				this.items.setFocus([0]);
			}
			if (firstItem) {
				this.items.reveal(0);
			}
			this.items.domFocus();
		} else {
			this.element.focus({ preventScroll: true });
		}
	}

	get tabbableElements(): readonly HTMLElement[] {
		return this.element.hidden ? [] : [this.items.length ? this.items.getHTMLElement() : this.element, ...this.more.tabbableElements];
	}
}

class ArtifactListTab extends Disposable {
	readonly element = $('.artifact-list-tab-item', { role: 'presentation' });
	readonly button: ButtonWithIcon;
	private readonly info: Button;
	private readonly infoHover = this._register(new MutableDisposable<IHoverWidget>());
	private label = '';
	private description = '';

	constructor(select: (focus: 'tab' | 'list') => void, hoverService: IHoverService) {
		super();
		this.button = this._register(new ButtonWithIcon(this.element, {
			...defaultButtonStyles, secondary: true, small: true,
			buttonSecondaryBackground: 'transparent', buttonSecondaryHoverBackground: 'transparent',
			buttonSecondaryForeground: 'inherit', buttonSecondaryBorder: 'transparent',
		}));
		this.button.element.classList.add('artifact-list-tab');
		this.button.element.id = generateUuid();
		this.button.element.setAttribute('role', 'tab');
		this.button.iconElement.setAttribute('aria-hidden', 'true');
		this._register(this.button.onDidClick(event => select(event.type === EventType.KEY_DOWN ? 'tab' : 'list')));
		this._register(hoverService.setupDelayedHover(this.button.element, () => ({ content: this.label })));
		this.info = this._register(new Button(this.element, {
			...defaultButtonStyles, secondary: true,
			buttonSecondaryBackground: 'transparent', buttonSecondaryBorder: 'transparent', buttonSecondaryForeground: 'var(--vscode-descriptionForeground)',
		}));
		this.info.element.classList.add('artifact-list-tab-info');
		this.info.icon = Codicon.info;
		this._register(hoverService.setupDelayedHover(this.info.element, () => ({ content: this.description })));
		this._register(this.info.onDidClick(() => {
			this.infoHover.value = hoverService.showInstantHover({ target: this.info.element, content: this.description }, true);
		}));
		append(this.element, $('span.artifact-list-tab-focus', { 'aria-hidden': 'true' }));
		this._register(addDisposableListener(this.element, EventType.CLICK, event => {
			if (event.target === this.element) {
				select('list');
			}
		}));
		this._register(toDisposable(() => this.element.remove()));
	}

	update(data: IArtifactListViewData, list: HTMLElement, selected: boolean): void {
		this.label = data.title;
		this.button.label = data.title;
		reset(this.button.iconElement, renderArtifactIcon(data.icon));
		this.button.element.setAttribute('aria-controls', list.id);
		this.button.element.setAttribute('aria-selected', String(selected));
		this.button.element.setAttribute('aria-description', data.description);
		this.button.element.tabIndex = selected ? 0 : -1;
		this.element.classList.toggle('selected', selected);
		if (this.description !== data.description) {
			this.infoHover.clear();
		}
		this.description = data.description;
		if (!this.description && isAncestorOfActiveElement(this.info.element)) {
			this.button.element.focus({ preventScroll: true });
		}
		this.info.element.hidden = !this.description;
		this.info.element.setAttribute('aria-label', localize('artifactListInformation', "About {0}", data.title));
		this.info.element.setAttribute('aria-description', this.description);
		list.setAttribute('aria-labelledby', this.button.element.id);
		list.hidden = !selected;
	}

	get tabbableElements(): readonly HTMLElement[] {
		return [...this.button.element.tabIndex === 0 ? [this.button.element] : [], ...this.info.element.hidden ? [] : [this.info.element]];
	}
}

export class ArtifactStateLists extends Disposable {
	readonly element = $('.artifact-tabbed-state-widget');
	private readonly header = append(this.element, $('.artifact-tabbed-header'));
	private readonly content = append(this.element, $('.artifact-tabbed-content'));
	private readonly tabList = $('.artifact-list-tabs', { role: 'tablist', 'aria-label': localize('artifactStateLists', "Artifact State Lists") });
	private readonly scrollable = this._register(new DomScrollableElement(this.tabList, { horizontal: ScrollbarVisibility.Auto, vertical: ScrollbarVisibility.Hidden }));
	private readonly listsContainer = append(this.content, $('.artifact-details-lists'));
	private readonly actions: ArtifactButtons;
	private readonly tabs = this._register(new DisposableMap<string, ArtifactListTab>());
	private readonly lists = this._register(new DisposableMap<string, ArtifactStateList>());
	private data: readonly IArtifactListViewData[] = [];
	private selectList: (id: string) => void = () => { };

	constructor(private readonly hoverService: IHoverService, private readonly instantiationService: IInstantiationService) {
		super();
		this.scrollable.getDomNode().classList.add('artifact-list-tabs-scrollable');
		append(this.header, this.scrollable.getDomNode());
		this.actions = this._register(new ArtifactButtons(append(this.content, $('.artifact-controls.artifact-state-actions', { 'aria-label': localize('artifactStateActions', "Artifact Actions") })), hoverService));
		this._register(addDisposableListener(this.tabList, EventType.KEY_DOWN, event => {
			const keyboard = new StandardKeyboardEvent(event);
			const current = this.data.findIndex(list => this.tabs.get(list.id)?.button.element === getActiveElement());
			const next = keyboard.equals(KeyCode.RightArrow) ? (current + 1) % this.data.length
				: keyboard.equals(KeyCode.LeftArrow) ? (current + this.data.length - 1) % this.data.length
					: keyboard.equals(KeyCode.Home) ? 0 : keyboard.equals(KeyCode.End) ? this.data.length - 1 : -1;
			if (current >= 0 && next >= 0) {
				EventHelper.stop(event, true);
				this.select(this.data[next].id, 'tab');
			}
		}));
		this._register(toDisposable(() => this.element.remove()));
	}

	update(data: readonly IArtifactListViewData[], selected: string | undefined, actions: readonly IArtifactActionViewData[], selectList: (id: string) => void): void {
		this.data = data;
		this.selectList = selectList;
		const retained = new Set(data.map(list => list.id));
		for (const id of this.lists.keys()) {
			if (!retained.has(id)) {
				const focused = isAncestorOfActiveElement(this.lists.get(id)!.element) || isAncestorOfActiveElement(this.tabs.get(id)!.element);
				this.lists.deleteAndDispose(id);
				this.tabs.deleteAndDispose(id);
				if (focused) {
					this.element.closest<HTMLElement>('.artifact-integration-panel')?.focus({ preventScroll: true });
				}
			}
		}
		for (const item of data) {
			let list = this.lists.get(item.id);
			if (!list) {
				list = new ArtifactStateList(item, this.instantiationService, this.hoverService);
				this.lists.set(item.id, list);
				this.tabs.set(item.id, new ArtifactListTab(focus => this.select(item.id, focus), this.hoverService));
			} else {
				list.update(item);
			}
			this.tabs.get(item.id)!.update(item, list.element, item.id === selected);
		}
		placeArtifactChildren(this.tabList, data.map(list => this.tabs.get(list.id)!.element));
		placeArtifactChildren(this.listsContainer, data.map(list => this.lists.get(list.id)!.element));
		this.actions.update(actions);
		this.header.hidden = !data.length;
		this.listsContainer.hidden = !data.length;
		this.element.hidden = !data.length && !actions.length;
		this.element.classList.toggle('has-lists', data.length > 0);
	}

	private select(id: string, focus: 'tab' | 'list'): void {
		this.showSelection(id);
		this.selectList(id);
		if (focus === 'tab') {
			const tab = this.tabs.get(id);
			tab?.button.element.focus({ preventScroll: true });
			tab?.element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
		} else {
			this.lists.get(id)?.focus(true);
		}
	}

	focusList(id: string): void {
		this.showSelection(id);
		this.selectList(id);
		this.lists.get(id)?.focus();
	}

	private showSelection(id: string): void {
		for (const item of this.data) {
			this.tabs.get(item.id)!.update(item, this.lists.get(item.id)!.element, item.id === id);
		}
	}

	focusAction(id: string): boolean { return this.actions.focus(id); }

	layout(height: number): void {
		this.listsContainer.style.height = `${height}px`;
		this.scrollable.scanDomNode();
		for (const list of this.lists.values()) {
			list.layout();
		}
	}

	get tabbableElements(): readonly HTMLElement[] {
		return [...this.data.flatMap(list => this.tabs.get(list.id)?.tabbableElements ?? []),
		...this.data.flatMap(list => this.lists.get(list.id)?.tabbableElements ?? []), ...this.actions.tabbableElements];
	}
}
