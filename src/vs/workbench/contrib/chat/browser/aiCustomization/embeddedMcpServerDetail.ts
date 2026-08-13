/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { status } from '../../../../../base/browser/ui/aria/aria.js';
import { Disposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, IReader } from '../../../../../base/common/observable.js';
import { localize } from '../../../../../nls.js';
import { LocalMcpServerScope } from '../../../../services/mcp/common/mcpWorkbenchManagementService.js';
import { McpServerType } from '../../../../../platform/mcp/common/mcpPlatformTypes.js';
import { IMcpServer, IMcpService, IMcpWorkbenchService, IWorkbenchMcpServer, McpConnectionState } from '../../../mcp/common/mcpTypes.js';
import { isContributionDisabled } from '../../common/enablement.js';
import { ActiveSessionMcpServerMatcher, AgentHostMcpServer, areMcpToolsFromCache, formatMcpStatusWithScope, getMcpStatusPresentation, hasKnownMcpTools, isNoteworthyMcpStatus, resolveMcpDisabledState } from './mcpListWidget.js';
import { IAgentHostCustomizationService } from '../agentSessions/agentHost/agentHostCustomizationService.js';
import { ICustomizationHarnessService } from '../../common/customizationHarnessService.js';
import { findRuntimeMcpServer, getWorkbenchServerMatchKeys } from './mcpServerIdentity.js';

const $ = DOM.$;

/**
 * Detail view for an MCP server inside the AI Customizations management editor's split-pane host.
 *
 * The list row already answers "what is this and is it working". This view exists to answer the
 * two questions a row has no room for:
 *
 * - *What can it do?* — the tool list, which is the whole reason to install a server and is
 *   otherwise only visible as a count.
 * - *What does it run?* — the command or address, so the user can judge what they have given
 *   their machine to, and find the file to edit.
 *
 * Configuration is rendered above the tool list even though tools matter more, because the
 * configuration block is short and fixed-height while the tool list is unbounded. Ordering it the
 * other way would push the configuration below the fold for any server with more than a handful
 * of tools, making it effectively unreachable.
 */
export class EmbeddedMcpServerDetail extends Disposable {

	private readonly root: HTMLElement;
	private readonly headerEl: HTMLElement;
	private readonly leadingSlotEl: HTMLElement;
	private readonly nameEl: HTMLElement;
	private readonly subtitleEl: HTMLElement;
	private readonly statusEl: HTMLElement;
	private readonly scopeEl: HTMLElement;
	private readonly descriptionEl: HTMLElement;
	private readonly configEl: HTMLElement;
	private readonly configListEl: HTMLElement;
	private readonly toolsEl: HTMLElement;
	private readonly toolsHeadingEl: HTMLElement;
	private readonly toolsMessageEl: HTMLElement;
	private readonly toolsListEl: HTMLElement;
	private readonly emptyEl: HTMLElement;

	private readonly liveRender = this._register(new MutableDisposable());

	private announcedToolCount: number | undefined;

	private current: IWorkbenchMcpServer | undefined;

