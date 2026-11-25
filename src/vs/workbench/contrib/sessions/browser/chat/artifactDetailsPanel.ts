/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, addDisposableListener, append, DisposableResizeObserver, EventType, getActiveElement, getWindow, isHTMLElement, reset } from '../../../../../base/browser/dom.js';
import { DomScrollableElement } from '../../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { CodeWindow } from '../../../../../base/browser/window.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Event } from '../../../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, IObservable } from '../../../../../base/common/observable.js';
import { ScrollbarVisibility } from '../../../../../base/common/scrollable.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { localize } from '../../../../../nls.js';
import { ArtifactDetailsItemRenderer, renderArtifactIcon } from '../../../../../platform/artifactIntegrations/browser/artifactDetailsList.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { Link } from '../../../../../platform/opener/browser/link.js';
import { ArtifactActivities } from './artifactActivities.js';
import { ArtifactAutopilot } from './artifactAutopilot.js';
import { ArtifactButtons, IArtifactButton } from './artifactButtons.js';
import { IArtifactBounds } from './artifactDetailsCard.js';
import { ArtifactDetailsSelection, artifactViewKey, IArtifactDetailsViewData } from './artifactDetailsView.js';
import { ArtifactStateLists } from './artifactStateLists.js';
import './media/artifactIntegrations.css';

const rowHeight = ArtifactDetailsItemRenderer.rowHeight;
/** Lists shrink to make room before the panel scrolls, but keep a few rows to stay useful. */
const stateListHeight: IArtifactListHeight = { preferred: 196, minimum: 112, step: rowHeight };
const activitiesHeight: IArtifactListHeight = { preferred: 6 * rowHeight, minimum: 3 * rowHeight, step: rowHeight };
/** Scrolling less than this reveals too little to be worth a scrollbar. */
const minimumScrollDistance = 2 * rowHeight;
/** The bottom padding the scrolled content keeps when it absorbs a small overflow. */
const minimumBottomPadding = 4;

/** The height range of a list that can trade its own scrolling for the panel's. */
export interface IArtifactListHeight {
	readonly preferred: number;
	readonly minimum: number;
	readonly step: number;
}

/**
 * Shrinks the tallest lists, a row at a time, until content that overflows by `overflow` with every list at
 * its preferred height fits. When it still overflows by more than `slack`, lists grow back until scrolling
 * reveals at least {@link minimumScrollDistance}.
 */
export function fitArtifactListHeights(lists: readonly IArtifactListHeight[], overflow: number, slack: number): { readonly heights: readonly number[]; readonly overflow: number } {
	const heights = lists.map(list => list.preferred);
	const resize = (index: number, height: number) => {
		overflow += height - heights[index];
		heights[index] = height;
	};
	while (overflow > 0) {
		const index = heights.reduce((best, height, i) => height > lists[i].minimum && (best < 0 || height > heights[best]) ? i : best, -1);
		if (index < 0) {
			break;
		}
		resize(index, Math.max(lists[index].minimum, heights[index] - lists[index].step));
	}
	while (overflow > slack && overflow < minimumScrollDistance) {
		const index = heights.reduce((best, height, i) => height < lists[i].preferred && (best < 0 || height < heights[best]) ? i : best, -1);
		if (index < 0) {
			break;
		}
		resize(index, Math.min(lists[index].preferred, heights[index] + lists[index].step));
	}
	return { heights, overflow };
}

/** Renders normalized data; the composer owns selection and the model owns provider interactions. */
export class ArtifactDetailsPanel extends Disposable {
	readonly element = $('.artifact-integration-panel', { tabIndex: -1 });
	private readonly header = append(this.element, $('.artifact-details-header'));
	private readonly titleIcon = append(this.header, $('span.artifact-details-title-icon', { 'aria-hidden': 'true' }));
	readonly title = append(this.header, $('h2.artifact-details-title', { id: generateUuid() }));
	private readonly titleLabel = $('span');
	private readonly titleLink: Link;
	private readonly titleLinkElement: HTMLElement;
	private readonly headerActions: ArtifactButtons;
	private readonly closeAction: IArtifactButton;
	private readonly body = $('.artifact-details-body');
	private readonly description = append(this.body, $('.artifact-details-description'));
	private readonly descriptionText = append(this.description, $('.artifact-details-description-content'));
	private readonly message = append(this.body, $('p.artifact-details-availability', { role: 'status' }));
	private readonly scrollable: DomScrollableElement;
	private readonly stateLists: ArtifactStateLists;
	private readonly lowerContent = $('.artifact-details-lower-content');
	private readonly autopilot: ArtifactAutopilot;
	private readonly activities: ArtifactActivities;
	private pendingSection: { readonly selection: ArtifactDetailsSelection; readonly target: Element | null } | undefined;

