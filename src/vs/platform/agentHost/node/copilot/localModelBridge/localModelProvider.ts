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

/** Settings the provider reads live at dispatch time; pushed by `CopilotAgent` whenever root config changes. */
export interface ILocalModelLiveConfig {
	/** `chat.copilot.localModel.enabled`. The request handler changes only at the next client start, so the dispatch-time gate must close at once. */
	readonly enabled: boolean;
	/** `chat.copilot.localModel.useInAuto`. */
	readonly useInAuto: boolean;
	/** Workbench-computed account gate (preview features allowed, signed in, AI enabled). */
	readonly accountGate: boolean;
	/** Trimmed `chat.copilot.localModel.llamaServerPath`; `undefined` when empty. */
	readonly llamaServerPath: string | undefined;
}

/** Sentinel BYOK provider and direct-selection rows for every session; replaceable, as callers drop earlier `vscode-on-device` entries before merging. */
export interface ILocalModelSessionConfigContribution {
	readonly providers: NamedProviderConfig[];
	readonly models: ProviderModelConfig[];
}

/** One direct-selection model row, which `CopilotAgent._publishModels` turns into an `IAgentModelInfo` with `vscode.localModel` meta. */
export interface ILocalModelModelRow {
	/** Provider-local model id: the `llama-server` alias, sent as `body.model`; selected as `vscode-on-device/<id>`, which equals `install.modelId` in status. */
	readonly id: string;
	readonly name: string;
	readonly familyId: string;
	readonly contentId: string;
	readonly active: boolean;
	readonly maxContextWindow?: number;
	readonly maxPromptTokens?: number;
	readonly maxOutputTokens?: number;
	/** How the family's chat template controls thinking: advertised as the row's `thinkingLevel` config and applied from the session's `reasoning_effort`. */
	readonly thinking?: LocalModelThinkingSupport;
}

/** An on-device request waiting for its first output: `loading`, `queued` (direct requests), `processing` a long prompt (streaming requests), then `done`. */
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
 * Everything Copilot session code may know about on-device models, implemented by the request-handler shim. Generic
 * Agent Host code depends only on this interface; the workbench never imports it.
 *
 * Transition methods resolve once the transition is admitted and reflected in {@link status}; long work continues as a
 * provider-owned operation, cancelled through {@link cancel} or {@link pause}, never by awaiting. They reject only when
 * the transition can't be admitted; runtime failures surface as status errors.
 */
export interface ILocalModelProvider extends IDisposable {
	/** Status projection, published by the setup channel as `vscode.localModel.status`. */
	readonly status: IObservable<ILocalModelStatusV1>;

	/**
	 * Request handler installed on the `CopilotClient` at start. Must stay safe to call after the provider is disposed,
	 * because a running client keeps it until its next restart.
	 */
	readonly requestHandler: CopilotRequestHandler | undefined;

	/** Fires when {@link getModelRows} changes. */
	readonly onDidChangeModelRows: Event<void>;

	/** On-device requests waiting for their model, a slot or the prompt to be read; optional for providers whose requests never wait. */
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
	/** Selects and remembers one of the family's context sizes; the active loaded family reloads after running responses finish, otherwise it applies at the next load. */
	setContextSize(familyId: string, contextTokens: number): Promise<void>;
	/** Load the active model. */
	start(): Promise<void>;
	/** User-initiated stop; `stopNow` cancels running responses instead of waiting for them. */
	stop(options: { readonly stopNow: boolean }): Promise<void>;
	/** Stop a previous, verified orphan server. */
	stopPrevious(): Promise<void>;
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

/** Whether on-device models are supported here: Linux needs glibc unless a `llama-server` path is set (no musl package build exists). */
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
