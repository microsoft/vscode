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

;; SPECIAL: __decorate-thing
(call_expression
	((identifier) @call)(#eq? @call "__decorate")
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
    'folders', // JSON-SCHEMA
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFuZ2xlUHJvcHMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJtYW5nbGVQcm9wcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7OztnR0FHZ0c7O0FBRWhHLGlDQUFpQztBQUNqQyxzQ0FBc0M7QUFDdEMsTUFBTSxFQUFFLFVBQVUsRUFBRSxHQUFHLE9BQU8sQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDO0FBQ3pELHlDQUFrQztBQUNsQywrQkFBcUM7QUFDckMsNkJBQTZCO0FBQzdCLHlCQUF5QjtBQUN6QiwrQkFBaUM7QUFHakMsTUFBTSxXQUFXLEdBQUcsSUFBQSxXQUFJLEVBQUMsU0FBUyxFQUFFLHlCQUF5QixDQUFDLENBQUM7QUFDL0QsTUFBTSxlQUFlLEdBQWdDLEVBQUUsQ0FBQztBQUV4RCxNQUFNLE1BQU0sR0FBRyxFQUFFLENBQUMsY0FBYyxDQUFDLFdBQVcsRUFBRSxFQUFFLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxDQUFDO0FBQy9ELElBQUksTUFBTSxDQUFDLEtBQUssRUFBRTtJQUNqQixPQUFPLENBQUMsR0FBRyxDQUFDLGlCQUFLLENBQUMsQ0FBQztJQUNuQixNQUFNLE1BQU0sQ0FBQyxLQUFLLENBQUM7Q0FDbkI7QUFFRCxNQUFNLE9BQU8sR0FBRyxFQUFFLENBQUMsMEJBQTBCLENBQUMsTUFBTSxDQUFDLE1BQU0sRUFBRSxFQUFFLENBQUMsR0FBRyxFQUFFLElBQUEsY0FBTyxFQUFDLFdBQVcsQ0FBQyxFQUFFLGVBQWUsQ0FBQyxDQUFDO0FBQzVHLElBQUksT0FBTyxDQUFDLE1BQU0sQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFO0lBQzlCLE9BQU8sQ0FBQyxHQUFHLENBQUMsaUJBQUssQ0FBQyxDQUFDO0lBQ25CLE1BQU0sTUFBTSxDQUFDLEtBQUssQ0FBQztDQUNuQjtBQUVELE1BQU0sa0JBQWtCLEdBQUc7Ozs7Ozs7O0NBUTFCLENBQUM7QUFFRixNQUFNLDBCQUEwQixHQUFHOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Q0Fr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