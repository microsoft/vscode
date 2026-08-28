/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceTimeout } from '../../../base/common/async.js';
import { getErrorMessage } from '../../../base/common/errors.js';
import { IAgentHostManagedSettingsDiagnostics } from '../../../platform/agentHost/common/agentService.js';
import { markdownDetails, markdownJsonBlock, markdownText } from './policyDiagnosticsMarkdown.js';

/**
 * Outcome of a single policy diagnostics probe. Probes are never allowed to
 * abort the report: a hung or failing dependency is reported as data instead.
 */
export type PolicyDiagnosticsProbeResult<T> =
	| { readonly kind: 'ok'; readonly value: T }
	| { readonly kind: 'timeout'; readonly timeoutMs: number }
	| { readonly kind: 'error'; readonly message: string };

/**
 * Run `probe` under a bounded `timeoutMs`, converting a hang, a rejection or a
 * synchronous throw into a {@link PolicyDiagnosticsProbeResult}. Never rejects.
 */
export async function probePolicyDiagnostics<T>(probe: () => Promise<T>, timeoutMs: number): Promise<PolicyDiagnosticsProbeResult<T>> {
	try {
		// Box the value so that a resolved `undefined` is not mistaken for a timeout.
		const boxed = await raceTimeout(Promise.resolve(probe()).then(value => ({ value })), timeoutMs);
		if (!boxed) {
			return { kind: 'timeout', timeoutMs };
		}
		return { kind: 'ok', value: boxed.value };
	} catch (error) {
		return { kind: 'error', message: getErrorMessage(error) };
	}
}

/**
 * Short, human readable reason for a failed probe, suitable for the summary
 * table. Returns `undefined` when the probe succeeded.
 */
export function describeProbeFailure(result: PolicyDiagnosticsProbeResult<unknown>): string | undefined {
	switch (result.kind) {
		case 'ok': return undefined;
		case 'timeout': return `Timed out after ${result.timeoutMs}ms`;
		case 'error': return `Unavailable (${result.message})`;
	}
}

/**
 * Markdown note explaining why a section could not be filled in. Returns an
 * empty string when the probe succeeded.
 */
export function probeFailureMarkdown(label: string, result: PolicyDiagnosticsProbeResult<unknown>, hint?: string): string {
	const reason = describeProbeFailure(result);
	if (!reason) {
		return '';
	}
	const suffix = hint ? ` ${hint}` : '';
	return `*${markdownText(label)} is unavailable: ${markdownText(reason)}. The rest of this report was generated without it.${markdownText(suffix)}*\n\n`;
}

export interface IPolicyDiagnosticsSection {
	readonly summary: string;
	readonly content: string;
}

/**
 * Render the agent runtime (provider SDK) managed-settings section. Every probe
 * outcome, including a hung SDK, produces content.
 */
export function renderAgentRuntimeSection(result: PolicyDiagnosticsProbeResult<readonly IAgentHostManagedSettingsDiagnostics[]>): IPolicyDiagnosticsSection {
	if (result.kind !== 'ok') {
		return {
			summary: describeProbeFailure(result)!,
			content: probeFailureMarkdown(
				'Agent runtime managed-settings resolution',
				result,
				'Check the Agent Host log for a stalled or failing provider SDK.'
			)
		};
	}

	const diagnostics = result.value;
	if (diagnostics.length === 0) {
		return {
			summary: 'No provider diagnostics',
			content: '*No agent provider exposes managed-settings diagnostics.*\n\n'
		};
	}

	const failedProviderCount = diagnostics.filter(diagnostic => diagnostic.error).length;
	let content = '';
	for (const diagnostic of diagnostics) {
		content += `#### ${markdownText(diagnostic.provider)}\n\n`;
		if (diagnostic.error) {
			content += `*Probe failed: ${markdownText(diagnostic.error)}*\n\n`;
		} else {
			content += markdownDetails('Resolved settings snapshot', markdownJsonBlock(diagnostic.snapshot));
		}
	}

	return {
		summary: `${diagnostics.length} ${diagnostics.length === 1 ? 'provider' : 'providers'}, ${failedProviderCount} failed`,
		content
	};
}

/**
 * Probe the agent runtime for managed-settings diagnostics under a bounded
 * timeout and render the resulting section.
 */
export async function collectAgentRuntimeSection(probe: () => Promise<readonly IAgentHostManagedSettingsDiagnostics[]>, timeoutMs: number): Promise<IPolicyDiagnosticsSection> {
	return renderAgentRuntimeSection(await probePolicyDiagnostics(probe, timeoutMs));
}
