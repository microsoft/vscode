/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { fromNow } from '../../../../../base/common/date.js';
import { isUriComponents, URI } from '../../../../../base/common/uri.js';
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { localize2 } from '../../../../../nls.js';
import { Categories } from '../../../../../platform/action/common/actionCommonCategories.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IAgentSessionsService } from '../agentSessions/agentSessionsService.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { IChatService } from '../../common/chatService/chatService.js';
import { ILanguageModelsService } from '../../common/languageModels.js';
import { IChatWidgetService } from '../chat.js';
import { IStorageService, StorageScope } from '../../../../../platform/storage/common/storage.js';
import { AUTOPILOT_DONT_SHOW_AGAIN_KEY, AUTO_APPROVE_DONT_SHOW_AGAIN_KEY } from '../../common/chatPermissionStorageKeys.js';
import { resetShownWarnings } from '../../common/chatPermissionWarnings.js';
import { OpenCopilotCliStateFileAction } from './openCopilotCliStateFileAction.js';
import { IAgentConnection, IAgentHostDnsResult, IAgentHostNetworkEndpoint, IAgentHostNetworkFetchResult } from '../../../../../platform/agentHost/common/agentService.js';
import { IAgentHostConnectionsService } from '../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { StateComponents } from '../../../../../platform/agentHost/common/state/sessionState.js';

function uriReplacer(_key: string, value: unknown): unknown {
	if (URI.isUri(value)) {
		return value.toString();
	}

	if (isUriComponents(value)) {
		// This shouldn't be necessary but it seems that some URIs in ChatModels aren't properly revived
		return URI.from(value).toString();
	}

	return value;
}

export function registerChatDeveloperActions() {
	registerAction2(LogChatInputHistoryAction);
	registerAction2(LogChatIndexAction);
	registerAction2(InspectChatModelAction);
	registerAction2(InspectChatModelReferencesAction);
	registerAction2(InspectAgentHostSubscriptionsAction);
	registerAction2(NetworkDiagnosticsAction);
	registerAction2(ClearRecentlyUsedLanguageModelsAction);
	registerAction2(ResetChatPermissionWarningDialogsAction);
	registerAction2(OpenCopilotCliStateFileAction);
}

function formatChatModelReferenceInspection(accessor: ServicesAccessor): string {
	const chatService = accessor.get(IChatService);
	const agentSessionsService = accessor.get(IAgentSessionsService);
	const debugInfo = chatService.getChatModelReferenceDebugInfo();
	const referencedModels = debugInfo.models.filter(model => model.referenceCount > 0);
	const pendingEditModels = debugInfo.models.filter(model => model.hasPendingEdits);
	const pendingDisposalModels = debugInfo.models.filter(model => model.pendingDisposal);

	let output = '# Chat Model References\n\n';
	output += `- Live models: ${debugInfo.totalModels}\n`;
	output += `- Live references: ${debugInfo.totalReferences}\n`;
	output += `- Models with active references: ${referencedModels.length}\n`;
	output += `- Models with pending edits: ${pendingEditModels.length}\n`;
	output += `- Models pending disposal: ${pendingDisposalModels.length}\n\n`;
	output += 'Created by shows who loaded or created the model. Holders shows who currently keeps the model alive.\n\n';

	if (!debugInfo.models.length) {
		output += 'No live chat models.\n';
		return output;
	}

	for (const model of debugInfo.models) {
		const liveModel = chatService.getSession(model.sessionResource);
		const agentSession = agentSessionsService.getSession(model.sessionResource);
		const archived = agentSession ? agentSession.isArchived() : 'unknown';
		const age = liveModel ? fromNow(liveModel.timing.created, true, true, true) : 'unknown';

		output += `## ${model.title || '(untitled)'}\n\n`;
		output += `- Session: ${model.sessionResource.toString()}\n`;
		output += `- Created by: ${model.createdBy}\n`;
		output += `- Archived: ${archived}\n`;
		output += `- Age: ${age}\n`;
		output += `- Initial location: ${model.initialLocation}\n`;
		output += `- Imported: ${model.isImported}\n`;
		output += `- Pending edits: ${model.hasPendingEdits}\n`;
		output += `- Background keep-alive enabled: ${model.willKeepAlive}\n`;
		output += `- Pending disposal: ${model.pendingDisposal}\n`;
		output += `- Reference count: ${model.referenceCount}\n`;

		if (model.holders.length) {
			output += '- Holders:\n';
			for (const holder of model.holders) {
				output += `  - ${holder.holder}: ${holder.count}\n`;
			}
		} else {
			output += '- Holders: none\n';
		}

		output += '\n';
	}

	return output;
}

