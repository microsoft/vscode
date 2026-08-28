/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import path from 'node:path';

import * as vscode from 'vscode';

import type { API } from '@typescript/native/unstable/async';
import * as ts from '@typescript/native/unstable/ast';

import type { ILogService } from '../../../../platform/log/common/logService';
import { type IRegionContextProviderService, type Region, type LineRange } from '../../../../platform/languageContextProvider/common/regionContextProvider';
import { TypeScript7Api } from './ts7Api';
import { DisposableStore } from '../../../../util/vs/base/common/lifecycle';
import tss from './typescripts';

type StructuralEntity = { kind: string; name?: string; rangeNode: ts.Node; includeJsDoc?: boolean; continueWith?: ts.Node };

export class TS7RegionContextProvider implements Omit<IRegionContextProviderService, '_serviceBrand'>, vscode.Disposable {

	private readonly disposables: DisposableStore;
	private readonly nativeApi: TypeScript7Api;

	constructor(readonly logService: ILogService) {
		this.disposables = new DisposableStore();
		this.nativeApi = this.disposables.add(new TypeScript7Api(logService));
	}

	async getRegions(document: vscode.Uri, languageId: string, ranges: vscode.Range[], requested?: LineRange): Promise<Region[] | undefined> {
		if (document.scheme !== 'file' || languageId !== 'typescript') {
			return undefined;
		}
		const api = await this.nativeApi.getApi();
		if (api === undefined) {
			return undefined;
		}
		if (ranges.length === 0) {
			return undefined;
		} else if (ranges.length === 1) {
			return this.findEnclosingScopes(api, document.fsPath, ranges[0].start.line, ranges[0].start.character);
		} else {
			const containersList: Region[][] = [];
			for (const range of ranges) {
				const containers = await this.findEnclosingScopes(api, document.fsPath, range.start.line, range.start.character);
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
					kind: 'artificial',
					range: {
						start: Math.min(...tailContainers.map(container => container.range.start)),
						end: Math.max(...tailContainers.map(container => container.range.end))
					}
				};
				const lastContainer = commonContainers[commonContainers.length - 1];
				if (container.range.end - container.range.start < lastContainer.range.end - lastContainer.range.start) {
					commonContainers.push(container);
				}
			}

			return commonContainers.reverse();
		}
	}

	private async findEnclosingScopes(api: API<true>, document: string, line: number, column: number): Promise<Region[] | undefined> {
		api.clearSourceFileCache();
		const snapshot = await api.updateSnapshot();
		const project = await snapshot.getDefaultProjectForFile(document);
		if (project === undefined) {
			return undefined;
		}
		const sourceFile = await project.program.getSourceFile(document);
		if (sourceFile === undefined) {
			return undefined;
		}

		const position = sourceFile.getPositionOfLineAndCharacter(line, column);

		const tokenInfo = tss.getRelevantTokens(sourceFile, position);

		const node = tokenInfo.touching ?? tokenInfo.token;
		if (!node) {
			return;
		}

		const result: Region[] = [];
		for (let parent: ts.Node | undefined = node.parent; parent; parent = parent.parent) {
			if (ts.isSourceFile(parent)) {
				const endLine = sourceFile.getLineAndCharacterOfPosition(sourceFile.getEnd()).line;
				const lineRange = this.toLineRange(0, endLine);
				result.push({
					kind: 'sourceFile',
					name: path.basename(sourceFile.fileName),
					range: lineRange
				});
				break;
			}

			const namedStructuralEntity = this.getStructuralEntity(parent);
			if (namedStructuralEntity !== undefined) {
				const { kind, name, rangeNode, includeJsDoc, continueWith } = namedStructuralEntity;
				const lineRange = this.toLineRange(
					sourceFile.getLineAndCharacterOfPosition(rangeNode.getStart(sourceFile, includeJsDoc)).line,
					sourceFile.getLineAndCharacterOfPosition(rangeNode.getEnd()).line
				);
				result.push({
					kind,
					name,
					range: lineRange
				});
				parent = continueWith ?? parent;
			}
		}
		return result.length > 0 ? result : undefined;
	}

	private getStructuralEntity(node: ts.Node): StructuralEntity | undefined {
		const parent: ts.Node | undefined = node.parent;
		let name: string | undefined;
		let isParent: StructuralEntity | undefined;
		switch (node.kind) {
			case ts.SyntaxKind.JSDoc:
				isParent = this.getStructuralEntity(parent);
				if (isParent !== undefined) {
					isParent.includeJsDoc = true;
					isParent.continueWith = parent;
				}
				return isParent;
			case ts.SyntaxKind.ImportDeclaration:
				name = (node as ts.ImportDeclaration).moduleSpecifier.getText();
				return name ? { kind: 'import', name, rangeNode: node } : undefined;
			case ts.SyntaxKind.ExportDeclaration:
				name = (node as ts.ExportDeclaration).moduleSpecifier?.getText();
				return { kind: 'export', name, rangeNode: node };
			case ts.SyntaxKind.FunctionDeclaration:
				name = (node as ts.FunctionDeclaration).name?.text;
				return name ? { kind: 'function', name, rangeNode: node } : undefined;
			case ts.SyntaxKind.Constructor:
				return { kind: 'constructor', name: 'constructor', rangeNode: node };
			case ts.SyntaxKind.MethodDeclaration:
				name = (node as ts.MethodDeclaration).name?.getText();
				return name ? { kind: 'method', name, rangeNode: node } : undefined;
			case ts.SyntaxKind.MethodSignature:
				name = (node as ts.MethodSignatureDeclaration).name?.getText();
				return name ? { kind: 'method', name, rangeNode: node } : undefined;
			case ts.SyntaxKind.ArrowFunction:
				if (ts.isPropertyAssignment(parent) && ts.isIdentifier(parent.name)) {
					name = parent.name.text;
					// We use kind 'function' for arrow functions that are properties because from a usage perspective
					// they are more similar to named functions or methods than to anonymous functions.
					return name ? { kind: 'function', name, rangeNode: parent } : undefined;
				} else if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
					name = parent.name.text;
					return name ? { kind: 'arrow-function', name, rangeNode: parent } : undefined;
				} else if (ts.isCallExpression(parent)) {
					return { kind: 'arrow-function', rangeNode: parent };
				}
				return { kind: 'arrow-function', rangeNode: node };
			case ts.SyntaxKind.PropertyDeclaration:
				name = (node as ts.PropertyDeclaration).name?.getText();
				return name ? { kind: 'property', name, rangeNode: node } : undefined;
			case ts.SyntaxKind.PropertySignature:
				name = (node as ts.PropertySignatureDeclaration).name?.getText();
				return name ? { kind: 'property', name, rangeNode: node } : undefined;
			case ts.SyntaxKind.GetAccessor:
				name = (node as ts.GetAccessorDeclaration).name?.getText();
				return name ? { kind: 'getter', name, rangeNode: node } : undefined;
			case ts.SyntaxKind.SetAccessor:
				name = (node as ts.SetAccessorDeclaration).name?.getText();
				return name ? { kind: 'setter', name, rangeNode: node } : undefined;
			case ts.SyntaxKind.ClassDeclaration:
				name = (node as ts.ClassDeclaration).name?.text;
				return name ? { kind: 'class', name, rangeNode: node } : undefined;
			case ts.SyntaxKind.InterfaceDeclaration:
				name = (node as ts.InterfaceDeclaration).name?.text;
				return name ? { kind: 'interface', name, rangeNode: node } : undefined;
			case ts.SyntaxKind.ModuleDeclaration:
				name = (node as ts.ModuleDeclaration).name?.text;
				return name ? { kind: 'module', name, rangeNode: node } : undefined;
			default:
				return undefined;
		}
	}

	private toLineRange(startLine: number, endLine: number): LineRange {
		return { start: startLine, end: endLine };
	}

	dispose(): void {
		this.disposables.dispose();
	}
}