	constructor(
		parent: HTMLElement,
		@IMcpWorkbenchService private readonly mcpWorkbenchService: IMcpWorkbenchService,
		@IMcpService private readonly mcpService: IMcpService,
		@IAgentHostCustomizationService private readonly agentHostCustomizationService: IAgentHostCustomizationService,
		@ICustomizationHarnessService private readonly customizationHarnessService: ICustomizationHarnessService,
	) {
		super();

		this.root = DOM.append(parent, $('.ai-customization-embedded-detail.embedded-mcp-detail'));

		this.headerEl = DOM.append(this.root, $('.embedded-detail-header'));
		// Slot at the start of the header for callers to append leading chrome
		// (e.g. a back button) without reaching into private DOM structure.
		this.leadingSlotEl = DOM.append(this.headerEl, $('.embedded-detail-leading-slot'));
		const headerText = DOM.append(this.headerEl, $('.embedded-detail-header-text'));
		this.nameEl = DOM.append(headerText, $('h2.embedded-detail-name'));
		this.nameEl.setAttribute('role', 'heading');
		this.subtitleEl = DOM.append(headerText, $('.embedded-detail-scope.mcp-detail-subtitle'));
		this.statusEl = DOM.append(this.subtitleEl, $('span.mcp-server-status'));
		this.scopeEl = DOM.append(this.subtitleEl, $('span.mcp-detail-scope-text'));

		this.descriptionEl = DOM.append(this.root, $('.embedded-detail-description'));

		this.configEl = DOM.append(this.root, $('.embedded-detail-section.mcp-detail-config'));
		DOM.append(this.configEl, $('h3.embedded-detail-tools-heading')).textContent = localize('mcpDetailConfiguration', "Configuration");
		this.configListEl = DOM.append(this.configEl, $('dl.mcp-detail-facts'));

		this.toolsEl = DOM.append(this.root, $('.embedded-detail-tools'));
		this.toolsHeadingEl = DOM.append(this.toolsEl, $('h3.embedded-detail-tools-heading'));
		this.toolsMessageEl = DOM.append(this.toolsEl, $('.embedded-detail-tools-message'));
		this.toolsListEl = DOM.append(this.toolsEl, $('.embedded-detail-tools-list'));
		this.toolsListEl.setAttribute('role', 'list');

		this.emptyEl = DOM.append(this.root, $('.embedded-detail-empty'));
		this.emptyEl.textContent = localize('mcpDetailEmpty', "No MCP server selected.");

		// Refresh when the underlying server changes (install state, enablement, etc.).
		//
		// `undefined` means "something global changed" -- a profile switch, an mcp.json edit,
		// an enablement write -- and the service rebuilds its server objects when it fires it.
		// Ignoring it left this pane showing configuration the user had just finished editing,
		// which is precisely the file this pane exists to point them at.
		this._register(this.mcpWorkbenchService.onChange(server => {
			if (!this.current) {
				return;
			}
			if (server) {
				if (server.id === this.current.id) {
					this.current = server;
					this.render();
				}
				return;
			}
			const id = this.current.id;
			this.current = this.mcpWorkbenchService.local.find(s => s.id === id) ?? this.current;
			this.render();
		}));

		this.render();
	}

	get element(): HTMLElement {
		return this.root;
	}

	get headerElement(): HTMLElement {
		return this.headerEl;
	}

	/**
	 * Header slot reserved for leading chrome (e.g. a back button).
	 * Prefer this over reaching into the header element directly.
	 */
	get leadingSlot(): HTMLElement {
		return this.leadingSlotEl;
	}

	setInput(server: IWorkbenchMcpServer): void {
		this.current = server;
		// Reset here rather than in render(): render() now also runs for unrelated global
		// changes, and resetting there re-spoke the tool count every time any other server
		// was toggled or mcp.json was saved.
		this.announcedToolCount = undefined;
		this.render();
	}

	clearInput(): void {
		this.current = undefined;
		this.announcedToolCount = undefined;
		this.render();
	}