	constructor(
		private readonly model: IObservable<IArtifactDetailsViewData>,
		dismiss: (restoreFocus: boolean) => void,
		private readonly requestLayout: () => void,
		targetWindow: CodeWindow,
		@IHoverService hoverService: IHoverService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		this._register(toDisposable(() => this.element.remove()));
		this.titleLink = this._register(instantiationService.createInstance(Link, this.title, { label: this.titleLabel, href: model.get().resource }, { opener: () => this.model.get().openResource() }));
		this.titleLinkElement = this.titleLabel.parentElement!;
		this.titleLinkElement.classList.add('artifact-details-title-link');
		this.titleLinkElement.removeAttribute('role');
		this.titleLinkElement.setAttribute('aria-description', localize('artifactOpenResource', "Open Resource"));
		this.headerActions = this._register(new ArtifactButtons(append(this.header, $('.artifact-controls.artifact-header-actions', { 'aria-label': localize('artifactHeaderActions', "Artifact Actions") })), hoverService, 'quiet'));
		this.closeAction = { id: 'close', label: localize('artifactCloseDetails', "Close Artifact Details"), icon: Codicon.close, iconOnly: true, run: () => dismiss(true) };
		this.stateLists = this._register(new ArtifactStateLists(hoverService, instantiationService));
		this.autopilot = this._register(new ArtifactAutopilot(hoverService));
		this.activities = this._register(instantiationService.createInstance(ArtifactActivities));
		append(this.lowerContent, this.autopilot.element, this.activities.element);
		append(this.body, this.stateLists.element, this.lowerContent);
		// Everything below the header scrolls together, so no section is squeezed into its own small viewport.
		this.scrollable = this._register(new DomScrollableElement(this.body, { horizontal: ScrollbarVisibility.Hidden, vertical: ScrollbarVisibility.Auto }));
		this.scrollable.getDomNode().classList.add('artifact-details-scrollable');
		append(this.element, this.scrollable.getDomNode());
		// Focus and `scrollIntoView` scroll the body natively.
		this._register(addDisposableListener(this.body, EventType.SCROLL, () => this.scrollable.scanDomNode()));
		this._register(addDisposableListener(this.body, EventType.FOCUS_IN, event => {
			if (isHTMLElement(event.target) && event.target.matches(':focus-visible')) {
				this.reveal(event.target.getBoundingClientRect());
			}
		}));
		this._register(Event.any(this.stateLists.onDidFocusRowByKeyboard, this.activities.onDidFocusRowByKeyboard)(row => this.reveal(row)));
		const observer = this._register(new DisposableResizeObserver('ArtifactDetailsPanel', requestLayout, targetWindow));
		this._register(observer.observe(this.element));
		this._register(observer.observe(this.header));
		this._register(observer.observe(this.body));
		this._register(autorun(reader => this.update(model.read(reader))));
	}

