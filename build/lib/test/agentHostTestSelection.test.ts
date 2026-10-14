/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
			workers: workers.map(item => ({ id: item.id, file: item.file })),
			selections: titles.map(title => workers.map(worker => {
				const args = runner.suiteArguments([], worker);
				return new RegExp(args[args.indexOf('--grep') + 1]).test(title);
			})),
		}, {
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

	test('all PR platforms propagate the profile and fail open when detection is unavailable', () => {
		const action = load(readFileSync(path.join(repositoryRoot, '.github/actions/detect-agent-host-e2e-changes/action.yml'), 'utf8')) as {
			outputs: Record<string, { value: string }>;
		};
		const environments = ['linux', 'darwin', 'win32'].map(platform => {
			const workflow = load(readFileSync(path.join(repositoryRoot, `.github/workflows/pr-${platform}-test.yml`), 'utf8')) as {
				jobs: Record<string, { steps: { name?: string; env?: Record<string, string> }[] }>;
			};
			const steps = Object.values(workflow.jobs).flatMap(job => job.steps);
			const host = steps.find(step => step.name?.includes('Run Agent Host E2E tests (Electron)'));
			const remaining = steps.find(step => step.name?.includes('Run integration tests (Electron)'));
			assert.ok(host?.env && remaining?.env);
			return {
				hostProfile: host.env.AGENT_HOST_TEST_PROFILE,
				hostReason: host.env.AGENT_HOST_TEST_PROFILE_REASON,
				hostSkip: host.env.VSCODE_SKIP_AGENT_HOST_E2E,
				remainingProfile: remaining.env.AGENT_HOST_TEST_PROFILE,
				remainingReason: remaining.env.AGENT_HOST_TEST_PROFILE_REASON,
				remainingSkip: remaining.env.VSCODE_SKIP_AGENT_HOST_E2E,
			};
		});
		assert.deepStrictEqual({
			actionProfile: action.outputs.profile.value,
			environments,
		}, {
			actionProfile: '${{ steps.detect.outputs.profile }}',
			environments: Array.from({ length: 3 }, () => ({
				hostProfile: '${{ steps.agent-host-e2e-changes.outputs.profile || \'full\' }}',
				hostReason: '${{ steps.agent-host-e2e-changes.outputs.reason || \'Change detection unavailable\' }}',
				hostSkip: undefined,
				remainingProfile: '${{ steps.agent-host-e2e-changes.outputs.profile || \'full\' }}',
				remainingReason: '${{ steps.agent-host-e2e-changes.outputs.reason || \'Change detection unavailable\' }}',
				remainingSkip: '1',
			})),
		});
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

	test('the initial full-only inventory contains only the intended variations', () => {
		const titles: string[] = [];
		for (const relativePath of [
			'src/vs/platform/agentHost/test/node/e2e/suites/fileOperationsSuite.ts',
			'src/vs/platform/agentHost/test/node/e2e/suites/multiChatSuite.ts',
			'src/vs/platform/agentHost/test/node/e2e/suites/copilotCoverageSuite.ts',
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
			'peer chat reads a file from a nested directory',
			'peer chat creates a file in a nested directory',
			'view range returns only the requested workspace lines',
			'grep searches workspace content through the provider tool',
			'glob finds a nested workspace file through the provider tool',
			'shell tools and concurrent session events complete with OTel ',
		].sort());
	});

	test('native runtime depth uses Full while host integration regressions remain in PR', () => {
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
		const customization = callsIn(sourceFor('Customization'), 'customizationTest')
			.filter(call => call.arguments.at(-1)?.getText() === '\'pr\'')
			.map(call => {
				const title = call.arguments[0];
				assert.ok(ts.isStringLiteral(title));
				return title.text;
			});
		const host = ['Auto', 'ManagedSettings', 'ManagedDiagnostics', 'Mcp', 'McpAuthorization', 'Hooks', 'Context', 'LegacyModel', 'ModelCapability']
			.map(area => ({ area, full: callsIn(sourceFor(area), 'fullOnlyTest').length }));
		const gates = ['Data', 'Shell', 'AutomaticContext'].flatMap(area => callsIn(sourceFor(area), 'fullOnlyTest')
			.filter(call => call.arguments.length === 3)
			.map(call => call.arguments[2].getText()));
		assert.deepStrictEqual({ native, customization, host, gates }, {
			native: [
				{ area: 'Data', full: 16, pr: 0 },
				{ area: 'Shell', full: 16, pr: 0 },
				{ area: 'Web', full: 1, pr: 0 },
				{ area: 'Telemetry', full: 1, pr: 0 },
				{ area: 'AutomaticContext', full: 1, pr: 0 },
			],
			customization: [
				'runtime coverage customization: plugin launch expands environment cwd and initialization options',
				'runtime coverage customization: skill allowed tools read a supporting plugin resource',
				'runtime coverage customization: sibling skill resources stay isolated by skill base directory',
			],
			host: ['Auto', 'ManagedSettings', 'ManagedDiagnostics', 'Mcp', 'McpAuthorization', 'Hooks', 'Context', 'LegacyModel', 'ModelCapability']
				.map(area => ({ area, full: 0 })),
			gates: ['context.runKnownIssueTests', 'context.runKnownIssueTests', ...Array.from({ length: 4 }, () => 'context.runRecordOnlyTests')],
		});
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