class LogChatInputHistoryAction extends Action2 {
	static readonly ID = 'workbench.action.chat.logInputHistory';

	constructor() {
		super({
			id: LogChatInputHistoryAction.ID,
			title: localize2('workbench.action.chat.logInputHistory.label', "Log Chat Input History"),
			icon: Codicon.attach,
			category: Categories.Developer,
			f1: true,
			precondition: ChatContextKeys.enabled
		});
	}

	override async run(accessor: ServicesAccessor, ...args: unknown[]): Promise<void> {
		const chatWidgetService = accessor.get(IChatWidgetService);
		chatWidgetService.lastFocusedWidget?.logInputHistory();
	}
}

class LogChatIndexAction extends Action2 {
	static readonly ID = 'workbench.action.chat.logChatIndex';

	constructor() {
		super({
			id: LogChatIndexAction.ID,
			title: localize2('workbench.action.chat.logChatIndex.label', "Log Chat Index"),
			icon: Codicon.attach,
			category: Categories.Developer,
			f1: true,
			precondition: ChatContextKeys.enabled
		});
	}

	override async run(accessor: ServicesAccessor, ...args: unknown[]): Promise<void> {
		const chatService = accessor.get(IChatService);
		chatService.logChatIndex();
	}
}

class InspectChatModelAction extends Action2 {
	static readonly ID = 'workbench.action.chat.inspectChatModel';

	constructor() {
		super({
			id: InspectChatModelAction.ID,
			title: localize2('workbench.action.chat.inspectChatModel.label', "Inspect Chat Model"),
			icon: Codicon.inspect,
			category: Categories.Developer,
			f1: true,
			precondition: ChatContextKeys.enabled
		});
	}

	override async run(accessor: ServicesAccessor, ...args: unknown[]): Promise<void> {
		const chatWidgetService = accessor.get(IChatWidgetService);
		const editorService = accessor.get(IEditorService);
		const widget = chatWidgetService.lastFocusedWidget;

		if (!widget?.viewModel) {
			return;
		}

		const model = widget.viewModel.model;
		const modelData = model.toJSON();

		// Build markdown output with latest response at the top
		let output = '# Chat Model Inspection\n\n';

		// Show latest response first if it exists
		const requests = modelData.requests;
		if (requests && requests.length > 0) {
			const latestRequest = requests[requests.length - 1];
			if (latestRequest.response) {
				output += '## Latest Response\n\n';
				output += '```json\n' + JSON.stringify(latestRequest.response, uriReplacer, 2) + '\n```\n\n';
			}
		}

		// Show full model data
		output += '## Full Chat Model\n\n';
		output += '```json\n' + JSON.stringify(modelData, uriReplacer, 2) + '\n```\n';

		await editorService.openEditor({
			resource: undefined,
			contents: output,
			languageId: 'markdown',
			options: {
				pinned: true
			}
		});
	}
}

class InspectChatModelReferencesAction extends Action2 {
	static readonly ID = 'workbench.action.chat.inspectChatModelReferences';

