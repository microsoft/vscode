/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, observableValue, type IObservable } from '../../../../base/common/observable.js';
import type { ISessionCanvasService, SessionCanvasInput } from './sessionCanvas.js';
import type { SessionCanvasPresentation } from './sessionCanvasPresentation.js';

/** The editor's visibility/owner lease, independent of layout-specific working-set behavior. */
export class SessionCanvasMount extends Disposable {
	readonly presentation = observableValue<SessionCanvasPresentation | undefined>(this, undefined);

	constructor(
		service: ISessionCanvasService,
		input: IObservable<SessionCanvasInput | undefined>,
		visible: IObservable<boolean>,
		windowId: number,
	) {
		super();
		const eligibleInput = derived(this, reader => {
			const current = input.read(reader);
			const showing = visible.read(reader);
			const owner = current && service.isVisibleOwner(current.reference, reader);
			const closing = current && service.isClosing(current.reference, reader);
			return current && showing && owner && !closing ? current : undefined;
		});
		this._register(autorun(reader => {
			const current = eligibleInput.read(reader);
			const lease = current ? service.acquirePresentation(current, windowId) : undefined;
			if (lease) {
				reader.store.add(lease);
			}
			this.presentation.set(lease?.object, undefined);
		}));
	}

	override dispose(): void {
		super.dispose();
		this.presentation.set(undefined, undefined);
	}
}
