/*! *****************************************************************************
Copyright (c) Microsoft Corporation. All rights reserved.
Licensed under the Apache License, Version 2.0 (the "License"); you may not use
this file except in compliance with the License. You may obtain a copy of the
License at http://www.apache.org/licenses/LICENSE-2.0

THIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
KIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED
WARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,
MERCHANTABLITY OR NON-INFRINGEMENT.

See the Apache Version 2.0 License for specific language governing permissions
and limitations under the License.
***************************************************************************** */

/// <reference no-default-lib="true"/>
/// <reference path="lib.es2015.symbol.d.ts" />

interface SymbolConstructor {
    /**
      * A method that determines if a constructor object recognizes an object as one of the
      * constructor’s instances. Called by the semantics of the instanceof operator.
      */
    readonly hasInstance: symbol;

    /**
      * A Boolean value that if true indicates that an object should flatten to its array elements
      * by Array.prototype.concat.
      */
    readonly isConcatSpreadable: symbol;

    /**
      * A regular expression method that matches the regular expression against a string. Called
      * by the String.prototype.match method.
      */
    readonly match: symbol;

    /**
      * A regular expression method that replaces matched substrings of a string. Called by the
      * String.prototype.replace method.
      */
    readonly replace: symbol;

    /**
      * A regular expression method that returns the index within a string that matches the
      * regular expression. Called by the String.prototype.search method.
      */
    readonly search: symbol;

    /**
      * A function valued property that is the constructor function that is used to create
      * derived objects.
      */
    readonly species: symbol;

    /**
      * A regular expression method that splits a string at the indices that match the regular
      * expression. Called by the String.prototype.split method.
      */
    readonly split: symbol;

    /**
      * A method that converts an object to a corresponding primitive value.
      * Called by the ToPrimitive abstract operation.
      */
    readonly toPrimitive: symbol;

    /**
      * A String value that is used in the creation of the default string description of an object.
      * Called by the built-in method Object.prototype.toString.
      */
    readonly toStringTag: symbol;

    /**
      * An Object whose own property names are property names that are excluded from the 'with'
      * environment bindings of the associated objects.
      */
    readonly unscopables: symbol;
}

interface Symbol {
    readonly [Symbol.toStringTag]: "Symbol";
}

interface Array<T> {
    /**
     * Returns an object whose properties have the value 'true'
     * when they will be absent when used in a 'with' statement.
     */
    [Symbol.unscopables](): {
        copyWithin: boolean;
        entries: boolean;
        fill: boolean;
        find: boolean;
        findIndex: boolean;
        keys: boolean;
        values: boolean;
    };
}

interface Date {
    /**
     * Converts a Date object to a string.
     */
    [Symbol.toPrimitive](hint: "default"): string;
    /**
     * Converts a Date object to a string.
     */
    [Symbol.toPrimitive](hint: "string"): string;
    /**
     * Converts a Date object to a number.
     */
    [Symbol.toPrimitive](hint: "number"): number;
    /**
     * Converts a Date object to a string or number.
     *
     * @param hint The strings "number", "string", or "default" to specify what primitive to return.
     *
     * @throws {TypeError} If 'hint' was given something other than "number", "string", or "default".
     * @returns A number if 'hint' was "number", a string if 'hint' was "string" or "default".
     */
    [Symbol.toPrimitive](hint: string): string | number;
}

interface Map<K, V> {
    readonly [Symbol.toStringTag]: "Map";
}

interface WeakMap<K, V>{
    readonly [Symbol.toStringTag]: "WeakMap";
}

interface Set<T> {
    readonly [Symbol.toStringTag]: "Set";
}

interface WeakSet<T> {
    readonly [Symbol.toStringTag]: "WeakSet";
}

interface JSON {
    readonly [Symbol.toStringTag]: "JSON";
}

interface Function {
    /**
     * Determines whether the given value inherits from this function if this function was used
     * as a constructor function.
     *
     * A constructor function can control which objects are recognized as its instances by
     * 'instanceof' by overriding this method.
     */
    [Symbol.hasInstance](value: any): boolean;
}

interface GeneratorFunction extends Function {
    readonly [Symbol.toStringTag]: "GeneratorFunction";
}

interface Math {
    readonly [Symbol.toStringTag]: "Math";
}

interface Promise<T> {
    readonly [Symbol.toStringTag]: "Promise";
}

interface PromiseConstructor {
    readonly [Symbol.species]: Function;
}

interface RegExp {
        /**
      * Matches a string with this regular expression, and returns an array containing the results of
      * that search.
      * @param string A string to search within.
      */
    [Symbol.match](string: string): RegExpMatchArray | null;

    /**
      * Replaces text in a string, using this regular expression.
      * @param string A String object or string literal whose contents matching against
      *               this regular expression will be replaced
      * @param replaceValue A String object or string literal containing the text to replace for every
      *                     successful match of this regular expression.
      */
    [Symbol.replace](string: string, replaceValue: string): string;

