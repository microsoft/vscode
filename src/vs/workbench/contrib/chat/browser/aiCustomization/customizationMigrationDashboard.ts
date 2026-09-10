/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/customizationMigrationDashboard.css';
import * as DOM from '../../../../../base/browser/dom.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { defaultButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { PromptsType } from '../../common/promptSyntax/promptTypes.js';
import { PromptsStorage } from '../../common/promptSyntax/service/promptsService.js';
import { CustomizationMigrationCategoryId } from './customizationMigrationCategories.js';

const $ = DOM.$;

export interface ICustomizationMigrationDashboardDestination {
	readonly targetType: PromptsType;
	readonly storage: PromptsStorage;
	readonly contextLabel: string;
	readonly label: string;
	readonly ariaLabel: string;
}

export interface ICustomizationMigrationDashboardCategory {
	readonly id: CustomizationMigrationCategoryId;
	readonly label: string;
	readonly description: string;
	readonly count: number;
	readonly countLabel: string;
	readonly highRisk?: boolean;
}

export interface ICustomizationMigrationDashboardScope {
	readonly storage: PromptsStorage;
	readonly label: string;
	readonly count: number;
	readonly skipped: boolean;
	readonly started?: boolean;
	readonly hasConfigurableDestinations: boolean;
	readonly categories: readonly ICustomizationMigrationDashboardCategory[];
}

export interface ICustomizationMigrationDashboardActivity {
	readonly id: string;
	readonly categoryLabel: string;
	readonly scopeLabel: string;
	readonly storage: PromptsStorage;
	readonly items: readonly {
		readonly label: string;
		readonly sourceLabel: string;
		readonly targetLabel: string;
		readonly operation: 'converted' | 'moved' | 'copied' | 'server';
	}[];
}

export interface ICustomizationMigrationDashboardOverview {
	readonly scopes: readonly ICustomizationMigrationDashboardScope[];
	/** Most recent activity first. */
	readonly activity: readonly ICustomizationMigrationDashboardActivity[];
	readonly result?: { readonly migratedCount: number };
}

export interface ICustomizationMigrationDashboardCallbacks {
	readonly configureLocations: (storage: PromptsStorage) => void;
	readonly dismissResult: () => void;
	readonly reviewCategory: (id: CustomizationMigrationCategoryId, storage: PromptsStorage) => void;
	readonly setWorkspaceSkipped: (skipped: boolean) => void;
	readonly dismissActivity: (id: string) => void;
	readonly onDidChangeContent?: () => void;
}

export class CustomizationMigrationDashboard extends Disposable {
	readonly element: HTMLElement;

	private readonly renderDisposables = this._register(new DisposableStore());
	private readonly focusTargets = new Map<string, HTMLElement>();
	private readonly expandedActivity = new Set<string>();
	private readonly activityDetails = new Map<string, HTMLDetailsElement>();
	private pendingFocus: string | undefined;

	constructor(
		parent: HTMLElement,
		private readonly callbacks: ICustomizationMigrationDashboardCallbacks,
		@IHoverService private readonly hoverService: IHoverService,
	) {
		super();
		this.element = DOM.append(parent, $('.customization-migration-dashboard'));
	}

	showLoading(title: string, description: string, retry?: () => void): void {
		this.pendingFocus ??= this.getFocusedKey();
		this.prepareRender();
		const page = this.renderHeader(title, description);
		page.setAttribute('aria-busy', String(!retry));
		if (retry) {
			this.button(page, 'retry', localize('retry', "Retry"), localize('retryMigrations', "Retry loading migrations"), retry);
		}
		this.callbacks.onDidChangeContent?.();
	}

