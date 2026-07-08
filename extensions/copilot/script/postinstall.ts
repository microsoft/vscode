/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import { compressTikToken } from './build/compressTikToken';
import { copyStaticAssets } from './build/copyStaticAssets';

export interface ITreeSitterGrammar {
	name: string;
	/**
	 * A custom .wasm filename if the grammar node module doesn't follow the standard naming convention
	 */
	filename?: string;
	/**
	 * The path where we should spawn `tree-sitter build-wasm`
	 */
	projectPath?: string;
}

const treeSitterGrammars: ITreeSitterGrammar[] = [
	{
		name: 'tree-sitter-c-sharp',
		filename: 'tree-sitter-c_sharp.wasm' // non-standard filename
	},
	{
		name: 'tree-sitter-cpp',
	},
	{
		name: 'tree-sitter-go',
	},
	{
		name: 'tree-sitter-javascript', // Also includes jsx support
	},
	{
		name: 'tree-sitter-python',
	},
	{
		name: 'tree-sitter-ruby',
	},
	{
		name: 'tree-sitter-typescript',
		projectPath: 'tree-sitter-typescript/typescript', // non-standard path
	},
	{
		name: 'tree-sitter-tsx',
		projectPath: 'tree-sitter-typescript/tsx', // non-standard path
	},
	{
		name: 'tree-sitter-java',
	},
	{
		name: 'tree-sitter-rust',
	},
	{
		name: 'tree-sitter-php'
	}
];

const REPO_ROOT = path.join(__dirname, '..');
const COPILOT_PACKAGE_DIR = path.join(REPO_ROOT, 'node_modules', '@github', 'copilot');
const COPILOT_CLI_TOP_LEVEL_DIRS = [
	'worker',
	'definitions',
	'builtin-skills',
	'builtin',
	'tgrep',
	'queries',
	'prebuilds',
	'ripgrep',
	'foundry-local-sdk',
	'pvrecorder',
	'mxc-bin',
	'clipboard',
	'copilot-sdk',
	'schemas',
	'preloads',
];

interface ICopilotPackageJson {
	exports?: Record<string, unknown>;
}

function isLinuxMuslRuntime(): boolean {
	if (process.platform !== 'linux') {
		return false;
	}

	const report = process.report?.getReport() as { header?: { glibcVersionRuntime?: string } } | undefined;
	return !report?.header?.glibcVersionRuntime;
}

function getCopilotPlatformPackageCandidates(): string[] {
	const arch = process.arch;

	if (process.platform === 'linux') {
		const linuxCandidates = [`linux-${arch}`, `linuxmusl-${arch}`];
		return isLinuxMuslRuntime() ? linuxCandidates.reverse() : linuxCandidates;
	}

	return [`${process.platform}-${arch}`];
}

async function resolveCopilotCliSourceDir(): Promise<string> {
	const tried: string[] = [];
	for (const platformPackage of getCopilotPlatformPackageCandidates()) {
		const sourceDir = path.join(REPO_ROOT, 'node_modules', '@github', `copilot-${platformPackage}`);
		tried.push(sourceDir);
		if (fs.existsSync(path.join(sourceDir, 'sdk', 'index.js'))) {
			return sourceDir;
		}
	}

	if (fs.existsSync(path.join(COPILOT_PACKAGE_DIR, 'sdk', 'index.js'))) {
		return COPILOT_PACKAGE_DIR;
	}

	throw new Error(`Could not find @github/copilot SDK files. Tried: ${[COPILOT_PACKAGE_DIR, ...tried].join(', ')}`);
}

async function ensureCopilotSdkExport() {
	const packageJsonPath = path.join(COPILOT_PACKAGE_DIR, 'package.json');
	const packageJson = JSON.parse(await fs.promises.readFile(packageJsonPath, 'utf8')) as ICopilotPackageJson;
	packageJson.exports = {
		...(packageJson.exports ?? {}),
		'./sdk': {
			types: './sdk/index.d.ts',
			import: './sdk/index.js'
		}
	};

	await fs.promises.writeFile(packageJsonPath, `${JSON.stringify(packageJson, undefined, 2)}\n`);
}

