/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MainContext, MainThreadLanguagesShape, IMainContext } from './extHost.protocol';
import type * as vscode from 'vscode';
import { ExtHostDocuments } from 'vs/workbench/api/common/extHostDocuments';
import * as typeConvert from 'vs/workbench/api/common/extHostTypeConverters';
import { StandardTokenType, Range, Position, LanguageStatusSeverity } from 'vs/workbench/api/common/extHostTypes';
import Severity from 'vs/base/common/severity';
import { disposableTimeout } from 'vs/base/common/async';
import { DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { CommandsConverter } from 'vs/workbench/api/common/extHostCommands';

export class ExtHostLanguages {

	private readonly _proxy: MainThreadLanguagesShape;

	constructor(
		mainContext: IMainContext,
		private readonly _documents: ExtHostDocuments,
		private readonly _commands: CommandsConverter
	) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadLanguages);
	}

	getLanguages(): Promise<string[]> {
		return this._proxy.$getLanguages();
	}

	async changeLanguage(uri: vscode.Uri, languageId: string): Promise<vscode.TextDocument> {
		await this._proxy.$changeLanguage(uri, languageId);
		const data = this._documents.getDocumentData(uri);
		if (!data) {
			throw new Error(`document '${uri.toString}' NOT found`);
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

	createLanguageStatusItem(extension: IExtensionDescription, id: string, selector: vscode.DocumentSelector): vscode.LanguageStatusItem {

		const handle = this._handlePool++;
		const proxy = this._proxy;

		const data: Omit<vscode.LanguageStatusItem, 'dispose'> = {
			selector,
			id,
			name: extension.displayName ?? extension.name,
			severity: LanguageStatusSeverity.Information,
			command: undefined,
			text: '',
			detail: '',
		};

		let soonHandle: IDisposable | undefined;
		let commandDisposables = new DisposableStore();
		const updateAsync = () => {
			soonHandle?.dispose();
			soonHandle = disposableTimeout(() => {

				commandDisposables.clear();

				this._proxy.$setLanguageStatus(handle, {
					id: `${extension.identifier.value}/${id}`,
					name: data.name ?? extension.displayName ?? extension.name,
					source: extension.displayName ?? extension.name,
					selector: data.selector,
					label: data.text,
					detail: data.detail,
					severity: data.severity === LanguageStatusSeverity.Error ? Severity.Error : data.severity === LanguageStatusSeverity.Warning ? Severity.Warning : Severity.Info,
					command: data.command && this._commands.toInternal(data.command, commandDisposables)
				});
			}, 0);
		};

		const result: vscode.LanguageStatusItem = {
			dispose() {
				commandDisposables.dispose();
				soonHandle?.dispose();
				proxy.$removeLanguageStatus(handle);
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
			get command() {
				return data.command;
			},
			set command(value) {
				data.command = value;
				updateAsync();
			}
		};
		updateAsync();
		return result;
	}
}
