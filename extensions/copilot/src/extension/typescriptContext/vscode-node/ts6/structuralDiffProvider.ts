/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { CancellationError } from '../../../../util/vs/base/common/errors';
import * as protocol from '../../common/serverProtocol';
import { StructuralDiffDocuments } from '../structuralDiffDocuments';

enum ExecutionTarget {
	Semantic,
	Syntax
}

type ExecConfig = {
	readonly lowPriority?: boolean;
	readonly executionTarget?: ExecutionTarget;
};

type StructuralDiffRequest = (args: protocol.StructuralDiffRequestArgs, token: vscode.CancellationToken) => Thenable<protocol.StructuralDiffResponse | undefined>;

/**
 * Computes structural diffs in the TypeScript server plugin, which parses the supplied document contents
 * in isolation, so neither the project nor the backing file changes.
 */
export class TS6StructuralDiffProvider implements vscode.StructuralDiffProvider, vscode.Disposable {
	// Structural diffs are computed in the background, so interactive requests such as completions go first.
	private static readonly ExecConfig: ExecConfig = { executionTarget: ExecutionTarget.Semantic, lowPriority: true };

	constructor(
		private readonly sendRequest: StructuralDiffRequest = (args, token) => vscode.commands.executeCommand<protocol.StructuralDiffResponse | undefined>('typescript.tsserverRequest', '_.copilot.structuralDiff', args, TS6StructuralDiffProvider.ExecConfig, token),
		private readonly openDocument: (uri: vscode.Uri) => Thenable<unknown> = uri => vscode.workspace.openTextDocument(uri),
	) { }

	async provideStructuralDiff(originalDocument: vscode.TextDocument, modifiedDocument: vscode.TextDocument, context: vscode.StructuralDiffContext, token: vscode.CancellationToken): Promise<vscode.StructuralDiff | undefined> {
		const fileUri = StructuralDiffDocuments.getBackingFile(modifiedDocument);
		if (fileUri === undefined) {
			return undefined;
		}
		const checkCancellation = StructuralDiffDocuments.createCancellationCheck(originalDocument, modifiedDocument, token);
		checkCancellation();
		const toOffsets = (document: vscode.TextDocument, range: vscode.Range): protocol.OffsetRange => ({ start: document.offsetAt(range.start), end: document.offsetAt(range.end) });
		const response = await this.request({
			fileName: fileUri.fsPath,
			originalText: originalDocument.getText(),
			modifiedText: modifiedDocument.getText(),
			changes: context.changes.map(change => ({
				original: toOffsets(originalDocument, change.originalRange),
				modified: toOffsets(modifiedDocument, change.modifiedRange),
			})),
		}, fileUri, checkCancellation, token);
		checkCancellation();
		if (protocol.StructuralDiffResponse.isCancelled(response)) {
			throw new CancellationError();
		}
		if (protocol.StructuralDiffResponse.isError(response)) {
			throw new Error(`TypeScript structural diff failed: ${response.body.message}`);
		}
		return protocol.StructuralDiffResponse.isOk(response) ? toStructuralDiff(response.body, originalDocument, modifiedDocument) : undefined;
	}

	/**
	 * tsserver loads the plugin, and with it the request handler, only when it creates a project for an open file, and
	 * it does not open Git snapshots. So a staged diff can be requested before the handler exists. When a request fails,
	 * the backing file is opened to create its project and the request is sent once more. It still analyzes only the
	 * supplied texts.
	 */
	private async request(args: protocol.StructuralDiffRequestArgs, fileUri: vscode.Uri, checkCancellation: () => void, token: vscode.CancellationToken): Promise<protocol.StructuralDiffResponse | undefined> {
		try {
			return await this.sendRequest(args, token);
		} catch (error) {
			checkCancellation();
			try {
				await this.openDocument(fileUri);
			} catch {
				throw error;
			}
			checkCancellation();
			return this.sendRequest(args, token);
		}
	}

	dispose(): void {
		// No resources to dispose for the TS6 implementation
	}
}

