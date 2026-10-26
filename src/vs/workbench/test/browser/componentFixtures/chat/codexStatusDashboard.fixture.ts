/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../../../../browser/parts/statusbar/media/statusbarpart.css';
import { $, append } from '../../../../../base/browser/dom.js';
import { Event } from '../../../../../base/common/event.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { nativeHoverDelegate } from '../../../../../platform/hover/browser/hover.js';
import { AgentHostCodexAgentEnabledSettingId, CodexPreferAgentHostEditorSettingId } from '../../../../../platform/agentHost/common/agentService.js';
import { ChatAIDisabledSettingId } from '../../../../../platform/chat/common/chatSettings.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ICodexAccountService, type ICodexAccountViewInfo } from '../../../../services/agentHost/browser/codexAccountService.js';
import { IStatusbarEntry, IStatusbarEntryAccessor, IStatusbarEntryLocation, IStatusbarEntryPriority, IStatusbarService, StatusbarAlignment } from '../../../../services/statusbar/browser/statusbar.js';
import { StatusbarEntryItem } from '../../../../browser/parts/statusbar/statusbarItem.js';
import { CodexStatusDashboard } from '../../../../contrib/chat/browser/chatStatus/codexStatusDashboard.js';
import { CodexStatusBarEntry } from '../../../../contrib/chat/browser/chatStatus/codexStatusEntry.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';

const profileImageDataUri = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#5b5fc7"/><circle cx="32" cy="24" r="12" fill="#f8f8f8"/><path d="M12 64c2-16 10-24 20-24s18 8 20 24" fill="#f8f8f8"/></svg>')}`;

const account: ICodexAccountViewInfo = {
	status: 'signedIn',
	email: 'person@example.com',
	planType: 'plus',
	profileImageDataUri,
	rateLimit: { usedPercent: 94, windowDurationMins: 7 * 24 * 60, resetsAt: Date.UTC(2026, 9, 1, 6, 0) / 1000 },
	rateLimits: [
		{ usedPercent: 94, windowDurationMins: 7 * 24 * 60, resetsAt: Date.UTC(2026, 9, 1, 6, 0) / 1000 },
		{ usedPercent: 65, windowDurationMins: 5 * 60, resetsAt: Date.UTC(2026, 8, 29, 17, 30) / 1000 },
	],
};

export default defineThemedFixtureGroup({ path: 'chat/' }, {
	CodexStatusDashboard: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: renderCodexStatusDashboard,
	}),
});

function renderCodexStatusDashboard({ container, disposableStore, theme }: ComponentFixtureContext): void {
	let statusEntry: IStatusbarEntry | undefined;
	const configurationService = new TestConfigurationService({
		[AgentHostCodexAgentEnabledSettingId]: true,
		[CodexPreferAgentHostEditorSettingId]: true,
		[ChatAIDisabledSettingId]: false,
	});
	const accountService: ICodexAccountService = {
		_serviceBrand: undefined,
		agent: 'codex',
		account,
		onDidChangeAccount: Event.None,
		signIn() { },
		signOut() { },
	};
	const statusbarService = new class extends mock<IStatusbarService>() {
		override addEntry(entry: IStatusbarEntry, _id: string, _alignment: StatusbarAlignment, _priority?: number | IStatusbarEntryLocation | IStatusbarEntryPriority): IStatusbarEntryAccessor {
			statusEntry = entry;
			return { update: updated => { statusEntry = updated; }, dispose() { } };
		}
	}();
	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: theme,
		additionalServices: reg => {
			reg.defineInstance(IConfigurationService, configurationService);
			reg.defineInstance(ICodexAccountService, accountService);
			reg.defineInstance(IStatusbarService, statusbarService);
		},
	});

	container.classList.add('monaco-workbench');
	container.style.boxSizing = 'border-box';
	container.style.width = '420px';
	container.style.height = '340px';
	container.style.padding = '12px';
	container.style.display = 'flex';
	container.style.flexDirection = 'column';
	container.style.alignItems = 'flex-end';
	container.style.justifyContent = 'flex-end';
	container.style.gap = '8px';
	container.style.backgroundColor = 'var(--vscode-editor-background)';
	container.style.color = 'var(--vscode-editor-foreground)';

	disposableStore.add(instantiationService.createInstance(CodexStatusBarEntry));
	if (!statusEntry) {
		throw new Error('Expected the Codex status entry to be visible in the fixture.');
	}

	const hover = append(container, $('.codex-status-dashboard-fixture-hover'));
	hover.style.boxSizing = 'border-box';
	hover.style.width = '360px';
	hover.style.backgroundColor = 'var(--vscode-editorHoverWidget-background)';
	hover.style.color = 'var(--vscode-editorHoverWidget-foreground)';
	hover.style.border = 'var(--vscode-strokeThickness) solid var(--vscode-editorHoverWidget-border)';
	hover.style.borderRadius = 'var(--vscode-cornerRadius-large)';
	hover.style.boxShadow = '0 2px 8px var(--vscode-widget-shadow)';
	const dashboard = disposableStore.add(instantiationService.createInstance(CodexStatusDashboard));
	hover.appendChild(dashboard.element);

	const statusbar = append(container, $('.part.statusbar'));
	statusbar.style.backgroundColor = 'var(--vscode-statusBar-background)';
	statusbar.style.color = 'var(--vscode-statusBar-foreground)';
	append(statusbar, $('.left-items.items-container'));
	const rightItems = append(statusbar, $('.right-items.items-container'));

	const codexContainer = append(rightItems, $('.statusbar-item.right.last-visible-item'));
	disposableStore.add(instantiationService.createInstance(StatusbarEntryItem, codexContainer, statusEntry, nativeHoverDelegate));

	const copilotContainer = append(rightItems, $('.statusbar-item.right'));
	disposableStore.add(instantiationService.createInstance(StatusbarEntryItem, copilotContainer, {
		name: 'Copilot Status',
		text: '$(copilot)',
		ariaLabel: 'Copilot status',
		command: 'fixture.copilotStatus',
	}, nativeHoverDelegate));
}
