/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

const ROOT = path.resolve(__dirname, '..');
const PROTOCOL_DIR = path.join(ROOT, 'src/vs/platform/agentHost/common/state/protocol');
const OUTPUT = path.join(ROOT, 'src/vs/platform/agentHost/common/state/agentHostUriProjection.generated.ts');
const URI_DECLARATION = declarationReference('common/state.ts', 'URI');

interface IDeclarationReference {
	readonly file: string;
	readonly name: string;
}

interface IProjectionRoot extends IDeclarationReference {
	readonly decode?: boolean;
	readonly encode?: boolean;
	readonly properties?: readonly string[];
}

interface IUnionProjection {
	readonly name: string;
	readonly parameterName: string;
	readonly discriminator: string;
	readonly members: readonly IDeclarationReference[];
	readonly decode: boolean;
	readonly encode: boolean;
}

interface IOverlayPropertyProjection {
	readonly name: string;
	readonly union?: string;
}

interface IOverlayProjection {
	readonly name: string;
	readonly parameterName: string;
	readonly base: IDeclarationReference;
	readonly properties: readonly IOverlayPropertyProjection[];
	readonly decode: boolean;
}

interface IProjectedProperty {
	readonly declaration: ts.PropertySignature;
	readonly type: TypeProjection;
}

interface IInterfaceProjection {
	readonly declaration: ts.InterfaceDeclaration;
	readonly fields: IProjectedProperty[];
	readonly directions: Set<ProjectionDirection>;
	readonly exportedDirections: Set<ProjectionDirection>;
}

type ProjectionDirection = 'decode' | 'encode';

type TypeProjection =
	| { readonly kind: 'uri'; readonly original: ts.TypeNode }
	| { readonly kind: 'array'; readonly original: ts.TypeNode; readonly element: TypeProjection }
	| { readonly kind: 'interface'; readonly original: ts.TypeNode; readonly projection: IInterfaceProjection };

// Boundary roots are explicit; URI-bearing descendants are discovered recursively.
const roots: readonly IProjectionRoot[] = [
	{ ...declarationReference('channels-annotations/state.ts', 'AnnotationsState'), decode: true, encode: true },
	{ ...declarationReference('common/commands.ts', 'InitializeResult'), properties: ['defaultDirectory'], decode: true },
];

const unions: readonly IUnionProjection[] = [{
	name: 'ClientAnnotationsAction',
	parameterName: 'action',
	discriminator: 'type',
	members: [
		declarationReference('channels-annotations/actions.ts', 'AnnotationsSetAction'),
		declarationReference('channels-annotations/actions.ts', 'AnnotationsUpdatedAction'),
		declarationReference('channels-annotations/actions.ts', 'AnnotationsRemovedAction'),
		declarationReference('channels-annotations/actions.ts', 'AnnotationsEntrySetAction'),
		declarationReference('channels-annotations/actions.ts', 'AnnotationsEntryRemovedAction'),
	],
	decode: true,
	encode: true,
}];

const overlays: readonly IOverlayProjection[] = [{
	name: 'AnnotationsActionEnvelope',
	parameterName: 'envelope',
	base: declarationReference('common/actions.ts', 'ActionEnvelope'),
	properties: [
		{ name: 'channel' },
		{ name: 'action', union: 'ClientAnnotationsAction' },
	],
	decode: true,
}];

function declarationReference(file: string, name: string): IDeclarationReference {
	return { file, name };
}

function protocolFiles(directory = PROTOCOL_DIR): string[] {
	const result: string[] = [];
	for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
		const entryPath = path.join(directory, entry.name);
		if (entry.isDirectory()) {
			result.push(...protocolFiles(entryPath));
		} else if (entry.isFile() && entry.name.endsWith('.ts')) {
			result.push(entryPath);
		}
	}
	return result;
}

/**
 * Generates native URI overlays from the strategy documented in `common/state/URI_PROJECTION.md`.
 */
class UriProjectionGenerator {
	private readonly checker: ts.TypeChecker;
	private readonly uriDeclaration: ts.TypeAliasDeclaration;
	private readonly projections = new Map<ts.InterfaceDeclaration, IInterfaceProjection>();
	private readonly wireDeclarations = new Set<ts.Declaration>();
	private readonly valueDeclarations = new Set<ts.Declaration>();
	private readonly unionByName = new Map(unions.map(union => [union.name, union]));

