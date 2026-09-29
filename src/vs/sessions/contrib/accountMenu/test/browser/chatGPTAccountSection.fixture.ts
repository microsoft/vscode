/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append } from '../../../../../base/browser/dom.js';
import { Event } from '../../../../../base/common/event.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { HoverService } from '../../../../../platform/hover/browser/hoverService.js';
import { ILayoutService } from '../../../../../platform/layout/browser/layoutService.js';
import { IMarkdownRendererService, MarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { ICodexAccountService, type ICodexAccountViewInfo } from '../../../../../workbench/services/agentHost/browser/codexAccountService.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup, type ServiceRegistration } from '../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js';
import { ChatGPTAccountSection } from '../../browser/chatGPTAccountSection.js';

const profileImageDataUri = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#5b5fc7"/><circle cx="32" cy="24" r="12" fill="#f8f8f8"/><path d="M12 64c2-16 10-24 20-24s18 8 20 24" fill="#f8f8f8"/></svg>')}`;

export default defineThemedFixtureGroup({ path: 'sessions/accountMenu/' }, {
	ChatGPTAccountSection: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: renderChatGPTAccountSection,
	}),
	FiveHourLimitHover: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderChatGPTAccountSection(context, 0),
	}),
	WeeklyLimitHover: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderChatGPTAccountSection(context, 1),
	}),
});

function renderChatGPTAccountSection({ container, disposableStore, theme }: ComponentFixtureContext, hoveredRateLimitIndex?: number): void {
	const now = Date.now();
	const account: ICodexAccountViewInfo = {
		status: 'signedIn',
		email: 'person@example.com',
		planType: 'plus',
		profileImageDataUri,
		// Intentionally supplied longest-first: the real component must order these by duration.
		rateLimits: [
			{ usedPercent: 94, windowDurationMins: 7 * 24 * 60, resetsAt: (now + 6 * 24 * 60 * 60 * 1000) / 1000 },
			{ usedPercent: 65, windowDurationMins: 5 * 60, resetsAt: (now + 4 * 60 * 60 * 1000) / 1000 },
		],
	};
	const accountService: ICodexAccountService = {
		_serviceBrand: undefined,
		agent: 'codex',
		account,
		onDidChangeAccount: Event.None,
		signIn() { },
		signOut() { },
	};
	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: theme,
		additionalServices: registration => {
			registration.defineInstance(ICodexAccountService, accountService);
			if (hoveredRateLimitIndex !== undefined) {
				registerHoverServices(registration, container);
			}
		},
	});

	container.classList.add('agent-sessions-workbench');
	container.style.position = 'relative';
	container.style.boxSizing = 'border-box';
	container.style.width = '440px';
	container.style.minHeight = '190px';
	container.style.padding = '20px';
	container.style.backgroundColor = 'var(--vscode-editor-background)';
	container.style.color = 'var(--vscode-foreground)';

	const panel = append(container, $('.sessions-account-titlebar-panel'));
	panel.style.backgroundColor = 'var(--vscode-editorHoverWidget-background)';
	panel.style.border = 'var(--vscode-strokeThickness) solid var(--vscode-editorHoverWidget-border)';
	panel.style.borderRadius = 'var(--vscode-cornerRadius-large)';
	panel.style.boxShadow = '0 2px 8px var(--vscode-widget-shadow)';
	const identities = append(panel, $('.sessions-account-titlebar-panel-identities'));
	const section = disposableStore.add(instantiationService.createInstance(ChatGPTAccountSection, {
		account,
		avatarUrl: profileImageDataUri,
	}));
	identities.appendChild(section.element);

	if (hoveredRateLimitIndex !== undefined) {
		const row = section.element.querySelectorAll<HTMLElement>('.sessions-account-titlebar-panel-provider-metric-row.secondary')[hoveredRateLimitIndex];
		if (!row) {
			throw new Error(`Missing rate-limit row ${hoveredRateLimitIndex}.`);
		}
		row.focus();
		const keyboardEvent = new row.ownerDocument.defaultView!.KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true });
		Object.defineProperty(keyboardEvent, 'keyCode', { value: 13 });
		row.dispatchEvent(keyboardEvent);
	}
}

function registerHoverServices(registration: ServiceRegistration, container: HTMLElement): void {
	registration.definePartialInstance(IContextMenuService, {
		onDidShowContextMenu: Event.None,
	});
	registration.definePartialInstance(ILayoutService, {
		activeContainer: container,
		mainContainer: container,
		getContainer: () => container,
	});
	registration.define(IMarkdownRendererService, MarkdownRendererService);
	registration.define(IHoverService, HoverService);
}
