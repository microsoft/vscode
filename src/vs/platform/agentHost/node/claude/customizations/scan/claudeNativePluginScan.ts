/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../../base/common/uri.js';
import { ResourceSet } from '../../../../../../base/common/map.js';
import { IFileService } from '../../../../../files/common/files.js';
import { ILogService } from '../../../../../log/common/log.js';
import { detectPluginFormat, parsePlugin, readJsonFile, type IParsedPlugin } from '../../../../../agentPlugins/common/pluginParsers.js';

/**
 * A Claude-native plugin enabled via `enabledPlugins` and resolved to its
 * real on-disk root, paired with its parsed components.
 */
export interface IResolvedNativePlugin {
	/** The `enabledPlugins` id, e.g. `telegram@claude-plugins-official`. */
	readonly id: string;
	/** The resolved plugin root directory (a real, openable `file:` URI). */
	readonly root: URI;
	/** The plugin's parsed components (skills / agents / hooks / MCP / rules). */
	readonly parsed: IParsedPlugin;
}

/**
 * The marketplace id used by Claude for in-place `@skills-dir` plugins,
 * which live under `<scope>/.claude/skills/<name>/` rather than the
 * marketplace cache.
 */
const SKILLS_DIR_MARKETPLACE = 'skills-dir';

/**
 * The settings files a Claude session reads `enabledPlugins` from, in
 * **ascending precedence** (`user < project < local`, per the SDK: a
 * `false` in `.claude/settings.local.json` disables a plugin that project
 * or user settings enabled). Iterating in this order and letting later
 * scopes overwrite earlier ones yields the effective enabled set. The
 * `managed` scope is intentionally excluded.
 */
function claudeSettingsFilesByPrecedence(workingDirectory: URI | undefined, userHome: URI): URI[] {
	const files: URI[] = [URI.joinPath(userHome, '.claude', 'settings.json')];
	if (workingDirectory) {
		files.push(URI.joinPath(workingDirectory, '.claude', 'settings.json'));
		files.push(URI.joinPath(workingDirectory, '.claude', 'settings.local.json'));
	}
	return files;
}

/**
 * Computes the effective set of enabled plugin ids across the settings
 * scopes. A plugin's value may be `true`, a `string[]` (version
 * constraint), or an object (extended form) — all of which mean
 * **enabled**; only `false` disables. Later scopes override earlier ones.
 */
async function resolveEnabledPluginIds(workingDirectory: URI | undefined, userHome: URI, fileService: IFileService): Promise<string[]> {
	const effective = new Map<string, boolean>();
	const seenFiles = new ResourceSet();
	for (const uri of claudeSettingsFilesByPrecedence(workingDirectory, userHome)) {
		if (seenFiles.has(uri)) {
			// The same settings file can be reached from two scopes (cwd ===
			// userHome) — read it once. Mirrors the per-scanner dedupe.
			continue;
		}
		seenFiles.add(uri);
		const raw = await readJsonFile(uri, fileService);
		if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
			continue;
		}
		const enabledPlugins = (raw as Record<string, unknown>)['enabledPlugins'];
		if (!enabledPlugins || typeof enabledPlugins !== 'object' || Array.isArray(enabledPlugins)) {
			continue;
		}
		for (const [id, value] of Object.entries(enabledPlugins as Record<string, unknown>)) {
			effective.set(id, value !== false);
		}
	}
	return [...effective].filter(([, enabled]) => enabled).map(([id]) => id);
}

/** Splits an `enabledPlugins` id into its `plugin` and `marketplace` parts. */
function splitPluginId(id: string): { readonly plugin: string; readonly marketplace: string } | undefined {
	const at = id.lastIndexOf('@');
	if (at <= 0 || at === id.length - 1) {
		return undefined;
	}
	const plugin = id.slice(0, at);
	const marketplace = id.slice(at + 1);
	// The segments are joined into filesystem paths below, so reject anything
	// that could escape the plugin roots (path separators or `..`). Plugin and
	// marketplace ids are plain identifiers; a settings file (incl. an
	// untrusted workspace `.claude/settings.local.json`) must not redirect the
	// scan outside `~/.claude/plugins/cache` / `.claude/skills`.
	const isUnsafeSegment = (s: string) => s.includes('/') || s.includes('\\') || s.includes('..');
	if (isUnsafeSegment(plugin) || isUnsafeSegment(marketplace)) {
		return undefined;
	}
	return { plugin, marketplace };
}

/**
 * Whether `dir` contains a readable plugin manifest in any supported
 * format. Reuses the shared {@link detectPluginFormat} so the scanner
 * recognizes Claude (`.claude-plugin/plugin.json`), Open Plugins
 * (`.plugin/plugin.json`), and Copilot (`plugin.json`) layouts — the same
 * formats {@link parsePlugin} can parse — rather than only the Claude one.
 */
