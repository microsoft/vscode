/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { agentHostPolicyReadiness, markdownDetails, markdownJsonBlock, markdownTable, policyDiagnosticsReport } from '../../../browser/actions/policyDiagnosticsMarkdown.js';

suite('Policy diagnostics Markdown', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('readiness names applied concerns and explains the existing harness policy without changing it', () => {
		const output = agentHostPolicyReadiness([
			{ policyName: 'ChatMCP', settingId: 'chat.mcp.access', status: 'partial', source: 'Device' },
			{ policyName: 'CopilotOtelHeaders', settingId: 'chat.agentHost.otel.headers', status: 'partial', source: 'Managed Settings: Server' },
		], true);
		assert.deepStrictEqual({
			heading: output.includes('## Agent Host Policy Readiness'),
			policy: output.includes('| ChatMCP | chat.mcp.access | Device |'),
			impact: output.includes('discover and run MCP servers'),
			headers: output.includes('Export requiring those headers may fail'),
			preference: output.includes('ChatEditorPreferCopilotHarness') && output.includes('disabling it does not require Local'),
			sandbox: output.includes('Local cannot satisfy this runtime sandbox requirement'),
			diagnosticOnly: output.includes('Opening this report has no effect on selection'),
		}, { heading: true, policy: true, impact: true, headers: true, preference: true, sandbox: true, diagnosticOnly: true });
	});

	test('an empty readiness result does not claim complete runtime parity', () => {
		const output = agentHostPolicyReadiness([], false);
		assert.deepStrictEqual({
			empty: output.includes('No known unsupported requirements'),
			limits: output.includes('user settings and unprojected runtime managed settings are outside this check'),
			table: output.includes('| Impact / What to Verify |'),
		}, { empty: true, limits: true, table: false });
	});

	test('partial coverage is not presented as a confirmed failure for the applied source', () => {
		const output = agentHostPolicyReadiness([
			{ policyName: 'ChatAllowManagedMcpServersOnly', settingId: 'chat.mcp.allowManagedServersOnly', status: 'partial', source: 'Managed Settings: Server' },
		], false);
		assert.ok(output.includes('### Applied requirements needing verification (1)'));
		assert.ok(output.includes('not a finding that your current source or session fails'));
		assert.ok(output.includes('| ChatAllowManagedMcpServersOnly | chat.mcp.allowManagedServersOnly | Managed Settings: Server |'));
		assert.ok(output.includes('preference, not a harness lock'));
		assert.ok(!output.includes('### Applied requirements not enforced'));
		assert.ok(!output.includes('CopilotOtel'));
	});

	test('unsupported requirements are separated from conditional coverage', () => {
		const output = agentHostPolicyReadiness([
			{ policyName: 'ChatHooks', settingId: 'chat.useHooks', status: 'notEnforced', source: 'Device' },
			{ policyName: 'CopilotOtelEnabled', settingId: 'chat.agentHost.otel.enabled', status: 'partial', source: 'Device' },
		], false);
		const unsupported = output.slice(output.indexOf('### Applied requirements not enforced'), output.indexOf('### Applied requirements needing verification'));
		assert.ok(unsupported.includes('| ChatHooks |'));
		assert.ok(!unsupported.includes('CopilotOtelEnabled'));
		assert.ok(output.includes('### Applied requirements not enforced by Agent Host (1)'));
		assert.ok(output.includes('### Applied requirements needing verification (1)'));
	});

	test('merged host fixes are shown as verification concerns, not missing enforcement', () => {
		const output = agentHostPolicyReadiness([
			{ policyName: 'ChatAgentSandboxEnabled', settingId: 'chat.agent.sandbox.enabled', status: 'partial', source: 'Device' },
			{ policyName: 'CopilotOtelCaptureIdentity', settingId: 'chat.agentHost.otel.captureIdentity', status: 'partial', source: 'Device' },
		], false);
		assert.deepStrictEqual({
			verification: output.includes('### Applied requirements needing verification (2)'),
			unsupported: output.includes('### Applied requirements not enforced'),
			sandboxFloor: output.includes('blocks direct session Off overrides on macOS/Linux'),
			sandboxLifecycle: output.includes('across disconnect-grace expiry'),
			hostIdentity: output.includes('The Agent Host pipeline honors identity capture and suppression.'),
			runtimeAttribution: output.includes('requires a runtime update and end-to-end verification'),
		}, {
			verification: true,
			unsupported: false,
			sandboxFloor: true,
			sandboxLifecycle: true,
			hostIdentity: true,
			runtimeAttribution: true,
		});
	});

	test('readiness follows all existing diagnostic sections without changing their layout', () => {
		const readiness = agentHostPolicyReadiness([
			{ policyName: 'ChatMCP', settingId: 'chat.mcp.access', status: 'partial', source: 'Device' },
		], false);
		const headings = ['Summary', 'System Information', 'Account Information', 'Account Policy Gate', 'Managed Settings', 'Agent Runtime Resolution', 'Authentication Information'];
		const details = headings.map(heading => `## ${heading}\n\n`).join('') +
			markdownDetails('Non-applied policy inventory', 'CopilotOtelHeaders') +
			markdownDetails('Raw values', markdownJsonBlock({ rawPolicyValue: 'sensitive-placeholder' }));
		const report = policyDiagnosticsReport(readiness, details);
		const visible = report.slice(0, report.indexOf('<details>'));
		assert.ok(report.startsWith('# VS Code Policy Diagnostics\n\n*WARNING: This file may contain sensitive information.*\n\n## Summary\n\n'));
		assert.strictEqual(report.slice(report.indexOf('## Summary'), report.indexOf('## Agent Host Policy Readiness')), details);
		for (const heading of headings) {
			assert.ok(visible.includes(`## ${heading}`), heading);
		}
		assert.ok(!visible.includes('CopilotOtel'));
		assert.ok(!visible.includes('sensitive-placeholder'));
		assert.ok(report.includes('<details>\n<summary>Non-applied policy inventory'));
		assert.ok(!report.includes('<details open'));
		assert.ok(report.endsWith(`</details>\n\n${readiness}`));
		assert.ok(readiness.includes('ChatMCP'));
	});

	test('readiness escapes applied-source labels and never renders policy values', () => {
		const gap = { policyName: 'ChatMCP', settingId: 'chat.mcp.access', status: 'partial' as const, source: '<script>|source', policyValue: 'sensitive-placeholder' };
		const output = agentHostPolicyReadiness([gap], false);
		assert.ok(output.includes('&lt;script&gt;\\|source'));
		assert.ok(!output.includes('<script>'));
		assert.ok(!output.includes('sensitive-placeholder'));
	});

	test('all gaps remain report-only regardless of the runtime sandbox requirement', () => {
		const gaps = [
			{ policyName: 'ChatHooks', settingId: 'chat.useHooks', status: 'notEnforced' as const, source: 'Device' },
			{ policyName: 'ChatAllowManagedMcpServersOnly', settingId: 'chat.mcp.allowManagedServersOnly', status: 'partial' as const, source: 'Managed Settings: Server' },
		];
		for (const sandboxRequired of [false, true]) {
			const output = agentHostPolicyReadiness(gaps, sandboxRequired);
			assert.deepStrictEqual({
				hooks: output.includes('| ChatHooks |'),
				mcp: output.includes('| ChatAllowManagedMcpServersOnly |'),
				reportOnly: output.includes('report-only: they do not hold users on Local'),
				selection: output.includes('Existing rollout, preferences, explicit choices, and sessions are unchanged'),
				enforcement: output.includes('Supported bridge restrictions remain enforced'),
				requiredSandbox: output.includes('Local cannot satisfy this runtime sandbox requirement'),
				migrationRole: output.includes('Migration Role'),
				acceptance: output.includes('acceptPolicyGaps'),
				blocker: output.includes('Blocker'),
			}, { hooks: true, mcp: true, reportOnly: true, selection: true, enforcement: true, requiredSandbox: sandboxRequired, migrationRole: false, acceptance: false, blocker: false });
		}
	});

	test('renders escaped tables and collapsed details', () => {
		const output = markdownTable(
			['Property', 'Value'],
			[
				['pipe|name', 'line 1\n- line 2 <script>*'],
				['bracket[one]', 'A & B']
			]
		) + markdownDetails('Raw <settings> & values', markdownJsonBlock({ value: 'raw' }));

		assert.deepStrictEqual(output.split('\n'), [
			'| Property | Value |',
			'| --- | --- |',
			'| pipe\\|name | line 1<br>\\- line 2 &lt;script&gt;\\* |',
			'| bracket\\[one\\] | A &amp; B |',
			'',
			'<details>',
			'<summary>Raw &lt;settings&gt; &amp; values</summary>',
			'',
			'```json',
			'{',
			'  "value": "raw"',
			'}',
			'```',
			'',
			'</details>',
			'',
			''
		]);
	});
});
