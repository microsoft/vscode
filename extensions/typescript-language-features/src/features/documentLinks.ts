/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { basename, dirname, join } from 'path';
import * as vscode from 'vscode';

import * as PConst from '../protocol.const';
import type * as Proto from '../protocol';
import { ITypeScriptServiceClient } from '../typescriptService';
import * as typeConverters from '../utils/typeConverters';
import { CachedResponse } from '../tsServer/cachedResponse';

const getSymbolKind = (kind: string): vscode.SymbolKind => {
	switch (kind) {
		case PConst.Kind.module: return vscode.SymbolKind.Module;
		case PConst.Kind.class: return vscode.SymbolKind.Class;
		case PConst.Kind.enum: return vscode.SymbolKind.Enum;
		case PConst.Kind.interface: return vscode.SymbolKind.Interface;
		case PConst.Kind.method: return vscode.SymbolKind.Method;
		case PConst.Kind.memberVariable: return vscode.SymbolKind.Property;
		case PConst.Kind.memberGetAccessor: return vscode.SymbolKind.Property;
		case PConst.Kind.memberSetAccessor: return vscode.SymbolKind.Property;
		case PConst.Kind.variable: return vscode.SymbolKind.Variable;
		case PConst.Kind.const: return vscode.SymbolKind.Variable;
		case PConst.Kind.localVariable: return vscode.SymbolKind.Variable;
		case PConst.Kind.function: return vscode.SymbolKind.Function;
		case PConst.Kind.localFunction: return vscode.SymbolKind.Function;
		case PConst.Kind.constructSignature: return vscode.SymbolKind.Constructor;
		case PConst.Kind.constructorImplementation: return vscode.SymbolKind.Constructor;
	}
	return vscode.SymbolKind.Variable;
};


class TsDocumentLinkProvider implements vscode.DocumentLinkProvider {
	public constructor(
		private readonly client: ITypeScriptServiceClient,
		private cachedResponse: CachedResponse<Proto.NavTreeResponse>,
	) { }

	public async provideDocumentLinks(
		document: vscode.TextDocument,
		token: vscode.CancellationToken
	): Promise<vscode.DocumentLink[] | undefined> {
		const file = this.client.toOpenedFilePath(document);
		if (!file) {
			return undefined;
		}
		const args: Proto.FileRequestArgs = { file };
		const response = await this.cachedResponse.execute(document, () => this.client.execute('navtree-full' as any, args, token));

		if (response.type !== 'response' || !response.body?.childItems) {
			return undefined;
		}


		console.log(response);
		// The root represents the file. Ignore this when showing in the UI
		const result: any[] = [];
		for (const item of response.body.childItems) {
			await this.convertNavTree(document.uri, result, item, file, token);
		}

		console.log('Result: ', result);

		return [];
	}

	private async convertNavTree(
		resource: vscode.Uri,
		output: any[],
		item: Proto.NavigationTree,
		filePath: string,
		token: vscode.CancellationToken
	): Promise<any> {
		// let shouldInclude = TsDocumentLinkProvider.shouldInclueEntry(item);
		// if (!shouldInclude && !item.childItems?.length) {
		// 	return false;
		// }

		const children = new Set(item.childItems || []);
		for (const span of item.spans) {
			const range = typeConverters.Range.fromTextSpan(span);
			const selectionRange = item.nameSpan ? typeConverters.Range.fromTextSpan(item.nameSpan) : range;
			const symbolInfo = new vscode.DocumentSymbol(
				item.text,
				'',
				getSymbolKind(item.kind),
				range,
				range.contains(selectionRange) ? selectionRange : range);



				const args = typeConverters.Range.toFormattingRequestArgs(filePath, range);

				const response = await this.client.interruptGetErr(() => this.client.execute('quickinfo',args, token));
				console.log(response);
				const node = {
					item,
					range,
					selectionRange: range.contains(selectionRange) ? selectionRange : range,
					symbolInfo,
					info: response.type === 'response' && response.body ? response.body : null,
					// implementation: await this.client.interruptGetErr(() => this.client.execute('implementation', args, token)),
					// typeDefinition:  await this.client.interruptGetErr(() => this.client.execute('docCommentTemplate', args, token))
				};
			for (const child of children) {
				if (child.spans.some(span => !!range.intersection(typeConverters.Range.fromTextSpan(span)))) {
					console.log('traverse');
					await this.convertNavTree(resource, output, child, filePath, token);

					children.delete(child);
				}
			}

			output.push(node);
		}

	}

