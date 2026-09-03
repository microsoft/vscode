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
import { PromptsType } from '../../common/promptSyntax/promptTypes.js';
import { PromptsStorage } from '../../common/promptSyntax/service/promptsService.js';

const $ = DOM.$;

const migrationDestinationButtonStyles = {
	...defaultButtonStyles,
	buttonSecondaryBackground: 'transparent',
	buttonSecondaryHoverBackground: 'var(--vscode-list-hoverBackground)',
	buttonSecondaryForeground: 'var(--vscode-dropdown-foreground)',
	buttonSecondaryBorder: 'var(--vscode-dropdown-border, var(--vscode-widget-border))',
};

export interface ICustomizationMigrationDashboardItem {
	readonly id: string;
	readonly label: string;
	readonly description: string;
	readonly count: number;
	readonly destinations: readonly ICustomizationMigrationDashboardDestination[];
	readonly itemSummary: string;
	readonly actionLabel: string;
	readonly actionAriaLabel: string;
}

export interface ICustomizationMigrationDashboardDestination {
	readonly targetType: PromptsType;
	readonly storage: PromptsStorage;
	readonly contextLabel: string;
	readonly label: string;
	readonly ariaLabel: string;
}

export function renderCustomizationMigrationDestinations(
	parent: HTMLElement,
	id: string,
	destinations: readonly ICustomizationMigrationDashboardDestination[],
	disposables: DisposableStore,
	chooseDestination: (destination: ICustomizationMigrationDashboardDestination) => void,
): ReadonlyMap<string, HTMLElement> {
	const destinationButtons = new Map<string, HTMLElement>();
	if (destinations.length === 0) {
		return destinationButtons;
	}

	const plan = DOM.append(parent, $('.customization-migration-dashboard-plan'));
	const heading = DOM.append(plan, $('h4.customization-migration-dashboard-plan-heading'));
	heading.id = `customization-migration-${id}-destinations`;
	heading.textContent = localize('customizationMigrationDashboardDestinations', "Migration destinations");
	const destinationList = DOM.append(plan, $('ul.customization-migration-dashboard-plan-list'));
	destinationList.setAttribute('aria-labelledby', heading.id);
	for (const destination of destinations) {
		const row = DOM.append(destinationList, $('li.customization-migration-dashboard-plan-row'));
		DOM.append(row, $('span.customization-migration-dashboard-plan-label')).textContent = destination.contextLabel;
		const button = disposables.add(new Button(row, {
			...migrationDestinationButtonStyles,
			secondary: true,
			supportIcons: true,
			ariaLabel: destination.ariaLabel,
		}));
		button.element.classList.add('customization-migration-dashboard-plan-control');
		button.element.setAttribute('aria-haspopup', 'listbox');
		const key = `${destination.targetType}:${destination.storage}`;
		button.element.dataset.migrationDestinationKey = key;
		button.label = `${destination.label} $(${Codicon.chevronDown.id})`;
		destinationButtons.set(key, button.element);
		disposables.add(button.onDidClick(() => chooseDestination(destination)));
	}
	return destinationButtons;
}

const AGENT_HOST_ARCHITECTURE_URL = 'https://code.visualstudio.com/blogs/2026/08/26/agent-host-architecture';

export class CustomizationMigrationDashboard extends Disposable {
	readonly element: HTMLElement;

	private readonly renderDisposables = this._register(new DisposableStore());
	private firstFocusableElement: HTMLElement | undefined;
	private readonly destinationButtons = new Map<string, HTMLElement>();

	constructor(
		parent: HTMLElement,
		private readonly openCategory: (id: string) => void,
		private readonly openDocumentation: (url: string) => void,
		private readonly chooseDestination: (destination: ICustomizationMigrationDashboardDestination) => void,
	) {
		super();
		this.element = DOM.append(parent, $('.customization-migration-dashboard'));
	}

	setItems(items: readonly ICustomizationMigrationDashboardItem[], harnessLabel: string): void {
		this.renderDisposables.clear();
		DOM.clearNode(this.element);
		this.firstFocusableElement = undefined;
		this.destinationButtons.clear();

		if (items.length === 0) {
			this.renderEmptyState(harnessLabel);
			return;
		}

		const summary = DOM.append(this.element, $('.customization-migration-dashboard-summary'));
		const summaryDescription = DOM.append(summary, $('p.customization-migration-dashboard-summary-description'));
		DOM.append(summaryDescription, $('span')).textContent = localize(
			'customizationMigrationDashboardSummary',
			"Some customizations need to move for Agent Host compatibility. Review or migrate them below.",
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

	getDestinationButtons(): ReadonlyMap<string, HTMLElement> {
		return this.destinationButtons;
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

		for (const [key, button] of renderCustomizationMigrationDestinations(card, `dashboard-${item.id}`, item.destinations, this.renderDisposables, this.chooseDestination)) {
			this.destinationButtons.set(key, button);
		}

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
