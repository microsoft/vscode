/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import type * as Proto from '../protocol';
import { ClientCapability, ITypeScriptServiceClient } from '../typescriptService';
import API from '../utils/api';
import { Condition, conditionalRegistration, requireMinVersion, requireSomeCapability } from '../utils/dependentRegistration';
import { Disposable } from '../utils/dispose';
import { DocumentSelector } from '../utils/documentSelector';
import { Position } from '../utils/typeConverters';
import FileConfigurationManager, { getInlayHintsPreferences, InlayHintSettingNames } from './fileConfigurationManager';


const inlayHintSettingNames = [
	InlayHintSettingNames.parameterNamesSuppressWhenArgumentMatchesName,
	InlayHintSettingNames.parameterNamesEnabled,
	InlayHintSettingNames.variableTypesEnabled,
	InlayHintSettingNames.propertyDeclarationTypesEnabled,
	InlayHintSettingNames.functionLikeReturnTypesEnabled,
	InlayHintSettingNames.enumMemberValuesEnabled,
];

class TypeScriptInlayHintsProvider extends Disposable implements vscode.InlayHintsProvider {

	public static readonly minVersion = API.v440;

	private readonly _onDidChangeInlayHints = new vscode.EventEmitter<void>();
	public readonly onDidChangeInlayHints = this._onDidChangeInlayHints.event;

	constructor(
		modeId: string,
		languageIds: readonly string[],
		private readonly client: ITypeScriptServiceClient,
		private readonly fileConfigurationManager: FileConfigurationManager
	) {
		super();

		this._register(vscode.workspace.onDidChangeConfiguration(e => {
			if (inlayHintSettingNames.some(settingName => e.affectsConfiguration(modeId + '.' + settingName))) {
				this._onDidChangeInlayHints.fire();
			}
		}));

		// When a JS/TS file changes, change inlay hints for all visible editors
		// since changes in one file can effect the hints the others.
		this._register(vscode.workspace.onDidChangeTextDocument(e => {
			if (languageIds.includes(e.document.languageId)) {
				this._onDidChangeInlayHints.fire();
			}
		}));
	}

	async provideInlayHints(model: vscode.TextDocument, range: vscode.Range, token: vscode.CancellationToken): Promise<vscode.InlayHint[]> {
		const filepath = this.client.toOpenedFilePath(model);
		if (!filepath) {
			return [];
		}

		const start = model.offsetAt(range.start);
		const length = model.offsetAt(range.end) - start;

		await this.fileConfigurationManager.ensureConfigurationForDocument(model, token);

		const response = await this.client.execute('provideInlayHints', { file: filepath, start, length }, token);
		if (response.type !== 'response' || !response.success || !response.body) {
			return [];
		}

		return response.body.map(hint => {
			const result = new vscode.InlayHint(
				hint.text,
				Position.fromLocation(hint.position),
				hint.kind && fromProtocolInlayHintKind(hint.kind)
			);
			result.whitespaceBefore = hint.whitespaceBefore;
			result.whitespaceAfter = hint.whitespaceAfter;
			return result;
		});
	}
}


function fromProtocolInlayHintKind(kind: Proto.InlayHintKind): vscode.InlayHintKind {
	switch (kind) {
		case 'Parameter': return vscode.InlayHintKind.Parameter;
		case 'Type': return vscode.InlayHintKind.Type;
		case 'Enum': return vscode.InlayHintKind.Other;
		default: return vscode.InlayHintKind.Other;
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
	languageIds: readonly string[],
	client: ITypeScriptServiceClient,
	fileConfigurationManager: FileConfigurationManager
) {
	return conditionalRegistration([
		requireInlayHintsConfiguration(modeId),
		requireMinVersion(client, TypeScriptInlayHintsProvider.minVersion),
		requireSomeCapability(client, ClientCapability.Semantic),
	], () => {
		const provider = new TypeScriptInlayHintsProvider(modeId, languageIds, client, fileConfigurationManager);
		return vscode.languages.registerInlayHintsProvider(selector.semantic, provider);
	});
}
