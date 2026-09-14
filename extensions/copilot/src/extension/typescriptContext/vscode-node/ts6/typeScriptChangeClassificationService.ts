/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';

import type { ITypeScriptChangeClassificationService, TypeScriptChangeClassificationInput, TypeScriptChangeClassificationResult } from '../../../../platform/languageContextProvider/common/typeScriptChangeClassification';
import * as protocol from '../../common/serverProtocol';
import { toTypeScriptChangeClassificationResult } from '../typeScriptChangeClassification';

enum ExecutionTarget {
	Semantic,
	Syntax
}

type ExecConfig = {
	readonly executionTarget?: ExecutionTarget;
};

type TypeScriptChangeClassificationRequestArgs = Omit<protocol.TypeScriptChangeClassificationRequestArgs, 'file' | 'projectFileName' | 'line' | 'offset'> & {
	file: vscode.Uri;
	line: number;
	offset: number;
};

export class TS6TypeScriptChangeClassificationProvider implements Omit<ITypeScriptChangeClassificationService, '_serviceBrand'>, vscode.Disposable {
	private static readonly ExecConfig: ExecConfig = { executionTarget: ExecutionTarget.Semantic };

	async classifyChanges(filePath: string, changes: TypeScriptChangeClassificationInput, content?: string): Promise<TypeScriptChangeClassificationResult | undefined> {
		const args: TypeScriptChangeClassificationRequestArgs = {
			file: vscode.Uri.file(filePath),
			line: 1,
			offset: 1,
			changes,
			content,
		};
		const response = await vscode.commands.executeCommand<protocol.TypeScriptChangeClassificationResponse | undefined>(
			'typescript.tsserverRequest',
			'_.copilot.typeScriptChangeClassification',
			args,
			TS6TypeScriptChangeClassificationProvider.ExecConfig,
		);
		if (protocol.TypeScriptChangeClassificationResponse.isError(response)) {
			throw new Error(`TypeScript change classification request failed: ${response.body.message}`);
		}
		return protocol.TypeScriptChangeClassificationResponse.isOk(response)
			? toTypeScriptChangeClassificationResult(response.body)
			: undefined;
	}

	dispose(): void {
		// No resources to dispose for the TS6 implementation.
	}
}
