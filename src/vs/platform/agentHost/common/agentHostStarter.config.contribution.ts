/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../nls.js';
import { IPolicyData } from '../../../base/common/defaultAccount.js';
import { PolicyCategory } from '../../../base/common/policy.js';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../configuration/common/configurationRegistry.js';
import { COPILOT_OTEL_CAPTURE_CONTENT_KEY, COPILOT_OTEL_DB_SPAN_EXPORTER_ENABLED_KEY, COPILOT_OTEL_ENABLED_KEY, COPILOT_OTEL_ENDPOINT_KEY, COPILOT_OTEL_LOCK_CAPTURE_CONTENT_KEY, COPILOT_OTEL_PROTOCOL_KEY, managedSettingValue } from '../../policy/common/copilotManagedSettings.js';
import product from '../../product/common/product.js';
import { Registry } from '../../registry/common/platform.js';
import {
	AgentHostClaudeAgentEnabledSettingId,
	AgentHostCodexAgentBinaryArgsSettingId,
	AgentHostCodexAgentEnabledSettingId,
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

function managedOTelProtocolValue(policyData: IPolicyData): string | undefined {
	const protocol = policyData.managedSettings?.[COPILOT_OTEL_PROTOCOL_KEY];
	if (protocol === 'grpc') {
		return 'otlp-grpc';
	}
	if (protocol === 'http/protobuf' || protocol === 'http/json') {
		return 'otlp-http';
	}
	return undefined;
}

function managedOTelCaptureContentValue(policyData: IPolicyData): boolean | undefined {
	const captureContent = policyData.managedSettings?.[COPILOT_OTEL_CAPTURE_CONTENT_KEY];
	if (typeof captureContent === 'boolean') {
		return captureContent;
	}
	return policyData.managedSettings?.[COPILOT_OTEL_LOCK_CAPTURE_CONTENT_KEY] === true ? false : undefined;
}

function managedOTelOutfileValue(policyData: IPolicyData): string | undefined {
	const managedSettings = policyData.managedSettings;
	if (managedSettings?.[COPILOT_OTEL_ENDPOINT_KEY] !== undefined || managedSettings?.[COPILOT_OTEL_PROTOCOL_KEY] !== undefined) {
		return '';
	}
	return undefined;
}

configurationRegistry.registerConfiguration({
	id: 'chatAgentHostStarter',
	title: nls.localize('chatAgentHostStarterConfigurationTitle', "Chat Agent Host Starter"),
	type: 'object',
	properties: {
		[AgentHostClaudeAgentEnabledSettingId]: {
			type: 'boolean',
			description: nls.localize('chat.agentHost.claudeAgent.enabled', "When enabled, the agent host registers the Claude provider (subject to the Claude SDK being reachable). Independent of `#chat.agents.claude.preferAgentHost#` and `#chat.editor.claude.preferAgentHost#`, which choose which integration surfaces Claude. Requires `#chat.agentHost.enabled#`. The agent host process must be restarted for changes to take effect."),
			default: true,
			tags: ['experimental', 'advanced'],
			// References the `Claude3PIntegration` policy (owned by `github.copilot.chat.claudeAgent.enabled`) so disabling Claude applies across surfaces.
			policyReference: {
				name: 'Claude3PIntegration',
			},
		},
		[AgentHostCodexAgentEnabledSettingId]: {
			type: 'boolean',
			description: nls.localize('chat.agentHost.codexAgent.enabled', "When enabled, the agent host registers the Codex provider (subject to the Codex SDK being reachable). Requires `#chat.agentHost.enabled#`. The agent host process must be restarted for changes to take effect."),
			default: false,
			tags: ['experimental', 'advanced'],
			// Owns the `Codex3PIntegration` policy; gating here disables Codex across all agent-host surfaces.
			policy: {
				name: 'Codex3PIntegration',
				category: PolicyCategory.InteractiveSession,
				minimumVersion: '1.126',
				value: (policyData) => policyData.chat_preview_features_enabled === false ? false : undefined,
				localization: {
					description: {
						key: 'chat.agentHost.codexAgent.enabled.policy',
						value: nls.localize('chat.agentHost.codexAgent.enabled.policy', "Enable Codex Agent sessions in VS Code. Start and resume agentic coding sessions powered by OpenAI Codex SDK. Uses your existing Copilot subscription."),
					}
				}
			},
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
			markdownDescription: nls.localize('chat.agentHost.otel.enabled', "When enabled, the agent host emits OpenTelemetry traces from the Copilot SDK. Configurable in user settings only. Requires `#chat.agentHost.enabled#`. Either configure `#chat.agentHost.otel.otlpEndpoint#` to ship traces to an external collector or enable `#chat.agentHost.otel.dbSpanExporter.enabled#` to capture them locally."),
			default: false,
			scope: ConfigurationScope.APPLICATION,
			tags: ['experimental', 'advanced'],
			policy: {
				name: 'CopilotOtelEnabled',
				category: PolicyCategory.InteractiveSession,
				minimumVersion: '1.127',
				value: managedSettingValue(COPILOT_OTEL_ENABLED_KEY),
				managedSettings: {
					[COPILOT_OTEL_ENABLED_KEY]: { type: 'boolean' },
				},
				localization: {
					description: {
						key: 'chat.agentHost.otel.enabled.policy',
						value: nls.localize('chat.agentHost.otel.enabled.policy', "Controls whether Copilot OpenTelemetry export is enabled. When managed, users cannot override the enterprise value."),
					}
				},
			},
		},
		[AgentHostOTelExporterTypeSettingId]: {
			type: 'string',
			enum: ['otlp-http', 'otlp-grpc', 'console', 'file'],
			markdownDescription: nls.localize('chat.agentHost.otel.exporterType', "Exporter backend used by the Copilot SDK when `#chat.agentHost.otel.enabled#` is on. Configurable in user settings only. `otlp-grpc` is downgraded to `otlp-http` transparently in the CLI runtime."),
			default: 'otlp-http',
			scope: ConfigurationScope.APPLICATION,
			tags: ['experimental', 'advanced'],
			policy: {
				name: 'CopilotOtelProtocol',
				category: PolicyCategory.InteractiveSession,
				minimumVersion: '1.127',
				value: managedOTelProtocolValue,
				managedSettings: {
					[COPILOT_OTEL_PROTOCOL_KEY]: { type: 'string' },
				},
				localization: {
					description: {
						key: 'chat.agentHost.otel.protocol.policy',
						value: nls.localize('chat.agentHost.otel.protocol.policy', "Controls the enterprise-managed OTLP protocol for Copilot OpenTelemetry export."),
					},
					enumDescriptions: [
						{ key: 'chat.agentHost.otel.protocol.policy.otlpHttp', value: nls.localize('chat.agentHost.otel.protocol.policy.otlpHttp', "Use OTLP over HTTP."), },
						{ key: 'chat.agentHost.otel.protocol.policy.otlpGrpc', value: nls.localize('chat.agentHost.otel.protocol.policy.otlpGrpc', "Use OTLP over gRPC."), },
						{ key: 'chat.agentHost.otel.protocol.policy.console', value: nls.localize('chat.agentHost.otel.protocol.policy.console', "Console exporter is not selected by enterprise managed settings."), },
						{ key: 'chat.agentHost.otel.protocol.policy.file', value: nls.localize('chat.agentHost.otel.protocol.policy.file', "File exporter is not selected by enterprise managed settings."), },
					],
				},
			},
		},
		[AgentHostOTelOtlpEndpointSettingId]: {
			type: 'string',
			markdownDescription: nls.localize('chat.agentHost.otel.otlpEndpoint', "OTLP endpoint URL when exporter type is `otlp-http` or `otlp-grpc`. Configurable in user settings only. Sets `OTEL_EXPORTER_OTLP_ENDPOINT` inside the agent host process."),
			default: '',
			scope: ConfigurationScope.APPLICATION,
			tags: ['experimental', 'advanced'],
			policy: {
				name: 'CopilotOtelEndpoint',
				category: PolicyCategory.InteractiveSession,
				minimumVersion: '1.127',
				value: managedSettingValue(COPILOT_OTEL_ENDPOINT_KEY),
				managedSettings: {
					[COPILOT_OTEL_ENDPOINT_KEY]: { type: 'string' },
				},
				localization: {
					description: {
						key: 'chat.agentHost.otel.otlpEndpoint.policy',
						value: nls.localize('chat.agentHost.otel.otlpEndpoint.policy', "Controls the enterprise-managed OTLP collector endpoint for Copilot OpenTelemetry export."),
					}
				},
			},
		},
		[AgentHostOTelCaptureContentSettingId]: {
			type: 'boolean',
			markdownDescription: nls.localize('chat.agentHost.otel.captureContent', "When enabled, includes prompt and response content in OTel span attributes. Configurable in user settings only. Sets `OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT`. Privacy-sensitive: do not enable in environments that ship spans to shared sinks."),
			default: false,
			scope: ConfigurationScope.APPLICATION,
			tags: ['experimental', 'advanced'],
			policy: {
				name: 'CopilotOtelCaptureContent',
				category: PolicyCategory.InteractiveSession,
				minimumVersion: '1.127',
				value: managedOTelCaptureContentValue,
				managedSettings: {
					[COPILOT_OTEL_CAPTURE_CONTENT_KEY]: { type: 'boolean' },
					[COPILOT_OTEL_LOCK_CAPTURE_CONTENT_KEY]: { type: 'boolean' },
				},
				localization: {
					description: {
						key: 'chat.agentHost.otel.captureContent.policy',
						value: nls.localize('chat.agentHost.otel.captureContent.policy', "Controls whether Copilot OpenTelemetry export captures prompt, response, and tool content."),
					}
				},
			},
		},
		[AgentHostOTelOutfileSettingId]: {
			type: 'string',
			markdownDescription: nls.localize('chat.agentHost.otel.outfile', "Output path for span JSON lines when exporter type is `file`. Configurable in user settings only. Sets `COPILOT_OTEL_FILE_EXPORTER_PATH`."),
			default: '',
			scope: ConfigurationScope.APPLICATION,
			tags: ['experimental', 'advanced'],
			policy: {
				name: 'CopilotOtelOutfile',
				category: PolicyCategory.InteractiveSession,
				minimumVersion: '1.127',
				value: managedOTelOutfileValue,
				managedSettings: {
					[COPILOT_OTEL_ENDPOINT_KEY]: { type: 'string' },
					[COPILOT_OTEL_PROTOCOL_KEY]: { type: 'string' },
				},
				localization: {
					description: {
						key: 'chat.agentHost.otel.outfile.policy',
						value: nls.localize('chat.agentHost.otel.outfile.policy', "Prevents local file export when enterprise-managed Copilot OpenTelemetry export is configured."),
					}
				},
			},
		},
		[AgentHostOTelDbSpanExporterEnabledSettingId]: {
			type: 'boolean',
			markdownDescription: nls.localize('chat.agentHost.otel.dbSpanExporter.enabled', "When enabled, the agent host persists every emitted OTel span to a local SQLite database. Configurable in user settings only. Spans can be inspected via the `Export Agent Host Traces Database` command. Compatible with external exporters: spans are written to SQLite *and* forwarded to the user-configured sink."),
			default: false,
			scope: ConfigurationScope.APPLICATION,
			tags: ['experimental', 'advanced'],
			policy: {
				name: 'CopilotOtelDbSpanExporter',
				category: PolicyCategory.InteractiveSession,
				minimumVersion: '1.127',
				value: managedSettingValue(COPILOT_OTEL_DB_SPAN_EXPORTER_ENABLED_KEY),
				managedSettings: {
					[COPILOT_OTEL_DB_SPAN_EXPORTER_ENABLED_KEY]: { type: 'boolean' },
				},
				localization: {
					description: {
						key: 'chat.agentHost.otel.dbSpanExporter.enabled.policy',
						value: nls.localize('chat.agentHost.otel.dbSpanExporter.enabled.policy', "Controls whether Copilot OpenTelemetry spans are persisted to a local SQLite database."),
					}
				},
			},
		},
	}
});
