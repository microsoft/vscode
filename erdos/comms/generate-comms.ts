/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import path from 'path';

const commsDir = `${__dirname}`;

let comms = [...new Set(readdirSync(commsDir)
	.filter(file => file.endsWith('.json'))
	.map(file => resolveComm(file)))];

const args = process.argv.slice(2).map(arg => resolveComm(arg));
if (args.length) {
	comms = comms.filter(comm => args.includes(comm));
}

if (comms.length === 0) {
	console.log(`
	  No comms to process! Possible reasons include:
	    * No files found in '${commsDir}'
	    * No matches for comm(s) specified via command line args
	`);
}

const commsFiles = comms.map(comm => comm + '.json');

const tsOutputDir = `${__dirname}/../../src/vs/workbench/services/languageRuntime/common`;

const rustOutputDir = `${__dirname}/../../../ark/crates/amalthea/src/comm`;

const pythonOutputDir = `${__dirname}/../../extensions/erdos-python/python_files/erdos/erdos`;



const year = new Date().getFullYear();

interface CommMetadata {
	name: string;
	initiator: 'frontend' | 'backend';
	initial_data: {
		schema: any;
	};
}

interface MethodParam {
	name: string;
	description: string;
	required?: boolean;
	schema: {
		type: string;
		enum?: string[];
		items?: any;
	};
}

const TypescriptTypeMap: Record<string, string> = {
	boolean: 'boolean',
	integer: 'number',
	number: 'number',
	string: 'string',
	null: 'null',
	'array-begin': 'Array<',
	'array-end': '>',
	object: 'object',
};

const RustTypeMap: Record<string, string> = {
	'boolean': 'bool',
	'integer': 'i64',
	'number': 'f64',
	'string': 'String',
	'null': 'null',
	'array-begin': 'Vec<',
	'array-end': '>',
	'object': 'HashMap',
};

const PythonTypeMap: Record<string, string> = {
	'boolean': 'StrictBool',
	'integer': 'StrictInt',
	'number': 'Union[StrictInt, StrictFloat]',
	'string': 'StrictStr',
	'null': 'null',
	'array-begin': 'List[',
	'array-end': ']',
	'object': 'Dict',
};

function isOptional(contentDescriptor: any) {
	return contentDescriptor.required === false;
}

function resolveComm(s: string) {
	return s
		.replace(/\.json$/, '')
		.replace(/-(back|front)end-openrpc$/, '');
}

function snakeCaseToCamelCase(name: string) {
	name = name.replace(/=/g, 'Eq');
	name = name.replace(/!/g, 'Not');
	name = name.replace(/</g, 'Lt');
	name = name.replace(/>/g, 'Gt');
	name = name.replace(/[/]/g, '_');
	return name.replace(/_([a-z])/g, (m) => m[1].toUpperCase());
}

function snakeCaseToSentenceCase(name: string) {
	return snakeCaseToCamelCase(name).replace(/^[a-z]/, (m) => m[0].toUpperCase());
}

function parseRefFromContract(ref: string, contract: any): string | undefined {
	let target: any = contract;

	const extPointer = externalRefComponents(ref)?.jsonPointer;
	if (extPointer) {
		const parts = ref.split('/');
		return snakeCaseToSentenceCase(parts[parts.length - 1]);
	}

	const parts = ref.split('/');
	for (let i = 0; i < parts.length; i++) {
		if (parts[i] === '#') {
			continue;
		}
		if (Object.keys(target).includes(parts[i])) {
			target = target[parts[i]];
		} else {
			return undefined;
		}
	}

	return snakeCaseToSentenceCase(parts[parts.length - 1]);
}