function toStructuralDiff(result: protocol.StructuralDiffResult, originalDocument: vscode.TextDocument, modifiedDocument: vscode.TextDocument): vscode.StructuralDiff {
	const toRange = (document: vscode.TextDocument, range: protocol.OffsetRange) => new vscode.Range(document.positionAt(range.start), document.positionAt(range.end));
	const toEntity = (document: vscode.TextDocument, entity: protocol.StructuralDiffItem | undefined): vscode.StructuralDiffItem | undefined => entity && {
		name: getName(entity),
		kind: toSymbolKind(entity.kind),
		range: toRange(document, entity.range),
		selectionRange: entity.selectionRange && toRange(document, entity.selectionRange),
	};
	const toCoverage = (document: vscode.TextDocument, coverage: protocol.StructuralDiffCoverage): vscode.StructuralDiffCoverage => ({
		textChangeIndex: coverage.textChangeIndex,
		range: toRange(document, coverage.range),
		classification: toClassification(coverage.classification),
		tags: coverage.tags.map(toTag),
	});
	const toNode = (node: protocol.StructuralDiffNode): vscode.StructuralDiffNode => ({
		id: node.id,
		originalItem: toEntity(originalDocument, node.original),
		modifiedItem: toEntity(modifiedDocument, node.modified),
		originalChanges: node.originalChanges.map(coverage => toCoverage(originalDocument, coverage)),
		modifiedChanges: node.modifiedChanges.map(coverage => toCoverage(modifiedDocument, coverage)),
		children: node.children.map(toNode),
	});
	return { root: toNode(result.root), isIncomplete: result.isIncomplete };
}

function getName(entity: protocol.StructuralDiffItem): string {
	switch (entity.languageKind) {
		case 'imports':
			return vscode.l10n.t('Imports');
		case 'exports':
			return vscode.l10n.t('Exports');
		default:
			return entity.name;
	}
}

function toSymbolKind(kind: protocol.StructuralDiffSymbolKind): vscode.SymbolKind {
	switch (kind) {
		case protocol.StructuralDiffSymbolKind.File:
			return vscode.SymbolKind.File;
		case protocol.StructuralDiffSymbolKind.Module:
			return vscode.SymbolKind.Module;
		case protocol.StructuralDiffSymbolKind.Class:
			return vscode.SymbolKind.Class;
		case protocol.StructuralDiffSymbolKind.Method:
			return vscode.SymbolKind.Method;
		case protocol.StructuralDiffSymbolKind.Property:
			return vscode.SymbolKind.Property;
		case protocol.StructuralDiffSymbolKind.Constructor:
			return vscode.SymbolKind.Constructor;
		case protocol.StructuralDiffSymbolKind.Enum:
			return vscode.SymbolKind.Enum;
		case protocol.StructuralDiffSymbolKind.Interface:
			return vscode.SymbolKind.Interface;
		case protocol.StructuralDiffSymbolKind.Function:
			return vscode.SymbolKind.Function;
		case protocol.StructuralDiffSymbolKind.Variable:
			return vscode.SymbolKind.Variable;
		case protocol.StructuralDiffSymbolKind.Object:
			return vscode.SymbolKind.Object;
		case protocol.StructuralDiffSymbolKind.Array:
			return vscode.SymbolKind.Array;
		case protocol.StructuralDiffSymbolKind.EnumMember:
			return vscode.SymbolKind.EnumMember;
	}
}

function toClassification(classification: protocol.StructuralDiffClassification): vscode.StructuralDiffClassification {
	switch (classification) {
		case protocol.StructuralDiffClassification.Declaration:
			return vscode.StructuralDiffClassification.Declaration;
		case protocol.StructuralDiffClassification.Header:
			return vscode.StructuralDiffClassification.Header;
		case protocol.StructuralDiffClassification.Implementation:
			return vscode.StructuralDiffClassification.Implementation;
		case protocol.StructuralDiffClassification.Dependency:
			return vscode.StructuralDiffClassification.Dependency;
		case protocol.StructuralDiffClassification.Other:
			return vscode.StructuralDiffClassification.Other;
	}
}

function toTag(tag: protocol.StructuralDiffTag): vscode.StructuralDiffTag {
	switch (tag) {
		case protocol.StructuralDiffTag.Test:
			return vscode.StructuralDiffTag.Test;
	}
}