	showOverview(overview: ICustomizationMigrationDashboardOverview): void {
		const focusedKey = this.pendingFocus ?? this.getFocusedKey();
		this.pendingFocus = undefined;
		this.prepareRender();
		const page = this.renderHeader(
			localize('migrationsTitle', "Migrations"),
			overview.scopes.every(scope => scope.count === 0)
				? localize('migrationsCompletedDescription', "Your file migrations are complete. See the checklist below for the status of each location.")
				: localize('migrationsDescription', "Some of your agent customizations need an update to keep working. Review and migrate them to the new formats and locations."),
		);

		if (overview.result) {
			this.renderResult(page, overview);
		}

		const checklist = DOM.append(page, $('section.migration-checklist-section', { 'aria-label': localize('migrationChecklist', "Your migration checklist") }));
		const header = DOM.append(checklist, $('.migration-section-header'));
		const heading = DOM.append(header, $('h2', { tabindex: -1 }, localize('migrationChecklist', "Your migration checklist")));
		this.focusTargets.set('checklist', heading);
		const completedCount = overview.scopes.filter(scope => scope.count === 0 || scope.skipped).length;
		DOM.append(header, $('span.migration-checklist-progress', { role: 'status' }, localize('migrationProgress', "{0} of {1} complete", completedCount, overview.scopes.length)));
		const list = DOM.append(checklist, $('ol.migration-checklist', { role: 'list' }));
		for (const scope of overview.scopes) {
			this.renderScope(list, scope);
		}
		if (overview.scopes.length === 0) {
			DOM.append(checklist, $('p.migration-empty', {}, localize('noMigrations', "No migrations are needed.")));
		}

		const activityIds = new Set(overview.activity.map(activity => activity.id));
		for (const id of this.expandedActivity) {
			if (!activityIds.has(id)) {
				this.expandedActivity.delete(id);
			}
		}
		if (overview.activity.length) {
			this.renderActivity(page, overview.activity);
		}
		this.callbacks.onDidChangeContent?.();
		if (focusedKey) {
			(this.focusTargets.get(focusedKey) ?? this.focusTargets.get('checklist'))?.focus();
		}
	}

	focus(): void {
		this.focusTargets.get('title')?.focus();
	}

	focusDestination(storage: PromptsStorage): void {
		this.focusTargets.get(`destinations:${storage}`)?.focus();
	}

	private prepareRender(): void {
		this.renderDisposables.clear();
		this.focusTargets.clear();
		this.activityDetails.clear();
		DOM.clearNode(this.element);
	}

	private getFocusedKey(): string | undefined {
		const active = DOM.getActiveElement();
		return [...this.focusTargets].find(([, element]) => element === active)?.[0];
	}

	private renderHeader(title: string, description: string): HTMLElement {
		const page = DOM.append(this.element, $('.migration-page'));
		const heading = DOM.append(page, $('h1', { tabindex: -1 }, title));
		this.focusTargets.set('title', heading);
		DOM.append(page, $('p.migration-intro', {}, description));
		return page;
	}

