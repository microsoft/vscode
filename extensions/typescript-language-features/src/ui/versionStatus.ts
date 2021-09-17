/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as nls from 'vscode-nls';
import { SelectTypeScriptVersionCommand } from '../commands/selectTypeScriptVersion';
import { TypeScriptVersion } from '../tsServer/versionProvider';
import { ITypeScriptServiceClient } from '../typescriptService';
import { Disposable } from '../utils/dispose';
import { jsTsLanguageModes } from '../utils/languageModeIds';

const localize = nls.loadMessageBundle();

export class VersionStatus extends Disposable {

	private readonly _statusItem: vscode.LanguageStatusItem;

	constructor(
		private readonly _client: ITypeScriptServiceClient,
	) {
		super();

		this._statusItem = this._register(vscode.languages.createLanguageStatusItem('typescript.version', jsTsLanguageModes));

		this._statusItem.name = localize('versionStatus.name', "TypeScript Version");
		this._statusItem.detail = localize('versionStatus.detail', "TypeScript Version");

		this._register(this._client.onTsServerStarted(({ version }) => this.onDidChangeTypeScriptVersion(version)));
	}

	private onDidChangeTypeScriptVersion(version: TypeScriptVersion) {
		this._statusItem.text = version.displayName;
		this._statusItem.command = {
			command: SelectTypeScriptVersionCommand.id,
			title: localize('versionStatus.command', "Select Version"),
			tooltip: version.path
		};
	}
}
