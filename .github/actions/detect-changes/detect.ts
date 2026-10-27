/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

interface IChangedFile {
	readonly filename: string;
	readonly previous_filename?: string;
	readonly status?: string;
	/** The unified diff of the change, which GitHub omits for large diffs. */
	readonly patch?: string;
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
			'pnpm-lock.yaml',
			'pnpm-workspace.yaml',
			'.pnpmfile.mjs',
			'.npmrc',
			'.github/actions/setup-pnpm/',
			'.github/actions/restore-node-modules/',
			'.github/workflows/node_modules_cache/',
			'build/azure-pipelines/common/computeNodeModulesCacheKey.ts',
			'build/azure-pipelines/common/cacheKeys.ts',
			'build/npm/dirs.ts',
			'build/azure-pipelines/win32/exec.ps1',
		],
	},
];

/**
 * Core test jobs that run unless every changed path is one the tests cannot read. Any other path,
 * including a new kind of file, runs the jobs.
 */
interface ICoreTestRule {
	/** Name of the action output that reports whether the jobs need to run. */
	readonly output: string;
	/** Whether the jobs cannot be affected by a change to the path. */
	readonly canSkip: (path: string) => boolean;
}

/** Markdown outside the sources, tests and extensions, which use Markdown files as test inputs. */
function isDocumentation(path: string): boolean {
	return path.endsWith('.md') && !/^(src|test|extensions)\//.test(path);
}

/** The Rust crates, which the core test jobs neither build nor run. */
function isRustCrate(path: string): boolean {
	return path.startsWith('cli/') || path.startsWith('copilot_shim/');
}

/** The ESLint configuration. Entries ending in `/` match a folder; other entries match a file. */
const eslintConfigurationPaths = [
	'eslint.config.js',
	'.eslint-ignore',
	'.eslint-allowed-javascript-files',
	'.eslint-allowed-bracket-notation-files',
	'.eslint-plugin-local/',
];

/**
 * Paths that only Compile & Hygiene reads, so that a change to them can skip the test jobs (and the other jobs that
 * Detect Changes selects):
 *
 * - The Azure Pipelines definitions, which only the product builds run. In pull requests, only the build script tests
 *   of Compile & Hygiene read them. The scripts next to them are not definitions: some of them run in the pull request
 *   jobs.
 * - The workspace configuration of the repository in the root .vscode/ folder, including the self-hosting extensions
 *   in .vscode/extensions/. No test reads them: the test jobs only install the dependencies of the extensions and
 *   transpile their sources, which Compile & Hygiene also covers by installing the dependencies, loading their
 *   tsconfig.json files and linting their sources. The telemetry extractor searches the sources with ripgrep, which
 *   skips hidden folders such as .vscode/. The .vscode folders elsewhere, such as those of the test workspaces in
 *   extensions/, are test inputs.
 * - The ESLint configuration and the local ESLint rules in .eslint-plugin-local/, which only ESLint, hygiene and the
 *   build script tests read. Loading the gulpfiles also reads .eslint-ignore (see build/filters.ts), which Compile &
 *   Hygiene also does. The Copilot checks lint with the same configuration, so the copilot rule lists these paths.
 * - The sanity tests in test/sanity/, which only the product builds run against the built packages (see
 *   build/azure-pipelines/common/sanity-tests.yml). In pull requests, only ESLint and hygiene check their sources.
 */
export function shouldSkipTestJobs(path: string): boolean {
	const isAzurePipelinesDefinition = path.startsWith('build/azure-pipelines/') && /\.ya?ml$/.test(path);
	const isWorkspaceConfiguration = path.startsWith('.vscode/');
	const isEslintConfiguration = matchesAny(path, eslintConfigurationPaths);
	const isSanityTest = path.startsWith('test/sanity/');
	return isAzurePipelinesDefinition || isWorkspaceConfiguration || isEslintConfiguration || isSanityTest;
}

/**
 * Whether a change only updates the microsoft/vscode-distro commit in the `distro` field of package.json, as
 * `pnpm run update-distro` does. Only the product builds read the commit: they download the distro and mix it into the
 * build (see build/azure-pipelines/distro/). No pull request check downloads it, so such a change runs only Compile &
 * Hygiene, whose node_modules cache key includes the field. A change without a patch, which GitHub omits for large
 * diffs, counts as any other change to package.json.
 */
