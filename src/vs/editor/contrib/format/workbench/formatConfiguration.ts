/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { localize } from 'vs/nls';
import { TPromise } from 'vs/base/common/winjs.base';
import { Registry } from 'vs/platform/platform';
import { IWorkspaceConfigurationService } from 'vs/workbench/services/configuration/common/configuration';
import { IConfigurationEditingService, ConfigurationTarget } from 'vs/workbench/services/configuration/common/configurationEditing';
import { IConfigurationRegistry, Extensions } from 'vs/platform/configuration/common/configurationRegistry';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { DocumentRangeFormattingEditProviderRegistry, DocumentFormattingEditProviderRegistry } from 'vs/editor/common/modes';
import { IQuickOpenService, IPickOpenEntry } from 'vs/workbench/services/quickopen/common/quickOpenService';
import { ICodeEditorService } from 'vs/editor/common/services/codeEditorService';
import { IModeService } from 'vs/editor/common/services/modeService';
import { MenuRegistry } from 'vs/platform/actions/common/actions';
import { LanguageSelector } from 'vs/editor/common/modes/languageSelector';
import { FormatterConfiguration } from 'vs/editor/contrib/format/common/format';

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

function matchOnLanguageOnly(selector: LanguageSelector, language: string): boolean {
	if (Array.isArray(selector)) {
		return selector.some(sel => matchOnLanguageOnly(sel, language));
	} else if (typeof selector === 'string') {
		return selector === '*' || selector === language;
	} else {
		return !selector.language || matchOnLanguageOnly(selector.language, language);
	}
}

CommandsRegistry.registerCommand('editor.formatter.config', accessor => {

	const codeEditorService = accessor.get(ICodeEditorService);
	const modeService = accessor.get(IModeService);
	const quickOpenService = accessor.get(IQuickOpenService);
	const configService = accessor.get(IWorkspaceConfigurationService);
	const configEditService = accessor.get(IConfigurationEditingService);

	function getLanguageId() {
		const editor = codeEditorService.getFocusedCodeEditor();
		if (editor && editor.getModel()) {
			return TPromise.as(editor.getModel().getModeId());
		} else {
			const picks = modeService.getRegisteredModes().map(id => {
				return {
					id,
					label: modeService.getLanguageName(id)
				};
			});
			return quickOpenService.pick(picks, { placeHolder: localize('pick.lang', "Select a language") }).then(pick => {
				if (pick) {
					return pick.id;
				}
			});
		}
	};

	const metaPickRemove: IPickOpenEntry = {
		id: 'remove',
		label: localize('config.remove', "Remove configuration"),
		separator: { border: true }
	};

	function selectProvider(language: string) {
		const picks: IPickOpenEntry[] = [];

		// all range formatter
		for (const [selector, provider] of DocumentRangeFormattingEditProviderRegistry.entries()) {
			if (matchOnLanguageOnly(selector, language)) {
				picks.push({ label: provider.name });
			}
		}
		const {length} = picks;
		if (length > 0) {
			picks[0].separator = { label: localize('rangeFormatter', "Document & Selection Formatter") };
		}

		// all document formatters
		for (const [selector, provider] of DocumentFormattingEditProviderRegistry.entries()) {
			if (matchOnLanguageOnly(selector, language)) {
				picks.push({ label: provider.name });
			}
		}
		if (length !== picks.length) {
			picks[length].separator = { label: localize('docFormatter', "Document Formatter") };
		}

		// meta picks
		picks.push(metaPickRemove);

		return quickOpenService.pick(picks, { placeHolder: localize('pick.fmt', "Select formatter for {0}", modeService.getLanguageName(language)) });
	}

	return getLanguageId().then(language => {
		if (!language) {
			return;
		}
		return selectProvider(language).then(pick => {
			if (!pick) {
				return;
			}

			const config = configService.lookup<FormatterConfiguration>(FormatterConfiguration.key);
			const target = config.workspace ? ConfigurationTarget.WORKSPACE : ConfigurationTarget.USER;

			const value = config.value;
			if (pick === metaPickRemove) {
				delete value[language];
			} else {
				value[language] = pick.label;
			}

			return configEditService.writeConfiguration(target, {
				key: FormatterConfiguration.key,
				value
			});
		});
	});
});

MenuRegistry.addCommand({
	id: 'editor.formatter.config',
	title: localize('configFmt', "Configure Formatters")
});
