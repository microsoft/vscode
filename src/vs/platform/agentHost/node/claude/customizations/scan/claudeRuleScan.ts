/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../../base/common/uri.js';
import { basename } from '../../../../../../base/common/resources.js';
import { IFileService } from '../../../../../files/common/files.js';
import { parseRuleFile, pathExists, type IParsedRule } from '../../../../../agentPlugins/common/pluginParsers.js';
import { CustomizationType } from '../../../../common/state/protocol/channels-session/state.js';
import { customizationId, type RuleCustomization } from '../../../../common/state/sessionState.js';

/**
 * The CLAUDE.md memory files a session loads as always-on rules. The
 * documented primary locations only — user `~/.claude/CLAUDE.md`, project
 * `./CLAUDE.md` / `./.claude/CLAUDE.md`, and the personal `./CLAUDE.local.md`.
 * (Managed-policy OS-level CLAUDE.md and the ancestor-directory walk are
 * intentionally out of scope.)
 *
 * Exported so the change-watcher can reuse the exact same list and never
 * drift from what {@link scanClaudeRules} actually reads.
 */
export function claudeMemoryFiles(workingDirectory: URI | undefined, userHome: URI): URI[] {
	const files = [URI.joinPath(userHome, '.claude', 'CLAUDE.md')];
	if (workingDirectory) {
		files.push(
			URI.joinPath(workingDirectory, 'CLAUDE.md'),
			URI.joinPath(workingDirectory, '.claude', 'CLAUDE.md'),
			URI.joinPath(workingDirectory, 'CLAUDE.local.md'),
		);
	}
	return files;
}

/**
 * Recursively collects `*.md` files under `dir` (sorted by path). Follows
 * symlinked subdirectories — `.claude/rules` supports them — with a
 * visited-set guard plus a hard depth cap so circular symlinks terminate.
 * (The visited-set alone is insufficient: a symlink cycle like
 * `rules/a -> rules` produces an ever-deeper, never-repeating path, so the
 * depth cap is the real termination guarantee.)
 */
const MAX_RULE_SCAN_DEPTH = 32;

async function readMarkdownFilesRecursive(dir: URI, fileService: IFileService, seen = new Set<string>(), depth = 0): Promise<URI[]> {
	const key = dir.toString();
	if (depth > MAX_RULE_SCAN_DEPTH || seen.has(key)) {
		return [];
	}
	seen.add(key);

	let stat;
	try {
		stat = await fileService.resolve(dir);
	} catch {
		return [];
	}
	if (!stat.isDirectory || !stat.children) {
		return [];
	}

	const files: URI[] = [];
	for (const child of stat.children) {
		if (child.isDirectory) {
			files.push(...await readMarkdownFilesRecursive(child.resource, fileService, seen, depth + 1));
		} else if (child.isFile && child.resource.path.toLowerCase().endsWith('.md')) {
			files.push(child.resource);
		}
	}
	return files.sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * Scans a session's Claude "memory" rules — the {@link CustomizationType.Rule}
 * tier — from both forms:
 *   - CLAUDE.md instruction files ({@link claudeMemoryFiles}): always-on,
 *     no path scoping.
 *   - `.claude/rules/**\/*.md` (project + user, recursive): path-scoped when
 *     a `paths` frontmatter glob is present (parsed via {@link parseRuleFile}),
 *     otherwise always-on.
 *
 * Each rule carries its real source-file `uri` so the workbench can open it
 * for editing. Rules are additive (not deduped by name) — the SDK has no
 * rule concept, so they are never filtered post-materialize.
 */
export async function scanClaudeRules(
	workingDirectory: URI | undefined,
	userHome: URI,
	fileService: IFileService,
): Promise<readonly IParsedRule[]> {
	const result: IParsedRule[] = [];

	// CLAUDE.md memory files — always-on, no path scoping, no frontmatter.
	for (const uri of claudeMemoryFiles(workingDirectory, userHome)) {
		if (await pathExists(uri, fileService)) {
			const ruleUri = uri.toString();
			const name = basename(uri);
			const customization: RuleCustomization = {
				type: CustomizationType.Rule,
				id: customizationId(ruleUri),
				uri: ruleUri,
				name,
				alwaysApply: true,
			};
			result.push({ uri, name, customization });
		}
	}

	// `.claude/rules/**\/*.md` — path-scoped when `paths` frontmatter present.
	const scopes = workingDirectory ? [workingDirectory, userHome] : [userHome];
	for (const scope of scopes) {
		const files = await readMarkdownFilesRecursive(URI.joinPath(scope, '.claude', 'rules'), fileService);
		for (const uri of files) {
			const parsed = await parseRuleFile(uri, fileService);
			const ruleUri = uri.toString();
			const hasGlobs = !!parsed.globs?.length;
			const customization: RuleCustomization = {
				type: CustomizationType.Rule,
				id: customizationId(ruleUri),
				uri: ruleUri,
				name: parsed.name,
				...(parsed.description ? { description: parsed.description } : {}),
				...(hasGlobs ? { globs: parsed.globs } : {}),
				alwaysApply: !hasGlobs,
			};
			result.push({ uri, name: parsed.name, ...(parsed.description ? { description: parsed.description } : {}), customization });
		}
	}

	return result;
}
