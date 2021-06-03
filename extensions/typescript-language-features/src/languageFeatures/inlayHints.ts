/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as Proto from '../protocol';
import { DocumentSelector } from '../utils/documentSelector';
import { ClientCapability, ITypeScriptServiceClient, ServerResponse, ExecConfig } from '../typescriptService';
import { conditionalRegistration, requireMinVersion, requireSomeCapability } from '../utils/dependentRegistration';
import { Position } from '../utils/typeConverters';
import FileConfigurationManager, { getInlayHintsPreferences } from './fileConfigurationManager';
import API from '../utils/api';
import { isTypeScriptDocument } from '../utils/languageModeIds';

namespace ExperimentalProto {
	export const enum CommandTypes {
		ProvideInlineHints = 'ProvideInlayHints'
	}

	export interface ProvideInlayHintsArgs extends Proto.FileRequestArgs {
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
		arguments: ProvideInlayHintsArgs;
	}

	export enum InlayHintKind {
		Other = 0,
		Type = 1,
		Parameter = 2,
	}

	interface InlayHintItem {
		text: string;
		position: Proto.Location;
		kind?: InlayHintKind;
		whitespaceBefore?: boolean;
		whitespaceAfter?: boolean;
	}

	export interface ProvideInlayHintsResponse extends Proto.Response {
		body?: InlayHintItem[];
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
		'provideInlayHints': [ProvideInlayHintsArgs, ProvideInlayHintsResponse];
	}
}

class TypeScriptInlayHintsProvider implements vscode.InlayHintsProvider {
	public static readonly minVersion = API.v440;

	constructor(
		private readonly client: ITypeScriptServiceClient,
		private readonly fileConfigurationManager: FileConfigurationManager
	) { }

	async provideInlayHints(model: vscode.TextDocument, range: vscode.Range, token: vscode.CancellationToken): Promise<vscode.InlayHint[]> {
		const filepath = this.client.toOpenedFilePath(model);
		if (!filepath) {
			return [];
		}

		await this.fileConfigurationManager.ensureConfigurationForDocument(model, token);

		if (!this.someInlayHintsEnabled(model)) {
			return [];
		}

		const start = model.offsetAt(range.start);
		const length = model.offsetAt(range.end) - start;

		const response = await (this.client as ExperimentalProto.IExtendedTypeScriptServiceClient).execute('provideInlayHints', { file: filepath, start, length }, token);
		if (response.type !== 'response' || !response.success || !response.body) {
			return [];
		}

		return response.body.map(hint => {
			const result = new vscode.InlayHint(hint.text, Position.fromLocation(hint.position), hint.kind);
			result.whitespaceBefore = hint.whitespaceBefore;
			result.whitespaceAfter = hint.whitespaceAfter;
			return result;
		});
	}

	private someInlayHintsEnabled(model: vscode.TextDocument) {
		const config = vscode.workspace.getConfiguration(isTypeScriptDocument(model) ? 'typescript' : 'javascript', model.uri);
		const preferences = getInlayHintsPreferences(config);
		return Object.values(preferences).some(Boolean);
	}
}

export function register(
	selector: DocumentSelector,
	client: ITypeScriptServiceClient,
	fileConfigurationManager: FileConfigurationManager
) {
	return conditionalRegistration([
		requireMinVersion(client, TypeScriptInlayHintsProvider.minVersion),
		requireSomeCapability(client, ClientCapability.Semantic),
	], () => {
		return vscode.languages.registerInlayHintsProvider(selector.semantic,
			new TypeScriptInlayHintsProvider(client, fileConfigurationManager));
	});
}
