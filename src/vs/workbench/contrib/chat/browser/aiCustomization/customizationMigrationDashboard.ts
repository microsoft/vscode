/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/aiCustomizationManagement.css';
import * as DOM from '../../../../../base/browser/dom.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';
import { defaultButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';

const $ = DOM.$;

export interface ICustomizationMigrationDashboardItem {
	readonly id: string;
	readonly label: string;
	readonly description: string;
	readonly count: number;
	readonly operationLabel: string;
	readonly sourceLabel: string;
	readonly destinationLabel: string;
	readonly itemSummary: string;
	readonly actionLabel: string;
	readonly actionAriaLabel: string;
}

const AGENT_HOST_ARCHITECTURE_URL = 'https://code.visualstudio.com/blogs/2026/08/26/agent-host-architecture';

export class CustomizationMigrationDashboard extends Disposable {
	readonly element: HTMLElement;

	private readonly renderDisposables = this._register(new DisposableStore());
	private firstFocusableElement: HTMLElement | undefined;

	constructor(
		parent: HTMLElement,
		private readonly openCategory: (id: string) => void,
		private readonly openDocumentation: (url: string) => void,
	) {
		super();
		this.element = DOM.append(parent, $('.customization-migration-dashboard'));
	}

	setItems(items: readonly ICustomizationMigrationDashboardItem[], harnessLabel: string): void {
		this.renderDisposables.clear();
		DOM.clearNode(this.element);
		this.firstFocusableElement = undefined;

		if (items.length === 0) {
			this.renderEmptyState(harnessLabel);
			return;
		}

		const summary = DOM.append(this.element, $('.customization-migration-dashboard-summary'));
		const summaryDescription = DOM.append(summary, $('p.customization-migration-dashboard-summary-description'));
		DOM.append(summaryDescription, $('span')).textContent = localize(
			'customizationMigrationDashboardSummary',
			"VS Code is moving agent sessions to Agent Host-based harnesses so sessions can persist across windows, run locally or remotely, and use a common foundation across harnesses. Some existing customizations use VS Code-specific formats or locations that {0} does not discover. Review the customizations below to keep them available.",
			harnessLabel,
		);
		summaryDescription.appendChild(document.createTextNode(' '));
		const architectureLink = DOM.append(summaryDescription, $('a.customization-migration-dashboard-summary-link')) as HTMLAnchorElement;
		architectureLink.href = AGENT_HOST_ARCHITECTURE_URL;
		architectureLink.textContent = localize('customizationMigrationDashboardAgentHostLink', "Learn more about the Agent Host architecture");
		this.renderDisposables.add(DOM.addDisposableListener(architectureLink, 'click', event => {
			event.preventDefault();
			this.openDocumentation(architectureLink.href);
		}));

		const cards = DOM.append(this.element, $('.customization-migration-dashboard-cards'));
		for (const item of items) {
			this.renderCard(cards, item);
		}
	}

	focus(): void {
		this.firstFocusableElement?.focus();
	}

	getFirstFocusableElement(): HTMLElement | undefined {
		return this.firstFocusableElement;
	}

	private renderCard(parent: HTMLElement, item: ICustomizationMigrationDashboardItem): void {
		const card = DOM.append(parent, $('section.customization-migration-dashboard-card'));
		card.setAttribute('aria-labelledby', `customization-migration-dashboard-${item.id}-title`);

		const header = DOM.append(card, $('.customization-migration-dashboard-card-header'));
		const identity = DOM.append(header, $('.customization-migration-dashboard-card-identity'));
		const title = DOM.append(identity, $('h3.customization-migration-dashboard-card-title'));
		title.id = `customization-migration-dashboard-${item.id}-title`;
		title.textContent = item.label;
		const count = DOM.append(identity, $('span.customization-migration-dashboard-card-count'));
		count.textContent = String(item.count);

		const description = DOM.append(card, $('p.customization-migration-dashboard-card-description'));
		description.textContent = item.description;

		const route = DOM.append(card, $('.customization-migration-dashboard-route'));
		route.setAttribute('aria-label', localize(
			'customizationMigrationDashboardRouteAriaLabel',
			"{0} from {1} to {2}",
			item.operationLabel,
			item.sourceLabel,
			item.destinationLabel,
		));
		this.renderRouteEndpoint(route, localize('customizationMigrationDashboardCurrent', "Current"), item.sourceLabel);
		const routeOperation = DOM.append(route, $('.customization-migration-dashboard-route-operation'));
		const arrow = DOM.append(routeOperation, $('span.customization-migration-dashboard-route-arrow'));
		arrow.classList.add(...ThemeIcon.asClassNameArray(Codicon.arrowRight));
		arrow.setAttribute('aria-hidden', 'true');
		this.renderRouteEndpoint(route, localize('customizationMigrationDashboardAfter', "After migration"), item.destinationLabel);

		const footer = DOM.append(card, $('.customization-migration-dashboard-card-footer'));
		DOM.append(footer, $('span.customization-migration-dashboard-item-summary')).textContent = item.itemSummary;
		const button = this.renderDisposables.add(new Button(footer, {
			...defaultButtonStyles,
			secondary: true,
			ariaLabel: item.actionAriaLabel,
		}));
		button.label = item.actionLabel;
		this.firstFocusableElement ??= button.element;
		this.renderDisposables.add(button.onDidClick(() => this.openCategory(item.id)));
	}

	private renderRouteEndpoint(parent: HTMLElement, eyebrow: string, label: string): void {
		const endpoint = DOM.append(parent, $('.customization-migration-dashboard-route-endpoint'));
		DOM.append(endpoint, $('span.customization-migration-dashboard-route-eyebrow')).textContent = eyebrow;
		DOM.append(endpoint, $('span.customization-migration-dashboard-route-label')).textContent = label;
	}

	private renderEmptyState(harnessLabel: string): void {
		const empty = DOM.append(this.element, $('.customization-migration-dashboard-empty'));
		empty.tabIndex = 0;
		this.firstFocusableElement = empty;
		const icon = DOM.append(empty, $('span.customization-migration-dashboard-empty-icon'));
		icon.classList.add(...ThemeIcon.asClassNameArray(Codicon.passFilled));
		icon.setAttribute('aria-hidden', 'true');
		DOM.append(empty, $('h3.customization-migration-dashboard-empty-title')).textContent = localize(
			'customizationMigrationDashboardComplete',
			"Your customizations are ready",
		);
		DOM.append(empty, $('p.customization-migration-dashboard-empty-description')).textContent = localize(
			'customizationMigrationDashboardCompleteDescription',
			"No detected customizations need migration for {0}.",
			harnessLabel,
		);
	}
}
