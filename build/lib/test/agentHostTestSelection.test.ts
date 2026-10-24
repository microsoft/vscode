/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { suite, test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { load } from 'js-yaml';
import * as ts from 'typescript';
import { detectAgentHostE2EChanges } from '../../../.github/actions/detect-agent-host-e2e-changes/detect.ts';

const repositoryRoot = path.resolve(import.meta.dirname, '../../..');
const profilePath = path.join(repositoryRoot, 'src/vs/platform/agentHost/test/node/agentHostTestProfile.ts');
const nodeRequire = createRequire(import.meta.url);
const runner: {
	suites: readonly { id: string; label: string; file: string }[];
	suiteArguments(args: readonly string[], suite: { id: string; label: string; file: string }): readonly string[];
} = nodeRequire('../../../test/integration/agentHost/runner.ts');

suite('Copilot E2E worker partitions', () => {
	const workers = runner.suites.filter(item => item.id === 'copilot' || item.id === 'copilot-runtime');
	const titles = [
		'Agent Host E2E — Copilot retains context across consecutive turns',
		'Agent Host E2E — Copilot managed settings: read denial',
		'Agent Host E2E — Copilot runtime coverage shell: verifies exact command',
		'Agent Host E2E — Copilot MCP runtime coverage mcp: preserves resources',
	];

	test('the two mandatory workers select disjoint and exhaustive cases without changing the entrypoint', () => {
		assert.deepStrictEqual({
			firstWorkers: runner.suites.slice(0, 2).map(worker => worker.id),
			workers: workers.map(item => ({ id: item.id, file: item.file })),
			selections: titles.map(title => workers.map(worker => {
				const args = runner.suiteArguments([], worker);
				return new RegExp(args[args.indexOf('--grep') + 1]).test(title);
			})),
		}, {
			firstWorkers: ['copilot', 'copilot-runtime'],
			workers: ['copilot', 'copilot-runtime'].map(id => ({
				id, file: 'src/vs/platform/agentHost/test/node/e2e/providers/copilotAgentHostE2E.integrationTest.ts',
			})),
			selections: [[true, false], [true, false], [false, true], [false, true]],
		});
	});

	test('focused and inverted selections intersect each worker rather than escaping its partition', () => {
		for (const option of ['--grep', '-g', '-f', '--grep=']) {
			for (const pattern of ['', 'context', '^Agent Host', 'runtime coverage', 'managed settings', 'shell:.*command$']) {
				for (const inverted of [false, true]) {
					const original = new RegExp(pattern);
					for (const worker of workers) {
						const forwarded = option.endsWith('=') ? [`${option}${pattern}`] : [option, pattern];
						if (inverted) {
							forwarded.push('--invert');
						}
						const args = runner.suiteArguments(forwarded, worker);
						const selected = new RegExp(args[args.indexOf('--grep') + 1]);
						assert.deepStrictEqual(titles.map(title => selected.test(title)), titles.map(title =>
							original.test(title) !== inverted
							&& title.includes('runtime coverage ') === (worker.id === 'copilot-runtime')
						), JSON.stringify({ option, pattern, inverted, worker: worker.id }));
					}
				}
			}
		}
	});

	test('other providers retain their filters, and reporting identifies each partition', () => {
		const forwarded = ['--grep', 'context', '--invert'];
		const other = runner.suites.find(item => item.id === 'claude')!;
		assert.deepStrictEqual(runner.suiteArguments(forwarded, other), forwarded);
		for (const worker of workers) {
			const args = runner.suiteArguments(['--tfs', 'Integration'], worker);
			assert.ok(args[args.indexOf('--tfs') + 1].startsWith(`Integration ${worker.label} `));
			assert.throws(() => runner.suiteArguments(['--grep'], worker), /requires a pattern/);
			const inverted = runner.suiteArguments(['--invert'], worker);
			assert.ok(titles.every(title => !new RegExp(inverted[inverted.indexOf('--grep') + 1]).test(title)));
		}
	});
});

async function detect(files: readonly { filename: string; previous_filename?: string }[], expectedCount = files.length, failure?: Error) {
	const outputs: Record<string, string> = {};
	const messages: string[] = [];
	await detectAgentHostE2EChanges({
		paginate: async (_method, parameters) => {
			assert.equal(parameters.per_page, 100);
			if (failure) {
				throw failure;
			}
			return files;
		},
		rest: { pulls: { listFiles: {} } },
	}, {
		repo: { owner: 'microsoft', repo: 'vscode' },
		issue: { number: 1 },
		payload: { pull_request: { changed_files: expectedCount } },
	}, {
		info: message => messages.push(message),
		warning: message => messages.push(message),
		setOutput: (name, value) => outputs[name] = value,
	});
	return { outputs, messages };
}

suite('Agent Host PR test selection', () => {
	test('keeps unrelated changes out of the parallel runner and relevant changes in the PR profile', async () => {
		const results = [];
		for (const filename of [
			'src/vs/workbench/browser/editor.ts',
			'README.md',
			'src/vs/platform/agentHost/node/copilot/copilotAgent.ts',
			'src/vs/base/common/async.ts',
		]) {
			const { outputs } = await detect([{ filename }]);
			results.push({ affected: outputs.affected, profile: outputs.profile });
		}
		assert.deepStrictEqual(results, [
			{ affected: 'false', profile: 'pr' },
			{ affected: 'false', profile: 'pr' },
			{ affected: 'true', profile: 'pr' },
			{ affected: 'true', profile: 'pr' },
		]);
	});

	test('test artifacts, dependencies and infrastructure force full coverage in their own PR', async () => {
		const filenames = [
			'src/vs/platform/agentHost/test/node/e2e/suites/newSuite.ts',
			'src/vs/platform/agentHost/test/node/e2e/captures/new.yaml',
			'src/vs/platform/agentHost/test/node/e2e/providers/__snapshots__/new.prompt.md',
			'src/vs/platform/agentHost/test/node/providerIntegration/copilotOtel.integrationTest.ts',
			'src/vs/platform/agentHost/test/node/agentHostTestProfile.ts',
			'src/vs/platform/agentHost/test/common/agent.test.ts',
			'test/integration/agentHost/runner.ts',
			'test/unit/electron/index.js',
			'.github/actions/detect-agent-host-e2e-changes/detect.ts',
			'.github/workflows/pr-win32-test.yml',
			'scripts/test-agent-host-e2e.sh',
			'scripts/test-agent-host-e2e.bat',
			'scripts/test-integration.sh',
			'scripts/test-integration.bat',
			'build/agent-sdk/agents/copilot/package.json',
			'build/lib/test/agentHostTestSelection.test.ts',
			'package.json',
			'package-lock.json',
			'remote/package.json',
			'remote/package-lock.json',
			'extensions/copilot/package.json',
			'.npmrc',
			'.nvmrc',
			'product.json',
		];
		const results = [];
		for (const filename of filenames) {
			const { outputs, messages } = await detect([{ filename }]);
			results.push([outputs.affected, outputs.profile, outputs.reason.includes(filename), messages.some(message => message.includes('profile: full'))]);
		}
		assert.deepStrictEqual(results, filenames.map(() => ['true', 'full', true, true]));
	});

	test('both sides of a rename participate in selection', async () => {
		const results = [];
		for (const file of [
			{ filename: 'archive/old.yaml', previous_filename: 'src/vs/platform/agentHost/test/node/e2e/captures/old.yaml' },
			{ filename: 'src/vs/platform/agentHost/test/node/e2e/captures/new.yaml', previous_filename: 'archive/new.yaml' },
			{ filename: 'archive/agent.ts', previous_filename: 'src/vs/platform/agentHost/node/agent.ts' },
		]) {
			const { outputs } = await detect([file]);
			results.push([outputs.affected, outputs.profile]);
		}
		assert.deepStrictEqual(results, [['true', 'full'], ['true', 'full'], ['true', 'pr']]);
	});

	test('failed and incomplete changed-file lookups fall back to full coverage', async () => {
		const results = await Promise.all([
			detect([], 1),
			detect([], 0, new Error('lookup unavailable')),
		]);
		assert.deepStrictEqual(results.map(({ outputs, messages }) => ({
			affected: outputs.affected,
			profile: outputs.profile,
			hasReason: outputs.reason.length > 0,
			fullWasReported: messages.some(message => message.includes('full Agent Host test profile')),
		})), [
			{ affected: 'true', profile: 'full', hasReason: true, fullWasReported: true },
			{ affected: 'true', profile: 'full', hasReason: true, fullWasReported: true },
		]);
	});

	test('Windows runs Agent Host E2E in its own job, Linux and macOS in the Electron job; all propagate the profile and fail open when detection is unavailable', () => {
		interface IStep { id?: string; name?: string; if?: string; run?: string; uses?: string; with?: Record<string, string>; env?: Record<string, string> }
		interface IJob { name?: string; needs?: string; if?: string; uses?: string; with?: Record<string, unknown>; outputs?: Record<string, string>; steps?: IStep[] }
		const action = load(readFileSync(path.join(repositoryRoot, '.github/actions/detect-agent-host-e2e-changes/action.yml'), 'utf8')) as {
			outputs: Record<string, { value: string }>;
		};
		const pr = load(readFileSync(path.join(repositoryRoot, '.github/workflows/pr.yml'), 'utf8')) as { jobs: Record<string, IJob> };
		const changes = pr.jobs.changes;
		const detection = changes.steps?.find(step => step.uses === './.github/actions/detect-agent-host-e2e-changes');
		const checkout = changes.steps?.find(step => step.uses?.startsWith('actions/checkout@'));
		const profile = '${{ needs.changes.outputs.agent-host-test-profile || \'full\' }}';
		const reason = '${{ needs.changes.outputs.agent-host-test-profile-reason || \'Change detection unavailable\' }}';
		const callers = ['linux', 'macos', 'windows'].map(platform => {
			const agentHost = pr.jobs[`${platform}-agent-host-e2e-tests`];
			const integration = pr.jobs[`${platform}-electron-tests`];
			return {
				agentHost: agentHost && {
					needs: agentHost.needs,
					if: agentHost.if,
					agentHostTests: agentHost.with?.agent_host_e2e_tests,
					integrationTests: agentHost.with?.integration_tests,
					profile: agentHost.with?.agent_host_test_profile,
					reason: agentHost.with?.agent_host_test_profile_reason,
				},
				// Provider integration tests in the serial node.js run also read the profile.
				integration: {
					if: integration?.if,
					agentHostTests: integration?.with?.agent_host_e2e_tests,
					profile: integration?.with?.agent_host_test_profile,
					reason: integration?.with?.agent_host_test_profile_reason,
				},
			};
		});
		const platforms = ['linux', 'darwin', 'win32'].map(platform => {
			const workflow = load(readFileSync(path.join(repositoryRoot, `.github/workflows/pr-${platform}-test.yml`), 'utf8')) as {
				on: { workflow_call: { inputs: Record<string, { default?: unknown }> } };
				jobs: Record<string, { steps: IStep[] }>;
			};
			const inputs = workflow.on.workflow_call.inputs;
			const steps = Object.values(workflow.jobs).flatMap(job => job.steps);
			const agentHost = steps.find(step => step.name?.includes('Run Agent Host E2E tests (Electron)'));
			const integration = steps.find(step => step.name?.includes('Run integration tests (Electron)'));
			assert.ok(agentHost?.env && integration?.env);
			return {
				defaults: {
					agentHostTests: inputs.agent_host_e2e_tests?.default,
					profile: inputs.agent_host_test_profile?.default,
					reason: inputs.agent_host_test_profile_reason?.default,
				},
				agentHost: {
					id: agentHost.id,
					if: agentHost.if,
					runsScript: /test-agent-host-e2e\.(sh|bat) /.test(agentHost.run ?? ''),
					profile: agentHost.env.AGENT_HOST_TEST_PROFILE,
					reason: agentHost.env.AGENT_HOST_TEST_PROFILE_REASON,
					skip: agentHost.env.VSCODE_SKIP_AGENT_HOST_E2E,
				},
				integration: {
					if: integration.if,
					runsScript: /test-integration\.(sh|bat) /.test(integration.run ?? ''),
					profile: integration.env.AGENT_HOST_TEST_PROFILE,
					reason: integration.env.AGENT_HOST_TEST_PROFILE_REASON,
				},
			};
		});
		assert.deepStrictEqual({
			actionProfile: action.outputs.profile.value,
			checksOutDetection: checkout?.with?.['sparse-checkout']?.split('\n').includes('.github/actions/detect-agent-host-e2e-changes'),
			detection: { id: detection?.id, token: detection?.with?.token },
			outputs: {
				affected: changes.outputs?.['agent-host-e2e'],
				profile: changes.outputs?.['agent-host-test-profile'],
				reason: changes.outputs?.['agent-host-test-profile-reason'],
				electronTests: changes.outputs?.['electron-tests'],
			},
			callers,
			platforms,
		}, {
			actionProfile: '${{ steps.detect.outputs.profile }}',
			checksOutDetection: true,
			detection: { id: 'detect-agent-host-e2e', token: '${{ secrets.GITHUB_TOKEN }}' },
			outputs: {
				affected: '${{ steps.detect-agent-host-e2e.outputs.affected }}',
				profile: '${{ steps.detect-agent-host-e2e.outputs.profile }}',
				reason: '${{ steps.detect-agent-host-e2e.outputs.reason }}',
				// The Linux and macOS Electron jobs run when either their integration tests or Agent Host E2E can be affected.
				electronTests: '${{ steps.detect.outputs.product-tests == \'true\' || steps.detect-agent-host-e2e.outputs.affected == \'true\' }}',
			},
			callers: [
				...['linux', 'macos'].map(() => ({
					agentHost: undefined,
					integration: {
						if: '${{ !cancelled() && (needs.changes.result != \'success\' || needs.changes.outputs.electron-tests == \'true\') }}',
						agentHostTests: '${{ needs.changes.result != \'success\' || needs.changes.outputs.agent-host-e2e == \'true\' }}',
						profile,
						reason,
					},
				})),
				{
					agentHost: {
						needs: 'changes',
						// Runs when detection fails; required-checks reports it as part of "Windows / Electron".
						if: '${{ !cancelled() && (needs.changes.result != \'success\' || needs.changes.outputs.agent-host-e2e == \'true\') }}',
						agentHostTests: true,
						integrationTests: false,
						profile,
						reason,
					},
					integration: {
						if: '${{ !cancelled() && (needs.changes.result != \'success\' || needs.changes.outputs.product-tests == \'true\') }}',
						agentHostTests: undefined,
						profile,
						reason,
					},
				},
			],
			platforms: Array.from({ length: 3 }, () => ({
				defaults: { agentHostTests: false, profile: 'full', reason: 'Change detection unavailable' },
				agentHost: {
					id: 'agent-host-e2e',
					if: '${{ inputs.electron_tests && inputs.agent_host_e2e_tests }}',
					runsScript: true,
					profile: '${{ inputs.agent_host_test_profile }}',
					reason: '${{ inputs.agent_host_test_profile_reason }}',
					skip: undefined,
				},
				// Runs after an Agent Host E2E failure in the same job, so that one does not hide the other.
				integration: {
					if: '${{ inputs.electron_tests && inputs.integration_tests && !cancelled() && (success() || steps.agent-host-e2e.outcome == \'failure\') }}',
					runsScript: true,
					profile: '${{ inputs.agent_host_test_profile }}',
					reason: '${{ inputs.agent_host_test_profile_reason }}',
				},
			})),
		});
	});

	test('the Agent Host E2E runner runs exactly the files that the integration scripts exclude', () => {
		const e2eDirectory = 'src/vs/platform/agentHost/test/node/e2e';
		const shellGlob = readFileSync(path.join(repositoryRoot, 'scripts/test-integration.sh'), 'utf8').match(/^AGENT_HOST_E2E_GLOB="(?<glob>[^"]+)"$/m)?.groups?.glob;
		const batchGlob = readFileSync(path.join(repositoryRoot, 'scripts/test-integration.bat'), 'utf8').match(/--excludeRunGlob "(?<glob>[^"]+)"/)?.groups?.glob;
		assert.ok(shellGlob);
		// The scripts match compiled output, so test the compiled path of every E2E source file.
		const excluded = readdirSync(path.join(repositoryRoot, e2eDirectory), { recursive: true, encoding: 'utf8' })
			.map(file => path.posix.join(e2eDirectory, file.split(path.sep).join('/')))
			.filter(file => file.endsWith('.integrationTest.ts') && path.matchesGlob(file.replace(/^src\//, 'out/').replace(/\.ts$/, '.js'), shellGlob))
			.sort();
		const runnerFiles = [...new Set([...readFileSync(path.join(repositoryRoot, 'test/integration/agentHost/runner.ts'), 'utf8').matchAll(/^\t\tfile: '(?<file>[^']+)',$/gm)]
			.map(match => match.groups!.file))]
			.sort();
		assert.deepStrictEqual({ batchGlob, excludedFromIntegrationScripts: excluded, runByAgentHostE2E: runnerFiles }, {
			batchGlob: shellGlob,
			excludedFromIntegrationScripts: runnerFiles,
			runByAgentHostE2E: [
				`${e2eDirectory}/conformance/agentHostConformance.integrationTest.ts`,
				`${e2eDirectory}/providers/claudeAgentHostE2E.integrationTest.ts`,
				`${e2eDirectory}/providers/codexAgentHostE2E.integrationTest.ts`,
				`${e2eDirectory}/providers/copilotAgentHostE2E.integrationTest.ts`,
				`${e2eDirectory}/providers/copilotManagedSettingsAgentHostE2E.integrationTest.ts`,
				`${e2eDirectory}/providers/copilotOtelAgentHostE2E.integrationTest.ts`,
			],
		});
	});

	test('every CI step that runs the integration tests is paired with an Agent Host E2E step', () => {
		interface ICommandStep {
			readonly command: string;
			readonly environment: Record<string, unknown>;
		}
		// Finds steps in any GitHub Actions or Azure DevOps shape, including template parameters and expression branches.
		const commandSteps = (value: unknown, found: ICommandStep[] = []): ICommandStep[] => {
			if (Array.isArray(value)) {
				value.forEach(item => commandSteps(item, found));
			} else if (value && typeof value === 'object') {
				const record = value as Record<string, unknown>;
				const command = ['run', 'script', 'powershell', 'pwsh', 'bash'].map(key => record[key]).find(entry => typeof entry === 'string');
				if (typeof command === 'string') {
					found.push({ command, environment: (record.env ?? {}) as Record<string, unknown> });
				}
				Object.values(record).forEach(child => commandSteps(child, found));
			}
			return found;
		};
		const pipelineFiles = (directory: string): string[] => readdirSync(path.join(repositoryRoot, directory), { recursive: true, encoding: 'utf8' })
			.filter(file => /\.ya?ml$/.test(file))
			.map(file => path.posix.join(directory, file.split(path.sep).join('/')));
		const unitRun = /test-(integration|agent-host-e2e)\.(sh|bat)\b(?![^\n]*--(run|runGlob|suite)\b)/;
		const pairs = [...pipelineFiles('.github/workflows'), ...pipelineFiles('build/azure-pipelines')].sort().flatMap(file => {
			const steps = commandSteps(load(readFileSync(path.join(repositoryRoot, file), 'utf8')));
			const integration = steps.filter(step => unitRun.test(step.command) && step.command.includes('test-integration.'));
			const agentHost = steps.filter(step => unitRun.test(step.command) && step.command.includes('test-agent-host-e2e.'));
			if (integration.length === 0 && agentHost.length === 0) {
				return [];
			}
			// The change-detection skip only applies to the Agent Host E2E step.
			const signature = (step: ICommandStep) => JSON.stringify({
				command: step.command.replace('test-agent-host-e2e.', 'test-integration.'),
				environment: Object.fromEntries(Object.entries(step.environment).filter(([name]) => name !== 'VSCODE_SKIP_AGENT_HOST_E2E').sort()),
			});
			const agentHostSignatures = agentHost.map(signature).sort();
			return [{
				file,
				integrationSteps: integration.length,
				pairedWithAgentHostE2E: JSON.stringify(integration.map(signature).sort()) === JSON.stringify(agentHostSignatures),
			}];
		});
		assert.deepStrictEqual(pairs, [
			'.github/workflows/pr-darwin-test.yml',
			'.github/workflows/pr-linux-test.yml',
			'.github/workflows/pr-win32-test.yml',
			'build/azure-pipelines/darwin/product-smoke-flaky-darwin.yml',
			'build/azure-pipelines/darwin/steps/product-build-darwin-test.yml',
			'build/azure-pipelines/linux/product-smoke-flaky-linux.yml',
			'build/azure-pipelines/linux/steps/product-build-linux-test.yml',
			'build/azure-pipelines/win32/product-smoke-flaky-win32.yml',
			'build/azure-pipelines/win32/steps/product-build-win32-test.yml',
		].map(file => ({ file, integrationSteps: 1, pairedWithAgentHostE2E: true })));
	});

	test('packaged platforms run Agent Host E2E only in its dedicated checkpoint', () => {
		const records = (value: unknown): Record<string, unknown>[] => {
			if (Array.isArray(value)) {
				return value.flatMap(records);
			}
			if (value && typeof value === 'object') {
				return [value as Record<string, unknown>, ...Object.values(value).flatMap(records)];
			}
			return [];
		};
		for (const platform of ['darwin', 'linux', 'win32']) {
			const file = `build/azure-pipelines/${platform}/steps/product-build-${platform}-test.yml`;
			const template = readFileSync(path.join(repositoryRoot, file), 'utf8');
			const calls = records(load(template))
				.filter(record => typeof record.template === 'string' && record.template.endsWith('/run-test-with-checkpoint.yml@self'))
				.map(record => record.parameters as { testId: string; beforeTestSteps?: object[]; testStep: { script?: string; powershell?: string } });
			const host = calls.filter(call => call.testId === 'integration-agent-host-e2e');
			const remaining = calls.filter(call => call.testId === 'integration-electron');
			assert.deepStrictEqual({
				hostCheckpoints: host.length,
				remainingCheckpoints: remaining.length,
				agentHostTestSteps: (template.match(/displayName: .*Run Agent Host E2E tests \(Electron\)/g) ?? []).length,
				extraIntegrationSteps: remaining[0]?.beforeTestSteps,
			}, { hostCheckpoints: 1, remainingCheckpoints: 1, agentHostTestSteps: 1, extraIntegrationSteps: undefined }, platform);
		}
	});
});

suite('Agent Host test profile registration', () => {
	test('defaults to full and rejects unknown profile values', () => {
		const { getAgentHostTestProfile } = profile(undefined);
		assert.deepStrictEqual([getAgentHostTestProfile(), getAgentHostTestProfile('full'), getAgentHostTestProfile('pr')], ['full', 'full', 'pr']);
		for (const value of ['', 'quick', 'FULL']) {
			assert.throws(() => getAgentHostTestProfile(value), /Invalid AGENT_HOST_TEST_PROFILE/);
		}
	});

	test('full-only registration preserves titles and honors capability gates in both profiles', () => {
		const results = [];
		for (const value of [undefined, 'full', 'pr']) {
			const { fullOnlyTest, registrations } = profile(value);
			for (const enabled of [true, false]) {
				fullOnlyTest('fixture identity stays unchanged', () => { }, enabled);
			}
			results.push(registrations);
		}
		assert.deepStrictEqual(results, [
			[{ title: 'fixture identity stays unchanged', skipped: false }, { title: 'fixture identity stays unchanged', skipped: true }],
			[{ title: 'fixture identity stays unchanged', skipped: false }, { title: 'fixture identity stays unchanged', skipped: true }],
			[{ title: 'fixture identity stays unchanged', skipped: true }, { title: 'fixture identity stays unchanged', skipped: true }],
		]);
	});

	test('pre-existing tests reserve native depth and redundant variations for Full', () => {
		const titles: string[] = [];
		for (const relativePath of [
			'src/vs/platform/agentHost/test/node/e2e/suites/fileOperationsSuite.ts',
			'src/vs/platform/agentHost/test/node/e2e/suites/multiChatSuite.ts',
			'src/vs/platform/agentHost/test/node/e2e/suites/copilotCoverageSuite.ts',
			'src/vs/platform/agentHost/test/node/e2e/suites/copilotRuntimeToolsSuite.ts',
			'src/vs/platform/agentHost/test/node/e2e/suites/mcpPluginSuite.ts',
			'src/vs/platform/agentHost/test/node/providerIntegration/copilotManagedPermissions.integrationTest.ts',
			'src/vs/platform/agentHost/test/node/providerIntegration/copilotOtel.integrationTest.ts',
		]) {
			const source = ts.createSourceFile(relativePath, readFileSync(path.join(repositoryRoot, relativePath), 'utf8'), ts.ScriptTarget.Latest, true);
			const visit = (node: ts.Node): void => {
				if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
					const lastArgument = node.arguments.at(-1);
					const fullOnly = node.expression.text === 'fullOnlyTest'
						|| (lastArgument && ts.isStringLiteral(lastArgument) && lastArgument.text === 'full');
					if (fullOnly) {
						const title = node.arguments[node.expression.text === 'fileOperationTest' ? 1 : 0];
						assert.ok(title && (ts.isStringLiteral(title) || ts.isTemplateExpression(title)));
						titles.push(ts.isStringLiteral(title) ? title.text : title.head.text);
					}
				}
				ts.forEachChild(node, visit);
			};
			visit(source);
		}
		assert.deepStrictEqual(titles.sort(), [
			'reads a file from a nested directory',
			'reads a value from JSON',
			'counts lines in a file',
			'lists workspace entries',
			'inspects git status',
			'creates a file in a new nested directory',
			'renames a workspace file',
			'deletes a workspace file',
			'peer chat reads a file from a nested directory',
			'peer chat creates a file in a nested directory',
			'peer chat edits an existing workspace file',
			'peer chat handles a missing workspace file without an error',
			'peer chat reads a filename containing spaces',
			'view range returns only the requested workspace lines',
			'grep searches workspace content through the provider tool',
			'glob finds a nested workspace file through the provider tool',
			'shell output preserves public GitHub MCP metadata',
			'runtime tools: compacted shell output preserves the complete original',
			'runtime tools: native apply_patch handles bare-minus hunks on zero-byte files',
			'runtime tools: GPT requests detailed reasoning and unfinished-task continuation guidance by default',
			'plugin UserPromptSubmit hook receives the submitted prompt',
			'plugin PreToolUse hook runs before an MCP tool',
			'plugin PostToolUse hook runs after an MCP tool result',
			'plugin SessionEnd hook runs when the session is disposed',
			'failing plugin hook is non-fatal to the provider turn',
			'non-JSON plugin hook output is ignored without failing the provider turn',
			'runtime independently enforces both approval-mode restrictions',
			'shell tools and concurrent session events complete with OTel ',
		].sort());
	});

	test('added runtime coverage defaults to Full with an explicit host-regression PR subset', () => {
		const sourceFor = (area: string) => {
			const file = path.join(repositoryRoot, `src/vs/platform/agentHost/test/node/e2e/suites/copilotRuntime${area}CoverageSuite.ts`);
			return ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
		};
		const callsIn = (source: ts.Node, name: string): ts.CallExpression[] => {
			const calls: ts.CallExpression[] = [];
			const visit = (node: ts.Node): void => {
				if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === name) {
					calls.push(node);
				}
				ts.forEachChild(node, visit);
			};
			visit(source);
			return calls;
		};
		const native = ['Data', 'Shell', 'Web', 'Telemetry', 'AutomaticContext'].map(area => {
			const source = sourceFor(area);
			return { area, full: callsIn(source, 'fullOnlyTest').length, pr: callsIn(source, 'test').length };
		});
		const helpers = {
			Context: 'contextTest',
			Customization: 'customizationTest',
			Hooks: 'hooksTest',
			ManagedSettings: 'managedTest',
			ManagedDiagnostics: 'diagnosticTest',
			Mcp: 'mcpTest',
			McpAuthorization: 'authTest',
			ModelCapability: 'capabilityTest',
			Resilience: 'failureTest',
		};
		const retained = Object.fromEntries(['Auto', ...Object.keys(helpers), 'LegacyModel'].map(area => {
			const source = sourceFor(area);
			const names = new Map<string, string>();
			const visit = (node: ts.Node): void => {
				if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && ts.isStringLiteral(node.initializer)) {
					names.set(node.name.text, node.initializer.text);
				}
				if (ts.isFunctionDeclaration(node) && node.name?.text === helpers[area as keyof typeof helpers]) {
					assert.strictEqual(node.parameters.find(parameter => parameter.name.getText(source) === 'profile')?.initializer?.getText(source), '\'full\'', area);
					assert.ok(node.body?.getText(source).includes('profile === \'pr\' ? test : fullOnlyTest'), area);
				}
				ts.forEachChild(node, visit);
			};
			visit(source);
			const titles = ['test', 'providerHostOnlyTest', ...Object.values(helpers)].flatMap(name =>
				callsIn(source, name).filter(call => {
					const last = call.arguments.at(-1);
					return name === 'test' || name === 'providerHostOnlyTest' || (last && ts.isStringLiteral(last) && last.text === 'pr');
				}).map(call => {
					const title = call.arguments[call.expression.getText(source) === 'providerHostOnlyTest' ? 1 : 0];
					const text = ts.isStringLiteral(title) ? title.text : ts.isIdentifier(title) ? names.get(title.text) : undefined;
					assert.ok(text, `${area}: expected a concrete PR test title`);
					return text.replace(/^(?:runtime coverage [^:]+|managed settings(?: diagnostics)?): /, '');
				}));
			return [area, titles.sort()];
		}));
		const gates = ['Data', 'Shell', 'AutomaticContext'].flatMap(area => callsIn(sourceFor(area), 'fullOnlyTest')
			.filter(call => call.arguments.length === 3)
			.map(call => call.arguments[2].getText()));
		assert.deepStrictEqual({ native, retained, gates }, {
			native: [
				{ area: 'Data', full: 16, pr: 0 },
				{ area: 'Shell', full: 16, pr: 0 },
				{ area: 'Web', full: 1, pr: 0 },
				{ area: 'Telemetry', full: 1, pr: 0 },
				{ area: 'AutomaticContext', full: 1, pr: 0 },
			],
			retained: Object.fromEntries(Object.entries({
				Auto: [
					'modern routing exposes the concrete choice and capability scores through AHP',
					'changing the enabled picker preference invalidates the cached routing profile',
				],
				Context: [
					'embedded text attachment content survives summarization with its AHP attachment history',
					'host restart rehydrates compacted native context and checkpoint metadata',
				],
				Customization: ['skill allowed tools read a supporting plugin resource'],
				Hooks: ['native plugin SessionStart hook resolves its executable arguments and adds context'],
				ManagedSettings: [
					'managed write asks override session Allow All',
					'managed shell asks override terminal rules and persistent tool preferences',
					'forged Allow in Session selection cannot persist a managed write grant',
					'bypass lock reports unavailable allow-all mode and preserves human approval',
					'distinct initialized clients union independent restrictions',
					'clearing one client layer preserves another client restriction',
					'replacement updates only the contributing client layer',
					'already materialized peer and default chats both refresh at idle boundaries',
					'serialized empty permissions clear the injected layer on a resumed idle chat',
					'disconnect grace expiry removes only the departing client restriction',
					'host restart re-supplies current permissions when provider history resumes',
					'host restart without injection clears the nonpersistent client layer',
					'malformed ask rules fail resumed policy refresh instead of silently dropping restrictions',
				],
				ManagedDiagnostics: [
					'pre-initialize notifications do not acquire a client-owned policy layer',
					'a mixed-type deny list rejects the whole replacement without partially applying it',
					'two transports for one client replace one contribution instead of unioning layers',
					'quick reinitialization of the same owner preserves its disconnect-grace restriction',
					'JSON omission of permissions is not an explicit empty-layer removal',
				],
				Mcp: [
					'preserves structured HTTP tool results through the MCP side channel',
					'reads text and binary HTTP resources through AHP',
					'disables and reenables an HTTP customization without stray calls',
					'preserves stdio working directory and environment launch values',
				],
				McpAuthorization: [
					'projects a configured public OAuth client without starting browser authorization',
					'refreshes an expired credential during a tool call and resumes it once',
				],
				ModelCapability: [
					'an empty allowlist removes native and registered client tools',
					'the custom wildcard preserves structured schemas and dispatches the owned input once',
					'a non-reasoning model rejects an effort override before contacting the model',
					'a vision override merges over catalog defaults without changing the native request budget',
				],
				Resilience: ['a quota error releases the active turn and permits a later local read'],
				LegacyModel: [],
			}).map(([area, titles]) => [area, titles.sort()])),
			gates: ['context.runKnownIssueTests', 'context.runKnownIssueTests', ...Array.from({ length: 4 }, () => 'context.runRecordOnlyTests')],
		});
	});

	test('runtime fixture workspaces are canonical and outside repository instruction ancestors', () => {
		const directory = path.join(repositoryRoot, 'src/vs/platform/agentHost/test/node/e2e/suites');
		for (const file of readdirSync(directory).filter(file => /^copilotRuntime.*CoverageSuite\.ts$/.test(file))) {
			const text = readFileSync(path.join(directory, file), 'utf8');
			const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
			const visit = (node: ts.Node): void => {
				if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
					assert.notStrictEqual(node.expression.text, 'mkdtempSync', `${file}: use the canonical test-directory helper`);
					if (node.expression.text === 'join') {
						assert.notStrictEqual(node.arguments[0]?.getText(source), 'process.cwd()', `${file}: keep fixtures outside the checkout`);
					}
				}
				ts.forEachChild(node, visit);
			};
			visit(source);
			assert.ok(text.includes('createTestDirectory'), `${file}: no canonical fixture allocation`);
		}
	});
});

function profile(value: string | undefined) {
	const registrations: { title: string; skipped: boolean }[] = [];
	const register = (title: string) => registrations.push({ title, skipped: false });
	const exports = {} as {
		getAgentHostTestProfile(value?: string): 'pr' | 'full';
		fullOnlyTest(title: string, run: () => void, enabled?: boolean): void;
	};
	const source = ts.transpileModule(readFileSync(profilePath, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
	runInNewContext(source, {
		exports,
		process: { env: value === undefined ? {} : { AGENT_HOST_TEST_PROFILE: value } },
		test: Object.assign(register, { skip: (title: string) => registrations.push({ title, skipped: true }) }),
	}, { filename: profilePath });
	return { ...exports, registrations };
}
