/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { SOTA_EXIT_CODES } from '../headless';

interface InitOptions {
	description?: string;
	force?: boolean;
	yes?: boolean;
	output?: 'text' | 'json';
}

interface DetectedStack {
	languages: string[];
	notableFiles: string[];
}

interface ImportableRules {
	path: string;
	excerpt: string;
}

const SOTA_DIR = '.son-of-anton';
const AGENTS_FILE = path.join(SOTA_DIR, 'AGENTS.md');
const CONFIG_FILE = path.join(SOTA_DIR, 'config.json');
const LANGUAGE_PROBES: ReadonlyArray<{ file: string; language: string }> = [
	{ file: 'package.json', language: 'TypeScript / JavaScript' },
	{ file: 'tsconfig.json', language: 'TypeScript' },
	{ file: 'pyproject.toml', language: 'Python' },
	{ file: 'requirements.txt', language: 'Python' },
	{ file: 'Cargo.toml', language: 'Rust' },
	{ file: 'go.mod', language: 'Go' },
	{ file: 'Gemfile', language: 'Ruby' },
	{ file: 'composer.json', language: 'PHP' },
	{ file: 'pom.xml', language: 'Java (Maven)' },
	{ file: 'build.gradle', language: 'Java (Gradle)' },
	{ file: 'build.gradle.kts', language: 'Kotlin' },
	{ file: 'mix.exs', language: 'Elixir' },
	{ file: 'CMakeLists.txt', language: 'C / C++' },
];
const IMPORT_CANDIDATES: ReadonlyArray<string> = [
	'CLAUDE.md',
	'.claude/CLAUDE.md',
	'.cursor/rules',
	'.clinerules',
	'.windsurfrules',
	'.aider.conf.yml',
	'.github/copilot-instructions.md',
];

/**
 * Detect the project's language stack by probing for canonical package /
 * build files. Returns the languages discovered (deduped) plus the list of
 * files used for the inference so the AGENTS.md template can list them.
 */
function detectStack(cwd: string): DetectedStack {
	const found = new Set<string>();
	const notable: string[] = [];
	for (const probe of LANGUAGE_PROBES) {
		const full = path.join(cwd, probe.file);
		if (fs.existsSync(full)) {
			found.add(probe.language);
			notable.push(probe.file);
		}
	}
	return {
		languages: Array.from(found),
		notableFiles: notable,
	};
}

/**
 * Look for existing AI assistant rule files we can import content from. Each
 * import candidate is read with a generous excerpt cap so AGENTS.md doesn't
 * balloon when a project has a 5000-line CLAUDE.md.
 */
function findImportable(cwd: string): ImportableRules[] {
	const result: ImportableRules[] = [];
	for (const rel of IMPORT_CANDIDATES) {
		const full = path.join(cwd, rel);
		try {
			const stat = fs.statSync(full);
			if (!stat.isFile()) {
				continue;
			}
			const raw = fs.readFileSync(full, 'utf8');
			const trimmed = raw.length > 4000 ? raw.slice(0, 4000) + '\n\n…(truncated)' : raw;
			result.push({ path: rel, excerpt: trimmed });
		} catch {
			// Path missing or unreadable — skip.
		}
	}
	return result;
}

/**
 * Render the starter AGENTS.md content. Sections mirror the Son of Anton
 * project's own AGENTS.md so the orchestrator's existing context-loader
 * (Phase 67) sees a familiar shape and can ground responses against it
 * without further tuning.
 */
function renderAgentsTemplate(args: {
	cwd: string;
	description: string;
	stack: DetectedStack;
	imports: ReadonlyArray<ImportableRules>;
}): string {
	const projectName = path.basename(args.cwd);
	const stackLine = args.stack.languages.length > 0
		? args.stack.languages.join(', ')
		: 'Language not auto-detected — fill this in.';
	const filesLine = args.stack.notableFiles.length > 0
		? args.stack.notableFiles.map((f) => `- \`${f}\``).join('\n')
		: '- (none detected — add the files the agent should pay attention to)';
	const importsBlock = args.imports.length === 0
		? ''
		: `\n## Imported guidance\n\n${args.imports
			.map((i) => `### From \`${i.path}\`\n\n${i.excerpt}\n`)
			.join('\n')}`;

	return `# ${projectName}

${args.description}

## Stack

${stackLine}

## Notable files

${filesLine}

## Coding standards

- Reuse existing utilities and patterns before introducing new ones.
- Keep changes scoped to the task; avoid speculative refactors.
- Comments explain *why*, not *what* — names should already say *what*.
- Tests live next to the code they exercise; prefer one snapshot-style assertion over many small ones.

## Forbidden patterns

- (Customise to your project — e.g. "no direct fetch() calls, use the shared HTTP client".)
- No secrets in source. Use environment variables or the config store.
- No bypassing trust gates / auto-approval policies.

