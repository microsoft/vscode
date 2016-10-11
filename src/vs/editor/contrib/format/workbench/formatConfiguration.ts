/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { localize } from 'vs/nls';
import { Registry } from 'vs/platform/platform';
import { IConfigurationRegistry, Extensions } from 'vs/platform/configuration/common/configurationRegistry';

// register schema stub for 'editor.formatter'

Registry.as<IConfigurationRegistry>(Extensions.Configuration).registerConfiguration({
	id: 'editor',
	type: 'object',
	properties: {
		'editor.formatter.document': {
			type: 'object',
			description: localize('editor.formatter', "Define what formatter to use for a language, e.g '{ \"javascript\": \"clang js formatter\"}'"),
			additionalProperties: {
				anyOf: [{
					type: 'string',
					description: localize('name.string', "The name of a formatter")
				}]
			}
		},
		'editor.formatter.documentRange': {
			type: 'object',
			description: localize('editor.formatter', "Define what formatter to use for a language, e.g '{ \"javascript\": \"clang js formatter\"}'"),
			additionalProperties: {
				anyOf: [{
					type: 'string',
					description: localize('name.string', "The name of a formatter")
				}]
			}
		}
	}
});
