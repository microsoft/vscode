/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { appendEscapedMarkdownCodeBlockFence, escapeMarkdownSyntaxTokens } from '../../../base/common/htmlContent.js';
import { escape } from '../../../base/common/strings.js';
import { localize } from '../../../nls.js';
import { getAgentHostPolicyGapImpact, IAgentHostPolicyGap } from '../../../platform/agentHost/common/agentHostPolicyReadiness.js';

export interface IAgentHostPolicyReadinessGap extends IAgentHostPolicyGap {
	readonly source: string;
}

export function agentHostPolicyReadiness(gaps: readonly IAgentHostPolicyReadinessGap[], managedSandboxEnforced: boolean): string {
	let content = `## ${localize('policyReadiness.title', "Agent Host Policy Readiness")}\n\n`;
	content += localize('policyReadiness.scope', "Only requirements from your currently applied enterprise policies are shown here. Unconfigured policies and known permissive values are excluded. This check covers Copilot Agent Host on this machine, not remote hosts, Claude, or Codex.") + '\n\n';
	const notEnforced = gaps.filter(gap => gap.status === 'notEnforced');
	const needsVerification = gaps.filter(gap => gap.status !== 'notEnforced');
	const gapTable = (entries: readonly IAgentHostPolicyReadinessGap[]): string => markdownTable(
		[localize('policyReadiness.policy', "Policy"), localize('policyReadiness.setting', "Setting"), localize('policyReadiness.source', "Applied Source"), localize('policyReadiness.impact', "Impact / What to Verify")],
		entries.map(gap => [gap.policyName, gap.settingId, gap.source, getAgentHostPolicyGapImpact(gap.policyName)])
	);
	if (gaps.length === 0) {
		content += localize('policyReadiness.noGaps', "No known unsupported requirements were found in the applied VS Code policies. This does not establish full runtime policy parity; user settings and unprojected runtime managed settings are outside this check.") + '\n\n';
	}
	if (notEnforced.length > 0) {
		content += `### ${localize('policyReadiness.notEnforced', "Applied requirements not enforced by Agent Host")} (${notEnforced.length})\n\n`;
		content += gapTable(notEnforced);
	}
	if (needsVerification.length > 0) {
		content += `### ${localize('policyReadiness.needsVerification', "Applied requirements needing verification")} (${needsVerification.length})\n\n`;
		content += localize('policyReadiness.conditional', "These policies have incomplete coverage for some paths or delivery sources. This is not a finding that your current source or session fails to enforce them. Check the conditions below; a runtime-managed value may already be enforced even when its VS Code-only equivalent is not.") + '\n\n';
		content += gapTable(needsVerification);
	}
	content += `### ${localize('policyReadiness.rollout', "Rollout and harness selection")}\n\n`;
	content += localize('policyReadiness.reportOnly', "These findings are report-only: they do not hold users on Local, change experiment enrollment or harness selection, block messages, or add Chat banners. Existing rollout, preferences, explicit choices, and sessions are unchanged. Opening this report has no effect on selection. Supported bridge restrictions remain enforced.") + '\n\n';
	content += (managedSandboxEnforced
		? localize('policyReadiness.runtimeSandboxRequired', "An enterprise-required Agent Host sandbox is active. Local cannot satisfy this runtime sandbox requirement.")
		: localize('policyReadiness.runtimeSandboxNotRequired', "No enterprise-required Agent Host sandbox is active.")) + '\n\n';
	content += localize('policyReadiness.harnessPolicy', "ChatEditorPreferCopilotHarness controls chat.editor.preferCopilotHarness: enabling it prefers Copilot when a new chat would otherwise use Local. Setting the policy to false ignores experiment defaults for chat.defaultToCopilotHarness and chat.editor.localAgent.enabled, while preserving explicit configuration of those settings and defaults from other sources. It is a preference, not a harness lock; explicit, remembered, and inherited harness choices are preserved. Existing sessions and the enterprise-required sandbox behavior are unchanged. Requiring a particular harness needs a separate enforcement contract, not an inference from this readiness report.") + '\n\n';
	return content;
}

export function policyDiagnosticsReport(readiness: string, diagnosticSections: string): string {
	return '# VS Code Policy Diagnostics\n\n' +
		'*WARNING: This file may contain sensitive information.*\n\n' +
		diagnosticSections +
		readiness;
}

function escapeMarkdownText(value: string): string {
	return escapeMarkdownSyntaxTokens(escape(value));
}

export function markdownText(value: string): string {
	return escapeMarkdownText(value).replace(/\r?\n/g, ' ');
}

function markdownTableCell(value: string): string {
	return escapeMarkdownText(value)
		.replace(/\r?\n/g, '<br>')
		.replace(/\|/g, '\\|');
}

export function markdownTable(headers: readonly string[], rows: readonly (readonly string[])[]): string {
	for (const row of rows) {
		if (row.length !== headers.length) {
			throw new Error(`Markdown table row has ${row.length} cells; expected ${headers.length}.`);
		}
	}

	const lines = [
		`| ${headers.map(markdownTableCell).join(' | ')} |`,
		`| ${headers.map(() => '---').join(' | ')} |`,
		...rows.map(row => `| ${row.map(markdownTableCell).join(' | ')} |`)
	];
	return `${lines.join('\n')}\n\n`;
}

export function markdownJsonBlock(value: unknown): string {
	const serialized = JSON.stringify(value ?? {}, null, 2) ?? 'null';
	return `${appendEscapedMarkdownCodeBlockFence(serialized, 'json')}\n\n`;
}

export function markdownDetails(summary: string, content: string): string {
	const safeSummary = escape(summary).replace(/\r?\n/g, ' ');
	return `<details>\n<summary>${safeSummary}</summary>\n\n${content.trimEnd()}\n\n</details>\n\n`;
}