	private renderScope(parent: HTMLElement, scope: ICustomizationMigrationDashboardScope): void {
		const complete = scope.count === 0;
		const state = complete ? 'complete' : scope.skipped ? 'skipped' : scope.started ? 'progress' : 'pending';
		const stateLabel = complete ? localize('migrated', "Migrated")
			: scope.skipped ? localize('skipped', "Skipped")
				: scope.started ? localize('inProgress', "In progress") : '';
		const item = DOM.append(parent, $(`li.migration-scope.is-${state}`));
		item.dataset.storage = scope.storage;
		const header = DOM.append(item, $('.migration-scope-header'));
		const info = DOM.append(header, $('.migration-scope-info'));
		const title = DOM.append(info, $('h3.migration-scope-title'));
		const label = DOM.append(title, $('span.migration-scope-label', {}, scope.label));
		this.hover(label, scope.label);
		if (stateLabel) {
			DOM.append(title, $('span.migration-scope-state', {}, stateLabel));
		}
		DOM.append(info, $('p.migration-scope-description', {}, complete
			? localize('noRemainingMigrations', "No remaining migrations.")
			: scope.storage === PromptsStorage.local
				? localize('workspaceMigrations', "Workspace customizations. Skip this workspace if you do not own it.")
				: localize('profileMigrations', "Personal customizations")));
		const actions = DOM.append(header, $('.migration-scope-actions'));
		if (scope.storage === PromptsStorage.local && !complete) {
			this.button(actions, `skip:${scope.storage}`,
				scope.skipped ? localize('includeWorkspace', "Include Workspace") : localize('skipWorkspace', "Skip Workspace"),
				scope.skipped ? localize('includeWorkspaceLabel', "Include workspace {0}", scope.label) : localize('skipWorkspaceLabel', "Skip workspace {0}", scope.label),
				() => this.callbacks.setWorkspaceSkipped(!scope.skipped), 'link');
		}
		if (!complete && scope.hasConfigurableDestinations) {
			const destinations = this.button(actions, `destinations:${scope.storage}`, '', localize('changeDestinations', "Change destinations for {0}", scope.label),
				() => this.callbacks.configureLocations(scope.storage), 'icon', Codicon.settings);
			destinations.element.setAttribute('aria-haspopup', 'listbox');
		}

		const categories = scope.categories.filter(category => category.count > 0).slice().sort((a, b) => Number(!!b.highRisk) - Number(!!a.highRisk));
		if (!scope.skipped && categories.length) {
			const categoryList = DOM.append(item, $('.migration-categories'));
			for (const category of categories) {
				const row = DOM.append(categoryList, $('.migration-category'));
				const content = DOM.append(row, $('.migration-category-info'));
				const categoryHeading = DOM.append(content, $('.migration-category-heading'));
				DOM.append(categoryHeading, $('h4', {}, category.label));
				DOM.append(categoryHeading, $('span.migration-count', {}, category.countLabel));
				if (category.highRisk) {
					const risk = DOM.append(categoryHeading, $('span.migration-risk', {}, localize('highRisk', "High risk")));
					this.hover(risk, localize('highRiskDescription', "Conversion can remove prompt-only metadata and change how prompts are invoked."));
				}
				DOM.append(content, $('p.migration-category-description', {}, category.description));
				this.button(row, `review:${scope.storage}:${category.id}`, localize('review', "Review"),
					localize('reviewMigrationCategory', "Review {0} from {1}", category.label, scope.label),
					() => this.callbacks.reviewCategory(category.id, scope.storage));
			}
		}
	}

	private renderResult(parent: HTMLElement, overview: ICustomizationMigrationDashboardOverview): void {
		const result = overview.result!;
		const strip = DOM.append(parent, $('section.migration-result', { 'aria-label': localize('migrationComplete', "Migration complete") }));
		DOM.append(strip, $('h2', { role: 'status' }, result.migratedCount === 1
			? localize('oneMigrationComplete', "1 customization migrated")
			: localize('migrationsComplete', "{0} customizations migrated", result.migratedCount)));
		const actions = DOM.append(strip, $('.migration-result-actions'));
		if (overview.activity.length) {
			const latest = overview.activity[0];
			this.button(actions, 'viewChanges', localize('viewChanges', "View Changes"), localize('viewMigrationChanges', "View migration changes"), () => {
				const details = this.activityDetails.get(latest.id);
				if (details) {
					details.open = true;
					this.expandedActivity.add(latest.id);
					this.callbacks.onDidChangeContent?.();
					this.focusTargets.get(`activity:${latest.id}`)?.focus();
					details.scrollIntoView({ block: 'nearest' });
				}
			}, 'link');
		}
		this.button(actions, 'dismissResult', '', localize('dismissMigrationResult', "Dismiss migration result"), () => {
			this.pendingFocus = 'checklist';
			this.callbacks.dismissResult();
		}, 'icon', Codicon.close);
	}

