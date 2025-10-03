/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';

export interface ITopicDisplay {
	readonly sourceUrl: string;
	readonly targetUrl: string;
	readonly languageId: string;
	readonly sessionId: string;
	readonly languageName: string;
	readonly title: string | undefined;
	readonly onTitleUpdated: Event<String>;
	readonly onUrlChanged: Event<String>;
	readonly onBackwardNavigation: Event<void>;
	readonly onForwardNavigation: Event<void>;

	displayContent(element: HTMLElement): void;
	hideContent(dispose: boolean): void;
	activateFindWidget(): void;
	deactivateFindWidget(): void;
	dispose(): void;
}

export type IHelpEntry = ITopicDisplay;
