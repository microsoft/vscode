/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CodexSessionConfigKey, isCodexSupportedModel, narrowAdditionalDirectories, narrowApprovalPolicy, narrowBoolean, narrowReasoningEffort, narrowSandboxMode, narrowWebSearchMode, normalizeCodexModelId } from '../../../node/codex/codexSessionConfigKeys.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { ISessionDataService } from '../../../common/sessionDataService.js';
import { CodexAgent } from '../../../node/codex/codexAgent.js';
import { ICodexProxyService } from '../../../node/codex/codexProxyService.js';
import { IAgentConfigurationService } from '../../../node/agentConfigurationService.js';
import { IAgentSdkDownloader } from '../../../node/agentSdkDownloader.js';
import { ICopilotApiService } from '../../../node/shared/copilotApiService.js';

function createAgent(disposables: Pick<DisposableStore, 'add'>): CodexAgent {
	const instantiationService = new TestInstantiationService();
	instantiationService.stub(ISessionDataService, { _serviceBrand: undefined });
	instantiationService.stub(ICopilotApiService, { _serviceBrand: undefined });
	instantiationService.stub(ICodexProxyService, { _serviceBrand: undefined });
	instantiationService.stub(IAgentConfigurationService, { _serviceBrand: undefined });
	instantiationService.stub(IAgentSdkDownloader, { _serviceBrand: undefined });
	instantiationService.stub(ILogService, new NullLogService());
	return disposables.add(instantiationService.createInstance(CodexAgent));
}

suite('codexSessionConfigKeys', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('narrows valid values and rejects invalid values', () => {
		assert.deepStrictEqual({
			approvalPolicy: [narrowApprovalPolicy('never'), narrowApprovalPolicy('on-request'), narrowApprovalPolicy('nope')],
			sandboxMode: [narrowSandboxMode('read-only'), narrowSandboxMode('workspace-write'), narrowSandboxMode('folder')],
			additionalDirectories: [narrowAdditionalDirectories(['/tmp/a', '', 1, '/tmp/b']), narrowAdditionalDirectories('nope')],
			boolean: [narrowBoolean(true), narrowBoolean(false), narrowBoolean('true')],
			webSearchMode: [narrowWebSearchMode('disabled'), narrowWebSearchMode('cached'), narrowWebSearchMode('online')],
			reasoningEffort: [narrowReasoningEffort('minimal'), narrowReasoningEffort('medium'), narrowReasoningEffort('max')],
		}, {
			approvalPolicy: ['never', 'on-request', undefined],
			sandboxMode: ['read-only', 'workspace-write', undefined],
			additionalDirectories: [['/tmp/a', '/tmp/b'], undefined],
			boolean: [true, false, undefined],
			webSearchMode: ['disabled', 'cached', undefined],
			reasoningEffort: ['minimal', 'medium', undefined],
		});
	});

	test('filters Codex models to supported OpenAI model ids', () => {
		assert.deepStrictEqual([
			isCodexSupportedModel('auto', 'Codex Auto'),
			isCodexSupportedModel('claude-sonnet-4.5', 'Claude Sonnet 4.5'),
			isCodexSupportedModel('gpt-5.2', 'GPT-5.2'),
			isCodexSupportedModel('gpt-5.1-codex-max', 'GPT-5.1 Codex Max'),
			isCodexSupportedModel('codex-mini-latest', 'Codex Mini'),
		], [false, false, true, true, true]);
	});

	test('normalizes provider-prefixed Codex model ids', () => {
		assert.deepStrictEqual({
			raw: normalizeCodexModelId('gpt-5.2'),
			prefixed: normalizeCodexModelId('copilot/gpt-5.2'),
			unsupportedRaw: normalizeCodexModelId('claude-sonnet-4.5'),
			unsupportedPrefixed: normalizeCodexModelId('copilot/auto'),
		}, {
			raw: 'gpt-5.2',
			prefixed: 'gpt-5.2',
			unsupportedRaw: undefined,
			unsupportedPrefixed: undefined,
		});
	});

	test('resolveSessionConfig scopes Codex-specific config properties', async () => {
		const agent = createAgent(disposables);

		const readOnly = await agent.resolveSessionConfig({ config: { [CodexSessionConfigKey.SandboxMode]: 'read-only' } });
		const workspaceWrite = await agent.resolveSessionConfig({ config: { [CodexSessionConfigKey.SandboxMode]: 'workspace-write' } });

		assert.deepStrictEqual({
			readOnlyProperties: Object.keys(readOnly.schema.properties).filter(key => key.startsWith('codex.')).sort(),
			readOnlyValues: readOnly.values,
			workspaceWriteProperties: Object.keys(workspaceWrite.schema.properties).filter(key => key.startsWith('codex.')).sort(),
			workspaceWriteValues: {
				additionalDirectories: workspaceWrite.values[CodexSessionConfigKey.AdditionalDirectories],
				networkAccessEnabled: workspaceWrite.values[CodexSessionConfigKey.NetworkAccessEnabled],
			},
		}, {
			readOnlyProperties: [
				CodexSessionConfigKey.ApprovalPolicy,
				CodexSessionConfigKey.SandboxMode,
				CodexSessionConfigKey.WebSearchMode,
			].sort(),
			readOnlyValues: {
				[CodexSessionConfigKey.ApprovalPolicy]: 'on-request',
				[CodexSessionConfigKey.SandboxMode]: 'read-only',
				[CodexSessionConfigKey.WebSearchMode]: 'disabled',
			},
			workspaceWriteProperties: [
				CodexSessionConfigKey.ApprovalPolicy,
				CodexSessionConfigKey.NetworkAccessEnabled,
				CodexSessionConfigKey.SandboxMode,
				CodexSessionConfigKey.WebSearchMode,
			].sort(),
			workspaceWriteValues: {
				additionalDirectories: undefined,
				networkAccessEnabled: false,
			},
		});
	});
});
