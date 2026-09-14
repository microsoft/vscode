/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as ts from '@typescript/native/unstable/ast';

import type * as protocol from '../../common/serverProtocol';

type Node = ts.Node;
type SourceFile = ts.SourceFile;
type MetricValues = Readonly<Record<string, protocol.TypeScriptMetricValue>>;

interface MetricComputation {
	compute(entity: Node, sourceFile: SourceFile): MetricValues;
	aggregate?(current: MetricValues, incoming: MetricValues): MetricValues;
}

interface CollectedMetricEntity {
	readonly kind: string;
	readonly path: readonly string[];
	readonly range: protocol.Range;
	readonly metricParts: Array<MetricValues | undefined>;
}

interface MetricTarget {
	readonly kind: string;
	readonly path: readonly string[];
	readonly range: protocol.Range;
	entity?: CollectedMetricEntity;
}

class TypeScriptMetricsComputer {
	private readonly computations: readonly MetricComputation[] = [
		new ComplexityMetricComputation(),
		new RuntimeComplexityMetricComputation(),
	];

	compute(sourceFile: SourceFile): protocol.TypeScriptMetricsResult {
		const sourceEntity = MetricsAst.getEntity(sourceFile, sourceFile);
		if (sourceEntity === undefined) {
			throw new Error('The TypeScript metrics implementation did not identify the source file entity');
		}

		const collected: CollectedMetricEntity[] = [];
		const sourceTarget: MetricTarget = {
			kind: sourceEntity.kind,
			path: [],
			range: MetricsAst.getRange(sourceFile, sourceFile),
		};
		this.addMetrics(sourceTarget, this.computeMetricParts(sourceFile, sourceFile), collected);
		sourceFile.forEachChild(child => this.collectEntities(child, sourceFile, [], sourceTarget, collected));
		return {
			entities: collected.map(entity => ({
				kind: entity.kind,
				path: entity.path.slice(),
				range: entity.range,
				metrics: this.mergeMetricParts(entity.metricParts),
			})),
		};
	}

	private collectEntities(
		node: Node,
		sourceFile: SourceFile,
		parentPath: readonly string[],
		rollupTarget: MetricTarget,
		result: CollectedMetricEntity[],
	): void {
		const entity = MetricsAst.getEntity(node, sourceFile);
		const namedContainer = entity?.pathSegment === undefined ? MetricsAst.getNamedContainer(node, sourceFile) : entity;
		let childPath = parentPath;
		let childRollupTarget = rollupTarget;
		if (namedContainer?.pathSegment !== undefined) {
			childPath = [...parentPath, namedContainer.pathSegment];
			childRollupTarget = {
				kind: namedContainer.kind,
				path: childPath,
				range: MetricsAst.getRange(node, sourceFile),
			};
		}

		if (entity !== undefined) {
			const metricParts = this.computeMetricParts(node, sourceFile);
			this.addMetrics(entity.pathSegment === undefined ? rollupTarget : childRollupTarget, metricParts, result);
		}
		node.forEachChild(child => this.collectEntities(child, sourceFile, childPath, childRollupTarget, result));
	}

	private computeMetricParts(entity: Node, sourceFile: SourceFile): readonly MetricValues[] {
		return this.computations.map(computation => computation.compute(entity, sourceFile));
	}

	private addMetrics(target: MetricTarget, incomingParts: readonly MetricValues[], result: CollectedMetricEntity[]): void {
		let entity = target.entity;
		if (entity === undefined) {
			entity = {
				kind: target.kind,
				path: target.path,
				range: target.range,
				metricParts: new Array(this.computations.length),
			};
			target.entity = entity;
			result.push(entity);
		}

		for (let index = 0; index < incomingParts.length; index++) {
			const incoming = incomingParts[index];
			const current = entity.metricParts[index];
			if (current === undefined) {
				entity.metricParts[index] = incoming;
				continue;
			}
			const computation = this.computations[index];
			if (computation.aggregate === undefined) {
				const duplicate = Object.keys(incoming).find(name => Object.hasOwn(current, name));
				if (duplicate !== undefined) {
					throw new Error(`TypeScript metric '${duplicate}' does not define how rolled-up values are aggregated`);
				}
				entity.metricParts[index] = { ...current, ...incoming };
			} else {
				entity.metricParts[index] = computation.aggregate(current, incoming);
			}
		}
	}

