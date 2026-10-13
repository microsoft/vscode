/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CopilotRequestHandler, NamedProviderConfig, ProviderModelConfig } from '@github/copilot-sdk';
import type { CancellationToken } from '../../../../../base/common/cancellation.js';
import type { Event } from '../../../../../base/common/event.js';
import type { IDisposable } from '../../../../../base/common/lifecycle.js';
import type { IObservable } from '../../../../../base/common/observable.js';
import type { LibcFamily } from '../../../../../base/node/libc.js';
import { CopilotCliConfigKey, copilotCliConfigSchema } from '../../../common/copilotCliConfig.js';
import type { ILocalModelConsent, ILocalModelStatusV1, ILocalTurnExecution } from '../../../common/localModel.js';
import type { IAgentConfigurationService } from '../../agentConfigurationService.js';
import { LOCAL_MODEL_SUPPORTED_TARGETS, type LocalModelTarget } from './shim/constants.js';
import type { LocalModelThinkingSupport } from './localModelThinking.js';

/**
 * Settings the provider reads live at dispatch time; pushed by `CopilotAgent`
 * whenever root config changes.
 */
export interface ILocalModelLiveConfig {
	/**
	 * `chat.copilot.localModel.enabled`. The request handler only changes at the
	 * next client start, but the dispatch-time gate must close immediately when
	 * the setting is turned off.
	 */
	readonly enabled: boolean;
	/** `chat.copilot.localModel.useInAuto`. */
	readonly useInAuto: boolean;
	/** Workbench-computed account gate (preview features allowed, signed in, AI enabled). */
	readonly accountGate: boolean;
	/** Trimmed `chat.copilot.localModel.llamaServerPath`; `undefined` when empty. */
	readonly llamaServerPath: string | undefined;
}

/**
 * Sentinel BYOK provider and direct-selection model rows the provider wants on
 * every session. Replaceable: callers drop previously applied
 * `vscode-on-device` entries before merging the current contribution.
 */
export interface ILocalModelSessionConfigContribution {
	readonly providers: NamedProviderConfig[];
	readonly models: ProviderModelConfig[];
}

/**
 * One direct-selection model row for `CopilotAgent._publishModels`.
 * `CopilotAgent` turns it into an `IAgentModelInfo` with
 * `_meta['vscode.localModel'] = { familyId, contentId, active }`.
 */
export interface ILocalModelModelRow {
	/**
	 * Provider-local model id: the `llama-server` alias (Azure ML asset name),
	 * sent as `body.model` to the sentinel. The runtime selects the row as
	 * `vscode-on-device/<id>` (`getLocalModelSelectionId`), which equals
	 * `install.modelId` in status.
	 */
	readonly id: string;
	readonly name: string;
	readonly familyId: string;
	readonly contentId: string;
	readonly active: boolean;
	readonly maxContextWindow?: number;
	readonly maxPromptTokens?: number;
	readonly maxOutputTokens?: number;
	/**
	 * How the family's chat template controls thinking, when it does:
	 * `CopilotAgent` advertises it as the row's `thinkingLevel` config, and
	 * the request handler applies the session's `reasoning_effort`.
	 */
	readonly thinking?: LocalModelThinkingSupport;
}

/**
 * An on-device request waiting for its first output:
 * `loading` while the model loads or a swap to it finishes, `queued` while
 * every slot is busy (both only for direct-selection requests), `processing`
 * while `llama-server` reads a long prompt (streaming requests, Auto ones
 * served on the device included), and `done` when the wait ends (first
 * output, failed or cancelled).
 */
export interface ILocalModelDirectRequestWait {
	/** The runtime session the request belongs to, when the runtime reported one. */
	readonly sessionId: string | undefined;
	readonly familyId: string;
	readonly kind: 'loading' | 'queued' | 'processing' | 'done';
	/** 1-based queue position, for `queued`. */
	readonly position?: number;
	/** For `processing`: how much of the uncached prompt was read (0-100), once `llama-server` reports it. */
	readonly percent?: number;
}

/**
 * Everything Copilot session code may know about on-device models.
 * Implemented by the request-handler shim. Generic Agent Host code (`CopilotAgent`,
 * `CopilotSessionLauncher`, `CopilotAgentSession`, `LocalModelSetupChannel`)
 * depends only on this interface; the workbench never imports it.
 *
 * **Transition methods** (`setUp`, `update`, `remove`,
 * `resume`, `retry`, `makeActive`, `setContextSize`, `start`, `stop`, `stopPrevious`,
 * `approveRuntime`, `refreshCatalog`) resolve once the
 * transition has been admitted and is reflected in {@link status}. Long work
 * (downloads, verification, drains, loads) continues as a
 * provider-owned tracked operation; it is cancelled through {@link cancel} /
 * {@link pause}, never by awaiting the returned promise. They reject only when
 * the transition cannot be admitted (unknown family, conflicting operation,
 * consent scope mismatch); runtime failures surface as status errors.
 */
export interface ILocalModelProvider extends IDisposable {
	/** Status projection, published by the setup channel as `vscode.localModel.status`. */
	readonly status: IObservable<ILocalModelStatusV1>;

	/**
	 * Request handler installed on the `CopilotClient` at start, or `undefined`
	 * when the provider needs none. Must stay safe to call after the provider is
	 * disposed (pass-through, or fail closed for on-device requests) because a
	 * running client keeps it until its next restart.
	 */
	readonly requestHandler: CopilotRequestHandler | undefined;

	/** Fires when {@link getModelRows} changes. */
	readonly onDidChangeModelRows: Event<void>;

