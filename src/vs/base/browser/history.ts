/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../common/event.js';

export interface IHistoryNavigationWidget {

	readonly element: HTMLElement;

	showPreviousValue(): void;

	showNextValue(): void;

	onDidFocus: Event<void>;

	onDidBlur: Event<void>;

}
