/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CopilotClient } from '@github/copilot-sdk';
import { disposableTimeout, raceCancellationError, raceTimeout } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { CancellationError, getErrorMessage, isCancellationError } from '../../../../base/common/errors.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { StopWatch } from '../../../../base/common/stopwatch.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { ILogService } from '../../../log/common/log.js';
import { AgentPolicyError } from '../../common/agent.js';
import type { ProgressParams } from '../../common/state/sessionActions.js';
import { classifyCopilotClientOperationFailure } from './copilotFailureTelemetry.js';

export const AGENT_HOST_COPILOT_CLIENT_NAME = 'vscode-agent-host';
const COPILOT_MANAGED_SETTINGS_PROGRESS_DELAY_MS = 3500;
const COPILOT_MANAGED_SETTINGS_TIMEOUT_MS = 30_000;

type ManagedSettingsRpc = Pick<CopilotClient['rpc']['managedSettings'], 'resolve'>;
type ManagedSettingsResult = Awaited<ReturnType<ManagedSettingsRpc['resolve']>>;

interface IManagedSettingsQueryProgress {
	readonly elapsed: StopWatch;
	waiters: number;
	progressToken?: string;
}

/** Shares only in-flight queries; freshness, composition and cache fallback remain runtime-owned. */
export class CopilotManagedSettingsResolver extends Disposable {
	private _pending = new WeakMap<ManagedSettingsRpc, Map<string, { promise: Promise<ManagedSettingsResult>; progress: IManagedSettingsQueryProgress }>>();
	private readonly _activeProgress = new Set<IManagedSettingsQueryProgress>();
	private readonly _generation = this._register(new MutableDisposable<CancellationTokenSource>());
	private readonly _onDidReportProgress = this._register(new Emitter<Omit<ProgressParams, 'channel'>>());
	readonly onDidReportProgress = this._onDidReportProgress.event;

	constructor(private readonly _logService: ILogService) {
		super();
		this._generation.value = new CancellationTokenSource();
	}

	invalidate(): void {
		this._generation.value?.cancel();
		this._generation.value = new CancellationTokenSource();
		this._pending = new WeakMap();
	}

	async resolve(rpc: ManagedSettingsRpc, token: string | undefined, workingDirectory?: string, cancellationToken = CancellationToken.None): Promise<ManagedSettingsResult> {
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
			const progress: IManagedSettingsQueryProgress = { elapsed: StopWatch.create(false), waiters: 0 };
			pending = {
				promise: this._resolve(rpc, token, workingDirectory, generation, progress).finally(() => requests.delete(key)),
				progress,
			};
			requests.set(key, pending);
		}
		pending.progress.waiters++;
		if (pending.progress.elapsed.elapsed() >= COPILOT_MANAGED_SETTINGS_PROGRESS_DELAY_MS) {
			this._showProgress(pending.progress);
		}
		try {
			return await raceCancellationError(pending.promise, cancellationToken);
		} finally {
			if (--pending.progress.waiters === 0) {
				this._hideProgress(pending.progress);
			}
		}
	}

	private _showProgress(progress: IManagedSettingsQueryProgress): void {
		if (progress.waiters === 0 || progress.progressToken) {
			return;
		}
		progress.progressToken = generateUuid();
		this._logService.info('[Copilot] Waiting for runtime managed-settings resolution');
		this._onDidReportProgress.fire({
			progressToken: progress.progressToken, progress: 0,
			message: localize('copilot.managedSettings.pending', "Loading your organization's managed settings"),
		});
	}

	private _hideProgress(progress: IManagedSettingsQueryProgress): void {
		if (progress.progressToken) {
			this._onDidReportProgress.fire({ progressToken: progress.progressToken, progress: 1, total: 1 });
			progress.progressToken = undefined;
		}
	}

	private async _resolve(rpc: ManagedSettingsRpc, token: string | undefined, workingDirectory: string | undefined, generation: CancellationToken, progress: IManagedSettingsQueryProgress): Promise<ManagedSettingsResult> {
		this._activeProgress.add(progress);
		const timer = disposableTimeout(() => this._showProgress(progress), COPILOT_MANAGED_SETTINGS_PROGRESS_DELAY_MS);
		try {
			return await resolveCopilotManagedSettings(rpc, token, COPILOT_MANAGED_SETTINGS_TIMEOUT_MS, workingDirectory, generation);
		} catch (error) {
			if (generation.isCancellationRequested && !this._store.isDisposed) {
				throw new AgentPolicyError(localize('copilot.managedSettings.changed', "Your account or organization settings changed while loading. Please try again."));
			}
			throw error;
		} finally {
			timer.dispose();
			this._hideProgress(progress);
			this._activeProgress.delete(progress);
			this._logService.debug(`[Copilot] Runtime managed-settings query settled after ${Math.round(progress.elapsed.elapsed())}ms`);
		}
	}

	override dispose(): void {
		for (const progress of this._activeProgress) {
			this._hideProgress(progress);
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
