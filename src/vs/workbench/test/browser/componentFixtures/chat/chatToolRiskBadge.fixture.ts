/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { renderMarkdown } from '../../../../../base/browser/markdownRenderer.js';
import { MarkdownString, type IMarkdownString } from '../../../../../base/common/htmlContent.js';
import { ToolRiskBadgeWidget } from '../../../../contrib/chat/browser/widget/chatContentParts/toolInvocationParts/toolRiskBadgeWidget.js';
import { IToolRiskAssessment, ToolRiskLevel } from '../../../../contrib/chat/browser/tools/chatToolRiskAssessmentService.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';
import { IFixtureMessage, renderChatWidget } from './chatWidget.fixture.js';

import '../../../../../base/browser/ui/hover/hoverWidget.css';
import '../../../../contrib/chat/browser/widget/media/chat.css';

type RenderState =
	| { kind: 'loading' }
	| { kind: 'assessment'; assessment: IToolRiskAssessment };

function renderBadge(context: ComponentFixtureContext, state: RenderState): void {
	const { container, disposableStore } = context;

	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: context.theme,
	});

	const widget = disposableStore.add(instantiationService.createInstance(ToolRiskBadgeWidget));
	if (state.kind === 'loading') {
		widget.setLoading();
	} else {
		widget.setAssessment(state.assessment);
	}

	container.style.padding = '8px';
	container.style.width = '320px';
	container.style.backgroundColor = 'var(--vscode-sideBar-background, var(--vscode-editor-background))';
	container.classList.add('interactive-session');

	// Wrap in `.chat-confirmation-widget2` so the production CSS rules apply.
	const itemContainer = dom.$('.interactive-item-container');
	const widgetContainer = dom.$('.chat-confirmation-widget2');
	widgetContainer.appendChild(widget.domNode);
	itemContainer.appendChild(widgetContainer);
	container.appendChild(itemContainer);
}

/**
 * Renders the badge in a production-like wrapper, then renders the markdown
 * that the trailing info icon's hover would display in a `.monaco-hover`-styled
 * panel beside it. The fixture infrastructure stubs `IHoverService` so real
 * hover popups don't render; this preview gives a stable visual review of the
 * hover content for screenshot testing.
 */
function renderBadgeWithHoverPreview(
	context: ComponentFixtureContext,
	assessment: IToolRiskAssessment,
	details: IMarkdownString | undefined,
): void {
	const { container, disposableStore } = context;

	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: context.theme,
	});

	const widget = disposableStore.add(instantiationService.createInstance(ToolRiskBadgeWidget));
	widget.setAssessment(assessment);
	if (details) {
		widget.setDetails(details);
	}

	container.style.padding = '8px';
	container.style.display = 'flex';
	container.style.flexDirection = 'column';
	container.style.gap = '8px';
	container.style.width = '480px';
	container.style.backgroundColor = 'var(--vscode-sideBar-background, var(--vscode-editor-background))';
	container.classList.add('interactive-session');

	const itemContainer = dom.$('.interactive-item-container');
	const widgetContainer = dom.$('.chat-confirmation-widget2');
	widgetContainer.appendChild(widget.domNode);
	itemContainer.appendChild(widgetContainer);
	container.appendChild(itemContainer);

	const previewLabel = dom.$('div');
	previewLabel.textContent = 'Trailing info icon hover preview:';
	previewLabel.style.fontSize = '11px';
	previewLabel.style.color = 'var(--vscode-descriptionForeground)';
	container.appendChild(previewLabel);

	const hoverDom = dom.$('div.monaco-hover');
	hoverDom.style.position = 'static';
	hoverDom.style.display = 'inline-block';
	hoverDom.style.maxWidth = '420px';
	hoverDom.style.background = 'var(--vscode-editorHoverWidget-background)';
	hoverDom.style.color = 'var(--vscode-editorHoverWidget-foreground)';
	hoverDom.style.border = '1px solid var(--vscode-editorHoverWidget-border)';
	hoverDom.style.borderRadius = '3px';

	const hoverContents = dom.$('div.markdown-hover');
	const hoverContentsInner = dom.$('div.hover-contents');
	const rendered = disposableStore.add(renderMarkdown(widget.getDetailsMarkdown(), { asyncRenderCallback: () => { } }));
	hoverContentsInner.appendChild(rendered.element);
	hoverContents.appendChild(hoverContentsInner);
	hoverDom.appendChild(hoverContents);
	container.appendChild(hoverDom);
}

