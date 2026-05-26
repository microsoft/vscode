/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { Disposable, DisposableMap, IDisposable, MutableDisposable } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IAgentHostService } from '../../../../../../platform/agentHost/common/agentService.js';
import type { ResolveSessionConfigResult, SessionConfigPropertySchema } from '../../../../../../platform/agentHost/common/state/protocol/commands.js';
import type { SessionState } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { StateComponents } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { type IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import { isUntitledChatSession } from '../../../common/model/chatUri.js';
import type { IChatWidget } from '../../chat.js';
import { AgentHostChatInputPicker, isClaimedByDedicatedPicker } from './agentHostChatInputPicker.js';
import { IAgentHostSessionWorkingDirectoryResolver } from './agentHostSessionWorkingDirectoryResolver.js';
import { IAgentHostUntitledProvisionalSessionService } from './agentHostUntitledProvisionalSessionService.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';

function toBackendSessionUri(sessionResource: URI): URI | undefined {
	const scheme = sessionResource.scheme;
	const prefix = 'agent-host-';
	if (!scheme.startsWith(prefix)) {
		return undefined;
	}
	const provider = scheme.substring(prefix.length);
	if (!provider) {
		return undefined;
	}
	const rawId = sessionResource.path.replace(/^\//, '');
	return URI.from({ scheme: provider, path: `/${rawId}` });
}

/**
 * Visual ordering rank for generic chips. Lower numbers render leftmost.
 * Properties not listed here keep their schema-declared order and sort
 * after any explicitly ranked ones.
 *
 * Codex chips are ordered so always-visible knobs (sandbox, approvals,
 * web search) sit on the left, and the chips that only render under
 * `sandbox=workspace-write` (writable roots, network access) come after.
 * Hardcoding the property names keeps this widget free of a runtime
 * dependency on the codex node-side keys.
 */
const CHIP_ORDER = new Map<string, number>([
	['codex.sandboxMode', 0],
	['codex.approvalPolicy', 1],
	['codex.webSearchMode', 2],
	['codex.additionalDirectories', 3],
	['codex.networkAccessEnabled', 4],
]);

/**
 * Direct-render chip lane for agent-host session-config properties that are
 * advertised by the agent's schema but are NOT handled by a dedicated
 * well-known picker (e.g. Claude's custom approval-mode property).
 *
 * Unlike the dedicated chips, this lane is not registered with
 * `MenuId.ChatInputSecondary`. It owns its own DOM container and creates
 * one {@link AgentHostChatInputPicker} per generic property, syncing the
 * set of chips whenever the active session's schema changes.
 */
export class AgentHostGenericConfigChips extends Disposable {

	private _container: HTMLElement | undefined;

	private readonly _chips = this._register(new DisposableMap<string>());

	/**
	 * Subscription to the active session's backend state. Maintained for the
	 * lifetime of any one (sessionResource, backendSession) pair; replaced
	 * via {@link _reattach} when the active session changes.
	 */
	private readonly _subRef = this._register(new MutableDisposable<IDisposable & {
		readonly sub: IAgentSubscription<SessionState>;
		readonly backendSession: URI;
	}>());

	private _initialResolved: { readonly sessionResource: URI; readonly result: ResolveSessionConfigResult } | undefined;
	private readonly _initialResolveCts = this._register(new MutableDisposable<CancellationTokenSource>());

	constructor(
		private readonly _widget: IChatWidget,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IAgentHostService private readonly _agentHostService: IAgentHostService,
		@IAgentHostUntitledProvisionalSessionService private readonly _provisional: IAgentHostUntitledProvisionalSessionService,
		@IAgentHostSessionWorkingDirectoryResolver private readonly _workingDirectoryResolver: IAgentHostSessionWorkingDirectoryResolver,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
	) {
		super();
		this._register(this._widget.onDidChangeViewModel(() => this._reattach()));
		this._register(this._provisional.onDidChange((sessionResource: URI) => {
			const current = this._widget.viewModel?.sessionResource;
			if (current && current.toString() === sessionResource.toString()) {
				this._reattach();
			}
		}));
		this._reattach();
	}

	render(container: HTMLElement): void {
		this._container = container;
		this._sync();
	}

	private _reattach(): void {
		const sessionResource = this._widget.viewModel?.sessionResource;
		const provisionalBackend = sessionResource ? this._provisional.get(sessionResource) : undefined;
		const backendSession = provisionalBackend
			?? (sessionResource ? toBackendSessionUri(sessionResource) : undefined);

		if (!sessionResource || !backendSession) {
			this._subRef.clear();
			this._initialResolved = undefined;
			this._cancelInitialResolve();
			this._sync();
			return;
		}

		if (isUntitledChatSession(sessionResource) && !provisionalBackend) {
			this._subRef.clear();
			if (!this._initialResolved || this._initialResolved.sessionResource.toString() !== sessionResource.toString()) {
				this._initialResolved = undefined;
				void this._refreshInitialResolved(sessionResource, backendSession);
			}
			this._sync();
			return;
		}

		this._initialResolved = undefined;
		this._cancelInitialResolve();
		const ref = this._agentHostService.getSubscription(StateComponents.Session, backendSession);
		const sub = ref.object;
		const listener = sub.onDidChange(() => this._sync());
		this._subRef.value = {
			sub,
			backendSession,
			dispose: () => { listener.dispose(); ref.dispose(); },
		};
		this._sync();
	}

	private _cancelInitialResolve(): void {
		this._initialResolveCts.value?.cancel();
		this._initialResolveCts.clear();
	}

	private async _refreshInitialResolved(sessionResource: URI, backendSession: URI): Promise<void> {
		this._initialResolveCts.value?.cancel();
		const cts = new CancellationTokenSource();
		this._initialResolveCts.value = cts;
		try {
			const result = await this._agentHostService.resolveSessionConfig({
				provider: backendSession.scheme,
				workingDirectory: this._readWorkingDirectory(),
			});
			if (cts.token.isCancellationRequested || this._widget.viewModel?.sessionResource?.toString() !== sessionResource.toString()) {
				return;
			}
			this._initialResolved = { sessionResource, result };
			this._sync();
		} catch {
			// Best-effort.
		}
	}

	private _readWorkingDirectory(): URI | undefined {
		const state = this._subRef.value?.sub.value;
		if (state && !(state instanceof Error)) {
			const cwd = state.summary.workingDirectory;
			return typeof cwd === 'string' ? URI.parse(cwd) : cwd;
		}
		const sessionResource = this._widget.viewModel?.sessionResource;
		return (sessionResource && this._workingDirectoryResolver.resolve(sessionResource))
			?? this._workspaceContextService.getWorkspace().folders[0]?.uri;
	}

	private _readSchemaProperties(): readonly [string, SessionConfigPropertySchema][] | undefined {
		const sessionResource = this._widget.viewModel?.sessionResource;
		if (this._subRef.value) {
			const state = this._subRef.value.sub.value;
			if (!state || state instanceof Error || !state.config) {
				return undefined;
			}
			const overlay = sessionResource ? this._provisional.getResolvedConfig(sessionResource) : undefined;
			return Object.entries((overlay?.schema ?? state.config.schema).properties);
		}
		if (this._initialResolved && sessionResource && this._initialResolved.sessionResource.toString() === sessionResource.toString()) {
			return Object.entries(this._initialResolved.result.schema.properties);
		}
		return undefined;
	}

	private _sync(): void {
		if (!this._container) {
			return;
		}
		const entries = this._readSchemaProperties();
		const desired = new Set<string>();
		if (entries) {
			// Order chips so always-visible knobs sit on the left and
			// conditional ones (e.g. codex's workspace-write-only writable
			// roots / network access) follow. Properties not in
			// {@link CHIP_ORDER} keep their schema-declared order, slotting
			// in after the explicitly-ranked ones. AgentHostChatInputPicker
			// hides itself when its dependency check fails, so reserving a
			// slot here is harmless when the chip is invisible.
			const ranked = [...entries]
				.filter(([property, schema]) => !isClaimedByDedicatedPicker(property, schema))
				.map(([property], index) => ({ property, index, rank: CHIP_ORDER.get(property) ?? Number.MAX_SAFE_INTEGER }))
				.sort((a, b) => a.rank - b.rank || a.index - b.index);
			for (const { property } of ranked) {
				desired.add(property);
			}
		}

		// Remove chips for properties no longer in the schema (or now claimed
		// by a dedicated picker).
		for (const property of [...this._chips.keys()]) {
			if (!desired.has(property)) {
				this._chips.deleteAndDispose(property);
			}
		}

		// Add chips for newly-appearing generic properties.
		for (const property of desired) {
			if (this._chips.has(property)) {
				continue;
			}
			const chip = this._instantiationService.createInstance(AgentHostChatInputPicker, this._widget, property, { labelStyle: 'titledValue' });
			// `chat-input-picker-item` matches the class that
			// `ChatInputPickerActionViewItem` applies to the dedicated
			// chips' container — required so the secondary-toolbar styling
			// in `chat.css` (height, padding, chevron) applies here too.
			const slot = dom.append(this._container, dom.$('.agent-host-generic-chip-slot.chat-input-picker-item'));
			chip.render(slot);
			this._chips.set(property, {
				dispose: () => {
					chip.dispose();
					slot.remove();
				},
			});
		}
	}
}
