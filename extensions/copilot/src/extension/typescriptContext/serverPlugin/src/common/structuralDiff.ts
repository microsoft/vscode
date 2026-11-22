/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import type tt from 'typescript/lib/tsserverlibrary';
import TS from './typescript';
const ts = TS();

import { StructuralDiffClassification, StructuralDiffSymbolKind, StructuralDiffTag, type DiffTextChange, type StructuralDiffItem, type StructuralDiffNode, type StructuralDiffRequestArgs, type StructuralDiffResult } from './protocol';
import tss from './typescripts';

interface Span {
	readonly start: number;
	readonly end: number;
}

/**
 * Spans in document order that do not overlap, so that their ends are in order as well.
 */
type SortedSpans = readonly Span[];

interface EntityInfo {
	readonly name: string;
	readonly kind: StructuralDiffSymbolKind;
	readonly languageKind: string;
	/** The node whose text, including its doc comments, is the range of the item. */
	readonly rangeNode: tt.Node;
	readonly nameNode?: tt.Node;
	/** The nodes that implement the item, such as the body of a function or the arguments of a call. */
	readonly body?: readonly tt.Node[];
	/** The nodes to list as children, such as the members of a class or the properties of an object literal. */
	readonly members?: readonly tt.Node[];
	/** The statements to list children from, which form the body of a namespace or of a suite. */
	readonly statements?: readonly tt.Statement[];
	/** Items to list as children that are neither members nor statements, such as a test that a suite's expression body registers. */
	readonly nested?: readonly EntityInfo[];
	/** Whether the item is a suite, whose statements only contribute their tests and suites. */
	readonly isSuite?: boolean;
	readonly isTest?: boolean;
	/** Whether the item has no declared name, like a call or a test, but a name derived from its code. */
	readonly isAnonymous?: boolean;
}

interface Entity {
	readonly value: StructuralDiffItem;
	readonly span: Span;
	readonly groupedSpans?: readonly Span[];
	/** The text from the first token after the doc comments to the body or the first member. */
	readonly header: Span;
	readonly implementation: SortedSpans;
	readonly isTest: boolean;
	/** Whether the name is derived from the code of the entity, which can change while the entity stays the same. */
	readonly isAnonymous?: boolean;
	readonly children: Entity[];
	readonly rename?: { readonly name: Span; readonly declaration: tt.Node };
}

interface Source {
	readonly file: tt.SourceFile;
	readonly root: Entity;
	readonly dependencies: SortedSpans;
	readonly tests: SortedSpans;
}

interface DiffTree {
	readonly original?: Entity;
	readonly modified?: Entity;
	readonly result: StructuralDiffNode;
	readonly children: DiffTree[];
	/** The spans of the children on each side, sorted by their start. */
	readonly childSpans: Readonly<Record<Side, readonly ChildSpan[]>>;
}

interface ChildSpan {
	readonly child: DiffTree;
	readonly span: Span;
	/** The largest end of this and all preceding spans, which, unlike the ends, cannot decrease if siblings overlap. */
	readonly reach: number;
}

type Side = 'original' | 'modified';

/**
 * Parses both texts without a project and matches named siblings and conservative name-only renames
 * in a sparse structural tree. This is the TS6 counterpart of the TS7 implementation.
 */
export function computeStructuralDiff(args: StructuralDiffRequestArgs, token: tt.CancellationToken): StructuralDiffResult {
	const checkCancellation = () => token.throwIfCancellationRequested();
	const originalFile = ts.createSourceFile(args.fileName, args.originalText, ts.ScriptTarget.Latest, true);
	checkCancellation();
	const modifiedFile = ts.createSourceFile(args.fileName, args.modifiedText, ts.ScriptTarget.Latest, true);
	const original = collectSource(originalFile, checkCancellation);
	const modified = collectSource(modifiedFile, checkCancellation);
	const changes = args.changes;
	let nextId = 0;
	const merge = (left: Entity | undefined, right: Entity | undefined): DiffTree => {
		checkCancellation();
		const result: StructuralDiffNode = {
			id: String(nextId++),
			original: left?.value,
			modified: right?.value,
			originalChanges: [],
			modifiedChanges: [],
			children: [],
		};
		const leftChildren = left?.children ?? [];
		const rightChildren = right?.children ?? [];
		const counterparts = matchSiblings(leftChildren, rightChildren, originalFile, modifiedFile, changes, checkCancellation);
		const matched = new Set<Entity>();
		const children = rightChildren.map(child => {
			const counterpart = counterparts.get(child);
			if (counterpart !== undefined) {
				matched.add(counterpart);
			}
			return merge(counterpart, child);
		});
		for (const child of leftChildren) {
			if (!matched.has(child)) {
				children.push(merge(child, undefined));
			}
		}
		return { original: left, modified: right, result, children, childSpans: { original: getChildSpans(children, 'original'), modified: getChildSpans(children, 'modified') } };
	};
	const tree = merge(original.root, modified.root);
	for (const [textChangeIndex, change] of changes.entries()) {
		checkCancellation();
		classify(tree, 'original', original, textChangeIndex, change.original, checkCancellation);
		classify(tree, 'modified', modified, textChangeIndex, change.modified, checkCancellation);
	}
	const prune = (node: DiffTree): StructuralDiffNode => {
		for (const child of node.children) {
			const result = prune(child);
			if (result.originalChanges.length > 0 || result.modifiedChanges.length > 0 || result.children.length > 0) {
				node.result.children.push(result);
			}
		}
		return node.result;
	};
	checkCancellation();
	return { root: prune(tree), isIncomplete: false };
}

