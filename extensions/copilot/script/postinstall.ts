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

async function removeCopilotCLIShim() {
	const shimsPath = path.join(REPO_ROOT, 'node_modules', '@github', 'copilot', 'shims.txt');
	await fs.promises.rm(shimsPath, { force: true }).catch(() => { /* ignore */ });
}

/**
 * @github/copilot/sdk/index.js depends on @github/copilot/worker/*.js files.
 * We need to copy these files into the sdk directory to ensure they are available at runtime.
 */
async function copyCopilotCliWorkerFiles() {
	const sourceDir = path.join(REPO_ROOT, 'node_modules', '@github', 'copilot', 'worker');
	const targetDir = path.join(REPO_ROOT, 'node_modules', '@github', 'copilot', 'sdk', 'worker');

	await copyCopilotCLIFolders(sourceDir, targetDir);
}

async function copyCopilotCliSharpFiles() {
	const sourceDir = path.join(REPO_ROOT, 'node_modules', '@github', 'copilot', 'sharp');
	const targetDir = path.join(REPO_ROOT, 'node_modules', '@github', 'copilot', 'sdk', 'sharp');

	await copyCopilotCLIFolders(sourceDir, targetDir);
}

async function copyCopilotCliDefinitionFiles() {
	const sourceDir = path.join(REPO_ROOT, 'node_modules', '@github', 'copilot', 'definitions');
	const targetDir = path.join(REPO_ROOT, 'node_modules', '@github', 'copilot', 'sdk', 'definitions');

	await copyCopilotCLIFolders(sourceDir, targetDir);
}

async function copyCopilotCliSkillsFiles() {
	const sourceDir = path.join(REPO_ROOT, 'node_modules', '@github', 'copilot', 'builtin-skills');
	const targetDir = path.join(REPO_ROOT, 'node_modules', '@github', 'copilot', 'sdk', 'builtin-skills');

	await copyCopilotCLIFolders(sourceDir, targetDir);
}

async function copyCopilotCliQueryFiles() {
	const sourceDir = path.join(REPO_ROOT, 'node_modules', '@github', 'copilot', 'queries');
	const targetDir = path.join(REPO_ROOT, 'node_modules', '@github', 'copilot', 'sdk', 'queries');

	await copyCopilotCLIFolders(sourceDir, targetDir);
}

async function copyCopilotCliPrebuildFiles() {
	const sourceDir = path.join(REPO_ROOT, 'node_modules', '@github', 'copilot', 'prebuilds');
	const targetDir = path.join(REPO_ROOT, 'node_modules', '@github', 'copilot', 'sdk', 'prebuilds');
	await fs.promises.rm(targetDir, { recursive: true, force: true });
	await fs.promises.mkdir(targetDir, { recursive: true });
	await fs.promises.cp(sourceDir, targetDir, {
		recursive: true, force: true, filter: (src) => {
			try {
				if (fs.statSync(src).isFile()) {
					return src.endsWith('computer.node') || src.endsWith('native.node') || src.endsWith('runtime.node');
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

// Strip GitHub's Authenticode signature from copilot CLI Windows .node prebuilds.
// ESRP's `signtool /as` (append) fails with 0x800700C1 on these pre-signed binaries;
// truncating the embedded Certificate Table lets the build's codesign step sign them.
async function stripCopilotCliPrebuildSignatures() {
	const prebuildsDir = path.join(REPO_ROOT, 'node_modules', '@github', 'copilot', 'sdk', 'prebuilds');
	if (!fs.existsSync(prebuildsDir)) {
		return;
	}

	const stack: string[] = [prebuildsDir];
	while (stack.length > 0) {
		const current = stack.pop()!;
		const entries = await fs.promises.readdir(current, { withFileTypes: true });
		for (const entry of entries) {
			const full = path.join(current, entry.name);
			if (entry.isDirectory()) {
				stack.push(full);
			} else if (entry.isFile() && entry.name.endsWith('.node')) {
				await stripAuthenticodeSignature(full);
			}
		}
	}
}

async function stripAuthenticodeSignature(file: string) {
	const handle = await fs.promises.open(file, 'r+');
	try {
		const dosHeader = Buffer.alloc(2);
		await handle.read(dosHeader, 0, 2, 0);
		if (dosHeader[0] !== 0x4d || dosHeader[1] !== 0x5a) {
			return; // Not a PE binary (no "MZ"); leave Mach-O / ELF prebuilds alone.
		}

		const eLfanew = Buffer.alloc(4);
		await handle.read(eLfanew, 0, 4, 0x3c);
		const peOff = eLfanew.readUInt32LE(0);

		const peSig = Buffer.alloc(4);
		await handle.read(peSig, 0, 4, peOff);
		if (peSig.toString('ascii') !== 'PE\0\0') {
			return;
		}

		const optMagic = Buffer.alloc(2);
		await handle.read(optMagic, 0, 2, peOff + 24);
		// Certificate Table is data directory index 4 (each entry 8 bytes).
		// Data dirs start at OptionalHeader+96 (PE32) or +112 (PE32+), so the
		// cert table entry is at peOff+24+128 (PE32) or peOff+24+144 (PE32+).
		const isPE32Plus = optMagic.readUInt16LE(0) === 0x20b;
		const certDirOffset = peOff + 24 + (isPE32Plus ? 144 : 128);

		const certDir = Buffer.alloc(8);
		await handle.read(certDir, 0, 8, certDirOffset);
		const certVA = certDir.readUInt32LE(0);
		const certSize = certDir.readUInt32LE(4);
		if (certSize === 0 || certVA === 0) {
			return;
		}

		await handle.write(Buffer.alloc(8), 0, 8, certDirOffset);
		await handle.truncate(certVA);
		console.log(`[postinstall] Stripped Authenticode signature from ${path.relative(REPO_ROOT, file)} (${certSize} bytes)`);
	} finally {
		await handle.close();
	}
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

	await removeCopilotCLIShim();
	await copyCopilotCliWorkerFiles();
	await copyCopilotCliSharpFiles();
	await copyCopilotCliDefinitionFiles();
	await copyCopilotCliSkillsFiles();
	await copyCopilotCliQueryFiles();
	await copyCopilotCliPrebuildFiles();
	await stripCopilotCliPrebuildSignatures();

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
