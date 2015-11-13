/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module winreg {
	export interface IRegValue {
			host: string;
			hive: any;
			key: string;
			name: string;
			type: string;
			value: any;
		}

	export interface IWinRegConfig {
			hive: any;
			key: string;
	}

	export interface IRegValuesCallback {
			(error: Error, items: IRegValue[]): void;
	}

	export interface IWinReg {
		/**
		 * list the values under this key
		 */
		values(callback: IRegValuesCallback): void;

		/**
		 * list the subkeys of this key
		 */
		keys(callback: (error:Error, keys: string[])=> void): void;

		/**
		 * gets a value by it's name
		 */
		get(name: string, callback: (error: Error, item: IRegValue)=> void): void;

		/**
		 * sets a value
		 */
		set(name:string, type: string, value: string, callback: (error:string) => void): void;

		/**
		 * remove the value with the given key
		 */
		remove(name: string, callback: (error: void) => void): void;

		/**
		 * create this key
		 */
		create(callback: (error:Error) => void): void;

		/**
		 * remove this key
		 */
		erase(callback: (error:Error)=> void): void;

		/**
		 * a new Winreg instance initialized with the parent ke
		 */
		parent: IWinReg;

		host: string;
		hive: string;
		key: string;
		path: string;
	}

	export interface IWinRegFactory {
		new(config: IWinRegConfig): IWinReg;

		// hives
		HKLM: string;
		HKCU: string;
		HKCR: string;
		HKCC: string;
		HKU: string;

		// types
		REG_SZ: string;
 		REG_MULTI_SZ: string;
   		REG_EXPAND_SZ: string;
   		REG_DWORD: string;
   		REG_QWORD: string;
   		REG_BINARY: string;
	    REG_NONE: string;
	}
}

declare module 'winreg' {
	 var winreg: winreg.IWinRegFactory;
	 export = winreg;
}