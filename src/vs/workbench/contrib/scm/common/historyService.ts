/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { ISCMHistoryItemGroup, ISCMHistoryService } from 'vs/workbench/contrib/scm/common/history';
import { ISCMRepository, ISCMService } from 'vs/workbench/contrib/scm/common/scm';

export class SCMHistoryService extends Disposable implements ISCMHistoryService {

	declare readonly _serviceBrand: undefined;

	private _historyItemGroups = new Map<ISCMRepository, ISCMHistoryItemGroup[]>();

	private readonly _onDidChangeHistoryItemGroups = this._register(new Emitter<ISCMRepository>());
	readonly onDidChangeHistoryItemGroups = this._onDidChangeHistoryItemGroups.event;

	constructor(@ISCMService scmService: ISCMService) {
		super();

		this._register(scmService.onDidAddRepository(this.onDidAddRepository, this));
		this._register(scmService.onDidRemoveRepository(this.onDidRemoveRepository, this));

		for (const repository of scmService.repositories) {
			this.onDidAddRepository(repository);
		}
	}

	getHistoryItemGroups(repository: ISCMRepository): Iterable<ISCMHistoryItemGroup> {
		return this._historyItemGroups.get(repository) ?? [];
	}

	private onDidAddRepository(repository: ISCMRepository): void {
		repository.provider.onDidChangeHistoryProvider(e => {
			const historyItemGroups: ISCMHistoryItemGroup[] = [];

			for (const historyItemGroup of e.added) {
				historyItemGroups.push(historyItemGroup);
			}
			for (const historyItemGroup of e.modified) {
				historyItemGroups.push(historyItemGroup);
			}

			this._historyItemGroups.set(repository, historyItemGroups);
			this._onDidChangeHistoryItemGroups.fire(repository);
		});
	}

	private onDidRemoveRepository(repository: ISCMRepository): void {
		this._historyItemGroups.delete(repository);
	}
}
