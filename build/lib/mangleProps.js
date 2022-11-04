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
const projectPath = '/Users/jrieken/Code/vscode/src/tsconfig.json';
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
async function extractIdentifierInfo() {
    const cwd = cmdLine.options.outDir || (0, path_1.dirname)(projectPath);
    const files = await (0, util_1.promisify)(glob)('**/*.js', { cwd });
    console.log(`analyzing ${files.length} JS files`);
    // collection all definitions/occurrences
    const occurrencesByName = new Map;
    const definitionNames = new Set();
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
            occurrences: value,
            ignoredUndefined: !definitionNames.has(key),
            ignoredDts: dtsDeclaredPropertyNames.has(key)
        });
    }
    console.log(`collected ${occurrencesByName.size} OCCURRENCES (and ${definitionNames.size} definitions)`);
    return result.sort((a, b) => b.occurrences.length - a.occurrences.length);
}
extractIdentifierInfo().then(async (identifierInfo) => {
    // PRINT all
    function toString(info) {
        return `(${info.ignoredDts || info.ignoredUndefined ? 'skipping' : 'OK'}) '${info.text}': ${info.occurrences.length} (${info.occurrences.length * info.text.length} bytes)`;
    }
    console.log(identifierInfo.slice(0, 50).map(toString).join('\n'));
    // REMOVE ignored items
    identifierInfo = identifierInfo.filter(info => !info.ignoredDts && !info.ignoredUndefined);
    console.log(identifierInfo.slice(0, 50).map(toString).join('\n'));
    // REWRITE
    const replacementMap = new Map();
    const pool = new ShortIdent();
    for (let i = 0; i < 9; i++) {
        const { text } = identifierInfo[i];
        const shortText = pool.next();
        replacementMap.set(text, shortText);
    }
    console.log('REPLACEMENT map', Array.from(replacementMap).map(tuple => `${tuple[0]} -> ${tuple[1]}`));
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
    const text = Array.from(contents.toString('utf8'));
    // sort last first
    // replace from back (no index math)
    occurrences.sort((a, b) => b.end - a.end);
    for (const item of occurrences) {
        let shortText = replacementMap.get(item.text);
        if (shortText) {
            if (item.kind === 'shortHand') {
                shortText = `${shortText}: ${item.text}`;
            }
            text.splice(item.start, item.end - item.start, shortText + `/*${item.text}*/`);
            // text.splice(item.end, 0, `/*${shortText}*/`);
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
    next() {
        const candidate = ShortIdent.convert(this._value);
        this._value++;
        if (ShortIdent._keywords.has(candidate)) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFuZ2xlUHJvcHMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJtYW5nbGVQcm9wcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7OztnR0FHZ0c7O0FBRWhHLGlDQUFpQztBQUNqQyxzQ0FBc0M7QUFDdEMsTUFBTSxFQUFFLFVBQVUsRUFBRSxHQUFHLE9BQU8sQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDO0FBQ3pELHlDQUFrQztBQUNsQywrQkFBcUM7QUFDckMsNkJBQTZCO0FBQzdCLHlCQUF5QjtBQUN6QiwrQkFBaUM7QUFHakMsTUFBTSxXQUFXLEdBQUcsOENBQThDLENBQUM7QUFDbkUsTUFBTSxlQUFlLEdBQWdDLEVBQUUsQ0FBQztBQUV4RCxNQUFNLE1BQU0sR0FBRyxFQUFFLENBQUMsY0FBYyxDQUFDLFdBQVcsRUFBRSxFQUFFLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxDQUFDO0FBQy9ELElBQUksTUFBTSxDQUFDLEtBQUssRUFBRTtJQUNqQixPQUFPLENBQUMsR0FBRyxDQUFDLGlCQUFLLENBQUMsQ0FBQztJQUNuQixNQUFNLE1BQU0sQ0FBQyxLQUFLLENBQUM7Q0FDbkI7QUFFRCxNQUFNLE9BQU8sR0FBRyxFQUFFLENBQUMsMEJBQTBCLENBQUMsTUFBTSxDQUFDLE1BQU0sRUFBRSxFQUFFLENBQUMsR0FBRyxFQUFFLElBQUEsY0FBTyxFQUFDLFdBQVcsQ0FBQyxFQUFFLGVBQWUsQ0FBQyxDQUFDO0FBQzVHLElBQUksT0FBTyxDQUFDLE1BQU0sQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFO0lBQzlCLE9BQU8sQ0FBQyxHQUFHLENBQUMsaUJBQUssQ0FBQyxDQUFDO0lBQ25CLE1BQU0sTUFBTSxDQUFDLEtBQUssQ0FBQztDQUNuQjtBQUVELE1BQU0sa0JBQWtCLEdBQUc7Ozs7Ozs7Q0FPMUIsQ0FBQztBQUVGLE1BQU0sMEJBQTBCLEdBQUc7Ozs7Ozs7Ozs7OztDQVlsQyxDQUFDO0FBR0YsU0FBUywyQkFBMkI7SUFFbkMsTUFBTSxP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