/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Event } from '../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IMarkdownRenderer } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { ChatEntitlement, IChatEntitlementService, IChatSentiment } from '../../../../services/chat/common/chatEntitlementService.js';
import { IChatResponseErrorDetails } from '../../common/chatService/chatService.js';
import { IChatErrorDetailsPart, IChatResponseViewModel } from '../../common/model/chatViewModel.js';
import { IChatWidgetService } from '../../browser/chat.js';
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
		previewFeaturesDisabled: false,
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

	function createWidget(entitlement: ChatEntitlement, errorDetails: IChatResponseErrorDetails): ChatQuotaExceededPart {
		executedCommands = [];

		const chatWidgetService = {} as IChatWidgetService;
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
			chatWidgetService,
			commandService,
			telemetryService,
			entitlementService,
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

		test('shows "Upgrade" for Pro user with additional_spend_limit_reached', () => {
			const widget = createWidget(ChatEntitlement.Pro, {
				message: 'Spend limit reached',
				isQuotaExceeded: true,
				code: 'additional_spend_limit_reached',
			});

			const button = getPrimaryButton(widget);
			assert.ok(button);
			assert.strictEqual(button.textContent, 'Upgrade');
		});

		test('shows "Upgrade" for ProPlus user with additional_spend_limit_reached', () => {
			const widget = createWidget(ChatEntitlement.ProPlus, {
				message: 'Spend limit reached',
				isQuotaExceeded: true,
				code: 'additional_spend_limit_reached',
			});

			const button = getPrimaryButton(widget);
			assert.ok(button);
			assert.strictEqual(button.textContent, 'Upgrade');
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

		test('Pro user with additional_spend_limit_reached clicks "Upgrade" -> upgradePlan', async () => {
			const widget = createWidget(ChatEntitlement.Pro, {
				message: 'Spend limit reached',
				isQuotaExceeded: true,
				code: 'additional_spend_limit_reached',
			});

			const button = getPrimaryButton(widget);
			assert.ok(button);
			button.click();
			await new Promise(r => setTimeout(r, 0));

			assert.strictEqual(executedCommands[0], 'workbench.action.chat.upgradePlan');
		});
	});
});
