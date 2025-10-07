/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// reference: https://developer.mozilla.org/en-US/docs/Web/API/Keyboard_API

// reference: https://developer.mozilla.org/en-US/docs/Web/API/KeyboardLayoutMap
export type KeyboardLayoutMap = Map<string, string>;

// reference: https://developer.mozilla.org/en-US/docs/Web/API/Keyboard
export interface IKeyboard extends EventTarget {
	getLayoutMap(): Promise<KeyboardLayoutMap>;
	lock(keyCodes?: string[]): Promise<void>;
	unlock(): void;
}

export type INavigatorWithKeyboard = Navigator & {
	keyboard: IKeyboard;
};
