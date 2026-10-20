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

/**
 * Pull request checks that only need to run when the pull request changes one of their paths.
 */
interface IChangeRule {
	/** Name of the action output that reports whether the checks need to run. */
	readonly output: string;
	/** Paths that affect the checks. Entries ending in `/` match a folder; other entries match a file. */
	readonly paths: readonly string[];
}

const sharedPaths = [
	'.github/actions/detect-changes/',
	'.github/workflows/pr.yml',
];

const rules: readonly IChangeRule[] = [
	{
		output: 'cli',
		paths: [
			'cli/',
			// cli/build.rs reads the version from package.json and the product configuration from product.json.
			'package.json',
			'product.json',
			'.github/workflows/pr-linux-cli-test.yml',
		],
	},
	{
		output: 'copilot-shim',
		paths: [
			'copilot_shim/',
			'.github/workflows/pr-linux-cli-test.yml',
		],
	},
	{
		// The Copilot tests run against a downloaded VS Code build and chat-lib is extracted from the extension;
		// neither uses the core sources in the pull request.
		output: 'copilot',
		paths: [
			'extensions/copilot/',
			'.github/actions/test-chat-lib/',
			// Type checking includes the VS Code API typings.
			'src/vscode-dts/',
			'src/typings/thenable.d.ts',
			// Linting uses the root ESLint configuration and rules.
			'eslint.config.js',
			'.eslint-ignore',
			'.eslint-plugin-local/',
			// The jobs install the root dependencies and restore cached node_modules.
			'package.json',
			'package-lock.json',
			'.npmrc',
			'.github/actions/restore-node-modules/',
			'.github/workflows/node_modules_cache/',
			'build/azure-pipelines/common/computeNodeModulesCacheKey.ts',
			'build/azure-pipelines/common/cacheKeys.ts',
			'build/npm/dirs.ts',
			'build/azure-pipelines/win32/exec.ps1',
		],
	},
];

function matchesAny(path: string, patterns: readonly string[]): boolean {
	return patterns.some(pattern => pattern.endsWith('/') ? path.startsWith(pattern) : path === pattern);
}

async function listChangedPaths(github: IGitHub, context: IContext, core: ICore): Promise<readonly string[] | undefined> {
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
		core.warning(`Unable to list pull request files; running all checks. ${message}`);
		return undefined;
	}

	const expectedFileCount = context.payload.pull_request?.changed_files;
	if (typeof expectedFileCount === 'number' && files.length < expectedFileCount) {
		core.warning(`GitHub returned ${files.length} of ${expectedFileCount} changed files; running all checks.`);
		return undefined;
	}

	return files.flatMap(file =>
		file.previous_filename ? [file.filename, file.previous_filename] : [file.filename]);
}

export async function detectChanges(github: IGitHub, context: IContext, core: ICore): Promise<void> {
	const paths = await listChangedPaths(github, context, core);

	for (const rule of rules) {
		const changedPath = paths?.find(path => matchesAny(path, sharedPaths) || matchesAny(path, rule.paths));
		const affected = paths === undefined || changedPath !== undefined;
		const reason = paths === undefined ? 'changed files unavailable'
			: changedPath !== undefined ? `changed ${changedPath}`
				: 'no relevant changes';

		core.info(`${rule.output}: ${affected ? 'run' : 'skip'} (${reason})`);
		core.setOutput(rule.output, affected ? 'true' : 'false');
	}
}
