/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import { LanguageConfiguration } from '../../../common/languages/languageConfiguration.js';
import { ILanguageConfigurationService, LanguageConfigurationRegistry, LanguageConfigurationServiceChangeEvent, ResolvedLanguageConfiguration } from '../../../common/languages/languageConfigurationRegistry.js';

export class TestLanguageConfigurationService extends Disposable implements ILanguageConfigurationService {
	_serviceBrand: undefined;

	private readonly _registry = this._register(new LanguageConfigurationRegistry());

	private readonly _onDidChange = this._register(new Emitter<LanguageConfigurationServiceChangeEvent>());
	public readonly onDidChange = this._onDidChange.event;

	constructor() {
		super();
		this._register(this._registry.onDidChange((e) => this._onDidChange.fire(new LanguageConfigurationServiceChangeEvent(e.languageId))));
	}

	register(languageId: string, configuration: LanguageConfiguration, priority?: number): IDisposable {
		return this._registry.register(languageId, configuration, priority);
	}

	getLanguageConfiguration(languageId: string): ResolvedLanguageConfiguration {
		return this._registry.getLanguageConfiguration(languageId) ??
			new ResolvedLanguageConfiguration('unknown', {});
	}
}