/**
 * Collects the items of a file. The statements of the file and of namespaces contribute declarations and tests, and
 * classes, interfaces, enums and object literals contribute their members. The other statements of the file or of a
 * namespace, such as registrations, form one item of top-level code, which lists the calls and assignments among them.
 * The code of functions and of other expressions, such as callbacks, belongs to the enclosing item, except that suites
 * list their tests.
 */
function collectSource(file: tt.SourceFile, checkCancellation: () => void): Source {
	const root: Entity = {
		value: { name: getBaseFileName(file.fileName), kind: StructuralDiffSymbolKind.File, range: { start: 0, end: file.text.length } },
		span: { start: 0, end: file.text.length },
		header: { start: 0, end: 0 },
		implementation: file.statements.map(statement => nodeSpan(statement, file)),
		isTest: isTestFile(file.fileName),
		children: [],
	};
	const dependencies: Span[] = [];
	const statementGroups = new Map<Entity, Map<GroupKind, StatementGroup>>();
	const getGroup = (parent: Entity, kind: GroupKind): StatementGroup => {
		let groups = statementGroups.get(parent);
		if (groups === undefined) {
			groups = new Map();
			statementGroups.set(parent, groups);
		}
		let group = groups.get(kind);
		if (group === undefined) {
			group = { spans: [], members: [] };
			groups.set(kind, group);
		}
		return group;
	};
	const addEntity = (parent: Entity, info: EntityInfo): void => {
		// Doc comments belong to the item, so that changing only them marks the item rather than its parent.
		const span = nodeSpanWithDocComments(info.rangeNode, file);
		if (span.start >= span.end || !contains(parent.span, span)) {
			return;
		}
		// A name that is missing because of a syntax error, as in `if (x) = y;`, is empty and can lie before the item.
		const selection = info.nameNode === undefined ? undefined : nodeSpan(info.nameNode, file);
		const entity: Entity = {
			value: {
				name: info.name,
				kind: info.kind,
				languageKind: info.languageKind,
				range: span,
				selectionRange: selection !== undefined && contains(span, selection) ? selection : undefined,
			},
			span,
			header: { start: info.rangeNode.getStart(file), end: info.body?.[0]?.getStart(file) ?? info.members?.[0]?.getStart(file, true) ?? span.end },
			implementation: info.body?.map(node => bodySpan(node, file)) ?? [],
			isTest: parent.isTest || info.isTest === true || /^(?:it|test|spec)(?:$|[\s_.:-]|[A-Z])/.test(info.name),
			isAnonymous: info.isAnonymous,
			children: [],
			rename: !info.isAnonymous && info.nameNode !== undefined && (ts.isIdentifier(info.nameNode) || ts.isPrivateIdentifier(info.nameNode))
				? { name: nodeSpan(info.nameNode, file), declaration: info.rangeNode }
				: undefined,
		};
		parent.children.push(entity);
		for (const member of info.members ?? []) {
			checkCancellation();
			const memberInfo = getMemberInfo(member, file);
			if (memberInfo !== undefined) {
				addEntity(entity, memberInfo);
			}
		}
		for (const statement of info.statements ?? []) {
			visitStatement(statement, entity, info.isSuite === true);
		}
		for (const nested of info.nested ?? []) {
			addEntity(entity, nested);
		}
	};
	const visitStatement = (node: tt.Statement, parent: Entity, isSuite: boolean): void => {
		checkCancellation();
		const nested = getNestedStatements(node);
		if (nested !== undefined && isSuite) {
			for (const statement of nested) {
				visitStatement(statement, parent, true);
			}
			return;
		}
		if (nested !== undefined) {
			// The declarations in a compound statement are listed as if they were not nested, and the rest of it, such as
			// the condition of an `if` statement, is top-level code.
			const code = getGroup(parent, 'statements');
			const spanCount = code.spans.length;
			const childCount = parent.children.length;
			for (const statement of nested) {
				visitStatement(statement, parent, false);
			}
			code.spans.splice(spanCount, code.spans.length - spanCount, ...subtractSpans(nodeSpanWithDocComments(node, file), parent.children.slice(childCount).map(child => child.span)));
			return;
		}
		if (isSuite) {
			// Hooks, helpers and the other statements of a suite belong to the suite, which only lists its tests.
			const info = ts.isExpressionStatement(node) ? getTestInfo(node, file) : undefined;
			if (info !== undefined) {
				addEntity(parent, info);
			}
			return;
		}
		const groupKind = getGroupKind(node);
		if (groupKind !== undefined) {
			const span = nodeSpan(node, file);
			if (groupKind === 'imports' || (ts.isExportDeclaration(node) && node.moduleSpecifier !== undefined)) {
				dependencies.push(span);
			}
			getGroup(parent, groupKind).spans.push(span);
			return;
		}
		if (ts.isVariableStatement(node)) {
			const declarations = node.declarationList.declarations;
			for (const declaration of declarations) {
				const base = { name: declaration.name.getText(file), nameNode: declaration.name, rangeNode: declarations.length === 1 ? node : declaration };
				addEntity(parent, getValueInfo(base, declaration.initializer, StructuralDiffSymbolKind.Variable, 'variable', declaration.type));
			}
			return;
		}
		const info = getStatementInfo(node, file);
		if (info !== undefined) {
			addEntity(parent, info);
			return;
		}
		const span = nodeSpanWithDocComments(node, file);
		const member = ts.isExpressionStatement(node) ? getCallInfo(node, file) ?? getAssignmentInfo(node, file) : undefined;
		if (span.start < span.end) {
			const code = getGroup(parent, 'statements');
			code.spans.push(span);
			if (member !== undefined) {
				code.members.push(member);
			}
		}
	};
	for (const statement of file.statements) {
		visitStatement(statement, root, false);
	}
	for (const [parent, groups] of statementGroups) {
		for (const [kind, { spans, members }] of groups) {
			checkCancellation();
			if (spans.length === 0) {
				continue;
			}
			const span = { start: spans[0].start, end: spans[spans.length - 1].end };
			const group: Entity = {
				value: {
					name: getGroupName(kind),
					kind: StructuralDiffSymbolKind.Module,
					languageKind: kind,
					range: span,
					selectionRange: spans[0],
				},
				span,
				groupedSpans: spans,
				header: { start: span.start, end: span.start },
				implementation: spans,
				isTest: parent.isTest,
				children: [],
			};
			parent.children.push(group);
			for (const member of members) {
				addEntity(group, member);
			}
		}
		parent.children.sort((left, right) => left.span.start - right.span.start);
	}
	return { file, root, dependencies: toSortedSpans(dependencies), tests: root.isTest ? [] : collectTestSpans(file, checkCancellation) };
}