	constructor(private readonly program: ts.Program) {
		this.checker = program.getTypeChecker();
		this.uriDeclaration = this.getDeclaration(URI_DECLARATION, ts.isTypeAliasDeclaration);
	}

	generate(): string {
		for (const root of roots) {
			const projection = this.projectInterface(this.getDeclaration(root, ts.isInterfaceDeclaration), root.properties);
			if (!projection) {
				throw new Error(`Projection root ${root.name} does not contain a URI`);
			}
			if (root.decode) {
				this.requireDirection(projection, 'decode', true);
			}
			if (root.encode) {
				this.requireDirection(projection, 'encode', true);
			}
		}

		for (const union of unions) {
			for (const member of union.members) {
				const declaration = this.getDeclaration(member, ts.isInterfaceDeclaration);
				const projection = this.projectInterface(declaration);
				this.collectDiscriminatorValue(declaration, union.discriminator);
				if (projection && union.decode) {
					this.requireDirection(projection, 'decode');
				}
				if (projection && union.encode) {
					this.requireDirection(projection, 'encode');
				}
			}
		}

		for (const overlay of overlays) {
			this.collectDeclaration(this.getDeclaration(overlay.base, ts.isInterfaceDeclaration));
			for (const property of overlay.properties) {
				if (property.union) {
					if (!this.unionByName.has(property.union)) {
						throw new Error(`Unknown projection union ${property.union}`);
					}
					continue;
				}
				const base = this.getDeclaration(overlay.base, ts.isInterfaceDeclaration);
				const declaration = this.getProperty(base, property.name);
				if (!declaration.type || !this.projectType(declaration.type)) {
					throw new Error(`Overlay property ${overlay.base.name}.${property.name} does not contain a URI`);
				}
			}
		}

		return this.emitSource();
	}

	private projectInterface(declaration: ts.InterfaceDeclaration, properties?: readonly string[]): IInterfaceProjection | undefined {
		const existing = this.projections.get(declaration);
		if (existing) {
			return existing;
		}

		const projection: IInterfaceProjection = {
			declaration,
			fields: [],
			directions: new Set(),
			exportedDirections: new Set(),
		};
		this.projections.set(declaration, projection);

		for (const member of declaration.members) {
			if (!ts.isPropertySignature(member) || !member.type) {
				continue;
			}
			if (properties && !properties.includes(this.propertyName(member))) {
				continue;
			}
			const type = this.projectType(member.type);
			if (type) {
				projection.fields.push({ declaration: member, type });
			}
		}

		if (projection.fields.length === 0) {
			this.projections.delete(declaration);
			return undefined;
		}
		if (properties) {
			for (const property of properties) {
				if (!projection.fields.some(field => this.propertyName(field.declaration) === property)) {
					throw new Error(`Selected property ${declaration.name.text}.${property} does not contain a URI`);
				}
			}
		}
		this.collectDeclaration(declaration);
		return projection;
	}

	private projectType(node: ts.TypeNode): TypeProjection | undefined {
		if (ts.isArrayTypeNode(node)) {
			const element = this.projectType(node.elementType);
			return element ? { kind: 'array', original: node, element } : undefined;
		}
		if (!ts.isTypeReferenceNode(node)) {
			return undefined;
		}

		const declaration = this.resolveTypeReference(node);
		if (declaration === this.uriDeclaration) {
			return { kind: 'uri', original: node };
		}
		if (ts.isInterfaceDeclaration(declaration)) {
			const projection = this.projectInterface(declaration);
			return projection ? { kind: 'interface', original: node, projection } : undefined;
		}
		if (ts.isTypeAliasDeclaration(declaration)) {
			const nested = this.projectType(declaration.type);
			if (nested) {
				throw new Error(`URI-bearing type aliases are not supported yet: ${declaration.name.text}`);
			}
		}
		return undefined;
	}

	private resolveTypeReference(node: ts.TypeReferenceNode): ts.Declaration | undefined {
		let symbol = this.checker.getSymbolAtLocation(node.typeName);
		if (symbol && (symbol.flags & ts.SymbolFlags.Alias) !== 0) {
			symbol = this.checker.getAliasedSymbol(symbol);
		}
		return symbol?.declarations?.[0];
	}