    /**
      * Replaces text in a string, using this regular expression.
      * @param string A String object or string literal whose contents matching against
      *               this regular expression will be replaced
      * @param replacer A function that returns the replacement text.
      */
    [Symbol.replace](string: string, replacer: (substring: string, ...args: any[]) => string): string;

    /**
      * Finds the position beginning first substring match in a regular expression search
      * using this regular expression.
      *
      * @param string The string to search within.
      */
    [Symbol.search](string: string): number;

    /**
      * Returns an array of substrings that were delimited by strings in the original input that
      * match against this regular expression.
      *
      * If the regular expression contains capturing parentheses, then each time this
      * regular expression matches, the results (including any undefined results) of the
      * capturing parentheses are spliced.
      *
      * @param string string value to split
      * @param limit if not undefined, the output array is truncated so that it contains no more
      * than 'limit' elements.
      */
    [Symbol.split](string: string, limit?: number): string[];
}

interface RegExpConstructor {
    [Symbol.species](): RegExpConstructor;
}

interface String {
    /**
      * Matches a string an object that supports being matched against, and returns an array containing the results of that search.
      * @param matcher An object that supports being matched against.
      */
    match(matcher: { [Symbol.match](string: string): RegExpMatchArray | null; }): RegExpMatchArray | null;

    /**
      * Replaces text in a string, using an object that supports replacement within a string.
      * @param searchValue A object can search for and replace matches within a string.
      * @param replaceValue A string containing the text to replace for every successful match of searchValue in this string.
      */
    replace(searchValue: { [Symbol.replace](string: string, replaceValue: string): string; }, replaceValue: string): string;

    /**
      * Replaces text in a string, using an object that supports replacement within a string.
      * @param searchValue A object can search for and replace matches within a string.
      * @param replacer A function that returns the replacement text.
      */
    replace(searchValue: { [Symbol.replace](string: string, replacer: (substring: string, ...args: any[]) => string): string; }, replacer: (substring: string, ...args: any[]) => string): string;

    /**
      * Finds the first substring match in a regular expression search.
      * @param searcher An object which supports searching within a string.
      */
    search(searcher: { [Symbol.search](string: string): number; }): number;

    /**
      * Split a string into substrings using the specified separator and return them as an array.
      * @param splitter An object that can split a string.
      * @param limit A value used to limit the number of elements returned in the array.
      */
    split(splitter: { [Symbol.split](string: string, limit?: number): string[]; }, limit?: number): string[];
}

/**
  * Represents a raw buffer of binary data, which is used to store data for the
  * different typed arrays. ArrayBuffers cannot be read from or written to directly,
  * but can be passed to a typed array or DataView Object to interpret the raw
  * buffer as needed.
  */
interface ArrayBuffer {
    readonly [Symbol.toStringTag]: "ArrayBuffer";
}

interface DataView {
    readonly [Symbol.toStringTag]: "DataView";
}

/**
  * A typed array of 8-bit integer values. The contents are initialized to 0. If the requested
  * number of bytes could not be allocated an exception is raised.
  */
interface Int8Array {
    readonly [Symbol.toStringTag]: "Int8Array";
}

/**
  * A typed array of 8-bit unsigned integer values. The contents are initialized to 0. If the
  * requested number of bytes could not be allocated an exception is raised.
  */
interface Uint8Array {
    readonly [Symbol.toStringTag]: "UInt8Array";
}

/**
  * A typed array of 8-bit unsigned integer (clamped) values. The contents are initialized to 0.
  * If the requested number of bytes could not be allocated an exception is raised.
  */
interface Uint8ClampedArray {
    readonly [Symbol.toStringTag]: "Uint8ClampedArray";
}

/**
  * A typed array of 16-bit signed integer values. The contents are initialized to 0. If the
  * requested number of bytes could not be allocated an exception is raised.
  */
interface Int16Array {
    readonly [Symbol.toStringTag]: "Int16Array";
}

/**
  * A typed array of 16-bit unsigned integer values. The contents are initialized to 0. If the
  * requested number of bytes could not be allocated an exception is raised.
  */
interface Uint16Array {
    readonly [Symbol.toStringTag]: "Uint16Array";
}

/**
  * A typed array of 32-bit signed integer values. The contents are initialized to 0. If the
  * requested number of bytes could not be allocated an exception is raised.
  */
interface Int32Array {
    readonly [Symbol.toStringTag]: "Int32Array";
}

/**
  * A typed array of 32-bit unsigned integer values. The contents are initialized to 0. If the
  * requested number of bytes could not be allocated an exception is raised.
  */
interface Uint32Array {
    readonly [Symbol.toStringTag]: "Uint32Array";
}

/**
  * A typed array of 32-bit float values. The contents are initialized to 0. If the requested number
  * of bytes could not be allocated an exception is raised.
  */
interface Float32Array {
    readonly [Symbol.toStringTag]: "Float32Array";
}

/**
  * A typed array of 64-bit float values. The contents are initialized to 0. If the requested
  * number of bytes could not be allocated an exception is raised.
  */
interface Float64Array {
    readonly [Symbol.toStringTag]: "Float64Array";
}