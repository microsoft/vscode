/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import type { DocumentIdentifier, Snapshot } from '@typescript/native/unstable/async';
import type * as vscode from 'vscode';

import type { ILogService } from '../../../../platform/log/common/logService';
import type { ITypeScriptMetricsService, TypeScriptMetricsResult } from '../../../../platform/languageContextProvider/common/typeScriptMetrics';
import { DisposableStore } from '../../../../util/vs/base/common/lifecycle';
import { TypeScript7Api } from './ts7Api';
import { computeTypeScriptMetrics } from './codeMetrics';
import { toTypeScriptMetricsResult } from '../typeScriptMetrics';

interface TypeScriptMetricsApi {
	clearSourceFileCache(): void;
	updateSnapshot(params?: { openFiles?: DocumentIdentifier[]; closeFiles?: DocumentIdentifier[] }): Promise<Snapshot>;
	runWithTemporaryFileUpdate(baseSnapshot: Snapshot, file: DocumentIdentifier, newText: string, callback: (snapshot: Snapshot) => void | Promise<void>): Promise<void>;
}

interface TypeScriptMetricsApiProvider extends vscode.Disposable {
	getApi(): Promise<TypeScriptMetricsApi | undefined>;
}

export class TS7TypeScriptMetricsProvider implements Omit<ITypeScriptMetricsService, '_serviceBrand'>, vscode.Disposable {
	private readonly disposables = new DisposableStore();
	private readonly nativeApi: TypeScriptMetricsApiProvider;

	constructor(logService: ILogService, nativeApi: TypeScriptMetricsApiProvider = new TypeScript7Api(logService)) {
		this.nativeApi = this.disposables.add(nativeApi);
	}

	async computeMetrics(filePath: string, content?: string): Promise<TypeScriptMetricsResult | undefined> {
		const api = await this.nativeApi.getApi();
		if (api === undefined) {
			return undefined;
		}

		api.clearSourceFileCache();
		const snapshot = await api.updateSnapshot({ openFiles: [filePath] });
		try {
			if (content === undefined) {
				return await this.computeSnapshot(snapshot, filePath);
			}

			let result: TypeScriptMetricsResult | undefined;
			await api.runWithTemporaryFileUpdate(snapshot, filePath, content, async updatedSnapshot => {
				result = await this.computeSnapshot(updatedSnapshot, filePath);
			});
			return result;
		} finally {
			await snapshot.dispose();
			const closedSnapshot = await api.updateSnapshot({ closeFiles: [filePath] });
			await closedSnapshot.dispose();
		}
	}

	dispose(): void {
		this.disposables.dispose();
	}

	private async computeSnapshot(snapshot: Snapshot, filePath: string): Promise<TypeScriptMetricsResult | undefined> {
		const project = await snapshot.getDefaultProjectForFile(filePath);
		const sourceFile = await project?.program.getSourceFile(filePath);
		return sourceFile === undefined ? undefined : toTypeScriptMetricsResult(computeTypeScriptMetrics(sourceFile));
	}
}
