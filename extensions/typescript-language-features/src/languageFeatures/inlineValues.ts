/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as Proto from '../protocol';
import { DocumentSelector } from '../utils/documentSelector';
import { ClientCapability, ITypeScriptServiceClient, ServerResponse, ExecConfig } from '../typescriptService';
import { conditionalRegistration, requireMinVersion, requireSomeCapability } from '../utils/dependentRegistration';
import { Range } from '../utils/typeConverters';
import API from '../utils/api';
import { Disposable } from '../utils/dispose';

namespace ExperimentalProto {
	export const enum CommandTypes {
		ProvideInlineValues = 'provideInlineValues'
	}

	export interface InlineValuesArgs extends Proto.FileLocationRequestArgs {
		/**
		 * Start position of the span.
		 */
		start: number;
		/**
		 * Length of the span.
		 */
		length: number;
	}

	export interface InlineValuesRequest extends Proto.Request {
		command: CommandTypes.ProvideInlineValues;
		arguments: InlineValuesArgs;
	}

	export interface InlineValuesResponse extends Proto.Response {
		body: InlineValue[]
	}

	export const enum InlineValueType {
		VariableLookup = 'VariableLookup',
		EvaluatableExpression = 'EvaluatableExpression'
	}

	export interface InlineValueVariableLookup {
		readonly type: InlineValueType.VariableLookup
		readonly span: Proto.TextSpan;
		readonly variableName: string;
	}

	export interface InlineValueEvaluatableExpression {
		readonly type: InlineValueType.EvaluatableExpression;
		readonly span: Proto.TextSpan;
		readonly expression: string;
	}

	export type InlineValue = InlineValueVariableLookup | InlineValueEvaluatableExpression;


	export interface IExtendedTypeScriptServiceClient {
		execute<K extends keyof ExtendedTsServerRequests>(
			command: K,
			args: ExtendedTsServerRequests[K][0],
			token: vscode.CancellationToken,
			config?: ExecConfig
		): Promise<ServerResponse.Response<ExtendedTsServerRequests[K][1]>>;
	}

	export interface ExtendedTsServerRequests {
		'provideInlineValues': [InlineValuesArgs, InlineValuesResponse];
	}
}

class TypeScriptInlineValuesProvider extends Disposable implements vscode.InlineValuesProvider {
	public static readonly minVersion = API.v440;

	constructor(
		private readonly client: ITypeScriptServiceClient
	) {
		super();
	}

	async provideInlineValues(model: vscode.TextDocument, range: vscode.Range, context: vscode.InlineValueContext, token: vscode.CancellationToken): Promise<vscode.InlineValue[]> {
		const filepath = this.client.toOpenedFilePath(model);
		if (!filepath) {
			return [];
		}

		const start = model.offsetAt(range.start);
		const length = model.offsetAt(range.end) - start;
		const location = context.stoppedLocation.start;

		const response = await (this.client as ExperimentalProto.IExtendedTypeScriptServiceClient).execute(
			'provideInlineValues',
			{ file: filepath, start, length, line: location.line, offset: location.character },
			token
		);
		if (response.type !== 'response' || !response.success || !response.body) {
			return [];
		}

		const results = response.body.map(value => {
			const range = Range.fromTextSpan(value.span);
			if (value.type === ExperimentalProto.InlineValueType.EvaluatableExpression) {
				return new vscode.InlineValueEvaluatableExpression(
					range,
					value.expression
				);
			} else {
				return new vscode.InlineValueVariableLookup(
					range,
					value.variableName
				);
			}
		});
		return results;
	}

}
export function register(
	selector: DocumentSelector,
	client: ITypeScriptServiceClient
) {
	return conditionalRegistration([
		requireMinVersion(client, TypeScriptInlineValuesProvider.minVersion),
		requireSomeCapability(client, ClientCapability.Semantic),
	], () => {
		const provider = new TypeScriptInlineValuesProvider(client);
		return vscode.languages.registerInlineValuesProvider(selector.semantic, provider);
	});
}
