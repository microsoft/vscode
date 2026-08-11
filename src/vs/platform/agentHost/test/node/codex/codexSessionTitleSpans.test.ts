/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import type { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { INativeEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IAgentHostCheckpointService, NULL_CHECKPOINT_SERVICE } from '../../../common/agentHostCheckpointService.js';
import { AgentSession } from '../../../common/agent.js';
import { IAgentHostOTelService } from '../../../common/otel/agentHostOTelService.js';
import { ISessionDataService } from '../../../common/sessionDataService.js';
import { ActionType } from '../../../common/state/sessionActions.js';
import { SessionStatus } from '../../../common/state/sessionState.js';
import { IAgentConfigurationService } from '../../../node/agentConfigurationService.js';
import { AgentHostSessionTitleSignal, IAgentHostSessionTitleSignal } from '../../../node/agentHostSessionTitleSignal.js';
import { AgentHostStateManager } from '../../../node/agentHostStateManager.js';
import { IAgentSdkDownloader } from '../../../node/agentSdkDownloader.js';
import { CodexAgent } from '../../../node/codex/codexAgent.js';
import { ICodexProxyService } from '../../../node/codex/codexProxyService.js';
import { ICopilotApiService } from '../../../node/shared/copilotApiService.js';

/**
 * Records `emitSessionTitleChanged` invocations so the OTel title-span wiring
 * test can assert what the agent forwarded to the host telemetry pipeline. All
 * other {@link IAgentHostOTelService} members are inert no-ops.
 */
class RecordingOTelService implements IAgentHostOTelService {
	readonly _serviceBrand: undefined;
	readonly titleChanges: Array<{ conversationId: string; sessionUri: string; title: string }> = [];
	async getSdkTelemetryConfig(): Promise<undefined> { return undefined; }
	async getNativeSdkTelemetryConfig(): Promise<undefined> { return undefined; }
	getSessionTraceContext(): undefined { return undefined; }
	releaseSessionTraceContext(): void { }
	withTraceContext<T>(_context: undefined, fn: () => T): T { return fn(); }
	getCurrentTraceContext(): undefined { return undefined; }
	getSpansDbPath(): undefined { return undefined; }
	emitSessionTitleChanged(conversationId: string, sessionUri: string, title: string): void {
		this.titleChanges.push({ conversationId, sessionUri, title });
	}
	async flush(): Promise<void> { }
}

/**
 * Builds a Codex agent whose only host input is the narrow session-title seam,
 * driven end to end from a real {@link AgentHostStateManager}: the agent itself
 * never sees the state manager, so a passing test proves the telemetry survives
 * on the seam alone.
 */
function createTestContext(disposables: Pick<DisposableStore, 'add'>): { stateManager: AgentHostStateManager; otelService: RecordingOTelService } {
	const instantiationService = new TestInstantiationService();
	const logService = new NullLogService();
	const stateManager = disposables.add(new AgentHostStateManager(logService));
	const otelService = new RecordingOTelService();
	instantiationService.stub(ISessionDataService, { _serviceBrand: undefined });
	instantiationService.stub(ICopilotApiService, { _serviceBrand: undefined });
	instantiationService.stub(ICodexProxyService, { _serviceBrand: undefined });
	instantiationService.stub(IAgentConfigurationService, {
		_serviceBrand: undefined,
		onDidRootConfigChange: Event.None,
		getRootValue: () => undefined,
	});
	instantiationService.stub(IAgentSdkDownloader, { _serviceBrand: undefined });
	instantiationService.stub(IAgentHostCheckpointService, NULL_CHECKPOINT_SERVICE);
	instantiationService.stub(IAgentHostOTelService, otelService);
	instantiationService.stub(IAgentHostSessionTitleSignal, disposables.add(new AgentHostSessionTitleSignal(stateManager)));
	instantiationService.stub(IProductService, { _serviceBrand: undefined, version: '1.0.0-test' } as IProductService);
	instantiationService.stub(INativeEnvironmentService, { userHome: URI.file('/tmp') });
	instantiationService.stub(ILogService, logService);
	disposables.add(instantiationService.createInstance(CodexAgent));
	return { stateManager, otelService };
}

suite('CodexAgent — host OTel session-title spans', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('emits a host OTel session-title span when this agent\'s session title changes', () => {
		const { stateManager, otelService } = createTestContext(disposables);
		const sessionUri = AgentSession.uri('codex', 'wire-title');
		stateManager.createSession({
			resource: sessionUri.toString(),
			provider: 'codex',
			title: 'Initial',
			status: SessionStatus.Idle,
			createdAt: new Date().toISOString(),
			modifiedAt: new Date().toISOString(),
		});

		stateManager.dispatchServerAction(sessionUri.toString(), { type: ActionType.SessionTitleChanged, title: 'Renamed' });

		assert.deepStrictEqual(otelService.titleChanges, [{ conversationId: 'wire-title', sessionUri: sessionUri.toString(), title: 'Renamed' }]);
	});

	test('ignores session-title changes belonging to another provider', () => {
		const { stateManager, otelService } = createTestContext(disposables);
		const foreignUri = AgentSession.uri('claude', 'foreign-title');
		stateManager.createSession({
			resource: foreignUri.toString(),
			provider: 'claude',
			title: 'Initial',
			status: SessionStatus.Idle,
			createdAt: new Date().toISOString(),
			modifiedAt: new Date().toISOString(),
		});

		stateManager.dispatchServerAction(foreignUri.toString(), { type: ActionType.SessionTitleChanged, title: 'Renamed' });

		assert.deepStrictEqual(otelService.titleChanges, []);
	});
});
