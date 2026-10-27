/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { API } from '@typescript/native/unstable/async';
import type { SourceFile } from '@typescript/native/unstable/ast';
import type * as vscode from 'vscode';
import type { ILogService } from '../../../../platform/log/common/logService';
import { CancellationError } from '../../../../util/vs/base/common/errors';
import { DisposableStore } from '../../../../util/vs/base/common/lifecycle';
import { computeStructuralDiff } from './structuralDiff';
import { TypeScript7Api } from './ts7Api';

type StructuralDiffApi = Pick<API<true>, 'clearSourceFileCache' | 'updateSnapshot' | 'runWithTemporaryFileUpdate'>;

interface StructuralDiffApiProvider extends vscode.Disposable {
	getApi(): Promise<StructuralDiffApi | undefined>;
}

/**
 * Analyzes both versions in the modified file's TS7 project using isolated temporary snapshots.
 */
export class TS7StructuralDiffProvider implements vscode.StructuralDiffProvider, vscode.Disposable {
	private readonly disposables = new DisposableStore();
	private readonly nativeApi: StructuralDiffApiProvider;

	constructor(logService: ILogService, nativeApi: StructuralDiffApiProvider = new TypeScript7Api(logService)) {
		this.nativeApi = this.disposables.add(nativeApi);
	}

	async provideStructuralDiff(originalDocument: vscode.TextDocument, modifiedDocument: vscode.TextDocument, context: vscode.StructuralDiffContext, token: vscode.CancellationToken): Promise<vscode.StructuralDiff | undefined> {
		if (modifiedDocument.uri.scheme !== 'file' || (modifiedDocument.languageId !== 'typescript' && modifiedDocument.languageId !== 'typescriptreact')) {
			return undefined;
		}
		const originalVersion = originalDocument.version;
		const modifiedVersion = modifiedDocument.version;
		const checkCancellation = () => {
			if (token.isCancellationRequested || originalDocument.isClosed || modifiedDocument.isClosed
				|| originalDocument.version !== originalVersion || modifiedDocument.version !== modifiedVersion) {
				throw new CancellationError();
			}
		};
		checkCancellation();
		const originalText = originalDocument.getText();
		const modifiedText = modifiedDocument.getText();
		const api = await this.nativeApi.getApi();
		checkCancellation();
		if (api === undefined) {
			return undefined;
		}
		const file = { uri: modifiedDocument.uri.toString() };
		api.clearSourceFileCache();
		const snapshot = await api.updateSnapshot({ openFiles: [file] });
		let result: vscode.StructuralDiff | undefined;
		try {
			checkCancellation();
			const readSource = async (text: string): Promise<SourceFile | undefined> => {
				let sourceFile: SourceFile | undefined;
				await api.runWithTemporaryFileUpdate(snapshot, file, text, async temporarySnapshot => {
					checkCancellation();
					const project = await temporarySnapshot.getDefaultProjectForFile(file);
					sourceFile = await project?.program.getSourceFile(file);
					checkCancellation();
					if (sourceFile !== undefined && sourceFile.text !== text) {
						throw new Error('TypeScript structural diff snapshot does not match the requested document');
					}
				});
				checkCancellation();
				return sourceFile;
			};
			const original = await readSource(originalText);
			const modified = await readSource(modifiedText);
			if (original !== undefined && modified !== undefined) {
				checkCancellation();
				result = computeStructuralDiff(original, modified, context, token);
			}
		} finally {
			try {
				await snapshot.dispose();
			} finally {
				const closedSnapshot = await api.updateSnapshot({ closeFiles: [file] });
				await closedSnapshot.dispose();
			}
		}
		checkCancellation();
		return result;
	}

	dispose(): void {
		this.disposables.dispose();
	}
}
