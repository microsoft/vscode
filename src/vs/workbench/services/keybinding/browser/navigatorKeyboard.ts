/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface IKeyboard {
	getLayoutMap(): Promise<Object>;
	lock(keyCodes?: string[]): Promise<void>;
	unlock(): void;
	addEventListener?(type: string, listener: () => void): void;

}
export type INavigatorWithKeyboard = Navigator & {
	keyboard: IKeyboard;
};