## Testing

- Run the project's existing test command before declaring work complete.
- Failing tests block a task — investigate the root cause rather than skipping.
${importsBlock}
`;
}

/**
 * Render a starter `.son-of-anton/config.json`. Settings are deliberately
 * conservative: read-only auto-approval, plan mode off, no MCP servers wired
 * yet. Users can layer over this with `sota config set …`.
 */
function renderStarterConfig(): string {
	return JSON.stringify(
		{
			$schema: 'https://son-of-anton.dev/schemas/workspace-config.v1.json',
			autoApprove: {
				read: true,
				write: false,
				shell: false,
				mcp: false,
			},
			planMode: false,
			mcpServers: [],
		},
		null,
		2,
	) + '\n';
}

async function promptYesNo(question: string, defaultYes: boolean): Promise<boolean> {
	const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
	try {
		const suffix = defaultYes ? '[Y/n]' : '[y/N]';
		const answer = await new Promise<string>((resolve) => {
			rl.question(`${question} ${suffix} `, resolve);
		});
		const trimmed = answer.trim().toLowerCase();
		if (!trimmed) {
			return defaultYes;
		}
		return trimmed.startsWith('y');
	} finally {
		rl.close();
	}
}

async function promptText(question: string, defaultValue: string): Promise<string> {
	const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
	try {
		const answer = await new Promise<string>((resolve) => {
			rl.question(`${question} (default: ${defaultValue}) `, resolve);
		});
		const trimmed = answer.trim();
		return trimmed || defaultValue;
	} finally {
		rl.close();
	}
}

function isInteractive(opts: InitOptions): boolean {
	if (opts.yes) {
		return false;
	}
	return !!process.stdin.isTTY && !!process.stdout.isTTY;
}

/**
 * Top-level `sota init` command. Two modes — interactive (stdin is a TTY) and
 * deterministic (--yes, or stdin piped). Deterministic mode is the one CI
 * uses; interactive mode walks a small confirm-style prompt for one-off use.
 */
export async function runInit(opts: InitOptions): Promise<void> {
	const cwd = process.cwd();
	const sotaDirAbs = path.join(cwd, SOTA_DIR);
	const agentsAbs = path.join(cwd, AGENTS_FILE);
	const configAbs = path.join(cwd, CONFIG_FILE);

	if (fs.existsSync(agentsAbs) && !opts.force) {
		process.stderr.write(`error: ${AGENTS_FILE} already exists. Re-run with --force to overwrite.\n`);
		process.exit(SOTA_EXIT_CODES.HARD_FAIL);
	}

	const stack = detectStack(cwd);
	const imports = findImportable(cwd);
	const projectName = path.basename(cwd);

	const interactive = isInteractive(opts);
	let description = opts.description ?? `Project: ${projectName}.`;
	const importsToInclude: ImportableRules[] = [];

	if (interactive) {
		process.stdout.write(`\nInitialising Son of Anton in ${cwd}\n`);
		process.stdout.write(`Detected stack: ${stack.languages.join(', ') || 'unknown'}\n\n`);

		description = await promptText('One-line description of this project?', description);

		for (const imp of imports) {
			const ok = await promptYesNo(`Import guidance from ${imp.path}?`, true);
			if (ok) {
				importsToInclude.push(imp);
			}
		}
	} else {
		// Non-interactive: include every importable file so a CI bootstrap
		// captures all available guidance without prompting.
		importsToInclude.push(...imports);
	}

	fs.mkdirSync(sotaDirAbs, { recursive: true });
	const agentsContent = renderAgentsTemplate({
		cwd,
		description,
		stack,
		imports: importsToInclude,
	});
	fs.writeFileSync(agentsAbs, agentsContent);
	if (!fs.existsSync(configAbs)) {
		fs.writeFileSync(configAbs, renderStarterConfig());
	}

	const summary = {
		ok: true,
		wrote: [AGENTS_FILE, CONFIG_FILE],
		stack: stack.languages,
		imported: importsToInclude.map((i) => i.path),
	};

	if (opts.output === 'json') {
		process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
		return;
	}

	process.stdout.write('\nWrote:\n');
	process.stdout.write(`  ${AGENTS_FILE}\n`);
	process.stdout.write(`  ${CONFIG_FILE}\n`);
	if (importsToInclude.length > 0) {
		process.stdout.write(`Imported guidance from: ${importsToInclude.map((i) => i.path).join(', ')}\n`);
	}
	process.stdout.write('\nNext steps:\n');
	process.stdout.write('  1. Review and edit .son-of-anton/AGENTS.md to fit your project.\n');
	process.stdout.write('  2. Run `sota chat` to start a session.\n');
	process.stdout.write('  3. Run `sota config set <key> <value>` to tune workspace overrides.\n');
}
