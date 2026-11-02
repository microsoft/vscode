/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append, DisposableResizeObserver, getActiveElement, reset } from '../../../../base/browser/dom.js';
import { DomScrollableElement } from '../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { CodeWindow } from '../../../../base/browser/window.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, IObservable } from '../../../../base/common/observable.js';
import { ScrollbarVisibility } from '../../../../base/common/scrollable.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { renderArtifactIcon } from '../../../../platform/artifactIntegrations/browser/artifactDetailsList.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { Link } from '../../../../platform/opener/browser/link.js';
import { ArtifactActivities } from './artifactActivities.js';
import { ArtifactAutopilot } from './artifactAutopilot.js';
import { ArtifactButtons } from './artifactButtons.js';
import { ArtifactDetailsSelection, artifactViewKey, IArtifactDetailsViewData } from './artifactDetailsView.js';
import { ArtifactStateLists } from './artifactStateLists.js';
import './media/artifactIntegrations.css';

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
	private readonly body = $('.artifact-details-body');
	private readonly description = append(this.body, $('.artifact-details-description'));
	private readonly descriptionText = append(this.description, $('.artifact-details-description-content'));
	private readonly message = append(this.body, $('p.artifact-details-availability', { role: 'status' }));
	private readonly bodyScrollable: DomScrollableElement;
	private readonly stateLists: ArtifactStateLists;
	private readonly lowerContent = $('.artifact-details-lower-content');
	private readonly lowerScrollable: DomScrollableElement;
	private readonly autopilot: ArtifactAutopilot;
	private readonly activities: ArtifactActivities;
	private readonly generalActions: ArtifactButtons;
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
		this.headerActions = this._register(new ArtifactButtons(append(this.header, $('.artifact-controls.artifact-header-actions')), hoverService, 'quiet'));
		this.headerActions.update([{ id: 'close', label: localize('artifactCloseDetails', "Close Artifact Details"), icon: Codicon.close, iconOnly: true, run: () => dismiss(true) }]);
		this.bodyScrollable = this._register(new DomScrollableElement(this.body, { horizontal: ScrollbarVisibility.Hidden, vertical: ScrollbarVisibility.Auto }));
		this.bodyScrollable.getDomNode().classList.add('artifact-details-scrollable');
		append(this.element, this.bodyScrollable.getDomNode());
		this.stateLists = this._register(new ArtifactStateLists(hoverService, instantiationService));
		append(this.element, this.stateLists.element);
		this.autopilot = this._register(new ArtifactAutopilot(hoverService));
		this.activities = this._register(instantiationService.createInstance(ArtifactActivities));
		append(this.lowerContent, this.autopilot.element, this.activities.element);
		this.lowerScrollable = this._register(new DomScrollableElement(this.lowerContent, { horizontal: ScrollbarVisibility.Hidden, vertical: ScrollbarVisibility.Auto }));
		this.lowerScrollable.getDomNode().classList.add('artifact-details-lower-scrollable');
		append(this.element, this.lowerScrollable.getDomNode());
		this.generalActions = this._register(new ArtifactButtons(append(this.element, $('.artifact-controls.artifact-general-actions', { 'aria-label': localize('artifactGeneralActions', "General Actions") })), hoverService, 'quiet'));
		const observer = this._register(new DisposableResizeObserver('ArtifactDetailsPanel', requestLayout, targetWindow));
		this._register(observer.observe(this.element));
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
		this.generalActions.update(data.generalActions);
		this.lowerScrollable.getDomNode().hidden = !data.autopilot.length && !data.activities.items.length;
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
		const data = this.model.get();
		this.activities.layout(Math.min(168, maxHeight * 0.3));
		this.lowerContent.style.maxHeight = `${Math.max(80, Math.min(320, maxHeight * (data.activities.expanded && data.activities.items.length ? 0.42 : 0.3)))}px`;
		this.lowerScrollable.scanDomNode();
		this.stateLists.layout(196);
		this.body.style.maxHeight = '';
		const shortage = Math.max(0, this.body.offsetHeight - this.bodyScrollable.getDomNode().clientHeight);
		this.stateLists.layout(Math.max(56, 196 - Math.ceil(shortage / 28) * 28));
		this.body.style.maxHeight = `${this.bodyScrollable.getDomNode().clientHeight}px`;
		this.bodyScrollable.scanDomNode();
	}

	get tabbableElements(): readonly HTMLElement[] {
		return [this.titleLinkElement, ...this.headerActions.tabbableElements, ...this.stateLists.tabbableElements,
		...this.autopilot.tabbableElements, ...this.activities.tabbableElements, ...this.generalActions.tabbableElements];
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
		} else if (section?.target?.kind !== 'action' || (!this.stateLists.focusAction(section.target.id) && !this.generalActions.focus(section.target.id))) {
			this.element.focus({ preventScroll: true });
		}
		if (section?.pending) {
			this.pendingSection = { selection, target: getActiveElement() };
		}
	}

	getAccessibleText(): string { return this.model.get().accessibleText; }
}
