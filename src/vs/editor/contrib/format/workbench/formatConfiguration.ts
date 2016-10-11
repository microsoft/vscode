/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { localize } from 'vs/nls';
import { Registry } from 'vs/platform/platform';
import { IConfigurationRegistry, Extensions } from 'vs/platform/configuration/common/configurationRegistry';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { DocumentRangeFormattingEditProviderRegistry, DocumentFormattingEditProviderRegistry } from 'vs/editor/common/modes';
import { IQuickOpenService, IPickOpenEntry } from 'vs/workbench/services/quickopen/common/quickOpenService';
import { ICodeEditorService } from 'vs/editor/common/services/codeEditorService';
import { MenuRegistry } from 'vs/platform/actions/common/actions';

// register schema stub for 'editor.formatter'

Registry.as<IConfigurationRegistry>(Extensions.Configuration).registerConfiguration({
	id: 'editor',
	type: 'object',
	properties: {
		'editor.formatter': {
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


CommandsRegistry.registerCommand('editor.formatter.config', accessor => {

	const editor = accessor.get(ICodeEditorService).getFocusedCodeEditor();
	if (!editor) {
		return;
	}

	const picks: IPickOpenEntry[] = [];

	// all range formatter
	for (const provider of DocumentRangeFormattingEditProviderRegistry.ordered(editor.getModel())) {
		picks.push({ label: provider.name });
	}
	const {length} = picks;
	if (length > 0) {
		picks[0].separator = { label: localize('rangeFormatter', "Document & Selection Formatter") };
	}

	// all document formatters
	for (const provider of DocumentFormattingEditProviderRegistry.ordered(editor.getModel())) {
		picks.push({ label: provider.name });
	}
	if (length !== picks.length) {
		picks[length].separator = { label: localize('docFormatter', "Document Formatter") };
	}

	return accessor.get(IQuickOpenService).pick(picks).then(pick => {
		console.log(pick);
	});
});

MenuRegistry.addCommand({
	id: 'editor.formatter.config',
	title: localize('configFmt', "Configure Formatters")
});
