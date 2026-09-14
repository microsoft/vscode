/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';

import type { ITypeScriptMetricsService, TypeScriptMetricsResult } from '../../../../platform/languageContextProvider/common/typeScriptMetrics';
import * as protocol from '../../common/serverProtocol';
import { toTypeScriptMetricsResult } from '../typeScriptMetrics';

enum ExecutionTarget {
	Semantic,
	Syntax
}

type ExecConfig = {
	readonly executionTarget?: ExecutionTarget;
};

type TypeScriptMetricsRequestArgs = Omit<protocol.TypeScriptMetricsRequestArgs, 'file' | 'projectFileName' | 'line' | 'offset'> & {
	file: vscode.Uri;
	line: number;
	offset: number;
};

export class TS6TypeScriptMetricsProvider implements Omit<ITypeScriptMetricsService, '_serviceBrand'>, vscode.Disposable {
	private static readonly ExecConfig: ExecConfig = { executionTarget: ExecutionTarget.Semantic };

	async computeMetrics(filePath: string, content?: string): Promise<TypeScriptMetricsResult | undefined> {
		const args: TypeScriptMetricsRequestArgs = {
			file: vscode.Uri.file(filePath),
			line: 1,
			offset: 1,
			content,
		};
		const response = await vscode.commands.executeCommand<protocol.TypeScriptMetricsResponse | undefined>(
			'typescript.tsserverRequest',
			'_.copilot.typeScriptMetrics',
			args,
			TS6TypeScriptMetricsProvider.ExecConfig,
		);
		if (protocol.TypeScriptMetricsResponse.isError(response)) {
			throw new Error(`TypeScript metrics request failed: ${response.body.message}`);
		}
		return protocol.TypeScriptMetricsResponse.isOk(response) ? toTypeScriptMetricsResult(response.body) : undefined;
	}

	dispose(): void {
		// No resources to dispose for the TS6 implementation.
	}
}
