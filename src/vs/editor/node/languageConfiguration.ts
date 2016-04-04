/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import {parse} from 'vs/base/common/json';
import {readFile} from 'vs/base/node/pfs';
import {IRichEditConfiguration} from 'vs/editor/common/modes/supports/richEditSupport';
import {IModeService} from 'vs/editor/common/services/modeService';

type CharacterPair = [string, string];

interface ICommentRule {
	lineComment?: string;
	blockComment?: CharacterPair;
}

interface ILanguageConfiguration {
	comments?: ICommentRule;
	brackets?: CharacterPair[];
}

export class LanguageConfigurationFileHandler {

	private _modeService: IModeService;

	constructor(
		@IModeService modeService: IModeService
	) {
		this._modeService = modeService;

		this._handleModes(this._modeService.getRegisteredModes());
		this._modeService.onDidAddModes((modes) => this._handleModes(modes));
	}

	private _handleModes(modes:string[]): void {
		modes.forEach(modeId => this._handleMode(modeId));
	}

	private _handleMode(modeId:string): void {
		let disposable = this._modeService.onDidCreateMode((mode) => {
			if (mode.getId() !== modeId) {
				return;
			}

			let configurationFiles = this._modeService.getConfigurationFiles(modeId);
			configurationFiles.forEach((configFilePath) => this._handleConfigFile(modeId, configFilePath));

			disposable.dispose();
		});
	}

	private _handleConfigFile(modeId:string, configFilePath:string): void {
		readFile(configFilePath).then((fileContents) => {
			var errors = [];
			var configuration = <ILanguageConfiguration>parse(fileContents.toString(), errors);
			if (errors.length) {
				console.error(nls.localize('parseErrors', "Errors parsing {0}: {1}", configFilePath, errors.join('\n')));
			}
			this._handleConfig(modeId, configuration);
		}, (err) => {
			console.error(err);
		});
	}

	private _handleConfig(modeId:string, configuration:ILanguageConfiguration): void {

		let richEditConfig:IRichEditConfiguration = {};

		if (configuration.comments) {
			richEditConfig.comments = configuration.comments;
		}

		if (configuration.brackets) {
			richEditConfig.brackets = configuration.brackets;

			richEditConfig.__characterPairSupport = {
				autoClosingPairs: configuration.brackets.map(pair => {
					let [open, close] = pair;
					return { open: open, close: close };
				})
			};
		}

		this._modeService.registerRichEditSupport(modeId, richEditConfig);
	}
}
