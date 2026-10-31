/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { Action } from '../../../../../../base/common/actions.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize } from '../../../../../../nls.js';
import { ArtifactDetailsItem, ArtifactDetailsItemRenderer, getArtifactDetailsDescription, getArtifactDetailsItemLabel, getArtifactThemeIcon, renderArtifactIcon } from '../../../../../../platform/artifactIntegrations/browser/artifactDetailsList.js';
import { ArtifactAvailability, ArtifactRequestPresentation } from '../../../../../../platform/artifactIntegrations/common/artifactIntegration.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { WorkbenchList } from '../../../../../../platform/list/browser/listService.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { ChatPillActionViewItem } from '../../../../../browser/chatPills.js';
import { IChatRequestViewModel } from '../../../common/model/chatViewModel.js';
import { ChatActionRequestContentPart } from './chatActionRequestContentPart.js';
import './media/chatArtifactActionContent.css';

export function getArtifactRequestPresentation(element: IChatRequestViewModel): ArtifactRequestPresentation | undefined {
	return element.isSystemInitiated && element.requestSource === 'artifactIntegration' ? element.artifactRequest : undefined;
}

export function getArtifactRequestLabel(presentation: ArtifactRequestPresentation): string {
	return localize('chat.artifactAction.summary', "{0}: {1}", presentation.action.label, presentation.artifact.label);
}

function getArtifactDetailsAvailabilityText(availability: ArtifactAvailability): string | undefined {
	return availability.kind === 'available' ? undefined : availability.kind === 'loading'
		? localize('chat.artifactAction.loadingSnapshot', "Details were still loading when this action started.")
		: availability.reason;
}

export function getArtifactRequestAccessibleText(presentation: ArtifactRequestPresentation): string {
	return [
		getArtifactRequestLabel(presentation),
		presentation.artifact.description,
		...presentation.details.flatMap(details => [
			details.title,
			getArtifactDetailsDescription(details),
			getArtifactDetailsAvailabilityText(details.availability),
			...details.facts?.map(fact => localize('chat.artifactAction.fact', "{0}: {1}", fact.label, fact.value)) ?? [],
			...details.items.map(getArtifactDetailsItemLabel),
			details.completeness === 'partial' ? localize('chat.artifactAction.partial', "Partial snapshot. Open the artifact for more details.") : undefined,
		]),
	].filter(value => value !== undefined && value !== '').join('\n');
}

export class ChatArtifactActionContentPart extends Disposable {
	readonly domNode: HTMLElement;

	constructor(
		presentation: ArtifactRequestPresentation,
		message: string,
		timestamp: number | undefined,
		@IInstantiationService instantiationService: IInstantiationService,
		@IHoverService hoverService: IHoverService,
		@IOpenerService private readonly openerService: IOpenerService,
		@INotificationService private readonly notificationService: INotificationService,
	) {
		super();
		const title = getArtifactRequestLabel(presentation);
		const source = presentation.source === 'automation'
			? localize('chat.artifactAction.automaticSource', "{0} (Automatic)", presentation.integrationLabel)
			: presentation.integrationLabel;
		const card = this._register(instantiationService.createInstance(ChatActionRequestContentPart, {
			title, label: localize('chat.artifactAction.accessibleLabel', "{0}, {1}", title, source), source, message, timestamp,
			icon: getArtifactThemeIcon({ id: presentation.action.iconId }),
		}));
		this.domNode = card.domNode;
		this.domNode.classList.add('chat-artifact-action');

		const artifact = presentation.artifact;
		const resourceRow = dom.append(card.details, dom.$('.chat-artifact-action-resource'));
		const artifactIcon = getArtifactThemeIcon(artifact.icon ?? { id: 'link' });
		const action = this._register(new Action('chat.artifactAction.openResource', artifact.label,
			undefined, true, () => this.openResource(artifact.resource)));
		action.tooltip = artifact.description ?? artifact.resource;
		const pill = this._register(new class extends ChatPillActionViewItem {
			protected override getIconElement(): HTMLElement {
				return renderArtifactIcon(artifactIcon, 'chat-pill-icon');
			}
		}(undefined, action, {}));
		pill.render(resourceRow);
		if (artifact.description) {
			dom.append(card.details, dom.$('p.chat-artifact-action-description', undefined, artifact.description));
		}
		for (const details of presentation.details) {
			const section = dom.append(card.details, dom.$('.chat-artifact-action-section'));
			dom.append(section, dom.$('.chat-artifact-action-section-title', undefined, details.title));
			const description = getArtifactDetailsDescription(details);
			if (description) {
				dom.append(section, dom.$('p.chat-artifact-action-description', undefined, description));
			}
			const availabilityText = getArtifactDetailsAvailabilityText(details.availability);
			if (availabilityText !== undefined) {
				dom.append(section, dom.$('p.chat-artifact-action-description', undefined, availabilityText));
			}
			if (details.facts?.length) {
				const facts = dom.append(section, dom.$('dl.chat-artifact-action-facts'));
				for (const fact of details.facts) {
					dom.append(facts, dom.$('dt', undefined, fact.label), dom.$('dd', undefined, fact.value));
				}
			}
			if (details.items.length) {
				const container = dom.append(section, dom.$('.artifact-details-list'));
				const renderer = new ArtifactDetailsItemRenderer(hoverService, true);
				const list = this._register(instantiationService.createInstance(
					WorkbenchList<ArtifactDetailsItem>, 'ArtifactActionDetails', container,
					{ getHeight: () => renderer.rowHeight, getTemplateId: () => renderer.templateId }, [renderer],
					{
						multipleSelectionSupport: false,
						openOnSingleClick: true,
						identityProvider: { getId: item => item.id },
						accessibilityProvider: { getWidgetAriaLabel: () => details.title, getAriaLabel: getArtifactDetailsItemLabel },
						keyboardNavigationLabelProvider: { getKeyboardNavigationLabel: item => item.label },
					},
				));
				list.splice(0, 0, details.items);
				const layout = () => list.layout(Math.min(details.items.length, 8) * renderer.rowHeight);
				layout();
				this._register(card.onDidChangeExpansion(layout));
				this._register(list.onDidOpen(event => {
					if (event.element) {
						void this.openResource(event.element.resource);
					}
				}));
			}
			if (details.completeness === 'partial') {
				dom.append(section, dom.$('p.chat-artifact-action-description', undefined, localize('chat.artifactAction.partial', "Partial snapshot. Open the artifact for more details.")));
			}
		}
	}

	private async openResource(resource: string): Promise<void> {
		try {
			const uri = URI.parse(resource, true);
			if (['command', 'javascript', 'data'].includes(uri.scheme.toLowerCase())) {
				throw new Error(localize('chat.artifactAction.unsafeLink', "This artifact link cannot be opened."));
			}
			await this.openerService.open(uri, { fromUserGesture: true, allowCommands: false });
		} catch (error) {
			this.notificationService.error(error);
		}
	}
}
