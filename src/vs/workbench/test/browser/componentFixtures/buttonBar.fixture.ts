/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { IAction, Separator, SubmenuAction, toAction } from '../../../../base/common/actions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { IButtonConfigProvider, WorkbenchButtonBar } from '../../../../platform/actions/browser/buttonbar.js';
import { TestInstantiationService } from '../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from './fixtureUtils.js';

export default defineThemedFixtureGroup({ path: 'platform/' }, {
	Buttons: defineComponentFixture({
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['Nine captioned rows each show one button: a plain label, an icon with a label, that same button with the pixel spinner in place of its icon, a square icon-only button, that same button showing only the spinner, secondary label and icon-only variants, a custom label reading "Commit and Sync 2↑", and a dimmed disabled button. No button shows an icon and the spinner at once.'],
		render: renderButtons,
	}),

	ButtonBars: defineComponentFixture({
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['Four captioned rows each show a bar: a labelled primary button followed by two secondary icon-only buttons, a split button with a chevron half, that same split button with the pixel spinner in place of the icon on its primary half, and a primary button beside a chevron-only overflow button.'],
		render: renderButtonBars,
	}),

	IconToSpinnerWidth: defineComponentFixture({
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['Each scenario stacks a button showing an icon over the same button showing the pixel spinner. Both buttons of a pair are exactly as wide, so their right edges meet the same vertical guide line, and each verdict below reads "same width".'],
		render: context => renderWidthComparison(context, { showLabel: true }),
	}),

	IconOnlyToSpinnerWidth: defineComponentFixture({
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['Each scenario stacks a square icon-only button over the same button showing only the pixel spinner. Neither shows a label, both buttons of a pair are exactly as wide, so their right edges meet the same vertical guide line, and each verdict below reads "same width".'],
		render: context => renderWidthComparison(context, { showLabel: false }),
	}),
});


// ============================================================================
// Harness
// ============================================================================

function createServices(context: ComponentFixtureContext): TestInstantiationService {
	return createEditorServices(context.disposableStore, {
		colorTheme: context.theme,
		additionalServices: registerWorkbenchServices,
	});
}

/**
 * Renders a bar into its own host. Every scenario gets a bar of its own so the
 * config provider can answer for a single button rather than switching on the
 * index of a shared bar.
 */
function addButtonBar(
	context: ComponentFixtureContext,
	instantiationService: TestInstantiationService,
	container: HTMLElement,
	actions: IAction[],
	buttonConfigProvider: IButtonConfigProvider,
	secondary: IAction[] = [],
): WorkbenchButtonBar {
	const bar = context.disposableStore.add(instantiationService.createInstance(
		WorkbenchButtonBar,
		container,
		{ buttonConfigProvider },
	));
	bar.update(actions, secondary);
	for (const button of bar.buttons) {
		// Buttons are `width: 100%`, so in a bare row each one would claim the
		// whole width and they would divide it between them. The surfaces that
		// embed a bar all size them to their content instead, which is also the
		// only sizing under which the width comparisons below mean anything.
		button.element.style.width = 'fit-content';
		button.element.style.flexShrink = '0';
	}
	return bar;
}

function action(id: string, label: string, icon?: ThemeIcon, enabled = true): IAction {
	return toAction({
		id,
		label,
		// A plain action carries its icon as a CSS class, which is how the
		// button bar picks it up (see `MenuItemAction.class`).
		class: icon ? ThemeIcon.asClassName(icon) : undefined,
		enabled,
		run: () => { },
	});
}

function setupPage(container: HTMLElement, width: number): void {
	container.style.width = `${width}px`;
	container.style.padding = '16px';
	container.style.display = 'flex';
	container.style.flexDirection = 'column';
	container.style.gap = '12px';
	container.style.backgroundColor = 'var(--vscode-editor-background)';
	container.style.color = 'var(--vscode-foreground)';
	container.style.fontFamily = 'var(--vscode-font-family)';
	container.style.fontSize = 'var(--vscode-fontSize-label1)';
}

