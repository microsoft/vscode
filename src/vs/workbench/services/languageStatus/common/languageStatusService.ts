/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { Emitter, Event } from 'vs/base/common/event';
import { combinedDisposable, IDisposable } from 'vs/base/common/lifecycle';
import Severity from 'vs/base/common/severity';
import { compare } from 'vs/base/common/strings';
import { ITextModel } from 'vs/editor/common/model';
import { Command } from 'vs/editor/common/modes';
import { LanguageFeatureRegistry } from 'vs/editor/common/modes/languageFeatureRegistry';
import { LanguageSelector } from 'vs/editor/common/modes/languageSelector';
import { IAccessibilityInformation } from 'vs/platform/accessibility/common/accessibility';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IProgressService, Progress } from 'vs/platform/progress/common/progress';

export interface ILanguageStatus {
	readonly id: string;
	readonly name: string;
	readonly selector: LanguageSelector;
	readonly severity: Severity;
	readonly label: string;
	readonly detail: string;
	readonly source: string;
	readonly command: Command | undefined;
	readonly accessibilityInfo: IAccessibilityInformation | undefined;
}

export interface ILanguageStatusProvider {
	provideLanguageStatus(langId: string, token: CancellationToken): Promise<ILanguageStatus | undefined>
}

export const ILanguageStatusService = createDecorator<ILanguageStatusService>('ILanguageStatusService');

export interface ILanguageStatusService {

	_serviceBrand: undefined;

	onDidChange: Event<void>;

	onDidChangeBusy: Event<ILanguageStatus>;

	addStatus(status: ILanguageStatus): IDisposable;

	getLanguageStatus(model: ITextModel): ILanguageStatus[];

	isBusy(status: ILanguageStatus): boolean;
}


class LanguageStatusServiceImpl implements ILanguageStatusService {

	declare _serviceBrand: undefined;

	private readonly _provider = new LanguageFeatureRegistry<ILanguageStatus>();
	readonly onDidChange: Event<any> = this._provider.onDidChange;

	private readonly _busyStatus = new Map<ILanguageStatus, number>();
	private readonly _onDidChangeBusy = new Emitter<ILanguageStatus>();
	readonly onDidChangeBusy: Event<ILanguageStatus> = this._onDidChangeBusy.event;

	constructor(@IProgressService private readonly _progressService: IProgressService) { }


	isBusy(status: ILanguageStatus): boolean {
		return (this._busyStatus.get(status) ?? 0) > 0;
	}

	addStatus(status: ILanguageStatus): IDisposable {
		const d1 = this._provider.register(status.selector, status);
		const d2 = this._progressService.registerProgressLocation(status.id, {
			startProgress: () => {
				let value = this._busyStatus.get(status);
				if (value === undefined) {
					this._busyStatus.set(status, 1);
					this._onDidChangeBusy.fire(status);
				} else {
					this._busyStatus.set(status, value + 1);
				}
				return {
					progress: new Progress(_data => { }),
					stop: () => {
						let value = this._busyStatus.get(status);
						if (value !== undefined) {
							if (value === 1) {
								this._busyStatus.delete(status);
								this._onDidChangeBusy.fire(status);
							} else {
								this._busyStatus.set(status, value - 1);
							}
						}
					}
				};
			}
		});
		return combinedDisposable(d1, d2);
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

registerSingleton(ILanguageStatusService, LanguageStatusServiceImpl, true);
