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
	'scripts/test-agent-host-e2e.ts',
	'scripts/test-agent-host-e2e-child.ps1',
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
];

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
		core.warning(`Unable to list pull request files; running Agent Host E2E tests. ${message}`);
		core.setOutput('affected', 'true');
		return;
	}

	const paths = files.flatMap(file =>
		file.previous_filename ? [file.filename, file.previous_filename] : [file.filename]);
	const expectedFileCount = context.payload.pull_request?.changed_files;
	const incomplete = typeof expectedFileCount === 'number' && files.length < expectedFileCount;
	const affected = incomplete || paths.some(affectsAgentHostE2E);

	if (incomplete) {
		core.warning(`GitHub returned ${files.length} of ${expectedFileCount} changed files; running Agent Host E2E tests.`);
	} else {
		core.info(affected
			? 'Agent Host E2E tests may be affected.'
			: 'No changes can affect Agent Host E2E tests.');
	}
	core.setOutput('affected', affected ? 'true' : 'false');
}
