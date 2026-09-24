/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Application, Logger } from '../../../../automation';
import { dumpFailureDiagnostics } from '../../utils';
import { setupAgentHostSuite, warmUpAgentHostModel } from '../agentsWindow/agentsWindow.test';
import { managedSettingsEnv, managedSettingsFixture } from './managedSettings';
import { startOtlpCollector } from './otlpCollector';

export function setup(logger: Logger): void {
	for (const endpointPath of ['', '/v1/traces']) {
		describe(`Policy Plumbing (Agent Host managed OTel, ${endpointPath || 'base endpoint'})`, function () {
			this.timeout(5 * 60 * 1000);
			this.retries(0);
			let policy: ReturnType<typeof managedSettingsFixture> | undefined;
			let collector: Awaited<ReturnType<typeof startOtlpCollector>> | undefined;
			const scenario = 'smoke-managed-otel';
			const reply = 'MANAGED_OTEL_TURN_COMPLETED';

			before(async () => {
				policy = managedSettingsFixture();
				const headerValue = `managed-smoke-${process.pid}-${Date.now()}`;
				collector = await startOtlpCollector(headerValue);
				policy.set({
					telemetry: {
						enabled: true,
						endpoint: `${collector.endpoint}${endpointPath}`,
						protocol: 'http/json',
						headers: { 'x-vscode-smoke-managed': headerValue },
						captureContent: false,
						lockCaptureContent: true,
					},
				});
			});

			setupAgentHostSuite(logger, {
				serverLabel: 'managed OTel',
				registerScenarios: ({ ScenarioBuilder, registerScenario }) => registerScenario(scenario, new ScenarioBuilder().emit(reply).build()),
				settings: {
					'chat.agentHost.otel.enabled': false,
					'chat.agentHost.otel.dbSpanExporter.enabled': false,
					'github.copilot.chat.otel.enabled': false,
				},
				extraEnv: managedSettingsEnv,
			});
			after(async () => {
				try {
					policy?.clear();
				} finally {
					await collector?.close();
				}
			});

			it('exports native traces with the managed header without local OTel opt-in', async function () {
				const app = this.app as Application;
				assert.ok(collector);
				try {
					await warmUpAgentHostModel(app, logger, 'Managed OTel');
					const turnStartedAfter = Date.now();
					await app.workbench.agentsWindow.submitNewSessionPrompt(`managed telemetry [scenario:${scenario}]`);
					await app.workbench.agentsWindow.waitForAssistantText(reply, 120_000);
					await collector.waitForNativeTurn(turnStartedAfter);
				} catch (error) {
					await dumpFailureDiagnostics(app, logger, 'Managed OTel');
					throw error;
				}
			});
		});
	}

}
