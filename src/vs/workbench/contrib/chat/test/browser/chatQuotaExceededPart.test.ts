/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { IDefaultAccount } from '../../../../../base/common/defaultAccount.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { NullAgentHostService } from '../../../../../platform/agentHost/browser/nullAgentHostService.js';
import { IAgentHostService } from '../../../../../platform/agentHost/common/agentService.js';
import { CopilotAccountContext, copilotAccountContextKey } from '../../../../../platform/agentHost/common/copilotAccountContext.js';
import { IAgentSubscription } from '../../../../../platform/agentHost/common/state/agentSubscription.js';
import { RootState } from '../../../../../platform/agentHost/common/state/sessionState.js';
import { IDefaultAccountService } from '../../../../../platform/defaultAccount/common/defaultAccount.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IMarkdownRenderer } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { ChatEntitlement, IChatEntitlementService, IChatSentiment } from '../../../../services/chat/common/chatEntitlementService.js';
import { IChatResponseErrorDetails } from '../../common/chatService/chatService.js';
import { IChatErrorDetailsPart, IChatResponseViewModel } from '../../common/model/chatViewModel.js';
import { ChatQuotaExceededPart } from '../../browser/widget/chatContentParts/chatQuotaExceededPart.js';


function createMockEntitlementService(entitlement: ChatEntitlement): IChatEntitlementService {
	return {
		_serviceBrand: undefined,
		entitlement,
		entitlementObs: observableValue({}, entitlement),
		onDidChangeEntitlement: Event.None,
		onDidChangeQuotaExceeded: Event.None,
		onDidChangeQuotaRemaining: Event.None,
		onDidChangeUsageBasedBilling: Event.None,
		quotas: {},
		organisations: undefined,
		isInternal: false,
		sku: undefined,
		copilotTrackingId: undefined,
		clientByokEnabled: false,
		hasByokModels: false,
		onDidChangeSentiment: Event.None,
		sentiment: {} as IChatSentiment,
		sentimentObs: observableValue({}, {} as IChatSentiment),
		onDidChangeAnonymous: Event.None,
		anonymous: false,
		anonymousObs: observableValue({}, false),
		acceptQuotas() { },
		clearQuotas() { },
		markAnonymousRateLimited() { },
		markSetupCompleted() { },
		setForceHidden() { },
		update() { return Promise.resolve(); },
	} as IChatEntitlementService;
}

function createMockRenderer(): IMarkdownRenderer {
	return {
		render(markdown: MarkdownString) {
			const el = mainWindow.document.createElement('div');
			el.textContent = markdown.value;
			return { element: el, dispose() { } };
		},
		dispose() { },
	} as unknown as IMarkdownRenderer;
}

function createMockElement(errorDetails: IChatResponseErrorDetails): IChatResponseViewModel {
	return {
		errorDetails,
		sessionResource: URI.parse('test://session'),
	} as unknown as IChatResponseViewModel;
}

function createMockContent(): IChatErrorDetailsPart {
	return {
		kind: 'errorDetails',
		errorDetails: { message: 'test', isQuotaExceeded: true },
		isLast: true,
	};
}