type GroupKind = 'imports' | 'exports' | 'statements';

/**
 * The statements that form an item without a name of its own, such as the imports of a file.
 */
interface StatementGroup {
	/** The spans of the statements in document order, which do not overlap. */
	readonly spans: Span[];
	/** The calls and assignments of top-level code, which the group lists as its children. */
	readonly members: EntityInfo[];
}

/**
 * Returns the name of a group, which the client localizes by its language kind.
 */
function getGroupName(kind: GroupKind): string {
	switch (kind) {
		case 'imports':
			return 'Imports';
		case 'exports':
			return 'Exports';
		case 'statements':
			return 'Top-Level Code';
	}
}

/**
 * Returns the group of an import or export statement. Exporting a value as the default, as in `export default () => {}`,
 * instead makes an item named `default`, like an exported default function.
 */
function getGroupKind(node: tt.Statement): 'imports' | 'exports' | undefined {
	if (ts.isImportDeclaration(node) || ts.isImportEqualsDeclaration(node)) {
		return 'imports';
	}
	if (ts.isExportDeclaration(node) || ts.isNamespaceExportDeclaration(node)
		|| (ts.isExportAssignment(node) && (node.isExportEquals || isEntityNameExpression(tss.Nodes.skipOuterExpressions(node.expression))))) {
		return 'exports';
	}
	return undefined;
}

/**
 * Returns the item of a declaration or a test, other than a variable statement or an import or export statement. The
 * other statements are top-level code.
 */
function getStatementInfo(node: tt.Statement, file: tt.SourceFile): EntityInfo | undefined {
	const base = { rangeNode: node };
	if (ts.isClassDeclaration(node) || ts.isFunctionDeclaration(node)) {
		const name = node.name?.getText(file) ?? (node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.DefaultKeyword) ? 'default' : undefined);
		if (name === undefined) {
			return undefined;
		}
		return ts.isClassDeclaration(node)
			? { ...base, name, nameNode: node.name, kind: StructuralDiffSymbolKind.Class, languageKind: 'class', members: node.members }
			: { ...base, name, nameNode: node.name, kind: StructuralDiffSymbolKind.Function, languageKind: 'function', body: node.body && [node.body] };
	}
	if (ts.isInterfaceDeclaration(node)) {
		return { ...base, name: node.name.getText(file), nameNode: node.name, kind: StructuralDiffSymbolKind.Interface, languageKind: 'interface', members: node.members };
	}
	if (ts.isTypeAliasDeclaration(node)) {
		return { ...base, name: node.name.getText(file), nameNode: node.name, kind: StructuralDiffSymbolKind.Variable, languageKind: 'type-alias', members: getTypeMembers(node.type) };
	}
	if (ts.isEnumDeclaration(node)) {
		return { ...base, name: node.name.getText(file), nameNode: node.name, kind: StructuralDiffSymbolKind.Enum, languageKind: 'enum', members: node.members };
	}
	if (ts.isModuleDeclaration(node)) {
		const body = node.body;
		const statements = body === undefined ? undefined : ts.isModuleBlock(body) ? body.statements : ts.isModuleDeclaration(body) ? [body] : undefined;
		return { ...base, name: node.name.getText(file), nameNode: node.name, kind: StructuralDiffSymbolKind.Module, languageKind: 'module', body: body && [body], statements };
	}
	if (ts.isExportAssignment(node)) {
		// The other export assignments are grouped as exports.
		return getValueInfo({ name: 'default', rangeNode: node }, node.expression, StructuralDiffSymbolKind.Variable, 'variable');
	}
	if (ts.isExpressionStatement(node)) {
		return getTestInfo(node, file);
	}
	return undefined;
}

/**
 * Returns the item of a member of a class, interface, enum, object literal or type literal.
 */
