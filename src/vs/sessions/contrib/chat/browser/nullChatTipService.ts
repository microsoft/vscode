/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IChatTip, IChatTipService } from '../../../../workbench/contrib/chat/browser/chatTipService.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';

class NullChatTipService implements IChatTipService {
	declare _serviceBrand: undefined;

	readonly onDidDismissTip: Event<void> = Event.None;
	readonly onDidNavigateTip: Event<IChatTip> = Event.None;
	readonly onDidHideTip: Event<void> = Event.None;
	readonly onDidDisableTips: Event<void> = Event.None;

	getWelcomeTip(_contextKeyService: IContextKeyService): IChatTip | undefined { return undefined; }
	resetSession(): void { }
	dismissTip(): void { }
	dismissTipForSession(): void { }
	hideTip(): void { }
	hideTipsForSession(): void { }
	async disableTips(): Promise<void> { }
	navigateToNextTip(): IChatTip | undefined { return undefined; }
	navigateToPreviousTip(): IChatTip | undefined { return undefined; }
	getNextEligibleTip(): IChatTip | undefined { return undefined; }
	hasMultipleTips(): boolean { return false; }
	recordSlashCommandUsage(_command: string): void { }
	clearDismissedTips(): void { }
}

registerSingleton(IChatTipService, NullChatTipService, InstantiationType.Delayed);
