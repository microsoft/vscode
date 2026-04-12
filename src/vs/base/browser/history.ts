/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../common/event.js';

export interface IHistoryNavigationWidget {

	readonly element: HTMLElement;

	showPreviousValue(): void;

	showNextValue(): void;

	readonly onDidFocus: Event<void>;

	readonly onDidBlur: Event<void>;

}