	constructor() {
		super({
			id: InspectChatModelReferencesAction.ID,
			title: localize2('workbench.action.chat.inspectChatModelReferences.label', "Inspect Chat Model References"),
			icon: Codicon.inspect,
			category: Categories.Developer,
			f1: true,
			precondition: ChatContextKeys.enabled
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const instantiationService = accessor.get(IInstantiationService);
		const editorService = accessor.get(IEditorService);

		await editorService.openEditor({
			resource: undefined,
			contents: instantiationService.invokeFunction(formatChatModelReferenceInspection),
			languageId: 'markdown',
			options: {
				pinned: true
			}
		});
	}
}

function subscriptionKindLabel(kind: StateComponents): string {
	switch (kind) {
		case StateComponents.Root: return 'root';
		case StateComponents.Session: return 'session';
		case StateComponents.Terminal: return 'terminal';
		case StateComponents.Changeset: return 'changeset';
		default: return `unknown(${kind})`;
	}
}

/** Escape a value so it is safe to embed in a markdown table cell. */
function escapeMarkdownTableCell(value: string): string {
	return value.replace(/\r?\n/g, '<br>').replace(/\|/g, '\\|');
}

function formatConnectionSubscriptions(label: string, details: string, connection: IAgentConnection | undefined): string {
	let output = `## ${label}\n\n`;
	output += `- ${details}\n`;

	if (!connection) {
		output += '- Not connected.\n\n';
		return output;
	}

	const root = connection.rootState.value;
	if (root === undefined) {
		output += '- Root state: pending (no snapshot yet)\n';
	} else if (root instanceof Error) {
		output += `- Root state: error (${root.message})\n`;
	} else {
		const agents = root.agents?.map(a => a.displayName).join(', ') || 'none';
		output += `- Root state: agents=[${agents}], activeSessions=${root.activeSessions ?? 0}, terminals=${root.terminals?.length ?? 0}\n`;
	}

	const subscriptions = connection.getActiveSubscriptions();
	output += `- Active subscriptions: ${subscriptions.length}\n\n`;

	if (subscriptions.length) {
		const sorted = [...subscriptions].sort((a, b) => a.resource.toString().localeCompare(b.resource.toString()));
		output += '| Resource | Kind | Refs | Holders | Status |\n';
		output += '| --- | --- | --- | --- | --- |\n';
		for (const subscription of sorted) {
			const holders = subscription.holders.length
				? subscription.holders.map(h => h.count > 1 ? `${h.owner} (${h.count})` : h.owner).join(', ')
				: '(none)';
			const cells = [
				subscription.resource.toString(),
				subscriptionKindLabel(subscription.kind),
				String(subscription.refCount),
				holders,
				subscription.status,
			].map(escapeMarkdownTableCell);
			output += `| ${cells.join(' | ')} |\n`;
		}
		output += '\n';
	}

	return output;
}

function formatAgentHostSubscriptionsInspection(accessor: ServicesAccessor): string {
	const connectionsService = accessor.get(IAgentHostConnectionsService);

	const connections = connectionsService.connections;
	const remoteCount = connections.filter(c => !c.isAmbient).length;

	let output = '# Agent Host Subscriptions\n\n';
	output += `- Connections: ${connections.length} (1 ambient, ${remoteCount} remote)\n`;
	output += 'Lists every resource each connected agent host is currently subscribed to. The always-live root state is summarized separately from the per-resource subscription table.\n\n';

	for (const info of connections) {
		const heading = info.isAmbient ? 'Ambient agent host' : `Remote: ${info.name}`;
		const details = [
			...(info.address ? [`address: ${info.address}`] : []),
			`clientId: ${info.connection?.clientId || '(none)'}`,
		].join(' · ');
		output += formatConnectionSubscriptions(heading, details, info.connection);
	}

	return output;
}

class InspectAgentHostSubscriptionsAction extends Action2 {
	static readonly ID = 'workbench.action.chat.inspectAgentHostSubscriptions';

	constructor() {
		super({
			id: InspectAgentHostSubscriptionsAction.ID,
			title: localize2('workbench.action.chat.inspectAgentHostSubscriptions.label', "Inspect Agent Host Subscriptions"),
			icon: Codicon.inspect,
			category: Categories.Developer,
			f1: true,
			precondition: ChatContextKeys.enabled
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const instantiationService = accessor.get(IInstantiationService);
		const editorService = accessor.get(IEditorService);

		await editorService.openEditor({
			resource: undefined,
			contents: instantiationService.invokeFunction(formatAgentHostSubscriptionsInspection),
			languageId: 'markdown',
			options: {
				pinned: true
			}
		});
	}
}

async function collectNetworkDiagnostics(connectionsService: IAgentHostConnectionsService): Promise<string> {
	const connections = connectionsService.connections;
	const remoteCount = connections.filter(c => !c.isAmbient).length;

	let output = '# Agent Host Network Diagnostics\n\n';
	output += `- Connections: ${connections.length} (1 ambient, ${remoteCount} remote)\n`;
	output += 'Connectivity probes run inside each agent host process (local or remote), so results reflect the environment the Copilot SDK actually connects from.\n\n';

	for (const info of connections) {
		const heading = info.isAmbient ? 'Ambient agent host' : `Remote: ${info.name}`;
		output += `## ${heading}\n\n`;
		if (info.address) {
			output += `- address: ${info.address}\n`;
		}
		if (!info.connection) {
			output += '- Not connected.\n\n';
			continue;
		}
		try {
			output += await formatConnectionNetworkDiagnostics(info.connection);
		} catch (err) {
			output += `- Failed to run network diagnostics: ${err instanceof Error ? err.message : String(err)}\n\n`;
		}
	}

	return output;
}

async function formatConnectionNetworkDiagnostics(connection: IAgentConnection): Promise<string> {
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
		output += formatEndpointSection(endpoint, result);
	}
	return output;
}

function formatKeyValues(values: Readonly<Record<string, string>>): string {
	const entries = Object.entries(values);
	return entries.length ? entries.map(([key, value]) => `${key}=${value}`).join(', ') : '(none)';
}

function formatEndpointSection(endpoint: IAgentHostNetworkEndpoint, result: IAgentHostNetworkFetchResult): string {
	let output = `### ${endpoint.name}\n\n`;
	output += `- URL: ${result.url}\n`;
	output += `- DNS IPv4: ${formatDnsResult(result.dnsIpv4)}\n`;
	output += `- DNS IPv6: ${formatDnsResult(result.dnsIpv6)}\n`;
	output += `- Proxy: ${result.proxyUrl ?? 'None'}\n`;
	output += `- Reachability: ${formatReachability(endpoint, result)}\n\n`;
	return output;
}

function formatDnsResult(dns: IAgentHostDnsResult | undefined): string {
	if (!dns) {
		return 'n/a';
	}
	return dns.address
		? `${dns.address} (${dns.durationMs} ms)`
		: `error (${dns.durationMs} ms): ${dns.error ?? 'unknown'}`;
}

/**
 * Computes the reachability verdict for a probe, applying the endpoint's
 * expected status (defaulting to 200) and optional expected content. The
 * agent-host probe only reports raw facts; the pass/fail decision lives here.
 */
function formatReachability(endpoint: IAgentHostNetworkEndpoint, result: IAgentHostNetworkFetchResult): string {
	// allow-any-unicode-next-line
	const PASS_MARK = '✓', FAIL_MARK = '✗';
	const duration = result.durationMs !== undefined ? ` (${result.durationMs} ms)` : '';
	if (result.error !== undefined) {
		return `${FAIL_MARK} ${result.error}${duration}`;
	}
	const connectVia = result.proxyUrl && /^https?:/i.test(result.proxyUrl) ? 'proxy' : 'direct';
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

		const contents = await collectNetworkDiagnostics(connectionsService);
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

class ClearRecentlyUsedLanguageModelsAction extends Action2 {
	static readonly ID = 'workbench.action.chat.clearRecentlyUsedLanguageModels';

	constructor() {
		super({
			id: ClearRecentlyUsedLanguageModelsAction.ID,
			title: localize2('workbench.action.chat.clearRecentlyUsedLanguageModels.label', "Clear Recently Used Language Models"),
			category: Categories.Developer,
			f1: true,
			precondition: ChatContextKeys.enabled
		});
	}

	override run(accessor: ServicesAccessor): void {
		accessor.get(ILanguageModelsService).clearRecentlyUsedList();
	}
}

class ResetChatPermissionWarningDialogsAction extends Action2 {
	static readonly ID = 'workbench.action.chat.resetPermissionWarningDialogs';

	constructor() {
		super({
			id: ResetChatPermissionWarningDialogsAction.ID,
			title: localize2('workbench.action.chat.resetPermissionWarningDialogs.label', "Reset Permission Warning Dialogs (Autopilot, Bypass Approvals)"),
			category: Categories.Developer,
			f1: true,
			precondition: ChatContextKeys.enabled
		});
	}

	override run(accessor: ServicesAccessor): void {
		const storageService = accessor.get(IStorageService);
		storageService.remove(AUTOPILOT_DONT_SHOW_AGAIN_KEY, StorageScope.PROFILE);
		storageService.remove(AUTO_APPROVE_DONT_SHOW_AGAIN_KEY, StorageScope.PROFILE);
		resetShownWarnings();
	}
}
