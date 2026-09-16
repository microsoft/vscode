/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise } from '../../../../../../base/common/async.js';
import { Disposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../../nls.js';
import { type ProgressParams } from '../../../../../../platform/agentHost/common/state/sessionActions.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IProgressService, IProgressStep, ProgressLocation } from '../../../../../../platform/progress/common/progress.js';
import { ChatAIDisabledSettingId } from '../../../common/constants.js';

/**
 * One in-flight download tracked by {@link AgentHostDownloadProgress}. Owns the
 * lifecycle of a single notification progress: `report` pushes a step,
 * `complete` resolves the backing deferred so the notification is dismissed.
 */
interface IActiveDownload {
	/** Last reported determinate percentage, used to compute progress increments. */
	lastPercent: number;
	report(step: IProgressStep): void;
	complete(): void;
}

/** Renders AHP progress for SDK downloads and other session preparation without assuming progress units. */
export class AgentHostDownloadProgress extends Disposable {

	/**
	 * Active progress indicators keyed by `progressToken`. The host emits a
	 * single stream per download keyed by the download's own stable identity
	 * (so distinct sessions of a provider share one indicator). Each entry owns
	 * one long-running notification progress (opened on the first frame), driven
	 * via {@link IActiveDownload.report} and dismissed via
	 * {@link IActiveDownload.complete} once `progress >= total`.
	 */
	private readonly _activeDownloads = new Map<string, IActiveDownload>();

	constructor(
		@IProgressService private readonly _progressService: IProgressService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
	) {
		super();
		this._register(toDisposable(() => {
			for (const download of this._activeDownloads.values()) {
				download.complete();
			}
			this._activeDownloads.clear();
		}));
	}

	handleProgress(progress: ProgressParams): void {
		// New AI UI must stay hidden when the user has turned AI features off.
		if (this._configurationService.getValue<boolean>(ChatAIDisabledSettingId)) {
			return;
		}

		// Complete when we reach the (possibly server-synthesized) total. The
		// host emits a terminal frame with `progress === total` for success,
		// indeterminate completion, and failure alike; real errors surface via
		// the session-failure path, not here.
		const isComplete = progress.total !== undefined && progress.progress >= progress.total;
		if (isComplete) {
			this._activeDownloads.get(progress.progressToken)?.complete();
			this._activeDownloads.delete(progress.progressToken);
			return;
		}

		let entry = this._activeDownloads.get(progress.progressToken);
		if (!entry) {
			// First frame for this download: open one long-running notification
			// progress and drive it via `report` until a terminal frame resolves
			// `deferred`. `message` is the host-supplied, already-localized title
			// (e.g. "Downloading Claude Agent"); render it verbatim so this stays
			// a generic indicator that makes no assumption about what's downloading.
			const deferred = new DeferredPromise<void>();
			let report: ((step: IProgressStep) => void) | undefined;
			const title = progress.message ?? localize('agentHost.progress.titleFallback', "Preparing Session");
			this._progressService.withProgress(
				{
					location: ProgressLocation.Notification,
					title,
				},
				p => {
					report = step => p.report(step);
					return deferred.p;
				},
			);
			entry = {
				lastPercent: 0,
				report: step => report?.(step),
				complete: () => deferred.complete(),
			};
			this._activeDownloads.set(progress.progressToken, entry);
		}

		if (progress.total && progress.total > 0) {
			const percent = Math.max(0, Math.min(100, Math.round((progress.progress / progress.total) * 100)));
			const increment = percent - entry.lastPercent;
			entry.lastPercent = percent;
			entry.report({
				message: localize('agentHost.download.percent', "{0}%", percent),
				increment: increment > 0 ? increment : 0,
				total: 100,
			});
		} else {
			entry.report({ message: progress.message ?? localize('agentHost.progress.indeterminate', "Working...") });
		}
	}
}