async function materializeCopilotCliSdkLayout(): Promise<string> {
	const sourceDir = await resolveCopilotCliSourceDir();

	if (sourceDir !== COPILOT_PACKAGE_DIR) {
		await copyCopilotCLIFolders(path.join(sourceDir, 'sdk'), path.join(COPILOT_PACKAGE_DIR, 'sdk'));
		for (const dir of COPILOT_CLI_TOP_LEVEL_DIRS) {
			const sourcePath = path.join(sourceDir, dir);
			if (fs.existsSync(sourcePath)) {
				await copyCopilotCLIFolders(sourcePath, path.join(COPILOT_PACKAGE_DIR, dir));
			}
		}

		for (const entry of await fs.promises.readdir(sourceDir)) {
			if (entry.startsWith('tree-sitter') && entry.endsWith('.wasm')) {
				await fs.promises.copyFile(path.join(sourceDir, entry), path.join(COPILOT_PACKAGE_DIR, entry));
			}
		}
	}

	await ensureCopilotSdkExport();
	return sourceDir;
}

async function removeCopilotCLIShim() {
	const shimsPath = path.join(COPILOT_PACKAGE_DIR, 'shims.txt');
	await fs.promises.rm(shimsPath, { force: true }).catch(() => { /* ignore */ });
}

async function removeCopilotCliWorkerFiles() {
	const targetDir = path.join(COPILOT_PACKAGE_DIR, 'sdk', 'worker');
	await fs.promises.rm(targetDir, { recursive: true, force: true });
}

async function copyCopilotCliTGrepFiles(copilotCliSourceDir: string) {
	const sourceDir = path.join(copilotCliSourceDir, 'tgrep');
	const targetDir = path.join(COPILOT_PACKAGE_DIR, 'sdk', 'tgrep');

	await copyCopilotCLIFolders(sourceDir, targetDir);
}

async function copyCopilotCliDefinitionFiles(copilotCliSourceDir: string) {
	const sourceDir = path.join(copilotCliSourceDir, 'definitions');
	const targetDir = path.join(COPILOT_PACKAGE_DIR, 'sdk', 'definitions');

	await copyCopilotCLIFolders(sourceDir, targetDir);
}

async function copyCopilotCliSkillsFiles(copilotCliSourceDir: string) {
	const sourceDir = path.join(copilotCliSourceDir, 'builtin-skills');
	const targetDir = path.join(COPILOT_PACKAGE_DIR, 'sdk', 'builtin-skills');

	await copyCopilotCLIFolders(sourceDir, targetDir);
}

async function copyCopilotCliQueryFiles(copilotCliSourceDir: string) {
	const sourceDir = path.join(copilotCliSourceDir, 'queries');
	const targetDir = path.join(COPILOT_PACKAGE_DIR, 'sdk', 'queries');

	await copyCopilotCLIFolders(sourceDir, targetDir);
}

async function copyCopilotCliPrebuildFiles(copilotCliSourceDir: string) {
	const sourceDir = path.join(copilotCliSourceDir, 'prebuilds');
	const targetDir = path.join(COPILOT_PACKAGE_DIR, 'sdk', 'prebuilds');
	await fs.promises.rm(targetDir, { recursive: true, force: true });
	await fs.promises.mkdir(targetDir, { recursive: true });
	await fs.promises.cp(sourceDir, targetDir, {
		recursive: true, force: true, filter: (src) => {
			try {
				if (fs.statSync(src).isFile()) {
					const normalizedSrc = src.split(path.sep).join(path.posix.sep);
					return src.endsWith('computer.node')
						|| src.endsWith('runtime.node')
						|| src.endsWith('cli-native.node')
						// node-pty natives: pty.node (+ spawn-helper) on Unix,
						// conpty.node and its companions on Windows. `endsWith('pty.node')`
						// also matches `conpty.node`. The conpty native additionally needs
						// conpty_console_list.node and the conpty/ helpers (OpenConsole.exe,
						// conpty.dll) to actually spawn. The *.pdb debug symbols are skipped.
						|| src.endsWith('pty.node')
						|| src.endsWith('conpty_console_list.node')
						|| src.endsWith('spawn-helper')
						|| normalizedSrc.includes('/conpty/');
				}
				return true;
			} catch {
				return true;
			}
		}
	});
}

