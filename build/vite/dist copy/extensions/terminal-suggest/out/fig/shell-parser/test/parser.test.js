"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const parser_1 = require("../parser");
const node_assert_1 = require("node:assert");
function parseCommand(command) {
    return JSON.stringify((0, parser_1.parse)(command), null, '  ');
}
/**
 *
 * @param filePath The path to the file to parse
 * @param nameComment The first character of each title line
 */
function getData(filePath, nameComment) {
    if (!node_fs_1.default.existsSync(filePath)) {
        node_fs_1.default.writeFileSync(filePath, '');
        return [];
    }
    return node_fs_1.default
        .readFileSync(filePath, { encoding: 'utf8' })
        .replaceAll('\r\n', '\n')
        .split('\n\n')
        .map((testCase) => {
        const firstNewline = testCase.indexOf('\n');
        const title = testCase.slice(0, firstNewline);
        const block = testCase.slice(firstNewline);
        return [title.slice(nameComment.length).trim(), block.trim()];
    });
}
// function outputNewFile(
// 	filePath: string,
// 	nameComment: string,
// 	data: [name: string, value: string][],
// ) {
// 	fs.writeFileSync(
// 		filePath,
// 		data.reduce(
// 			(previous, current, index) =>
// 				`${previous}${index > 0 ? '\n\n' : ''}${nameComment} ${current[0]}\n${current[1]
// 				}`,
// 			'',
// 		),
// 	);
// }
// function notIncludedIn<K>(setA: Set<K>, setB: Set<K>): K[] {
// 	const notIncluded: K[] = [];
// 	for (const v of setA) {
// 		if (!setB.has(v)) notIncluded.push(v);
// 	}
// 	return notIncluded;
// }
// function mapKeysDiff<K, V>(mapA: Map<K, V>, mapB: Map<K, V>) {
// 	const keysA = new Set(mapA.keys());
// 	const keysB = new Set(mapB.keys());
// 	return [
// 		notIncludedIn(keysA, keysB), // keys of A not included in B
// 		notIncludedIn(keysB, keysA), // keys of B not included in A
// 	];
// }
suite('fig/shell-parser/ fixtures', () => {
    const fixturesPath = node_path_1.default.join(__dirname, '../../../../fixtures/shell-parser');
    const fixtures = node_fs_1.default.readdirSync(fixturesPath);
    for (const fixture of fixtures) {
        // console.log('fixture', fixture);
        suite(fixture, () => {
            const inputFile = node_path_1.default.join(fixturesPath, fixture, 'input.sh');
            const outputFile = node_path_1.default.join(fixturesPath, fixture, 'output.txt');
            const inputData = new Map(getData(inputFile, '###'));
            const outputData = new Map(getData(outputFile, '//'));
            // clean diffs and regenerate files if required.
            // if (!process.env.NO_FIXTURES_EDIT) {
            // 	const [newInputs, extraOutputs] = mapKeysDiff(inputData, outputData);
            // 	extraOutputs.forEach((v) => outputData.delete(v));
            // 	newInputs.forEach((v) =>
            // 		outputData.set(v, parseCommand(inputData.get(v) ?? '')),
            // 	);
            // 	if (extraOutputs.length || newInputs.length) {
            // 		outputNewFile(outputFile, '//', [...outputData.entries()]);
            // 	}
            // }
            for (const [caseName, input] of inputData.entries()) {
                if (caseName) {
                    test(caseName, () => {
                        const output = outputData.get(caseName);
                        (0, node_assert_1.strictEqual)(parseCommand(input ?? ''), output);
                    });
                }
            }
        });
    }
});
//# sourceMappingURL=parser.test.js.map