	private renderActivity(parent: HTMLElement, activity: readonly ICustomizationMigrationDashboardActivity[]): void {
		const section = DOM.append(parent, $('section.migration-activity', { 'aria-label': localize('migrationActivity', "Migration activity") }));
		const heading = DOM.append(section, $('h2', { tabindex: -1 }, localize('migrationActivity', "Migration activity")));
		this.focusTargets.set('activity', heading);
		const list = DOM.append(section, $('.migration-activity-list'));
		for (const [index, entry] of activity.entries()) {
			const row = DOM.append(list, $('.migration-activity-entry'));
			const details = DOM.append(row, $<HTMLDetailsElement>('details.migration-activity-details'));
			details.open = this.expandedActivity.has(entry.id);
			this.activityDetails.set(entry.id, details);
			const summary = DOM.append(details, $('summary'));
			this.focusTargets.set(`activity:${entry.id}`, summary);
			const leading = DOM.append(summary, $('.migration-activity-summary-leading'));
			const disclosure = DOM.append(leading, $('span.migration-activity-disclosure'));
			disclosure.classList.add(...ThemeIcon.asClassNameArray(Codicon.chevronRight));
			disclosure.setAttribute('aria-hidden', 'true');
			const title = DOM.append(leading, $('.migration-activity-title'));
			DOM.append(title, $('strong', {}, localize('migrationActivityTitle', "{0} · {1}", entry.categoryLabel, entry.scopeLabel)));
			DOM.append(title, $('span', {}, entry.items.length === 1
				? localize('oneActivityMigration', "1 item migrated")
				: localize('activityMigrations', "{0} items migrated", entry.items.length)));
			const updateDisclosure = () => {
				if (details.open) {
					this.expandedActivity.add(entry.id);
				} else {
					this.expandedActivity.delete(entry.id);
				}
				this.callbacks.onDidChangeContent?.();
			};
			updateDisclosure();
			this.renderDisposables.add(DOM.addDisposableListener(details, 'toggle', updateDisclosure));
			const items = DOM.append(details, $('ul.migration-activity-items'));
			for (const item of entry.items) {
				const itemElement = DOM.append(items, $('li.migration-activity-item'));
				const itemHeader = DOM.append(itemElement, $('.migration-activity-item-header'));
				DOM.append(itemHeader, $('strong', {}, item.label));
				const operation = item.operation === 'converted' ? localize('convertedToSkill', "Converted to skill")
					: item.operation === 'copied' ? localize('copiedFile', "Copied file")
						: item.operation === 'server' ? localize('movedServer', "Moved server") : localize('movedFile', "Moved file");
				DOM.append(itemHeader, $('span.migration-operation', {}, operation));
				const paths = DOM.append(itemElement, $('dl.migration-paths'));
				DOM.append(paths, $('dt', {}, localize('migrationFrom', "From")));
				DOM.append(paths, $('dd', {}, item.sourceLabel));
				DOM.append(paths, $('dt', {}, localize('migrationTo', "To")));
				DOM.append(paths, $('dd', {}, item.targetLabel));
			}
			const actions = DOM.append(row, $('.migration-activity-actions'));
			this.button(actions, `dismissActivity:${entry.id}`, '',
				localize('dismissMigrationActivity', "Dismiss {0} activity from {1}", entry.categoryLabel, entry.scopeLabel), () => {
					const next = activity[index + 1] ?? activity[index - 1];
					this.pendingFocus = next ? `activity:${next.id}` : 'checklist';
					this.callbacks.dismissActivity(entry.id);
				}, 'icon', Codicon.close);
		}
	}

	private button(parent: HTMLElement, key: string, label: string, ariaLabel: string, run: () => void, kind: 'secondary' | 'link' | 'icon' = 'secondary', icon?: ThemeIcon): Button {
		const button = this.renderDisposables.add(new Button(parent, {
			...defaultButtonStyles,
			secondary: true,
			buttonSecondaryBackground: 'transparent',
			buttonSecondaryForeground: kind === 'link' ? 'var(--vscode-textLink-foreground)' : 'var(--vscode-foreground)',
			buttonSecondaryHoverBackground: 'var(--vscode-list-hoverBackground)',
			buttonSecondaryBorder: kind === 'secondary' ? 'var(--vscode-contrastBorder, var(--vscode-widget-border))' : 'transparent',
			ariaLabel,
			title: false,
		}));
		button.element.classList.add(`migration-${kind}-button`);
		button.label = label;
		if (icon) {
			DOM.append(button.element, $('span', { class: ThemeIcon.asClassName(icon), 'aria-hidden': 'true' }));
		}
		this.focusTargets.set(key, button.element);
		this.hover(button.element, ariaLabel);
		this.renderDisposables.add(button.onDidClick(run));
		return button;
	}

	private hover(element: HTMLElement, content: string): void {
		this.renderDisposables.add(this.hoverService.setupDelayedHover(element, { content }));
	}
}
