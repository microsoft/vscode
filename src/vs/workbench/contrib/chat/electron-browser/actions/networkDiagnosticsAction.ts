/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { appendEscapedMarkdownCodeBlockFence } from '../../../../../base/common/htmlContent.js';
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { localize2 } from '../../../../../nls.js';
import { IAgentConnection, IAgentHostDnsResult, IAgentHostNetworkEndpoint, IAgentHostNetworkFetchResult } from '../../../../../platform/agentHost/common/agentService.js';
import { IAgentHostConnectionsService } from '../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { Categories } from '../../../../../platform/action/common/actionCommonCategories.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { INativeHostService, IOSProxy, IOSProxyConfig } from '../../../../../platform/native/common/native.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';

export function registerNetworkDiagnosticsAction(): void {
	registerAction2(NetworkDiagnosticsAction);
}

async function collectNetworkDiagnostics(connectionsService: IAgentHostConnectionsService, nativeHostService: INativeHostService): Promise<string> {
	const connections = connectionsService.connections;
	const remoteCount = connections.filter(c => !c.isAmbient).length;

	let output = '# Agent Host Network Diagnostics\n\n';
	output += await formatLocalProxyConfig(nativeHostService);
	output += `- Connections: ${connections.length} (1 local, ${remoteCount} remote)\n\n`;
	output += 'Connectivity probes run inside each agent host process (local or remote), so results reflect the environment the Copilot SDK actually connects from.\n\n';

	for (const info of connections) {
		const heading = info.isAmbient ? 'Local agent host' : `Remote: ${info.name}`;
		output += `## ${heading}\n\n`;
		if (info.address) {
			output += `- address: ${info.address}\n`;
		}
		if (!info.connection) {
			output += '- Not connected.\n\n';
			continue;
		}
		try {
			output += await formatConnectionNetworkDiagnostics(info.connection, nativeHostService);
		} catch (err) {
			output += `- Failed to run network diagnostics: ${err instanceof Error ? err.message : String(err)}\n\n`;
		}
	}

	return output;
}

async function formatLocalProxyConfig(nativeHostService: INativeHostService): Promise<string> {
	let output = '## Local OS Proxy Configuration (@vscode/os-proxy-resolver)\n\n';
	try {
		const config = await nativeHostService.readProxyConfigWithPackage();
		output += `- Proxy environment: ${formatEnvironmentProxyConfig(config.environment)}\n`;
		output += `- Auto-detect: ${config.autoDetect}\n`;
		output += `- DHCP WPAD: ${formatPacSourceStatus(config.wpadDhcp)}\n`;
		output += `- DNS WPAD: ${formatPacSourceStatus(config.wpadDns)}\n`;
		output += `- Configured PAC: ${formatPacSourceStatus(config.configuredPac)}\n`;
		output += `- PAC: ${formatPacConfig(config)}\n`;
		if (config.pac) {
			output += `\n${appendEscapedMarkdownCodeBlockFence(config.pac.content, 'js')}\n\n`;
		}
		output += `- Static rules: ${formatStaticProxyRules(config.staticRules)}\n`;
		output += `- Platform settings: ${formatPlatformProxyConfig(config.platform)}\n\n`;
	} catch (err) {
		output += `- Error: ${err instanceof Error ? err.message : String(err)}\n\n`;
	}
	return output;
}

function formatEnvironmentProxyConfig(environment: IOSProxyConfig['environment']): string {
	const values = [environment.httpProxy, environment.httpsProxy, environment.allProxy, environment.noProxy];
	const configured = values.filter(value => value !== undefined);
	return configured.length
		? configured.map(value => `${value.variable}=${value.value}${value.error ? ` (error: ${value.error})` : ''}`).join(', ')
		: '(none)';
}

function formatPacSourceStatus(status: IOSProxyConfig['wpadDhcp']): string {
	const details = [status.url && `URL=${status.url}`, status.error && `error=${status.error}`].filter(value => !!value);
	return details.length ? `${status.state} (${details.join(', ')})` : status.state;
}

function formatPacConfig(config: IOSProxyConfig): string {
	const values: string[] = [];
	if (config.pacUrl) {
		values.push(`configured URL=${config.pacUrl}`);
	}
	if (config.pac) {
		values.push(`loaded URL=${config.pac.url}, source=${config.pac.source}, size=${config.pac.content.length} characters`);
	}
	return values.length ? values.join('; ') : '(none)';
}

function formatStaticProxyRules(rules: IOSProxyConfig['staticRules']): string {
	if (!rules) {
		return '(none)';
	}
	return [
		`HTTP=${rules.http ? formatProxy(rules.http) : '(none)'}`,
		`HTTPS=${rules.https ? formatProxy(rules.https) : '(none)'}`,
		`SOCKS=${rules.socks ? formatProxy(rules.socks) : '(none)'}`,
	].join(', ');
}

