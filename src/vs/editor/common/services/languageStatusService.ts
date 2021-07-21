/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { onUnexpectedExternalError } from 'vs/base/common/errors';
import { Emitter, Event } from 'vs/base/common/event';
import { IMarkdownString } from 'vs/base/common/htmlContent';
import { IDisposable } from 'vs/base/common/lifecycle';
import Severity from 'vs/base/common/severity';
import { ITextModel } from 'vs/editor/common/model';
import { LanguageFeatureRegistry } from 'vs/editor/common/modes/languageFeatureRegistry';
import { LanguageSelector } from 'vs/editor/common/modes/languageSelector';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';


export interface ILanguageStatus {
	severity: Severity;
	text: string;
	message: string | IMarkdownString;
}

export interface ILanguageStatusProvider {
	provideLanguageStatus(langId: string, token: CancellationToken): Promise<ILanguageStatus | undefined>
}

export const ILanguageStatusService = createDecorator<ILanguageStatusService>('ILanguageStatusService');

export interface ILanguageStatusService {

	_serviceBrand: undefined;

	onDidChange: Event<void>;

	registerLanguageStatusProvider(selector: LanguageSelector, provider: ILanguageStatusProvider): IDisposable;

	getLanguageStatus(model: ITextModel): Promise<ILanguageStatus[]>;
}


class LanguageStatusServiceImpl implements ILanguageStatusService {
	declare _serviceBrand: undefined;

	private readonly _provider = new LanguageFeatureRegistry<ILanguageStatusProvider>();

	private readonly _onDidChange = new Emitter<void>();
	readonly onDidChange: Event<void> = Event.any(this._onDidChange.event, this._provider.onDidChange);

	dispose() {
		this._onDidChange.dispose();
	}

	registerLanguageStatusProvider(selector: LanguageSelector, provider: ILanguageStatusProvider): IDisposable {
		return this._provider.register(selector, provider);
	}

	async getLanguageStatus(model: ITextModel): Promise<ILanguageStatus[]> {
		const all: ILanguageStatus[] = [];
		for (const provider of this._provider.ordered(model)) {
			try {
				const status = await provider.provideLanguageStatus(model.getLanguageIdentifier().language, CancellationToken.None);
				if (status) {
					all.push(status);
				}
			} catch (err) {
				onUnexpectedExternalError(err);
			}
		}
		return all.sort((a, b) => b.severity - a.severity);
	}
}

registerSingleton(ILanguageStatusService, LanguageStatusServiceImpl, true);
