/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import {IModeService} from 'vs/editor/common/services/modeService';
import {LanguageExtensions} from 'vs/editor/common/modes/languageExtensionPoint';
import {PluginsRegistry} from 'vs/platform/plugins/common/pluginsRegistry';
import pfs = require('vs/base/node/pfs');
import json = require('vs/base/common/json');
import {IRichEditConfiguration} from 'vs/editor/common/modes/supports/richEditSupport';

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

		LanguageExtensions.getRegisteredModes().forEach(modeId => this._handleMode(modeId));
		LanguageExtensions.onDidAddMode((modeId) => this._handleMode(modeId));
	}

	private _handleMode(modeId:string): void {
		let activationEvent = 'onLanguage:' + modeId;

		PluginsRegistry.registerOneTimeActivationEventListener(activationEvent, () => {
			let configurationFiles = LanguageExtensions.getConfigurationFiles(modeId);

			configurationFiles.forEach((configFilePath) => this._handleConfigFile(modeId, configFilePath));
		});
	}

	private _handleConfigFile(modeId:string, configFilePath:string): void {
		pfs.readFile(configFilePath).then((fileContents) => {
			var errors = [];
			var configuration = <ILanguageConfiguration>json.parse(fileContents.toString(), errors);
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

		// TMSyntax hard-codes these and tokenizes them as brackets
		richEditConfig.__electricCharacterSupport = {
			brackets: [
				{ tokenType:'delimiter.curly.' + modeId, open: '{', close: '}', isElectric: true },
				{ tokenType:'delimiter.square.' + modeId, open: '[', close: ']', isElectric: true },
				{ tokenType:'delimiter.paren.' + modeId, open: '(', close: ')', isElectric: true }
			]
		};

		this._modeService.registerRichEditSupport(modeId, richEditConfig);
	}
}
