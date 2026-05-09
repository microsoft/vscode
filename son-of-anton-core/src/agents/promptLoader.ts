/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import type { AgentHandle } from './types';

/**
 * H10 — load per-agent role descriptions from `.prompt.md` files instead of
 * hard-coding them in TypeScript. Lets non-engineers iterate prompts without
 * touching code (and lets prompt diffs read cleanly in PRs).
 *
 * The .md files live alongside this module at runtime: `dist/agents/prompts/`
 * after build, `src/agents/prompts/` during dev (a `tsc` watch session loads
 * the source path). The build script in `package.json` copies the files
 * post-compile so they're available next to the bundled JS.
 *
 * Loading is lazy + cached: the first `loadAgentPrompt(handle)` call reads
 * the file and stashes its contents in a Map; subsequent calls return the
 * cached string. Missing files throw — prompts are load-bearing, so failing
 * loud beats falling back to an empty role description.
 *
 * Dynamic substitution: the orchestrator's prompt embeds a `{{SPECIALISTS}}`
 * placeholder that's replaced at call time with the live specialist roster.
 * Other agents' prompts are static strings.
 */

const HANDLE_TO_FILENAME: Record<AgentHandle, string> = {
	'anton': 'anton-orchestrator.prompt.md',
	'anton-code': 'anton-code.prompt.md',
	'anton-test': 'anton-test.prompt.md',
	'anton-e2e': 'anton-e2e.prompt.md',
	'anton-security': 'anton-security.prompt.md',
	'anton-pentest': 'anton-security.prompt.md',
	'anton-docs': 'anton-docs.prompt.md',
	'anton-ci': 'anton-ci.prompt.md',
	'anton-pr': 'anton-pr.prompt.md',
	'anton-moderniser': 'anton-moderniser.prompt.md',
	'anton-review': 'anton-review.prompt.md',
	'anton-spec': 'anton-orchestrator.prompt.md',
};

const cache = new Map<AgentHandle, string>();

/**
 * Resolve the on-disk location of the prompts directory, working from both
 * the compiled `dist/agents/promptLoader.js` location (where prompts are
 * sibling to the JS via the post-build copy) and the source
 * `src/agents/promptLoader.ts` location during development. The prompts
 * directory always sits next to this file.
 */
function promptsDir(): string {
	return path.join(__dirname, 'prompts');
}

/**
 * Load the role description for an agent handle. Throws when the file
 * cannot be read — a missing prompt is a programming error rather than a
 * runtime fallback case, since the role description is what gives the
 * agent its identity.
 */
export function loadAgentPrompt(handle: AgentHandle): string {
	const cached = cache.get(handle);
	if (cached !== undefined) {
		return cached;
	}
	const filename = HANDLE_TO_FILENAME[handle];
	if (!filename) {
		throw new Error(`No prompt file mapped for agent handle "${handle}". Add an entry to HANDLE_TO_FILENAME in promptLoader.ts.`);
	}
	const fullPath = path.join(promptsDir(), filename);
	let text: string;
	try {
		text = fs.readFileSync(fullPath, 'utf8');
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		throw new Error(`Failed to load agent prompt for "${handle}" from ${fullPath}: ${message}`);
	}
	const trimmed = text.replace(/\s+$/, '');
	cache.set(handle, trimmed);
	return trimmed;
}
