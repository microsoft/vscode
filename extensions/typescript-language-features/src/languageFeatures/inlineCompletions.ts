/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import type * as Proto from '../protocol';
import { ClientCapability, ITypeScriptServiceClient } from '../typescriptService';
import API from '../utils/api';
import { conditionalRegistration, requireMinVersion, requireSomeCapability } from '../utils/dependentRegistration';
import { Disposable } from '../utils/dispose';
import { DocumentSelector } from '../utils/documentSelector';
import { Range } from '../utils/typeConverters';
import FileConfigurationManager from './fileConfigurationManager';

namespace ExperimentalProto {
	const enum CommandTypes {
		ProvideInlineCompletions = 'provideInlineCompletions',
	}

	export const enum InlineCompletionTriggerKind {
		Automatic = 0,
		Explicit = 1,
	}

	export interface InlineCompletionSelectedCompletionInfo {
		span?: Proto.TextSpan;
		text: string;
	}

	export interface InlineCompletionsArgs extends Proto.FileRequestArgs {
		position: number;
		triggerKind: InlineCompletionTriggerKind;
		selectedCompletionInfo: InlineCompletionSelectedCompletionInfo | undefined;
	}

	export interface InlineCompletionsRequest extends Proto.Request {
		command: CommandTypes.ProvideInlineCompletions;
		arguments: InlineCompletionsArgs;
	}

	export interface InlineCompletionItem {
		text: string;
		span?: Proto.TextSpan;
	}

	export interface InlineCompletionsResponse extends Proto.Response {
		body?: InlineCompletionItem[];
	}

	interface StandardTsServerRequests {
		'provideInlineCompletions': [InlineCompletionsArgs, InlineCompletionsResponse];
	}

	export interface IInlineCompletionsTypeScriptServiceClient {
		execute<K extends keyof StandardTsServerRequests>(
			command: K,
			args: StandardTsServerRequests[K][0],
			token: vscode.CancellationToken
		): Promise<StandardTsServerRequests[K][1]>;
	}
}

class TypeScriptInlineCompletionsProvider extends Disposable implements vscode.InlineCompletionItemProvider {

	public static readonly minVersion = API.v460;

	constructor(
		_modeId: string,
		_languageIds: readonly string[],
		private readonly client: ITypeScriptServiceClient,
		private readonly fileConfigurationManager: FileConfigurationManager
	) {
		super();
	}

	async provideInlineCompletionItems(model: vscode.TextDocument, position: vscode.Position, context: vscode.InlineCompletionContext, token: vscode.CancellationToken): Promise<vscode.InlineCompletionItem[]> {
		const filepath = this.client.toOpenedFilePath(model);
		if (!filepath) {
			return [];
		}

		const offset = model.offsetAt(position);

		await this.fileConfigurationManager.ensureConfigurationForDocument(model, token);

		const client = this.client as ExperimentalProto.IInlineCompletionsTypeScriptServiceClient;
		const response = await client.execute('provideInlineCompletions', {
			file: filepath,
			position: offset,
			triggerKind: toProtocolTriggerKind(context.triggerKind),
			selectedCompletionInfo: context.selectedCompletionInfo
		}, token);
		if (response.type !== 'response' || !response.success || !response.body) {
			return [];
		}

		return response.body.map(item => {
			const result = new vscode.InlineCompletionItem(
				item.text,
				item.span ? Range.fromTextSpan(item.span) : undefined
			);
			return result;
		});
	}
}

function toProtocolTriggerKind(kind: vscode.InlineCompletionTriggerKind): ExperimentalProto.InlineCompletionTriggerKind {
	switch (kind) {
		case vscode.InlineCompletionTriggerKind.Automatic: return ExperimentalProto.InlineCompletionTriggerKind.Automatic;
		case vscode.InlineCompletionTriggerKind.Explicit: return ExperimentalProto.InlineCompletionTriggerKind.Explicit;
	}
}

export function register(
	selector: DocumentSelector,
	modeId: string,
	languageIds: readonly string[],
	client: ITypeScriptServiceClient,
	fileConfigurationManager: FileConfigurationManager
) {
	return conditionalRegistration([
		requireMinVersion(client, TypeScriptInlineCompletionsProvider.minVersion),
		requireSomeCapability(client, ClientCapability.Semantic),
	], () => {
		const provider = new TypeScriptInlineCompletionsProvider(modeId, languageIds, client, fileConfigurationManager);
		return vscode.languages.registerInlineCompletionItemProvider(selector.semantic, provider);
	});
}
