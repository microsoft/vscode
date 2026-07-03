/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CodexSessionConfigKey, collaborationModeKind, narrowAdditionalDirectories, narrowApprovalPolicy, narrowBoolean, narrowPersonality, narrowReasoningEffort, narrowReasoningSummary, narrowSandboxMode, narrowWebSearchMode } from '../../../node/codex/codexSessionConfigKeys.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { ISessionDataService } from '../../../common/sessionDataService.js';
import { CodexAgent } from '../../../node/codex/codexAgent.js';
import { ICodexProxyService } from '../../../node/codex/codexProxyService.js';
import { IAgentConfigurationService } from '../../../node/agentConfigurationService.js';
import { IAgentSdkDownloader } from '../../../node/agentSdkDownloader.js';
import { ICopilotApiService } from '../../../node/shared/copilotApiService.js';
import { SessionConfigKey } from '../../../common/sessionConfigKeys.js';

function createAgent(disposables: Pick<DisposableStore, 'add'>): CodexAgent {
	const instantiationService = new TestInstantiationService();
	instantiationService.stub(ISessionDataService, { _serviceBrand: undefined });
	instantiationService.stub(ICopilotApiService, { _serviceBrand: undefined });
	instantiationService.stub(ICodexProxyService, { _serviceBrand: undefined });
	instantiationService.stub(IAgentConfigurationService, { _serviceBrand: undefined });
	instantiationService.stub(IAgentSdkDownloader, { _serviceBrand: undefined });
	instantiationService.stub(IProductService, { _serviceBrand: undefined, version: '1.0.0-test' } as IProductService);
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
			personality: [narrowPersonality('friendly'), narrowPersonality('pragmatic'), narrowPersonality('grumpy')],
			reasoningSummary: [narrowReasoningSummary('auto'), narrowReasoningSummary('detailed'), narrowReasoningSummary('verbose')],
			collaborationMode: [collaborationModeKind('plan'), collaborationModeKind('interactive'), collaborationModeKind(undefined)],
		}, {
			approvalPolicy: ['never', 'on-request', undefined],
			sandboxMode: ['read-only', 'workspace-write', undefined],
			additionalDirectories: [['/tmp/a', '/tmp/b'], undefined],
			boolean: [true, false, undefined],
			webSearchMode: ['disabled', 'cached', undefined],
			reasoningEffort: ['minimal', 'medium', undefined],
			personality: ['friendly', 'pragmatic', undefined],
			reasoningSummary: ['auto', 'detailed', undefined],
			collaborationMode: ['plan', 'default', 'default'],
		});
	});

	test('resolveSessionConfig scopes Codex-specific config properties', async () => {
		const agent = createAgent(disposables);

		const readOnly = await agent.resolveSessionConfig({ config: { [CodexSessionConfigKey.SandboxMode]: 'read-only' } });
		const workspaceWrite = await agent.resolveSessionConfig({ config: { [CodexSessionConfigKey.SandboxMode]: 'workspace-write' } });

		assert.deepStrictEqual({
			readOnlyProperties: Object.keys(readOnly.schema.properties).filter(key => key.startsWith('codex.')).sort(),
			readOnlyMode: readOnly.values[SessionConfigKey.Mode],
			readOnlyValues: {
				[CodexSessionConfigKey.ApprovalPolicy]: readOnly.values[CodexSessionConfigKey.ApprovalPolicy],
				[CodexSessionConfigKey.SandboxMode]: readOnly.values[CodexSessionConfigKey.SandboxMode],
				[CodexSessionConfigKey.WebSearchMode]: readOnly.values[CodexSessionConfigKey.WebSearchMode],
				[CodexSessionConfigKey.Personality]: readOnly.values[CodexSessionConfigKey.Personality],
				[CodexSessionConfigKey.ReasoningSummary]: readOnly.values[CodexSessionConfigKey.ReasoningSummary],
			},
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
				CodexSessionConfigKey.Personality,
				CodexSessionConfigKey.ReasoningSummary,
			].sort(),
			readOnlyMode: 'interactive',
			readOnlyValues: {
				[CodexSessionConfigKey.ApprovalPolicy]: 'on-request',
				[CodexSessionConfigKey.SandboxMode]: 'read-only',
				[CodexSessionConfigKey.WebSearchMode]: 'disabled',
				[CodexSessionConfigKey.Personality]: 'none',
				[CodexSessionConfigKey.ReasoningSummary]: 'auto',
			},
			workspaceWriteProperties: [
				CodexSessionConfigKey.ApprovalPolicy,
				CodexSessionConfigKey.NetworkAccessEnabled,
				CodexSessionConfigKey.SandboxMode,
				CodexSessionConfigKey.WebSearchMode,
				CodexSessionConfigKey.Personality,
				CodexSessionConfigKey.ReasoningSummary,
			].sort(),
			workspaceWriteValues: {
				additionalDirectories: undefined,
				networkAccessEnabled: false,
			},
		});
	});
});
