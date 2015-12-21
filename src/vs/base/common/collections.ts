/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';


/**
 * An interface for a JavaScript object that
 * acts a dictionary. The keys are strings.
 */
export interface IStringDictionary<V> {
	[name:string]:V;
}

/**
 * An interface for a JavaScript object that
 * acts a dictionary. The keys are numbers.
 */
export interface INumberDictionary<V> {
	[idx:number]:V;
}

export function createStringDictionary<V>():IStringDictionary<V> {
	return Object.create(null);
}

export function createNumberDictionary<V>():INumberDictionary<V> {
	return Object.create(null);
}

/**
 * Looks up and returns a property that is owned
 * by the provided map object.
 * @param what The key.
 * @param from A native JavaScript object that stores items.
 * @param alternate A default value this is return in case an item with
 * 	the key isn't found.
 */
export function lookup<T>(from:IStringDictionary<T>, what:string, alternate?:T):T;
export function lookup<T>(from:INumberDictionary<T>, what:number, alternate?:T):T;
export function lookup<T>(from:any, what:any, alternate:T=null):T {
	var key = String(what);
	if(contains(from, key)) {
		return from[key];
	}
	return alternate;
}


/**
 * Looks up a value from the set. If the set doesn't contain the
 * value it inserts and returns the given alternate value.
 */
export function lookupOrInsert<T>(from:IStringDictionary<T>, key:string, alternate:T):T;
export function lookupOrInsert<T>(from:IStringDictionary<T>, key:string, alternateFn:()=>T):T;
export function lookupOrInsert<T>(from:INumberDictionary<T>, key:number, alternate:T):T;
export function lookupOrInsert<T>(from:INumberDictionary<T>, key:number, alternateFn:()=>T):T;
export function lookupOrInsert<T>(from:any, stringOrNumber:any, alternate:any):T {
	var key = String(stringOrNumber);
	if(contains(from, key)) {
		return from[key];
	} else {
		if(typeof alternate === 'function') {
			alternate = alternate();
		}
		from[key] = alternate;
		return alternate;
	}
}

/**
 * Inserts
 */
export function insert<T>(into: IStringDictionary<T>, data: T, hashFn: (data: T) => string): void;
export function insert<T>(into: INumberDictionary<T>, data: T, hashFn: (data: T) => string): void;
export function insert<T>(into: any, data: T, hashFn: (data: T) => string): void {
	into[hashFn(data)] = data;
}

var hasOwnProperty = Object.prototype.hasOwnProperty;

/**
 * Returns {{true}} iff the provided object contains a property
 * with the given name.
 */
export function contains<T>(from:IStringDictionary<T>, what:string):boolean;
export function contains<T>(from:INumberDictionary<T>, what:number):boolean;
export function contains<T>(from:any, what:any):boolean {
	return hasOwnProperty.call(from, what);
}

/**
 * Returns an array which contains all values that reside
 * in the given set.
 */
export function values<T>(from:IStringDictionary<T>):T[];
export function values<T>(from:INumberDictionary<T>):T[];
export function values<T>(from:any):any[] {
	var result:T[] = [];
	for (var key in from) {
		if (hasOwnProperty.call(from, key)) {
			result.push(from[key]);
		}
	}
	return result;
}

/**
 * Iterates over each entry in the provided set. The iterator allows
 * to remove elements and will stop when the callback returns {{false}}.
 */
export function forEach<T>(from:IStringDictionary<T>, callback:(entry:{key:string; value:T;}, remove:Function)=>any):void;
export function forEach<T>(from:INumberDictionary<T>, callback:(entry:{key:number; value:T;}, remove:Function)=>any):void;
export function forEach<T>(from:any, callback:(entry:{key:any; value:T;}, remove:Function)=>any):void {
	for (var key in from) {
		if (hasOwnProperty.call(from, key)) {
			var result = callback({ key:key, value: from[key] }, function() {
				delete from[key];
			});
			if(result === false) {
				return;
			}
		}
	}
}

/**
 * Removes an element from the dictionary. Returns {{false}} if the property
 * does not exists.
 */
export function remove<T>(from: IStringDictionary<T>, key: string): boolean;
export function remove<T>(from: INumberDictionary<T>, key: string): boolean;
export function remove<T>(from:any, key:string):boolean {
	if(!hasOwnProperty.call(from, key)) {
		return false;
	}
	delete from[key];
	return true;
}

/**
 * Groups the collection into a dictionary based on the provided
 * group function.
 */
export function groupBy<T>(data: T[], groupFn: (element: T) => string): IStringDictionary<T[]>{
	var result = createStringDictionary<T[]>();
	data.forEach(element => lookupOrInsert(result, groupFn(element), []).push(element));
	return result;
}