function getMemberInfo(node: tt.Node, file: tt.SourceFile): EntityInfo | undefined {
	if (ts.isPropertyDeclaration(node) || ts.isPropertyAssignment(node)) {
		const base = { name: node.name.getText(file), nameNode: node.name, rangeNode: node };
		return getValueInfo(base, node.initializer, StructuralDiffSymbolKind.Property, 'property', ts.isPropertyDeclaration(node) ? node.type : undefined);
	}
	const base = { rangeNode: node };
	if (ts.isConstructorDeclaration(node)) {
		return { ...base, name: 'constructor', kind: StructuralDiffSymbolKind.Constructor, languageKind: 'constructor', body: node.body && [node.body] };
	}
	if (ts.isMethodDeclaration(node) || ts.isMethodSignature(node)) {
		return { ...base, name: node.name.getText(file), nameNode: node.name, kind: StructuralDiffSymbolKind.Method, languageKind: 'method', body: ts.isMethodDeclaration(node) && node.body !== undefined ? [node.body] : undefined };
	}
	if (ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)) {
		return { ...base, name: node.name.getText(file), nameNode: node.name, kind: StructuralDiffSymbolKind.Property, languageKind: ts.isGetAccessorDeclaration(node) ? 'getter' : 'setter', body: node.body && [node.body] };
	}
	if (ts.isPropertySignature(node)) {
		return { ...base, name: node.name.getText(file), nameNode: node.name, kind: StructuralDiffSymbolKind.Property, languageKind: 'property', members: getTypeMembers(node.type) };
	}
	if (ts.isEnumMember(node)) {
		return { ...base, name: node.name.getText(file), nameNode: node.name, kind: StructuralDiffSymbolKind.EnumMember, languageKind: 'enum-member', body: node.initializer && [node.initializer] };
	}
	if (ts.isClassStaticBlockDeclaration(node)) {
		return { ...base, name: 'static', kind: StructuralDiffSymbolKind.Method, languageKind: 'static-block', body: [node.body] };
	}
	if (ts.isCallSignatureDeclaration(node) || ts.isConstructSignatureDeclaration(node) || ts.isIndexSignatureDeclaration(node)) {
		const name = ts.isCallSignatureDeclaration(node) ? '(call)' : ts.isConstructSignatureDeclaration(node) ? '(new)' : '[index]';
		return { ...base, name, kind: ts.isConstructSignatureDeclaration(node) ? StructuralDiffSymbolKind.Constructor : StructuralDiffSymbolKind.Method, languageKind: ts.isCallSignatureDeclaration(node) ? 'call-signature' : ts.isConstructSignatureDeclaration(node) ? 'construct-signature' : 'index-signature' };
	}
	return undefined;
}

/**
 * Returns the item of a name that is bound to a value, such as a variable or a property. A function, class or object
 * literal value determines the kind of the item, and the members of a class or object literal, or else of a type
 * literal, become its children.
 */
function getValueInfo(base: Pick<EntityInfo, 'name' | 'nameNode' | 'rangeNode'>, value: tt.Expression | undefined, kind: StructuralDiffSymbolKind, languageKind: string, type?: tt.TypeNode): EntityInfo {
	if (value === undefined) {
		return { ...base, kind, languageKind, members: getTypeMembers(type) };
	}
	const initializer = tss.Nodes.skipOuterExpressions(value);
	if (isFunctionValue(initializer)) {
		return { ...base, kind: StructuralDiffSymbolKind.Function, languageKind: ts.isArrowFunction(initializer) ? 'arrow-function' : 'function', body: [initializer.body] };
	}
	if (ts.isClassExpression(initializer)) {
		return { ...base, kind: StructuralDiffSymbolKind.Class, languageKind: 'class', members: initializer.members };
	}
	if (ts.isObjectLiteralExpression(initializer)) {
		return { ...base, kind: StructuralDiffSymbolKind.Object, languageKind: 'object', body: [initializer], members: initializer.properties };
	}
	if (ts.isArrayLiteralExpression(initializer)) {
		return { ...base, kind: StructuralDiffSymbolKind.Array, languageKind: 'array', body: [initializer] };
	}
	return { ...base, kind, languageKind, body: [value], members: getTypeMembers(type) };
}

function getTypeMembers(type: tt.TypeNode | undefined): readonly tt.Node[] | undefined {
	return type !== undefined && ts.isTypeLiteralNode(type) ? type.members : undefined;
}

/**
 * Returns the item of a call statement, such as a registration in a contribution file. Like a callback in TypeScript's
 * outline, it is named by the called function and its string arguments, and also by its arguments that are names,
 * such as the name of a class that it registers.
 */
function getCallInfo(node: tt.ExpressionStatement, file: tt.SourceFile): EntityInfo | undefined {
	const expression = unwrapExpression(node.expression);
	if (!ts.isCallExpression(expression)) {
		return undefined;
	}
	const callee = tss.Nodes.skipOuterExpressions(expression.expression);
	const calledName = getCalledName(callee);
	const names = expression.arguments.flatMap(argument => {
		if (ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument) || ts.isTemplateExpression(argument)) {
			return [argument.getText(file)];
		}
		if (ts.isIdentifier(argument)) {
			return [argument.text];
		}
		return (ts.isClassExpression(argument) || ts.isFunctionExpression(argument)) && argument.name !== undefined ? [argument.name.text] : [];
	});
	return {
		name: toName(`${calledName?.name ?? (isFunctionValue(callee) ? '<function>' : callee.getText(file))}(${names.join(', ')})`),
		nameNode: calledName?.node,
		rangeNode: node,
		kind: StructuralDiffSymbolKind.Function,
		languageKind: 'call',
		body: getCallBody(expression),
		isAnonymous: true,
	};
}

/**
 * Returns the implementation of a call, which consists of the arguments of the calls in its chain, as in
 * `load().then(() => {})`, and the body of a function that it calls immediately, in document order.
 */
function getCallBody(node: tt.Expression): readonly tt.Node[] {
	const expression = tss.Nodes.skipOuterExpressions(node);
	if (ts.isCallExpression(expression)) {
		return [...getCallBody(expression.expression), ...expression.arguments];
	}
	if (ts.isPropertyAccessExpression(expression) || ts.isElementAccessExpression(expression)) {
		return getCallBody(expression.expression);
	}
	return isFunctionValue(expression) ? [expression.body] : [];
}

/**
 * Returns the name of a called function, such as `Registry.register`, like TypeScript's outline does for callbacks,
 * and the node of the name.
 */
function getCalledName(node: tt.Expression): { readonly name: string; readonly node: tt.Node } | undefined {
	if (ts.isIdentifier(node)) {
		return { name: node.text, node };
	}
	if (ts.isPropertyAccessExpression(node)) {
		const left = getCalledName(node.expression);
		return left === undefined ? { name: node.name.text, node: node.name } : { name: `${left.name}.${node.name.text}`, node };
	}
	return undefined;
}