	private mergeMetricParts(metricParts: ReadonlyArray<MetricValues | undefined>): protocol.TypeScriptMetrics {
		const metrics: Record<string, protocol.TypeScriptMetricValue> = {};
		for (const part of metricParts) {
			if (part === undefined) {
				continue;
			}
			for (const [name, value] of Object.entries(part)) {
				if (Object.hasOwn(metrics, name)) {
					throw new Error(`Duplicate TypeScript metric '${name}'`);
				}
				metrics[name] = value;
			}
		}

		const cognitiveComplexity = metrics.cognitiveComplexity;
		const cyclomaticComplexity = metrics.cyclomaticComplexity;
		const runtimeComplexity = metrics.runtimeComplexity;
		if (typeof cognitiveComplexity !== 'number' || typeof cyclomaticComplexity !== 'number' || typeof runtimeComplexity !== 'string') {
			throw new Error('The TypeScript metric computations did not produce all required metrics');
		}
		return { ...metrics, cognitiveComplexity, cyclomaticComplexity, runtimeComplexity };
	}
}

interface ComplexityTraversalContext {
	readonly logicalOperator: number | undefined;
	readonly nesting: number;
}

interface ComplexityState {
	cognitiveComplexity: number;
	cyclomaticComplexity: number;
}

class ComplexityMetricComputation implements MetricComputation {
	/**
	 * Cyclomatic complexity starts at one and counts independent control-flow paths.
	 * Cognitive complexity counts control-flow structures with their nesting depth,
	 * while a contiguous sequence of the same logical operator counts once.
	 */
	compute(entity: Node, sourceFile: SourceFile): MetricValues {
		const state: ComplexityState = {
			cognitiveComplexity: 0,
			cyclomaticComplexity: 1,
		};
		this.visit(entity, sourceFile, state, { logicalOperator: undefined, nesting: 0 }, true);
		return {
			cognitiveComplexity: state.cognitiveComplexity,
			cyclomaticComplexity: state.cyclomaticComplexity,
		};
	}

	aggregate(current: MetricValues, incoming: MetricValues): MetricValues {
		return {
			cognitiveComplexity: this.getMetric(current, 'cognitiveComplexity') + this.getMetric(incoming, 'cognitiveComplexity'),
			cyclomaticComplexity: this.getMetric(current, 'cyclomaticComplexity') + this.getMetric(incoming, 'cyclomaticComplexity'),
		};
	}

	private visit(node: Node, sourceFile: SourceFile, state: ComplexityState, context: ComplexityTraversalContext, isRoot: boolean): void {
		if (!isRoot && MetricsAst.getEntity(node, sourceFile) !== undefined) {
			return;
		}

		if (ts.isIfStatement(node)) {
			state.cognitiveComplexity += MetricsAst.isElseIf(node) ? 1 : 1 + context.nesting;
			state.cyclomaticComplexity++;
			if (node.elseStatement !== undefined && !ts.isIfStatement(node.elseStatement)) {
				state.cognitiveComplexity++;
			}
		} else if (MetricsAst.isLoop(node) || ts.isCatchClause(node) || ts.isConditionalExpression(node)) {
			state.cognitiveComplexity += 1 + context.nesting;
			state.cyclomaticComplexity++;
		} else if (ts.isSwitchStatement(node)) {
			state.cognitiveComplexity += 1 + context.nesting;
		} else if (ts.isCaseClause(node)) {
			state.cyclomaticComplexity++;
		} else if ((ts.isBreakStatement(node) || ts.isContinueStatement(node)) && node.label !== undefined) {
			state.cognitiveComplexity++;
		}

		const logicalOperator = MetricsAst.getLogicalOperator(node);
		if (logicalOperator !== undefined) {
			state.cyclomaticComplexity++;
			if (logicalOperator !== context.logicalOperator) {
				state.cognitiveComplexity++;
			}
		}
		if (MetricsAst.isOptionalChain(node)) {
			state.cyclomaticComplexity++;
		}

		node.forEachChild(child => {
			this.visit(child, sourceFile, state, {
				logicalOperator,
				nesting: context.nesting + (MetricsAst.isNestingChild(node, child) ? 1 : 0),
			}, false);
		});
	}

