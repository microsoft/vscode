/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../nls.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../configuration/common/configurationRegistry.js';
import product from '../../product/common/product.js';
import { Registry } from '../../registry/common/platform.js';
import {
	AgentHostClaudeAgentSdkPathSettingId,
	AgentHostOTelCaptureContentSettingId,
	AgentHostOTelDbSpanExporterEnabledSettingId,
	AgentHostOTelEnabledSettingId,
	AgentHostOTelExporterTypeSettingId,
	AgentHostOTelOtlpEndpointSettingId,
	AgentHostOTelOutfileSettingId,
	AgentHostRubberDuckEnabledSettingId,
} from './agentService.js';

// Settings consumed by the agent host starter (`electronAgentHostStarter.ts`
// and `nodeAgentHostStarter.ts`) to populate the spawned agent host process's
// environment. The starter exists in both the desktop main process and the
// remote server process, so this registration has to be visible to both —
// each starter file side-effect-imports this contribution, which causes the
// registration to run as soon as the starter module is loaded. The renderer
// also imports this so the same defaults show up in the settings UI.
//
// Side-effect imports of this file:
//   - `src/vs/platform/agentHost/electron-main/electronAgentHostStarter.ts`
//     (main process, loaded transitively from `app.ts`).
//   - `src/vs/platform/agentHost/node/nodeAgentHostStarter.ts`
//     (remote server, loaded transitively from `serverServices.ts`).
//   - `src/vs/workbench/contrib/chat/browser/chat.shared.contribution.ts`
//     (renderer registration for the settings UI).

const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
configurationRegistry.registerConfiguration({
	id: 'chatAgentHostStarter',
	title: nls.localize('chatAgentHostStarterConfigurationTitle', "Chat Agent Host Starter"),
	type: 'object',
	properties: {
		[AgentHostRubberDuckEnabledSettingId]: {
			type: 'boolean',
			description: nls.localize('chat.agentHost.rubberDuck.enabled', "When enabled, the coding agent uses a rubber duck critic subagent to review code changes using a complementary model. Requires `#chat.agentHost.enabled#`."),
			default: false,
			tags: ['experimental', 'advanced'],
			included: product.quality !== 'stable',
		},
		[AgentHostClaudeAgentSdkPathSettingId]: {
			type: 'string',
			description: nls.localize('chat.agentHost.claudeAgent.path', "Experimental, for local testing only. Absolute path to a locally-installed `@anthropic-ai/claude-agent-sdk` package. When set, the Claude agent provider is registered inside the agent host and the SDK is loaded from this path. Requires `#chat.agentHost.enabled#`. The agent host process must be restarted for changes to take effect. This setting will be removed once the SDK is delivered through the Extension Marketplace."),
			default: '',
			tags: ['experimental', 'advanced'],
			included: product.quality !== 'stable',
		},
		[AgentHostOTelEnabledSettingId]: {
			type: 'boolean',
			markdownDescription: nls.localize('chat.agentHost.otel.enabled', "When enabled, the agent host emits OpenTelemetry traces from the Copilot SDK. Requires `#chat.agentHost.enabled#`. Either configure `#chat.agentHost.otel.otlpEndpoint#` to ship traces to an external collector or enable `#chat.agentHost.otel.dbSpanExporter.enabled#` to capture them locally."),
			default: false,
			tags: ['experimental', 'advanced'],
		},
		[AgentHostOTelExporterTypeSettingId]: {
			type: 'string',
			enum: ['otlp-http', 'otlp-grpc', 'console', 'file'],
			markdownDescription: nls.localize('chat.agentHost.otel.exporterType', "Exporter backend used by the Copilot SDK when `#chat.agentHost.otel.enabled#` is on. `otlp-grpc` is downgraded to `otlp-http` transparently in the CLI runtime."),
			default: 'otlp-http',
			tags: ['experimental', 'advanced'],
		},
		[AgentHostOTelOtlpEndpointSettingId]: {
			type: 'string',
			markdownDescription: nls.localize('chat.agentHost.otel.otlpEndpoint', "OTLP endpoint URL when exporter type is `otlp-http` or `otlp-grpc`. Sets `OTEL_EXPORTER_OTLP_ENDPOINT` inside the agent host process."),
			default: '',
			tags: ['experimental', 'advanced'],
		},
		[AgentHostOTelCaptureContentSettingId]: {
			type: 'boolean',
			markdownDescription: nls.localize('chat.agentHost.otel.captureContent', "When enabled, includes prompt and response content in OTel span attributes. Sets `OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT`. Privacy-sensitive: do not enable in environments that ship spans to shared sinks."),
			default: false,
			tags: ['experimental', 'advanced'],
		},
		[AgentHostOTelOutfileSettingId]: {
			type: 'string',
			markdownDescription: nls.localize('chat.agentHost.otel.outfile', "Output path for span JSON lines when exporter type is `file`. Sets `COPILOT_OTEL_FILE_EXPORTER_PATH`."),
			default: '',
			tags: ['experimental', 'advanced'],
		},
		[AgentHostOTelDbSpanExporterEnabledSettingId]: {
			type: 'boolean',
			markdownDescription: nls.localize('chat.agentHost.otel.dbSpanExporter.enabled', "When enabled, the agent host persists every emitted OTel span to a local SQLite database. Spans can be inspected via the `Export Agent Host Traces Database` command. Compatible with external exporters: spans are written to SQLite *and* forwarded to the user-configured sink."),
			default: false,
			tags: ['experimental', 'advanced'],
		},
	}
});