async function hasManifest(dir: URI, fileService: IFileService): Promise<boolean> {
	const format = await detectPluginFormat(dir, fileService);
	return fileService.exists(URI.joinPath(dir, format.manifestPath));
}

/**
 * Resolves an in-place `@skills-dir` plugin to its root, preferring the
 * workspace scope over the user scope. Accepts a candidate only when it
 * holds a plugin manifest.
 */
async function resolveSkillsDirRoot(plugin: string, workingDirectory: URI | undefined, userHome: URI, fileService: IFileService): Promise<URI | undefined> {
	const candidates: URI[] = [];
	if (workingDirectory) {
		candidates.push(URI.joinPath(workingDirectory, '.claude', 'skills', plugin));
	}
	candidates.push(URI.joinPath(userHome, '.claude', 'skills', plugin));
	for (const candidate of candidates) {
		if (await hasManifest(candidate, fileService)) {
			return candidate;
		}
	}
	return undefined;
}

/**
 * Resolves a marketplace plugin to its installed cache root. The real
 * layout is `~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/`,
 * so the id maps directly to `<marketplace>/<plugin>`; the version dir is
 * the (single, or newest-`mtime`) child that holds a plugin manifest. The
 * base dir itself is accepted when it directly holds a manifest (no
 * version subdir). Returns `undefined` (caller warns + skips) when no
 * manifest-bearing candidate is found.
 */
async function resolveMarketplaceCacheRoot(plugin: string, marketplace: string, userHome: URI, fileService: IFileService): Promise<URI | undefined> {
	const base = URI.joinPath(userHome, '.claude', 'plugins', 'cache', marketplace, plugin);
	if (await hasManifest(base, fileService)) {
		return base;
	}
	let stat;
	try {
		stat = await fileService.resolve(base);
	} catch {
		return undefined;
	}
	if (!stat.isDirectory || !stat.children) {
		return undefined;
	}
	let best: { readonly uri: URI; readonly mtime: number; readonly name: string } | undefined;
	for (const child of stat.children) {
		if (!child.isDirectory || !(await hasManifest(child.resource, fileService))) {
			continue;
		}
		const mtime = child.mtime ?? 0;
		// Newest install wins; the dir name breaks ties deterministically when
		// mtimes collide or are missing. Compare numerically (`{ numeric: true }`)
		// so version dirs order naturally — `0.0.10` after `0.0.9`, not before.
		if (!best || mtime > best.mtime || (mtime === best.mtime && child.name.localeCompare(best.name, undefined, { numeric: true }) > 0)) {
			best = { uri: child.resource, mtime, name: child.name };
		}
	}
	return best?.uri;
}

/**
 * Scans a Claude session's `enabledPlugins` (user / project / local
 * settings) and resolves each enabled native plugin to its on-disk root,
 * parsing its bundled components with the shared {@link parsePlugin}.
 *
 * This is **discovery only** — native `.claude` plugins are already loaded
 * by the SDK runtime via `settingSources`, so the result is never fed into
 * `Options.plugins`; it only surfaces the plugins (and their components)
 * in the customization list with real, editable URIs. The post-materialize
 * filter (against the live SDK `system/init.plugins` list) hides any plugin
 * the live session did not actually load.
 *
 * Resolution is fail-soft: an id whose root cannot be located, or whose
 * manifest fails to parse, is logged and skipped rather than throwing.
 */
export async function scanClaudeNativePlugins(
	workingDirectory: URI | undefined,
	userHome: URI,
	fileService: IFileService,
	logService: ILogService,
): Promise<readonly IResolvedNativePlugin[]> {
	const ids = await resolveEnabledPluginIds(workingDirectory, userHome, fileService);
	const result: IResolvedNativePlugin[] = [];
	const seenRoots = new ResourceSet();
	for (const id of ids) {
		const parts = splitPluginId(id);
		if (!parts) {
			logService.warn(`[claudeNativePluginScan] skipping malformed plugin id '${id}'`);
			continue;
		}
		const root = parts.marketplace === SKILLS_DIR_MARKETPLACE
			? await resolveSkillsDirRoot(parts.plugin, workingDirectory, userHome, fileService)
			: await resolveMarketplaceCacheRoot(parts.plugin, parts.marketplace, userHome, fileService);
		if (!root) {
			logService.warn(`[claudeNativePluginScan] could not resolve an on-disk root for enabled plugin '${id}'`);
			continue;
		}
		if (seenRoots.has(root)) {
			continue;
		}
		seenRoots.add(root);
		try {
			const parsed = await parsePlugin(root, fileService, workingDirectory, userHome, root);
			result.push({ id, root, parsed });
		} catch (err) {
			logService.warn(`[claudeNativePluginScan] failed to parse plugin '${id}' at '${root.toString()}': ${err instanceof Error ? err.message : String(err)}`);
		}
	}
	result.sort((a, b) => a.id.localeCompare(b.id));
	return result;
}
