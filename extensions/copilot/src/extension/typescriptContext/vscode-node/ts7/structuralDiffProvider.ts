/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isAbsolute } from 'node:path';
import type { API } from '@typescript/native/async';
import type { SourceFile } from '@typescript/native/ast';
import type * as vscode from 'vscode';
import type { ILogService } from '../../../../platform/log/common/logService';
import { CancellationError } from '../../../../util/vs/base/common/errors';
import { DisposableStore } from '../../../../util/vs/base/common/lifecycle';
import { URI } from '../../../../util/vs/base/common/uri';
import { computeStructuralDiff } from './structuralDiff';
import { TypeScript7Api } from './ts7Api';

type StructuralDiffApi = Pick<API<true>, 'clearSourceFileCache' | 'createSnapshot' | 'runWithTemporaryFileUpdate'>;

interface StructuralDiffApiProvider extends vscode.Disposable {
	getApi(): Promise<StructuralDiffApi | undefined>;
}

/**
 * Uses the backing file for TS7 project lookup and analyzes only the supplied document contents in isolated snapshots.
 */
export class TS7StructuralDiffProvider implements vscode.StructuralDiffProvider, vscode.Disposable {
	private readonly disposables = new DisposableStore();
	private readonly nativeApi: StructuralDiffApiProvider;

	constructor(logService: ILogService, nativeApi: StructuralDiffApiProvider = new TypeScript7Api(logService)) {
		this.nativeApi = this.disposables.add(nativeApi);
	}

	async provideStructuralDiff(originalDocument: vscode.TextDocument, modifiedDocument: vscode.TextDocument, context: vscode.StructuralDiffContext, token: vscode.CancellationToken): Promise<vscode.StructuralDiff | undefined> {
		if ((modifiedDocument.uri.scheme !== 'file' && modifiedDocument.uri.scheme !== 'git')
			|| (modifiedDocument.languageId !== 'typescript' && modifiedDocument.languageId !== 'typescriptreact')) {
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
		let fileUri = modifiedDocument.uri;
		if (fileUri.scheme === 'git') {
			const params: unknown = JSON.parse(fileUri.query);
			if (typeof params !== 'object' || params === null
				|| !('path' in params) || typeof params.path !== 'string' || !isAbsolute(params.path)
				|| !('ref' in params) || typeof params.ref !== 'string') {
				throw new Error('TypeScript structural diff requires a Git URI with an absolute file path and a string ref');
			}
			fileUri = URI.file(params.path);
		}
		const originalText = originalDocument.getText();
		const modifiedText = modifiedDocument.getText();
		const api = await this.nativeApi.getApi();
		checkCancellation();
		if (api === undefined) {
			return undefined;
		}
		const file = { uri: fileUri.toString() };
		api.clearSourceFileCache();
		const snapshot = await api.createSnapshot({ openFiles: [file] });
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
				const closedSnapshot = await api.createSnapshot({ closeFiles: [file] });
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
