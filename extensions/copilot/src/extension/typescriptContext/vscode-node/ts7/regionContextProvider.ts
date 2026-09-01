/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';

import type { Snapshot } from '@typescript/native/unstable/async';
import * as ts from '@typescript/native/unstable/ast';

import type { ILogService } from '../../../../platform/log/common/logService';
import { type IRegionContextProviderService, type Region, type LineRange } from '../../../../platform/languageContextProvider/common/regionContextProvider';
import { TypeScript7Api } from './ts7Api';
import { DisposableStore } from '../../../../util/vs/base/common/lifecycle';
import tss from './typescripts';

type StructuralEntity = { kind: string; name?: string; rangeNode: ts.Node | [ts.Node, ts.Node]; includeJsDoc?: boolean; continueWith?: ts.Node };

interface RegionContextApi {
	clearSourceFileCache(): void;
	updateSnapshot(): Promise<Snapshot>;
}

interface RegionContextApiProvider extends vscode.Disposable {
	getApi(): Promise<RegionContextApi | undefined>;
}

export class TS7RegionContextProvider implements Omit<IRegionContextProviderService, '_serviceBrand'>, vscode.Disposable {

	private readonly disposables: DisposableStore;
	private readonly nativeApi: RegionContextApiProvider;

	constructor(readonly logService: ILogService, nativeApi: RegionContextApiProvider = new TypeScript7Api(logService)) {
		this.disposables = new DisposableStore();
		this.nativeApi = this.disposables.add(nativeApi);
	}

