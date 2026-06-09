/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import es from 'event-stream';
import vfs from 'vinyl-fs';
import { stylelintFilter } from './filters.ts';
import { getVariableNameValidator } from './lib/stylelint/validateVariableNames.ts';
import { validateCodiconFontSizes, validateFontSizeTokens, validateFontWeightTokens, validateCornerRadiusTokens } from './lib/stylelint/validateDesignTokens.ts';

interface FileWithLines {
	__lines?: string[];
	relative: string;
	contents: Buffer;
}

type Reporter = (message: string, isError: boolean) => void;

/**
 * Stylelint gulpfile task
 */
export default function gulpstylelint(reporter: Reporter): NodeJS.ReadWriteStream {
	const variableValidator = getVariableNameValidator();
	let errorCount = 0;
	const monacoWorkbenchPattern = /\.monaco-workbench/;
	const restrictedPathPattern = /^src[\/\\]vs[\/\\](base|platform|editor)[\/\\]/;
	const designSystemPattern = /^src[\/\\]vs[\/\\]sessions[\/\\]/;
	const layerCheckerDisablePattern = /\/\*\s*stylelint-disable\s+layer-checker\s*\*\//;

	// Per-category tally of design-token suggestions for the summary footer.
	const designTokenCounts: Record<string, number> = { codicon: 0, 'font-size': 0, weight: 0, radius: 0 };
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
		// Scoped to the design-system area (src/vs/sessions). All findings are
		// advisory warnings (never fail the build). Findings for a file are
		// gathered, sorted by source line, then printed under a one-line file
		// header as compact `path(line,col): [category] value -> var` rows so the
		// terminal both groups them visually and linkifies each row.
		const contents = file.contents.toString('utf8');
		if (designSystemPattern.test(file.relative)) {
			const findings: { line: number; category: string; message: string }[] = [];
			for (const v of validateCodiconFontSizes(contents)) { findings.push({ line: v.line, category: 'codicon', message: v.message }); }
			for (const v of validateFontSizeTokens(contents)) { findings.push({ line: v.line, category: 'font-size', message: v.message }); }
			for (const v of validateFontWeightTokens(contents)) { findings.push({ line: v.line, category: 'weight', message: v.message }); }
			for (const v of validateCornerRadiusTokens(contents)) { findings.push({ line: v.line, category: 'radius', message: v.message }); }

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
		const designTokenTotal = designTokenCounts.codicon + designTokenCounts['font-size'] + designTokenCounts.weight + designTokenCounts.radius;
		if (designTokenTotal > 0) {
			reporter('', false);
			reporter(
				'Design-token suggestions: ' + designTokenTotal + ' in ' + designTokenFileCount + ' file' + (designTokenFileCount === 1 ? '' : 's') +
				' (codicon ' + designTokenCounts.codicon +
				', font-size ' + designTokenCounts['font-size'] +
				', weight ' + designTokenCounts.weight +
				', radius ' + designTokenCounts.radius + ')',
				false
			);
		}
		this.emit('end');
	});
}

function stylelint(): NodeJS.ReadWriteStream {
	return vfs
		.src(Array.from(stylelintFilter), { base: '.', follow: true, allowEmpty: true })
		.pipe(gulpstylelint((message, isError) => {
			if (isError) {
				console.error(message);
			} else {
				console.info(message);
			}
		}))
		.pipe(es.through(function () { /* noop, important for the stream to end */ }));
}

if (import.meta.main) {
	stylelint().on('error', (err: Error) => {
		console.error();
		console.error(err);
		process.exit(1);
	});
}
