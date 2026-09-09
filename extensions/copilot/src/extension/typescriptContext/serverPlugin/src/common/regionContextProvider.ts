/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import type tt from 'typescript/lib/tsserverlibrary';
import TS from './typescript';
const ts = TS();

import { Region, type LineRange, type Range, type RegionResult } from './protocol';
import tss from './typescripts';

type StructuralEntity = { kind: string; name?: string; rangeNode: tt.Node | [tt.Node, tt.Node]; includeJsDoc?: boolean; continueWith?: tt.Node };

type AssignedStructuralNode = tt.VariableDeclaration | tt.PropertyDeclaration | tt.PropertyAssignment;

type MemberInfo = {
	items: readonly tt.Node[];
	kind: string;
	memberKind: string;
	name?: string;
};

type ScopeInfo = {
	regions: Region[];
	path: number[];
};

export class RegionContextProvider {

	public getRegions(sourceFile: tt.SourceFile, ranges: readonly Range[], requested?: LineRange | undefined): RegionResult | undefined {
		if (ranges.length === 0) {
			return undefined;
		}

		if (ranges.length === 1) {
			const scope = this.findEnclosingScopes(sourceFile, ranges[0].start.line, ranges[0].start.character, requested);
			return scope === undefined ? undefined : {
				regions: scope.regions,
				paths: { smallest: scope.path }
			};
		}

		let smallest: { path: number[]; region: Region } | undefined;
		let largest: { path: number[]; region: Region } | undefined;
		const containersList: Region[][] = [];
		for (const range of ranges) {
			const scope = this.findEnclosingScopes(sourceFile, range.start.line, range.start.character, requested);
			if (scope !== undefined && scope.regions.length > 0) {
				const { regions, path } = scope;
				const region = regions[0];
				if (smallest === undefined || Region.getSpan(region) < Region.getSpan(smallest.region)) {
					smallest = { region, path };
				}
				if (largest === undefined || Region.getSpan(region) > Region.getSpan(largest.region)) {
					largest = { region, path };
				}
				containersList.push(regions.reverse());
			}
		}
		if (containersList.length === 0) {
			return undefined;
		}

		const longestContainers = containersList.reduce((longest, containers) => containers.length > longest.length ? containers : longest);
		const commonContainers = longestContainers.slice();
		for (const containers of containersList) {
			if (containers === longestContainers) {
				continue;
			}
			let commonLength = 0;
			while (commonLength < commonContainers.length && commonLength < containers.length) {
				const commonContainer = commonContainers[commonLength];
				const container = containers[commonLength];
				if (commonContainer.kind !== container.kind
					|| commonContainer.name !== container.name
					|| commonContainer.range.start !== container.range.start
					|| commonContainer.range.end !== container.range.end) {
					break;
				}
				commonLength++;
			}
			commonContainers.length = commonLength;
		}

		const tailContainers = containersList.map(containers => containers[containers.length - 1]);
		if (tailContainers.length > 0) {
			const container: Region = {
				kind: 'merged',
				range: {
					start: Math.min(...tailContainers.map(container => container.range.start)),
					end: Math.max(...tailContainers.map(container => container.range.end))
				}
			};
			const lastContainer = commonContainers[commonContainers.length - 1];
			if (lastContainer !== undefined && container.range.end - container.range.start < lastContainer.range.end - lastContainer.range.start) {
				commonContainers.push(container);
			}
		}

		return {
			regions: commonContainers.reverse(),
			paths: { smallest: smallest?.path ?? [], largest: largest?.path }
		};
	}

	private findEnclosingScopes(sourceFile: tt.SourceFile, line: number, column: number, requested?: LineRange | undefined): ScopeInfo | undefined {
		const position = sourceFile.getPositionOfLineAndCharacter(line, column);
		const tokenInfo = tss.getRelevantTokens(sourceFile, position);
		const node = tokenInfo.touching ?? tokenInfo.token;
		if (node === undefined) {
			return undefined;
		}

		const result: Region[] = [];
		for (let current: tt.Node | undefined = node; current; current = current.parent) {
			if (ts.isSourceFile(current)) {
				const endLine = sourceFile.getLineAndCharacterOfPosition(sourceFile.getEnd()).line;
				result.push({
					kind: 'sourceFile',
					name: this.getBaseFileName(sourceFile.fileName),
					range: { start: 0, end: endLine }
				});
				break;
			}

			const structuralEntity = this.getStructuralEntity(sourceFile, current, requested);
			if (structuralEntity !== undefined) {
				const { kind, name, rangeNode, includeJsDoc, continueWith } = structuralEntity;
				const rangeStartNode = Array.isArray(rangeNode) ? rangeNode[0] : rangeNode;
				const rangeEndNode = Array.isArray(rangeNode) ? rangeNode[1] : rangeNode;
				result.push({
					kind,
					name,
					range: {
						start: sourceFile.getLineAndCharacterOfPosition(rangeStartNode.getStart(sourceFile, includeJsDoc)).line,
						end: sourceFile.getLineAndCharacterOfPosition(rangeEndNode.getEnd()).line
					}
				});
				current = continueWith ?? current;
			}
		}
		return result.length > 0 ? { regions: result, path: tss.StableSyntaxKinds.getPath(node) } : undefined;
	}