	private getMetric(metrics: MetricValues, name: string): number {
		const value = metrics[name];
		if (typeof value !== 'number') {
			throw new Error(`TypeScript metric '${name}' must be numeric to aggregate it`);
		}
		return value;
	}
}

type RuntimeOrder = readonly [polynomial: number, logarithmic: number];

/**
 * Estimates local Big-O complexity from loop structure. Sequential work and branches use
 * the maximum order, nested loops multiply, and unknown calls are constant time.
 */
class RuntimeComplexityMetricComputation implements MetricComputation {
	compute(entity: Node, sourceFile: SourceFile): MetricValues {
		return { runtimeComplexity: this.format(this.computeNode(entity, sourceFile, true)) };
	}

	aggregate(current: MetricValues, incoming: MetricValues): MetricValues {
		const currentOrder = this.parse(this.getMetric(current));
		const incomingOrder = this.parse(this.getMetric(incoming));
		return { runtimeComplexity: this.format(this.max(currentOrder, incomingOrder)) };
	}

	private computeNode(node: Node, sourceFile: SourceFile, isRoot: boolean): RuntimeOrder {
		if (!isRoot && MetricsAst.getEntity(node, sourceFile) !== undefined) {
			return [0, 0];
		}

		let childOrder: RuntimeOrder = [0, 0];
		node.forEachChild(child => {
			childOrder = this.max(childOrder, this.computeNode(child, sourceFile, false));
		});
		return MetricsAst.isLoop(node)
			? this.multiply(this.getLoopFactor(node, sourceFile), childOrder)
			: childOrder;
	}

	private getLoopFactor(node: Node, sourceFile: SourceFile): RuntimeOrder {
		if (ts.isForInStatement(node) || ts.isForOfStatement(node)) {
			return [1, 0];
		}

		let condition: Node | undefined;
		let updateRoot: Node | undefined;
		if (ts.isForStatement(node)) {
			condition = node.condition;
			updateRoot = node.incrementor;
		} else if (ts.isWhileStatement(node) || ts.isDoStatement(node)) {
			condition = node.expression;
			updateRoot = node.statement;
		}

		if (condition === undefined || updateRoot === undefined) {
			return [1, 0];
		}
		const controlExpressions = this.getControlExpressions(condition, sourceFile);
		return this.containsLogarithmicUpdate(updateRoot, sourceFile, controlExpressions, true) ? [0, 1] : [1, 0];
	}