	async getRegions(document: vscode.Uri, languageId: string, ranges: vscode.Range[], requested?: LineRange): Promise<Region[] | undefined> {
		if (document.scheme !== 'file' || (languageId !== 'typescript' && languageId !== 'javascript')) {
			return undefined;
		}
		if (ranges.length === 0) {
			return undefined;
		}

		const api = await this.nativeApi.getApi();
		if (api === undefined) {
			return undefined;
		}
		api.clearSourceFileCache();
		const snapshot = await api.updateSnapshot();
		try {

			const project = await snapshot.getDefaultProjectForFile(document.fsPath);
			if (project === undefined) {
				return undefined;
			}
			const sourceFile = await project.program.getSourceFile(document.fsPath);
			if (sourceFile === undefined) {
				return undefined;
			}

			if (ranges.length === 1) {
				return this.findEnclosingScopes(sourceFile, ranges[0].start.line, ranges[0].start.character, requested);
			} else {
				const containersList: Region[][] = [];
				for (const range of ranges) {
					const containers = await this.findEnclosingScopes(sourceFile, range.start.line, range.start.character, requested);
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
		} finally {
			await snapshot.dispose();
		}
	}

	private async findEnclosingScopes(sourceFile: ts.SourceFile, line: number, column: number, requested?: LineRange | undefined): Promise<Region[] | undefined> {
		const position = sourceFile.getPositionOfLineAndCharacter(line, column);
		const tokenInfo = tss.getRelevantTokens(sourceFile, position);
		const node = tokenInfo.touching ?? tokenInfo.token;
		if (node === undefined) {
			return undefined;
		}

		const result: Region[] = [];
		for (let current: ts.Node | undefined = node; current; current = current.parent) {
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
		return result.length > 0 ? result : undefined;
	}

	private getStructuralEntity(sourceFile: ts.SourceFile, node: ts.Node, requested?: LineRange | undefined): StructuralEntity | undefined {
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
				name = (node as ts.ImportDeclaration).moduleSpecifier.getText();
				return { kind: 'import', name, rangeNode: node };
			case ts.SyntaxKind.ExportDeclaration:
				name = (node as ts.ExportDeclaration).moduleSpecifier?.getText();
				return { kind: 'export', name, rangeNode: node };
			case ts.SyntaxKind.FunctionDeclaration:
				name = (node as ts.FunctionDeclaration).name?.text;
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
				name = (node as ts.MethodDeclaration).name.getText();
				return { kind: 'method', name, rangeNode: node };
			case ts.SyntaxKind.MethodSignature:
				name = (node as ts.MethodSignatureDeclaration).name.getText();
				return { kind: 'method', name, rangeNode: node };
			case ts.SyntaxKind.ArrowFunction:
				if (ts.isPropertyAssignment(parent) && ts.isIdentifier(parent.name)) {
					name = parent.name.text;
					return { kind: 'function', name, rangeNode: parent, continueWith: parent };
				} else if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
					name = parent.name.text;
					return { kind: 'arrow-function', name, rangeNode: parent, continueWith: parent };
				} else if (ts.isCallExpression(parent)) {
					return { kind: 'arrow-function', rangeNode: parent, continueWith: parent };
				}
				return { kind: 'arrow-function', rangeNode: node };
			case ts.SyntaxKind.PropertyDeclaration:
				return this.handleProperty(sourceFile, node as ts.PropertyDeclaration, requested);
			case ts.SyntaxKind.PropertyAssignment:
				return this.handleProperty(sourceFile, node as ts.PropertyAssignment, requested);
			case ts.SyntaxKind.PropertySignature:
				return this.handleProperty(sourceFile, node as ts.PropertySignatureDeclaration, requested);
			case ts.SyntaxKind.GetAccessor:
				name = (node as ts.GetAccessorDeclaration).name.getText();
				return { kind: 'getter', name, rangeNode: node };
			case ts.SyntaxKind.SetAccessor:
				name = (node as ts.SetAccessorDeclaration).name.getText();
				return { kind: 'setter', name, rangeNode: node };
			case ts.SyntaxKind.ClassDeclaration:
				name = (node as ts.ClassDeclaration).name?.text;
				return { kind: 'class', name, rangeNode: node };
			case ts.SyntaxKind.InterfaceDeclaration:
				name = (node as ts.InterfaceDeclaration).name.text;
				return { kind: 'interface', name, rangeNode: node };
			case ts.SyntaxKind.ModuleDeclaration:
				name = (node as ts.ModuleDeclaration).name.text;
				return { kind: 'module', name, rangeNode: node };
			case ts.SyntaxKind.TypeAliasDeclaration:
				name = (node as ts.TypeAliasDeclaration).name.text;
				return { kind: 'type-alias', name, rangeNode: node };
			default:
				return undefined;
		}
	}

	private handleProperty(sourceFile: ts.SourceFile, node: ts.PropertyDeclaration | ts.PropertyAssignment | ts.PropertySignatureDeclaration, requested?: LineRange | undefined): StructuralEntity | undefined {
		const name = node.name.getText();
		if (ts.isPropertyDeclaration(node) || ts.isPropertyAssignment(node)) {
			const initializeKind = node.initializer?.kind;
			if (initializeKind === ts.SyntaxKind.FunctionType || initializeKind === ts.SyntaxKind.FunctionDeclaration || initializeKind === ts.SyntaxKind.FunctionExpression || initializeKind === ts.SyntaxKind.ArrowFunction) {
				return { kind: 'function', name, rangeNode: node };
			}
		}
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
					continueWith: parent
				};
			}
		}
		return undefined;
	}

	private getMemberInfo(parent: ts.Node): { items: ts.NodeArray<ts.Node>; kind: string; memberKind: string; name?: string | undefined } | undefined {
		if (ts.isClassDeclaration(parent)) {
			return { items: parent.members, kind: 'class', memberKind: 'class-members', name: parent.name?.text };
		} else if (ts.isInterfaceDeclaration(parent)) {
			return { items: parent.members, kind: 'interface', memberKind: 'interface-members', name: parent.name?.text };
		} else if (ts.isObjectLiteralExpression(parent)) {
			return { items: parent.properties, kind: 'object-literal', memberKind: 'object-literal-members' };
		} else if (ts.isTypeLiteralNode(parent)) {
			return { items: parent.members, kind: 'type-literal', memberKind: 'type-literal-members' };
		}
		return undefined;
	}

	private calculateRange(sourceFile: ts.SourceFile, parent: ts.Node, node: ts.Node, items: ts.NodeArray<ts.Node>, requested: LineRange): [number, number] | ts.Node | undefined {
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

	private isInsideRequestedRange(sourceFile: ts.SourceFile, member: ts.Node, requested: LineRange): boolean {
		const memberStartLine = sourceFile.getLineAndCharacterOfPosition(member.getStart(sourceFile)).line;
		const memberEndLine = sourceFile.getLineAndCharacterOfPosition(member.getEnd()).line;
		return requested.start <= memberStartLine && requested.end >= memberEndLine;
	}

	private getBaseFileName(fileName: string): string {
		return fileName.substring(Math.max(fileName.lastIndexOf('/'), fileName.lastIndexOf('\\')) + 1);
	}

	dispose(): void {
		this.disposables.dispose();
	}
}