/**
 * Returns the item of an assignment statement, such as `module.exports.helper = () => {}`, which is named by its target.
 */
function getAssignmentInfo(node: tt.ExpressionStatement, file: tt.SourceFile): EntityInfo | undefined {
	const expression = tss.Nodes.skipOuterExpressions(node.expression);
	if (!ts.isBinaryExpression(expression) || expression.operatorToken.kind !== ts.SyntaxKind.EqualsToken) {
		return undefined;
	}
	const target = expression.left;
	const base = { name: toName(target.getText(file)), nameNode: target, rangeNode: node };
	return getValueInfo(base, expression.right, ts.isIdentifier(target) ? StructuralDiffSymbolKind.Variable : StructuralDiffSymbolKind.Property, 'assignment');
}

/**
 * Returns the statements of a compound statement, such as the branches of an `if` statement or the body of a loop.
 * Their items are listed as if they were not nested, so that the tests in a loop belong to the enclosing suite.
 */
function getNestedStatements(node: tt.Statement): readonly tt.Statement[] | undefined {
	if (ts.isBlock(node)) {
		return node.statements;
	}
	if (ts.isIfStatement(node)) {
		return node.elseStatement === undefined ? [node.thenStatement] : [node.thenStatement, node.elseStatement];
	}
	if (ts.isForStatement(node) || ts.isForInStatement(node) || ts.isForOfStatement(node) || ts.isWhileStatement(node)
		|| ts.isDoStatement(node) || ts.isLabeledStatement(node) || ts.isWithStatement(node)) {
		return [node.statement];
	}
	if (ts.isTryStatement(node)) {
		return [node.tryBlock, node.catchClause?.block, node.finallyBlock].filter((block): block is tt.Block => block !== undefined);
	}
	if (ts.isSwitchStatement(node)) {
		return node.caseBlock.clauses.flatMap(clause => clause.statements);
	}
	return undefined;
}

function isEntityNameExpression(node: tt.Expression): boolean {
	return ts.isIdentifier(node) || (ts.isPropertyAccessExpression(node) && isEntityNameExpression(node.expression));
}

function isFunctionValue(node: tt.Node): node is tt.ArrowFunction | tt.FunctionExpression {
	return ts.isArrowFunction(node) || ts.isFunctionExpression(node);
}

const maxNameLength = 150;

/**
 * Returns code as a name on a single line, shortened like the names in TypeScript's outline.
 */
function toName(text: string): string {
	const name = text.replace(/\s+/g, ' ');
	return name.length > maxNameLength ? `${name.slice(0, maxNameLength)}…` : name;
}

/**
 * Returns the span of a body, which excludes the braces of a block.
 */
function bodySpan(body: tt.Node, file: tt.SourceFile): Span {
	if (ts.isBlock(body) || ts.isModuleBlock(body)) {
		return { start: body.getStart(file) + 1, end: Math.max(body.getStart(file) + 1, body.getEnd() - 1) };
	}
	return nodeSpan(body, file);
}

function entityKey(entity: Entity): string {
	return JSON.stringify([entity.value.kind, entity.value.languageKind, entity.value.name]);
}

function groupEntities(entities: readonly Entity[], keyOf: (entity: Entity) => string | undefined = entityKey): Map<string, Entity[]> {
	const groups = new Map<string, Entity[]>();
	for (const entity of entities) {
		const key = keyOf(entity);
		if (key === undefined) {
			continue;
		}
		const group = groups.get(key);
		if (group === undefined) {
			groups.set(key, [entity]);
		} else {
			group.push(entity);
		}
	}
	return groups;
}

function matchSiblings(original: readonly Entity[], modified: readonly Entity[], originalFile: tt.SourceFile, modifiedFile: tt.SourceFile, changes: readonly DiffTextChange[], checkCancellation: () => void): Map<Entity, Entity> {
	const matches = new Map<Entity, Entity>();
	const matchedOriginal = new Set<Entity>();
	// Siblings that their names do not tell apart, such as overloads, and calls and tests, whose names change with
	// their arguments, correspond if they start at the same unchanged text. This comes before matching names, so that a
	// test whose title changes to the old title of another test is not matched with that test.
	const originalByStart = new Map<number, Entity>();
	for (const entity of original) {
		originalByStart.set(entity.header.start, entity);
	}
	for (const entity of modified) {
		checkCancellation();
		const start = toOriginalOffset(changes, entity.header.start);
		const candidate = start === undefined ? undefined : originalByStart.get(start);
		if (candidate !== undefined && !matchedOriginal.has(candidate) && candidate.value.kind === entity.value.kind && candidate.value.languageKind === entity.value.languageKind
			&& (candidate.value.name === entity.value.name || (candidate.isAnonymous && entity.isAnonymous))) {
			matches.set(entity, candidate);
			matchedOriginal.add(candidate);
		}
	}

	const originalByKey = groupEntities(original);
	const modifiedByKey = groupEntities(modified);
	for (const entity of modified) {
		checkCancellation();
		const key = entityKey(entity);
		const candidates = originalByKey.get(key);
		if (!matches.has(entity) && candidates?.length === 1 && !matchedOriginal.has(candidates[0]) && modifiedByKey.get(key)?.length === 1) {
			matches.set(entity, candidates[0]);
			matchedOriginal.add(candidates[0]);
		}
	}

	const unmatchedOriginal = original.filter(entity => !matchedOriginal.has(entity) && originalByKey.get(entityKey(entity))?.length === 1);
	const unmatchedModified = modified.filter(entity => !matches.has(entity) && modifiedByKey.get(entityKey(entity))?.length === 1);
	if (unmatchedOriginal.length === 0 || unmatchedModified.length === 0) {
		return matches;
	}
	const originalBySyntax = groupEntities(unmatchedOriginal, entity => renameFingerprint(entity, originalFile, checkCancellation));
	const modifiedBySyntax = groupEntities(unmatchedModified, entity => renameFingerprint(entity, modifiedFile, checkCancellation));
	for (const [fingerprint, candidates] of modifiedBySyntax) {
		checkCancellation();
		const originalCandidates = originalBySyntax.get(fingerprint);
		if (candidates.length !== 1 || originalCandidates?.length !== 1) {
			continue;
		}
		const before = originalCandidates[0];
		const after = candidates[0];
		if (before.value.name !== after.value.name && isNameChanged(changes, before.rename!.name, after.rename!.name)) {
			matches.set(after, before);
		}
	}
	return matches;
}

