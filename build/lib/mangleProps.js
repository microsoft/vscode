"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
const ts = require("typescript");
const Parser = require("tree-sitter");
const { typescript } = require('tree-sitter-typescript');
const fancy_log_1 = require("fancy-log");
const path_1 = require("path");
const glob = require("glob");
const fs = require("fs");
const util_1 = require("util");
const projectPath = (0, path_1.join)(__dirname, '../../src/tsconfig.json');
const existingOptions = {};
const parsed = ts.readConfigFile(projectPath, ts.sys.readFile);
if (parsed.error) {
    console.log(fancy_log_1.error);
    throw parsed.error;
}
const cmdLine = ts.parseJsonConfigFileContent(parsed.config, ts.sys, (0, path_1.dirname)(projectPath), existingOptions);
if (cmdLine.errors.length > 0) {
    console.log(fancy_log_1.error);
    throw parsed.error;
}
const queryAnyDefinition = `
(function_signature (identifier) @ident)
(method_signature (property_identifier) @ident)
(method_definition (property_identifier) @ident)
(public_field_definition (property_identifier) @ident)
(pair (property_identifier) @ident)
(object_type (property_signature (property_identifier) @ident))
(object_type (method_signature (property_identifier) @ident))
`;
const queryClassPropertiesUsages = `
;; method and field
(class_body (method_definition (property_identifier) @property))
(class_body (public_field_definition (property_identifier) @property))

;; usages
(object (method_definition (property_identifier) @usage))
(subscript_expression (string) @usage)
(member_expression (property_identifier) @usage)
(object (pair (property_identifier) @usage))
(object_pattern (shorthand_property_identifier_pattern) @usage-shortHand)
(object (shorthand_property_identifier) @usage-shortHand)

;; SPECIALS
;; __decorate-thing
(call_expression
	((identifier) @call)(#eq? @call "__decorate")
	(arguments (string (string_fragment) @usage-string))
)

;; stub (TestInstantiationService)
(call_expression
	(member_expression (property_identifier) @call)(#eq? @call "stub")
    (arguments (string (string_fragment) @usage-string))
)
`;
function findAllDtsDefinedProperties() {
    const program = ts.createProgram({ rootNames: cmdLine.fileNames, options: cmdLine.options });
    const definitionFiles = [];
    for (const item of program.getSourceFiles()) {
        if (item.fileName.endsWith('.d.ts')) {
            definitionFiles.push(item);
        }
    }
    console.log(`scanning ${definitionFiles.length} DEFINITION files`);
    function extractPropertyDefinitions(source, bucket) {
        const parser = new Parser();
        parser.setLanguage(typescript);
        const query = new Parser.Query(typescript, queryAnyDefinition);
        const tree = parser.parse(source.text);
        const captures = query.captures(tree.rootNode);
        for (const capture of captures) {
            bucket.add(capture.node.text);
        }
    }
    const result = new Set();
    definitionFiles.forEach(file => extractPropertyDefinitions(file, result));
    console.log(`collected ${result.size} IGNORE identifiers`);
    return result;
}
//
// (1) extract all DECLARED properties
//
const dtsDeclaredPropertyNames = findAllDtsDefinedProperties();
async function extractDefinitionsAndUsages(fileName, occurrences, definitions) {
    const source = await readFileWithBak(fileName);
    const parser = new Parser();
    parser.setLanguage(typescript);
    const query = new Parser.Query(typescript, queryClassPropertiesUsages);
    const tree = parser.parse(source.toString('utf8'));
    const captures = query.captures(tree.rootNode);
    for (const capture of captures) {
        const text = capture.node.text;
        const item = {
            text,
            fileName,
            start: capture.node.startIndex,
            end: capture.node.endIndex
        };
        if (capture.name === 'property') {
            definitions.add(text);
        }
        else {
            const idx = capture.name.indexOf('-');
            if (idx >= 0) {
                item.kind = capture.name.substring(idx + 1);
            }
        }
        const arr = occurrences.get(text);
        if (arr) {
            arr.push(item);
        }
        else {
            occurrences.set(text, [item]);
        }
    }
}
const definitionNames = new Set();
async function extractIdentifierInfo() {
    const cwd = cmdLine.options.outDir || (0, path_1.dirname)(projectPath);
    const files = await (0, util_1.promisify)(glob)('**/*.js', { cwd });
    console.log(`analyzing ${files.length} JS files`);
    // collection all definitions/occurrences
    const occurrencesByName = new Map;
    for (const file of files) {
        const fileName = (0, path_1.join)(cwd, file);
        if (fileName.includes('vs/platform/files/test/node/fixtures')) {
            // SKIP test fixtures because we count the number of children
            continue;
        }
        await extractDefinitionsAndUsages(fileName, occurrencesByName, definitionNames);
    }
    // cleanup
    // mark occurrence that we CANNOT process (undefined or dts-defined)
    const result = [];
    for (const [key, value] of occurrencesByName) {
        result.push({
            text: key,
            weight: key.length * value.length,
            occurrences: value,
            ignoredUndefined: !definitionNames.has(key),
            ignoredDts: dtsDeclaredPropertyNames.has(key)
        });
    }
    console.log(`collected ${occurrencesByName.size} OCCURRENCES (and ${definitionNames.size} definitions)`);
    return result.sort((a, b) => b.weight - a.weight);
}
const banned = new Set([
    // 'remoteAuthority',
    // 'viewModel',
    'folders',
    'local',
]);
extractIdentifierInfo().then(async (identifierInfo) => {
    // PRINT all
    function toString(info) {
        return `(${info.ignoredDts || info.ignoredUndefined ? 'skipping' : 'OK'}) '${info.text}': ${info.occurrences.length} (${info.weight} bytes)`;
    }
    // REWRITE
    const replacementMap = new Map();
    const pool = new ShortIdent([dtsDeclaredPropertyNames, definitionNames]);
    let savings = 0;
    for (const info of identifierInfo) {
        console.log('\t' + toString(info));
        if (info.ignoredDts || info.ignoredUndefined) {
            continue;
        }
        if (banned.has(info.text)) {
            console.log('BANNED - cannot handle yet');
            continue;
        }
        const shortText = pool.next();
        replacementMap.set(info.text, shortText);
        savings += info.weight;
        if (replacementMap.size >= 50) {
            break;
        }
    }
    console.log('REPLACEMENT map', Array.from(replacementMap).map(tuple => `${tuple[0]} -> ${tuple[1]}`));
    console.log(`will SAVE ${savings} bytes`);
    const occurrencesByFileName = new Map();
    for (const info of identifierInfo) {
        for (const item of info.occurrences) {
            const arr = occurrencesByFileName.get(item.fileName);
            if (arr) {
                arr.push(item);
            }
            else {
                occurrencesByFileName.set(item.fileName, [item]);
            }
        }
    }
    for (const [fileName, occurrences] of occurrencesByFileName) {
        await performReplacements(fileName, replacementMap, occurrences);
    }
});
async function performReplacements(fileName, replacementMap, occurrences) {
    const contents = await readFileWithBak(fileName);
    const text = contents.toString('utf8').split('');
    // sort last first
    // replace from back (no index math)
    occurrences.sort((a, b) => b.end - a.end);
    for (const item of occurrences) {
        let shortText = replacementMap.get(item.text);
        if (shortText) {
            if (item.kind === 'shortHand') {
                shortText = `${shortText}: ${item.text}`;
            }
            if (item.kind !== 'string') {
                shortText += `/*${item.text}*/`;
            }
            text.splice(item.start, item.end - item.start, shortText);
        }
    }
    const newContents = text.join('');
    fs.promises.writeFile(fileName + '.bak', contents);
    // fs.promises.writeFile(fileName + '.mangle', newContents);
    fs.promises.writeFile(fileName, newContents);
}
async function readFileWithBak(fileName) {
    let readFileName = fileName;
    try {
        await fs.promises.access(fileName + '.bak');
        readFileName += '.bak';
    }
    catch {
        //
    }
    const source = await fs.promises.readFile(readFileName);
    return source;
}
class ShortIdent {
    static _keywords = new Set(['await', 'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger',
        'default', 'delete', 'do', 'else', 'export', 'extends', 'false', 'finally', 'for', 'function', 'if',
        'import', 'in', 'instanceof', 'let', 'new', 'null', 'return', 'static', 'super', 'switch', 'this', 'throw',
        'true', 'try', 'typeof', 'var', 'void', 'while', 'with', 'yield']);
    static alphabet = [];
    static {
        for (let i = 97; i < 122; i++) {
            this.alphabet.push(String.fromCharCode(i));
        }
        for (let i = 65; i < 90; i++) {
            this.alphabet.push(String.fromCharCode(i));
        }
    }
    _value = 0;
    _ignores;
    constructor(ignores) {
        this._ignores = new Set(...[...ignores, ShortIdent._keywords].flat());
    }
    next() {
        const candidate = ShortIdent.convert(this._value);
        this._value++;
        if (this._ignores.has(candidate)) {
            // try again
            return this.next();
        }
        return candidate;
    }
    static convert(n) {
        const base = this.alphabet.length;
        let result = '';
        do {
            const rest = n % 50;
            result += this.alphabet[rest];
            n = (n / base) | 0;
        } while (n > 0);
        return result;
    }
}
// TODO
// P0: check type of occurrence for being ANY -> ignore iff so (hard casts like foo = <Foo>JSON.parse(raw))
// P0: declare JSON schema types
// P1: constructor/type names (source_map)
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFuZ2xlUHJvcHMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJtYW5nbGVQcm9wcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7OztnR0FHZ0c7O0FBRWhHLGlDQUFpQztBQUNqQyxzQ0FBc0M7QUFDdEMsTUFBTSxFQUFFLFVBQVUsRUFBRSxHQUFHLE9BQU8sQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDO0FBQ3pELHlDQUFrQztBQUNsQywrQkFBcUM7QUFDckMsNkJBQTZCO0FBQzdCLHlCQUF5QjtBQUN6QiwrQkFBaUM7QUFHakMsTUFBTSxXQUFXLEdBQUcsSUFBQSxXQUFJLEVBQUMsU0FBUyxFQUFFLHlCQUF5QixDQUFDLENBQUM7QUFDL0QsTUFBTSxlQUFlLEdBQWdDLEVBQUUsQ0FBQztBQUV4RCxNQUFNLE1BQU0sR0FBRyxFQUFFLENBQUMsY0FBYyxDQUFDLFdBQVcsRUFBRSxFQUFFLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxDQUFDO0FBQy9ELElBQUksTUFBTSxDQUFDLEtBQUssRUFBRTtJQUNqQixPQUFPLENBQUMsR0FBRyxDQUFDLGlCQUFLLENBQUMsQ0FBQztJQUNuQixNQUFNLE1BQU0sQ0FBQyxLQUFLLENBQUM7Q0FDbkI7QUFFRCxNQUFNLE9BQU8sR0FBRyxFQUFFLENBQUMsMEJBQTBCLENBQUMsTUFBTSxDQUFDLE1BQU0sRUFBRSxFQUFFLENBQUMsR0FBRyxFQUFFLElBQUEsY0FBTyxFQUFDLFdBQVcsQ0FBQyxFQUFFLGVBQWUsQ0FBQyxDQUFDO0FBQzVHLElBQUksT0FBTyxDQUFDLE1BQU0sQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFO0lBQzlCLE9BQU8sQ0FBQyxHQUFHLENBQUMsaUJBQUssQ0FBQyxDQUFDO0lBQ25CLE1BQU0sTUFBTSxDQUFDLEtBQUssQ0FBQztDQUNuQjtBQUVELE1BQU0sa0JBQWtCLEdBQUc7Ozs7Ozs7O0NBUTFCLENBQUM7QUFFRixNQUFNLDBCQUEwQixHQUFHOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7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