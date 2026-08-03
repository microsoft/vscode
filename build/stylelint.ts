/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import es from 'event-stream';
import glob from 'glob';
import vfs from 'vinyl-fs';
import { stylelintFilter } from './filters.ts';
import { findRootAnchoredHas } from './lib/stylelint/validateHasSelectors.ts';
import { getVariableNameValidator } from './lib/stylelint/validateVariableNames.ts';
import { validateCodiconFontSizes, validateFontSizeTokens, validateFontWeightTokens, validateCornerRadiusTokens, validateSpacingTokens, validateStrokeTokens, validateDeprecatedTokens } from './lib/stylelint/validateDesignTokens.ts';

interface FileWithLines {
	__lines?: string[];
	relative: string;
	contents: Buffer;
}

type Reporter = (message: string, isError: boolean) => void;

/**
 * Stylelint gulpfile task. When `designTokensEverywhere` is `true` the
 * design-token suggestions run on every linted file rather than only the
 * design-system area (`src/vs/sessions`); used when the caller explicitly
 * targets a path so the checks follow the requested scope. Set
 * `reportDesignTokenSuggestions` to `false` when only enforced checks should run.
 */
export default function gulpstylelint(reporter: Reporter, designTokensEverywhere = false, reportDesignTokenSuggestions = true): NodeJS.ReadWriteStream {
	const variableValidator = getVariableNameValidator();
	let errorCount = 0;
	const monacoWorkbenchPattern = /\.monaco-workbench/;
	const restrictedPathPattern = /^src[\/\\]vs[\/\\](base|platform|editor)[\/\\]/;
	const designSystemPattern = /^src[\/\\]vs[\/\\]sessions[\/\\]/;
	const layerCheckerDisablePattern = /\/\*\s*stylelint-disable\s+layer-checker\s*\*\//;
	const hasAnchorCheckerDisablePattern = /^\s*\/\*\s*stylelint-disable\s+has-anchor-checker\s*\*\/\s*$/;

	// Per-category tally of design-token suggestions for the summary footer.
	const designTokenCounts: Record<string, number> = { codicon: 0, 'font-size': 0, weight: 0, radius: 0, spacing: 0, stroke: 0, deprecated: 0 };
	let designTokenFileCount = 0;

	return es.through(function (this, file: FileWithLines) {
		const contents = file.contents.toString('utf8');
		const lines = file.__lines || contents.split(/\r\n|\r|\n/);
		file.__lines = lines;

		const isRestrictedPath = restrictedPathPattern.test(file.relative);

		// Check if layer-checker is disabled for the entire file
		const isLayerCheckerDisabled = lines.some(line => layerCheckerDisablePattern.test(line));

		// Check if has-anchor-checker is disabled for the entire file
		const isHasAnchorCheckerDisabled = lines.some(line => hasAnchorCheckerDisablePattern.test(line));

		lines.forEach((line, i) => {
			variableValidator(line, (unknownVariable: string) => {
				reporter(file.relative + '(' + (i + 1) + ',1): Unknown variable: ' + unknownVariable, true);
				errorCount++;
			});

			if (isRestrictedPath && !isLayerCheckerDisabled && monacoWorkbenchPattern.test(line)) {
				reporter(file.relative + '(' + (i + 1) + ',1): The class .monaco-workbench cannot be used in files under src/vs/{base,platform,editor} because only src/vs/workbench applies it', true);
				errorCount++;
			}
		});

		if (!isHasAnchorCheckerDisabled) {
			const rootAnchoredHasOffset = findRootAnchoredHas(contents);
			if (rootAnchoredHasOffset !== undefined) {
				reporter(file.relative + '(' + lineNumberAtOffset(contents, rootAnchoredHasOffset) + ',1): Root-anchored :has() (on body/html/:root/.monaco-workbench) makes every DOM mutation pay workbench-wide style invalidation (see microsoft/vscode#324985). Toggle a class from code instead', true);
				errorCount++;
			}
		}

		// Design-token checks that need block (selector + declaration) awareness.
		// By default these are scoped to the design-system area (src/vs/sessions),
		// but when `designTokensEverywhere` is set (an explicit path was targeted)
		// they run on every linted file so the checks follow the requested scope.
		// All findings are advisory warnings (never fail the build). Findings for a
		// file are gathered, sorted by source line, then printed under a one-line
		// file header as compact `path(line,col): [category] value -> var` rows so
		// the terminal both groups them visually and linkifies each row.
		if (reportDesignTokenSuggestions && (designTokensEverywhere || designSystemPattern.test(file.relative))) {
			const findings: { line: number; category: string; message: string }[] = [];
			for (const v of validateCodiconFontSizes(contents)) { findings.push({ line: v.line, category: 'codicon', message: v.message }); }
			for (const v of validateFontSizeTokens(contents)) { findings.push({ line: v.line, category: 'font-size', message: v.message }); }
			for (const v of validateFontWeightTokens(contents)) { findings.push({ line: v.line, category: 'weight', message: v.message }); }
			for (const v of validateCornerRadiusTokens(contents)) { findings.push({ line: v.line, category: 'radius', message: v.message }); }
			for (const v of validateSpacingTokens(contents)) { findings.push({ line: v.line, category: 'spacing', message: v.message }); }
			for (const v of validateStrokeTokens(contents)) { findings.push({ line: v.line, category: 'stroke', message: v.message }); }
			for (const v of validateDeprecatedTokens(contents)) { findings.push({ line: v.line, category: 'deprecated', message: v.message }); }

			if (findings.length > 0) {
				findings.sort((a, b) => a.line - b.line);
				reporter('', false); // blank line separates file groups
				reporter(file.relative + ' (' + findings.length + ' design-token suggestion' + (findings.length === 1 ? '' : 's') + ')', false);
				for (const f of findings) {
					reporter('  ' + file.relative + '(' + f.line + ',1): [' + f.category + '] ' + f.message, false);
					designTokenCounts[f.category]++;
				}
				designTokenFileCount++;
			}
		}

		this.emit('data', file);
	}, function () {
		if (errorCount > 0) {
			reporter('All valid variable names are in `build/lib/stylelint/vscode-known-variables.json`\nTo update that file, run `./scripts/test-documentation.sh|bat.`', false);
		}
		const designTokenTotal = designTokenCounts.codicon + designTokenCounts['font-size'] + designTokenCounts.weight + designTokenCounts.radius + designTokenCounts.spacing + designTokenCounts.stroke + designTokenCounts.deprecated;
		if (designTokenTotal > 0) {
			reporter('', false);
			reporter(
				'Design-token suggestions: ' + designTokenTotal + ' in ' + designTokenFileCount + ' file' + (designTokenFileCount === 1 ? '' : 's') +
				' (codicon ' + designTokenCounts.codicon +
				', font-size ' + designTokenCounts['font-size'] +
				', weight ' + designTokenCounts.weight +
				', radius ' + designTokenCounts.radius +
				', spacing ' + designTokenCounts.spacing +
				', stroke ' + designTokenCounts.stroke +
				', deprecated ' + designTokenCounts.deprecated + ')',
				false
			);
		}
		this.emit('end');
	});
}

