/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Connection, Emitter } from 'vscode-languageserver';
import { Disposable } from './util/dispose';

export type ValidateEnabled = 'ignore' | 'warning' | 'error' | 'hint';

interface Settings {
	readonly markdown: {
		readonly occurrencesHighlight: {
			readonly enabled: boolean;
		};

		readonly suggest: {
			readonly paths: {
				readonly enabled: boolean;
			};
		};

		readonly validate: {
			readonly enabled: true;
			readonly referenceLinks: {
				readonly enabled: ValidateEnabled;
			};
			readonly fragmentLinks: {
				readonly enabled: ValidateEnabled;
			};
			readonly fileLinks: {
				readonly enabled: ValidateEnabled;
				readonly markdownFragmentLinks: ValidateEnabled | 'inherit';
			};
			readonly ignoredLinks: readonly string[];
			readonly unusedLinkDefinitions: {
				readonly enabled: ValidateEnabled;
			};
			readonly duplicateLinkDefinitions: {
				readonly enabled: ValidateEnabled;
			};
		};
	};
}


export class ConfigurationManager extends Disposable {

	private readonly _onDidChangeConfiguration = this._register(new Emitter<Settings>());
	public readonly onDidChangeConfiguration = this._onDidChangeConfiguration.event;

	private _settings?: Settings;

	constructor(connection: Connection) {
		super();

		// The settings have changed. Is send on server activation as well.
		this._register(connection.onDidChangeConfiguration((change) => {
			this._settings = change.settings;
			this._onDidChangeConfiguration.fire(this._settings!);
		}));
	}

	public getSettings(): Settings | undefined {
		return this._settings;
	}
}
