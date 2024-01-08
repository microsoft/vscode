/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { DocumentSelector } from '../configuration/documentSelector';
import { LanguageDescription } from '../configuration/languageDescription';
import { TelemetryReporter } from '../logging/telemetry';
import { API } from '../tsServer/api';
import type * as Proto from '../tsServer/protocol/protocol';
import { Location, Position } from '../typeConverters';
import { ClientCapability, ITypeScriptServiceClient } from '../typescriptService';
import { Disposable } from '../utils/dispose';
import FileConfigurationManager, { InlayHintSettingNames, getInlayHintsPreferences } from './fileConfigurationManager';
import { conditionalRegistration, requireMinVersion, requireSomeCapability } from './util/dependentRegistration';


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

	private readonly _onDidChangeInlayHints = this._register(new vscode.EventEmitter<void>());
	public readonly onDidChangeInlayHints = this._onDidChangeInlayHints.event;

	private hasReportedTelemetry = false;

	constructor(
		private readonly language: LanguageDescription,
		private readonly client: ITypeScriptServiceClient,
		private readonly fileConfigurationManager: FileConfigurationManager,
		private readonly telemetryReporter: TelemetryReporter,
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

	async provideInlayHints(model: vscode.TextDocument, range: vscode.Range, token: vscode.CancellationToken): Promise<vscode.InlayHint[] | undefined> {
		const filepath = this.client.toOpenTsFilePath(model);
		if (!filepath) {
			return;
		}

		if (!areInlayHintsEnabledForFile(this.language, model)) {
			return;
		}

		const start = model.offsetAt(range.start);
		const length = model.offsetAt(range.end) - start;

		await this.fileConfigurationManager.ensureConfigurationForDocument(model, token);
		if (token.isCancellationRequested) {
			return;
		}

		if (!this.hasReportedTelemetry) {
			this.hasReportedTelemetry = true;
			/* __GDPR__
				"inlayHints.provide" : {
					"owner": "mjbvz",
					"${include}": [
						"${TypeScriptCommonProperties}"
					]
				}
			*/
			this.telemetryReporter.logTelemetry('inlayHints.provide', {});
		}

		const response = await this.client.execute('provideInlayHints', { file: filepath, start, length }, token);
		if (response.type !== 'response' || !response.success || !response.body) {
			return;
		}

		return response.body.map(hint => {
			const result = new vscode.InlayHint(
				Position.fromLocation(hint.position),
				this.convertInlayHintText(hint),
				fromProtocolInlayHintKind(hint.kind)
			);
			result.paddingLeft = hint.whitespaceBefore;
			result.paddingRight = hint.whitespaceAfter;
			return result;
		});
	}

	private convertInlayHintText(tsHint: Proto.InlayHintItem): string | vscode.InlayHintLabelPart[] {
		if (tsHint.displayParts) {
			return tsHint.displayParts.map((part): vscode.InlayHintLabelPart => {
				const out = new vscode.InlayHintLabelPart(part.text);
				if (part.span) {
					out.location = Location.fromTextSpan(this.client.toResource(part.span.file), part.span);
				}
				return out;
			});
		}

		return tsHint.text;
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
	fileConfigurationManager: FileConfigurationManager,
	telemetryReporter: TelemetryReporter,
) {
	return conditionalRegistration([
		requireMinVersion(client, TypeScriptInlayHintsProvider.minVersion),
		requireSomeCapability(client, ClientCapability.Semantic),
	], () => {
		const provider = new TypeScriptInlayHintsProvider(language, client, fileConfigurationManager, telemetryReporter);
		return vscode.languages.registerInlayHintsProvider(selector.semantic, provider);
	});
}