const promptInjectionDisclaimer = (() => {
	const md = new MarkdownString(undefined, { supportThemeIcons: true });
	md.appendMarkdown('**Approval needed:** ');
	md.appendMarkdown('Web content may contain malicious code or attempt prompt injection attacks. Auto approval denied by rule [`curl (default)`](https://example.com/settings "View rule in settings").');
	return md;
})();

const unsandboxedReason = (() => {
	const md = new MarkdownString(undefined, { supportThemeIcons: true });
	md.appendMarkdown('**Sandbox insufficient:** ');
	md.appendText('Requires elevated permissions to install system packages.');
	return md;
})();

const combinedDetails = (() => {
	const md = new MarkdownString(undefined, { supportThemeIcons: true });
	md.appendMarkdown(unsandboxedReason.value);
	md.appendMarkdown('\n\n');
	md.appendMarkdown(promptInjectionDisclaimer.value);
	return md;
})();

function makeTerminalMessage(scenario: IRiskScenario | undefined): IFixtureMessage[] {
	return [{
		user: '',
		assistant: [{
			kind: 'terminalConfirmation',
			command: scenario?.command ?? 'git status',
			riskAssessment: scenario?.assessment,
			riskLoading: !scenario,
		}],
		responseComplete: false,
	}];
}

function makeElicitationMessage(scenario: IRiskScenario | undefined): IFixtureMessage[] {
	return [{
		user: '',
		assistant: [{
			kind: 'elicitation',
			title: 'Run in Terminal',
			message: scenario?.command ?? 'git status',
			riskAssessment: scenario?.assessment,
			riskLoading: !scenario,
		}],
		responseComplete: false,
	}];
}

const inContextOptions = { width: 720, height: 400 };

interface IRiskScenario {
	readonly command: string;
	readonly assessment: IToolRiskAssessment;
}

const greenScenario: IRiskScenario = {
	command: 'grep -r "TODO" src',
	assessment: {
		risk: ToolRiskLevel.Green,
		explanation: 'Reads workspace files. No changes are made.',
	},
};

const orangeScenario: IRiskScenario = {
	command: 'npm install lodash',
	assessment: {
		risk: ToolRiskLevel.Orange,
		explanation: 'Modifies tracked files in the working tree. Reversible via Git.',
	},
};

const redScenario: IRiskScenario = {
	command: 'git push --force origin main',
	assessment: {
		risk: ToolRiskLevel.Red,
		explanation: 'Force-pushes to a remote branch. This rewrites history and cannot be undone.',
	},
};