function formatPlatformProxyConfig(platform: IOSProxyConfig['platform']): string {
	if (!platform) {
		return '(none)';
	}
	switch (platform.kind) {
		case 'windows':
			return `Windows, proxy=${platform.proxy ?? '(none)'}, bypass=${platform.proxyBypass ?? '(none)'}`;
		case 'macos':
			return `macOS, exceptions=${formatValues(platform.exceptions)}, exclude simple hostnames=${platform.excludeSimpleHostnames}`;
		case 'linux':
			return `Linux, mode=${platform.mode ?? '(none)'}, ignored hosts=${formatValues(platform.ignoreHosts)}`;
		case 'unknown':
			return 'Unknown';
	}
}

function formatValues(values: readonly string[]): string {
	return values.length ? values.join(', ') : '(none)';
}

async function formatConnectionNetworkDiagnostics(connection: IAgentConnection, nativeHostService: INativeHostService): Promise<string> {
	const info = await connection.getNetworkDiagnosticsInfo();

	let output = '';
	output += `- Agent host version: ${info.version}\n`;
	output += `- OS: ${info.os} (${info.arch})\n`;
	output += `- Account: ${info.account ?? '(unknown)'}\n`;
	output += `- Proxy settings: ${formatKeyValues(info.proxySettings)}\n`;
	output += `- Proxy environment: ${formatKeyValues(info.proxyEnv)}\n\n`;

	const probes = await Promise.all(info.endpoints.map(async endpoint => ({
		endpoint,
		result: await connection.diagnosticsFetch(endpoint.url),
	})));
	for (const { endpoint, result } of probes) {
		output += await formatEndpointSection(endpoint, result, nativeHostService);
	}
	return output;
}

function formatKeyValues(values: Readonly<Record<string, string>>): string {
	const entries = Object.entries(values);
	return entries.length ? entries.map(([key, value]) => `${key}=${value}`).join(', ') : '(none)';
}

async function formatEndpointSection(endpoint: IAgentHostNetworkEndpoint, result: IAgentHostNetworkFetchResult, nativeHostService: INativeHostService): Promise<string> {
	let output = `### ${endpoint.name}\n\n`;
	output += `- URL: ${result.url}\n`;
	output += `- DNS IPv4: ${formatDnsResult(result.dnsIpv4)}\n`;
	output += `- DNS IPv6: ${formatDnsResult(result.dnsIpv6)}\n`;
	output += `- Proxy: ${result.proxyUrl ?? 'None'}\n`;
	try {
		const proxies = await nativeHostService.resolveProxyWithPackage(result.url);
		output += `- Local OS proxy (@vscode/os-proxy-resolver): ${formatProxies(proxies)}\n`;
	} catch (err) {
		output += `- Local OS proxy (@vscode/os-proxy-resolver): error: ${err instanceof Error ? err.message : String(err)}\n`;
	}
	output += `- Reachability: ${formatReachability(endpoint, result)}\n\n`;
	return output;
}

function formatProxies(proxies: readonly IOSProxy[]): string {
	return proxies.length ? proxies.map(formatProxy).join(', ') : '(none)';
}

function formatProxy(proxy: IOSProxy): string {
	return proxy.host ? `${proxy.kind} ${proxy.host}` : proxy.kind;
}

function formatDnsResult(dns: IAgentHostDnsResult | undefined): string {
	if (!dns) {
		return 'n/a';
	}
	return dns.address
		? `${dns.address} (${dns.durationMs} ms)`
		: `error (${dns.durationMs} ms): ${dns.error ?? 'unknown'}`;
}

function formatReachability(endpoint: IAgentHostNetworkEndpoint, result: IAgentHostNetworkFetchResult): string {
	// allow-any-unicode-next-line
	const PASS_MARK = '✓', FAIL_MARK = '✗';
	const duration = result.durationMs !== undefined ? ` (${result.durationMs} ms)` : '';
	if (result.error !== undefined) {
		return `${FAIL_MARK} ${result.error}${duration}`;
	}
	const connectVia = result.proxyUrl ? 'proxy' : 'direct';
	const expectedStatus = endpoint.expectedStatus ?? 200;
	const failures: string[] = [];
	if (result.statusCode !== expectedStatus) {
		failures.push(`status ${result.statusCode ?? '?'} (expected ${expectedStatus})`);
	}
	if (endpoint.expectedContent && !(result.body ?? '').includes(endpoint.expectedContent)) {
		failures.push(`missing "${endpoint.expectedContent}"`);
	}
	return failures.length
		? `${FAIL_MARK} ${failures.join(', ')} via ${connectVia}${duration}`
		: `${PASS_MARK} ${result.statusCode} via ${connectVia}${duration}`;
}

class NetworkDiagnosticsAction extends Action2 {
	static readonly ID = 'workbench.action.chat.agentHostNetworkDiagnostics';

	constructor() {
		super({
			id: NetworkDiagnosticsAction.ID,
			title: localize2('workbench.action.chat.agentHostNetworkDiagnostics.label', "Network Diagnostics"),
			icon: Codicon.plug,
			category: Categories.Developer,
			f1: true,
			precondition: ChatContextKeys.enabled
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const connectionsService = accessor.get(IAgentHostConnectionsService);
		const nativeHostService = accessor.get(INativeHostService);

		const contents = await collectNetworkDiagnostics(connectionsService, nativeHostService);
		await editorService.openEditor({
			resource: undefined,
			contents,
			languageId: 'markdown',
			options: {
				pinned: true
			}
		});
	}
}