	private requireDirection(projection: IInterfaceProjection, direction: ProjectionDirection, exported = false): void {
		projection.directions.add(direction);
		if (exported) {
			projection.exportedDirections.add(direction);
		}
		for (const field of projection.fields) {
			this.requireTypeDirection(field.type, direction);
		}
	}

	private requireTypeDirection(type: TypeProjection, direction: ProjectionDirection): void {
		if (type.kind === 'array') {
			this.requireTypeDirection(type.element, direction);
		} else if (type.kind === 'interface') {
			this.requireDirection(type.projection, direction);
		}
	}

	private emitSource(): string {
		const lines = [
			'/*---------------------------------------------------------------------------------------------',
			' *  Copyright (c) Microsoft Corporation. All rights reserved.',
			' *  Licensed under the MIT License. See License.txt in the project root for license information.',
			' *--------------------------------------------------------------------------------------------*/',
			'',
			'// DO NOT EDIT -- generated by scripts/generate-agent-host-uri-projections.ts',
			'',
			`import { URI } from '../../../../base/common/uri.js';`,
			...this.emitWireImports(),
			'',
			'export interface IAgentHostUriProjectionContext {',
			'\tdecodeUri(value: string): URI;',
			'\tencodeUri(value: URI): string;',
			'}',
			'',
		];

		for (const projection of this.projections.values()) {
			lines.push(...this.emitNativeInterface(projection), '');
		}
		for (const union of unions) {
			lines.push(...this.emitNativeUnion(union), '');
		}
		for (const overlay of overlays) {
			lines.push(...this.emitNativeOverlay(overlay), '');
		}
		for (const projection of this.projections.values()) {
			for (const direction of projection.directions) {
				lines.push(...this.emitInterfaceCodec(projection, direction), '');
			}
		}
		for (const union of unions) {
			if (union.decode) {
				lines.push(...this.emitUnionCodec(union, 'decode'), '');
			}
			if (union.encode) {
				lines.push(...this.emitUnionCodec(union, 'encode'), '');
			}
		}
		for (const overlay of overlays) {
			if (overlay.decode) {
				lines.push(...this.emitOverlayDecoder(overlay), '');
			}
		}
		return `${lines.join('\n').trimEnd()}\n`;
	}

