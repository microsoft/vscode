/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { IDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { LanguageId, LanguageIdentifier } from 'vs/editor/common/modes';
import { ILanguageConfigurationService, LanguageConfigurationRegistry, ResolvedLanguageConfiguration } from 'vs/editor/common/modes/languageConfigurationRegistry';

export class TestLanguageConfigurationService implements ILanguageConfigurationService {
	_serviceBrand: undefined;

	onLanguageConfigurationDidChange(languageId: LanguageId, resource: URI | undefined, handler: () => void): IDisposable {
		return LanguageConfigurationRegistry.onDidChange(e => {
			if (e.languageIdentifier.id === languageId) {
				handler();
			}
		});
	}

	getLanguageConfiguration(languageId: LanguageId, resource?: URI): ResolvedLanguageConfiguration {
		return LanguageConfigurationRegistry.getLanguageConfiguration(languageId) ??
			new ResolvedLanguageConfiguration(new LanguageIdentifier('unknown', languageId), {});
	}
}