	/**
	 * On-device requests waiting for their model, a slot or the prompt to be
	 * read; sessions show the wait in their chat. Optional: a provider whose
	 * requests never wait omits it.
	 */
	readonly onDidDirectRequestWait?: Event<ILocalModelDirectRequestWait>;

	/** Download and install `familyId`, after the user's consent. Never needs llama.cpp; loading it does. */
	setUp(familyId: string, consent: ILocalModelConsent, token: CancellationToken): Promise<void>;
	/** Channel-local update of an installed family. */
	update(familyId: string, consent: ILocalModelConsent | undefined, token: CancellationToken): Promise<void>;
	/** Remove VS Code-owned versions; drains first when the family is active. */
	remove(familyId: string): Promise<void>;
	/** Cancel an operation immediately, keeping partial files for resume. Never queued. */
	cancel(operationId: string): void;
	/** Pause an operation immediately. Never queued. */
	pause(operationId: string): void;
	resume(operationId: string): Promise<void>;
	/** Retry a failed operation from its last completed step. */
	retry(operationId: string): Promise<void>;
	/** Confirmed swap; single-flight. */
	makeActive(familyId: string): Promise<void>;
	/**
	 * Select one of the family's context sizes (`contextTokens` of its
	 * `context.options`) and remember it. The active loaded family reloads
	 * right away (running responses finish first, as for a swap); otherwise it
	 * applies at the next load.
	 */
	setContextSize(familyId: string, contextTokens: number): Promise<void>;
	/** Load the active model. */
	start(): Promise<void>;
	/** User-initiated stop; `stopNow` cancels running responses instead of waiting for them. */
	stop(options: { readonly stopNow: boolean }): Promise<void>;
	/** Stop a previous, verified orphan server. */
	stopPrevious(): Promise<void>;
	/** Approve the detected `llama-server` awaiting approval. */
	approveRuntime(consent: ILocalModelConsent): Promise<void>;
	/** Re-query the catalog now. */
	refreshCatalog(): Promise<void>;

	/** Apply live settings; called whenever root config changes. */
	updateLiveConfig(config: ILocalModelLiveConfig): void;

	/** Usage accounting: the direct-selection family a session is bound to, or `undefined`. */
	setSessionDirectFamily(sessionId: string, familyId: string | undefined): void;
	/** Replaceable sentinel provider and model rows for session create, resume and `provider.sync`. */
	contributeSessionConfig(): ILocalModelSessionConfigContribution;
	/** An Auto session was created or resumed: load the active model in the background when Auto may use it. */
	onAutoSessionStarted(): void;
	/** Sign-out or account switch: increments the account generation. */
	onAccountChanged(): void;
	/** One direct-selection row per installed family. */
	getModelRows(): readonly ILocalModelModelRow[];

	/** Open a turn for attribution; returns its generation. */
	beginTurn(sessionId: string): number;
	/** Close a turn and get its aggregate, or `undefined` when nothing local was involved. */
	endTurn(sessionId: string, generation: number): ILocalTurnExecution | undefined;
}

// #region Provider selection

export type LocalModelProviderSelection = 'shim' | 'none';

/** Maps a platform and architecture to a supported target, or `undefined`. */
export function getLocalModelTarget(platform: string, arch: string): LocalModelTarget | undefined {
	const target = `${platform}-${arch}`;
	return LOCAL_MODEL_SUPPORTED_TARGETS.find(candidate => candidate === target);
}

/**
 * Whether on-device models are supported on this machine: every
 * supported target, with Linux limited to glibc unless an explicit
 * `llama-server` path is configured (no package build exists for musl).
 */
export function isSupportedTarget(platform: string, arch: string, libc: LibcFamily | undefined, hasLlamaServerPath: boolean): boolean {
	if (!getLocalModelTarget(platform, arch)) {
		return false;
	}
	return platform !== 'linux' || libc !== 'musl' || hasLlamaServerPath;
}

export interface ILocalModelProviderSelectionInput {
	/** `chat.copilot.localModel.enabled`. */
	readonly enabled: boolean;
	/** True only in the local utility-process Agent Host. */
	readonly isLocalAgentHost: boolean;
	readonly platform: string;
	readonly arch: string;
	readonly libc: LibcFamily | undefined;
	readonly llamaServerPath: string | undefined;
}

/** Chooses the provider at client start. Pure. */
export function selectLocalModelProvider(input: ILocalModelProviderSelectionInput): LocalModelProviderSelection {
	if (!input.enabled || !input.isLocalAgentHost) {
		return 'none';
	}
	return isSupportedTarget(input.platform, input.arch, input.libc, !!input.llamaServerPath) ? 'shim' : 'none';
}

// #endregion

// #region Root config

/** Reads the forwarded local-model settings from the host's root config. */
export function readLocalModelRootConfig(configurationService: Pick<IAgentConfigurationService, 'getRootValue'>): ILocalModelLiveConfig {
	const read = <K extends CopilotCliConfigKey>(key: K) => configurationService.getRootValue(copilotCliConfigSchema, key);
	const llamaServerPath = read(CopilotCliConfigKey.LocalModelLlamaServerPath);
	return {
		enabled: read(CopilotCliConfigKey.LocalModelEnabled) === true,
		useInAuto: read(CopilotCliConfigKey.LocalModelUseInAuto) === true,
		accountGate: read(CopilotCliConfigKey.LocalModelAccountGate) === true,
		llamaServerPath: typeof llamaServerPath === 'string' && llamaServerPath.trim() ? llamaServerPath.trim() : undefined,
	};
}

// #endregion
