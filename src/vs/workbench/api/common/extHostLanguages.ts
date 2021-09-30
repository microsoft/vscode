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
import { IDisposable } from 'vs/base/common/lifecycle';

export class ExtHostLanguages {

	private readonly _proxy: MainThreadLanguagesShape;
	private readonly _documents: ExtHostDocuments;

	constructor(
		mainContext: IMainContext,
		documents: ExtHostDocuments
	) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadLanguages);
		this._documents = documents;
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

	createLanguageStatusItem(selector: vscode.DocumentSelector): vscode.LanguageStatusItem {

		const handle = this._handlePool++;
		const proxy = this._proxy;

		const data: { selector: any, text: string, detail: string | vscode.MarkdownString, severity: vscode.LanguageStatusSeverity } = {
			selector,
			text: '',
			detail: '',
			severity: LanguageStatusSeverity.Information,
		};

		let soonHandle: IDisposable | undefined;
		const updateAsync = () => {
			soonHandle?.dispose();
			soonHandle = disposableTimeout(() => {
				this._proxy.$setLanguageStatus(handle, {
					selector: data.selector,
					text: data.text,
					message: typeof data.detail === 'string' ? data.detail : typeConvert.MarkdownString.from(data.detail),
					severity: data.severity === LanguageStatusSeverity.Error ? Severity.Error : data.severity === LanguageStatusSeverity.Warning ? Severity.Warning : Severity.Info
				});
			}, 0);
		};

		const result: vscode.LanguageStatusItem = {
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
			dispose() {
				soonHandle?.dispose();
				proxy.$removeLanguageStatus(handle);
			}
		};
		updateAsync();
		return result;
	}
}
