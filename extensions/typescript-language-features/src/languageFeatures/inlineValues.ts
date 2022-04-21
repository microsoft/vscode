/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { DocumentSelector } from '../utils/documentSelector';
import { ClientCapability, ITypeScriptServiceClient, ServerResponse, ExecConfig } from '../typescriptService';
import { conditionalRegistration, requireMinVersion, requireSomeCapability } from '../utils/dependentRegistration';
import API from '../utils/api';
import { Disposable } from '../utils/dispose';
import type * as ExtraProto from 'ts-plugin-inline-values/dist/proto';

namespace ExperimentalProto {
	type InlineValueResponse = ExtraProto.InlineValuesResponse;

	export interface IExtendedTypeScriptServiceClient {
		execute<K extends keyof ExtendedTsServerRequests>(
			command: K,
			args: ExtendedTsServerRequests[K][0],
			token: vscode.CancellationToken,
			config?: ExecConfig
		): Promise<ServerResponse.Response<ExtendedTsServerRequests[K][1]>>;
	}

	export interface ExtendedTsServerRequests {
		'typescript/builtin/provideInlineValues': [ExtraProto.InlineValuesArgs, InlineValueResponse];
	}
}

class TypeScriptInlineValuesProvider extends Disposable implements vscode.InlineValuesProvider {
	public static readonly minVersion = API.v460;

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

		const position = model.offsetAt(context.stoppedLocation.start);
		const start = model.offsetAt(range.start);
		const end = model.offsetAt(range.end);

		const response = await (this.client as ExperimentalProto.IExtendedTypeScriptServiceClient).execute(
			'typescript/builtin/provideInlineValues',
			{
				file: filepath,
				position,
				start: start,
				length: end - start,
			},
			token
		);
		if (response.type !== 'response' || !response.success || !response.body) {
			return [];
		}

		const results = response.body.map(value => {
			if (value.type === 'EvaluatableExpression') {
				return new vscode.InlineValueEvaluatableExpression(
					new vscode.Range(
						model.positionAt(value.start),
						model.positionAt(value.start + value.length)
					),
					value.expression
				);
			} else {
				return new vscode.InlineValueVariableLookup(
					new vscode.Range(
						model.positionAt(value.start),
						model.positionAt(value.start + value.length)
					),
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
