/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Event } from '../../../../base/common/event.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import Severity from '../../../../base/common/severity.js';
import { compare } from '../../../../base/common/strings.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { Command } from '../../../../editor/common/languages.js';
import { LanguageFeatureRegistry } from '../../../../editor/common/languageFeatureRegistry.js';
import { LanguageSelector } from '../../../../editor/common/languageSelector.js';
import { IAccessibilityInformation } from '../../../../platform/accessibility/common/accessibility.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export interface ILanguageStatus {
	readonly id: string;
	readonly name: string;
	readonly selector: LanguageSelector;
	readonly severity: Severity;
	readonly label: string | { value: string; shortValue: string };
	readonly detail: string;
	readonly busy: boolean;
	readonly source: string;
	readonly command: Command | undefined;
	readonly accessibilityInfo: IAccessibilityInformation | undefined;
}

export interface ILanguageStatusProvider {
	provideLanguageStatus(langId: string, token: CancellationToken): Promise<ILanguageStatus | undefined>;
}

export const ILanguageStatusService = createDecorator<ILanguageStatusService>('ILanguageStatusService');

export interface ILanguageStatusService {

	_serviceBrand: undefined;

	onDidChange: Event<void>;

	addStatus(status: ILanguageStatus): IDisposable;

	getLanguageStatus(model: ITextModel): ILanguageStatus[];
}


class LanguageStatusServiceImpl implements ILanguageStatusService {

	declare _serviceBrand: undefined;

	private readonly _provider = new LanguageFeatureRegistry<ILanguageStatus>();

	readonly onDidChange: Event<any> = this._provider.onDidChange;

	addStatus(status: ILanguageStatus): IDisposable {
		return this._provider.register(status.selector, status);
	}

	getLanguageStatus(model: ITextModel): ILanguageStatus[] {
		return this._provider.ordered(model).sort((a, b) => {
			let res = b.severity - a.severity;
			if (res === 0) {
				res = compare(a.source, b.source);
			}
			if (res === 0) {
				res = compare(a.id, b.id);
			}
			return res;
		});
	}
}

registerSingleton(ILanguageStatusService, LanguageStatusServiceImpl, InstantiationType.Delayed);
