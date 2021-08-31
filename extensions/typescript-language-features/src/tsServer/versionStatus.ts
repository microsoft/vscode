/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as nls from 'vscode-nls';
import { SelectTypeScriptVersionCommand } from '../commands/selectTypeScriptVersion';
import { ITypeScriptServiceClient } from '../typescriptService';
import { Disposable } from '../utils/dispose';
import * as languageModeIds from '../utils/languageModeIds';
import { TypeScriptVersion } from './versionProvider';

const localize = nls.loadMessageBundle();

export class VersionStatus extends Disposable {

	private readonly _statusItem: vscode.LanguageStatusItem;

	constructor(
		private readonly _client: ITypeScriptServiceClient,
	) {
		super();

		this._statusItem = this._register(vscode.languages.createLanguageStatusItem('typescript.version', [
			languageModeIds.javascript,
			languageModeIds.javascriptreact,
			languageModeIds.typescript,
			languageModeIds.typescriptreact,
		]));

		this._statusItem.name = localize('versionStatus.name', "TypeScript Version");

		this._statusItem.command = {
			command: SelectTypeScriptVersionCommand.id,
			title: localize('versionStatus.command', "Select"),
		};

		this._register(this._client.onTsServerStarted(({ version }) => this.onDidChangeTypeScriptVersion(version)));
	}

	private onDidChangeTypeScriptVersion(version: TypeScriptVersion) {
		this._statusItem.text = localize('versionStatus.text', "TypeScript Version: {0}", version.displayName);
		this._statusItem.command!.tooltip = version.path;
	}
}

