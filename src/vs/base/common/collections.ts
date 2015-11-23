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


export function keys<T>(from:IStringDictionary<T>):IIterable<string>;
export function keys<T>(from:INumberDictionary<T>):IIterable<number>;
export function keys<T>(from:any):IIterable<any> {
	
	return {
		every: function(callback:(element:any)=>boolean):boolean {
			for (var key in from) {
				if (hasOwnProperty.call(from, key)) {
					if(!callback(key)) {
						return false;
					}
				}
			}
			return true;
		}
	};
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


/**
 * An iterable of a given type. This iterable is
 * compatible with the JavaScript array.
 */
export interface IIterable<E> {
	
	/**
	 * Iterates over every element in the array
	 * as long as the callback does not return some
	 * 'falsy' value.
	 * @param callback A function that is called for each element
	 * @return {{true}} if every element has been visited, 
	 * 	{{false}} if it returned early
	 */
	every(callback:(element:E)=>boolean):boolean;
}

export var EmptyIterable:IIterable<any> = {
	every: function(callback) {
		return true;
	}
};

export function combine<E>(iterables:IIterable<E>[]):IIterable<E> {
	var len = iterables.length;
	if(len === 0) {
		return EmptyIterable;
	} else if(len === 1) {
		return iterables[0];
	}
	return {
		every: function(callback:(element:E)=>any) {
			for(var i = 0; i < len; i++) {
				if(!iterables[i].every(callback)) {
					return false;
				}
			}
			return true;
		}
	};
}

export function singleton<E>(element:E):IIterable<E> {
	return {
		every: function(callback) {
			return callback(element);
		}
	};
}

export function toArray<E>(iterable:IIterable<E>):E[] {
	if(Array.isArray(iterable)) {
		return <E[]> iterable;
	} else {
		var result:E[] = [];
		iterable.every((e) => {
			result.push(e);
			return true;
		});
		return result;
	}
}

///**
// * ECMAScript 6 iterator
// */
//export interface IIterator<T> {
//	next(): { done: boolean; value?: T; };
//}
//
//export function empty<T>():IIterator<T> {
//	return {
//		next: function() { return { done: true }; }
//	};
//}
//
//export function iterator<T>(array: T[]): IIterator<T> { 
//	var i = 0;
//	return {
//		next: () => { 
//			if(i < array.length) {
//				return {
//					done: false,
//					value: array[i++]
//				};
//			} else {
//				return {
//					done: true
//				};
//			}
//		}
//	};
//}

interface ICacheRow<T> {
	element: T;
	onRemove: ()=>void;
}

/**
 * Limited size cache. Provided a certain cache size limit, it
 * removes the older elements as new ones are inserted.
 */
export class LimitedSizeCache<T> {
	
	private cache: { [id: string]: ICacheRow<T> };
	private order: string[];
	
	constructor(private size: number) {
		this.cache = Object.create(null);
		this.order = [];
	}
	
	public get(id: string): T {
		var result = this.cache[id];
		return result && result.element;
	}
	
	public put(id: string, element: T, onRemove: ()=>void): void {
		var existing = this.cache[id];
		var row: ICacheRow<T> = { element: element, onRemove: onRemove };
		
		this.cache[id] = row;
		
		if (!existing) {
			this.order.push(id);
		}
		
		this.swipe();
	}
	
	private swipe(): void {
		while (this.order.length > this.size) {
			var id = this.order.shift();
			var row = this.cache[id];
			row.onRemove();
			delete this.cache[id];
		}
	}
}