/** A captioned row whose returned host shrink-wraps the bar rendered into it. */
function addCaptionedRow(container: HTMLElement, caption: string): HTMLElement {
	const row = dom.append(container, dom.$('.fixture-row'));
	row.style.display = 'flex';
	row.style.alignItems = 'center';
	row.style.gap = '16px';

	const captionElement = dom.append(row, dom.$('span'));
	captionElement.textContent = caption;
	captionElement.style.flex = '0 0 176px';
	captionElement.style.color = 'var(--vscode-descriptionForeground)';

	return addBarHost(row);
}

/**
 * Buttons are `width: 100%`, so they only take their natural width inside a
 * shrink-to-fit host — which is what the surfaces that use the bar give them.
 */
function addBarHost(parent: HTMLElement): HTMLElement {
	const host = dom.append(parent, dom.$('.fixture-bar-host'));
	host.style.display = 'inline-flex';
	host.style.alignItems = 'center';
	host.style.gap = '4px';
	return host;
}


// ============================================================================
// Single buttons
// ============================================================================

function renderButtons(context: ComponentFixtureContext): void {
	const { container } = context;
	setupPage(container, 520);
	const instantiationService = createServices(context);

	const commit = action('fixture.commit', 'Commit', Codicon.gitCommit);
	const noIcon = action('fixture.publish', 'Publish Branch');
	const disabled = action('fixture.merge', 'Merge', Codicon.gitMerge, false);

	const scenarios: readonly [caption: string, action: IAction, config: ReturnType<IButtonConfigProvider>][] = [
		['Label', noIcon, { showLabel: true }],
		['Icon and label', commit, { showIcon: true, showLabel: true }],
		['Icon and label, busy', commit, { showIcon: true, showLabel: true, showSpinner: true }],
		['Icon only', commit, { showIcon: true, showLabel: false }],
		['Icon only, busy', commit, { showIcon: true, showLabel: false, showSpinner: true }],
		['Secondary', commit, { showIcon: true, showLabel: true, isSecondary: true }],
		['Secondary icon only', commit, { showIcon: true, showLabel: false, isSecondary: true }],
		['Custom label', commit, { showIcon: true, showLabel: true, customLabel: 'Commit and Sync 2↑' }],
		['Disabled', disabled, { showIcon: true, showLabel: true }],
	];

	for (const [caption, buttonAction, config] of scenarios) {
		const host = addCaptionedRow(container, caption);
		addButtonBar(context, instantiationService, host, [buttonAction], () => config);
	}
}


// ============================================================================
// Button bars
// ============================================================================

function renderButtonBars(context: ComponentFixtureContext): void {
	const { container } = context;
	setupPage(container, 520);
	const instantiationService = createServices(context);

	const createPullRequest = action('fixture.createPullRequest', 'Create Pull Request', Codicon.gitPullRequest);
	const viewChanges = action('fixture.viewChanges', 'View All Changes', Codicon.diffMultiple);
	const openPullRequest = action('fixture.openPullRequest', 'Open Pull Request', Codicon.linkExternal);
	const runCodeReview = action('fixture.codeReview', 'Review Changes', Codicon.commentDiscussion);

	// The shape the changes title bar uses: a labelled primary followed by
	// icon-only trailing actions.
	const titleBarConfig: IButtonConfigProvider = (_action, index) => index === 0
		? { showIcon: true, showLabel: true }
		: { showIcon: true, showLabel: false };

	const withDropdown = new SubmenuAction('fixture.dropdown', 'Create Pull Request', [
		createPullRequest,
		new Separator(),
		action('fixture.createDraft', 'Create Draft Pull Request', Codicon.gitPullRequestDraft),
		action('fixture.push', 'Push Branch', Codicon.repoPush),
	]);

	const bars: readonly [caption: string, actions: IAction[], config: IButtonConfigProvider, secondary?: IAction[]][] = [
		['Primary and trailing', [createPullRequest, viewChanges, openPullRequest], titleBarConfig],
		['Split button', [withDropdown], titleBarConfig],
		['Split button, busy', [withDropdown], (_action, index) => index === 0
			? { showIcon: true, showLabel: true, showSpinner: true }
			: { showIcon: true, showLabel: false }],
		['Secondary overflow', [createPullRequest], titleBarConfig, [runCodeReview, openPullRequest]],
	];

	for (const [caption, actions, config, secondary] of bars) {
		const host = addCaptionedRow(container, caption);
		addButtonBar(context, instantiationService, host, actions, config, secondary);
	}
}


