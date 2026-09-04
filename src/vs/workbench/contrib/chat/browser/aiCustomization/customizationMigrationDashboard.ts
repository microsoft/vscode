/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/aiCustomizationManagement.css';
import * as DOM from '../../../../../base/browser/dom.js';
import { triggerConfettiAnimation } from '../../../../../base/browser/ui/animations/animations.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { Checkbox } from '../../../../../base/browser/ui/toggle/toggle.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { defaultButtonStyles, defaultCheckboxStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { PromptsType } from '../../common/promptSyntax/promptTypes.js';
import { MigratableConfiguration } from '../../common/promptSyntax/service/customizationMigrationService.js';
import { PromptsStorage } from '../../common/promptSyntax/service/promptsService.js';

const $ = DOM.$;

const quietButtonStyles = {
	...defaultButtonStyles,
	buttonSecondaryBackground: 'transparent',
	buttonSecondaryHoverBackground: 'var(--vscode-list-hoverBackground)',
	buttonSecondaryForeground: 'var(--vscode-textLink-foreground)',
	buttonSecondaryBorder: 'transparent',
};

export interface ICustomizationMigrationDashboardDestination {
	readonly targetType: PromptsType;
	readonly storage: PromptsStorage;
	readonly contextLabel: string;
	readonly label: string;
	readonly ariaLabel: string;
}

export interface ICustomizationMigrationDashboardScope {
	readonly storage: PromptsStorage;
	readonly label: string;
	readonly count: number;
	readonly skipped: boolean;
}

export interface ICustomizationMigrationMetadataPreview {
	readonly unsupportedHeaderKeys: readonly string[];
	readonly sourceMetadata: string;
	readonly targetMetadata: string;
}

export interface ICustomizationMigrationDashboardReviewItem {
	readonly customization: MigratableConfiguration;
	readonly label: string;
	readonly sourceLabel: string;
	readonly targetLabel: string;
	readonly selected: boolean;
	readonly metadataPreview?: ICustomizationMigrationMetadataPreview;
	readonly metadataPreviewError?: string;
}

export interface ICustomizationMigrationDashboardResult {
	readonly migratedCount: number;
	readonly remainingCount: number;
	readonly skippedWorkspace: boolean;
	readonly celebrate: boolean;
}

export interface ICustomizationMigrationDashboardOverview {
	readonly scopes: readonly ICustomizationMigrationDashboardScope[];
	readonly result?: ICustomizationMigrationDashboardResult;
}

export interface ICustomizationMigrationDashboardReview {
	readonly title: string;
	readonly items: readonly ICustomizationMigrationDashboardReviewItem[];
}

export interface ICustomizationMigrationDashboardCallbacks {
	readonly configureLocations: () => void;
	readonly dismissResult: () => void;
	readonly migrate: (items: readonly ICustomizationMigrationDashboardReviewItem[], keepOriginalFiles: boolean) => void;
	readonly reviewScope: (storage: PromptsStorage) => void;
	readonly reviewWithAgent: () => void;
	readonly setItemSelected: (item: ICustomizationMigrationDashboardReviewItem, selected: boolean) => void;
	readonly setWorkspaceSkipped: (skipped: boolean) => void;
	readonly showOverview: () => void;
}

export class CustomizationMigrationDashboard extends Disposable {
	readonly element: HTMLElement;

	private readonly renderDisposables = this._register(new DisposableStore());
	private firstFocusableElement: HTMLElement | undefined;
	private currentReview: ICustomizationMigrationDashboardReview | undefined;
	private readonly selectedReviewItems = new Set<ICustomizationMigrationDashboardReviewItem>();
	private reviewMoveCount: HTMLElement | undefined;
	private reviewConvertCount: HTMLElement | undefined;
	private reviewWarningCount: HTMLElement | undefined;
	private migrateButton: Button | undefined;
	private readonly metadataButtons = new Map<string, HTMLElement>();
	private migrating = false;

	constructor(
		parent: HTMLElement,
		private readonly callbacks: ICustomizationMigrationDashboardCallbacks,
	) {
		super();
		this.element = DOM.append(parent, $('.customization-health'));
	}

	showLoading(title: string, description: string, retry?: () => void): void {
		this.prepareRender();
		const page = this.renderPageHeader(title, description);
		const state = DOM.append(page, $('section.customization-health-state'));
		state.setAttribute('aria-live', 'polite');
		if (retry) {
			const retryButton = this.renderDisposables.add(new Button(state, {
				...defaultButtonStyles,
				secondary: true,
				ariaLabel: localize('retryCustomizationMigration', "Retry loading customizations"),
			}));
			retryButton.label = localize('retry', "Retry");
			this.firstFocusableElement = retryButton.element;
			this.renderDisposables.add(retryButton.onDidClick(retry));
		}
	}

	showOverview(overview: ICustomizationMigrationDashboardOverview): void {
		this.prepareRender();
		const page = this.renderPageHeader(
			localize('customizationHealthCheckTitle', "Customization health check"),
			localize('customizationHealthCheckDescription', "Check that your customizations are available to the agents you use."),
		);
		const supportedCount = overview.scopes.reduce((total, scope) => total + (scope.skipped ? 0 : scope.count), 0);
		const summary = DOM.append(page, $('.customization-health-summary'));
		summary.setAttribute('aria-label', localize('customizationHealthSummaryAriaLabel', "Customization health summary"));
		const summaryPill = DOM.append(summary, $('span.customization-health-summary-pill'));
		if (supportedCount === 0) {
			summaryPill.classList.add('healthy');
			summaryPill.textContent = localize('customizationHealthGood', "In good health");
		} else {
			summaryPill.classList.add('attention');
			summaryPill.textContent = supportedCount === 1
				? localize('customizationHealthMigrationCountSingle', "1 supported migration")
				: localize('customizationHealthMigrationCount', "{0} supported migrations", supportedCount);
		}

		if (overview.result) {
			this.renderResult(page, overview.result);
		}

		const migrations = DOM.append(page, $('section.customization-health-migrations'));
		const sectionHeader = DOM.append(migrations, $('.customization-health-section-header'));
		const headingGroup = DOM.append(sectionHeader, $('.customization-health-section-heading'));
		const heading = DOM.append(headingGroup, $('h2'));
		heading.id = 'customization-health-supported-migrations';
		heading.textContent = localize('customizationHealthSupportedMigrations', "Supported migrations");
		DOM.append(headingGroup, $('p')).textContent = localize(
			'customizationHealthSupportedMigrationsDescription',
			"Review your profile and workspace. Skip the workspace if you do not own it.",
		);
		migrations.setAttribute('aria-labelledby', heading.id);

		const locationsButton = this.renderDisposables.add(new Button(sectionHeader, {
			...quietButtonStyles,
			secondary: true,
			ariaLabel: localize('customizationHealthMigrationLocationsAriaLabel', "Customize migration locations"),
		}));
		locationsButton.label = localize('customizationHealthMigrationLocations', "Migration Locations");
		this.firstFocusableElement ??= locationsButton.element;
		this.renderDisposables.add(locationsButton.onDidClick(this.callbacks.configureLocations));

		const scopeList = DOM.append(migrations, $('.customization-health-scope-list'));
		if (overview.scopes.length === 0) {
			DOM.append(scopeList, $('p.customization-health-empty')).textContent = localize(
				'customizationHealthNoMigrations',
				"No supported migrations remain.",
			);
		} else {
			for (const scope of overview.scopes) {
				this.renderScope(scopeList, scope);
			}
		}
	}

	showReview(review: ICustomizationMigrationDashboardReview): void {
		this.prepareRender();
		this.currentReview = review;
		for (const item of review.items) {
			if (item.selected) {
				this.selectedReviewItems.add(item);
			}
		}

		const page = DOM.append(this.element, $('section.customization-health-page.customization-health-review-page'));
		const backButton = this.renderBackButton(page, localize('backToCustomizationMigrations', "Back to Migrations"), this.callbacks.showOverview);
		this.firstFocusableElement = backButton.element;
		const title = DOM.append(page, $('h1'));
		title.textContent = review.title;

		const summary = DOM.append(page, $('.customization-health-review-summary'));
		this.reviewMoveCount = this.renderMetric(summary, localize('customizationHealthWillMove', "will move"));
		this.reviewConvertCount = this.renderMetric(summary, localize('customizationHealthWillConvert', "will convert"));
		this.reviewWarningCount = this.renderMetric(summary, localize('customizationHealthMetadataWarnings', "metadata warnings"));

		const sections = DOM.append(page, $('.customization-health-review-sections'));
		for (const type of [PromptsType.agent, PromptsType.instructions, PromptsType.prompt]) {
			const items = review.items.filter(item => item.customization.type === type);
			if (items.length > 0) {
				this.renderReviewSection(sections, type, items);
			}
		}

		const footer = DOM.append(page, $('.customization-health-review-footer'));
		const cancelButton = this.renderDisposables.add(new Button(footer, {
			...defaultButtonStyles,
			secondary: true,
			ariaLabel: localize('cancelCustomizationMigration', "Cancel customization migration"),
		}));
		cancelButton.label = localize('cancel', "Cancel");
		this.renderDisposables.add(cancelButton.onDidClick(this.callbacks.showOverview));

		const actions = DOM.append(footer, $('.customization-health-review-footer-actions'));
		const keepOriginalsContainer = DOM.append(actions, $('.customization-health-keep-originals'));
		const keepOriginalsLabel = localize(
			'customizationHealthKeepOriginals',
			"Keep original files",
		);
		const keepOriginals = this.renderDisposables.add(new Checkbox(
			keepOriginalsLabel,
			false,
			defaultCheckboxStyles,
		));
		keepOriginalsContainer.appendChild(keepOriginals.domNode);
		const keepOriginalsText = DOM.append(keepOriginalsContainer, $('span'));
		keepOriginalsText.textContent = keepOriginalsLabel;
		this.renderDisposables.add(DOM.addDisposableListener(keepOriginalsText, 'click', () => {
			keepOriginals.checked = !keepOriginals.checked;
		}));

		this.migrateButton = this.renderDisposables.add(new Button(actions, {
			...defaultButtonStyles,
			ariaLabel: localize('migrateSelectedCustomizations', "Migrate selected customizations"),
		}));
		this.renderDisposables.add(this.migrateButton.onDidClick(() => {
			this.callbacks.migrate([...this.selectedReviewItems], keepOriginals.checked);
		}));
		this.updateReviewSummary();
	}

	setMigrating(migrating: boolean): void {
		this.migrating = migrating;
		this.updateReviewSummary();
	}

	focus(): void {
		this.firstFocusableElement?.focus();
	}

	private prepareRender(): void {
		this.renderDisposables.clear();
		DOM.clearNode(this.element);
		this.firstFocusableElement = undefined;
		this.currentReview = undefined;
		this.selectedReviewItems.clear();
		this.reviewMoveCount = undefined;
		this.reviewConvertCount = undefined;
		this.reviewWarningCount = undefined;
		this.migrateButton = undefined;
		this.metadataButtons.clear();
		this.migrating = false;
	}

	private renderPageHeader(title: string, description: string): HTMLElement {
		const page = DOM.append(this.element, $('section.customization-health-page'));
		const heading = DOM.append(page, $('h1'));
		heading.tabIndex = -1;
		heading.textContent = title;
		this.firstFocusableElement = heading;
		DOM.append(page, $('p.customization-health-lede')).textContent = description;
		return page;
	}

	private renderResult(page: HTMLElement, result: ICustomizationMigrationDashboardResult): void {
		const resultElement = DOM.append(page, $('section.customization-health-result'));
		resultElement.tabIndex = -1;
		resultElement.setAttribute('aria-live', 'polite');
		const header = DOM.append(resultElement, $('.customization-health-result-header'));
		const text = DOM.append(header, $('.customization-health-result-text'));
		DOM.append(text, $('h2')).textContent = result.migratedCount === 1
			? localize('customizationHealthMigratedSingle', "1 customization migrated")
			: localize('customizationHealthMigrated', "{0} customizations migrated", result.migratedCount);
		let description: string;
		if (result.remainingCount > 0) {
			description = result.remainingCount === 1
				? localize('customizationHealthMigrationRemainingSingle', "The customization was moved to a supported location. 1 migration remains.")
				: localize('customizationHealthMigrationRemaining', "The customizations were moved to supported locations. {0} migrations remain.", result.remainingCount);
		} else if (result.skippedWorkspace) {
			description = localize('customizationHealthMigrationCompleteSkipped', "Your profile has no remaining migrations. The workspace is skipped.");
		} else {
			description = localize('customizationHealthMigrationComplete', "Your profile and workspace have no remaining migrations.");
		}
		DOM.append(text, $('p')).textContent = description;

		const actions = DOM.append(header, $('.customization-health-result-actions'));
		const dismissButton = this.renderDisposables.add(new Button(actions, {
			...quietButtonStyles,
			secondary: true,
			ariaLabel: localize('dismissCustomizationMigrationResult', "Dismiss migration result"),
		}));
		dismissButton.label = localize('dismiss', "Dismiss");
		this.renderDisposables.add(dismissButton.onDidClick(this.callbacks.dismissResult));
		const reviewButton = this.renderDisposables.add(new Button(actions, {
			...defaultButtonStyles,
			secondary: true,
			ariaLabel: localize('reviewCustomizationMigrationWithAgent', "Review migrated customizations with an agent"),
		}));
		reviewButton.label = localize('reviewWithAgent', "Review with an Agent");
		this.renderDisposables.add(reviewButton.onDidClick(this.callbacks.reviewWithAgent));

		if (result.celebrate && !DOM.getWindow(resultElement).matchMedia('(prefers-reduced-motion: reduce)').matches) {
			DOM.getWindow(resultElement).requestAnimationFrame(() => triggerConfettiAnimation(resultElement));
		}
	}

	private renderScope(parent: HTMLElement, scope: ICustomizationMigrationDashboardScope): void {
		const section = DOM.append(parent, $('section.customization-health-scope'));
		section.dataset.migrationStorage = scope.storage;
		const heading = DOM.append(section, $('.customization-health-scope-heading'));
		const title = DOM.append(heading, $('h3'));
		title.textContent = scope.label;
		const count = DOM.append(heading, $('span'));
		count.textContent = scope.skipped
			? scope.count === 1
				? localize('customizationHealthExcludedMigrationSingle', "1 migration excluded")
				: localize('customizationHealthExcludedMigrations', "{0} migrations excluded", scope.count)
			: scope.count === 1
				? localize('customizationHealthScopeMigrationSingle', "1 migration")
				: localize('customizationHealthScopeMigrations', "{0} migrations", scope.count);

		const actions = DOM.append(section, $('.customization-health-scope-actions'));
		if (scope.storage === PromptsStorage.local) {
			const skipButton = this.renderDisposables.add(new Button(actions, {
				...quietButtonStyles,
				secondary: true,
				ariaLabel: scope.skipped
					? localize('includeWorkspaceMigrationAriaLabel', "Include workspace migrations")
					: localize('skipWorkspaceMigrationAriaLabel', "Skip workspace migrations"),
			}));
			skipButton.label = scope.skipped
				? localize('includeWorkspaceMigration', "Include Workspace")
				: localize('skipWorkspaceMigration', "Skip Workspace");
			this.firstFocusableElement ??= skipButton.element;
			this.renderDisposables.add(skipButton.onDidClick(() => this.callbacks.setWorkspaceSkipped(!scope.skipped)));
		}
		if (!scope.skipped) {
			const reviewButton = this.renderDisposables.add(new Button(actions, {
				...defaultButtonStyles,
				ariaLabel: localize('reviewCustomizationMigrationScope', "Review migrations for {0}", scope.label),
			}));
			reviewButton.label = localize('review', "Review");
			this.firstFocusableElement ??= reviewButton.element;
			this.renderDisposables.add(reviewButton.onDidClick(() => this.callbacks.reviewScope(scope.storage)));
		}
	}

	private renderBackButton(parent: HTMLElement, label: string, callback: () => void): Button {
		const button = this.renderDisposables.add(new Button(parent, {
			...quietButtonStyles,
			secondary: true,
			supportIcons: true,
			ariaLabel: label,
		}));
		button.element.classList.add('customization-health-back');
		button.label = `$(${Codicon.arrowLeft.id}) ${label}`;
		this.renderDisposables.add(button.onDidClick(callback));
		return button;
	}

	private renderMetric(parent: HTMLElement, label: string): HTMLElement {
		const metric = DOM.append(parent, $('.customization-health-metric'));
		const value = DOM.append(metric, $('strong'));
		DOM.append(metric, $('span')).textContent = label;
		return value;
	}

	private renderReviewSection(
		parent: HTMLElement,
		type: PromptsType,
		items: readonly ICustomizationMigrationDashboardReviewItem[],
	): void {
		const section = DOM.append(parent, $('section.customization-health-review-section'));
		const headingRow = DOM.append(section, $('.customization-health-review-section-heading'));
		const heading = DOM.append(headingRow, $('h2'));
		const description = DOM.append(section, $('p.customization-health-review-section-description'));
		switch (type) {
			case PromptsType.agent:
				heading.textContent = localize('customizationHealthAgents', "Agents");
				description.textContent = localize(
					'customizationHealthAgentsDescription',
					"Move custom agent definitions into the shared agents folder so they remain available to supported agent experiences.",
				);
				break;
			case PromptsType.instructions:
				heading.textContent = localize('customizationHealthInstructions', "Instructions");
				description.textContent = localize(
					'customizationHealthInstructionsDescription',
					"Move instruction files into the shared instructions folder so their guidance continues to apply in supported agent experiences.",
				);
				break;
			default:
				heading.textContent = localize('customizationHealthPromptsToSkills', "Prompts to skills");
				description.textContent = localize(
					'customizationHealthPromptsToSkillsDescription',
					"Convert reusable prompt files into skills so agents can discover and run them as supported customizations.",
				);
				break;
		}
		const count = DOM.append(headingRow, $('span.customization-health-review-section-count'));
		count.textContent = this.getReviewSectionCountLabel(type, items.length);

		const rows = DOM.append(section, $('.customization-health-review-rows'));
		for (const item of items) {
			this.renderReviewItem(rows, item);
		}
	}

	private getReviewSectionCountLabel(type: PromptsType, count: number): string {
		switch (type) {
			case PromptsType.agent:
				return count === 1
					? localize('customizationHealthAgentCountSingle', "1 agent")
					: localize('customizationHealthAgentCount', "{0} agents", count);
			case PromptsType.instructions:
				return count === 1
					? localize('customizationHealthInstructionCountSingle', "1 instruction file")
					: localize('customizationHealthInstructionCount', "{0} instruction files", count);
			default:
				return count === 1
					? localize('customizationHealthPromptCountSingle', "1 prompt")
					: localize('customizationHealthPromptCount', "{0} prompts", count);
		}
	}

	private renderReviewItem(parent: HTMLElement, item: ICustomizationMigrationDashboardReviewItem): void {
		const row = DOM.append(parent, $('.customization-health-review-row'));
		const header = DOM.append(row, $('.customization-health-review-row-header'));
		const leading = DOM.append(header, $('.customization-health-review-row-leading'));
		const selectionLabel = localize('selectCustomizationForMigration', "Select {0} for migration", item.label);
		const checkbox = this.renderDisposables.add(new Checkbox(selectionLabel, item.selected, defaultCheckboxStyles));
		leading.appendChild(checkbox.domNode);
		DOM.append(leading, $('strong')).textContent = item.label;
		this.renderDisposables.add(checkbox.onChange(() => {
			if (checkbox.checked) {
				this.selectedReviewItems.add(item);
			} else {
				this.selectedReviewItems.delete(item);
			}
			this.callbacks.setItemSelected(item, checkbox.checked);
			this.updateReviewSummary();
		}));

		const badges = DOM.append(header, $('.customization-health-review-badges'));
		if (item.metadataPreview) {
			DOM.append(badges, $('span.customization-health-metadata-badge')).textContent = localize(
				'customizationHealthMetadataChanges',
				"Metadata changes",
			);
		}
		DOM.append(badges, $('span.customization-health-operation-badge')).textContent = item.customization.type === PromptsType.prompt
			? localize('customizationHealthConvertToSkill', "Convert to skill")
			: localize('customizationHealthMoveFile', "Move file");

		const details = DOM.append(row, $('.customization-health-review-row-details'));
		const paths = DOM.append(details, $('.customization-health-paths'));
		this.renderPath(paths, localize('customizationHealthFrom', "From"), item.sourceLabel);
		this.renderPath(paths, localize('customizationHealthTo', "To"), item.targetLabel);
		if (item.metadataPreview) {
			const metadataButton = this.renderDisposables.add(new Button(details, {
				...defaultButtonStyles,
				secondary: true,
				ariaLabel: localize('viewMetadataChangesForCustomization', "View metadata changes for {0}", item.label),
			}));
			metadataButton.label = localize('viewMetadataChanges', "View Metadata Changes");
			this.metadataButtons.set(this.getItemKey(item), metadataButton.element);
			this.renderDisposables.add(metadataButton.onDidClick(() => this.showMetadataPreview(item)));
		} else if (item.metadataPreviewError) {
			const error = DOM.append(details, $('span.customization-health-metadata-error'));
			error.textContent = item.metadataPreviewError;
		}
	}

	private renderPath(parent: HTMLElement, label: string, value: string): void {
		const row = DOM.append(parent, $('.customization-health-path'));
		DOM.append(row, $('span.customization-health-path-label')).textContent = label;
		DOM.append(row, $('span.customization-health-path-value')).textContent = value;
	}

	private showMetadataPreview(item: ICustomizationMigrationDashboardReviewItem): void {
		if (!item.metadataPreview || !this.currentReview) {
			return;
		}
		const review = this.currentReview;
		this.renderDisposables.clear();
		DOM.clearNode(this.element);
		const page = DOM.append(this.element, $('section.customization-health-page.customization-health-metadata-page'));
		const backButton = this.renderBackButton(page, localize('backToMigrationReview', "Back to Migration Review"), () => {
			const selectedItems = new Set(this.selectedReviewItems);
			this.showReview({
				...review,
				items: review.items.map(reviewItem => ({
					...reviewItem,
					selected: selectedItems.has(reviewItem),
				})),
			});
			this.metadataButtons.get(this.getItemKey(item))?.focus();
		});
		this.firstFocusableElement = backButton.element;
		DOM.append(page, $('h1')).textContent = item.label;
		DOM.append(page, $('p.customization-health-metadata-path')).textContent = item.sourceLabel;

		const warning = DOM.append(page, $('.customization-health-metadata-warning'));
		DOM.append(warning, $('strong')).textContent = localize(
			'customizationHealthMetadataNotCarriedOver',
			"Not carried over: {0}",
			item.metadataPreview.unsupportedHeaderKeys.join(', '),
		);
		DOM.append(warning, $('p')).textContent = localize(
			'customizationHealthMetadataWarningDescription',
			"Prompt migration keeps name, description, argument-hint, and the Markdown body. It removes these prompt-only fields and adds disable-model-invocation: true to the generated skill.",
		);

		const comparison = DOM.append(page, $('.customization-health-metadata-comparison'));
		comparison.setAttribute('aria-label', localize(
			'customizationHealthMetadataComparison',
			"Prompt and generated skill metadata comparison",
		));
		this.renderMetadataPane(
			comparison,
			localize('customizationHealthCurrentPromptMetadata', "Current prompt metadata"),
			item.metadataPreview.sourceMetadata,
			'removed',
			item.metadataPreview.unsupportedHeaderKeys,
		);
		this.renderMetadataPane(
			comparison,
			localize('customizationHealthGeneratedSkillMetadata', "Generated skill metadata"),
			item.metadataPreview.targetMetadata,
			'added',
			['disable-model-invocation'],
		);
		backButton.element.focus();
	}

	private renderMetadataPane(
		parent: HTMLElement,
		title: string,
		metadata: string,
		emphasis: 'added' | 'removed',
		emphasizedKeys: readonly string[],
	): void {
		const pane = DOM.append(parent, $('section.customization-health-metadata-pane'));
		DOM.append(pane, $('h2')).textContent = title;
		const pre = DOM.append(pane, $('pre'));
		const emphasizedKeySet = new Set(emphasizedKeys);
		for (const line of metadata.split('\n')) {
			const lineElement = DOM.append(pre, $('span'));
			const key = line.match(/^(?<key>[^:#][^:]*):/)?.groups?.key;
			if (key && emphasizedKeySet.has(key)) {
				lineElement.classList.add(emphasis);
			}
			lineElement.textContent = `${line}\n`;
		}
	}

	private updateReviewSummary(): void {
		if (!this.currentReview || !this.reviewMoveCount || !this.reviewConvertCount || !this.reviewWarningCount || !this.migrateButton) {
			return;
		}
		const selectedItems = [...this.selectedReviewItems];
		this.reviewMoveCount.textContent = String(selectedItems.filter(item => item.customization.type !== PromptsType.prompt).length);
		this.reviewConvertCount.textContent = String(selectedItems.filter(item => item.customization.type === PromptsType.prompt).length);
		this.reviewWarningCount.textContent = String(selectedItems.filter(item => item.metadataPreview).length);
		this.migrateButton.enabled = selectedItems.length > 0 && !this.migrating;
		this.migrateButton.label = selectedItems.length === 1
			? localize('customizationHealthMigrateSingle', "Migrate 1")
			: localize('customizationHealthMigrateCount', "Migrate {0}", selectedItems.length);
	}

	private getItemKey(item: ICustomizationMigrationDashboardReviewItem): string {
		return `${item.customization.uri.toString()}:${item.customization.storage}`;
	}
}
