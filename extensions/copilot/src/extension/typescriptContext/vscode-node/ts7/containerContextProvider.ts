/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import path from 'node:path';

import * as vscode from 'vscode';

import type { API } from '@typescript/native/unstable/async';
import * as ts from '@typescript/native/unstable/ast';

import type { ILogService } from '../../../../platform/log/common/logService';
import { type IContainerContextProviderService, type Container, type LineRange } from '../../../../platform/languageContextProvider/common/containerContextProvider';
import { TypeScript7Api } from './ts7Api';
import { DisposableStore } from '../../../../util/vs/base/common/lifecycle';
import tss from './typescripts';

enum CodeUsageKind {
	Declaration = 'declaration',
	Reference = 'reference',
	Implementation = 'implementation'
}

export class TS7ContainerContextProvider implements Omit<IContainerContextProviderService, '_serviceBrand'>, vscode.Disposable {

	private readonly disposables: DisposableStore;
	private readonly nativeApi: TypeScript7Api;

	constructor(readonly logService: ILogService) {
		this.disposables = new DisposableStore();
		this.nativeApi = this.disposables.add(new TypeScript7Api(logService));
	}

	async getContainers(document: vscode.Uri, languageId: string, line: number): Promise<Container[] | undefined> {
		if (document.scheme !== 'file') {
			return undefined;
		}
		const api = await this.nativeApi.getApi();
		if (api === undefined) {
			return undefined;
		}
		return this.findEnclosingScopes(api, document.fsPath, line, 0);
	}

	private async findEnclosingScopes(api: API<true>, document: string, line: number, column: number) {
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

		const result: Container[] = [];
		for (let parent: ts.Node | undefined = node.parent; parent; parent = parent.parent) {
			if (ts.isSourceFile(parent)) {
				if (result.length === 0) {
					const line = sourceFile.getLineAndCharacterOfPosition(position).line;
					const lineRange = this.toLineRange(line, line);
					result.push({
						kind: 'sourceFile',
						name: path.basename(sourceFile.fileName),
						range: lineRange
					});
				}
				break;
			}

			const namedStructuralEntity = this.isNamedStructuralEntity(parent, CodeUsageKind.Reference);
			if (namedStructuralEntity !== undefined) {
				let { kind, name, rangeNode } = namedStructuralEntity;
				rangeNode ??= parent;
				const lineRange = this.toLineRange(
					sourceFile.getLineAndCharacterOfPosition(rangeNode.getStart(sourceFile)).line,
					sourceFile.getLineAndCharacterOfPosition(rangeNode.getEnd()).line
				);
				result.push({
					kind,
					name,
					range: lineRange
				});
			}
		}
		return result.length > 0 ? result : undefined;
	}

	private isNamedStructuralEntity(node: ts.Node, kind: CodeUsageKind): { kind: string; name?: string; rangeNode?: ts.Node } | undefined {
		let name: string | undefined;
		const parent: ts.Node | undefined = node.parent;
		switch (node.kind) {
			case ts.SyntaxKind.FunctionDeclaration:
				name = (node as ts.FunctionDeclaration).name?.text;
				return name ? { kind: 'function', name } : undefined;
			case ts.SyntaxKind.Constructor:
				return { kind: 'constructor', name: 'constructor' };
			case ts.SyntaxKind.MethodDeclaration:
				name = (node as ts.MethodDeclaration).name?.getText();
				return name ? { kind: 'method', name } : undefined;
			case ts.SyntaxKind.MethodSignature:
				if (kind === CodeUsageKind.Declaration) {
					name = (node as ts.MethodSignatureDeclaration).name?.getText();
					return name ? { kind: 'method', name } : undefined;
				}
				return undefined;
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
				return { kind: 'arrow-function' };
			case ts.SyntaxKind.PropertyDeclaration:
				name = (node as ts.PropertyDeclaration).name?.getText();
				return name ? { kind: 'property', name } : undefined;
			case ts.SyntaxKind.PropertySignature:
				if (kind === CodeUsageKind.Declaration) {
					name = (node as ts.PropertySignatureDeclaration).name?.getText();
					return name ? { kind: 'property', name } : undefined;
				}
				return undefined;
			case ts.SyntaxKind.GetAccessor:
				name = (node as ts.GetAccessorDeclaration).name?.getText();
				return name ? { kind: 'getter', name } : undefined;
			case ts.SyntaxKind.SetAccessor:
				name = (node as ts.SetAccessorDeclaration).name?.getText();
				return name ? { kind: 'setter', name } : undefined;
			case ts.SyntaxKind.ClassDeclaration:
				name = (node as ts.ClassDeclaration).name?.text;
				return name ? { kind: 'class', name } : undefined;
			case ts.SyntaxKind.InterfaceDeclaration:
				name = (node as ts.InterfaceDeclaration).name?.text;
				return name ? { kind: 'interface', name } : undefined;
			case ts.SyntaxKind.ModuleDeclaration:
				name = (node as ts.ModuleDeclaration).name?.text;
				return name ? { kind: 'module', name } : undefined;
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