// ============================================================================
// Icon ⇄ spinner width comparison
// ============================================================================

const widthComparisonScenarios: readonly { readonly label: string; readonly icon: ThemeIcon }[] = [
	{ label: 'Create Pull Request', icon: Codicon.gitPullRequest },
	{ label: 'Commit', icon: Codicon.gitCommit },
	{ label: 'Merge', icon: Codicon.gitMerge },
];

interface IWidthComparisonRow {
	readonly scenario: { readonly label: string };
	readonly withIcon: HTMLElement;
	readonly withSpinner: HTMLElement;
	readonly guide: HTMLElement;
	readonly verdict: HTMLElement;
}

/**
 * Guards the property that a button in flight keeps the width it has at rest:
 * the pixel spinner stands in for the button's icon, so it has to occupy the
 * very same box. Each scenario stacks the two states and marks the right edge
 * of the resting one, so a regression both shows up in the screenshot and is
 * reported as a console error.
 */
async function renderWidthComparison(context: ComponentFixtureContext, options: { readonly showLabel: boolean }): Promise<void> {
	const { container } = context;
	setupPage(container, options.showLabel ? 420 : 300);
	container.style.gap = '20px';
	const instantiationService = createServices(context);

	const rows = widthComparisonScenarios.map((scenario): IWidthComparisonRow => {
		const group = dom.append(container, dom.$('.fixture-width-comparison'));
		group.style.display = 'flex';
		group.style.flexDirection = 'column';
		group.style.alignItems = 'flex-start';
		group.style.gap = '6px';

		const caption = dom.append(group, dom.$('span'));
		caption.textContent = scenario.label;
		caption.style.color = 'var(--vscode-descriptionForeground)';

		const stack = dom.append(group, dom.$('.fixture-width-comparison-stack'));
		stack.style.position = 'relative';
		stack.style.display = 'flex';
		stack.style.flexDirection = 'column';
		stack.style.alignItems = 'flex-start';
		stack.style.gap = '6px';

		const buttonAction = action(`fixture.width.${scenario.label}`, scenario.label, scenario.icon);
		const withIconHost = addBarHost(stack);
		const withSpinnerHost = addBarHost(stack);
		const withIcon = addButtonBar(context, instantiationService, withIconHost, [buttonAction],
			() => ({ showIcon: true, showLabel: options.showLabel })).buttons[0].element;
		const withSpinner = addButtonBar(context, instantiationService, withSpinnerHost, [buttonAction],
			() => ({ showIcon: true, showLabel: options.showLabel, showSpinner: true })).buttons[0].element;

		// Marks the right edge of the resting button across both rows: when the
		// spinner changes the width, the lower button stops meeting the line.
		const guide = dom.append(stack, dom.$('.fixture-width-comparison-guide'));
		guide.style.position = 'absolute';
		guide.style.top = '-4px';
		guide.style.bottom = '-4px';
		guide.style.width = '1px';
		guide.style.backgroundColor = 'var(--vscode-foreground)';

		const verdict = dom.append(group, dom.$('span'));

		return { scenario, withIcon, withSpinner, guide, verdict };
	});

	// The icon of an icon-only button is a codicon glyph, so its width only
	// settles once the icon font has loaded.
	await dom.getWindow(container).document.fonts.ready;

	for (const row of rows) {
		const iconWidth = row.withIcon.getBoundingClientRect().width;
		const spinnerWidth = row.withSpinner.getBoundingClientRect().width;
		const delta = spinnerWidth - iconWidth;
		const matches = Math.abs(delta) < 0.5;

		row.guide.style.left = `${iconWidth}px`;
		row.verdict.textContent = matches
			? 'same width'
			: `width changes by ${delta > 0 ? '+' : ''}${delta.toFixed(1)}px`;
		row.verdict.style.color = matches ? 'var(--vscode-charts-green)' : 'var(--vscode-errorForeground)';

		if (!matches) {
			// Fails the fixture, so the regression is reported rather than only
			// being visible to whoever reviews the screenshot.
			console.error(`[buttonBar fixture] "${row.scenario.label}" (${options.showLabel ? 'icon and label' : 'icon only'}) changes width when the spinner replaces the icon: ${iconWidth}px at rest, ${spinnerWidth}px busy.`);
		}
	}
}
