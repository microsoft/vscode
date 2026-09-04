/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILogService } from '../../log/common/log.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import type { IAgentHostCopilotSkuClassification, IAgentHostCopilotSkuTelemetry } from './agentHostTelemetryReporter.js';
import type { IAgentSdkDownloadProgress } from './agentSdkDownloader.js';

// #region Failure classification

/**
 * Coarse bucket for a failed SDK fetch. A closed set: the downloader's own error
 * strings carry the CDN URL and the cache path, so the raw message can never be
 * the reported reason. `notConfigured` and `unsupportedTarget` describe a build
 * that cannot fetch this SDK at all, so a non-zero count is a signal in itself.
 */
export type AgentSdkDownloadFailureReason =
	| 'cancelled'
	| 'network'
	| 'filesystem'
	| 'extract'
	| 'notConfigured'
	| 'unsupportedTarget'
	| 'unknown';

/**
 * Order matters. Network before extraction, because an HTTP failure message
 * embeds the tarball URL and would otherwise match an archive-shaped hint;
 * filesystem errnos before network, because they are unambiguous where a bare
 * `EACCES` from a proxy is not.
 */
const FAILURE_HINTS: readonly (readonly [AgentSdkDownloadFailureReason, readonly string[]])[] = [
	['notConfigured', ['no `product.agentSdks', 'unknown placeholder']],
	['unsupportedTarget', ['no SDK target for this host']],
	['filesystem', ['ENOSPC', 'EACCES', 'EPERM', 'EROFS', 'EBUSY', 'EMFILE', 'ENAMETOOLONG', 'EXDEV']],
	['network', ['HTTP ', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EPROTO', 'ECONNABORTED', 'socket hang up', 'certificate', 'tunneling socket', 'getaddrinfo']],
	['extract', ['TAR_', 'zlib', 'gzip', 'unexpected end of file', 'incorrect header check', 'invalid entry']],
];

/**
 * Bucket a downloader failure message. Substring matching, because the messages
 * are assembled from Node errnos, `node-tar` diagnostics and our own wrappers —
 * none of which carry a stable code by the time they arrive here. Anything
 * unrecognised is `unknown` rather than guessed at: a rising `unknown` share is
 * the signal to add a hint, which a neighbouring bucket would hide.
 */
export function classifyAgentSdkDownloadFailure(error: string | undefined): AgentSdkDownloadFailureReason {
	if (!error) {
		return 'unknown';
	}
	// The downloader reports cancellation as this exact token, not as a message.
	if (error === 'cancelled') {
		return 'cancelled';
	}
	const haystack = error.toLowerCase();
	for (const [reason, hints] of FAILURE_HINTS) {
		if (hints.some(hint => haystack.includes(hint.toLowerCase()))) {
			return reason;
		}
	}
	return 'unknown';
}

// #endregion

// #region Telemetry

interface IAgentSdkDownloadEvent extends IAgentHostCopilotSkuTelemetry {
	packageId: string;
	phase: string;
	failureReason: string;
	explicitlyRequested: boolean;
	durationMs: number;
	receivedBytes: number;
	totalBytes: number;
}

type AgentSdkDownloadClassification = IAgentHostCopilotSkuClassification & {
	packageId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Which agent SDK was being fetched, e.g. claude or codex.' };
	phase: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the download started, completed, or failed.' };
	failureReason: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Coarse bucket for a failed download (cancelled, network, filesystem, extract, notConfigured, unsupportedTarget, unknown). Empty unless the phase is failed.' };
	explicitlyRequested: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the setup flow drove this download and showed its progress — a click, or a quiet re-fetch under standing consent — as opposed to a background fetch nobody was watching.' };
	durationMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'How long the download had been running when it reached this phase.' };
	receivedBytes: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Bytes fetched by the time this phase was reached.' };
	totalBytes: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Total size the server advertised, or zero when it did not.' };
	owner: 'TylerLeonhardt';
	comment: 'The middle of the agent SDK setup funnel: whether an offered download is actually attempted, and whether it works.';
};

/**
 * Report one endpoint of a download. Callers pass only terminal and `started`
 * frames; the throttled `progress` frames are not counted.
 * `explicitlyRequested` splits setup-driven downloads from background ones, not
 * clicks from standing consent — both hold a progress interest. That split is
 * the funnel's own `downloadClicked` / `consentedDownload` steps.
 */
export function reportAgentSdkDownload(
	telemetryService: ITelemetryService,
	logService: ILogService,
	progress: IAgentSdkDownloadProgress,
	durationMs: number,
): void {
	const failureReason = progress.phase === 'failed' ? classifyAgentSdkDownloadFailure(progress.error) : '';
	telemetryService.publicLog2<IAgentSdkDownloadEvent, AgentSdkDownloadClassification>('agentHost.agentSdkDownload', {
		packageId: progress.packageId,
		phase: progress.phase,
		failureReason,
		explicitlyRequested: progress.explicitlyRequested,
		durationMs,
		receivedBytes: progress.receivedBytes,
		totalBytes: progress.totalBytes ?? 0,
	});
	logService.info(
		`[AgentSdkDownloader] ${progress.packageId}: ${progress.phase}`
		+ ` (explicit=${progress.explicitlyRequested}, bytes=${progress.receivedBytes}/${progress.totalBytes ?? 'unknown'}, ms=${durationMs}`
		+ `${failureReason ? `, reason=${failureReason}` : ''})`,
	);
}

// #endregion
