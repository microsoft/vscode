/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../nls.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../configuration/common/configurationRegistry.js';
import product from '../../product/common/product.js';
import { Registry } from '../../registry/common/platform.js';
import {
	AgentHostClaudeAgentSdkRootSettingId,
	AgentHostCodexAgentBinaryArgsSettingId,
	AgentHostCodexAgentSdkRootSettingId,
	AgentHostCodexAgentCodexHomeSettingId,
	AgentHostOTelCaptureContentSettingId,
	AgentHostOTelDbSpanExporterEnabledSettingId,
	AgentHostOTelEnabledSettingId,
	AgentHostOTelExporterTypeSettingId,
	AgentHostOTelOtlpEndpointSettingId,
	AgentHostOTelOutfileSettingId,
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
		[AgentHostClaudeAgentSdkRootSettingId]: {
			type: 'string',
			description: nls.localize('chat.agentHost.claudeAgent.sdkRoot', "Experimental, for local SDK development only. Absolute path to a directory containing `node_modules/@anthropic-ai/claude-agent-sdk`. When set, the agent host loads Claude from this tree instead of downloading the SDK. Empty (the default) falls through to the SDK distribution shipped with this build. Requires `#chat.agentHost.enabled#`. The agent host process must be restarted for changes to take effect."),
			default: '',
			tags: ['experimental', 'advanced'],
			included: product.quality !== 'stable',
		},
		[AgentHostCodexAgentSdkRootSettingId]: {
			type: 'string',
			description: nls.localize('chat.agentHost.codexAgent.sdkRoot', "Experimental, for local SDK development only. Absolute path to a directory containing `node_modules/@openai/codex`. When set, the agent host spawns the Codex binary from this tree instead of downloading the SDK. Empty (the default) falls through to the SDK distribution shipped with this build. Requires `#chat.agentHost.enabled#`. The agent host process must be restarted for changes to take effect."),
			default: '',
			tags: ['experimental', 'advanced'],
			included: product.quality !== 'stable',
		},
		[AgentHostCodexAgentCodexHomeSettingId]: {
			type: 'string',
			description: nls.localize('chat.agentHost.codexAgent.codexHome', "Optional override for `$CODEX_HOME`. Controls where the codex binary reads config and writes rollouts. When empty, codex uses its default (`~/.codex`)."),
			default: '',
			tags: ['experimental', 'advanced'],
			included: product.quality !== 'stable',
		},
		[AgentHostCodexAgentBinaryArgsSettingId]: {
			type: 'array',
			items: { type: 'string' },
			description: nls.localize('chat.agentHost.codexAgent.binaryArgs', "Additional command-line arguments passed to `codex app-server`. Primarily useful for debugging (for example, `--log-level=debug`)."),
			default: [],
			tags: ['experimental', 'advanced'],
			included: product.quality !== 'stable',
		},
		[AgentHostOTelEnabledSettingId]: {
			type: 'boolean',
			markdownDescription: nls.localize('chat.agentHost.otel.enabled', "When enabled, the agent host emits OpenTelemetry traces from the Copilot SDK. Requires `#chat.agentHost.enabled#`. Either configure `#chat.agentHost.otel.otlpEndpoint#` to ship traces to an external collector or enable `#chat.agentHost.otel.dbSpanExporter.enabled#` to capture them locally."),
			default: false,
			restricted: true,
			tags: ['experimental', 'advanced'],
		},
		[AgentHostOTelExporterTypeSettingId]: {
			type: 'string',
			enum: ['otlp-http', 'otlp-grpc', 'console', 'file'],
			markdownDescription: nls.localize('chat.agentHost.otel.exporterType', "Exporter backend used by the Copilot SDK when `#chat.agentHost.otel.enabled#` is on. `otlp-grpc` is downgraded to `otlp-http` transparently in the CLI runtime."),
			default: 'otlp-http',
			restricted: true,
			tags: ['experimental', 'advanced'],
		},
		[AgentHostOTelOtlpEndpointSettingId]: {
			type: 'string',
			markdownDescription: nls.localize('chat.agentHost.otel.otlpEndpoint', "OTLP endpoint URL when exporter type is `otlp-http` or `otlp-grpc`. Sets `OTEL_EXPORTER_OTLP_ENDPOINT` inside the agent host process."),
			default: '',
			restricted: true,
			tags: ['experimental', 'advanced'],
		},
		[AgentHostOTelCaptureContentSettingId]: {
			type: 'boolean',
			markdownDescription: nls.localize('chat.agentHost.otel.captureContent', "When enabled, includes prompt and response content in OTel span attributes. Sets `OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT`. Privacy-sensitive: do not enable in environments that ship spans to shared sinks."),
			default: false,
			restricted: true,
			tags: ['experimental', 'advanced'],
		},
		[AgentHostOTelOutfileSettingId]: {
			type: 'string',
			markdownDescription: nls.localize('chat.agentHost.otel.outfile', "Output path for span JSON lines when exporter type is `file`. Sets `COPILOT_OTEL_FILE_EXPORTER_PATH`."),
			default: '',
			restricted: true,
			tags: ['experimental', 'advanced'],
		},
		[AgentHostOTelDbSpanExporterEnabledSettingId]: {
			type: 'boolean',
			markdownDescription: nls.localize('chat.agentHost.otel.dbSpanExporter.enabled', "When enabled, the agent host persists every emitted OTel span to a local SQLite database. Spans can be inspected via the `Export Agent Host Traces Database` command. Compatible with external exporters: spans are written to SQLite *and* forwarded to the user-configured sink."),
			default: false,
			restricted: true,
			tags: ['experimental', 'advanced'],
		},
	}
});
