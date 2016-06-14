/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/css!vs/languages/css/common/css-hover';
import nls = require('vs/nls');
import Platform = require('vs/platform/platform');
import {ModesRegistry} from 'vs/editor/common/modes/modesRegistry';
import ConfigurationRegistry = require('vs/platform/configuration/common/configurationRegistry');
import lintRules = require('vs/languages/css/common/services/lintRules');
import {IRange} from 'vs/editor/common/editorCommon';
import {Range} from 'vs/editor/common/core/range';
import {CommonEditorRegistry} from 'vs/editor/common/editorCommonExtensions';
import {ReplaceCommandWithoutChangingPosition} from 'vs/editor/common/commands/replaceCommand';

ModesRegistry.registerCompatMode({
	id: 'css',
	extensions: ['.css'],
	aliases: ['CSS', 'css'],
	mimetypes: ['text/css'],
	moduleId: 'vs/languages/css/common/css',
	ctorName: 'CSSMode'
});

var configurationRegistry = <ConfigurationRegistry.IConfigurationRegistry>Platform.Registry.as(ConfigurationRegistry.Extensions.Configuration);
configurationRegistry.registerConfiguration({
	'id': 'css',
	'order': 20,
	'title': nls.localize('cssConfigurationTitle', "CSS configuration"),
	'allOf': [{
		'title': nls.localize('lint', "Controls CSS validation and problem severities."),
		'properties': lintRules.getConfigurationProperties('css')
	}]
});

CommonEditorRegistry.registerEditorCommand('_css.replaceText', -1, { primary: undefined }, true, void 0, (accessor, editor, args: { range: IRange; newText: string;}) => {
	let {range, newText} = args;
	editor.executeCommand('_css.replaceText', new ReplaceCommandWithoutChangingPosition(Range.lift(range), newText));
});