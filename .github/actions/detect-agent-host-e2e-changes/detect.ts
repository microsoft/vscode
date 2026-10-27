/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

interface IChangedFile {
	readonly filename: string;
	readonly previous_filename?: string;
}

interface IListFilesParameters {
	readonly owner: string;
	readonly repo: string;
	readonly pull_number: number;
	readonly per_page: number;
}

interface IGitHub {
	readonly paginate: (method: object, parameters: IListFilesParameters) => Promise<readonly IChangedFile[]>;
	readonly rest: { readonly pulls: { readonly listFiles: object } };
}

interface IContext {
	readonly repo: { readonly owner: string; readonly repo: string };
	readonly issue: { readonly number: number };
	readonly payload: { readonly pull_request?: { readonly changed_files?: number } };
}

interface ICore {
	info(message: string): void;
	warning(message: string): void;
	setOutput(name: string, value: string): void;
}

const exactPaths = new Set([
	'.nvmrc',
	'.npmrc',
	'package.json',
	'package-lock.json',
	'product.json',
	'scripts/test-agent-host-e2e.sh',
	'scripts/test-agent-host-e2e.bat',
	'scripts/test-integration.sh',
	'scripts/test-integration.bat',
	'scripts/test.sh',
	'scripts/test.bat',
	'src/vs/nls.ts',
]);

const pathPrefixes = [
	'.github/actions/detect-agent-host-e2e-changes/',
	'.github/workflows/pr',
	'build/',
	'src/bootstrap',
	'src/tsconfig',
	'src/vs/base/',
	'src/vs/platform/',
	'test/unit/electron/',
	'test/integration/agentHost/',
];

const fullProfilePaths = new Set([...exactPaths].filter(path => path !== 'src/vs/nls.ts'));
const fullProfilePrefixes = [
	'.github/actions/detect-agent-host-e2e-changes/',
	'.github/workflows/pr',
	'build/',
	'src/vs/platform/agentHost/test/',
	'test/unit/electron/',
	'test/integration/agentHost/',
];

function requiresFullProfile(path: string): boolean {
	return fullProfilePaths.has(path)
		|| fullProfilePrefixes.some(prefix => path.startsWith(prefix))
		|| /(^|\/)(package(-lock)?\.json|npm-shrinkwrap\.json)$/.test(path);
}

function affectsAgentHostE2E(path: string): boolean {
	if (path.endsWith('.md')) {
		return false;
	}
	return exactPaths.has(path) || pathPrefixes.some(prefix => path.startsWith(prefix));
}

export async function detectAgentHostE2EChanges(github: IGitHub, context: IContext, core: ICore): Promise<void> {
	let files: readonly IChangedFile[];
	try {
		files = await github.paginate(github.rest.pulls.listFiles, {
			owner: context.repo.owner,
			repo: context.repo.repo,
			pull_number: context.issue.number,
			per_page: 100,
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		const reason = `Unable to list pull request files; running the full Agent Host test profile. ${message}`;
		core.warning(reason);
		core.setOutput('affected', 'true');
		core.setOutput('profile', 'full');
		core.setOutput('reason', 'Changed-file lookup failed');
		return;
	}

	const paths = files.flatMap(file =>
		file.previous_filename ? [file.filename, file.previous_filename] : [file.filename]);
	const expectedFileCount = context.payload.pull_request?.changed_files;
	const incomplete = typeof expectedFileCount === 'number' && files.length < expectedFileCount;
	const fullProfilePath = paths.find(requiresFullProfile);
	const affected = incomplete || fullProfilePath !== undefined || paths.some(affectsAgentHostE2E);
	const profile = incomplete || fullProfilePath !== undefined ? 'full' : 'pr';
	const reason = incomplete ? 'Changed-file lookup was incomplete'
		: fullProfilePath !== undefined ? `Test, dependency, or infrastructure change: ${fullProfilePath}`
			: affected ? 'Relevant implementation changes'
				: 'No changes affect the parallel E2E suites';

	if (incomplete) {
		core.warning(`GitHub returned ${files.length} of ${expectedFileCount} changed files; running the full Agent Host test profile.`);
	} else {
		core.info(affected
			? 'Agent Host E2E tests may be affected.'
			: 'No changes can affect Agent Host E2E tests.');
	}
	core.info(`Agent Host test profile: ${profile} (${reason})`);
	core.setOutput('affected', affected ? 'true' : 'false');
	core.setOutput('profile', profile);
	core.setOutput('reason', reason);
}