	private emitWireImports(): string[] {
		for (const union of unions) {
			for (const member of union.members) {
				this.collectDeclaration(this.getDeclaration(member, ts.isInterfaceDeclaration));
			}
		}

		const imports = new Map<string, { readonly types: Set<string>; readonly values: Set<string> }>();
		for (const declaration of this.wireDeclarations) {
			const sourceFile = declaration.getSourceFile();
			const module = this.moduleSpecifier(sourceFile.fileName);
			let names = imports.get(module);
			if (!names) {
				names = { types: new Set(), values: new Set() };
				imports.set(module, names);
			}
			const name = ts.getNameOfDeclaration(declaration);
			if (!name || !ts.isIdentifier(name)) {
				throw new Error(`Cannot import unnamed declaration from ${sourceFile.fileName}`);
			}
			(this.valueDeclarations.has(declaration) ? names.values : names.types).add(name.text);
		}

		return [...imports.entries()]
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([module, names]) => {
				const values = [...names.values].sort();
				const types = [...names.types].sort();
				if (values.length === 0) {
					return `import type { ${types.join(', ')} } from '${module}';`;
				}
				return `import { ${[...values, ...types.map(name => `type ${name}`)].join(', ')} } from '${module}';`;
			});
	}

	private emitNativeInterface(projection: IInterfaceProjection): string[] {
		const name = projection.declaration.name.text;
		const omitted = projection.fields.map(field => `'${this.propertyName(field.declaration)}'`).join(' | ');
		return [
			`export type Native${name} = Omit<${name}, ${omitted}> & {`,
			...projection.fields.map(field => {
				const optional = field.declaration.questionToken ? '?' : '';
				return `\treadonly ${this.propertyName(field.declaration)}${optional}: ${this.emitNativeType(field.type)};`;
			}),
			'};',
		];
	}

	private emitNativeUnion(union: IUnionProjection): string[] {
		const members = union.members.map(member => {
			const declaration = this.getDeclaration(member, ts.isInterfaceDeclaration);
			return this.projections.has(declaration) ? `Native${member.name}` : member.name;
		});
		return [
			`export type Native${union.name} =`,
			...members.map((member, index) => `\t| ${member}${index === members.length - 1 ? ';' : ''}`),
		];
	}

	private emitNativeOverlay(overlay: IOverlayProjection): string[] {
		const base = this.getDeclaration(overlay.base, ts.isInterfaceDeclaration);
		const omitted = overlay.properties.map(property => `'${property.name}'`).join(' | ');
		return [
			`export type Native${overlay.name} = Omit<${overlay.base.name}, ${omitted}> & {`,
			...overlay.properties.map(property => {
				const declaration = this.getProperty(base, property.name);
				const optional = declaration.questionToken ? '?' : '';
				const type = property.union
					? `Native${property.union}`
					: this.emitNativeType(this.projectType(declaration.type!)!);
				return `\treadonly ${property.name}${optional}: ${type};`;
			}),
			'};',
		];
	}

	private emitInterfaceCodec(projection: IInterfaceProjection, direction: ProjectionDirection): string[] {
		const name = projection.declaration.name.text;
		const parameter = name[0].toLowerCase() + name.slice(1);
		const inputType = direction === 'decode' ? name : `Native${name}`;
		const outputType = direction === 'decode' ? `Native${name}` : name;
		const exported = projection.exportedDirections.has(direction) ? 'export ' : '';
		return [
			`${exported}function ${direction}${name}(${parameter}: ${inputType}, context: IAgentHostUriProjectionContext): ${outputType} {`,
			'\treturn {',
			`\t\t...${parameter},`,
			...projection.fields.map(field => {
				const property = this.propertyName(field.declaration);
				const expression = this.emitCodecExpression(field.type, `${parameter}.${property}`, direction);
				const projected = field.declaration.questionToken
					? `${parameter}.${property} === undefined ? undefined : ${expression}`
					: expression;
				return `\t\t${property}: ${projected},`;
			}),
			'\t};',
			'}',
		];
	}

	private emitUnionCodec(union: IUnionProjection, direction: ProjectionDirection): string[] {
		const inputType = direction === 'decode' ? this.wireUnionType(union) : `Native${union.name}`;
		const outputType = direction === 'decode' ? `Native${union.name}` : this.wireUnionType(union);
		const lines = [
			`export function ${direction}${union.name}(${union.parameterName}: ${inputType}, context: IAgentHostUriProjectionContext): ${outputType} {`,
			`\tswitch (${union.parameterName}.${union.discriminator}) {`,
		];
		for (const member of union.members) {
			const declaration = this.getDeclaration(member, ts.isInterfaceDeclaration);
			const projection = this.projections.get(declaration);
			if (!projection) {
				continue;
			}
			const discriminator = this.getProperty(declaration, union.discriminator);
			if (!discriminator.type) {
				throw new Error(`Missing discriminator type ${member.name}.${union.discriminator}`);
			}
			lines.push(
				`\t\tcase ${discriminator.type.getText()}:`,
				`\t\t\treturn ${direction}${member.name}(${union.parameterName}, context);`,
			);
		}
		lines.push(
			'\t\tdefault:',
			`\t\t\treturn ${union.parameterName};`,
			'\t}',
			'}',
		);
		return lines;
	}

	private emitOverlayDecoder(overlay: IOverlayProjection): string[] {
		const base = this.getDeclaration(overlay.base, ts.isInterfaceDeclaration);
		return [
			`export function decode${overlay.name}(${overlay.parameterName}: ${overlay.base.name}, context: IAgentHostUriProjectionContext): Native${overlay.name} {`,
			'\treturn {',
			`\t\t...${overlay.parameterName},`,
			...overlay.properties.map(property => {
				const expression = property.union
					? `decode${property.union}(${overlay.parameterName}.${property.name} as ${this.wireUnionType(this.unionByName.get(property.union)!)}, context)`
					: this.emitCodecExpression(this.projectType(this.getProperty(base, property.name).type!)!, `${overlay.parameterName}.${property.name}`, 'decode');
				return `\t\t${property.name}: ${expression},`;
			}),
			'\t};',
			'}',
		];
	}

	private emitNativeType(type: TypeProjection): string {
		switch (type.kind) {
			case 'uri':
				return 'URI';
			case 'array':
				return `${this.emitNativeType(type.element)}[]`;
			case 'interface':
				return `Native${type.projection.declaration.name.text}`;
		}
	}

	private emitCodecExpression(type: TypeProjection, expression: string, direction: ProjectionDirection): string {
		switch (type.kind) {
			case 'uri':
				return direction === 'decode'
					? `context.decodeUri(${expression})`
					: `context.encodeUri(${expression})`;
			case 'array':
				return `${expression}.map(value => ${this.emitCodecExpression(type.element, 'value', direction)})`;
			case 'interface':
				return `${direction}${type.projection.declaration.name.text}(${expression}, context)`;
		}
	}

	private wireUnionType(union: IUnionProjection): string {
		return union.members.map(member => member.name).join(' | ');
	}

	private getDeclaration<T extends ts.Declaration>(reference: IDeclarationReference, predicate: (node: ts.Node) => node is T): T {
		const fileName = path.join(PROTOCOL_DIR, reference.file);
		const sourceFile = this.program.getSourceFile(fileName);
		if (!sourceFile) {
			throw new Error(`Missing protocol source file ${reference.file}`);
		}
		const declaration = sourceFile.statements.find((statement): statement is T =>
			predicate(statement) && ts.getNameOfDeclaration(statement)?.getText() === reference.name);
		if (!declaration) {
			throw new Error(`Missing declaration ${reference.name} in ${reference.file}`);
		}
		return declaration;
	}

	private getProperty(declaration: ts.InterfaceDeclaration, name: string): ts.PropertySignature {
		const property = declaration.members.find((member): member is ts.PropertySignature =>
			ts.isPropertySignature(member) && this.propertyName(member) === name);
		if (!property) {
			throw new Error(`Missing property ${declaration.name.text}.${name}`);
		}
		return property;
	}

	private propertyName(declaration: ts.PropertySignature): string {
		if (ts.isIdentifier(declaration.name) || ts.isStringLiteral(declaration.name) || ts.isNumericLiteral(declaration.name)) {
			return declaration.name.text;
		}
		throw new Error(`Unsupported property name in ${declaration.getSourceFile().fileName}`);
	}

	private collectDeclaration(declaration: ts.Declaration): void {
		this.wireDeclarations.add(declaration);
	}

	private collectDiscriminatorValue(declaration: ts.InterfaceDeclaration, propertyName: string): void {
		const property = this.getProperty(declaration, propertyName);
		if (!property.type || !ts.isTypeReferenceNode(property.type)) {
			throw new Error(`Unsupported discriminator ${declaration.name.text}.${propertyName}`);
		}
		const referenced = this.resolveTypeReference(property.type);
		const valueDeclaration = referenced && ts.isEnumMember(referenced) ? referenced.parent : referenced;
		if (!valueDeclaration || !ts.isEnumDeclaration(valueDeclaration)) {
			throw new Error(`Discriminator ${declaration.name.text}.${propertyName} is not an enum member`);
		}
		this.collectDeclaration(valueDeclaration);
		this.valueDeclarations.add(valueDeclaration);
	}

	private moduleSpecifier(fileName: string): string {
		const relative = path.relative(path.dirname(OUTPUT), fileName).replaceAll(path.sep, '/').replace(/\.ts$/, '.js');
		return relative.startsWith('.') ? relative : `./${relative}`;
	}
}

function createProtocolProgram(): ts.Program {
	return ts.createProgram(protocolFiles(), {
		module: ts.ModuleKind.NodeNext,
		moduleResolution: ts.ModuleResolutionKind.NodeNext,
		target: ts.ScriptTarget.ES2022,
		skipLibCheck: true,
	});
}

function generatedSource(): string {
	return new UriProjectionGenerator(createProtocolProgram()).generate();
}

export function generateAgentHostUriProjections(check = false): void {
	const content = generatedSource();
	if (check) {
		const existing = fs.existsSync(OUTPUT) ? fs.readFileSync(OUTPUT, 'utf8') : undefined;
		if (existing !== content) {
			throw new Error(`${path.relative(ROOT, OUTPUT)} is out of date. Run npx tsx scripts/generate-agent-host-uri-projections.ts.`);
		}
		return;
	}
	fs.writeFileSync(OUTPUT, content, 'utf8');
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
	generateAgentHostUriProjections(process.argv.includes('--check'));
}
