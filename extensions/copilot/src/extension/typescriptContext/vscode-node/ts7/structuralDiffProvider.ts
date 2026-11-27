/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SourceFile } from '@typescript/native/ast';
import type * as vscode from 'vscode';
import type { ILogService } from '../../../../platform/log/common/logService';
import { DisposableStore } from '../../../../util/vs/base/common/lifecycle';
import { StructuralDiffDocuments } from '../structuralDiffDocuments';
import { computeStructuralDiff } from './structuralDiff';
import { TypeScript7Api } from './ts7Api';

/**
 * The part of the TypeScript 7 API that parses a text without a program. The server keeps a parsed text until it is
 * disposed.
 */
interface StructuralDiffApi {
	createSourceFile(fileName: string, sourceText: string): Promise<{ readonly sourceFile: SourceFile; dispose(): Promise<void> }>;
}

interface StructuralDiffApiProvider extends vscode.Disposable {
	getApi(): Promise<StructuralDiffApi | undefined>;
}

/**
 * Parses only the supplied document contents, independently of any project, so that computing a structural diff
 * neither updates a project nor discards its type checker. The backing file only determines how the contents are
 * parsed, for example as TSX.
 */
export class TS7StructuralDiffProvider implements vscode.StructuralDiffProvider, vscode.Disposable {
	private readonly disposables = new DisposableStore();
	private readonly nativeApi: StructuralDiffApiProvider;

	constructor(logService: ILogService, nativeApi: StructuralDiffApiProvider = new TypeScript7Api(logService)) {
		this.nativeApi = this.disposables.add(nativeApi);
	}

	async provideStructuralDiff(originalDocument: vscode.TextDocument, modifiedDocument: vscode.TextDocument, context: vscode.StructuralDiffContext, token: vscode.CancellationToken): Promise<vscode.StructuralDiff | undefined> {
		const fileUri = StructuralDiffDocuments.getBackingFile(modifiedDocument);
		if (fileUri === undefined) {
			return undefined;
		}
		const checkCancellation = StructuralDiffDocuments.createCancellationCheck(originalDocument, modifiedDocument, token);
		checkCancellation();
		const originalText = originalDocument.getText();
		const modifiedText = modifiedDocument.getText();
		const api = await this.nativeApi.getApi();
		checkCancellation();
		if (api === undefined) {
			return undefined;
		}
		let result: vscode.StructuralDiff;
		const original = await api.createSourceFile(fileUri.fsPath, originalText);
		try {
			checkCancellation();
			const modified = await api.createSourceFile(fileUri.fsPath, modifiedText);
			try {
				checkCancellation();
				result = computeStructuralDiff(original.sourceFile, modified.sourceFile, context, token);
			} finally {
				await modified.dispose();
			}
		} finally {
			await original.dispose();
		}
		checkCancellation();
		return result;
	}

	dispose(): void {
		this.disposables.dispose();
	}
}
