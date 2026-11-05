/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { derived, ITransaction, observableValue, subtransaction, transaction } from '../../../../../base/common/observable.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ICustomViewService } from '../../../customView/browser/customViewService.js';
import { IWindowCanvasDescriptor, IWindowCanvasOpenRequest, IWindowCanvasService } from '../../browser/windowCanvasService.js';

export class TestWindowCanvasService extends mock<IWindowCanvasService>() {
	override readonly canvases = observableValue<readonly IWindowCanvasDescriptor[]>(this, []);
	override readonly navigationRequest = observableValue<IWindowCanvasOpenRequest | undefined>(this, undefined);
	override readonly activeCanvasOpen = observableValue<IWindowCanvasOpenRequest | undefined>(this, undefined);
	override readonly activeCanvasId = derived(this, reader => this.activeCanvasOpen.read(reader)?.id);

	constructor(private readonly customViewService: ICustomViewService) {
		super();
	}

	override registerCanvas(descriptor: IWindowCanvasDescriptor): IDisposable {
		this.canvases.set([...this.canvases.get(), descriptor], undefined);
		return toDisposable(() => {
			this.canvases.set(this.canvases.get().filter(canvas => canvas !== descriptor), undefined);
			if (this.activeCanvasOpen.get()?.id === descriptor.id) {
				this.deactivateCanvas();
			}
		});
	}

	override async openCanvas(id: string, options?: { readonly source?: 'history' }): Promise<void> {
		if (!this.canvases.get().some(canvas => canvas.id === id)) {
			throw new Error(`Unavailable canvas: ${id}`);
		}
		const request: IWindowCanvasOpenRequest = { id, source: options?.source ?? 'explicit' };
		transaction(tx => {
			this.navigationRequest.set(request, tx);
			this.customViewService.hideCustomView(tx);
			this.activeCanvasOpen.set(request, tx);
		});
	}

	override cancelPendingOpen(): void { }

	override deactivateCanvas(tx?: ITransaction): void {
		subtransaction(tx, tx => {
			this.navigationRequest.set(undefined, tx);
			this.activeCanvasOpen.set(undefined, tx);
		});
	}
}