function renameFingerprint(entity: Entity, file: tt.SourceFile, checkCancellation: () => void): string | undefined {
	if (entity.rename === undefined) {
		return undefined;
	}
	const { name, declaration } = entity.rename;
	const parts: [tt.SyntaxKind, string | null][] = [];
	let nameTokens = 0;
	let missingToken = false;
	const visit = (node: tt.Node): void => {
		checkCancellation();
		if (isJSDocNodeKind(node.kind) || isTriviaKind(node.kind)) {
			return;
		}
		if (ts.isToken(node)) {
			const span = nodeSpan(node, file);
			if (span.start === span.end) {
				missingToken = true;
			} else if (span.start === name.start && span.end === name.end) {
				nameTokens++;
				parts.push([node.kind, null]);
			} else {
				parts.push([node.kind, node.getText(file)]);
			}
		} else {
			parts.push([node.kind, null]);
			node.getChildren(file).forEach(visit);
		}
	};
	visit(declaration);
	return nameTokens === 1 && !missingToken
		? JSON.stringify([entity.value.kind, entity.value.languageKind, parts])
		: undefined;
}

function touchesName(change: Span, name: Span): boolean {
	return change.start === change.end
		? name.start <= change.start && change.start <= name.end
		: change.start < name.end && name.start < change.end;
}

/**
 * Returns whether one change touches both the original and the modified name. The changes are ordered and do not
 * overlap, so a binary search finds the ones around the original name, and renaming many declarations does not check
 * every change for each of them.
 */
function isNameChanged(changes: readonly DiffTextChange[], originalName: Span, modifiedName: Span): boolean {
	for (let index = findFirstIndex(changes, change => change.original.end >= originalName.start); index < changes.length && changes[index].original.start <= originalName.end; index++) {
		if (touchesName(changes[index].original, originalName) && touchesName(changes[index].modified, modifiedName)) {
			return true;
		}
	}
	return false;
}

/**
 * Returns the original offset of a modified offset in unchanged text, or `undefined` if a change replaced the text at
 * the offset. A binary search finds the last change before the offset, which determines the distance between both.
 */
function toOriginalOffset(changes: readonly DiffTextChange[], offset: number): number | undefined {
	const index = findFirstIndex(changes, change => change.modified.end > offset);
	if (index < changes.length && changes[index].modified.start <= offset) {
		return undefined;
	}
	if (index === 0) {
		return offset;
	}
	const previous = changes[index - 1];
	return previous.original.end + offset - previous.modified.end;
}

function classify(tree: DiffTree, side: Side, source: Source, textChangeIndex: number, span: Span, checkCancellation: () => void): void {
	checkCancellation();
	const entity = tree[side];
	if (entity === undefined || span.start >= span.end) {
		return;
	}
	const counterpart = side === 'original' ? tree.modified : tree.original;
	// The doc comments of an added or deleted entity can be unchanged, as when a declaration replaces another one.
	if (entity !== source.root && entity.groupedSpans === undefined && counterpart === undefined && contains(span, { start: entity.header.start, end: entity.span.end })) {
		addCoverage(tree, side, source, textChangeIndex, span, StructuralDiffClassification.Declaration);
		return;
	}
	let cursor = span.start;
	const children = tree.childSpans[side];
	// A binary search skips the children before the span and the loop stops at the first child after it, so that
	// bulk edits do not visit every sibling for every change.
	for (let index = findFirstIndex(children, child => child.reach > span.start); index < children.length && children[index].span.start < span.end; index++) {
		const { child, span: childSpan } = children[index];
		const start = Math.max(cursor, childSpan.start);
		const end = Math.min(span.end, childSpan.end);
		if (start >= end) {
			continue;
		}
		addCoverage(tree, side, source, textChangeIndex, { start: cursor, end: start });
		classify(child, side, source, textChangeIndex, { start, end }, checkCancellation);
		cursor = end;
	}
	addCoverage(tree, side, source, textChangeIndex, { start: cursor, end: span.end });
}

function getChildSpans(children: readonly DiffTree[], side: Side): ChildSpan[] {
	const spans = children.flatMap(child => {
		const entity = child[side];
		return entity === undefined ? [] : (entity.groupedSpans ?? [entity.span]).map(span => ({ child, span }));
	}).sort((left, right) => left.span.start - right.span.start);
	let reach = 0;
	return spans.map(({ child, span }) => {
		reach = Math.max(reach, span.end);
		return { child, span, reach };
	});
}