	private getControlExpressions(node: Node, sourceFile: SourceFile): ReadonlySet<string> {
		const result = new Set<string>();
		const visit = (current: Node): void => {
			if (ts.isIdentifier(current) || ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current)) {
				result.add(current.getText(sourceFile));
			}
			current.forEachChild(visit);
		};
		visit(node);
		return result;
	}

	private containsLogarithmicUpdate(node: Node, sourceFile: SourceFile, controlExpressions: ReadonlySet<string>, isRoot: boolean): boolean {
		if (!isRoot && MetricsAst.getEntity(node, sourceFile) !== undefined) {
			return false;
		}
		if (ts.isBinaryExpression(node) && this.isLogarithmicUpdate(node, sourceFile, controlExpressions)) {
			return true;
		}

		let result = false;
		node.forEachChild(child => {
			if (!result) {
				result = this.containsLogarithmicUpdate(child, sourceFile, controlExpressions, false);
			}
		});
		return result;
	}

	private isLogarithmicUpdate(node: ts.BinaryExpression, sourceFile: SourceFile, controlExpressions: ReadonlySet<string>): boolean {
		const target = node.left.getText(sourceFile);
		if (!controlExpressions.has(target)) {
			return false;
		}
		if (this.isLogarithmicCompoundOperator(node.operatorToken.kind)) {
			return true;
		}
		if (node.operatorToken.kind !== ts.SyntaxKind.EqualsToken || !ts.isBinaryExpression(node.right) || !this.isLogarithmicBinaryOperator(node.right.operatorToken.kind)) {
			return false;
		}
		return node.right.left.getText(sourceFile) === target || node.right.right.getText(sourceFile) === target;
	}

	private isLogarithmicCompoundOperator(kind: number): boolean {
		return kind === ts.SyntaxKind.AsteriskEqualsToken
			|| kind === ts.SyntaxKind.SlashEqualsToken
			|| kind === ts.SyntaxKind.LessThanLessThanEqualsToken
			|| kind === ts.SyntaxKind.GreaterThanGreaterThanEqualsToken
			|| kind === ts.SyntaxKind.GreaterThanGreaterThanGreaterThanEqualsToken;
	}

	private isLogarithmicBinaryOperator(kind: number): boolean {
		return kind === ts.SyntaxKind.AsteriskToken
			|| kind === ts.SyntaxKind.SlashToken
			|| kind === ts.SyntaxKind.LessThanLessThanToken
			|| kind === ts.SyntaxKind.GreaterThanGreaterThanToken
			|| kind === ts.SyntaxKind.GreaterThanGreaterThanGreaterThanToken;
	}

	private multiply(left: RuntimeOrder, right: RuntimeOrder): RuntimeOrder {
		return [left[0] + right[0], left[1] + right[1]];
	}

	private max(left: RuntimeOrder, right: RuntimeOrder): RuntimeOrder {
		if (left[0] !== right[0]) {
			return left[0] > right[0] ? left : right;
		}
		return left[1] >= right[1] ? left : right;
	}

	private format(order: RuntimeOrder): string {
		const factors: string[] = [];
		if (order[0] > 0) {
			factors.push(order[0] === 1 ? 'n' : `n^${order[0]}`);
		}
		if (order[1] > 0) {
			factors.push(order[1] === 1 ? 'log n' : `log^${order[1]} n`);
		}
		return `O(${factors.length === 0 ? '1' : factors.join(' ')})`;
	}

	private parse(value: string): RuntimeOrder {
		if (!value.startsWith('O(') || !value.endsWith(')')) {
			throw new Error(`Invalid runtime complexity '${value}'`);
		}
		let body = value.slice(2, -1);
		if (body === '1') {
			return [0, 0];
		}

		let logarithmic = 0;
		const logarithmicMatch = /log(?:\^([1-9]\d*))? n$/.exec(body);
		if (logarithmicMatch !== null) {
			logarithmic = Number(logarithmicMatch[1] ?? '1');
			body = body.slice(0, logarithmicMatch.index).trim();
		}

		let polynomial = 0;
		if (body === 'n') {
			polynomial = 1;
		} else if (body.length > 0) {
			const polynomialMatch = /^n\^([1-9]\d*)$/.exec(body);
			if (polynomialMatch === null) {
				throw new Error(`Invalid runtime complexity '${value}'`);
			}
			polynomial = Number(polynomialMatch[1]);
		}
		if (polynomial === 0 && logarithmic === 0) {
			throw new Error(`Invalid runtime complexity '${value}'`);
		}
		return [polynomial, logarithmic];
	}

	private getMetric(metrics: MetricValues): string {
		const value = metrics.runtimeComplexity;
		if (typeof value !== 'string') {
			throw new Error(`TypeScript metric 'runtimeComplexity' must be a string to aggregate it`);
		}
		return value;
	}
}

namespace MetricsAst {
	interface MetricNodeInfo {
		readonly kind: string;
		readonly pathSegment?: string;
	}

	export function getEntity(node: Node, sourceFile: SourceFile): MetricNodeInfo | undefined {
		if (ts.isSourceFile(node)) {
			return { kind: 'sourceFile' };
		}
		if (ts.isFunctionDeclaration(node)) {
			return node.body === undefined ? undefined : { kind: 'function', pathSegment: node.name?.getText(sourceFile) };
		}
		if (ts.isFunctionExpression(node)) {
			return { kind: 'function', pathSegment: node.name?.getText(sourceFile) ?? getAssignedEntityName(node, sourceFile) };
		}
		if (ts.isArrowFunction(node)) {
			return { kind: 'arrow-function', pathSegment: getAssignedEntityName(node, sourceFile) };
		}
		if (ts.isConstructorDeclaration(node)) {
			return node.body === undefined ? undefined : { kind: 'constructor', pathSegment: 'constructor' };
		}
		if (ts.isMethodDeclaration(node)) {
			return node.body === undefined ? undefined : { kind: 'method', pathSegment: node.name.getText(sourceFile) };
		}
		if (ts.isGetAccessorDeclaration(node)) {
			return node.body === undefined ? undefined : { kind: 'getter', pathSegment: node.name.getText(sourceFile) };
		}
		if (ts.isSetAccessorDeclaration(node)) {
			return node.body === undefined ? undefined : { kind: 'setter', pathSegment: node.name.getText(sourceFile) };
		}
		if (ts.isClassStaticBlockDeclaration(node)) {
			return { kind: 'static-block' };
		}
		return undefined;
	}