async function copyCopilotCLIFolders(sourceDir: string, targetDir: string) {
	await fs.promises.rm(targetDir, { recursive: true, force: true });
	await fs.promises.mkdir(targetDir, { recursive: true });
	await fs.promises.cp(sourceDir, targetDir, { recursive: true, force: true });
}

/**
 * Creates symlinks so that `.claude/` mirrors canonical locations (for testing Claude Agent harness):
 *   .claude/CLAUDE.md  →  .github/copilot-instructions.md
 *   .claude/skills     →  .agents/skills
 */
async function createClaudeSymlinks() {
	if (process.platform === 'win32') {
		// Creating symlinks on Windows may fail without Developer Mode or admin privileges.
		// Skip this step to avoid postinstall failures on environments where symlinks are not available.
		return;
	}

	console.log('Creating symlinks for Claude session storage and instructions...');
	const claudeDir = path.join(REPO_ROOT, '.claude');
	await fs.promises.mkdir(claudeDir, { recursive: true });

	const symlinks: { link: string; target: string }[] = [
		{ link: path.join(claudeDir, 'CLAUDE.md'), target: path.join('..', '.github', 'copilot-instructions.md') },
		{ link: path.join(claudeDir, 'skills'), target: path.join('..', '.agents', 'skills') },
	];

	for (const { link, target } of symlinks) {
		if (!fs.existsSync(link)) {
			await fs.promises.symlink(target, link);
		}
	}
}

async function main() {
	await fs.promises.mkdir(path.join(REPO_ROOT, '.build'), { recursive: true });

	await createClaudeSymlinks();

	const vendoredTiktokenFiles = ['src/platform/tokenizer/node/cl100k_base.tiktoken', 'src/platform/tokenizer/node/o200k_base.tiktoken'];

	for (const tokens of vendoredTiktokenFiles) {
		await compressTikToken(tokens, `dist/${path.basename(tokens)}`);
	}

	// copy static assets to dist
	await copyStaticAssets([
		...treeSitterGrammars.map(grammar => `node_modules/@vscode/tree-sitter-wasm/wasm/${grammar.name}.wasm`),
		'node_modules/@vscode/tree-sitter-wasm/wasm/tree-sitter.wasm',
		'node_modules/@github/blackbird-external-ingest-utils/pkg/nodejs/external_ingest_utils_bg.wasm',
	], 'dist');

	const copilotCliSourceDir = await materializeCopilotCliSdkLayout();
	await removeCopilotCLIShim();
	await removeCopilotCliWorkerFiles();
	await copyCopilotCliDefinitionFiles(copilotCliSourceDir);
	await copyCopilotCliSkillsFiles(copilotCliSourceDir);
	await copyCopilotCliTGrepFiles(copilotCliSourceDir);
	await copyCopilotCliQueryFiles(copilotCliSourceDir);
	await copyCopilotCliPrebuildFiles(copilotCliSourceDir);

	// Check if the base cache file exists (dev-only sanity check, non-fatal in CI)
	const baseCachePath = path.join('test', 'simulation', 'cache', 'base.sqlite');
	if (!fs.existsSync(baseCachePath)) {
		console.warn(`Warning: Base cache file does not exist at ${baseCachePath}. Please ensure that you have git lfs installed and initialized before the repository is cloned.`);
	}

	await copyStaticAssets([
		`node_modules/@anthropic-ai/claude-agent-sdk/cli.js`,
	], 'dist');
}

main();
