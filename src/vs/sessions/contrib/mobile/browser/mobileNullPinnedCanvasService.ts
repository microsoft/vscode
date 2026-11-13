/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { constObservable, IReader } from '../../../../base/common/observable.js';
// eslint-disable-next-line local/code-translation-remind -- The mobile entry has its own localization bundle.
import { localize } from '../../../../nls.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { ICanvas, ICanvasReference } from '../../../../workbench/common/canvasReference.js';
import { IPinnedCanvas, IPinnedCanvasService, PinnedCanvasTarget } from '../../../../workbench/contrib/sessions/browser/pinnedCanvases.js';

const unavailableMessage = localize('mobile.pinnedCanvasesUnavailable', "Pinned canvases are not available on this device.");

/** The shared sessions list requires this service without loading desktop canvas presentation. */
export class MobileNullPinnedCanvasService implements IPinnedCanvasService {
	declare readonly _serviceBrand: undefined;

	readonly enabled = constObservable(false);
	readonly entries = constObservable<readonly IPinnedCanvas[]>([]);
	readonly selected = constObservable<IPinnedCanvas | undefined>(undefined);

	constructor(
		@INotificationService private readonly notificationService: INotificationService,
	) { }

	getEntry(_target: PinnedCanvasTarget, _reader?: IReader): IPinnedCanvas | undefined {
		return undefined;
	}

	isPinned(_reference: ICanvasReference, _reader?: IReader): boolean {
		return false;
	}

	isShown(_reference: ICanvasReference, _reader?: IReader): boolean {
		return false;
	}

	getTrackedCanvas(_reference: ICanvasReference, _reader?: IReader): ICanvas | undefined {
		return undefined;
	}

	pin(_reference: ICanvasReference): boolean {
		this.notificationService.error(unavailableMessage);
		return false;
	}

	unpin(_target: PinnedCanvasTarget): void { }

	async show(_target: PinnedCanvasTarget): Promise<void> {
		throw new Error(unavailableMessage);
	}

	reconnect(_target: PinnedCanvasTarget): void { }

	async goToChat(_target: PinnedCanvasTarget): Promise<void> {
		throw new Error(unavailableMessage);
	}

	async closeCanvas(_target: PinnedCanvasTarget): Promise<void> {
		throw new Error(unavailableMessage);
	}
}