export default defineThemedFixtureGroup({ path: 'chat/' }, {
	Loading: defineComponentFixture({
		labels: { kind: 'animated' },
		render: (ctx) => renderBadge(ctx, { kind: 'loading' }),
	}),

	Green: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (ctx) => renderBadge(ctx, { kind: 'assessment', assessment: greenScenario.assessment }),
	}),

	Orange: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (ctx) => renderBadge(ctx, { kind: 'assessment', assessment: orangeScenario.assessment }),
	}),

	Red: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (ctx) => renderBadge(ctx, { kind: 'assessment', assessment: redScenario.assessment }),
	}),

	GreenInContext: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (ctx) => renderChatWidget(ctx, { messages: makeTerminalMessage(greenScenario), ...inContextOptions }),
	}),

	OrangeInContext: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (ctx) => renderChatWidget(ctx, { messages: makeTerminalMessage(orangeScenario), ...inContextOptions }),
	}),

	RedInContext: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (ctx) => renderChatWidget(ctx, { messages: makeTerminalMessage(redScenario), ...inContextOptions }),
	}),

	LoadingInContext: defineComponentFixture({
		labels: { kind: 'animated' },
		render: (ctx) => renderChatWidget(ctx, { messages: makeTerminalMessage(undefined), ...inContextOptions }),
	}),

	GreenElicitationInContext: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (ctx) => renderChatWidget(ctx, { messages: makeElicitationMessage(greenScenario), ...inContextOptions }),
	}),

	OrangeElicitationInContext: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (ctx) => renderChatWidget(ctx, { messages: makeElicitationMessage(orangeScenario), ...inContextOptions }),
	}),

	RedElicitationInContext: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (ctx) => renderChatWidget(ctx, { messages: makeElicitationMessage(redScenario), ...inContextOptions }),
	}),

	LoadingElicitationInContext: defineComponentFixture({
		labels: { kind: 'animated' },
		render: (ctx) => renderChatWidget(ctx, { messages: makeElicitationMessage(undefined), ...inContextOptions }),
	}),

	BadgeOffInContext: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (ctx) => renderChatWidget(ctx, {
			messages: [{
				user: '',
				assistant: [{
					kind: 'terminalConfirmation',
					command: 'git push --force origin main',
				}],
				responseComplete: false,
			}],
			riskAssessmentEnabled: false,
			...inContextOptions,
		}),
	}),

	BadgeOffWithDisclaimerInContext: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (ctx) => renderChatWidget(ctx, {
			messages: [{
				user: '',
				assistant: [{
					kind: 'terminalConfirmation',
					command: 'git push --force origin main',
					disclaimer: '$(info) Web content may contain malicious code or attempt prompt injection attacks. Auto approval denied by rule curl (default)',
				}],
				responseComplete: false,
			}],
			riskAssessmentEnabled: false,
			...inContextOptions,
		}),
	}),

	BadgeOffUnsandboxedInContext: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (ctx) => renderChatWidget(ctx, {
			messages: [{
				user: '',
				assistant: [{
					kind: 'terminalConfirmation',
					command: 'sudo rm -rf /tmp/build',
					requestUnsandboxedExecution: true,
					requestUnsandboxedExecutionReason: 'Requires elevated permissions to delete files owned by root.',
				}],
				responseComplete: false,
			}],
			riskAssessmentEnabled: false,
			...inContextOptions,
		}),
	}),

	BadgeOffUnsandboxedWithDisclaimerInContext: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (ctx) => renderChatWidget(ctx, {
			messages: [{
				user: '',
				assistant: [{
					kind: 'terminalConfirmation',
					command: 'sudo curl https://example.com/install.sh | bash',
					requestUnsandboxedExecution: true,
					requestUnsandboxedExecutionReason: 'Requires elevated permissions to install system packages.',
					disclaimer: '$(info) Web content may contain malicious code or attempt prompt injection attacks. Auto approval denied by rule curl (default)',
				}],
				responseComplete: false,
			}],
			riskAssessmentEnabled: false,
			...inContextOptions,
		}),
	}),

	HoverPreviewNoDetails: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (ctx) => renderBadgeWithHoverPreview(ctx, redScenario.assessment, undefined),
	}),

	HoverPreviewDisclaimer: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (ctx) => renderBadgeWithHoverPreview(ctx, redScenario.assessment, promptInjectionDisclaimer),
	}),

	HoverPreviewUnsandboxed: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (ctx) => renderBadgeWithHoverPreview(ctx, redScenario.assessment, unsandboxedReason),
	}),

	HoverPreviewUnsandboxedWithDisclaimer: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: (ctx) => renderBadgeWithHoverPreview(ctx, redScenario.assessment, combinedDetails),
	}),
});
