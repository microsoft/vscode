/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { localize } from 'vs/nls';
import { Registry } from 'vs/platform/platform';
import { TPromise } from 'vs/base/common/winjs.base';
import { ICommonCodeEditor, ModeContextKeys } from 'vs/editor/common/editorCommon';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { editorAction, ServicesAccessor, EditorAction } from 'vs/editor/common/editorCommonExtensions';
import { DocumentFormattingEditProviderRegistry, DocumentRangeFormattingEditProviderRegistry } from 'vs/editor/common/modes';
import { FormattingPriorities } from '../common/format';
import { IConfigurationRegistry, Extensions } from 'vs/platform/configuration/common/configurationRegistry';
import { IWorkspaceConfigurationService } from 'vs/workbench/services/configuration/common/configuration';
import { IConfigurationEditingService, ConfigurationTarget } from 'vs/workbench/services/configuration/common/configurationEditing';
import { IQuickOpenService } from 'vs/workbench/services/quickopen/common/quickOpenService';

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
				}, {
					'type': 'array',
					default: [],
					description: localize('name.array', "A sorted list of formatter names.")
				}]
			}
		}
	}
});

@editorAction
export class ConfigureFormatterAction extends EditorAction {

	constructor() {
		super({
			id: 'editor.action.configureFormatter',
			label: localize('configureFormatter.label', "Configure Formatters"),
			alias: 'Configure Formatters',
			precondition: ContextKeyExpr.and(ModeContextKeys.hasFormattingProvider)
		});
	}

	public run(accessor: ServicesAccessor, editor: ICommonCodeEditor): TPromise<void> {

		const configurationService = accessor.get(IWorkspaceConfigurationService);
		const configurationEditService = accessor.get(IConfigurationEditingService);
		const config = configurationService.lookup<FormattingPriorities>('editor.formatter');

		const model = editor.getModel();
		const language = model.getModeId();

		const names: string[] = [];

		// document formatter
		for (const {name} of DocumentFormattingEditProviderRegistry.all(model)) {
			if (name && names.indexOf(name) < 0) {
				names.push(name);
			}
		}

		// document range formatter
		for (const {name} of DocumentRangeFormattingEditProviderRegistry.all(model)) {
			if (name && names.indexOf(name) < 0) {
				names.push(name);
			}
		}

		// one is like none
		if (names.length === 1) {
			names.length = 0;
		}

		return accessor.get(IQuickOpenService).pick(names, { placeHolder: localize('formatterHint', "Select a formatter for '{0}'", language) }).then(pick => {
			if (pick) {

				const value = <FormattingPriorities>(config.value || Object.create(null));
				const languageConfig = value[language];

				if (typeof languageConfig === 'undefined') {
					value[language] = pick;

				} else if (typeof languageConfig === 'string') {
					if (languageConfig !== pick) {
						value[language] = [pick, languageConfig];
					}

				} else if (Array.isArray(languageConfig)) {
					const idx = languageConfig.indexOf(pick);
					if (idx >= 0) {
						languageConfig.splice(idx, 1);
					}
					value[language] = [pick].concat(languageConfig);
				}

				const target = config.workspace
					? ConfigurationTarget.WORKSPACE
					: ConfigurationTarget.USER;

				return configurationEditService.writeConfiguration(target, {
					key: 'editor.formatter',
					value
				});
			}
		});
	}
}