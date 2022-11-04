/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as ts from 'typescript';
import * as Parser from 'tree-sitter';
const { typescript } = require('tree-sitter-typescript');
import { error } from 'fancy-log';
import { dirname, join } from 'path';
import * as glob from 'glob';
import * as fs from 'fs';
import { promisify } from 'util';


const projectPath = '/Users/jrieken/Code/vscode/src/tsconfig.json';
const existingOptions: Partial<ts.CompilerOptions> = {};

const parsed = ts.readConfigFile(projectPath, ts.sys.readFile);
if (parsed.error) {
	console.log(error);
	throw parsed.error;
}

const cmdLine = ts.parseJsonConfigFileContent(parsed.config, ts.sys, dirname(projectPath), existingOptions);
if (cmdLine.errors.length > 0) {
	console.log(error);
	throw parsed.error;
}

const queryAnyDefinition = `
(method_definition (property_identifier) @ident)
(public_field_definition (property_identifier) @ident)
(pair (property_identifier) @ident)
(object_type (property_signature (property_identifier) @ident))
(object_type (method_signature (property_identifier) @ident))`;

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
	const definitionFiles: ts.SourceFile[] = [];
	for (const item of program.getSourceFiles()) {
		if (item.fileName.endsWith('.d.ts')) {
			definitionFiles.push(item);
		}
	}
	console.log(`scanning ${definitionFiles.length} DEFINITION files`);

	function extractPropertyDefinitions(source: ts.SourceFile, bucket: Set<string>) {

		const parser = new Parser();
		parser.setLanguage(typescript);

		const query = new Parser.Query(typescript, queryAnyDefinition);
		const tree = parser.parse(source.text);
		const captures = query.captures(tree.rootNode);
		for (const capture of captures) {
			bucket.add(capture.node.text);
		}
	}

	const result = new Set<string>();
	definitionFiles.forEach(file => extractPropertyDefinitions(file, result));
	console.log(`collected ${result.size} IGNORE identifiers`);
	return result;
}


//
// (1) extract all DECLARED properties
//
const dtsDeclaredPropertyNames = findAllDtsDefinedProperties();


//
// (2) extract all DEFINED properties
//

type IdenitiferInfo = { text: string; ignoredDts?: boolean; ignoredUndefined?: boolean; occurrences: Occurrence[] };
type Occurrence = { fileName: string; text: string; start: number; end: number; kind?: string };

async function extractDefinitionsAndUsages(fileName: string, occurrences: Map<string, Occurrence[]>, definitions: Set<string>) {

	const source = await readFileWithBak(fileName);

	const parser = new Parser();
	parser.setLanguage(typescript);

	const query = new Parser.Query(typescript, queryClassPropertiesUsages);
	const tree = parser.parse(source.toString('utf8'));

	const captures = query.captures(tree.rootNode);
	for (const capture of captures) {

		const text = capture.node.text;

		const item: Occurrence = {
			text,
			fileName,
			start: capture.node.startIndex,
			end: capture.node.endIndex
		};

		if (capture.name === 'property') {
			definitions.add(text);
		} else {
			const idx = capture.name.indexOf('-');
			if (idx >= 0) {
				item.kind = capture.name.substring(idx + 1);
			}
		}

		const arr = occurrences.get(text);
		if (arr) {
			arr.push(item);
		} else {
			occurrences.set(text, [item]);
		}
	}
}

async function extractIdentifierInfo() {

	const cwd = cmdLine.options.outDir || dirname(projectPath);
	const files = await promisify(glob)('**/*.js', { cwd });
	console.log(`analyzing ${files.length} JS files`);

	// collection all definitions/occurrences
	const occurrencesByName = new Map<string, Occurrence[]>;
	const definitionNames = new Set<string>();
	for (const file of files) {
		const fileName = join(cwd, file);
		await extractDefinitionsAndUsages(fileName, occurrencesByName, definitionNames);
	}

	// cleanup
	// mark occurrence that we CANNOT process (undefined or dts-defined)
	const result: IdenitiferInfo[] = [];
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


extractIdentifierInfo().then(async identifierInfo => {


	// PRINT all
	function toString(info: IdenitiferInfo) {
		return `(${info.ignoredDts || info.ignoredUndefined ? 'skipping' : 'OK'}) '${info.text}': ${info.occurrences.length} (${info.occurrences.length * info.text.length} bytes)`;
	}
	console.log(identifierInfo.slice(0, 50).map(toString).join('\n'));

	// REMOVE ignored items
	identifierInfo = identifierInfo.filter(info => !info.ignoredDts && !info.ignoredUndefined);
	console.log(identifierInfo.slice(0, 50).map(toString).join('\n'));

	// REWRITE
	const replacementMap = new Map<string, string>();
	const pool = new ShortIdent();
	for (let i = 0; i < 3; i++) {
		const { text } = identifierInfo[i];
		const shortText = pool.next();
		replacementMap.set(text, shortText);
	}

	console.log('REPLACEMENT map', Array.from(replacementMap).map(tuple => `${tuple[0]} -> ${tuple[1]}`));

	const occurrencesByFileName = new Map<string, Occurrence[]>();
	for (const info of identifierInfo) {
		for (const item of info.occurrences) {
			const arr = occurrencesByFileName.get(item.fileName);
			if (arr) {
				arr.push(item);
			} else {
				occurrencesByFileName.set(item.fileName, [item]);
			}
		}
	}

	for (const [fileName, occurrences] of occurrencesByFileName) {
		await performReplacements(fileName, replacementMap, occurrences);
	}
});


async function performReplacements(fileName: string, replacementMap: Map<string, string>, occurrences: Occurrence[]) {
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

async function readFileWithBak(fileName: string) {
	let readFileName = fileName;
	try {
		await fs.promises.access(fileName + '.bak');
		readFileName += '.bak';
	} catch {
		//
	}
	const source = await fs.promises.readFile(readFileName);
	return source;
}


class ShortIdent {

	private static _keywords = new Set(['await', 'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger',
		'default', 'delete', 'do', 'else', 'export', 'extends', 'false', 'finally', 'for', 'function', 'if',
		'import', 'in', 'instanceof', 'let', 'new', 'null', 'return', 'static', 'super', 'switch', 'this', 'throw',
		'true', 'try', 'typeof', 'var', 'void', 'while', 'with', 'yield']);

	static alphabet: string[] = [];

	static {
		for (let i = 97; i < 122; i++) {
			this.alphabet.push(String.fromCharCode(i));
		}
		for (let i = 65; i < 90; i++) {
			this.alphabet.push(String.fromCharCode(i));
		}
	}


	private _value = 0;

	next(): string {
		const candidate = ShortIdent.convert(this._value);
		this._value++;
		if (ShortIdent._keywords.has(candidate)) {
			// try again
			return this.next();
		}
		return candidate;
	}

	private static convert(n: number): string {
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