function addCoverage(tree: DiffTree, side: Side, source: Source, textChangeIndex: number, span: Span, classification?: StructuralDiffClassification): void {
	if (span.start >= span.end) {
		return;
	}
	const entity = tree[side]!;
	const header = entity.header;
	// Only regions that overlap the span can split it, so the many gaps between the declarations of a new file stay cheap.
	const dependencies = getOverlappingSpans(source.dependencies, span);
	const implementation = getOverlappingSpans(entity.implementation, span);
	const tests = getOverlappingSpans(source.tests, span);
	const boundaries = new Set([span.start, span.end]);
	for (const region of [...dependencies, header, ...implementation, ...tests]) {
		if (region.start > span.start && region.start < span.end) {
			boundaries.add(region.start);
		}
		if (region.end > span.start && region.end < span.end) {
			boundaries.add(region.end);
		}
	}
	const offsets = [...boundaries].sort((left, right) => left - right);
	const inDependency = createContainmentCheck(dependencies);
	const inImplementation = createContainmentCheck(implementation);
	const inTest = createContainmentCheck(tests);
	const changes = side === 'original' ? tree.result.originalChanges : tree.result.modifiedChanges;
	for (let index = 0; index < offsets.length - 1; index++) {
		const part = { start: offsets[index], end: offsets[index + 1] };
		const kind = classification
			?? (inDependency(part) ? StructuralDiffClassification.Dependency
				: contains(header, part) ? StructuralDiffClassification.Header
					: inImplementation(part) ? StructuralDiffClassification.Implementation
						: StructuralDiffClassification.Other);
		const isTest = entity.isTest || inTest(part);
		const previous = changes[changes.length - 1];
		if (previous?.textChangeIndex === textChangeIndex && previous.classification === kind
			&& previous.tags.includes(StructuralDiffTag.Test) === isTest && previous.range.end === part.start) {
			changes[changes.length - 1] = { ...previous, range: { start: previous.range.start, end: part.end } };
		} else {
			changes.push({ textChangeIndex, range: part, classification: kind, tags: isTest ? [StructuralDiffTag.Test] : [] });
		}
	}
}

function nodeSpan(node: tt.Node, file: tt.SourceFile): Span {
	return { start: node.getStart(file), end: node.getEnd() };
}

function nodeSpanWithDocComments(node: tt.Node, file: tt.SourceFile): Span {
	return { start: node.getStart(file, true), end: node.getEnd() };
}

/**
 * Returns the parts of a span that the given spans, which are sorted, do not overlap and lie within the span, leave out.
 */
function subtractSpans(span: Span, spans: readonly Span[]): Span[] {
	const parts: Span[] = [];
	let start = span.start;
	for (const covered of spans) {
		if (start < covered.start) {
			parts.push({ start, end: covered.start });
		}
		start = Math.max(start, covered.end);
	}
	if (start < span.end) {
		parts.push({ start, end: span.end });
	}
	return parts;
}

function contains(container: Span, contained: Span): boolean {
	return container.start <= contained.start && container.end >= contained.end;
}

/**
 * Returns sorted spans that cover the same offsets as the given spans, merging the ones that overlap.
 */
function toSortedSpans(spans: readonly Span[]): SortedSpans {
	const result: Span[] = [];
	for (const span of [...spans].sort((left, right) => left.start - right.start)) {
		const last = result[result.length - 1];
		if (last !== undefined && span.start <= last.end) {
			result[result.length - 1] = { start: last.start, end: Math.max(last.end, span.end) };
		} else {
			result.push(span);
		}
	}
	return result;
}

function getOverlappingSpans(spans: SortedSpans, span: Span): SortedSpans {
	const start = findFirstIndex(spans, candidate => candidate.end > span.start);
	return spans.slice(start, findFirstIndex(spans, candidate => candidate.start >= span.end, start));
}

/**
 * Returns a check whether a part lies within one of the spans. Parts must be checked in document order, which lets
 * each check continue where the previous one stopped.
 */
function createContainmentCheck(spans: SortedSpans): (part: Span) => boolean {
	let index = 0;
	return part => {
		while (index < spans.length && spans[index].end <= part.start) {
			index++;
		}
		return index < spans.length && contains(spans[index], part);
	};
}

/**
 * Returns the index of the first element that satisfies the predicate, or the array length if none does. The predicate
 * must hold for all elements after that one. This is the plugin's copy of `findFirstIdxMonotonousOrArrLen`, which the
 * TS7 implementation imports from `util/vs`.
 */
function findFirstIndex<T>(array: readonly T[], predicate: (element: T) => boolean, low = 0): number {
	let high = array.length;
	while (low < high) {
		const middle = Math.floor((low + high) / 2);
		if (predicate(array[middle])) {
			high = middle;
		} else {
			low = middle + 1;
		}
	}
	return low;
}

function isJSDocNodeKind(kind: tt.SyntaxKind): boolean {
	return kind >= ts.SyntaxKind.FirstJSDocNode && kind <= ts.SyntaxKind.LastJSDocNode;
}

function isTriviaKind(kind: tt.SyntaxKind): boolean {
	return kind >= ts.SyntaxKind.FirstTriviaToken && kind <= ts.SyntaxKind.LastTriviaToken;
}

type TestKind = 'suite' | 'test';

/**
 * The hooks of Playwright, which can have a title like a test, as in `test.beforeEach('title', () => {})`.
 */
const hookNames: ReadonlySet<string> = new Set(['beforeEach', 'afterEach', 'beforeAll', 'afterAll']);

/**
 * Returns an expression without the parentheses, type assertions and `await` or `void` operators around it, such as
 * the call in `await load()`.
 */
function unwrapExpression(node: tt.Expression): tt.Expression {
	let expression = tss.Nodes.skipOuterExpressions(node);
	while (ts.isAwaitExpression(expression) || ts.isVoidExpression(expression)) {
		expression = tss.Nodes.skipOuterExpressions(expression.expression);
	}
	return expression;
}

/**
 * Returns the item of a statement that registers a suite or a test, such as `test('title', () => {})`, which is named
 * by its title, or of such a registration that is the expression body of a suite, as in
 * `suite('title', () => test('title', () => {}))`. A suite lists its tests and suites as children.
 */
