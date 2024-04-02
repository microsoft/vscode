/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MainContext, MainThreadLanguagesShape, IMainContext, ExtHostLanguagesShape } from './extHost.protocol';
import type * as vscode from 'vscode';
import { ExtHostDocuments } from 'vs/workbench/api/common/extHostDocuments';
import * as typeConvert from 'vs/workbench/api/common/extHostTypeConverters';
import { StandardTokenType, Range, Position, LanguageStatusSeverity } from 'vs/workbench/api/common/extHostTypes';
import Severity from 'vs/base/common/severity';
import { disposableTimeout } from 'vs/base/common/async';
import { DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { CommandsConverter } from 'vs/workbench/api/common/extHostCommands';
import { IURITransformer } from 'vs/base/common/uriIpc';
import { checkProposedApiEnabled } from 'vs/workbench/services/extensions/common/extensions';

export class ExtHostLanguages implements ExtHostLanguagesShape {

	private readonly _proxy: MainThreadLanguagesShape;

	private _languageIds: string[] = [];

	constructor(
		mainContext: IMainContext,
		private readonly _documents: ExtHostDocuments,
		private readonly _commands: CommandsConverter,
		private readonly _uriTransformer: IURITransformer | undefined
	) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadLanguages);
	}

	$acceptLanguageIds(ids: string[]): void {
		this._languageIds = ids;
	}

	async getLanguages(): Promise<string[]> {
		return this._languageIds.slice(0);
	}

	async changeLanguage(uri: vscode.Uri, languageId: string): Promise<vscode.TextDocument> {
		await this._proxy.$changeLanguage(uri, languageId);
		const data = this._documents.getDocumentData(uri);
		if (!data) {
			throw new Error(`document '${uri.toString()}' NOT found`);
		}
		return data.document;
	}

	async tokenAtPosition(document: vscode.TextDocument, position: vscode.Position): Promise<vscode.TokenInformation> {
		const versionNow = document.version;
		const pos = typeConvert.Position.from(position);
		const info = await this._proxy.$tokensAtPosition(document.uri, pos);
		const defaultRange = {
			type: StandardTokenType.Other,
			range: document.getWordRangeAtPosition(position) ?? new Range(position.line, position.character, position.line, position.character)
		};
		if (!info) {
			// no result
			return defaultRange;
		}
		const result = {
			range: typeConvert.Range.to(info.range),
			type: typeConvert.TokenType.to(info.type)
		};
		if (!result.range.contains(<Position>position)) {
			// bogous result
			return defaultRange;
		}
		if (versionNow !== document.version) {
			// concurrent change
			return defaultRange;
		}
		return result;
	}

	private _handlePool: number = 0;
	private _ids = new Set<string>();

	createLanguageStatusItem(extension: IExtensionDescription, id: string, selector: vscode.DocumentSelector): vscode.LanguageStatusItem {

		const handle = this._handlePool++;
		const proxy = this._proxy;
		const ids = this._ids;

		// enforce extension unique identifier
		const fullyQualifiedId = `${extension.identifier.value}/${id}`;
		if (ids.has(fullyQualifiedId)) {
			throw new Error(`LanguageStatusItem with id '${id}' ALREADY exists`);
		}
		ids.add(fullyQualifiedId);

		const data: Omit<vscode.LanguageStatusItem, 'dispose' | 'text2'> = {
			selector,
			id,
			name: extension.displayName ?? extension.name,
			severity: LanguageStatusSeverity.Information,
			command: undefined,
			text: '',
			detail: '',
			busy: false
		};


		let soonHandle: IDisposable | undefined;
		const commandDisposables = new DisposableStore();
		const updateAsync = () => {
			soonHandle?.dispose();

			if (!ids.has(fullyQualifiedId)) {
				console.warn(`LanguageStatusItem (${id}) from ${extension.identifier.value} has been disposed and CANNOT be updated anymore`);
				return; // disposed in the meantime
			}

			soonHandle = disposableTimeout(() => {
				commandDisposables.clear();
				this._proxy.$setLanguageStatus(handle, {
					id: fullyQualifiedId,
					name: data.name ?? extension.displayName ?? extension.name,
					source: extension.displayName ?? extension.name,
					selector: typeConvert.DocumentSelector.from(data.selector, this._uriTransformer),
					label: data.text,
					detail: data.detail ?? '',
					severity: data.severity === LanguageStatusSeverity.Error ? Severity.Error : data.severity === LanguageStatusSeverity.Warning ? Severity.Warning : Severity.Info,
					command: data.command && this._commands.toInternal(data.command, commandDisposables),
					accessibilityInfo: data.accessibilityInformation,
					busy: data.busy
				});
			}, 0);
		};

		const result: vscode.LanguageStatusItem = {
			dispose() {
				commandDisposables.dispose();
				soonHandle?.dispose();
				proxy.$removeLanguageStatus(handle);
				ids.delete(fullyQualifiedId);
			},
			get id() {
				return data.id;
			},
			get name() {
				return data.name;
			},
			set name(value) {
				data.name = value;
				updateAsync();
			},
			get selector() {
				return data.selector;
			},
			set selector(value) {
				data.selector = value;
				updateAsync();
			},
			get text() {
				return data.text;
			},
			set text(value) {
				data.text = value;
				updateAsync();
			},
			set text2(value) {
				checkProposedApiEnabled(extension, 'languageStatusText');
				data.text = value;
				updateAsync();
			},
			get text2() {
				checkProposedApiEnabled(extension, 'languageStatusText');
				return data.text;
			},
			get detail() {
				return data.detail;
			},
			set detail(value) {
				data.detail = value;
				updateAsync();
			},
			get severity() {
				return data.severity;
			},
			set severity(value) {
				data.severity = value;
				updateAsync();
			},
			get accessibilityInformation() {
				return data.accessibilityInformation;
			},
			set accessibilityInformation(value) {
				data.accessibilityInformation = value;
				updateAsync();
			},
			get command() {
				return data.command;
			},
			set command(value) {
				data.command = value;
				updateAsync();
			},
			get busy() {
				return data.busy;
			},
			set busy(value: boolean) {
				data.busy = value;
				updateAsync();
			}
		};
		updateAsync();
		return result;
	}
}