	private static shouldInclueEntry(item: Proto.NavigationTree | Proto.NavigationBarItem): boolean {
		// if (item.kind === PConst.Kind.alias) {
		// 	return false;
		// }
		return !!(item.text && item.text !== '<function>' && item.text !== '<class>');
	}

	// private getExtendsLink(document: vscode.TextDocument, root: jsonc.Node): vscode.DocumentLink | undefined {
	// 	const extendsNode = jsonc.findNodeAtLocation(root, ['extends']);
	// 	if (!this.isPathValue(extendsNode)) {
	// 		return undefined;
	// 	}

	// 	if (extendsNode.value.startsWith('.')) {
	// 		return new vscode.DocumentLink(
	// 			this.getRange(document, extendsNode),
	// 			vscode.Uri.file(join(dirname(document.uri.fsPath), extendsNode.value + (extendsNode.value.endsWith('.json') ? '' : '.json')))
	// 		);
	// 	}

	// 	const workspaceFolderPath = vscode.workspace.getWorkspaceFolder(document.uri)!.uri.fsPath;
	// 	return new vscode.DocumentLink(
	// 		this.getRange(document, extendsNode),
	// 		vscode.Uri.file(join(workspaceFolderPath, 'node_modules', extendsNode.value + (extendsNode.value.endsWith('.json') ? '' : '.json')))
	// 	);
	// }

	// private getFilesLinks(document: vscode.TextDocument, root: jsonc.Node) {
	// 	return mapChildren(
	// 		jsonc.findNodeAtLocation(root, ['files']),
	// 		child => this.pathNodeToLink(document, child));
	// }

	// private getReferencesLinks(document: vscode.TextDocument, root: jsonc.Node) {
	// 	return mapChildren(
	// 		jsonc.findNodeAtLocation(root, ['references']),
	// 		child => {
	// 			const pathNode = jsonc.findNodeAtLocation(child, ['path']);
	// 			if (!this.isPathValue(pathNode)) {
	// 				return undefined;
	// 			}

	// 			return new vscode.DocumentLink(this.getRange(document, pathNode),
	// 				basename(pathNode.value).endsWith('.json')
	// 					? this.getFileTarget(document, pathNode)
	// 					: this.getFolderTarget(document, pathNode));
	// 		});
	// }

	// private pathNodeToLink(
	// 	document: vscode.TextDocument,
	// 	node: jsonc.Node | undefined
	// ): vscode.DocumentLink | undefined {
	// 	return this.isPathValue(node)
	// 		? new vscode.DocumentLink(this.getRange(document, node), this.getFileTarget(document, node))
	// 		: undefined;
	// }

	// private isPathValue(extendsNode: jsonc.Node | undefined): extendsNode is jsonc.Node {
	// 	return extendsNode
	// 		&& extendsNode.type === 'string'
	// 		&& extendsNode.value
	// 		&& !(extendsNode.value as string).includes('*'); // don't treat globs as links.
	// }

	// private getFileTarget(document: vscode.TextDocument, node: jsonc.Node): vscode.Uri {
	// 	return vscode.Uri.file(join(dirname(document.uri.fsPath), node!.value));
	// }

	// private getFolderTarget(document: vscode.TextDocument, node: jsonc.Node): vscode.Uri {
	// 	return vscode.Uri.file(join(dirname(document.uri.fsPath), node!.value, 'tsconfig.json'));
	// }

	// private getRange(document: vscode.TextDocument, node: jsonc.Node) {
	// 	const offset = node!.offset;
	// 	const start = document.positionAt(offset + 1);
	// 	const end = document.positionAt(offset + (node!.length - 1));
	// 	return new vscode.Range(start, end);
	// }
}

export function register(
	selector: vscode.DocumentSelector,
	client: ITypeScriptServiceClient,
	cachedResponse: CachedResponse<Proto.NavTreeResponse>,
) {
	console.log('DocLinks: ', { selector, client, cachedResponse });

	return vscode.languages.registerDocumentLinkProvider(selector, new TsDocumentLinkProvider(client, cachedResponse));
}
