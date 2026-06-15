/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import es from 'event-stream';
import vfs from 'vinyl-fs';
import { stylelintFilter } from './filters.ts';
import { getVariableNameValidator } from './lib/stylelint/validateVariableNames.ts';
import { validateCodiconFontSizes, validateFontSizeTokens, validateFontWeightTokens, validateCornerRadiusTokens, validateSpacingTokens, validateStrokeTokens } from './lib/stylelint/validateDesignTokens.ts';

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
 * targets a path so the checks follow the requested scope.
 */
export default function gulpstylelint(reporter: Reporter, designTokensEverywhere = false): NodeJS.ReadWriteStream {
	const variableValidator = getVariableNameValidator();
	let errorCount = 0;
	const monacoWorkbenchPattern = /\.monaco-workbench/;
	const restrictedPathPattern = /^src[\/\\]vs[\/\\](base|platform|editor)[\/\\]/;
	const designSystemPattern = /^src[\/\\]vs[\/\\]sessions[\/\\]/;
	const layerCheckerDisablePattern = /\/\*\s*stylelint-disable\s+layer-checker\s*\*\//;

	// Per-category tally of design-token suggestions for the summary footer.
	const designTokenCounts: Record<string, number> = { codicon: 0, 'font-size': 0, weight: 0, radius: 0, spacing: 0, stroke: 0 };
	let designTokenFileCount = 0;

	return es.through(function (this, file: FileWithLines) {
		const lines = file.__lines || file.contents.toString('utf8').split(/\r\n|\r|\n/);
		file.__lines = lines;

		const isRestrictedPath = restrictedPathPattern.test(file.relative);

		// Check if layer-checker is disabled for the entire file
		const isLayerCheckerDisabled = lines.some(line => layerCheckerDisablePattern.test(line));

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

		// Design-token checks that need block (selector + declaration) awareness.
		// By default these are scoped to the design-system area (src/vs/sessions),
		// but when `designTokensEverywhere` is set (an explicit path was targeted)
		// they run on every linted file so the checks follow the requested scope.
		// All findings are advisory warnings (never fail the build). Findings for a
		// file are gathered, sorted by source line, then printed under a one-line
		// file header as compact `path(line,col): [category] value -> var` rows so
		// the terminal both groups them visually and linkifies each row.
		const contents = file.contents.toString('utf8');
		if (designTokensEverywhere || designSystemPattern.test(file.relative)) {
			const findings: { line: number; category: string; message: string }[] = [];
			for (const v of validateCodiconFontSizes(contents)) { findings.push({ line: v.line, category: 'codicon', message: v.message }); }
			for (const v of validateFontSizeTokens(contents)) { findings.push({ line: v.line, category: 'font-size', message: v.message }); }
			for (const v of validateFontWeightTokens(contents)) { findings.push({ line: v.line, category: 'weight', message: v.message }); }
			for (const v of validateCornerRadiusTokens(contents)) { findings.push({ line: v.line, category: 'radius', message: v.message }); }
			for (const v of validateSpacingTokens(contents)) { findings.push({ line: v.line, category: 'spacing', message: v.message }); }
			for (const v of validateStrokeTokens(contents)) { findings.push({ line: v.line, category: 'stroke', message: v.message }); }

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
		const designTokenTotal = designTokenCounts.codicon + designTokenCounts['font-size'] + designTokenCounts.weight + designTokenCounts.radius + designTokenCounts.spacing + designTokenCounts.stroke;
		if (designTokenTotal > 0) {
			reporter('', false);
			reporter(
				'Design-token suggestions: ' + designTokenTotal + ' in ' + designTokenFileCount + ' file' + (designTokenFileCount === 1 ? '' : 's') +
				' (codicon ' + designTokenCounts.codicon +
				', font-size ' + designTokenCounts['font-size'] +
				', weight ' + designTokenCounts.weight +
				', radius ' + designTokenCounts.radius +
				', spacing ' + designTokenCounts.spacing +
				', stroke ' + designTokenCounts.stroke + ')',
				false
			);
		}
		this.emit('end');
	});
}

function stylelint(sources: string[] = Array.from(stylelintFilter), explicit = false): NodeJS.ReadWriteStream {
	let fileCount = 0;
	return vfs
		.src(sources, { base: '.', follow: true, allowEmpty: true })
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
			// When the caller targeted an explicit path that matched no CSS files,
			// say so - otherwise a typo'd path looks like a clean run.
			if (explicit && fileCount === 0) {
				console.info('No CSS files matched the requested path: ' + sources.join(', '));
			}
			this.emit('end');
		}));
}

/**
 * Resolves the source globs to lint from the CLI argument, if any. Accepts a
 * single file, a folder, or a glob (passed via `npm run stylelint -- <path>` or
 * `--path=<path>`). A `.css` file or an explicit glob is used as-is; a folder is
 * expanded to `<folder>/**\/*.css`. With no argument the default
 * `src/**\/*.css` set is linted. Returns the resolved globs plus whether an
 * explicit path was given (used to widen the design-token checks beyond the
 * default `src/vs/sessions` scope to follow the requested path).
 */
function resolveSources(argv: string[]): { sources: string[]; explicit: boolean } {
	const args = argv.slice(2);
	let target: string | undefined;
	for (const arg of args) {
		if (arg.startsWith('--path=')) {
			target = arg.slice('--path='.length);
		} else if (arg === '--path' || arg === '-p') {
			continue; // value is the next positional arg
		} else if (!arg.startsWith('-')) {
			target = arg;
		}
	}
	if (!target) {
		return { sources: Array.from(stylelintFilter), explicit: false };
	}
	// Normalise separators and trim any trailing slash.
	const normalized = target.replace(/\\/g, '/').replace(/\/+$/, '');
	if (/[*?[\]{}]/.test(normalized) || /\.css$/i.test(normalized)) {
		return { sources: [normalized], explicit: true };
	}
	return { sources: [normalized + '/**/*.css'], explicit: true };
}

if (import.meta.main) {
	const { sources, explicit } = resolveSources(process.argv);
	stylelint(sources, explicit).on('error', (err: Error) => {
		console.error();
		console.error(err);
		process.exit(1);
	});
}
