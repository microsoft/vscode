/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import type tt from 'typescript/lib/tsserverlibrary';
import TS from './typescript';
const ts = TS();

import type { Range, Region } from './protocol';
import tss from './typescripts';

type StructuralEntity = { kind: string; name?: string; rangeNode: tt.Node; includeJsDoc?: boolean; continueWith?: tt.Node };

export function getRegionContext(sourceFile: tt.SourceFile, ranges: readonly Range[]): Region[] | undefined {
	if (ranges.length === 0) {
		return undefined;
	}

	if (ranges.length === 1) {
		return findEnclosingScopes(sourceFile, ranges[0].start.line, ranges[0].start.character);
	}

	const containersList: Region[][] = [];
	for (const range of ranges) {
		const containers = findEnclosingScopes(sourceFile, range.start.line, range.start.character);
		if (containers !== undefined && containers.length > 0) {
			containersList.push(containers.reverse());
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

	return commonContainers.reverse();
}

function findEnclosingScopes(sourceFile: tt.SourceFile, line: number, column: number): Region[] | undefined {
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
				name: getBaseFileName(sourceFile.fileName),
				range: { start: 0, end: endLine }
			});
			break;
		}

		const structuralEntity = getStructuralEntity(current);
		if (structuralEntity !== undefined) {
			const { kind, name, rangeNode, includeJsDoc, continueWith } = structuralEntity;
			result.push({
				kind,
				name,
				range: {
					start: sourceFile.getLineAndCharacterOfPosition(rangeNode.getStart(sourceFile, includeJsDoc)).line,
					end: sourceFile.getLineAndCharacterOfPosition(rangeNode.getEnd()).line
				}
			});
			current = continueWith ?? current;
		}
	}
	return result.length > 0 ? result : undefined;
}

function getStructuralEntity(node: tt.Node): StructuralEntity | undefined {
	const parent = node.parent;
	let name: string | undefined;
	switch (node.kind) {
		case ts.SyntaxKind.JSDoc: {
			const parentEntity = getStructuralEntity(parent);
			if (parentEntity !== undefined) {
				parentEntity.includeJsDoc = true;
				parentEntity.continueWith = parent;
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
			if (name === undefined) {
				if (ts.isPropertyAssignment(parent) && ts.isIdentifier(parent.name)) {
					name = parent.name.text;
				} else if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
					name = parent.name.text;
				}
			}
			return { kind: 'function', name, rangeNode: node };
		case ts.SyntaxKind.Constructor:
			return { kind: 'constructor', name: 'constructor', rangeNode: node };
		case ts.SyntaxKind.MethodDeclaration:
			name = (node as tt.MethodDeclaration).name.getText();
			return { kind: 'method', name, rangeNode: node };
		case ts.SyntaxKind.MethodSignature:
			name = (node as tt.MethodSignature).name.getText();
			return { kind: 'method', name, rangeNode: node };
		case ts.SyntaxKind.ArrowFunction:
			if (ts.isPropertyAssignment(parent) && ts.isIdentifier(parent.name)) {
				name = parent.name.text;
				return { kind: 'function', name, rangeNode: parent };
			} else if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
				name = parent.name.text;
				return { kind: 'arrow-function', name, rangeNode: parent };
			} else if (ts.isCallExpression(parent)) {
				return { kind: 'arrow-function', rangeNode: parent };
			}
			return { kind: 'arrow-function', rangeNode: node };
		case ts.SyntaxKind.PropertyDeclaration:
			return getPropertyDeclarationEntity(node as tt.PropertyDeclaration);
		case ts.SyntaxKind.PropertySignature:
			name = (node as tt.PropertySignature).name.getText();
			return { kind: 'property', name, rangeNode: node };
		case ts.SyntaxKind.GetAccessor:
			name = (node as tt.GetAccessorDeclaration).name.getText();
			return { kind: 'getter', name, rangeNode: node };
		case ts.SyntaxKind.SetAccessor:
			name = (node as tt.SetAccessorDeclaration).name.getText();
			return { kind: 'setter', name, rangeNode: node };
		case ts.SyntaxKind.ClassDeclaration:
			name = (node as tt.ClassDeclaration).name?.text;
			return { kind: 'class', name, rangeNode: node };
		case ts.SyntaxKind.InterfaceDeclaration:
			name = (node as tt.InterfaceDeclaration).name.text;
			return { kind: 'interface', name, rangeNode: node };
		case ts.SyntaxKind.ModuleDeclaration:
			name = (node as tt.ModuleDeclaration).name.text;
			return { kind: 'module', name, rangeNode: node };
		case ts.SyntaxKind.TypeAliasDeclaration:
			name = (node as tt.TypeAliasDeclaration).name.text;
			return { kind: 'type-alias', name, rangeNode: node };
		default:
			return undefined;
	}
}

function getPropertyDeclarationEntity(node: tt.PropertyDeclaration): StructuralEntity | undefined {
	const name = node.name.getText();
	const kind = node.type?.kind;
	if (kind === ts.SyntaxKind.FunctionType || kind === ts.SyntaxKind.FunctionDeclaration || kind === ts.SyntaxKind.FunctionExpression || kind === ts.SyntaxKind.ArrowFunction) {
		return { kind: 'function', name, rangeNode: node };
	}
	return undefined;
}

function getBaseFileName(fileName: string): string {
	return fileName.substring(Math.max(fileName.lastIndexOf('/'), fileName.lastIndexOf('\\')) + 1);
}