export function isDistroUpdate(file: IChangedFile): boolean {
	if (file.filename !== 'package.json' || file.status !== 'modified' || file.patch === undefined) {
		return false;
	}
	const changedLines = file.patch.split('\n').filter(line => line.startsWith('+') || line.startsWith('-'));
	return changedLines.length > 0 && changedLines.every(line => /^[+-] {2}"distro": "[0-9a-f]*",?$/.test(line));
}

/**
 * Returns the paths of the changed files, and the paths that renamed files had before, except package.json when the
 * change only updates the distro commit (see isDistroUpdate).
 */
export function changedPaths(files: readonly IChangedFile[]): string[] {
	return files.flatMap(file => isDistroUpdate(file) ? []
		: file.previous_filename ? [file.filename, file.previous_filename] : [file.filename]);
}

/**
 * Built-in extensions whose files the core unit tests read: the component fixtures load the themes and
 * these grammars. build/lib/test/detectChanges.test.ts fails when a test starts reading another extension.
 */
const extensionsReadByUnitTests = new Set(['css', 'html', 'javascript', 'json', 'typescript-basics']);

function isExtensionNotReadByUnitTests(path: string): boolean {
	const name = /^extensions\/([^/]+)\//.exec(path)?.[1];
	return name !== undefined && !name.startsWith('theme-') && !extensionsReadByUnitTests.has(name);
}

const coreTestRules: readonly ICoreTestRule[] = [
	{
		// Electron, node.js and browser unit tests load only the core sources and their test fixtures.
		output: 'unit-tests',
		canSkip: path => isDocumentation(path) || isRustCrate(path) || shouldSkipTestJobs(path) || isExtensionNotReadByUnitTests(path),
	},
	{
		// The browser integration and smoke tests do not load the Copilot extension.
		output: 'browser-integration',
		canSkip: path => isDocumentation(path) || isRustCrate(path) || shouldSkipTestJobs(path) || path.startsWith('extensions/copilot/'),
	},
	{
		// The Electron integration, Electron smoke and remote tests exercise the built-in extensions.
		output: 'product-tests',
		canSkip: path => isDocumentation(path) || isRustCrate(path) || shouldSkipTestJobs(path),
	},
	{
		// The Monaco Editor checks also package Markdown files, such as build/monaco/README-npm.md.
		output: 'monaco-editor',
		canSkip: shouldSkipTestJobs,
	},
	{
		output: 'telemetry',
		canSkip: shouldSkipTestJobs,
	},
];

function matchesAny(path: string, patterns: readonly string[]): boolean {
	return patterns.some(pattern => pattern.endsWith('/') ? path.startsWith(pattern) : path === pattern);
}

async function listChangedFiles(github: IGitHub, context: IContext, core: ICore): Promise<readonly IChangedFile[] | undefined> {
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

	return files;
}

export async function detectChanges(github: IGitHub, context: IContext, core: ICore): Promise<void> {
	const files = await listChangedFiles(github, context, core);
	const paths = files && changedPaths(files);

	for (const rule of rules) {
		const changedPath = paths?.find(path => matchesAny(path, sharedPaths) || matchesAny(path, rule.paths));
		const affected = paths === undefined || changedPath !== undefined;
		const reason = paths === undefined ? 'changed files unavailable'
			: changedPath !== undefined ? `changed ${changedPath}`
				: 'no relevant changes';

		core.info(`${rule.output}: ${affected ? 'run' : 'skip'} (${reason})`);
		core.setOutput(rule.output, affected ? 'true' : 'false');
	}

	for (const rule of coreTestRules) {
		const changedPath = paths?.find(path => !rule.canSkip(path));
		// An empty file list carries no evidence that the checks are unaffected.
		const affected = files === undefined || files.length === 0 || changedPath !== undefined;
		const reason = files === undefined ? 'changed files unavailable'
			: files.length === 0 ? 'no changed files reported'
				: changedPath !== undefined ? `changed ${changedPath}`
					: 'only changes the tests cannot read';

		core.info(`${rule.output}: ${affected ? 'run' : 'skip'} (${reason})`);
		core.setOutput(rule.output, affected ? 'true' : 'false');
	}
}