function lineNumberAtOffset(contents: string, offset: number): number {
	let lineNumber = 1;
	for (let index = 0; index < offset; index++) {
		const character = contents.charCodeAt(index);
		if (character === 10 || character === 13 && contents.charCodeAt(index + 1) !== 10) {
			lineNumber++;
		}
	}
	return lineNumber;
}

function stylelint(sources: string[] = Array.from(stylelintFilter), explicit = false): NodeJS.ReadWriteStream {
	const started = Date.now();
	const resolvedSources = explicit ? resolveStylelintMatches(sources) : sources;
	let fileCount = 0;
	console.info(explicit
		? `Stylelint: checking ${resolvedSources.length} CSS file${resolvedSources.length === 1 ? '' : 's'} matched by ${sources.length} requested path${sources.length === 1 ? '' : 's'}.`
		: 'Stylelint: checking all CSS files under src.');
	return vfs
		.src(resolvedSources, { base: '.', follow: true, allowEmpty: !explicit })
		.pipe(gulpstylelint((message, isError) => {
			if (isError) {
				console.error(message);
			} else {
				console.info(message);
			}
		}, explicit))
		.pipe(es.through(function (this, file: FileWithLines) {
			fileCount++;
			this.emit('data', file);
		}, function () {
			console.info(`Stylelint: checked ${fileCount} CSS file${fileCount === 1 ? '' : 's'} in ${Date.now() - started}ms.`);
			this.emit('end');
		}));
}

/**
 * Resolves the source globs to lint from the CLI arguments, if any. Accepts
 * files, folders, or globs (passed via `npm run stylelint -- <path>...` or
 * `--path=<path>`). A `.css` file or an explicit glob is used as-is; a folder is
 * expanded to `<folder>/**\/*.css`. With no arguments the default
 * `src/**\/*.css` set is linted. Returns the resolved globs plus whether an
 * explicit path was given (used to widen the design-token checks beyond the
 * default `src/vs/sessions` scope to follow the requested path).
 */
export function resolveStylelintSources(argv: readonly string[]): { sources: string[]; explicit: boolean } {
	const targets: string[] = [];
	for (let index = 2; index < argv.length; index++) {
		const arg = argv[index];
		if (arg.startsWith('--path=')) {
			targets.push(arg.slice('--path='.length));
		} else if (arg === '--path' || arg === '-p') {
			const target = argv[++index];
			if (!target || target.startsWith('-')) {
				throw new Error(`Missing value for ${arg}.`);
			}
			targets.push(target);
		} else if (!arg.startsWith('-')) {
			targets.push(arg);
		}
	}
	if (targets.length === 0) {
		return { sources: Array.from(stylelintFilter), explicit: false };
	}

	return {
		sources: targets.map(target => {
			const normalized = target.replace(/\\/g, '/').replace(/\/+$/, '');
			if (!normalized) {
				throw new Error('Stylelint paths cannot be empty.');
			}
			if (/[*?[\]{}]/.test(normalized) || /\.css$/i.test(normalized)) {
				return normalized;
			}
			return normalized + '/**/*.css';
		}),
		explicit: true,
	};
}

export function resolveStylelintMatches(sources: readonly string[]): string[] {
	const matches = new Set<string>();
	for (const source of sources) {
		const sourceMatches = glob.sync(source, { follow: true, nodir: true });
		if (sourceMatches.length === 0) {
			throw new Error(`No CSS files matched the requested path: ${source}`);
		}
		for (const match of sourceMatches) {
			matches.add(match);
		}
	}
	return Array.from(matches);
}

if (import.meta.main) {
	try {
		const { sources, explicit } = resolveStylelintSources(process.argv);
		stylelint(sources, explicit).on('error', (err: Error) => {
			console.error();
			console.error(err);
			process.exit(1);
		});
	} catch (err) {
		console.error();
		console.error(err);
		process.exit(1);
	}
}
