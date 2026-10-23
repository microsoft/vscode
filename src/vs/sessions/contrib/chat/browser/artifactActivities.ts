/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, addDisposableListener, append, EventType, getActiveElement, isAncestorOfActiveElement, isHTMLElement, reset } from '../../../../base/browser/dom.js';
import { IListRenderer } from '../../../../base/browser/ui/list/list.js';
import { HoverStyle } from '../../../../base/browser/ui/hover/hover.js';
import { equals } from '../../../../base/common/arrays.js';
import { structuralEquals } from '../../../../base/common/equals.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { renderArtifactIcon } from '../../../../platform/artifactIntegrations/browser/artifactDetailsList.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { WorkbenchList } from '../../../../platform/list/browser/listService.js';
import { ArtifactButtons } from './artifactButtons.js';
import { ArtifactDetailsCard } from './artifactDetailsCard.js';
import { IArtifactActivitiesViewData, IArtifactActivityViewData } from './artifactDetailsView.js';
import './media/artifactActivities.css';

interface IActivityTemplate {
	readonly element: HTMLElement;
	readonly icon: HTMLElement;
	readonly label: HTMLElement;
	readonly actions: ArtifactButtons;
	readonly store: DisposableStore;
	item?: IArtifactActivityViewData;
}

class ActivityRenderer implements IListRenderer<IArtifactActivityViewData, IActivityTemplate> {
	readonly templateId = 'artifactActivity';
	constructor(private readonly hoverService: IHoverService) { }

	renderTemplate(container: HTMLElement): IActivityTemplate {
		const element = append(container, $('.artifact-activity-row'));
		const store = new DisposableStore();
		const template: IActivityTemplate = {
			element, store, icon: append(element, $('span.artifact-activity-icon', { 'aria-hidden': 'true' })),
			label: append(element, $('span.artifact-activity-label')),
			actions: store.add(new ArtifactButtons(append(element, $('.artifact-controls.artifact-activity-controls')), this.hoverService, 'quiet')),
		};
		store.add(this.hoverService.setupDelayedHoverAtMouse(template.label, () => ({ content: template.item?.description ?? '', style: HoverStyle.Mouse })));
		store.add(addDisposableListener(template.actions.element, EventType.CLICK, event => event.stopPropagation()));
		return template;
	}

	renderElement(item: IArtifactActivityViewData, _index: number, template: IActivityTemplate): void {
		template.item = item;
		template.label.textContent = item.label;
		template.element.classList.toggle('actionable', !!item.reveal);
		reset(template.icon, renderArtifactIcon(item.icon));
		template.actions.update(item.action ? [{ ...item.action, stopPropagation: true }] : []);
	}

	disposeTemplate(template: IActivityTemplate): void { template.store.dispose(); }
}

export class ArtifactActivities extends ArtifactDetailsCard {
	private readonly summary = append(this.heading, $('span.artifact-card-summary.artifact-activities-summary'));
	private readonly message = append(this.content, $('p.artifact-activities-message', { role: 'status', hidden: true }));
	private readonly listContainer = append(this.content, $('.artifact-activities-list'));
	private readonly list: WorkbenchList<IArtifactActivityViewData>;
	private readonly more: ArtifactButtons;
	private data: IArtifactActivitiesViewData | undefined;
	private maxHeight = 168;

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@IHoverService hoverService: IHoverService,
	) {
		super(expanded => this.data?.setExpanded(expanded));
		this.element.classList.add('artifact-activities');
		this.list = this._register(instantiationService.createInstance(
			WorkbenchList<IArtifactActivityViewData>, 'ArtifactActivities', this.listContainer,
			{ getHeight: () => 28, getTemplateId: () => 'artifactActivity' }, [new ActivityRenderer(hoverService)],
			{
				multipleSelectionSupport: false, openOnSingleClick: true, alwaysConsumeMouseWheel: false,
				identityProvider: { getId: item => item.id },
				keyboardNavigationLabelProvider: { getKeyboardNavigationLabel: item => item.label },
				accessibilityProvider: { getWidgetAriaLabel: () => localize('artifactActivities', "Activities"), getAriaLabel: item => item.description },
			},
		));
		this._register(this.list.onDidOpen(event => this.data?.items.find(item => item.id === event.element?.id)?.reveal?.()));
		this.more = this._register(new ArtifactButtons(append(this.content, $('.artifact-controls.artifact-activities-more')), hoverService, 'quiet'));
	}

	update(data: IArtifactActivitiesViewData): void {
		const active = getActiveElement();
		const hadFocus = isAncestorOfActiveElement(this.element);
		const previous = this.data?.items ?? [];
		this.data = data;
		if (!equals(previous, data.items, (a, b) => a.id === b.id && a.label === b.label && a.description === b.description
			&& structuralEquals(a.icon, b.icon) && a.action?.enabled === b.action?.enabled && a.action?.label === b.action?.label && !!a.reveal === !!b.reveal)) {
			this.list.splice(0, this.list.length, data.items);
		}
		this.element.hidden = !data.items.length;
		this.updateHeading(localize('artifactActivities', "Activities"), data.expanded);
		this.summary.textContent = data.summary;
		this.disclosure.element.setAttribute('aria-description', data.summary);
		this.message.textContent = data.message;
		this.message.hidden = !data.message;
		this.more.update(data.more ? [data.more] : []);
		this.layout(this.maxHeight);
		if (hadFocus && isHTMLElement(active) && (!active.isConnected || this.element.hidden)) {
			(this.element.hidden ? this.element.closest<HTMLElement>('.artifact-integration-panel') : this.disclosure.element)?.focus({ preventScroll: true });
		}
	}

	layout(maxHeight: number): void {
		this.maxHeight = maxHeight;
		if (this.content.hidden || this.element.hidden) {
			return;
		}
		const height = Math.min((this.data?.items.length ?? 0) * 28, Math.max(28, Math.floor(maxHeight / 28) * 28));
		this.listContainer.style.height = `${height}px`;
		this.list.layout(height, this.listContainer.clientWidth);
	}

	get tabbableElements(): readonly HTMLElement[] {
		return this.element.hidden ? [] : [this.disclosure.element, ...this.content.hidden ? [] : [this.list.getHTMLElement(), ...this.more.tabbableElements]];
	}
}