	/**
	 * Configuration comes from the installed server and is static, so it is rendered once.
	 * Status and tools come from observables on the running server, so they live inside an
	 * autorun that is torn down whenever the input changes.
	 */
	private render(): void {
		const server = this.current;
		const hasItem = !!server;
		this.emptyEl.style.display = hasItem ? 'none' : '';
		this.root.classList.toggle('is-empty', !hasItem);

		if (!server) {
			this.liveRender.clear();
			this.nameEl.textContent = '';
			this.statusEl.textContent = '';
			this.scopeEl.textContent = '';
			this.descriptionEl.textContent = '';
			DOM.clearNode(this.configListEl);
			DOM.clearNode(this.toolsListEl);
			// Emptying the list is not enough: the section keeps its heading, which left a bare
			// "Configuration" floating above "No MCP server selected".
			this.configEl.style.display = 'none';
			this.setToolsMessage(undefined);
			return;
		}

		this.nameEl.textContent = server.label || server.name;

		const description = (server.description || '').trim();
		this.descriptionEl.textContent = description;
		this.descriptionEl.style.display = description ? '' : 'none';

		this.renderConfiguration(server);

		this.liveRender.value = autorun(reader => {
			const runtime = findRuntimeMcpServer(this.mcpService.servers.read(reader), server);
			// The row prefers the active session's view of a server, so this pane has to as well
			// or the two disagree about the same server -- the pane reporting Idle for something
			// the session shows as failed, or losing the layer that turned it off.
			const sessionResource = this.customizationHarnessService.activeSessionResource.read(reader);
			const sessionServer = new ActiveSessionMcpServerMatcher(this.agentHostCustomizationService.getMcpServers(sessionResource))
				.take(getWorkbenchServerMatchKeys(server));
			this.renderStatus(server, runtime, sessionServer, reader);
			this.renderTools(runtime, reader);
		});
	}

	private renderStatus(server: IWorkbenchMcpServer, runtime: IMcpServer | undefined, sessionServer: AgentHostMcpServer | undefined, reader: IReader): void {
		// Resolved through the same helper the row uses, rather than a second copy of the rule:
		// durable off outranks a session off, and the layer is named when it is narrower than
		// everywhere. Two copies of this had already drifted apart once.
		const enablement = runtime?.enablement.read(reader);
		const { disabled, scope: enablementScope } = resolveMcpDisabledState(enablement, sessionServer?.enabled);
		const kind = disabled
			? 'disabled' as const
			: sessionServer
				? sessionServer.status
				// An installed server with no runtime counterpart is idle, not statusless. The row
				// says so; without the same fallback the pane went blank for exactly the servers the
				// conservative runtime matching declines to match.
				: runtime?.connectionState.read(reader).state ?? McpConnectionState.Kind.Stopped;
		// This pane has no switch, so "Off" is worth saying here. Running and Idle still are not:
		// whether a lazily-started server happens to hold a process right now is not why anyone
		// opened this pane, and the Tools section below already says whether it has ever run.
		const presentation = isNoteworthyMcpStatus(kind) ? getMcpStatusPresentation(kind) : undefined;

		this.statusEl.className = presentation ? `mcp-server-status ${presentation.className}` : 'mcp-server-status';
		this.statusEl.textContent = presentation ? formatMcpStatusWithScope(presentation.label, enablementScope) : '';
		this.statusEl.style.display = presentation ? '' : 'none';

		const scope = describeMcpScope(server.local?.scope);
		this.scopeEl.textContent = scope ?? '';
		this.scopeEl.style.display = scope ? '' : 'none';
		this.subtitleEl.classList.toggle('has-separator', !!presentation && !!scope);
	}

	/**
	 * Shows what the server actually runs. Values that routinely carry secrets — environment
	 * variables and HTTP headers — are reduced to their names: knowing a server reads
	 * `GITHUB_TOKEN` is the useful part, and printing the token itself into a pane that can be
	 * screen-shared is not a trade worth making.
	 */
	private renderConfiguration(server: IWorkbenchMcpServer): void {
		DOM.clearNode(this.configListEl);

		// Read from the installed configuration rather than the running server's resolved launch:
		// it is what the user wrote, it is available whether or not the server has ever started,
		// and it does not depend on a runtime match succeeding.
		const config = server.local?.config ?? server.config;
		const facts: { label: string; value: string; code?: boolean }[] = [];

		if (config?.type === McpServerType.LOCAL) {
			facts.push({
				label: localize('mcpDetailCommand', "Command"),
				value: [config.command, ...(config.args ?? [])].join(' '),
				code: true,
			});
			if (config.cwd) {
				facts.push({ label: localize('mcpDetailCwd', "Working directory"), value: config.cwd, code: true });
			}
			const envNames = Object.keys(config.env ?? {});
			if (envNames.length) {
				facts.push({ label: localize('mcpDetailEnv', "Environment"), value: envNames.join(', '), code: true });
			}
		} else if (config?.type === McpServerType.REMOTE) {
			facts.push({ label: localize('mcpDetailUrl', "Address"), value: config.url, code: true });
			const headerNames = Object.keys(config.headers ?? {});
			if (headerNames.length) {
				facts.push({ label: localize('mcpDetailHeaders', "Headers"), value: headerNames.join(', '), code: true });
			}
		}

		const version = server.local?.version;
		if (version) {
			facts.push({ label: localize('mcpDetailVersion', "Version"), value: version });
		}

		this.configEl.style.display = facts.length ? '' : 'none';
		for (const fact of facts) {
			DOM.append(this.configListEl, $('dt.mcp-detail-fact-label')).textContent = fact.label;
			const value = DOM.append(this.configListEl, $('dd.mcp-detail-fact-value'));
			value.classList.toggle('is-code', !!fact.code);
			value.textContent = fact.value;
		}
	}

