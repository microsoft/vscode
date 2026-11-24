/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../../base/common/event.js';
import { IDisposable } from '../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { IQuickInput, IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';

/** Shows and hides a Quick Input the way the service reports it, without rendering one. */
export class FakeQuickInputService extends mock<IQuickInputService>() implements IDisposable {
	private readonly _onShow = new Emitter<void>();
	private readonly _onHide = new Emitter<void>();
	override readonly onShow = this._onShow.event;
	override readonly onHide = this._onHide.event;
	override currentQuickInput: IQuickInput | undefined;

	show(): void {
		this.currentQuickInput = new (mock<IQuickInput>())();
		this._onShow.fire();
	}

	hide(): void {
		this.currentQuickInput = undefined;
		this._onHide.fire();
	}

	dispose(): void {
		this._onShow.dispose();
		this._onHide.dispose();
	}
}
