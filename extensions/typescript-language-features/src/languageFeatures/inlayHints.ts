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
import { LanguageDescription } from '../utils/languageDescription';
import { Position } from '../utils/typeConverters';
import FileConfigurationManager, { getInlayHintsPreferences, InlayHintSettingNames } from './fileConfigurationManager';


const inlayHintSettingNames = Object.freeze([
	InlayHintSettingNames.parameterNamesSuppressWhenArgumentMatchesName,
	InlayHintSettingNames.parameterNamesEnabled,
	InlayHintSettingNames.variableTypesEnabled,
	InlayHintSettingNames.variableTypesSuppressWhenTypeMatchesName,
	InlayHintSettingNames.propertyDeclarationTypesEnabled,
	InlayHintSettingNames.functionLikeReturnTypesEnabled,
	InlayHintSettingNames.enumMemberValuesEnabled,
]);

class TypeScriptInlayHintsProvider extends Disposable implements vscode.InlayHintsProvider {

	public static readonly minVersion = API.v440;

	private readonly _onDidChangeInlayHints = new vscode.EventEmitter<void>();
	public readonly onDidChangeInlayHints = this._onDidChangeInlayHints.event;

	constructor(
		private readonly language: LanguageDescription,
		private readonly client: ITypeScriptServiceClient,
		private readonly fileConfigurationManager: FileConfigurationManager
	) {
		super();

		this._register(vscode.workspace.onDidChangeConfiguration(e => {
			if (inlayHintSettingNames.some(settingName => e.affectsConfiguration(language.id + '.' + settingName))) {
				this._onDidChangeInlayHints.fire();
			}
		}));

		// When a JS/TS file changes, change inlay hints for all visible editors
		// since changes in one file can effect the hints the others.
		this._register(vscode.workspace.onDidChangeTextDocument(e => {
			if (language.languageIds.includes(e.document.languageId)) {
				this._onDidChangeInlayHints.fire();
			}
		}));
	}

	async provideInlayHints(model: vscode.TextDocument, range: vscode.Range, token: vscode.CancellationToken): Promise<vscode.InlayHint[]> {
		const filepath = this.client.toOpenedFilePath(model);
		if (!filepath) {
			return [];
		}

		if (!areInlayHintsEnabledForFile(this.language, model)) {
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
				Position.fromLocation(hint.position),
				hint.text,
				hint.kind && fromProtocolInlayHintKind(hint.kind)
			);
			result.paddingLeft = hint.whitespaceBefore;
			result.paddingRight = hint.whitespaceAfter;
			return result;
		});
	}
}

function fromProtocolInlayHintKind(kind: Proto.InlayHintKind): vscode.InlayHintKind | undefined {
	switch (kind) {
		case 'Parameter': return vscode.InlayHintKind.Parameter;
		case 'Type': return vscode.InlayHintKind.Type;
		case 'Enum': return undefined;
		default: return undefined;
	}
}

function areInlayHintsEnabledForFile(language: LanguageDescription, document: vscode.TextDocument) {
	const config = vscode.workspace.getConfiguration(language.id, document);
	const preferences = getInlayHintsPreferences(config);

	return preferences.includeInlayParameterNameHints === 'literals' ||
		preferences.includeInlayParameterNameHints === 'all' ||
		preferences.includeInlayEnumMemberValueHints ||
		preferences.includeInlayFunctionLikeReturnTypeHints ||
		preferences.includeInlayFunctionParameterTypeHints ||
		preferences.includeInlayPropertyDeclarationTypeHints ||
		preferences.includeInlayVariableTypeHints;
}

export function register(
	selector: DocumentSelector,
	language: LanguageDescription,
	client: ITypeScriptServiceClient,
	fileConfigurationManager: FileConfigurationManager
) {
	return conditionalRegistration([
		requireMinVersion(client, TypeScriptInlayHintsProvider.minVersion),
		requireSomeCapability(client, ClientCapability.Semantic),
	], () => {
		const provider = new TypeScriptInlayHintsProvider(language, client, fileConfigurationManager);
		return vscode.languages.registerInlayHintsProvider(selector.semantic, provider);
	});
}