suite('ChatQuotaExceededPart', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let executedCommands: string[];

	function createWidget(entitlement: ChatEntitlement, errorDetails: IChatResponseErrorDetails, host: IAgentHostService = new NullAgentHostService()): ChatQuotaExceededPart {
		executedCommands = [];

		const commandService = {
			executeCommand(id: string) {
				executedCommands.push(id);
				return Promise.resolve();
			},
		} as unknown as ICommandService;
		const telemetryService = {
			publicLog2() { },
		} as unknown as ITelemetryService;
		const entitlementService = createMockEntitlementService(entitlement);
		const renderer = createMockRenderer();

		const element = createMockElement(errorDetails);
		const content = createMockContent();

		const widget = new ChatQuotaExceededPart(
			element,
			content,
			renderer,
			commandService,
			telemetryService,
			entitlementService,
			host,
			upcastPartial<IDefaultAccountService>({
				onDidChangeDefaultAccount: Event.None,
				currentDefaultAccount: upcastPartial<IDefaultAccount>({ accountName: 'synthetic-github' }),
				resolveGitHubUrl: () => 'https://github.example/',
			}),
		);
		store.add(widget);
		mainWindow.document.body.appendChild(widget.domNode);
		return widget;
	}

	function getPrimaryButton(widget: ChatQuotaExceededPart): HTMLElement | null {
		return widget.domNode.querySelector('.chat-quota-error-button');
	}

	teardown(() => {
		for (const el of mainWindow.document.body.querySelectorAll('.chat-quota-error-widget')) {
			el.remove();
		}
	});

	test('hides GitHub billing actions and rejects stale activation after account context loss or change', () => {
		const github: CopilotAccountContext = {
			kind: 'ready', entraAccountId: 'synthetic', discoveryId: 'synthetic', derivedFrom: 'synthetic',
			choice: { service: 'github', selectionId: 'github', resource: 'https://github.example', host: 'https://github.example', accountName: 'synthetic-github', displayName: 'Synthetic GitHub' },
		};
		let context: CopilotAccountContext = github;
		const rootChanged = store.add(new Emitter<RootState>());
		const root = (): RootState => ({ agents: [], activeSessions: 0, config: { schema: { type: 'object', properties: {} }, values: { [copilotAccountContextKey]: context } } });
		const host = new class extends NullAgentHostService {
			override readonly authenticationPending = constObservable(true);
			override get rootState(): IAgentSubscription<RootState> {
				return upcastPartial<IAgentSubscription<RootState>>({ get value() { return root(); }, onDidChange: rootChanged.event });
			}
		}();
		const widget = createWidget(ChatEntitlement.Pro, { message: 'Provider capacity unavailable', isQuotaExceeded: true }, host);
		const button = getPrimaryButton(widget)!;
		const contexts: CopilotAccountContext[] = [
			github,
			{ ...github, choice: { ...github.choice, service: 'm365' } },
			{ kind: 'signedOut' },
			{ ...github, choice: { ...github.choice, accountName: 'another-account' } },
			github,
		];
		assert.deepStrictEqual(contexts.map(next => {
			context = next;
			rootChanged.fire(root());
			button.click();
			return { visible: button.style.display !== 'none', commands: executedCommands.length };
		}), [
			{ visible: true, commands: 1 },
			{ visible: false, commands: 1 },
			{ visible: false, commands: 1 },
			{ visible: false, commands: 1 },
			{ visible: true, commands: 2 },
		]);
	});

	suite('button label', () => {
		test('shows "Manage Budget" for Pro user without additional_spend_limit_reached', () => {
			const widget = createWidget(ChatEntitlement.Pro, {
				message: 'Quota exceeded',
				isQuotaExceeded: true,
			});

			const button = getPrimaryButton(widget);
			assert.ok(button);
			assert.strictEqual(button.textContent, 'Manage Budget');
		});

		test('shows "Upgrade to GitHub Copilot Pro" for Free user', () => {
			const widget = createWidget(ChatEntitlement.Free, {
				message: 'Quota exceeded',
				isQuotaExceeded: true,
			});

			const button = getPrimaryButton(widget);
			assert.ok(button);
			assert.strictEqual(button.textContent, 'Upgrade to GitHub Copilot Pro');
		});

		test('shows "Manage Budget" for Pro user with additional_spend_limit_reached', () => {
			const widget = createWidget(ChatEntitlement.Pro, {
				message: 'Spend limit reached',
				isQuotaExceeded: true,
				code: 'additional_spend_limit_reached',
			});

			const button = getPrimaryButton(widget);
			assert.ok(button);
			assert.strictEqual(button.textContent, 'Manage Budget');
		});

		test('shows "Manage Budget" for ProPlus user with additional_spend_limit_reached', () => {
			const widget = createWidget(ChatEntitlement.ProPlus, {
				message: 'Spend limit reached',
				isQuotaExceeded: true,
				code: 'additional_spend_limit_reached',
			});

			const button = getPrimaryButton(widget);
			assert.ok(button);
			assert.strictEqual(button.textContent, 'Manage Budget');
		});

		test('shows "Manage Budget" for EDU user without additional_spend_limit_reached', () => {
			const widget = createWidget(ChatEntitlement.EDU, {
				message: 'Quota exceeded',
				isQuotaExceeded: true,
			});

			const button = getPrimaryButton(widget);
			assert.ok(button);
			assert.strictEqual(button.textContent, 'Manage Budget');
		});
	});

	suite('button command', () => {
		test('Pro user clicks "Manage Budget" -> manageAdditionalSpend', async () => {
			const widget = createWidget(ChatEntitlement.Pro, {
				message: 'Quota exceeded',
				isQuotaExceeded: true,
			});

			const button = getPrimaryButton(widget);
			assert.ok(button);
			button.click();
			await new Promise(r => setTimeout(r, 0));

			assert.strictEqual(executedCommands[0], 'workbench.action.chat.manageAdditionalSpend');
		});

		test('Free user clicks "Upgrade" -> upgradePlan', async () => {
			const widget = createWidget(ChatEntitlement.Free, {
				message: 'Quota exceeded',
				isQuotaExceeded: true,
			});

			const button = getPrimaryButton(widget);
			assert.ok(button);
			button.click();
			await new Promise(r => setTimeout(r, 0));

			assert.strictEqual(executedCommands[0], 'workbench.action.chat.upgradePlan');
		});

		test('Pro user with additional_spend_limit_reached clicks "Manage Budget" -> manageAdditionalSpend', async () => {
			const widget = createWidget(ChatEntitlement.Pro, {
				message: 'Spend limit reached',
				isQuotaExceeded: true,
				code: 'additional_spend_limit_reached',
			});

			const button = getPrimaryButton(widget);
			assert.ok(button);
			button.click();
			await new Promise(r => setTimeout(r, 0));

			assert.strictEqual(executedCommands[0], 'workbench.action.chat.manageAdditionalSpend');
		});
	});
});
