/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { LanguageId, LanguageIdentifier } from 'vs/editor/common/modes';
import { ILanguageConfigurationService, LanguageConfigurationRegistry, LanguageConfigurationServiceChangeEvent, ResolvedLanguageConfiguration } from 'vs/editor/common/modes/languageConfigurationRegistry';

export class TestLanguageConfigurationService extends Disposable implements ILanguageConfigurationService {
	_serviceBrand: undefined;

	private readonly onDidChangeEmitter = new Emitter<LanguageConfigurationServiceChangeEvent>();
	public readonly onDidChange = this.onDidChangeEmitter.event;

	constructor() {
		super();

		this._register(
			LanguageConfigurationRegistry.onDidChange((e) => {
				this.onDidChangeEmitter.fire(new LanguageConfigurationServiceChangeEvent(e.languageIdentifier));
			})
		);
	}

	getLanguageConfiguration(languageId: LanguageId, resource?: URI): ResolvedLanguageConfiguration {
		return LanguageConfigurationRegistry.getLanguageConfiguration(languageId) ??
			new ResolvedLanguageConfiguration(new LanguageIdentifier('unknown', languageId), {});
	}
}
