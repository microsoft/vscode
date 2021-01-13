/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as Proto from '../protocol';
import { DocumentSelector } from '../utils/documentSelector';
import { ClientCapability, ITypeScriptServiceClient, ServerResponse, ExecConfig } from '../typescriptService';
import { conditionalRegistration, requireSomeCapability } from '../utils/dependentRegistration';
import { Range } from '../utils/typeConverters';

namespace ExperimentalProto {
	export const enum CommandTypes {
		ProvideInlineHints = 'ProvideInlineHints'
	}

	export interface ProvideInlineHintsArgs extends Proto.FileRequestArgs {
		/**
		 * Start position of the span.
		 */
		start: number;
		/**
		 * Length of the span.
		 */
		length: number;
	}

	export interface ProvideInlineHintsRequest extends Proto.Request {
		command: CommandTypes.ProvideInlineHints;
		arguments: ProvideInlineHintsArgs;
	}

	interface HintItem {
		text: string;
		range: Proto.TextSpan;
		whitespaceBefore?: boolean;
		whitespaceAfter?: boolean;
	}

	export interface ProvideInlineHintsResponse extends Proto.Response {
		body?: HintItem[];
	}

	export interface IExtendedTypeScriptServiceClient {
		execute<K extends keyof ExtendedTsServerRequests>(
			command: K,
			args: ExtendedTsServerRequests[K][0],
			token: vscode.CancellationToken,
			config?: ExecConfig
		): Promise<ServerResponse.Response<ExtendedTsServerRequests[K][1]>>;
	}

	export interface ExtendedTsServerRequests {
		'provideInlineHints': [ProvideInlineHintsArgs, ProvideInlineHintsResponse];
	}
}

class TypeScriptInlineHintsProvider implements vscode.InlineHintsProvider {
	constructor(
		private readonly client: ITypeScriptServiceClient
	) { }

	async provideInlineHints(model: vscode.TextDocument, range: vscode.Range, token: vscode.CancellationToken): Promise<vscode.InlineHint[]> {
		const filepath = this.client.toOpenedFilePath(model);
		if (!filepath) {
			return [];
		}

		const start = model.offsetAt(range.start);
		const length = model.offsetAt(range.end) - start;

		try {
			const response = await (this.client as ExperimentalProto.IExtendedTypeScriptServiceClient).execute('provideInlineHints', { file: filepath, start, length }, token);
			if (response.type !== 'response' || !response.success || !response.body) {
				return [];
			}

			return response.body.map(hint => {
				return new vscode.InlineHint(hint.text, Range.fromTextSpan(hint.range), hint.whitespaceBefore, hint.whitespaceAfter);
			});
		} catch (e) {
			return [];
		}
	}
}

export function register(
	selector: DocumentSelector,
	client: ITypeScriptServiceClient
) {
	return conditionalRegistration([
		requireSomeCapability(client, ClientCapability.Semantic),
	], () => {
		return vscode.languages.registerInlineHintsProvider(selector.semantic,
			new TypeScriptInlineHintsProvider(client));
	});
}
