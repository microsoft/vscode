/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';

import type { TypeScriptChangeClassificationInput, TypeScriptChangeClassificationResult, TypeScriptMetricsResult } from '../../../../platform/languageContextProvider/common/codeReviewService';
import { CancellationToken } from '../../../../util/vs/base/common/cancellation';
import * as protocol from '../../common/serverProtocol';
import { toTypeScriptChangeClassificationResult, toTypeScriptMetricsResult } from '../codeReview';

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

type TypeScriptChangeClassificationRequestArgs = Omit<protocol.TypeScriptChangeClassificationRequestArgs, 'file' | 'projectFileName' | 'line' | 'offset'> & {
	file: vscode.Uri;
	line: number;
	offset: number;
};

export class TS6CodeReviewProvider implements vscode.Disposable {
	private static readonly ExecConfig: ExecConfig = { executionTarget: ExecutionTarget.Semantic };
	private activation: Promise<boolean> | undefined;

	async computeMetrics(filePath: string, content?: string): Promise<TypeScriptMetricsResult | undefined> {
		const file = await this.prepareFile(filePath);
		if (file === undefined) {
			return undefined;
		}
		const args: TypeScriptMetricsRequestArgs = {
			file,
			line: 1,
			offset: 1,
			content,
		};
		const response = await vscode.commands.executeCommand<protocol.TypeScriptMetricsResponse | undefined>(
			'typescript.tsserverRequest',
			'_.copilot.typeScriptMetrics',
			args,
			TS6CodeReviewProvider.ExecConfig,
		);
		if (protocol.TypeScriptMetricsResponse.isError(response)) {
			throw new Error(`TypeScript metrics request failed: ${response.body.message}`);
		}
		return protocol.TypeScriptMetricsResponse.isOk(response) ? toTypeScriptMetricsResult(response.body) : undefined;
	}

	async classifyChanges(input: TypeScriptChangeClassificationInput): Promise<TypeScriptChangeClassificationResult | undefined> {
		const file = await this.prepareFile(input.filePath);
		if (file === undefined) {
			return undefined;
		}
		const args: TypeScriptChangeClassificationRequestArgs = {
			file,
			line: 1,
			offset: 1,
			modified: input.modified,
			original: input.original,
		};
		const response = await vscode.commands.executeCommand<protocol.TypeScriptChangeClassificationResponse | undefined>(
			'typescript.tsserverRequest',
			'_.copilot.typeScriptChangeClassification',
			args,
			TS6CodeReviewProvider.ExecConfig,
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

	/** Load the document before pinging the project's plugin or resolving its URI in tsserver. */
	private async prepareFile(filePath: string): Promise<vscode.Uri | undefined> {
		const typeScriptExtension = vscode.extensions.getExtension('vscode.typescript-language-features');
		if (typeScriptExtension === undefined) {
			return undefined;
		}
		await typeScriptExtension.activate();
		const file = vscode.Uri.file(filePath);
		await vscode.workspace.openTextDocument(file);
		return await this.ensureActivated() ? file : undefined;
	}

	private ensureActivated(): Promise<boolean> {
		this.activation ??= this.activate();
		return this.activation;
	}

	private async activate(): Promise<boolean> {
		const response = await vscode.commands.executeCommand<protocol.PingResponse | undefined>(
			'typescript.tsserverRequest',
			'_.copilot.ping',
			TS6CodeReviewProvider.ExecConfig,
			CancellationToken.None,
		);
		return response?.body?.kind === 'ok';
	}
}
