/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const typeScriptMetricsSource = [
	'const topLevel = first && second && third || fourth;',
	'',
	'function decide(value: number): number {',
	'\tif (value > 0 && value < 10) {',
	'\t\tfor (let index = 0; index < value; index++) {',
	'\t\t\tif (index % 2 === 0) {',
	'\t\t\t\tcontinue;',
	'\t\t\t}',
	'\t\t}',
	'\t} else if (value === 0 || value === -1) {',
	'\t\treturn 0;',
	'\t} else {',
	'\t\treturn value > 100 ? 100 : value;',
	'\t}',
	'\tconst nested = () => value ? 1 : 0;',
	'\treturn nested();',
	'}',
	'',
	'class Worker {',
	'\tstatic {',
	'\t\twhile (ready) {',
	'\t\t\tbreak;',
	'\t\t}',
	'\t}',
	'',
	'\tconstructor() {',
	'\t\tdo {',
	'\t\t\twork();',
	'\t\t} while (pending);',
	'\t}',
	'',
	'\tget state() {',
	'\t\treturn current;',
	'\t}',
	'',
	'\tset state(value: number) {',
	'\t\ttry {',
	'\t\t\tcurrent = value;',
	'\t\t} catch {',
	'\t\t\tcurrent = undefined;',
	'\t\t}',
	'\t}',
	'',
	'\tmethod(value: number): number {',
	'\t\tswitch (value) {',
	'\t\t\tcase 1:',
	'\t\t\t\tif (enabled) {',
	'\t\t\t\t\treturn 1;',
	'\t\t\t\t}',
	'\t\t\t\tbreak;',
	'\t\t\tcase 2:',
	'\t\t\t\treturn 2;',
	'\t\t\tdefault:',
	'\t\t\t\treturn 0;',
	'\t\t}',
	'\t}',
	'}',
	'',
	'function outer(): void {',
	'\trun(() => {',
	'\t\tif (enabled) {',
	'\t\t\treturn;',
	'\t\t}',
	'\t});',
	'}',
].join('\n');

interface MetricsResultLike {
	readonly entities: readonly {
		readonly kind: string;
		readonly path: readonly string[];
		readonly range: {
			readonly start: { readonly line: number };
			readonly end: { readonly line: number };
		};
		readonly metrics: {
			readonly cognitiveComplexity: number;
			readonly cyclomaticComplexity: number;
		};
	}[];
}

export function summarizeTypeScriptMetrics(result: MetricsResultLike): object[] {
	return result.entities.map(entity => ({
		kind: entity.kind,
		path: entity.path,
		range: { start: entity.range.start.line, end: entity.range.end.line },
		cognitiveComplexity: entity.metrics.cognitiveComplexity,
		cyclomaticComplexity: entity.metrics.cyclomaticComplexity,
	}));
}

export function getExpectedTypeScriptMetrics(): object[] {
	return [
		{ kind: 'sourceFile', path: [], range: { start: 0, end: 64 }, cognitiveComplexity: 2, cyclomaticComplexity: 4 },
		{ kind: 'function', path: ['decide'], range: { start: 2, end: 16 }, cognitiveComplexity: 12, cyclomaticComplexity: 8 },
		{ kind: 'arrow-function', path: ['decide', 'nested'], range: { start: 14, end: 14 }, cognitiveComplexity: 1, cyclomaticComplexity: 2 },
		{ kind: 'class', path: ['Worker'], range: { start: 18, end: 56 }, cognitiveComplexity: 1, cyclomaticComplexity: 2 },
		{ kind: 'constructor', path: ['Worker', 'constructor'], range: { start: 25, end: 29 }, cognitiveComplexity: 1, cyclomaticComplexity: 2 },
		{ kind: 'getter', path: ['Worker', 'state'], range: { start: 31, end: 33 }, cognitiveComplexity: 0, cyclomaticComplexity: 1 },
		{ kind: 'setter', path: ['Worker', 'state'], range: { start: 35, end: 41 }, cognitiveComplexity: 1, cyclomaticComplexity: 2 },
		{ kind: 'method', path: ['Worker', 'method'], range: { start: 43, end: 55 }, cognitiveComplexity: 3, cyclomaticComplexity: 4 },
		{ kind: 'function', path: ['outer'], range: { start: 58, end: 64 }, cognitiveComplexity: 1, cyclomaticComplexity: 3 },
	];
}
