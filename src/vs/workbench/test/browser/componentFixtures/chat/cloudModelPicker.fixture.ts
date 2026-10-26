/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { bufferToStream, VSBuffer } from '../../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Event } from '../../../../../base/common/event.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IRequestService } from '../../../../../platform/request/common/request.js';
import { AgentHostLanguageModelProvider } from '../../../../contrib/chat/browser/agentSessions/agentHost/agentHostLanguageModelProvider.js';
import { CloudSandboxApiService } from '../../../../contrib/chat/browser/remoteAgentHost/cloudSandboxApiService.js';
import { withCloudSandboxDraftModelConfig } from '../../../../contrib/chat/browser/remoteAgentHost/cloudSandboxSessionConfig.js';
import { ICloudSandboxTelemetryService } from '../../../../contrib/chat/browser/remoteAgentHost/cloudSandboxTelemetry.js';
import { IAuthenticationService } from '../../../../services/authentication/common/authentication.js';
import { IWorkbenchGitHubService } from '../../../../services/github/common/githubService.js';
import { ComponentFixtureContext, defineComponentFixture, defineThemedFixtureGroup, waitForFixtureCondition } from '../fixtureUtils.js';
import { renderPicker } from './tabbedModelPicker.fixture.js';

async function renderCloudPicker(context: ComponentFixtureContext, view: 'list' | 'pricing' | 'long' | 'unknown', connected = false): Promise<void> {
	const details = view !== 'list';
	const unknownLimits = view === 'unknown';
	const api = context.disposableStore.add(new CloudSandboxApiService(
		new class extends mock<IRequestService>() {
			override async request() {
				return {
					res: { statusCode: 200, headers: {} },
					stream: bufferToStream(VSBuffer.fromString(JSON.stringify({
						data: [
							{ id: 'auto', name: 'Auto', billing: { is_premium: true, multiplier: 0.9 } },
							{
								id: 'cloud-model', name: 'Cloud Model', model_picker_price_category: 'medium',
								billing: {
									token_prices: unknownLimits
										? { batch_size: 1_000_000, input_price: 200_000_000_000, output_price: 1_000_000_000_000, cache_price: 10_000_000_000 }
										: {
											batch_size: 1_000_000,
											default: { context_max: 272_000, input_price: 200, output_price: 1000, cache_price: 10, cache_write_price: 250 },
											long_context: { context_max: 922_000, input_price: 400, output_price: 1500, cache_price: 20, cache_write_price: 500 },
										}
								},
								capabilities: { supports: { reasoning_effort: ['low', 'medium', 'high', 'xhigh', 'max'] }, limits: { max_context_window_tokens: 1_050_000 } },
							},
						],
					}))),
				};
			}
		}(),
		new class extends mock<IAuthenticationService>() {
			override readonly onDidChangeSessions = Event.None;
			override readonly onDidRegisterAuthenticationProvider = Event.None;
			override readonly onDidUnregisterAuthenticationProvider = Event.None;
			override async getSessions() {
				return [{ id: 'fixture', accessToken: 'fixture-token', account: { id: 'fixture', label: 'Fixture' }, scopes: [] }];
			}
		}(),
		new class extends mock<IProductService>() { }(),
		new NullLogService(),
		new class extends mock<ICloudSandboxTelemetryService>() {
			override reportRequest(): void { }
		}(),
		new class extends mock<IWorkbenchGitHubService>() { }(),
	));
	const catalog = await api.listModels(CancellationToken.None);
	const provider = context.disposableStore.add(new AgentHostLanguageModelProvider('cloud-sandbox', 'cloud-models'));
	provider.updateAdditionalModels(connected ? catalog.models : catalog.models.map(withCloudSandboxDraftModelConfig));
	if (connected) {
		provider.updateModels([{
			id: 'cloud-model', name: 'Cloud Model', provider: 'copilot', maxContextWindow: 1_050_000,
			configSchema: {
				type: 'object',
				properties: {
					reasoningEffort: { type: 'string', title: 'Effort Level', enum: ['low', 'medium', 'high', 'xhigh', 'max'] },
					contextTier: { type: 'string', title: 'Context tier', enum: ['default', 'long_context'], enumLabels: ['Default', 'Long context'], default: 'default' },
				},
			},
		}]);
	}
	const models = await provider.provideLanguageModelChatInfo(undefined, CancellationToken.None);
	await renderPicker(context, {
		models, selectedModelId: 'cloud-models:cloud-model', controlModels: {}, pinnedModelIds: [],
		...(view === 'long' ? { configured: { 'cloud-models:cloud-model': { contextTier: 'long_context', reasoningEffort: 'high' } } } : {}),
		...(details ? { pricingExpanded: true } : {}),
	});
	if (details) {
		await waitForFixtureCondition(() => {
			const body = context.container.querySelector('.chat-model-card-pricing-body')?.getBoundingClientRect();
			const content = context.container.querySelector('.chat-model-card-pricing-body-content')?.getBoundingClientRect();
			return !!body && !!content && body.height >= content.height;
		}, 'Cloud pricing expansion must finish before reopening details');
		const back = context.container.querySelector<HTMLElement>('.tabbed-action-list-details-header .action-label');
		if (!back) {
			throw new Error('Back to Models is missing');
		}
		back.click();
		const row = [...context.container.querySelectorAll<HTMLElement>('.monaco-list-row.action')].find(row => row.querySelector('.title')?.textContent === 'Cloud Model');
		const reopen = row?.querySelector<HTMLElement>('.action-list-item-toolbar .action-label');
		if (!reopen) {
			throw new Error('Cloud Model details action is missing');
		}
		reopen.click();
		await waitForFixtureCondition(() => {
			const rows = context.container.querySelectorAll('.chat-model-card-pricing-row');
			const viewport = context.container.querySelector('.tabbed-action-list-details-viewport')?.getBoundingClientRect();
			const lastRow = rows[rows.length - 1]?.getBoundingClientRect();
			return rows.length === (unknownLimits ? 3 : 4) && !!viewport && !!lastRow && lastRow.bottom <= viewport.bottom;
		}, 'Cloud pricing rows must be visible before capture');
	}
}

export default defineThemedFixtureGroup({ path: 'chat/input/cloudModelPicker' }, {
	List: defineComponentFixture({ render: context => renderCloudPicker(context, 'list') }),
	Pricing: defineComponentFixture({ render: context => renderCloudPicker(context, 'pricing') }),
	LongContext: defineComponentFixture({ render: context => renderCloudPicker(context, 'long') }),
	UnknownLimits: defineComponentFixture({ render: context => renderCloudPicker(context, 'unknown') }),
	Connected: defineComponentFixture({ render: context => renderCloudPicker(context, 'pricing', true) }),
	ConnectedLongContext: defineComponentFixture({ render: context => renderCloudPicker(context, 'long', true) }),
});
