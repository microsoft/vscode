/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {IModeService} from 'vs/editor/common/services/modeService';
import {ILanguageExtensionPoint, LanguageExtensions} from 'vs/editor/common/modes/languageExtensionPoint';
import {PluginsRegistry} from 'vs/platform/plugins/common/pluginsRegistry';
import pfs = require('vs/base/node/pfs');
import Supports = require ('vs/editor/common/modes/supports');
import {IOnEnterSupportOptions} from 'vs/editor/common/modes/supports/onEnter';
import json = require('vs/base/common/json');
import {ICharacterPairContribution} from 'vs/editor/common/modes';

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
				console.error("Errors parsing " + configFilePath + ": " + errors.join('\n'));
			}
			this._handleConfig(modeId, configuration);
		}, (err) => {
			console.error(err);
		});
	}

	private _handleConfig(modeId:string, configuration:ILanguageConfiguration): void {
		if (configuration.comments) {
			let comments = configuration.comments;
			let contrib: Supports.ICommentsSupportContribution = { commentsConfiguration: {} };

			if (comments.lineComment) {
				contrib.commentsConfiguration.lineCommentTokens = [comments.lineComment];
			}
			if (comments.blockComment) {
				contrib.commentsConfiguration.blockCommentStartToken = comments.blockComment[0];
				contrib.commentsConfiguration.blockCommentEndToken = comments.blockComment[1];
			}

			this._modeService.registerDeclarativeCommentsSupport(modeId, contrib);
		}

		if (configuration.brackets) {
			let brackets = configuration.brackets;

			let onEnterContrib: IOnEnterSupportOptions = {};
			onEnterContrib.brackets = brackets.map(pair => {
				let [open, close] = pair;
				return { open: open, close: close };
			});
			this._modeService.registerDeclarativeOnEnterSupport(modeId, onEnterContrib);

			let characterPairContrib: ICharacterPairContribution = {
				autoClosingPairs: brackets.map(pair => {
					let [open, close] = pair;
					return { open: open, close: close };
				})
			};
			this._modeService.registerDeclarativeCharacterPairSupport(modeId, characterPairContrib);
		}

		// TMSyntax hard-codes these and tokenizes them as brackets
		this._modeService.registerDeclarativeElectricCharacterSupport(modeId, {
			brackets: [
				{ tokenType:'delimiter.curly.' + modeId, open: '{', close: '}', isElectric: true },
				{ tokenType:'delimiter.square.' + modeId, open: '[', close: ']', isElectric: true },
				{ tokenType:'delimiter.paren.' + modeId, open: '(', close: ')', isElectric: true }
			]
		});
	}
}