function getTestInfo(node: tt.ExpressionStatement | tt.Expression, file: tt.SourceFile): EntityInfo | undefined {
	const test = getTestCall(unwrapExpression(ts.isExpressionStatement(node) ? node.expression : node));
	if (test === undefined) {
		return undefined;
	}
	const title = test.call.arguments[0];
	const isSuite = test.kind === 'suite';
	const body = test.callback.body;
	const nested = isSuite && !ts.isBlock(body) ? getTestInfo(body, file) : undefined;
	return {
		name: getTitle(title, file),
		nameNode: title,
		rangeNode: node,
		kind: isSuite ? StructuralDiffSymbolKind.Class : StructuralDiffSymbolKind.Method,
		languageKind: test.kind,
		body: [body, ...test.trailingArguments],
		statements: isSuite && ts.isBlock(body) ? body.statements : undefined,
		nested: nested === undefined ? undefined : [nested],
		isSuite,
		isTest: true,
		isAnonymous: true,
	};
}

interface TestCall {
	readonly call: tt.CallExpression;
	readonly kind: TestKind;
	readonly callback: tt.ArrowFunction | tt.FunctionExpression;
	/** The arguments after the callback, such as a timeout, and those of the calls chained to the registration, in document order. */
	readonly trailingArguments: readonly tt.Expression[];
}

/**
 * Returns the call that registers a suite or a test. It has a title and a callback, as in `test('title', () => {})`,
 * unlike a hook such as `test.beforeEach(() => {})`, and other calls can be chained to it, as in
 * `test('title', () => {}).timeout(1000)`. It is the innermost call of that form, since a chained call can have that
 * form as well, as in `test('title', () => {}).then(undefined, onRejected)`, whereas the first call of a variant such as
 * `test.each(cases)('title', () => {})` does not.
 */
function getTestCall(expression: tt.Expression): TestCall | undefined {
	const calls: tt.CallExpression[] = [];
	let node = expression;
	while (ts.isCallExpression(node) || ts.isPropertyAccessExpression(node)) {
		if (ts.isCallExpression(node)) {
			calls.push(node);
		}
		node = tss.Nodes.skipOuterExpressions(node.expression);
	}
	for (let index = calls.length - 1; index >= 0; index--) {
		const call = calls[index];
		const kind = getTestKind(call.expression);
		const [title, ...rest] = call.arguments;
		const callback = rest.find(isFunctionValue);
		if (kind !== undefined && kind !== 'hook' && title !== undefined && !isFunctionValue(title) && callback !== undefined) {
			const chained = calls.slice(0, index).reverse().flatMap(outer => outer.arguments);
			return { call, kind, callback, trailingArguments: [...rest.slice(rest.indexOf(callback) + 1), ...chained] };
		}
	}
	return undefined;
}

/**
 * Returns whether a function registers suites or tests, such as `suite`, `test.skip`, Playwright's `test.describe` or a
 * wrapper of `suite` such as `flakySuite`, or whether it is one of Playwright's hooks.
 */
function getTestKind(node: tt.Node): TestKind | 'hook' | undefined {
	if (ts.isIdentifier(node)) {
		return node.text === 'describe' || node.text === 'suite' || /[a-z\d]Suite$/.test(node.text) ? 'suite'
			: node.text === 'test' || node.text === 'it' ? 'test' : undefined;
	}
	if (ts.isPropertyAccessExpression(node)) {
		const kind = getTestKind(node.expression);
		// Variants such as `test.describe.only` register suites as well.
		return kind === undefined ? undefined : node.name.text === 'describe' ? 'suite' : hookNames.has(node.name.text) ? 'hook' : kind;
	}
	if (ts.isCallExpression(node) || ts.isParenthesizedExpression(node)) {
		return getTestKind(node.expression);
	}
	// A condition can select a variant, as in `(isWindows ? test.skip : test)('title', () => {})`.
	if (ts.isConditionalExpression(node)) {
		return getTestKind(node.whenTrue) ?? getTestKind(node.whenFalse);
	}
	return undefined;
}

/**
 * Returns the title of a test, which is the value of a string, the text of a template without its backticks, or the
 * code of another expression.
 */
function getTitle(node: tt.Expression, file: tt.SourceFile): string {
	return toName(ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) ? node.text
		: ts.isTemplateExpression(node) ? node.getText(file).slice(1, -1) : node.getText(file));
}

/**
 * Returns the spans of test callbacks, so that changes in tests are tagged also where tests are not items, such as in a
 * function that defines tests.
 */
function collectTestSpans(file: tt.SourceFile, checkCancellation: () => void): SortedSpans {
	const tests: Span[] = [];
	const visit = (node: tt.Node): void => {
		checkCancellation();
		if (ts.isCallExpression(node) && getTestKind(node.expression) !== undefined) {
			for (const argument of node.arguments) {
				if (isFunctionValue(argument)) {
					tests.push(nodeSpan(argument, file));
				}
			}
		}
		ts.forEachChild(node, visit);
	};
	ts.forEachChild(file, visit);
	// Test callbacks can be nested, but the classification only asks whether text lies in any of them.
	return toSortedSpans(tests);
}

function isTestFile(fileName: string): boolean {
	const normalized = fileName.replace(/\\/g, '/');
	const name = normalized.slice(normalized.lastIndexOf('/') + 1);
	return /(?:^|\/)(?:test|tests|__tests__)(?:\/|$)/i.test(normalized)
		|| /(?:^|[._-])(?:test|spec)(?=\.[^.]+$)/i.test(name)
		|| /^(?:test|spec)[._-]/i.test(name);
}

function getBaseFileName(fileName: string): string {
	return fileName.substring(Math.max(fileName.lastIndexOf('/'), fileName.lastIndexOf('\\')) + 1);
}