	private renderTools(runtime: IMcpServer | undefined, reader: IReader): void {
		DOM.clearNode(this.toolsListEl);

		const cacheState = runtime?.cacheState.read(reader);
		const tools = runtime?.tools.read(reader) ?? [];

		if (!runtime || !hasKnownMcpTools(cacheState)) {
			// Tools are only known once a server has run at least once. Saying so is more
			// useful than an empty list, which reads as "this server offers nothing" -- but
			// only a server that is actually off should be told to turn on, or the pane asks
			// the user to flip a switch they can see is already flipped.
			const enablement = runtime?.enablement.read(reader);
			const isOff = enablement !== undefined && isContributionDisabled(enablement);
			this.toolsHeadingEl.textContent = localize('mcpDetailTools', "Tools");
			this.setToolsMessage(isOff
				? localize('mcpDetailToolsUnknown', "Turn this server on to see the tools it provides.")
				: localize('mcpDetailToolsNotRun', "Tools are listed once this server has run."));
			return;
		}

		this.toolsHeadingEl.textContent = tools.length
			? localize('mcpDetailToolsCount', "Tools ({0})", tools.length)
			: localize('mcpDetailTools', "Tools");

		if (!tools.length) {
			this.setToolsMessage(localize('mcpDetailNoTools', "This server does not provide any tools."));
			return;
		}

		this.setToolsMessage(areMcpToolsFromCache(cacheState)
			? localize('mcpDetailToolsCached', "From the last time this server ran.")
			: undefined);

		for (const tool of tools) {
			const row = DOM.append(this.toolsListEl, $('.embedded-detail-tool'));
			row.setAttribute('role', 'listitem');
			DOM.append(row, $('.embedded-detail-tool-name')).textContent = tool.referenceName;
			const description = tool.definition.description?.trim();
			if (description) {
				DOM.append(row, $('.embedded-detail-tool-description')).textContent = description;
			}
		}

		// The autorun re-runs on every connection change; only speak when the count moves,
		// otherwise the pane repeats itself at a screen reader for no new information.
		if (this.announcedToolCount !== tools.length) {
			this.announcedToolCount = tools.length;
			status(tools.length === 1
				? localize('mcpDetailToolsLoadedOne', "1 tool")
				: localize('mcpDetailToolsLoaded', "{0} tools", tools.length));
		}
	}

	private setToolsMessage(message: string | undefined): void {
		this.toolsMessageEl.textContent = message ?? '';
		this.toolsMessageEl.style.display = message ? '' : 'none';
	}
}

function describeMcpScope(scope: LocalMcpServerScope | undefined): string | undefined {
	switch (scope) {
		case LocalMcpServerScope.Workspace:
			return localize('mcpScopeWorkspace', "Workspace");
		case LocalMcpServerScope.User:
		case LocalMcpServerScope.RemoteUser:
			return localize('mcpScopeUser', "User");
		default:
			return undefined;
	}
}