	private getStructuralEntity(sourceFile: tt.SourceFile, node: tt.Node, requested?: LineRange | undefined): StructuralEntity | undefined {
		const parent = node.parent;
		let name: string | undefined;
		switch (node.kind) {
			case ts.SyntaxKind.JSDoc: {
				const parentEntity = this.getStructuralEntity(sourceFile, parent, requested);
				if (parentEntity !== undefined) {
					parentEntity.includeJsDoc = true;
					parentEntity.continueWith ??= parent;
				}
				return parentEntity;
			}
			case ts.SyntaxKind.ImportDeclaration:
				name = (node as tt.ImportDeclaration).moduleSpecifier.getText();
				return { kind: 'import', name, rangeNode: node };
			case ts.SyntaxKind.ExportDeclaration:
				name = (node as tt.ExportDeclaration).moduleSpecifier?.getText();
				return { kind: 'export', name, rangeNode: node };
			case ts.SyntaxKind.FunctionDeclaration:
				name = (node as tt.FunctionDeclaration).name?.text;
				return { kind: 'function', name, rangeNode: node };
			case ts.SyntaxKind.FunctionExpression:
				name = (node as tt.FunctionExpression).name?.text;
				return this.getExpressionStructuralEntity(node, 'function', name, true);
			case ts.SyntaxKind.Constructor:
				return { kind: 'constructor', name: 'constructor', rangeNode: node };
			case ts.SyntaxKind.MethodDeclaration:
				name = (node as tt.MethodDeclaration).name.getText();
				return { kind: 'method', name, rangeNode: node };
			case ts.SyntaxKind.MethodSignature:
				name = (node as tt.MethodSignature).name.getText();
				return { kind: 'method', name, rangeNode: node };
			case ts.SyntaxKind.CallSignature:
				return { kind: 'call-signature', rangeNode: node };
			case ts.SyntaxKind.ConstructSignature:
				return { kind: 'construct-signature', rangeNode: node };
			case ts.SyntaxKind.IndexSignature:
				return { kind: 'index-signature', rangeNode: node };
			case ts.SyntaxKind.ArrowFunction:
				return this.getExpressionStructuralEntity(node, 'arrow-function', undefined, true);
			case ts.SyntaxKind.VariableDeclaration:
				return this.getAssignedStructuralEntity(node as tt.VariableDeclaration);
			case ts.SyntaxKind.PropertyDeclaration:
				return this.handleProperty(sourceFile, node as tt.PropertyDeclaration, requested);
			case ts.SyntaxKind.PropertyAssignment:
				return this.handleProperty(sourceFile, node as tt.PropertyAssignment, requested);
			case ts.SyntaxKind.PropertySignature:
				return this.handleProperty(sourceFile, node as tt.PropertySignature, requested);
			case ts.SyntaxKind.ShorthandPropertyAssignment:
			case ts.SyntaxKind.SpreadAssignment:
				return this.handleMember(sourceFile, node, requested);
			case ts.SyntaxKind.GetAccessor:
				name = (node as tt.GetAccessorDeclaration).name.getText();
				return { kind: 'getter', name, rangeNode: node };
			case ts.SyntaxKind.SetAccessor:
				name = (node as tt.SetAccessorDeclaration).name.getText();
				return { kind: 'setter', name, rangeNode: node };
			case ts.SyntaxKind.ClassDeclaration:
				name = (node as tt.ClassDeclaration).name?.text;
				return { kind: 'class', name, rangeNode: node };
			case ts.SyntaxKind.ClassExpression:
				name = (node as tt.ClassExpression).name?.text;
				return this.getExpressionStructuralEntity(node, 'class', name);
			case ts.SyntaxKind.ClassStaticBlockDeclaration:
				return { kind: 'static-block', rangeNode: node };
			case ts.SyntaxKind.InterfaceDeclaration:
				name = (node as tt.InterfaceDeclaration).name.text;
				return { kind: 'interface', name, rangeNode: node };
			case ts.SyntaxKind.ModuleDeclaration:
				name = (node as tt.ModuleDeclaration).name.text;
				return { kind: 'module', name, rangeNode: node };
			case ts.SyntaxKind.TypeAliasDeclaration:
				name = (node as tt.TypeAliasDeclaration).name.text;
				return { kind: 'type-alias', name, rangeNode: node };
			case ts.SyntaxKind.EnumMember:
				name = (node as tt.EnumMember).name.getText();
				return { kind: 'enum-member', name, rangeNode: node };
			case ts.SyntaxKind.EnumDeclaration:
				name = (node as tt.EnumDeclaration).name.text;
				return { kind: 'enum', name, rangeNode: node };
			case ts.SyntaxKind.ImportEqualsDeclaration:
				name = (node as tt.ImportEqualsDeclaration).moduleReference.getText();
				return { kind: 'import', name, rangeNode: node };
			case ts.SyntaxKind.ExportAssignment:
				return { kind: 'export', rangeNode: node };
			case ts.SyntaxKind.ObjectLiteralExpression:
				return this.getExpressionStructuralEntity(node, 'object-literal');
			case ts.SyntaxKind.ArrayLiteralExpression:
				return this.getExpressionStructuralEntity(node, 'array-literal');
			default:
				if (ts.isArrayLiteralExpression(parent) && parent.elements.some(element => element === node)) {
					return this.handleMember(sourceFile, node, requested);
				}
				return undefined;
		}
	}

