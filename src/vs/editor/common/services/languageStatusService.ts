/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { Event } from 'vs/base/common/event';
import { IMarkdownString } from 'vs/base/common/htmlContent';
import { IDisposable } from 'vs/base/common/lifecycle';
import Severity from 'vs/base/common/severity';
import { ITextModel } from 'vs/editor/common/model';
import { LanguageFeatureRegistry } from 'vs/editor/common/modes/languageFeatureRegistry';
import { LanguageSelector } from 'vs/editor/common/modes/languageSelector';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';


export interface ILanguageStatus {
	selector: LanguageSelector,
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

	addStatus(status: ILanguageStatus): IDisposable;

	getLanguageStatus(model: ITextModel): Promise<ILanguageStatus[]>;
}


class LanguageStatusServiceImpl implements ILanguageStatusService {

	declare _serviceBrand: undefined;

	private readonly _provider = new LanguageFeatureRegistry<ILanguageStatus>();

	readonly onDidChange: Event<any> = this._provider.onDidChange;

	addStatus(status: ILanguageStatus): IDisposable {
		return this._provider.register(status.selector, status);
	}

	async getLanguageStatus(model: ITextModel): Promise<ILanguageStatus[]> {
		return this._provider.ordered(model).sort((a, b) => b.severity - a.severity);
	}
}

registerSingleton(ILanguageStatusService, LanguageStatusServiceImpl, true);
