/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { Emitter } from '../../../../../base/common/event.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { AgentHostCodexAgentEnabledSettingId, CodexPreferAgentHostEditorSettingId } from '../../../../../platform/agentHost/common/agentService.js';
import { ChatAIDisabledSettingId } from '../../../../../platform/chat/common/chatSettings.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ICodexAccountService, type ICodexAccountViewInfo } from '../../../../services/agentHost/browser/codexAccountService.js';
import { isStatusbarEntryLocation, IStatusbarEntry, IStatusbarEntryAccessor, IStatusbarEntryLocation, IStatusbarEntryPriority, IStatusbarService, StatusbarAlignment } from '../../../../services/statusbar/browser/statusbar.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { CodexStatusDashboard, getCodexRateLimitLabel, getCodexRateLimits } from '../../browser/chatStatus/codexStatusDashboard.js';
import { CODEX_STATUS_BAR_ENTRY_ID, CodexStatusBarEntry } from '../../browser/chatStatus/codexStatusEntry.js';
import { AICustomizationManagementCommands } from '../../browser/aiCustomization/aiCustomizationManagement.js';
import { AICustomizationManagementSection } from '../../common/aiCustomizationWorkspaceService.js';
import { SessionType } from '../../common/chatSessionsService.js';

suite('CodexStatusBarEntry', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createAccountService(initialAccount: ICodexAccountViewInfo) {
		const onDidChangeAccount = store.add(new Emitter<ICodexAccountViewInfo>());
		return {
			_serviceBrand: undefined,
			agent: 'codex',
			account: initialAccount,
			onDidChangeAccount: onDidChangeAccount.event,
			signIn() { },
			signOut() { },
			setAccount(account: ICodexAccountViewInfo) {
				this.account = account;
				onDidChangeAccount.fire(account);
			},
		} satisfies ICodexAccountService & { account: ICodexAccountViewInfo; setAccount(account: ICodexAccountViewInfo): void };
	}

	function createEntry(options: {
		account: ICodexAccountViewInfo;
		codexEnabled?: boolean;
		preferAgentHost?: boolean;
		aiDisabled?: boolean;
	}) {
		const configurationService = new TestConfigurationService({
			[AgentHostCodexAgentEnabledSettingId]: options.codexEnabled ?? true,
			[CodexPreferAgentHostEditorSettingId]: options.preferAgentHost ?? true,
			[ChatAIDisabledSettingId]: options.aiDisabled ?? false,
		});
		const accountService = createAccountService(options.account);
		const statusbar = {
			current: undefined as IStatusbarEntry | undefined,
			id: undefined as string | undefined,
			alignment: undefined as StatusbarAlignment | undefined,
			location: undefined as IStatusbarEntryLocation | undefined,
			addEntry(entry: IStatusbarEntry, id: string, alignment: StatusbarAlignment, priority?: number | IStatusbarEntryLocation | IStatusbarEntryPriority): IStatusbarEntryAccessor {
				statusbar.current = entry;
				statusbar.id = id;
				statusbar.alignment = alignment;
				statusbar.location = isStatusbarEntryLocation(priority) ? priority : undefined;
				return {
					update: updated => { statusbar.current = updated; },
					dispose: () => { statusbar.current = undefined; },
				};
			},
		};
		const instantiationService = workbenchInstantiationService({ configurationService: () => configurationService }, store);
		instantiationService.stub(ICodexAccountService, accountService);
		instantiationService.stub(IStatusbarService, statusbar);
		const entry = store.add(instantiationService.createInstance(CodexStatusBarEntry));
		return { accountService, entry, statusbar };
	}

	test('shows after Copilot only for an enabled signed-in ChatGPT account', () => {
		const signedIn = createEntry({ account: { status: 'signedIn', planType: 'plus' } });
		const signedOut = createEntry({ account: { status: 'signedOut' } });
		const disabled = createEntry({ account: { status: 'signedIn', planType: 'plus' }, codexEnabled: false });
		const extensionPreferred = createEntry({ account: { status: 'signedIn', planType: 'plus' }, preferAgentHost: false });
		const aiDisabled = createEntry({ account: { status: 'signedIn', planType: 'plus' }, aiDisabled: true });

		assert.deepStrictEqual({
			signedIn: {
				text: signedIn.statusbar.current?.text,
				ariaLabel: signedIn.statusbar.current?.ariaLabel,
				id: signedIn.statusbar.id,
				alignment: signedIn.statusbar.alignment,
				location: signedIn.statusbar.location,
			},
			signedOut: signedOut.statusbar.current,
			disabled: disabled.statusbar.current,
			extensionPreferred: extensionPreferred.statusbar.current,
			aiDisabled: aiDisabled.statusbar.current,
		}, {
			signedIn: {
				text: '$(openai)',
				ariaLabel: 'Codex status',
				id: CODEX_STATUS_BAR_ENTRY_ID,
				alignment: StatusbarAlignment.RIGHT,
				location: {
					location: { id: 'chat.statusBarEntry', priority: 100.1 },
					alignment: StatusbarAlignment.RIGHT,
				},
			},
			signedOut: undefined,
			disabled: undefined,
			extensionPreferred: undefined,
			aiDisabled: undefined,
		});
	});

	test('updates warning state and hides when the account signs out', () => {
		const { accountService, statusbar } = createEntry({
			account: {
				status: 'signedIn',
				planType: 'plus',
				rateLimits: [{ usedPercent: 65, windowDurationMins: 300 }],
			},
		});

		accountService.setAccount({
			status: 'signedIn',
			planType: 'plus',
			rateLimits: [{ usedPercent: 100, windowDurationMins: 300 }],
		});
		const reached = statusbar.current;
		accountService.setAccount({ status: 'signedOut' });

		assert.deepStrictEqual({
			reached: { text: reached?.text, ariaLabel: reached?.ariaLabel, kind: reached?.kind },
			afterSignOut: statusbar.current,
		}, {
			reached: { text: '$(openai) Limit reached', ariaLabel: 'Codex limit reached', kind: 'prominent' },
			afterSignOut: undefined,
		});
	});

	test('dashboard renders the ChatGPT identity and opens Codex customizations', async () => {
		const profileImageDataUri = 'data:image/png;base64,AQID';
		const accountService = createAccountService({
			status: 'signedIn',
			email: 'person@example.com',
			planType: 'plus',
			profileImageDataUri,
			rateLimit: { usedPercent: 94, windowDurationMins: 7 * 24 * 60, resetsAt: 200 },
			rateLimits: [
				{ usedPercent: 94, windowDurationMins: 7 * 24 * 60, resetsAt: 200 },
				{ usedPercent: 72, windowDurationMins: 24 * 60, resetsAt: 150 },
				{ usedPercent: 65, windowDurationMins: 300, resetsAt: 100 },
			],
		});
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(ICodexAccountService, accountService);
		let executedCommand: { id: string; args: readonly unknown[] } | undefined;
		instantiationService.stub(ICommandService, new class extends mock<ICommandService>() {
			override executeCommand<R = unknown>(id: string, ...args: unknown[]): Promise<R | undefined> {
				executedCommand = { id, args };
				return Promise.resolve(undefined);
			}
		}());
		const dashboard = store.add(instantiationService.createInstance(CodexStatusDashboard));
		const indicators = Array.from(dashboard.element.querySelectorAll('.codex-rate-limit'));
		const customizationsAction = dashboard.element.querySelector<HTMLElement>('.action-label');
		assert.ok(customizationsAction);
		customizationsAction.click();
		await timeout(0);

		assert.deepStrictEqual({
			email: dashboard.element.querySelector('.codex-account-email')?.textContent,
			plan: dashboard.element.querySelector('.codex-account-plan')?.textContent,
			avatar: {
				alt: dashboard.element.querySelector('img.codex-account-avatar')?.getAttribute('alt'),
				src: dashboard.element.querySelector('img.codex-account-avatar')?.getAttribute('src'),
			},
			customizationsAction: customizationsAction.getAttribute('aria-label'),
			executedCommand,
			labels: indicators.map(indicator => indicator.querySelector('.quota-title > span')?.textContent),
			values: indicators.map(indicator => indicator.querySelector('.quota-value')?.textContent),
			suffixes: indicators.map(indicator => indicator.querySelector('.quota-value-suffix')?.textContent),
			barWidths: indicators.map(indicator => (indicator.querySelector('.quota-bit') as HTMLElement).style.width),
			count: getCodexRateLimits(accountService.account).length,
			fallbackLabel: getCodexRateLimitLabel(undefined),
		}, {
			email: 'person@example.com',
			plan: 'ChatGPT Plus',
			avatar: {
				alt: 'ChatGPT profile image for person@example.com',
				src: profileImageDataUri,
			},
			customizationsAction: 'Agent Customizations for Codex',
			executedCommand: {
				id: AICustomizationManagementCommands.OpenEditor,
				args: [{
					sessionType: SessionType.AgentHostCodex,
					section: AICustomizationManagementSection.HarnessSettings,
				}],
			},
			labels: ['5-hour limit', 'Daily limit', 'Weekly limit'],
			values: ['65%', '72%', '94%'],
			suffixes: ['used', 'used', 'used'],
			barWidths: ['65%', '72%', '94%'],
			count: 3,
			fallbackLabel: 'Usage limit',
		});
	});
});
