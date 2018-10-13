/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Memento } from 'vs/workbench/common/memento';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { Themable } from 'vs/workbench/common/theme';
import { INextStorage2Service, StorageScope } from 'vs/platform/storage2/common/storage2';

export class Component extends Themable {
	private id: string;
	private memento: Memento;

	constructor(
		id: string,
		themeService: IThemeService,
		nextStorage2Service: INextStorage2Service
	) {
		super(themeService);

		this.id = id;
		this.memento = new Memento(this.id, nextStorage2Service);

		this._register(nextStorage2Service.onWillClose(() => {

			// Ask the component to persist state into the memento
			this.saveState();

			// Then save the memento into storage
			this.memento.saveMemento();
		}));
	}

	getId(): string {
		return this.id;
	}

	protected getMemento(scope: StorageScope): object {
		return this.memento.getMemento(scope);
	}

	protected saveState(): void {
		// Subclasses to implement for storing state
	}
}