	private handleProperty(sourceFile: tt.SourceFile, node: tt.PropertyDeclaration | tt.PropertyAssignment | tt.PropertySignature, requested?: LineRange | undefined): StructuralEntity | undefined {
		if (ts.isPropertyDeclaration(node) || ts.isPropertyAssignment(node)) {
			const structuralEntity = this.getAssignedStructuralEntity(node);
			if (structuralEntity !== undefined) {
				return structuralEntity;
			}
		}
		return this.handleMember(sourceFile, node, requested);
	}

	private handleMember(sourceFile: tt.SourceFile, node: tt.Node, requested?: LineRange | undefined): StructuralEntity | undefined {
		const parent = node.parent;
		if (requested !== undefined) {
			const info = this.getMemberInfo(parent);
			if (info === undefined) {
				return undefined;
			}
			const { items, kind, memberKind, name } = info;
			const range = this.calculateRange(sourceFile, parent, node, items, requested);
			if (range === undefined) {
				return undefined;
			}
			if (Array.isArray(range)) {
				const [startIndex, endIndex] = range;
				return {
					kind: memberKind,
					name,
					rangeNode: [items[startIndex], items[endIndex]],
					continueWith: parent
				};
			} else {
				return {
					kind,
					name,
					rangeNode: parent,
					continueWith: this.getAssignedExpressionContainer(parent) ?? parent
				};
			}
		}
		return undefined;
	}

	private getMemberInfo(parent: tt.Node): MemberInfo | undefined {
		if (ts.isClassDeclaration(parent)) {
			return { items: parent.members, kind: 'class', memberKind: 'class-members', name: parent.name?.text };
		} else if (ts.isClassExpression(parent)) {
			return { items: parent.members, kind: 'class', memberKind: 'class-members', name: this.getAssignedExpressionName(parent) ?? parent.name?.text };
		} else if (ts.isInterfaceDeclaration(parent)) {
			return { items: parent.members, kind: 'interface', memberKind: 'interface-members', name: parent.name?.text };
		} else if (ts.isObjectLiteralExpression(parent)) {
			return { items: parent.properties, kind: 'object-literal', memberKind: 'object-literal-members', name: this.getAssignedExpressionName(parent) };
		} else if (ts.isTypeLiteralNode(parent)) {
			return { items: parent.members, kind: 'type-literal', memberKind: 'type-literal-members' };
		} else if (ts.isArrayLiteralExpression(parent)) {
			return { items: parent.elements, kind: 'array-literal', memberKind: 'array-elements', name: this.getAssignedExpressionName(parent) };
		}
		return undefined;
	}