	private update(data: IArtifactDetailsViewData): void {
		this.element.setAttribute('aria-busy', String(data.loading));
		this.titleLabel.textContent = data.title;
		this.titleLink.link = { label: this.titleLabel, href: data.resource };
		this.title.setAttribute('aria-description', data.titleDescription);
		reset(this.titleIcon, ...data.icon ? [renderArtifactIcon(data.icon)] : []);
		this.titleIcon.hidden = !data.icon;
		this.descriptionText.textContent = data.description;
		this.description.hidden = !data.description;
		this.message.textContent = data.message;
		this.message.hidden = !data.message;
		this.stateLists.update(data.lists, data.selectedList, data.stateActions, data.selectList);
		this.autopilot.update(data.autopilot);
		this.activities.update(data.activities);
		// General actions share the header toolbar with Close; actions without an icon keep their label.
		this.headerActions.update([...data.generalActions.map(action => action.icon ? { ...action, iconOnly: true } : action), this.closeAction]);
		this.lowerContent.hidden = !data.autopilot.length && !data.activities.items.length;
		if (this.pendingSection) {
			const pending = this.pendingSection;
			this.pendingSection = undefined;
			if (getActiveElement() === pending.target) {
				this.focusSection(pending.selection);
			}
		}
		this.requestLayout();
	}

	layout(maxHeight: number): void {
		this.element.style.maxHeight = `${maxHeight}px`;
		this.body.style.paddingBottom = '';
		const expanded = this.stateLists.expanded;
		const activities = this.activities.listHeight(activitiesHeight.preferred);
		// Measure once at the lists' current heights; resizing a list resizes the body by the same amount.
		const available = Math.max(0, Math.floor(maxHeight - this.header.getBoundingClientRect().height));
		const bottomPadding = parseFloat(getWindow(this.body).getComputedStyle(this.body).paddingBottom) || 0;
		const lists: (IArtifactListHeight & { readonly current: number; layout(height: number): void })[] = [
			...expanded ? [{ ...stateListHeight, current: this.stateLists.renderedHeight, layout: (height: number) => this.stateLists.layout(height) }] : [],
			...activities ? [{
				preferred: activities, minimum: Math.min(activities, activitiesHeight.minimum), step: activitiesHeight.step,
				current: this.activities.renderedListHeight, layout: (height: number) => this.activities.layout(height),
			}] : [],
		];
		// The body keeps its height limit, which would clamp its scroll position if lifted; its scroll height is its full content.
		const natural = this.body.scrollHeight + lists.reduce((sum, list) => sum + list.preferred - list.current, 0);
		const slack = Math.max(0, bottomPadding - minimumBottomPadding);
		const fit = fitArtifactListHeights(lists, natural - available, slack);
		if (!expanded) {
			this.stateLists.layout(stateListHeight.preferred);
		}
		lists.forEach((list, index) => list.layout(fit.heights[index]));
		if (fit.overflow > 0 && fit.overflow <= slack) {
			// Scrolling would only reveal padding, so give up some of it instead.
			this.body.style.paddingBottom = `${bottomPadding - fit.overflow}px`;
		}
		this.body.style.maxHeight = `${available}px`;
		this.scrollable.scanDomNode();
	}

	/** Scrolls the least distance that shows `target`, or as much of it as fits from its top. */
	private reveal(target: IArtifactBounds): void {
		this.scrollable.scanDomNode();
		const viewport = this.body.getBoundingClientRect();
		const delta = target.top < viewport.top ? target.top - viewport.top : Math.max(0, Math.min(target.bottom - viewport.bottom, target.top - viewport.top));
		if (delta) {
			this.scrollable.setScrollPosition({ scrollTop: this.body.scrollTop + delta });
		}
	}

	get tabbableElements(): readonly HTMLElement[] {
		return [this.titleLinkElement, ...this.headerActions.tabbableElements, ...this.stateLists.tabbableElements,
		...this.autopilot.tabbableElements, ...this.activities.tabbableElements];
	}

	focusSection(selection: ArtifactDetailsSelection): void {
		this.pendingSection = undefined;
		if (selection === 'autopilot') {
			this.autopilot.focus();
			return;
		}
		const section = this.model.get().sections.find(section => section.id === artifactViewKey(...selection));
		if (section?.target?.kind === 'list') {
			this.stateLists.focusList(section.target.id);
		} else if (section?.target?.kind !== 'action' || (!this.stateLists.focusAction(section.target.id) && !this.headerActions.focus(section.target.id))) {
			this.element.focus({ preventScroll: true });
		}
		if (section?.pending) {
			this.pendingSection = { selection, target: getActiveElement() };
		}
	}

	getAccessibleText(): string { return this.model.get().accessibleText; }
}
