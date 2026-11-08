/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CopilotClient } from '@github/copilot-sdk';
import { disposableTimeout, raceCancellationError, raceTimeout } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { CancellationError, getErrorMessage, isCancellationError } from '../../../../base/common/errors.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { StopWatch } from '../../../../base/common/stopwatch.js';
import { localize } from '../../../../nls.js';
import { ILogService } from '../../../log/common/log.js';
import { AgentPolicyError } from '../../common/agent.js';
import { classifyCopilotClientOperationFailure } from './copilotFailureTelemetry.js';

export const AGENT_HOST_COPILOT_CLIENT_NAME = 'vscode-agent-host';
const COPILOT_MANAGED_SETTINGS_PROGRESS_DELAY_MS = 3500;
const COPILOT_MANAGED_SETTINGS_TIMEOUT_MS = 30_000;

type ManagedSettingsRpc = Pick<CopilotClient['rpc']['managedSettings'], 'resolve'>;
type ManagedSettingsResult = Awaited<ReturnType<ManagedSettingsRpc['resolve']>>;

/**
 * Receives the localized activity to show while a caller is still waiting on a
 * slow managed-settings query, and `undefined` once that caller stops waiting.
 */
export type CopilotManagedSettingsActivityReporter = (activity: string | undefined) => void;

interface IManagedSettingsWaiter {
	readonly report: CopilotManagedSettingsActivityReporter | undefined;
	shown: boolean;
}

interface IManagedSettingsQueryProgress {
	readonly elapsed: StopWatch;
	/** Whether the query has been pending long enough to tell its waiters. */
	delayed: boolean;
	readonly waiters: Set<IManagedSettingsWaiter>;
}

/**
 * Shares only in-flight queries; freshness, composition and cache fallback remain runtime-owned.
 *
 * A slow query is reported only to the callers that supply an activity reporter,
 * such as a turn that waits on it, so the wait is shown where that turn is shown
 * rather than as a standalone notification for every concurrent query.
 */
export class CopilotManagedSettingsResolver extends Disposable {
	private _pending = new WeakMap<ManagedSettingsRpc, Map<string, { promise: Promise<ManagedSettingsResult>; progress: IManagedSettingsQueryProgress }>>();
	private readonly _activeProgress = new Set<IManagedSettingsQueryProgress>();
	private readonly _generation = this._register(new MutableDisposable<CancellationTokenSource>());

	constructor(private readonly _logService: ILogService) {
		super();
		this._generation.value = new CancellationTokenSource();
	}

	invalidate(): void {
		this._generation.value?.cancel();
		this._generation.value = new CancellationTokenSource();
		this._pending = new WeakMap();
	}

	async resolve(rpc: ManagedSettingsRpc, token: string | undefined, workingDirectory?: string, cancellationToken = CancellationToken.None, reportActivity?: CopilotManagedSettingsActivityReporter): Promise<ManagedSettingsResult> {
		if (cancellationToken.isCancellationRequested || this._store.isDisposed) {
			throw new CancellationError();
		}
		let requests = this._pending.get(rpc);
		if (!requests) {
			requests = new Map();
			this._pending.set(rpc, requests);
		}
		const key = JSON.stringify([token, workingDirectory]);
		let pending = requests.get(key);
		if (!pending) {
			const generation = this._generation.value!.token;
			const progress: IManagedSettingsQueryProgress = { elapsed: StopWatch.create(false), delayed: false, waiters: new Set() };
			pending = {
				promise: this._resolve(rpc, token, workingDirectory, generation, progress).finally(() => requests.delete(key)),
				progress,
			};
			requests.set(key, pending);
		}
		const waiter: IManagedSettingsWaiter = { report: reportActivity, shown: false };
		pending.progress.waiters.add(waiter);
		if (pending.progress.delayed) {
			this._showProgress(waiter);
		}
		try {
			return await raceCancellationError(pending.promise, cancellationToken);
		} finally {
			pending.progress.waiters.delete(waiter);
			this._hideProgress(waiter);
		}
	}

	private _showProgress(waiter: IManagedSettingsWaiter): void {
		if (!waiter.report || waiter.shown) {
			return;
		}
		waiter.shown = true;
		waiter.report(localize('copilot.managedSettings.pending', "Loading your organization's managed settings"));
	}

	private _hideProgress(waiter: IManagedSettingsWaiter): void {
		if (waiter.shown) {
			waiter.shown = false;
			waiter.report?.(undefined);
		}
	}

	private async _resolve(rpc: ManagedSettingsRpc, token: string | undefined, workingDirectory: string | undefined, generation: CancellationToken, progress: IManagedSettingsQueryProgress): Promise<ManagedSettingsResult> {
		this._activeProgress.add(progress);
		const timer = disposableTimeout(() => {
			progress.delayed = true;
			this._logService.info('[Copilot] Waiting for runtime managed-settings resolution');
			for (const waiter of progress.waiters) {
				this._showProgress(waiter);
			}
		}, COPILOT_MANAGED_SETTINGS_PROGRESS_DELAY_MS);
		try {
			return await resolveCopilotManagedSettings(rpc, token, COPILOT_MANAGED_SETTINGS_TIMEOUT_MS, workingDirectory, generation);
		} catch (error) {
			if (generation.isCancellationRequested && !this._store.isDisposed) {
				throw new AgentPolicyError(localize('copilot.managedSettings.changed', "Your account or organization settings changed while loading. Please try again."));
			}
			throw error;
		} finally {
			timer.dispose();
			progress.delayed = false;
			for (const waiter of progress.waiters) {
				this._hideProgress(waiter);
			}
			this._activeProgress.delete(progress);
			this._logService.debug(`[Copilot] Runtime managed-settings query settled after ${Math.round(progress.elapsed.elapsed())}ms`);
		}
	}

	override dispose(): void {
		for (const progress of this._activeProgress) {
			for (const waiter of progress.waiters) {
				this._hideProgress(waiter);
			}
		}
		this._generation.value?.cancel();
		super.dispose();
	}
}

/** Resolves policy through the runtime without independently composing or validating model options. */
export async function resolveCopilotManagedSettings(
	managedSettings: ManagedSettingsRpc,
	token: string | undefined,
	timeoutMs: number,
	workingDirectory?: string,
	cancellationToken = CancellationToken.None,
): Promise<ManagedSettingsResult> {
	if (cancellationToken.isCancellationRequested) {
		throw new CancellationError();
	}
	try {
		const result = await raceCancellationError(raceTimeout(managedSettings.resolve({
			clientName: AGENT_HOST_COPILOT_CLIENT_NAME,
			...(token ? { gitHubToken: token } : {}),
			...(workingDirectory ? { workingDirectory } : {}),
		}), timeoutMs), cancellationToken);
		if (!result) {
			throw new AgentPolicyError(localize('copilot.managedSettings.timeout', "Loading your organization's managed settings took longer than {0} seconds. Please try again.", timeoutMs / 1000));
		}
		return result;
	} catch (error) {
		if (error instanceof AgentPolicyError || isCancellationError(error) || classifyCopilotClientOperationFailure(error)) {
			throw error;
		}
		throw new AgentPolicyError(localize('copilot.managedSettings.failed', "Unable to load your organization's managed settings. Please try again. {0}", getErrorMessage(error)), { cause: error });
	}
}
