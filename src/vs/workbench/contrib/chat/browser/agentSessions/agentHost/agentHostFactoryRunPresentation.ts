/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { localize } from '../../../../../../nls.js';
import { ISessionFactoryRun, ISessionFactoryRunPhase, isSessionFactoryRunTerminal, SessionFactoryRunPhaseStatus, SessionFactoryRunStatus } from '../../../../../../platform/agentHost/common/sessionFactoryRuns.js';

const spinningIcon = ThemeIcon.modify(Codicon.loading, 'spin');

export function getFactoryRunStatusIcon(status: SessionFactoryRunStatus): ThemeIcon {
	switch (status) {
		case SessionFactoryRunStatus.Pending: return Codicon.clock;
		case SessionFactoryRunStatus.Running: return spinningIcon;
		case SessionFactoryRunStatus.Completed: return Codicon.check;
		case SessionFactoryRunStatus.Halted: return Codicon.debugPause;
		case SessionFactoryRunStatus.Cancelled: return Codicon.circleSlash;
		case SessionFactoryRunStatus.Error: return Codicon.error;
	}
}

export function getFactoryRunStatusLabel(status: SessionFactoryRunStatus): string {
	switch (status) {
		case SessionFactoryRunStatus.Pending: return localize('factoryRun.status.pending', "Pending");
		case SessionFactoryRunStatus.Running: return localize('factoryRun.status.running', "Running");
		case SessionFactoryRunStatus.Completed: return localize('factoryRun.status.completed', "Completed");
		case SessionFactoryRunStatus.Halted: return localize('factoryRun.status.halted', "Halted");
		case SessionFactoryRunStatus.Cancelled: return localize('factoryRun.status.cancelled', "Cancelled");
		case SessionFactoryRunStatus.Error: return localize('factoryRun.status.error', "Error");
	}
}

export function getFactoryRunPhaseStatusLabel(status: SessionFactoryRunPhaseStatus): string {
	switch (status) {
		case SessionFactoryRunPhaseStatus.Pending: return localize('factoryRun.phase.pending', "Pending");
		case SessionFactoryRunPhaseStatus.Active: return localize('factoryRun.phase.active', "Active");
		case SessionFactoryRunPhaseStatus.Completed: return localize('factoryRun.phase.completed', "Completed");
		case SessionFactoryRunPhaseStatus.Skipped: return localize('factoryRun.phase.skipped', "Skipped");
	}
}

export function getFactoryRunPhaseStatusIcon(status: SessionFactoryRunPhaseStatus): ThemeIcon {
	switch (status) {
		case SessionFactoryRunPhaseStatus.Pending: return Codicon.circleLarge;
		case SessionFactoryRunPhaseStatus.Active: return spinningIcon;
		case SessionFactoryRunPhaseStatus.Completed: return Codicon.check;
		case SessionFactoryRunPhaseStatus.Skipped: return Codicon.circleSlash;
	}
}

/** Phase observations outlive execution; an active observation is not live after the run stops. */
export function getFactoryRunPhasePresentation(run: ISessionFactoryRun, phase: ISessionFactoryRunPhase): { state: string; label: string; icon: ThemeIcon } {
	if (isSessionFactoryRunTerminal(run.status)) {
		if (phase.status === SessionFactoryRunPhaseStatus.Active) {
			return { state: 'partial', label: localize('factoryRun.phase.partial', "Partial"), icon: Codicon.warning };
		}
		if (phase.status === SessionFactoryRunPhaseStatus.Pending) {
			const label = run.status === SessionFactoryRunStatus.Halted
				? localize('factoryRun.phase.notReachedHalted', "Not reached — run halted")
				: run.status === SessionFactoryRunStatus.Cancelled
					? localize('factoryRun.phase.notReachedCancelled', "Not reached — run cancelled")
					: run.status === SessionFactoryRunStatus.Error
						? localize('factoryRun.phase.notReachedError', "Not reached — run failed")
						: localize('factoryRun.phase.notReached', "Not reached");
			return { state: 'unreached', label, icon: Codicon.circleSlash };
		}
	}
	return { state: phase.status, label: getFactoryRunPhaseStatusLabel(phase.status), icon: getFactoryRunPhaseStatusIcon(phase.status) };
}

/** Compact duration such as `2m 23s` or `1h 4m`, or `-` when nothing has elapsed. */
export function formatFactoryDuration(ms: number): string {
	if (ms <= 0) {
		return '-';
	}
	const totalSeconds = Math.round(ms / 1000);
	if (totalSeconds < 60) {
		return localize('factoryRun.duration.seconds', "{0}s", Math.max(totalSeconds, 1));
	}
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;
	if (hours > 0) {
		return localize('factoryRun.duration.hoursMinutes', "{0}h {1}m", hours, minutes);
	}
	return seconds > 0
		? localize('factoryRun.duration.minutesSeconds', "{0}m {1}s", minutes, seconds)
		: localize('factoryRun.duration.minutes', "{0}m", minutes);
}

/** Formats an AI credit amount with sensible precision for small balances. */
export function formatFactoryCredits(credits: number): string {
	if (credits === 0) {
		return '0';
	}
	if (credits >= 100) {
		return Math.round(credits).toLocaleString();
	}
	return credits.toLocaleString(undefined, { maximumFractionDigits: credits >= 10 ? 1 : 2 });
}

/** The phase a fresh detail view should open on: the active one, else the last entered, else the first. */
export function selectDefaultFactoryRunPhase(run: ISessionFactoryRun): ISessionFactoryRunPhase | undefined {
	if (run.currentPhaseId) {
		const current = run.phases.find(phase => phase.id === run.currentPhaseId);
		if (current) {
			return current;
		}
	}
	const active = run.phases.find(phase => phase.status === SessionFactoryRunPhaseStatus.Active);
	if (active) {
		return active;
	}
	const entered = run.phases.filter(phase => phase.status === SessionFactoryRunPhaseStatus.Completed);
	return entered.at(-1) ?? run.phases[0];
}

/** One-line summary shown beside a run in the pill dropdown. */
export function describeFactoryRun(run: ISessionFactoryRun): string {
	const status = getFactoryRunStatusLabel(run.status);
	const phase = run.currentPhaseId ? run.phases.find(candidate => candidate.id === run.currentPhaseId) : undefined;
	if (run.status === SessionFactoryRunStatus.Running && phase) {
		return run.liveAgentCount > 0
			? localize('factoryRun.describe.runningWithAgents', "{0} · {1} · {2} live agents", status, phase.title, run.liveAgentCount)
			: localize('factoryRun.describe.running', "{0} · {1}", status, phase.title);
	}
	const duration = formatFactoryDuration(run.usage.activeMs);
	return run.totalSpawnedAgentCount === 1
		? localize('factoryRun.describe.settledSingle', "{0} · 1 agent · {1}", status, duration)
		: localize('factoryRun.describe.settled', "{0} · {1} agents · {2}", status, run.totalSpawnedAgentCount, duration);
}
