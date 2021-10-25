/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Emitter } from 'vs/base/common/event';
import { IDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { ILanguageConfigurationService, LanguageConfigurationRegistry, LanguageConfigurationServiceChangeEvent, ResolvedLanguageConfiguration } from 'vs/editor/common/modes/languageConfigurationRegistry';

export class TestLanguageConfigurationService implements ILanguageConfigurationService {
	_serviceBrand: undefined;

	private registration: IDisposable | undefined = undefined;

	private readonly onDidChangeEmitter = new Emitter<LanguageConfigurationServiceChangeEvent>({
		onFirstListenerAdd: () => {
			this.registration = LanguageConfigurationRegistry.onDidChange((e) => {
				this.onDidChangeEmitter.fire(new LanguageConfigurationServiceChangeEvent(e.languageId));
			});
		},
		onLastListenerRemove: () => {
			this.registration?.dispose();
			this.registration = undefined;
		}
	});
	public readonly onDidChange = this.onDidChangeEmitter.event;

	getLanguageConfiguration(languageId: string, resource?: URI): ResolvedLanguageConfiguration {
		return LanguageConfigurationRegistry.getLanguageConfiguration(languageId) ??
			new ResolvedLanguageConfiguration('unknown', {});
	}
}