	export function getNamedContainer(node: Node, sourceFile: SourceFile): MetricNodeInfo | undefined {
		if (ts.isClassDeclaration(node)) {
			return node.name === undefined ? undefined : { kind: 'class', pathSegment: node.name.getText(sourceFile) };
		}
		if (ts.isClassExpression(node)) {
			const pathSegment = node.name?.getText(sourceFile) ?? getAssignedEntityName(node, sourceFile);
			return pathSegment === undefined ? undefined : { kind: 'class', pathSegment };
		}
		if (ts.isModuleDeclaration(node)) {
			return { kind: 'module', pathSegment: node.name.text };
		}
		if (ts.isObjectLiteralExpression(node)) {
			const pathSegment = getAssignedEntityName(node, sourceFile);
			return pathSegment === undefined ? undefined : { kind: 'object-literal', pathSegment };
		}
		return undefined;
	}

	export function getRange(node: Node, sourceFile: SourceFile): protocol.Range {
		return {
			start: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)),
			end: sourceFile.getLineAndCharacterOfPosition(node.getEnd()),
		};
	}

	export function getLogicalOperator(node: Node): number | undefined {
		if (!ts.isBinaryExpression(node)) {
			return undefined;
		}
		switch (node.operatorToken.kind) {
			case ts.SyntaxKind.AmpersandAmpersandToken:
			case ts.SyntaxKind.AmpersandAmpersandEqualsToken:
			case ts.SyntaxKind.BarBarToken:
			case ts.SyntaxKind.BarBarEqualsToken:
			case ts.SyntaxKind.QuestionQuestionToken:
			case ts.SyntaxKind.QuestionQuestionEqualsToken:
				return node.operatorToken.kind;
			default:
				return undefined;
		}
	}

	export function isElseIf(node: ts.IfStatement): boolean {
		return ts.isIfStatement(node.parent) && node.parent.elseStatement === node;
	}

	export function isLoop(node: Node): boolean {
		return ts.isDoStatement(node)
			|| ts.isWhileStatement(node)
			|| ts.isForStatement(node)
			|| ts.isForInStatement(node)
			|| ts.isForOfStatement(node);
	}

	export function isNestingChild(node: Node, child: Node): boolean {
		if (ts.isIfStatement(node)) {
			return node.thenStatement === child || (node.elseStatement === child && !ts.isIfStatement(child));
		}
		if (ts.isDoStatement(node) || ts.isWhileStatement(node) || ts.isForStatement(node) || ts.isForInStatement(node) || ts.isForOfStatement(node)) {
			return node.statement === child;
		}
		if (ts.isSwitchStatement(node)) {
			return node.caseBlock === child;
		}
		if (ts.isCatchClause(node)) {
			return node.block === child;
		}
		if (ts.isConditionalExpression(node)) {
			return node.whenTrue === child || node.whenFalse === child;
		}
		return false;
	}

	export function isOptionalChain(node: Node): boolean {
		return (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node) || ts.isCallExpression(node))
			&& node.questionDotToken !== undefined;
	}

	function getAssignedEntityName(node: Node, sourceFile: SourceFile): string | undefined {
		const outerExpression = getOutermostExpression(node);
		const parent = outerExpression.parent;
		if (!((ts.isVariableDeclaration(parent) || ts.isPropertyDeclaration(parent) || ts.isPropertyAssignment(parent)) && parent.initializer === outerExpression)) {
			return undefined;
		}
		if (ts.isVariableDeclaration(parent) && !ts.isIdentifier(parent.name)) {
			return undefined;
		}
		return parent.name.getText(sourceFile);
	}

	function getOutermostExpression(node: Node): Node {
		let current = node;
		while (ts.isOuterExpression(current.parent) && current.parent.expression === current) {
			current = current.parent;
		}
		return current;
	}
}

const computer = new TypeScriptMetricsComputer();

export function computeTypeScriptMetrics(sourceFile: SourceFile): protocol.TypeScriptMetricsResult {
	return computer.compute(sourceFile);
}