function externalRefComponents(ref: string): { filePath: string; jsonPointer: string } | undefined {
	const match = ref.match(/^([^#]+)#(.+)$/);
	if (!match) {
		return undefined;
	}

	return {
		filePath: match[1],
		jsonPointer: match[2],
	};
}

function parseRef(ref: string, contracts: Array<any>): string {
	for (const contract of contracts) {
		if (!contract) {
			continue;
		}
		const name = parseRefFromContract(ref, contract);
		if (name) {
			return name;
		}
	}
	throw new Error(`Could not find ref: ${ref}`);
}

function deriveType(contracts: Array<any>,
	typeMap: Record<string, string>,
	context: Array<string>,
	schema: any): string {
	if (schema.type === 'array') {
		return typeMap['array-begin'] +
			deriveType(contracts, typeMap, context, schema.items) +
			typeMap['array-end'];
	} else if (schema.$ref) {
		return parseRef(schema.$ref, contracts);
	} else if (schema.type === 'object') {
		if (schema.name) {
			return snakeCaseToSentenceCase(schema.name);
		} else {
			return snakeCaseToSentenceCase(context[0]);
		}
	} else if (schema.type === 'string' && schema.enum) {
		if (context.length < 2) {
			return snakeCaseToSentenceCase(context[0]);
		} else {
			return snakeCaseToSentenceCase(context[1]) +
				snakeCaseToSentenceCase(context[0]);
		}
	} else if (schema.oneOf) {
		if (schema.name) {
			return snakeCaseToSentenceCase(schema.name);
		} else {
			return snakeCaseToSentenceCase(context[0]);
		}
	} else {
		if (Object.keys(typeMap).includes(schema.type)) {
			return typeMap[schema.type];
		} else {
			throw new Error(`Unknown type: ${schema.type}`);
		}
	}
}

function formatLines(line: string): string[] {
	const words = line.split(' ');
	const lines = new Array<string>();
	let currentLine = '';
	for (const word of words) {
		if (currentLine.length + word.length + 1 > 70) {
			lines.push(currentLine);
			currentLine = word;
		} else {
			if (currentLine.length > 0) {
				currentLine += ' ';
			}
			currentLine += word;
		}
	}
	lines.push(currentLine);
	return lines;
}

function formatComment(leader: string, comment: string): string {
	const lines = formatLines(comment);
	let result = '';
	for (const line of lines) {
		result += leader + line + '\n';
	}
	return result;
}

function* enumVisitor(
	context: Array<string>,
	contract: any,
	callback: (context: Array<string>, e: Array<string>) => Generator<string>
): Generator<string> {
	if (contract.enum) {
		yield* callback(context, contract.enum);
	} else if (Array.isArray(contract)) {
		for (const item of contract) {
			yield* enumVisitor(context, item, callback);
		}
	} else if (typeof contract === 'object') {
		for (const key of Object.keys(contract)) {
			if (contract['name'] && typeof contract['name'] === 'string') {
				yield* enumVisitor(
					[contract['name'], ...context], contract[key], callback);
			} else if (key === 'properties' || key === 'params' || key === 'schemas' || key === 'components') {
				yield* enumVisitor(
					context, contract[key], callback);
			} else {
				yield* enumVisitor(
					[key, ...context], contract[key], callback);
			}

		}
	}
}

function* objectVisitor(
	context: Array<string>,
	contract: any,
	callback: (context: Array<string>, o: Record<string, any>) => Generator<string>
): Generator<string> {
	if (contract.type === 'object') {
		yield* callback(context, contract);
		yield* objectVisitor(context, contract.properties, callback);
	} else if (Array.isArray(contract)) {
		for (const item of contract) {
			yield* objectVisitor(context, item, callback);
		}
	} else if (typeof contract === 'object') {
		for (const key of Object.keys(contract)) {
			if (key === 'schema') {
				yield* objectVisitor(context, contract[key], callback);
			}
			else {
				yield* objectVisitor(
					[key, ...context], contract[key], callback);
			}
		}
	}
}

function* oneOfVisitor(
	context: Array<string>,
	contract: any,
	callback: (context: Array<string>, o: Record<string, any>) => Generator<string>
): Generator<string> {
	if (contract.oneOf) {
		yield* callback(context, contract);
	} else if (Array.isArray(contract)) {
		for (const item of contract) {
			yield* oneOfVisitor(context, item, callback);
		}
	} else if (typeof contract === 'object') {
		for (const key of Object.keys(contract)) {
			if (key === 'schema' || key === 'schemas' || key === 'components') {
				yield* oneOfVisitor(context, contract[key], callback);
			} else {
				yield* oneOfVisitor(
					[key, ...context], contract[key], callback);
			}
		}
	}
}

function collectExternalReferences(contracts: any[]): Array<{fileName: string; refs: Array<string>}> {
	const externalRefs = new Map<string, Set<string>>();

	for (const contract of contracts) {
		for (const ref of refVisitor(contract)) {
			const externalRef = externalRefComponents(ref);
			if (externalRef) {
				const filePath = externalRef.filePath;
				const refName = filePath.replace(/\.json$/, '').replace(/-(back|front)end-openrpc$/, '');
				if (!externalRefs.has(refName)) {
					externalRefs.set(refName, new Set());
				}

				const parts = externalRef.jsonPointer.split('/');
				const schemaName = parts[parts.length - 1];
				externalRefs.get(refName)!.add(snakeCaseToSentenceCase(schemaName));
			}
		}
	}

	return Array.from(externalRefs.entries()).map(([fileName, refsSet]) => ({
		fileName,
		refs: Array.from(refsSet)
	}));
}

function* createTypescriptComm(name: string, frontend: any, backend: any): Generator<string> {
	const metadata: CommMetadata = JSON.parse(
		readFileSync(path.join(commsDir, `${name}.json`), { encoding: 'utf-8' }));
	yield `/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

//
// AUTO-GENERATED from ${name}.json; do not edit.
//

`;
	if (frontend) {
		yield `import { Event } from '../../../../base/common/event.js';\n`;
	}
	yield `import { ErdosBaseComm, ErdosCommOptions } from './erdosBaseComm.js';
import { IRuntimeClientInstance } from './languageRuntimeClientInstance.js';

`;

	const contracts = [backend, frontend].filter(element => element !== undefined);

			const externalReferences = collectExternalReferences(contracts);
		if (externalReferences.length > 0) {
			for (const { fileName, refs } of externalReferences) {
				if (refs.length > 0) {
					yield `import { ${refs.join(', ')} } from './erdos${snakeCaseToSentenceCase(fileName)}Comm.js';\n`;
				}
			}
			yield '\n';
		}

	for (const source of contracts) {
		yield* createTypescriptValueTypes(source, contracts);
	}

	if (frontend) {
		const events: string[] = [];
		const requests: string[] = [];

		const validMethods = frontend.methods.filter((method: any) => 
			!method.result
		);

		for (const method of validMethods) {
			const sentenceName = snakeCaseToSentenceCase(method.name);
			events.push(`\t${sentenceName} = '${method.name}'`);

			yield `export interface ${sentenceName}Event {\n`;
			for (const param of method.params) {
				yield `\t${param.name}`;
				if (isOptional(param)) {
					yield '?';
				}
				yield ': ';
				if (param.schema.type === 'string' && param.schema.enum) {
					yield `${snakeCaseToSentenceCase(method.name)}${snakeCaseToSentenceCase(param.name)}`;
				} else {
					yield deriveType(contracts, TypescriptTypeMap, param.name, param.schema);
				}
				yield ';\n\n';
			}
			yield '}\n\n';
		}

		for (const method of frontend.methods) {
			if (!method.result) {
				continue;
			}

			const sentenceName = snakeCaseToSentenceCase(method.name);
			requests.push(`\t${sentenceName} = '${method.name}'`);

			yield `export interface ${sentenceName}Request {\n`;
			for (const param of method.params) {
				yield `\t${param.name}: `;
				if (param.schema.type === 'string' && param.schema.enum) {
					yield `${snakeCaseToSentenceCase(method.name)}${snakeCaseToSentenceCase(param.name)}`;
				} else {
					yield deriveType(contracts, TypescriptTypeMap, param.name, param.schema);
				}
				yield `;\n\n`;
			}
			yield '}\n\n';
		}

		if (events.length) {
			yield `export enum ${snakeCaseToSentenceCase(name)}FrontendEvent {\n`;
			yield events.join(',\n');
			yield '\n}\n\n';
		}

		if (requests.length) {
			yield `export enum ${snakeCaseToSentenceCase(name)}FrontendRequest {\n`;
			yield requests.join(',\n');
			yield '\n}\n\n';
		}
	}

	if (backend) {
		yield `export enum ${snakeCaseToSentenceCase(name)}BackendRequest {\n`;
		const requests = backend.methods.map((method: any) => `\t${snakeCaseToSentenceCase(method.name)} = '${method.name}'`);
		yield requests.join(',\n');
		yield '\n}\n\n';
	}

	yield `export class Erdos${snakeCaseToSentenceCase(name)}Comm extends ErdosBaseComm {\n`;

	yield '\tconstructor(\n';
	yield '\t\tinstance: IRuntimeClientInstance<any, any>,\n';
	yield `\t\toptions?: ErdosCommOptions<${snakeCaseToSentenceCase(name)}BackendRequest>,\n`;
	yield '\t) {\n';
	yield '\t\tsuper(instance, options);\n';
			if (frontend) {
			for (const method of frontend.methods) {
				if (method.result) {
					continue;
				}
				yield `\t\tthis.onDid${snakeCaseToSentenceCase(method.name)} = `;
				yield `super.createEventEmitter('${method.name}', [`;
			for (let i = 0; i < method.params.length; i++) {
				const param = method.params[i];
				yield `'${param.name}'`;
				if (i < method.params.length - 1) {
					yield ', ';
				}
			}
			yield `]);\n`;
		}
	}

	yield '\t}\n\n';

	if (backend) {
		for (const method of backend.methods) {
			yield '\t' + snakeCaseToCamelCase(method.name) + '(';
			for (let i = 0; i < method.params.length; i++) {
				const param = method.params[i];
				if (!param.schema) {
					throw new Error(`No schema for '${method.name}' parameter '${param.name}'`);
				}
				yield snakeCaseToCamelCase(param.name) + ': ';
				const schema = param.schema;
				if (schema.type === 'string' && schema.enum) {
					yield `${snakeCaseToSentenceCase(method.name)}${snakeCaseToSentenceCase(param.name)}`;
				} else {
					yield deriveType(contracts, TypescriptTypeMap, [method.name, param.name], schema);
				}
				if (isOptional(param)) {
					yield ' | undefined';
				}
				if (i < method.params.length - 1) {
					yield ', ';
				}
			}
			yield '): Promise<';
			if (method.result && method.result.schema) {
				if (method.result.schema.type === 'object') {
					yield snakeCaseToSentenceCase(method.result.schema.name);
				} else {
					yield deriveType(contracts, TypescriptTypeMap, method.name, method.result.schema);
				}
				if (isOptional(method.result)) {
					yield ' | undefined';
				}
			} else {
				yield 'void';
			}
			yield '> {\n';
			yield '\t\treturn super.performRpc(\'' + method.name + '\', [';
			for (let i = 0; i < method.params.length; i++) {
				yield `'${method.params[i].name}'`;
				if (i < method.params.length - 1) {
					yield ', ';
				}
			}
			yield '], [';
			for (let i = 0; i < method.params.length; i++) {
				yield snakeCaseToCamelCase(method.params[i].name);
				if (i < method.params.length - 1) {
					yield ', ';
				}
			}
			yield ']);\n';
			yield `\t}\n\n`;
		}
	}

	if (frontend) {
        yield '\n';
        for (const method of frontend.methods) {
            if (method.result) {
                continue;
            }
            yield `\tonDid${snakeCaseToSentenceCase(method.name)}: `;
            yield `Event<${snakeCaseToSentenceCase(method.name)}Event>;\n`;
		}
	}

	yield `}\n\n`;
}

function* createTypescriptValueTypes(source: any, contracts: any[]): Generator<string> {
	yield* objectVisitor([], source,
		function* (context: Array<string>, o: Record<string, any>): Generator<string> {
			const name = o.name ? o.name : context[0] === 'items' ? context[1] : context[0];
			const description = o.description ? o.description :
				snakeCaseToSentenceCase(context[0]) + ' in ' +
				snakeCaseToSentenceCase(context[1]);
			const additionalProperties = o.additionalProperties ? o.additionalProperties : false;
			yield* createTypescriptInterface(contracts, context, name, description, o.properties,
				o.required ? o.required : [], additionalProperties);
		});

	yield* oneOfVisitor([], source, function* (
		context: Array<string>,
		o: Record<string, any>) {

		let name = o.name ? o.name : context[0] === 'items' ? context[1] : context[0];
		name = snakeCaseToSentenceCase(name);

		if (o.description) {
			yield formatComment('/// ', o.description);
		} else if (context.length === 1) {
			yield formatComment('/// ', snakeCaseToSentenceCase(context[0]));
		} else {
			yield formatComment('/// ', snakeCaseToSentenceCase(context[0]) + ' in ' +
				snakeCaseToSentenceCase(context[1]));
		}
		yield `export type ${name} = `;
		for (let i = 0; i < o.oneOf.length; i++) {
			const option = o.oneOf[i];
			if (option.name === undefined) {
				throw new Error(`No name in option: ${JSON.stringify(option)}`);
			}
			yield deriveType(contracts, TypescriptTypeMap, [option.name, ...context], option);
			if (i < o.oneOf.length - 1) {
				yield ' | ';
			}
		}
		yield ';\n\n';
	});

	yield* enumVisitor([], source, function* (context: Array<string>, values: Array<string>) {
		if (context.length === 1) {
			yield `export enum ${snakeCaseToSentenceCase(context[0])} {\n`;
		} else {
			yield `export enum ${snakeCaseToSentenceCase(context[1])}${snakeCaseToSentenceCase(context[0])} {\n`;
		}
		for (let i = 0; i < values.length; i++) {
			const value = values[i];
			yield `\t${snakeCaseToSentenceCase(value)} = '${value}'`;
			if (i < values.length - 1) {
				yield ',\n';
			} else {
				yield '\n';
			}
		}
		yield '}\n\n';
	});

	if (source.methods) {
		for (const method of source.methods) {
			if (method.params.length > 0) {
				yield `export interface ${snakeCaseToSentenceCase(method.name)}Params {\n`;
				for (let i = 0; i < method.params.length; i++) {
					const param = method.params[i];
					if (param.schema.enum) {
						yield `\t${param.name}: ${snakeCaseToSentenceCase(method.name)}${snakeCaseToSentenceCase(param.name)};\n`;
					} else if (param.schema.type === 'object' && Object.keys(param.schema.properties).length === 0) {
						yield `\t${param.name}: any;\n`;
					} else {
						yield `\t${param.name}`;
						if (isOptional(param)) {
							yield `?`;
						}
						yield `: `;
						yield deriveType(contracts, TypescriptTypeMap, [param.name], param.schema);
						yield `;\n`;
					}
					if (i < method.params.length - 1) {
						yield '\n';
					}
				}
				yield `}\n\n`;
			}
		}
	}
}

function* createTypescriptInterface(
	contracts: Array<any>,
	context: Array<string>,
	name: string,
	description: string,
	properties: Record<string, any>,
	required: Array<string>,
	additionalProperties?: boolean,
): Generator<string> {

	if (!description) {
		throw new Error(`No description for '${name}'; please add a description to the schema`);
	}
	yield `export interface ${snakeCaseToSentenceCase(name)} {\n`;
	if (!properties || Object.keys(properties).length === 0) {
		if (!additionalProperties) {
			throw new Error(`No properties for '${name}'; please add properties to the schema`);
		}

		yield '\t[k: string]: unknown;\n';
	}
	for (const prop of Object.keys(properties)) {
		const schema = properties[prop];
		if (!schema.description) {
			throw new Error(`No description for the '${name}.${prop}' value; please add a description to the schema`);
		}
		yield `\t${prop}`;
		if (!required.includes(prop)) {
			yield '?';
		}
		yield `: `;
		if (schema.type === 'object') {
			yield snakeCaseToSentenceCase(schema.name);
		} else if (schema.type === 'string' && schema.enum) {
			yield `${snakeCaseToSentenceCase(name)}${snakeCaseToSentenceCase(prop)}`;
		} else {
			yield deriveType(contracts, TypescriptTypeMap, [prop, ...context], schema);
		}
		yield `;\n\n`;
	}
	yield '}\n\n';
}

function* refVisitor(
	contract: any,
): Generator<string> {
	if (Array.isArray(contract)) {
		for (const item of contract) {
			yield* refVisitor(item);
		}
		return;
	}

	if (contract && typeof contract === 'object') {
		if (contract.$ref) {
			yield contract.$ref;
		}

		for (const key of Object.keys(contract)) {
			yield* refVisitor(contract[key]);
		}
	}
}

async function createCommInterface() {
	for (const file of commsFiles) {
		if (!file.endsWith('.json')) {
			continue;
		}

		const name = file.replace(/\.json$/, '');

		try {
			if (existsSync(path.join(commsDir, `${name}-frontend-openrpc.json`)) ||
				existsSync(path.join(commsDir, `${name}-backend-openrpc.json`))) {

				let frontend: any = null;
				if (existsSync(path.join(commsDir, `${name}-frontend-openrpc.json`))) {
					frontend = JSON.parse(
						readFileSync(path.join(commsDir, `${name}-frontend-openrpc.json`), { encoding: 'utf-8' }));

				}

				let backend: any = null;
				if (existsSync(path.join(commsDir, `${name}-backend-openrpc.json`))) {
					backend = JSON.parse(
						readFileSync(path.join(commsDir, `${name}-backend-openrpc.json`), { encoding: 'utf-8' }));

				}

				const tsOutputFile = path.join(tsOutputDir, `erdos${snakeCaseToSentenceCase(name)}Comm.ts`);
				let ts = '';
				for await (const chunk of createTypescriptComm(name, frontend, backend)) {
					ts += chunk;
				}

				console.log(`Writing generated comm file: ${tsOutputFile}`);
				writeFileSync(tsOutputFile, ts, { encoding: 'utf-8' });
			}
		} catch (e: any) {
			if (e.message) {
				e.message = `while processing ${name} comm:\n${e.message}`;
			}
			throw e;
		}
	}
}

createCommInterface();