	private calculateRange(sourceFile: tt.SourceFile, parent: tt.Node, node: tt.Node, items: readonly tt.Node[], requested: LineRange): [number, number] | tt.Node | undefined {
		const startLine = sourceFile.getLineAndCharacterOfPosition(parent.getStart(sourceFile)).line;
		const endLine = sourceFile.getLineAndCharacterOfPosition(parent.getEnd()).line;
		if (requested.start <= startLine && requested.end >= endLine) {
			return parent;
		}

		const index = items.indexOf(node);
		if (index === -1) {
			return undefined;
		}

		let startIndex = Math.max(0, index - 1);
		while (index - startIndex < 3 && startIndex > 0) {
			const member = items[startIndex - 1];
			if (!this.isInsideRequestedRange(sourceFile, member, requested)) {
				break;
			}
			startIndex--;
		}

		let endIndex = Math.min(items.length - 1, index + 1);
		while (endIndex - index < 3 && endIndex < items.length - 1) {
			const member = items[endIndex + 1];
			if (!this.isInsideRequestedRange(sourceFile, member, requested)) {
				break;
			}
			endIndex++;
		}
		return [startIndex, endIndex];
	}

	private getExpressionStructuralEntity(node: tt.Node, kind: string, name?: string, includeCallExpression: boolean = false): StructuralEntity {
		const assignedContainer = this.getAssignedExpressionContainer(node);
		if (assignedContainer !== undefined) {
			return this.getAssignedStructuralEntity(assignedContainer) ?? { kind, name, rangeNode: node };
		}

		const outerExpression = this.getOutermostExpression(node);
		if (includeCallExpression && ts.isCallExpression(outerExpression.parent)) {
			return { kind, name, rangeNode: outerExpression.parent, continueWith: outerExpression.parent };
		}
		return { kind, name, rangeNode: node };
	}

	private getAssignedStructuralEntity(node: AssignedStructuralNode): StructuralEntity | undefined {
		if (node.initializer === undefined) {
			return undefined;
		}

		if (ts.isVariableDeclaration(node) && !ts.isIdentifier(node.name)) {
			return undefined;
		}
		const initializer = this.skipOuterExpressions(node.initializer);
		let kind: string;
		if (ts.isArrowFunction(initializer)) {
			kind = ts.isVariableDeclaration(node) ? 'arrow-function' : 'function';
		} else if (ts.isFunctionExpression(initializer)) {
			kind = 'function';
		} else if (ts.isClassExpression(initializer)) {
			kind = 'class';
		} else if (ts.isObjectLiteralExpression(initializer)) {
			kind = 'object-literal';
		} else if (ts.isArrayLiteralExpression(initializer)) {
			kind = 'array-literal';
		} else {
			return undefined;
		}
		return { kind, name: node.name.getText(), rangeNode: node, continueWith: node };
	}

	private getAssignedExpressionContainer(node: tt.Node): AssignedStructuralNode | undefined {
		const outerExpression = this.getOutermostExpression(node);
		const parent = outerExpression.parent;
		if ((ts.isVariableDeclaration(parent) || ts.isPropertyDeclaration(parent) || ts.isPropertyAssignment(parent)) && parent.initializer === outerExpression) {
			return parent;
		}
		return undefined;
	}

	private getAssignedExpressionName(node: tt.Node): string | undefined {
		return this.getAssignedExpressionContainer(node)?.name.getText();
	}

	private getOutermostExpression(node: tt.Node): tt.Node {
		let current = node;
		while (this.isOuterExpression(current.parent) && current.parent.expression === current) {
			current = current.parent;
		}
		return current;
	}

	private skipOuterExpressions(node: tt.Expression): tt.Expression {
		let current = node;
		while (this.isOuterExpression(current)) {
			current = current.expression;
		}
		return current;
	}

	private isOuterExpression(node: tt.Node): node is tt.ParenthesizedExpression | tt.AsExpression | tt.SatisfiesExpression | tt.TypeAssertion | tt.NonNullExpression {
		return ts.isParenthesizedExpression(node)
			|| ts.isAsExpression(node)
			|| ts.isSatisfiesExpression(node)
			|| ts.isTypeAssertionExpression(node)
			|| ts.isNonNullExpression(node);
	}

	private isInsideRequestedRange(sourceFile: tt.SourceFile, member: tt.Node, requested: LineRange): boolean {
		const memberStartLine = sourceFile.getLineAndCharacterOfPosition(member.getStart(sourceFile)).line;
		const memberEndLine = sourceFile.getLineAndCharacterOfPosition(member.getEnd()).line;
		return requested.start <= memberStartLine && requested.end >= memberEndLine;
	}

	private getBaseFileName(fileName: string): string {
		return fileName.substring(Math.max(fileName.lastIndexOf('/'), fileName.lastIndexOf('\\')) + 1);
	}
}
