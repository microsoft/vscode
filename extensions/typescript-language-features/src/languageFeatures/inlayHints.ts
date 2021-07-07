/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as Proto from '../protocol';
import { DocumentSelector } from '../utils/documentSelector';
import { ClientCapability, ITypeScriptServiceClient, ServerResponse, ExecConfig } from '../typescriptService';
import { Condition, conditionalRegistration, requireMinVersion, requireSomeCapability } from '../utils/dependentRegistration';
import { Position } from '../utils/typeConverters';
import FileConfigurationManager, { getInlayHintsPreferences } from './fileConfigurationManager';
import API from '../utils/api';

namespace ExperimentalProto {
	export const enum CommandTypes {
		ProvideInlineHints = 'ProvideInlayHints'
	}

	export interface InlayHintsArgs extends Proto.FileRequestArgs {
		/**
		 * Start position of the span.
		 */
		start: number;
		/**
		 * Length of the span.
		 */
		length: number;
	}

	export interface InlineHintsRequest extends Proto.Request {
		command: CommandTypes.ProvideInlineHints;
		arguments: InlayHintsArgs;
	}

	export enum InlayHintKind {
		Type = 'Type',
		Parameter = 'Parameter',
		Enum = 'Enum'
	}

	interface InlayHintItem {
		text: string;
		position: Proto.Location;
		kind?: InlayHintKind;
		whitespaceBefore?: boolean;
		whitespaceAfter?: boolean;
	}

	export interface InlayHintsResponse extends Proto.Response {
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
		'provideInlayHints': [InlayHintsArgs, InlayHintsResponse];
	}

	export namespace InlayHintKind {
		export function fromProtocolInlayHintKind(kind: InlayHintKind): vscode.InlayHintKind {
			switch (kind) {
				case InlayHintKind.Parameter:
					return vscode.InlayHintKind.Parameter;
				case InlayHintKind.Type:
					return vscode.InlayHintKind.Type;
				case InlayHintKind.Enum:
					return vscode.InlayHintKind.Other;
				default:
					return vscode.InlayHintKind.Other;
			}
		}
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

		const start = model.offsetAt(range.start);
		const length = model.offsetAt(range.end) - start;

		const response = await (this.client as ExperimentalProto.IExtendedTypeScriptServiceClient).execute('provideInlayHints', { file: filepath, start, length }, token);
		if (response.type !== 'response' || !response.success || !response.body) {
			return [];
		}

		return response.body.map(hint => {
			const result = new vscode.InlayHint(
				hint.text,
				Position.fromLocation(hint.position),
				hint.kind && ExperimentalProto.InlayHintKind.fromProtocolInlayHintKind(hint.kind)
			);
			result.whitespaceBefore = hint.whitespaceBefore;
			result.whitespaceAfter = hint.whitespaceAfter;
			return result;
		});
	}
}

export function requireInlayHintsConfiguration(
	language: string
) {
	return new Condition(
		() => {
			const config = vscode.workspace.getConfiguration(language, null);
			const preferences = getInlayHintsPreferences(config);

			return preferences.includeInlayParameterNameHints === 'literals' ||
				preferences.includeInlayParameterNameHints === 'all' ||
				preferences.includeInlayEnumMemberValueHints ||
				preferences.includeInlayFunctionLikeReturnTypeHints ||
				preferences.includeInlayFunctionParameterTypeHints ||
				preferences.includeInlayPropertyDeclarationTypeHints ||
				preferences.includeInlayVariableTypeHints;
		},
		vscode.workspace.onDidChangeConfiguration
	);
}

export function register(
	selector: DocumentSelector,
	modeId: string,
	client: ITypeScriptServiceClient,
	fileConfigurationManager: FileConfigurationManager
) {
	return conditionalRegistration([
		requireInlayHintsConfiguration(modeId),
		requireMinVersion(client, TypeScriptInlayHintsProvider.minVersion),
		requireSomeCapability(client, ClientCapability.Semantic),
	], () => {
		return vscode.languages.registerInlayHintsProvider(selector.semantic,
			new TypeScriptInlayHintsProvider(client, fileConfigurationManager));
	});
}
