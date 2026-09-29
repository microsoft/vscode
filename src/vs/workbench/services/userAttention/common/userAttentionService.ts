/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../../base/common/lifecycle.js';
import { IObservable } from '../../../../base/common/observable.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const IUserAttentionService = createDecorator<IUserAttentionService>('userAttentionService');

/**
 * Service that tracks whether the user is actively paying attention to VS Code.
 *
 * This is determined by:
 * * VS Code window has focus
 * * User has performed some activity (keyboard/mouse) within the last minute
 */
export interface IUserAttentionService {
	readonly _serviceBrand: undefined;

	readonly isVsCodeFocused: IObservable<boolean>;

	/**
	 * Observable that is true when user activity was recently detected (within the last 500ms).
	 * This includes keyboard typing and mouse movements/clicks while VS Code is focused.
	 * The 500ms window prevents event spam from continuous mouse movement.
	 */
	readonly isUserActive: IObservable<boolean>;

	/**
	 * Observable that indicates whether the user is actively paying attention to VS Code.
	 * This is true when:
	 * * VS Code has focus, AND
	 * * There was user activity within the last minute
	 */
	readonly hasUserAttention: IObservable<boolean>;

	/**
	 * The total time in milliseconds that the user has been paying attention to VS Code.
	 */
	readonly totalFocusTimeMs: number;

	/**
	 * Fires the callback after the user has accumulated the specified amount of focus time.
	 * Focus time is computed as the number of 1-minute blocks in which the user has attention
	 * (hasUserAttention is true).
	 *
	 * @param focusTimeMs The accumulated focus time in milliseconds before the callback is fired.
	 * @param callback The callback to fire once the focus time has been accumulated.
	 * @returns A disposable that cancels the callback when disposed.
	 */
	fireAfterGivenFocusTimePassed(focusTimeMs: number, callback: () => void): IDisposable;
}
