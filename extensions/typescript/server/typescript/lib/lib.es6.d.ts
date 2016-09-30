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
/////////////////////////////
/// ECMAScript APIs
/////////////////////////////

declare const NaN: number;
declare const Infinity: number;

/**
  * Evaluates JavaScript code and executes it.
  * @param x A String value that contains valid JavaScript code.
  */
declare function eval(x: string): any;

/**
  * Converts A string to an integer.
  * @param s A string to convert into a number.
  * @param radix A value between 2 and 36 that specifies the base of the number in numString.
  * If this argument is not supplied, strings with a prefix of '0x' are considered hexadecimal.
  * All other strings are considered decimal.
  */
declare function parseInt(s: string, radix?: number): number;

/**
  * Converts a string to a floating-point number.
  * @param string A string that contains a floating-point number.
  */
declare function parseFloat(string: string): number;

/**
  * Returns a Boolean value that indicates whether a value is the reserved value NaN (not a number).
  * @param number A numeric value.
  */
declare function isNaN(number: number): boolean;

/**
  * Determines whether a supplied number is finite.
  * @param number Any numeric value.
  */
declare function isFinite(number: number): boolean;

/**
  * Gets the unencoded version of an encoded Uniform Resource Identifier (URI).
  * @param encodedURI A value representing an encoded URI.
  */
declare function decodeURI(encodedURI: string): string;

/**
  * Gets the unencoded version of an encoded component of a Uniform Resource Identifier (URI).
  * @param encodedURIComponent A value representing an encoded URI component.
  */
declare function decodeURIComponent(encodedURIComponent: string): string;

/**
  * Encodes a text string as a valid Uniform Resource Identifier (URI)
  * @param uri A value representing an encoded URI.
  */
declare function encodeURI(uri: string): string;

/**
  * Encodes a text string as a valid component of a Uniform Resource Identifier (URI).
  * @param uriComponent A value representing an encoded URI component.
  */
declare function encodeURIComponent(uriComponent: string): string;

interface PropertyDescriptor {
    configurable?: boolean;
    enumerable?: boolean;
    value?: any;
    writable?: boolean;
    get? (): any;
    set? (v: any): void;
}

interface PropertyDescriptorMap {
    [s: string]: PropertyDescriptor;
}

interface Object {
    /** The initial value of Object.prototype.constructor is the standard built-in Object constructor. */
    constructor: Function;

    /** Returns a string representation of an object. */
    toString(): string;

    /** Returns a date converted to a string using the current locale. */
    toLocaleString(): string;

    /** Returns the primitive value of the specified object. */
    valueOf(): Object;

    /**
      * Determines whether an object has a property with the specified name.
      * @param v A property name.
      */
    hasOwnProperty(v: string): boolean;

    /**
      * Determines whether an object exists in another object's prototype chain.
      * @param v Another object whose prototype chain is to be checked.
      */
    isPrototypeOf(v: Object): boolean;

    /**
      * Determines whether a specified property is enumerable.
      * @param v A property name.
      */
    propertyIsEnumerable(v: string): boolean;
}

interface ObjectConstructor {
    new (value?: any): Object;
    (): any;
    (value: any): any;

    /** A reference to the prototype for a class of objects. */
    readonly prototype: Object;

    /**
      * Returns the prototype of an object.
      * @param o The object that references the prototype.
      */
    getPrototypeOf(o: any): any;

    /**
      * Gets the own property descriptor of the specified object.
      * An own property descriptor is one that is defined directly on the object and is not inherited from the object's prototype.
      * @param o Object that contains the property.
      * @param p Name of the property.
    */
    getOwnPropertyDescriptor(o: any, p: string): PropertyDescriptor;

    /**
      * Returns the names of the own properties of an object. The own properties of an object are those that are defined directly
      * on that object, and are not inherited from the object's prototype. The properties of an object include both fields (objects) and functions.
      * @param o Object that contains the own properties.
      */
    getOwnPropertyNames(o: any): string[];

    /**
      * Creates an object that has null prototype.
      * @param o Object to use as a prototype. May be null
      */
    create(o: null): any;

    /**
      * Creates an object that has the specified prototype, and that optionally contains specified properties.
      * @param o Object to use as a prototype. May be null
      */
    create<T>(o: T): T;

    /**
      * Creates an object that has the specified prototype, and that optionally contains specified properties.
      * @param o Object to use as a prototype. May be null
      * @param properties JavaScript object that contains one or more property descriptors.
      */
    create(o: any, properties: PropertyDescriptorMap): any;

    /**
      * Adds a property to an object, or modifies attributes of an existing property.
      * @param o Object on which to add or modify the property. This can be a native JavaScript object (that is, a user-defined object or a built in object) or a DOM object.
      * @param p The property name.
      * @param attributes Descriptor for the property. It can be for a data property or an accessor property.
      */
    defineProperty(o: any, p: string, attributes: PropertyDescriptor): any;

    /**
      * Adds one or more properties to an object, and/or modifies attributes of existing properties.
      * @param o Object on which to add or modify the properties. This can be a native JavaScript object or a DOM object.
      * @param properties JavaScript object that contains one or more descriptor objects. Each descriptor object describes a data property or an accessor property.
      */
    defineProperties(o: any, properties: PropertyDescriptorMap): any;

    /**
      * Prevents the modification of attributes of existing properties, and prevents the addition of new properties.
      * @param o Object on which to lock the attributes.
      */
    seal<T>(o: T): T;

    /**
      * Prevents the modification of existing property attributes and values, and prevents the addition of new properties.
      * @param o Object on which to lock the attributes.
      */
    freeze<T>(o: T): T;

    /**
      * Prevents the addition of new properties to an object.
      * @param o Object to make non-extensible.
      */
    preventExtensions<T>(o: T): T;

    /**
      * Returns true if existing property attributes cannot be modified in an object and new properties cannot be added to the object.
      * @param o Object to test.
      */
    isSealed(o: any): boolean;

    /**
      * Returns true if existing property attributes and values cannot be modified in an object, and new properties cannot be added to the object.
      * @param o Object to test.
      */
    isFrozen(o: any): boolean;

    /**
      * Returns a value that indicates whether new properties can be added to an object.
      * @param o Object to test.
      */
    isExtensible(o: any): boolean;

    /**
      * Returns the names of the enumerable properties and methods of an object.
      * @param o Object that contains the properties and methods. This can be an object that you created or an existing Document Object Model (DOM) object.
      */
    keys(o: any): string[];
}

/**
  * Provides functionality common to all JavaScript objects.
  */
declare const Object: ObjectConstructor;

/**
  * Creates a new function.
  */
interface Function {
    /**
      * Calls the function, substituting the specified object for the this value of the function, and the specified array for the arguments of the function.
      * @param thisArg The object to be used as the this object.
      * @param argArray A set of arguments to be passed to the function.
      */
    apply(this: Function, thisArg: any, argArray?: any): any;

    /**
      * Calls a method of an object, substituting another object for the current object.
      * @param thisArg The object to be used as the current object.
      * @param argArray A list of arguments to be passed to the method.
      */
    call(this: Function, thisArg: any, ...argArray: any[]): any;

    /**
      * For a given function, creates a bound function that has the same body as the original function.
      * The this object of the bound function is associated with the specified object, and has the specified initial parameters.
      * @param thisArg An object to which the this keyword can refer inside the new function.
      * @param argArray A list of arguments to be passed to the new function.
      */
    bind(this: Function, thisArg: any, ...argArray: any[]): any;

    prototype: any;
    readonly length: number;

    // Non-standard extensions
    arguments: any;
    caller: Function;
}

interface FunctionConstructor {
    /**
      * Creates a new function.
      * @param args A list of arguments the function accepts.
      */
    new (...args: string[]): Function;
    (...args: string[]): Function;
    readonly prototype: Function;
}

declare const Function: FunctionConstructor;

interface IArguments {
    [index: number]: any;
    length: number;
    callee: Function;
}

interface String {
    /** Returns a string representation of a string. */
    toString(): string;

    /**
      * Returns the character at the specified index.
      * @param pos The zero-based index of the desired character.
      */
    charAt(pos: number): string;

    /**
      * Returns the Unicode value of the character at the specified location.
      * @param index The zero-based index of the desired character. If there is no character at the specified index, NaN is returned.
      */
    charCodeAt(index: number): number;

    /**
      * Returns a string that contains the concatenation of two or more strings.
      * @param strings The strings to append to the end of the string.
      */
    concat(...strings: string[]): string;

    /**
      * Returns the position of the first occurrence of a substring.
      * @param searchString The substring to search for in the string
      * @param position The index at which to begin searching the String object. If omitted, search starts at the beginning of the string.
      */
    indexOf(searchString: string, position?: number): number;

    /**
      * Returns the last occurrence of a substring in the string.
      * @param searchString The substring to search for.
      * @param position The index at which to begin searching. If omitted, the search begins at the end of the string.
      */
    lastIndexOf(searchString: string, position?: number): number;

    /**
      * Determines whether two strings are equivalent in the current locale.
      * @param that String to compare to target string
      */
    localeCompare(that: string): number;

    /**
      * Matches a string with a regular expression, and returns an array containing the results of that search.
      * @param regexp A variable name or string literal containing the regular expression pattern and flags.
      */
    match(regexp: string): RegExpMatchArray | null;

    /**
      * Matches a string with a regular expression, and returns an array containing the results of that search.
      * @param regexp A regular expression object that contains the regular expression pattern and applicable flags.
      */
    match(regexp: RegExp): RegExpMatchArray | null;

    /**
      * Replaces text in a string, using a regular expression or search string.
      * @param searchValue A string that represents the regular expression.
      * @param replaceValue A string containing the text to replace for every successful match of searchValue in this string.
      */
    replace(searchValue: string, replaceValue: string): string;

    /**
      * Replaces text in a string, using a regular expression or search string.
      * @param searchValue A string that represents the regular expression.
      * @param replacer A function that returns the replacement text.
      */
    replace(searchValue: string, replacer: (substring: string, ...args: any[]) => string): string;

    /**
      * Replaces text in a string, using a regular expression or search string.
      * @param searchValue A Regular Expression object containing the regular expression pattern and applicable flags.
      * @param replaceValue A string containing the text to replace for every successful match of searchValue in this string.
      */
    replace(searchValue: RegExp, replaceValue: string): string;

    /**
      * Replaces text in a string, using a regular expression or search string.
      * @param searchValue A Regular Expression object containing the regular expression pattern and applicable flags
      * @param replacer A function that returns the replacement text.
      */
    replace(searchValue: RegExp, replacer: (substring: string, ...args: any[]) => string): string;

    /**
      * Finds the first substring match in a regular expression search.
      * @param regexp The regular expression pattern and applicable flags.
      */
    search(regexp: string): number;

    /**
      * Finds the first substring match in a regular expression search.
      * @param regexp The regular expression pattern and applicable flags.
      */
    search(regexp: RegExp): number;

    /**
      * Returns a section of a string.
      * @param start The index to the beginning of the specified portion of stringObj.
      * @param end The index to the end of the specified portion of stringObj. The substring includes the characters up to, but not including, the character indicated by end.
      * If this value is not specified, the substring continues to the end of stringObj.
      */
    slice(start?: number, end?: number): string;

    /**
      * Split a string into substrings using the specified separator and return them as an array.
      * @param separator A string that identifies character or characters to use in separating the string. If omitted, a single-element array containing the entire string is returned.
      * @param limit A value used to limit the number of elements returned in the array.
      */
    split(separator: string, limit?: number): string[];

    /**
      * Split a string into substrings using the specified separator and return them as an array.
      * @param separator A Regular Express that identifies character or characters to use in separating the string. If omitted, a single-element array containing the entire string is returned.
      * @param limit A value used to limit the number of elements returned in the array.
      */
    split(separator: RegExp, limit?: number): string[];

    /**
      * Returns the substring at the specified location within a String object.
      * @param start The zero-based index number indicating the beginning of the substring.
      * @param end Zero-based index number indicating the end of the substring. The substring includes the characters up to, but not including, the character indicated by end.
      * If end is omitted, the characters from start through the end of the original string are returned.
      */
    substring(start: number, end?: number): string;

    /** Converts all the alphabetic characters in a string to lowercase. */
    toLowerCase(): string;

    /** Converts all alphabetic characters to lowercase, taking into account the host environment's current locale. */
    toLocaleLowerCase(): string;

    /** Converts all the alphabetic characters in a string to uppercase. */
    toUpperCase(): string;

    /** Returns a string where all alphabetic characters have been converted to uppercase, taking into account the host environment's current locale. */
    toLocaleUpperCase(): string;

    /** Removes the leading and trailing white space and line terminator characters from a string. */
    trim(): string;

    /** Returns the length of a String object. */
    readonly length: number;

    // IE extensions
    /**
      * Gets a substring beginning at the specified location and having the specified length.
      * @param from The starting position of the desired substring. The index of the first character in the string is zero.
      * @param length The number of characters to include in the returned substring.
      */
    substr(from: number, length?: number): string;

    /** Returns the primitive value of the specified object. */
    valueOf(): string;

    readonly [index: number]: string;
}

interface StringConstructor {
    new (value?: any): String;
    (value?: any): string;
    readonly prototype: String;
    fromCharCode(...codes: number[]): string;
}

/**
  * Allows manipulation and formatting of text strings and determination and location of substrings within strings.
  */
declare const String: StringConstructor;

interface Boolean {
    /** Returns the primitive value of the specified object. */
    valueOf(): boolean;
}

interface BooleanConstructor {
    new (value?: any): Boolean;
    (value?: any): boolean;
    readonly prototype: Boolean;
}

declare const Boolean: BooleanConstructor;

interface Number {
    /**
      * Returns a string representation of an object.
      * @param radix Specifies a radix for converting numeric values to strings. This value is only used for numbers.
      */
    toString(radix?: number): string;

    /**
      * Returns a string representing a number in fixed-point notation.
      * @param fractionDigits Number of digits after the decimal point. Must be in the range 0 - 20, inclusive.
      */
    toFixed(fractionDigits?: number): string;

    /**
      * Returns a string containing a number represented in exponential notation.
      * @param fractionDigits Number of digits after the decimal point. Must be in the range 0 - 20, inclusive.
      */
    toExponential(fractionDigits?: number): string;

    /**
      * Returns a string containing a number represented either in exponential or fixed-point notation with a specified number of digits.
      * @param precision Number of significant digits. Must be in the range 1 - 21, inclusive.
      */
    toPrecision(precision?: number): string;

    /** Returns the primitive value of the specified object. */
    valueOf(): number;
}

interface NumberConstructor {
    new (value?: any): Number;
    (value?: any): number;
    readonly prototype: Number;

    /** The largest number that can be represented in JavaScript. Equal to approximately 1.79E+308. */
    readonly MAX_VALUE: number;

    /** The closest number to zero that can be represented in JavaScript. Equal to approximately 5.00E-324. */
    readonly MIN_VALUE: number;

    /**
      * A value that is not a number.
      * In equality comparisons, NaN does not equal any value, including itself. To test whether a value is equivalent to NaN, use the isNaN function.
      */
    readonly NaN: number;

    /**
      * A value that is less than the largest negative number that can be represented in JavaScript.
      * JavaScript displays NEGATIVE_INFINITY values as -infinity.
      */
    readonly NEGATIVE_INFINITY: number;

    /**
      * A value greater than the largest number that can be represented in JavaScript.
      * JavaScript displays POSITIVE_INFINITY values as infinity.
      */
    readonly POSITIVE_INFINITY: number;
}

/** An object that represents a number of any kind. All JavaScript numbers are 64-bit floating-point numbers. */
declare const Number: NumberConstructor;

interface TemplateStringsArray extends ReadonlyArray<string> {
    readonly raw: ReadonlyArray<string>
}

interface Math {
    /** The mathematical constant e. This is Euler's number, the base of natural logarithms. */
    readonly E: number;
    /** The natural logarithm of 10. */
    readonly LN10: number;
    /** The natural logarithm of 2. */
    readonly LN2: number;
    /** The base-2 logarithm of e. */
    readonly LOG2E: number;
    /** The base-10 logarithm of e. */
    readonly LOG10E: number;
    /** Pi. This is the ratio of the circumference of a circle to its diameter. */
    readonly PI: number;
    /** The square root of 0.5, or, equivalently, one divided by the square root of 2. */
    readonly SQRT1_2: number;
    /** The square root of 2. */
    readonly SQRT2: number;
    /**
      * Returns the absolute value of a number (the value without regard to whether it is positive or negative).
      * For example, the absolute value of -5 is the same as the absolute value of 5.
      * @param x A numeric expression for which the absolute value is needed.
      */
    abs(x: number): number;
    /**
      * Returns the arc cosine (or inverse cosine) of a number.
      * @param x A numeric expression.
      */
    acos(x: number): number;
    /**
      * Returns the arcsine of a number.
      * @param x A numeric expression.
      */
    asin(x: number): number;
    /**
      * Returns the arctangent of a number.
      * @param x A numeric expression for which the arctangent is needed.
      */
    atan(x: number): number;
    /**
      * Returns the angle (in radians) from the X axis to a point.
      * @param y A numeric expression representing the cartesian y-coordinate.
      * @param x A numeric expression representing the cartesian x-coordinate.
      */
    atan2(y: number, x: number): number;
    /**
      * Returns the smallest number greater than or equal to its numeric argument.
      * @param x A numeric expression.
      */
    ceil(x: number): number;
    /**
      * Returns the cosine of a number.
      * @param x A numeric expression that contains an angle measured in radians.
      */
    cos(x: number): number;
    /**
      * Returns e (the base of natural logarithms) raised to a power.
      * @param x A numeric expression representing the power of e.
      */
    exp(x: number): number;
    /**
      * Returns the greatest number less than or equal to its numeric argument.
      * @param x A numeric expression.
      */
    floor(x: number): number;
    /**
      * Returns the natural logarithm (base e) of a number.
      * @param x A numeric expression.
      */
    log(x: number): number;
    /**
      * Returns the larger of a set of supplied numeric expressions.
      * @param values Numeric expressions to be evaluated.
      */
    max(...values: number[]): number;
    /**
      * Returns the smaller of a set of supplied numeric expressions.
      * @param values Numeric expressions to be evaluated.
      */
    min(...values: number[]): number;
    /**
      * Returns the value of a base expression taken to a specified power.
      * @param x The base value of the expression.
      * @param y The exponent value of the expression.
      */
    pow(x: number, y: number): number;
    /** Returns a pseudorandom number between 0 and 1. */
    random(): number;
    /**
      * Returns a supplied numeric expression rounded to the nearest number.
      * @param x The value to be rounded to the nearest number.
      */
    round(x: number): number;
    /**
      * Returns the sine of a number.
      * @param x A numeric expression that contains an angle measured in radians.
      */
    sin(x: number): number;
    /**
      * Returns the square root of a number.
      * @param x A numeric expression.
      */
    sqrt(x: number): number;
    /**
      * Returns the tangent of a number.
      * @param x A numeric expression that contains an angle measured in radians.
      */
    tan(x: number): number;
}
/** An intrinsic object that provides basic mathematics functionality and constants. */
declare const Math: Math;

/** Enables basic storage and retrieval of dates and times. */
interface Date {
    /** Returns a string representation of a date. The format of the string depends on the locale. */
    toString(): string;
    /** Returns a date as a string value. */
    toDateString(): string;
    /** Returns a time as a string value. */
    toTimeString(): string;
    /** Returns a value as a string value appropriate to the host environment's current locale. */
    toLocaleString(): string;
    /** Returns a date as a string value appropriate to the host environment's current locale. */
    toLocaleDateString(): string;
    /** Returns a time as a string value appropriate to the host environment's current locale. */
    toLocaleTimeString(): string;
    /** Returns the stored time value in milliseconds since midnight, January 1, 1970 UTC. */
    valueOf(): number;
    /** Gets the time value in milliseconds. */
    getTime(): number;
    /** Gets the year, using local time. */
    getFullYear(): number;
    /** Gets the year using Universal Coordinated Time (UTC). */
    getUTCFullYear(): number;
    /** Gets the month, using local time. */
    getMonth(): number;
    /** Gets the month of a Date object using Universal Coordinated Time (UTC). */
    getUTCMonth(): number;
    /** Gets the day-of-the-month, using local time. */
    getDate(): number;
    /** Gets the day-of-the-month, using Universal Coordinated Time (UTC). */
    getUTCDate(): number;
    /** Gets the day of the week, using local time. */
    getDay(): number;
    /** Gets the day of the week using Universal Coordinated Time (UTC). */
    getUTCDay(): number;
    /** Gets the hours in a date, using local time. */
    getHours(): number;
    /** Gets the hours value in a Date object using Universal Coordinated Time (UTC). */
    getUTCHours(): number;
    /** Gets the minutes of a Date object, using local time. */
    getMinutes(): number;
    /** Gets the minutes of a Date object using Universal Coordinated Time (UTC). */
    getUTCMinutes(): number;
    /** Gets the seconds of a Date object, using local time. */
    getSeconds(): number;
    /** Gets the seconds of a Date object using Universal Coordinated Time (UTC). */
    getUTCSeconds(): number;
    /** Gets the milliseconds of a Date, using local time. */
    getMilliseconds(): number;
    /** Gets the milliseconds of a Date object using Universal Coordinated Time (UTC). */
    getUTCMilliseconds(): number;
    /** Gets the difference in minutes between the time on the local computer and Universal Coordinated Time (UTC). */
    getTimezoneOffset(): number;
    /**
      * Sets the date and time value in the Date object.
      * @param time A numeric value representing the number of elapsed milliseconds since midnight, January 1, 1970 GMT.
      */
    setTime(time: number): number;
    /**
      * Sets the milliseconds value in the Date object using local time.
      * @param ms A numeric value equal to the millisecond value.
      */
    setMilliseconds(ms: number): number;
    /**
      * Sets the milliseconds value in the Date object using Universal Coordinated Time (UTC).
      * @param ms A numeric value equal to the millisecond value.
      */
    setUTCMilliseconds(ms: number): number;

    /**
      * Sets the seconds value in the Date object using local time.
      * @param sec A numeric value equal to the seconds value.
      * @param ms A numeric value equal to the milliseconds value.
      */
    setSeconds(sec: number, ms?: number): number;
    /**
      * Sets the seconds value in the Date object using Universal Coordinated Time (UTC).
      * @param sec A numeric value equal to the seconds value.
      * @param ms A numeric value equal to the milliseconds value.
      */
    setUTCSeconds(sec: number, ms?: number): number;
    /**
      * Sets the minutes value in the Date object using local time.
      * @param min A numeric value equal to the minutes value.
      * @param sec A numeric value equal to the seconds value.
      * @param ms A numeric value equal to the milliseconds value.
      */
    setMinutes(min: number, sec?: number, ms?: number): number;
    /**
      * Sets the minutes value in the Date object using Universal Coordinated Time (UTC).
      * @param min A numeric value equal to the minutes value.
      * @param sec A numeric value equal to the seconds value.
      * @param ms A numeric value equal to the milliseconds value.
      */
    setUTCMinutes(min: number, sec?: number, ms?: number): number;
    /**
      * Sets the hour value in the Date object using local time.
      * @param hours A numeric value equal to the hours value.
      * @param min A numeric value equal to the minutes value.
      * @param sec A numeric value equal to the seconds value.
      * @param ms A numeric value equal to the milliseconds value.
      */
    setHours(hours: number, min?: number, sec?: number, ms?: number): number;
    /**
      * Sets the hours value in the Date object using Universal Coordinated Time (UTC).
      * @param hours A numeric value equal to the hours value.
      * @param min A numeric value equal to the minutes value.
      * @param sec A numeric value equal to the seconds value.
      * @param ms A numeric value equal to the milliseconds value.
      */
    setUTCHours(hours: number, min?: number, sec?: number, ms?: number): number;
    /**
      * Sets the numeric day-of-the-month value of the Date object using local time.
      * @param date A numeric value equal to the day of the month.
      */
    setDate(date: number): number;
    /**
      * Sets the numeric day of the month in the Date object using Universal Coordinated Time (UTC).
      * @param date A numeric value equal to the day of the month.
      */
    setUTCDate(date: number): number;
    /**
      * Sets the month value in the Date object using local time.
      * @param month A numeric value equal to the month. The value for January is 0, and other month values follow consecutively.
      * @param date A numeric value representing the day of the month. If this value is not supplied, the value from a call to the getDate method is used.
      */
    setMonth(month: number, date?: number): number;
    /**
      * Sets the month value in the Date object using Universal Coordinated Time (UTC).
      * @param month A numeric value equal to the month. The value for January is 0, and other month values follow consecutively.
      * @param date A numeric value representing the day of the month. If it is not supplied, the value from a call to the getUTCDate method is used.
      */
    setUTCMonth(month: number, date?: number): number;
    /**
      * Sets the year of the Date object using local time.
      * @param year A numeric value for the year.
      * @param month A zero-based numeric value for the month (0 for January, 11 for December). Must be specified if numDate is specified.
      * @param date A numeric value equal for the day of the month.
      */
    setFullYear(year: number, month?: number, date?: number): number;
    /**
      * Sets the year value in the Date object using Universal Coordinated Time (UTC).
      * @param year A numeric value equal to the year.
      * @param month A numeric value equal to the month. The value for January is 0, and other month values follow consecutively. Must be supplied if numDate is supplied.
      * @param date A numeric value equal to the day of the month.
      */
    setUTCFullYear(year: number, month?: number, date?: number): number;
    /** Returns a date converted to a string using Universal Coordinated Time (UTC). */
    toUTCString(): string;
    /** Returns a date as a string value in ISO format. */
    toISOString(): string;
    /** Used by the JSON.stringify method to enable the transformation of an object's data for JavaScript Object Notation (JSON) serialization. */
    toJSON(key?: any): string;
}

interface DateConstructor {
    new (): Date;
    new (value: number): Date;
    new (value: string): Date;
    new (year: number, month: number, date?: number, hours?: number, minutes?: number, seconds?: number, ms?: number): Date;
    (): string;
    readonly prototype: Date;
    /**
      * Parses a string containing a date, and returns the number of milliseconds between that date and midnight, January 1, 1970.
      * @param s A date string
      */
    parse(s: string): number;
    /**
      * Returns the number of milliseconds between midnight, January 1, 1970 Universal Coordinated Time (UTC) (or GMT) and the specified date.
      * @param year The full year designation is required for cross-century date accuracy. If year is between 0 and 99 is used, then year is assumed to be 1900 + year.
      * @param month The month as an number between 0 and 11 (January to December).
      * @param date The date as an number between 1 and 31.
      * @param hours Must be supplied if minutes is supplied. An number from 0 to 23 (midnight to 11pm) that specifies the hour.
      * @param minutes Must be supplied if seconds is supplied. An number from 0 to 59 that specifies the minutes.
      * @param seconds Must be supplied if milliseconds is supplied. An number from 0 to 59 that specifies the seconds.
      * @param ms An number from 0 to 999 that specifies the milliseconds.
      */
    UTC(year: number, month: number, date?: number, hours?: number, minutes?: number, seconds?: number, ms?: number): number;
    now(): number;
}

declare const Date: DateConstructor;

interface RegExpMatchArray extends Array<string> {
    index?: number;
    input?: string;
}

interface RegExpExecArray extends Array<string> {
    index: number;
    input: string;
}

interface RegExp {
    /**
      * Executes a search on a string using a regular expression pattern, and returns an array containing the results of that search.
      * @param string The String object or string literal on which to perform the search.
      */
    exec(string: string): RegExpExecArray | null;

    /**
      * Returns a Boolean value that indicates whether or not a pattern exists in a searched string.
      * @param string String on which to perform the search.
      */
    test(string: string): boolean;

    /** Returns a copy of the text of the regular expression pattern. Read-only. The regExp argument is a Regular expression object. It can be a variable name or a literal. */
    readonly source: string;

    /** Returns a Boolean value indicating the state of the global flag (g) used with a regular expression. Default is false. Read-only. */
    readonly global: boolean;

    /** Returns a Boolean value indicating the state of the ignoreCase flag (i) used with a regular expression. Default is false. Read-only. */
    readonly ignoreCase: boolean;

    /** Returns a Boolean value indicating the state of the multiline flag (m) used with a regular expression. Default is false. Read-only. */
    readonly multiline: boolean;

    lastIndex: number;

    // Non-standard extensions
    compile(): this;
}

interface RegExpConstructor {
    new (pattern: RegExp): RegExp;
    new (pattern: string, flags?: string): RegExp;
    (pattern: RegExp): RegExp;
    (pattern: string, flags?: string): RegExp;
    readonly prototype: RegExp;

    // Non-standard extensions
    $1: string;
    $2: string;
    $3: string;
    $4: string;
    $5: string;
    $6: string;
    $7: string;
    $8: string;
    $9: string;
    lastMatch: string;
}

declare const RegExp: RegExpConstructor;

interface Error {
    name: string;
    message: string;
    stack?: string;
}

interface ErrorConstructor {
    new (message?: string): Error;
    (message?: string): Error;
    readonly prototype: Error;
}

declare const Error: ErrorConstructor;

interface EvalError extends Error {
}

interface EvalErrorConstructor {
    new (message?: string): EvalError;
    (message?: string): EvalError;
    readonly prototype: EvalError;
}

declare const EvalError: EvalErrorConstructor;

interface RangeError extends Error {
}

interface RangeErrorConstructor {
    new (message?: string): RangeError;
    (message?: string): RangeError;
    readonly prototype: RangeError;
}

declare const RangeError: RangeErrorConstructor;

interface ReferenceError extends Error {
}

interface ReferenceErrorConstructor {
    new (message?: string): ReferenceError;
    (message?: string): ReferenceError;
    readonly prototype: ReferenceError;
}

declare const ReferenceError: ReferenceErrorConstructor;

interface SyntaxError extends Error {
}

interface SyntaxErrorConstructor {
    new (message?: string): SyntaxError;
    (message?: string): SyntaxError;
    readonly prototype: SyntaxError;
}

declare const SyntaxError: SyntaxErrorConstructor;

interface TypeError extends Error {
}

interface TypeErrorConstructor {
    new (message?: string): TypeError;
    (message?: string): TypeError;
    readonly prototype: TypeError;
}

declare const TypeError: TypeErrorConstructor;

interface URIError extends Error {
}

interface URIErrorConstructor {
    new (message?: string): URIError;
    (message?: string): URIError;
    readonly prototype: URIError;
}

declare const URIError: URIErrorConstructor;

interface JSON {
    /**
      * Converts a JavaScript Object Notation (JSON) string into an object.
      * @param text A valid JSON string.
      * @param reviver A function that transforms the results. This function is called for each member of the object.
      * If a member contains nested objects, the nested objects are transformed before the parent object is.
      */
    parse(text: string, reviver?: (key: any, value: any) => any): any;
    /**
      * Converts a JavaScript value to a JavaScript Object Notation (JSON) string.
      * @param value A JavaScript value, usually an object or array, to be converted.
      * @param replacer A function that transforms the results.
      * @param space Adds indentation, white space, and line break characters to the return-value JSON text to make it easier to read.
      */
    stringify(value: any, replacer?: (key: string, value: any) => any, space?: string | number): string;
    /**
      * Converts a JavaScript value to a JavaScript Object Notation (JSON) string.
      * @param value A JavaScript value, usually an object or array, to be converted.
      * @param replacer An array of strings and numbers that acts as a approved list for selecting the object properties that will be stringified.
      * @param space Adds indentation, white space, and line break characters to the return-value JSON text to make it easier to read.
      */
    stringify(value: any, replacer?: (number | string)[] | null, space?: string | number): string;
}

/**
  * An intrinsic object that provides functions to convert JavaScript values to and from the JavaScript Object Notation (JSON) format.
  */
declare const JSON: JSON;


/////////////////////////////
/// ECMAScript Array API (specially handled by compiler)
/////////////////////////////

interface ReadonlyArray<T> {
    /**
      * Gets the length of the array. This is a number one higher than the highest element defined in an array.
      */
    readonly length: number;
    /**
      * Returns a string representation of an array.
      */
    toString(): string;
    toLocaleString(): string;
    /**
      * Combines two or more arrays.
      * @param items Additional items to add to the end of array1.
      */
    concat<U extends ReadonlyArray<T>>(...items: U[]): T[];
    /**
      * Combines two or more arrays.
      * @param items Additional items to add to the end of array1.
      */
    concat(...items: T[][]): T[];
    /**
      * Combines two or more arrays.
      * @param items Additional items to add to the end of array1.
      */
    concat(...items: (T | T[])[]): T[];
    /**
      * Adds all the elements of an array separated by the specified separator string.
      * @param separator A string used to separate one element of an array from the next in the resulting String. If omitted, the array elements are separated with a comma.
      */
    join(separator?: string): string;
    /**
      * Returns a section of an array.
      * @param start The beginning of the specified portion of the array.
      * @param end The end of the specified portion of the array.
      */
    slice(start?: number, end?: number): T[];
    /**
      * Returns the index of the first occurrence of a value in an array.
      * @param searchElement The value to locate in the array.
      * @param fromIndex The array index at which to begin the search. If fromIndex is omitted, the search starts at index 0.
      */
    indexOf(searchElement: T, fromIndex?: number): number;

    /**
      * Returns the index of the last occurrence of a specified value in an array.
      * @param searchElement The value to locate in the array.
      * @param fromIndex The array index at which to begin the search. If fromIndex is omitted, the search starts at the last index in the array.
      */
    lastIndexOf(searchElement: T, fromIndex?: number): number;
    /**
      * Determines whether all the members of an array satisfy the specified test.
      * @param callbackfn A function that accepts up to three arguments. The every method calls the callbackfn function for each element in array1 until the callbackfn returns false, or until the end of the array.
      * @param thisArg An object to which the this keyword can refer in the callbackfn function. If thisArg is omitted, undefined is used as the this value.
      */
    every(callbackfn: (value: T, index: number, array: ReadonlyArray<T>) => boolean, thisArg?: any): boolean;
    /**
      * Determines whether the specified callback function returns true for any element of an array.
      * @param callbackfn A function that accepts up to three arguments. The some method calls the callbackfn function for each element in array1 until the callbackfn returns true, or until the end of the array.
      * @param thisArg An object to which the this keyword can refer in the callbackfn function. If thisArg is omitted, undefined is used as the this value.
      */
    some(callbackfn: (value: T, index: number, array: ReadonlyArray<T>) => boolean, thisArg?: any): boolean;
    /**
      * Performs the specified action for each element in an array.
      * @param callbackfn  A function that accepts up to three arguments. forEach calls the callbackfn function one time for each element in the array.
      * @param thisArg  An object to which the this keyword can refer in the callbackfn function. If thisArg is omitted, undefined is used as the this value.
      */
    forEach(callbackfn: (value: T, index: number, array: ReadonlyArray<T>) => void, thisArg?: any): void;
    /**
      * Calls a defined callback function on each element of an array, and returns an array that contains the results.
      * @param callbackfn A function that accepts up to three arguments. The map method calls the callbackfn function one time for each element in the array.
      * @param thisArg An object to which the this keyword can refer in the callbackfn function. If thisArg is omitted, undefined is used as the this value.
      */
    map<U>(callbackfn: (value: T, index: number, array: ReadonlyArray<T>) => U, thisArg?: any): U[];
    /**
      * Returns the elements of an array that meet the condition specified in a callback function.
      * @param callbackfn A function that accepts up to three arguments. The filter method calls the callbackfn function one time for each element in the array.
      * @param thisArg An object to which the this keyword can refer in the callbackfn function. If thisArg is omitted, undefined is used as the this value.
      */
    filter(callbackfn: (value: T, index: number, array: ReadonlyArray<T>) => any, thisArg?: any): T[];
    /**
      * Calls the specified callback function for all the elements in an array. The return value of the callback function is the accumulated result, and is provided as an argument in the next call to the callback function.
      * @param callbackfn A function that accepts up to four arguments. The reduce method calls the callbackfn function one time for each element in the array.
      * @param initialValue If initialValue is specified, it is used as the initial value to start the accumulation. The first call to the callbackfn function provides this value as an argument instead of an array value.
      */
    reduce(callbackfn: (previousValue: T, currentValue: T, currentIndex: number, array: ReadonlyArray<T>) => T, initialValue?: T): T;
    /**
      * Calls the specified callback function for all the elements in an array. The return value of the callback function is the accumulated result, and is provided as an argument in the next call to the callback function.
      * @param callbackfn A function that accepts up to four arguments. The reduce method calls the callbackfn function one time for each element in the array.
      * @param initialValue If initialValue is specified, it is used as the initial value to start the accumulation. The first call to the callbackfn function provides this value as an argument instead of an array value.
      */
    reduce<U>(callbackfn: (previousValue: U, currentValue: T, currentIndex: number, array: ReadonlyArray<T>) => U, initialValue: U): U;
    /**
      * Calls the specified callback function for all the elements in an array, in descending order. The return value of the callback function is the accumulated result, and is provided as an argument in the next call to the callback function.
      * @param callbackfn A function that accepts up to four arguments. The reduceRight method calls the callbackfn function one time for each element in the array.
      * @param initialValue If initialValue is specified, it is used as the initial value to start the accumulation. The first call to the callbackfn function provides this value as an argument instead of an array value.
      */
    reduceRight(callbackfn: (previousValue: T, currentValue: T, currentIndex: number, array: ReadonlyArray<T>) => T, initialValue?: T): T;
    /**
      * Calls the specified callback function for all the elements in an array, in descending order. The return value of the callback function is the accumulated result, and is provided as an argument in the next call to the callback function.
      * @param callbackfn A function that accepts up to four arguments. The reduceRight method calls the callbackfn function one time for each element in the array.
      * @param initialValue If initialValue is specified, it is used as the initial value to start the accumulation. The first call to the callbackfn function provides this value as an argument instead of an array value.
      */
    reduceRight<U>(callbackfn: (previousValue: U, currentValue: T, currentIndex: number, array: ReadonlyArray<T>) => U, initialValue: U): U;

    readonly [n: number]: T;
}

interface Array<T> {
    /**
      * Gets or sets the length of the array. This is a number one higher than the highest element defined in an array.
      */
    length: number;
    /**
      * Returns a string representation of an array.
      */
    toString(): string;
    toLocaleString(): string;
    /**
      * Appends new elements to an array, and returns the new length of the array.
      * @param items New elements of the Array.
      */
    push(...items: T[]): number;
    /**
      * Removes the last element from an array and returns it.
      */
    pop(): T | undefined;
    /**
      * Combines two or more arrays.
      * @param items Additional items to add to the end of array1.
      */
    concat(...items: T[][]): T[];
    /**
      * Combines two or more arrays.
      * @param items Additional items to add to the end of array1.
      */
    concat(...items: (T | T[])[]): T[];
    /**
      * Adds all the elements of an array separated by the specified separator string.
      * @param separator A string used to separate one element of an array from the next in the resulting String. If omitted, the array elements are separated with a comma.
      */
    join(separator?: string): string;
    /**
      * Reverses the elements in an Array.
      */
    reverse(): T[];
    /**
      * Removes the first element from an array and returns it.
      */
    shift(): T | undefined;
    /**
      * Returns a section of an array.
      * @param start The beginning of the specified portion of the array.
      * @param end The end of the specified portion of the array.
      */
    slice(start?: number, end?: number): T[];
    /**
      * Sorts an array.
      * @param compareFn The name of the function used to determine the order of the elements. If omitted, the elements are sorted in ascending, ASCII character order.
      */
    sort(compareFn?: (a: T, b: T) => number): this;
    /**
      * Removes elements from an array and, if necessary, inserts new elements in their place, returning the deleted elements.
      * @param start The zero-based location in the array from which to start removing elements.
      */
    splice(start: number): T[];
    /**
      * Removes elements from an array and, if necessary, inserts new elements in their place, returning the deleted elements.
      * @param start The zero-based location in the array from which to start removing elements.
      * @param deleteCount The number of elements to remove.
      * @param items Elements to insert into the array in place of the deleted elements.
      */
    splice(start: number, deleteCount: number, ...items: T[]): T[];
    /**
      * Inserts new elements at the start of an array.
      * @param items  Elements to insert at the start of the Array.
      */
    unshift(...items: T[]): number;
    /**
      * Returns the index of the first occurrence of a value in an array.
      * @param searchElement The value to locate in the array.
      * @param fromIndex The array index at which to begin the search. If fromIndex is omitted, the search starts at index 0.
      */
    indexOf(searchElement: T, fromIndex?: number): number;
    /**
      * Returns the index of the last occurrence of a specified value in an array.
      * @param searchElement The value to locate in the array.
      * @param fromIndex The array index at which to begin the search. If fromIndex is omitted, the search starts at the last index in the array.
      */
    lastIndexOf(searchElement: T, fromIndex?: number): number;
    /**
      * Determines whether all the members of an array satisfy the specified test.
      * @param callbackfn A function that accepts up to three arguments. The every method calls the callbackfn function for each element in array1 until the callbackfn returns false, or until the end of the array.
      * @param thisArg An object to which the this keyword can refer in the callbackfn function. If thisArg is omitted, undefined is used as the this value.
      */
    every(callbackfn: (value: T, index: number, array: T[]) => boolean, thisArg?: any): boolean;
    /**
      * Determines whether the specified callback function returns true for any element of an array.
      * @param callbackfn A function that accepts up to three arguments. The some method calls the callbackfn function for each element in array1 until the callbackfn returns true, or until the end of the array.
      * @param thisArg An object to which the this keyword can refer in the callbackfn function. If thisArg is omitted, undefined is used as the this value.
      */
    some(callbackfn: (value: T, index: number, array: T[]) => boolean, thisArg?: any): boolean;
    /**
      * Performs the specified action for each element in an array.
      * @param callbackfn  A function that accepts up to three arguments. forEach calls the callbackfn function one time for each element in the array.
      * @param thisArg  An object to which the this keyword can refer in the callbackfn function. If thisArg is omitted, undefined is used as the this value.
      */
    forEach(callbackfn: (value: T, index: number, array: T[]) => void, thisArg?: any): void;
    /**
      * Calls a defined callback function on each element of an array, and returns an array that contains the results.
      * @param callbackfn A function that accepts up to three arguments. The map method calls the callbackfn function one time for each element in the array.
      * @param thisArg An object to which the this keyword can refer in the callbackfn function. If thisArg is omitted, undefined is used as the this value.
      */
    map<U>(callbackfn: (value: T, index: number, array: T[]) => U, thisArg?: any): U[];
    /**
      * Returns the elements of an array that meet the condition specified in a callback function.
      * @param callbackfn A function that accepts up to three arguments. The filter method calls the callbackfn function one time for each element in the array.
      * @param thisArg An object to which the this keyword can refer in the callbackfn function. If thisArg is omitted, undefined is used as the this value.
      */
    filter(callbackfn: (value: T, index: number, array: T[]) => any, thisArg?: any): T[];
    /**
      * Calls the specified callback function for all the elements in an array. The return value of the callback function is the accumulated result, and is provided as an argument in the next call to the callback function.
      * @param callbackfn A function that accepts up to four arguments. The reduce method calls the callbackfn function one time for each element in the array.
      * @param initialValue If initialValue is specified, it is used as the initial value to start the accumulation. The first call to the callbackfn function provides this value as an argument instead of an array value.
      */
    reduce(callbackfn: (previousValue: T, currentValue: T, currentIndex: number, array: T[]) => T, initialValue?: T): T;
    /**
      * Calls the specified callback function for all the elements in an array. The return value of the callback function is the accumulated result, and is provided as an argument in the next call to the callback function.
      * @param callbackfn A function that accepts up to four arguments. The reduce method calls the callbackfn function one time for each element in the array.
      * @param initialValue If initialValue is specified, it is used as the initial value to start the accumulation. The first call to the callbackfn function provides this value as an argument instead of an array value.
      */
    reduce<U>(callbackfn: (previousValue: U, currentValue: T, currentIndex: number, array: T[]) => U, initialValue: U): U;
    /**
      * Calls the specified callback function for all the elements in an array, in descending order. The return value of the callback function is the accumulated result, and is provided as an argument in the next call to the callback function.
      * @param callbackfn A function that accepts up to four arguments. The reduceRight method calls the callbackfn function one time for each element in the array.
      * @param initialValue If initialValue is specified, it is used as the initial value to start the accumulation. The first call to the callbackfn function provides this value as an argument instead of an array value.
      */
    reduceRight(callbackfn: (previousValue: T, currentValue: T, currentIndex: number, array: T[]) => T, initialValue?: T): T;
    /**
      * Calls the specified callback function for all the elements in an array, in descending order. The return value of the callback function is the accumulated result, and is provided as an argument in the next call to the callback function.
      * @param callbackfn A function that accepts up to four arguments. The reduceRight method calls the callbackfn function one time for each element in the array.
      * @param initialValue If initialValue is specified, it is used as the initial value to start the accumulation. The first call to the callbackfn function provides this value as an argument instead of an array value.
      */
    reduceRight<U>(callbackfn: (previousValue: U, currentValue: T, currentIndex: number, array: T[]) => U, initialValue: U): U;

    [n: number]: T;
}

interface ArrayConstructor {
    new (arrayLength?: number): any[];
    new <T>(arrayLength: number): T[];
    new <T>(...items: T[]): T[];
    (arrayLength?: number): any[];
    <T>(arrayLength: number): T[];
    <T>(...items: T[]): T[];
    isArray(arg: any): arg is Array<any>;
    readonly prototype: Array<any>;
}

declare const Array: ArrayConstructor;

interface TypedPropertyDescriptor<T> {
    enumerable?: boolean;
    configurable?: boolean;
    writable?: boolean;
    value?: T;
    get?: () => T;
    set?: (value: T) => void;
}

declare type ClassDecorator = <TFunction extends Function>(target: TFunction) => TFunction | void;
declare type PropertyDecorator = (target: Object, propertyKey: string | symbol) => void;
declare type MethodDecorator = <T>(target: Object, propertyKey: string | symbol, descriptor: TypedPropertyDescriptor<T>) => TypedPropertyDescriptor<T> | void;
declare type ParameterDecorator = (target: Object, propertyKey: string | symbol, parameterIndex: number) => void;

declare type PromiseConstructorLike = new <T>(executor: (resolve: (value?: T | PromiseLike<T>) => void, reject: (reason?: any) => void) => void) => PromiseLike<T>;

interface PromiseLike<T> {
    /**
    * Attaches callbacks for the resolution and/or rejection of the Promise.
    * @param onfulfilled The callback to execute when the Promise is resolved.
    * @param onrejected The callback to execute when the Promise is rejected.
    * @returns A Promise for the completion of which ever callback is executed.
    */
    then<TResult>(onfulfilled?: (value: T) => TResult | PromiseLike<TResult>, onrejected?: (reason: any) => TResult | PromiseLike<TResult>): PromiseLike<TResult>;
    then<TResult>(onfulfilled?: (value: T) => TResult | PromiseLike<TResult>, onrejected?: (reason: any) => void): PromiseLike<TResult>;
}

interface ArrayLike<T> {
    readonly length: number;
    readonly [n: number]: T;
}

/**
  * Represents a raw buffer of binary data, which is used to store data for the
  * different typed arrays. ArrayBuffers cannot be read from or written to directly,
  * but can be passed to a typed array or DataView Object to interpret the raw
  * buffer as needed.
  */
interface ArrayBuffer {
    /**
      * Read-only. The length of the ArrayBuffer (in bytes).
      */
    readonly byteLength: number;

    /**
      * Returns a section of an ArrayBuffer.
      */
    slice(begin:number, end?:number): ArrayBuffer;
}

interface ArrayBufferConstructor {
    readonly prototype: ArrayBuffer;
    new (byteLength: number): ArrayBuffer;
    isView(arg: any): arg is ArrayBufferView;
}
declare const ArrayBuffer: ArrayBufferConstructor;

interface ArrayBufferView {
    /**
      * The ArrayBuffer instance referenced by the array.
      */
    buffer: ArrayBuffer;

    /**
      * The length in bytes of the array.
      */
    byteLength: number;

    /**
      * The offset in bytes of the array.
      */
    byteOffset: number;
}

interface DataView {
    readonly buffer: ArrayBuffer;
    readonly byteLength: number;
    readonly byteOffset: number;
    /**
      * Gets the Float32 value at the specified byte offset from the start of the view. There is
      * no alignment constraint; multi-byte values may be fetched from any offset.
      * @param byteOffset The place in the buffer at which the value should be retrieved.
      */
    getFloat32(byteOffset: number, littleEndian?: boolean): number;

    /**
      * Gets the Float64 value at the specified byte offset from the start of the view. There is
      * no alignment constraint; multi-byte values may be fetched from any offset.
      * @param byteOffset The place in the buffer at which the value should be retrieved.
      */
    getFloat64(byteOffset: number, littleEndian?: boolean): number;

    /**
      * Gets the Int8 value at the specified byte offset from the start of the view. There is
      * no alignment constraint; multi-byte values may be fetched from any offset.
      * @param byteOffset The place in the buffer at which the value should be retrieved.
      */
    getInt8(byteOffset: number): number;

    /**
      * Gets the Int16 value at the specified byte offset from the start of the view. There is
      * no alignment constraint; multi-byte values may be fetched from any offset.
      * @param byteOffset The place in the buffer at which the value should be retrieved.
      */
    getInt16(byteOffset: number, littleEndian?: boolean): number;
    /**
      * Gets the Int32 value at the specified byte offset from the start of the view. There is
      * no alignment constraint; multi-byte values may be fetched from any offset.
      * @param byteOffset The place in the buffer at which the value should be retrieved.
      */
    getInt32(byteOffset: number, littleEndian?: boolean): number;

    /**
      * Gets the Uint8 value at the specified byte offset from the start of the view. There is
      * no alignment constraint; multi-byte values may be fetched from any offset.
      * @param byteOffset The place in the buffer at which the value should be retrieved.
      */
    getUint8(byteOffset: number): number;

    /**
      * Gets the Uint16 value at the specified byte offset from the start of the view. There is
      * no alignment constraint; multi-byte values may be fetched from any offset.
      * @param byteOffset The place in the buffer at which the value should be retrieved.
      */
    getUint16(byteOffset: number, littleEndian?: boolean): number;

    /**
      * Gets the Uint32 value at the specified byte offset from the start of the view. There is
      * no alignment constraint; multi-byte values may be fetched from any offset.
      * @param byteOffset The place in the buffer at which the value should be retrieved.
      */
    getUint32(byteOffset: number, littleEndian?: boolean): number;

    /**
      * Stores an Float32 value at the specified byte offset from the start of the view.
      * @param byteOffset The place in the buffer at which the value should be set.
      * @param value The value to set.
      * @param littleEndian If false or undefined, a big-endian value should be written,
      * otherwise a little-endian value should be written.
      */
    setFloat32(byteOffset: number, value: number, littleEndian?: boolean): void;

    /**
      * Stores an Float64 value at the specified byte offset from the start of the view.
      * @param byteOffset The place in the buffer at which the value should be set.
      * @param value The value to set.
      * @param littleEndian If false or undefined, a big-endian value should be written,
      * otherwise a little-endian value should be written.
      */
    setFloat64(byteOffset: number, value: number, littleEndian?: boolean): void;

    /**
      * Stores an Int8 value at the specified byte offset from the start of the view.
      * @param byteOffset The place in the buffer at which the value should be set.
      * @param value The value to set.
      */
    setInt8(byteOffset: number, value: number): void;

    /**
      * Stores an Int16 value at the specified byte offset from the start of the view.
      * @param byteOffset The place in the buffer at which the value should be set.
      * @param value The value to set.
      * @param littleEndian If false or undefined, a big-endian value should be written,
      * otherwise a little-endian value should be written.
      */
    setInt16(byteOffset: number, value: number, littleEndian?: boolean): void;

    /**
      * Stores an Int32 value at the specified byte offset from the start of the view.
      * @param byteOffset The place in the buffer at which the value should be set.
      * @param value The value to set.
      * @param littleEndian If false or undefined, a big-endian value should be written,
      * otherwise a little-endian value should be written.
      */
    setInt32(byteOffset: number, value: number, littleEndian?: boolean): void;

    /**
      * Stores an Uint8 value at the specified byte offset from the start of the view.
      * @param byteOffset The place in the buffer at which the value should be set.
      * @param value The value to set.
      */
    setUint8(byteOffset: number, value: number): void;

    /**
      * Stores an Uint16 value at the specified byte offset from the start of the view.
      * @param byteOffset The place in the buffer at which the value should be set.
      * @param value The value to set.
      * @param littleEndian If false or undefined, a big-endian value should be written,
      * otherwise a little-endian value should be written.
      */
    setUint16(byteOffset: number, value: number, littleEndian?: boolean): void;

    /**
      * Stores an Uint32 value at the specified byte offset from the start of the view.
      * @param byteOffset The place in the buffer at which the value should be set.
      * @param value The value to set.
      * @param littleEndian If false or undefined, a big-endian value should be written,
      * otherwise a little-endian value should be written.
      */
    setUint32(byteOffset: number, value: number, littleEndian?: boolean): void;
}

interface DataViewConstructor {
    new (buffer: ArrayBuffer, byteOffset?: number, byteLength?: number): DataView;
}
declare const DataView: DataViewConstructor;

/**
  * A typed array of 8-bit integer values. The contents are initialized to 0. If the requested
  * number of bytes could not be allocated an exception is raised.
  */
interface Int8Array {
    /**
      * The size in bytes of each element in the array.
      */
    readonly BYTES_PER_ELEMENT: number;

    /**
      * The ArrayBuffer instance referenced by the array.
      */
    readonly buffer: ArrayBuffer;

    /**
      * The length in bytes of the array.
      */
    readonly byteLength: number;

    /**
      * The offset in bytes of the array.
      */
    readonly byteOffset: number;

    /**
      * Returns the this object after copying a section of the array identified by start and end
      * to the same array starting at position target
      * @param target If target is negative, it is treated as length+target where length is the
      * length of the array.
      * @param start If start is negative, it is treated as length+start. If end is negative, it
      * is treated as length+end.
      * @param end If not specified, length of the this object is used as its default value.
      */
    copyWithin(target: number, start: number, end?: number): this;

    /**
      * Determines whether all the members of an array satisfy the specified test.
      * @param callbackfn A function that accepts up to three arguments. The every method calls
      * the callbackfn function for each element in array1 until the callbackfn returns false,
      * or until the end of the array.
      * @param thisArg An object to which the this keyword can refer in the callbackfn function.
      * If thisArg is omitted, undefined is used as the this value.
      */
    every(callbackfn: (value: number, index: number, array: Int8Array) => boolean, thisArg?: any): boolean;

    /**
        * Returns the this object after filling the section identified by start and end with value
        * @param value value to fill array section with
        * @param start index to start filling the array at. If start is negative, it is treated as
        * length+start where length is the length of the array.
        * @param end index to stop filling the array at. If end is negative, it is treated as
        * length+end.
        */
    fill(value: number, start?: number, end?: number): this;

    /**
      * Returns the elements of an array that meet the condition specified in a callback function.
      * @param callbackfn A function that accepts up to three arguments. The filter method calls
      * the callbackfn function one time for each element in the array.
      * @param thisArg An object to which the this keyword can refer in the callbackfn function.
      * If thisArg is omitted, undefined is used as the this value.
      */
    filter(callbackfn: (value: number, index: number, array: Int8Array) => any, thisArg?: any): Int8Array;

    /**
      * Returns the value of the first element in the array where predicate is true, and undefined
      * otherwise.
      * @param predicate find calls predicate once for each element of the array, in ascending
      * order, until it finds one where predicate returns true. If such an element is found, find
      * immediately returns that element value. Otherwise, find returns undefined.
      * @param thisArg If provided, it will be used as the this value for each invocation of
      * predicate. If it is not provided, undefined is used instead.
      */
    find(predicate: (value: number, index: number, obj: Array<number>) => boolean, thisArg?: any): number | undefined;

    /**
      * Returns the index of the first element in the array where predicate is true, and undefined
      * otherwise.
      * @param predicate find calls predicate once for each element of the array, in ascending
      * order, until it finds one where predicate returns true. If such an element is found,
      * findIndex immediately returns that element index. Otherwise, findIndex returns -1.
      * @param thisArg If provided, it will be used as the this value for each invocation of
      * predicate. If it is not provided, undefined is used instead.
      */
    findIndex(predicate: (value: number) => boolean, thisArg?: any): number;

    /**
      * Performs the specified action for each element in an array.
      * @param callbackfn  A function that accepts up to three arguments. forEach calls the
      * callbackfn function one time for each element in the array.
      * @param thisArg  An object to which the this keyword can refer in the callbackfn function.
      * If thisArg is omitted, undefined is used as the this value.
      */
    forEach(callbackfn: (value: number, index: number, array: Int8Array) => void, thisArg?: any): void;

    /**
      * Returns the index of the first occurrence of a value in an array.
      * @param searchElement The value to locate in the array.
      * @param fromIndex The array index at which to begin the search. If fromIndex is omitted, the
      *  search starts at index 0.
      */
    indexOf(searchElement: number, fromIndex?: number): number;

    /**
      * Adds all the elements of an array separated by the specified separator string.
      * @param separator A string used to separate one element of an array from the next in the
      * resulting String. If omitted, the array elements are separated with a comma.
      */
    join(separator?: string): string;

    /**
      * Returns the index of the last occurrence of a value in an array.
      * @param searchElement The value to locate in the array.
      * @param fromIndex The array index at which to begin the search. If fromIndex is omitted, the
      * search starts at index 0.
      */
    lastIndexOf(searchElement: number, fromIndex?: number): number;

    /**
      * The length of the array.
      */
    readonly length: number;

    /**
      * Calls a defined callback function on each element of an array, and returns an array that
      * contains the results.
      * @param callbackfn A function that accepts up to three arguments. The map method calls the
      * callbackfn function one time for each element in the array.
      * @param thisArg An object to which the this keyword can refer in the callbackfn function.
      * If thisArg is omitted, undefined is used as the this value.
      */
    map(callbackfn: (value: number, index: number, array: Int8Array) => number, thisArg?: any): Int8Array;

    /**
      * Calls the specified callback function for all the elements in an array. The return value of
      * the callback function is the accumulated result, and is provided as an argument in the next
      * call to the callback function.
      * @param callbackfn A function that accepts up to four arguments. The reduce method calls the
      * callbackfn function one time for each element in the array.
      * @param initialValue If initialValue is specified, it is used as the initial value to start
      * the accumulation. The first call to the callbackfn function provides this value as an argument
      * instead of an array value.
      */
    reduce(callbackfn: (previousValue: number, currentValue: number, currentIndex: number, array: Int8Array) => number, initialValue?: number): number;

    /**
      * Calls the specified callback function for all the elements in an array. The return value of
      * the callback function is the accumulated result, and is provided as an argument in the next
      * call to the callback function.
      * @param callbackfn A function that accepts up to four arguments. The reduce method calls the
      * callbackfn function one time for each element in the array.
      * @param initialValue If initialValue is specified, it is used as the initial value to start
      * the accumulation. The first call to the callbackfn function provides this value as an argument
      * instead of an array value.
      */
    reduce<U>(callbackfn: (previousValue: U, currentValue: number, currentIndex: number, array: Int8Array) => U, initialValue: U): U;

    /**
      * Calls the specified callback function for all the elements in an array, in descending order.
      * The return value of the callback function is the accumulated result, and is provided as an
      * argument in the next call to the callback function.
      * @param callbackfn A function that accepts up to four arguments. The reduceRight method calls
      * the callbackfn function one time for each element in the array.
      * @param initialValue If initialValue is specified, it is used as the initial value to start
      * the accumulation. The first call to the callbackfn function provides this value as an
      * argument instead of an array value.
      */
    reduceRight(callbackfn: (previousValue: number, currentValue: number, currentIndex: number, array: Int8Array) => number, initialValue?: number): number;

    /**
      * Calls the specified callback function for all the elements in an array, in descending order.
      * The return value of the callback function is the accumulated result, and is provided as an
      * argument in the next call to the callback function.
      * @param callbackfn A function that accepts up to four arguments. The reduceRight method calls
      * the callbackfn function one time for each element in the array.
      * @param initialValue If initialValue is specified, it is used as the initial value to start
      * the accumulation. The first call to the callbackfn function provides this value as an argument
      * instead of an array value.
      */
    reduceRight<U>(callbackfn: (previousValue: U, currentValue: number, currentIndex: number, array: Int8Array) => U, initialValue: U): U;

    /**
      * Reverses the elements in an Array.
      */
    reverse(): Int8Array;

    /**
      * Sets a value or an array of values.
      * @param index The index of the location to set.
      * @param value The value to set.
      */
    set(index: number, value: number): void;

    /**
      * Sets a value or an array of values.
      * @param array A typed or untyped array of values to set.
      * @param offset The index in the current array at which the values are to be written.
      */
    set(array: ArrayLike<number>, offset?: number): void;

    /**
      * Returns a section of an array.
      * @param start The beginning of the specified portion of the array.
      * @param end The end of the specified portion of the array.
      */
    slice(start?: number, end?: number): Int8Array;

    /**
      * Determines whether the specified callback function returns true for any element of an array.
      * @param callbackfn A function that accepts up to three arguments. The some method calls the
      * callbackfn function for each element in array1 until the callbackfn returns true, or until
      * the end of the array.
      * @param thisArg An object to which the this keyword can refer in the callbackfn function.
      * If thisArg is omitted, undefined is used as the this value.
      */
    some(callbackfn: (value: number, index: number, array: Int8Array) => boolean, thisArg?: any): boolean;

    /**
      * Sorts an array.
      * @param compareFn The name of the function used to determine the order of the elements. If
      * omitted, the elements are sorted in ascending, ASCII character order.
      */
    sort(compareFn?: (a: number, b: number) => number): this;

    /**
      * Gets a new Int8Array view of the ArrayBuffer store for this array, referencing the elements
      * at begin, inclusive, up to end, exclusive.
      * @param begin The index of the beginning of the array.
      * @param end The index of the end of the array.
      */
    subarray(begin: number, end?: number): Int8Array;

    /**
      * Converts a number to a string by using the current locale.
      */
    toLocaleString(): string;

    /**
      * Returns a string representation of an array.
      */
    toString(): string;

    [index: number]: number;
}
interface Int8ArrayConstructor {
    readonly prototype: Int8Array;
    new (length: number): Int8Array;
    new (array: ArrayLike<number>): Int8Array;
    new (buffer: ArrayBuffer, byteOffset?: number, length?: number): Int8Array;

    /**
      * The size in bytes of each element in the array.
      */
    readonly BYTES_PER_ELEMENT: number;

    /**
      * Returns a new array from a set of elements.
      * @param items A set of elements to include in the new array object.
      */
    of(...items: number[]): Int8Array;

    /**
      * Creates an array from an array-like or iterable object.
      * @param arrayLike An array-like or iterable object to convert to an array.
      * @param mapfn A mapping function to call on every element of the array.
      * @param thisArg Value of 'this' used to invoke the mapfn.
      */
    from(arrayLike: ArrayLike<number>, mapfn?: (v: number, k: number) => number, thisArg?: any): Int8Array;

}
declare const Int8Array: Int8ArrayConstructor;

/**
  * A typed array of 8-bit unsigned integer values. The contents are initialized to 0. If the
  * requested number of bytes could not be allocated an exception is raised.
  */
interface Uint8Array {
    /**
      * The size in bytes of each element in the array.
      */
    readonly BYTES_PER_ELEMENT: number;

    /**
      * The ArrayBuffer instance referenced by the array.
      */
    readonly buffer: ArrayBuffer;

    /**
      * The length in bytes of the array.
      */
    readonly byteLength: number;

    /**
      * The offset in bytes of the array.
      */
    readonly byteOffset: number;

    /**
      * Returns the this object after copying a section of the array identified by start and end
      * to the same array starting at position target
      * @param target If target is negative, it is treated as length+target where length is the
      * length of the array.
      * @param start If start is negative, it is treated as length+start. If end is negative, it
      * is treated as length+end.
      * @param end If not specified, length of the this object is used as its default value.
      */
    copyWithin(target: number, start: number, end?: number): this;

    /**
      * Determines whether all the members of an array satisfy the specified test.
      * @param callbackfn A function that accepts up to three arguments. The every method calls
      * the callbackfn function for each element in array1 until the callbackfn returns false,
      * or until the end of the array.
      * @param thisArg An object to which the this keyword can refer in the callbackfn function.
      * If thisArg is omitted, undefined is used as the this value.
      */
    every(callbackfn: (value: number, index: number, array: Uint8Array) => boolean, thisArg?: any): boolean;

    /**
        * Returns the this object after filling the section identified by start and end with value
        * @param value value to fill array section with
        * @param start index to start filling the array at. If start is negative, it is treated as
        * length+start where length is the length of the array.
        * @param end index to stop filling the array at. If end is negative, it is treated as
        * length+end.
        */
    fill(value: number, start?: number, end?: number): this;

    /**
      * Returns the elements of an array that meet the condition specified in a callback function.
      * @param callbackfn A function that accepts up to three arguments. The filter method calls
      * the callbackfn function one time for each element in the array.
      * @param thisArg An object to which the this keyword can refer in the callbackfn function.
      * If thisArg is omitted, undefined is used as the this value.
      */
    filter(callbackfn: (value: number, index: number, array: Uint8Array) => any, thisArg?: any): Uint8Array;

    /**
      * Returns the value of the first element in the array where predicate is true, and undefined
      * otherwise.
      * @param predicate find calls predicate once for each element of the array, in ascending
      * order, until it finds one where predicate returns true. If such an element is found, find
      * immediately returns that element value. Otherwise, find returns undefined.
      * @param thisArg If provided, it will be used as the this value for each invocation of
      * predicate. If it is not provided, undefined is used instead.
      */
    find(predicate: (value: number, index: number, obj: Array<number>) => boolean, thisArg?: any): number | undefined;

    /**
      * Returns the index of the first element in the array where predicate is true, and undefined
      * otherwise.
      * @param predicate find calls predicate once for each element of the array, in ascending
      * order, until it finds one where predicate returns true. If such an element is found,
      * findIndex immediately returns that element index. Otherwise, findIndex returns -1.
      * @param thisArg If provided, it will be used as the this value for each invocation of
      * predicate. If it is not provided, undefined is used instead.
      */
    findIndex(predicate: (value: number) => boolean, thisArg?: any): number;

    /**
      * Performs the specified action for each element in an array.
      * @param callbackfn  A function that accepts up to three arguments. forEach calls the
      * callbackfn function one time for each element in the array.
      * @param thisArg  An object to which the this keyword can refer in the callbackfn function.
      * If thisArg is omitted, undefined is used as the this value.
      */
    forEach(callbackfn: (value: number, index: number, array: Uint8Array) => void, thisArg?: any): void;

    /**
      * Returns the index of the first occurrence of a value in an array.
      * @param searchElement The value to locate in the array.
      * @param fromIndex The array index at which to begin the search. If fromIndex is omitted, the
      *  search starts at index 0.
      */
    indexOf(searchElement: number, fromIndex?: number): number;

    /**
      * Adds all the elements of an array separated by the specified separator string.
      * @param separator A string used to separate one element of an array from the next in the
      * resulting String. If omitted, the array elements are separated with a comma.
      */
    join(separator?: string): string;

    /**
      * Returns the index of the last occurrence of a value in an array.
      * @param searchElement The value to locate in the array.
      * @param fromIndex The array index at which to begin the search. If fromIndex is omitted, the
      * search starts at index 0.
      */
    lastIndexOf(searchElement: number, fromIndex?: number): number;

    /**
      * The length of the array.
      */
    readonly length: number;

    /**
      * Calls a defined callback function on each element of an array, and returns an array that
      * contains the results.
      * @param callbackfn A function that accepts up to three arguments. The map method calls the
      * callbackfn function one time for each element in the array.
      * @param thisArg An object to which the this keyword can refer in the callbackfn function.
      * If thisArg is omitted, undefined is used as the this value.
      */
    map(callbackfn: (value: number, index: number, array: Uint8Array) => number, thisArg?: any): Uint8Array;

    /**
      * Calls the specified callback function for all the elements in an array. The return value of
      * the callback function is the accumulated result, and is provided as an argument in the next
      * call to the callback function.
      * @param callbackfn A function that accepts up to four arguments. The reduce method calls the
      * callbackfn function one time for each element in the array.
      * @param initialValue If initialValue is specified, it is used as the initial value to start
      * the accumulation. The first call to the callbackfn function provides this value as an argument
      * instead of an array value.
      */
    reduce(callbackfn: (previousValue: number, currentValue: number, currentIndex: number, array: Uint8Array) => number, initialValue?: number): number;

    /**
      * Calls the specified callback function for all the elements in an array. The return value of
      * the callback function is the accumulated result, and is provided as an argument in the next
      * call to the callback function.
      * @param callbackfn A function that accepts up to four arguments. The reduce method calls the
      * callbackfn function one time for each element in the array.
      * @param initialValue If initialValue is specified, it is used as the initial value to start
      * the accumulation. The first call to the callbackfn function provides this value as an argument
      * instead of an array value.
      */
    reduce<U>(callbackfn: (previousValue: U, currentValue: number, currentIndex: number, array: Uint8Array) => U, initialValue: U): U;

    /**
      * Calls the specified callback function for all the elements in an array, in descending order.
      * The return value of the callback function is the accumulated result, and is provided as an
      * argument in the next call to the callback function.
      * @param callbackfn A function that accepts up to four arguments. The reduceRight method calls
      * the callbackfn function one time for each element in the array.
      * @param initialValue If initialValue is specified, it is used as the initial value to start
      * the accumulation. The first call to the callbackfn function provides this value as an
      * argument instead of an array value.
      */
    reduceRight(callbackfn: (previousValue: number, currentValue: number, currentIndex: number, array: Uint8Array) => number, initialValue?: number): number;

    /**
      * Calls the specified callback function for all the elements in an array, in descending order.
      * The return value of the callback function is the accumulated result, and is provided as an
      * argument in the next call to the callback function.
      * @param callbackfn A function that accepts up to four arguments. The reduceRight method calls
      * the callbackfn function one time for each element in the array.
      * @param initialValue If initialValue is specified, it is used as the initial value to start
      * the accumulation. The first call to the callbackfn function provides this value as an argument
      * instead of an array value.
      */
    reduceRight<U>(callbackfn: (previousValue: U, currentValue: number, currentIndex: number, array: Uint8Array) => U, initialValue: U): U;

    /**
      * Reverses the elements in an Array.
      */
    reverse(): Uint8Array;

    /**
      * Sets a value or an array of values.
      * @param index The index of the location to set.
      * @param value The value to set.
      */
    set(index: number, value: number): void;

    /**
      * Sets a value or an array of values.
      * @param array A typed or untyped array of values to set.
      * @param offset The index in the current array at which the values are to be written.
      */
    set(array: ArrayLike<number>, offset?: number): void;

    /**
      * Returns a section of an array.
      * @param start The beginning of the specified portion of the array.
      * @param end The end of the specified portion of the array.
      */
    slice(start?: number, end?: number): Uint8Array;

    /**
      * Determines whether the specified callback function returns true for any element of an array.
      * @param callbackfn A function that accepts up to three arguments. The some method calls the
      * callbackfn function for each element in array1 until the callbackfn returns true, or until
      * the end of the array.
      * @param thisArg An object to which the this keyword can refer in the callbackfn function.
      * If thisArg is omitted, undefined is used as the this value.
      */
    some(callbackfn: (value: number, index: number, array: Uint8Array) => boolean, thisArg?: any): boolean;

    /**
      * Sorts an array.
      * @param compareFn The name of the function used to determine the order of the elements. If
      * omitted, the elements are sorted in ascending, ASCII character order.
      */
    sort(compareFn?: (a: number, b: number) => number): this;

    /**
      * Gets a new Uint8Array view of the ArrayBuffer store for this array, referencing the elements
      * at begin, inclusive, up to end, exclusive.
      * @param begin The index of the beginning of the array.
      * @param end The index of the end of the array.
      */
    subarray(begin: number, end?: number): Uint8Array;

    /**
      * Converts a number to a string by using the current locale.
      */
    toLocaleString(): string;

    /**
      * Returns a string representation of an array.
      */
    toString(): string;

    [index: number]: number;
}

interface Uint8ArrayConstructor {
    readonly prototype: Uint8Array;
    new (length: number): Uint8Array;
    new (array: ArrayLike<number>): Uint8Array;
    new (buffer: ArrayBuffer, byteOffset?: number, length?: number): Uint8Array;

    /**
      * The size in bytes of each element in the array.
      */
    readonly BYTES_PER_ELEMENT: number;

    /**
      * Returns a new array from a set of elements.
      * @param items A set of elements to include in the new array object.
      */
    of(...items: number[]): Uint8Array;

    /**
      * Creates an array from an array-like or iterable object.
      * @param arrayLike An array-like or iterable object to convert to an array.
      * @param mapfn A mapping function to call on every element of the array.
      * @param thisArg Value of 'this' used to invoke the mapfn.
      */
    from(arrayLike: ArrayLike<number>, mapfn?: (v: number, k: number) => number, thisArg?: any): Uint8Array;

}
declare const Uint8Array: Uint8ArrayConstructor;

/**
  * A typed array of 8-bit unsigned integer (clamped) values. The contents are initialized to 0.
  * If the requested number of bytes could not be allocated an exception is raised.
  */
interface Uint8ClampedArray {
    /**
      * The size in bytes of each element in the array.
      */
    readonly BYTES_PER_ELEMENT: number;

    /**
      * The ArrayBuffer instance referenced by the array.
      */
    readonly buffer: ArrayBuffer;

    /**
      * The length in bytes of the array.
      */
    readonly byteLength: number;

    /**
      * The offset in bytes of the array.
      */
    readonly byteOffset: number;

    /**
      * Returns the this object after copying a section of the array identified by start and end
      * to the same array starting at position target
      * @param target If target is negative, it is treated as length+target where length is the
      * length of the array.
      * @param start If start is negative, it is treated as length+start. If end is negative, it
      * is treated as length+end.
      * @param end If not specified, length of the this object is used as its default value.
      */
    copyWithin(target: number, start: number, end?: number): this;

    /**
      * Determines whether all the members of an array satisfy the specified test.
      * @param callbackfn A function that accepts up to three arguments. The every method calls
      * the callbackfn function for each element in array1 until the callbackfn returns false,
      * or until the end of the array.
      * @param thisArg An object to which the this keyword can refer in the callbackfn function.
      * If thisArg is omitted, undefined is used as the this value.
      */
    every(callbackfn: (value: number, index: number, array: Uint8ClampedArray) => boolean, thisArg?: any): boolean;

    /**
        * Returns the this object after filling the section identified by start and end with value
        * @param value value to fill array section with
        * @param start index to start filling the array at. If start is negative, it is treated as
        * length+start where length is the length of the array.
        * @param end index to stop filling the array at. If end is negative, it is treated as
        * length+end.
        */
    fill(value: number, start?: number, end?: number): this;

    /**
      * Returns the elements of an array that meet the condition specified in a callback function.
      * @param callbackfn A function that accepts up to three arguments. The filter method calls
      * the callbackfn function one time for each element in the array.
      * @param thisArg An object to which the this keyword can refer in the callbackfn function.
      * If thisArg is omitted, undefined is used as the this value.
      */
    filter(callbackfn: (value: number, index: number, array: Uint8ClampedArray) => any, thisArg?: any): Uint8ClampedArray;

    /**
      * Returns the value of the first element in the array where predicate is true, and undefined
      * otherwise.
      * @param predicate find calls predicate once for each element of the array, in ascending
      * order, until it finds one where predicate returns true. If such an element is found, find
      * immediately returns that element value. Otherwise, find returns undefined.
      * @param thisArg If provided, it will be used as the this value for each invocation of
      * predicate. If it is not provided, undefined is used instead.
      */
    find(predicate: (value: number, index: number, obj: Array<number>) => boolean, thisArg?: any): number | undefined;

    /**
      * Returns the index of the first element in the array where predicate is true, and undefined
      * otherwise.
      * @param predicate find calls predicate once for each element of the array, in ascending
      * order, until it finds one where predicate returns true. If such an element is found,
      * findIndex immediately returns that element index. Otherwise, findIndex returns -1.
      * @param thisArg If provided, it will be used as the this value for each invocation of
      * predicate. If it is not provided, undefined is used instead.
      */
    findIndex(predicate: (value: number) => boolean, thisArg?: any): number;

    /**
      * Performs the specified action for each element in an array.
      * @param callbackfn  A function that accepts up to three arguments. forEach calls the
      * callbackfn function one time for each element in the array.
      * @param thisArg  An object to which the this keyword can refer in the callbackfn function.
      * If thisArg is omitted, undefined is used as the this value.
      */
    forEach(callbackfn: (value: number, index: number, array: Uint8ClampedArray) => void, thisArg?: any): void;

    /**
      * Returns the index of the first occurrence of a value in an array.
      * @param searchElement The value to locate in the array.
      * @param fromIndex The array index at which to begin the search. If fromIndex is omitted, the
      *  search starts at index 0.
      */
    indexOf(searchElement: number, fromIndex?: number): number;

    /**
      * Adds all the elements of an array separated by the specified separator string.
      * @param separator A string used to separate one element of an array from the next in the
      * resulting String. If omitted, the array elements are separated with a comma.
      */
    join(separator?: string): string;

    /**
      * Returns the index of the last occurrence of a value in an array.
      * @param searchElement The value to locate in the array.
      * @param fromIndex The array index at which to begin the search. If fromIndex is omitted, the
      * search starts at index 0.
      */
    lastIndexOf(searchElement: number, fromIndex?: number): number;

    /**
      * The length of the array.
      */
    readonly length: number;

    /**
      * Calls a defined callback function on each element of an array, and returns an array that
      * contains the results.
      * @param callbackfn A function that accepts up to three arguments. The map method calls the
      * callbackfn function one time for each element in the array.
      * @param thisArg An object to which the this keyword can refer in the callbackfn function.
      * If thisArg is omitted, undefined is used as the this value.
      */
    map(callbackfn: (value: number, index: number, array: Uint8ClampedArray) => number, thisArg?: any): Uint8ClampedArray;

    /**
      * Calls the specified callback function for all the elements in an array. The return value of
      * the callback function is the accumulated result, and is provided as an argument in the next
      * call to the callback function.
      * @param callbackfn A function that accepts up to four arguments. The reduce method calls the
      * callbackfn function one time for each element in the array.
      * @param initialValue If initialValue is specified, it is used as the initial value to start
      * the accumulation. The first call to the callbackfn function provides this value as an argument
      * instead of an array value.
      */
    reduce(callbackfn: (previousValue: number, currentValue: number, currentIndex: number, array: Uint8ClampedArray) => number, initialValue?: number): number;

    /**
      * Calls the specified callback function for all the elements in an array. The return value of
      * the callback function is the accumulated result, and is provided as an argument in the next
      * call to the callback function.
      * @param callbackfn A function that accepts up to four arguments. The reduce method calls the
      * callbackfn function one time for each element in the array.
      * @param initialValue If initialValue is specified, it is used as the initial value to start
      * the accumulation. The first call to the callbackfn function provides this value as an argument
      * instead of an array value.
      */
    reduce<U>(callbackfn: (previousValue: U, currentValue: number, currentIndex: number, array: Uint8ClampedArray) => U, initialValue: U): U;

    /**
      * Calls the specified callback function for all the elements in an array, in descending order.
      * The return value of the callback function is the accumulated result, and is provided as an
      * argument in the next call to the callback function.
      * @param callbackfn A function that accepts up to four arguments. The reduceRight method calls
      * the callbackfn function one time for each element in the array.
      * @param initialValue If initialValue is specified, it is used as the initial value to start
      * the accumulation. The first call to the callbackfn function provides this value as an
      * argument instead of an array value.
      */
    reduceRight(callbackfn: (previousValue: number, currentValue: number, currentIndex: number, array: Uint8ClampedArray) => number, initialValue?: number): number;

    /**
      * Calls the specified callback function for all the elements in an array, in descending order.
      * The return value of the callback function is the accumulated result, and is provided as an
      * argument in the next call to the callback function.
      * @param callbackfn A function that accepts up to four arguments. The reduceRight method calls
      * the callbackfn function one time for each element in the array.
      * @param initialValue If initialValue is specified, it is used as the initial value to start
      * the accumulation. The first call to the callbackfn function provides this value as an argument
      * instead of an array value.
      */
    reduceRight<U>(callbackfn: (previousValue: U, currentValue: number, currentIndex: number, array: Uint8ClampedArray) => U, initialValue: U): U;

    /**
      * Reverses the elements in an Array.
      */
    reverse(): Uint8ClampedArray;

    /**
      * Sets a value or an array of values.
      * @param index The index of the location to set.
      * @param value The value to set.
      */
    set(index: number, value: number): void;

    /**
      * Sets a value or an array of values.
      * @param array A typed or untyped array of values to set.
      * @param offset The index in the current array at which the values are to be written.
      */
    set(array: Uint8ClampedArray, offset?: number): void;

    /**
      * Returns a section of an array.
      * @param start The beginning of the specified portion of the array.
      * @param end The end of the specified portion of the array.
      */
    slice(start?: number, end?: number): Uint8ClampedArray;

    /**
      * Determines whether the specified callback function returns true for any element of an array.
      * @param callbackfn A function that accepts up to three arguments. The some method calls the
      * callbackfn function for each element in array1 until the callbackfn returns true, or until
      * the end of the array.
      * @param thisArg An object to which the this keyword can refer in the callbackfn function.
      * If thisArg is omitted, undefined is used as the this value.
      */
    some(callbackfn: (value: number, index: number, array: Uint8ClampedArray) => boolean, thisArg?: any): boolean;

    /**
      * Sorts an array.
      * @param compareFn The name of the function used to determine the order of the elements. If
      * omitted, the elements are sorted in ascending, ASCII character order.
      */
    sort(compareFn?: (a: number, b: number) => number): this;

    /**
      * Gets a new Uint8ClampedArray view of the ArrayBuffer store for this array, referencing the elements
      * at begin, inclusive, up to end, exclusive.
      * @param begin The index of the beginning of the array.
      * @param end The index of the end of the array.
      */
    subarray(begin: number, end?: number): Uint8ClampedArray;

    /**
      * Converts a number to a string by using the current locale.
      */
    toLocaleString(): string;

    /**
      * Returns a string representation of an array.
      */
    toString(): string;

    [index: number]: number;
}

interface Uint8ClampedArrayConstructor {
    readonly prototype: Uint8ClampedArray;
    new (length: number): Uint8ClampedArray;
    new (array: ArrayLike<number>): Uint8ClampedArray;
    new (buffer: ArrayBuffer, byteOffset?: number, length?: number): Uint8ClampedArray;

    /**
      * The size in bytes of each element in the array.
      */
    readonly BYTES_PER_ELEMENT: number;

    /**
      * Returns a new array from a set of elements.
      * @param items A set of elements to include in the new array object.
      */
    of(...items: number[]): Uint8ClampedArray;

    /**
      * Creates an array from an array-like or iterable object.
      * @param arrayLike An array-like or iterable object to convert to an array.
      * @param mapfn A mapping function to call on every element of the array.
      * @param thisArg Value of 'this' used to invoke the mapfn.
      */
    from(arrayLike: ArrayLike<number>, mapfn?: (v: number, k: number) => number, thisArg?: any): Uint8ClampedArray;
}
declare const Uint8ClampedArray: Uint8ClampedArrayConstructor;

/**
  * A typed array of 16-bit signed integer values. The contents are initialized to 0. If the
  * requested number of bytes could not be allocated an exception is raised.
  */
interface Int16Array {
    /**
      * The size in bytes of each element in the array.
      */
    readonly BYTES_PER_ELEMENT: number;

    /**
      * The ArrayBuffer instance referenced by the array.
      */
    readonly buffer: ArrayBuffer;

    /**
      * The length in bytes of the array.
      */
    readonly byteLength: number;

    /**
      * The offset in bytes of the array.
      */
    readonly byteOffset: number;

    /**
      * Returns the this object after copying a section of the array identified by start and end
      * to the same array starting at position target
      * @param target If target is negative, it is treated as length+target where length is the
      * length of the array.
      * @param start If start is negative, it is treated as length+start. If end is negative, it
      * is treated as length+end.
      * @param end If not specified, length of the this object is used as its default value.
      */
    copyWithin(target: number, start: number, end?: number): this;

    /**
      * Determines whether all the members of an array satisfy the specified test.
      * @param callbackfn A function that accepts up to three arguments. The every method calls
      * the callbackfn function for each element in array1 until the callbackfn returns false,
      * or until the end of the array.
      * @param thisArg An object to which the this keyword can refer in the callbackfn function.
      * If thisArg is omitted, undefined is used as the this value.
      */
    every(callbackfn: (value: number, index: number, array: Int16Array) => boolean, thisArg?: any): boolean;

    /**
        * Returns the this object after filling the section identified by start and end with value
        * @param value value to fill array section with
        * @param start index to start filling the array at. If start is negative, it is treated as
        * length+start where length is the length of the array.
        * @param end index to stop filling the array at. If end is negative, it is treated as
        * length+end.
        */
    fill(value: number, start?: number, end?: number): this;

    /**
      * Returns the elements of an array that meet the condition specified in a callback function.
      * @param callbackfn A function that accepts up to three arguments. The filter method calls
      * the callbackfn function one time for each element in the array.
      * @param thisArg An object to which the this keyword can refer in the callbackfn function.
      * If thisArg is omitted, undefined is used as the this value.
      */
    filter(callbackfn: (value: number, index: number, array: Int16Array) => any, thisArg?: any): Int16Array;

    /**
      * Returns the value of the first element in the array where predicate is true, and undefined
      * otherwise.
      * @param predicate find calls predicate once for each element of the array, in ascending
      * order, until it finds one where predicate returns true. If such an element is found, find
      * immediately returns that element value. Otherwise, find returns undefined.
      * @param thisArg If provided, it will be used as the this value for each invocation of
      * predicate. If it is not provided, undefined is used instead.
      */
    find(predicate: (value: number, index: number, obj: Array<number>) => boolean, thisArg?: any): number | undefined;

    /**
      * Returns the index of the first element in the array where predicate is true, and undefined
      * otherwise.
      * @param predicate find calls predicate once for each element of the array, in ascending
      * order, until it finds one where predicate returns true. If such an element is found,
      * findIndex immediately returns that element index. Otherwise, findIndex returns -1.
      * @param thisArg If provided, it will be used as the this value for each invocation of
      * predicate. If it is not provided, undefined is used instead.
      */
    findIndex(predicate: (value: number) => boolean, thisArg?: any): number;

    /**
      * Performs the specified action for each element in an array.
      * @param callbackfn  A function that accepts up to three arguments. forEach calls the
      * callbackfn function one time for each element in the array.
      * @param thisArg  An object to which the this keyword can refer in the callbackfn function.
      * If thisArg is omitted, undefined is used as the this value.
      */
    forEach(callbackfn: (value: number, index: number, array: Int16Array) => void, thisArg?: any): void;

    /**
      * Returns the index of the first occurrence of a value in an array.
      * @param searchElement The value to locate in the array.
      * @param fromIndex The array index at which to begin the search. If fromIndex is omitted, the
      *  search starts at index 0.
      */
    indexOf(searchElement: number, fromIndex?: number): number;

    /**
      * Adds all the elements of an array separated by the specified separator string.
      * @param separator A string used to separate one element of an array from the next in the
      * resulting String. If omitted, the array elements are separated with a comma.
      */
    join(separator?: string): string;

    /**
      * Returns the index of the last occurrence of a value in an array.
      * @param searchElement The value to locate in the array.
      * @param fromIndex The array index at which to begin the search. If fromIndex is omitted, the
      * search starts at index 0.
      */
    lastIndexOf(searchElement: number, fromIndex?: number): number;

    /**
      * The length of the array.
      */
    readonly length: number;

    /**
      * Calls a defined callback function on each element of an array, and returns an array that
      * contains the results.
      * @param callbackfn A function that accepts up to three arguments. The map method calls the
      * callbackfn function one time for each element in the array.
      * @param thisArg An object to which the this keyword can refer in the callbackfn function.
      * If thisArg is omitted, undefined is used as the this value.
      */
    map(callbackfn: (value: number, index: number, array: Int16Array) => number, thisArg?: any): Int16Array;

    /**
      * Calls the specified callback function for all the elements in an array. The return value of
      * the callback function is the accumulated result, and is provided as an argument in the next
      * call to the callback function.
      * @param callbackfn A function that accepts up to four arguments. The reduce method calls the
      * callbackfn function one time for each element in the array.
      * @param initialValue If initialValue is specified, it is used as the initial value to start
      * the accumulation. The first call to the callbackfn function provides this value as an argument
      * instead of an array value.
      */
    reduce(callbackfn: (previousValue: number, currentValue: number, currentIndex: number, array: Int16Array) => number, initialValue?: number): number;

    /**
      * Calls the specified callback function for all the elements in an array. The return value of
      * the callback function is the accumulated result, and is provided as an argument in the next
      * call to the callback function.
      * @param callbackfn A function that accepts up to four arguments. The reduce method calls the
      * callbackfn function one time for each element in the array.
      * @param initialValue If initialValue is specified, it is used as the initial value to start
      * the accumulation. The first call to the callbackfn function provides this value as an argument
      * instead of an array value.
      */
    reduce<U>(callbackfn: (previousValue: U, currentValue: number, currentIndex: number, array: Int16Array) => U, initialValue: U): U;

    /**
      * Calls the specified callback function for all the elements in an array, in descending order.
      * The return value of the callback function is the accumulated result, and is provided as an
      * argument in the next call to the callback function.
      * @param callbackfn A function that accepts up to four arguments. The reduceRight method calls
      * the callbackfn function one time for each element in the array.
      * @param initialValue If initialValue is specified, it is used as the initial value to start
      * the accumulation. The first call to the callbackfn function provides this value as an
      * argument instead of an array value.
      */
    reduceRight(callbackfn: (previousValue: number, currentValue: number, currentIndex: number, array: Int16Array) => number, initialValue?: number): number;

    /**
      * Calls the specified callback function for all the elements in an array, in descending order.
      * The return value of the callback function is the accumulated result, and is provided as an
      * argument in the next call to the callback function.
      * @param callbackfn A function that accepts up to four arguments. The reduceRight method calls
      * the callbackfn function one time for each element in the array.
      * @param initialValue If initialValue is specified, it is used as the initial value to start
      * the accumulation. The first call to the callbackfn function provides this value as an argument
      * instead of an array value.
      */
    reduceRight<U>(callbackfn: (previousValue: U, currentValue: number, currentIndex: number, array: Int16Array) => U, initialValue: U): U;

    /**
      * Reverses the elements in an Array.
      */
    reverse(): Int16Array;

    /**
      * Sets a value or an array of values.
      * @param index The index of the location to set.
      * @param value The value to set.
      */
    set(index: number, value: number): void;

    /**
      * Sets a value or an array of values.
      * @param array A typed or untyped array of values to set.
      * @param offset The index in the current array at which the values are to be written.
      */
    set(array: ArrayLike<number>, offset?: number): void;

    /**
      * Returns a section of an array.
      * @param start The beginning of the specified portion of the array.
      * @param end The end of the specified portion of the array.
      */
    slice(start?: number, end?: number): Int16Array;

    /**
      * Determines whether the specified callback function returns true for any element of an array.
      * @param callbackfn A function that accepts up to three arguments. The some method calls the
      * callbackfn function for each element in array1 until the callbackfn returns true, or until
      * the end of the array.
      * @param thisArg An object to which the this keyword can refer in the callbackfn function.
      * If thisArg is omitted, undefined is used as the this value.
      */
    some(callbackfn: (value: number, index: number, array: Int16Array) => boolean, thisArg?: any): boolean;

    /**
      * Sorts an array.
      * @param compareFn The name of the function used to determine the order of the elements. If
      * omitted, the elements are sorted in ascending, ASCII character order.
      */
    sort(compareFn?: (a: number, b: number) => number): this;

    /**
      * Gets a new Int16Array view of the ArrayBuffer store for this array, referencing the elements
      * at begin, inclusive, up to end, exclusive.
      * @param begin The index of the beginning of the array.
      * @param end The index of the end of the array.
      */
    subarray(begin: number, end?: number): Int16Array;

    /**
      * Converts a number to a string by using the current locale.
      */
    toLocaleString(): string;

    /**
      * Returns a string representation of an array.
      */
    toString(): string;

    [index: number]: number;
}

interface Int16ArrayConstructor {
    readonly prototype: Int16Array;
    new (length: number): Int16Array;
    new (array: ArrayLike<number>): Int16Array;
    new (buffer: ArrayBuffer, byteOffset?: number, length?: number): Int16Array;

    /**
      * The size in bytes of each element in the array.
      */
    readonly BYTES_PER_ELEMENT: number;

    /**
      * Returns a new array from a set of elements.
      * @param items A set of elements to include in the new array object.
      */
    of(...items: number[]): Int16Array;

    /**
      * Creates an array from an array-like or iterable object.
      * @param arrayLike An array-like or iterable object to convert to an array.
      * @param mapfn A mapping function to call on every element of the array.
      * @param thisArg Value of 'this' used to invoke the mapfn.
      */
    from(arrayLike: ArrayLike<number>, mapfn?: (v: number, k: number) => number, thisArg?: any): Int16Array;

}
declare const Int16Array: Int16ArrayConstructor;

/**
  * A typed array of 16-bit unsigned integer values. The contents are initialized to 0. If the
  * requested number of bytes could not be allocated an exception is raised.
  */
interface Uint16Array {
    /**
      * The size in bytes of each element in the array.
      */
    readonly BYTES_PER_ELEMENT: number;

    /**
      * The ArrayBuffer instance referenced by the array.
      */
    readonly buffer: ArrayBuffer;

    /**
      * The length in bytes of the array.
      */
    readonly byteLength: number;

    /**
      * The offset in bytes of the array.
      */
    readonly byteOffset: number;

    /**
      * Returns the this object after copying a section of the array identified by start and end
      * to the same array starting at position target
      * @param target If target is negative, it is treated as length+target where length is the
      * length of the array.
      * @param start If start is negative, it is treated as length+start. If end is negative, it
      * is treated as length+end.
      * @param end If not specified, length of the this object is used as its default value.
      */
    copyWithin(target: number, start: number, end?: number): this;

    /**
      * Determines whether all the members of an array satisfy the specified test.
      * @param callbackfn A function that accepts up to three arguments. The every method calls
      * the callbackfn function for each element in array1 until the callbackfn returns false,
      * or until the end of the array.
      * @param thisArg An object to which the this keyword can refer in the callbackfn function.
      * If thisArg is omitted, undefined is used as the this value.
      */
    every(callbackfn: (value: number, index: number, array: Uint16Array) => boolean, thisArg?: any): boolean;

    /**
        * Returns the this object after filling the section identified by start and end with value
        * @param value value to fill array section with
        * @param start index to start filling the array at. If start is negative, it is treated as
        * length+start where length is the length of the array.
        * @param end index to stop filling the array at. If end is negative, it is treated as
        * length+end.
        */
    fill(value: number, start?: number, end?: number): this;

    /**
      * Returns the elements of an array that meet the condition specified in a callback function.
      * @param callbackfn A function that accepts up to three arguments. The filter method calls
      * the callbackfn function one time for each element in the array.
      * @param thisArg An object to which the this keyword can refer in the callbackfn function.
      * If thisArg is omitted, undefined is used as the this value.
      */
    filter(callbackfn: (value: number, index: number, array: Uint16Array) => any, thisArg?: any): Uint16Array;

    /**
      * Returns the value of the first element in the array where predicate is true, and undefined
      * otherwise.
      * @param predicate find calls predicate once for each element of the array, in ascending
      * order, until it finds one where predicate returns true. If such an element is found, find
      * immediately returns that element value. Otherwise, find returns undefined.
      * @param thisArg If provided, it will be used as the this value for each invocation of
      * predicate. If it is not provided, undefined is used instead.
      */
    find(predicate: (value: number, index: number, obj: Array<number>) => boolean, thisArg?: any): number | undefined;

    /**
      * Returns the index of the first element in the array where predicate is true, and undefined
      * otherwise.
      * @param predicate find calls predicate once for each element of the array, in ascending
      * order, until it finds one where predicate returns true. If such an element is found,
      * findIndex immediately returns that element index. Otherwise, findIndex returns -1.
      * @param thisArg If provided, it will be used as the this value for each invocation of
      * predicate. If it is not provided, undefined is used instead.
      */
    findIndex(predicate: (value: number) => boolean, thisArg?: any): number;

    /**
      * Performs the specified action for each element in an array.
      * @param callbackfn  A function that accepts up to three arguments. forEach calls the
      * callbackfn function one time for each element in the array.
      * @param thisArg  An object to which the this keyword can refer in the callbackfn function.
      * If thisArg is omitted, undefined is used as the this value.
      */
    forEach(callbackfn: (value: number, index: number, array: Uint16Array) => void, thisArg?: any): void;

    /**
      * Returns the index of the first occurrence of a value in an array.
      * @param searchElement The value to locate in the array.
      * @param fromIndex The array index at which to begin the search. If fromIndex is omitted, the
      *  search starts at index 0.
      */
    indexOf(searchElement: number, fromIndex?: number): number;

    /**
      * Adds all the elements of an array separated by the specified separator string.
      * @param separator A string used to separate one element of an array from the next in the
      * resulting String. If omitted, the array elements are separated with a comma.
      */
    join(separator?: string): string;

    /**
      * Returns the index of the last occurrence of a value in an array.
      * @param searchElement The value to locate in the array.
      * @param fromIndex The array index at which to begin the search. If fromIndex is omitted, the
      * search starts at index 0.
      */
    lastIndexOf(searchElement: number, fromIndex?: number): number;

    /**
      * The length of the array.
      */
    readonly length: number;

    /**
      * Calls a defined callback function on each element of an array, and returns an array that
      * contains the results.
      * @param callbackfn A function that accepts up to three arguments. The map method calls the
      * callbackfn function one time for each element in the array.
      * @param thisArg An object to which the this keyword can refer in the callbackfn function.
      * If thisArg is omitted, undefined is used as the this value.
      */
    map(callbackfn: (value: number, index: number, array: Uint16Array) => number, thisArg?: any): Uint16Array;

    /**
      * Calls the specified callback function for all the elements in an array. The return value of
      * the callback function is the accumulated result, and is provided as an argument in the next
      * call to the callback function.
      * @param callbackfn A function that accepts up to four arguments. The reduce method calls the
      * callbackfn function one time for each element in the array.
      * @param initialValue If initialValue is specified, it is used as the initial value to start
      * the accumulation. The first call to the callbackfn function provides this value as an argument
      * instead of an array value.
      */
    reduce(callbackfn: (previousValue: number, currentValue: number, currentIndex: number, array: Uint16Array) => number, initialValue?: number): number;

    /**
      * Calls the specified callback function for all the elements in an array. The return value of
      * the callback function is the accumulated result, and is provided as an argument in the next
      * call to the callback function.
      * @param callbackfn A function that accepts up to four arguments. The reduce method calls the
      * callbackfn function one time for each element in the array.
      * @param initialValue If initialValue is specified, it is used as the initial value to start
      * the accumulation. The first call to the callbackfn function provides this value as an argument
      * instead of an array value.
      */
    reduce<U>(callbackfn: (previousValue: U, currentValue: number, currentIndex: number, array: Uint16Array) => U, initialValue: U): U;

    /**
      * Calls the specified callback function for all the elements in an array, in descending order.
      * The return value of the callback function is the accumulated result, and is provided as an
      * argument in the next call to the callback function.
      * @param callbackfn A function that accepts up to four arguments. The reduceRight method calls
      * the callbackfn function one time for each element in the array.
      * @param initialValue If initialValue is specified, it is used as the initial value to start
      * the accumulation. The first call to the callbackfn function provides this value as an
      * argument instead of an array value.
      */
    reduceRight(callbackfn: (previousValue: number, currentValue: number, currentIndex: number, array: Uint16Array) => number, initialValue?: number): number;

    /**
      * Calls the specified callback function for all the elements in an array, in descending order.
      * The return value of the callback function is the accumulated result, and is provided as an
      * argument in the next call to the callback function.
      * @param callbackfn A function that accepts up to four arguments. The reduceRight method calls
      * the callbackfn function one time for each element in the array.
      * @param initialValue If initialValue is specified, it is used as the initial value to start
      * the accumulation. The first call to the callbackfn function provides this value as an argument
      * instead of an array value.
      */
    reduceRight<U>(callbackfn: (previousValue: U, currentValue: number, currentIndex: number, array: Uint16Array) => U, initialValue: U): U;

    /**
      * Reverses the elements in an Array.
      */
    reverse(): Uint16Array;

    /**
      * Sets a value or an array of values.
      * @param index The index of the location to set.
      * @param value The value to set.
      */
    set(index: number, value: number): void;

    /**
      * Sets a value or an array of values.
      * @param array A typed or untyped array of values to set.
      * @param offset The index in the current array at which the values are to be written.
      */
    set(array: ArrayLike<number>, offset?: number): void;

    /**
      * Returns a section of an array.
      * @param start The beginning of the specified portion of the array.
      * @param end The end of the specified portion of the array.
      */
    slice(start?: number, end?: number): Uint16Array;

    /**
      * Determines whether the specified callback function returns true for any element of an array.
      * @param callbackfn A function that accepts up to three arguments. The some method calls the
      * callbackfn function for each element in array1 until the callbackfn returns true, or until
      * the end of the array.
      * @param thisArg An object to which the this keyword can refer in the callbackfn function.
      * If thisArg is omitted, undefined is used as the this value.
      */
    some(callbackfn: (value: number, index: number, array: Uint16Array) => boolean, thisArg?: any): boolean;

    /**
      * Sorts an array.
      * @param compareFn The name of the function used to determine the order of the elements. If
      * omitted, the elements are sorted in ascending, ASCII character order.
      */
    sort(compareFn?: (a: number, b: number) => number): this;

    /**
      * Gets a new Uint16Array view of the ArrayBuffer store for this array, referencing the elements
      * at begin, inclusive, up to end, exclusive.
      * @param begin The index of the beginning of the array.
      * @param end The index of the end of the array.
      */
    subarray(begin: number, end?: number): Uint16Array;

    /**
      * Converts a number to a string by using the current locale.
      */
    toLocaleString(): string;

    /**
      * Returns a string representation of an array.
      */
    toString(): string;

    [index: number]: number;
}

interface Uint16ArrayConstructor {
    readonly prototype: Uint16Array;
    new (length: number): Uint16Array;
    new (array: ArrayLike<number>): Uint16Array;
    new (buffer: ArrayBuffer, byteOffset?: number, length?: number): Uint16Array;

    /**
      * The size in bytes of each element in the array.
      */
    readonly BYTES_PER_ELEMENT: number;

    /**
      * Returns a new array from a set of elements.
      * @param items A set of elements to include in the new array object.
      */
    of(...items: number[]): Uint16Array;

    /**
      * Creates an array from an array-like or iterable object.
      * @param arrayLike An array-like or iterable object to convert to an array.
      * @param mapfn A mapping function to call on every element of the array.
      * @param thisArg Value of 'this' used to invoke the mapfn.
      */
    from(arrayLike: ArrayLike<number>, mapfn?: (v: number, k: number) => number, thisArg?: any): Uint16Array;

}
declare const Uint16Array: Uint16ArrayConstructor;
/**
  * A typed array of 32-bit signed integer values. The contents are initialized to 0. If the
  * requested number of bytes could not be allocated an exception is raised.
  */
interface Int32Array {
    /**
      * The size in bytes of each element in the array.
      */
    readonly BYTES_PER_ELEMENT: number;

    /**
      * The ArrayBuffer instance referenced by the array.
      */
    readonly buffer: ArrayBuffer;

    /**
      * The length in bytes of the array.
      */
    readonly byteLength: number;

    /**
      * The offset in bytes of the array.
      */
    readonly byteOffset: number;

    /**
      * Returns the this object after copying a section of the array identified by start and end
      * to the same array starting at position target
      * @param target If target is negative, it is treated as length+target where length is the
      * length of the array.
      * @param start If start is negative, it is treated as length+start. If end is negative, it
      * is treated as length+end.
      * @param end If not specified, length of the this object is used as its default value.
      */
    copyWithin(target: number, start: number, end?: number): this;

    /**
      * Determines whether all the members of an array satisfy the specified test.
      * @param callbackfn A function that accepts up to three arguments. The every method calls
      * the callbackfn function for each element in array1 until the callbackfn returns false,
      * or until the end of the array.
      * @param thisArg An object to which the this keyword can refer in the callbackfn function.
      * If thisArg is omitted, undefined is used as the this value.
      */
    every(callbackfn: (value: number, index: number, array: Int32Array) => boolean, thisArg?: any): boolean;

    /**
        * Returns the this object after filling the section identified by start and end with value
        * @param value value to fill array section with
        * @param start index to start filling the array at. If start is negative, it is treated as
        * length+start where length is the length of the array.
        * @param end index to stop filling the array at. If end is negative, it is treated as
        * length+end.
        */
    fill(value: number, start?: number, end?: number): this;

    /**
      * Returns the elements of an array that meet the condition specified in a callback function.
      * @param callbackfn A function that accepts up to three arguments. The filter method calls
      * the callbackfn function one time for each element in the array.
      * @param thisArg An object to which the this keyword can refer in the callbackfn function.
      * If thisArg is omitted, undefined is used as the this value.
      */
    filter(callbackfn: (value: number, index: number, array: Int32Array) => any, thisArg?: any): Int32Array;

    /**
      * Returns the value of the first element in the array where predicate is true, and undefined
      * otherwise.
      * @param predicate find calls predicate once for each element of the array, in ascending
      * order, until it finds one where predicate returns true. If such an element is found, find
      * immediately returns that element value. Otherwise, find returns undefined.
      * @param thisArg If provided, it will be used as the this value for each invocation of
      * predicate. If it is not provided, undefined is used instead.
      */
    find(predicate: (value: number, index: number, obj: Array<number>) => boolean, thisArg?: any): number | undefined;

    /**
      * Returns the index of the first element in the array where predicate is true, and undefined
      * otherwise.
      * @param predicate find calls predicate once for each element of the array, in ascending
      * order, until it finds one where predicate returns true. If such an element is found,
      * findIndex immediately returns that element index. Otherwise, findIndex returns -1.
      * @param thisArg If provided, it will be used as the this value for each invocation of
      * predicate. If it is not provided, undefined is used instead.
      */
    findIndex(predicate: (value: number) => boolean, thisArg?: any): number;

    /**
      * Performs the specified action for each element in an array.
      * @param callbackfn  A function that accepts up to three arguments. forEach calls the
      * callbackfn function one time for each element in the array.
      * @param thisArg  An object to which the this keyword can refer in the callbackfn function.
      * If thisArg is omitted, undefined is used as the this value.
      */
    forEach(callbackfn: (value: number, index: number, array: Int32Array) => void, thisArg?: any): void;

    /**
      * Returns the index of the first occurrence of a value in an array.
      * @param searchElement The value to locate in the array.
      * @param fromIndex The array index at which to begin the search. If fromIndex is omitted, the
      *  search starts at index 0.
      */
    indexOf(searchElement: number, fromIndex?: number): number;

    /**
      * Adds all the elements of an array separated by the specified separator string.
      * @param separator A string used to separate one element of an array from the next in the
      * resulting String. If omitted, the array elements are separated with a comma.
      */
    join(separator?: string): string;

    /**
      * Returns the index of the last occurrence of a value in an array.
      * @param searchElement The value to locate in the array.
      * @param fromIndex The array index at which to begin the search. If fromIndex is omitted, the
      * search starts at index 0.
      */
    lastIndexOf(searchElement: number, fromIndex?: number): number;

    /**
      * The length of the array.
      */
    readonly length: number;

    /**
      * Calls a defined callback function on each element of an array, and returns an array that
      * contains the results.
      * @param callbackfn A function that accepts up to three arguments. The map method calls the
      * callbackfn function one time for each element in the array.
      * @param thisArg An object to which the this keyword can refer in the callbackfn function.
      * If thisArg is omitted, undefined is used as the this value.
      */
    map(callbackfn: (value: number, index: number, array: Int32Array) => number, thisArg?: any): Int32Array;

    /**
      * Calls the specified callback function for all the elements in an array. The return value of
      * the callback function is the accumulated result, and is provided as an argument in the next
      * call to the callback function.
      * @param callbackfn A function that accepts up to four arguments. The reduce method calls the
      * callbackfn function one time for each element in the array.
      * @param initialValue If initialValue is specified, it is used as the initial value to start
      * the accumulation. The first call to the callbackfn function provides this value as an argument
      * instead of an array value.
      */
    reduce(callbackfn: (previousValue: number, currentValue: number, currentIndex: number, array: Int32Array) => number, initialValue?: number): number;

    /**
      * Calls the specified callback function for all the elements in an array. The return value of
      * the callback function is the accumulated result, and is provided as an argument in the next
      * call to the callback function.
      * @param callbackfn A function that accepts up to four arguments. The reduce method calls the
      * callbackfn function one time for each element in the array.
      * @param initialValue If initialValue is specified, it is used as the initial value to start
      * the accumulation. The first call to the callbackfn function provides this value as an argument
      * instead of an array value.
      */
    reduce<U>(callbackfn: (previousValue: U, currentValue: number, currentIndex: number, array: Int32Array) => U, initialValue: U): U;

    /**
      * Calls the specified callback function for all the elements in an array, in descending order.
      * The return value of the callback function is the accumulated result, and is provided as an
      * argument in the next call to the callback function.
      * @param callbackfn A function that accepts up to four arguments. The reduceRight method calls
      * the callbackfn function one time for each element in the array.
      * @param initialValue If initialValue is specified, it is used as the initial value to start
      * the accumulation. The first call to the callbackfn function provides this value as an
      * argument instead of an array value.
      */
    reduceRight(callbackfn: (previousValue: number, currentValue: number, currentIndex: number, array: Int32Array) => number, initialValue?: number): number;

    /**
      * Calls the specified callback function for all the elements in an array, in descending order.
      * The return value of the callback function is the accumulated result, and is provided as an
      * argument in the next call to the callback function.
      * @param callbackfn A function that accepts up to four arguments. The reduceRight method calls
      * the callbackfn function one time for each element in the array.
      * @param initialValue If initialValue is specified, it is used as the initial value to start
      * the accumulation. The first call to the callbackfn function provides this value as an argument
      * instead of an array value.
      */
    reduceRight<U>(callbackfn: (previousValue: U, currentValue: number, currentIndex: number, array: Int32Array) => U, initialValue: U): U;

    /**
      * Reverses the elements in an Array.
      */
    reverse(): Int32Array;

    /**
      * Sets a value or an array of values.
      * @param index The index of the location to set.
      * @param value The value to set.
      */
    set(index: number, value: number): void;

    /**
      * Sets a value or an array of values.
      * @param array A typed or untyped array of values to set.
      * @param offset The index in the current array at which the values are to be written.
      */
    set(array: ArrayLike<number>, offset?: number): void;

    /**
      * Returns a section of an array.
      * @param start The beginning of the specified portion of the array.
      * @param end The end of the specified portion of the array.
      */
    slice(start?: number, end?: number): Int32Array;

    /**
      * Determines whether the specified callback function returns true for any element of an array.
      * @param callbackfn A function that accepts up to three arguments. The some method calls the
      * callbackfn function for each element in array1 until the callbackfn returns true, or until
      * the end of the array.
      * @param thisArg An object to which the this keyword can refer in the callbackfn function.
      * If thisArg is omitted, undefined is used as the this value.
      */
    some(callbackfn: (value: number, index: number, array: Int32Array) => boolean, thisArg?: any): boolean;

    /**
      * Sorts an array.
      * @param compareFn The name of the function used to determine the order of the elements. If
      * omitted, the elements are sorted in ascending, ASCII character order.
      */
    sort(compareFn?: (a: number, b: number) => number): this;

    /**
      * Gets a new Int32Array view of the ArrayBuffer store for this array, referencing the elements
      * at begin, inclusive, up to end, exclusive.
      * @param begin The index of the beginning of the array.
      * @param end The index of the end of the array.
      */
    subarray(begin: number, end?: number): Int32Array;

    /**
      * Converts a number to a string by using the current locale.
      */
    toLocaleString(): string;

    /**
      * Returns a string representation of an array.
      */
    toString(): string;

    [index: number]: number;
}

interface Int32ArrayConstructor {
    readonly prototype: Int32Array;
    new (length: number): Int32Array;
    new (array: ArrayLike<number>): Int32Array;
    new (buffer: ArrayBuffer, byteOffset?: number, length?: number): Int32Array;

    /**
      * The size in bytes of each element in the array.
      */
    readonly BYTES_PER_ELEMENT: number;

    /**
      * Returns a new array from a set of elements.
      * @param items A set of elements to include in the new array object.
      */
    of(...items: number[]): Int32Array;

    /**
      * Creates an array from an array-like or iterable object.
      * @param arrayLike An array-like or iterable object to convert to an array.
      * @param mapfn A mapping function to call on every element of the array.
      * @param thisArg Value of 'this' used to invoke the mapfn.
      */
    from(arrayLike: ArrayLike<number>, mapfn?: (v: number, k: number) => number, thisArg?: any): Int32Array;
}
declare const Int32Array: Int32ArrayConstructor;

/**
  * A typed array of 32-bit unsigned integer values. The contents are initialized to 0. If the
  * requested number of bytes could not be allocated an exception is raised.
  */
interface Uint32Array {
    /**
      * The size in bytes of each element in the array.
      */
    readonly BYTES_PER_ELEMENT: number;

    /**
      * The ArrayBuffer instance referenced by the array.
      */
    readonly buffer: ArrayBuffer;

    /**
      * The length in bytes of the array.
      */
    readonly byteLength: number;

    /**
      * The offset in bytes of the array.
      */
    readonly byteOffset: number;

    /**
      * Returns the this object after copying a section of the array identified by start and end
      * to the same array starting at position target
      * @param target If target is negative, it is treated as length+target where length is the
      * length of the array.
      * @param start If start is negative, it is treated as length+start. If end is negative, it
      * is treated as length+end.
      * @param end If not specified, length of the this object is used as its default value.
      */
    copyWithin(target: number, start: number, end?: number): this;

    /**
      * Determines whether all the members of an array satisfy the specified test.
      * @param callbackfn A function that accepts up to three arguments. The every method calls
      * the callbackfn function for each element in array1 until the callbackfn returns false,
      * or until the end of the array.
      * @param thisArg An object to which the this keyword can refer in the callbackfn function.
      * If thisArg is omitted, undefined is used as the this value.
      */
    every(callbackfn: (value: number, index: number, array: Uint32Array) => boolean, thisArg?: any): boolean;

    /**
        * Returns the this object after filling the section identified by start and end with value
        * @param value value to fill array section with
        * @param start index to start filling the array at. If start is negative, it is treated as
        * length+start where length is the length of the array.
        * @param end index to stop filling the array at. If end is negative, it is treated as
        * length+end.
        */
    fill(value: number, start?: number, end?: number): this;

    /**
      * Returns the elements of an array that meet the condition specified in a callback function.
      * @param callbackfn A function that accepts up to three arguments. The filter method calls
      * the callbackfn function one time for each element in the array.
      * @param thisArg An object to which the this keyword can refer in the callbackfn function.
      * If thisArg is omitted, undefined is used as the this value.
      */
    filter(callbackfn: (value: number, index: number, array: Uint32Array) => any, thisArg?: any): Uint32Array;

    /**
      * Returns the value of the first element in the array where predicate is true, and undefined
      * otherwise.
      * @param predicate find calls predicate once for each element of the array, in ascending
      * order, until it finds one where predicate returns true. If such an element is found, find
      * immediately returns that element value. Otherwise, find returns undefined.
      * @param thisArg If provided, it will be used as the this value for each invocation of
      * predicate. If it is not provided, undefined is used instead.
      */
    find(predicate: (value: number, index: number, obj: Array<number>) => boolean, thisArg?: any): number | undefined;

    /**
      * Returns the index of the first element in the array where predicate is true, and undefined
      * otherwise.
      * @param predicate find calls predicate once for each element of the array, in ascending
      * order, until it finds one where predicate returns true. If such an element is found,
      * findIndex immediately returns that element index. Otherwise, findIndex returns -1.
      * @param thisArg If provided, it will be used as the this value for each invocation of
      * predicate. If it is not provided, undefined is used instead.
      */
    findIndex(predicate: (value: number) => boolean, thisArg?: any): number;

    /**
      * Performs the specified action for each element in an array.
      * @param callbackfn  A function that accepts up to three arguments. forEach calls the
      * callbackfn function one time for each element in the array.
      * @param thisArg  An object to which the this keyword can refer in the callbackfn function.
      * If thisArg is omitted, undefined is used as the this value.
      */
    forEach(callbackfn: (value: number, index: number, array: Uint32Array) => void, thisArg?: any): void;

    /**
      * Returns the index of the first occurrence of a value in an array.
      * @param searchElement The value to locate in the array.
      * @param fromIndex The array index at which to begin the search. If fromIndex is omitted, the
      *  search starts at index 0.
      */
    indexOf(searchElement: number, fromIndex?: number): number;

    /**
      * Adds all the elements of an array separated by the specified separator string.
      * @param separator A string used to separate one element of an array from the next in the
      * resulting String. If omitted, the array elements are separated with a comma.
      */
    join(separator?: string): string;

    /**
      * Returns the index of the last occurrence of a value in an array.
      * @param searchElement The value to locate in the array.
      * @param fromIndex The array index at which to begin the search. If fromIndex is omitted, the
      * search starts at index 0.
      */
    lastIndexOf(searchElement: number, fromIndex?: number): number;

    /**
      * The length of the array.
      */
    readonly length: number;

    /**
      * Calls a defined callback function on each element of an array, and returns an array that
      * contains the results.
      * @param callbackfn A function that accepts up to three arguments. The map method calls the
      * callbackfn function one time for each element in the array.
      * @param thisArg An object to which the this keyword can refer in the callbackfn function.
      * If thisArg is omitted, undefined is used as the this value.
      */
    map(callbackfn: (value: number, index: number, array: Uint32Array) => number, thisArg?: any): Uint32Array;

    /**
      * Calls the specified callback function for all the elements in an array. The return value of
      * the callback function is the accumulated result, and is provided as an argument in the next
      * call to the callback function.
      * @param callbackfn A function that accepts up to four arguments. The reduce method calls the
      * callbackfn function one time for each element in the array.
      * @param initialValue If initialValue is specified, it is used as the initial value to start
      * the accumulation. The first call to the callbackfn function provides this value as an argument
      * instead of an array value.
      */
    reduce(callbackfn: (previousValue: number, currentValue: number, currentIndex: number, array: Uint32Array) => number, initialValue?: number): number;

    /**
      * Calls the specified callback function for all the elements in an array. The return value of
      * the callback function is the accumulated result, and is provided as an argument in the next
      * call to the callback function.
      * @param callbackfn A function that accepts up to four arguments. The reduce method calls the
      * callbackfn function one time for each element in the array.
      * @param initialValue If initialValue is specified, it is used as the initial value to start
      * the accumulation. The first call to the callbackfn function provides this value as an argument
      * instead of an array value.
      */
    reduce<U>(callbackfn: (previousValue: U, currentValue: number, currentIndex: number, array: Uint32Array) => U, initialValue: U): U;

    /**
      * Calls the specified callback function for all the elements in an array, in descending order.
      * The return value of the callback function is the accumulated result, and is provided as an
      * argument in the next call to the callback function.
      * @param callbackfn A function that accepts up to four arguments. The reduceRight method calls
      * the callbackfn function one time for each element in the array.
      * @param initialValue If initialValue is specified, it is used as the initial value to start
      * the accumulation. The first call to the callbackfn function provides this value as an
      * argument instead of an array value.
      */
    reduceRight(callbackfn: (previousValue: number, currentValue: number, currentIndex: number, array: Uint32Array) => number, initialValue?: number): number;

    /**
      * Calls the specified callback function for all the elements in an array, in descending order.
      * The return value of the callback function is the accumulated result, and is provided as an
      * argument in the next call to the callback function.
      * @param callbackfn A function that accepts up to four arguments. The reduceRight method calls
      * the callbackfn function one time for each element in the array.
      * @param initialValue If initialValue is specified, it is used as the initial value to start
      * the accumulation. The first call to the callbackfn function provides this value as an argument
      * instead of an array value.
      */
    reduceRight<U>(callbackfn: (previousValue: U, currentValue: number, currentIndex: number, array: Uint32Array) => U, initialValue: U): U;

    /**
      * Reverses the elements in an Array.
      */
    reverse(): Uint32Array;

    /**
      * Sets a value or an array of values.
      * @param index The index of the location to set.
      * @param value The value to set.
      */
    set(index: number, value: number): void;

    /**
      * Sets a value or an array of values.
      * @param array A typed or untyped array of values to set.
      * @param offset The index in the current array at which the values are to be written.
      */
    set(array: ArrayLike<number>, offset?: number): void;

    /**
      * Returns a section of an array.
      * @param start The beginning of the specified portion of the array.
      * @param end The end of the specified portion of the array.
      */
    slice(start?: number, end?: number): Uint32Array;

    /**
      * Determines whether the specified callback function returns true for any element of an array.
      * @param callbackfn A function that accepts up to three arguments. The some method calls the
      * callbackfn function for each element in array1 until the callbackfn returns true, or until
      * the end of the array.
      * @param thisArg An object to which the this keyword can refer in the callbackfn function.
      * If thisArg is omitted, undefined is used as the this value.
      */
    some(callbackfn: (value: number, index: number, array: Uint32Array) => boolean, thisArg?: any): boolean;

    /**
      * Sorts an array.
      * @param compareFn The name of the function used to determine the order of the elements. If
      * omitted, the elements are sorted in ascending, ASCII character order.
      */
    sort(compareFn?: (a: number, b: number) => number): this;

    /**
      * Gets a new Uint32Array view of the ArrayBuffer store for this array, referencing the elements
      * at begin, inclusive, up to end, exclusive.
      * @param begin The index of the beginning of the array.
      * @param end The index of the end of the array.
      */
    subarray(begin: number, end?: number): Uint32Array;

    /**
      * Converts a number to a string by using the current locale.
      */
    toLocaleString(): string;

    /**
      * Returns a string representation of an array.
      */
    toString(): string;

    [index: number]: number;
}

interface Uint32ArrayConstructor {
    readonly prototype: Uint32Array;
    new (length: number): Uint32Array;
    new (array: ArrayLike<number>): Uint32Array;
    new (buffer: ArrayBuffer, byteOffset?: number, length?: number): Uint32Array;

    /**
      * The size in bytes of each element in the array.
      */
    readonly BYTES_PER_ELEMENT: number;

    /**
      * Returns a new array from a set of elements.
      * @param items A set of elements to include in the new array object.
      */
    of(...items: number[]): Uint32Array;

    /**
      * Creates an array from an array-like or iterable object.
      * @param arrayLike An array-like or iterable object to convert to an array.
      * @param mapfn A mapping function to call on every element of the array.
      * @param thisArg Value of 'this' used to invoke the mapfn.
      */
    from(arrayLike: ArrayLike<number>, mapfn?: (v: number, k: number) => number, thisArg?: any): Uint32Array;
}
declare const Uint32Array: Uint32ArrayConstructor;

/**
  * A typed array of 32-bit float values. The contents are initialized to 0. If the requested number
  * of bytes could not be allocated an exception is raised.
  */
interface Float32Array {
    /**
      * The size in bytes of each element in the array.
      */
    readonly BYTES_PER_ELEMENT: number;

    /**
      * The ArrayBuffer instance referenced by the array.
      */
    readonly buffer: ArrayBuffer;

    /**
      * The length in bytes of the array.
      */
    readonly byteLength: number;

    /**
      * The offset in bytes of the array.
      */
    readonly byteOffset: number;

    /**
      * Returns the this object after copying a section of the array identified by start and end
      * to the same array starting at position target
      * @param target If target is negative, it is treated as length+target where length is the
      * length of the array.
      * @param start If start is negative, it is treated as length+start. If end is negative, it
      * is treated as length+end.
      * @param end If not specified, length of the this object is used as its default value.
      */
    copyWithin(target: number, start: number, end?: number): this;

    /**
      * Determines whether all the members of an array satisfy the specified test.
      * @param callbackfn A function that accepts up to three arguments. The every method calls
      * the callbackfn function for each element in array1 until the callbackfn returns false,
      * or until the end of the array.
      * @param thisArg An object to which the this keyword can refer in the callbackfn function.
      * If thisArg is omitted, undefined is used as the this value.
      */
    every(callbackfn: (value: number, index: number, array: Float32Array) => boolean, thisArg?: any): boolean;

    /**
        * Returns the this object after filling the section identified by start and end with value
        * @param value value to fill array section with
        * @param start index to start filling the array at. If start is negative, it is treated as
        * length+start where length is the length of the array.
        * @param end index to stop filling the array at. If end is negative, it is treated as
        * length+end.
        */
    fill(value: number, start?: number, end?: number): this;

    /**
      * Returns the elements of an array that meet the condition specified in a callback function.
      * @param callbackfn A function that accepts up to three arguments. The filter method calls
      * the callbackfn function one time for each element in the array.
      * @param thisArg An object to which the this keyword can refer in the callbackfn function.
      * If thisArg is omitted, undefined is used as the this value.
      */
    filter(callbackfn: (value: number, index: number, array: Float32Array) => any, thisArg?: any): Float32Array;

    /**
      * Returns the value of the first element in the array where predicate is true, and undefined
      * otherwise.
      * @param predicate find calls predicate once for each element of the array, in ascending
      * order, until it finds one where predicate returns true. If such an element is found, find
      * immediately returns that element value. Otherwise, find returns undefined.
      * @param thisArg If provided, it will be used as the this value for each invocation of
      * predicate. If it is not provided, undefined is used instead.
      */
    find(predicate: (value: number, index: number, obj: Array<number>) => boolean, thisArg?: any): number | undefined;

    /**
      * Returns the index of the first element in the array where predicate is true, and undefined
      * otherwise.
      * @param predicate find calls predicate once for each element of the array, in ascending
      * order, until it finds one where predicate returns true. If such an element is found,
      * findIndex immediately returns that element index. Otherwise, findIndex returns -1.
      * @param thisArg If provided, it will be used as the this value for each invocation of
      * predicate. If it is not provided, undefined is used instead.
      */
    findIndex(predicate: (value: number) => boolean, thisArg?: any): number;

    /**
      * Performs the specified action for each element in an array.
      * @param callbackfn  A function that accepts up to three arguments. forEach calls the
      * callbackfn function one time for each element in the array.
      * @param thisArg  An object to which the this keyword can refer in the callbackfn function.
      * If thisArg is omitted, undefined is used as the this value.
      */
    forEach(callbackfn: (value: number, index: number, array: Float32Array) => void, thisArg?: any): void;

    /**
      * Returns the index of the first occurrence of a value in an array.
      * @param searchElement The value to locate in the array.
      * @param fromIndex The array index at which to begin the search. If fromIndex is omitted, the
      *  search starts at index 0.
      */
    indexOf(searchElement: number, fromIndex?: number): number;

    /**
      * Adds all the elements of an array separated by the specified separator string.
      * @param separator A string used to separate one element of an array from the next in the
      * resulting String. If omitted, the array elements are separated with a comma.
      */
    join(separator?: string): string;

    /**
      * Returns the index of the last occurrence of a value in an array.
      * @param searchElement The value to locate in the array.
      * @param fromIndex The array index at which to begin the search. If fromIndex is omitted, the
      * search starts at index 0.
      */
    lastIndexOf(searchElement: number, fromIndex?: number): number;

    /**
      * The length of the array.
      */
    readonly length: number;

    /**
      * Calls a defined callback function on each element of an array, and returns an array that
      * contains the results.
      * @param callbackfn A function that accepts up to three arguments. The map method calls the
      * callbackfn function one time for each element in the array.
      * @param thisArg An object to which the this keyword can refer in the callbackfn function.
      * If thisArg is omitted, undefined is used as the this value.
      */
    map(callbackfn: (value: number, index: number, array: Float32Array) => number, thisArg?: any): Float32Array;

    /**
      * Calls the specified callback function for all the elements in an array. The return value of
      * the callback function is the accumulated result, and is provided as an argument in the next
      * call to the callback function.
      * @param callbackfn A function that accepts up to four arguments. The reduce method calls the
      * callbackfn function one time for each element in the array.
      * @param initialValue If initialValue is specified, it is used as the initial value to start
      * the accumulation. The first call to the callbackfn function provides this value as an argument
      * instead of an array value.
      */
    reduce(callbackfn: (previousValue: number, currentValue: number, currentIndex: number, array: Float32Array) => number, initialValue?: number): number;

    /**
      * Calls the specified callback function for all the elements in an array. The return value of
      * the callback function is the accumulated result, and is provided as an argument in the next
      * call to the callback function.
      * @param callbackfn A function that accepts up to four arguments. The reduce method calls the
      * callbackfn function one time for each element in the array.
      * @param initialValue If initialValue is specified, it is used as the initial value to start
      * the accumulation. The first call to the callbackfn function provides this value as an argument
      * instead of an array value.
      */
    reduce<U>(callbackfn: (previousValue: U, currentValue: number, currentIndex: number, array: Float32Array) => U, initialValue: U): U;

    /**
      * Calls the specified callback function for all the elements in an array, in descending order.
      * The return value of the callback function is the accumulated result, and is provided as an
      * argument in the next call to the callback function.
      * @param callbackfn A function that accepts up to four arguments. The reduceRight method calls
      * the callbackfn function one time for each element in the array.
      * @param initialValue If initialValue is specified, it is used as the initial value to start
      * the accumulation. The first call to the callbackfn function provides this value as an
      * argument instead of an array value.
      */
    reduceRight(callbackfn: (previousValue: number, currentValue: number, currentIndex: number, array: Float32Array) => number, initialValue?: number): number;

    /**
      * Calls the specified callback function for all the elements in an array, in descending order.
      * The return value of the callback function is the accumulated result, and is provided as an
      * argument in the next call to the callback function.
      * @param callbackfn A function that accepts up to four arguments. The reduceRight method calls
      * the callbackfn function one time for each element in the array.
      * @param initialValue If initialValue is specified, it is used as the initial value to start
      * the accumulation. The first call to the callbackfn function provides this value as an argument
      * instead of an array value.
      */
    reduceRight<U>(callbackfn: (previousValue: U, currentValue: number, currentIndex: number, array: Float32Array) => U, initialValue: U): U;

    /**
      * Reverses the elements in an Array.
      */
    reverse(): Float32Array;

    /**
      * Sets a value or an array of values.
      * @param index The index of the location to set.
      * @param value The value to set.
      */
    set(index: number, value: number): void;

    /**
      * Sets a value or an array of values.
      * @param array A typed or untyped array of values to set.
      * @param offset The index in the current array at which the values are to be written.
      */
    set(array: ArrayLike<number>, offset?: number): void;

    /**
      * Returns a section of an array.
      * @param start The beginning of the specified portion of the array.
      * @param end The end of the specified portion of the array.
      */
    slice(start?: number, end?: number): Float32Array;

    /**
      * Determines whether the specified callback function returns true for any element of an array.
      * @param callbackfn A function that accepts up to three arguments. The some method calls the
      * callbackfn function for each element in array1 until the callbackfn returns true, or until
      * the end of the array.
      * @param thisArg An object to which the this keyword can refer in the callbackfn function.
      * If thisArg is omitted, undefined is used as the this value.
      */
    some(callbackfn: (value: number, index: number, array: Float32Array) => boolean, thisArg?: any): boolean;

    /**
      * Sorts an array.
      * @param compareFn The name of the function used to determine the order of the elements. If
      * omitted, the elements are sorted in ascending, ASCII character order.
      */
    sort(compareFn?: (a: number, b: number) => number): this;

    /**
      * Gets a new Float32Array view of the ArrayBuffer store for this array, referencing the elements
      * at begin, inclusive, up to end, exclusive.
      * @param begin The index of the beginning of the array.
      * @param end The index of the end of the array.
      */
    subarray(begin: number, end?: number): Float32Array;

    /**
      * Converts a number to a string by using the current locale.
      */
    toLocaleString(): string;

    /**
      * Returns a string representation of an array.
      */
    toString(): string;

    [index: number]: number;
}

interface Float32ArrayConstructor {
    readonly prototype: Float32Array;
    new (length: number): Float32Array;
    new (array: ArrayLike<number>): Float32Array;
    new (buffer: ArrayBuffer, byteOffset?: number, length?: number): Float32Array;

    /**
      * The size in bytes of each element in the array.
      */
    readonly BYTES_PER_ELEMENT: number;

    /**
      * Returns a new array from a set of elements.
      * @param items A set of elements to include in the new array object.
      */
    of(...items: number[]): Float32Array;

    /**
      * Creates an array from an array-like or iterable object.
      * @param arrayLike An array-like or iterable object to convert to an array.
      * @param mapfn A mapping function to call on every element of the array.
      * @param thisArg Value of 'this' used to invoke the mapfn.
      */
    from(arrayLike: ArrayLike<number>, mapfn?: (v: number, k: number) => number, thisArg?: any): Float32Array;

}
declare const Float32Array: Float32ArrayConstructor;

/**
  * A typed array of 64-bit float values. The contents are initialized to 0. If the requested
  * number of bytes could not be allocated an exception is raised.
  */
interface Float64Array {
    /**
      * The size in bytes of each element in the array.
      */
    readonly BYTES_PER_ELEMENT: number;

    /**
      * The ArrayBuffer instance referenced by the array.
      */
    readonly buffer: ArrayBuffer;

    /**
      * The length in bytes of the array.
      */
    readonly byteLength: number;

    /**
      * The offset in bytes of the array.
      */
    readonly byteOffset: number;

    /**
      * Returns the this object after copying a section of the array identified by start and end
      * to the same array starting at position target
      * @param target If target is negative, it is treated as length+target where length is the
      * length of the array.
      * @param start If start is negative, it is treated as length+start. If end is negative, it
      * is treated as length+end.
      * @param end If not specified, length of the this object is used as its default value.
      */
    copyWithin(target: number, start: number, end?: number): this;

    /**
      * Determines whether all the members of an array satisfy the specified test.
      * @param callbackfn A function that accepts up to three arguments. The every method calls
      * the callbackfn function for each element in array1 until the callbackfn returns false,
      * or until the end of the array.
      * @param thisArg An object to which the this keyword can refer in the callbackfn function.
      * If thisArg is omitted, undefined is used as the this value.
      */
    every(callbackfn: (value: number, index: number, array: Float64Array) => boolean, thisArg?: any): boolean;

    /**
        * Returns the this object after filling the section identified by start and end with value
        * @param value value to fill array section with
        * @param start index to start filling the array at. If start is negative, it is treated as
        * length+start where length is the length of the array.
        * @param end index to stop filling the array at. If end is negative, it is treated as
        * length+end.
        */
    fill(value: number, start?: number, end?: number): this;

    /**
      * Returns the elements of an array that meet the condition specified in a callback function.
      * @param callbackfn A function that accepts up to three arguments. The filter method calls
      * the callbackfn function one time for each element in the array.
      * @param thisArg An object to which the this keyword can refer in the callbackfn function.
      * If thisArg is omitted, undefined is used as the this value.
      */
    filter(callbackfn: (value: number, index: number, array: Float64Array) => any, thisArg?: any): Float64Array;

    /**
      * Returns the value of the first element in the array where predicate is true, and undefined
      * otherwise.
      * @param predicate find calls predicate once for each element of the array, in ascending
      * order, until it finds one where predicate returns true. If such an element is found, find
      * immediately returns that element value. Otherwise, find returns undefined.
      * @param thisArg If provided, it will be used as the this value for each invocation of
      * predicate. If it is not provided, undefined is used instead.
      */
    find(predicate: (value: number, index: number, obj: Array<number>) => boolean, thisArg?: any): number | undefined;

    /**
      * Returns the index of the first element in the array where predicate is true, and undefined
      * otherwise.
      * @param predicate find calls predicate once for each element of the array, in ascending
      * order, until it finds one where predicate returns true. If such an element is found,
      * findIndex immediately returns that element index. Otherwise, findIndex returns -1.
      * @param thisArg If provided, it will be used as the this value for each invocation of
      * predicate. If it is not provided, undefined is used instead.
      */
    findIndex(predicate: (value: number) => boolean, thisArg?: any): number;

    /**
      * Performs the specified action for each element in an array.
      * @param callbackfn  A function that accepts up to three arguments. forEach calls the
      * callbackfn function one time for each element in the array.
      * @param thisArg  An object to which the this keyword can refer in the callbackfn function.
      * If thisArg is omitted, undefined is used as the this value.
      */
    forEach(callbackfn: (value: number, index: number, array: Float64Array) => void, thisArg?: any): void;

    /**
      * Returns the index of the first occurrence of a value in an array.
      * @param searchElement The value to locate in the array.
      * @param fromIndex The array index at which to begin the search. If fromIndex is omitted, the
      *  search starts at index 0.
      */
    indexOf(searchElement: number, fromIndex?: number): number;

    /**
      * Adds all the elements of an array separated by the specified separator string.
      * @param separator A string used to separate one element of an array from the next in the
      * resulting String. If omitted, the array elements are separated with a comma.
      */
    join(separator?: string): string;

    /**
      * Returns the index of the last occurrence of a value in an array.
      * @param searchElement The value to locate in the array.
      * @param fromIndex The array index at which to begin the search. If fromIndex is omitted, the
      * search starts at index 0.
      */
    lastIndexOf(searchElement: number, fromIndex?: number): number;

    /**
      * The length of the array.
      */
    readonly length: number;

    /**
      * Calls a defined callback function on each element of an array, and returns an array that
      * contains the results.
      * @param callbackfn A function that accepts up to three arguments. The map method calls the
      * callbackfn function one time for each element in the array.
      * @param thisArg An object to which the this keyword can refer in the callbackfn function.
      * If thisArg is omitted, undefined is used as the this value.
      */
    map(callbackfn: (value: number, index: number, array: Float64Array) => number, thisArg?: any): Float64Array;

    /**
      * Calls the specified callback function for all the elements in an array. The return value of
      * the callback function is the accumulated result, and is provided as an argument in the next
      * call to the callback function.
      * @param callbackfn A function that accepts up to four arguments. The reduce method calls the
      * callbackfn function one time for each element in the array.
      * @param initialValue If initialValue is specified, it is used as the initial value to start
      * the accumulation. The first call to the callbackfn function provides this value as an argument
      * instead of an array value.
      */
    reduce(callbackfn: (previousValue: number, currentValue: number, currentIndex: number, array: Float64Array) => number, initialValue?: number): number;

    /**
      * Calls the specified callback function for all the elements in an array. The return value of
      * the callback function is the accumulated result, and is provided as an argument in the next
      * call to the callback function.
      * @param callbackfn A function that accepts up to four arguments. The reduce method calls the
      * callbackfn function one time for each element in the array.
      * @param initialValue If initialValue is specified, it is used as the initial value to start
      * the accumulation. The first call to the callbackfn function provides this value as an argument
      * instead of an array value.
      */
    reduce<U>(callbackfn: (previousValue: U, currentValue: number, currentIndex: number, array: Float64Array) => U, initialValue: U): U;

    /**
      * Calls the specified callback function for all the elements in an array, in descending order.
      * The return value of the callback function is the accumulated result, and is provided as an
      * argument in the next call to the callback function.
      * @param callbackfn A function that accepts up to four arguments. The reduceRight method calls
      * the callbackfn function one time for each element in the array.
      * @param initialValue If initialValue is specified, it is used as the initial value to start
      * the accumulation. The first call to the callbackfn function provides this value as an
      * argument instead of an array value.
      */
    reduceRight(callbackfn: (previousValue: number, currentValue: number, currentIndex: number, array: Float64Array) => number, initialValue?: number): number;

    /**
      * Calls the specified callback function for all the elements in an array, in descending order.
      * The return value of the callback function is the accumulated result, and is provided as an
      * argument in the next call to the callback function.
      * @param callbackfn A function that accepts up to four arguments. The reduceRight method calls
      * the callbackfn function one time for each element in the array.
      * @param initialValue If initialValue is specified, it is used as the initial value to start
      * the accumulation. The first call to the callbackfn function provides this value as an argument
      * instead of an array value.
      */
    reduceRight<U>(callbackfn: (previousValue: U, currentValue: number, currentIndex: number, array: Float64Array) => U, initialValue: U): U;

    /**
      * Reverses the elements in an Array.
      */
    reverse(): Float64Array;

    /**
      * Sets a value or an array of values.
      * @param index The index of the location to set.
      * @param value The value to set.
      */
    set(index: number, value: number): void;

    /**
      * Sets a value or an array of values.
      * @param array A typed or untyped array of values to set.
      * @param offset The index in the current array at which the values are to be written.
      */
    set(array: ArrayLike<number>, offset?: number): void;

    /**
      * Returns a section of an array.
      * @param start The beginning of the specified portion of the array.
      * @param end The end of the specified portion of the array.
      */
    slice(start?: number, end?: number): Float64Array;

    /**
      * Determines whether the specified callback function returns true for any element of an array.
      * @param callbackfn A function that accepts up to three arguments. The some method calls the
      * callbackfn function for each element in array1 until the callbackfn returns true, or until
      * the end of the array.
      * @param thisArg An object to which the this keyword can refer in the callbackfn function.
      * If thisArg is omitted, undefined is used as the this value.
      */
    some(callbackfn: (value: number, index: number, array: Float64Array) => boolean, thisArg?: any): boolean;

    /**
      * Sorts an array.
      * @param compareFn The name of the function used to determine the order of the elements. If
      * omitted, the elements are sorted in ascending, ASCII character order.
      */
    sort(compareFn?: (a: number, b: number) => number): this;

    /**
      * Gets a new Float64Array view of the ArrayBuffer store for this array, referencing the elements
      * at begin, inclusive, up to end, exclusive.
      * @param begin The index of the beginning of the array.
      * @param end The index of the end of the array.
      */
    subarray(begin: number, end?: number): Float64Array;

    /**
      * Converts a number to a string by using the current locale.
      */
    toLocaleString(): string;

    /**
      * Returns a string representation of an array.
      */
    toString(): string;

    [index: number]: number;
}

interface Float64ArrayConstructor {
    readonly prototype: Float64Array;
    new (length: number): Float64Array;
    new (array: ArrayLike<number>): Float64Array;
    new (buffer: ArrayBuffer, byteOffset?: number, length?: number): Float64Array;

    /**
      * The size in bytes of each element in the array.
      */
    readonly BYTES_PER_ELEMENT: number;

    /**
      * Returns a new array from a set of elements.
      * @param items A set of elements to include in the new array object.
      */
    of(...items: number[]): Float64Array;

    /**
      * Creates an array from an array-like or iterable object.
      * @param arrayLike An array-like or iterable object to convert to an array.
      * @param mapfn A mapping function to call on every element of the array.
      * @param thisArg Value of 'this' used to invoke the mapfn.
      */
    from(arrayLike: ArrayLike<number>, mapfn?: (v: number, k: number) => number, thisArg?: any): Float64Array;
}
declare const Float64Array: Float64ArrayConstructor;

/////////////////////////////
/// ECMAScript Internationalization API
/////////////////////////////

declare module Intl {
    interface CollatorOptions {
        usage?: string;
        localeMatcher?: string;
        numeric?: boolean;
        caseFirst?: string;
        sensitivity?: string;
        ignorePunctuation?: boolean;
    }

    interface ResolvedCollatorOptions {
        locale: string;
        usage: string;
        sensitivity: string;
        ignorePunctuation: boolean;
        collation: string;
        caseFirst: string;
        numeric: boolean;
    }

    interface Collator {
        compare(x: string, y: string): number;
        resolvedOptions(): ResolvedCollatorOptions;
    }
    var Collator: {
        new (locales?: string[], options?: CollatorOptions): Collator;
        new (locale?: string, options?: CollatorOptions): Collator;
        (locales?: string[], options?: CollatorOptions): Collator;
        (locale?: string, options?: CollatorOptions): Collator;
        supportedLocalesOf(locales: string[], options?: CollatorOptions): string[];
        supportedLocalesOf(locale: string, options?: CollatorOptions): string[];
    }

    interface NumberFormatOptions {
        localeMatcher?: string;
        style?: string;
        currency?: string;
        currencyDisplay?: string;
        useGrouping?: boolean;
        minimumIntegerDigits?: number;
        minimumFractionDigits?: number;
        maximumFractionDigits?: number;
        minimumSignificantDigits?: number;
        maximumSignificantDigits?: number;
    }

    interface ResolvedNumberFormatOptions {
        locale: string;
        numberingSystem: string;
        style: string;
        currency?: string;
        currencyDisplay?: string;
        minimumIntegerDigits: number;
        minimumFractionDigits: number;
        maximumFractionDigits: number;
        minimumSignificantDigits?: number;
        maximumSignificantDigits?: number;
        useGrouping: boolean;
    }

    interface NumberFormat {
        format(value: number): string;
        resolvedOptions(): ResolvedNumberFormatOptions;
    }
    var NumberFormat: {
        new (locales?: string[], options?: NumberFormatOptions): NumberFormat;
        new (locale?: string, options?: NumberFormatOptions): NumberFormat;
        (locales?: string[], options?: NumberFormatOptions): NumberFormat;
        (locale?: string, options?: NumberFormatOptions): NumberFormat;
        supportedLocalesOf(locales: string[], options?: NumberFormatOptions): string[];
        supportedLocalesOf(locale: string, options?: NumberFormatOptions): string[];
    }

    interface DateTimeFormatOptions {
        localeMatcher?: string;
        weekday?: string;
        era?: string;
        year?: string;
        month?: string;
        day?: string;
        hour?: string;
        minute?: string;
        second?: string;
        timeZoneName?: string;
        formatMatcher?: string;
        hour12?: boolean;
        timeZone?: string;
    }

    interface ResolvedDateTimeFormatOptions {
        locale: string;
        calendar: string;
        numberingSystem: string;
        timeZone: string;
        hour12?: boolean;
        weekday?: string;
        era?: string;
        year?: string;
        month?: string;
        day?: string;
        hour?: string;
        minute?: string;
        second?: string;
        timeZoneName?: string;
    }

    interface DateTimeFormat {
        format(date?: Date | number): string;
        resolvedOptions(): ResolvedDateTimeFormatOptions;
    }
    var DateTimeFormat: {
        new (locales?: string[], options?: DateTimeFormatOptions): DateTimeFormat;
        new (locale?: string, options?: DateTimeFormatOptions): DateTimeFormat;
        (locales?: string[], options?: DateTimeFormatOptions): DateTimeFormat;
        (locale?: string, options?: DateTimeFormatOptions): DateTimeFormat;
        supportedLocalesOf(locales: string[], options?: DateTimeFormatOptions): string[];
        supportedLocalesOf(locale: string, options?: DateTimeFormatOptions): string[];
    }
}

interface String {
    /**
      * Determines whether two strings are equivalent in the current locale.
      * @param that String to compare to target string
      * @param locales An array of locale strings that contain one or more language or locale tags. If you include more than one locale string, list them in descending order of priority so that the first entry is the preferred locale. If you omit this parameter, the default locale of the JavaScript runtime is used. This parameter must conform to BCP 47 standards; see the Intl.Collator object for details.
      * @param options An object that contains one or more properties that specify comparison options. see the Intl.Collator object for details.
      */
    localeCompare(that: string, locales: string[], options?: Intl.CollatorOptions): number;

    /**
      * Determines whether two strings are equivalent in the current locale.
      * @param that String to compare to target string
      * @param locale Locale tag. If you omit this parameter, the default locale of the JavaScript runtime is used. This parameter must conform to BCP 47 standards; see the Intl.Collator object for details.
      * @param options An object that contains one or more properties that specify comparison options. see the Intl.Collator object for details.
      */
    localeCompare(that: string, locale: string, options?: Intl.CollatorOptions): number;
}

interface Number {
    /**
      * Converts a number to a string by using the current or specified locale.
      * @param locales An array of locale strings that contain one or more language or locale tags. If you include more than one locale string, list them in descending order of priority so that the first entry is the preferred locale. If you omit this parameter, the default locale of the JavaScript runtime is used.
      * @param options An object that contains one or more properties that specify comparison options.
      */
    toLocaleString(locales?: string[], options?: Intl.NumberFormatOptions): string;

    /**
      * Converts a number to a string by using the current or specified locale.
      * @param locale Locale tag. If you omit this parameter, the default locale of the JavaScript runtime is used.
      * @param options An object that contains one or more properties that specify comparison options.
      */
    toLocaleString(locale?: string, options?: Intl.NumberFormatOptions): string;
}

interface Date {
    /**
      * Converts a date and time to a string by using the current or specified locale.
      * @param locales An array of locale strings that contain one or more language or locale tags. If you include more than one locale string, list them in descending order of priority so that the first entry is the preferred locale. If you omit this parameter, the default locale of the JavaScript runtime is used.
      * @param options An object that contains one or more properties that specify comparison options.
      */
    toLocaleString(locales?: string[], options?: Intl.DateTimeFormatOptions): string;
    /**
      * Converts a date to a string by using the current or specified locale.
      * @param locales An array of locale strings that contain one or more language or locale tags. If you include more than one locale string, list them in descending order of priority so that the first entry is the preferred locale. If you omit this parameter, the default locale of the JavaScript runtime is used.
      * @param options An object that contains one or more properties that specify comparison options.
      */
    toLocaleDateString(locales?: string[], options?: Intl.DateTimeFormatOptions): string;

    /**
      * Converts a time to a string by using the current or specified locale.
      * @param locale Locale tag. If you omit this parameter, the default locale of the JavaScript runtime is used.
      * @param options An object that contains one or more properties that specify comparison options.
      */
    toLocaleTimeString(locale?: string[], options?: Intl.DateTimeFormatOptions): string;

    /**
      * Converts a date and time to a string by using the current or specified locale.
      * @param locale Locale tag. If you omit this parameter, the default locale of the JavaScript runtime is used.
      * @param options An object that contains one or more properties that specify comparison options.
      */
    toLocaleString(locale?: string, options?: Intl.DateTimeFormatOptions): string;

    /**
      * Converts a date to a string by using the current or specified locale.
      * @param locale Locale tag. If you omit this parameter, the default locale of the JavaScript runtime is used.
      * @param options An object that contains one or more properties that specify comparison options.
      */
    toLocaleDateString(locale?: string, options?: Intl.DateTimeFormatOptions): string;

    /**
      * Converts a time to a string by using the current or specified locale.
      * @param locale Locale tag. If you omit this parameter, the default locale of the JavaScript runtime is used.
      * @param options An object that contains one or more properties that specify comparison options.
      */
    toLocaleTimeString(locale?: string, options?: Intl.DateTimeFormatOptions): string;
}
declare type PropertyKey = string | number | symbol;

interface Array<T> {
    /**
      * Returns the value of the first element in the array where predicate is true, and undefined
      * otherwise.
      * @param predicate find calls predicate once for each element of the array, in ascending
      * order, until it finds one where predicate returns true. If such an element is found, find
      * immediately returns that element value. Otherwise, find returns undefined.
      * @param thisArg If provided, it will be used as the this value for each invocation of
      * predicate. If it is not provided, undefined is used instead.
      */
    find(predicate: (value: T, index: number, obj: Array<T>) => boolean, thisArg?: any): T | undefined;

    /**
      * Returns the index of the first element in the array where predicate is true, and undefined
      * otherwise.
      * @param predicate find calls predicate once for each element of the array, in ascending
      * order, until it finds one where predicate returns true. If such an element is found,
      * findIndex immediately returns that element index. Otherwise, findIndex returns -1.
      * @param thisArg If provided, it will be used as the this value for each invocation of
      * predicate. If it is not provided, undefined is used instead.
      */
    findIndex(predicate: (value: T) => boolean, thisArg?: any): number;

    /**
      * Returns the this object after filling the section identified by start and end with value
      * @param value value to fill array section with
      * @param start index to start filling the array at. If start is negative, it is treated as
      * length+start where length is the length of the array.
      * @param end index to stop filling the array at. If end is negative, it is treated as
      * length+end.
      */
    fill(value: T, start?: number, end?: number): this;

    /**
      * Returns the this object after copying a section of the array identified by start and end
      * to the same array starting at position target
      * @param target If target is negative, it is treated as length+target where length is the
      * length of the array.
      * @param start If start is negative, it is treated as length+start. If end is negative, it
      * is treated as length+end.
      * @param end If not specified, length of the this object is used as its default value.
      */
    copyWithin(target: number, start: number, end?: number): this;
}

interface ArrayConstructor {
    /**
      * Creates an array from an array-like object.
      * @param arrayLike An array-like object to convert to an array.
      * @param mapfn A mapping function to call on every element of the array.
      * @param thisArg Value of 'this' used to invoke the mapfn.
      */
    from<T, U>(arrayLike: ArrayLike<T>, mapfn: (v: T, k: number) => U, thisArg?: any): Array<U>;


    /**
      * Creates an array from an array-like object.
      * @param arrayLike An array-like object to convert to an array.
      */
    from<T>(arrayLike: ArrayLike<T>): Array<T>;

    /**
      * Returns a new array from a set of elements.
      * @param items A set of elements to include in the new array object.
      */
    of<T>(...items: T[]): Array<T>;
}

interface DateConstructor {
    new (value: Date): Date;
}

interface Function {
    /**
      * Returns the name of the function. Function names are read-only and can not be changed.
      */
    readonly name: string;
}

interface Math {
    /**
      * Returns the number of leading zero bits in the 32-bit binary representation of a number.
      * @param x A numeric expression.
      */
    clz32(x: number): number;

    /**
      * Returns the result of 32-bit multiplication of two numbers.
      * @param x First number
      * @param y Second number
      */
    imul(x: number, y: number): number;

    /**
      * Returns the sign of the x, indicating whether x is positive, negative or zero.
      * @param x The numeric expression to test
      */
    sign(x: number): number;

    /**
      * Returns the base 10 logarithm of a number.
      * @param x A numeric expression.
      */
    log10(x: number): number;

    /**
      * Returns the base 2 logarithm of a number.
      * @param x A numeric expression.
      */
    log2(x: number): number;

    /**
      * Returns the natural logarithm of 1 + x.
      * @param x A numeric expression.
      */
    log1p(x: number): number;

    /**
      * Returns the result of (e^x - 1) of x (e raised to the power of x, where e is the base of
      * the natural logarithms).
      * @param x A numeric expression.
      */
    expm1(x: number): number;

    /**
      * Returns the hyperbolic cosine of a number.
      * @param x A numeric expression that contains an angle measured in radians.
      */
    cosh(x: number): number;

    /**
      * Returns the hyperbolic sine of a number.
      * @param x A numeric expression that contains an angle measured in radians.
      */
    sinh(x: number): number;

    /**
      * Returns the hyperbolic tangent of a number.
      * @param x A numeric expression that contains an angle measured in radians.
      */
    tanh(x: number): number;

    /**
      * Returns the inverse hyperbolic cosine of a number.
      * @param x A numeric expression that contains an angle measured in radians.
      */
    acosh(x: number): number;

    /**
      * Returns the inverse hyperbolic sine of a number.
      * @param x A numeric expression that contains an angle measured in radians.
      */
    asinh(x: number): number;

    /**
      * Returns the inverse hyperbolic tangent of a number.
      * @param x A numeric expression that contains an angle measured in radians.
      */
    atanh(x: number): number;

    /**
      * Returns the square root of the sum of squares of its arguments.
      * @param values Values to compute the square root for.
      *     If no arguments are passed, the result is +0.
      *     If there is only one argument, the result is the absolute value.
      *     If any argument is +Infinity or -Infinity, the result is +Infinity.
      *     If any argument is NaN, the result is NaN.
      *     If all arguments are either +0 or −0, the result is +0.
      */
    hypot(...values: number[] ): number;

    /**
      * Returns the integral part of the a numeric expression, x, removing any fractional digits.
      * If x is already an integer, the result is x.
      * @param x A numeric expression.
      */
    trunc(x: number): number;

    /**
      * Returns the nearest single precision float representation of a number.
      * @param x A numeric expression.
      */
    fround(x: number): number;

    /**
      * Returns an implementation-dependent approximation to the cube root of number.
      * @param x A numeric expression.
      */
    cbrt(x: number): number;
}

interface NumberConstructor {
    /**
      * The value of Number.EPSILON is the difference between 1 and the smallest value greater than 1
      * that is representable as a Number value, which is approximately:
      * 2.2204460492503130808472633361816 x 10‍−‍16.
      */
    readonly EPSILON: number;

    /**
      * Returns true if passed value is finite.
      * Unlike the global isFininte, Number.isFinite doesn't forcibly convert the parameter to a
      * number. Only finite values of the type number, result in true.
      * @param number A numeric value.
      */
    isFinite(number: number): boolean;

    /**
      * Returns true if the value passed is an integer, false otherwise.
      * @param number A numeric value.
      */
    isInteger(number: number): boolean;

    /**
      * Returns a Boolean value that indicates whether a value is the reserved value NaN (not a
      * number). Unlike the global isNaN(), Number.isNaN() doesn't forcefully convert the parameter
      * to a number. Only values of the type number, that are also NaN, result in true.
      * @param number A numeric value.
      */
    isNaN(number: number): boolean;

    /**
      * Returns true if the value passed is a safe integer.
      * @param number A numeric value.
      */
    isSafeInteger(number: number): boolean;

    /**
      * The value of the largest integer n such that n and n + 1 are both exactly representable as
      * a Number value.
      * The value of Number.MAX_SAFE_INTEGER is 9007199254740991 2^53 − 1.
      */
    readonly MAX_SAFE_INTEGER: number;

    /**
      * The value of the smallest integer n such that n and n − 1 are both exactly representable as
      * a Number value.
      * The value of Number.MIN_SAFE_INTEGER is −9007199254740991 (−(2^53 − 1)).
      */
    readonly MIN_SAFE_INTEGER: number;

    /**
      * Converts a string to a floating-point number.
      * @param string A string that contains a floating-point number.
      */
    parseFloat(string: string): number;

    /**
      * Converts A string to an integer.
      * @param s A string to convert into a number.
      * @param radix A value between 2 and 36 that specifies the base of the number in numString.
      * If this argument is not supplied, strings with a prefix of '0x' are considered hexadecimal.
      * All other strings are considered decimal.
      */
    parseInt(string: string, radix?: number): number;
}

interface Object {
    /**
      * Determines whether an object has a property with the specified name.
      * @param v A property name.
      */
    hasOwnProperty(v: PropertyKey): boolean

    /**
      * Determines whether a specified property is enumerable.
      * @param v A property name.
      */
    propertyIsEnumerable(v: PropertyKey): boolean;
}

interface ObjectConstructor {
    /**
      * Copy the values of all of the enumerable own properties from one or more source objects to a
      * target object. Returns the target object.
      * @param target The target object to copy to.
      * @param source The source object from which to copy properties.
      */
    assign<T, U>(target: T, source: U): T & U;

    /**
      * Copy the values of all of the enumerable own properties from one or more source objects to a
      * target object. Returns the target object.
      * @param target The target object to copy to.
      * @param source1 The first source object from which to copy properties.
      * @param source2 The second source object from which to copy properties.
      */
    assign<T, U, V>(target: T, source1: U, source2: V): T & U & V;

    /**
      * Copy the values of all of the enumerable own properties from one or more source objects to a
      * target object. Returns the target object.
      * @param target The target object to copy to.
      * @param source1 The first source object from which to copy properties.
      * @param source2 The second source object from which to copy properties.
      * @param source3 The third source object from which to copy properties.
      */
    assign<T, U, V, W>(target: T, source1: U, source2: V, source3: W): T & U & V & W;

    /**
      * Copy the values of all of the enumerable own properties from one or more source objects to a
      * target object. Returns the target object.
      * @param target The target object to copy to.
      * @param sources One or more source objects from which to copy properties
      */
    assign(target: any, ...sources: any[]): any;

    /**
      * Returns an array of all symbol properties found directly on object o.
      * @param o Object to retrieve the symbols from.
      */
    getOwnPropertySymbols(o: any): symbol[];

    /**
      * Returns true if the values are the same value, false otherwise.
      * @param value1 The first value.
      * @param value2 The second value.
      */
    is(value1: any, value2: any): boolean;

    /**
      * Sets the prototype of a specified object o to  object proto or null. Returns the object o.
      * @param o The object to change its prototype.
      * @param proto The value of the new prototype or null.
      */
    setPrototypeOf(o: any, proto: any): any;

    /**
      * Gets the own property descriptor of the specified object.
      * An own property descriptor is one that is defined directly on the object and is not
      * inherited from the object's prototype.
      * @param o Object that contains the property.
      * @param p Name of the property.
    */
    getOwnPropertyDescriptor(o: any, propertyKey: PropertyKey): PropertyDescriptor;

    /**
      * Adds a property to an object, or modifies attributes of an existing property.
      * @param o Object on which to add or modify the property. This can be a native JavaScript
      * object (that is, a user-defined object or a built in object) or a DOM object.
      * @param p The property name.
      * @param attributes Descriptor for the property. It can be for a data property or an accessor
      *  property.
      */
    defineProperty(o: any, propertyKey: PropertyKey, attributes: PropertyDescriptor): any;
}

interface ReadonlyArray<T> {
  /**
    * Returns the value of the first element in the array where predicate is true, and undefined
    * otherwise.
    * @param predicate find calls predicate once for each element of the array, in ascending
    * order, until it finds one where predicate returns true. If such an element is found, find
    * immediately returns that element value. Otherwise, find returns undefined.
    * @param thisArg If provided, it will be used as the this value for each invocation of
    * predicate. If it is not provided, undefined is used instead.
    */
  find(predicate: (value: T, index: number, obj: ReadonlyArray<T>) => boolean, thisArg?: any): T | undefined;

  /**
    * Returns the index of the first element in the array where predicate is true, and undefined
    * otherwise.
    * @param predicate find calls predicate once for each element of the array, in ascending
    * order, until it finds one where predicate returns true. If such an element is found,
    * findIndex immediately returns that element index. Otherwise, findIndex returns -1.
    * @param thisArg If provided, it will be used as the this value for each invocation of
    * predicate. If it is not provided, undefined is used instead.
    */
  findIndex(predicate: (value: T) => boolean, thisArg?: any): number;
}

interface RegExp {
    /**
      * Returns a string indicating the flags of the regular expression in question. This field is read-only.
      * The characters in this string are sequenced and concatenated in the following order:
      *
      *    - "g" for global
      *    - "i" for ignoreCase
      *    - "m" for multiline
      *    - "u" for unicode
      *    - "y" for sticky
      *
      * If no flags are set, the value is the empty string.
      */
    readonly flags: string;

    /**
      * Returns a Boolean value indicating the state of the sticky flag (y) used with a regular
      * expression. Default is false. Read-only.
      */
    readonly sticky: boolean;

    /**
      * Returns a Boolean value indicating the state of the Unicode flag (u) used with a regular
      * expression. Default is false. Read-only.
      */
    readonly unicode: boolean;
}

interface RegExpConstructor {
    new (pattern: RegExp, flags?: string): RegExp;
    (pattern: RegExp, flags?: string): RegExp;
}

interface String {
    /**
      * Returns a nonnegative integer Number less than 1114112 (0x110000) that is the code point
      * value of the UTF-16 encoded code point starting at the string element at position pos in
      * the String resulting from converting this object to a String.
      * If there is no element at that position, the result is undefined.
      * If a valid UTF-16 surrogate pair does not begin at pos, the result is the code unit at pos.
      */
    codePointAt(pos: number): number | undefined;

    /**
      * Returns true if searchString appears as a substring of the result of converting this
      * object to a String, at one or more positions that are
      * greater than or equal to position; otherwise, returns false.
      * @param searchString search string
      * @param position If position is undefined, 0 is assumed, so as to search all of the String.
      */
    includes(searchString: string, position?: number): boolean;

    /**
      * Returns true if the sequence of elements of searchString converted to a String is the
      * same as the corresponding elements of this object (converted to a String) starting at
      * endPosition – length(this). Otherwise returns false.
      */
    endsWith(searchString: string, endPosition?: number): boolean;

    /**
      * Returns the String value result of normalizing the string into the normalization form
      * named by form as specified in Unicode Standard Annex #15, Unicode Normalization Forms.
      * @param form Applicable values: "NFC", "NFD", "NFKC", or "NFKD", If not specified default
      * is "NFC"
      */
    normalize(form: "NFC" | "NFD" | "NFKC" | "NFKD"): string;

    /**
      * Returns the String value result of normalizing the string into the normalization form
      * named by form as specified in Unicode Standard Annex #15, Unicode Normalization Forms.
      * @param form Applicable values: "NFC", "NFD", "NFKC", or "NFKD", If not specified default
      * is "NFC"
      */
    normalize(form?: string): string;

    /**
      * Returns a String value that is made from count copies appended together. If count is 0,
      * T is the empty String is returned.
      * @param count number of copies to append
      */
    repeat(count: number): string;

    /**
      * Returns true if the sequence of elements of searchString converted to a String is the
      * same as the corresponding elements of this object (converted to a String) starting at
      * position. Otherwise returns false.
      */
    startsWith(searchString: string, position?: number): boolean;

    /**
      * Returns an <a> HTML anchor element and sets the name attribute to the text value
      * @param name
      */
    anchor(name: string): string;

    /** Returns a <big> HTML element */
    big(): string;

    /** Returns a <blink> HTML element */
    blink(): string;

    /** Returns a <b> HTML element */
    bold(): string;

    /** Returns a <tt> HTML element */
    fixed(): string

    /** Returns a <font> HTML element and sets the color attribute value */
    fontcolor(color: string): string

    /** Returns a <font> HTML element and sets the size attribute value */
    fontsize(size: number): string;

    /** Returns a <font> HTML element and sets the size attribute value */
    fontsize(size: string): string;

    /** Returns an <i> HTML element */
    italics(): string;

    /** Returns an <a> HTML element and sets the href attribute value */
    link(url: string): string;

    /** Returns a <small> HTML element */
    small(): string;

    /** Returns a <strike> HTML element */
    strike(): string;

    /** Returns a <sub> HTML element */
    sub(): string;

    /** Returns a <sup> HTML element */
    sup(): string;
}

interface StringConstructor {
    /**
      * Return the String value whose elements are, in order, the elements in the List elements.
      * If length is 0, the empty string is returned.
      */
    fromCodePoint(...codePoints: number[]): string;

    /**
      * String.raw is intended for use as a tag function of a Tagged Template String. When called
      * as such the first argument will be a well formed template call site object and the rest
      * parameter will contain the substitution values.
      * @param template A well-formed template string call site representation.
      * @param substitutions A set of substitution values.
      */
    raw(template: TemplateStringsArray, ...substitutions: any[]): string;
}
interface Map<K, V> {
    clear(): void;
    delete(key: K): boolean;
    forEach(callbackfn: (value: V, index: K, map: Map<K, V>) => void, thisArg?: any): void;
    get(key: K): V | undefined;
    has(key: K): boolean;
    set(key: K, value?: V): this;
    readonly size: number;
}

interface MapConstructor {
    new (): Map<any, any>;
    new <K, V>(entries?: [K, V][]): Map<K, V>;
    readonly prototype: Map<any, any>;
}
declare var Map: MapConstructor;

interface WeakMap<K, V> {
    delete(key: K): boolean;
    get(key: K): V | undefined;
    has(key: K): boolean;
    set(key: K, value?: V): this;
}

interface WeakMapConstructor {
    new (): WeakMap<any, any>;
    new <K, V>(entries?: [K, V][]): WeakMap<K, V>;
    readonly prototype: WeakMap<any, any>;
}
declare var WeakMap: WeakMapConstructor;

interface Set<T> {
    add(value: T): this;
    clear(): void;
    delete(value: T): boolean;
    forEach(callbackfn: (value: T, index: T, set: Set<T>) => void, thisArg?: any): void;
    has(value: T): boolean;
    readonly size: number;
}

interface SetConstructor {
    new (): Set<any>;
    new <T>(values?: T[]): Set<T>;
    readonly prototype: Set<any>;
}
declare var Set: SetConstructor;

interface WeakSet<T> {
    add(value: T): this;
    delete(value: T): boolean;
    has(value: T): boolean;
}

interface WeakSetConstructor {
    new (): WeakSet<any>;
    new <T>(values?: T[]): WeakSet<T>;
    readonly prototype: WeakSet<any>;
}
declare var WeakSet: WeakSetConstructor;
interface GeneratorFunction extends Function { }

interface GeneratorFunctionConstructor {
    /**
      * Creates a new Generator function.
      * @param args A list of arguments the function accepts.
      */
    new (...args: string[]): GeneratorFunction;
    (...args: string[]): GeneratorFunction;
    readonly prototype: GeneratorFunction;
}
declare var GeneratorFunction: GeneratorFunctionConstructor;
/// <reference path="lib.es2015.symbol.d.ts" />

interface SymbolConstructor {
    /**
      * A method that returns the default iterator for an object. Called by the semantics of the
      * for-of statement.
      */
    readonly iterator: symbol;
}

interface IteratorResult<T> {
    done: boolean;
    value: T;
}

interface Iterator<T> {
    next(value?: any): IteratorResult<T>;
    return?(value?: any): IteratorResult<T>;
    throw?(e?: any): IteratorResult<T>;
}

interface Iterable<T> {
    [Symbol.iterator](): Iterator<T>;
}

interface IterableIterator<T> extends Iterator<T> {
    [Symbol.iterator](): IterableIterator<T>;
}

interface Array<T> {
    /** Iterator */
    [Symbol.iterator](): IterableIterator<T>;

    /**
      * Returns an array of key, value pairs for every entry in the array
      */
    entries(): IterableIterator<[number, T]>;

    /**
      * Returns an list of keys in the array
      */
    keys(): IterableIterator<number>;

    /**
      * Returns an list of values in the array
      */
    values(): IterableIterator<T>;
}

interface ArrayConstructor {
    /**
      * Creates an array from an iterable object.
      * @param iterable An iterable object to convert to an array.
      * @param mapfn A mapping function to call on every element of the array.
      * @param thisArg Value of 'this' used to invoke the mapfn.
      */
    from<T, U>(iterable: Iterable<T>, mapfn: (v: T, k: number) => U, thisArg?: any): Array<U>;

    /**
      * Creates an array from an iterable object.
      * @param iterable An iterable object to convert to an array.
      */
    from<T>(iterable: Iterable<T>): Array<T>;
}

interface ReadonlyArray<T> {
    /** Iterator */
    [Symbol.iterator](): IterableIterator<T>;

    /**
      * Returns an array of key, value pairs for every entry in the array
      */
    entries(): IterableIterator<[number, T]>;

    /**
      * Returns an list of keys in the array
      */
    keys(): IterableIterator<number>;

    /**
      * Returns an list of values in the array
      */
    values(): IterableIterator<T>;
}

interface IArguments {
    /** Iterator */
    [Symbol.iterator](): IterableIterator<any>;
}

interface Map<K, V> {
    [Symbol.iterator](): IterableIterator<[K,V]>;
    entries(): IterableIterator<[K, V]>;
    keys(): IterableIterator<K>;
    values(): IterableIterator<V>;
}

interface MapConstructor {
    new <K, V>(iterable: Iterable<[K, V]>): Map<K, V>;
}

interface WeakMap<K, V> { }

interface WeakMapConstructor {
    new <K, V>(iterable: Iterable<[K, V]>): WeakMap<K, V>;
}

interface Set<T> {
    [Symbol.iterator](): IterableIterator<T>;
    entries(): IterableIterator<[T, T]>;
    keys(): IterableIterator<T>;
    values(): IterableIterator<T>;
}

interface SetConstructor {
    new <T>(iterable: Iterable<T>): Set<T>;
}

interface WeakSet<T> { }

interface WeakSetConstructor {
    new <T>(iterable: Iterable<T>): WeakSet<T>;
}

interface Promise<T> { }

interface PromiseConstructor {
    /**
     * Creates a Promise that is resolved with an array of results when all of the provided Promises
     * resolve, or rejected when any Promise is rejected.
     * @param values An array of Promises.
     * @returns A new Promise.
     */
    all<TAll>(values: Iterable<TAll | PromiseLike<TAll>>): Promise<TAll[]>;

    /**
     * Creates a Promise that is resolved or rejected when any of the provided Promises are resolved
     * or rejected.
     * @param values An array of Promises.
     * @returns A new Promise.
     */
    race<T>(values: Iterable<T | PromiseLike<T>>): Promise<T>;
}

declare namespace Reflect {
    function enumerate(target: any): IterableIterator<any>;
}

interface String {
    /** Iterator */
    [Symbol.iterator](): IterableIterator<string>;
}

/**
  * A typed array of 8-bit integer values. The contents are initialized to 0. If the requested
  * number of bytes could not be allocated an exception is raised.
  */
interface Int8Array {
    [Symbol.iterator](): IterableIterator<number>;
    /**
      * Returns an array of key, value pairs for every entry in the array
      */
    entries(): IterableIterator<[number, number]>;
    /**
      * Returns an list of keys in the array
      */
    keys(): IterableIterator<number>;
    /**
      * Returns an list of values in the array
      */
    values(): IterableIterator<number>;
}

interface Int8ArrayConstructor {
    new (elements: Iterable<number>): Int8Array;

    /**
      * Creates an array from an array-like or iterable object.
      * @param arrayLike An array-like or iterable object to convert to an array.
      * @param mapfn A mapping function to call on every element of the array.
      * @param thisArg Value of 'this' used to invoke the mapfn.
      */
    from(arrayLike: Iterable<number>, mapfn?: (v: number, k: number) => number, thisArg?: any): Int8Array;
}

/**
  * A typed array of 8-bit unsigned integer values. The contents are initialized to 0. If the
  * requested number of bytes could not be allocated an exception is raised.
  */
interface Uint8Array {
    [Symbol.iterator](): IterableIterator<number>;
    /**
      * Returns an array of key, value pairs for every entry in the array
      */
    entries(): IterableIterator<[number, number]>;
    /**
      * Returns an list of keys in the array
      */
    keys(): IterableIterator<number>;
    /**
      * Returns an list of values in the array
      */
    values(): IterableIterator<number>;
}

interface Uint8ArrayConstructor {
    new (elements: Iterable<number>): Uint8Array;

    /**
      * Creates an array from an array-like or iterable object.
      * @param arrayLike An array-like or iterable object to convert to an array.
      * @param mapfn A mapping function to call on every element of the array.
      * @param thisArg Value of 'this' used to invoke the mapfn.
      */
    from(arrayLike: Iterable<number>, mapfn?: (v: number, k: number) => number, thisArg?: any): Uint8Array;
}

/**
  * A typed array of 8-bit unsigned integer (clamped) values. The contents are initialized to 0.
  * If the requested number of bytes could not be allocated an exception is raised.
  */
interface Uint8ClampedArray {
    [Symbol.iterator](): IterableIterator<number>;
    /**
      * Returns an array of key, value pairs for every entry in the array
      */
    entries(): IterableIterator<[number, number]>;

    /**
      * Returns an list of keys in the array
      */
    keys(): IterableIterator<number>;

    /**
      * Returns an list of values in the array
      */
    values(): IterableIterator<number>;
}

interface Uint8ClampedArrayConstructor {
    new (elements: Iterable<number>): Uint8ClampedArray;


    /**
      * Creates an array from an array-like or iterable object.
      * @param arrayLike An array-like or iterable object to convert to an array.
      * @param mapfn A mapping function to call on every element of the array.
      * @param thisArg Value of 'this' used to invoke the mapfn.
      */
    from(arrayLike: Iterable<number>, mapfn?: (v: number, k: number) => number, thisArg?: any): Uint8ClampedArray;
}

/**
  * A typed array of 16-bit signed integer values. The contents are initialized to 0. If the
  * requested number of bytes could not be allocated an exception is raised.
  */
interface Int16Array {
    [Symbol.iterator](): IterableIterator<number>;
    /**
      * Returns an array of key, value pairs for every entry in the array
      */
    entries(): IterableIterator<[number, number]>;

    /**
      * Returns an list of keys in the array
      */
    keys(): IterableIterator<number>;

    /**
      * Returns an list of values in the array
      */
    values(): IterableIterator<number>;
}

interface Int16ArrayConstructor {
    new (elements: Iterable<number>): Int16Array;

    /**
      * Creates an array from an array-like or iterable object.
      * @param arrayLike An array-like or iterable object to convert to an array.
      * @param mapfn A mapping function to call on every element of the array.
      * @param thisArg Value of 'this' used to invoke the mapfn.
      */
    from(arrayLike: Iterable<number>, mapfn?: (v: number, k: number) => number, thisArg?: any): Int16Array;
}

/**
  * A typed array of 16-bit unsigned integer values. The contents are initialized to 0. If the
  * requested number of bytes could not be allocated an exception is raised.
  */
interface Uint16Array {
    [Symbol.iterator](): IterableIterator<number>;
    /**
      * Returns an array of key, value pairs for every entry in the array
      */
    entries(): IterableIterator<[number, number]>;
    /**
      * Returns an list of keys in the array
      */
    keys(): IterableIterator<number>;
    /**
      * Returns an list of values in the array
      */
    values(): IterableIterator<number>;
}

interface Uint16ArrayConstructor {
    new (elements: Iterable<number>): Uint16Array;

    /**
      * Creates an array from an array-like or iterable object.
      * @param arrayLike An array-like or iterable object to convert to an array.
      * @param mapfn A mapping function to call on every element of the array.
      * @param thisArg Value of 'this' used to invoke the mapfn.
      */
    from(arrayLike: Iterable<number>, mapfn?: (v: number, k: number) => number, thisArg?: any): Uint16Array;
}

/**
  * A typed array of 32-bit signed integer values. The contents are initialized to 0. If the
  * requested number of bytes could not be allocated an exception is raised.
  */
interface Int32Array {
    [Symbol.iterator](): IterableIterator<number>;
    /**
      * Returns an array of key, value pairs for every entry in the array
      */
    entries(): IterableIterator<[number, number]>;
    /**
      * Returns an list of keys in the array
      */
    keys(): IterableIterator<number>;
    /**
      * Returns an list of values in the array
      */
    values(): IterableIterator<number>;
}

interface Int32ArrayConstructor {
    new (elements: Iterable<number>): Int32Array;

    /**
      * Creates an array from an array-like or iterable object.
      * @param arrayLike An array-like or iterable object to convert to an array.
      * @param mapfn A mapping function to call on every element of the array.
      * @param thisArg Value of 'this' used to invoke the mapfn.
      */
    from(arrayLike: Iterable<number>, mapfn?: (v: number, k: number) => number, thisArg?: any): Int32Array;
}

/**
  * A typed array of 32-bit unsigned integer values. The contents are initialized to 0. If the
  * requested number of bytes could not be allocated an exception is raised.
  */
interface Uint32Array {
    [Symbol.iterator](): IterableIterator<number>;
    /**
      * Returns an array of key, value pairs for every entry in the array
      */
    entries(): IterableIterator<[number, number]>;
    /**
      * Returns an list of keys in the array
      */
    keys(): IterableIterator<number>;
    /**
      * Returns an list of values in the array
      */
    values(): IterableIterator<number>;
}

interface Uint32ArrayConstructor {
    new (elements: Iterable<number>): Uint32Array;

    /**
      * Creates an array from an array-like or iterable object.
      * @param arrayLike An array-like or iterable object to convert to an array.
      * @param mapfn A mapping function to call on every element of the array.
      * @param thisArg Value of 'this' used to invoke the mapfn.
      */
    from(arrayLike: Iterable<number>, mapfn?: (v: number, k: number) => number, thisArg?: any): Uint32Array;
}

/**
  * A typed array of 32-bit float values. The contents are initialized to 0. If the requested number
  * of bytes could not be allocated an exception is raised.
  */
interface Float32Array {
    [Symbol.iterator](): IterableIterator<number>;
    /**
      * Returns an array of key, value pairs for every entry in the array
      */
    entries(): IterableIterator<[number, number]>;
    /**
      * Returns an list of keys in the array
      */
    keys(): IterableIterator<number>;
    /**
      * Returns an list of values in the array
      */
    values(): IterableIterator<number>;
}

interface Float32ArrayConstructor {
    new (elements: Iterable<number>): Float32Array;

    /**
      * Creates an array from an array-like or iterable object.
      * @param arrayLike An array-like or iterable object to convert to an array.
      * @param mapfn A mapping function to call on every element of the array.
      * @param thisArg Value of 'this' used to invoke the mapfn.
      */
    from(arrayLike: Iterable<number>, mapfn?: (v: number, k: number) => number, thisArg?: any): Float32Array;
}

/**
  * A typed array of 64-bit float values. The contents are initialized to 0. If the requested
  * number of bytes could not be allocated an exception is raised.
  */
interface Float64Array {
    [Symbol.iterator](): IterableIterator<number>;
    /**
      * Returns an array of key, value pairs for every entry in the array
      */
    entries(): IterableIterator<[number, number]>;
    /**
      * Returns an list of keys in the array
      */
    keys(): IterableIterator<number>;
    /**
      * Returns an list of values in the array
      */
    values(): IterableIterator<number>;
}

interface Float64ArrayConstructor {
    new (elements: Iterable<number>): Float64Array;

    /**
      * Creates an array from an array-like or iterable object.
      * @param arrayLike An array-like or iterable object to convert to an array.
      * @param mapfn A mapping function to call on every element of the array.
      * @param thisArg Value of 'this' used to invoke the mapfn.
      */
    from(arrayLike: Iterable<number>, mapfn?: (v: number, k: number) => number, thisArg?: any): Float64Array;
}/**
 * Represents the completion of an asynchronous operation
 */
interface Promise<T> {
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1, TResult2>(onfulfilled: (value: T) => TResult1 | PromiseLike<TResult1>, onrejected: (reason: any) => TResult2 | PromiseLike<TResult2>): Promise<TResult1 | TResult2>;

    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult>(onfulfilled: (value: T) => TResult | PromiseLike<TResult>, onrejected: (reason: any) => TResult | PromiseLike<TResult>): Promise<TResult>;

    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult>(onfulfilled: (value: T) => TResult | PromiseLike<TResult>): Promise<TResult>;

    /**
     * Creates a new Promise with the same internal state of this Promise.
     * @returns A Promise.
     */
    then(): Promise<T>;

    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult>(onrejected: (reason: any) => TResult | PromiseLike<TResult>): Promise<T | TResult>;

    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch(onrejected: (reason: any) => T | PromiseLike<T>): Promise<T>;
}

interface PromiseConstructor {
    /**
      * A reference to the prototype.
      */
    readonly prototype: Promise<any>;

    /**
     * Creates a new Promise.
     * @param executor A callback used to initialize the promise. This callback is passed two arguments:
     * a resolve callback used resolve the promise with a value or the result of another promise,
     * and a reject callback used to reject the promise with a provided reason or error.
     */
    new <T>(executor: (resolve: (value?: T | PromiseLike<T>) => void, reject: (reason?: any) => void) => void): Promise<T>;

    /**
     * Creates a Promise that is resolved with an array of results when all of the provided Promises
     * resolve, or rejected when any Promise is rejected.
     * @param values An array of Promises.
     * @returns A new Promise.
     */
    all<T1, T2, T3, T4, T5, T6, T7, T8, T9, T10>(values: [T1 | PromiseLike<T1>, T2 | PromiseLike<T2>, T3 | PromiseLike<T3>, T4 | PromiseLike <T4>, T5 | PromiseLike<T5>, T6 | PromiseLike<T6>, T7 | PromiseLike<T7>, T8 | PromiseLike<T8>, T9 | PromiseLike<T9>, T10 | PromiseLike<T10>]): Promise<[T1, T2, T3, T4, T5, T6, T7, T8, T9, T10]>;

    /**
     * Creates a Promise that is resolved with an array of results when all of the provided Promises
     * resolve, or rejected when any Promise is rejected.
     * @param values An array of Promises.
     * @returns A new Promise.
     */
    all<T1, T2, T3, T4, T5, T6, T7, T8, T9>(values: [T1 | PromiseLike<T1>, T2 | PromiseLike<T2>, T3 | PromiseLike<T3>, T4 | PromiseLike <T4>, T5 | PromiseLike<T5>, T6 | PromiseLike<T6>, T7 | PromiseLike<T7>, T8 | PromiseLike<T8>, T9 | PromiseLike<T9>]): Promise<[T1, T2, T3, T4, T5, T6, T7, T8, T9]>;

    /**
     * Creates a Promise that is resolved with an array of results when all of the provided Promises
     * resolve, or rejected when any Promise is rejected.
     * @param values An array of Promises.
     * @returns A new Promise.
     */
    all<T1, T2, T3, T4, T5, T6, T7, T8>(values: [T1 | PromiseLike<T1>, T2 | PromiseLike<T2>, T3 | PromiseLike<T3>, T4 | PromiseLike <T4>, T5 | PromiseLike<T5>, T6 | PromiseLike<T6>, T7 | PromiseLike<T7>, T8 | PromiseLike<T8>]): Promise<[T1, T2, T3, T4, T5, T6, T7, T8]>;

    /**
     * Creates a Promise that is resolved with an array of results when all of the provided Promises
     * resolve, or rejected when any Promise is rejected.
     * @param values An array of Promises.
     * @returns A new Promise.
     */
    all<T1, T2, T3, T4, T5, T6, T7>(values: [T1 | PromiseLike<T1>, T2 | PromiseLike<T2>, T3 | PromiseLike<T3>, T4 | PromiseLike <T4>, T5 | PromiseLike<T5>, T6 | PromiseLike<T6>, T7 | PromiseLike<T7>]): Promise<[T1, T2, T3, T4, T5, T6, T7]>;

    /**
     * Creates a Promise that is resolved with an array of results when all of the provided Promises
     * resolve, or rejected when any Promise is rejected.
     * @param values An array of Promises.
     * @returns A new Promise.
     */
    all<T1, T2, T3, T4, T5, T6>(values: [T1 | PromiseLike<T1>, T2 | PromiseLike<T2>, T3 | PromiseLike<T3>, T4 | PromiseLike <T4>, T5 | PromiseLike<T5>, T6 | PromiseLike<T6>]): Promise<[T1, T2, T3, T4, T5, T6]>;

    /**
     * Creates a Promise that is resolved with an array of results when all of the provided Promises
     * resolve, or rejected when any Promise is rejected.
     * @param values An array of Promises.
     * @returns A new Promise.
     */
    all<T1, T2, T3, T4, T5>(values: [T1 | PromiseLike<T1>, T2 | PromiseLike<T2>, T3 | PromiseLike<T3>, T4 | PromiseLike <T4>, T5 | PromiseLike<T5>]): Promise<[T1, T2, T3, T4, T5]>;

    /**
     * Creates a Promise that is resolved with an array of results when all of the provided Promises
     * resolve, or rejected when any Promise is rejected.
     * @param values An array of Promises.
     * @returns A new Promise.
     */
    all<T1, T2, T3, T4>(values: [T1 | PromiseLike<T1>, T2 | PromiseLike<T2>, T3 | PromiseLike<T3>, T4 | PromiseLike <T4>]): Promise<[T1, T2, T3, T4]>;

    /**
     * Creates a Promise that is resolved with an array of results when all of the provided Promises
     * resolve, or rejected when any Promise is rejected.
     * @param values An array of Promises.
     * @returns A new Promise.
     */
    all<T1, T2, T3>(values: [T1 | PromiseLike<T1>, T2 | PromiseLike<T2>, T3 | PromiseLike<T3>]): Promise<[T1, T2, T3]>;

    /**
     * Creates a Promise that is resolved with an array of results when all of the provided Promises
     * resolve, or rejected when any Promise is rejected.
     * @param values An array of Promises.
     * @returns A new Promise.
     */
    all<T1, T2>(values: [T1 | PromiseLike<T1>, T2 | PromiseLike<T2>]): Promise<[T1, T2]>;

    /**
     * Creates a Promise that is resolved with an array of results when all of the provided Promises
     * resolve, or rejected when any Promise is rejected.
     * @param values An array of Promises.
     * @returns A new Promise.
     */
    all<T>(values: (T | PromiseLike<T>)[]): Promise<T[]>;

    /**
     * Creates a new rejected promise for the provided reason.
     * @param reason The reason the promise was rejected.
     * @returns A new rejected Promise.
     */
    reject(reason: any): Promise<never>;

    /**
     * Creates a new rejected promise for the provided reason.
     * @param reason The reason the promise was rejected.
     * @returns A new rejected Promise.
     */
    reject<T>(reason: any): Promise<T>;

    /**
      * Creates a new resolved promise for the provided value.
      * @param value A promise.
      * @returns A promise whose internal state matches the provided promise.
      */
    resolve<T>(value: T | PromiseLike<T>): Promise<T>;

    /**
     * Creates a new resolved promise .
     * @returns A resolved promise.
     */
    resolve(): Promise<void>;
}

declare var Promise: PromiseConstructor;interface ProxyHandler<T> {
    getPrototypeOf? (target: T): any;
    setPrototypeOf? (target: T, v: any): boolean;
    isExtensible? (target: T): boolean;
    preventExtensions? (target: T): boolean;
    getOwnPropertyDescriptor? (target: T, p: PropertyKey): PropertyDescriptor;
    has? (target: T, p: PropertyKey): boolean;
    get? (target: T, p: PropertyKey, receiver: any): any;
    set? (target: T, p: PropertyKey, value: any, receiver: any): boolean;
    deleteProperty? (target: T, p: PropertyKey): boolean;
    defineProperty? (target: T, p: PropertyKey, attributes: PropertyDescriptor): boolean;
    enumerate? (target: T): PropertyKey[];
    ownKeys? (target: T): PropertyKey[];
    apply? (target: T, thisArg: any, argArray?: any): any;
    construct? (target: T, thisArg: any, argArray?: any): any;
}

interface ProxyConstructor {
    revocable<T>(target: T, handler: ProxyHandler<T>): { proxy: T; revoke: () => void; };
    new <T>(target: T, handler: ProxyHandler<T>): T
}
declare var Proxy: ProxyConstructor;declare namespace Reflect {
    function apply(target: Function, thisArgument: any, argumentsList: ArrayLike<any>): any;
    function construct(target: Function, argumentsList: ArrayLike<any>, newTarget?: any): any;
    function defineProperty(target: any, propertyKey: PropertyKey, attributes: PropertyDescriptor): boolean;
    function deleteProperty(target: any, propertyKey: PropertyKey): boolean;
    function get(target: any, propertyKey: PropertyKey, receiver?: any): any;
    function getOwnPropertyDescriptor(target: any, propertyKey: PropertyKey): PropertyDescriptor;
    function getPrototypeOf(target: any): any;
    function has(target: any, propertyKey: string): boolean;
    function has(target: any, propertyKey: symbol): boolean;
    function isExtensible(target: any): boolean;
    function ownKeys(target: any): Array<PropertyKey>;
    function preventExtensions(target: any): boolean;
    function set(target: any, propertyKey: PropertyKey, value: any, receiver?: any): boolean;
    function setPrototypeOf(target: any, proto: any): boolean;
}interface Symbol {
    /** Returns a string representation of an object. */
    toString(): string;

    /** Returns the primitive value of the specified object. */
    valueOf(): Object;
}

interface SymbolConstructor {
    /**
      * A reference to the prototype.
      */
    readonly prototype: Symbol;

    /**
      * Returns a new unique Symbol value.
      * @param  description Description of the new Symbol object.
      */
    (description?: string|number): symbol;

    /**
      * Returns a Symbol object from the global symbol registry matching the given key if found.
      * Otherwise, returns a new symbol with this key.
      * @param key key to search for.
      */
    for(key: string): symbol;

    /**
      * Returns a key from the global symbol registry matching the given Symbol if found.
      * Otherwise, returns a undefined.
      * @param sym Symbol to find the key for.
      */
    keyFor(sym: symbol): string | undefined;
}

declare var Symbol: SymbolConstructor;/// <reference path="lib.es2015.symbol.d.ts" />

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
/////////////////////////////
/// IE DOM APIs
/////////////////////////////

interface Algorithm {
    name: string;
}

interface AriaRequestEventInit extends EventInit {
    attributeName?: string;
    attributeValue?: string;
}

interface CommandEventInit extends EventInit {
    commandName?: string;
    detail?: string;
}

interface CompositionEventInit extends UIEventInit {
    data?: string;
}

interface ConfirmSiteSpecificExceptionsInformation extends ExceptionInformation {
    arrayOfDomainStrings?: string[];
}

interface ConstrainBooleanParameters {
    exact?: boolean;
    ideal?: boolean;
}

interface ConstrainDOMStringParameters {
    exact?: string | string[];
    ideal?: string | string[];
}

interface ConstrainDoubleRange extends DoubleRange {
    exact?: number;
    ideal?: number;
}

interface ConstrainLongRange extends LongRange {
    exact?: number;
    ideal?: number;
}

interface ConstrainVideoFacingModeParameters {
    exact?: string | string[];
    ideal?: string | string[];
}

interface CustomEventInit extends EventInit {
    detail?: any;
}

interface DeviceAccelerationDict {
    x?: number;
    y?: number;
    z?: number;
}

interface DeviceLightEventInit extends EventInit {
    value?: number;
}

interface DeviceRotationRateDict {
    alpha?: number;
    beta?: number;
    gamma?: number;
}

interface DoubleRange {
    max?: number;
    min?: number;
}

interface EventInit {
    bubbles?: boolean;
    cancelable?: boolean;
}

interface EventModifierInit extends UIEventInit {
    ctrlKey?: boolean;
    shiftKey?: boolean;
    altKey?: boolean;
    metaKey?: boolean;
    modifierAltGraph?: boolean;
    modifierCapsLock?: boolean;
    modifierFn?: boolean;
    modifierFnLock?: boolean;
    modifierHyper?: boolean;
    modifierNumLock?: boolean;
    modifierOS?: boolean;
    modifierScrollLock?: boolean;
    modifierSuper?: boolean;
    modifierSymbol?: boolean;
    modifierSymbolLock?: boolean;
}

interface ExceptionInformation {
    domain?: string;
}

interface FocusEventInit extends UIEventInit {
    relatedTarget?: EventTarget;
}

interface HashChangeEventInit extends EventInit {
    newURL?: string;
    oldURL?: string;
}

interface IDBIndexParameters {
    multiEntry?: boolean;
    unique?: boolean;
}

interface IDBObjectStoreParameters {
    autoIncrement?: boolean;
    keyPath?: IDBKeyPath;
}

interface KeyAlgorithm {
    name?: string;
}

interface KeyboardEventInit extends EventModifierInit {
    code?: string;
    key?: string;
    location?: number;
    repeat?: boolean;
}

interface LongRange {
    max?: number;
    min?: number;
}

interface MSAccountInfo {
    rpDisplayName?: string;
    userDisplayName?: string;
    accountName?: string;
    userId?: string;
    accountImageUri?: string;
}

interface MSAudioLocalClientEvent extends MSLocalClientEventBase {
    networkSendQualityEventRatio?: number;
    networkDelayEventRatio?: number;
    cpuInsufficientEventRatio?: number;
    deviceHalfDuplexAECEventRatio?: number;
    deviceRenderNotFunctioningEventRatio?: number;
    deviceCaptureNotFunctioningEventRatio?: number;
    deviceGlitchesEventRatio?: number;
    deviceLowSNREventRatio?: number;
    deviceLowSpeechLevelEventRatio?: number;
    deviceClippingEventRatio?: number;
    deviceEchoEventRatio?: number;
    deviceNearEndToEchoRatioEventRatio?: number;
    deviceRenderZeroVolumeEventRatio?: number;
    deviceRenderMuteEventRatio?: number;
    deviceMultipleEndpointsEventCount?: number;
    deviceHowlingEventCount?: number;
}

interface MSAudioRecvPayload extends MSPayloadBase {
    samplingRate?: number;
    signal?: MSAudioRecvSignal;
    packetReorderRatio?: number;
    packetReorderDepthAvg?: number;
    packetReorderDepthMax?: number;
    burstLossLength1?: number;
    burstLossLength2?: number;
    burstLossLength3?: number;
    burstLossLength4?: number;
    burstLossLength5?: number;
    burstLossLength6?: number;
    burstLossLength7?: number;
    burstLossLength8OrHigher?: number;
    fecRecvDistance1?: number;
    fecRecvDistance2?: number;
    fecRecvDistance3?: number;
    ratioConcealedSamplesAvg?: number;
    ratioStretchedSamplesAvg?: number;
    ratioCompressedSamplesAvg?: number;
}

interface MSAudioRecvSignal {
    initialSignalLevelRMS?: number;
    recvSignalLevelCh1?: number;
    recvNoiseLevelCh1?: number;
    renderSignalLevel?: number;
    renderNoiseLevel?: number;
    renderLoopbackSignalLevel?: number;
}

interface MSAudioSendPayload extends MSPayloadBase {
    samplingRate?: number;
    signal?: MSAudioSendSignal;
    audioFECUsed?: boolean;
    sendMutePercent?: number;
}

interface MSAudioSendSignal {
    noiseLevel?: number;
    sendSignalLevelCh1?: number;
    sendNoiseLevelCh1?: number;
}

interface MSConnectivity {
    iceType?: string;
    iceWarningFlags?: MSIceWarningFlags;
    relayAddress?: MSRelayAddress;
}

interface MSCredentialFilter {
    accept?: MSCredentialSpec[];
}

interface MSCredentialParameters {
    type?: string;
}

interface MSCredentialSpec {
    type?: string;
    id?: string;
}

interface MSDelay {
    roundTrip?: number;
    roundTripMax?: number;
}

interface MSDescription extends RTCStats {
    connectivity?: MSConnectivity;
    transport?: string;
    networkconnectivity?: MSNetworkConnectivityInfo;
    localAddr?: MSIPAddressInfo;
    remoteAddr?: MSIPAddressInfo;
    deviceDevName?: string;
    reflexiveLocalIPAddr?: MSIPAddressInfo;
}

interface MSFIDOCredentialParameters extends MSCredentialParameters {
    algorithm?: string | Algorithm;
    authenticators?: AAGUID[];
}

interface MSIPAddressInfo {
    ipAddr?: string;
    port?: number;
    manufacturerMacAddrMask?: string;
}

interface MSIceWarningFlags {
    turnTcpTimedOut?: boolean;
    turnUdpAllocateFailed?: boolean;
    turnUdpSendFailed?: boolean;
    turnTcpAllocateFailed?: boolean;
    turnTcpSendFailed?: boolean;
    udpLocalConnectivityFailed?: boolean;
    udpNatConnectivityFailed?: boolean;
    udpRelayConnectivityFailed?: boolean;
    tcpNatConnectivityFailed?: boolean;
    tcpRelayConnectivityFailed?: boolean;
    connCheckMessageIntegrityFailed?: boolean;
    allocationMessageIntegrityFailed?: boolean;
    connCheckOtherError?: boolean;
    turnAuthUnknownUsernameError?: boolean;
    noRelayServersConfigured?: boolean;
    multipleRelayServersAttempted?: boolean;
    portRangeExhausted?: boolean;
    alternateServerReceived?: boolean;
    pseudoTLSFailure?: boolean;
    turnTurnTcpConnectivityFailed?: boolean;
    useCandidateChecksFailed?: boolean;
    fipsAllocationFailure?: boolean;
}

interface MSJitter {
    interArrival?: number;
    interArrivalMax?: number;
    interArrivalSD?: number;
}

interface MSLocalClientEventBase extends RTCStats {
    networkReceiveQualityEventRatio?: number;
    networkBandwidthLowEventRatio?: number;
}

interface MSNetwork extends RTCStats {
    jitter?: MSJitter;
    delay?: MSDelay;
    packetLoss?: MSPacketLoss;
    utilization?: MSUtilization;
}

interface MSNetworkConnectivityInfo {
    vpn?: boolean;
    linkspeed?: number;
    networkConnectionDetails?: string;
}

interface MSNetworkInterfaceType {
    interfaceTypeEthernet?: boolean;
    interfaceTypeWireless?: boolean;
    interfaceTypePPP?: boolean;
    interfaceTypeTunnel?: boolean;
    interfaceTypeWWAN?: boolean;
}

interface MSOutboundNetwork extends MSNetwork {
    appliedBandwidthLimit?: number;
}

interface MSPacketLoss {
    lossRate?: number;
    lossRateMax?: number;
}

interface MSPayloadBase extends RTCStats {
    payloadDescription?: string;
}

interface MSRelayAddress {
    relayAddress?: string;
    port?: number;
}

interface MSSignatureParameters {
    userPrompt?: string;
}

interface MSTransportDiagnosticsStats extends RTCStats {
    baseAddress?: string;
    localAddress?: string;
    localSite?: string;
    networkName?: string;
    remoteAddress?: string;
    remoteSite?: string;
    localMR?: string;
    remoteMR?: string;
    iceWarningFlags?: MSIceWarningFlags;
    portRangeMin?: number;
    portRangeMax?: number;
    localMRTCPPort?: number;
    remoteMRTCPPort?: number;
    stunVer?: number;
    numConsentReqSent?: number;
    numConsentReqReceived?: number;
    numConsentRespSent?: number;
    numConsentRespReceived?: number;
    interfaces?: MSNetworkInterfaceType;
    baseInterface?: MSNetworkInterfaceType;
    protocol?: string;
    localInterface?: MSNetworkInterfaceType;
    localAddrType?: string;
    remoteAddrType?: string;
    iceRole?: string;
    rtpRtcpMux?: boolean;
    allocationTimeInMs?: number;
    msRtcEngineVersion?: string;
}

interface MSUtilization {
    packets?: number;
    bandwidthEstimation?: number;
    bandwidthEstimationMin?: number;
    bandwidthEstimationMax?: number;
    bandwidthEstimationStdDev?: number;
    bandwidthEstimationAvg?: number;
}

interface MSVideoPayload extends MSPayloadBase {
    resoluton?: string;
    videoBitRateAvg?: number;
    videoBitRateMax?: number;
    videoFrameRateAvg?: number;
    videoPacketLossRate?: number;
    durationSeconds?: number;
}

interface MSVideoRecvPayload extends MSVideoPayload {
    videoFrameLossRate?: number;
    recvCodecType?: string;
    recvResolutionWidth?: number;
    recvResolutionHeight?: number;
    videoResolutions?: MSVideoResolutionDistribution;
    recvFrameRateAverage?: number;
    recvBitRateMaximum?: number;
    recvBitRateAverage?: number;
    recvVideoStreamsMax?: number;
    recvVideoStreamsMin?: number;
    recvVideoStreamsMode?: number;
    videoPostFECPLR?: number;
    lowBitRateCallPercent?: number;
    lowFrameRateCallPercent?: number;
    reorderBufferTotalPackets?: number;
    recvReorderBufferReorderedPackets?: number;
    recvReorderBufferPacketsDroppedDueToBufferExhaustion?: number;
    recvReorderBufferMaxSuccessfullyOrderedExtent?: number;
    recvReorderBufferMaxSuccessfullyOrderedLateTime?: number;
    recvReorderBufferPacketsDroppedDueToTimeout?: number;
    recvFpsHarmonicAverage?: number;
    recvNumResSwitches?: number;
}

interface MSVideoResolutionDistribution {
    cifQuality?: number;
    vgaQuality?: number;
    h720Quality?: number;
    h1080Quality?: number;
    h1440Quality?: number;
    h2160Quality?: number;
}

interface MSVideoSendPayload extends MSVideoPayload {
    sendFrameRateAverage?: number;
    sendBitRateMaximum?: number;
    sendBitRateAverage?: number;
    sendVideoStreamsMax?: number;
    sendResolutionWidth?: number;
    sendResolutionHeight?: number;
}

interface MediaEncryptedEventInit extends EventInit {
    initDataType?: string;
    initData?: ArrayBuffer;
}

interface MediaKeyMessageEventInit extends EventInit {
    messageType?: string;
    message?: ArrayBuffer;
}

interface MediaKeySystemConfiguration {
    initDataTypes?: string[];
    audioCapabilities?: MediaKeySystemMediaCapability[];
    videoCapabilities?: MediaKeySystemMediaCapability[];
    distinctiveIdentifier?: string;
    persistentState?: string;
}

interface MediaKeySystemMediaCapability {
    contentType?: string;
    robustness?: string;
}

interface MediaStreamConstraints {
    video?: boolean | MediaTrackConstraints;
    audio?: boolean | MediaTrackConstraints;
}

interface MediaStreamErrorEventInit extends EventInit {
    error?: MediaStreamError;
}

interface MediaStreamTrackEventInit extends EventInit {
    track?: MediaStreamTrack;
}

interface MediaTrackCapabilities {
    width?: number | LongRange;
    height?: number | LongRange;
    aspectRatio?: number | DoubleRange;
    frameRate?: number | DoubleRange;
    facingMode?: string;
    volume?: number | DoubleRange;
    sampleRate?: number | LongRange;
    sampleSize?: number | LongRange;
    echoCancellation?: boolean[];
    deviceId?: string;
    groupId?: string;
}

interface MediaTrackConstraintSet {
    width?: number | ConstrainLongRange;
    height?: number | ConstrainLongRange;
    aspectRatio?: number | ConstrainDoubleRange;
    frameRate?: number | ConstrainDoubleRange;
    facingMode?: string | string[] | ConstrainDOMStringParameters;
    volume?: number | ConstrainDoubleRange;
    sampleRate?: number | ConstrainLongRange;
    sampleSize?: number | ConstrainLongRange;
    echoCancelation?: boolean | ConstrainBooleanParameters;
    deviceId?: string | string[] | ConstrainDOMStringParameters;
    groupId?: string | string[] | ConstrainDOMStringParameters;
}

interface MediaTrackConstraints extends MediaTrackConstraintSet {
    advanced?: MediaTrackConstraintSet[];
}

interface MediaTrackSettings {
    width?: number;
    height?: number;
    aspectRatio?: number;
    frameRate?: number;
    facingMode?: string;
    volume?: number;
    sampleRate?: number;
    sampleSize?: number;
    echoCancellation?: boolean;
    deviceId?: string;
    groupId?: string;
}

interface MediaTrackSupportedConstraints {
    width?: boolean;
    height?: boolean;
    aspectRatio?: boolean;
    frameRate?: boolean;
    facingMode?: boolean;
    volume?: boolean;
    sampleRate?: boolean;
    sampleSize?: boolean;
    echoCancellation?: boolean;
    deviceId?: boolean;
    groupId?: boolean;
}

interface MouseEventInit extends EventModifierInit {
    screenX?: number;
    screenY?: number;
    clientX?: number;
    clientY?: number;
    button?: number;
    buttons?: number;
    relatedTarget?: EventTarget;
}

interface MsZoomToOptions {
    contentX?: number;
    contentY?: number;
    viewportX?: string;
    viewportY?: string;
    scaleFactor?: number;
    animate?: string;
}

interface MutationObserverInit {
    childList?: boolean;
    attributes?: boolean;
    characterData?: boolean;
    subtree?: boolean;
    attributeOldValue?: boolean;
    characterDataOldValue?: boolean;
    attributeFilter?: string[];
}

interface ObjectURLOptions {
    oneTimeOnly?: boolean;
}

interface PeriodicWaveConstraints {
    disableNormalization?: boolean;
}

interface PointerEventInit extends MouseEventInit {
    pointerId?: number;
    width?: number;
    height?: number;
    pressure?: number;
    tiltX?: number;
    tiltY?: number;
    pointerType?: string;
    isPrimary?: boolean;
}

interface PositionOptions {
    enableHighAccuracy?: boolean;
    timeout?: number;
    maximumAge?: number;
}

interface RTCDTMFToneChangeEventInit extends EventInit {
    tone?: string;
}

interface RTCDtlsFingerprint {
    algorithm?: string;
    value?: string;
}

interface RTCDtlsParameters {
    role?: string;
    fingerprints?: RTCDtlsFingerprint[];
}

interface RTCIceCandidate {
    foundation?: string;
    priority?: number;
    ip?: string;
    protocol?: string;
    port?: number;
    type?: string;
    tcpType?: string;
    relatedAddress?: string;
    relatedPort?: number;
}

interface RTCIceCandidateAttributes extends RTCStats {
    ipAddress?: string;
    portNumber?: number;
    transport?: string;
    candidateType?: string;
    priority?: number;
    addressSourceUrl?: string;
}

interface RTCIceCandidateComplete {
}

interface RTCIceCandidatePair {
    local?: RTCIceCandidate;
    remote?: RTCIceCandidate;
}

interface RTCIceCandidatePairStats extends RTCStats {
    transportId?: string;
    localCandidateId?: string;
    remoteCandidateId?: string;
    state?: string;
    priority?: number;
    nominated?: boolean;
    writable?: boolean;
    readable?: boolean;
    bytesSent?: number;
    bytesReceived?: number;
    roundTripTime?: number;
    availableOutgoingBitrate?: number;
    availableIncomingBitrate?: number;
}

interface RTCIceGatherOptions {
    gatherPolicy?: string;
    iceservers?: RTCIceServer[];
}

interface RTCIceParameters {
    usernameFragment?: string;
    password?: string;
}

interface RTCIceServer {
    urls?: any;
    username?: string;
    credential?: string;
}

interface RTCInboundRTPStreamStats extends RTCRTPStreamStats {
    packetsReceived?: number;
    bytesReceived?: number;
    packetsLost?: number;
    jitter?: number;
    fractionLost?: number;
}

interface RTCMediaStreamTrackStats extends RTCStats {
    trackIdentifier?: string;
    remoteSource?: boolean;
    ssrcIds?: string[];
    frameWidth?: number;
    frameHeight?: number;
    framesPerSecond?: number;
    framesSent?: number;
    framesReceived?: number;
    framesDecoded?: number;
    framesDropped?: number;
    framesCorrupted?: number;
    audioLevel?: number;
    echoReturnLoss?: number;
    echoReturnLossEnhancement?: number;
}

interface RTCOutboundRTPStreamStats extends RTCRTPStreamStats {
    packetsSent?: number;
    bytesSent?: number;
    targetBitrate?: number;
    roundTripTime?: number;
}

interface RTCRTPStreamStats extends RTCStats {
    ssrc?: string;
    associateStatsId?: string;
    isRemote?: boolean;
    mediaTrackId?: string;
    transportId?: string;
    codecId?: string;
    firCount?: number;
    pliCount?: number;
    nackCount?: number;
    sliCount?: number;
}

interface RTCRtcpFeedback {
    type?: string;
    parameter?: string;
}

interface RTCRtcpParameters {
    ssrc?: number;
    cname?: string;
    reducedSize?: boolean;
    mux?: boolean;
}

interface RTCRtpCapabilities {
    codecs?: RTCRtpCodecCapability[];
    headerExtensions?: RTCRtpHeaderExtension[];
    fecMechanisms?: string[];
}

interface RTCRtpCodecCapability {
    name?: string;
    kind?: string;
    clockRate?: number;
    preferredPayloadType?: number;
    maxptime?: number;
    numChannels?: number;
    rtcpFeedback?: RTCRtcpFeedback[];
    parameters?: any;
    options?: any;
    maxTemporalLayers?: number;
    maxSpatialLayers?: number;
    svcMultiStreamSupport?: boolean;
}

interface RTCRtpCodecParameters {
    name?: string;
    payloadType?: any;
    clockRate?: number;
    maxptime?: number;
    numChannels?: number;
    rtcpFeedback?: RTCRtcpFeedback[];
    parameters?: any;
}

interface RTCRtpContributingSource {
    timestamp?: number;
    csrc?: number;
    audioLevel?: number;
}

interface RTCRtpEncodingParameters {
    ssrc?: number;
    codecPayloadType?: number;
    fec?: RTCRtpFecParameters;
    rtx?: RTCRtpRtxParameters;
    priority?: number;
    maxBitrate?: number;
    minQuality?: number;
    framerateBias?: number;
    resolutionScale?: number;
    framerateScale?: number;
    active?: boolean;
    encodingId?: string;
    dependencyEncodingIds?: string[];
    ssrcRange?: RTCSsrcRange;
}

interface RTCRtpFecParameters {
    ssrc?: number;
    mechanism?: string;
}

interface RTCRtpHeaderExtension {
    kind?: string;
    uri?: string;
    preferredId?: number;
    preferredEncrypt?: boolean;
}

interface RTCRtpHeaderExtensionParameters {
    uri?: string;
    id?: number;
    encrypt?: boolean;
}

interface RTCRtpParameters {
    muxId?: string;
    codecs?: RTCRtpCodecParameters[];
    headerExtensions?: RTCRtpHeaderExtensionParameters[];
    encodings?: RTCRtpEncodingParameters[];
    rtcp?: RTCRtcpParameters;
}

interface RTCRtpRtxParameters {
    ssrc?: number;
}

interface RTCRtpUnhandled {
    ssrc?: number;
    payloadType?: number;
    muxId?: string;
}

interface RTCSrtpKeyParam {
    keyMethod?: string;
    keySalt?: string;
    lifetime?: string;
    mkiValue?: number;
    mkiLength?: number;
}

interface RTCSrtpSdesParameters {
    tag?: number;
    cryptoSuite?: string;
    keyParams?: RTCSrtpKeyParam[];
    sessionParams?: string[];
}

interface RTCSsrcRange {
    min?: number;
    max?: number;
}

interface RTCStats {
    timestamp?: number;
    type?: string;
    id?: string;
    msType?: string;
}

interface RTCStatsReport {
}

interface RTCTransportStats extends RTCStats {
    bytesSent?: number;
    bytesReceived?: number;
    rtcpTransportStatsId?: string;
    activeConnection?: boolean;
    selectedCandidatePairId?: string;
    localCertificateId?: string;
    remoteCertificateId?: string;
}

interface StoreExceptionsInformation extends ExceptionInformation {
    siteName?: string;
    explanationString?: string;
    detailURI?: string;
}

interface StoreSiteSpecificExceptionsInformation extends StoreExceptionsInformation {
    arrayOfDomainStrings?: string[];
}

interface UIEventInit extends EventInit {
    view?: Window;
    detail?: number;
}

interface WebGLContextAttributes {
    failIfMajorPerformanceCaveat?: boolean;
    alpha?: boolean;
    depth?: boolean;
    stencil?: boolean;
    antialias?: boolean;
    premultipliedAlpha?: boolean;
    preserveDrawingBuffer?: boolean;
}

interface WebGLContextEventInit extends EventInit {
    statusMessage?: string;
}

interface WheelEventInit extends MouseEventInit {
    deltaX?: number;
    deltaY?: number;
    deltaZ?: number;
    deltaMode?: number;
}

interface EventListener {
    (evt: Event): void;
}

interface ANGLE_instanced_arrays {
    drawArraysInstancedANGLE(mode: number, first: number, count: number, primcount: number): void;
    drawElementsInstancedANGLE(mode: number, count: number, type: number, offset: number, primcount: number): void;
    vertexAttribDivisorANGLE(index: number, divisor: number): void;
    readonly VERTEX_ATTRIB_ARRAY_DIVISOR_ANGLE: number;
}

declare var ANGLE_instanced_arrays: {
    prototype: ANGLE_instanced_arrays;
    new(): ANGLE_instanced_arrays;
    readonly VERTEX_ATTRIB_ARRAY_DIVISOR_ANGLE: number;
}

interface AnalyserNode extends AudioNode {
    fftSize: number;
    readonly frequencyBinCount: number;
    maxDecibels: number;
    minDecibels: number;
    smoothingTimeConstant: number;
    getByteFrequencyData(array: Uint8Array): void;
    getByteTimeDomainData(array: Uint8Array): void;
    getFloatFrequencyData(array: Float32Array): void;
    getFloatTimeDomainData(array: Float32Array): void;
}

declare var AnalyserNode: {
    prototype: AnalyserNode;
    new(): AnalyserNode;
}

interface AnimationEvent extends Event {
    readonly animationName: string;
    readonly elapsedTime: number;
    initAnimationEvent(typeArg: string, canBubbleArg: boolean, cancelableArg: boolean, animationNameArg: string, elapsedTimeArg: number): void;
}

declare var AnimationEvent: {
    prototype: AnimationEvent;
    new(): AnimationEvent;
}

interface ApplicationCache extends EventTarget {
    oncached: (this: this, ev: Event) => any;
    onchecking: (this: this, ev: Event) => any;
    ondownloading: (this: this, ev: Event) => any;
    onerror: (this: this, ev: ErrorEvent) => any;
    onnoupdate: (this: this, ev: Event) => any;
    onobsolete: (this: this, ev: Event) => any;
    onprogress: (this: this, ev: ProgressEvent) => any;
    onupdateready: (this: this, ev: Event) => any;
    readonly status: number;
    abort(): void;
    swapCache(): void;
    update(): void;
    readonly CHECKING: number;
    readonly DOWNLOADING: number;
    readonly IDLE: number;
    readonly OBSOLETE: number;
    readonly UNCACHED: number;
    readonly UPDATEREADY: number;
    addEventListener(type: "cached", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "checking", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "downloading", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "error", listener: (this: this, ev: ErrorEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "noupdate", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "obsolete", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "progress", listener: (this: this, ev: ProgressEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "updateready", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var ApplicationCache: {
    prototype: ApplicationCache;
    new(): ApplicationCache;
    readonly CHECKING: number;
    readonly DOWNLOADING: number;
    readonly IDLE: number;
    readonly OBSOLETE: number;
    readonly UNCACHED: number;
    readonly UPDATEREADY: number;
}

interface AriaRequestEvent extends Event {
    readonly attributeName: string;
    attributeValue: string | null;
}

declare var AriaRequestEvent: {
    prototype: AriaRequestEvent;
    new(type: string, eventInitDict?: AriaRequestEventInit): AriaRequestEvent;
}

interface Attr extends Node {
    readonly name: string;
    readonly ownerElement: Element;
    readonly prefix: string | null;
    readonly specified: boolean;
    value: string;
}

declare var Attr: {
    prototype: Attr;
    new(): Attr;
}

interface AudioBuffer {
    readonly duration: number;
    readonly length: number;
    readonly numberOfChannels: number;
    readonly sampleRate: number;
    copyFromChannel(destination: Float32Array, channelNumber: number, startInChannel?: number): void;
    copyToChannel(source: Float32Array, channelNumber: number, startInChannel?: number): void;
    getChannelData(channel: number): Float32Array;
}

declare var AudioBuffer: {
    prototype: AudioBuffer;
    new(): AudioBuffer;
}

interface AudioBufferSourceNode extends AudioNode {
    buffer: AudioBuffer | null;
    readonly detune: AudioParam;
    loop: boolean;
    loopEnd: number;
    loopStart: number;
    onended: (this: this, ev: MediaStreamErrorEvent) => any;
    readonly playbackRate: AudioParam;
    start(when?: number, offset?: number, duration?: number): void;
    stop(when?: number): void;
    addEventListener(type: "ended", listener: (this: this, ev: MediaStreamErrorEvent) => any, useCapture?: boolean): void;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var AudioBufferSourceNode: {
    prototype: AudioBufferSourceNode;
    new(): AudioBufferSourceNode;
}

interface AudioContext extends EventTarget {
    readonly currentTime: number;
    readonly destination: AudioDestinationNode;
    readonly listener: AudioListener;
    readonly sampleRate: number;
    state: string;
    createAnalyser(): AnalyserNode;
    createBiquadFilter(): BiquadFilterNode;
    createBuffer(numberOfChannels: number, length: number, sampleRate: number): AudioBuffer;
    createBufferSource(): AudioBufferSourceNode;
    createChannelMerger(numberOfInputs?: number): ChannelMergerNode;
    createChannelSplitter(numberOfOutputs?: number): ChannelSplitterNode;
    createConvolver(): ConvolverNode;
    createDelay(maxDelayTime?: number): DelayNode;
    createDynamicsCompressor(): DynamicsCompressorNode;
    createGain(): GainNode;
    createMediaElementSource(mediaElement: HTMLMediaElement): MediaElementAudioSourceNode;
    createMediaStreamSource(mediaStream: MediaStream): MediaStreamAudioSourceNode;
    createOscillator(): OscillatorNode;
    createPanner(): PannerNode;
    createPeriodicWave(real: Float32Array, imag: Float32Array, constraints?: PeriodicWaveConstraints): PeriodicWave;
    createScriptProcessor(bufferSize?: number, numberOfInputChannels?: number, numberOfOutputChannels?: number): ScriptProcessorNode;
    createStereoPanner(): StereoPannerNode;
    createWaveShaper(): WaveShaperNode;
    decodeAudioData(audioData: ArrayBuffer, successCallback?: DecodeSuccessCallback, errorCallback?: DecodeErrorCallback): PromiseLike<AudioBuffer>;
}

declare var AudioContext: {
    prototype: AudioContext;
    new(): AudioContext;
}

interface AudioDestinationNode extends AudioNode {
    readonly maxChannelCount: number;
}

declare var AudioDestinationNode: {
    prototype: AudioDestinationNode;
    new(): AudioDestinationNode;
}

interface AudioListener {
    dopplerFactor: number;
    speedOfSound: number;
    setOrientation(x: number, y: number, z: number, xUp: number, yUp: number, zUp: number): void;
    setPosition(x: number, y: number, z: number): void;
    setVelocity(x: number, y: number, z: number): void;
}

declare var AudioListener: {
    prototype: AudioListener;
    new(): AudioListener;
}

interface AudioNode extends EventTarget {
    channelCount: number;
    channelCountMode: string;
    channelInterpretation: string;
    readonly context: AudioContext;
    readonly numberOfInputs: number;
    readonly numberOfOutputs: number;
    connect(destination: AudioNode, output?: number, input?: number): void;
    disconnect(output?: number): void;
    disconnect(destination: AudioNode, output?: number, input?: number): void;
    disconnect(destination: AudioParam, output?: number): void;
}

declare var AudioNode: {
    prototype: AudioNode;
    new(): AudioNode;
}

interface AudioParam {
    readonly defaultValue: number;
    value: number;
    cancelScheduledValues(startTime: number): void;
    exponentialRampToValueAtTime(value: number, endTime: number): void;
    linearRampToValueAtTime(value: number, endTime: number): void;
    setTargetAtTime(target: number, startTime: number, timeConstant: number): void;
    setValueAtTime(value: number, startTime: number): void;
    setValueCurveAtTime(values: Float32Array, startTime: number, duration: number): void;
}

declare var AudioParam: {
    prototype: AudioParam;
    new(): AudioParam;
}

interface AudioProcessingEvent extends Event {
    readonly inputBuffer: AudioBuffer;
    readonly outputBuffer: AudioBuffer;
    readonly playbackTime: number;
}

declare var AudioProcessingEvent: {
    prototype: AudioProcessingEvent;
    new(): AudioProcessingEvent;
}

interface AudioTrack {
    enabled: boolean;
    readonly id: string;
    kind: string;
    readonly label: string;
    language: string;
    readonly sourceBuffer: SourceBuffer;
}

declare var AudioTrack: {
    prototype: AudioTrack;
    new(): AudioTrack;
}

interface AudioTrackList extends EventTarget {
    readonly length: number;
    onaddtrack: (this: this, ev: TrackEvent) => any;
    onchange: (this: this, ev: Event) => any;
    onremovetrack: (this: this, ev: TrackEvent) => any;
    getTrackById(id: string): AudioTrack | null;
    item(index: number): AudioTrack;
    addEventListener(type: "addtrack", listener: (this: this, ev: TrackEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "change", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "removetrack", listener: (this: this, ev: TrackEvent) => any, useCapture?: boolean): void;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
    [index: number]: AudioTrack;
}

declare var AudioTrackList: {
    prototype: AudioTrackList;
    new(): AudioTrackList;
}

interface BarProp {
    readonly visible: boolean;
}

declare var BarProp: {
    prototype: BarProp;
    new(): BarProp;
}

interface BeforeUnloadEvent extends Event {
    returnValue: any;
}

declare var BeforeUnloadEvent: {
    prototype: BeforeUnloadEvent;
    new(): BeforeUnloadEvent;
}

interface BiquadFilterNode extends AudioNode {
    readonly Q: AudioParam;
    readonly detune: AudioParam;
    readonly frequency: AudioParam;
    readonly gain: AudioParam;
    type: string;
    getFrequencyResponse(frequencyHz: Float32Array, magResponse: Float32Array, phaseResponse: Float32Array): void;
}

declare var BiquadFilterNode: {
    prototype: BiquadFilterNode;
    new(): BiquadFilterNode;
}

interface Blob {
    readonly size: number;
    readonly type: string;
    msClose(): void;
    msDetachStream(): any;
    slice(start?: number, end?: number, contentType?: string): Blob;
}

declare var Blob: {
    prototype: Blob;
    new (blobParts?: any[], options?: BlobPropertyBag): Blob;
}

interface CDATASection extends Text {
}

declare var CDATASection: {
    prototype: CDATASection;
    new(): CDATASection;
}

interface CSS {
    supports(property: string, value?: string): boolean;
}
declare var CSS: CSS;

interface CSSConditionRule extends CSSGroupingRule {
    conditionText: string;
}

declare var CSSConditionRule: {
    prototype: CSSConditionRule;
    new(): CSSConditionRule;
}

interface CSSFontFaceRule extends CSSRule {
    readonly style: CSSStyleDeclaration;
}

declare var CSSFontFaceRule: {
    prototype: CSSFontFaceRule;
    new(): CSSFontFaceRule;
}

interface CSSGroupingRule extends CSSRule {
    readonly cssRules: CSSRuleList;
    deleteRule(index: number): void;
    insertRule(rule: string, index: number): number;
}

declare var CSSGroupingRule: {
    prototype: CSSGroupingRule;
    new(): CSSGroupingRule;
}

interface CSSImportRule extends CSSRule {
    readonly href: string;
    readonly media: MediaList;
    readonly styleSheet: CSSStyleSheet;
}

declare var CSSImportRule: {
    prototype: CSSImportRule;
    new(): CSSImportRule;
}

interface CSSKeyframeRule extends CSSRule {
    keyText: string;
    readonly style: CSSStyleDeclaration;
}

declare var CSSKeyframeRule: {
    prototype: CSSKeyframeRule;
    new(): CSSKeyframeRule;
}

interface CSSKeyframesRule extends CSSRule {
    readonly cssRules: CSSRuleList;
    name: string;
    appendRule(rule: string): void;
    deleteRule(rule: string): void;
    findRule(rule: string): CSSKeyframeRule;
}

declare var CSSKeyframesRule: {
    prototype: CSSKeyframesRule;
    new(): CSSKeyframesRule;
}

interface CSSMediaRule extends CSSConditionRule {
    readonly media: MediaList;
}

declare var CSSMediaRule: {
    prototype: CSSMediaRule;
    new(): CSSMediaRule;
}

interface CSSNamespaceRule extends CSSRule {
    readonly namespaceURI: string;
    readonly prefix: string;
}

declare var CSSNamespaceRule: {
    prototype: CSSNamespaceRule;
    new(): CSSNamespaceRule;
}

interface CSSPageRule extends CSSRule {
    readonly pseudoClass: string;
    readonly selector: string;
    selectorText: string;
    readonly style: CSSStyleDeclaration;
}

declare var CSSPageRule: {
    prototype: CSSPageRule;
    new(): CSSPageRule;
}

interface CSSRule {
    cssText: string;
    readonly parentRule: CSSRule;
    readonly parentStyleSheet: CSSStyleSheet;
    readonly type: number;
    readonly CHARSET_RULE: number;
    readonly FONT_FACE_RULE: number;
    readonly IMPORT_RULE: number;
    readonly KEYFRAMES_RULE: number;
    readonly KEYFRAME_RULE: number;
    readonly MEDIA_RULE: number;
    readonly NAMESPACE_RULE: number;
    readonly PAGE_RULE: number;
    readonly STYLE_RULE: number;
    readonly SUPPORTS_RULE: number;
    readonly UNKNOWN_RULE: number;
    readonly VIEWPORT_RULE: number;
}

declare var CSSRule: {
    prototype: CSSRule;
    new(): CSSRule;
    readonly CHARSET_RULE: number;
    readonly FONT_FACE_RULE: number;
    readonly IMPORT_RULE: number;
    readonly KEYFRAMES_RULE: number;
    readonly KEYFRAME_RULE: number;
    readonly MEDIA_RULE: number;
    readonly NAMESPACE_RULE: number;
    readonly PAGE_RULE: number;
    readonly STYLE_RULE: number;
    readonly SUPPORTS_RULE: number;
    readonly UNKNOWN_RULE: number;
    readonly VIEWPORT_RULE: number;
}

interface CSSRuleList {
    readonly length: number;
    item(index: number): CSSRule;
    [index: number]: CSSRule;
}

declare var CSSRuleList: {
    prototype: CSSRuleList;
    new(): CSSRuleList;
}

interface CSSStyleDeclaration {
    alignContent: string | null;
    alignItems: string | null;
    alignSelf: string | null;
    alignmentBaseline: string | null;
    animation: string | null;
    animationDelay: string | null;
    animationDirection: string | null;
    animationDuration: string | null;
    animationFillMode: string | null;
    animationIterationCount: string | null;
    animationName: string | null;
    animationPlayState: string | null;
    animationTimingFunction: string | null;
    backfaceVisibility: string | null;
    background: string | null;
    backgroundAttachment: string | null;
    backgroundClip: string | null;
    backgroundColor: string | null;
    backgroundImage: string | null;
    backgroundOrigin: string | null;
    backgroundPosition: string | null;
    backgroundPositionX: string | null;
    backgroundPositionY: string | null;
    backgroundRepeat: string | null;
    backgroundSize: string | null;
    baselineShift: string | null;
    border: string | null;
    borderBottom: string | null;
    borderBottomColor: string | null;
    borderBottomLeftRadius: string | null;
    borderBottomRightRadius: string | null;
    borderBottomStyle: string | null;
    borderBottomWidth: string | null;
    borderCollapse: string | null;
    borderColor: string | null;
    borderImage: string | null;
    borderImageOutset: string | null;
    borderImageRepeat: string | null;
    borderImageSlice: string | null;
    borderImageSource: string | null;
    borderImageWidth: string | null;
    borderLeft: string | null;
    borderLeftColor: string | null;
    borderLeftStyle: string | null;
    borderLeftWidth: string | null;
    borderRadius: string | null;
    borderRight: string | null;
    borderRightColor: string | null;
    borderRightStyle: string | null;
    borderRightWidth: string | null;
    borderSpacing: string | null;
    borderStyle: string | null;
    borderTop: string | null;
    borderTopColor: string | null;
    borderTopLeftRadius: string | null;
    borderTopRightRadius: string | null;
    borderTopStyle: string | null;
    borderTopWidth: string | null;
    borderWidth: string | null;
    bottom: string | null;
    boxShadow: string | null;
    boxSizing: string | null;
    breakAfter: string | null;
    breakBefore: string | null;
    breakInside: string | null;
    captionSide: string | null;
    clear: string | null;
    clip: string | null;
    clipPath: string | null;
    clipRule: string | null;
    color: string | null;
    colorInterpolationFilters: string | null;
    columnCount: any;
    columnFill: string | null;
    columnGap: any;
    columnRule: string | null;
    columnRuleColor: any;
    columnRuleStyle: string | null;
    columnRuleWidth: any;
    columnSpan: string | null;
    columnWidth: any;
    columns: string | null;
    content: string | null;
    counterIncrement: string | null;
    counterReset: string | null;
    cssFloat: string | null;
    cssText: string;
    cursor: string | null;
    direction: string | null;
    display: string | null;
    dominantBaseline: string | null;
    emptyCells: string | null;
    enableBackground: string | null;
    fill: string | null;
    fillOpacity: string | null;
    fillRule: string | null;
    filter: string | null;
    flex: string | null;
    flexBasis: string | null;
    flexDirection: string | null;
    flexFlow: string | null;
    flexGrow: string | null;
    flexShrink: string | null;
    flexWrap: string | null;
    floodColor: string | null;
    floodOpacity: string | null;
    font: string | null;
    fontFamily: string | null;
    fontFeatureSettings: string | null;
    fontSize: string | null;
    fontSizeAdjust: string | null;
    fontStretch: string | null;
    fontStyle: string | null;
    fontVariant: string | null;
    fontWeight: string | null;
    glyphOrientationHorizontal: string | null;
    glyphOrientationVertical: string | null;
    height: string | null;
    imeMode: string | null;
    justifyContent: string | null;
    kerning: string | null;
    left: string | null;
    readonly length: number;
    letterSpacing: string | null;
    lightingColor: string | null;
    lineHeight: string | null;
    listStyle: string | null;
    listStyleImage: string | null;
    listStylePosition: string | null;
    listStyleType: string | null;
    margin: string | null;
    marginBottom: string | null;
    marginLeft: string | null;
    marginRight: string | null;
    marginTop: string | null;
    marker: string | null;
    markerEnd: string | null;
    markerMid: string | null;
    markerStart: string | null;
    mask: string | null;
    maxHeight: string | null;
    maxWidth: string | null;
    minHeight: string | null;
    minWidth: string | null;
    msContentZoomChaining: string | null;
    msContentZoomLimit: string | null;
    msContentZoomLimitMax: any;
    msContentZoomLimitMin: any;
    msContentZoomSnap: string | null;
    msContentZoomSnapPoints: string | null;
    msContentZoomSnapType: string | null;
    msContentZooming: string | null;
    msFlowFrom: string | null;
    msFlowInto: string | null;
    msFontFeatureSettings: string | null;
    msGridColumn: any;
    msGridColumnAlign: string | null;
    msGridColumnSpan: any;
    msGridColumns: string | null;
    msGridRow: any;
    msGridRowAlign: string | null;
    msGridRowSpan: any;
    msGridRows: string | null;
    msHighContrastAdjust: string | null;
    msHyphenateLimitChars: string | null;
    msHyphenateLimitLines: any;
    msHyphenateLimitZone: any;
    msHyphens: string | null;
    msImeAlign: string | null;
    msOverflowStyle: string | null;
    msScrollChaining: string | null;
    msScrollLimit: string | null;
    msScrollLimitXMax: any;
    msScrollLimitXMin: any;
    msScrollLimitYMax: any;
    msScrollLimitYMin: any;
    msScrollRails: string | null;
    msScrollSnapPointsX: string | null;
    msScrollSnapPointsY: string | null;
    msScrollSnapType: string | null;
    msScrollSnapX: string | null;
    msScrollSnapY: string | null;
    msScrollTranslation: string | null;
    msTextCombineHorizontal: string | null;
    msTextSizeAdjust: any;
    msTouchAction: string | null;
    msTouchSelect: string | null;
    msUserSelect: string | null;
    msWrapFlow: string;
    msWrapMargin: any;
    msWrapThrough: string;
    opacity: string | null;
    order: string | null;
    orphans: string | null;
    outline: string | null;
    outlineColor: string | null;
    outlineStyle: string | null;
    outlineWidth: string | null;
    overflow: string | null;
    overflowX: string | null;
    overflowY: string | null;
    padding: string | null;
    paddingBottom: string | null;
    paddingLeft: string | null;
    paddingRight: string | null;
    paddingTop: string | null;
    pageBreakAfter: string | null;
    pageBreakBefore: string | null;
    pageBreakInside: string | null;
    readonly parentRule: CSSRule;
    perspective: string | null;
    perspectiveOrigin: string | null;
    pointerEvents: string | null;
    position: string | null;
    quotes: string | null;
    right: string | null;
    rubyAlign: string | null;
    rubyOverhang: string | null;
    rubyPosition: string | null;
    stopColor: string | null;
    stopOpacity: string | null;
    stroke: string | null;
    strokeDasharray: string | null;
    strokeDashoffset: string | null;
    strokeLinecap: string | null;
    strokeLinejoin: string | null;
    strokeMiterlimit: string | null;
    strokeOpacity: string | null;
    strokeWidth: string | null;
    tableLayout: string | null;
    textAlign: string | null;
    textAlignLast: string | null;
    textAnchor: string | null;
    textDecoration: string | null;
    textIndent: string | null;
    textJustify: string | null;
    textKashida: string | null;
    textKashidaSpace: string | null;
    textOverflow: string | null;
    textShadow: string | null;
    textTransform: string | null;
    textUnderlinePosition: string | null;
    top: string | null;
    touchAction: string | null;
    transform: string | null;
    transformOrigin: string | null;
    transformStyle: string | null;
    transition: string | null;
    transitionDelay: string | null;
    transitionDuration: string | null;
    transitionProperty: string | null;
    transitionTimingFunction: string | null;
    unicodeBidi: string | null;
    verticalAlign: string | null;
    visibility: string | null;
    webkitAlignContent: string | null;
    webkitAlignItems: string | null;
    webkitAlignSelf: string | null;
    webkitAnimation: string | null;
    webkitAnimationDelay: string | null;
    webkitAnimationDirection: string | null;
    webkitAnimationDuration: string | null;
    webkitAnimationFillMode: string | null;
    webkitAnimationIterationCount: string | null;
    webkitAnimationName: string | null;
    webkitAnimationPlayState: string | null;
    webkitAnimationTimingFunction: string | null;
    webkitAppearance: string | null;
    webkitBackfaceVisibility: string | null;
    webkitBackgroundClip: string | null;
    webkitBackgroundOrigin: string | null;
    webkitBackgroundSize: string | null;
    webkitBorderBottomLeftRadius: string | null;
    webkitBorderBottomRightRadius: string | null;
    webkitBorderImage: string | null;
    webkitBorderRadius: string | null;
    webkitBorderTopLeftRadius: string | null;
    webkitBorderTopRightRadius: string | null;
    webkitBoxAlign: string | null;
    webkitBoxDirection: string | null;
    webkitBoxFlex: string | null;
    webkitBoxOrdinalGroup: string | null;
    webkitBoxOrient: string | null;
    webkitBoxPack: string | null;
    webkitBoxSizing: string | null;
    webkitColumnBreakAfter: string | null;
    webkitColumnBreakBefore: string | null;
    webkitColumnBreakInside: string | null;
    webkitColumnCount: any;
    webkitColumnGap: any;
    webkitColumnRule: string | null;
    webkitColumnRuleColor: any;
    webkitColumnRuleStyle: string | null;
    webkitColumnRuleWidth: any;
    webkitColumnSpan: string | null;
    webkitColumnWidth: any;
    webkitColumns: string | null;
    webkitFilter: string | null;
    webkitFlex: string | null;
    webkitFlexBasis: string | null;
    webkitFlexDirection: string | null;
    webkitFlexFlow: string | null;
    webkitFlexGrow: string | null;
    webkitFlexShrink: string | null;
    webkitFlexWrap: string | null;
    webkitJustifyContent: string | null;
    webkitOrder: string | null;
    webkitPerspective: string | null;
    webkitPerspectiveOrigin: string | null;
    webkitTapHighlightColor: string | null;
    webkitTextFillColor: string | null;
    webkitTextSizeAdjust: any;
    webkitTransform: string | null;
    webkitTransformOrigin: string | null;
    webkitTransformStyle: string | null;
    webkitTransition: string | null;
    webkitTransitionDelay: string | null;
    webkitTransitionDuration: string | null;
    webkitTransitionProperty: string | null;
    webkitTransitionTimingFunction: string | null;
    webkitUserModify: string | null;
    webkitUserSelect: string | null;
    webkitWritingMode: string | null;
    whiteSpace: string | null;
    widows: string | null;
    width: string | null;
    wordBreak: string | null;
    wordSpacing: string | null;
    wordWrap: string | null;
    writingMode: string | null;
    zIndex: string | null;
    zoom: string | null;
    getPropertyPriority(propertyName: string): string;
    getPropertyValue(propertyName: string): string;
    item(index: number): string;
    removeProperty(propertyName: string): string;
    setProperty(propertyName: string, value: string | null, priority?: string): void;
    [index: number]: string;
}

declare var CSSStyleDeclaration: {
    prototype: CSSStyleDeclaration;
    new(): CSSStyleDeclaration;
}

interface CSSStyleRule extends CSSRule {
    readonly readOnly: boolean;
    selectorText: string;
    readonly style: CSSStyleDeclaration;
}

declare var CSSStyleRule: {
    prototype: CSSStyleRule;
    new(): CSSStyleRule;
}

interface CSSStyleSheet extends StyleSheet {
    readonly cssRules: CSSRuleList;
    cssText: string;
    readonly href: string;
    readonly id: string;
    readonly imports: StyleSheetList;
    readonly isAlternate: boolean;
    readonly isPrefAlternate: boolean;
    readonly ownerRule: CSSRule;
    readonly owningElement: Element;
    readonly pages: StyleSheetPageList;
    readonly readOnly: boolean;
    readonly rules: CSSRuleList;
    addImport(bstrURL: string, lIndex?: number): number;
    addPageRule(bstrSelector: string, bstrStyle: string, lIndex?: number): number;
    addRule(bstrSelector: string, bstrStyle?: string, lIndex?: number): number;
    deleteRule(index?: number): void;
    insertRule(rule: string, index?: number): number;
    removeImport(lIndex: number): void;
    removeRule(lIndex: number): void;
}

declare var CSSStyleSheet: {
    prototype: CSSStyleSheet;
    new(): CSSStyleSheet;
}

interface CSSSupportsRule extends CSSConditionRule {
}

declare var CSSSupportsRule: {
    prototype: CSSSupportsRule;
    new(): CSSSupportsRule;
}

interface CanvasGradient {
    addColorStop(offset: number, color: string): void;
}

declare var CanvasGradient: {
    prototype: CanvasGradient;
    new(): CanvasGradient;
}

interface CanvasPattern {
}

declare var CanvasPattern: {
    prototype: CanvasPattern;
    new(): CanvasPattern;
}

interface CanvasRenderingContext2D extends Object, CanvasPathMethods {
    readonly canvas: HTMLCanvasElement;
    fillStyle: string | CanvasGradient | CanvasPattern;
    font: string;
    globalAlpha: number;
    globalCompositeOperation: string;
    lineCap: string;
    lineDashOffset: number;
    lineJoin: string;
    lineWidth: number;
    miterLimit: number;
    msFillRule: string;
    msImageSmoothingEnabled: boolean;
    shadowBlur: number;
    shadowColor: string;
    shadowOffsetX: number;
    shadowOffsetY: number;
    strokeStyle: string | CanvasGradient | CanvasPattern;
    textAlign: string;
    textBaseline: string;
    mozImageSmoothingEnabled: boolean;
    webkitImageSmoothingEnabled: boolean;
    oImageSmoothingEnabled: boolean;
    beginPath(): void;
    clearRect(x: number, y: number, w: number, h: number): void;
    clip(fillRule?: string): void;
    createImageData(imageDataOrSw: number | ImageData, sh?: number): ImageData;
    createLinearGradient(x0: number, y0: number, x1: number, y1: number): CanvasGradient;
    createPattern(image: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement, repetition: string): CanvasPattern;
    createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): CanvasGradient;
    drawImage(image: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement, offsetX: number, offsetY: number, width?: number, height?: number, canvasOffsetX?: number, canvasOffsetY?: number, canvasImageWidth?: number, canvasImageHeight?: number): void;
    fill(fillRule?: string): void;
    fillRect(x: number, y: number, w: number, h: number): void;
    fillText(text: string, x: number, y: number, maxWidth?: number): void;
    getImageData(sx: number, sy: number, sw: number, sh: number): ImageData;
    getLineDash(): number[];
    isPointInPath(x: number, y: number, fillRule?: string): boolean;
    measureText(text: string): TextMetrics;
    putImageData(imagedata: ImageData, dx: number, dy: number, dirtyX?: number, dirtyY?: number, dirtyWidth?: number, dirtyHeight?: number): void;
    restore(): void;
    rotate(angle: number): void;
    save(): void;
    scale(x: number, y: number): void;
    setLineDash(segments: number[]): void;
    setTransform(m11: number, m12: number, m21: number, m22: number, dx: number, dy: number): void;
    stroke(): void;
    strokeRect(x: number, y: number, w: number, h: number): void;
    strokeText(text: string, x: number, y: number, maxWidth?: number): void;
    transform(m11: number, m12: number, m21: number, m22: number, dx: number, dy: number): void;
    translate(x: number, y: number): void;
}

declare var CanvasRenderingContext2D: {
    prototype: CanvasRenderingContext2D;
    new(): CanvasRenderingContext2D;
}

interface ChannelMergerNode extends AudioNode {
}

declare var ChannelMergerNode: {
    prototype: ChannelMergerNode;
    new(): ChannelMergerNode;
}

interface ChannelSplitterNode extends AudioNode {
}

declare var ChannelSplitterNode: {
    prototype: ChannelSplitterNode;
    new(): ChannelSplitterNode;
}

interface CharacterData extends Node, ChildNode {
    data: string;
    readonly length: number;
    appendData(arg: string): void;
    deleteData(offset: number, count: number): void;
    insertData(offset: number, arg: string): void;
    replaceData(offset: number, count: number, arg: string): void;
    substringData(offset: number, count: number): string;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var CharacterData: {
    prototype: CharacterData;
    new(): CharacterData;
}

interface ClientRect {
    bottom: number;
    readonly height: number;
    left: number;
    right: number;
    top: number;
    readonly width: number;
}

declare var ClientRect: {
    prototype: ClientRect;
    new(): ClientRect;
}

interface ClientRectList {
    readonly length: number;
    item(index: number): ClientRect;
    [index: number]: ClientRect;
}

declare var ClientRectList: {
    prototype: ClientRectList;
    new(): ClientRectList;
}

interface ClipboardEvent extends Event {
    readonly clipboardData: DataTransfer;
}

declare var ClipboardEvent: {
    prototype: ClipboardEvent;
    new(type: string, eventInitDict?: ClipboardEventInit): ClipboardEvent;
}

interface CloseEvent extends Event {
    readonly code: number;
    readonly reason: string;
    readonly wasClean: boolean;
    initCloseEvent(typeArg: string, canBubbleArg: boolean, cancelableArg: boolean, wasCleanArg: boolean, codeArg: number, reasonArg: string): void;
}

declare var CloseEvent: {
    prototype: CloseEvent;
    new(): CloseEvent;
}

interface CommandEvent extends Event {
    readonly commandName: string;
    readonly detail: string | null;
}

declare var CommandEvent: {
    prototype: CommandEvent;
    new(type: string, eventInitDict?: CommandEventInit): CommandEvent;
}

interface Comment extends CharacterData {
    text: string;
}

declare var Comment: {
    prototype: Comment;
    new(): Comment;
}

interface CompositionEvent extends UIEvent {
    readonly data: string;
    readonly locale: string;
    initCompositionEvent(typeArg: string, canBubbleArg: boolean, cancelableArg: boolean, viewArg: Window, dataArg: string, locale: string): void;
}

declare var CompositionEvent: {
    prototype: CompositionEvent;
    new(typeArg: string, eventInitDict?: CompositionEventInit): CompositionEvent;
}

interface Console {
    assert(test?: boolean, message?: string, ...optionalParams: any[]): void;
    clear(): void;
    count(countTitle?: string): void;
    debug(message?: string, ...optionalParams: any[]): void;
    dir(value?: any, ...optionalParams: any[]): void;
    dirxml(value: any): void;
    error(message?: any, ...optionalParams: any[]): void;
    exception(message?: string, ...optionalParams: any[]): void;
    group(groupTitle?: string): void;
    groupCollapsed(groupTitle?: string): void;
    groupEnd(): void;
    info(message?: any, ...optionalParams: any[]): void;
    log(message?: any, ...optionalParams: any[]): void;
    msIsIndependentlyComposed(element: Element): boolean;
    profile(reportName?: string): void;
    profileEnd(): void;
    select(element: Element): void;
    table(...data: any[]): void;
    time(timerName?: string): void;
    timeEnd(timerName?: string): void;
    trace(message?: any, ...optionalParams: any[]): void;
    warn(message?: any, ...optionalParams: any[]): void;
}

declare var Console: {
    prototype: Console;
    new(): Console;
}

interface ConvolverNode extends AudioNode {
    buffer: AudioBuffer | null;
    normalize: boolean;
}

declare var ConvolverNode: {
    prototype: ConvolverNode;
    new(): ConvolverNode;
}

interface Coordinates {
    readonly accuracy: number;
    readonly altitude: number | null;
    readonly altitudeAccuracy: number | null;
    readonly heading: number | null;
    readonly latitude: number;
    readonly longitude: number;
    readonly speed: number | null;
}

declare var Coordinates: {
    prototype: Coordinates;
    new(): Coordinates;
}

interface Crypto extends Object, RandomSource {
    readonly subtle: SubtleCrypto;
}

declare var Crypto: {
    prototype: Crypto;
    new(): Crypto;
}

interface CryptoKey {
    readonly algorithm: KeyAlgorithm;
    readonly extractable: boolean;
    readonly type: string;
    readonly usages: string[];
}

declare var CryptoKey: {
    prototype: CryptoKey;
    new(): CryptoKey;
}

interface CryptoKeyPair {
    privateKey: CryptoKey;
    publicKey: CryptoKey;
}

declare var CryptoKeyPair: {
    prototype: CryptoKeyPair;
    new(): CryptoKeyPair;
}

interface CustomEvent extends Event {
    readonly detail: any;
    initCustomEvent(typeArg: string, canBubbleArg: boolean, cancelableArg: boolean, detailArg: any): void;
}

declare var CustomEvent: {
    prototype: CustomEvent;
    new(typeArg: string, eventInitDict?: CustomEventInit): CustomEvent;
}

interface DOMError {
    readonly name: string;
    toString(): string;
}

declare var DOMError: {
    prototype: DOMError;
    new(): DOMError;
}

interface DOMException {
    readonly code: number;
    readonly message: string;
    readonly name: string;
    toString(): string;
    readonly ABORT_ERR: number;
    readonly DATA_CLONE_ERR: number;
    readonly DOMSTRING_SIZE_ERR: number;
    readonly HIERARCHY_REQUEST_ERR: number;
    readonly INDEX_SIZE_ERR: number;
    readonly INUSE_ATTRIBUTE_ERR: number;
    readonly INVALID_ACCESS_ERR: number;
    readonly INVALID_CHARACTER_ERR: number;
    readonly INVALID_MODIFICATION_ERR: number;
    readonly INVALID_NODE_TYPE_ERR: number;
    readonly INVALID_STATE_ERR: number;
    readonly NAMESPACE_ERR: number;
    readonly NETWORK_ERR: number;
    readonly NOT_FOUND_ERR: number;
    readonly NOT_SUPPORTED_ERR: number;
    readonly NO_DATA_ALLOWED_ERR: number;
    readonly NO_MODIFICATION_ALLOWED_ERR: number;
    readonly PARSE_ERR: number;
    readonly QUOTA_EXCEEDED_ERR: number;
    readonly SECURITY_ERR: number;
    readonly SERIALIZE_ERR: number;
    readonly SYNTAX_ERR: number;
    readonly TIMEOUT_ERR: number;
    readonly TYPE_MISMATCH_ERR: number;
    readonly URL_MISMATCH_ERR: number;
    readonly VALIDATION_ERR: number;
    readonly WRONG_DOCUMENT_ERR: number;
}

declare var DOMException: {
    prototype: DOMException;
    new(): DOMException;
    readonly ABORT_ERR: number;
    readonly DATA_CLONE_ERR: number;
    readonly DOMSTRING_SIZE_ERR: number;
    readonly HIERARCHY_REQUEST_ERR: number;
    readonly INDEX_SIZE_ERR: number;
    readonly INUSE_ATTRIBUTE_ERR: number;
    readonly INVALID_ACCESS_ERR: number;
    readonly INVALID_CHARACTER_ERR: number;
    readonly INVALID_MODIFICATION_ERR: number;
    readonly INVALID_NODE_TYPE_ERR: number;
    readonly INVALID_STATE_ERR: number;
    readonly NAMESPACE_ERR: number;
    readonly NETWORK_ERR: number;
    readonly NOT_FOUND_ERR: number;
    readonly NOT_SUPPORTED_ERR: number;
    readonly NO_DATA_ALLOWED_ERR: number;
    readonly NO_MODIFICATION_ALLOWED_ERR: number;
    readonly PARSE_ERR: number;
    readonly QUOTA_EXCEEDED_ERR: number;
    readonly SECURITY_ERR: number;
    readonly SERIALIZE_ERR: number;
    readonly SYNTAX_ERR: number;
    readonly TIMEOUT_ERR: number;
    readonly TYPE_MISMATCH_ERR: number;
    readonly URL_MISMATCH_ERR: number;
    readonly VALIDATION_ERR: number;
    readonly WRONG_DOCUMENT_ERR: number;
}

interface DOMImplementation {
    createDocument(namespaceURI: string | null, qualifiedName: string | null, doctype: DocumentType): Document;
    createDocumentType(qualifiedName: string, publicId: string | null, systemId: string | null): DocumentType;
    createHTMLDocument(title: string): Document;
    hasFeature(feature: string | null, version: string | null): boolean;
}

declare var DOMImplementation: {
    prototype: DOMImplementation;
    new(): DOMImplementation;
}

interface DOMParser {
    parseFromString(source: string, mimeType: string): Document;
}

declare var DOMParser: {
    prototype: DOMParser;
    new(): DOMParser;
}

interface DOMSettableTokenList extends DOMTokenList {
    value: string;
}

declare var DOMSettableTokenList: {
    prototype: DOMSettableTokenList;
    new(): DOMSettableTokenList;
}

interface DOMStringList {
    readonly length: number;
    contains(str: string): boolean;
    item(index: number): string | null;
    [index: number]: string;
}

declare var DOMStringList: {
    prototype: DOMStringList;
    new(): DOMStringList;
}

interface DOMStringMap {
    [name: string]: string;
}

declare var DOMStringMap: {
    prototype: DOMStringMap;
    new(): DOMStringMap;
}

interface DOMTokenList {
    readonly length: number;
    add(...token: string[]): void;
    contains(token: string): boolean;
    item(index: number): string;
    remove(...token: string[]): void;
    toString(): string;
    toggle(token: string, force?: boolean): boolean;
    [index: number]: string;
}

declare var DOMTokenList: {
    prototype: DOMTokenList;
    new(): DOMTokenList;
}

interface DataCue extends TextTrackCue {
    data: ArrayBuffer;
}

declare var DataCue: {
    prototype: DataCue;
    new(): DataCue;
}

interface DataTransfer {
    dropEffect: string;
    effectAllowed: string;
    readonly files: FileList;
    readonly items: DataTransferItemList;
    readonly types: DOMStringList;
    clearData(format?: string): boolean;
    getData(format: string): string;
    setData(format: string, data: string): boolean;
}

declare var DataTransfer: {
    prototype: DataTransfer;
    new(): DataTransfer;
}

interface DataTransferItem {
    readonly kind: string;
    readonly type: string;
    getAsFile(): File | null;
    getAsString(_callback: FunctionStringCallback | null): void;
}

declare var DataTransferItem: {
    prototype: DataTransferItem;
    new(): DataTransferItem;
}

interface DataTransferItemList {
    readonly length: number;
    add(data: File): DataTransferItem | null;
    clear(): void;
    item(index: number): DataTransferItem;
    remove(index: number): void;
    [index: number]: DataTransferItem;
}

declare var DataTransferItemList: {
    prototype: DataTransferItemList;
    new(): DataTransferItemList;
}

interface DeferredPermissionRequest {
    readonly id: number;
    readonly type: string;
    readonly uri: string;
    allow(): void;
    deny(): void;
}

declare var DeferredPermissionRequest: {
    prototype: DeferredPermissionRequest;
    new(): DeferredPermissionRequest;
}

interface DelayNode extends AudioNode {
    readonly delayTime: AudioParam;
}

declare var DelayNode: {
    prototype: DelayNode;
    new(): DelayNode;
}

interface DeviceAcceleration {
    readonly x: number | null;
    readonly y: number | null;
    readonly z: number | null;
}

declare var DeviceAcceleration: {
    prototype: DeviceAcceleration;
    new(): DeviceAcceleration;
}

interface DeviceLightEvent extends Event {
    readonly value: number;
}

declare var DeviceLightEvent: {
    prototype: DeviceLightEvent;
    new(type: string, eventInitDict?: DeviceLightEventInit): DeviceLightEvent;
}

interface DeviceMotionEvent extends Event {
    readonly acceleration: DeviceAcceleration | null;
    readonly accelerationIncludingGravity: DeviceAcceleration | null;
    readonly interval: number | null;
    readonly rotationRate: DeviceRotationRate | null;
    initDeviceMotionEvent(type: string, bubbles: boolean, cancelable: boolean, acceleration: DeviceAccelerationDict | null, accelerationIncludingGravity: DeviceAccelerationDict | null, rotationRate: DeviceRotationRateDict | null, interval: number | null): void;
}

declare var DeviceMotionEvent: {
    prototype: DeviceMotionEvent;
    new(): DeviceMotionEvent;
}

interface DeviceOrientationEvent extends Event {
    readonly absolute: boolean;
    readonly alpha: number | null;
    readonly beta: number | null;
    readonly gamma: number | null;
    initDeviceOrientationEvent(type: string, bubbles: boolean, cancelable: boolean, alpha: number | null, beta: number | null, gamma: number | null, absolute: boolean): void;
}

declare var DeviceOrientationEvent: {
    prototype: DeviceOrientationEvent;
    new(): DeviceOrientationEvent;
}

interface DeviceRotationRate {
    readonly alpha: number | null;
    readonly beta: number | null;
    readonly gamma: number | null;
}

declare var DeviceRotationRate: {
    prototype: DeviceRotationRate;
    new(): DeviceRotationRate;
}

interface Document extends Node, GlobalEventHandlers, NodeSelector, DocumentEvent, ParentNode {
    /**
      * Sets or gets the URL for the current document.
      */
    readonly URL: string;
    /**
      * Gets the URL for the document, stripped of any character encoding.
      */
    readonly URLUnencoded: string;
    /**
      * Gets the object that has the focus when the parent document has focus.
      */
    readonly activeElement: Element;
    /**
      * Sets or gets the color of all active links in the document.
      */
    alinkColor: string;
    /**
      * Returns a reference to the collection of elements contained by the object.
      */
    readonly all: HTMLAllCollection;
    /**
      * Retrieves a collection of all a objects that have a name and/or id property. Objects in this collection are in HTML source order.
      */
    anchors: HTMLCollectionOf<HTMLAnchorElement>;
    /**
      * Retrieves a collection of all applet objects in the document.
      */
    applets: HTMLCollectionOf<HTMLAppletElement>;
    /**
      * Deprecated. Sets or retrieves a value that indicates the background color behind the object.
      */
    bgColor: string;
    /**
      * Specifies the beginning and end of the document body.
      */
    body: HTMLElement;
    readonly characterSet: string;
    /**
      * Gets or sets the character set used to encode the object.
      */
    charset: string;
    /**
      * Gets a value that indicates whether standards-compliant mode is switched on for the object.
      */
    readonly compatMode: string;
    cookie: string;
    readonly currentScript: HTMLScriptElement | SVGScriptElement;
    /**
      * Gets the default character set from the current regional language settings.
      */
    readonly defaultCharset: string;
    readonly defaultView: Window;
    /**
      * Sets or gets a value that indicates whether the document can be edited.
      */
    designMode: string;
    /**
      * Sets or retrieves a value that indicates the reading order of the object.
      */
    dir: string;
    /**
      * Gets an object representing the document type declaration associated with the current document.
      */
    readonly doctype: DocumentType;
    /**
      * Gets a reference to the root node of the document.
      */
    documentElement: HTMLElement;
    /**
      * Sets or gets the security domain of the document.
      */
    domain: string;
    /**
      * Retrieves a collection of all embed objects in the document.
      */
    embeds: HTMLCollectionOf<HTMLEmbedElement>;
    /**
      * Sets or gets the foreground (text) color of the document.
      */
    fgColor: string;
    /**
      * Retrieves a collection, in source order, of all form objects in the document.
      */
    forms: HTMLCollectionOf<HTMLFormElement>;
    readonly fullscreenElement: Element | null;
    readonly fullscreenEnabled: boolean;
    readonly head: HTMLHeadElement;
    readonly hidden: boolean;
    /**
      * Retrieves a collection, in source order, of img objects in the document.
      */
    images: HTMLCollectionOf<HTMLImageElement>;
    /**
      * Gets the implementation object of the current document.
      */
    readonly implementation: DOMImplementation;
    /**
      * Returns the character encoding used to create the webpage that is loaded into the document object.
      */
    readonly inputEncoding: string | null;
    /**
      * Gets the date that the page was last modified, if the page supplies one.
      */
    readonly lastModified: string;
    /**
      * Sets or gets the color of the document links.
      */
    linkColor: string;
    /**
      * Retrieves a collection of all a objects that specify the href property and all area objects in the document.
      */
    links: HTMLCollectionOf<HTMLAnchorElement | HTMLAreaElement>;
    /**
      * Contains information about the current URL.
      */
    readonly location: Location;
    msCSSOMElementFloatMetrics: boolean;
    msCapsLockWarningOff: boolean;
    /**
      * Fires when the user aborts the download.
      * @param ev The event.
      */
    onabort: (this: this, ev: UIEvent) => any;
    /**
      * Fires when the object is set as the active element.
      * @param ev The event.
      */
    onactivate: (this: this, ev: UIEvent) => any;
    /**
      * Fires immediately before the object is set as the active element.
      * @param ev The event.
      */
    onbeforeactivate: (this: this, ev: UIEvent) => any;
    /**
      * Fires immediately before the activeElement is changed from the current object to another object in the parent document.
      * @param ev The event.
      */
    onbeforedeactivate: (this: this, ev: UIEvent) => any;
    /**
      * Fires when the object loses the input focus.
      * @param ev The focus event.
      */
    onblur: (this: this, ev: FocusEvent) => any;
    /**
      * Occurs when playback is possible, but would require further buffering.
      * @param ev The event.
      */
    oncanplay: (this: this, ev: Event) => any;
    oncanplaythrough: (this: this, ev: Event) => any;
    /**
      * Fires when the contents of the object or selection have changed.
      * @param ev The event.
      */
    onchange: (this: this, ev: Event) => any;
    /**
      * Fires when the user clicks the left mouse button on the object
      * @param ev The mouse event.
      */
    onclick: (this: this, ev: MouseEvent) => any;
    /**
      * Fires when the user clicks the right mouse button in the client area, opening the context menu.
      * @param ev The mouse event.
      */
    oncontextmenu: (this: this, ev: PointerEvent) => any;
    /**
      * Fires when the user double-clicks the object.
      * @param ev The mouse event.
      */
    ondblclick: (this: this, ev: MouseEvent) => any;
    /**
      * Fires when the activeElement is changed from the current object to another object in the parent document.
      * @param ev The UI Event
      */
    ondeactivate: (this: this, ev: UIEvent) => any;
    /**
      * Fires on the source object continuously during a drag operation.
      * @param ev The event.
      */
    ondrag: (this: this, ev: DragEvent) => any;
    /**
      * Fires on the source object when the user releases the mouse at the close of a drag operation.
      * @param ev The event.
      */
    ondragend: (this: this, ev: DragEvent) => any;
    /**
      * Fires on the target element when the user drags the object to a valid drop target.
      * @param ev The drag event.
      */
    ondragenter: (this: this, ev: DragEvent) => any;
    /**
      * Fires on the target object when the user moves the mouse out of a valid drop target during a drag operation.
      * @param ev The drag event.
      */
    ondragleave: (this: this, ev: DragEvent) => any;
    /**
      * Fires on the target element continuously while the user drags the object over a valid drop target.
      * @param ev The event.
      */
    ondragover: (this: this, ev: DragEvent) => any;
    /**
      * Fires on the source object when the user starts to drag a text selection or selected object.
      * @param ev The event.
      */
    ondragstart: (this: this, ev: DragEvent) => any;
    ondrop: (this: this, ev: DragEvent) => any;
    /**
      * Occurs when the duration attribute is updated.
      * @param ev The event.
      */
    ondurationchange: (this: this, ev: Event) => any;
    /**
      * Occurs when the media element is reset to its initial state.
      * @param ev The event.
      */
    onemptied: (this: this, ev: Event) => any;
    /**
      * Occurs when the end of playback is reached.
      * @param ev The event
      */
    onended: (this: this, ev: MediaStreamErrorEvent) => any;
    /**
      * Fires when an error occurs during object loading.
      * @param ev The event.
      */
    onerror: (this: this, ev: ErrorEvent) => any;
    /**
      * Fires when the object receives focus.
      * @param ev The event.
      */
    onfocus: (this: this, ev: FocusEvent) => any;
    onfullscreenchange: (this: this, ev: Event) => any;
    onfullscreenerror: (this: this, ev: Event) => any;
    oninput: (this: this, ev: Event) => any;
    oninvalid: (this: this, ev: Event) => any;
    /**
      * Fires when the user presses a key.
      * @param ev The keyboard event
      */
    onkeydown: (this: this, ev: KeyboardEvent) => any;
    /**
      * Fires when the user presses an alphanumeric key.
      * @param ev The event.
      */
    onkeypress: (this: this, ev: KeyboardEvent) => any;
    /**
      * Fires when the user releases a key.
      * @param ev The keyboard event
      */
    onkeyup: (this: this, ev: KeyboardEvent) => any;
    /**
      * Fires immediately after the browser loads the object.
      * @param ev The event.
      */
    onload: (this: this, ev: Event) => any;
    /**
      * Occurs when media data is loaded at the current playback position.
      * @param ev The event.
      */
    onloadeddata: (this: this, ev: Event) => any;
    /**
      * Occurs when the duration and dimensions of the media have been determined.
      * @param ev The event.
      */
    onloadedmetadata: (this: this, ev: Event) => any;
    /**
      * Occurs when Internet Explorer begins looking for media data.
      * @param ev The event.
      */
    onloadstart: (this: this, ev: Event) => any;
    /**
      * Fires when the user clicks the object with either mouse button.
      * @param ev The mouse event.
      */
    onmousedown: (this: this, ev: MouseEvent) => any;
    /**
      * Fires when the user moves the mouse over the object.
      * @param ev The mouse event.
      */
    onmousemove: (this: this, ev: MouseEvent) => any;
    /**
      * Fires when the user moves the mouse pointer outside the boundaries of the object.
      * @param ev The mouse event.
      */
    onmouseout: (this: this, ev: MouseEvent) => any;
    /**
      * Fires when the user moves the mouse pointer into the object.
      * @param ev The mouse event.
      */
    onmouseover: (this: this, ev: MouseEvent) => any;
    /**
      * Fires when the user releases a mouse button while the mouse is over the object.
      * @param ev The mouse event.
      */
    onmouseup: (this: this, ev: MouseEvent) => any;
    /**
      * Fires when the wheel button is rotated.
      * @param ev The mouse event
      */
    onmousewheel: (this: this, ev: WheelEvent) => any;
    onmscontentzoom: (this: this, ev: UIEvent) => any;
    onmsgesturechange: (this: this, ev: MSGestureEvent) => any;
    onmsgesturedoubletap: (this: this, ev: MSGestureEvent) => any;
    onmsgestureend: (this: this, ev: MSGestureEvent) => any;
    onmsgesturehold: (this: this, ev: MSGestureEvent) => any;
    onmsgesturestart: (this: this, ev: MSGestureEvent) => any;
    onmsgesturetap: (this: this, ev: MSGestureEvent) => any;
    onmsinertiastart: (this: this, ev: MSGestureEvent) => any;
    onmsmanipulationstatechanged: (this: this, ev: MSManipulationEvent) => any;
    onmspointercancel: (this: this, ev: MSPointerEvent) => any;
    onmspointerdown: (this: this, ev: MSPointerEvent) => any;
    onmspointerenter: (this: this, ev: MSPointerEvent) => any;
    onmspointerleave: (this: this, ev: MSPointerEvent) => any;
    onmspointermove: (this: this, ev: MSPointerEvent) => any;
    onmspointerout: (this: this, ev: MSPointerEvent) => any;
    onmspointerover: (this: this, ev: MSPointerEvent) => any;
    onmspointerup: (this: this, ev: MSPointerEvent) => any;
    /**
      * Occurs when an item is removed from a Jump List of a webpage running in Site Mode.
      * @param ev The event.
      */
    onmssitemodejumplistitemremoved: (this: this, ev: MSSiteModeEvent) => any;
    /**
      * Occurs when a user clicks a button in a Thumbnail Toolbar of a webpage running in Site Mode.
      * @param ev The event.
      */
    onmsthumbnailclick: (this: this, ev: MSSiteModeEvent) => any;
    /**
      * Occurs when playback is paused.
      * @param ev The event.
      */
    onpause: (this: this, ev: Event) => any;
    /**
      * Occurs when the play method is requested.
      * @param ev The event.
      */
    onplay: (this: this, ev: Event) => any;
    /**
      * Occurs when the audio or video has started playing.
      * @param ev The event.
      */
    onplaying: (this: this, ev: Event) => any;
    onpointerlockchange: (this: this, ev: Event) => any;
    onpointerlockerror: (this: this, ev: Event) => any;
    /**
      * Occurs to indicate progress while downloading media data.
      * @param ev The event.
      */
    onprogress: (this: this, ev: ProgressEvent) => any;
    /**
      * Occurs when the playback rate is increased or decreased.
      * @param ev The event.
      */
    onratechange: (this: this, ev: Event) => any;
    /**
      * Fires when the state of the object has changed.
      * @param ev The event
      */
    onreadystatechange: (this: this, ev: ProgressEvent) => any;
    /**
      * Fires when the user resets a form.
      * @param ev The event.
      */
    onreset: (this: this, ev: Event) => any;
    /**
      * Fires when the user repositions the scroll box in the scroll bar on the object.
      * @param ev The event.
      */
    onscroll: (this: this, ev: UIEvent) => any;
    /**
      * Occurs when the seek operation ends.
      * @param ev The event.
      */
    onseeked: (this: this, ev: Event) => any;
    /**
      * Occurs when the current playback position is moved.
      * @param ev The event.
      */
    onseeking: (this: this, ev: Event) => any;
    /**
      * Fires when the current selection changes.
      * @param ev The event.
      */
    onselect: (this: this, ev: UIEvent) => any;
    /**
      * Fires when the selection state of a document changes.
      * @param ev The event.
      */
    onselectionchange: (this: this, ev: Event) => any;
    onselectstart: (this: this, ev: Event) => any;
    /**
      * Occurs when the download has stopped.
      * @param ev The event.
      */
    onstalled: (this: this, ev: Event) => any;
    /**
      * Fires when the user clicks the Stop button or leaves the Web page.
      * @param ev The event.
      */
    onstop: (this: this, ev: Event) => any;
    onsubmit: (this: this, ev: Event) => any;
    /**
      * Occurs if the load operation has been intentionally halted.
      * @param ev The event.
      */
    onsuspend: (this: this, ev: Event) => any;
    /**
      * Occurs to indicate the current playback position.
      * @param ev The event.
      */
    ontimeupdate: (this: this, ev: Event) => any;
    ontouchcancel: (ev: TouchEvent) => any;
    ontouchend: (ev: TouchEvent) => any;
    ontouchmove: (ev: TouchEvent) => any;
    ontouchstart: (ev: TouchEvent) => any;
    /**
      * Occurs when the volume is changed, or playback is muted or unmuted.
      * @param ev The event.
      */
    onvolumechange: (this: this, ev: Event) => any;
    /**
      * Occurs when playback stops because the next frame of a video resource is not available.
      * @param ev The event.
      */
    onwaiting: (this: this, ev: Event) => any;
    onwebkitfullscreenchange: (this: this, ev: Event) => any;
    onwebkitfullscreenerror: (this: this, ev: Event) => any;
    plugins: HTMLCollectionOf<HTMLEmbedElement>;
    readonly pointerLockElement: Element;
    /**
      * Retrieves a value that indicates the current state of the object.
      */
    readonly readyState: string;
    /**
      * Gets the URL of the location that referred the user to the current page.
      */
    readonly referrer: string;
    /**
      * Gets the root svg element in the document hierarchy.
      */
    readonly rootElement: SVGSVGElement;
    /**
      * Retrieves a collection of all script objects in the document.
      */
    scripts: HTMLCollectionOf<HTMLScriptElement>;
    readonly scrollingElement: Element | null;
    /**
      * Retrieves a collection of styleSheet objects representing the style sheets that correspond to each instance of a link or style object in the document.
      */
    readonly styleSheets: StyleSheetList;
    /**
      * Contains the title of the document.
      */
    title: string;
    readonly visibilityState: string;
    /**
      * Sets or gets the color of the links that the user has visited.
      */
    vlinkColor: string;
    readonly webkitCurrentFullScreenElement: Element | null;
    readonly webkitFullscreenElement: Element | null;
    readonly webkitFullscreenEnabled: boolean;
    readonly webkitIsFullScreen: boolean;
    readonly xmlEncoding: string | null;
    xmlStandalone: boolean;
    /**
      * Gets or sets the version attribute specified in the declaration of an XML document.
      */
    xmlVersion: string | null;
    adoptNode(source: Node): Node;
    captureEvents(): void;
    caretRangeFromPoint(x: number, y: number): Range;
    clear(): void;
    /**
      * Closes an output stream and forces the sent data to display.
      */
    close(): void;
    /**
      * Creates an attribute object with a specified name.
      * @param name String that sets the attribute object's name.
      */
    createAttribute(name: string): Attr;
    createAttributeNS(namespaceURI: string | null, qualifiedName: string): Attr;
    createCDATASection(data: string): CDATASection;
    /**
      * Creates a comment object with the specified data.
      * @param data Sets the comment object's data.
      */
    createComment(data: string): Comment;
    /**
      * Creates a new document.
      */
    createDocumentFragment(): DocumentFragment;
    /**
      * Creates an instance of the element for the specified tag.
      * @param tagName The name of an element.
      */
    createElement(tagName: "a"): HTMLAnchorElement;
    createElement(tagName: "applet"): HTMLAppletElement;
    createElement(tagName: "area"): HTMLAreaElement;
    createElement(tagName: "audio"): HTMLAudioElement;
    createElement(tagName: "base"): HTMLBaseElement;
    createElement(tagName: "basefont"): HTMLBaseFontElement;
    createElement(tagName: "blockquote"): HTMLQuoteElement;
    createElement(tagName: "body"): HTMLBodyElement;
    createElement(tagName: "br"): HTMLBRElement;
    createElement(tagName: "button"): HTMLButtonElement;
    createElement(tagName: "canvas"): HTMLCanvasElement;
    createElement(tagName: "caption"): HTMLTableCaptionElement;
    createElement(tagName: "col"): HTMLTableColElement;
    createElement(tagName: "colgroup"): HTMLTableColElement;
    createElement(tagName: "datalist"): HTMLDataListElement;
    createElement(tagName: "del"): HTMLModElement;
    createElement(tagName: "dir"): HTMLDirectoryElement;
    createElement(tagName: "div"): HTMLDivElement;
    createElement(tagName: "dl"): HTMLDListElement;
    createElement(tagName: "embed"): HTMLEmbedElement;
    createElement(tagName: "fieldset"): HTMLFieldSetElement;
    createElement(tagName: "font"): HTMLFontElement;
    createElement(tagName: "form"): HTMLFormElement;
    createElement(tagName: "frame"): HTMLFrameElement;
    createElement(tagName: "frameset"): HTMLFrameSetElement;
    createElement(tagName: "h1"): HTMLHeadingElement;
    createElement(tagName: "h2"): HTMLHeadingElement;
    createElement(tagName: "h3"): HTMLHeadingElement;
    createElement(tagName: "h4"): HTMLHeadingElement;
    createElement(tagName: "h5"): HTMLHeadingElement;
    createElement(tagName: "h6"): HTMLHeadingElement;
    createElement(tagName: "head"): HTMLHeadElement;
    createElement(tagName: "hr"): HTMLHRElement;
    createElement(tagName: "html"): HTMLHtmlElement;
    createElement(tagName: "iframe"): HTMLIFrameElement;
    createElement(tagName: "img"): HTMLImageElement;
    createElement(tagName: "input"): HTMLInputElement;
    createElement(tagName: "ins"): HTMLModElement;
    createElement(tagName: "isindex"): HTMLUnknownElement;
    createElement(tagName: "label"): HTMLLabelElement;
    createElement(tagName: "legend"): HTMLLegendElement;
    createElement(tagName: "li"): HTMLLIElement;
    createElement(tagName: "link"): HTMLLinkElement;
    createElement(tagName: "listing"): HTMLPreElement;
    createElement(tagName: "map"): HTMLMapElement;
    createElement(tagName: "marquee"): HTMLMarqueeElement;
    createElement(tagName: "menu"): HTMLMenuElement;
    createElement(tagName: "meta"): HTMLMetaElement;
    createElement(tagName: "meter"): HTMLMeterElement;
    createElement(tagName: "nextid"): HTMLUnknownElement;
    createElement(tagName: "object"): HTMLObjectElement;
    createElement(tagName: "ol"): HTMLOListElement;
    createElement(tagName: "optgroup"): HTMLOptGroupElement;
    createElement(tagName: "option"): HTMLOptionElement;
    createElement(tagName: "p"): HTMLParagraphElement;
    createElement(tagName: "param"): HTMLParamElement;
    createElement(tagName: "picture"): HTMLPictureElement;
    createElement(tagName: "pre"): HTMLPreElement;
    createElement(tagName: "progress"): HTMLProgressElement;
    createElement(tagName: "q"): HTMLQuoteElement;
    createElement(tagName: "script"): HTMLScriptElement;
    createElement(tagName: "select"): HTMLSelectElement;
    createElement(tagName: "source"): HTMLSourceElement;
    createElement(tagName: "span"): HTMLSpanElement;
    createElement(tagName: "style"): HTMLStyleElement;
    createElement(tagName: "table"): HTMLTableElement;
    createElement(tagName: "tbody"): HTMLTableSectionElement;
    createElement(tagName: "td"): HTMLTableDataCellElement;
    createElement(tagName: "template"): HTMLTemplateElement;
    createElement(tagName: "textarea"): HTMLTextAreaElement;
    createElement(tagName: "tfoot"): HTMLTableSectionElement;
    createElement(tagName: "th"): HTMLTableHeaderCellElement;
    createElement(tagName: "thead"): HTMLTableSectionElement;
    createElement(tagName: "title"): HTMLTitleElement;
    createElement(tagName: "tr"): HTMLTableRowElement;
    createElement(tagName: "track"): HTMLTrackElement;
    createElement(tagName: "ul"): HTMLUListElement;
    createElement(tagName: "video"): HTMLVideoElement;
    createElement(tagName: "x-ms-webview"): MSHTMLWebViewElement;
    createElement(tagName: "xmp"): HTMLPreElement;
    createElement(tagName: string): HTMLElement;
    createElementNS(namespaceURI: "http://www.w3.org/1999/xhtml", qualifiedName: string): HTMLElement
    createElementNS(namespaceURI: "http://www.w3.org/2000/svg", qualifiedName: "a"): SVGAElement
    createElementNS(namespaceURI: "http://www.w3.org/2000/svg", qualifiedName: "circle"): SVGCircleElement
    createElementNS(namespaceURI: "http://www.w3.org/2000/svg", qualifiedName: "clipPath"): SVGClipPathElement
    createElementNS(namespaceURI: "http://www.w3.org/2000/svg", qualifiedName: "componentTransferFunction"): SVGComponentTransferFunctionElement
    createElementNS(namespaceURI: "http://www.w3.org/2000/svg", qualifiedName: "defs"): SVGDefsElement
    createElementNS(namespaceURI: "http://www.w3.org/2000/svg", qualifiedName: "desc"): SVGDescElement
    createElementNS(namespaceURI: "http://www.w3.org/2000/svg", qualifiedName: "ellipse"): SVGEllipseElement
    createElementNS(namespaceURI: "http://www.w3.org/2000/svg", qualifiedName: "feBlend"): SVGFEBlendElement
    createElementNS(namespaceURI: "http://www.w3.org/2000/svg", qualifiedName: "feColorMatrix"): SVGFEColorMatrixElement
    createElementNS(namespaceURI: "http://www.w3.org/2000/svg", qualifiedName: "feComponentTransfer"): SVGFEComponentTransferElement
    createElementNS(namespaceURI: "http://www.w3.org/2000/svg", qualifiedName: "feComposite"): SVGFECompositeElement
    createElementNS(namespaceURI: "http://www.w3.org/2000/svg", qualifiedName: "feConvolveMatrix"): SVGFEConvolveMatrixElement
    createElementNS(namespaceURI: "http://www.w3.org/2000/svg", qualifiedName: "feDiffuseLighting"): SVGFEDiffuseLightingElement
    createElementNS(namespaceURI: "http://www.w3.org/2000/svg", qualifiedName: "feDisplacementMap"): SVGFEDisplacementMapElement
    createElementNS(namespaceURI: "http://www.w3.org/2000/svg", qualifiedName: "feDistantLight"): SVGFEDistantLightElement
    createElementNS(namespaceURI: "http://www.w3.org/2000/svg", qualifiedName: "feFlood"): SVGFEFloodElement
    createElementNS(namespaceURI: "http://www.w3.org/2000/svg", qualifiedName: "feFuncA"): SVGFEFuncAElement
    createElementNS(namespaceURI: "http://www.w3.org/2000/svg", qualifiedName: "feFuncB"): SVGFEFuncBElement
    createElementNS(namespaceURI: "http://www.w3.org/2000/svg", qualifiedName: "feFuncG"): SVGFEFuncGElement
    createElementNS(namespaceURI: "http://www.w3.org/2000/svg", qualifiedName: "feFuncR"): SVGFEFuncRElement
    createElementNS(namespaceURI: "http://www.w3.org/2000/svg", qualifiedName: "feGaussianBlur"): SVGFEGaussianBlurElement
    createElementNS(namespaceURI: "http://www.w3.org/2000/svg", qualifiedName: "feImage"): SVGFEImageElement
    createElementNS(namespaceURI: "http://www.w3.org/2000/svg", qualifiedName: "feMerge"): SVGFEMergeElement
    createElementNS(namespaceURI: "http://www.w3.org/2000/svg", qualifiedName: "feMergeNode"): SVGFEMergeNodeElement
    createElementNS(namespaceURI: "http://www.w3.org/2000/svg", qualifiedName: "feMorphology"): SVGFEMorphologyElement
    createElementNS(namespaceURI: "http://www.w3.org/2000/svg", qualifiedName: "feOffset"): SVGFEOffsetElement
    createElementNS(namespaceURI: "http://www.w3.org/2000/svg", qualifiedName: "fePointLight"): SVGFEPointLightElement
    createElementNS(namespaceURI: "http://www.w3.org/2000/svg", qualifiedName: "feSpecularLighting"): SVGFESpecularLightingElement
    createElementNS(namespaceURI: "http://www.w3.org/2000/svg", qualifiedName: "feSpotLight"): SVGFESpotLightElement
    createElementNS(namespaceURI: "http://www.w3.org/2000/svg", qualifiedName: "feTile"): SVGFETileElement
    createElementNS(namespaceURI: "http://www.w3.org/2000/svg", qualifiedName: "feTurbulence"): SVGFETurbulenceElement
    createElementNS(namespaceURI: "http://www.w3.org/2000/svg", qualifiedName: "filter"): SVGFilterElement
    createElementNS(namespaceURI: "http://www.w3.org/2000/svg", qualifiedName: "foreignObject"): SVGForeignObjectElement
    createElementNS(namespaceURI: "http://www.w3.org/2000/svg", qualifiedName: "g"): SVGGElement
    createElementNS(namespaceURI: "http://www.w3.org/2000/svg", qualifiedName: "image"): SVGImageElement
    createElementNS(namespaceURI: "http://www.w3.org/2000/svg", qualifiedName: "gradient"): SVGGradientElement
    createElementNS(namespaceURI: "http://www.w3.org/2000/svg", qualifiedName: "line"): SVGLineElement
    createElementNS(namespaceURI: "http://www.w3.org/2000/svg", qualifiedName: "linearGradient"): SVGLinearGradientElement
    createElementNS(namespaceURI: "http://www.w3.org/2000/svg", qualifiedName: "marker"): SVGMarkerElement
    createElementNS(namespaceURI: "http://www.w3.org/2000/svg", qualifiedName: "mask"): SVGMaskElement
    createElementNS(namespaceURI: "http://www.w3.org/2000/svg", qualifiedName: "path"): SVGPathElement
    createElementNS(namespaceURI: "http://www.w3.org/2000/svg", qualifiedName: "metadata"): SVGMetadataElement
    createElementNS(namespaceURI: "http://www.w3.org/2000/svg", qualifiedName: "pattern"): SVGPatternElement
    createElementNS(namespaceURI: "http://www.w3.org/2000/svg", qualifiedName: "polygon"): SVGPolygonElement
    createElementNS(namespaceURI: "http://www.w3.org/2000/svg", qualifiedName: "polyline"): SVGPolylineElement
    createElementNS(namespaceURI: "http://www.w3.org/2000/svg", qualifiedName: "radialGradient"): SVGRadialGradientElement
    createElementNS(namespaceURI: "http://www.w3.org/2000/svg", qualifiedName: "rect"): SVGRectElement
    createElementNS(namespaceURI: "http://www.w3.org/2000/svg", qualifiedName: "svg"): SVGSVGElement
    createElementNS(namespaceURI: "http://www.w3.org/2000/svg", qualifiedName: "script"): SVGScriptElement
    createElementNS(namespaceURI: "http://www.w3.org/2000/svg", qualifiedName: "stop"): SVGStopElement
    createElementNS(namespaceURI: "http://www.w3.org/2000/svg", qualifiedName: "style"): SVGStyleElement
    createElementNS(namespaceURI: "http://www.w3.org/2000/svg", qualifiedName: "switch"): SVGSwitchElement
    createElementNS(namespaceURI: "http://www.w3.org/2000/svg", qualifiedName: "symbol"): SVGSymbolElement
    createElementNS(namespaceURI: "http://www.w3.org/2000/svg", qualifiedName: "tspan"): SVGTSpanElement
    createElementNS(namespaceURI: "http://www.w3.org/2000/svg", qualifiedName: "textContent"): SVGTextContentElement
    createElementNS(namespaceURI: "http://www.w3.org/2000/svg", qualifiedName: "text"): SVGTextElement
    createElementNS(namespaceURI: "http://www.w3.org/2000/svg", qualifiedName: "textPath"): SVGTextPathElement
    createElementNS(namespaceURI: "http://www.w3.org/2000/svg", qualifiedName: "textPositioning"): SVGTextPositioningElement
    createElementNS(namespaceURI: "http://www.w3.org/2000/svg", qualifiedName: "title"): SVGTitleElement
    createElementNS(namespaceURI: "http://www.w3.org/2000/svg", qualifiedName: "use"): SVGUseElement
    createElementNS(namespaceURI: "http://www.w3.org/2000/svg", qualifiedName: "view"): SVGViewElement
    createElementNS(namespaceURI: "http://www.w3.org/2000/svg", qualifiedName: string): SVGElement
    createElementNS(namespaceURI: string | null, qualifiedName: string): Element;
    createExpression(expression: string, resolver: XPathNSResolver): XPathExpression;
    createNSResolver(nodeResolver: Node): XPathNSResolver;
    /**
      * Creates a NodeIterator object that you can use to traverse filtered lists of nodes or elements in a document.
      * @param root The root element or node to start traversing on.
      * @param whatToShow The type of nodes or elements to appear in the node list
      * @param filter A custom NodeFilter function to use. For more information, see filter. Use null for no filter.
      * @param entityReferenceExpansion A flag that specifies whether entity reference nodes are expanded.
      */
    createNodeIterator(root: Node, whatToShow?: number, filter?: NodeFilter, entityReferenceExpansion?: boolean): NodeIterator;
    createProcessingInstruction(target: string, data: string): ProcessingInstruction;
    /**
      *  Returns an empty range object that has both of its boundary points positioned at the beginning of the document.
      */
    createRange(): Range;
    /**
      * Creates a text string from the specified value.
      * @param data String that specifies the nodeValue property of the text node.
      */
    createTextNode(data: string): Text;
    createTouch(view: Window, target: EventTarget, identifier: number, pageX: number, pageY: number, screenX: number, screenY: number): Touch;
    createTouchList(...touches: Touch[]): TouchList;
    /**
      * Creates a TreeWalker object that you can use to traverse filtered lists of nodes or elements in a document.
      * @param root The root element or node to start traversing on.
      * @param whatToShow The type of nodes or elements to appear in the node list. For more information, see whatToShow.
      * @param filter A custom NodeFilter function to use.
      * @param entityReferenceExpansion A flag that specifies whether entity reference nodes are expanded.
      */
    createTreeWalker(root: Node, whatToShow?: number, filter?: NodeFilter, entityReferenceExpansion?: boolean): TreeWalker;
    /**
      * Returns the element for the specified x coordinate and the specified y coordinate.
      * @param x The x-offset
      * @param y The y-offset
      */
    elementFromPoint(x: number, y: number): Element;
    evaluate(expression: string, contextNode: Node, resolver: XPathNSResolver, type: number, result: XPathResult): XPathResult;
    /**
      * Executes a command on the current document, current selection, or the given range.
      * @param commandId String that specifies the command to execute. This command can be any of the command identifiers that can be executed in script.
      * @param showUI Display the user interface, defaults to false.
      * @param value Value to assign.
      */
    execCommand(commandId: string, showUI?: boolean, value?: any): boolean;
    /**
      * Displays help information for the given command identifier.
      * @param commandId Displays help information for the given command identifier.
      */
    execCommandShowHelp(commandId: string): boolean;
    exitFullscreen(): void;
    exitPointerLock(): void;
    /**
      * Causes the element to receive the focus and executes the code specified by the onfocus event.
      */
    focus(): void;
    /**
      * Returns a reference to the first object with the specified value of the ID or NAME attribute.
      * @param elementId String that specifies the ID value. Case-insensitive.
      */
    getElementById(elementId: string): HTMLElement | null;
    getElementsByClassName(classNames: string): HTMLCollectionOf<Element>;
    /**
      * Gets a collection of objects based on the value of the NAME or ID attribute.
      * @param elementName Gets a collection of objects based on the value of the NAME or ID attribute.
      */
    getElementsByName(elementName: string): NodeListOf<HTMLElement>;
    /**
      * Retrieves a collection of objects based on the specified element name.
      * @param name Specifies the name of an element.
      */
    getElementsByTagName(tagname: "a"): NodeListOf<HTMLAnchorElement>;
    getElementsByTagName(tagname: "abbr"): NodeListOf<HTMLElement>;
    getElementsByTagName(tagname: "acronym"): NodeListOf<HTMLElement>;
    getElementsByTagName(tagname: "address"): NodeListOf<HTMLElement>;
    getElementsByTagName(tagname: "applet"): NodeListOf<HTMLAppletElement>;
    getElementsByTagName(tagname: "area"): NodeListOf<HTMLAreaElement>;
    getElementsByTagName(tagname: "article"): NodeListOf<HTMLElement>;
    getElementsByTagName(tagname: "aside"): NodeListOf<HTMLElement>;
    getElementsByTagName(tagname: "audio"): NodeListOf<HTMLAudioElement>;
    getElementsByTagName(tagname: "b"): NodeListOf<HTMLElement>;
    getElementsByTagName(tagname: "base"): NodeListOf<HTMLBaseElement>;
    getElementsByTagName(tagname: "basefont"): NodeListOf<HTMLBaseFontElement>;
    getElementsByTagName(tagname: "bdo"): NodeListOf<HTMLElement>;
    getElementsByTagName(tagname: "big"): NodeListOf<HTMLElement>;
    getElementsByTagName(tagname: "blockquote"): NodeListOf<HTMLQuoteElement>;
    getElementsByTagName(tagname: "body"): NodeListOf<HTMLBodyElement>;
    getElementsByTagName(tagname: "br"): NodeListOf<HTMLBRElement>;
    getElementsByTagName(tagname: "button"): NodeListOf<HTMLButtonElement>;
    getElementsByTagName(tagname: "canvas"): NodeListOf<HTMLCanvasElement>;
    getElementsByTagName(tagname: "caption"): NodeListOf<HTMLTableCaptionElement>;
    getElementsByTagName(tagname: "center"): NodeListOf<HTMLElement>;
    getElementsByTagName(tagname: "circle"): NodeListOf<SVGCircleElement>;
    getElementsByTagName(tagname: "cite"): NodeListOf<HTMLElement>;
    getElementsByTagName(tagname: "clippath"): NodeListOf<SVGClipPathElement>;
    getElementsByTagName(tagname: "code"): NodeListOf<HTMLElement>;
    getElementsByTagName(tagname: "col"): NodeListOf<HTMLTableColElement>;
    getElementsByTagName(tagname: "colgroup"): NodeListOf<HTMLTableColElement>;
    getElementsByTagName(tagname: "datalist"): NodeListOf<HTMLDataListElement>;
    getElementsByTagName(tagname: "dd"): NodeListOf<HTMLElement>;
    getElementsByTagName(tagname: "defs"): NodeListOf<SVGDefsElement>;
    getElementsByTagName(tagname: "del"): NodeListOf<HTMLModElement>;
    getElementsByTagName(tagname: "desc"): NodeListOf<SVGDescElement>;
    getElementsByTagName(tagname: "dfn"): NodeListOf<HTMLElement>;
    getElementsByTagName(tagname: "dir"): NodeListOf<HTMLDirectoryElement>;
    getElementsByTagName(tagname: "div"): NodeListOf<HTMLDivElement>;
    getElementsByTagName(tagname: "dl"): NodeListOf<HTMLDListElement>;
    getElementsByTagName(tagname: "dt"): NodeListOf<HTMLElement>;
    getElementsByTagName(tagname: "ellipse"): NodeListOf<SVGEllipseElement>;
    getElementsByTagName(tagname: "em"): NodeListOf<HTMLElement>;
    getElementsByTagName(tagname: "embed"): NodeListOf<HTMLEmbedElement>;
    getElementsByTagName(tagname: "feblend"): NodeListOf<SVGFEBlendElement>;
    getElementsByTagName(tagname: "fecolormatrix"): NodeListOf<SVGFEColorMatrixElement>;
    getElementsByTagName(tagname: "fecomponenttransfer"): NodeListOf<SVGFEComponentTransferElement>;
    getElementsByTagName(tagname: "fecomposite"): NodeListOf<SVGFECompositeElement>;
    getElementsByTagName(tagname: "feconvolvematrix"): NodeListOf<SVGFEConvolveMatrixElement>;
    getElementsByTagName(tagname: "fediffuselighting"): NodeListOf<SVGFEDiffuseLightingElement>;
    getElementsByTagName(tagname: "fedisplacementmap"): NodeListOf<SVGFEDisplacementMapElement>;
    getElementsByTagName(tagname: "fedistantlight"): NodeListOf<SVGFEDistantLightElement>;
    getElementsByTagName(tagname: "feflood"): NodeListOf<SVGFEFloodElement>;
    getElementsByTagName(tagname: "fefunca"): NodeListOf<SVGFEFuncAElement>;
    getElementsByTagName(tagname: "fefuncb"): NodeListOf<SVGFEFuncBElement>;
    getElementsByTagName(tagname: "fefuncg"): NodeListOf<SVGFEFuncGElement>;
    getElementsByTagName(tagname: "fefuncr"): NodeListOf<SVGFEFuncRElement>;
    getElementsByTagName(tagname: "fegaussianblur"): NodeListOf<SVGFEGaussianBlurElement>;
    getElementsByTagName(tagname: "feimage"): NodeListOf<SVGFEImageElement>;
    getElementsByTagName(tagname: "femerge"): NodeListOf<SVGFEMergeElement>;
    getElementsByTagName(tagname: "femergenode"): NodeListOf<SVGFEMergeNodeElement>;
    getElementsByTagName(tagname: "femorphology"): NodeListOf<SVGFEMorphologyElement>;
    getElementsByTagName(tagname: "feoffset"): NodeListOf<SVGFEOffsetElement>;
    getElementsByTagName(tagname: "fepointlight"): NodeListOf<SVGFEPointLightElement>;
    getElementsByTagName(tagname: "fespecularlighting"): NodeListOf<SVGFESpecularLightingElement>;
    getElementsByTagName(tagname: "fespotlight"): NodeListOf<SVGFESpotLightElement>;
    getElementsByTagName(tagname: "fetile"): NodeListOf<SVGFETileElement>;
    getElementsByTagName(tagname: "feturbulence"): NodeListOf<SVGFETurbulenceElement>;
    getElementsByTagName(tagname: "fieldset"): NodeListOf<HTMLFieldSetElement>;
    getElementsByTagName(tagname: "figcaption"): NodeListOf<HTMLElement>;
    getElementsByTagName(tagname: "figure"): NodeListOf<HTMLElement>;
    getElementsByTagName(tagname: "filter"): NodeListOf<SVGFilterElement>;
    getElementsByTagName(tagname: "font"): NodeListOf<HTMLFontElement>;
    getElementsByTagName(tagname: "footer"): NodeListOf<HTMLElement>;
    getElementsByTagName(tagname: "foreignobject"): NodeListOf<SVGForeignObjectElement>;
    getElementsByTagName(tagname: "form"): NodeListOf<HTMLFormElement>;
    getElementsByTagName(tagname: "frame"): NodeListOf<HTMLFrameElement>;
    getElementsByTagName(tagname: "frameset"): NodeListOf<HTMLFrameSetElement>;
    getElementsByTagName(tagname: "g"): NodeListOf<SVGGElement>;
    getElementsByTagName(tagname: "h1"): NodeListOf<HTMLHeadingElement>;
    getElementsByTagName(tagname: "h2"): NodeListOf<HTMLHeadingElement>;
    getElementsByTagName(tagname: "h3"): NodeListOf<HTMLHeadingElement>;
    getElementsByTagName(tagname: "h4"): NodeListOf<HTMLHeadingElement>;
    getElementsByTagName(tagname: "h5"): NodeListOf<HTMLHeadingElement>;
    getElementsByTagName(tagname: "h6"): NodeListOf<HTMLHeadingElement>;
    getElementsByTagName(tagname: "head"): NodeListOf<HTMLHeadElement>;
    getElementsByTagName(tagname: "header"): NodeListOf<HTMLElement>;
    getElementsByTagName(tagname: "hgroup"): NodeListOf<HTMLElement>;
    getElementsByTagName(tagname: "hr"): NodeListOf<HTMLHRElement>;
    getElementsByTagName(tagname: "html"): NodeListOf<HTMLHtmlElement>;
    getElementsByTagName(tagname: "i"): NodeListOf<HTMLElement>;
    getElementsByTagName(tagname: "iframe"): NodeListOf<HTMLIFrameElement>;
    getElementsByTagName(tagname: "image"): NodeListOf<SVGImageElement>;
    getElementsByTagName(tagname: "img"): NodeListOf<HTMLImageElement>;
    getElementsByTagName(tagname: "input"): NodeListOf<HTMLInputElement>;
    getElementsByTagName(tagname: "ins"): NodeListOf<HTMLModElement>;
    getElementsByTagName(tagname: "isindex"): NodeListOf<HTMLUnknownElement>;
    getElementsByTagName(tagname: "kbd"): NodeListOf<HTMLElement>;
    getElementsByTagName(tagname: "keygen"): NodeListOf<HTMLElement>;
    getElementsByTagName(tagname: "label"): NodeListOf<HTMLLabelElement>;
    getElementsByTagName(tagname: "legend"): NodeListOf<HTMLLegendElement>;
    getElementsByTagName(tagname: "li"): NodeListOf<HTMLLIElement>;
    getElementsByTagName(tagname: "line"): NodeListOf<SVGLineElement>;
    getElementsByTagName(tagname: "lineargradient"): NodeListOf<SVGLinearGradientElement>;
    getElementsByTagName(tagname: "link"): NodeListOf<HTMLLinkElement>;
    getElementsByTagName(tagname: "listing"): NodeListOf<HTMLPreElement>;
    getElementsByTagName(tagname: "map"): NodeListOf<HTMLMapElement>;
    getElementsByTagName(tagname: "mark"): NodeListOf<HTMLElement>;
    getElementsByTagName(tagname: "marker"): NodeListOf<SVGMarkerElement>;
    getElementsByTagName(tagname: "marquee"): NodeListOf<HTMLMarqueeElement>;
    getElementsByTagName(tagname: "mask"): NodeListOf<SVGMaskElement>;
    getElementsByTagName(tagname: "menu"): NodeListOf<HTMLMenuElement>;
    getElementsByTagName(tagname: "meta"): NodeListOf<HTMLMetaElement>;
    getElementsByTagName(tagname: "metadata"): NodeListOf<SVGMetadataElement>;
    getElementsByTagName(tagname: "meter"): NodeListOf<HTMLMeterElement>;
    getElementsByTagName(tagname: "nav"): NodeListOf<HTMLElement>;
    getElementsByTagName(tagname: "nextid"): NodeListOf<HTMLUnknownElement>;
    getElementsByTagName(tagname: "nobr"): NodeListOf<HTMLElement>;
    getElementsByTagName(tagname: "noframes"): NodeListOf<HTMLElement>;
    getElementsByTagName(tagname: "noscript"): NodeListOf<HTMLElement>;
    getElementsByTagName(tagname: "object"): NodeListOf<HTMLObjectElement>;
    getElementsByTagName(tagname: "ol"): NodeListOf<HTMLOListElement>;
    getElementsByTagName(tagname: "optgroup"): NodeListOf<HTMLOptGroupElement>;
    getElementsByTagName(tagname: "option"): NodeListOf<HTMLOptionElement>;
    getElementsByTagName(tagname: "p"): NodeListOf<HTMLParagraphElement>;
    getElementsByTagName(tagname: "param"): NodeListOf<HTMLParamElement>;
    getElementsByTagName(tagname: "path"): NodeListOf<SVGPathElement>;
    getElementsByTagName(tagname: "pattern"): NodeListOf<SVGPatternElement>;
    getElementsByTagName(tagname: "picture"): NodeListOf<HTMLPictureElement>;
    getElementsByTagName(tagname: "plaintext"): NodeListOf<HTMLElement>;
    getElementsByTagName(tagname: "polygon"): NodeListOf<SVGPolygonElement>;
    getElementsByTagName(tagname: "polyline"): NodeListOf<SVGPolylineElement>;
    getElementsByTagName(tagname: "pre"): NodeListOf<HTMLPreElement>;
    getElementsByTagName(tagname: "progress"): NodeListOf<HTMLProgressElement>;
    getElementsByTagName(tagname: "q"): NodeListOf<HTMLQuoteElement>;
    getElementsByTagName(tagname: "radialgradient"): NodeListOf<SVGRadialGradientElement>;
    getElementsByTagName(tagname: "rect"): NodeListOf<SVGRectElement>;
    getElementsByTagName(tagname: "rt"): NodeListOf<HTMLElement>;
    getElementsByTagName(tagname: "ruby"): NodeListOf<HTMLElement>;
    getElementsByTagName(tagname: "s"): NodeListOf<HTMLElement>;
    getElementsByTagName(tagname: "samp"): NodeListOf<HTMLElement>;
    getElementsByTagName(tagname: "script"): NodeListOf<HTMLScriptElement>;
    getElementsByTagName(tagname: "section"): NodeListOf<HTMLElement>;
    getElementsByTagName(tagname: "select"): NodeListOf<HTMLSelectElement>;
    getElementsByTagName(tagname: "small"): NodeListOf<HTMLElement>;
    getElementsByTagName(tagname: "source"): NodeListOf<HTMLSourceElement>;
    getElementsByTagName(tagname: "span"): NodeListOf<HTMLSpanElement>;
    getElementsByTagName(tagname: "stop"): NodeListOf<SVGStopElement>;
    getElementsByTagName(tagname: "strike"): NodeListOf<HTMLElement>;
    getElementsByTagName(tagname: "strong"): NodeListOf<HTMLElement>;
    getElementsByTagName(tagname: "style"): NodeListOf<HTMLStyleElement>;
    getElementsByTagName(tagname: "sub"): NodeListOf<HTMLElement>;
    getElementsByTagName(tagname: "sup"): NodeListOf<HTMLElement>;
    getElementsByTagName(tagname: "svg"): NodeListOf<SVGSVGElement>;
    getElementsByTagName(tagname: "switch"): NodeListOf<SVGSwitchElement>;
    getElementsByTagName(tagname: "symbol"): NodeListOf<SVGSymbolElement>;
    getElementsByTagName(tagname: "table"): NodeListOf<HTMLTableElement>;
    getElementsByTagName(tagname: "tbody"): NodeListOf<HTMLTableSectionElement>;
    getElementsByTagName(tagname: "td"): NodeListOf<HTMLTableDataCellElement>;
    getElementsByTagName(tagname: "template"): NodeListOf<HTMLTemplateElement>;
    getElementsByTagName(tagname: "text"): NodeListOf<SVGTextElement>;
    getElementsByTagName(tagname: "textpath"): NodeListOf<SVGTextPathElement>;
    getElementsByTagName(tagname: "textarea"): NodeListOf<HTMLTextAreaElement>;
    getElementsByTagName(tagname: "tfoot"): NodeListOf<HTMLTableSectionElement>;
    getElementsByTagName(tagname: "th"): NodeListOf<HTMLTableHeaderCellElement>;
    getElementsByTagName(tagname: "thead"): NodeListOf<HTMLTableSectionElement>;
    getElementsByTagName(tagname: "title"): NodeListOf<HTMLTitleElement>;
    getElementsByTagName(tagname: "tr"): NodeListOf<HTMLTableRowElement>;
    getElementsByTagName(tagname: "track"): NodeListOf<HTMLTrackElement>;
    getElementsByTagName(tagname: "tspan"): NodeListOf<SVGTSpanElement>;
    getElementsByTagName(tagname: "tt"): NodeListOf<HTMLElement>;
    getElementsByTagName(tagname: "u"): NodeListOf<HTMLElement>;
    getElementsByTagName(tagname: "ul"): NodeListOf<HTMLUListElement>;
    getElementsByTagName(tagname: "use"): NodeListOf<SVGUseElement>;
    getElementsByTagName(tagname: "var"): NodeListOf<HTMLElement>;
    getElementsByTagName(tagname: "video"): NodeListOf<HTMLVideoElement>;
    getElementsByTagName(tagname: "view"): NodeListOf<SVGViewElement>;
    getElementsByTagName(tagname: "wbr"): NodeListOf<HTMLElement>;
    getElementsByTagName(tagname: "x-ms-webview"): NodeListOf<MSHTMLWebViewElement>;
    getElementsByTagName(tagname: "xmp"): NodeListOf<HTMLPreElement>;
    getElementsByTagName(tagname: string): NodeListOf<Element>;
    getElementsByTagNameNS(namespaceURI: "http://www.w3.org/1999/xhtml", localName: string): HTMLCollectionOf<HTMLElement>;
    getElementsByTagNameNS(namespaceURI: "http://www.w3.org/2000/svg", localName: string): HTMLCollectionOf<SVGElement>;
    getElementsByTagNameNS(namespaceURI: string, localName: string): HTMLCollectionOf<Element>;
    /**
      * Returns an object representing the current selection of the document that is loaded into the object displaying a webpage.
      */
    getSelection(): Selection;
    /**
      * Gets a value indicating whether the object currently has focus.
      */
    hasFocus(): boolean;
    importNode(importedNode: Node, deep: boolean): Node;
    msElementsFromPoint(x: number, y: number): NodeListOf<Element>;
    msElementsFromRect(left: number, top: number, width: number, height: number): NodeListOf<Element>;
    /**
      * Opens a new window and loads a document specified by a given URL. Also, opens a new window that uses the url parameter and the name parameter to collect the output of the write method and the writeln method.
      * @param url Specifies a MIME type for the document.
      * @param name Specifies the name of the window. This name is used as the value for the TARGET attribute on a form or an anchor element.
      * @param features Contains a list of items separated by commas. Each item consists of an option and a value, separated by an equals sign (for example, "fullscreen=yes, toolbar=yes"). The following values are supported.
      * @param replace Specifies whether the existing entry for the document is replaced in the history list.
      */
    open(url?: string, name?: string, features?: string, replace?: boolean): Document;
    /**
      * Returns a Boolean value that indicates whether a specified command can be successfully executed using execCommand, given the current state of the document.
      * @param commandId Specifies a command identifier.
      */
    queryCommandEnabled(commandId: string): boolean;
    /**
      * Returns a Boolean value that indicates whether the specified command is in the indeterminate state.
      * @param commandId String that specifies a command identifier.
      */
    queryCommandIndeterm(commandId: string): boolean;
    /**
      * Returns a Boolean value that indicates the current state of the command.
      * @param commandId String that specifies a command identifier.
      */
    queryCommandState(commandId: string): boolean;
    /**
      * Returns a Boolean value that indicates whether the current command is supported on the current range.
      * @param commandId Specifies a command identifier.
      */
    queryCommandSupported(commandId: string): boolean;
    /**
      * Retrieves the string associated with a command.
      * @param commandId String that contains the identifier of a command. This can be any command identifier given in the list of Command Identifiers.
      */
    queryCommandText(commandId: string): string;
    /**
      * Returns the current value of the document, range, or current selection for the given command.
      * @param commandId String that specifies a command identifier.
      */
    queryCommandValue(commandId: string): string;
    releaseEvents(): void;
    /**
      * Allows updating the print settings for the page.
      */
    updateSettings(): void;
    webkitCancelFullScreen(): void;
    webkitExitFullscreen(): void;
    /**
      * Writes one or more HTML expressions to a document in the specified window.
      * @param content Specifies the text and HTML tags to write.
      */
    write(...content: string[]): void;
    /**
      * Writes one or more HTML expressions, followed by a carriage return, to a document in the specified window.
      * @param content The text and HTML tags to write.
      */
    writeln(...content: string[]): void;
    addEventListener(type: "MSContentZoom", listener: (this: this, ev: UIEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSGestureChange", listener: (this: this, ev: MSGestureEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSGestureDoubleTap", listener: (this: this, ev: MSGestureEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSGestureEnd", listener: (this: this, ev: MSGestureEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSGestureHold", listener: (this: this, ev: MSGestureEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSGestureStart", listener: (this: this, ev: MSGestureEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSGestureTap", listener: (this: this, ev: MSGestureEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSInertiaStart", listener: (this: this, ev: MSGestureEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSManipulationStateChanged", listener: (this: this, ev: MSManipulationEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSPointerCancel", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSPointerDown", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSPointerEnter", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSPointerLeave", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSPointerMove", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSPointerOut", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSPointerOver", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSPointerUp", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "abort", listener: (this: this, ev: UIEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "activate", listener: (this: this, ev: UIEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "beforeactivate", listener: (this: this, ev: UIEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "beforedeactivate", listener: (this: this, ev: UIEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "blur", listener: (this: this, ev: FocusEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "canplay", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "canplaythrough", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "change", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "click", listener: (this: this, ev: MouseEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "contextmenu", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "dblclick", listener: (this: this, ev: MouseEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "deactivate", listener: (this: this, ev: UIEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "drag", listener: (this: this, ev: DragEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "dragend", listener: (this: this, ev: DragEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "dragenter", listener: (this: this, ev: DragEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "dragleave", listener: (this: this, ev: DragEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "dragover", listener: (this: this, ev: DragEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "dragstart", listener: (this: this, ev: DragEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "drop", listener: (this: this, ev: DragEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "durationchange", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "emptied", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "ended", listener: (this: this, ev: MediaStreamErrorEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "error", listener: (this: this, ev: ErrorEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "focus", listener: (this: this, ev: FocusEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "fullscreenchange", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "fullscreenerror", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "input", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "invalid", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "keydown", listener: (this: this, ev: KeyboardEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "keypress", listener: (this: this, ev: KeyboardEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "keyup", listener: (this: this, ev: KeyboardEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "load", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "loadeddata", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "loadedmetadata", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "loadstart", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "mousedown", listener: (this: this, ev: MouseEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "mousemove", listener: (this: this, ev: MouseEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "mouseout", listener: (this: this, ev: MouseEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "mouseover", listener: (this: this, ev: MouseEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "mouseup", listener: (this: this, ev: MouseEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "mousewheel", listener: (this: this, ev: WheelEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "mssitemodejumplistitemremoved", listener: (this: this, ev: MSSiteModeEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "msthumbnailclick", listener: (this: this, ev: MSSiteModeEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pause", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "play", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "playing", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "pointercancel", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pointerdown", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pointerenter", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pointerleave", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pointerlockchange", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "pointerlockerror", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "pointermove", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pointerout", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pointerover", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pointerup", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "progress", listener: (this: this, ev: ProgressEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "ratechange", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "readystatechange", listener: (this: this, ev: ProgressEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "reset", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "scroll", listener: (this: this, ev: UIEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "seeked", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "seeking", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "select", listener: (this: this, ev: UIEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "selectionchange", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "selectstart", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "stalled", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "stop", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "submit", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "suspend", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "timeupdate", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "touchcancel", listener: (this: this, ev: TouchEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "touchend", listener: (this: this, ev: TouchEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "touchmove", listener: (this: this, ev: TouchEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "touchstart", listener: (this: this, ev: TouchEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "volumechange", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "waiting", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "webkitfullscreenchange", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "webkitfullscreenerror", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "wheel", listener: (this: this, ev: WheelEvent) => any, useCapture?: boolean): void;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var Document: {
    prototype: Document;
    new(): Document;
}

interface DocumentFragment extends Node, NodeSelector, ParentNode {
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var DocumentFragment: {
    prototype: DocumentFragment;
    new(): DocumentFragment;
}

interface DocumentType extends Node, ChildNode {
    readonly entities: NamedNodeMap;
    readonly internalSubset: string | null;
    readonly name: string;
    readonly notations: NamedNodeMap;
    readonly publicId: string | null;
    readonly systemId: string | null;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var DocumentType: {
    prototype: DocumentType;
    new(): DocumentType;
}

interface DragEvent extends MouseEvent {
    readonly dataTransfer: DataTransfer;
    initDragEvent(typeArg: string, canBubbleArg: boolean, cancelableArg: boolean, viewArg: Window, detailArg: number, screenXArg: number, screenYArg: number, clientXArg: number, clientYArg: number, ctrlKeyArg: boolean, altKeyArg: boolean, shiftKeyArg: boolean, metaKeyArg: boolean, buttonArg: number, relatedTargetArg: EventTarget, dataTransferArg: DataTransfer): void;
    msConvertURL(file: File, targetType: string, targetURL?: string): void;
}

declare var DragEvent: {
    prototype: DragEvent;
    new(): DragEvent;
}

interface DynamicsCompressorNode extends AudioNode {
    readonly attack: AudioParam;
    readonly knee: AudioParam;
    readonly ratio: AudioParam;
    readonly reduction: AudioParam;
    readonly release: AudioParam;
    readonly threshold: AudioParam;
}

declare var DynamicsCompressorNode: {
    prototype: DynamicsCompressorNode;
    new(): DynamicsCompressorNode;
}

interface EXT_frag_depth {
}

declare var EXT_frag_depth: {
    prototype: EXT_frag_depth;
    new(): EXT_frag_depth;
}

interface EXT_texture_filter_anisotropic {
    readonly MAX_TEXTURE_MAX_ANISOTROPY_EXT: number;
    readonly TEXTURE_MAX_ANISOTROPY_EXT: number;
}

declare var EXT_texture_filter_anisotropic: {
    prototype: EXT_texture_filter_anisotropic;
    new(): EXT_texture_filter_anisotropic;
    readonly MAX_TEXTURE_MAX_ANISOTROPY_EXT: number;
    readonly TEXTURE_MAX_ANISOTROPY_EXT: number;
}

interface Element extends Node, GlobalEventHandlers, ElementTraversal, NodeSelector, ChildNode, ParentNode {
    readonly classList: DOMTokenList;
    className: string;
    readonly clientHeight: number;
    readonly clientLeft: number;
    readonly clientTop: number;
    readonly clientWidth: number;
    id: string;
    msContentZoomFactor: number;
    readonly msRegionOverflow: string;
    onariarequest: (this: this, ev: AriaRequestEvent) => any;
    oncommand: (this: this, ev: CommandEvent) => any;
    ongotpointercapture: (this: this, ev: PointerEvent) => any;
    onlostpointercapture: (this: this, ev: PointerEvent) => any;
    onmsgesturechange: (this: this, ev: MSGestureEvent) => any;
    onmsgesturedoubletap: (this: this, ev: MSGestureEvent) => any;
    onmsgestureend: (this: this, ev: MSGestureEvent) => any;
    onmsgesturehold: (this: this, ev: MSGestureEvent) => any;
    onmsgesturestart: (this: this, ev: MSGestureEvent) => any;
    onmsgesturetap: (this: this, ev: MSGestureEvent) => any;
    onmsgotpointercapture: (this: this, ev: MSPointerEvent) => any;
    onmsinertiastart: (this: this, ev: MSGestureEvent) => any;
    onmslostpointercapture: (this: this, ev: MSPointerEvent) => any;
    onmspointercancel: (this: this, ev: MSPointerEvent) => any;
    onmspointerdown: (this: this, ev: MSPointerEvent) => any;
    onmspointerenter: (this: this, ev: MSPointerEvent) => any;
    onmspointerleave: (this: this, ev: MSPointerEvent) => any;
    onmspointermove: (this: this, ev: MSPointerEvent) => any;
    onmspointerout: (this: this, ev: MSPointerEvent) => any;
    onmspointerover: (this: this, ev: MSPointerEvent) => any;
    onmspointerup: (this: this, ev: MSPointerEvent) => any;
    ontouchcancel: (ev: TouchEvent) => any;
    ontouchend: (ev: TouchEvent) => any;
    ontouchmove: (ev: TouchEvent) => any;
    ontouchstart: (ev: TouchEvent) => any;
    onwebkitfullscreenchange: (this: this, ev: Event) => any;
    onwebkitfullscreenerror: (this: this, ev: Event) => any;
    readonly prefix: string | null;
    readonly scrollHeight: number;
    scrollLeft: number;
    scrollTop: number;
    readonly scrollWidth: number;
    readonly tagName: string;
    innerHTML: string;
    getAttribute(name: string): string | null;
    getAttributeNS(namespaceURI: string, localName: string): string;
    getAttributeNode(name: string): Attr;
    getAttributeNodeNS(namespaceURI: string, localName: string): Attr;
    getBoundingClientRect(): ClientRect;
    getClientRects(): ClientRectList;
    getElementsByTagName(name: "a"): NodeListOf<HTMLAnchorElement>;
    getElementsByTagName(name: "abbr"): NodeListOf<HTMLElement>;
    getElementsByTagName(name: "acronym"): NodeListOf<HTMLElement>;
    getElementsByTagName(name: "address"): NodeListOf<HTMLElement>;
    getElementsByTagName(name: "applet"): NodeListOf<HTMLAppletElement>;
    getElementsByTagName(name: "area"): NodeListOf<HTMLAreaElement>;
    getElementsByTagName(name: "article"): NodeListOf<HTMLElement>;
    getElementsByTagName(name: "aside"): NodeListOf<HTMLElement>;
    getElementsByTagName(name: "audio"): NodeListOf<HTMLAudioElement>;
    getElementsByTagName(name: "b"): NodeListOf<HTMLElement>;
    getElementsByTagName(name: "base"): NodeListOf<HTMLBaseElement>;
    getElementsByTagName(name: "basefont"): NodeListOf<HTMLBaseFontElement>;
    getElementsByTagName(name: "bdo"): NodeListOf<HTMLElement>;
    getElementsByTagName(name: "big"): NodeListOf<HTMLElement>;
    getElementsByTagName(name: "blockquote"): NodeListOf<HTMLQuoteElement>;
    getElementsByTagName(name: "body"): NodeListOf<HTMLBodyElement>;
    getElementsByTagName(name: "br"): NodeListOf<HTMLBRElement>;
    getElementsByTagName(name: "button"): NodeListOf<HTMLButtonElement>;
    getElementsByTagName(name: "canvas"): NodeListOf<HTMLCanvasElement>;
    getElementsByTagName(name: "caption"): NodeListOf<HTMLTableCaptionElement>;
    getElementsByTagName(name: "center"): NodeListOf<HTMLElement>;
    getElementsByTagName(name: "circle"): NodeListOf<SVGCircleElement>;
    getElementsByTagName(name: "cite"): NodeListOf<HTMLElement>;
    getElementsByTagName(name: "clippath"): NodeListOf<SVGClipPathElement>;
    getElementsByTagName(name: "code"): NodeListOf<HTMLElement>;
    getElementsByTagName(name: "col"): NodeListOf<HTMLTableColElement>;
    getElementsByTagName(name: "colgroup"): NodeListOf<HTMLTableColElement>;
    getElementsByTagName(name: "datalist"): NodeListOf<HTMLDataListElement>;
    getElementsByTagName(name: "dd"): NodeListOf<HTMLElement>;
    getElementsByTagName(name: "defs"): NodeListOf<SVGDefsElement>;
    getElementsByTagName(name: "del"): NodeListOf<HTMLModElement>;
    getElementsByTagName(name: "desc"): NodeListOf<SVGDescElement>;
    getElementsByTagName(name: "dfn"): NodeListOf<HTMLElement>;
    getElementsByTagName(name: "dir"): NodeListOf<HTMLDirectoryElement>;
    getElementsByTagName(name: "div"): NodeListOf<HTMLDivElement>;
    getElementsByTagName(name: "dl"): NodeListOf<HTMLDListElement>;
    getElementsByTagName(name: "dt"): NodeListOf<HTMLElement>;
    getElementsByTagName(name: "ellipse"): NodeListOf<SVGEllipseElement>;
    getElementsByTagName(name: "em"): NodeListOf<HTMLElement>;
    getElementsByTagName(name: "embed"): NodeListOf<HTMLEmbedElement>;
    getElementsByTagName(name: "feblend"): NodeListOf<SVGFEBlendElement>;
    getElementsByTagName(name: "fecolormatrix"): NodeListOf<SVGFEColorMatrixElement>;
    getElementsByTagName(name: "fecomponenttransfer"): NodeListOf<SVGFEComponentTransferElement>;
    getElementsByTagName(name: "fecomposite"): NodeListOf<SVGFECompositeElement>;
    getElementsByTagName(name: "feconvolvematrix"): NodeListOf<SVGFEConvolveMatrixElement>;
    getElementsByTagName(name: "fediffuselighting"): NodeListOf<SVGFEDiffuseLightingElement>;
    getElementsByTagName(name: "fedisplacementmap"): NodeListOf<SVGFEDisplacementMapElement>;
    getElementsByTagName(name: "fedistantlight"): NodeListOf<SVGFEDistantLightElement>;
    getElementsByTagName(name: "feflood"): NodeListOf<SVGFEFloodElement>;
    getElementsByTagName(name: "fefunca"): NodeListOf<SVGFEFuncAElement>;
    getElementsByTagName(name: "fefuncb"): NodeListOf<SVGFEFuncBElement>;
    getElementsByTagName(name: "fefuncg"): NodeListOf<SVGFEFuncGElement>;
    getElementsByTagName(name: "fefuncr"): NodeListOf<SVGFEFuncRElement>;
    getElementsByTagName(name: "fegaussianblur"): NodeListOf<SVGFEGaussianBlurElement>;
    getElementsByTagName(name: "feimage"): NodeListOf<SVGFEImageElement>;
    getElementsByTagName(name: "femerge"): NodeListOf<SVGFEMergeElement>;
    getElementsByTagName(name: "femergenode"): NodeListOf<SVGFEMergeNodeElement>;
    getElementsByTagName(name: "femorphology"): NodeListOf<SVGFEMorphologyElement>;
    getElementsByTagName(name: "feoffset"): NodeListOf<SVGFEOffsetElement>;
    getElementsByTagName(name: "fepointlight"): NodeListOf<SVGFEPointLightElement>;
    getElementsByTagName(name: "fespecularlighting"): NodeListOf<SVGFESpecularLightingElement>;
    getElementsByTagName(name: "fespotlight"): NodeListOf<SVGFESpotLightElement>;
    getElementsByTagName(name: "fetile"): NodeListOf<SVGFETileElement>;
    getElementsByTagName(name: "feturbulence"): NodeListOf<SVGFETurbulenceElement>;
    getElementsByTagName(name: "fieldset"): NodeListOf<HTMLFieldSetElement>;
    getElementsByTagName(name: "figcaption"): NodeListOf<HTMLElement>;
    getElementsByTagName(name: "figure"): NodeListOf<HTMLElement>;
    getElementsByTagName(name: "filter"): NodeListOf<SVGFilterElement>;
    getElementsByTagName(name: "font"): NodeListOf<HTMLFontElement>;
    getElementsByTagName(name: "footer"): NodeListOf<HTMLElement>;
    getElementsByTagName(name: "foreignobject"): NodeListOf<SVGForeignObjectElement>;
    getElementsByTagName(name: "form"): NodeListOf<HTMLFormElement>;
    getElementsByTagName(name: "frame"): NodeListOf<HTMLFrameElement>;
    getElementsByTagName(name: "frameset"): NodeListOf<HTMLFrameSetElement>;
    getElementsByTagName(name: "g"): NodeListOf<SVGGElement>;
    getElementsByTagName(name: "h1"): NodeListOf<HTMLHeadingElement>;
    getElementsByTagName(name: "h2"): NodeListOf<HTMLHeadingElement>;
    getElementsByTagName(name: "h3"): NodeListOf<HTMLHeadingElement>;
    getElementsByTagName(name: "h4"): NodeListOf<HTMLHeadingElement>;
    getElementsByTagName(name: "h5"): NodeListOf<HTMLHeadingElement>;
    getElementsByTagName(name: "h6"): NodeListOf<HTMLHeadingElement>;
    getElementsByTagName(name: "head"): NodeListOf<HTMLHeadElement>;
    getElementsByTagName(name: "header"): NodeListOf<HTMLElement>;
    getElementsByTagName(name: "hgroup"): NodeListOf<HTMLElement>;
    getElementsByTagName(name: "hr"): NodeListOf<HTMLHRElement>;
    getElementsByTagName(name: "html"): NodeListOf<HTMLHtmlElement>;
    getElementsByTagName(name: "i"): NodeListOf<HTMLElement>;
    getElementsByTagName(name: "iframe"): NodeListOf<HTMLIFrameElement>;
    getElementsByTagName(name: "image"): NodeListOf<SVGImageElement>;
    getElementsByTagName(name: "img"): NodeListOf<HTMLImageElement>;
    getElementsByTagName(name: "input"): NodeListOf<HTMLInputElement>;
    getElementsByTagName(name: "ins"): NodeListOf<HTMLModElement>;
    getElementsByTagName(name: "isindex"): NodeListOf<HTMLUnknownElement>;
    getElementsByTagName(name: "kbd"): NodeListOf<HTMLElement>;
    getElementsByTagName(name: "keygen"): NodeListOf<HTMLElement>;
    getElementsByTagName(name: "label"): NodeListOf<HTMLLabelElement>;
    getElementsByTagName(name: "legend"): NodeListOf<HTMLLegendElement>;
    getElementsByTagName(name: "li"): NodeListOf<HTMLLIElement>;
    getElementsByTagName(name: "line"): NodeListOf<SVGLineElement>;
    getElementsByTagName(name: "lineargradient"): NodeListOf<SVGLinearGradientElement>;
    getElementsByTagName(name: "link"): NodeListOf<HTMLLinkElement>;
    getElementsByTagName(name: "listing"): NodeListOf<HTMLPreElement>;
    getElementsByTagName(name: "map"): NodeListOf<HTMLMapElement>;
    getElementsByTagName(name: "mark"): NodeListOf<HTMLElement>;
    getElementsByTagName(name: "marker"): NodeListOf<SVGMarkerElement>;
    getElementsByTagName(name: "marquee"): NodeListOf<HTMLMarqueeElement>;
    getElementsByTagName(name: "mask"): NodeListOf<SVGMaskElement>;
    getElementsByTagName(name: "menu"): NodeListOf<HTMLMenuElement>;
    getElementsByTagName(name: "meta"): NodeListOf<HTMLMetaElement>;
    getElementsByTagName(name: "metadata"): NodeListOf<SVGMetadataElement>;
    getElementsByTagName(name: "meter"): NodeListOf<HTMLMeterElement>;
    getElementsByTagName(name: "nav"): NodeListOf<HTMLElement>;
    getElementsByTagName(name: "nextid"): NodeListOf<HTMLUnknownElement>;
    getElementsByTagName(name: "nobr"): NodeListOf<HTMLElement>;
    getElementsByTagName(name: "noframes"): NodeListOf<HTMLElement>;
    getElementsByTagName(name: "noscript"): NodeListOf<HTMLElement>;
    getElementsByTagName(name: "object"): NodeListOf<HTMLObjectElement>;
    getElementsByTagName(name: "ol"): NodeListOf<HTMLOListElement>;
    getElementsByTagName(name: "optgroup"): NodeListOf<HTMLOptGroupElement>;
    getElementsByTagName(name: "option"): NodeListOf<HTMLOptionElement>;
    getElementsByTagName(name: "p"): NodeListOf<HTMLParagraphElement>;
    getElementsByTagName(name: "param"): NodeListOf<HTMLParamElement>;
    getElementsByTagName(name: "path"): NodeListOf<SVGPathElement>;
    getElementsByTagName(name: "pattern"): NodeListOf<SVGPatternElement>;
    getElementsByTagName(name: "picture"): NodeListOf<HTMLPictureElement>;
    getElementsByTagName(name: "plaintext"): NodeListOf<HTMLElement>;
    getElementsByTagName(name: "polygon"): NodeListOf<SVGPolygonElement>;
    getElementsByTagName(name: "polyline"): NodeListOf<SVGPolylineElement>;
    getElementsByTagName(name: "pre"): NodeListOf<HTMLPreElement>;
    getElementsByTagName(name: "progress"): NodeListOf<HTMLProgressElement>;
    getElementsByTagName(name: "q"): NodeListOf<HTMLQuoteElement>;
    getElementsByTagName(name: "radialgradient"): NodeListOf<SVGRadialGradientElement>;
    getElementsByTagName(name: "rect"): NodeListOf<SVGRectElement>;
    getElementsByTagName(name: "rt"): NodeListOf<HTMLElement>;
    getElementsByTagName(name: "ruby"): NodeListOf<HTMLElement>;
    getElementsByTagName(name: "s"): NodeListOf<HTMLElement>;
    getElementsByTagName(name: "samp"): NodeListOf<HTMLElement>;
    getElementsByTagName(name: "script"): NodeListOf<HTMLScriptElement>;
    getElementsByTagName(name: "section"): NodeListOf<HTMLElement>;
    getElementsByTagName(name: "select"): NodeListOf<HTMLSelectElement>;
    getElementsByTagName(name: "small"): NodeListOf<HTMLElement>;
    getElementsByTagName(name: "source"): NodeListOf<HTMLSourceElement>;
    getElementsByTagName(name: "span"): NodeListOf<HTMLSpanElement>;
    getElementsByTagName(name: "stop"): NodeListOf<SVGStopElement>;
    getElementsByTagName(name: "strike"): NodeListOf<HTMLElement>;
    getElementsByTagName(name: "strong"): NodeListOf<HTMLElement>;
    getElementsByTagName(name: "style"): NodeListOf<HTMLStyleElement>;
    getElementsByTagName(name: "sub"): NodeListOf<HTMLElement>;
    getElementsByTagName(name: "sup"): NodeListOf<HTMLElement>;
    getElementsByTagName(name: "svg"): NodeListOf<SVGSVGElement>;
    getElementsByTagName(name: "switch"): NodeListOf<SVGSwitchElement>;
    getElementsByTagName(name: "symbol"): NodeListOf<SVGSymbolElement>;
    getElementsByTagName(name: "table"): NodeListOf<HTMLTableElement>;
    getElementsByTagName(name: "tbody"): NodeListOf<HTMLTableSectionElement>;
    getElementsByTagName(name: "td"): NodeListOf<HTMLTableDataCellElement>;
    getElementsByTagName(name: "template"): NodeListOf<HTMLTemplateElement>;
    getElementsByTagName(name: "text"): NodeListOf<SVGTextElement>;
    getElementsByTagName(name: "textpath"): NodeListOf<SVGTextPathElement>;
    getElementsByTagName(name: "textarea"): NodeListOf<HTMLTextAreaElement>;
    getElementsByTagName(name: "tfoot"): NodeListOf<HTMLTableSectionElement>;
    getElementsByTagName(name: "th"): NodeListOf<HTMLTableHeaderCellElement>;
    getElementsByTagName(name: "thead"): NodeListOf<HTMLTableSectionElement>;
    getElementsByTagName(name: "title"): NodeListOf<HTMLTitleElement>;
    getElementsByTagName(name: "tr"): NodeListOf<HTMLTableRowElement>;
    getElementsByTagName(name: "track"): NodeListOf<HTMLTrackElement>;
    getElementsByTagName(name: "tspan"): NodeListOf<SVGTSpanElement>;
    getElementsByTagName(name: "tt"): NodeListOf<HTMLElement>;
    getElementsByTagName(name: "u"): NodeListOf<HTMLElement>;
    getElementsByTagName(name: "ul"): NodeListOf<HTMLUListElement>;
    getElementsByTagName(name: "use"): NodeListOf<SVGUseElement>;
    getElementsByTagName(name: "var"): NodeListOf<HTMLElement>;
    getElementsByTagName(name: "video"): NodeListOf<HTMLVideoElement>;
    getElementsByTagName(name: "view"): NodeListOf<SVGViewElement>;
    getElementsByTagName(name: "wbr"): NodeListOf<HTMLElement>;
    getElementsByTagName(name: "x-ms-webview"): NodeListOf<MSHTMLWebViewElement>;
    getElementsByTagName(name: "xmp"): NodeListOf<HTMLPreElement>;
    getElementsByTagName(name: string): NodeListOf<Element>;
    getElementsByTagNameNS(namespaceURI: "http://www.w3.org/1999/xhtml", localName: string): HTMLCollectionOf<HTMLElement>;
    getElementsByTagNameNS(namespaceURI: "http://www.w3.org/2000/svg", localName: string): HTMLCollectionOf<SVGElement>;
    getElementsByTagNameNS(namespaceURI: string, localName: string): HTMLCollectionOf<Element>;
    hasAttribute(name: string): boolean;
    hasAttributeNS(namespaceURI: string, localName: string): boolean;
    msGetRegionContent(): MSRangeCollection;
    msGetUntransformedBounds(): ClientRect;
    msMatchesSelector(selectors: string): boolean;
    msReleasePointerCapture(pointerId: number): void;
    msSetPointerCapture(pointerId: number): void;
    msZoomTo(args: MsZoomToOptions): void;
    releasePointerCapture(pointerId: number): void;
    removeAttribute(name?: string): void;
    removeAttributeNS(namespaceURI: string, localName: string): void;
    removeAttributeNode(oldAttr: Attr): Attr;
    requestFullscreen(): void;
    requestPointerLock(): void;
    setAttribute(name: string, value: string): void;
    setAttributeNS(namespaceURI: string, qualifiedName: string, value: string): void;
    setAttributeNode(newAttr: Attr): Attr;
    setAttributeNodeNS(newAttr: Attr): Attr;
    setPointerCapture(pointerId: number): void;
    webkitMatchesSelector(selectors: string): boolean;
    webkitRequestFullScreen(): void;
    webkitRequestFullscreen(): void;
    getElementsByClassName(classNames: string): NodeListOf<Element>;
    matches(selector: string): boolean;
    closest(selector: string): Element | null;
    scrollIntoView(arg?: boolean | ScrollIntoViewOptions): void;
    scroll(options?: ScrollToOptions): void;
    scroll(x: number, y: number): void;
    scrollTo(options?: ScrollToOptions): void;
    scrollTo(x: number, y: number): void;
    scrollBy(options?: ScrollToOptions): void;
    scrollBy(x: number, y: number): void;
    insertAdjacentElement(position: string, insertedElement: Element): Element | null;
    insertAdjacentHTML(where: string, html: string): void;
    insertAdjacentText(where: string, text: string): void;
    addEventListener(type: "MSGestureChange", listener: (this: this, ev: MSGestureEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSGestureDoubleTap", listener: (this: this, ev: MSGestureEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSGestureEnd", listener: (this: this, ev: MSGestureEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSGestureHold", listener: (this: this, ev: MSGestureEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSGestureStart", listener: (this: this, ev: MSGestureEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSGestureTap", listener: (this: this, ev: MSGestureEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSGotPointerCapture", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSInertiaStart", listener: (this: this, ev: MSGestureEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSLostPointerCapture", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSPointerCancel", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSPointerDown", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSPointerEnter", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSPointerLeave", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSPointerMove", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSPointerOut", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSPointerOver", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSPointerUp", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "ariarequest", listener: (this: this, ev: AriaRequestEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "command", listener: (this: this, ev: CommandEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "gotpointercapture", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "lostpointercapture", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pointercancel", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pointerdown", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pointerenter", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pointerleave", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pointermove", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pointerout", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pointerover", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pointerup", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "touchcancel", listener: (this: this, ev: TouchEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "touchend", listener: (this: this, ev: TouchEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "touchmove", listener: (this: this, ev: TouchEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "touchstart", listener: (this: this, ev: TouchEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "webkitfullscreenchange", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "webkitfullscreenerror", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "wheel", listener: (this: this, ev: WheelEvent) => any, useCapture?: boolean): void;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var Element: {
    prototype: Element;
    new(): Element;
}

interface ErrorEvent extends Event {
    readonly colno: number;
    readonly error: any;
    readonly filename: string;
    readonly lineno: number;
    readonly message: string;
    initErrorEvent(typeArg: string, canBubbleArg: boolean, cancelableArg: boolean, messageArg: string, filenameArg: string, linenoArg: number): void;
}

declare var ErrorEvent: {
    prototype: ErrorEvent;
    new(): ErrorEvent;
}

interface Event {
    readonly bubbles: boolean;
    cancelBubble: boolean;
    readonly cancelable: boolean;
    readonly currentTarget: EventTarget;
    readonly defaultPrevented: boolean;
    readonly eventPhase: number;
    readonly isTrusted: boolean;
    returnValue: boolean;
    readonly srcElement: Element | null;
    readonly target: EventTarget;
    readonly timeStamp: number;
    readonly type: string;
    initEvent(eventTypeArg: string, canBubbleArg: boolean, cancelableArg: boolean): void;
    preventDefault(): void;
    stopImmediatePropagation(): void;
    stopPropagation(): void;
    readonly AT_TARGET: number;
    readonly BUBBLING_PHASE: number;
    readonly CAPTURING_PHASE: number;
}

declare var Event: {
    prototype: Event;
    new(type: string, eventInitDict?: EventInit): Event;
    readonly AT_TARGET: number;
    readonly BUBBLING_PHASE: number;
    readonly CAPTURING_PHASE: number;
}

interface EventTarget {
    addEventListener(type: string, listener?: EventListenerOrEventListenerObject, useCapture?: boolean): void;
    dispatchEvent(evt: Event): boolean;
    removeEventListener(type: string, listener?: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var EventTarget: {
    prototype: EventTarget;
    new(): EventTarget;
}

interface External {
}

declare var External: {
    prototype: External;
    new(): External;
}

interface File extends Blob {
    readonly lastModifiedDate: any;
    readonly name: string;
    readonly webkitRelativePath: string;
}

declare var File: {
    prototype: File;
    new (parts: (ArrayBuffer | ArrayBufferView | Blob | string)[], filename: string, properties?: FilePropertyBag): File;
}

interface FileList {
    readonly length: number;
    item(index: number): File;
    [index: number]: File;
}

declare var FileList: {
    prototype: FileList;
    new(): FileList;
}

interface FileReader extends EventTarget, MSBaseReader {
    readonly error: DOMError;
    readAsArrayBuffer(blob: Blob): void;
    readAsBinaryString(blob: Blob): void;
    readAsDataURL(blob: Blob): void;
    readAsText(blob: Blob, encoding?: string): void;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var FileReader: {
    prototype: FileReader;
    new(): FileReader;
}

interface FocusEvent extends UIEvent {
    readonly relatedTarget: EventTarget;
    initFocusEvent(typeArg: string, canBubbleArg: boolean, cancelableArg: boolean, viewArg: Window, detailArg: number, relatedTargetArg: EventTarget): void;
}

declare var FocusEvent: {
    prototype: FocusEvent;
    new(typeArg: string, eventInitDict?: FocusEventInit): FocusEvent;
}

interface FormData {
    append(name: any, value: any, blobName?: string): void;
}

declare var FormData: {
    prototype: FormData;
    new (form?: HTMLFormElement): FormData;
}

interface GainNode extends AudioNode {
    readonly gain: AudioParam;
}

declare var GainNode: {
    prototype: GainNode;
    new(): GainNode;
}

interface Gamepad {
    readonly axes: number[];
    readonly buttons: GamepadButton[];
    readonly connected: boolean;
    readonly id: string;
    readonly index: number;
    readonly mapping: string;
    readonly timestamp: number;
}

declare var Gamepad: {
    prototype: Gamepad;
    new(): Gamepad;
}

interface GamepadButton {
    readonly pressed: boolean;
    readonly value: number;
}

declare var GamepadButton: {
    prototype: GamepadButton;
    new(): GamepadButton;
}

interface GamepadEvent extends Event {
    readonly gamepad: Gamepad;
}

declare var GamepadEvent: {
    prototype: GamepadEvent;
    new(): GamepadEvent;
}

interface Geolocation {
    clearWatch(watchId: number): void;
    getCurrentPosition(successCallback: PositionCallback, errorCallback?: PositionErrorCallback, options?: PositionOptions): void;
    watchPosition(successCallback: PositionCallback, errorCallback?: PositionErrorCallback, options?: PositionOptions): number;
}

declare var Geolocation: {
    prototype: Geolocation;
    new(): Geolocation;
}

interface HTMLAllCollection extends HTMLCollection {
    namedItem(name: string): Element;
}

declare var HTMLAllCollection: {
    prototype: HTMLAllCollection;
    new(): HTMLAllCollection;
}

interface HTMLAnchorElement extends HTMLElement {
    Methods: string;
    /**
      * Sets or retrieves the character set used to encode the object.
      */
    charset: string;
    /**
      * Sets or retrieves the coordinates of the object.
      */
    coords: string;
    download: string;
    /**
      * Contains the anchor portion of the URL including the hash sign (#).
      */
    hash: string;
    /**
      * Contains the hostname and port values of the URL.
      */
    host: string;
    /**
      * Contains the hostname of a URL.
      */
    hostname: string;
    /**
      * Sets or retrieves a destination URL or an anchor point.
      */
    href: string;
    /**
      * Sets or retrieves the language code of the object.
      */
    hreflang: string;
    readonly mimeType: string;
    /**
      * Sets or retrieves the shape of the object.
      */
    name: string;
    readonly nameProp: string;
    /**
      * Contains the pathname of the URL.
      */
    pathname: string;
    /**
      * Sets or retrieves the port number associated with a URL.
      */
    port: string;
    /**
      * Contains the protocol of the URL.
      */
    protocol: string;
    readonly protocolLong: string;
    /**
      * Sets or retrieves the relationship between the object and the destination of the link.
      */
    rel: string;
    /**
      * Sets or retrieves the relationship between the object and the destination of the link.
      */
    rev: string;
    /**
      * Sets or retrieves the substring of the href property that follows the question mark.
      */
    search: string;
    /**
      * Sets or retrieves the shape of the object.
      */
    shape: string;
    /**
      * Sets or retrieves the window or frame at which to target content.
      */
    target: string;
    /**
      * Retrieves or sets the text of the object as a string.
      */
    text: string;
    type: string;
    urn: string;
    /**
      * Returns a string representation of an object.
      */
    toString(): string;
}

declare var HTMLAnchorElement: {
    prototype: HTMLAnchorElement;
    new(): HTMLAnchorElement;
}

interface HTMLAppletElement extends HTMLElement {
    /**
      * Retrieves a string of the URL where the object tag can be found. This is often the href of the document that the object is in, or the value set by a base element.
      */
    readonly BaseHref: string;
    align: string;
    /**
      * Sets or retrieves a text alternative to the graphic.
      */
    alt: string;
    /**
      * Gets or sets the optional alternative HTML script to execute if the object fails to load.
      */
    altHtml: string;
    /**
      * Sets or retrieves a character string that can be used to implement your own archive functionality for the object.
      */
    archive: string;
    border: string;
    code: string;
    /**
      * Sets or retrieves the URL of the component.
      */
    codeBase: string;
    /**
      * Sets or retrieves the Internet media type for the code associated with the object.
      */
    codeType: string;
    /**
      * Address of a pointer to the document this page or frame contains. If there is no document, then null will be returned.
      */
    readonly contentDocument: Document;
    /**
      * Sets or retrieves the URL that references the data of the object.
      */
    data: string;
    /**
      * Sets or retrieves a character string that can be used to implement your own declare functionality for the object.
      */
    declare: boolean;
    readonly form: HTMLFormElement;
    /**
      * Sets or retrieves the height of the object.
      */
    height: string;
    hspace: number;
    /**
      * Sets or retrieves the shape of the object.
      */
    name: string;
    object: string | null;
    /**
      * Sets or retrieves a message to be displayed while an object is loading.
      */
    standby: string;
    /**
      * Returns the content type of the object.
      */
    type: string;
    /**
      * Sets or retrieves the URL, often with a bookmark extension (#name), to use as a client-side image map.
      */
    useMap: string;
    vspace: number;
    width: number;
}

declare var HTMLAppletElement: {
    prototype: HTMLAppletElement;
    new(): HTMLAppletElement;
}

interface HTMLAreaElement extends HTMLElement {
    /**
      * Sets or retrieves a text alternative to the graphic.
      */
    alt: string;
    /**
      * Sets or retrieves the coordinates of the object.
      */
    coords: string;
    download: string;
    /**
      * Sets or retrieves the subsection of the href property that follows the number sign (#).
      */
    hash: string;
    /**
      * Sets or retrieves the hostname and port number of the location or URL.
      */
    host: string;
    /**
      * Sets or retrieves the host name part of the location or URL.
      */
    hostname: string;
    /**
      * Sets or retrieves a destination URL or an anchor point.
      */
    href: string;
    /**
      * Sets or gets whether clicks in this region cause action.
      */
    noHref: boolean;
    /**
      * Sets or retrieves the file name or path specified by the object.
      */
    pathname: string;
    /**
      * Sets or retrieves the port number associated with a URL.
      */
    port: string;
    /**
      * Sets or retrieves the protocol portion of a URL.
      */
    protocol: string;
    rel: string;
    /**
      * Sets or retrieves the substring of the href property that follows the question mark.
      */
    search: string;
    /**
      * Sets or retrieves the shape of the object.
      */
    shape: string;
    /**
      * Sets or retrieves the window or frame at which to target content.
      */
    target: string;
    /**
      * Returns a string representation of an object.
      */
    toString(): string;
}

declare var HTMLAreaElement: {
    prototype: HTMLAreaElement;
    new(): HTMLAreaElement;
}

interface HTMLAreasCollection extends HTMLCollection {
    /**
      * Adds an element to the areas, controlRange, or options collection.
      */
    add(element: HTMLElement, before?: HTMLElement | number): void;
    /**
      * Removes an element from the collection.
      */
    remove(index?: number): void;
}

declare var HTMLAreasCollection: {
    prototype: HTMLAreasCollection;
    new(): HTMLAreasCollection;
}

interface HTMLAudioElement extends HTMLMediaElement {
}

declare var HTMLAudioElement: {
    prototype: HTMLAudioElement;
    new(): HTMLAudioElement;
}

interface HTMLBRElement extends HTMLElement {
    /**
      * Sets or retrieves the side on which floating objects are not to be positioned when any IHTMLBlockElement is inserted into the document.
      */
    clear: string;
}

declare var HTMLBRElement: {
    prototype: HTMLBRElement;
    new(): HTMLBRElement;
}

interface HTMLBaseElement extends HTMLElement {
    /**
      * Gets or sets the baseline URL on which relative links are based.
      */
    href: string;
    /**
      * Sets or retrieves the window or frame at which to target content.
      */
    target: string;
}

declare var HTMLBaseElement: {
    prototype: HTMLBaseElement;
    new(): HTMLBaseElement;
}

interface HTMLBaseFontElement extends HTMLElement, DOML2DeprecatedColorProperty {
    /**
      * Sets or retrieves the current typeface family.
      */
    face: string;
    /**
      * Sets or retrieves the font size of the object.
      */
    size: number;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var HTMLBaseFontElement: {
    prototype: HTMLBaseFontElement;
    new(): HTMLBaseFontElement;
}

interface HTMLBodyElement extends HTMLElement {
    aLink: any;
    background: string;
    bgColor: any;
    bgProperties: string;
    link: any;
    noWrap: boolean;
    onafterprint: (this: this, ev: Event) => any;
    onbeforeprint: (this: this, ev: Event) => any;
    onbeforeunload: (this: this, ev: BeforeUnloadEvent) => any;
    onblur: (this: this, ev: FocusEvent) => any;
    onerror: (this: this, ev: ErrorEvent) => any;
    onfocus: (this: this, ev: FocusEvent) => any;
    onhashchange: (this: this, ev: HashChangeEvent) => any;
    onload: (this: this, ev: Event) => any;
    onmessage: (this: this, ev: MessageEvent) => any;
    onoffline: (this: this, ev: Event) => any;
    ononline: (this: this, ev: Event) => any;
    onorientationchange: (this: this, ev: Event) => any;
    onpagehide: (this: this, ev: PageTransitionEvent) => any;
    onpageshow: (this: this, ev: PageTransitionEvent) => any;
    onpopstate: (this: this, ev: PopStateEvent) => any;
    onresize: (this: this, ev: UIEvent) => any;
    onstorage: (this: this, ev: StorageEvent) => any;
    onunload: (this: this, ev: Event) => any;
    text: any;
    vLink: any;
    addEventListener(type: "MSContentZoom", listener: (this: this, ev: UIEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSGestureChange", listener: (this: this, ev: MSGestureEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSGestureDoubleTap", listener: (this: this, ev: MSGestureEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSGestureEnd", listener: (this: this, ev: MSGestureEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSGestureHold", listener: (this: this, ev: MSGestureEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSGestureStart", listener: (this: this, ev: MSGestureEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSGestureTap", listener: (this: this, ev: MSGestureEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSGotPointerCapture", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSInertiaStart", listener: (this: this, ev: MSGestureEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSLostPointerCapture", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSManipulationStateChanged", listener: (this: this, ev: MSManipulationEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSPointerCancel", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSPointerDown", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSPointerEnter", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSPointerLeave", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSPointerMove", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSPointerOut", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSPointerOver", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSPointerUp", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "abort", listener: (this: this, ev: UIEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "activate", listener: (this: this, ev: UIEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "afterprint", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "ariarequest", listener: (this: this, ev: AriaRequestEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "beforeactivate", listener: (this: this, ev: UIEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "beforecopy", listener: (this: this, ev: ClipboardEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "beforecut", listener: (this: this, ev: ClipboardEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "beforedeactivate", listener: (this: this, ev: UIEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "beforepaste", listener: (this: this, ev: ClipboardEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "beforeprint", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "beforeunload", listener: (this: this, ev: BeforeUnloadEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "blur", listener: (this: this, ev: FocusEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "blur", listener: (this: this, ev: FocusEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "canplay", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "canplaythrough", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "change", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "click", listener: (this: this, ev: MouseEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "command", listener: (this: this, ev: CommandEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "contextmenu", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "copy", listener: (this: this, ev: ClipboardEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "cuechange", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "cut", listener: (this: this, ev: ClipboardEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "dblclick", listener: (this: this, ev: MouseEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "deactivate", listener: (this: this, ev: UIEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "drag", listener: (this: this, ev: DragEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "dragend", listener: (this: this, ev: DragEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "dragenter", listener: (this: this, ev: DragEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "dragleave", listener: (this: this, ev: DragEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "dragover", listener: (this: this, ev: DragEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "dragstart", listener: (this: this, ev: DragEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "drop", listener: (this: this, ev: DragEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "durationchange", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "emptied", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "ended", listener: (this: this, ev: MediaStreamErrorEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "error", listener: (this: this, ev: ErrorEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "error", listener: (this: this, ev: ErrorEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "focus", listener: (this: this, ev: FocusEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "focus", listener: (this: this, ev: FocusEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "gotpointercapture", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "hashchange", listener: (this: this, ev: HashChangeEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "input", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "invalid", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "keydown", listener: (this: this, ev: KeyboardEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "keypress", listener: (this: this, ev: KeyboardEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "keyup", listener: (this: this, ev: KeyboardEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "load", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "load", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "loadeddata", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "loadedmetadata", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "loadstart", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "lostpointercapture", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "message", listener: (this: this, ev: MessageEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "mousedown", listener: (this: this, ev: MouseEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "mouseenter", listener: (this: this, ev: MouseEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "mouseleave", listener: (this: this, ev: MouseEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "mousemove", listener: (this: this, ev: MouseEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "mouseout", listener: (this: this, ev: MouseEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "mouseover", listener: (this: this, ev: MouseEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "mouseup", listener: (this: this, ev: MouseEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "mousewheel", listener: (this: this, ev: WheelEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "offline", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "online", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "orientationchange", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "pagehide", listener: (this: this, ev: PageTransitionEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pageshow", listener: (this: this, ev: PageTransitionEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "paste", listener: (this: this, ev: ClipboardEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pause", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "play", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "playing", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "pointercancel", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pointerdown", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pointerenter", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pointerleave", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pointermove", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pointerout", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pointerover", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pointerup", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "popstate", listener: (this: this, ev: PopStateEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "progress", listener: (this: this, ev: ProgressEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "ratechange", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "reset", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "resize", listener: (this: this, ev: UIEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "scroll", listener: (this: this, ev: UIEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "seeked", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "seeking", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "select", listener: (this: this, ev: UIEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "selectstart", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "stalled", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "storage", listener: (this: this, ev: StorageEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "submit", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "suspend", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "timeupdate", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "touchcancel", listener: (this: this, ev: TouchEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "touchend", listener: (this: this, ev: TouchEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "touchmove", listener: (this: this, ev: TouchEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "touchstart", listener: (this: this, ev: TouchEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "unload", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "volumechange", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "waiting", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "webkitfullscreenchange", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "webkitfullscreenerror", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "wheel", listener: (this: this, ev: WheelEvent) => any, useCapture?: boolean): void;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var HTMLBodyElement: {
    prototype: HTMLBodyElement;
    new(): HTMLBodyElement;
}

interface HTMLButtonElement extends HTMLElement {
    /**
      * Provides a way to direct a user to a specific field when a document loads. This can provide both direction and convenience for a user, reducing the need to click or tab to a field when a page opens. This attribute is true when present on an element, and false when missing.
      */
    autofocus: boolean;
    disabled: boolean;
    /**
      * Retrieves a reference to the form that the object is embedded in.
      */
    readonly form: HTMLFormElement;
    /**
      * Overrides the action attribute (where the data on a form is sent) on the parent form element.
      */
    formAction: string;
    /**
      * Used to override the encoding (formEnctype attribute) specified on the form element.
      */
    formEnctype: string;
    /**
      * Overrides the submit method attribute previously specified on a form element.
      */
    formMethod: string;
    /**
      * Overrides any validation or required attributes on a form or form elements to allow it to be submitted without validation. This can be used to create a "save draft"-type submit option.
      */
    formNoValidate: string;
    /**
      * Overrides the target attribute on a form element.
      */
    formTarget: string;
    /**
      * Sets or retrieves the name of the object.
      */
    name: string;
    status: any;
    /**
      * Gets the classification and default behavior of the button.
      */
    type: string;
    /**
      * Returns the error message that would be displayed if the user submits the form, or an empty string if no error message. It also triggers the standard error message, such as "this is a required field". The result is that the user sees validation messages without actually submitting.
      */
    readonly validationMessage: string;
    /**
      * Returns a  ValidityState object that represents the validity states of an element.
      */
    readonly validity: ValidityState;
    /**
      * Sets or retrieves the default or selected value of the control.
      */
    value: string;
    /**
      * Returns whether an element will successfully validate based on forms validation rules and constraints.
      */
    readonly willValidate: boolean;
    /**
      * Returns whether a form will validate when it is submitted, without having to submit it.
      */
    checkValidity(): boolean;
    /**
      * Sets a custom error message that is displayed when a form is submitted.
      * @param error Sets a custom error message that is displayed when a form is submitted.
      */
    setCustomValidity(error: string): void;
}

declare var HTMLButtonElement: {
    prototype: HTMLButtonElement;
    new(): HTMLButtonElement;
}

interface HTMLCanvasElement extends HTMLElement {
    /**
      * Gets or sets the height of a canvas element on a document.
      */
    height: number;
    /**
      * Gets or sets the width of a canvas element on a document.
      */
    width: number;
    /**
      * Returns an object that provides methods and properties for drawing and manipulating images and graphics on a canvas element in a document. A context object includes information about colors, line widths, fonts, and other graphic parameters that can be drawn on a canvas.
      * @param contextId The identifier (ID) of the type of canvas to create. Internet Explorer 9 and Internet Explorer 10 support only a 2-D context using canvas.getContext("2d"); IE11 Preview also supports 3-D or WebGL context using canvas.getContext("experimental-webgl");
      */
    getContext(contextId: "2d", contextAttributes?: Canvas2DContextAttributes): CanvasRenderingContext2D | null;
    getContext(contextId: "webgl" | "experimental-webgl", contextAttributes?: WebGLContextAttributes): WebGLRenderingContext | null;
    getContext(contextId: string, contextAttributes?: {}): CanvasRenderingContext2D | WebGLRenderingContext | null;
    /**
      * Returns a blob object encoded as a Portable Network Graphics (PNG) format from a canvas image or drawing.
      */
    msToBlob(): Blob;
    /**
      * Returns the content of the current canvas as an image that you can use as a source for another canvas or an HTML element.
      * @param type The standard MIME type for the image format to return. If you do not specify this parameter, the default value is a PNG format image.
      */
    toDataURL(type?: string, ...args: any[]): string;
    toBlob(callback: (result: Blob | null) => void, type?: string, ...arguments: any[]): void;
}

declare var HTMLCanvasElement: {
    prototype: HTMLCanvasElement;
    new(): HTMLCanvasElement;
}

interface HTMLCollection {
    /**
      * Sets or retrieves the number of objects in a collection.
      */
    readonly length: number;
    /**
      * Retrieves an object from various collections.
      */
    item(index: number): Element;
    /**
      * Retrieves a select object or an object from an options collection.
      */
    namedItem(name: string): Element;
    [index: number]: Element;
}

declare var HTMLCollection: {
    prototype: HTMLCollection;
    new(): HTMLCollection;
}

interface HTMLDListElement extends HTMLElement {
    compact: boolean;
}

declare var HTMLDListElement: {
    prototype: HTMLDListElement;
    new(): HTMLDListElement;
}

interface HTMLDataListElement extends HTMLElement {
    options: HTMLCollectionOf<HTMLOptionElement>;
}

declare var HTMLDataListElement: {
    prototype: HTMLDataListElement;
    new(): HTMLDataListElement;
}

interface HTMLDirectoryElement extends HTMLElement {
    compact: boolean;
}

declare var HTMLDirectoryElement: {
    prototype: HTMLDirectoryElement;
    new(): HTMLDirectoryElement;
}

interface HTMLDivElement extends HTMLElement {
    /**
      * Sets or retrieves how the object is aligned with adjacent text.
      */
    align: string;
    /**
      * Sets or retrieves whether the browser automatically performs wordwrap.
      */
    noWrap: boolean;
}

declare var HTMLDivElement: {
    prototype: HTMLDivElement;
    new(): HTMLDivElement;
}

interface HTMLDocument extends Document {
}

declare var HTMLDocument: {
    prototype: HTMLDocument;
    new(): HTMLDocument;
}

interface HTMLElement extends Element {
    accessKey: string;
    readonly children: HTMLCollection;
    contentEditable: string;
    readonly dataset: DOMStringMap;
    dir: string;
    draggable: boolean;
    hidden: boolean;
    hideFocus: boolean;
    innerHTML: string;
    innerText: string;
    readonly isContentEditable: boolean;
    lang: string;
    readonly offsetHeight: number;
    readonly offsetLeft: number;
    readonly offsetParent: Element;
    readonly offsetTop: number;
    readonly offsetWidth: number;
    onabort: (this: this, ev: UIEvent) => any;
    onactivate: (this: this, ev: UIEvent) => any;
    onbeforeactivate: (this: this, ev: UIEvent) => any;
    onbeforecopy: (this: this, ev: ClipboardEvent) => any;
    onbeforecut: (this: this, ev: ClipboardEvent) => any;
    onbeforedeactivate: (this: this, ev: UIEvent) => any;
    onbeforepaste: (this: this, ev: ClipboardEvent) => any;
    onblur: (this: this, ev: FocusEvent) => any;
    oncanplay: (this: this, ev: Event) => any;
    oncanplaythrough: (this: this, ev: Event) => any;
    onchange: (this: this, ev: Event) => any;
    onclick: (this: this, ev: MouseEvent) => any;
    oncontextmenu: (this: this, ev: PointerEvent) => any;
    oncopy: (this: this, ev: ClipboardEvent) => any;
    oncuechange: (this: this, ev: Event) => any;
    oncut: (this: this, ev: ClipboardEvent) => any;
    ondblclick: (this: this, ev: MouseEvent) => any;
    ondeactivate: (this: this, ev: UIEvent) => any;
    ondrag: (this: this, ev: DragEvent) => any;
    ondragend: (this: this, ev: DragEvent) => any;
    ondragenter: (this: this, ev: DragEvent) => any;
    ondragleave: (this: this, ev: DragEvent) => any;
    ondragover: (this: this, ev: DragEvent) => any;
    ondragstart: (this: this, ev: DragEvent) => any;
    ondrop: (this: this, ev: DragEvent) => any;
    ondurationchange: (this: this, ev: Event) => any;
    onemptied: (this: this, ev: Event) => any;
    onended: (this: this, ev: MediaStreamErrorEvent) => any;
    onerror: (this: this, ev: ErrorEvent) => any;
    onfocus: (this: this, ev: FocusEvent) => any;
    oninput: (this: this, ev: Event) => any;
    oninvalid: (this: this, ev: Event) => any;
    onkeydown: (this: this, ev: KeyboardEvent) => any;
    onkeypress: (this: this, ev: KeyboardEvent) => any;
    onkeyup: (this: this, ev: KeyboardEvent) => any;
    onload: (this: this, ev: Event) => any;
    onloadeddata: (this: this, ev: Event) => any;
    onloadedmetadata: (this: this, ev: Event) => any;
    onloadstart: (this: this, ev: Event) => any;
    onmousedown: (this: this, ev: MouseEvent) => any;
    onmouseenter: (this: this, ev: MouseEvent) => any;
    onmouseleave: (this: this, ev: MouseEvent) => any;
    onmousemove: (this: this, ev: MouseEvent) => any;
    onmouseout: (this: this, ev: MouseEvent) => any;
    onmouseover: (this: this, ev: MouseEvent) => any;
    onmouseup: (this: this, ev: MouseEvent) => any;
    onmousewheel: (this: this, ev: WheelEvent) => any;
    onmscontentzoom: (this: this, ev: UIEvent) => any;
    onmsmanipulationstatechanged: (this: this, ev: MSManipulationEvent) => any;
    onpaste: (this: this, ev: ClipboardEvent) => any;
    onpause: (this: this, ev: Event) => any;
    onplay: (this: this, ev: Event) => any;
    onplaying: (this: this, ev: Event) => any;
    onprogress: (this: this, ev: ProgressEvent) => any;
    onratechange: (this: this, ev: Event) => any;
    onreset: (this: this, ev: Event) => any;
    onscroll: (this: this, ev: UIEvent) => any;
    onseeked: (this: this, ev: Event) => any;
    onseeking: (this: this, ev: Event) => any;
    onselect: (this: this, ev: UIEvent) => any;
    onselectstart: (this: this, ev: Event) => any;
    onstalled: (this: this, ev: Event) => any;
    onsubmit: (this: this, ev: Event) => any;
    onsuspend: (this: this, ev: Event) => any;
    ontimeupdate: (this: this, ev: Event) => any;
    onvolumechange: (this: this, ev: Event) => any;
    onwaiting: (this: this, ev: Event) => any;
    outerHTML: string;
    outerText: string;
    spellcheck: boolean;
    readonly style: CSSStyleDeclaration;
    tabIndex: number;
    title: string;
    blur(): void;
    click(): void;
    dragDrop(): boolean;
    focus(): void;
    msGetInputContext(): MSInputMethodContext;
    setActive(): void;
    addEventListener(type: "MSContentZoom", listener: (this: this, ev: UIEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSGestureChange", listener: (this: this, ev: MSGestureEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSGestureDoubleTap", listener: (this: this, ev: MSGestureEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSGestureEnd", listener: (this: this, ev: MSGestureEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSGestureHold", listener: (this: this, ev: MSGestureEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSGestureStart", listener: (this: this, ev: MSGestureEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSGestureTap", listener: (this: this, ev: MSGestureEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSGotPointerCapture", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSInertiaStart", listener: (this: this, ev: MSGestureEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSLostPointerCapture", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSManipulationStateChanged", listener: (this: this, ev: MSManipulationEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSPointerCancel", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSPointerDown", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSPointerEnter", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSPointerLeave", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSPointerMove", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSPointerOut", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSPointerOver", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSPointerUp", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "abort", listener: (this: this, ev: UIEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "activate", listener: (this: this, ev: UIEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "ariarequest", listener: (this: this, ev: AriaRequestEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "beforeactivate", listener: (this: this, ev: UIEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "beforecopy", listener: (this: this, ev: ClipboardEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "beforecut", listener: (this: this, ev: ClipboardEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "beforedeactivate", listener: (this: this, ev: UIEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "beforepaste", listener: (this: this, ev: ClipboardEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "blur", listener: (this: this, ev: FocusEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "canplay", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "canplaythrough", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "change", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "click", listener: (this: this, ev: MouseEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "command", listener: (this: this, ev: CommandEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "contextmenu", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "copy", listener: (this: this, ev: ClipboardEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "cuechange", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "cut", listener: (this: this, ev: ClipboardEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "dblclick", listener: (this: this, ev: MouseEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "deactivate", listener: (this: this, ev: UIEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "drag", listener: (this: this, ev: DragEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "dragend", listener: (this: this, ev: DragEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "dragenter", listener: (this: this, ev: DragEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "dragleave", listener: (this: this, ev: DragEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "dragover", listener: (this: this, ev: DragEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "dragstart", listener: (this: this, ev: DragEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "drop", listener: (this: this, ev: DragEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "durationchange", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "emptied", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "ended", listener: (this: this, ev: MediaStreamErrorEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "error", listener: (this: this, ev: ErrorEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "focus", listener: (this: this, ev: FocusEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "gotpointercapture", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "input", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "invalid", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "keydown", listener: (this: this, ev: KeyboardEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "keypress", listener: (this: this, ev: KeyboardEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "keyup", listener: (this: this, ev: KeyboardEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "load", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "loadeddata", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "loadedmetadata", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "loadstart", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "lostpointercapture", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "mousedown", listener: (this: this, ev: MouseEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "mouseenter", listener: (this: this, ev: MouseEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "mouseleave", listener: (this: this, ev: MouseEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "mousemove", listener: (this: this, ev: MouseEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "mouseout", listener: (this: this, ev: MouseEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "mouseover", listener: (this: this, ev: MouseEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "mouseup", listener: (this: this, ev: MouseEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "mousewheel", listener: (this: this, ev: WheelEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "paste", listener: (this: this, ev: ClipboardEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pause", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "play", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "playing", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "pointercancel", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pointerdown", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pointerenter", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pointerleave", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pointermove", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pointerout", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pointerover", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pointerup", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "progress", listener: (this: this, ev: ProgressEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "ratechange", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "reset", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "scroll", listener: (this: this, ev: UIEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "seeked", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "seeking", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "select", listener: (this: this, ev: UIEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "selectstart", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "stalled", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "submit", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "suspend", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "timeupdate", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "touchcancel", listener: (this: this, ev: TouchEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "touchend", listener: (this: this, ev: TouchEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "touchmove", listener: (this: this, ev: TouchEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "touchstart", listener: (this: this, ev: TouchEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "volumechange", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "waiting", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "webkitfullscreenchange", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "webkitfullscreenerror", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "wheel", listener: (this: this, ev: WheelEvent) => any, useCapture?: boolean): void;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var HTMLElement: {
    prototype: HTMLElement;
    new(): HTMLElement;
}

interface HTMLEmbedElement extends HTMLElement, GetSVGDocument {
    /**
      * Sets or retrieves the height of the object.
      */
    height: string;
    hidden: any;
    /**
      * Gets or sets whether the DLNA PlayTo device is available.
      */
    msPlayToDisabled: boolean;
    /**
      * Gets or sets the path to the preferred media source. This enables the Play To target device to stream the media content, which can be DRM protected, from a different location, such as a cloud media server.
      */
    msPlayToPreferredSourceUri: string;
    /**
      * Gets or sets the primary DLNA PlayTo device.
      */
    msPlayToPrimary: boolean;
    /**
      * Gets the source associated with the media element for use by the PlayToManager.
      */
    readonly msPlayToSource: any;
    /**
      * Sets or retrieves the name of the object.
      */
    name: string;
    /**
      * Retrieves the palette used for the embedded document.
      */
    readonly palette: string;
    /**
      * Retrieves the URL of the plug-in used to view an embedded document.
      */
    readonly pluginspage: string;
    readonly readyState: string;
    /**
      * Sets or retrieves a URL to be loaded by the object.
      */
    src: string;
    /**
      * Sets or retrieves the height and width units of the embed object.
      */
    units: string;
    /**
      * Sets or retrieves the width of the object.
      */
    width: string;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var HTMLEmbedElement: {
    prototype: HTMLEmbedElement;
    new(): HTMLEmbedElement;
}

interface HTMLFieldSetElement extends HTMLElement {
    /**
      * Sets or retrieves how the object is aligned with adjacent text.
      */
    align: string;
    disabled: boolean;
    /**
      * Retrieves a reference to the form that the object is embedded in.
      */
    readonly form: HTMLFormElement;
    /**
      * Returns the error message that would be displayed if the user submits the form, or an empty string if no error message. It also triggers the standard error message, such as "this is a required field". The result is that the user sees validation messages without actually submitting.
      */
    readonly validationMessage: string;
    /**
      * Returns a  ValidityState object that represents the validity states of an element.
      */
    readonly validity: ValidityState;
    /**
      * Returns whether an element will successfully validate based on forms validation rules and constraints.
      */
    readonly willValidate: boolean;
    /**
      * Returns whether a form will validate when it is submitted, without having to submit it.
      */
    checkValidity(): boolean;
    /**
      * Sets a custom error message that is displayed when a form is submitted.
      * @param error Sets a custom error message that is displayed when a form is submitted.
      */
    setCustomValidity(error: string): void;
}

declare var HTMLFieldSetElement: {
    prototype: HTMLFieldSetElement;
    new(): HTMLFieldSetElement;
}

interface HTMLFontElement extends HTMLElement, DOML2DeprecatedColorProperty, DOML2DeprecatedSizeProperty {
    /**
      * Sets or retrieves the current typeface family.
      */
    face: string;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var HTMLFontElement: {
    prototype: HTMLFontElement;
    new(): HTMLFontElement;
}

interface HTMLFormElement extends HTMLElement {
    /**
      * Sets or retrieves a list of character encodings for input data that must be accepted by the server processing the form.
      */
    acceptCharset: string;
    /**
      * Sets or retrieves the URL to which the form content is sent for processing.
      */
    action: string;
    /**
      * Specifies whether autocomplete is applied to an editable text field.
      */
    autocomplete: string;
    /**
      * Retrieves a collection, in source order, of all controls in a given form.
      */
    readonly elements: HTMLCollection;
    /**
      * Sets or retrieves the MIME encoding for the form.
      */
    encoding: string;
    /**
      * Sets or retrieves the encoding type for the form.
      */
    enctype: string;
    /**
      * Sets or retrieves the number of objects in a collection.
      */
    readonly length: number;
    /**
      * Sets or retrieves how to send the form data to the server.
      */
    method: string;
    /**
      * Sets or retrieves the name of the object.
      */
    name: string;
    /**
      * Designates a form that is not validated when submitted.
      */
    noValidate: boolean;
    /**
      * Sets or retrieves the window or frame at which to target content.
      */
    target: string;
    /**
      * Returns whether a form will validate when it is submitted, without having to submit it.
      */
    checkValidity(): boolean;
    /**
      * Retrieves a form object or an object from an elements collection.
      * @param name Variant of type Number or String that specifies the object or collection to retrieve. If this parameter is a Number, it is the zero-based index of the object. If this parameter is a string, all objects with matching name or id properties are retrieved, and a collection is returned if more than one match is made.
      * @param index Variant of type Number that specifies the zero-based index of the object to retrieve when a collection is returned.
      */
    item(name?: any, index?: any): any;
    /**
      * Retrieves a form object or an object from an elements collection.
      */
    namedItem(name: string): any;
    /**
      * Fires when the user resets a form.
      */
    reset(): void;
    /**
      * Fires when a FORM is about to be submitted.
      */
    submit(): void;
    [name: string]: any;
}

declare var HTMLFormElement: {
    prototype: HTMLFormElement;
    new(): HTMLFormElement;
}

interface HTMLFrameElement extends HTMLElement, GetSVGDocument {
    /**
      * Specifies the properties of a border drawn around an object.
      */
    border: string;
    /**
      * Sets or retrieves the border color of the object.
      */
    borderColor: any;
    /**
      * Retrieves the document object of the page or frame.
      */
    readonly contentDocument: Document;
    /**
      * Retrieves the object of the specified.
      */
    readonly contentWindow: Window;
    /**
      * Sets or retrieves whether to display a border for the frame.
      */
    frameBorder: string;
    /**
      * Sets or retrieves the amount of additional space between the frames.
      */
    frameSpacing: any;
    /**
      * Sets or retrieves the height of the object.
      */
    height: string | number;
    /**
      * Sets or retrieves a URI to a long description of the object.
      */
    longDesc: string;
    /**
      * Sets or retrieves the top and bottom margin heights before displaying the text in a frame.
      */
    marginHeight: string;
    /**
      * Sets or retrieves the left and right margin widths before displaying the text in a frame.
      */
    marginWidth: string;
    /**
      * Sets or retrieves the frame name.
      */
    name: string;
    /**
      * Sets or retrieves whether the user can resize the frame.
      */
    noResize: boolean;
    /**
      * Raised when the object has been completely received from the server.
      */
    onload: (this: this, ev: Event) => any;
    /**
      * Sets or retrieves whether the frame can be scrolled.
      */
    scrolling: string;
    /**
      * Sets or retrieves a URL to be loaded by the object.
      */
    src: string;
    /**
      * Sets or retrieves the width of the object.
      */
    width: string | number;
    addEventListener(type: "MSContentZoom", listener: (this: this, ev: UIEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSGestureChange", listener: (this: this, ev: MSGestureEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSGestureDoubleTap", listener: (this: this, ev: MSGestureEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSGestureEnd", listener: (this: this, ev: MSGestureEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSGestureHold", listener: (this: this, ev: MSGestureEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSGestureStart", listener: (this: this, ev: MSGestureEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSGestureTap", listener: (this: this, ev: MSGestureEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSGotPointerCapture", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSInertiaStart", listener: (this: this, ev: MSGestureEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSLostPointerCapture", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSManipulationStateChanged", listener: (this: this, ev: MSManipulationEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSPointerCancel", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSPointerDown", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSPointerEnter", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSPointerLeave", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSPointerMove", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSPointerOut", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSPointerOver", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSPointerUp", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "abort", listener: (this: this, ev: UIEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "activate", listener: (this: this, ev: UIEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "ariarequest", listener: (this: this, ev: AriaRequestEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "beforeactivate", listener: (this: this, ev: UIEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "beforecopy", listener: (this: this, ev: ClipboardEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "beforecut", listener: (this: this, ev: ClipboardEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "beforedeactivate", listener: (this: this, ev: UIEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "beforepaste", listener: (this: this, ev: ClipboardEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "blur", listener: (this: this, ev: FocusEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "canplay", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "canplaythrough", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "change", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "click", listener: (this: this, ev: MouseEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "command", listener: (this: this, ev: CommandEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "contextmenu", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "copy", listener: (this: this, ev: ClipboardEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "cuechange", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "cut", listener: (this: this, ev: ClipboardEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "dblclick", listener: (this: this, ev: MouseEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "deactivate", listener: (this: this, ev: UIEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "drag", listener: (this: this, ev: DragEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "dragend", listener: (this: this, ev: DragEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "dragenter", listener: (this: this, ev: DragEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "dragleave", listener: (this: this, ev: DragEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "dragover", listener: (this: this, ev: DragEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "dragstart", listener: (this: this, ev: DragEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "drop", listener: (this: this, ev: DragEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "durationchange", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "emptied", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "ended", listener: (this: this, ev: MediaStreamErrorEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "error", listener: (this: this, ev: ErrorEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "focus", listener: (this: this, ev: FocusEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "gotpointercapture", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "input", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "invalid", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "keydown", listener: (this: this, ev: KeyboardEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "keypress", listener: (this: this, ev: KeyboardEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "keyup", listener: (this: this, ev: KeyboardEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "load", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "load", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "loadeddata", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "loadedmetadata", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "loadstart", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "lostpointercapture", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "mousedown", listener: (this: this, ev: MouseEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "mouseenter", listener: (this: this, ev: MouseEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "mouseleave", listener: (this: this, ev: MouseEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "mousemove", listener: (this: this, ev: MouseEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "mouseout", listener: (this: this, ev: MouseEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "mouseover", listener: (this: this, ev: MouseEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "mouseup", listener: (this: this, ev: MouseEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "mousewheel", listener: (this: this, ev: WheelEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "paste", listener: (this: this, ev: ClipboardEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pause", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "play", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "playing", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "pointercancel", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pointerdown", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pointerenter", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pointerleave", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pointermove", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pointerout", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pointerover", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pointerup", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "progress", listener: (this: this, ev: ProgressEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "ratechange", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "reset", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "scroll", listener: (this: this, ev: UIEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "seeked", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "seeking", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "select", listener: (this: this, ev: UIEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "selectstart", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "stalled", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "submit", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "suspend", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "timeupdate", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "touchcancel", listener: (this: this, ev: TouchEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "touchend", listener: (this: this, ev: TouchEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "touchmove", listener: (this: this, ev: TouchEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "touchstart", listener: (this: this, ev: TouchEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "volumechange", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "waiting", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "webkitfullscreenchange", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "webkitfullscreenerror", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "wheel", listener: (this: this, ev: WheelEvent) => any, useCapture?: boolean): void;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var HTMLFrameElement: {
    prototype: HTMLFrameElement;
    new(): HTMLFrameElement;
}

interface HTMLFrameSetElement extends HTMLElement {
    border: string;
    /**
      * Sets or retrieves the border color of the object.
      */
    borderColor: any;
    /**
      * Sets or retrieves the frame widths of the object.
      */
    cols: string;
    /**
      * Sets or retrieves whether to display a border for the frame.
      */
    frameBorder: string;
    /**
      * Sets or retrieves the amount of additional space between the frames.
      */
    frameSpacing: any;
    name: string;
    onafterprint: (this: this, ev: Event) => any;
    onbeforeprint: (this: this, ev: Event) => any;
    onbeforeunload: (this: this, ev: BeforeUnloadEvent) => any;
    /**
      * Fires when the object loses the input focus.
      */
    onblur: (this: this, ev: FocusEvent) => any;
    onerror: (this: this, ev: ErrorEvent) => any;
    /**
      * Fires when the object receives focus.
      */
    onfocus: (this: this, ev: FocusEvent) => any;
    onhashchange: (this: this, ev: HashChangeEvent) => any;
    onload: (this: this, ev: Event) => any;
    onmessage: (this: this, ev: MessageEvent) => any;
    onoffline: (this: this, ev: Event) => any;
    ononline: (this: this, ev: Event) => any;
    onorientationchange: (this: this, ev: Event) => any;
    onpagehide: (this: this, ev: PageTransitionEvent) => any;
    onpageshow: (this: this, ev: PageTransitionEvent) => any;
    onresize: (this: this, ev: UIEvent) => any;
    onstorage: (this: this, ev: StorageEvent) => any;
    onunload: (this: this, ev: Event) => any;
    /**
      * Sets or retrieves the frame heights of the object.
      */
    rows: string;
    addEventListener(type: "MSContentZoom", listener: (this: this, ev: UIEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSGestureChange", listener: (this: this, ev: MSGestureEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSGestureDoubleTap", listener: (this: this, ev: MSGestureEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSGestureEnd", listener: (this: this, ev: MSGestureEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSGestureHold", listener: (this: this, ev: MSGestureEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSGestureStart", listener: (this: this, ev: MSGestureEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSGestureTap", listener: (this: this, ev: MSGestureEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSGotPointerCapture", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSInertiaStart", listener: (this: this, ev: MSGestureEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSLostPointerCapture", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSManipulationStateChanged", listener: (this: this, ev: MSManipulationEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSPointerCancel", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSPointerDown", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSPointerEnter", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSPointerLeave", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSPointerMove", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSPointerOut", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSPointerOver", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSPointerUp", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "abort", listener: (this: this, ev: UIEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "activate", listener: (this: this, ev: UIEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "ariarequest", listener: (this: this, ev: AriaRequestEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "beforeactivate", listener: (this: this, ev: UIEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "beforecopy", listener: (this: this, ev: ClipboardEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "beforecut", listener: (this: this, ev: ClipboardEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "beforedeactivate", listener: (this: this, ev: UIEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "beforepaste", listener: (this: this, ev: ClipboardEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "beforeprint", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "beforeunload", listener: (this: this, ev: BeforeUnloadEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "blur", listener: (this: this, ev: FocusEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "blur", listener: (this: this, ev: FocusEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "canplay", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "canplaythrough", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "change", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "click", listener: (this: this, ev: MouseEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "command", listener: (this: this, ev: CommandEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "contextmenu", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "copy", listener: (this: this, ev: ClipboardEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "cuechange", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "cut", listener: (this: this, ev: ClipboardEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "dblclick", listener: (this: this, ev: MouseEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "deactivate", listener: (this: this, ev: UIEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "drag", listener: (this: this, ev: DragEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "dragend", listener: (this: this, ev: DragEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "dragenter", listener: (this: this, ev: DragEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "dragleave", listener: (this: this, ev: DragEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "dragover", listener: (this: this, ev: DragEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "dragstart", listener: (this: this, ev: DragEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "drop", listener: (this: this, ev: DragEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "durationchange", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "emptied", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "ended", listener: (this: this, ev: MediaStreamErrorEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "error", listener: (this: this, ev: ErrorEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "error", listener: (this: this, ev: ErrorEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "focus", listener: (this: this, ev: FocusEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "focus", listener: (this: this, ev: FocusEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "gotpointercapture", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "hashchange", listener: (this: this, ev: HashChangeEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "input", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "invalid", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "keydown", listener: (this: this, ev: KeyboardEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "keypress", listener: (this: this, ev: KeyboardEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "keyup", listener: (this: this, ev: KeyboardEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "load", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "load", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "loadeddata", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "loadedmetadata", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "loadstart", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "lostpointercapture", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "message", listener: (this: this, ev: MessageEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "mousedown", listener: (this: this, ev: MouseEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "mouseenter", listener: (this: this, ev: MouseEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "mouseleave", listener: (this: this, ev: MouseEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "mousemove", listener: (this: this, ev: MouseEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "mouseout", listener: (this: this, ev: MouseEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "mouseover", listener: (this: this, ev: MouseEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "mouseup", listener: (this: this, ev: MouseEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "mousewheel", listener: (this: this, ev: WheelEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "offline", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "online", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "orientationchange", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "pagehide", listener: (this: this, ev: PageTransitionEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pageshow", listener: (this: this, ev: PageTransitionEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "paste", listener: (this: this, ev: ClipboardEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pause", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "play", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "playing", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "pointercancel", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pointerdown", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pointerenter", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pointerleave", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pointermove", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pointerout", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pointerover", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pointerup", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "progress", listener: (this: this, ev: ProgressEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "ratechange", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "reset", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "resize", listener: (this: this, ev: UIEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "scroll", listener: (this: this, ev: UIEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "seeked", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "seeking", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "select", listener: (this: this, ev: UIEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "selectstart", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "stalled", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "storage", listener: (this: this, ev: StorageEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "submit", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "suspend", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "timeupdate", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "touchcancel", listener: (this: this, ev: TouchEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "touchend", listener: (this: this, ev: TouchEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "touchmove", listener: (this: this, ev: TouchEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "touchstart", listener: (this: this, ev: TouchEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "unload", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "volumechange", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "waiting", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "webkitfullscreenchange", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "webkitfullscreenerror", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "wheel", listener: (this: this, ev: WheelEvent) => any, useCapture?: boolean): void;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var HTMLFrameSetElement: {
    prototype: HTMLFrameSetElement;
    new(): HTMLFrameSetElement;
}

interface HTMLHRElement extends HTMLElement, DOML2DeprecatedColorProperty, DOML2DeprecatedSizeProperty {
    /**
      * Sets or retrieves how the object is aligned with adjacent text.
      */
    align: string;
    /**
      * Sets or retrieves whether the horizontal rule is drawn with 3-D shading.
      */
    noShade: boolean;
    /**
      * Sets or retrieves the width of the object.
      */
    width: number;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var HTMLHRElement: {
    prototype: HTMLHRElement;
    new(): HTMLHRElement;
}

interface HTMLHeadElement extends HTMLElement {
    profile: string;
}

declare var HTMLHeadElement: {
    prototype: HTMLHeadElement;
    new(): HTMLHeadElement;
}

interface HTMLHeadingElement extends HTMLElement {
    /**
      * Sets or retrieves a value that indicates the table alignment.
      */
    align: string;
}

declare var HTMLHeadingElement: {
    prototype: HTMLHeadingElement;
    new(): HTMLHeadingElement;
}

interface HTMLHtmlElement extends HTMLElement {
    /**
      * Sets or retrieves the DTD version that governs the current document.
      */
    version: string;
}

declare var HTMLHtmlElement: {
    prototype: HTMLHtmlElement;
    new(): HTMLHtmlElement;
}

interface HTMLIFrameElement extends HTMLElement, GetSVGDocument {
    /**
      * Sets or retrieves how the object is aligned with adjacent text.
      */
    align: string;
    allowFullscreen: boolean;
    /**
      * Specifies the properties of a border drawn around an object.
      */
    border: string;
    /**
      * Retrieves the document object of the page or frame.
      */
    readonly contentDocument: Document;
    /**
      * Retrieves the object of the specified.
      */
    readonly contentWindow: Window;
    /**
      * Sets or retrieves whether to display a border for the frame.
      */
    frameBorder: string;
    /**
      * Sets or retrieves the amount of additional space between the frames.
      */
    frameSpacing: any;
    /**
      * Sets or retrieves the height of the object.
      */
    height: string;
    /**
      * Sets or retrieves the horizontal margin for the object.
      */
    hspace: number;
    /**
      * Sets or retrieves a URI to a long description of the object.
      */
    longDesc: string;
    /**
      * Sets or retrieves the top and bottom margin heights before displaying the text in a frame.
      */
    marginHeight: string;
    /**
      * Sets or retrieves the left and right margin widths before displaying the text in a frame.
      */
    marginWidth: string;
    /**
      * Sets or retrieves the frame name.
      */
    name: string;
    /**
      * Sets or retrieves whether the user can resize the frame.
      */
    noResize: boolean;
    /**
      * Raised when the object has been completely received from the server.
      */
    onload: (this: this, ev: Event) => any;
    readonly sandbox: DOMSettableTokenList;
    /**
      * Sets or retrieves whether the frame can be scrolled.
      */
    scrolling: string;
    /**
      * Sets or retrieves a URL to be loaded by the object.
      */
    src: string;
    /**
      * Sets or retrieves the vertical margin for the object.
      */
    vspace: number;
    /**
      * Sets or retrieves the width of the object.
      */
    width: string;
    addEventListener(type: "MSContentZoom", listener: (this: this, ev: UIEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSGestureChange", listener: (this: this, ev: MSGestureEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSGestureDoubleTap", listener: (this: this, ev: MSGestureEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSGestureEnd", listener: (this: this, ev: MSGestureEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSGestureHold", listener: (this: this, ev: MSGestureEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSGestureStart", listener: (this: this, ev: MSGestureEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSGestureTap", listener: (this: this, ev: MSGestureEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSGotPointerCapture", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSInertiaStart", listener: (this: this, ev: MSGestureEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSLostPointerCapture", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSManipulationStateChanged", listener: (this: this, ev: MSManipulationEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSPointerCancel", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSPointerDown", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSPointerEnter", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSPointerLeave", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSPointerMove", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSPointerOut", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSPointerOver", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSPointerUp", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "abort", listener: (this: this, ev: UIEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "activate", listener: (this: this, ev: UIEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "ariarequest", listener: (this: this, ev: AriaRequestEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "beforeactivate", listener: (this: this, ev: UIEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "beforecopy", listener: (this: this, ev: ClipboardEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "beforecut", listener: (this: this, ev: ClipboardEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "beforedeactivate", listener: (this: this, ev: UIEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "beforepaste", listener: (this: this, ev: ClipboardEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "blur", listener: (this: this, ev: FocusEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "canplay", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "canplaythrough", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "change", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "click", listener: (this: this, ev: MouseEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "command", listener: (this: this, ev: CommandEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "contextmenu", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "copy", listener: (this: this, ev: ClipboardEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "cuechange", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "cut", listener: (this: this, ev: ClipboardEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "dblclick", listener: (this: this, ev: MouseEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "deactivate", listener: (this: this, ev: UIEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "drag", listener: (this: this, ev: DragEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "dragend", listener: (this: this, ev: DragEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "dragenter", listener: (this: this, ev: DragEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "dragleave", listener: (this: this, ev: DragEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "dragover", listener: (this: this, ev: DragEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "dragstart", listener: (this: this, ev: DragEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "drop", listener: (this: this, ev: DragEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "durationchange", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "emptied", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "ended", listener: (this: this, ev: MediaStreamErrorEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "error", listener: (this: this, ev: ErrorEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "focus", listener: (this: this, ev: FocusEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "gotpointercapture", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "input", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "invalid", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "keydown", listener: (this: this, ev: KeyboardEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "keypress", listener: (this: this, ev: KeyboardEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "keyup", listener: (this: this, ev: KeyboardEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "load", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "load", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "loadeddata", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "loadedmetadata", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "loadstart", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "lostpointercapture", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "mousedown", listener: (this: this, ev: MouseEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "mouseenter", listener: (this: this, ev: MouseEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "mouseleave", listener: (this: this, ev: MouseEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "mousemove", listener: (this: this, ev: MouseEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "mouseout", listener: (this: this, ev: MouseEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "mouseover", listener: (this: this, ev: MouseEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "mouseup", listener: (this: this, ev: MouseEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "mousewheel", listener: (this: this, ev: WheelEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "paste", listener: (this: this, ev: ClipboardEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pause", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "play", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "playing", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "pointercancel", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pointerdown", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pointerenter", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pointerleave", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pointermove", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pointerout", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pointerover", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pointerup", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "progress", listener: (this: this, ev: ProgressEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "ratechange", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "reset", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "scroll", listener: (this: this, ev: UIEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "seeked", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "seeking", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "select", listener: (this: this, ev: UIEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "selectstart", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "stalled", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "submit", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "suspend", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "timeupdate", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "touchcancel", listener: (this: this, ev: TouchEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "touchend", listener: (this: this, ev: TouchEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "touchmove", listener: (this: this, ev: TouchEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "touchstart", listener: (this: this, ev: TouchEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "volumechange", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "waiting", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "webkitfullscreenchange", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "webkitfullscreenerror", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "wheel", listener: (this: this, ev: WheelEvent) => any, useCapture?: boolean): void;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var HTMLIFrameElement: {
    prototype: HTMLIFrameElement;
    new(): HTMLIFrameElement;
}

interface HTMLImageElement extends HTMLElement {
    /**
      * Sets or retrieves how the object is aligned with adjacent text.
      */
    align: string;
    /**
      * Sets or retrieves a text alternative to the graphic.
      */
    alt: string;
    /**
      * Specifies the properties of a border drawn around an object.
      */
    border: string;
    /**
      * Retrieves whether the object is fully loaded.
      */
    readonly complete: boolean;
    crossOrigin: string;
    readonly currentSrc: string;
    /**
      * Sets or retrieves the height of the object.
      */
    height: number;
    /**
      * Sets or retrieves the width of the border to draw around the object.
      */
    hspace: number;
    /**
      * Sets or retrieves whether the image is a server-side image map.
      */
    isMap: boolean;
    /**
      * Sets or retrieves a Uniform Resource Identifier (URI) to a long description of the object.
      */
    longDesc: string;
    lowsrc: string;
    /**
      * Gets or sets whether the DLNA PlayTo device is available.
      */
    msPlayToDisabled: boolean;
    msPlayToPreferredSourceUri: string;
    /**
      * Gets or sets the primary DLNA PlayTo device.
      */
    msPlayToPrimary: boolean;
    /**
      * Gets the source associated with the media element for use by the PlayToManager.
      */
    readonly msPlayToSource: any;
    /**
      * Sets or retrieves the name of the object.
      */
    name: string;
    /**
      * The original height of the image resource before sizing.
      */
    readonly naturalHeight: number;
    /**
      * The original width of the image resource before sizing.
      */
    readonly naturalWidth: number;
    sizes: string;
    /**
      * The address or URL of the a media resource that is to be considered.
      */
    src: string;
    srcset: string;
    /**
      * Sets or retrieves the URL, often with a bookmark extension (#name), to use as a client-side image map.
      */
    useMap: string;
    /**
      * Sets or retrieves the vertical margin for the object.
      */
    vspace: number;
    /**
      * Sets or retrieves the width of the object.
      */
    width: number;
    readonly x: number;
    readonly y: number;
    msGetAsCastingSource(): any;
}

declare var HTMLImageElement: {
    prototype: HTMLImageElement;
    new(): HTMLImageElement;
    create(): HTMLImageElement;
}

interface HTMLInputElement extends HTMLElement {
    /**
      * Sets or retrieves a comma-separated list of content types.
      */
    accept: string;
    /**
      * Sets or retrieves how the object is aligned with adjacent text.
      */
    align: string;
    /**
      * Sets or retrieves a text alternative to the graphic.
      */
    alt: string;
    /**
      * Specifies whether autocomplete is applied to an editable text field.
      */
    autocomplete: string;
    /**
      * Provides a way to direct a user to a specific field when a document loads. This can provide both direction and convenience for a user, reducing the need to click or tab to a field when a page opens. This attribute is true when present on an element, and false when missing.
      */
    autofocus: boolean;
    /**
      * Sets or retrieves the width of the border to draw around the object.
      */
    border: string;
    /**
      * Sets or retrieves the state of the check box or radio button.
      */
    checked: boolean;
    /**
      * Retrieves whether the object is fully loaded.
      */
    readonly complete: boolean;
    /**
      * Sets or retrieves the state of the check box or radio button.
      */
    defaultChecked: boolean;
    /**
      * Sets or retrieves the initial contents of the object.
      */
    defaultValue: string;
    disabled: boolean;
    /**
      * Returns a FileList object on a file type input object.
      */
    readonly files: FileList | null;
    /**
      * Retrieves a reference to the form that the object is embedded in.
      */
    readonly form: HTMLFormElement;
    /**
      * Overrides the action attribute (where the data on a form is sent) on the parent form element.
      */
    formAction: string;
    /**
      * Used to override the encoding (formEnctype attribute) specified on the form element.
      */
    formEnctype: string;
    /**
      * Overrides the submit method attribute previously specified on a form element.
      */
    formMethod: string;
    /**
      * Overrides any validation or required attributes on a form or form elements to allow it to be submitted without validation. This can be used to create a "save draft"-type submit option.
      */
    formNoValidate: string;
    /**
      * Overrides the target attribute on a form element.
      */
    formTarget: string;
    /**
      * Sets or retrieves the height of the object.
      */
    height: string;
    /**
      * Sets or retrieves the width of the border to draw around the object.
      */
    hspace: number;
    indeterminate: boolean;
    /**
      * Specifies the ID of a pre-defined datalist of options for an input element.
      */
    readonly list: HTMLElement;
    /**
      * Defines the maximum acceptable value for an input element with type="number".When used with the min and step attributes, lets you control the range and increment (such as only even numbers) that the user can enter into an input field.
      */
    max: string;
    /**
      * Sets or retrieves the maximum number of characters that the user can enter in a text control.
      */
    maxLength: number;
    /**
      * Defines the minimum acceptable value for an input element with type="number". When used with the max and step attributes, lets you control the range and increment (such as even numbers only) that the user can enter into an input field.
      */
    min: string;
    /**
      * Sets or retrieves the Boolean value indicating whether multiple items can be selected from a list.
      */
    multiple: boolean;
    /**
      * Sets or retrieves the name of the object.
      */
    name: string;
    /**
      * Gets or sets a string containing a regular expression that the user's input must match.
      */
    pattern: string;
    /**
      * Gets or sets a text string that is displayed in an input field as a hint or prompt to users as the format or type of information they need to enter.The text appears in an input field until the user puts focus on the field.
      */
    placeholder: string;
    readOnly: boolean;
    /**
      * When present, marks an element that can't be submitted without a value.
      */
    required: boolean;
    selectionDirection: string;
    /**
      * Gets or sets the end position or offset of a text selection.
      */
    selectionEnd: number;
    /**
      * Gets or sets the starting position or offset of a text selection.
      */
    selectionStart: number;
    size: number;
    /**
      * The address or URL of the a media resource that is to be considered.
      */
    src: string;
    status: boolean;
    /**
      * Defines an increment or jump between values that you want to allow the user to enter. When used with the max and min attributes, lets you control the range and increment (for example, allow only even numbers) that the user can enter into an input field.
      */
    step: string;
    /**
      * Returns the content type of the object.
      */
    type: string;
    /**
      * Sets or retrieves the URL, often with a bookmark extension (#name), to use as a client-side image map.
      */
    useMap: string;
    /**
      * Returns the error message that would be displayed if the user submits the form, or an empty string if no error message. It also triggers the standard error message, such as "this is a required field". The result is that the user sees validation messages without actually submitting.
      */
    readonly validationMessage: string;
    /**
      * Returns a  ValidityState object that represents the validity states of an element.
      */
    readonly validity: ValidityState;
    /**
      * Returns the value of the data at the cursor's current position.
      */
    value: string;
    valueAsDate: Date;
    /**
      * Returns the input field value as a number.
      */
    valueAsNumber: number;
    /**
      * Sets or retrieves the vertical margin for the object.
      */
    vspace: number;
    webkitdirectory: boolean;
    /**
      * Sets or retrieves the width of the object.
      */
    width: string;
    /**
      * Returns whether an element will successfully validate based on forms validation rules and constraints.
      */
    readonly willValidate: boolean;
    minLength: number;
    /**
      * Returns whether a form will validate when it is submitted, without having to submit it.
      */
    checkValidity(): boolean;
    /**
      * Makes the selection equal to the current object.
      */
    select(): void;
    /**
      * Sets a custom error message that is displayed when a form is submitted.
      * @param error Sets a custom error message that is displayed when a form is submitted.
      */
    setCustomValidity(error: string): void;
    /**
      * Sets the start and end positions of a selection in a text field.
      * @param start The offset into the text field for the start of the selection.
      * @param end The offset into the text field for the end of the selection.
      */
    setSelectionRange(start?: number, end?: number, direction?: string): void;
    /**
      * Decrements a range input control's value by the value given by the Step attribute. If the optional parameter is used, it will decrement the input control's step value multiplied by the parameter's value.
      * @param n Value to decrement the value by.
      */
    stepDown(n?: number): void;
    /**
      * Increments a range input control's value by the value given by the Step attribute. If the optional parameter is used, will increment the input control's value by that value.
      * @param n Value to increment the value by.
      */
    stepUp(n?: number): void;
}

declare var HTMLInputElement: {
    prototype: HTMLInputElement;
    new(): HTMLInputElement;
}

interface HTMLLIElement extends HTMLElement {
    type: string;
    /**
      * Sets or retrieves the value of a list item.
      */
    value: number;
}

declare var HTMLLIElement: {
    prototype: HTMLLIElement;
    new(): HTMLLIElement;
}

interface HTMLLabelElement extends HTMLElement {
    /**
      * Retrieves a reference to the form that the object is embedded in.
      */
    readonly form: HTMLFormElement;
    /**
      * Sets or retrieves the object to which the given label object is assigned.
      */
    htmlFor: string;
}

declare var HTMLLabelElement: {
    prototype: HTMLLabelElement;
    new(): HTMLLabelElement;
}

interface HTMLLegendElement extends HTMLElement {
    /**
      * Retrieves a reference to the form that the object is embedded in.
      */
    align: string;
    /**
      * Retrieves a reference to the form that the object is embedded in.
      */
    readonly form: HTMLFormElement;
}

declare var HTMLLegendElement: {
    prototype: HTMLLegendElement;
    new(): HTMLLegendElement;
}

interface HTMLLinkElement extends HTMLElement, LinkStyle {
    /**
      * Sets or retrieves the character set used to encode the object.
      */
    charset: string;
    disabled: boolean;
    /**
      * Sets or retrieves a destination URL or an anchor point.
      */
    href: string;
    /**
      * Sets or retrieves the language code of the object.
      */
    hreflang: string;
    /**
      * Sets or retrieves the media type.
      */
    media: string;
    /**
      * Sets or retrieves the relationship between the object and the destination of the link.
      */
    rel: string;
    /**
      * Sets or retrieves the relationship between the object and the destination of the link.
      */
    rev: string;
    /**
      * Sets or retrieves the window or frame at which to target content.
      */
    target: string;
    /**
      * Sets or retrieves the MIME type of the object.
      */
    type: string;
    import?: Document;
    integrity: string;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var HTMLLinkElement: {
    prototype: HTMLLinkElement;
    new(): HTMLLinkElement;
}

interface HTMLMapElement extends HTMLElement {
    /**
      * Retrieves a collection of the area objects defined for the given map object.
      */
    readonly areas: HTMLAreasCollection;
    /**
      * Sets or retrieves the name of the object.
      */
    name: string;
}

declare var HTMLMapElement: {
    prototype: HTMLMapElement;
    new(): HTMLMapElement;
}

interface HTMLMarqueeElement extends HTMLElement {
    behavior: string;
    bgColor: any;
    direction: string;
    height: string;
    hspace: number;
    loop: number;
    onbounce: (this: this, ev: Event) => any;
    onfinish: (this: this, ev: Event) => any;
    onstart: (this: this, ev: Event) => any;
    scrollAmount: number;
    scrollDelay: number;
    trueSpeed: boolean;
    vspace: number;
    width: string;
    start(): void;
    stop(): void;
    addEventListener(type: "MSContentZoom", listener: (this: this, ev: UIEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSGestureChange", listener: (this: this, ev: MSGestureEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSGestureDoubleTap", listener: (this: this, ev: MSGestureEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSGestureEnd", listener: (this: this, ev: MSGestureEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSGestureHold", listener: (this: this, ev: MSGestureEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSGestureStart", listener: (this: this, ev: MSGestureEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSGestureTap", listener: (this: this, ev: MSGestureEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSGotPointerCapture", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSInertiaStart", listener: (this: this, ev: MSGestureEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSLostPointerCapture", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSManipulationStateChanged", listener: (this: this, ev: MSManipulationEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSPointerCancel", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSPointerDown", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSPointerEnter", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSPointerLeave", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSPointerMove", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSPointerOut", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSPointerOver", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSPointerUp", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "abort", listener: (this: this, ev: UIEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "activate", listener: (this: this, ev: UIEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "ariarequest", listener: (this: this, ev: AriaRequestEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "beforeactivate", listener: (this: this, ev: UIEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "beforecopy", listener: (this: this, ev: ClipboardEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "beforecut", listener: (this: this, ev: ClipboardEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "beforedeactivate", listener: (this: this, ev: UIEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "beforepaste", listener: (this: this, ev: ClipboardEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "blur", listener: (this: this, ev: FocusEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "bounce", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "canplay", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "canplaythrough", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "change", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "click", listener: (this: this, ev: MouseEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "command", listener: (this: this, ev: CommandEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "contextmenu", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "copy", listener: (this: this, ev: ClipboardEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "cuechange", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "cut", listener: (this: this, ev: ClipboardEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "dblclick", listener: (this: this, ev: MouseEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "deactivate", listener: (this: this, ev: UIEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "drag", listener: (this: this, ev: DragEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "dragend", listener: (this: this, ev: DragEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "dragenter", listener: (this: this, ev: DragEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "dragleave", listener: (this: this, ev: DragEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "dragover", listener: (this: this, ev: DragEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "dragstart", listener: (this: this, ev: DragEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "drop", listener: (this: this, ev: DragEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "durationchange", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "emptied", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "ended", listener: (this: this, ev: MediaStreamErrorEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "error", listener: (this: this, ev: ErrorEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "finish", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "focus", listener: (this: this, ev: FocusEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "gotpointercapture", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "input", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "invalid", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "keydown", listener: (this: this, ev: KeyboardEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "keypress", listener: (this: this, ev: KeyboardEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "keyup", listener: (this: this, ev: KeyboardEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "load", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "loadeddata", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "loadedmetadata", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "loadstart", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "lostpointercapture", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "mousedown", listener: (this: this, ev: MouseEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "mouseenter", listener: (this: this, ev: MouseEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "mouseleave", listener: (this: this, ev: MouseEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "mousemove", listener: (this: this, ev: MouseEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "mouseout", listener: (this: this, ev: MouseEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "mouseover", listener: (this: this, ev: MouseEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "mouseup", listener: (this: this, ev: MouseEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "mousewheel", listener: (this: this, ev: WheelEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "paste", listener: (this: this, ev: ClipboardEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pause", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "play", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "playing", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "pointercancel", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pointerdown", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pointerenter", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pointerleave", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pointermove", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pointerout", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pointerover", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pointerup", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "progress", listener: (this: this, ev: ProgressEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "ratechange", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "reset", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "scroll", listener: (this: this, ev: UIEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "seeked", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "seeking", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "select", listener: (this: this, ev: UIEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "selectstart", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "stalled", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "start", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "submit", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "suspend", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "timeupdate", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "touchcancel", listener: (this: this, ev: TouchEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "touchend", listener: (this: this, ev: TouchEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "touchmove", listener: (this: this, ev: TouchEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "touchstart", listener: (this: this, ev: TouchEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "volumechange", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "waiting", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "webkitfullscreenchange", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "webkitfullscreenerror", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "wheel", listener: (this: this, ev: WheelEvent) => any, useCapture?: boolean): void;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var HTMLMarqueeElement: {
    prototype: HTMLMarqueeElement;
    new(): HTMLMarqueeElement;
}

interface HTMLMediaElement extends HTMLElement {
    /**
      * Returns an AudioTrackList object with the audio tracks for a given video element.
      */
    readonly audioTracks: AudioTrackList;
    /**
      * Gets or sets a value that indicates whether to start playing the media automatically.
      */
    autoplay: boolean;
    /**
      * Gets a collection of buffered time ranges.
      */
    readonly buffered: TimeRanges;
    /**
      * Gets or sets a flag that indicates whether the client provides a set of controls for the media (in case the developer does not include controls for the player).
      */
    controls: boolean;
    crossOrigin: string;
    /**
      * Gets the address or URL of the current media resource that is selected by IHTMLMediaElement.
      */
    readonly currentSrc: string;
    /**
      * Gets or sets the current playback position, in seconds.
      */
    currentTime: number;
    defaultMuted: boolean;
    /**
      * Gets or sets the default playback rate when the user is not using fast forward or reverse for a video or audio resource.
      */
    defaultPlaybackRate: number;
    /**
      * Returns the duration in seconds of the current media resource. A NaN value is returned if duration is not available, or Infinity if the media resource is streaming.
      */
    readonly duration: number;
    /**
      * Gets information about whether the playback has ended or not.
      */
    readonly ended: boolean;
    /**
      * Returns an object representing the current error state of the audio or video element.
      */
    readonly error: MediaError;
    /**
      * Gets or sets a flag to specify whether playback should restart after it completes.
      */
    loop: boolean;
    readonly mediaKeys: MediaKeys | null;
    /**
      * Specifies the purpose of the audio or video media, such as background audio or alerts.
      */
    msAudioCategory: string;
    /**
      * Specifies the output device id that the audio will be sent to.
      */
    msAudioDeviceType: string;
    readonly msGraphicsTrustStatus: MSGraphicsTrust;
    /**
      * Gets the MSMediaKeys object, which is used for decrypting media data, that is associated with this media element.
      */
    readonly msKeys: MSMediaKeys;
    /**
      * Gets or sets whether the DLNA PlayTo device is available.
      */
    msPlayToDisabled: boolean;
    /**
      * Gets or sets the path to the preferred media source. This enables the Play To target device to stream the media content, which can be DRM protected, from a different location, such as a cloud media server.
      */
    msPlayToPreferredSourceUri: string;
    /**
      * Gets or sets the primary DLNA PlayTo device.
      */
    msPlayToPrimary: boolean;
    /**
      * Gets the source associated with the media element for use by the PlayToManager.
      */
    readonly msPlayToSource: any;
    /**
      * Specifies whether or not to enable low-latency playback on the media element.
      */
    msRealTime: boolean;
    /**
      * Gets or sets a flag that indicates whether the audio (either audio or the audio track on video media) is muted.
      */
    muted: boolean;
    /**
      * Gets the current network activity for the element.
      */
    readonly networkState: number;
    onencrypted: (this: this, ev: MediaEncryptedEvent) => any;
    onmsneedkey: (this: this, ev: MSMediaKeyNeededEvent) => any;
    /**
      * Gets a flag that specifies whether playback is paused.
      */
    readonly paused: boolean;
    /**
      * Gets or sets the current rate of speed for the media resource to play. This speed is expressed as a multiple of the normal speed of the media resource.
      */
    playbackRate: number;
    /**
      * Gets TimeRanges for the current media resource that has been played.
      */
    readonly played: TimeRanges;
    /**
      * Gets or sets the current playback position, in seconds.
      */
    preload: string;
    readyState: number;
    /**
      * Returns a TimeRanges object that represents the ranges of the current media resource that can be seeked.
      */
    readonly seekable: TimeRanges;
    /**
      * Gets a flag that indicates whether the the client is currently moving to a new playback position in the media resource.
      */
    readonly seeking: boolean;
    /**
      * The address or URL of the a media resource that is to be considered.
      */
    src: string;
    srcObject: MediaStream | null;
    readonly textTracks: TextTrackList;
    readonly videoTracks: VideoTrackList;
    /**
      * Gets or sets the volume level for audio portions of the media element.
      */
    volume: number;
    addTextTrack(kind: string, label?: string, language?: string): TextTrack;
    /**
      * Returns a string that specifies whether the client can play a given media resource type.
      */
    canPlayType(type: string): string;
    /**
      * Resets the audio or video object and loads a new media resource.
      */
    load(): void;
    /**
      * Clears all effects from the media pipeline.
      */
    msClearEffects(): void;
    msGetAsCastingSource(): any;
    /**
      * Inserts the specified audio effect into media pipeline.
      */
    msInsertAudioEffect(activatableClassId: string, effectRequired: boolean, config?: any): void;
    msSetMediaKeys(mediaKeys: MSMediaKeys): void;
    /**
      * Specifies the media protection manager for a given media pipeline.
      */
    msSetMediaProtectionManager(mediaProtectionManager?: any): void;
    /**
      * Pauses the current playback and sets paused to TRUE. This can be used to test whether the media is playing or paused. You can also use the pause or play events to tell whether the media is playing or not.
      */
    pause(): void;
    /**
      * Loads and starts playback of a media resource.
      */
    play(): void;
    setMediaKeys(mediaKeys: MediaKeys | null): PromiseLike<void>;
    readonly HAVE_CURRENT_DATA: number;
    readonly HAVE_ENOUGH_DATA: number;
    readonly HAVE_FUTURE_DATA: number;
    readonly HAVE_METADATA: number;
    readonly HAVE_NOTHING: number;
    readonly NETWORK_EMPTY: number;
    readonly NETWORK_IDLE: number;
    readonly NETWORK_LOADING: number;
    readonly NETWORK_NO_SOURCE: number;
    addEventListener(type: "MSContentZoom", listener: (this: this, ev: UIEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSGestureChange", listener: (this: this, ev: MSGestureEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSGestureDoubleTap", listener: (this: this, ev: MSGestureEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSGestureEnd", listener: (this: this, ev: MSGestureEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSGestureHold", listener: (this: this, ev: MSGestureEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSGestureStart", listener: (this: this, ev: MSGestureEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSGestureTap", listener: (this: this, ev: MSGestureEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSGotPointerCapture", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSInertiaStart", listener: (this: this, ev: MSGestureEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSLostPointerCapture", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSManipulationStateChanged", listener: (this: this, ev: MSManipulationEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSPointerCancel", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSPointerDown", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSPointerEnter", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSPointerLeave", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSPointerMove", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSPointerOut", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSPointerOver", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSPointerUp", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "abort", listener: (this: this, ev: UIEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "activate", listener: (this: this, ev: UIEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "ariarequest", listener: (this: this, ev: AriaRequestEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "beforeactivate", listener: (this: this, ev: UIEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "beforecopy", listener: (this: this, ev: ClipboardEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "beforecut", listener: (this: this, ev: ClipboardEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "beforedeactivate", listener: (this: this, ev: UIEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "beforepaste", listener: (this: this, ev: ClipboardEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "blur", listener: (this: this, ev: FocusEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "canplay", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "canplaythrough", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "change", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "click", listener: (this: this, ev: MouseEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "command", listener: (this: this, ev: CommandEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "contextmenu", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "copy", listener: (this: this, ev: ClipboardEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "cuechange", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "cut", listener: (this: this, ev: ClipboardEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "dblclick", listener: (this: this, ev: MouseEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "deactivate", listener: (this: this, ev: UIEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "drag", listener: (this: this, ev: DragEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "dragend", listener: (this: this, ev: DragEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "dragenter", listener: (this: this, ev: DragEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "dragleave", listener: (this: this, ev: DragEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "dragover", listener: (this: this, ev: DragEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "dragstart", listener: (this: this, ev: DragEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "drop", listener: (this: this, ev: DragEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "durationchange", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "emptied", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "encrypted", listener: (this: this, ev: MediaEncryptedEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "ended", listener: (this: this, ev: MediaStreamErrorEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "error", listener: (this: this, ev: ErrorEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "focus", listener: (this: this, ev: FocusEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "gotpointercapture", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "input", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "invalid", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "keydown", listener: (this: this, ev: KeyboardEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "keypress", listener: (this: this, ev: KeyboardEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "keyup", listener: (this: this, ev: KeyboardEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "load", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "loadeddata", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "loadedmetadata", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "loadstart", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "lostpointercapture", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "mousedown", listener: (this: this, ev: MouseEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "mouseenter", listener: (this: this, ev: MouseEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "mouseleave", listener: (this: this, ev: MouseEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "mousemove", listener: (this: this, ev: MouseEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "mouseout", listener: (this: this, ev: MouseEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "mouseover", listener: (this: this, ev: MouseEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "mouseup", listener: (this: this, ev: MouseEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "mousewheel", listener: (this: this, ev: WheelEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "msneedkey", listener: (this: this, ev: MSMediaKeyNeededEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "paste", listener: (this: this, ev: ClipboardEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pause", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "play", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "playing", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "pointercancel", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pointerdown", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pointerenter", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pointerleave", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pointermove", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pointerout", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pointerover", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pointerup", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "progress", listener: (this: this, ev: ProgressEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "ratechange", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "reset", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "scroll", listener: (this: this, ev: UIEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "seeked", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "seeking", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "select", listener: (this: this, ev: UIEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "selectstart", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "stalled", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "submit", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "suspend", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "timeupdate", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "touchcancel", listener: (this: this, ev: TouchEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "touchend", listener: (this: this, ev: TouchEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "touchmove", listener: (this: this, ev: TouchEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "touchstart", listener: (this: this, ev: TouchEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "volumechange", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "waiting", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "webkitfullscreenchange", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "webkitfullscreenerror", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "wheel", listener: (this: this, ev: WheelEvent) => any, useCapture?: boolean): void;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var HTMLMediaElement: {
    prototype: HTMLMediaElement;
    new(): HTMLMediaElement;
    readonly HAVE_CURRENT_DATA: number;
    readonly HAVE_ENOUGH_DATA: number;
    readonly HAVE_FUTURE_DATA: number;
    readonly HAVE_METADATA: number;
    readonly HAVE_NOTHING: number;
    readonly NETWORK_EMPTY: number;
    readonly NETWORK_IDLE: number;
    readonly NETWORK_LOADING: number;
    readonly NETWORK_NO_SOURCE: number;
}

interface HTMLMenuElement extends HTMLElement {
    compact: boolean;
    type: string;
}

declare var HTMLMenuElement: {
    prototype: HTMLMenuElement;
    new(): HTMLMenuElement;
}

interface HTMLMetaElement extends HTMLElement {
    /**
      * Sets or retrieves the character set used to encode the object.
      */
    charset: string;
    /**
      * Gets or sets meta-information to associate with httpEquiv or name.
      */
    content: string;
    /**
      * Gets or sets information used to bind the value of a content attribute of a meta element to an HTTP response header.
      */
    httpEquiv: string;
    /**
      * Sets or retrieves the value specified in the content attribute of the meta object.
      */
    name: string;
    /**
      * Sets or retrieves a scheme to be used in interpreting the value of a property specified for the object.
      */
    scheme: string;
    /**
      * Sets or retrieves the URL property that will be loaded after the specified time has elapsed.
      */
    url: string;
}

declare var HTMLMetaElement: {
    prototype: HTMLMetaElement;
    new(): HTMLMetaElement;
}

interface HTMLMeterElement extends HTMLElement {
    high: number;
    low: number;
    max: number;
    min: number;
    optimum: number;
    value: number;
}

declare var HTMLMeterElement: {
    prototype: HTMLMeterElement;
    new(): HTMLMeterElement;
}

interface HTMLModElement extends HTMLElement {
    /**
      * Sets or retrieves reference information about the object.
      */
    cite: string;
    /**
      * Sets or retrieves the date and time of a modification to the object.
      */
    dateTime: string;
}

declare var HTMLModElement: {
    prototype: HTMLModElement;
    new(): HTMLModElement;
}

interface HTMLOListElement extends HTMLElement {
    compact: boolean;
    /**
      * The starting number.
      */
    start: number;
    type: string;
}

declare var HTMLOListElement: {
    prototype: HTMLOListElement;
    new(): HTMLOListElement;
}

interface HTMLObjectElement extends HTMLElement, GetSVGDocument {
    /**
      * Retrieves a string of the URL where the object tag can be found. This is often the href of the document that the object is in, or the value set by a base element.
      */
    readonly BaseHref: string;
    align: string;
    /**
      * Sets or retrieves a text alternative to the graphic.
      */
    alt: string;
    /**
      * Gets or sets the optional alternative HTML script to execute if the object fails to load.
      */
    altHtml: string;
    /**
      * Sets or retrieves a character string that can be used to implement your own archive functionality for the object.
      */
    archive: string;
    border: string;
    /**
      * Sets or retrieves the URL of the file containing the compiled Java class.
      */
    code: string;
    /**
      * Sets or retrieves the URL of the component.
      */
    codeBase: string;
    /**
      * Sets or retrieves the Internet media type for the code associated with the object.
      */
    codeType: string;
    /**
      * Retrieves the document object of the page or frame.
      */
    readonly contentDocument: Document;
    /**
      * Sets or retrieves the URL that references the data of the object.
      */
    data: string;
    declare: boolean;
    /**
      * Retrieves a reference to the form that the object is embedded in.
      */
    readonly form: HTMLFormElement;
    /**
      * Sets or retrieves the height of the object.
      */
    height: string;
    hspace: number;
    /**
      * Gets or sets whether the DLNA PlayTo device is available.
      */
    msPlayToDisabled: boolean;
    /**
      * Gets or sets the path to the preferred media source. This enables the Play To target device to stream the media content, which can be DRM protected, from a different location, such as a cloud media server.
      */
    msPlayToPreferredSourceUri: string;
    /**
      * Gets or sets the primary DLNA PlayTo device.
      */
    msPlayToPrimary: boolean;
    /**
      * Gets the source associated with the media element for use by the PlayToManager.
      */
    readonly msPlayToSource: any;
    /**
      * Sets or retrieves the name of the object.
      */
    name: string;
    /**
      * Retrieves the contained object.
      */
    readonly object: any;
    readonly readyState: number;
    /**
      * Sets or retrieves a message to be displayed while an object is loading.
      */
    standby: string;
    /**
      * Sets or retrieves the MIME type of the object.
      */
    type: string;
    /**
      * Sets or retrieves the URL, often with a bookmark extension (#name), to use as a client-side image map.
      */
    useMap: string;
    /**
      * Returns the error message that would be displayed if the user submits the form, or an empty string if no error message. It also triggers the standard error message, such as "this is a required field". The result is that the user sees validation messages without actually submitting.
      */
    readonly validationMessage: string;
    /**
      * Returns a  ValidityState object that represents the validity states of an element.
      */
    readonly validity: ValidityState;
    vspace: number;
    /**
      * Sets or retrieves the width of the object.
      */
    width: string;
    /**
      * Returns whether an element will successfully validate based on forms validation rules and constraints.
      */
    readonly willValidate: boolean;
    /**
      * Returns whether a form will validate when it is submitted, without having to submit it.
      */
    checkValidity(): boolean;
    /**
      * Sets a custom error message that is displayed when a form is submitted.
      * @param error Sets a custom error message that is displayed when a form is submitted.
      */
    setCustomValidity(error: string): void;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var HTMLObjectElement: {
    prototype: HTMLObjectElement;
    new(): HTMLObjectElement;
}

interface HTMLOptGroupElement extends HTMLElement {
    /**
      * Sets or retrieves the status of an option.
      */
    defaultSelected: boolean;
    disabled: boolean;
    /**
      * Retrieves a reference to the form that the object is embedded in.
      */
    readonly form: HTMLFormElement;
    /**
      * Sets or retrieves the ordinal position of an option in a list box.
      */
    readonly index: number;
    /**
      * Sets or retrieves a value that you can use to implement your own label functionality for the object.
      */
    label: string;
    /**
      * Sets or retrieves whether the option in the list box is the default item.
      */
    selected: boolean;
    /**
      * Sets or retrieves the text string specified by the option tag.
      */
    readonly text: string;
    /**
      * Sets or retrieves the value which is returned to the server when the form control is submitted.
      */
    value: string;
}

declare var HTMLOptGroupElement: {
    prototype: HTMLOptGroupElement;
    new(): HTMLOptGroupElement;
}

interface HTMLOptionElement extends HTMLElement {
    /**
      * Sets or retrieves the status of an option.
      */
    defaultSelected: boolean;
    disabled: boolean;
    /**
      * Retrieves a reference to the form that the object is embedded in.
      */
    readonly form: HTMLFormElement;
    /**
      * Sets or retrieves the ordinal position of an option in a list box.
      */
    readonly index: number;
    /**
      * Sets or retrieves a value that you can use to implement your own label functionality for the object.
      */
    label: string;
    /**
      * Sets or retrieves whether the option in the list box is the default item.
      */
    selected: boolean;
    /**
      * Sets or retrieves the text string specified by the option tag.
      */
    text: string;
    /**
      * Sets or retrieves the value which is returned to the server when the form control is submitted.
      */
    value: string;
}

declare var HTMLOptionElement: {
    prototype: HTMLOptionElement;
    new(): HTMLOptionElement;
    create(): HTMLOptionElement;
}

interface HTMLOptionsCollection extends HTMLCollectionOf<HTMLOptionElement> {
    length: number;
    selectedIndex: number;
    add(element: HTMLOptionElement | HTMLOptGroupElement, before?: HTMLElement | number): void;
    remove(index: number): void;
}

declare var HTMLOptionsCollection: {
    prototype: HTMLOptionsCollection;
    new(): HTMLOptionsCollection;
}

interface HTMLParagraphElement extends HTMLElement {
    /**
      * Sets or retrieves how the object is aligned with adjacent text.
      */
    align: string;
    clear: string;
}

declare var HTMLParagraphElement: {
    prototype: HTMLParagraphElement;
    new(): HTMLParagraphElement;
}

interface HTMLParamElement extends HTMLElement {
    /**
      * Sets or retrieves the name of an input parameter for an element.
      */
    name: string;
    /**
      * Sets or retrieves the content type of the resource designated by the value attribute.
      */
    type: string;
    /**
      * Sets or retrieves the value of an input parameter for an element.
      */
    value: string;
    /**
      * Sets or retrieves the data type of the value attribute.
      */
    valueType: string;
}

declare var HTMLParamElement: {
    prototype: HTMLParamElement;
    new(): HTMLParamElement;
}

interface HTMLPictureElement extends HTMLElement {
}

declare var HTMLPictureElement: {
    prototype: HTMLPictureElement;
    new(): HTMLPictureElement;
}

interface HTMLPreElement extends HTMLElement {
    /**
      * Sets or gets a value that you can use to implement your own width functionality for the object.
      */
    width: number;
}

declare var HTMLPreElement: {
    prototype: HTMLPreElement;
    new(): HTMLPreElement;
}

interface HTMLProgressElement extends HTMLElement {
    /**
      * Retrieves a reference to the form that the object is embedded in.
      */
    readonly form: HTMLFormElement;
    /**
      * Defines the maximum, or "done" value for a progress element.
      */
    max: number;
    /**
      * Returns the quotient of value/max when the value attribute is set (determinate progress bar), or -1 when the value attribute is missing (indeterminate progress bar).
      */
    readonly position: number;
    /**
      * Sets or gets the current value of a progress element. The value must be a non-negative number between 0 and the max value.
      */
    value: number;
}

declare var HTMLProgressElement: {
    prototype: HTMLProgressElement;
    new(): HTMLProgressElement;
}

interface HTMLQuoteElement extends HTMLElement {
    /**
      * Sets or retrieves reference information about the object.
      */
    cite: string;
}

declare var HTMLQuoteElement: {
    prototype: HTMLQuoteElement;
    new(): HTMLQuoteElement;
}

interface HTMLScriptElement extends HTMLElement {
    async: boolean;
    /**
      * Sets or retrieves the character set used to encode the object.
      */
    charset: string;
    /**
      * Sets or retrieves the status of the script.
      */
    defer: boolean;
    /**
      * Sets or retrieves the event for which the script is written.
      */
    event: string;
    /**
      * Sets or retrieves the object that is bound to the event script.
      */
    htmlFor: string;
    /**
      * Retrieves the URL to an external file that contains the source code or data.
      */
    src: string;
    /**
      * Retrieves or sets the text of the object as a string.
      */
    text: string;
    /**
      * Sets or retrieves the MIME type for the associated scripting engine.
      */
    type: string;
    integrity: string;
}

declare var HTMLScriptElement: {
    prototype: HTMLScriptElement;
    new(): HTMLScriptElement;
}

interface HTMLSelectElement extends HTMLElement {
    /**
      * Provides a way to direct a user to a specific field when a document loads. This can provide both direction and convenience for a user, reducing the need to click or tab to a field when a page opens. This attribute is true when present on an element, and false when missing.
      */
    autofocus: boolean;
    disabled: boolean;
    /**
      * Retrieves a reference to the form that the object is embedded in.
      */
    readonly form: HTMLFormElement;
    /**
      * Sets or retrieves the number of objects in a collection.
      */
    length: number;
    /**
      * Sets or retrieves the Boolean value indicating whether multiple items can be selected from a list.
      */
    multiple: boolean;
    /**
      * Sets or retrieves the name of the object.
      */
    name: string;
    readonly options: HTMLOptionsCollection;
    /**
      * When present, marks an element that can't be submitted without a value.
      */
    required: boolean;
    /**
      * Sets or retrieves the index of the selected option in a select object.
      */
    selectedIndex: number;
    selectedOptions: HTMLCollectionOf<HTMLOptionElement>;
    /**
      * Sets or retrieves the number of rows in the list box.
      */
    size: number;
    /**
      * Retrieves the type of select control based on the value of the MULTIPLE attribute.
      */
    readonly type: string;
    /**
      * Returns the error message that would be displayed if the user submits the form, or an empty string if no error message. It also triggers the standard error message, such as "this is a required field". The result is that the user sees validation messages without actually submitting.
      */
    readonly validationMessage: string;
    /**
      * Returns a  ValidityState object that represents the validity states of an element.
      */
    readonly validity: ValidityState;
    /**
      * Sets or retrieves the value which is returned to the server when the form control is submitted.
      */
    value: string;
    /**
      * Returns whether an element will successfully validate based on forms validation rules and constraints.
      */
    readonly willValidate: boolean;
    /**
      * Adds an element to the areas, controlRange, or options collection.
      * @param element Variant of type Number that specifies the index position in the collection where the element is placed. If no value is given, the method places the element at the end of the collection.
      * @param before Variant of type Object that specifies an element to insert before, or null to append the object to the collection.
      */
    add(element: HTMLElement, before?: HTMLElement | number): void;
    /**
      * Returns whether a form will validate when it is submitted, without having to submit it.
      */
    checkValidity(): boolean;
    /**
      * Retrieves a select object or an object from an options collection.
      * @param name Variant of type Number or String that specifies the object or collection to retrieve. If this parameter is an integer, it is the zero-based index of the object. If this parameter is a string, all objects with matching name or id properties are retrieved, and a collection is returned if more than one match is made.
      * @param index Variant of type Number that specifies the zero-based index of the object to retrieve when a collection is returned.
      */
    item(name?: any, index?: any): any;
    /**
      * Retrieves a select object or an object from an options collection.
      * @param namedItem A String that specifies the name or id property of the object to retrieve. A collection is returned if more than one match is made.
      */
    namedItem(name: string): any;
    /**
      * Removes an element from the collection.
      * @param index Number that specifies the zero-based index of the element to remove from the collection.
      */
    remove(index?: number): void;
    /**
      * Sets a custom error message that is displayed when a form is submitted.
      * @param error Sets a custom error message that is displayed when a form is submitted.
      */
    setCustomValidity(error: string): void;
    [name: string]: any;
}

declare var HTMLSelectElement: {
    prototype: HTMLSelectElement;
    new(): HTMLSelectElement;
}

interface HTMLSourceElement extends HTMLElement {
    /**
      * Gets or sets the intended media type of the media source.
     */
    media: string;
    msKeySystem: string;
    sizes: string;
    /**
      * The address or URL of the a media resource that is to be considered.
      */
    src: string;
    srcset: string;
    /**
     * Gets or sets the MIME type of a media resource.
     */
    type: string;
}

declare var HTMLSourceElement: {
    prototype: HTMLSourceElement;
    new(): HTMLSourceElement;
}

interface HTMLSpanElement extends HTMLElement {
}

declare var HTMLSpanElement: {
    prototype: HTMLSpanElement;
    new(): HTMLSpanElement;
}

interface HTMLStyleElement extends HTMLElement, LinkStyle {
    disabled: boolean;
    /**
      * Sets or retrieves the media type.
      */
    media: string;
    /**
      * Retrieves the CSS language in which the style sheet is written.
      */
    type: string;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var HTMLStyleElement: {
    prototype: HTMLStyleElement;
    new(): HTMLStyleElement;
}

interface HTMLTableCaptionElement extends HTMLElement {
    /**
      * Sets or retrieves the alignment of the caption or legend.
      */
    align: string;
    /**
      * Sets or retrieves whether the caption appears at the top or bottom of the table.
      */
    vAlign: string;
}

declare var HTMLTableCaptionElement: {
    prototype: HTMLTableCaptionElement;
    new(): HTMLTableCaptionElement;
}

interface HTMLTableCellElement extends HTMLElement, HTMLTableAlignment {
    /**
      * Sets or retrieves abbreviated text for the object.
      */
    abbr: string;
    /**
      * Sets or retrieves how the object is aligned with adjacent text.
      */
    align: string;
    /**
      * Sets or retrieves a comma-delimited list of conceptual categories associated with the object.
      */
    axis: string;
    bgColor: any;
    /**
      * Retrieves the position of the object in the cells collection of a row.
      */
    readonly cellIndex: number;
    /**
      * Sets or retrieves the number columns in the table that the object should span.
      */
    colSpan: number;
    /**
      * Sets or retrieves a list of header cells that provide information for the object.
      */
    headers: string;
    /**
      * Sets or retrieves the height of the object.
      */
    height: any;
    /**
      * Sets or retrieves whether the browser automatically performs wordwrap.
      */
    noWrap: boolean;
    /**
      * Sets or retrieves how many rows in a table the cell should span.
      */
    rowSpan: number;
    /**
      * Sets or retrieves the group of cells in a table to which the object's information applies.
      */
    scope: string;
    /**
      * Sets or retrieves the width of the object.
      */
    width: string;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var HTMLTableCellElement: {
    prototype: HTMLTableCellElement;
    new(): HTMLTableCellElement;
}

interface HTMLTableColElement extends HTMLElement, HTMLTableAlignment {
    /**
      * Sets or retrieves the alignment of the object relative to the display or table.
      */
    align: string;
    /**
      * Sets or retrieves the number of columns in the group.
      */
    span: number;
    /**
      * Sets or retrieves the width of the object.
      */
    width: any;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var HTMLTableColElement: {
    prototype: HTMLTableColElement;
    new(): HTMLTableColElement;
}

interface HTMLTableDataCellElement extends HTMLTableCellElement {
}

declare var HTMLTableDataCellElement: {
    prototype: HTMLTableDataCellElement;
    new(): HTMLTableDataCellElement;
}

interface HTMLTableElement extends HTMLElement {
    /**
      * Sets or retrieves a value that indicates the table alignment.
      */
    align: string;
    bgColor: any;
    /**
      * Sets or retrieves the width of the border to draw around the object.
      */
    border: string;
    /**
      * Sets or retrieves the border color of the object.
      */
    borderColor: any;
    /**
      * Retrieves the caption object of a table.
      */
    caption: HTMLTableCaptionElement;
    /**
      * Sets or retrieves the amount of space between the border of the cell and the content of the cell.
      */
    cellPadding: string;
    /**
      * Sets or retrieves the amount of space between cells in a table.
      */
    cellSpacing: string;
    /**
      * Sets or retrieves the number of columns in the table.
      */
    cols: number;
    /**
      * Sets or retrieves the way the border frame around the table is displayed.
      */
    frame: string;
    /**
      * Sets or retrieves the height of the object.
      */
    height: any;
    /**
      * Sets or retrieves the number of horizontal rows contained in the object.
      */
    rows: HTMLCollectionOf<HTMLTableRowElement>;
    /**
      * Sets or retrieves which dividing lines (inner borders) are displayed.
      */
    rules: string;
    /**
      * Sets or retrieves a description and/or structure of the object.
      */
    summary: string;
    /**
      * Retrieves a collection of all tBody objects in the table. Objects in this collection are in source order.
      */
    tBodies: HTMLCollectionOf<HTMLTableSectionElement>;
    /**
      * Retrieves the tFoot object of the table.
      */
    tFoot: HTMLTableSectionElement;
    /**
      * Retrieves the tHead object of the table.
      */
    tHead: HTMLTableSectionElement;
    /**
      * Sets or retrieves the width of the object.
      */
    width: string;
    /**
      * Creates an empty caption element in the table.
      */
    createCaption(): HTMLTableCaptionElement;
    /**
      * Creates an empty tBody element in the table.
      */
    createTBody(): HTMLTableSectionElement;
    /**
      * Creates an empty tFoot element in the table.
      */
    createTFoot(): HTMLTableSectionElement;
    /**
      * Returns the tHead element object if successful, or null otherwise.
      */
    createTHead(): HTMLTableSectionElement;
    /**
      * Deletes the caption element and its contents from the table.
      */
    deleteCaption(): void;
    /**
      * Removes the specified row (tr) from the element and from the rows collection.
      * @param index Number that specifies the zero-based position in the rows collection of the row to remove.
      */
    deleteRow(index?: number): void;
    /**
      * Deletes the tFoot element and its contents from the table.
      */
    deleteTFoot(): void;
    /**
      * Deletes the tHead element and its contents from the table.
      */
    deleteTHead(): void;
    /**
      * Creates a new row (tr) in the table, and adds the row to the rows collection.
      * @param index Number that specifies where to insert the row in the rows collection. The default value is -1, which appends the new row to the end of the rows collection.
      */
    insertRow(index?: number): HTMLTableRowElement;
}

declare var HTMLTableElement: {
    prototype: HTMLTableElement;
    new(): HTMLTableElement;
}

interface HTMLTableHeaderCellElement extends HTMLTableCellElement {
    /**
      * Sets or retrieves the group of cells in a table to which the object's information applies.
      */
    scope: string;
}

declare var HTMLTableHeaderCellElement: {
    prototype: HTMLTableHeaderCellElement;
    new(): HTMLTableHeaderCellElement;
}

interface HTMLTableRowElement extends HTMLElement, HTMLTableAlignment {
    /**
      * Sets or retrieves how the object is aligned with adjacent text.
      */
    align: string;
    bgColor: any;
    /**
      * Retrieves a collection of all cells in the table row.
      */
    cells: HTMLCollectionOf<HTMLTableDataCellElement | HTMLTableHeaderCellElement>;
    /**
      * Sets or retrieves the height of the object.
      */
    height: any;
    /**
      * Retrieves the position of the object in the rows collection for the table.
      */
    readonly rowIndex: number;
    /**
      * Retrieves the position of the object in the collection.
      */
    readonly sectionRowIndex: number;
    /**
      * Removes the specified cell from the table row, as well as from the cells collection.
      * @param index Number that specifies the zero-based position of the cell to remove from the table row. If no value is provided, the last cell in the cells collection is deleted.
      */
    deleteCell(index?: number): void;
    /**
      * Creates a new cell in the table row, and adds the cell to the cells collection.
      * @param index Number that specifies where to insert the cell in the tr. The default value is -1, which appends the new cell to the end of the cells collection.
      */
    insertCell(index?: number): HTMLTableDataCellElement;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var HTMLTableRowElement: {
    prototype: HTMLTableRowElement;
    new(): HTMLTableRowElement;
}

interface HTMLTableSectionElement extends HTMLElement, HTMLTableAlignment {
    /**
      * Sets or retrieves a value that indicates the table alignment.
      */
    align: string;
    /**
      * Sets or retrieves the number of horizontal rows contained in the object.
      */
    rows: HTMLCollectionOf<HTMLTableRowElement>;
    /**
      * Removes the specified row (tr) from the element and from the rows collection.
      * @param index Number that specifies the zero-based position in the rows collection of the row to remove.
      */
    deleteRow(index?: number): void;
    /**
      * Creates a new row (tr) in the table, and adds the row to the rows collection.
      * @param index Number that specifies where to insert the row in the rows collection. The default value is -1, which appends the new row to the end of the rows collection.
      */
    insertRow(index?: number): HTMLTableRowElement;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var HTMLTableSectionElement: {
    prototype: HTMLTableSectionElement;
    new(): HTMLTableSectionElement;
}

interface HTMLTemplateElement extends HTMLElement {
    readonly content: DocumentFragment;
}

declare var HTMLTemplateElement: {
    prototype: HTMLTemplateElement;
    new(): HTMLTemplateElement;
}

interface HTMLTextAreaElement extends HTMLElement {
    /**
      * Provides a way to direct a user to a specific field when a document loads. This can provide both direction and convenience for a user, reducing the need to click or tab to a field when a page opens. This attribute is true when present on an element, and false when missing.
      */
    autofocus: boolean;
    /**
      * Sets or retrieves the width of the object.
      */
    cols: number;
    /**
      * Sets or retrieves the initial contents of the object.
      */
    defaultValue: string;
    disabled: boolean;
    /**
      * Retrieves a reference to the form that the object is embedded in.
      */
    readonly form: HTMLFormElement;
    /**
      * Sets or retrieves the maximum number of characters that the user can enter in a text control.
      */
    maxLength: number;
    /**
      * Sets or retrieves the name of the object.
      */
    name: string;
    /**
      * Gets or sets a text string that is displayed in an input field as a hint or prompt to users as the format or type of information they need to enter.The text appears in an input field until the user puts focus on the field.
      */
    placeholder: string;
    /**
      * Sets or retrieves the value indicated whether the content of the object is read-only.
      */
    readOnly: boolean;
    /**
      * When present, marks an element that can't be submitted without a value.
      */
    required: boolean;
    /**
      * Sets or retrieves the number of horizontal rows contained in the object.
      */
    rows: number;
    /**
      * Gets or sets the end position or offset of a text selection.
      */
    selectionEnd: number;
    /**
      * Gets or sets the starting position or offset of a text selection.
      */
    selectionStart: number;
    /**
      * Sets or retrieves the value indicating whether the control is selected.
      */
    status: any;
    /**
      * Retrieves the type of control.
      */
    readonly type: string;
    /**
      * Returns the error message that would be displayed if the user submits the form, or an empty string if no error message. It also triggers the standard error message, such as "this is a required field". The result is that the user sees validation messages without actually submitting.
      */
    readonly validationMessage: string;
    /**
      * Returns a  ValidityState object that represents the validity states of an element.
      */
    readonly validity: ValidityState;
    /**
      * Retrieves or sets the text in the entry field of the textArea element.
      */
    value: string;
    /**
      * Returns whether an element will successfully validate based on forms validation rules and constraints.
      */
    readonly willValidate: boolean;
    /**
      * Sets or retrieves how to handle wordwrapping in the object.
      */
    wrap: string;
    minLength: number;
    /**
      * Returns whether a form will validate when it is submitted, without having to submit it.
      */
    checkValidity(): boolean;
    /**
      * Highlights the input area of a form element.
      */
    select(): void;
    /**
      * Sets a custom error message that is displayed when a form is submitted.
      * @param error Sets a custom error message that is displayed when a form is submitted.
      */
    setCustomValidity(error: string): void;
    /**
      * Sets the start and end positions of a selection in a text field.
      * @param start The offset into the text field for the start of the selection.
      * @param end The offset into the text field for the end of the selection.
      */
    setSelectionRange(start: number, end: number): void;
}

declare var HTMLTextAreaElement: {
    prototype: HTMLTextAreaElement;
    new(): HTMLTextAreaElement;
}

interface HTMLTitleElement extends HTMLElement {
    /**
      * Retrieves or sets the text of the object as a string.
      */
    text: string;
}

declare var HTMLTitleElement: {
    prototype: HTMLTitleElement;
    new(): HTMLTitleElement;
}

interface HTMLTrackElement extends HTMLElement {
    default: boolean;
    kind: string;
    label: string;
    readonly readyState: number;
    src: string;
    srclang: string;
    readonly track: TextTrack;
    readonly ERROR: number;
    readonly LOADED: number;
    readonly LOADING: number;
    readonly NONE: number;
}

declare var HTMLTrackElement: {
    prototype: HTMLTrackElement;
    new(): HTMLTrackElement;
    readonly ERROR: number;
    readonly LOADED: number;
    readonly LOADING: number;
    readonly NONE: number;
}

interface HTMLUListElement extends HTMLElement {
    compact: boolean;
    type: string;
}

declare var HTMLUListElement: {
    prototype: HTMLUListElement;
    new(): HTMLUListElement;
}

interface HTMLUnknownElement extends HTMLElement {
}

declare var HTMLUnknownElement: {
    prototype: HTMLUnknownElement;
    new(): HTMLUnknownElement;
}

interface HTMLVideoElement extends HTMLMediaElement {
    /**
      * Gets or sets the height of the video element.
      */
    height: number;
    msHorizontalMirror: boolean;
    readonly msIsLayoutOptimalForPlayback: boolean;
    readonly msIsStereo3D: boolean;
    msStereo3DPackingMode: string;
    msStereo3DRenderMode: string;
    msZoom: boolean;
    onMSVideoFormatChanged: (this: this, ev: Event) => any;
    onMSVideoFrameStepCompleted: (this: this, ev: Event) => any;
    onMSVideoOptimalLayoutChanged: (this: this, ev: Event) => any;
    /**
      * Gets or sets a URL of an image to display, for example, like a movie poster. This can be a still frame from the video, or another image if no video data is available.
      */
    poster: string;
    /**
      * Gets the intrinsic height of a video in CSS pixels, or zero if the dimensions are not known.
      */
    readonly videoHeight: number;
    /**
      * Gets the intrinsic width of a video in CSS pixels, or zero if the dimensions are not known.
      */
    readonly videoWidth: number;
    readonly webkitDisplayingFullscreen: boolean;
    readonly webkitSupportsFullscreen: boolean;
    /**
      * Gets or sets the width of the video element.
      */
    width: number;
    getVideoPlaybackQuality(): VideoPlaybackQuality;
    msFrameStep(forward: boolean): void;
    msInsertVideoEffect(activatableClassId: string, effectRequired: boolean, config?: any): void;
    msSetVideoRectangle(left: number, top: number, right: number, bottom: number): void;
    webkitEnterFullScreen(): void;
    webkitEnterFullscreen(): void;
    webkitExitFullScreen(): void;
    webkitExitFullscreen(): void;
    addEventListener(type: "MSContentZoom", listener: (this: this, ev: UIEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSGestureChange", listener: (this: this, ev: MSGestureEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSGestureDoubleTap", listener: (this: this, ev: MSGestureEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSGestureEnd", listener: (this: this, ev: MSGestureEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSGestureHold", listener: (this: this, ev: MSGestureEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSGestureStart", listener: (this: this, ev: MSGestureEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSGestureTap", listener: (this: this, ev: MSGestureEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSGotPointerCapture", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSInertiaStart", listener: (this: this, ev: MSGestureEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSLostPointerCapture", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSManipulationStateChanged", listener: (this: this, ev: MSManipulationEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSPointerCancel", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSPointerDown", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSPointerEnter", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSPointerLeave", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSPointerMove", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSPointerOut", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSPointerOver", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSPointerUp", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSVideoFormatChanged", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "MSVideoFrameStepCompleted", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "MSVideoOptimalLayoutChanged", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "abort", listener: (this: this, ev: UIEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "activate", listener: (this: this, ev: UIEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "ariarequest", listener: (this: this, ev: AriaRequestEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "beforeactivate", listener: (this: this, ev: UIEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "beforecopy", listener: (this: this, ev: ClipboardEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "beforecut", listener: (this: this, ev: ClipboardEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "beforedeactivate", listener: (this: this, ev: UIEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "beforepaste", listener: (this: this, ev: ClipboardEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "blur", listener: (this: this, ev: FocusEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "canplay", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "canplaythrough", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "change", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "click", listener: (this: this, ev: MouseEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "command", listener: (this: this, ev: CommandEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "contextmenu", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "copy", listener: (this: this, ev: ClipboardEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "cuechange", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "cut", listener: (this: this, ev: ClipboardEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "dblclick", listener: (this: this, ev: MouseEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "deactivate", listener: (this: this, ev: UIEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "drag", listener: (this: this, ev: DragEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "dragend", listener: (this: this, ev: DragEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "dragenter", listener: (this: this, ev: DragEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "dragleave", listener: (this: this, ev: DragEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "dragover", listener: (this: this, ev: DragEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "dragstart", listener: (this: this, ev: DragEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "drop", listener: (this: this, ev: DragEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "durationchange", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "emptied", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "encrypted", listener: (this: this, ev: MediaEncryptedEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "ended", listener: (this: this, ev: MediaStreamErrorEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "error", listener: (this: this, ev: ErrorEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "focus", listener: (this: this, ev: FocusEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "gotpointercapture", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "input", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "invalid", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "keydown", listener: (this: this, ev: KeyboardEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "keypress", listener: (this: this, ev: KeyboardEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "keyup", listener: (this: this, ev: KeyboardEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "load", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "loadeddata", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "loadedmetadata", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "loadstart", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "lostpointercapture", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "mousedown", listener: (this: this, ev: MouseEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "mouseenter", listener: (this: this, ev: MouseEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "mouseleave", listener: (this: this, ev: MouseEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "mousemove", listener: (this: this, ev: MouseEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "mouseout", listener: (this: this, ev: MouseEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "mouseover", listener: (this: this, ev: MouseEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "mouseup", listener: (this: this, ev: MouseEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "mousewheel", listener: (this: this, ev: WheelEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "msneedkey", listener: (this: this, ev: MSMediaKeyNeededEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "paste", listener: (this: this, ev: ClipboardEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pause", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "play", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "playing", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "pointercancel", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pointerdown", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pointerenter", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pointerleave", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pointermove", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pointerout", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pointerover", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pointerup", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "progress", listener: (this: this, ev: ProgressEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "ratechange", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "reset", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "scroll", listener: (this: this, ev: UIEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "seeked", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "seeking", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "select", listener: (this: this, ev: UIEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "selectstart", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "stalled", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "submit", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "suspend", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "timeupdate", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "touchcancel", listener: (this: this, ev: TouchEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "touchend", listener: (this: this, ev: TouchEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "touchmove", listener: (this: this, ev: TouchEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "touchstart", listener: (this: this, ev: TouchEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "volumechange", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "waiting", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "webkitfullscreenchange", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "webkitfullscreenerror", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "wheel", listener: (this: this, ev: WheelEvent) => any, useCapture?: boolean): void;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var HTMLVideoElement: {
    prototype: HTMLVideoElement;
    new(): HTMLVideoElement;
}

interface HashChangeEvent extends Event {
    readonly newURL: string | null;
    readonly oldURL: string | null;
}

declare var HashChangeEvent: {
    prototype: HashChangeEvent;
    new(type: string, eventInitDict?: HashChangeEventInit): HashChangeEvent;
}

interface History {
    readonly length: number;
    readonly state: any;
    back(distance?: any): void;
    forward(distance?: any): void;
    go(delta?: any): void;
    pushState(statedata: any, title?: string, url?: string): void;
    replaceState(statedata: any, title?: string, url?: string): void;
}

declare var History: {
    prototype: History;
    new(): History;
}

interface IDBCursor {
    readonly direction: string;
    key: IDBKeyRange | IDBValidKey;
    readonly primaryKey: any;
    source: IDBObjectStore | IDBIndex;
    advance(count: number): void;
    continue(key?: IDBKeyRange | IDBValidKey): void;
    delete(): IDBRequest;
    update(value: any): IDBRequest;
    readonly NEXT: string;
    readonly NEXT_NO_DUPLICATE: string;
    readonly PREV: string;
    readonly PREV_NO_DUPLICATE: string;
}

declare var IDBCursor: {
    prototype: IDBCursor;
    new(): IDBCursor;
    readonly NEXT: string;
    readonly NEXT_NO_DUPLICATE: string;
    readonly PREV: string;
    readonly PREV_NO_DUPLICATE: string;
}

interface IDBCursorWithValue extends IDBCursor {
    readonly value: any;
}

declare var IDBCursorWithValue: {
    prototype: IDBCursorWithValue;
    new(): IDBCursorWithValue;
}

interface IDBDatabase extends EventTarget {
    readonly name: string;
    readonly objectStoreNames: DOMStringList;
    onabort: (this: this, ev: Event) => any;
    onerror: (this: this, ev: ErrorEvent) => any;
    version: number;
    onversionchange: (ev: IDBVersionChangeEvent) => any;
    close(): void;
    createObjectStore(name: string, optionalParameters?: IDBObjectStoreParameters): IDBObjectStore;
    deleteObjectStore(name: string): void;
    transaction(storeNames: string | string[], mode?: string): IDBTransaction;
    addEventListener(type: "versionchange", listener: (ev: IDBVersionChangeEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "abort", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "error", listener: (this: this, ev: ErrorEvent) => any, useCapture?: boolean): void;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var IDBDatabase: {
    prototype: IDBDatabase;
    new(): IDBDatabase;
}

interface IDBFactory {
    cmp(first: any, second: any): number;
    deleteDatabase(name: string): IDBOpenDBRequest;
    open(name: string, version?: number): IDBOpenDBRequest;
}

declare var IDBFactory: {
    prototype: IDBFactory;
    new(): IDBFactory;
}

interface IDBIndex {
    keyPath: string | string[];
    readonly name: string;
    readonly objectStore: IDBObjectStore;
    readonly unique: boolean;
    multiEntry: boolean;
    count(key?: IDBKeyRange | IDBValidKey): IDBRequest;
    get(key: IDBKeyRange | IDBValidKey): IDBRequest;
    getKey(key: IDBKeyRange | IDBValidKey): IDBRequest;
    openCursor(range?: IDBKeyRange | IDBValidKey, direction?: string): IDBRequest;
    openKeyCursor(range?: IDBKeyRange | IDBValidKey, direction?: string): IDBRequest;
}

declare var IDBIndex: {
    prototype: IDBIndex;
    new(): IDBIndex;
}

interface IDBKeyRange {
    readonly lower: any;
    readonly lowerOpen: boolean;
    readonly upper: any;
    readonly upperOpen: boolean;
}

declare var IDBKeyRange: {
    prototype: IDBKeyRange;
    new(): IDBKeyRange;
    bound(lower: any, upper: any, lowerOpen?: boolean, upperOpen?: boolean): IDBKeyRange;
    lowerBound(lower: any, open?: boolean): IDBKeyRange;
    only(value: any): IDBKeyRange;
    upperBound(upper: any, open?: boolean): IDBKeyRange;
}

interface IDBObjectStore {
    readonly indexNames: DOMStringList;
    keyPath: string | string[];
    readonly name: string;
    readonly transaction: IDBTransaction;
    autoIncrement: boolean;
    add(value: any, key?: IDBKeyRange | IDBValidKey): IDBRequest;
    clear(): IDBRequest;
    count(key?: IDBKeyRange | IDBValidKey): IDBRequest;
    createIndex(name: string, keyPath: string | string[], optionalParameters?: IDBIndexParameters): IDBIndex;
    delete(key: IDBKeyRange | IDBValidKey): IDBRequest;
    deleteIndex(indexName: string): void;
    get(key: any): IDBRequest;
    index(name: string): IDBIndex;
    openCursor(range?: IDBKeyRange | IDBValidKey, direction?: string): IDBRequest;
    put(value: any, key?: IDBKeyRange | IDBValidKey): IDBRequest;
}

declare var IDBObjectStore: {
    prototype: IDBObjectStore;
    new(): IDBObjectStore;
}

interface IDBOpenDBRequest extends IDBRequest {
    onblocked: (this: this, ev: Event) => any;
    onupgradeneeded: (this: this, ev: IDBVersionChangeEvent) => any;
    addEventListener(type: "blocked", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "error", listener: (this: this, ev: ErrorEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "success", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "upgradeneeded", listener: (this: this, ev: IDBVersionChangeEvent) => any, useCapture?: boolean): void;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var IDBOpenDBRequest: {
    prototype: IDBOpenDBRequest;
    new(): IDBOpenDBRequest;
}

interface IDBRequest extends EventTarget {
    readonly error: DOMError;
    onerror: (this: this, ev: ErrorEvent) => any;
    onsuccess: (this: this, ev: Event) => any;
    readonly readyState: string;
    readonly result: any;
    source: IDBObjectStore | IDBIndex | IDBCursor;
    readonly transaction: IDBTransaction;
    addEventListener(type: "error", listener: (this: this, ev: ErrorEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "success", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var IDBRequest: {
    prototype: IDBRequest;
    new(): IDBRequest;
}

interface IDBTransaction extends EventTarget {
    readonly db: IDBDatabase;
    readonly error: DOMError;
    readonly mode: string;
    onabort: (this: this, ev: Event) => any;
    oncomplete: (this: this, ev: Event) => any;
    onerror: (this: this, ev: ErrorEvent) => any;
    abort(): void;
    objectStore(name: string): IDBObjectStore;
    readonly READ_ONLY: string;
    readonly READ_WRITE: string;
    readonly VERSION_CHANGE: string;
    addEventListener(type: "abort", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "complete", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "error", listener: (this: this, ev: ErrorEvent) => any, useCapture?: boolean): void;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var IDBTransaction: {
    prototype: IDBTransaction;
    new(): IDBTransaction;
    readonly READ_ONLY: string;
    readonly READ_WRITE: string;
    readonly VERSION_CHANGE: string;
}

interface IDBVersionChangeEvent extends Event {
    readonly newVersion: number | null;
    readonly oldVersion: number;
}

declare var IDBVersionChangeEvent: {
    prototype: IDBVersionChangeEvent;
    new(): IDBVersionChangeEvent;
}

interface ImageData {
    data: Uint8ClampedArray;
    readonly height: number;
    readonly width: number;
}

declare var ImageData: {
    prototype: ImageData;
    new(width: number, height: number): ImageData;
    new(array: Uint8ClampedArray, width: number, height: number): ImageData;
}

interface KeyboardEvent extends UIEvent {
    readonly altKey: boolean;
    readonly char: string | null;
    readonly charCode: number;
    readonly ctrlKey: boolean;
    readonly key: string;
    readonly keyCode: number;
    readonly locale: string;
    readonly location: number;
    readonly metaKey: boolean;
    readonly repeat: boolean;
    readonly shiftKey: boolean;
    readonly which: number;
    readonly code: string;
    getModifierState(keyArg: string): boolean;
    initKeyboardEvent(typeArg: string, canBubbleArg: boolean, cancelableArg: boolean, viewArg: Window, keyArg: string, locationArg: number, modifiersListArg: string, repeat: boolean, locale: string): void;
    readonly DOM_KEY_LOCATION_JOYSTICK: number;
    readonly DOM_KEY_LOCATION_LEFT: number;
    readonly DOM_KEY_LOCATION_MOBILE: number;
    readonly DOM_KEY_LOCATION_NUMPAD: number;
    readonly DOM_KEY_LOCATION_RIGHT: number;
    readonly DOM_KEY_LOCATION_STANDARD: number;
}

declare var KeyboardEvent: {
    prototype: KeyboardEvent;
    new(typeArg: string, eventInitDict?: KeyboardEventInit): KeyboardEvent;
    readonly DOM_KEY_LOCATION_JOYSTICK: number;
    readonly DOM_KEY_LOCATION_LEFT: number;
    readonly DOM_KEY_LOCATION_MOBILE: number;
    readonly DOM_KEY_LOCATION_NUMPAD: number;
    readonly DOM_KEY_LOCATION_RIGHT: number;
    readonly DOM_KEY_LOCATION_STANDARD: number;
}

interface ListeningStateChangedEvent extends Event {
    readonly label: string;
    readonly state: string;
}

declare var ListeningStateChangedEvent: {
    prototype: ListeningStateChangedEvent;
    new(): ListeningStateChangedEvent;
}

interface Location {
    hash: string;
    host: string;
    hostname: string;
    href: string;
    readonly origin: string;
    pathname: string;
    port: string;
    protocol: string;
    search: string;
    assign(url: string): void;
    reload(forcedReload?: boolean): void;
    replace(url: string): void;
    toString(): string;
}

declare var Location: {
    prototype: Location;
    new(): Location;
}

interface LongRunningScriptDetectedEvent extends Event {
    readonly executionTime: number;
    stopPageScriptExecution: boolean;
}

declare var LongRunningScriptDetectedEvent: {
    prototype: LongRunningScriptDetectedEvent;
    new(): LongRunningScriptDetectedEvent;
}

interface MSApp {
    clearTemporaryWebDataAsync(): MSAppAsyncOperation;
    createBlobFromRandomAccessStream(type: string, seeker: any): Blob;
    createDataPackage(object: any): any;
    createDataPackageFromSelection(): any;
    createFileFromStorageFile(storageFile: any): File;
    createStreamFromInputStream(type: string, inputStream: any): MSStream;
    execAsyncAtPriority(asynchronousCallback: MSExecAtPriorityFunctionCallback, priority: string, ...args: any[]): void;
    execAtPriority(synchronousCallback: MSExecAtPriorityFunctionCallback, priority: string, ...args: any[]): any;
    getCurrentPriority(): string;
    getHtmlPrintDocumentSourceAsync(htmlDoc: any): PromiseLike<any>;
    getViewId(view: any): any;
    isTaskScheduledAtPriorityOrHigher(priority: string): boolean;
    pageHandlesAllApplicationActivations(enabled: boolean): void;
    suppressSubdownloadCredentialPrompts(suppress: boolean): void;
    terminateApp(exceptionObject: any): void;
    readonly CURRENT: string;
    readonly HIGH: string;
    readonly IDLE: string;
    readonly NORMAL: string;
}
declare var MSApp: MSApp;

interface MSAppAsyncOperation extends EventTarget {
    readonly error: DOMError;
    oncomplete: (this: this, ev: Event) => any;
    onerror: (this: this, ev: ErrorEvent) => any;
    readonly readyState: number;
    readonly result: any;
    start(): void;
    readonly COMPLETED: number;
    readonly ERROR: number;
    readonly STARTED: number;
    addEventListener(type: "complete", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "error", listener: (this: this, ev: ErrorEvent) => any, useCapture?: boolean): void;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var MSAppAsyncOperation: {
    prototype: MSAppAsyncOperation;
    new(): MSAppAsyncOperation;
    readonly COMPLETED: number;
    readonly ERROR: number;
    readonly STARTED: number;
}

interface MSAssertion {
    readonly id: string;
    readonly type: string;
}

declare var MSAssertion: {
    prototype: MSAssertion;
    new(): MSAssertion;
}

interface MSBlobBuilder {
    append(data: any, endings?: string): void;
    getBlob(contentType?: string): Blob;
}

declare var MSBlobBuilder: {
    prototype: MSBlobBuilder;
    new(): MSBlobBuilder;
}

interface MSCredentials {
    getAssertion(challenge: string, filter?: MSCredentialFilter, params?: MSSignatureParameters): PromiseLike<MSAssertion>;
    makeCredential(accountInfo: MSAccountInfo, params: MSCredentialParameters[], challenge?: string): PromiseLike<MSAssertion>;
}

declare var MSCredentials: {
    prototype: MSCredentials;
    new(): MSCredentials;
}

interface MSFIDOCredentialAssertion extends MSAssertion {
    readonly algorithm: string | Algorithm;
    readonly attestation: any;
    readonly publicKey: string;
    readonly transportHints: string[];
}

declare var MSFIDOCredentialAssertion: {
    prototype: MSFIDOCredentialAssertion;
    new(): MSFIDOCredentialAssertion;
}

interface MSFIDOSignature {
    readonly authnrData: string;
    readonly clientData: string;
    readonly signature: string;
}

declare var MSFIDOSignature: {
    prototype: MSFIDOSignature;
    new(): MSFIDOSignature;
}

interface MSFIDOSignatureAssertion extends MSAssertion {
    readonly signature: MSFIDOSignature;
}

declare var MSFIDOSignatureAssertion: {
    prototype: MSFIDOSignatureAssertion;
    new(): MSFIDOSignatureAssertion;
}

interface MSGesture {
    target: Element;
    addPointer(pointerId: number): void;
    stop(): void;
}

declare var MSGesture: {
    prototype: MSGesture;
    new(): MSGesture;
}

interface MSGestureEvent extends UIEvent {
    readonly clientX: number;
    readonly clientY: number;
    readonly expansion: number;
    readonly gestureObject: any;
    readonly hwTimestamp: number;
    readonly offsetX: number;
    readonly offsetY: number;
    readonly rotation: number;
    readonly scale: number;
    readonly screenX: number;
    readonly screenY: number;
    readonly translationX: number;
    readonly translationY: number;
    readonly velocityAngular: number;
    readonly velocityExpansion: number;
    readonly velocityX: number;
    readonly velocityY: number;
    initGestureEvent(typeArg: string, canBubbleArg: boolean, cancelableArg: boolean, viewArg: Window, detailArg: number, screenXArg: number, screenYArg: number, clientXArg: number, clientYArg: number, offsetXArg: number, offsetYArg: number, translationXArg: number, translationYArg: number, scaleArg: number, expansionArg: number, rotationArg: number, velocityXArg: number, velocityYArg: number, velocityExpansionArg: number, velocityAngularArg: number, hwTimestampArg: number): void;
    readonly MSGESTURE_FLAG_BEGIN: number;
    readonly MSGESTURE_FLAG_CANCEL: number;
    readonly MSGESTURE_FLAG_END: number;
    readonly MSGESTURE_FLAG_INERTIA: number;
    readonly MSGESTURE_FLAG_NONE: number;
}

declare var MSGestureEvent: {
    prototype: MSGestureEvent;
    new(): MSGestureEvent;
    readonly MSGESTURE_FLAG_BEGIN: number;
    readonly MSGESTURE_FLAG_CANCEL: number;
    readonly MSGESTURE_FLAG_END: number;
    readonly MSGESTURE_FLAG_INERTIA: number;
    readonly MSGESTURE_FLAG_NONE: number;
}

interface MSGraphicsTrust {
    readonly constrictionActive: boolean;
    readonly status: string;
}

declare var MSGraphicsTrust: {
    prototype: MSGraphicsTrust;
    new(): MSGraphicsTrust;
}

interface MSHTMLWebViewElement extends HTMLElement {
    readonly canGoBack: boolean;
    readonly canGoForward: boolean;
    readonly containsFullScreenElement: boolean;
    readonly documentTitle: string;
    height: number;
    readonly settings: MSWebViewSettings;
    src: string;
    width: number;
    addWebAllowedObject(name: string, applicationObject: any): void;
    buildLocalStreamUri(contentIdentifier: string, relativePath: string): string;
    capturePreviewToBlobAsync(): MSWebViewAsyncOperation;
    captureSelectedContentToDataPackageAsync(): MSWebViewAsyncOperation;
    getDeferredPermissionRequestById(id: number): DeferredPermissionRequest;
    getDeferredPermissionRequests(): DeferredPermissionRequest[];
    goBack(): void;
    goForward(): void;
    invokeScriptAsync(scriptName: string, ...args: any[]): MSWebViewAsyncOperation;
    navigate(uri: string): void;
    navigateToLocalStreamUri(source: string, streamResolver: any): void;
    navigateToString(contents: string): void;
    navigateWithHttpRequestMessage(requestMessage: any): void;
    refresh(): void;
    stop(): void;
}

declare var MSHTMLWebViewElement: {
    prototype: MSHTMLWebViewElement;
    new(): MSHTMLWebViewElement;
}

interface MSInputMethodContext extends EventTarget {
    readonly compositionEndOffset: number;
    readonly compositionStartOffset: number;
    oncandidatewindowhide: (this: this, ev: Event) => any;
    oncandidatewindowshow: (this: this, ev: Event) => any;
    oncandidatewindowupdate: (this: this, ev: Event) => any;
    readonly target: HTMLElement;
    getCandidateWindowClientRect(): ClientRect;
    getCompositionAlternatives(): string[];
    hasComposition(): boolean;
    isCandidateWindowVisible(): boolean;
    addEventListener(type: "MSCandidateWindowHide", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "MSCandidateWindowShow", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "MSCandidateWindowUpdate", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var MSInputMethodContext: {
    prototype: MSInputMethodContext;
    new(): MSInputMethodContext;
}

interface MSManipulationEvent extends UIEvent {
    readonly currentState: number;
    readonly inertiaDestinationX: number;
    readonly inertiaDestinationY: number;
    readonly lastState: number;
    initMSManipulationEvent(typeArg: string, canBubbleArg: boolean, cancelableArg: boolean, viewArg: Window, detailArg: number, lastState: number, currentState: number): void;
    readonly MS_MANIPULATION_STATE_ACTIVE: number;
    readonly MS_MANIPULATION_STATE_CANCELLED: number;
    readonly MS_MANIPULATION_STATE_COMMITTED: number;
    readonly MS_MANIPULATION_STATE_DRAGGING: number;
    readonly MS_MANIPULATION_STATE_INERTIA: number;
    readonly MS_MANIPULATION_STATE_PRESELECT: number;
    readonly MS_MANIPULATION_STATE_SELECTING: number;
    readonly MS_MANIPULATION_STATE_STOPPED: number;
}

declare var MSManipulationEvent: {
    prototype: MSManipulationEvent;
    new(): MSManipulationEvent;
    readonly MS_MANIPULATION_STATE_ACTIVE: number;
    readonly MS_MANIPULATION_STATE_CANCELLED: number;
    readonly MS_MANIPULATION_STATE_COMMITTED: number;
    readonly MS_MANIPULATION_STATE_DRAGGING: number;
    readonly MS_MANIPULATION_STATE_INERTIA: number;
    readonly MS_MANIPULATION_STATE_PRESELECT: number;
    readonly MS_MANIPULATION_STATE_SELECTING: number;
    readonly MS_MANIPULATION_STATE_STOPPED: number;
}

interface MSMediaKeyError {
    readonly code: number;
    readonly systemCode: number;
    readonly MS_MEDIA_KEYERR_CLIENT: number;
    readonly MS_MEDIA_KEYERR_DOMAIN: number;
    readonly MS_MEDIA_KEYERR_HARDWARECHANGE: number;
    readonly MS_MEDIA_KEYERR_OUTPUT: number;
    readonly MS_MEDIA_KEYERR_SERVICE: number;
    readonly MS_MEDIA_KEYERR_UNKNOWN: number;
}

declare var MSMediaKeyError: {
    prototype: MSMediaKeyError;
    new(): MSMediaKeyError;
    readonly MS_MEDIA_KEYERR_CLIENT: number;
    readonly MS_MEDIA_KEYERR_DOMAIN: number;
    readonly MS_MEDIA_KEYERR_HARDWARECHANGE: number;
    readonly MS_MEDIA_KEYERR_OUTPUT: number;
    readonly MS_MEDIA_KEYERR_SERVICE: number;
    readonly MS_MEDIA_KEYERR_UNKNOWN: number;
}

interface MSMediaKeyMessageEvent extends Event {
    readonly destinationURL: string | null;
    readonly message: Uint8Array;
}

declare var MSMediaKeyMessageEvent: {
    prototype: MSMediaKeyMessageEvent;
    new(): MSMediaKeyMessageEvent;
}

interface MSMediaKeyNeededEvent extends Event {
    readonly initData: Uint8Array | null;
}

declare var MSMediaKeyNeededEvent: {
    prototype: MSMediaKeyNeededEvent;
    new(): MSMediaKeyNeededEvent;
}

interface MSMediaKeySession extends EventTarget {
    readonly error: MSMediaKeyError | null;
    readonly keySystem: string;
    readonly sessionId: string;
    close(): void;
    update(key: Uint8Array): void;
}

declare var MSMediaKeySession: {
    prototype: MSMediaKeySession;
    new(): MSMediaKeySession;
}

interface MSMediaKeys {
    readonly keySystem: string;
    createSession(type: string, initData: Uint8Array, cdmData?: Uint8Array): MSMediaKeySession;
}

declare var MSMediaKeys: {
    prototype: MSMediaKeys;
    new(keySystem: string): MSMediaKeys;
    isTypeSupported(keySystem: string, type?: string): boolean;
    isTypeSupportedWithFeatures(keySystem: string, type?: string): string;
}

interface MSPointerEvent extends MouseEvent {
    readonly currentPoint: any;
    readonly height: number;
    readonly hwTimestamp: number;
    readonly intermediatePoints: any;
    readonly isPrimary: boolean;
    readonly pointerId: number;
    readonly pointerType: any;
    readonly pressure: number;
    readonly rotation: number;
    readonly tiltX: number;
    readonly tiltY: number;
    readonly width: number;
    getCurrentPoint(element: Element): void;
    getIntermediatePoints(element: Element): void;
    initPointerEvent(typeArg: string, canBubbleArg: boolean, cancelableArg: boolean, viewArg: Window, detailArg: number, screenXArg: number, screenYArg: number, clientXArg: number, clientYArg: number, ctrlKeyArg: boolean, altKeyArg: boolean, shiftKeyArg: boolean, metaKeyArg: boolean, buttonArg: number, relatedTargetArg: EventTarget, offsetXArg: number, offsetYArg: number, widthArg: number, heightArg: number, pressure: number, rotation: number, tiltX: number, tiltY: number, pointerIdArg: number, pointerType: any, hwTimestampArg: number, isPrimary: boolean): void;
}

declare var MSPointerEvent: {
    prototype: MSPointerEvent;
    new(typeArg: string, eventInitDict?: PointerEventInit): MSPointerEvent;
}

interface MSRangeCollection {
    readonly length: number;
    item(index: number): Range;
    [index: number]: Range;
}

declare var MSRangeCollection: {
    prototype: MSRangeCollection;
    new(): MSRangeCollection;
}

interface MSSiteModeEvent extends Event {
    readonly actionURL: string;
    readonly buttonID: number;
}

declare var MSSiteModeEvent: {
    prototype: MSSiteModeEvent;
    new(): MSSiteModeEvent;
}

interface MSStream {
    readonly type: string;
    msClose(): void;
    msDetachStream(): any;
}

declare var MSStream: {
    prototype: MSStream;
    new(): MSStream;
}

interface MSStreamReader extends EventTarget, MSBaseReader {
    readonly error: DOMError;
    readAsArrayBuffer(stream: MSStream, size?: number): void;
    readAsBinaryString(stream: MSStream, size?: number): void;
    readAsBlob(stream: MSStream, size?: number): void;
    readAsDataURL(stream: MSStream, size?: number): void;
    readAsText(stream: MSStream, encoding?: string, size?: number): void;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var MSStreamReader: {
    prototype: MSStreamReader;
    new(): MSStreamReader;
}

interface MSWebViewAsyncOperation extends EventTarget {
    readonly error: DOMError;
    oncomplete: (this: this, ev: Event) => any;
    onerror: (this: this, ev: ErrorEvent) => any;
    readonly readyState: number;
    readonly result: any;
    readonly target: MSHTMLWebViewElement;
    readonly type: number;
    start(): void;
    readonly COMPLETED: number;
    readonly ERROR: number;
    readonly STARTED: number;
    readonly TYPE_CAPTURE_PREVIEW_TO_RANDOM_ACCESS_STREAM: number;
    readonly TYPE_CREATE_DATA_PACKAGE_FROM_SELECTION: number;
    readonly TYPE_INVOKE_SCRIPT: number;
    addEventListener(type: "complete", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "error", listener: (this: this, ev: ErrorEvent) => any, useCapture?: boolean): void;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var MSWebViewAsyncOperation: {
    prototype: MSWebViewAsyncOperation;
    new(): MSWebViewAsyncOperation;
    readonly COMPLETED: number;
    readonly ERROR: number;
    readonly STARTED: number;
    readonly TYPE_CAPTURE_PREVIEW_TO_RANDOM_ACCESS_STREAM: number;
    readonly TYPE_CREATE_DATA_PACKAGE_FROM_SELECTION: number;
    readonly TYPE_INVOKE_SCRIPT: number;
}

interface MSWebViewSettings {
    isIndexedDBEnabled: boolean;
    isJavaScriptEnabled: boolean;
}

declare var MSWebViewSettings: {
    prototype: MSWebViewSettings;
    new(): MSWebViewSettings;
}

interface MediaDeviceInfo {
    readonly deviceId: string;
    readonly groupId: string;
    readonly kind: string;
    readonly label: string;
}

declare var MediaDeviceInfo: {
    prototype: MediaDeviceInfo;
    new(): MediaDeviceInfo;
}

interface MediaDevices extends EventTarget {
    ondevicechange: (this: this, ev: Event) => any;
    enumerateDevices(): any;
    getSupportedConstraints(): MediaTrackSupportedConstraints;
    getUserMedia(constraints: MediaStreamConstraints): PromiseLike<MediaStream>;
    addEventListener(type: "devicechange", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var MediaDevices: {
    prototype: MediaDevices;
    new(): MediaDevices;
}

interface MediaElementAudioSourceNode extends AudioNode {
}

declare var MediaElementAudioSourceNode: {
    prototype: MediaElementAudioSourceNode;
    new(): MediaElementAudioSourceNode;
}

interface MediaEncryptedEvent extends Event {
    readonly initData: ArrayBuffer | null;
    readonly initDataType: string;
}

declare var MediaEncryptedEvent: {
    prototype: MediaEncryptedEvent;
    new(type: string, eventInitDict?: MediaEncryptedEventInit): MediaEncryptedEvent;
}

interface MediaError {
    readonly code: number;
    readonly msExtendedCode: number;
    readonly MEDIA_ERR_ABORTED: number;
    readonly MEDIA_ERR_DECODE: number;
    readonly MEDIA_ERR_NETWORK: number;
    readonly MEDIA_ERR_SRC_NOT_SUPPORTED: number;
    readonly MS_MEDIA_ERR_ENCRYPTED: number;
}

declare var MediaError: {
    prototype: MediaError;
    new(): MediaError;
    readonly MEDIA_ERR_ABORTED: number;
    readonly MEDIA_ERR_DECODE: number;
    readonly MEDIA_ERR_NETWORK: number;
    readonly MEDIA_ERR_SRC_NOT_SUPPORTED: number;
    readonly MS_MEDIA_ERR_ENCRYPTED: number;
}

interface MediaKeyMessageEvent extends Event {
    readonly message: ArrayBuffer;
    readonly messageType: string;
}

declare var MediaKeyMessageEvent: {
    prototype: MediaKeyMessageEvent;
    new(type: string, eventInitDict?: MediaKeyMessageEventInit): MediaKeyMessageEvent;
}

interface MediaKeySession extends EventTarget {
    readonly closed: PromiseLike<void>;
    readonly expiration: number;
    readonly keyStatuses: MediaKeyStatusMap;
    readonly sessionId: string;
    close(): PromiseLike<void>;
    generateRequest(initDataType: string, initData: any): PromiseLike<void>;
    load(sessionId: string): PromiseLike<boolean>;
    remove(): PromiseLike<void>;
    update(response: any): PromiseLike<void>;
}

declare var MediaKeySession: {
    prototype: MediaKeySession;
    new(): MediaKeySession;
}

interface MediaKeyStatusMap {
    readonly size: number;
    forEach(callback: ForEachCallback): void;
    get(keyId: any): string;
    has(keyId: any): boolean;
}

declare var MediaKeyStatusMap: {
    prototype: MediaKeyStatusMap;
    new(): MediaKeyStatusMap;
}

interface MediaKeySystemAccess {
    readonly keySystem: string;
    createMediaKeys(): PromiseLike<MediaKeys>;
    getConfiguration(): MediaKeySystemConfiguration;
}

declare var MediaKeySystemAccess: {
    prototype: MediaKeySystemAccess;
    new(): MediaKeySystemAccess;
}

interface MediaKeys {
    createSession(sessionType?: string): MediaKeySession;
    setServerCertificate(serverCertificate: any): PromiseLike<void>;
}

declare var MediaKeys: {
    prototype: MediaKeys;
    new(): MediaKeys;
}

interface MediaList {
    readonly length: number;
    mediaText: string;
    appendMedium(newMedium: string): void;
    deleteMedium(oldMedium: string): void;
    item(index: number): string;
    toString(): string;
    [index: number]: string;
}

declare var MediaList: {
    prototype: MediaList;
    new(): MediaList;
}

interface MediaQueryList {
    readonly matches: boolean;
    readonly media: string;
    addListener(listener: MediaQueryListListener): void;
    removeListener(listener: MediaQueryListListener): void;
}

declare var MediaQueryList: {
    prototype: MediaQueryList;
    new(): MediaQueryList;
}

interface MediaSource extends EventTarget {
    readonly activeSourceBuffers: SourceBufferList;
    duration: number;
    readonly readyState: string;
    readonly sourceBuffers: SourceBufferList;
    addSourceBuffer(type: string): SourceBuffer;
    endOfStream(error?: number): void;
    removeSourceBuffer(sourceBuffer: SourceBuffer): void;
}

declare var MediaSource: {
    prototype: MediaSource;
    new(): MediaSource;
    isTypeSupported(type: string): boolean;
}

interface MediaStream extends EventTarget {
    readonly active: boolean;
    readonly id: string;
    onactive: (this: this, ev: Event) => any;
    onaddtrack: (this: this, ev: TrackEvent) => any;
    oninactive: (this: this, ev: Event) => any;
    onremovetrack: (this: this, ev: TrackEvent) => any;
    addTrack(track: MediaStreamTrack): void;
    clone(): MediaStream;
    getAudioTracks(): MediaStreamTrack[];
    getTrackById(trackId: string): MediaStreamTrack | null;
    getTracks(): MediaStreamTrack[];
    getVideoTracks(): MediaStreamTrack[];
    removeTrack(track: MediaStreamTrack): void;
    stop(): void;
    addEventListener(type: "active", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "addtrack", listener: (this: this, ev: TrackEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "inactive", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "removetrack", listener: (this: this, ev: TrackEvent) => any, useCapture?: boolean): void;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var MediaStream: {
    prototype: MediaStream;
    new(streamOrTracks?: MediaStream | MediaStreamTrack[]): MediaStream;
}

interface MediaStreamAudioSourceNode extends AudioNode {
}

declare var MediaStreamAudioSourceNode: {
    prototype: MediaStreamAudioSourceNode;
    new(): MediaStreamAudioSourceNode;
}

interface MediaStreamError {
    readonly constraintName: string | null;
    readonly message: string | null;
    readonly name: string;
}

declare var MediaStreamError: {
    prototype: MediaStreamError;
    new(): MediaStreamError;
}

interface MediaStreamErrorEvent extends Event {
    readonly error: MediaStreamError | null;
}

declare var MediaStreamErrorEvent: {
    prototype: MediaStreamErrorEvent;
    new(type: string, eventInitDict?: MediaStreamErrorEventInit): MediaStreamErrorEvent;
}

interface MediaStreamTrack extends EventTarget {
    enabled: boolean;
    readonly id: string;
    readonly kind: string;
    readonly label: string;
    readonly muted: boolean;
    onended: (this: this, ev: MediaStreamErrorEvent) => any;
    onmute: (this: this, ev: Event) => any;
    onoverconstrained: (this: this, ev: MediaStreamErrorEvent) => any;
    onunmute: (this: this, ev: Event) => any;
    readonly readonly: boolean;
    readonly readyState: string;
    readonly remote: boolean;
    applyConstraints(constraints: MediaTrackConstraints): PromiseLike<void>;
    clone(): MediaStreamTrack;
    getCapabilities(): MediaTrackCapabilities;
    getConstraints(): MediaTrackConstraints;
    getSettings(): MediaTrackSettings;
    stop(): void;
    addEventListener(type: "ended", listener: (this: this, ev: MediaStreamErrorEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "mute", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "overconstrained", listener: (this: this, ev: MediaStreamErrorEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "unmute", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var MediaStreamTrack: {
    prototype: MediaStreamTrack;
    new(): MediaStreamTrack;
}

interface MediaStreamTrackEvent extends Event {
    readonly track: MediaStreamTrack;
}

declare var MediaStreamTrackEvent: {
    prototype: MediaStreamTrackEvent;
    new(type: string, eventInitDict?: MediaStreamTrackEventInit): MediaStreamTrackEvent;
}

interface MessageChannel {
    readonly port1: MessagePort;
    readonly port2: MessagePort;
}

declare var MessageChannel: {
    prototype: MessageChannel;
    new(): MessageChannel;
}

interface MessageEvent extends Event {
    readonly data: any;
    readonly origin: string;
    readonly ports: any;
    readonly source: Window;
    initMessageEvent(typeArg: string, canBubbleArg: boolean, cancelableArg: boolean, dataArg: any, originArg: string, lastEventIdArg: string, sourceArg: Window): void;
}

declare var MessageEvent: {
    prototype: MessageEvent;
    new(type: string, eventInitDict?: MessageEventInit): MessageEvent;
}

interface MessagePort extends EventTarget {
    onmessage: (this: this, ev: MessageEvent) => any;
    close(): void;
    postMessage(message?: any, ports?: any): void;
    start(): void;
    addEventListener(type: "message", listener: (this: this, ev: MessageEvent) => any, useCapture?: boolean): void;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var MessagePort: {
    prototype: MessagePort;
    new(): MessagePort;
}

interface MimeType {
    readonly description: string;
    readonly enabledPlugin: Plugin;
    readonly suffixes: string;
    readonly type: string;
}

declare var MimeType: {
    prototype: MimeType;
    new(): MimeType;
}

interface MimeTypeArray {
    readonly length: number;
    item(index: number): Plugin;
    namedItem(type: string): Plugin;
    [index: number]: Plugin;
}

declare var MimeTypeArray: {
    prototype: MimeTypeArray;
    new(): MimeTypeArray;
}

interface MouseEvent extends UIEvent {
    readonly altKey: boolean;
    readonly button: number;
    readonly buttons: number;
    readonly clientX: number;
    readonly clientY: number;
    readonly ctrlKey: boolean;
    readonly fromElement: Element;
    readonly layerX: number;
    readonly layerY: number;
    readonly metaKey: boolean;
    readonly movementX: number;
    readonly movementY: number;
    readonly offsetX: number;
    readonly offsetY: number;
    readonly pageX: number;
    readonly pageY: number;
    readonly relatedTarget: EventTarget;
    readonly screenX: number;
    readonly screenY: number;
    readonly shiftKey: boolean;
    readonly toElement: Element;
    readonly which: number;
    readonly x: number;
    readonly y: number;
    getModifierState(keyArg: string): boolean;
    initMouseEvent(typeArg: string, canBubbleArg: boolean, cancelableArg: boolean, viewArg: Window, detailArg: number, screenXArg: number, screenYArg: number, clientXArg: number, clientYArg: number, ctrlKeyArg: boolean, altKeyArg: boolean, shiftKeyArg: boolean, metaKeyArg: boolean, buttonArg: number, relatedTargetArg: EventTarget): void;
}

declare var MouseEvent: {
    prototype: MouseEvent;
    new(typeArg: string, eventInitDict?: MouseEventInit): MouseEvent;
}

interface MutationEvent extends Event {
    readonly attrChange: number;
    readonly attrName: string;
    readonly newValue: string;
    readonly prevValue: string;
    readonly relatedNode: Node;
    initMutationEvent(typeArg: string, canBubbleArg: boolean, cancelableArg: boolean, relatedNodeArg: Node, prevValueArg: string, newValueArg: string, attrNameArg: string, attrChangeArg: number): void;
    readonly ADDITION: number;
    readonly MODIFICATION: number;
    readonly REMOVAL: number;
}

declare var MutationEvent: {
    prototype: MutationEvent;
    new(): MutationEvent;
    readonly ADDITION: number;
    readonly MODIFICATION: number;
    readonly REMOVAL: number;
}

interface MutationObserver {
    disconnect(): void;
    observe(target: Node, options: MutationObserverInit): void;
    takeRecords(): MutationRecord[];
}

declare var MutationObserver: {
    prototype: MutationObserver;
    new(callback: MutationCallback): MutationObserver;
}

interface MutationRecord {
    readonly addedNodes: NodeList;
    readonly attributeName: string | null;
    readonly attributeNamespace: string | null;
    readonly nextSibling: Node | null;
    readonly oldValue: string | null;
    readonly previousSibling: Node | null;
    readonly removedNodes: NodeList;
    readonly target: Node;
    readonly type: string;
}

declare var MutationRecord: {
    prototype: MutationRecord;
    new(): MutationRecord;
}

interface NamedNodeMap {
    readonly length: number;
    getNamedItem(name: string): Attr;
    getNamedItemNS(namespaceURI: string | null, localName: string | null): Attr;
    item(index: number): Attr;
    removeNamedItem(name: string): Attr;
    removeNamedItemNS(namespaceURI: string | null, localName: string | null): Attr;
    setNamedItem(arg: Attr): Attr;
    setNamedItemNS(arg: Attr): Attr;
    [index: number]: Attr;
}

declare var NamedNodeMap: {
    prototype: NamedNodeMap;
    new(): NamedNodeMap;
}

interface NavigationCompletedEvent extends NavigationEvent {
    readonly isSuccess: boolean;
    readonly webErrorStatus: number;
}

declare var NavigationCompletedEvent: {
    prototype: NavigationCompletedEvent;
    new(): NavigationCompletedEvent;
}

interface NavigationEvent extends Event {
    readonly uri: string;
}

declare var NavigationEvent: {
    prototype: NavigationEvent;
    new(): NavigationEvent;
}

interface NavigationEventWithReferrer extends NavigationEvent {
    readonly referer: string;
}

declare var NavigationEventWithReferrer: {
    prototype: NavigationEventWithReferrer;
    new(): NavigationEventWithReferrer;
}

interface Navigator extends Object, NavigatorID, NavigatorOnLine, NavigatorContentUtils, NavigatorStorageUtils, NavigatorGeolocation, MSNavigatorDoNotTrack, MSFileSaver, NavigatorUserMedia {
    readonly appCodeName: string;
    readonly cookieEnabled: boolean;
    readonly language: string;
    readonly maxTouchPoints: number;
    readonly mimeTypes: MimeTypeArray;
    readonly msManipulationViewsEnabled: boolean;
    readonly msMaxTouchPoints: number;
    readonly msPointerEnabled: boolean;
    readonly plugins: PluginArray;
    readonly pointerEnabled: boolean;
    readonly webdriver: boolean;
    getGamepads(): Gamepad[];
    javaEnabled(): boolean;
    msLaunchUri(uri: string, successCallback?: MSLaunchUriCallback, noHandlerCallback?: MSLaunchUriCallback): void;
    requestMediaKeySystemAccess(keySystem: string, supportedConfigurations: MediaKeySystemConfiguration[]): PromiseLike<MediaKeySystemAccess>;
    vibrate(pattern: number | number[]): boolean;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var Navigator: {
    prototype: Navigator;
    new(): Navigator;
}

interface Node extends EventTarget {
    readonly attributes: NamedNodeMap;
    readonly baseURI: string | null;
    readonly childNodes: NodeList;
    readonly firstChild: Node;
    readonly lastChild: Node;
    readonly localName: string | null;
    readonly namespaceURI: string | null;
    readonly nextSibling: Node;
    readonly nodeName: string;
    readonly nodeType: number;
    nodeValue: string | null;
    readonly ownerDocument: Document;
    readonly parentElement: HTMLElement;
    readonly parentNode: Node;
    readonly previousSibling: Node;
    textContent: string | null;
    appendChild(newChild: Node): Node;
    cloneNode(deep?: boolean): Node;
    compareDocumentPosition(other: Node): number;
    contains(child: Node): boolean;
    hasAttributes(): boolean;
    hasChildNodes(): boolean;
    insertBefore(newChild: Node, refChild: Node | null): Node;
    isDefaultNamespace(namespaceURI: string | null): boolean;
    isEqualNode(arg: Node): boolean;
    isSameNode(other: Node): boolean;
    lookupNamespaceURI(prefix: string | null): string | null;
    lookupPrefix(namespaceURI: string | null): string | null;
    normalize(): void;
    removeChild(oldChild: Node): Node;
    replaceChild(newChild: Node, oldChild: Node): Node;
    readonly ATTRIBUTE_NODE: number;
    readonly CDATA_SECTION_NODE: number;
    readonly COMMENT_NODE: number;
    readonly DOCUMENT_FRAGMENT_NODE: number;
    readonly DOCUMENT_NODE: number;
    readonly DOCUMENT_POSITION_CONTAINED_BY: number;
    readonly DOCUMENT_POSITION_CONTAINS: number;
    readonly DOCUMENT_POSITION_DISCONNECTED: number;
    readonly DOCUMENT_POSITION_FOLLOWING: number;
    readonly DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC: number;
    readonly DOCUMENT_POSITION_PRECEDING: number;
    readonly DOCUMENT_TYPE_NODE: number;
    readonly ELEMENT_NODE: number;
    readonly ENTITY_NODE: number;
    readonly ENTITY_REFERENCE_NODE: number;
    readonly NOTATION_NODE: number;
    readonly PROCESSING_INSTRUCTION_NODE: number;
    readonly TEXT_NODE: number;
}

declare var Node: {
    prototype: Node;
    new(): Node;
    readonly ATTRIBUTE_NODE: number;
    readonly CDATA_SECTION_NODE: number;
    readonly COMMENT_NODE: number;
    readonly DOCUMENT_FRAGMENT_NODE: number;
    readonly DOCUMENT_NODE: number;
    readonly DOCUMENT_POSITION_CONTAINED_BY: number;
    readonly DOCUMENT_POSITION_CONTAINS: number;
    readonly DOCUMENT_POSITION_DISCONNECTED: number;
    readonly DOCUMENT_POSITION_FOLLOWING: number;
    readonly DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC: number;
    readonly DOCUMENT_POSITION_PRECEDING: number;
    readonly DOCUMENT_TYPE_NODE: number;
    readonly ELEMENT_NODE: number;
    readonly ENTITY_NODE: number;
    readonly ENTITY_REFERENCE_NODE: number;
    readonly NOTATION_NODE: number;
    readonly PROCESSING_INSTRUCTION_NODE: number;
    readonly TEXT_NODE: number;
}

interface NodeFilter {
    acceptNode(n: Node): number;
}

declare var NodeFilter: {
    readonly FILTER_ACCEPT: number;
    readonly FILTER_REJECT: number;
    readonly FILTER_SKIP: number;
    readonly SHOW_ALL: number;
    readonly SHOW_ATTRIBUTE: number;
    readonly SHOW_CDATA_SECTION: number;
    readonly SHOW_COMMENT: number;
    readonly SHOW_DOCUMENT: number;
    readonly SHOW_DOCUMENT_FRAGMENT: number;
    readonly SHOW_DOCUMENT_TYPE: number;
    readonly SHOW_ELEMENT: number;
    readonly SHOW_ENTITY: number;
    readonly SHOW_ENTITY_REFERENCE: number;
    readonly SHOW_NOTATION: number;
    readonly SHOW_PROCESSING_INSTRUCTION: number;
    readonly SHOW_TEXT: number;
}

interface NodeIterator {
    readonly expandEntityReferences: boolean;
    readonly filter: NodeFilter;
    readonly root: Node;
    readonly whatToShow: number;
    detach(): void;
    nextNode(): Node;
    previousNode(): Node;
}

declare var NodeIterator: {
    prototype: NodeIterator;
    new(): NodeIterator;
}

interface NodeList {
    readonly length: number;
    item(index: number): Node;
    [index: number]: Node;
}

declare var NodeList: {
    prototype: NodeList;
    new(): NodeList;
}

interface OES_element_index_uint {
}

declare var OES_element_index_uint: {
    prototype: OES_element_index_uint;
    new(): OES_element_index_uint;
}

interface OES_standard_derivatives {
    readonly FRAGMENT_SHADER_DERIVATIVE_HINT_OES: number;
}

declare var OES_standard_derivatives: {
    prototype: OES_standard_derivatives;
    new(): OES_standard_derivatives;
    readonly FRAGMENT_SHADER_DERIVATIVE_HINT_OES: number;
}

interface OES_texture_float {
}

declare var OES_texture_float: {
    prototype: OES_texture_float;
    new(): OES_texture_float;
}

interface OES_texture_float_linear {
}

declare var OES_texture_float_linear: {
    prototype: OES_texture_float_linear;
    new(): OES_texture_float_linear;
}

interface OfflineAudioCompletionEvent extends Event {
    readonly renderedBuffer: AudioBuffer;
}

declare var OfflineAudioCompletionEvent: {
    prototype: OfflineAudioCompletionEvent;
    new(): OfflineAudioCompletionEvent;
}

interface OfflineAudioContext extends AudioContext {
    oncomplete: (this: this, ev: Event) => any;
    startRendering(): PromiseLike<AudioBuffer>;
    addEventListener(type: "complete", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var OfflineAudioContext: {
    prototype: OfflineAudioContext;
    new(numberOfChannels: number, length: number, sampleRate: number): OfflineAudioContext;
}

interface OscillatorNode extends AudioNode {
    readonly detune: AudioParam;
    readonly frequency: AudioParam;
    onended: (this: this, ev: MediaStreamErrorEvent) => any;
    type: string;
    setPeriodicWave(periodicWave: PeriodicWave): void;
    start(when?: number): void;
    stop(when?: number): void;
    addEventListener(type: "ended", listener: (this: this, ev: MediaStreamErrorEvent) => any, useCapture?: boolean): void;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var OscillatorNode: {
    prototype: OscillatorNode;
    new(): OscillatorNode;
}

interface OverflowEvent extends UIEvent {
    readonly horizontalOverflow: boolean;
    readonly orient: number;
    readonly verticalOverflow: boolean;
    readonly BOTH: number;
    readonly HORIZONTAL: number;
    readonly VERTICAL: number;
}

declare var OverflowEvent: {
    prototype: OverflowEvent;
    new(): OverflowEvent;
    readonly BOTH: number;
    readonly HORIZONTAL: number;
    readonly VERTICAL: number;
}

interface PageTransitionEvent extends Event {
    readonly persisted: boolean;
}

declare var PageTransitionEvent: {
    prototype: PageTransitionEvent;
    new(): PageTransitionEvent;
}

interface PannerNode extends AudioNode {
    coneInnerAngle: number;
    coneOuterAngle: number;
    coneOuterGain: number;
    distanceModel: string;
    maxDistance: number;
    panningModel: string;
    refDistance: number;
    rolloffFactor: number;
    setOrientation(x: number, y: number, z: number): void;
    setPosition(x: number, y: number, z: number): void;
    setVelocity(x: number, y: number, z: number): void;
}

declare var PannerNode: {
    prototype: PannerNode;
    new(): PannerNode;
}

interface PerfWidgetExternal {
    readonly activeNetworkRequestCount: number;
    readonly averageFrameTime: number;
    readonly averagePaintTime: number;
    readonly extraInformationEnabled: boolean;
    readonly independentRenderingEnabled: boolean;
    readonly irDisablingContentString: string;
    readonly irStatusAvailable: boolean;
    readonly maxCpuSpeed: number;
    readonly paintRequestsPerSecond: number;
    readonly performanceCounter: number;
    readonly performanceCounterFrequency: number;
    addEventListener(eventType: string, callback: Function): void;
    getMemoryUsage(): number;
    getProcessCpuUsage(): number;
    getRecentCpuUsage(last: number | null): any;
    getRecentFrames(last: number | null): any;
    getRecentMemoryUsage(last: number | null): any;
    getRecentPaintRequests(last: number | null): any;
    removeEventListener(eventType: string, callback: Function): void;
    repositionWindow(x: number, y: number): void;
    resizeWindow(width: number, height: number): void;
}

declare var PerfWidgetExternal: {
    prototype: PerfWidgetExternal;
    new(): PerfWidgetExternal;
}

interface Performance {
    readonly navigation: PerformanceNavigation;
    readonly timing: PerformanceTiming;
    clearMarks(markName?: string): void;
    clearMeasures(measureName?: string): void;
    clearResourceTimings(): void;
    getEntries(): any;
    getEntriesByName(name: string, entryType?: string): any;
    getEntriesByType(entryType: string): any;
    getMarks(markName?: string): any;
    getMeasures(measureName?: string): any;
    mark(markName: string): void;
    measure(measureName: string, startMarkName?: string, endMarkName?: string): void;
    now(): number;
    setResourceTimingBufferSize(maxSize: number): void;
    toJSON(): any;
}

declare var Performance: {
    prototype: Performance;
    new(): Performance;
}

interface PerformanceEntry {
    readonly duration: number;
    readonly entryType: string;
    readonly name: string;
    readonly startTime: number;
}

declare var PerformanceEntry: {
    prototype: PerformanceEntry;
    new(): PerformanceEntry;
}

interface PerformanceMark extends PerformanceEntry {
}

declare var PerformanceMark: {
    prototype: PerformanceMark;
    new(): PerformanceMark;
}

interface PerformanceMeasure extends PerformanceEntry {
}

declare var PerformanceMeasure: {
    prototype: PerformanceMeasure;
    new(): PerformanceMeasure;
}

interface PerformanceNavigation {
    readonly redirectCount: number;
    readonly type: number;
    toJSON(): any;
    readonly TYPE_BACK_FORWARD: number;
    readonly TYPE_NAVIGATE: number;
    readonly TYPE_RELOAD: number;
    readonly TYPE_RESERVED: number;
}

declare var PerformanceNavigation: {
    prototype: PerformanceNavigation;
    new(): PerformanceNavigation;
    readonly TYPE_BACK_FORWARD: number;
    readonly TYPE_NAVIGATE: number;
    readonly TYPE_RELOAD: number;
    readonly TYPE_RESERVED: number;
}

interface PerformanceNavigationTiming extends PerformanceEntry {
    readonly connectEnd: number;
    readonly connectStart: number;
    readonly domComplete: number;
    readonly domContentLoadedEventEnd: number;
    readonly domContentLoadedEventStart: number;
    readonly domInteractive: number;
    readonly domLoading: number;
    readonly domainLookupEnd: number;
    readonly domainLookupStart: number;
    readonly fetchStart: number;
    readonly loadEventEnd: number;
    readonly loadEventStart: number;
    readonly navigationStart: number;
    readonly redirectCount: number;
    readonly redirectEnd: number;
    readonly redirectStart: number;
    readonly requestStart: number;
    readonly responseEnd: number;
    readonly responseStart: number;
    readonly type: string;
    readonly unloadEventEnd: number;
    readonly unloadEventStart: number;
}

declare var PerformanceNavigationTiming: {
    prototype: PerformanceNavigationTiming;
    new(): PerformanceNavigationTiming;
}

interface PerformanceResourceTiming extends PerformanceEntry {
    readonly connectEnd: number;
    readonly connectStart: number;
    readonly domainLookupEnd: number;
    readonly domainLookupStart: number;
    readonly fetchStart: number;
    readonly initiatorType: string;
    readonly redirectEnd: number;
    readonly redirectStart: number;
    readonly requestStart: number;
    readonly responseEnd: number;
    readonly responseStart: number;
}

declare var PerformanceResourceTiming: {
    prototype: PerformanceResourceTiming;
    new(): PerformanceResourceTiming;
}

interface PerformanceTiming {
    readonly connectEnd: number;
    readonly connectStart: number;
    readonly domComplete: number;
    readonly domContentLoadedEventEnd: number;
    readonly domContentLoadedEventStart: number;
    readonly domInteractive: number;
    readonly domLoading: number;
    readonly domainLookupEnd: number;
    readonly domainLookupStart: number;
    readonly fetchStart: number;
    readonly loadEventEnd: number;
    readonly loadEventStart: number;
    readonly msFirstPaint: number;
    readonly navigationStart: number;
    readonly redirectEnd: number;
    readonly redirectStart: number;
    readonly requestStart: number;
    readonly responseEnd: number;
    readonly responseStart: number;
    readonly unloadEventEnd: number;
    readonly unloadEventStart: number;
    readonly secureConnectionStart: number;
    toJSON(): any;
}

declare var PerformanceTiming: {
    prototype: PerformanceTiming;
    new(): PerformanceTiming;
}

interface PeriodicWave {
}

declare var PeriodicWave: {
    prototype: PeriodicWave;
    new(): PeriodicWave;
}

interface PermissionRequest extends DeferredPermissionRequest {
    readonly state: string;
    defer(): void;
}

declare var PermissionRequest: {
    prototype: PermissionRequest;
    new(): PermissionRequest;
}

interface PermissionRequestedEvent extends Event {
    readonly permissionRequest: PermissionRequest;
}

declare var PermissionRequestedEvent: {
    prototype: PermissionRequestedEvent;
    new(): PermissionRequestedEvent;
}

interface Plugin {
    readonly description: string;
    readonly filename: string;
    readonly length: number;
    readonly name: string;
    readonly version: string;
    item(index: number): MimeType;
    namedItem(type: string): MimeType;
    [index: number]: MimeType;
}

declare var Plugin: {
    prototype: Plugin;
    new(): Plugin;
}

interface PluginArray {
    readonly length: number;
    item(index: number): Plugin;
    namedItem(name: string): Plugin;
    refresh(reload?: boolean): void;
    [index: number]: Plugin;
}

declare var PluginArray: {
    prototype: PluginArray;
    new(): PluginArray;
}

interface PointerEvent extends MouseEvent {
    readonly currentPoint: any;
    readonly height: number;
    readonly hwTimestamp: number;
    readonly intermediatePoints: any;
    readonly isPrimary: boolean;
    readonly pointerId: number;
    readonly pointerType: any;
    readonly pressure: number;
    readonly rotation: number;
    readonly tiltX: number;
    readonly tiltY: number;
    readonly width: number;
    getCurrentPoint(element: Element): void;
    getIntermediatePoints(element: Element): void;
    initPointerEvent(typeArg: string, canBubbleArg: boolean, cancelableArg: boolean, viewArg: Window, detailArg: number, screenXArg: number, screenYArg: number, clientXArg: number, clientYArg: number, ctrlKeyArg: boolean, altKeyArg: boolean, shiftKeyArg: boolean, metaKeyArg: boolean, buttonArg: number, relatedTargetArg: EventTarget, offsetXArg: number, offsetYArg: number, widthArg: number, heightArg: number, pressure: number, rotation: number, tiltX: number, tiltY: number, pointerIdArg: number, pointerType: any, hwTimestampArg: number, isPrimary: boolean): void;
}

declare var PointerEvent: {
    prototype: PointerEvent;
    new(typeArg: string, eventInitDict?: PointerEventInit): PointerEvent;
}

interface PopStateEvent extends Event {
    readonly state: any;
    initPopStateEvent(typeArg: string, canBubbleArg: boolean, cancelableArg: boolean, stateArg: any): void;
}

declare var PopStateEvent: {
    prototype: PopStateEvent;
    new(): PopStateEvent;
}

interface Position {
    readonly coords: Coordinates;
    readonly timestamp: number;
}

declare var Position: {
    prototype: Position;
    new(): Position;
}

interface PositionError {
    readonly code: number;
    readonly message: string;
    toString(): string;
    readonly PERMISSION_DENIED: number;
    readonly POSITION_UNAVAILABLE: number;
    readonly TIMEOUT: number;
}

declare var PositionError: {
    prototype: PositionError;
    new(): PositionError;
    readonly PERMISSION_DENIED: number;
    readonly POSITION_UNAVAILABLE: number;
    readonly TIMEOUT: number;
}

interface ProcessingInstruction extends CharacterData {
    readonly target: string;
}

declare var ProcessingInstruction: {
    prototype: ProcessingInstruction;
    new(): ProcessingInstruction;
}

interface ProgressEvent extends Event {
    readonly lengthComputable: boolean;
    readonly loaded: number;
    readonly total: number;
    initProgressEvent(typeArg: string, canBubbleArg: boolean, cancelableArg: boolean, lengthComputableArg: boolean, loadedArg: number, totalArg: number): void;
}

declare var ProgressEvent: {
    prototype: ProgressEvent;
    new(type: string, eventInitDict?: ProgressEventInit): ProgressEvent;
}

interface RTCDTMFToneChangeEvent extends Event {
    readonly tone: string;
}

declare var RTCDTMFToneChangeEvent: {
    prototype: RTCDTMFToneChangeEvent;
    new(type: string, eventInitDict: RTCDTMFToneChangeEventInit): RTCDTMFToneChangeEvent;
}

interface RTCDtlsTransport extends RTCStatsProvider {
    ondtlsstatechange: ((this: this, ev: RTCDtlsTransportStateChangedEvent) => any) | null;
    onerror: ((this: this, ev: ErrorEvent) => any) | null;
    readonly state: string;
    readonly transport: RTCIceTransport;
    getLocalParameters(): RTCDtlsParameters;
    getRemoteCertificates(): ArrayBuffer[];
    getRemoteParameters(): RTCDtlsParameters | null;
    start(remoteParameters: RTCDtlsParameters): void;
    stop(): void;
    addEventListener(type: "dtlsstatechange", listener: (this: this, ev: RTCDtlsTransportStateChangedEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "error", listener: (this: this, ev: ErrorEvent) => any, useCapture?: boolean): void;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var RTCDtlsTransport: {
    prototype: RTCDtlsTransport;
    new(transport: RTCIceTransport): RTCDtlsTransport;
}

interface RTCDtlsTransportStateChangedEvent extends Event {
    readonly state: string;
}

declare var RTCDtlsTransportStateChangedEvent: {
    prototype: RTCDtlsTransportStateChangedEvent;
    new(): RTCDtlsTransportStateChangedEvent;
}

interface RTCDtmfSender extends EventTarget {
    readonly canInsertDTMF: boolean;
    readonly duration: number;
    readonly interToneGap: number;
    ontonechange: (this: this, ev: RTCDTMFToneChangeEvent) => any;
    readonly sender: RTCRtpSender;
    readonly toneBuffer: string;
    insertDTMF(tones: string, duration?: number, interToneGap?: number): void;
    addEventListener(type: "tonechange", listener: (this: this, ev: RTCDTMFToneChangeEvent) => any, useCapture?: boolean): void;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var RTCDtmfSender: {
    prototype: RTCDtmfSender;
    new(sender: RTCRtpSender): RTCDtmfSender;
}

interface RTCIceCandidatePairChangedEvent extends Event {
    readonly pair: RTCIceCandidatePair;
}

declare var RTCIceCandidatePairChangedEvent: {
    prototype: RTCIceCandidatePairChangedEvent;
    new(): RTCIceCandidatePairChangedEvent;
}

interface RTCIceGatherer extends RTCStatsProvider {
    readonly component: string;
    onerror: ((this: this, ev: ErrorEvent) => any) | null;
    onlocalcandidate: ((this: this, ev: RTCIceGathererEvent) => any) | null;
    createAssociatedGatherer(): RTCIceGatherer;
    getLocalCandidates(): RTCIceCandidate[];
    getLocalParameters(): RTCIceParameters;
    addEventListener(type: "error", listener: (this: this, ev: ErrorEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "localcandidate", listener: (this: this, ev: RTCIceGathererEvent) => any, useCapture?: boolean): void;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var RTCIceGatherer: {
    prototype: RTCIceGatherer;
    new(options: RTCIceGatherOptions): RTCIceGatherer;
}

interface RTCIceGathererEvent extends Event {
    readonly candidate: RTCIceCandidate | RTCIceCandidateComplete;
}

declare var RTCIceGathererEvent: {
    prototype: RTCIceGathererEvent;
    new(): RTCIceGathererEvent;
}

interface RTCIceTransport extends RTCStatsProvider {
    readonly component: string;
    readonly iceGatherer: RTCIceGatherer | null;
    oncandidatepairchange: ((this: this, ev: RTCIceCandidatePairChangedEvent) => any) | null;
    onicestatechange: ((this: this, ev: RTCIceTransportStateChangedEvent) => any) | null;
    readonly role: string;
    readonly state: string;
    addRemoteCandidate(remoteCandidate: RTCIceCandidate | RTCIceCandidateComplete): void;
    createAssociatedTransport(): RTCIceTransport;
    getNominatedCandidatePair(): RTCIceCandidatePair | null;
    getRemoteCandidates(): RTCIceCandidate[];
    getRemoteParameters(): RTCIceParameters | null;
    setRemoteCandidates(remoteCandidates: RTCIceCandidate[]): void;
    start(gatherer: RTCIceGatherer, remoteParameters: RTCIceParameters, role?: string): void;
    stop(): void;
    addEventListener(type: "candidatepairchange", listener: (this: this, ev: RTCIceCandidatePairChangedEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "icestatechange", listener: (this: this, ev: RTCIceTransportStateChangedEvent) => any, useCapture?: boolean): void;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var RTCIceTransport: {
    prototype: RTCIceTransport;
    new(): RTCIceTransport;
}

interface RTCIceTransportStateChangedEvent extends Event {
    readonly state: string;
}

declare var RTCIceTransportStateChangedEvent: {
    prototype: RTCIceTransportStateChangedEvent;
    new(): RTCIceTransportStateChangedEvent;
}

interface RTCRtpReceiver extends RTCStatsProvider {
    onerror: ((this: this, ev: ErrorEvent) => any) | null;
    readonly rtcpTransport: RTCDtlsTransport;
    readonly track: MediaStreamTrack | null;
    readonly transport: RTCDtlsTransport | RTCSrtpSdesTransport;
    getContributingSources(): RTCRtpContributingSource[];
    receive(parameters: RTCRtpParameters): void;
    requestSendCSRC(csrc: number): void;
    setTransport(transport: RTCDtlsTransport | RTCSrtpSdesTransport, rtcpTransport?: RTCDtlsTransport): void;
    stop(): void;
    addEventListener(type: "error", listener: (this: this, ev: ErrorEvent) => any, useCapture?: boolean): void;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var RTCRtpReceiver: {
    prototype: RTCRtpReceiver;
    new(transport: RTCDtlsTransport | RTCSrtpSdesTransport, kind: string, rtcpTransport?: RTCDtlsTransport): RTCRtpReceiver;
    getCapabilities(kind?: string): RTCRtpCapabilities;
}

interface RTCRtpSender extends RTCStatsProvider {
    onerror: ((this: this, ev: ErrorEvent) => any) | null;
    onssrcconflict: ((this: this, ev: RTCSsrcConflictEvent) => any) | null;
    readonly rtcpTransport: RTCDtlsTransport;
    readonly track: MediaStreamTrack;
    readonly transport: RTCDtlsTransport | RTCSrtpSdesTransport;
    send(parameters: RTCRtpParameters): void;
    setTrack(track: MediaStreamTrack): void;
    setTransport(transport: RTCDtlsTransport | RTCSrtpSdesTransport, rtcpTransport?: RTCDtlsTransport): void;
    stop(): void;
    addEventListener(type: "error", listener: (this: this, ev: ErrorEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "ssrcconflict", listener: (this: this, ev: RTCSsrcConflictEvent) => any, useCapture?: boolean): void;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var RTCRtpSender: {
    prototype: RTCRtpSender;
    new(track: MediaStreamTrack, transport: RTCDtlsTransport | RTCSrtpSdesTransport, rtcpTransport?: RTCDtlsTransport): RTCRtpSender;
    getCapabilities(kind?: string): RTCRtpCapabilities;
}

interface RTCSrtpSdesTransport extends EventTarget {
    onerror: ((this: this, ev: ErrorEvent) => any) | null;
    readonly transport: RTCIceTransport;
    addEventListener(type: "error", listener: (this: this, ev: ErrorEvent) => any, useCapture?: boolean): void;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var RTCSrtpSdesTransport: {
    prototype: RTCSrtpSdesTransport;
    new(transport: RTCIceTransport, encryptParameters: RTCSrtpSdesParameters, decryptParameters: RTCSrtpSdesParameters): RTCSrtpSdesTransport;
    getLocalParameters(): RTCSrtpSdesParameters[];
}

interface RTCSsrcConflictEvent extends Event {
    readonly ssrc: number;
}

declare var RTCSsrcConflictEvent: {
    prototype: RTCSsrcConflictEvent;
    new(): RTCSsrcConflictEvent;
}

interface RTCStatsProvider extends EventTarget {
    getStats(): PromiseLike<RTCStatsReport>;
    msGetStats(): PromiseLike<RTCStatsReport>;
}

declare var RTCStatsProvider: {
    prototype: RTCStatsProvider;
    new(): RTCStatsProvider;
}

interface Range {
    readonly collapsed: boolean;
    readonly commonAncestorContainer: Node;
    readonly endContainer: Node;
    readonly endOffset: number;
    readonly startContainer: Node;
    readonly startOffset: number;
    cloneContents(): DocumentFragment;
    cloneRange(): Range;
    collapse(toStart: boolean): void;
    compareBoundaryPoints(how: number, sourceRange: Range): number;
    createContextualFragment(fragment: string): DocumentFragment;
    deleteContents(): void;
    detach(): void;
    expand(Unit: string): boolean;
    extractContents(): DocumentFragment;
    getBoundingClientRect(): ClientRect;
    getClientRects(): ClientRectList;
    insertNode(newNode: Node): void;
    selectNode(refNode: Node): void;
    selectNodeContents(refNode: Node): void;
    setEnd(refNode: Node, offset: number): void;
    setEndAfter(refNode: Node): void;
    setEndBefore(refNode: Node): void;
    setStart(refNode: Node, offset: number): void;
    setStartAfter(refNode: Node): void;
    setStartBefore(refNode: Node): void;
    surroundContents(newParent: Node): void;
    toString(): string;
    readonly END_TO_END: number;
    readonly END_TO_START: number;
    readonly START_TO_END: number;
    readonly START_TO_START: number;
}

declare var Range: {
    prototype: Range;
    new(): Range;
    readonly END_TO_END: number;
    readonly END_TO_START: number;
    readonly START_TO_END: number;
    readonly START_TO_START: number;
}

interface SVGAElement extends SVGElement, SVGStylable, SVGTransformable, SVGTests, SVGLangSpace, SVGExternalResourcesRequired, SVGURIReference {
    readonly target: SVGAnimatedString;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var SVGAElement: {
    prototype: SVGAElement;
    new(): SVGAElement;
}

interface SVGAngle {
    readonly unitType: number;
    value: number;
    valueAsString: string;
    valueInSpecifiedUnits: number;
    convertToSpecifiedUnits(unitType: number): void;
    newValueSpecifiedUnits(unitType: number, valueInSpecifiedUnits: number): void;
    readonly SVG_ANGLETYPE_DEG: number;
    readonly SVG_ANGLETYPE_GRAD: number;
    readonly SVG_ANGLETYPE_RAD: number;
    readonly SVG_ANGLETYPE_UNKNOWN: number;
    readonly SVG_ANGLETYPE_UNSPECIFIED: number;
}

declare var SVGAngle: {
    prototype: SVGAngle;
    new(): SVGAngle;
    readonly SVG_ANGLETYPE_DEG: number;
    readonly SVG_ANGLETYPE_GRAD: number;
    readonly SVG_ANGLETYPE_RAD: number;
    readonly SVG_ANGLETYPE_UNKNOWN: number;
    readonly SVG_ANGLETYPE_UNSPECIFIED: number;
}

interface SVGAnimatedAngle {
    readonly animVal: SVGAngle;
    readonly baseVal: SVGAngle;
}

declare var SVGAnimatedAngle: {
    prototype: SVGAnimatedAngle;
    new(): SVGAnimatedAngle;
}

interface SVGAnimatedBoolean {
    readonly animVal: boolean;
    baseVal: boolean;
}

declare var SVGAnimatedBoolean: {
    prototype: SVGAnimatedBoolean;
    new(): SVGAnimatedBoolean;
}

interface SVGAnimatedEnumeration {
    readonly animVal: number;
    baseVal: number;
}

declare var SVGAnimatedEnumeration: {
    prototype: SVGAnimatedEnumeration;
    new(): SVGAnimatedEnumeration;
}

interface SVGAnimatedInteger {
    readonly animVal: number;
    baseVal: number;
}

declare var SVGAnimatedInteger: {
    prototype: SVGAnimatedInteger;
    new(): SVGAnimatedInteger;
}

interface SVGAnimatedLength {
    readonly animVal: SVGLength;
    readonly baseVal: SVGLength;
}

declare var SVGAnimatedLength: {
    prototype: SVGAnimatedLength;
    new(): SVGAnimatedLength;
}

interface SVGAnimatedLengthList {
    readonly animVal: SVGLengthList;
    readonly baseVal: SVGLengthList;
}

declare var SVGAnimatedLengthList: {
    prototype: SVGAnimatedLengthList;
    new(): SVGAnimatedLengthList;
}

interface SVGAnimatedNumber {
    readonly animVal: number;
    baseVal: number;
}

declare var SVGAnimatedNumber: {
    prototype: SVGAnimatedNumber;
    new(): SVGAnimatedNumber;
}

interface SVGAnimatedNumberList {
    readonly animVal: SVGNumberList;
    readonly baseVal: SVGNumberList;
}

declare var SVGAnimatedNumberList: {
    prototype: SVGAnimatedNumberList;
    new(): SVGAnimatedNumberList;
}

interface SVGAnimatedPreserveAspectRatio {
    readonly animVal: SVGPreserveAspectRatio;
    readonly baseVal: SVGPreserveAspectRatio;
}

declare var SVGAnimatedPreserveAspectRatio: {
    prototype: SVGAnimatedPreserveAspectRatio;
    new(): SVGAnimatedPreserveAspectRatio;
}

interface SVGAnimatedRect {
    readonly animVal: SVGRect;
    readonly baseVal: SVGRect;
}

declare var SVGAnimatedRect: {
    prototype: SVGAnimatedRect;
    new(): SVGAnimatedRect;
}

interface SVGAnimatedString {
    readonly animVal: string;
    baseVal: string;
}

declare var SVGAnimatedString: {
    prototype: SVGAnimatedString;
    new(): SVGAnimatedString;
}

interface SVGAnimatedTransformList {
    readonly animVal: SVGTransformList;
    readonly baseVal: SVGTransformList;
}

declare var SVGAnimatedTransformList: {
    prototype: SVGAnimatedTransformList;
    new(): SVGAnimatedTransformList;
}

interface SVGCircleElement extends SVGElement, SVGStylable, SVGTransformable, SVGTests, SVGLangSpace, SVGExternalResourcesRequired {
    readonly cx: SVGAnimatedLength;
    readonly cy: SVGAnimatedLength;
    readonly r: SVGAnimatedLength;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var SVGCircleElement: {
    prototype: SVGCircleElement;
    new(): SVGCircleElement;
}

interface SVGClipPathElement extends SVGElement, SVGStylable, SVGTransformable, SVGTests, SVGLangSpace, SVGExternalResourcesRequired, SVGUnitTypes {
    readonly clipPathUnits: SVGAnimatedEnumeration;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var SVGClipPathElement: {
    prototype: SVGClipPathElement;
    new(): SVGClipPathElement;
}

interface SVGComponentTransferFunctionElement extends SVGElement {
    readonly amplitude: SVGAnimatedNumber;
    readonly exponent: SVGAnimatedNumber;
    readonly intercept: SVGAnimatedNumber;
    readonly offset: SVGAnimatedNumber;
    readonly slope: SVGAnimatedNumber;
    readonly tableValues: SVGAnimatedNumberList;
    readonly type: SVGAnimatedEnumeration;
    readonly SVG_FECOMPONENTTRANSFER_TYPE_DISCRETE: number;
    readonly SVG_FECOMPONENTTRANSFER_TYPE_GAMMA: number;
    readonly SVG_FECOMPONENTTRANSFER_TYPE_IDENTITY: number;
    readonly SVG_FECOMPONENTTRANSFER_TYPE_LINEAR: number;
    readonly SVG_FECOMPONENTTRANSFER_TYPE_TABLE: number;
    readonly SVG_FECOMPONENTTRANSFER_TYPE_UNKNOWN: number;
}

declare var SVGComponentTransferFunctionElement: {
    prototype: SVGComponentTransferFunctionElement;
    new(): SVGComponentTransferFunctionElement;
    readonly SVG_FECOMPONENTTRANSFER_TYPE_DISCRETE: number;
    readonly SVG_FECOMPONENTTRANSFER_TYPE_GAMMA: number;
    readonly SVG_FECOMPONENTTRANSFER_TYPE_IDENTITY: number;
    readonly SVG_FECOMPONENTTRANSFER_TYPE_LINEAR: number;
    readonly SVG_FECOMPONENTTRANSFER_TYPE_TABLE: number;
    readonly SVG_FECOMPONENTTRANSFER_TYPE_UNKNOWN: number;
}

interface SVGDefsElement extends SVGElement, SVGStylable, SVGTransformable, SVGTests, SVGLangSpace, SVGExternalResourcesRequired {
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var SVGDefsElement: {
    prototype: SVGDefsElement;
    new(): SVGDefsElement;
}

interface SVGDescElement extends SVGElement, SVGStylable, SVGLangSpace {
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var SVGDescElement: {
    prototype: SVGDescElement;
    new(): SVGDescElement;
}

interface SVGElement extends Element {
    onclick: (this: this, ev: MouseEvent) => any;
    ondblclick: (this: this, ev: MouseEvent) => any;
    onfocusin: (this: this, ev: FocusEvent) => any;
    onfocusout: (this: this, ev: FocusEvent) => any;
    onload: (this: this, ev: Event) => any;
    onmousedown: (this: this, ev: MouseEvent) => any;
    onmousemove: (this: this, ev: MouseEvent) => any;
    onmouseout: (this: this, ev: MouseEvent) => any;
    onmouseover: (this: this, ev: MouseEvent) => any;
    onmouseup: (this: this, ev: MouseEvent) => any;
    readonly ownerSVGElement: SVGSVGElement;
    readonly viewportElement: SVGElement;
    xmlbase: string;
    className: any;
    addEventListener(type: "MSGestureChange", listener: (this: this, ev: MSGestureEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSGestureDoubleTap", listener: (this: this, ev: MSGestureEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSGestureEnd", listener: (this: this, ev: MSGestureEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSGestureHold", listener: (this: this, ev: MSGestureEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSGestureStart", listener: (this: this, ev: MSGestureEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSGestureTap", listener: (this: this, ev: MSGestureEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSGotPointerCapture", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSInertiaStart", listener: (this: this, ev: MSGestureEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSLostPointerCapture", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSPointerCancel", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSPointerDown", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSPointerEnter", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSPointerLeave", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSPointerMove", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSPointerOut", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSPointerOver", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSPointerUp", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "ariarequest", listener: (this: this, ev: AriaRequestEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "click", listener: (this: this, ev: MouseEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "command", listener: (this: this, ev: CommandEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "dblclick", listener: (this: this, ev: MouseEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "focusin", listener: (this: this, ev: FocusEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "focusout", listener: (this: this, ev: FocusEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "gotpointercapture", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "load", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "lostpointercapture", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "mousedown", listener: (this: this, ev: MouseEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "mousemove", listener: (this: this, ev: MouseEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "mouseout", listener: (this: this, ev: MouseEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "mouseover", listener: (this: this, ev: MouseEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "mouseup", listener: (this: this, ev: MouseEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pointercancel", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pointerdown", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pointerenter", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pointerleave", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pointermove", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pointerout", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pointerover", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pointerup", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "touchcancel", listener: (this: this, ev: TouchEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "touchend", listener: (this: this, ev: TouchEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "touchmove", listener: (this: this, ev: TouchEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "touchstart", listener: (this: this, ev: TouchEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "webkitfullscreenchange", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "webkitfullscreenerror", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "wheel", listener: (this: this, ev: WheelEvent) => any, useCapture?: boolean): void;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var SVGElement: {
    prototype: SVGElement;
    new(): SVGElement;
}

interface SVGElementInstance extends EventTarget {
    readonly childNodes: SVGElementInstanceList;
    readonly correspondingElement: SVGElement;
    readonly correspondingUseElement: SVGUseElement;
    readonly firstChild: SVGElementInstance;
    readonly lastChild: SVGElementInstance;
    readonly nextSibling: SVGElementInstance;
    readonly parentNode: SVGElementInstance;
    readonly previousSibling: SVGElementInstance;
}

declare var SVGElementInstance: {
    prototype: SVGElementInstance;
    new(): SVGElementInstance;
}

interface SVGElementInstanceList {
    readonly length: number;
    item(index: number): SVGElementInstance;
}

declare var SVGElementInstanceList: {
    prototype: SVGElementInstanceList;
    new(): SVGElementInstanceList;
}

interface SVGEllipseElement extends SVGElement, SVGStylable, SVGTransformable, SVGTests, SVGLangSpace, SVGExternalResourcesRequired {
    readonly cx: SVGAnimatedLength;
    readonly cy: SVGAnimatedLength;
    readonly rx: SVGAnimatedLength;
    readonly ry: SVGAnimatedLength;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var SVGEllipseElement: {
    prototype: SVGEllipseElement;
    new(): SVGEllipseElement;
}

interface SVGFEBlendElement extends SVGElement, SVGFilterPrimitiveStandardAttributes {
    readonly in1: SVGAnimatedString;
    readonly in2: SVGAnimatedString;
    readonly mode: SVGAnimatedEnumeration;
    readonly SVG_FEBLEND_MODE_COLOR: number;
    readonly SVG_FEBLEND_MODE_COLOR_BURN: number;
    readonly SVG_FEBLEND_MODE_COLOR_DODGE: number;
    readonly SVG_FEBLEND_MODE_DARKEN: number;
    readonly SVG_FEBLEND_MODE_DIFFERENCE: number;
    readonly SVG_FEBLEND_MODE_EXCLUSION: number;
    readonly SVG_FEBLEND_MODE_HARD_LIGHT: number;
    readonly SVG_FEBLEND_MODE_HUE: number;
    readonly SVG_FEBLEND_MODE_LIGHTEN: number;
    readonly SVG_FEBLEND_MODE_LUMINOSITY: number;
    readonly SVG_FEBLEND_MODE_MULTIPLY: number;
    readonly SVG_FEBLEND_MODE_NORMAL: number;
    readonly SVG_FEBLEND_MODE_OVERLAY: number;
    readonly SVG_FEBLEND_MODE_SATURATION: number;
    readonly SVG_FEBLEND_MODE_SCREEN: number;
    readonly SVG_FEBLEND_MODE_SOFT_LIGHT: number;
    readonly SVG_FEBLEND_MODE_UNKNOWN: number;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var SVGFEBlendElement: {
    prototype: SVGFEBlendElement;
    new(): SVGFEBlendElement;
    readonly SVG_FEBLEND_MODE_COLOR: number;
    readonly SVG_FEBLEND_MODE_COLOR_BURN: number;
    readonly SVG_FEBLEND_MODE_COLOR_DODGE: number;
    readonly SVG_FEBLEND_MODE_DARKEN: number;
    readonly SVG_FEBLEND_MODE_DIFFERENCE: number;
    readonly SVG_FEBLEND_MODE_EXCLUSION: number;
    readonly SVG_FEBLEND_MODE_HARD_LIGHT: number;
    readonly SVG_FEBLEND_MODE_HUE: number;
    readonly SVG_FEBLEND_MODE_LIGHTEN: number;
    readonly SVG_FEBLEND_MODE_LUMINOSITY: number;
    readonly SVG_FEBLEND_MODE_MULTIPLY: number;
    readonly SVG_FEBLEND_MODE_NORMAL: number;
    readonly SVG_FEBLEND_MODE_OVERLAY: number;
    readonly SVG_FEBLEND_MODE_SATURATION: number;
    readonly SVG_FEBLEND_MODE_SCREEN: number;
    readonly SVG_FEBLEND_MODE_SOFT_LIGHT: number;
    readonly SVG_FEBLEND_MODE_UNKNOWN: number;
}

interface SVGFEColorMatrixElement extends SVGElement, SVGFilterPrimitiveStandardAttributes {
    readonly in1: SVGAnimatedString;
    readonly type: SVGAnimatedEnumeration;
    readonly values: SVGAnimatedNumberList;
    readonly SVG_FECOLORMATRIX_TYPE_HUEROTATE: number;
    readonly SVG_FECOLORMATRIX_TYPE_LUMINANCETOALPHA: number;
    readonly SVG_FECOLORMATRIX_TYPE_MATRIX: number;
    readonly SVG_FECOLORMATRIX_TYPE_SATURATE: number;
    readonly SVG_FECOLORMATRIX_TYPE_UNKNOWN: number;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var SVGFEColorMatrixElement: {
    prototype: SVGFEColorMatrixElement;
    new(): SVGFEColorMatrixElement;
    readonly SVG_FECOLORMATRIX_TYPE_HUEROTATE: number;
    readonly SVG_FECOLORMATRIX_TYPE_LUMINANCETOALPHA: number;
    readonly SVG_FECOLORMATRIX_TYPE_MATRIX: number;
    readonly SVG_FECOLORMATRIX_TYPE_SATURATE: number;
    readonly SVG_FECOLORMATRIX_TYPE_UNKNOWN: number;
}

interface SVGFEComponentTransferElement extends SVGElement, SVGFilterPrimitiveStandardAttributes {
    readonly in1: SVGAnimatedString;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var SVGFEComponentTransferElement: {
    prototype: SVGFEComponentTransferElement;
    new(): SVGFEComponentTransferElement;
}

interface SVGFECompositeElement extends SVGElement, SVGFilterPrimitiveStandardAttributes {
    readonly in1: SVGAnimatedString;
    readonly in2: SVGAnimatedString;
    readonly k1: SVGAnimatedNumber;
    readonly k2: SVGAnimatedNumber;
    readonly k3: SVGAnimatedNumber;
    readonly k4: SVGAnimatedNumber;
    readonly operator: SVGAnimatedEnumeration;
    readonly SVG_FECOMPOSITE_OPERATOR_ARITHMETIC: number;
    readonly SVG_FECOMPOSITE_OPERATOR_ATOP: number;
    readonly SVG_FECOMPOSITE_OPERATOR_IN: number;
    readonly SVG_FECOMPOSITE_OPERATOR_OUT: number;
    readonly SVG_FECOMPOSITE_OPERATOR_OVER: number;
    readonly SVG_FECOMPOSITE_OPERATOR_UNKNOWN: number;
    readonly SVG_FECOMPOSITE_OPERATOR_XOR: number;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var SVGFECompositeElement: {
    prototype: SVGFECompositeElement;
    new(): SVGFECompositeElement;
    readonly SVG_FECOMPOSITE_OPERATOR_ARITHMETIC: number;
    readonly SVG_FECOMPOSITE_OPERATOR_ATOP: number;
    readonly SVG_FECOMPOSITE_OPERATOR_IN: number;
    readonly SVG_FECOMPOSITE_OPERATOR_OUT: number;
    readonly SVG_FECOMPOSITE_OPERATOR_OVER: number;
    readonly SVG_FECOMPOSITE_OPERATOR_UNKNOWN: number;
    readonly SVG_FECOMPOSITE_OPERATOR_XOR: number;
}

interface SVGFEConvolveMatrixElement extends SVGElement, SVGFilterPrimitiveStandardAttributes {
    readonly bias: SVGAnimatedNumber;
    readonly divisor: SVGAnimatedNumber;
    readonly edgeMode: SVGAnimatedEnumeration;
    readonly in1: SVGAnimatedString;
    readonly kernelMatrix: SVGAnimatedNumberList;
    readonly kernelUnitLengthX: SVGAnimatedNumber;
    readonly kernelUnitLengthY: SVGAnimatedNumber;
    readonly orderX: SVGAnimatedInteger;
    readonly orderY: SVGAnimatedInteger;
    readonly preserveAlpha: SVGAnimatedBoolean;
    readonly targetX: SVGAnimatedInteger;
    readonly targetY: SVGAnimatedInteger;
    readonly SVG_EDGEMODE_DUPLICATE: number;
    readonly SVG_EDGEMODE_NONE: number;
    readonly SVG_EDGEMODE_UNKNOWN: number;
    readonly SVG_EDGEMODE_WRAP: number;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var SVGFEConvolveMatrixElement: {
    prototype: SVGFEConvolveMatrixElement;
    new(): SVGFEConvolveMatrixElement;
    readonly SVG_EDGEMODE_DUPLICATE: number;
    readonly SVG_EDGEMODE_NONE: number;
    readonly SVG_EDGEMODE_UNKNOWN: number;
    readonly SVG_EDGEMODE_WRAP: number;
}

interface SVGFEDiffuseLightingElement extends SVGElement, SVGFilterPrimitiveStandardAttributes {
    readonly diffuseConstant: SVGAnimatedNumber;
    readonly in1: SVGAnimatedString;
    readonly kernelUnitLengthX: SVGAnimatedNumber;
    readonly kernelUnitLengthY: SVGAnimatedNumber;
    readonly surfaceScale: SVGAnimatedNumber;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var SVGFEDiffuseLightingElement: {
    prototype: SVGFEDiffuseLightingElement;
    new(): SVGFEDiffuseLightingElement;
}

interface SVGFEDisplacementMapElement extends SVGElement, SVGFilterPrimitiveStandardAttributes {
    readonly in1: SVGAnimatedString;
    readonly in2: SVGAnimatedString;
    readonly scale: SVGAnimatedNumber;
    readonly xChannelSelector: SVGAnimatedEnumeration;
    readonly yChannelSelector: SVGAnimatedEnumeration;
    readonly SVG_CHANNEL_A: number;
    readonly SVG_CHANNEL_B: number;
    readonly SVG_CHANNEL_G: number;
    readonly SVG_CHANNEL_R: number;
    readonly SVG_CHANNEL_UNKNOWN: number;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var SVGFEDisplacementMapElement: {
    prototype: SVGFEDisplacementMapElement;
    new(): SVGFEDisplacementMapElement;
    readonly SVG_CHANNEL_A: number;
    readonly SVG_CHANNEL_B: number;
    readonly SVG_CHANNEL_G: number;
    readonly SVG_CHANNEL_R: number;
    readonly SVG_CHANNEL_UNKNOWN: number;
}

interface SVGFEDistantLightElement extends SVGElement {
    readonly azimuth: SVGAnimatedNumber;
    readonly elevation: SVGAnimatedNumber;
}

declare var SVGFEDistantLightElement: {
    prototype: SVGFEDistantLightElement;
    new(): SVGFEDistantLightElement;
}

interface SVGFEFloodElement extends SVGElement, SVGFilterPrimitiveStandardAttributes {
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var SVGFEFloodElement: {
    prototype: SVGFEFloodElement;
    new(): SVGFEFloodElement;
}

interface SVGFEFuncAElement extends SVGComponentTransferFunctionElement {
}

declare var SVGFEFuncAElement: {
    prototype: SVGFEFuncAElement;
    new(): SVGFEFuncAElement;
}

interface SVGFEFuncBElement extends SVGComponentTransferFunctionElement {
}

declare var SVGFEFuncBElement: {
    prototype: SVGFEFuncBElement;
    new(): SVGFEFuncBElement;
}

interface SVGFEFuncGElement extends SVGComponentTransferFunctionElement {
}

declare var SVGFEFuncGElement: {
    prototype: SVGFEFuncGElement;
    new(): SVGFEFuncGElement;
}

interface SVGFEFuncRElement extends SVGComponentTransferFunctionElement {
}

declare var SVGFEFuncRElement: {
    prototype: SVGFEFuncRElement;
    new(): SVGFEFuncRElement;
}

interface SVGFEGaussianBlurElement extends SVGElement, SVGFilterPrimitiveStandardAttributes {
    readonly in1: SVGAnimatedString;
    readonly stdDeviationX: SVGAnimatedNumber;
    readonly stdDeviationY: SVGAnimatedNumber;
    setStdDeviation(stdDeviationX: number, stdDeviationY: number): void;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var SVGFEGaussianBlurElement: {
    prototype: SVGFEGaussianBlurElement;
    new(): SVGFEGaussianBlurElement;
}

interface SVGFEImageElement extends SVGElement, SVGFilterPrimitiveStandardAttributes, SVGLangSpace, SVGURIReference, SVGExternalResourcesRequired {
    readonly preserveAspectRatio: SVGAnimatedPreserveAspectRatio;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var SVGFEImageElement: {
    prototype: SVGFEImageElement;
    new(): SVGFEImageElement;
}

interface SVGFEMergeElement extends SVGElement, SVGFilterPrimitiveStandardAttributes {
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var SVGFEMergeElement: {
    prototype: SVGFEMergeElement;
    new(): SVGFEMergeElement;
}

interface SVGFEMergeNodeElement extends SVGElement {
    readonly in1: SVGAnimatedString;
}

declare var SVGFEMergeNodeElement: {
    prototype: SVGFEMergeNodeElement;
    new(): SVGFEMergeNodeElement;
}

interface SVGFEMorphologyElement extends SVGElement, SVGFilterPrimitiveStandardAttributes {
    readonly in1: SVGAnimatedString;
    readonly operator: SVGAnimatedEnumeration;
    readonly radiusX: SVGAnimatedNumber;
    readonly radiusY: SVGAnimatedNumber;
    readonly SVG_MORPHOLOGY_OPERATOR_DILATE: number;
    readonly SVG_MORPHOLOGY_OPERATOR_ERODE: number;
    readonly SVG_MORPHOLOGY_OPERATOR_UNKNOWN: number;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var SVGFEMorphologyElement: {
    prototype: SVGFEMorphologyElement;
    new(): SVGFEMorphologyElement;
    readonly SVG_MORPHOLOGY_OPERATOR_DILATE: number;
    readonly SVG_MORPHOLOGY_OPERATOR_ERODE: number;
    readonly SVG_MORPHOLOGY_OPERATOR_UNKNOWN: number;
}

interface SVGFEOffsetElement extends SVGElement, SVGFilterPrimitiveStandardAttributes {
    readonly dx: SVGAnimatedNumber;
    readonly dy: SVGAnimatedNumber;
    readonly in1: SVGAnimatedString;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var SVGFEOffsetElement: {
    prototype: SVGFEOffsetElement;
    new(): SVGFEOffsetElement;
}

interface SVGFEPointLightElement extends SVGElement {
    readonly x: SVGAnimatedNumber;
    readonly y: SVGAnimatedNumber;
    readonly z: SVGAnimatedNumber;
}

declare var SVGFEPointLightElement: {
    prototype: SVGFEPointLightElement;
    new(): SVGFEPointLightElement;
}

interface SVGFESpecularLightingElement extends SVGElement, SVGFilterPrimitiveStandardAttributes {
    readonly in1: SVGAnimatedString;
    readonly kernelUnitLengthX: SVGAnimatedNumber;
    readonly kernelUnitLengthY: SVGAnimatedNumber;
    readonly specularConstant: SVGAnimatedNumber;
    readonly specularExponent: SVGAnimatedNumber;
    readonly surfaceScale: SVGAnimatedNumber;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var SVGFESpecularLightingElement: {
    prototype: SVGFESpecularLightingElement;
    new(): SVGFESpecularLightingElement;
}

interface SVGFESpotLightElement extends SVGElement {
    readonly limitingConeAngle: SVGAnimatedNumber;
    readonly pointsAtX: SVGAnimatedNumber;
    readonly pointsAtY: SVGAnimatedNumber;
    readonly pointsAtZ: SVGAnimatedNumber;
    readonly specularExponent: SVGAnimatedNumber;
    readonly x: SVGAnimatedNumber;
    readonly y: SVGAnimatedNumber;
    readonly z: SVGAnimatedNumber;
}

declare var SVGFESpotLightElement: {
    prototype: SVGFESpotLightElement;
    new(): SVGFESpotLightElement;
}

interface SVGFETileElement extends SVGElement, SVGFilterPrimitiveStandardAttributes {
    readonly in1: SVGAnimatedString;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var SVGFETileElement: {
    prototype: SVGFETileElement;
    new(): SVGFETileElement;
}

interface SVGFETurbulenceElement extends SVGElement, SVGFilterPrimitiveStandardAttributes {
    readonly baseFrequencyX: SVGAnimatedNumber;
    readonly baseFrequencyY: SVGAnimatedNumber;
    readonly numOctaves: SVGAnimatedInteger;
    readonly seed: SVGAnimatedNumber;
    readonly stitchTiles: SVGAnimatedEnumeration;
    readonly type: SVGAnimatedEnumeration;
    readonly SVG_STITCHTYPE_NOSTITCH: number;
    readonly SVG_STITCHTYPE_STITCH: number;
    readonly SVG_STITCHTYPE_UNKNOWN: number;
    readonly SVG_TURBULENCE_TYPE_FRACTALNOISE: number;
    readonly SVG_TURBULENCE_TYPE_TURBULENCE: number;
    readonly SVG_TURBULENCE_TYPE_UNKNOWN: number;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var SVGFETurbulenceElement: {
    prototype: SVGFETurbulenceElement;
    new(): SVGFETurbulenceElement;
    readonly SVG_STITCHTYPE_NOSTITCH: number;
    readonly SVG_STITCHTYPE_STITCH: number;
    readonly SVG_STITCHTYPE_UNKNOWN: number;
    readonly SVG_TURBULENCE_TYPE_FRACTALNOISE: number;
    readonly SVG_TURBULENCE_TYPE_TURBULENCE: number;
    readonly SVG_TURBULENCE_TYPE_UNKNOWN: number;
}

interface SVGFilterElement extends SVGElement, SVGUnitTypes, SVGStylable, SVGLangSpace, SVGURIReference, SVGExternalResourcesRequired {
    readonly filterResX: SVGAnimatedInteger;
    readonly filterResY: SVGAnimatedInteger;
    readonly filterUnits: SVGAnimatedEnumeration;
    readonly height: SVGAnimatedLength;
    readonly primitiveUnits: SVGAnimatedEnumeration;
    readonly width: SVGAnimatedLength;
    readonly x: SVGAnimatedLength;
    readonly y: SVGAnimatedLength;
    setFilterRes(filterResX: number, filterResY: number): void;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var SVGFilterElement: {
    prototype: SVGFilterElement;
    new(): SVGFilterElement;
}

interface SVGForeignObjectElement extends SVGElement, SVGStylable, SVGTransformable, SVGTests, SVGLangSpace, SVGExternalResourcesRequired {
    readonly height: SVGAnimatedLength;
    readonly width: SVGAnimatedLength;
    readonly x: SVGAnimatedLength;
    readonly y: SVGAnimatedLength;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var SVGForeignObjectElement: {
    prototype: SVGForeignObjectElement;
    new(): SVGForeignObjectElement;
}

interface SVGGElement extends SVGElement, SVGStylable, SVGTransformable, SVGTests, SVGLangSpace, SVGExternalResourcesRequired {
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var SVGGElement: {
    prototype: SVGGElement;
    new(): SVGGElement;
}

interface SVGGradientElement extends SVGElement, SVGStylable, SVGExternalResourcesRequired, SVGURIReference, SVGUnitTypes {
    readonly gradientTransform: SVGAnimatedTransformList;
    readonly gradientUnits: SVGAnimatedEnumeration;
    readonly spreadMethod: SVGAnimatedEnumeration;
    readonly SVG_SPREADMETHOD_PAD: number;
    readonly SVG_SPREADMETHOD_REFLECT: number;
    readonly SVG_SPREADMETHOD_REPEAT: number;
    readonly SVG_SPREADMETHOD_UNKNOWN: number;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var SVGGradientElement: {
    prototype: SVGGradientElement;
    new(): SVGGradientElement;
    readonly SVG_SPREADMETHOD_PAD: number;
    readonly SVG_SPREADMETHOD_REFLECT: number;
    readonly SVG_SPREADMETHOD_REPEAT: number;
    readonly SVG_SPREADMETHOD_UNKNOWN: number;
}

interface SVGImageElement extends SVGElement, SVGStylable, SVGTransformable, SVGTests, SVGLangSpace, SVGExternalResourcesRequired, SVGURIReference {
    readonly height: SVGAnimatedLength;
    readonly preserveAspectRatio: SVGAnimatedPreserveAspectRatio;
    readonly width: SVGAnimatedLength;
    readonly x: SVGAnimatedLength;
    readonly y: SVGAnimatedLength;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var SVGImageElement: {
    prototype: SVGImageElement;
    new(): SVGImageElement;
}

interface SVGLength {
    readonly unitType: number;
    value: number;
    valueAsString: string;
    valueInSpecifiedUnits: number;
    convertToSpecifiedUnits(unitType: number): void;
    newValueSpecifiedUnits(unitType: number, valueInSpecifiedUnits: number): void;
    readonly SVG_LENGTHTYPE_CM: number;
    readonly SVG_LENGTHTYPE_EMS: number;
    readonly SVG_LENGTHTYPE_EXS: number;
    readonly SVG_LENGTHTYPE_IN: number;
    readonly SVG_LENGTHTYPE_MM: number;
    readonly SVG_LENGTHTYPE_NUMBER: number;
    readonly SVG_LENGTHTYPE_PC: number;
    readonly SVG_LENGTHTYPE_PERCENTAGE: number;
    readonly SVG_LENGTHTYPE_PT: number;
    readonly SVG_LENGTHTYPE_PX: number;
    readonly SVG_LENGTHTYPE_UNKNOWN: number;
}

declare var SVGLength: {
    prototype: SVGLength;
    new(): SVGLength;
    readonly SVG_LENGTHTYPE_CM: number;
    readonly SVG_LENGTHTYPE_EMS: number;
    readonly SVG_LENGTHTYPE_EXS: number;
    readonly SVG_LENGTHTYPE_IN: number;
    readonly SVG_LENGTHTYPE_MM: number;
    readonly SVG_LENGTHTYPE_NUMBER: number;
    readonly SVG_LENGTHTYPE_PC: number;
    readonly SVG_LENGTHTYPE_PERCENTAGE: number;
    readonly SVG_LENGTHTYPE_PT: number;
    readonly SVG_LENGTHTYPE_PX: number;
    readonly SVG_LENGTHTYPE_UNKNOWN: number;
}

interface SVGLengthList {
    readonly numberOfItems: number;
    appendItem(newItem: SVGLength): SVGLength;
    clear(): void;
    getItem(index: number): SVGLength;
    initialize(newItem: SVGLength): SVGLength;
    insertItemBefore(newItem: SVGLength, index: number): SVGLength;
    removeItem(index: number): SVGLength;
    replaceItem(newItem: SVGLength, index: number): SVGLength;
}

declare var SVGLengthList: {
    prototype: SVGLengthList;
    new(): SVGLengthList;
}

interface SVGLineElement extends SVGElement, SVGStylable, SVGTransformable, SVGTests, SVGLangSpace, SVGExternalResourcesRequired {
    readonly x1: SVGAnimatedLength;
    readonly x2: SVGAnimatedLength;
    readonly y1: SVGAnimatedLength;
    readonly y2: SVGAnimatedLength;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var SVGLineElement: {
    prototype: SVGLineElement;
    new(): SVGLineElement;
}

interface SVGLinearGradientElement extends SVGGradientElement {
    readonly x1: SVGAnimatedLength;
    readonly x2: SVGAnimatedLength;
    readonly y1: SVGAnimatedLength;
    readonly y2: SVGAnimatedLength;
}

declare var SVGLinearGradientElement: {
    prototype: SVGLinearGradientElement;
    new(): SVGLinearGradientElement;
}

interface SVGMarkerElement extends SVGElement, SVGStylable, SVGLangSpace, SVGExternalResourcesRequired, SVGFitToViewBox {
    readonly markerHeight: SVGAnimatedLength;
    readonly markerUnits: SVGAnimatedEnumeration;
    readonly markerWidth: SVGAnimatedLength;
    readonly orientAngle: SVGAnimatedAngle;
    readonly orientType: SVGAnimatedEnumeration;
    readonly refX: SVGAnimatedLength;
    readonly refY: SVGAnimatedLength;
    setOrientToAngle(angle: SVGAngle): void;
    setOrientToAuto(): void;
    readonly SVG_MARKERUNITS_STROKEWIDTH: number;
    readonly SVG_MARKERUNITS_UNKNOWN: number;
    readonly SVG_MARKERUNITS_USERSPACEONUSE: number;
    readonly SVG_MARKER_ORIENT_ANGLE: number;
    readonly SVG_MARKER_ORIENT_AUTO: number;
    readonly SVG_MARKER_ORIENT_UNKNOWN: number;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var SVGMarkerElement: {
    prototype: SVGMarkerElement;
    new(): SVGMarkerElement;
    readonly SVG_MARKERUNITS_STROKEWIDTH: number;
    readonly SVG_MARKERUNITS_UNKNOWN: number;
    readonly SVG_MARKERUNITS_USERSPACEONUSE: number;
    readonly SVG_MARKER_ORIENT_ANGLE: number;
    readonly SVG_MARKER_ORIENT_AUTO: number;
    readonly SVG_MARKER_ORIENT_UNKNOWN: number;
}

interface SVGMaskElement extends SVGElement, SVGStylable, SVGTests, SVGLangSpace, SVGExternalResourcesRequired, SVGUnitTypes {
    readonly height: SVGAnimatedLength;
    readonly maskContentUnits: SVGAnimatedEnumeration;
    readonly maskUnits: SVGAnimatedEnumeration;
    readonly width: SVGAnimatedLength;
    readonly x: SVGAnimatedLength;
    readonly y: SVGAnimatedLength;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var SVGMaskElement: {
    prototype: SVGMaskElement;
    new(): SVGMaskElement;
}

interface SVGMatrix {
    a: number;
    b: number;
    c: number;
    d: number;
    e: number;
    f: number;
    flipX(): SVGMatrix;
    flipY(): SVGMatrix;
    inverse(): SVGMatrix;
    multiply(secondMatrix: SVGMatrix): SVGMatrix;
    rotate(angle: number): SVGMatrix;
    rotateFromVector(x: number, y: number): SVGMatrix;
    scale(scaleFactor: number): SVGMatrix;
    scaleNonUniform(scaleFactorX: number, scaleFactorY: number): SVGMatrix;
    skewX(angle: number): SVGMatrix;
    skewY(angle: number): SVGMatrix;
    translate(x: number, y: number): SVGMatrix;
}

declare var SVGMatrix: {
    prototype: SVGMatrix;
    new(): SVGMatrix;
}

interface SVGMetadataElement extends SVGElement {
}

declare var SVGMetadataElement: {
    prototype: SVGMetadataElement;
    new(): SVGMetadataElement;
}

interface SVGNumber {
    value: number;
}

declare var SVGNumber: {
    prototype: SVGNumber;
    new(): SVGNumber;
}

interface SVGNumberList {
    readonly numberOfItems: number;
    appendItem(newItem: SVGNumber): SVGNumber;
    clear(): void;
    getItem(index: number): SVGNumber;
    initialize(newItem: SVGNumber): SVGNumber;
    insertItemBefore(newItem: SVGNumber, index: number): SVGNumber;
    removeItem(index: number): SVGNumber;
    replaceItem(newItem: SVGNumber, index: number): SVGNumber;
}

declare var SVGNumberList: {
    prototype: SVGNumberList;
    new(): SVGNumberList;
}

interface SVGPathElement extends SVGElement, SVGStylable, SVGTransformable, SVGTests, SVGLangSpace, SVGExternalResourcesRequired, SVGAnimatedPathData {
    createSVGPathSegArcAbs(x: number, y: number, r1: number, r2: number, angle: number, largeArcFlag: boolean, sweepFlag: boolean): SVGPathSegArcAbs;
    createSVGPathSegArcRel(x: number, y: number, r1: number, r2: number, angle: number, largeArcFlag: boolean, sweepFlag: boolean): SVGPathSegArcRel;
    createSVGPathSegClosePath(): SVGPathSegClosePath;
    createSVGPathSegCurvetoCubicAbs(x: number, y: number, x1: number, y1: number, x2: number, y2: number): SVGPathSegCurvetoCubicAbs;
    createSVGPathSegCurvetoCubicRel(x: number, y: number, x1: number, y1: number, x2: number, y2: number): SVGPathSegCurvetoCubicRel;
    createSVGPathSegCurvetoCubicSmoothAbs(x: number, y: number, x2: number, y2: number): SVGPathSegCurvetoCubicSmoothAbs;
    createSVGPathSegCurvetoCubicSmoothRel(x: number, y: number, x2: number, y2: number): SVGPathSegCurvetoCubicSmoothRel;
    createSVGPathSegCurvetoQuadraticAbs(x: number, y: number, x1: number, y1: number): SVGPathSegCurvetoQuadraticAbs;
    createSVGPathSegCurvetoQuadraticRel(x: number, y: number, x1: number, y1: number): SVGPathSegCurvetoQuadraticRel;
    createSVGPathSegCurvetoQuadraticSmoothAbs(x: number, y: number): SVGPathSegCurvetoQuadraticSmoothAbs;
    createSVGPathSegCurvetoQuadraticSmoothRel(x: number, y: number): SVGPathSegCurvetoQuadraticSmoothRel;
    createSVGPathSegLinetoAbs(x: number, y: number): SVGPathSegLinetoAbs;
    createSVGPathSegLinetoHorizontalAbs(x: number): SVGPathSegLinetoHorizontalAbs;
    createSVGPathSegLinetoHorizontalRel(x: number): SVGPathSegLinetoHorizontalRel;
    createSVGPathSegLinetoRel(x: number, y: number): SVGPathSegLinetoRel;
    createSVGPathSegLinetoVerticalAbs(y: number): SVGPathSegLinetoVerticalAbs;
    createSVGPathSegLinetoVerticalRel(y: number): SVGPathSegLinetoVerticalRel;
    createSVGPathSegMovetoAbs(x: number, y: number): SVGPathSegMovetoAbs;
    createSVGPathSegMovetoRel(x: number, y: number): SVGPathSegMovetoRel;
    getPathSegAtLength(distance: number): number;
    getPointAtLength(distance: number): SVGPoint;
    getTotalLength(): number;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var SVGPathElement: {
    prototype: SVGPathElement;
    new(): SVGPathElement;
}

interface SVGPathSeg {
    readonly pathSegType: number;
    readonly pathSegTypeAsLetter: string;
    readonly PATHSEG_ARC_ABS: number;
    readonly PATHSEG_ARC_REL: number;
    readonly PATHSEG_CLOSEPATH: number;
    readonly PATHSEG_CURVETO_CUBIC_ABS: number;
    readonly PATHSEG_CURVETO_CUBIC_REL: number;
    readonly PATHSEG_CURVETO_CUBIC_SMOOTH_ABS: number;
    readonly PATHSEG_CURVETO_CUBIC_SMOOTH_REL: number;
    readonly PATHSEG_CURVETO_QUADRATIC_ABS: number;
    readonly PATHSEG_CURVETO_QUADRATIC_REL: number;
    readonly PATHSEG_CURVETO_QUADRATIC_SMOOTH_ABS: number;
    readonly PATHSEG_CURVETO_QUADRATIC_SMOOTH_REL: number;
    readonly PATHSEG_LINETO_ABS: number;
    readonly PATHSEG_LINETO_HORIZONTAL_ABS: number;
    readonly PATHSEG_LINETO_HORIZONTAL_REL: number;
    readonly PATHSEG_LINETO_REL: number;
    readonly PATHSEG_LINETO_VERTICAL_ABS: number;
    readonly PATHSEG_LINETO_VERTICAL_REL: number;
    readonly PATHSEG_MOVETO_ABS: number;
    readonly PATHSEG_MOVETO_REL: number;
    readonly PATHSEG_UNKNOWN: number;
}

declare var SVGPathSeg: {
    prototype: SVGPathSeg;
    new(): SVGPathSeg;
    readonly PATHSEG_ARC_ABS: number;
    readonly PATHSEG_ARC_REL: number;
    readonly PATHSEG_CLOSEPATH: number;
    readonly PATHSEG_CURVETO_CUBIC_ABS: number;
    readonly PATHSEG_CURVETO_CUBIC_REL: number;
    readonly PATHSEG_CURVETO_CUBIC_SMOOTH_ABS: number;
    readonly PATHSEG_CURVETO_CUBIC_SMOOTH_REL: number;
    readonly PATHSEG_CURVETO_QUADRATIC_ABS: number;
    readonly PATHSEG_CURVETO_QUADRATIC_REL: number;
    readonly PATHSEG_CURVETO_QUADRATIC_SMOOTH_ABS: number;
    readonly PATHSEG_CURVETO_QUADRATIC_SMOOTH_REL: number;
    readonly PATHSEG_LINETO_ABS: number;
    readonly PATHSEG_LINETO_HORIZONTAL_ABS: number;
    readonly PATHSEG_LINETO_HORIZONTAL_REL: number;
    readonly PATHSEG_LINETO_REL: number;
    readonly PATHSEG_LINETO_VERTICAL_ABS: number;
    readonly PATHSEG_LINETO_VERTICAL_REL: number;
    readonly PATHSEG_MOVETO_ABS: number;
    readonly PATHSEG_MOVETO_REL: number;
    readonly PATHSEG_UNKNOWN: number;
}

interface SVGPathSegArcAbs extends SVGPathSeg {
    angle: number;
    largeArcFlag: boolean;
    r1: number;
    r2: number;
    sweepFlag: boolean;
    x: number;
    y: number;
}

declare var SVGPathSegArcAbs: {
    prototype: SVGPathSegArcAbs;
    new(): SVGPathSegArcAbs;
}

interface SVGPathSegArcRel extends SVGPathSeg {
    angle: number;
    largeArcFlag: boolean;
    r1: number;
    r2: number;
    sweepFlag: boolean;
    x: number;
    y: number;
}

declare var SVGPathSegArcRel: {
    prototype: SVGPathSegArcRel;
    new(): SVGPathSegArcRel;
}

interface SVGPathSegClosePath extends SVGPathSeg {
}

declare var SVGPathSegClosePath: {
    prototype: SVGPathSegClosePath;
    new(): SVGPathSegClosePath;
}

interface SVGPathSegCurvetoCubicAbs extends SVGPathSeg {
    x: number;
    x1: number;
    x2: number;
    y: number;
    y1: number;
    y2: number;
}

declare var SVGPathSegCurvetoCubicAbs: {
    prototype: SVGPathSegCurvetoCubicAbs;
    new(): SVGPathSegCurvetoCubicAbs;
}

interface SVGPathSegCurvetoCubicRel extends SVGPathSeg {
    x: number;
    x1: number;
    x2: number;
    y: number;
    y1: number;
    y2: number;
}

declare var SVGPathSegCurvetoCubicRel: {
    prototype: SVGPathSegCurvetoCubicRel;
    new(): SVGPathSegCurvetoCubicRel;
}

interface SVGPathSegCurvetoCubicSmoothAbs extends SVGPathSeg {
    x: number;
    x2: number;
    y: number;
    y2: number;
}

declare var SVGPathSegCurvetoCubicSmoothAbs: {
    prototype: SVGPathSegCurvetoCubicSmoothAbs;
    new(): SVGPathSegCurvetoCubicSmoothAbs;
}

interface SVGPathSegCurvetoCubicSmoothRel extends SVGPathSeg {
    x: number;
    x2: number;
    y: number;
    y2: number;
}

declare var SVGPathSegCurvetoCubicSmoothRel: {
    prototype: SVGPathSegCurvetoCubicSmoothRel;
    new(): SVGPathSegCurvetoCubicSmoothRel;
}

interface SVGPathSegCurvetoQuadraticAbs extends SVGPathSeg {
    x: number;
    x1: number;
    y: number;
    y1: number;
}

declare var SVGPathSegCurvetoQuadraticAbs: {
    prototype: SVGPathSegCurvetoQuadraticAbs;
    new(): SVGPathSegCurvetoQuadraticAbs;
}

interface SVGPathSegCurvetoQuadraticRel extends SVGPathSeg {
    x: number;
    x1: number;
    y: number;
    y1: number;
}

declare var SVGPathSegCurvetoQuadraticRel: {
    prototype: SVGPathSegCurvetoQuadraticRel;
    new(): SVGPathSegCurvetoQuadraticRel;
}

interface SVGPathSegCurvetoQuadraticSmoothAbs extends SVGPathSeg {
    x: number;
    y: number;
}

declare var SVGPathSegCurvetoQuadraticSmoothAbs: {
    prototype: SVGPathSegCurvetoQuadraticSmoothAbs;
    new(): SVGPathSegCurvetoQuadraticSmoothAbs;
}

interface SVGPathSegCurvetoQuadraticSmoothRel extends SVGPathSeg {
    x: number;
    y: number;
}

declare var SVGPathSegCurvetoQuadraticSmoothRel: {
    prototype: SVGPathSegCurvetoQuadraticSmoothRel;
    new(): SVGPathSegCurvetoQuadraticSmoothRel;
}

interface SVGPathSegLinetoAbs extends SVGPathSeg {
    x: number;
    y: number;
}

declare var SVGPathSegLinetoAbs: {
    prototype: SVGPathSegLinetoAbs;
    new(): SVGPathSegLinetoAbs;
}

interface SVGPathSegLinetoHorizontalAbs extends SVGPathSeg {
    x: number;
}

declare var SVGPathSegLinetoHorizontalAbs: {
    prototype: SVGPathSegLinetoHorizontalAbs;
    new(): SVGPathSegLinetoHorizontalAbs;
}

interface SVGPathSegLinetoHorizontalRel extends SVGPathSeg {
    x: number;
}

declare var SVGPathSegLinetoHorizontalRel: {
    prototype: SVGPathSegLinetoHorizontalRel;
    new(): SVGPathSegLinetoHorizontalRel;
}

interface SVGPathSegLinetoRel extends SVGPathSeg {
    x: number;
    y: number;
}

declare var SVGPathSegLinetoRel: {
    prototype: SVGPathSegLinetoRel;
    new(): SVGPathSegLinetoRel;
}

interface SVGPathSegLinetoVerticalAbs extends SVGPathSeg {
    y: number;
}

declare var SVGPathSegLinetoVerticalAbs: {
    prototype: SVGPathSegLinetoVerticalAbs;
    new(): SVGPathSegLinetoVerticalAbs;
}

interface SVGPathSegLinetoVerticalRel extends SVGPathSeg {
    y: number;
}

declare var SVGPathSegLinetoVerticalRel: {
    prototype: SVGPathSegLinetoVerticalRel;
    new(): SVGPathSegLinetoVerticalRel;
}

interface SVGPathSegList {
    readonly numberOfItems: number;
    appendItem(newItem: SVGPathSeg): SVGPathSeg;
    clear(): void;
    getItem(index: number): SVGPathSeg;
    initialize(newItem: SVGPathSeg): SVGPathSeg;
    insertItemBefore(newItem: SVGPathSeg, index: number): SVGPathSeg;
    removeItem(index: number): SVGPathSeg;
    replaceItem(newItem: SVGPathSeg, index: number): SVGPathSeg;
}

declare var SVGPathSegList: {
    prototype: SVGPathSegList;
    new(): SVGPathSegList;
}

interface SVGPathSegMovetoAbs extends SVGPathSeg {
    x: number;
    y: number;
}

declare var SVGPathSegMovetoAbs: {
    prototype: SVGPathSegMovetoAbs;
    new(): SVGPathSegMovetoAbs;
}

interface SVGPathSegMovetoRel extends SVGPathSeg {
    x: number;
    y: number;
}

declare var SVGPathSegMovetoRel: {
    prototype: SVGPathSegMovetoRel;
    new(): SVGPathSegMovetoRel;
}

interface SVGPatternElement extends SVGElement, SVGStylable, SVGTests, SVGLangSpace, SVGExternalResourcesRequired, SVGFitToViewBox, SVGURIReference, SVGUnitTypes {
    readonly height: SVGAnimatedLength;
    readonly patternContentUnits: SVGAnimatedEnumeration;
    readonly patternTransform: SVGAnimatedTransformList;
    readonly patternUnits: SVGAnimatedEnumeration;
    readonly width: SVGAnimatedLength;
    readonly x: SVGAnimatedLength;
    readonly y: SVGAnimatedLength;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var SVGPatternElement: {
    prototype: SVGPatternElement;
    new(): SVGPatternElement;
}

interface SVGPoint {
    x: number;
    y: number;
    matrixTransform(matrix: SVGMatrix): SVGPoint;
}

declare var SVGPoint: {
    prototype: SVGPoint;
    new(): SVGPoint;
}

interface SVGPointList {
    readonly numberOfItems: number;
    appendItem(newItem: SVGPoint): SVGPoint;
    clear(): void;
    getItem(index: number): SVGPoint;
    initialize(newItem: SVGPoint): SVGPoint;
    insertItemBefore(newItem: SVGPoint, index: number): SVGPoint;
    removeItem(index: number): SVGPoint;
    replaceItem(newItem: SVGPoint, index: number): SVGPoint;
}

declare var SVGPointList: {
    prototype: SVGPointList;
    new(): SVGPointList;
}

interface SVGPolygonElement extends SVGElement, SVGStylable, SVGTransformable, SVGTests, SVGLangSpace, SVGExternalResourcesRequired, SVGAnimatedPoints {
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var SVGPolygonElement: {
    prototype: SVGPolygonElement;
    new(): SVGPolygonElement;
}

interface SVGPolylineElement extends SVGElement, SVGStylable, SVGTransformable, SVGTests, SVGLangSpace, SVGExternalResourcesRequired, SVGAnimatedPoints {
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var SVGPolylineElement: {
    prototype: SVGPolylineElement;
    new(): SVGPolylineElement;
}

interface SVGPreserveAspectRatio {
    align: number;
    meetOrSlice: number;
    readonly SVG_MEETORSLICE_MEET: number;
    readonly SVG_MEETORSLICE_SLICE: number;
    readonly SVG_MEETORSLICE_UNKNOWN: number;
    readonly SVG_PRESERVEASPECTRATIO_NONE: number;
    readonly SVG_PRESERVEASPECTRATIO_UNKNOWN: number;
    readonly SVG_PRESERVEASPECTRATIO_XMAXYMAX: number;
    readonly SVG_PRESERVEASPECTRATIO_XMAXYMID: number;
    readonly SVG_PRESERVEASPECTRATIO_XMAXYMIN: number;
    readonly SVG_PRESERVEASPECTRATIO_XMIDYMAX: number;
    readonly SVG_PRESERVEASPECTRATIO_XMIDYMID: number;
    readonly SVG_PRESERVEASPECTRATIO_XMIDYMIN: number;
    readonly SVG_PRESERVEASPECTRATIO_XMINYMAX: number;
    readonly SVG_PRESERVEASPECTRATIO_XMINYMID: number;
    readonly SVG_PRESERVEASPECTRATIO_XMINYMIN: number;
}

declare var SVGPreserveAspectRatio: {
    prototype: SVGPreserveAspectRatio;
    new(): SVGPreserveAspectRatio;
    readonly SVG_MEETORSLICE_MEET: number;
    readonly SVG_MEETORSLICE_SLICE: number;
    readonly SVG_MEETORSLICE_UNKNOWN: number;
    readonly SVG_PRESERVEASPECTRATIO_NONE: number;
    readonly SVG_PRESERVEASPECTRATIO_UNKNOWN: number;
    readonly SVG_PRESERVEASPECTRATIO_XMAXYMAX: number;
    readonly SVG_PRESERVEASPECTRATIO_XMAXYMID: number;
    readonly SVG_PRESERVEASPECTRATIO_XMAXYMIN: number;
    readonly SVG_PRESERVEASPECTRATIO_XMIDYMAX: number;
    readonly SVG_PRESERVEASPECTRATIO_XMIDYMID: number;
    readonly SVG_PRESERVEASPECTRATIO_XMIDYMIN: number;
    readonly SVG_PRESERVEASPECTRATIO_XMINYMAX: number;
    readonly SVG_PRESERVEASPECTRATIO_XMINYMID: number;
    readonly SVG_PRESERVEASPECTRATIO_XMINYMIN: number;
}

interface SVGRadialGradientElement extends SVGGradientElement {
    readonly cx: SVGAnimatedLength;
    readonly cy: SVGAnimatedLength;
    readonly fx: SVGAnimatedLength;
    readonly fy: SVGAnimatedLength;
    readonly r: SVGAnimatedLength;
}

declare var SVGRadialGradientElement: {
    prototype: SVGRadialGradientElement;
    new(): SVGRadialGradientElement;
}

interface SVGRect {
    height: number;
    width: number;
    x: number;
    y: number;
}

declare var SVGRect: {
    prototype: SVGRect;
    new(): SVGRect;
}

interface SVGRectElement extends SVGElement, SVGStylable, SVGTransformable, SVGTests, SVGLangSpace, SVGExternalResourcesRequired {
    readonly height: SVGAnimatedLength;
    readonly rx: SVGAnimatedLength;
    readonly ry: SVGAnimatedLength;
    readonly width: SVGAnimatedLength;
    readonly x: SVGAnimatedLength;
    readonly y: SVGAnimatedLength;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var SVGRectElement: {
    prototype: SVGRectElement;
    new(): SVGRectElement;
}

interface SVGSVGElement extends SVGElement, DocumentEvent, SVGLocatable, SVGTests, SVGStylable, SVGLangSpace, SVGExternalResourcesRequired, SVGFitToViewBox, SVGZoomAndPan {
    contentScriptType: string;
    contentStyleType: string;
    currentScale: number;
    readonly currentTranslate: SVGPoint;
    readonly height: SVGAnimatedLength;
    onabort: (this: this, ev: Event) => any;
    onerror: (this: this, ev: Event) => any;
    onresize: (this: this, ev: UIEvent) => any;
    onscroll: (this: this, ev: UIEvent) => any;
    onunload: (this: this, ev: Event) => any;
    onzoom: (this: this, ev: SVGZoomEvent) => any;
    readonly pixelUnitToMillimeterX: number;
    readonly pixelUnitToMillimeterY: number;
    readonly screenPixelToMillimeterX: number;
    readonly screenPixelToMillimeterY: number;
    readonly viewport: SVGRect;
    readonly width: SVGAnimatedLength;
    readonly x: SVGAnimatedLength;
    readonly y: SVGAnimatedLength;
    checkEnclosure(element: SVGElement, rect: SVGRect): boolean;
    checkIntersection(element: SVGElement, rect: SVGRect): boolean;
    createSVGAngle(): SVGAngle;
    createSVGLength(): SVGLength;
    createSVGMatrix(): SVGMatrix;
    createSVGNumber(): SVGNumber;
    createSVGPoint(): SVGPoint;
    createSVGRect(): SVGRect;
    createSVGTransform(): SVGTransform;
    createSVGTransformFromMatrix(matrix: SVGMatrix): SVGTransform;
    deselectAll(): void;
    forceRedraw(): void;
    getComputedStyle(elt: Element, pseudoElt?: string): CSSStyleDeclaration;
    getCurrentTime(): number;
    getElementById(elementId: string): Element;
    getEnclosureList(rect: SVGRect, referenceElement: SVGElement): NodeListOf<SVGCircleElement | SVGEllipseElement | SVGImageElement | SVGLineElement | SVGPathElement | SVGPolygonElement | SVGPolylineElement | SVGRectElement | SVGTextElement | SVGUseElement>;
    getIntersectionList(rect: SVGRect, referenceElement: SVGElement): NodeListOf<SVGCircleElement | SVGEllipseElement | SVGImageElement | SVGLineElement | SVGPathElement | SVGPolygonElement | SVGPolylineElement | SVGRectElement | SVGTextElement | SVGUseElement>;
    pauseAnimations(): void;
    setCurrentTime(seconds: number): void;
    suspendRedraw(maxWaitMilliseconds: number): number;
    unpauseAnimations(): void;
    unsuspendRedraw(suspendHandleID: number): void;
    unsuspendRedrawAll(): void;
    addEventListener(type: "MSGestureChange", listener: (this: this, ev: MSGestureEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSGestureDoubleTap", listener: (this: this, ev: MSGestureEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSGestureEnd", listener: (this: this, ev: MSGestureEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSGestureHold", listener: (this: this, ev: MSGestureEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSGestureStart", listener: (this: this, ev: MSGestureEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSGestureTap", listener: (this: this, ev: MSGestureEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSGotPointerCapture", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSInertiaStart", listener: (this: this, ev: MSGestureEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSLostPointerCapture", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSPointerCancel", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSPointerDown", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSPointerEnter", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSPointerLeave", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSPointerMove", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSPointerOut", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSPointerOver", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSPointerUp", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "SVGAbort", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "SVGError", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "SVGUnload", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "SVGZoom", listener: (this: this, ev: SVGZoomEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "ariarequest", listener: (this: this, ev: AriaRequestEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "click", listener: (this: this, ev: MouseEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "command", listener: (this: this, ev: CommandEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "dblclick", listener: (this: this, ev: MouseEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "focusin", listener: (this: this, ev: FocusEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "focusout", listener: (this: this, ev: FocusEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "gotpointercapture", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "load", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "lostpointercapture", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "mousedown", listener: (this: this, ev: MouseEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "mousemove", listener: (this: this, ev: MouseEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "mouseout", listener: (this: this, ev: MouseEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "mouseover", listener: (this: this, ev: MouseEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "mouseup", listener: (this: this, ev: MouseEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pointercancel", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pointerdown", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pointerenter", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pointerleave", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pointermove", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pointerout", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pointerover", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pointerup", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "resize", listener: (this: this, ev: UIEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "scroll", listener: (this: this, ev: UIEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "touchcancel", listener: (this: this, ev: TouchEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "touchend", listener: (this: this, ev: TouchEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "touchmove", listener: (this: this, ev: TouchEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "touchstart", listener: (this: this, ev: TouchEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "webkitfullscreenchange", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "webkitfullscreenerror", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "wheel", listener: (this: this, ev: WheelEvent) => any, useCapture?: boolean): void;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var SVGSVGElement: {
    prototype: SVGSVGElement;
    new(): SVGSVGElement;
}

interface SVGScriptElement extends SVGElement, SVGExternalResourcesRequired, SVGURIReference {
    type: string;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var SVGScriptElement: {
    prototype: SVGScriptElement;
    new(): SVGScriptElement;
}

interface SVGStopElement extends SVGElement, SVGStylable {
    readonly offset: SVGAnimatedNumber;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var SVGStopElement: {
    prototype: SVGStopElement;
    new(): SVGStopElement;
}

interface SVGStringList {
    readonly numberOfItems: number;
    appendItem(newItem: string): string;
    clear(): void;
    getItem(index: number): string;
    initialize(newItem: string): string;
    insertItemBefore(newItem: string, index: number): string;
    removeItem(index: number): string;
    replaceItem(newItem: string, index: number): string;
}

declare var SVGStringList: {
    prototype: SVGStringList;
    new(): SVGStringList;
}

interface SVGStyleElement extends SVGElement, SVGLangSpace {
    disabled: boolean;
    media: string;
    title: string;
    type: string;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var SVGStyleElement: {
    prototype: SVGStyleElement;
    new(): SVGStyleElement;
}

interface SVGSwitchElement extends SVGElement, SVGStylable, SVGTransformable, SVGTests, SVGLangSpace, SVGExternalResourcesRequired {
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var SVGSwitchElement: {
    prototype: SVGSwitchElement;
    new(): SVGSwitchElement;
}

interface SVGSymbolElement extends SVGElement, SVGStylable, SVGLangSpace, SVGExternalResourcesRequired, SVGFitToViewBox {
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var SVGSymbolElement: {
    prototype: SVGSymbolElement;
    new(): SVGSymbolElement;
}

interface SVGTSpanElement extends SVGTextPositioningElement {
}

declare var SVGTSpanElement: {
    prototype: SVGTSpanElement;
    new(): SVGTSpanElement;
}

interface SVGTextContentElement extends SVGElement, SVGStylable, SVGTests, SVGLangSpace, SVGExternalResourcesRequired {
    readonly lengthAdjust: SVGAnimatedEnumeration;
    readonly textLength: SVGAnimatedLength;
    getCharNumAtPosition(point: SVGPoint): number;
    getComputedTextLength(): number;
    getEndPositionOfChar(charnum: number): SVGPoint;
    getExtentOfChar(charnum: number): SVGRect;
    getNumberOfChars(): number;
    getRotationOfChar(charnum: number): number;
    getStartPositionOfChar(charnum: number): SVGPoint;
    getSubStringLength(charnum: number, nchars: number): number;
    selectSubString(charnum: number, nchars: number): void;
    readonly LENGTHADJUST_SPACING: number;
    readonly LENGTHADJUST_SPACINGANDGLYPHS: number;
    readonly LENGTHADJUST_UNKNOWN: number;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var SVGTextContentElement: {
    prototype: SVGTextContentElement;
    new(): SVGTextContentElement;
    readonly LENGTHADJUST_SPACING: number;
    readonly LENGTHADJUST_SPACINGANDGLYPHS: number;
    readonly LENGTHADJUST_UNKNOWN: number;
}

interface SVGTextElement extends SVGTextPositioningElement, SVGTransformable {
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var SVGTextElement: {
    prototype: SVGTextElement;
    new(): SVGTextElement;
}

interface SVGTextPathElement extends SVGTextContentElement, SVGURIReference {
    readonly method: SVGAnimatedEnumeration;
    readonly spacing: SVGAnimatedEnumeration;
    readonly startOffset: SVGAnimatedLength;
    readonly TEXTPATH_METHODTYPE_ALIGN: number;
    readonly TEXTPATH_METHODTYPE_STRETCH: number;
    readonly TEXTPATH_METHODTYPE_UNKNOWN: number;
    readonly TEXTPATH_SPACINGTYPE_AUTO: number;
    readonly TEXTPATH_SPACINGTYPE_EXACT: number;
    readonly TEXTPATH_SPACINGTYPE_UNKNOWN: number;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var SVGTextPathElement: {
    prototype: SVGTextPathElement;
    new(): SVGTextPathElement;
    readonly TEXTPATH_METHODTYPE_ALIGN: number;
    readonly TEXTPATH_METHODTYPE_STRETCH: number;
    readonly TEXTPATH_METHODTYPE_UNKNOWN: number;
    readonly TEXTPATH_SPACINGTYPE_AUTO: number;
    readonly TEXTPATH_SPACINGTYPE_EXACT: number;
    readonly TEXTPATH_SPACINGTYPE_UNKNOWN: number;
}

interface SVGTextPositioningElement extends SVGTextContentElement {
    readonly dx: SVGAnimatedLengthList;
    readonly dy: SVGAnimatedLengthList;
    readonly rotate: SVGAnimatedNumberList;
    readonly x: SVGAnimatedLengthList;
    readonly y: SVGAnimatedLengthList;
}

declare var SVGTextPositioningElement: {
    prototype: SVGTextPositioningElement;
    new(): SVGTextPositioningElement;
}

interface SVGTitleElement extends SVGElement, SVGStylable, SVGLangSpace {
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var SVGTitleElement: {
    prototype: SVGTitleElement;
    new(): SVGTitleElement;
}

interface SVGTransform {
    readonly angle: number;
    readonly matrix: SVGMatrix;
    readonly type: number;
    setMatrix(matrix: SVGMatrix): void;
    setRotate(angle: number, cx: number, cy: number): void;
    setScale(sx: number, sy: number): void;
    setSkewX(angle: number): void;
    setSkewY(angle: number): void;
    setTranslate(tx: number, ty: number): void;
    readonly SVG_TRANSFORM_MATRIX: number;
    readonly SVG_TRANSFORM_ROTATE: number;
    readonly SVG_TRANSFORM_SCALE: number;
    readonly SVG_TRANSFORM_SKEWX: number;
    readonly SVG_TRANSFORM_SKEWY: number;
    readonly SVG_TRANSFORM_TRANSLATE: number;
    readonly SVG_TRANSFORM_UNKNOWN: number;
}

declare var SVGTransform: {
    prototype: SVGTransform;
    new(): SVGTransform;
    readonly SVG_TRANSFORM_MATRIX: number;
    readonly SVG_TRANSFORM_ROTATE: number;
    readonly SVG_TRANSFORM_SCALE: number;
    readonly SVG_TRANSFORM_SKEWX: number;
    readonly SVG_TRANSFORM_SKEWY: number;
    readonly SVG_TRANSFORM_TRANSLATE: number;
    readonly SVG_TRANSFORM_UNKNOWN: number;
}

interface SVGTransformList {
    readonly numberOfItems: number;
    appendItem(newItem: SVGTransform): SVGTransform;
    clear(): void;
    consolidate(): SVGTransform;
    createSVGTransformFromMatrix(matrix: SVGMatrix): SVGTransform;
    getItem(index: number): SVGTransform;
    initialize(newItem: SVGTransform): SVGTransform;
    insertItemBefore(newItem: SVGTransform, index: number): SVGTransform;
    removeItem(index: number): SVGTransform;
    replaceItem(newItem: SVGTransform, index: number): SVGTransform;
}

declare var SVGTransformList: {
    prototype: SVGTransformList;
    new(): SVGTransformList;
}

interface SVGUnitTypes {
    readonly SVG_UNIT_TYPE_OBJECTBOUNDINGBOX: number;
    readonly SVG_UNIT_TYPE_UNKNOWN: number;
    readonly SVG_UNIT_TYPE_USERSPACEONUSE: number;
}
declare var SVGUnitTypes: SVGUnitTypes;

interface SVGUseElement extends SVGElement, SVGStylable, SVGTransformable, SVGTests, SVGLangSpace, SVGExternalResourcesRequired, SVGURIReference {
    readonly animatedInstanceRoot: SVGElementInstance;
    readonly height: SVGAnimatedLength;
    readonly instanceRoot: SVGElementInstance;
    readonly width: SVGAnimatedLength;
    readonly x: SVGAnimatedLength;
    readonly y: SVGAnimatedLength;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var SVGUseElement: {
    prototype: SVGUseElement;
    new(): SVGUseElement;
}

interface SVGViewElement extends SVGElement, SVGExternalResourcesRequired, SVGFitToViewBox, SVGZoomAndPan {
    readonly viewTarget: SVGStringList;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var SVGViewElement: {
    prototype: SVGViewElement;
    new(): SVGViewElement;
}

interface SVGZoomAndPan {
    readonly zoomAndPan: number;
}

declare var SVGZoomAndPan: {
    readonly SVG_ZOOMANDPAN_DISABLE: number;
    readonly SVG_ZOOMANDPAN_MAGNIFY: number;
    readonly SVG_ZOOMANDPAN_UNKNOWN: number;
}

interface SVGZoomEvent extends UIEvent {
    readonly newScale: number;
    readonly newTranslate: SVGPoint;
    readonly previousScale: number;
    readonly previousTranslate: SVGPoint;
    readonly zoomRectScreen: SVGRect;
}

declare var SVGZoomEvent: {
    prototype: SVGZoomEvent;
    new(): SVGZoomEvent;
}

interface Screen extends EventTarget {
    readonly availHeight: number;
    readonly availWidth: number;
    bufferDepth: number;
    readonly colorDepth: number;
    readonly deviceXDPI: number;
    readonly deviceYDPI: number;
    readonly fontSmoothingEnabled: boolean;
    readonly height: number;
    readonly logicalXDPI: number;
    readonly logicalYDPI: number;
    readonly msOrientation: string;
    onmsorientationchange: (this: this, ev: Event) => any;
    readonly pixelDepth: number;
    readonly systemXDPI: number;
    readonly systemYDPI: number;
    readonly width: number;
    msLockOrientation(orientations: string | string[]): boolean;
    msUnlockOrientation(): void;
    addEventListener(type: "MSOrientationChange", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var Screen: {
    prototype: Screen;
    new(): Screen;
}

interface ScriptNotifyEvent extends Event {
    readonly callingUri: string;
    readonly value: string;
}

declare var ScriptNotifyEvent: {
    prototype: ScriptNotifyEvent;
    new(): ScriptNotifyEvent;
}

interface ScriptProcessorNode extends AudioNode {
    readonly bufferSize: number;
    onaudioprocess: (this: this, ev: AudioProcessingEvent) => any;
    addEventListener(type: "audioprocess", listener: (this: this, ev: AudioProcessingEvent) => any, useCapture?: boolean): void;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var ScriptProcessorNode: {
    prototype: ScriptProcessorNode;
    new(): ScriptProcessorNode;
}

interface Selection {
    readonly anchorNode: Node;
    readonly anchorOffset: number;
    readonly focusNode: Node;
    readonly focusOffset: number;
    readonly isCollapsed: boolean;
    readonly rangeCount: number;
    readonly type: string;
    addRange(range: Range): void;
    collapse(parentNode: Node, offset: number): void;
    collapseToEnd(): void;
    collapseToStart(): void;
    containsNode(node: Node, partlyContained: boolean): boolean;
    deleteFromDocument(): void;
    empty(): void;
    extend(newNode: Node, offset: number): void;
    getRangeAt(index: number): Range;
    removeAllRanges(): void;
    removeRange(range: Range): void;
    selectAllChildren(parentNode: Node): void;
    setBaseAndExtent(baseNode: Node, baseOffset: number, extentNode: Node, extentOffset: number): void;
    toString(): string;
}

declare var Selection: {
    prototype: Selection;
    new(): Selection;
}

interface SourceBuffer extends EventTarget {
    appendWindowEnd: number;
    appendWindowStart: number;
    readonly audioTracks: AudioTrackList;
    readonly buffered: TimeRanges;
    mode: string;
    timestampOffset: number;
    readonly updating: boolean;
    readonly videoTracks: VideoTrackList;
    abort(): void;
    appendBuffer(data: ArrayBuffer | ArrayBufferView): void;
    appendStream(stream: MSStream, maxSize?: number): void;
    remove(start: number, end: number): void;
}

declare var SourceBuffer: {
    prototype: SourceBuffer;
    new(): SourceBuffer;
}

interface SourceBufferList extends EventTarget {
    readonly length: number;
    item(index: number): SourceBuffer;
    [index: number]: SourceBuffer;
}

declare var SourceBufferList: {
    prototype: SourceBufferList;
    new(): SourceBufferList;
}

interface StereoPannerNode extends AudioNode {
    readonly pan: AudioParam;
}

declare var StereoPannerNode: {
    prototype: StereoPannerNode;
    new(): StereoPannerNode;
}

interface Storage {
    readonly length: number;
    clear(): void;
    getItem(key: string): string | null;
    key(index: number): string | null;
    removeItem(key: string): void;
    setItem(key: string, data: string): void;
    [key: string]: any;
    [index: number]: string;
}

declare var Storage: {
    prototype: Storage;
    new(): Storage;
}

interface StorageEvent extends Event {
    readonly url: string;
    key?: string;
    oldValue?: string;
    newValue?: string;
    storageArea?: Storage;
}

declare var StorageEvent: {
    prototype: StorageEvent;
    new (type: string, eventInitDict?: StorageEventInit): StorageEvent;
}

interface StyleMedia {
    readonly type: string;
    matchMedium(mediaquery: string): boolean;
}

declare var StyleMedia: {
    prototype: StyleMedia;
    new(): StyleMedia;
}

interface StyleSheet {
    disabled: boolean;
    readonly href: string;
    readonly media: MediaList;
    readonly ownerNode: Node;
    readonly parentStyleSheet: StyleSheet;
    readonly title: string;
    readonly type: string;
}

declare var StyleSheet: {
    prototype: StyleSheet;
    new(): StyleSheet;
}

interface StyleSheetList {
    readonly length: number;
    item(index?: number): StyleSheet;
    [index: number]: StyleSheet;
}

declare var StyleSheetList: {
    prototype: StyleSheetList;
    new(): StyleSheetList;
}

interface StyleSheetPageList {
    readonly length: number;
    item(index: number): CSSPageRule;
    [index: number]: CSSPageRule;
}

declare var StyleSheetPageList: {
    prototype: StyleSheetPageList;
    new(): StyleSheetPageList;
}

interface SubtleCrypto {
    decrypt(algorithm: string | RsaOaepParams | AesCtrParams | AesCbcParams | AesCmacParams | AesGcmParams | AesCfbParams, key: CryptoKey, data: BufferSource): PromiseLike<ArrayBuffer>;
    deriveBits(algorithm: string | EcdhKeyDeriveParams | DhKeyDeriveParams | ConcatParams | HkdfCtrParams | Pbkdf2Params, baseKey: CryptoKey, length: number): PromiseLike<ArrayBuffer>;
    deriveKey(algorithm: string | EcdhKeyDeriveParams | DhKeyDeriveParams | ConcatParams | HkdfCtrParams | Pbkdf2Params, baseKey: CryptoKey, derivedKeyType: string | AesDerivedKeyParams | HmacImportParams | ConcatParams | HkdfCtrParams | Pbkdf2Params, extractable: boolean, keyUsages: string[]): PromiseLike<CryptoKey>;
    digest(algorithm: AlgorithmIdentifier, data: BufferSource): PromiseLike<ArrayBuffer>;
    encrypt(algorithm: string | RsaOaepParams | AesCtrParams | AesCbcParams | AesCmacParams | AesGcmParams | AesCfbParams, key: CryptoKey, data: BufferSource): PromiseLike<ArrayBuffer>;
    exportKey(format: "jwk", key: CryptoKey): PromiseLike<JsonWebKey>;
    exportKey(format: "raw" | "pkcs8" | "spki", key: CryptoKey): PromiseLike<ArrayBuffer>;
    exportKey(format: string, key: CryptoKey): PromiseLike<JsonWebKey | ArrayBuffer>;
    generateKey(algorithm: string, extractable: boolean, keyUsages: string[]): PromiseLike<CryptoKeyPair | CryptoKey>;
    generateKey(algorithm: RsaHashedKeyGenParams | EcKeyGenParams | DhKeyGenParams, extractable: boolean, keyUsages: string[]): PromiseLike<CryptoKeyPair>;
    generateKey(algorithm: AesKeyGenParams | HmacKeyGenParams | Pbkdf2Params, extractable: boolean, keyUsages: string[]): PromiseLike<CryptoKey>;
    importKey(format: "jwk", keyData: JsonWebKey, algorithm: string | RsaHashedImportParams | EcKeyImportParams | HmacImportParams | DhImportKeyParams, extractable:boolean, keyUsages: string[]): PromiseLike<CryptoKey>;
    importKey(format: "raw" | "pkcs8" | "spki", keyData: BufferSource, algorithm: string | RsaHashedImportParams | EcKeyImportParams | HmacImportParams | DhImportKeyParams, extractable:boolean, keyUsages: string[]): PromiseLike<CryptoKey>;
    importKey(format: string, keyData: JsonWebKey | BufferSource, algorithm: string | RsaHashedImportParams | EcKeyImportParams | HmacImportParams | DhImportKeyParams, extractable:boolean, keyUsages: string[]): PromiseLike<CryptoKey>;
    sign(algorithm: string | RsaPssParams | EcdsaParams | AesCmacParams, key: CryptoKey, data: BufferSource): PromiseLike<ArrayBuffer>;
    unwrapKey(format: string, wrappedKey: BufferSource, unwrappingKey: CryptoKey, unwrapAlgorithm: AlgorithmIdentifier, unwrappedKeyAlgorithm: AlgorithmIdentifier, extractable: boolean, keyUsages: string[]): PromiseLike<CryptoKey>;
    verify(algorithm: string | RsaPssParams | EcdsaParams | AesCmacParams, key: CryptoKey, signature: BufferSource, data: BufferSource): PromiseLike<boolean>;
    wrapKey(format: string, key: CryptoKey, wrappingKey: CryptoKey, wrapAlgorithm: AlgorithmIdentifier): PromiseLike<ArrayBuffer>;
}

declare var SubtleCrypto: {
    prototype: SubtleCrypto;
    new(): SubtleCrypto;
}

interface Text extends CharacterData {
    readonly wholeText: string;
    splitText(offset: number): Text;
}

declare var Text: {
    prototype: Text;
    new(): Text;
}

interface TextEvent extends UIEvent {
    readonly data: string;
    readonly inputMethod: number;
    readonly locale: string;
    initTextEvent(typeArg: string, canBubbleArg: boolean, cancelableArg: boolean, viewArg: Window, dataArg: string, inputMethod: number, locale: string): void;
    readonly DOM_INPUT_METHOD_DROP: number;
    readonly DOM_INPUT_METHOD_HANDWRITING: number;
    readonly DOM_INPUT_METHOD_IME: number;
    readonly DOM_INPUT_METHOD_KEYBOARD: number;
    readonly DOM_INPUT_METHOD_MULTIMODAL: number;
    readonly DOM_INPUT_METHOD_OPTION: number;
    readonly DOM_INPUT_METHOD_PASTE: number;
    readonly DOM_INPUT_METHOD_SCRIPT: number;
    readonly DOM_INPUT_METHOD_UNKNOWN: number;
    readonly DOM_INPUT_METHOD_VOICE: number;
}

declare var TextEvent: {
    prototype: TextEvent;
    new(): TextEvent;
    readonly DOM_INPUT_METHOD_DROP: number;
    readonly DOM_INPUT_METHOD_HANDWRITING: number;
    readonly DOM_INPUT_METHOD_IME: number;
    readonly DOM_INPUT_METHOD_KEYBOARD: number;
    readonly DOM_INPUT_METHOD_MULTIMODAL: number;
    readonly DOM_INPUT_METHOD_OPTION: number;
    readonly DOM_INPUT_METHOD_PASTE: number;
    readonly DOM_INPUT_METHOD_SCRIPT: number;
    readonly DOM_INPUT_METHOD_UNKNOWN: number;
    readonly DOM_INPUT_METHOD_VOICE: number;
}

interface TextMetrics {
    readonly width: number;
}

declare var TextMetrics: {
    prototype: TextMetrics;
    new(): TextMetrics;
}

interface TextTrack extends EventTarget {
    readonly activeCues: TextTrackCueList;
    readonly cues: TextTrackCueList;
    readonly inBandMetadataTrackDispatchType: string;
    readonly kind: string;
    readonly label: string;
    readonly language: string;
    mode: any;
    oncuechange: (this: this, ev: Event) => any;
    onerror: (this: this, ev: ErrorEvent) => any;
    onload: (this: this, ev: Event) => any;
    readonly readyState: number;
    addCue(cue: TextTrackCue): void;
    removeCue(cue: TextTrackCue): void;
    readonly DISABLED: number;
    readonly ERROR: number;
    readonly HIDDEN: number;
    readonly LOADED: number;
    readonly LOADING: number;
    readonly NONE: number;
    readonly SHOWING: number;
    addEventListener(type: "cuechange", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "error", listener: (this: this, ev: ErrorEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "load", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var TextTrack: {
    prototype: TextTrack;
    new(): TextTrack;
    readonly DISABLED: number;
    readonly ERROR: number;
    readonly HIDDEN: number;
    readonly LOADED: number;
    readonly LOADING: number;
    readonly NONE: number;
    readonly SHOWING: number;
}

interface TextTrackCue extends EventTarget {
    endTime: number;
    id: string;
    onenter: (this: this, ev: Event) => any;
    onexit: (this: this, ev: Event) => any;
    pauseOnExit: boolean;
    startTime: number;
    text: string;
    readonly track: TextTrack;
    getCueAsHTML(): DocumentFragment;
    addEventListener(type: "enter", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "exit", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var TextTrackCue: {
    prototype: TextTrackCue;
    new(startTime: number, endTime: number, text: string): TextTrackCue;
}

interface TextTrackCueList {
    readonly length: number;
    getCueById(id: string): TextTrackCue;
    item(index: number): TextTrackCue;
    [index: number]: TextTrackCue;
}

declare var TextTrackCueList: {
    prototype: TextTrackCueList;
    new(): TextTrackCueList;
}

interface TextTrackList extends EventTarget {
    readonly length: number;
    onaddtrack: ((this: this, ev: TrackEvent) => any) | null;
    item(index: number): TextTrack;
    addEventListener(type: "addtrack", listener: (this: this, ev: TrackEvent) => any, useCapture?: boolean): void;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
    [index: number]: TextTrack;
}

declare var TextTrackList: {
    prototype: TextTrackList;
    new(): TextTrackList;
}

interface TimeRanges {
    readonly length: number;
    end(index: number): number;
    start(index: number): number;
}

declare var TimeRanges: {
    prototype: TimeRanges;
    new(): TimeRanges;
}

interface Touch {
    readonly clientX: number;
    readonly clientY: number;
    readonly identifier: number;
    readonly pageX: number;
    readonly pageY: number;
    readonly screenX: number;
    readonly screenY: number;
    readonly target: EventTarget;
}

declare var Touch: {
    prototype: Touch;
    new(): Touch;
}

interface TouchEvent extends UIEvent {
    readonly altKey: boolean;
    readonly changedTouches: TouchList;
    readonly ctrlKey: boolean;
    readonly metaKey: boolean;
    readonly shiftKey: boolean;
    readonly targetTouches: TouchList;
    readonly touches: TouchList;
}

declare var TouchEvent: {
    prototype: TouchEvent;
    new(): TouchEvent;
}

interface TouchList {
    readonly length: number;
    item(index: number): Touch | null;
    [index: number]: Touch;
}

declare var TouchList: {
    prototype: TouchList;
    new(): TouchList;
}

interface TrackEvent extends Event {
    readonly track: any;
}

declare var TrackEvent: {
    prototype: TrackEvent;
    new(): TrackEvent;
}

interface TransitionEvent extends Event {
    readonly elapsedTime: number;
    readonly propertyName: string;
    initTransitionEvent(typeArg: string, canBubbleArg: boolean, cancelableArg: boolean, propertyNameArg: string, elapsedTimeArg: number): void;
}

declare var TransitionEvent: {
    prototype: TransitionEvent;
    new(): TransitionEvent;
}

interface TreeWalker {
    currentNode: Node;
    readonly expandEntityReferences: boolean;
    readonly filter: NodeFilter;
    readonly root: Node;
    readonly whatToShow: number;
    firstChild(): Node;
    lastChild(): Node;
    nextNode(): Node;
    nextSibling(): Node;
    parentNode(): Node;
    previousNode(): Node;
    previousSibling(): Node;
}

declare var TreeWalker: {
    prototype: TreeWalker;
    new(): TreeWalker;
}

interface UIEvent extends Event {
    readonly detail: number;
    readonly view: Window;
    initUIEvent(typeArg: string, canBubbleArg: boolean, cancelableArg: boolean, viewArg: Window, detailArg: number): void;
}

declare var UIEvent: {
    prototype: UIEvent;
    new(type: string, eventInitDict?: UIEventInit): UIEvent;
}

interface URL {
    hash: string;
    host: string;
    hostname: string;
    href: string;
    readonly origin: string;
    password: string;
    pathname: string;
    port: string;
    protocol: string;
    search: string;
    username: string;
    toString(): string;
}

declare var URL: {
    prototype: URL;
    new(url: string, base?: string): URL;
    createObjectURL(object: any, options?: ObjectURLOptions): string;
    revokeObjectURL(url: string): void;
}

interface UnviewableContentIdentifiedEvent extends NavigationEventWithReferrer {
    readonly mediaType: string;
}

declare var UnviewableContentIdentifiedEvent: {
    prototype: UnviewableContentIdentifiedEvent;
    new(): UnviewableContentIdentifiedEvent;
}

interface ValidityState {
    readonly badInput: boolean;
    readonly customError: boolean;
    readonly patternMismatch: boolean;
    readonly rangeOverflow: boolean;
    readonly rangeUnderflow: boolean;
    readonly stepMismatch: boolean;
    readonly tooLong: boolean;
    readonly typeMismatch: boolean;
    readonly valid: boolean;
    readonly valueMissing: boolean;
}

declare var ValidityState: {
    prototype: ValidityState;
    new(): ValidityState;
}

interface VideoPlaybackQuality {
    readonly corruptedVideoFrames: number;
    readonly creationTime: number;
    readonly droppedVideoFrames: number;
    readonly totalFrameDelay: number;
    readonly totalVideoFrames: number;
}

declare var VideoPlaybackQuality: {
    prototype: VideoPlaybackQuality;
    new(): VideoPlaybackQuality;
}

interface VideoTrack {
    readonly id: string;
    kind: string;
    readonly label: string;
    language: string;
    selected: boolean;
    readonly sourceBuffer: SourceBuffer;
}

declare var VideoTrack: {
    prototype: VideoTrack;
    new(): VideoTrack;
}

interface VideoTrackList extends EventTarget {
    readonly length: number;
    onaddtrack: (this: this, ev: TrackEvent) => any;
    onchange: (this: this, ev: Event) => any;
    onremovetrack: (this: this, ev: TrackEvent) => any;
    readonly selectedIndex: number;
    getTrackById(id: string): VideoTrack | null;
    item(index: number): VideoTrack;
    addEventListener(type: "addtrack", listener: (this: this, ev: TrackEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "change", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "removetrack", listener: (this: this, ev: TrackEvent) => any, useCapture?: boolean): void;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
    [index: number]: VideoTrack;
}

declare var VideoTrackList: {
    prototype: VideoTrackList;
    new(): VideoTrackList;
}

interface WEBGL_compressed_texture_s3tc {
    readonly COMPRESSED_RGBA_S3TC_DXT1_EXT: number;
    readonly COMPRESSED_RGBA_S3TC_DXT3_EXT: number;
    readonly COMPRESSED_RGBA_S3TC_DXT5_EXT: number;
    readonly COMPRESSED_RGB_S3TC_DXT1_EXT: number;
}

declare var WEBGL_compressed_texture_s3tc: {
    prototype: WEBGL_compressed_texture_s3tc;
    new(): WEBGL_compressed_texture_s3tc;
    readonly COMPRESSED_RGBA_S3TC_DXT1_EXT: number;
    readonly COMPRESSED_RGBA_S3TC_DXT3_EXT: number;
    readonly COMPRESSED_RGBA_S3TC_DXT5_EXT: number;
    readonly COMPRESSED_RGB_S3TC_DXT1_EXT: number;
}

interface WEBGL_debug_renderer_info {
    readonly UNMASKED_RENDERER_WEBGL: number;
    readonly UNMASKED_VENDOR_WEBGL: number;
}

declare var WEBGL_debug_renderer_info: {
    prototype: WEBGL_debug_renderer_info;
    new(): WEBGL_debug_renderer_info;
    readonly UNMASKED_RENDERER_WEBGL: number;
    readonly UNMASKED_VENDOR_WEBGL: number;
}

interface WEBGL_depth_texture {
    readonly UNSIGNED_INT_24_8_WEBGL: number;
}

declare var WEBGL_depth_texture: {
    prototype: WEBGL_depth_texture;
    new(): WEBGL_depth_texture;
    readonly UNSIGNED_INT_24_8_WEBGL: number;
}

interface WaveShaperNode extends AudioNode {
    curve: Float32Array | null;
    oversample: string;
}

declare var WaveShaperNode: {
    prototype: WaveShaperNode;
    new(): WaveShaperNode;
}

interface WebGLActiveInfo {
    readonly name: string;
    readonly size: number;
    readonly type: number;
}

declare var WebGLActiveInfo: {
    prototype: WebGLActiveInfo;
    new(): WebGLActiveInfo;
}

interface WebGLBuffer extends WebGLObject {
}

declare var WebGLBuffer: {
    prototype: WebGLBuffer;
    new(): WebGLBuffer;
}

interface WebGLContextEvent extends Event {
    readonly statusMessage: string;
}

declare var WebGLContextEvent: {
    prototype: WebGLContextEvent;
    new(type: string, eventInitDict?: WebGLContextEventInit): WebGLContextEvent;
}

interface WebGLFramebuffer extends WebGLObject {
}

declare var WebGLFramebuffer: {
    prototype: WebGLFramebuffer;
    new(): WebGLFramebuffer;
}

interface WebGLObject {
}

declare var WebGLObject: {
    prototype: WebGLObject;
    new(): WebGLObject;
}

interface WebGLProgram extends WebGLObject {
}

declare var WebGLProgram: {
    prototype: WebGLProgram;
    new(): WebGLProgram;
}

interface WebGLRenderbuffer extends WebGLObject {
}

declare var WebGLRenderbuffer: {
    prototype: WebGLRenderbuffer;
    new(): WebGLRenderbuffer;
}

interface WebGLRenderingContext {
    readonly canvas: HTMLCanvasElement;
    readonly drawingBufferHeight: number;
    readonly drawingBufferWidth: number;
    activeTexture(texture: number): void;
    attachShader(program: WebGLProgram | null, shader: WebGLShader | null): void;
    bindAttribLocation(program: WebGLProgram | null, index: number, name: string): void;
    bindBuffer(target: number, buffer: WebGLBuffer | null): void;
    bindFramebuffer(target: number, framebuffer: WebGLFramebuffer | null): void;
    bindRenderbuffer(target: number, renderbuffer: WebGLRenderbuffer | null): void;
    bindTexture(target: number, texture: WebGLTexture | null): void;
    blendColor(red: number, green: number, blue: number, alpha: number): void;
    blendEquation(mode: number): void;
    blendEquationSeparate(modeRGB: number, modeAlpha: number): void;
    blendFunc(sfactor: number, dfactor: number): void;
    blendFuncSeparate(srcRGB: number, dstRGB: number, srcAlpha: number, dstAlpha: number): void;
    bufferData(target: number, size: number | ArrayBufferView | ArrayBuffer, usage: number): void;
    bufferSubData(target: number, offset: number, data: ArrayBufferView | ArrayBuffer): void;
    checkFramebufferStatus(target: number): number;
    clear(mask: number): void;
    clearColor(red: number, green: number, blue: number, alpha: number): void;
    clearDepth(depth: number): void;
    clearStencil(s: number): void;
    colorMask(red: boolean, green: boolean, blue: boolean, alpha: boolean): void;
    compileShader(shader: WebGLShader | null): void;
    compressedTexImage2D(target: number, level: number, internalformat: number, width: number, height: number, border: number, data: ArrayBufferView): void;
    compressedTexSubImage2D(target: number, level: number, xoffset: number, yoffset: number, width: number, height: number, format: number, data: ArrayBufferView): void;
    copyTexImage2D(target: number, level: number, internalformat: number, x: number, y: number, width: number, height: number, border: number): void;
    copyTexSubImage2D(target: number, level: number, xoffset: number, yoffset: number, x: number, y: number, width: number, height: number): void;
    createBuffer(): WebGLBuffer | null;
    createFramebuffer(): WebGLFramebuffer | null;
    createProgram(): WebGLProgram | null;
    createRenderbuffer(): WebGLRenderbuffer | null;
    createShader(type: number): WebGLShader | null;
    createTexture(): WebGLTexture | null;
    cullFace(mode: number): void;
    deleteBuffer(buffer: WebGLBuffer | null): void;
    deleteFramebuffer(framebuffer: WebGLFramebuffer | null): void;
    deleteProgram(program: WebGLProgram | null): void;
    deleteRenderbuffer(renderbuffer: WebGLRenderbuffer | null): void;
    deleteShader(shader: WebGLShader | null): void;
    deleteTexture(texture: WebGLTexture | null): void;
    depthFunc(func: number): void;
    depthMask(flag: boolean): void;
    depthRange(zNear: number, zFar: number): void;
    detachShader(program: WebGLProgram | null, shader: WebGLShader | null): void;
    disable(cap: number): void;
    disableVertexAttribArray(index: number): void;
    drawArrays(mode: number, first: number, count: number): void;
    drawElements(mode: number, count: number, type: number, offset: number): void;
    enable(cap: number): void;
    enableVertexAttribArray(index: number): void;
    finish(): void;
    flush(): void;
    framebufferRenderbuffer(target: number, attachment: number, renderbuffertarget: number, renderbuffer: WebGLRenderbuffer | null): void;
    framebufferTexture2D(target: number, attachment: number, textarget: number, texture: WebGLTexture | null, level: number): void;
    frontFace(mode: number): void;
    generateMipmap(target: number): void;
    getActiveAttrib(program: WebGLProgram | null, index: number): WebGLActiveInfo | null;
    getActiveUniform(program: WebGLProgram | null, index: number): WebGLActiveInfo | null;
    getAttachedShaders(program: WebGLProgram | null): WebGLShader[] | null;
    getAttribLocation(program: WebGLProgram | null, name: string): number;
    getBufferParameter(target: number, pname: number): any;
    getContextAttributes(): WebGLContextAttributes;
    getError(): number;
    getExtension(name: string): any;
    getFramebufferAttachmentParameter(target: number, attachment: number, pname: number): any;
    getParameter(pname: number): any;
    getProgramInfoLog(program: WebGLProgram | null): string | null;
    getProgramParameter(program: WebGLProgram | null, pname: number): any;
    getRenderbufferParameter(target: number, pname: number): any;
    getShaderInfoLog(shader: WebGLShader | null): string | null;
    getShaderParameter(shader: WebGLShader | null, pname: number): any;
    getShaderPrecisionFormat(shadertype: number, precisiontype: number): WebGLShaderPrecisionFormat | null;
    getShaderSource(shader: WebGLShader | null): string | null;
    getSupportedExtensions(): string[] | null;
    getTexParameter(target: number, pname: number): any;
    getUniform(program: WebGLProgram | null, location: WebGLUniformLocation | null): any;
    getUniformLocation(program: WebGLProgram | null, name: string): WebGLUniformLocation | null;
    getVertexAttrib(index: number, pname: number): any;
    getVertexAttribOffset(index: number, pname: number): number;
    hint(target: number, mode: number): void;
    isBuffer(buffer: WebGLBuffer | null): boolean;
    isContextLost(): boolean;
    isEnabled(cap: number): boolean;
    isFramebuffer(framebuffer: WebGLFramebuffer | null): boolean;
    isProgram(program: WebGLProgram | null): boolean;
    isRenderbuffer(renderbuffer: WebGLRenderbuffer | null): boolean;
    isShader(shader: WebGLShader | null): boolean;
    isTexture(texture: WebGLTexture | null): boolean;
    lineWidth(width: number): void;
    linkProgram(program: WebGLProgram | null): void;
    pixelStorei(pname: number, param: number): void;
    polygonOffset(factor: number, units: number): void;
    readPixels(x: number, y: number, width: number, height: number, format: number, type: number, pixels: ArrayBufferView | null): void;
    renderbufferStorage(target: number, internalformat: number, width: number, height: number): void;
    sampleCoverage(value: number, invert: boolean): void;
    scissor(x: number, y: number, width: number, height: number): void;
    shaderSource(shader: WebGLShader | null, source: string): void;
    stencilFunc(func: number, ref: number, mask: number): void;
    stencilFuncSeparate(face: number, func: number, ref: number, mask: number): void;
    stencilMask(mask: number): void;
    stencilMaskSeparate(face: number, mask: number): void;
    stencilOp(fail: number, zfail: number, zpass: number): void;
    stencilOpSeparate(face: number, fail: number, zfail: number, zpass: number): void;
    texImage2D(target: number, level: number, internalformat: number, width: number, height: number, border: number, format: number, type: number, pixels?: ArrayBufferView): void;
    texImage2D(target: number, level: number, internalformat: number, format: number, type: number, pixels?: ImageData | HTMLVideoElement | HTMLImageElement | HTMLCanvasElement): void;
    texParameterf(target: number, pname: number, param: number): void;
    texParameteri(target: number, pname: number, param: number): void;
    texSubImage2D(target: number, level: number, xoffset: number, yoffset: number, width: number, height: number, format: number, type: number, pixels?: ArrayBufferView): void;
    texSubImage2D(target: number, level: number, xoffset: number, yoffset: number, format: number, type: number, pixels?: ImageData | HTMLVideoElement | HTMLImageElement | HTMLCanvasElement): void;
    uniform1f(location: WebGLUniformLocation | null, x: number): void;
    uniform1fv(location: WebGLUniformLocation, v: Float32Array | number[]): void;
    uniform1i(location: WebGLUniformLocation | null, x: number): void;
    uniform1iv(location: WebGLUniformLocation, v: Int32Array | number[]): void;
    uniform2f(location: WebGLUniformLocation | null, x: number, y: number): void;
    uniform2fv(location: WebGLUniformLocation, v: Float32Array | number[]): void;
    uniform2i(location: WebGLUniformLocation | null, x: number, y: number): void;
    uniform2iv(location: WebGLUniformLocation, v: Int32Array | number[]): void;
    uniform3f(location: WebGLUniformLocation | null, x: number, y: number, z: number): void;
    uniform3fv(location: WebGLUniformLocation, v: Float32Array | number[]): void;
    uniform3i(location: WebGLUniformLocation | null, x: number, y: number, z: number): void;
    uniform3iv(location: WebGLUniformLocation, v: Int32Array | number[]): void;
    uniform4f(location: WebGLUniformLocation | null, x: number, y: number, z: number, w: number): void;
    uniform4fv(location: WebGLUniformLocation, v: Float32Array | number[]): void;
    uniform4i(location: WebGLUniformLocation | null, x: number, y: number, z: number, w: number): void;
    uniform4iv(location: WebGLUniformLocation, v: Int32Array | number[]): void;
    uniformMatrix2fv(location: WebGLUniformLocation, transpose: boolean, value: Float32Array | number[]): void;
    uniformMatrix3fv(location: WebGLUniformLocation, transpose: boolean, value: Float32Array | number[]): void;
    uniformMatrix4fv(location: WebGLUniformLocation, transpose: boolean, value: Float32Array | number[]): void;
    useProgram(program: WebGLProgram | null): void;
    validateProgram(program: WebGLProgram | null): void;
    vertexAttrib1f(indx: number, x: number): void;
    vertexAttrib1fv(indx: number, values: Float32Array | number[]): void;
    vertexAttrib2f(indx: number, x: number, y: number): void;
    vertexAttrib2fv(indx: number, values: Float32Array | number[]): void;
    vertexAttrib3f(indx: number, x: number, y: number, z: number): void;
    vertexAttrib3fv(indx: number, values: Float32Array | number[]): void;
    vertexAttrib4f(indx: number, x: number, y: number, z: number, w: number): void;
    vertexAttrib4fv(indx: number, values: Float32Array | number[]): void;
    vertexAttribPointer(indx: number, size: number, type: number, normalized: boolean, stride: number, offset: number): void;
    viewport(x: number, y: number, width: number, height: number): void;
    readonly ACTIVE_ATTRIBUTES: number;
    readonly ACTIVE_TEXTURE: number;
    readonly ACTIVE_UNIFORMS: number;
    readonly ALIASED_LINE_WIDTH_RANGE: number;
    readonly ALIASED_POINT_SIZE_RANGE: number;
    readonly ALPHA: number;
    readonly ALPHA_BITS: number;
    readonly ALWAYS: number;
    readonly ARRAY_BUFFER: number;
    readonly ARRAY_BUFFER_BINDING: number;
    readonly ATTACHED_SHADERS: number;
    readonly BACK: number;
    readonly BLEND: number;
    readonly BLEND_COLOR: number;
    readonly BLEND_DST_ALPHA: number;
    readonly BLEND_DST_RGB: number;
    readonly BLEND_EQUATION: number;
    readonly BLEND_EQUATION_ALPHA: number;
    readonly BLEND_EQUATION_RGB: number;
    readonly BLEND_SRC_ALPHA: number;
    readonly BLEND_SRC_RGB: number;
    readonly BLUE_BITS: number;
    readonly BOOL: number;
    readonly BOOL_VEC2: number;
    readonly BOOL_VEC3: number;
    readonly BOOL_VEC4: number;
    readonly BROWSER_DEFAULT_WEBGL: number;
    readonly BUFFER_SIZE: number;
    readonly BUFFER_USAGE: number;
    readonly BYTE: number;
    readonly CCW: number;
    readonly CLAMP_TO_EDGE: number;
    readonly COLOR_ATTACHMENT0: number;
    readonly COLOR_BUFFER_BIT: number;
    readonly COLOR_CLEAR_VALUE: number;
    readonly COLOR_WRITEMASK: number;
    readonly COMPILE_STATUS: number;
    readonly COMPRESSED_TEXTURE_FORMATS: number;
    readonly CONSTANT_ALPHA: number;
    readonly CONSTANT_COLOR: number;
    readonly CONTEXT_LOST_WEBGL: number;
    readonly CULL_FACE: number;
    readonly CULL_FACE_MODE: number;
    readonly CURRENT_PROGRAM: number;
    readonly CURRENT_VERTEX_ATTRIB: number;
    readonly CW: number;
    readonly DECR: number;
    readonly DECR_WRAP: number;
    readonly DELETE_STATUS: number;
    readonly DEPTH_ATTACHMENT: number;
    readonly DEPTH_BITS: number;
    readonly DEPTH_BUFFER_BIT: number;
    readonly DEPTH_CLEAR_VALUE: number;
    readonly DEPTH_COMPONENT: number;
    readonly DEPTH_COMPONENT16: number;
    readonly DEPTH_FUNC: number;
    readonly DEPTH_RANGE: number;
    readonly DEPTH_STENCIL: number;
    readonly DEPTH_STENCIL_ATTACHMENT: number;
    readonly DEPTH_TEST: number;
    readonly DEPTH_WRITEMASK: number;
    readonly DITHER: number;
    readonly DONT_CARE: number;
    readonly DST_ALPHA: number;
    readonly DST_COLOR: number;
    readonly DYNAMIC_DRAW: number;
    readonly ELEMENT_ARRAY_BUFFER: number;
    readonly ELEMENT_ARRAY_BUFFER_BINDING: number;
    readonly EQUAL: number;
    readonly FASTEST: number;
    readonly FLOAT: number;
    readonly FLOAT_MAT2: number;
    readonly FLOAT_MAT3: number;
    readonly FLOAT_MAT4: number;
    readonly FLOAT_VEC2: number;
    readonly FLOAT_VEC3: number;
    readonly FLOAT_VEC4: number;
    readonly FRAGMENT_SHADER: number;
    readonly FRAMEBUFFER: number;
    readonly FRAMEBUFFER_ATTACHMENT_OBJECT_NAME: number;
    readonly FRAMEBUFFER_ATTACHMENT_OBJECT_TYPE: number;
    readonly FRAMEBUFFER_ATTACHMENT_TEXTURE_CUBE_MAP_FACE: number;
    readonly FRAMEBUFFER_ATTACHMENT_TEXTURE_LEVEL: number;
    readonly FRAMEBUFFER_BINDING: number;
    readonly FRAMEBUFFER_COMPLETE: number;
    readonly FRAMEBUFFER_INCOMPLETE_ATTACHMENT: number;
    readonly FRAMEBUFFER_INCOMPLETE_DIMENSIONS: number;
    readonly FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT: number;
    readonly FRAMEBUFFER_UNSUPPORTED: number;
    readonly FRONT: number;
    readonly FRONT_AND_BACK: number;
    readonly FRONT_FACE: number;
    readonly FUNC_ADD: number;
    readonly FUNC_REVERSE_SUBTRACT: number;
    readonly FUNC_SUBTRACT: number;
    readonly GENERATE_MIPMAP_HINT: number;
    readonly GEQUAL: number;
    readonly GREATER: number;
    readonly GREEN_BITS: number;
    readonly HIGH_FLOAT: number;
    readonly HIGH_INT: number;
    readonly IMPLEMENTATION_COLOR_READ_FORMAT: number;
    readonly IMPLEMENTATION_COLOR_READ_TYPE: number;
    readonly INCR: number;
    readonly INCR_WRAP: number;
    readonly INT: number;
    readonly INT_VEC2: number;
    readonly INT_VEC3: number;
    readonly INT_VEC4: number;
    readonly INVALID_ENUM: number;
    readonly INVALID_FRAMEBUFFER_OPERATION: number;
    readonly INVALID_OPERATION: number;
    readonly INVALID_VALUE: number;
    readonly INVERT: number;
    readonly KEEP: number;
    readonly LEQUAL: number;
    readonly LESS: number;
    readonly LINEAR: number;
    readonly LINEAR_MIPMAP_LINEAR: number;
    readonly LINEAR_MIPMAP_NEAREST: number;
    readonly LINES: number;
    readonly LINE_LOOP: number;
    readonly LINE_STRIP: number;
    readonly LINE_WIDTH: number;
    readonly LINK_STATUS: number;
    readonly LOW_FLOAT: number;
    readonly LOW_INT: number;
    readonly LUMINANCE: number;
    readonly LUMINANCE_ALPHA: number;
    readonly MAX_COMBINED_TEXTURE_IMAGE_UNITS: number;
    readonly MAX_CUBE_MAP_TEXTURE_SIZE: number;
    readonly MAX_FRAGMENT_UNIFORM_VECTORS: number;
    readonly MAX_RENDERBUFFER_SIZE: number;
    readonly MAX_TEXTURE_IMAGE_UNITS: number;
    readonly MAX_TEXTURE_SIZE: number;
    readonly MAX_VARYING_VECTORS: number;
    readonly MAX_VERTEX_ATTRIBS: number;
    readonly MAX_VERTEX_TEXTURE_IMAGE_UNITS: number;
    readonly MAX_VERTEX_UNIFORM_VECTORS: number;
    readonly MAX_VIEWPORT_DIMS: number;
    readonly MEDIUM_FLOAT: number;
    readonly MEDIUM_INT: number;
    readonly MIRRORED_REPEAT: number;
    readonly NEAREST: number;
    readonly NEAREST_MIPMAP_LINEAR: number;
    readonly NEAREST_MIPMAP_NEAREST: number;
    readonly NEVER: number;
    readonly NICEST: number;
    readonly NONE: number;
    readonly NOTEQUAL: number;
    readonly NO_ERROR: number;
    readonly ONE: number;
    readonly ONE_MINUS_CONSTANT_ALPHA: number;
    readonly ONE_MINUS_CONSTANT_COLOR: number;
    readonly ONE_MINUS_DST_ALPHA: number;
    readonly ONE_MINUS_DST_COLOR: number;
    readonly ONE_MINUS_SRC_ALPHA: number;
    readonly ONE_MINUS_SRC_COLOR: number;
    readonly OUT_OF_MEMORY: number;
    readonly PACK_ALIGNMENT: number;
    readonly POINTS: number;
    readonly POLYGON_OFFSET_FACTOR: number;
    readonly POLYGON_OFFSET_FILL: number;
    readonly POLYGON_OFFSET_UNITS: number;
    readonly RED_BITS: number;
    readonly RENDERBUFFER: number;
    readonly RENDERBUFFER_ALPHA_SIZE: number;
    readonly RENDERBUFFER_BINDING: number;
    readonly RENDERBUFFER_BLUE_SIZE: number;
    readonly RENDERBUFFER_DEPTH_SIZE: number;
    readonly RENDERBUFFER_GREEN_SIZE: number;
    readonly RENDERBUFFER_HEIGHT: number;
    readonly RENDERBUFFER_INTERNAL_FORMAT: number;
    readonly RENDERBUFFER_RED_SIZE: number;
    readonly RENDERBUFFER_STENCIL_SIZE: number;
    readonly RENDERBUFFER_WIDTH: number;
    readonly RENDERER: number;
    readonly REPEAT: number;
    readonly REPLACE: number;
    readonly RGB: number;
    readonly RGB565: number;
    readonly RGB5_A1: number;
    readonly RGBA: number;
    readonly RGBA4: number;
    readonly SAMPLER_2D: number;
    readonly SAMPLER_CUBE: number;
    readonly SAMPLES: number;
    readonly SAMPLE_ALPHA_TO_COVERAGE: number;
    readonly SAMPLE_BUFFERS: number;
    readonly SAMPLE_COVERAGE: number;
    readonly SAMPLE_COVERAGE_INVERT: number;
    readonly SAMPLE_COVERAGE_VALUE: number;
    readonly SCISSOR_BOX: number;
    readonly SCISSOR_TEST: number;
    readonly SHADER_TYPE: number;
    readonly SHADING_LANGUAGE_VERSION: number;
    readonly SHORT: number;
    readonly SRC_ALPHA: number;
    readonly SRC_ALPHA_SATURATE: number;
    readonly SRC_COLOR: number;
    readonly STATIC_DRAW: number;
    readonly STENCIL_ATTACHMENT: number;
    readonly STENCIL_BACK_FAIL: number;
    readonly STENCIL_BACK_FUNC: number;
    readonly STENCIL_BACK_PASS_DEPTH_FAIL: number;
    readonly STENCIL_BACK_PASS_DEPTH_PASS: number;
    readonly STENCIL_BACK_REF: number;
    readonly STENCIL_BACK_VALUE_MASK: number;
    readonly STENCIL_BACK_WRITEMASK: number;
    readonly STENCIL_BITS: number;
    readonly STENCIL_BUFFER_BIT: number;
    readonly STENCIL_CLEAR_VALUE: number;
    readonly STENCIL_FAIL: number;
    readonly STENCIL_FUNC: number;
    readonly STENCIL_INDEX: number;
    readonly STENCIL_INDEX8: number;
    readonly STENCIL_PASS_DEPTH_FAIL: number;
    readonly STENCIL_PASS_DEPTH_PASS: number;
    readonly STENCIL_REF: number;
    readonly STENCIL_TEST: number;
    readonly STENCIL_VALUE_MASK: number;
    readonly STENCIL_WRITEMASK: number;
    readonly STREAM_DRAW: number;
    readonly SUBPIXEL_BITS: number;
    readonly TEXTURE: number;
    readonly TEXTURE0: number;
    readonly TEXTURE1: number;
    readonly TEXTURE10: number;
    readonly TEXTURE11: number;
    readonly TEXTURE12: number;
    readonly TEXTURE13: number;
    readonly TEXTURE14: number;
    readonly TEXTURE15: number;
    readonly TEXTURE16: number;
    readonly TEXTURE17: number;
    readonly TEXTURE18: number;
    readonly TEXTURE19: number;
    readonly TEXTURE2: number;
    readonly TEXTURE20: number;
    readonly TEXTURE21: number;
    readonly TEXTURE22: number;
    readonly TEXTURE23: number;
    readonly TEXTURE24: number;
    readonly TEXTURE25: number;
    readonly TEXTURE26: number;
    readonly TEXTURE27: number;
    readonly TEXTURE28: number;
    readonly TEXTURE29: number;
    readonly TEXTURE3: number;
    readonly TEXTURE30: number;
    readonly TEXTURE31: number;
    readonly TEXTURE4: number;
    readonly TEXTURE5: number;
    readonly TEXTURE6: number;
    readonly TEXTURE7: number;
    readonly TEXTURE8: number;
    readonly TEXTURE9: number;
    readonly TEXTURE_2D: number;
    readonly TEXTURE_BINDING_2D: number;
    readonly TEXTURE_BINDING_CUBE_MAP: number;
    readonly TEXTURE_CUBE_MAP: number;
    readonly TEXTURE_CUBE_MAP_NEGATIVE_X: number;
    readonly TEXTURE_CUBE_MAP_NEGATIVE_Y: number;
    readonly TEXTURE_CUBE_MAP_NEGATIVE_Z: number;
    readonly TEXTURE_CUBE_MAP_POSITIVE_X: number;
    readonly TEXTURE_CUBE_MAP_POSITIVE_Y: number;
    readonly TEXTURE_CUBE_MAP_POSITIVE_Z: number;
    readonly TEXTURE_MAG_FILTER: number;
    readonly TEXTURE_MIN_FILTER: number;
    readonly TEXTURE_WRAP_S: number;
    readonly TEXTURE_WRAP_T: number;
    readonly TRIANGLES: number;
    readonly TRIANGLE_FAN: number;
    readonly TRIANGLE_STRIP: number;
    readonly UNPACK_ALIGNMENT: number;
    readonly UNPACK_COLORSPACE_CONVERSION_WEBGL: number;
    readonly UNPACK_FLIP_Y_WEBGL: number;
    readonly UNPACK_PREMULTIPLY_ALPHA_WEBGL: number;
    readonly UNSIGNED_BYTE: number;
    readonly UNSIGNED_INT: number;
    readonly UNSIGNED_SHORT: number;
    readonly UNSIGNED_SHORT_4_4_4_4: number;
    readonly UNSIGNED_SHORT_5_5_5_1: number;
    readonly UNSIGNED_SHORT_5_6_5: number;
    readonly VALIDATE_STATUS: number;
    readonly VENDOR: number;
    readonly VERSION: number;
    readonly VERTEX_ATTRIB_ARRAY_BUFFER_BINDING: number;
    readonly VERTEX_ATTRIB_ARRAY_ENABLED: number;
    readonly VERTEX_ATTRIB_ARRAY_NORMALIZED: number;
    readonly VERTEX_ATTRIB_ARRAY_POINTER: number;
    readonly VERTEX_ATTRIB_ARRAY_SIZE: number;
    readonly VERTEX_ATTRIB_ARRAY_STRIDE: number;
    readonly VERTEX_ATTRIB_ARRAY_TYPE: number;
    readonly VERTEX_SHADER: number;
    readonly VIEWPORT: number;
    readonly ZERO: number;
}

declare var WebGLRenderingContext: {
    prototype: WebGLRenderingContext;
    new(): WebGLRenderingContext;
    readonly ACTIVE_ATTRIBUTES: number;
    readonly ACTIVE_TEXTURE: number;
    readonly ACTIVE_UNIFORMS: number;
    readonly ALIASED_LINE_WIDTH_RANGE: number;
    readonly ALIASED_POINT_SIZE_RANGE: number;
    readonly ALPHA: number;
    readonly ALPHA_BITS: number;
    readonly ALWAYS: number;
    readonly ARRAY_BUFFER: number;
    readonly ARRAY_BUFFER_BINDING: number;
    readonly ATTACHED_SHADERS: number;
    readonly BACK: number;
    readonly BLEND: number;
    readonly BLEND_COLOR: number;
    readonly BLEND_DST_ALPHA: number;
    readonly BLEND_DST_RGB: number;
    readonly BLEND_EQUATION: number;
    readonly BLEND_EQUATION_ALPHA: number;
    readonly BLEND_EQUATION_RGB: number;
    readonly BLEND_SRC_ALPHA: number;
    readonly BLEND_SRC_RGB: number;
    readonly BLUE_BITS: number;
    readonly BOOL: number;
    readonly BOOL_VEC2: number;
    readonly BOOL_VEC3: number;
    readonly BOOL_VEC4: number;
    readonly BROWSER_DEFAULT_WEBGL: number;
    readonly BUFFER_SIZE: number;
    readonly BUFFER_USAGE: number;
    readonly BYTE: number;
    readonly CCW: number;
    readonly CLAMP_TO_EDGE: number;
    readonly COLOR_ATTACHMENT0: number;
    readonly COLOR_BUFFER_BIT: number;
    readonly COLOR_CLEAR_VALUE: number;
    readonly COLOR_WRITEMASK: number;
    readonly COMPILE_STATUS: number;
    readonly COMPRESSED_TEXTURE_FORMATS: number;
    readonly CONSTANT_ALPHA: number;
    readonly CONSTANT_COLOR: number;
    readonly CONTEXT_LOST_WEBGL: number;
    readonly CULL_FACE: number;
    readonly CULL_FACE_MODE: number;
    readonly CURRENT_PROGRAM: number;
    readonly CURRENT_VERTEX_ATTRIB: number;
    readonly CW: number;
    readonly DECR: number;
    readonly DECR_WRAP: number;
    readonly DELETE_STATUS: number;
    readonly DEPTH_ATTACHMENT: number;
    readonly DEPTH_BITS: number;
    readonly DEPTH_BUFFER_BIT: number;
    readonly DEPTH_CLEAR_VALUE: number;
    readonly DEPTH_COMPONENT: number;
    readonly DEPTH_COMPONENT16: number;
    readonly DEPTH_FUNC: number;
    readonly DEPTH_RANGE: number;
    readonly DEPTH_STENCIL: number;
    readonly DEPTH_STENCIL_ATTACHMENT: number;
    readonly DEPTH_TEST: number;
    readonly DEPTH_WRITEMASK: number;
    readonly DITHER: number;
    readonly DONT_CARE: number;
    readonly DST_ALPHA: number;
    readonly DST_COLOR: number;
    readonly DYNAMIC_DRAW: number;
    readonly ELEMENT_ARRAY_BUFFER: number;
    readonly ELEMENT_ARRAY_BUFFER_BINDING: number;
    readonly EQUAL: number;
    readonly FASTEST: number;
    readonly FLOAT: number;
    readonly FLOAT_MAT2: number;
    readonly FLOAT_MAT3: number;
    readonly FLOAT_MAT4: number;
    readonly FLOAT_VEC2: number;
    readonly FLOAT_VEC3: number;
    readonly FLOAT_VEC4: number;
    readonly FRAGMENT_SHADER: number;
    readonly FRAMEBUFFER: number;
    readonly FRAMEBUFFER_ATTACHMENT_OBJECT_NAME: number;
    readonly FRAMEBUFFER_ATTACHMENT_OBJECT_TYPE: number;
    readonly FRAMEBUFFER_ATTACHMENT_TEXTURE_CUBE_MAP_FACE: number;
    readonly FRAMEBUFFER_ATTACHMENT_TEXTURE_LEVEL: number;
    readonly FRAMEBUFFER_BINDING: number;
    readonly FRAMEBUFFER_COMPLETE: number;
    readonly FRAMEBUFFER_INCOMPLETE_ATTACHMENT: number;
    readonly FRAMEBUFFER_INCOMPLETE_DIMENSIONS: number;
    readonly FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT: number;
    readonly FRAMEBUFFER_UNSUPPORTED: number;
    readonly FRONT: number;
    readonly FRONT_AND_BACK: number;
    readonly FRONT_FACE: number;
    readonly FUNC_ADD: number;
    readonly FUNC_REVERSE_SUBTRACT: number;
    readonly FUNC_SUBTRACT: number;
    readonly GENERATE_MIPMAP_HINT: number;
    readonly GEQUAL: number;
    readonly GREATER: number;
    readonly GREEN_BITS: number;
    readonly HIGH_FLOAT: number;
    readonly HIGH_INT: number;
    readonly IMPLEMENTATION_COLOR_READ_FORMAT: number;
    readonly IMPLEMENTATION_COLOR_READ_TYPE: number;
    readonly INCR: number;
    readonly INCR_WRAP: number;
    readonly INT: number;
    readonly INT_VEC2: number;
    readonly INT_VEC3: number;
    readonly INT_VEC4: number;
    readonly INVALID_ENUM: number;
    readonly INVALID_FRAMEBUFFER_OPERATION: number;
    readonly INVALID_OPERATION: number;
    readonly INVALID_VALUE: number;
    readonly INVERT: number;
    readonly KEEP: number;
    readonly LEQUAL: number;
    readonly LESS: number;
    readonly LINEAR: number;
    readonly LINEAR_MIPMAP_LINEAR: number;
    readonly LINEAR_MIPMAP_NEAREST: number;
    readonly LINES: number;
    readonly LINE_LOOP: number;
    readonly LINE_STRIP: number;
    readonly LINE_WIDTH: number;
    readonly LINK_STATUS: number;
    readonly LOW_FLOAT: number;
    readonly LOW_INT: number;
    readonly LUMINANCE: number;
    readonly LUMINANCE_ALPHA: number;
    readonly MAX_COMBINED_TEXTURE_IMAGE_UNITS: number;
    readonly MAX_CUBE_MAP_TEXTURE_SIZE: number;
    readonly MAX_FRAGMENT_UNIFORM_VECTORS: number;
    readonly MAX_RENDERBUFFER_SIZE: number;
    readonly MAX_TEXTURE_IMAGE_UNITS: number;
    readonly MAX_TEXTURE_SIZE: number;
    readonly MAX_VARYING_VECTORS: number;
    readonly MAX_VERTEX_ATTRIBS: number;
    readonly MAX_VERTEX_TEXTURE_IMAGE_UNITS: number;
    readonly MAX_VERTEX_UNIFORM_VECTORS: number;
    readonly MAX_VIEWPORT_DIMS: number;
    readonly MEDIUM_FLOAT: number;
    readonly MEDIUM_INT: number;
    readonly MIRRORED_REPEAT: number;
    readonly NEAREST: number;
    readonly NEAREST_MIPMAP_LINEAR: number;
    readonly NEAREST_MIPMAP_NEAREST: number;
    readonly NEVER: number;
    readonly NICEST: number;
    readonly NONE: number;
    readonly NOTEQUAL: number;
    readonly NO_ERROR: number;
    readonly ONE: number;
    readonly ONE_MINUS_CONSTANT_ALPHA: number;
    readonly ONE_MINUS_CONSTANT_COLOR: number;
    readonly ONE_MINUS_DST_ALPHA: number;
    readonly ONE_MINUS_DST_COLOR: number;
    readonly ONE_MINUS_SRC_ALPHA: number;
    readonly ONE_MINUS_SRC_COLOR: number;
    readonly OUT_OF_MEMORY: number;
    readonly PACK_ALIGNMENT: number;
    readonly POINTS: number;
    readonly POLYGON_OFFSET_FACTOR: number;
    readonly POLYGON_OFFSET_FILL: number;
    readonly POLYGON_OFFSET_UNITS: number;
    readonly RED_BITS: number;
    readonly RENDERBUFFER: number;
    readonly RENDERBUFFER_ALPHA_SIZE: number;
    readonly RENDERBUFFER_BINDING: number;
    readonly RENDERBUFFER_BLUE_SIZE: number;
    readonly RENDERBUFFER_DEPTH_SIZE: number;
    readonly RENDERBUFFER_GREEN_SIZE: number;
    readonly RENDERBUFFER_HEIGHT: number;
    readonly RENDERBUFFER_INTERNAL_FORMAT: number;
    readonly RENDERBUFFER_RED_SIZE: number;
    readonly RENDERBUFFER_STENCIL_SIZE: number;
    readonly RENDERBUFFER_WIDTH: number;
    readonly RENDERER: number;
    readonly REPEAT: number;
    readonly REPLACE: number;
    readonly RGB: number;
    readonly RGB565: number;
    readonly RGB5_A1: number;
    readonly RGBA: number;
    readonly RGBA4: number;
    readonly SAMPLER_2D: number;
    readonly SAMPLER_CUBE: number;
    readonly SAMPLES: number;
    readonly SAMPLE_ALPHA_TO_COVERAGE: number;
    readonly SAMPLE_BUFFERS: number;
    readonly SAMPLE_COVERAGE: number;
    readonly SAMPLE_COVERAGE_INVERT: number;
    readonly SAMPLE_COVERAGE_VALUE: number;
    readonly SCISSOR_BOX: number;
    readonly SCISSOR_TEST: number;
    readonly SHADER_TYPE: number;
    readonly SHADING_LANGUAGE_VERSION: number;
    readonly SHORT: number;
    readonly SRC_ALPHA: number;
    readonly SRC_ALPHA_SATURATE: number;
    readonly SRC_COLOR: number;
    readonly STATIC_DRAW: number;
    readonly STENCIL_ATTACHMENT: number;
    readonly STENCIL_BACK_FAIL: number;
    readonly STENCIL_BACK_FUNC: number;
    readonly STENCIL_BACK_PASS_DEPTH_FAIL: number;
    readonly STENCIL_BACK_PASS_DEPTH_PASS: number;
    readonly STENCIL_BACK_REF: number;
    readonly STENCIL_BACK_VALUE_MASK: number;
    readonly STENCIL_BACK_WRITEMASK: number;
    readonly STENCIL_BITS: number;
    readonly STENCIL_BUFFER_BIT: number;
    readonly STENCIL_CLEAR_VALUE: number;
    readonly STENCIL_FAIL: number;
    readonly STENCIL_FUNC: number;
    readonly STENCIL_INDEX: number;
    readonly STENCIL_INDEX8: number;
    readonly STENCIL_PASS_DEPTH_FAIL: number;
    readonly STENCIL_PASS_DEPTH_PASS: number;
    readonly STENCIL_REF: number;
    readonly STENCIL_TEST: number;
    readonly STENCIL_VALUE_MASK: number;
    readonly STENCIL_WRITEMASK: number;
    readonly STREAM_DRAW: number;
    readonly SUBPIXEL_BITS: number;
    readonly TEXTURE: number;
    readonly TEXTURE0: number;
    readonly TEXTURE1: number;
    readonly TEXTURE10: number;
    readonly TEXTURE11: number;
    readonly TEXTURE12: number;
    readonly TEXTURE13: number;
    readonly TEXTURE14: number;
    readonly TEXTURE15: number;
    readonly TEXTURE16: number;
    readonly TEXTURE17: number;
    readonly TEXTURE18: number;
    readonly TEXTURE19: number;
    readonly TEXTURE2: number;
    readonly TEXTURE20: number;
    readonly TEXTURE21: number;
    readonly TEXTURE22: number;
    readonly TEXTURE23: number;
    readonly TEXTURE24: number;
    readonly TEXTURE25: number;
    readonly TEXTURE26: number;
    readonly TEXTURE27: number;
    readonly TEXTURE28: number;
    readonly TEXTURE29: number;
    readonly TEXTURE3: number;
    readonly TEXTURE30: number;
    readonly TEXTURE31: number;
    readonly TEXTURE4: number;
    readonly TEXTURE5: number;
    readonly TEXTURE6: number;
    readonly TEXTURE7: number;
    readonly TEXTURE8: number;
    readonly TEXTURE9: number;
    readonly TEXTURE_2D: number;
    readonly TEXTURE_BINDING_2D: number;
    readonly TEXTURE_BINDING_CUBE_MAP: number;
    readonly TEXTURE_CUBE_MAP: number;
    readonly TEXTURE_CUBE_MAP_NEGATIVE_X: number;
    readonly TEXTURE_CUBE_MAP_NEGATIVE_Y: number;
    readonly TEXTURE_CUBE_MAP_NEGATIVE_Z: number;
    readonly TEXTURE_CUBE_MAP_POSITIVE_X: number;
    readonly TEXTURE_CUBE_MAP_POSITIVE_Y: number;
    readonly TEXTURE_CUBE_MAP_POSITIVE_Z: number;
    readonly TEXTURE_MAG_FILTER: number;
    readonly TEXTURE_MIN_FILTER: number;
    readonly TEXTURE_WRAP_S: number;
    readonly TEXTURE_WRAP_T: number;
    readonly TRIANGLES: number;
    readonly TRIANGLE_FAN: number;
    readonly TRIANGLE_STRIP: number;
    readonly UNPACK_ALIGNMENT: number;
    readonly UNPACK_COLORSPACE_CONVERSION_WEBGL: number;
    readonly UNPACK_FLIP_Y_WEBGL: number;
    readonly UNPACK_PREMULTIPLY_ALPHA_WEBGL: number;
    readonly UNSIGNED_BYTE: number;
    readonly UNSIGNED_INT: number;
    readonly UNSIGNED_SHORT: number;
    readonly UNSIGNED_SHORT_4_4_4_4: number;
    readonly UNSIGNED_SHORT_5_5_5_1: number;
    readonly UNSIGNED_SHORT_5_6_5: number;
    readonly VALIDATE_STATUS: number;
    readonly VENDOR: number;
    readonly VERSION: number;
    readonly VERTEX_ATTRIB_ARRAY_BUFFER_BINDING: number;
    readonly VERTEX_ATTRIB_ARRAY_ENABLED: number;
    readonly VERTEX_ATTRIB_ARRAY_NORMALIZED: number;
    readonly VERTEX_ATTRIB_ARRAY_POINTER: number;
    readonly VERTEX_ATTRIB_ARRAY_SIZE: number;
    readonly VERTEX_ATTRIB_ARRAY_STRIDE: number;
    readonly VERTEX_ATTRIB_ARRAY_TYPE: number;
    readonly VERTEX_SHADER: number;
    readonly VIEWPORT: number;
    readonly ZERO: number;
}

interface WebGLShader extends WebGLObject {
}

declare var WebGLShader: {
    prototype: WebGLShader;
    new(): WebGLShader;
}

interface WebGLShaderPrecisionFormat {
    readonly precision: number;
    readonly rangeMax: number;
    readonly rangeMin: number;
}

declare var WebGLShaderPrecisionFormat: {
    prototype: WebGLShaderPrecisionFormat;
    new(): WebGLShaderPrecisionFormat;
}

interface WebGLTexture extends WebGLObject {
}

declare var WebGLTexture: {
    prototype: WebGLTexture;
    new(): WebGLTexture;
}

interface WebGLUniformLocation {
}

declare var WebGLUniformLocation: {
    prototype: WebGLUniformLocation;
    new(): WebGLUniformLocation;
}

interface WebKitCSSMatrix {
    a: number;
    b: number;
    c: number;
    d: number;
    e: number;
    f: number;
    m11: number;
    m12: number;
    m13: number;
    m14: number;
    m21: number;
    m22: number;
    m23: number;
    m24: number;
    m31: number;
    m32: number;
    m33: number;
    m34: number;
    m41: number;
    m42: number;
    m43: number;
    m44: number;
    inverse(): WebKitCSSMatrix;
    multiply(secondMatrix: WebKitCSSMatrix): WebKitCSSMatrix;
    rotate(angleX: number, angleY?: number, angleZ?: number): WebKitCSSMatrix;
    rotateAxisAngle(x: number, y: number, z: number, angle: number): WebKitCSSMatrix;
    scale(scaleX: number, scaleY?: number, scaleZ?: number): WebKitCSSMatrix;
    setMatrixValue(value: string): void;
    skewX(angle: number): WebKitCSSMatrix;
    skewY(angle: number): WebKitCSSMatrix;
    toString(): string;
    translate(x: number, y: number, z?: number): WebKitCSSMatrix;
}

declare var WebKitCSSMatrix: {
    prototype: WebKitCSSMatrix;
    new(text?: string): WebKitCSSMatrix;
}

interface WebKitPoint {
    x: number;
    y: number;
}

declare var WebKitPoint: {
    prototype: WebKitPoint;
    new(x?: number, y?: number): WebKitPoint;
}

interface WebSocket extends EventTarget {
    binaryType: string;
    readonly bufferedAmount: number;
    readonly extensions: string;
    onclose: (this: this, ev: CloseEvent) => any;
    onerror: (this: this, ev: ErrorEvent) => any;
    onmessage: (this: this, ev: MessageEvent) => any;
    onopen: (this: this, ev: Event) => any;
    readonly protocol: string;
    readonly readyState: number;
    readonly url: string;
    close(code?: number, reason?: string): void;
    send(data: any): void;
    readonly CLOSED: number;
    readonly CLOSING: number;
    readonly CONNECTING: number;
    readonly OPEN: number;
    addEventListener(type: "close", listener: (this: this, ev: CloseEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "error", listener: (this: this, ev: ErrorEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "message", listener: (this: this, ev: MessageEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "open", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var WebSocket: {
    prototype: WebSocket;
    new(url: string, protocols?: string | string[]): WebSocket;
    readonly CLOSED: number;
    readonly CLOSING: number;
    readonly CONNECTING: number;
    readonly OPEN: number;
}

interface WheelEvent extends MouseEvent {
    readonly deltaMode: number;
    readonly deltaX: number;
    readonly deltaY: number;
    readonly deltaZ: number;
    readonly wheelDelta: number;
    readonly wheelDeltaX: number;
    readonly wheelDeltaY: number;
    getCurrentPoint(element: Element): void;
    initWheelEvent(typeArg: string, canBubbleArg: boolean, cancelableArg: boolean, viewArg: Window, detailArg: number, screenXArg: number, screenYArg: number, clientXArg: number, clientYArg: number, buttonArg: number, relatedTargetArg: EventTarget, modifiersListArg: string, deltaXArg: number, deltaYArg: number, deltaZArg: number, deltaMode: number): void;
    readonly DOM_DELTA_LINE: number;
    readonly DOM_DELTA_PAGE: number;
    readonly DOM_DELTA_PIXEL: number;
}

declare var WheelEvent: {
    prototype: WheelEvent;
    new(typeArg: string, eventInitDict?: WheelEventInit): WheelEvent;
    readonly DOM_DELTA_LINE: number;
    readonly DOM_DELTA_PAGE: number;
    readonly DOM_DELTA_PIXEL: number;
}

interface Window extends EventTarget, WindowTimers, WindowSessionStorage, WindowLocalStorage, WindowConsole, GlobalEventHandlers, IDBEnvironment, WindowBase64 {
    readonly applicationCache: ApplicationCache;
    readonly clientInformation: Navigator;
    readonly closed: boolean;
    readonly crypto: Crypto;
    defaultStatus: string;
    readonly devicePixelRatio: number;
    readonly doNotTrack: string;
    readonly document: Document;
    event: Event;
    readonly external: External;
    readonly frameElement: Element;
    readonly frames: Window;
    readonly history: History;
    readonly innerHeight: number;
    readonly innerWidth: number;
    readonly length: number;
    readonly location: Location;
    readonly locationbar: BarProp;
    readonly menubar: BarProp;
    readonly msCredentials: MSCredentials;
    name: string;
    readonly navigator: Navigator;
    offscreenBuffering: string | boolean;
    onabort: (this: this, ev: UIEvent) => any;
    onafterprint: (this: this, ev: Event) => any;
    onbeforeprint: (this: this, ev: Event) => any;
    onbeforeunload: (this: this, ev: BeforeUnloadEvent) => any;
    onblur: (this: this, ev: FocusEvent) => any;
    oncanplay: (this: this, ev: Event) => any;
    oncanplaythrough: (this: this, ev: Event) => any;
    onchange: (this: this, ev: Event) => any;
    onclick: (this: this, ev: MouseEvent) => any;
    oncompassneedscalibration: (this: this, ev: Event) => any;
    oncontextmenu: (this: this, ev: PointerEvent) => any;
    ondblclick: (this: this, ev: MouseEvent) => any;
    ondevicelight: (this: this, ev: DeviceLightEvent) => any;
    ondevicemotion: (this: this, ev: DeviceMotionEvent) => any;
    ondeviceorientation: (this: this, ev: DeviceOrientationEvent) => any;
    ondrag: (this: this, ev: DragEvent) => any;
    ondragend: (this: this, ev: DragEvent) => any;
    ondragenter: (this: this, ev: DragEvent) => any;
    ondragleave: (this: this, ev: DragEvent) => any;
    ondragover: (this: this, ev: DragEvent) => any;
    ondragstart: (this: this, ev: DragEvent) => any;
    ondrop: (this: this, ev: DragEvent) => any;
    ondurationchange: (this: this, ev: Event) => any;
    onemptied: (this: this, ev: Event) => any;
    onended: (this: this, ev: MediaStreamErrorEvent) => any;
    onerror: ErrorEventHandler;
    onfocus: (this: this, ev: FocusEvent) => any;
    onhashchange: (this: this, ev: HashChangeEvent) => any;
    oninput: (this: this, ev: Event) => any;
    oninvalid: (this: this, ev: Event) => any;
    onkeydown: (this: this, ev: KeyboardEvent) => any;
    onkeypress: (this: this, ev: KeyboardEvent) => any;
    onkeyup: (this: this, ev: KeyboardEvent) => any;
    onload: (this: this, ev: Event) => any;
    onloadeddata: (this: this, ev: Event) => any;
    onloadedmetadata: (this: this, ev: Event) => any;
    onloadstart: (this: this, ev: Event) => any;
    onmessage: (this: this, ev: MessageEvent) => any;
    onmousedown: (this: this, ev: MouseEvent) => any;
    onmouseenter: (this: this, ev: MouseEvent) => any;
    onmouseleave: (this: this, ev: MouseEvent) => any;
    onmousemove: (this: this, ev: MouseEvent) => any;
    onmouseout: (this: this, ev: MouseEvent) => any;
    onmouseover: (this: this, ev: MouseEvent) => any;
    onmouseup: (this: this, ev: MouseEvent) => any;
    onmousewheel: (this: this, ev: WheelEvent) => any;
    onmsgesturechange: (this: this, ev: MSGestureEvent) => any;
    onmsgesturedoubletap: (this: this, ev: MSGestureEvent) => any;
    onmsgestureend: (this: this, ev: MSGestureEvent) => any;
    onmsgesturehold: (this: this, ev: MSGestureEvent) => any;
    onmsgesturestart: (this: this, ev: MSGestureEvent) => any;
    onmsgesturetap: (this: this, ev: MSGestureEvent) => any;
    onmsinertiastart: (this: this, ev: MSGestureEvent) => any;
    onmspointercancel: (this: this, ev: MSPointerEvent) => any;
    onmspointerdown: (this: this, ev: MSPointerEvent) => any;
    onmspointerenter: (this: this, ev: MSPointerEvent) => any;
    onmspointerleave: (this: this, ev: MSPointerEvent) => any;
    onmspointermove: (this: this, ev: MSPointerEvent) => any;
    onmspointerout: (this: this, ev: MSPointerEvent) => any;
    onmspointerover: (this: this, ev: MSPointerEvent) => any;
    onmspointerup: (this: this, ev: MSPointerEvent) => any;
    onoffline: (this: this, ev: Event) => any;
    ononline: (this: this, ev: Event) => any;
    onorientationchange: (this: this, ev: Event) => any;
    onpagehide: (this: this, ev: PageTransitionEvent) => any;
    onpageshow: (this: this, ev: PageTransitionEvent) => any;
    onpause: (this: this, ev: Event) => any;
    onplay: (this: this, ev: Event) => any;
    onplaying: (this: this, ev: Event) => any;
    onpopstate: (this: this, ev: PopStateEvent) => any;
    onprogress: (this: this, ev: ProgressEvent) => any;
    onratechange: (this: this, ev: Event) => any;
    onreadystatechange: (this: this, ev: ProgressEvent) => any;
    onreset: (this: this, ev: Event) => any;
    onresize: (this: this, ev: UIEvent) => any;
    onscroll: (this: this, ev: UIEvent) => any;
    onseeked: (this: this, ev: Event) => any;
    onseeking: (this: this, ev: Event) => any;
    onselect: (this: this, ev: UIEvent) => any;
    onstalled: (this: this, ev: Event) => any;
    onstorage: (this: this, ev: StorageEvent) => any;
    onsubmit: (this: this, ev: Event) => any;
    onsuspend: (this: this, ev: Event) => any;
    ontimeupdate: (this: this, ev: Event) => any;
    ontouchcancel: (ev: TouchEvent) => any;
    ontouchend: (ev: TouchEvent) => any;
    ontouchmove: (ev: TouchEvent) => any;
    ontouchstart: (ev: TouchEvent) => any;
    onunload: (this: this, ev: Event) => any;
    onvolumechange: (this: this, ev: Event) => any;
    onwaiting: (this: this, ev: Event) => any;
    opener: any;
    orientation: string | number;
    readonly outerHeight: number;
    readonly outerWidth: number;
    readonly pageXOffset: number;
    readonly pageYOffset: number;
    readonly parent: Window;
    readonly performance: Performance;
    readonly personalbar: BarProp;
    readonly screen: Screen;
    readonly screenLeft: number;
    readonly screenTop: number;
    readonly screenX: number;
    readonly screenY: number;
    readonly scrollX: number;
    readonly scrollY: number;
    readonly scrollbars: BarProp;
    readonly self: Window;
    status: string;
    readonly statusbar: BarProp;
    readonly styleMedia: StyleMedia;
    readonly toolbar: BarProp;
    readonly top: Window;
    readonly window: Window;
    URL: typeof URL;
    Blob: typeof Blob;
    alert(message?: any): void;
    blur(): void;
    cancelAnimationFrame(handle: number): void;
    captureEvents(): void;
    close(): void;
    confirm(message?: string): boolean;
    focus(): void;
    getComputedStyle(elt: Element, pseudoElt?: string): CSSStyleDeclaration;
    getMatchedCSSRules(elt: Element, pseudoElt?: string): CSSRuleList;
    getSelection(): Selection;
    matchMedia(mediaQuery: string): MediaQueryList;
    moveBy(x?: number, y?: number): void;
    moveTo(x?: number, y?: number): void;
    msWriteProfilerMark(profilerMarkName: string): void;
    open(url?: string, target?: string, features?: string, replace?: boolean): Window;
    postMessage(message: any, targetOrigin: string, transfer?: any[]): void;
    print(): void;
    prompt(message?: string, _default?: string): string | null;
    releaseEvents(): void;
    requestAnimationFrame(callback: FrameRequestCallback): number;
    resizeBy(x?: number, y?: number): void;
    resizeTo(x?: number, y?: number): void;
    scroll(x?: number, y?: number): void;
    scrollBy(x?: number, y?: number): void;
    scrollTo(x?: number, y?: number): void;
    webkitCancelAnimationFrame(handle: number): void;
    webkitConvertPointFromNodeToPage(node: Node, pt: WebKitPoint): WebKitPoint;
    webkitConvertPointFromPageToNode(node: Node, pt: WebKitPoint): WebKitPoint;
    webkitRequestAnimationFrame(callback: FrameRequestCallback): number;
    scroll(options?: ScrollToOptions): void;
    scrollTo(options?: ScrollToOptions): void;
    scrollBy(options?: ScrollToOptions): void;
    addEventListener(type: "MSGestureChange", listener: (this: this, ev: MSGestureEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSGestureDoubleTap", listener: (this: this, ev: MSGestureEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSGestureEnd", listener: (this: this, ev: MSGestureEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSGestureHold", listener: (this: this, ev: MSGestureEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSGestureStart", listener: (this: this, ev: MSGestureEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSGestureTap", listener: (this: this, ev: MSGestureEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSInertiaStart", listener: (this: this, ev: MSGestureEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSPointerCancel", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSPointerDown", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSPointerEnter", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSPointerLeave", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSPointerMove", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSPointerOut", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSPointerOver", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "MSPointerUp", listener: (this: this, ev: MSPointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "abort", listener: (this: this, ev: UIEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "afterprint", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "beforeprint", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "beforeunload", listener: (this: this, ev: BeforeUnloadEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "blur", listener: (this: this, ev: FocusEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "canplay", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "canplaythrough", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "change", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "click", listener: (this: this, ev: MouseEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "compassneedscalibration", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "contextmenu", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "dblclick", listener: (this: this, ev: MouseEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "devicelight", listener: (this: this, ev: DeviceLightEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "devicemotion", listener: (this: this, ev: DeviceMotionEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "deviceorientation", listener: (this: this, ev: DeviceOrientationEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "drag", listener: (this: this, ev: DragEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "dragend", listener: (this: this, ev: DragEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "dragenter", listener: (this: this, ev: DragEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "dragleave", listener: (this: this, ev: DragEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "dragover", listener: (this: this, ev: DragEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "dragstart", listener: (this: this, ev: DragEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "drop", listener: (this: this, ev: DragEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "durationchange", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "emptied", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "ended", listener: (this: this, ev: MediaStreamErrorEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "focus", listener: (this: this, ev: FocusEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "hashchange", listener: (this: this, ev: HashChangeEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "input", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "invalid", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "keydown", listener: (this: this, ev: KeyboardEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "keypress", listener: (this: this, ev: KeyboardEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "keyup", listener: (this: this, ev: KeyboardEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "load", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "loadeddata", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "loadedmetadata", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "loadstart", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "message", listener: (this: this, ev: MessageEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "mousedown", listener: (this: this, ev: MouseEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "mouseenter", listener: (this: this, ev: MouseEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "mouseleave", listener: (this: this, ev: MouseEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "mousemove", listener: (this: this, ev: MouseEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "mouseout", listener: (this: this, ev: MouseEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "mouseover", listener: (this: this, ev: MouseEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "mouseup", listener: (this: this, ev: MouseEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "mousewheel", listener: (this: this, ev: WheelEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "offline", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "online", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "orientationchange", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "pagehide", listener: (this: this, ev: PageTransitionEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pageshow", listener: (this: this, ev: PageTransitionEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pause", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "play", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "playing", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "pointercancel", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pointerdown", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pointerenter", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pointerleave", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pointermove", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pointerout", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pointerover", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pointerup", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "popstate", listener: (this: this, ev: PopStateEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "progress", listener: (this: this, ev: ProgressEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "ratechange", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "readystatechange", listener: (this: this, ev: ProgressEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "reset", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "resize", listener: (this: this, ev: UIEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "scroll", listener: (this: this, ev: UIEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "seeked", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "seeking", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "select", listener: (this: this, ev: UIEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "stalled", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "storage", listener: (this: this, ev: StorageEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "submit", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "suspend", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "timeupdate", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "unload", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "volumechange", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "waiting", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "wheel", listener: (this: this, ev: WheelEvent) => any, useCapture?: boolean): void;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
    [index: number]: Window;
}

declare var Window: {
    prototype: Window;
    new(): Window;
}

interface Worker extends EventTarget, AbstractWorker {
    onmessage: (this: this, ev: MessageEvent) => any;
    postMessage(message: any, ports?: any): void;
    terminate(): void;
    addEventListener(type: "error", listener: (this: this, ev: ErrorEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "message", listener: (this: this, ev: MessageEvent) => any, useCapture?: boolean): void;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var Worker: {
    prototype: Worker;
    new(stringUrl: string): Worker;
}

interface XMLDocument extends Document {
}

declare var XMLDocument: {
    prototype: XMLDocument;
    new(): XMLDocument;
}

interface XMLHttpRequest extends EventTarget, XMLHttpRequestEventTarget {
    onreadystatechange: (this: this, ev: ProgressEvent) => any;
    readonly readyState: number;
    readonly response: any;
    readonly responseText: string;
    responseType: string;
    readonly responseXML: any;
    readonly status: number;
    readonly statusText: string;
    timeout: number;
    readonly upload: XMLHttpRequestUpload;
    withCredentials: boolean;
    msCaching?: string;
    abort(): void;
    getAllResponseHeaders(): string;
    getResponseHeader(header: string): string | null;
    msCachingEnabled(): boolean;
    open(method: string, url: string, async?: boolean, user?: string, password?: string): void;
    overrideMimeType(mime: string): void;
    send(data?: Document): void;
    send(data?: string): void;
    send(data?: any): void;
    setRequestHeader(header: string, value: string): void;
    readonly DONE: number;
    readonly HEADERS_RECEIVED: number;
    readonly LOADING: number;
    readonly OPENED: number;
    readonly UNSENT: number;
    addEventListener(type: "abort", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "error", listener: (this: this, ev: ErrorEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "load", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "loadend", listener: (this: this, ev: ProgressEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "loadstart", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "progress", listener: (this: this, ev: ProgressEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "readystatechange", listener: (this: this, ev: ProgressEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "timeout", listener: (this: this, ev: ProgressEvent) => any, useCapture?: boolean): void;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var XMLHttpRequest: {
    prototype: XMLHttpRequest;
    new(): XMLHttpRequest;
    readonly DONE: number;
    readonly HEADERS_RECEIVED: number;
    readonly LOADING: number;
    readonly OPENED: number;
    readonly UNSENT: number;
    create(): XMLHttpRequest;
}

interface XMLHttpRequestUpload extends EventTarget, XMLHttpRequestEventTarget {
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var XMLHttpRequestUpload: {
    prototype: XMLHttpRequestUpload;
    new(): XMLHttpRequestUpload;
}

interface XMLSerializer {
    serializeToString(target: Node): string;
}

declare var XMLSerializer: {
    prototype: XMLSerializer;
    new(): XMLSerializer;
}

interface XPathEvaluator {
    createExpression(expression: string, resolver: XPathNSResolver): XPathExpression;
    createNSResolver(nodeResolver?: Node): XPathNSResolver;
    evaluate(expression: string, contextNode: Node, resolver: XPathNSResolver, type: number, result: XPathResult): XPathResult;
}

declare var XPathEvaluator: {
    prototype: XPathEvaluator;
    new(): XPathEvaluator;
}

interface XPathExpression {
    evaluate(contextNode: Node, type: number, result: XPathResult): XPathExpression;
}

declare var XPathExpression: {
    prototype: XPathExpression;
    new(): XPathExpression;
}

interface XPathNSResolver {
    lookupNamespaceURI(prefix: string): string;
}

declare var XPathNSResolver: {
    prototype: XPathNSResolver;
    new(): XPathNSResolver;
}

interface XPathResult {
    readonly booleanValue: boolean;
    readonly invalidIteratorState: boolean;
    readonly numberValue: number;
    readonly resultType: number;
    readonly singleNodeValue: Node;
    readonly snapshotLength: number;
    readonly stringValue: string;
    iterateNext(): Node;
    snapshotItem(index: number): Node;
    readonly ANY_TYPE: number;
    readonly ANY_UNORDERED_NODE_TYPE: number;
    readonly BOOLEAN_TYPE: number;
    readonly FIRST_ORDERED_NODE_TYPE: number;
    readonly NUMBER_TYPE: number;
    readonly ORDERED_NODE_ITERATOR_TYPE: number;
    readonly ORDERED_NODE_SNAPSHOT_TYPE: number;
    readonly STRING_TYPE: number;
    readonly UNORDERED_NODE_ITERATOR_TYPE: number;
    readonly UNORDERED_NODE_SNAPSHOT_TYPE: number;
}

declare var XPathResult: {
    prototype: XPathResult;
    new(): XPathResult;
    readonly ANY_TYPE: number;
    readonly ANY_UNORDERED_NODE_TYPE: number;
    readonly BOOLEAN_TYPE: number;
    readonly FIRST_ORDERED_NODE_TYPE: number;
    readonly NUMBER_TYPE: number;
    readonly ORDERED_NODE_ITERATOR_TYPE: number;
    readonly ORDERED_NODE_SNAPSHOT_TYPE: number;
    readonly STRING_TYPE: number;
    readonly UNORDERED_NODE_ITERATOR_TYPE: number;
    readonly UNORDERED_NODE_SNAPSHOT_TYPE: number;
}

interface XSLTProcessor {
    clearParameters(): void;
    getParameter(namespaceURI: string, localName: string): any;
    importStylesheet(style: Node): void;
    removeParameter(namespaceURI: string, localName: string): void;
    reset(): void;
    setParameter(namespaceURI: string, localName: string, value: any): void;
    transformToDocument(source: Node): Document;
    transformToFragment(source: Node, document: Document): DocumentFragment;
}

declare var XSLTProcessor: {
    prototype: XSLTProcessor;
    new(): XSLTProcessor;
}

interface AbstractWorker {
    onerror: (this: this, ev: ErrorEvent) => any;
    addEventListener(type: "error", listener: (this: this, ev: ErrorEvent) => any, useCapture?: boolean): void;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

interface CanvasPathMethods {
    arc(x: number, y: number, radius: number, startAngle: number, endAngle: number, anticlockwise?: boolean): void;
    arcTo(x1: number, y1: number, x2: number, y2: number, radius: number): void;
    bezierCurveTo(cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number): void;
    closePath(): void;
    ellipse(x: number, y: number, radiusX: number, radiusY: number, rotation: number, startAngle: number, endAngle: number, anticlockwise?: boolean): void;
    lineTo(x: number, y: number): void;
    moveTo(x: number, y: number): void;
    quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): void;
    rect(x: number, y: number, w: number, h: number): void;
}

interface ChildNode {
    remove(): void;
}

interface DOML2DeprecatedColorProperty {
    color: string;
}

interface DOML2DeprecatedSizeProperty {
    size: number;
}

interface DocumentEvent {
    createEvent(eventInterface:"AnimationEvent"): AnimationEvent;
    createEvent(eventInterface:"AriaRequestEvent"): AriaRequestEvent;
    createEvent(eventInterface:"AudioProcessingEvent"): AudioProcessingEvent;
    createEvent(eventInterface:"BeforeUnloadEvent"): BeforeUnloadEvent;
    createEvent(eventInterface:"ClipboardEvent"): ClipboardEvent;
    createEvent(eventInterface:"CloseEvent"): CloseEvent;
    createEvent(eventInterface:"CommandEvent"): CommandEvent;
    createEvent(eventInterface:"CompositionEvent"): CompositionEvent;
    createEvent(eventInterface:"CustomEvent"): CustomEvent;
    createEvent(eventInterface:"DeviceLightEvent"): DeviceLightEvent;
    createEvent(eventInterface:"DeviceMotionEvent"): DeviceMotionEvent;
    createEvent(eventInterface:"DeviceOrientationEvent"): DeviceOrientationEvent;
    createEvent(eventInterface:"DragEvent"): DragEvent;
    createEvent(eventInterface:"ErrorEvent"): ErrorEvent;
    createEvent(eventInterface:"Event"): Event;
    createEvent(eventInterface:"Events"): Event;
    createEvent(eventInterface:"FocusEvent"): FocusEvent;
    createEvent(eventInterface:"GamepadEvent"): GamepadEvent;
    createEvent(eventInterface:"HashChangeEvent"): HashChangeEvent;
    createEvent(eventInterface:"IDBVersionChangeEvent"): IDBVersionChangeEvent;
    createEvent(eventInterface:"KeyboardEvent"): KeyboardEvent;
    createEvent(eventInterface:"ListeningStateChangedEvent"): ListeningStateChangedEvent;
    createEvent(eventInterface:"LongRunningScriptDetectedEvent"): LongRunningScriptDetectedEvent;
    createEvent(eventInterface:"MSGestureEvent"): MSGestureEvent;
    createEvent(eventInterface:"MSManipulationEvent"): MSManipulationEvent;
    createEvent(eventInterface:"MSMediaKeyMessageEvent"): MSMediaKeyMessageEvent;
    createEvent(eventInterface:"MSMediaKeyNeededEvent"): MSMediaKeyNeededEvent;
    createEvent(eventInterface:"MSPointerEvent"): MSPointerEvent;
    createEvent(eventInterface:"MSSiteModeEvent"): MSSiteModeEvent;
    createEvent(eventInterface:"MediaEncryptedEvent"): MediaEncryptedEvent;
    createEvent(eventInterface:"MediaKeyMessageEvent"): MediaKeyMessageEvent;
    createEvent(eventInterface:"MediaStreamErrorEvent"): MediaStreamErrorEvent;
    createEvent(eventInterface:"MediaStreamTrackEvent"): MediaStreamTrackEvent;
    createEvent(eventInterface:"MessageEvent"): MessageEvent;
    createEvent(eventInterface:"MouseEvent"): MouseEvent;
    createEvent(eventInterface:"MouseEvents"): MouseEvent;
    createEvent(eventInterface:"MutationEvent"): MutationEvent;
    createEvent(eventInterface:"MutationEvents"): MutationEvent;
    createEvent(eventInterface:"NavigationCompletedEvent"): NavigationCompletedEvent;
    createEvent(eventInterface:"NavigationEvent"): NavigationEvent;
    createEvent(eventInterface:"NavigationEventWithReferrer"): NavigationEventWithReferrer;
    createEvent(eventInterface:"OfflineAudioCompletionEvent"): OfflineAudioCompletionEvent;
    createEvent(eventInterface:"OverflowEvent"): OverflowEvent;
    createEvent(eventInterface:"PageTransitionEvent"): PageTransitionEvent;
    createEvent(eventInterface:"PermissionRequestedEvent"): PermissionRequestedEvent;
    createEvent(eventInterface:"PointerEvent"): PointerEvent;
    createEvent(eventInterface:"PopStateEvent"): PopStateEvent;
    createEvent(eventInterface:"ProgressEvent"): ProgressEvent;
    createEvent(eventInterface:"RTCDTMFToneChangeEvent"): RTCDTMFToneChangeEvent;
    createEvent(eventInterface:"RTCDtlsTransportStateChangedEvent"): RTCDtlsTransportStateChangedEvent;
    createEvent(eventInterface:"RTCIceCandidatePairChangedEvent"): RTCIceCandidatePairChangedEvent;
    createEvent(eventInterface:"RTCIceGathererEvent"): RTCIceGathererEvent;
    createEvent(eventInterface:"RTCIceTransportStateChangedEvent"): RTCIceTransportStateChangedEvent;
    createEvent(eventInterface:"RTCSsrcConflictEvent"): RTCSsrcConflictEvent;
    createEvent(eventInterface:"SVGZoomEvent"): SVGZoomEvent;
    createEvent(eventInterface:"SVGZoomEvents"): SVGZoomEvent;
    createEvent(eventInterface:"ScriptNotifyEvent"): ScriptNotifyEvent;
    createEvent(eventInterface:"StorageEvent"): StorageEvent;
    createEvent(eventInterface:"TextEvent"): TextEvent;
    createEvent(eventInterface:"TouchEvent"): TouchEvent;
    createEvent(eventInterface:"TrackEvent"): TrackEvent;
    createEvent(eventInterface:"TransitionEvent"): TransitionEvent;
    createEvent(eventInterface:"UIEvent"): UIEvent;
    createEvent(eventInterface:"UIEvents"): UIEvent;
    createEvent(eventInterface:"UnviewableContentIdentifiedEvent"): UnviewableContentIdentifiedEvent;
    createEvent(eventInterface:"WebGLContextEvent"): WebGLContextEvent;
    createEvent(eventInterface:"WheelEvent"): WheelEvent;
    createEvent(eventInterface: string): Event;
}

interface ElementTraversal {
    readonly childElementCount: number;
    readonly firstElementChild: Element;
    readonly lastElementChild: Element;
    readonly nextElementSibling: Element;
    readonly previousElementSibling: Element;
}

interface GetSVGDocument {
    getSVGDocument(): Document;
}

interface GlobalEventHandlers {
    onpointercancel: (this: this, ev: PointerEvent) => any;
    onpointerdown: (this: this, ev: PointerEvent) => any;
    onpointerenter: (this: this, ev: PointerEvent) => any;
    onpointerleave: (this: this, ev: PointerEvent) => any;
    onpointermove: (this: this, ev: PointerEvent) => any;
    onpointerout: (this: this, ev: PointerEvent) => any;
    onpointerover: (this: this, ev: PointerEvent) => any;
    onpointerup: (this: this, ev: PointerEvent) => any;
    onwheel: (this: this, ev: WheelEvent) => any;
    addEventListener(type: "pointercancel", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pointerdown", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pointerenter", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pointerleave", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pointermove", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pointerout", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pointerover", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "pointerup", listener: (this: this, ev: PointerEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "wheel", listener: (this: this, ev: WheelEvent) => any, useCapture?: boolean): void;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

interface HTMLTableAlignment {
    /**
      * Sets or retrieves a value that you can use to implement your own ch functionality for the object.
      */
    ch: string;
    /**
      * Sets or retrieves a value that you can use to implement your own chOff functionality for the object.
      */
    chOff: string;
    /**
      * Sets or retrieves how text and other content are vertically aligned within the object that contains them.
      */
    vAlign: string;
}

interface IDBEnvironment {
    readonly indexedDB: IDBFactory;
}

interface LinkStyle {
    readonly sheet: StyleSheet;
}

interface MSBaseReader {
    onabort: (this: this, ev: Event) => any;
    onerror: (this: this, ev: ErrorEvent) => any;
    onload: (this: this, ev: Event) => any;
    onloadend: (this: this, ev: ProgressEvent) => any;
    onloadstart: (this: this, ev: Event) => any;
    onprogress: (this: this, ev: ProgressEvent) => any;
    readonly readyState: number;
    readonly result: any;
    abort(): void;
    readonly DONE: number;
    readonly EMPTY: number;
    readonly LOADING: number;
    addEventListener(type: "abort", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "error", listener: (this: this, ev: ErrorEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "load", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "loadend", listener: (this: this, ev: ProgressEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "loadstart", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "progress", listener: (this: this, ev: ProgressEvent) => any, useCapture?: boolean): void;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

interface MSFileSaver {
    msSaveBlob(blob: any, defaultName?: string): boolean;
    msSaveOrOpenBlob(blob: any, defaultName?: string): boolean;
}

interface MSNavigatorDoNotTrack {
    confirmSiteSpecificTrackingException(args: ConfirmSiteSpecificExceptionsInformation): boolean;
    confirmWebWideTrackingException(args: ExceptionInformation): boolean;
    removeSiteSpecificTrackingException(args: ExceptionInformation): void;
    removeWebWideTrackingException(args: ExceptionInformation): void;
    storeSiteSpecificTrackingException(args: StoreSiteSpecificExceptionsInformation): void;
    storeWebWideTrackingException(args: StoreExceptionsInformation): void;
}

interface NavigatorContentUtils {
}

interface NavigatorGeolocation {
    readonly geolocation: Geolocation;
}

interface NavigatorID {
    readonly appName: string;
    readonly appVersion: string;
    readonly platform: string;
    readonly product: string;
    readonly productSub: string;
    readonly userAgent: string;
    readonly vendor: string;
    readonly vendorSub: string;
}

interface NavigatorOnLine {
    readonly onLine: boolean;
}

interface NavigatorStorageUtils {
}

interface NavigatorUserMedia {
    readonly mediaDevices: MediaDevices;
    getUserMedia(constraints: MediaStreamConstraints, successCallback: NavigatorUserMediaSuccessCallback, errorCallback: NavigatorUserMediaErrorCallback): void;
}

interface NodeSelector {
    querySelector(selectors: "a"): HTMLAnchorElement;
    querySelector(selectors: "abbr"): HTMLElement;
    querySelector(selectors: "acronym"): HTMLElement;
    querySelector(selectors: "address"): HTMLElement;
    querySelector(selectors: "applet"): HTMLAppletElement;
    querySelector(selectors: "area"): HTMLAreaElement;
    querySelector(selectors: "article"): HTMLElement;
    querySelector(selectors: "aside"): HTMLElement;
    querySelector(selectors: "audio"): HTMLAudioElement;
    querySelector(selectors: "b"): HTMLElement;
    querySelector(selectors: "base"): HTMLBaseElement;
    querySelector(selectors: "basefont"): HTMLBaseFontElement;
    querySelector(selectors: "bdo"): HTMLElement;
    querySelector(selectors: "big"): HTMLElement;
    querySelector(selectors: "blockquote"): HTMLQuoteElement;
    querySelector(selectors: "body"): HTMLBodyElement;
    querySelector(selectors: "br"): HTMLBRElement;
    querySelector(selectors: "button"): HTMLButtonElement;
    querySelector(selectors: "canvas"): HTMLCanvasElement;
    querySelector(selectors: "caption"): HTMLTableCaptionElement;
    querySelector(selectors: "center"): HTMLElement;
    querySelector(selectors: "circle"): SVGCircleElement;
    querySelector(selectors: "cite"): HTMLElement;
    querySelector(selectors: "clippath"): SVGClipPathElement;
    querySelector(selectors: "code"): HTMLElement;
    querySelector(selectors: "col"): HTMLTableColElement;
    querySelector(selectors: "colgroup"): HTMLTableColElement;
    querySelector(selectors: "datalist"): HTMLDataListElement;
    querySelector(selectors: "dd"): HTMLElement;
    querySelector(selectors: "defs"): SVGDefsElement;
    querySelector(selectors: "del"): HTMLModElement;
    querySelector(selectors: "desc"): SVGDescElement;
    querySelector(selectors: "dfn"): HTMLElement;
    querySelector(selectors: "dir"): HTMLDirectoryElement;
    querySelector(selectors: "div"): HTMLDivElement;
    querySelector(selectors: "dl"): HTMLDListElement;
    querySelector(selectors: "dt"): HTMLElement;
    querySelector(selectors: "ellipse"): SVGEllipseElement;
    querySelector(selectors: "em"): HTMLElement;
    querySelector(selectors: "embed"): HTMLEmbedElement;
    querySelector(selectors: "feblend"): SVGFEBlendElement;
    querySelector(selectors: "fecolormatrix"): SVGFEColorMatrixElement;
    querySelector(selectors: "fecomponenttransfer"): SVGFEComponentTransferElement;
    querySelector(selectors: "fecomposite"): SVGFECompositeElement;
    querySelector(selectors: "feconvolvematrix"): SVGFEConvolveMatrixElement;
    querySelector(selectors: "fediffuselighting"): SVGFEDiffuseLightingElement;
    querySelector(selectors: "fedisplacementmap"): SVGFEDisplacementMapElement;
    querySelector(selectors: "fedistantlight"): SVGFEDistantLightElement;
    querySelector(selectors: "feflood"): SVGFEFloodElement;
    querySelector(selectors: "fefunca"): SVGFEFuncAElement;
    querySelector(selectors: "fefuncb"): SVGFEFuncBElement;
    querySelector(selectors: "fefuncg"): SVGFEFuncGElement;
    querySelector(selectors: "fefuncr"): SVGFEFuncRElement;
    querySelector(selectors: "fegaussianblur"): SVGFEGaussianBlurElement;
    querySelector(selectors: "feimage"): SVGFEImageElement;
    querySelector(selectors: "femerge"): SVGFEMergeElement;
    querySelector(selectors: "femergenode"): SVGFEMergeNodeElement;
    querySelector(selectors: "femorphology"): SVGFEMorphologyElement;
    querySelector(selectors: "feoffset"): SVGFEOffsetElement;
    querySelector(selectors: "fepointlight"): SVGFEPointLightElement;
    querySelector(selectors: "fespecularlighting"): SVGFESpecularLightingElement;
    querySelector(selectors: "fespotlight"): SVGFESpotLightElement;
    querySelector(selectors: "fetile"): SVGFETileElement;
    querySelector(selectors: "feturbulence"): SVGFETurbulenceElement;
    querySelector(selectors: "fieldset"): HTMLFieldSetElement;
    querySelector(selectors: "figcaption"): HTMLElement;
    querySelector(selectors: "figure"): HTMLElement;
    querySelector(selectors: "filter"): SVGFilterElement;
    querySelector(selectors: "font"): HTMLFontElement;
    querySelector(selectors: "footer"): HTMLElement;
    querySelector(selectors: "foreignobject"): SVGForeignObjectElement;
    querySelector(selectors: "form"): HTMLFormElement;
    querySelector(selectors: "frame"): HTMLFrameElement;
    querySelector(selectors: "frameset"): HTMLFrameSetElement;
    querySelector(selectors: "g"): SVGGElement;
    querySelector(selectors: "h1"): HTMLHeadingElement;
    querySelector(selectors: "h2"): HTMLHeadingElement;
    querySelector(selectors: "h3"): HTMLHeadingElement;
    querySelector(selectors: "h4"): HTMLHeadingElement;
    querySelector(selectors: "h5"): HTMLHeadingElement;
    querySelector(selectors: "h6"): HTMLHeadingElement;
    querySelector(selectors: "head"): HTMLHeadElement;
    querySelector(selectors: "header"): HTMLElement;
    querySelector(selectors: "hgroup"): HTMLElement;
    querySelector(selectors: "hr"): HTMLHRElement;
    querySelector(selectors: "html"): HTMLHtmlElement;
    querySelector(selectors: "i"): HTMLElement;
    querySelector(selectors: "iframe"): HTMLIFrameElement;
    querySelector(selectors: "image"): SVGImageElement;
    querySelector(selectors: "img"): HTMLImageElement;
    querySelector(selectors: "input"): HTMLInputElement;
    querySelector(selectors: "ins"): HTMLModElement;
    querySelector(selectors: "isindex"): HTMLUnknownElement;
    querySelector(selectors: "kbd"): HTMLElement;
    querySelector(selectors: "keygen"): HTMLElement;
    querySelector(selectors: "label"): HTMLLabelElement;
    querySelector(selectors: "legend"): HTMLLegendElement;
    querySelector(selectors: "li"): HTMLLIElement;
    querySelector(selectors: "line"): SVGLineElement;
    querySelector(selectors: "lineargradient"): SVGLinearGradientElement;
    querySelector(selectors: "link"): HTMLLinkElement;
    querySelector(selectors: "listing"): HTMLPreElement;
    querySelector(selectors: "map"): HTMLMapElement;
    querySelector(selectors: "mark"): HTMLElement;
    querySelector(selectors: "marker"): SVGMarkerElement;
    querySelector(selectors: "marquee"): HTMLMarqueeElement;
    querySelector(selectors: "mask"): SVGMaskElement;
    querySelector(selectors: "menu"): HTMLMenuElement;
    querySelector(selectors: "meta"): HTMLMetaElement;
    querySelector(selectors: "metadata"): SVGMetadataElement;
    querySelector(selectors: "meter"): HTMLMeterElement;
    querySelector(selectors: "nav"): HTMLElement;
    querySelector(selectors: "nextid"): HTMLUnknownElement;
    querySelector(selectors: "nobr"): HTMLElement;
    querySelector(selectors: "noframes"): HTMLElement;
    querySelector(selectors: "noscript"): HTMLElement;
    querySelector(selectors: "object"): HTMLObjectElement;
    querySelector(selectors: "ol"): HTMLOListElement;
    querySelector(selectors: "optgroup"): HTMLOptGroupElement;
    querySelector(selectors: "option"): HTMLOptionElement;
    querySelector(selectors: "p"): HTMLParagraphElement;
    querySelector(selectors: "param"): HTMLParamElement;
    querySelector(selectors: "path"): SVGPathElement;
    querySelector(selectors: "pattern"): SVGPatternElement;
    querySelector(selectors: "picture"): HTMLPictureElement;
    querySelector(selectors: "plaintext"): HTMLElement;
    querySelector(selectors: "polygon"): SVGPolygonElement;
    querySelector(selectors: "polyline"): SVGPolylineElement;
    querySelector(selectors: "pre"): HTMLPreElement;
    querySelector(selectors: "progress"): HTMLProgressElement;
    querySelector(selectors: "q"): HTMLQuoteElement;
    querySelector(selectors: "radialgradient"): SVGRadialGradientElement;
    querySelector(selectors: "rect"): SVGRectElement;
    querySelector(selectors: "rt"): HTMLElement;
    querySelector(selectors: "ruby"): HTMLElement;
    querySelector(selectors: "s"): HTMLElement;
    querySelector(selectors: "samp"): HTMLElement;
    querySelector(selectors: "script"): HTMLScriptElement;
    querySelector(selectors: "section"): HTMLElement;
    querySelector(selectors: "select"): HTMLSelectElement;
    querySelector(selectors: "small"): HTMLElement;
    querySelector(selectors: "source"): HTMLSourceElement;
    querySelector(selectors: "span"): HTMLSpanElement;
    querySelector(selectors: "stop"): SVGStopElement;
    querySelector(selectors: "strike"): HTMLElement;
    querySelector(selectors: "strong"): HTMLElement;
    querySelector(selectors: "style"): HTMLStyleElement;
    querySelector(selectors: "sub"): HTMLElement;
    querySelector(selectors: "sup"): HTMLElement;
    querySelector(selectors: "svg"): SVGSVGElement;
    querySelector(selectors: "switch"): SVGSwitchElement;
    querySelector(selectors: "symbol"): SVGSymbolElement;
    querySelector(selectors: "table"): HTMLTableElement;
    querySelector(selectors: "tbody"): HTMLTableSectionElement;
    querySelector(selectors: "td"): HTMLTableDataCellElement;
    querySelector(selectors: "template"): HTMLTemplateElement;
    querySelector(selectors: "text"): SVGTextElement;
    querySelector(selectors: "textpath"): SVGTextPathElement;
    querySelector(selectors: "textarea"): HTMLTextAreaElement;
    querySelector(selectors: "tfoot"): HTMLTableSectionElement;
    querySelector(selectors: "th"): HTMLTableHeaderCellElement;
    querySelector(selectors: "thead"): HTMLTableSectionElement;
    querySelector(selectors: "title"): HTMLTitleElement;
    querySelector(selectors: "tr"): HTMLTableRowElement;
    querySelector(selectors: "track"): HTMLTrackElement;
    querySelector(selectors: "tspan"): SVGTSpanElement;
    querySelector(selectors: "tt"): HTMLElement;
    querySelector(selectors: "u"): HTMLElement;
    querySelector(selectors: "ul"): HTMLUListElement;
    querySelector(selectors: "use"): SVGUseElement;
    querySelector(selectors: "var"): HTMLElement;
    querySelector(selectors: "video"): HTMLVideoElement;
    querySelector(selectors: "view"): SVGViewElement;
    querySelector(selectors: "wbr"): HTMLElement;
    querySelector(selectors: "x-ms-webview"): MSHTMLWebViewElement;
    querySelector(selectors: "xmp"): HTMLPreElement;
    querySelector(selectors: string): Element;
    querySelectorAll(selectors: "a"): NodeListOf<HTMLAnchorElement>;
    querySelectorAll(selectors: "abbr"): NodeListOf<HTMLElement>;
    querySelectorAll(selectors: "acronym"): NodeListOf<HTMLElement>;
    querySelectorAll(selectors: "address"): NodeListOf<HTMLElement>;
    querySelectorAll(selectors: "applet"): NodeListOf<HTMLAppletElement>;
    querySelectorAll(selectors: "area"): NodeListOf<HTMLAreaElement>;
    querySelectorAll(selectors: "article"): NodeListOf<HTMLElement>;
    querySelectorAll(selectors: "aside"): NodeListOf<HTMLElement>;
    querySelectorAll(selectors: "audio"): NodeListOf<HTMLAudioElement>;
    querySelectorAll(selectors: "b"): NodeListOf<HTMLElement>;
    querySelectorAll(selectors: "base"): NodeListOf<HTMLBaseElement>;
    querySelectorAll(selectors: "basefont"): NodeListOf<HTMLBaseFontElement>;
    querySelectorAll(selectors: "bdo"): NodeListOf<HTMLElement>;
    querySelectorAll(selectors: "big"): NodeListOf<HTMLElement>;
    querySelectorAll(selectors: "blockquote"): NodeListOf<HTMLQuoteElement>;
    querySelectorAll(selectors: "body"): NodeListOf<HTMLBodyElement>;
    querySelectorAll(selectors: "br"): NodeListOf<HTMLBRElement>;
    querySelectorAll(selectors: "button"): NodeListOf<HTMLButtonElement>;
    querySelectorAll(selectors: "canvas"): NodeListOf<HTMLCanvasElement>;
    querySelectorAll(selectors: "caption"): NodeListOf<HTMLTableCaptionElement>;
    querySelectorAll(selectors: "center"): NodeListOf<HTMLElement>;
    querySelectorAll(selectors: "circle"): NodeListOf<SVGCircleElement>;
    querySelectorAll(selectors: "cite"): NodeListOf<HTMLElement>;
    querySelectorAll(selectors: "clippath"): NodeListOf<SVGClipPathElement>;
    querySelectorAll(selectors: "code"): NodeListOf<HTMLElement>;
    querySelectorAll(selectors: "col"): NodeListOf<HTMLTableColElement>;
    querySelectorAll(selectors: "colgroup"): NodeListOf<HTMLTableColElement>;
    querySelectorAll(selectors: "datalist"): NodeListOf<HTMLDataListElement>;
    querySelectorAll(selectors: "dd"): NodeListOf<HTMLElement>;
    querySelectorAll(selectors: "defs"): NodeListOf<SVGDefsElement>;
    querySelectorAll(selectors: "del"): NodeListOf<HTMLModElement>;
    querySelectorAll(selectors: "desc"): NodeListOf<SVGDescElement>;
    querySelectorAll(selectors: "dfn"): NodeListOf<HTMLElement>;
    querySelectorAll(selectors: "dir"): NodeListOf<HTMLDirectoryElement>;
    querySelectorAll(selectors: "div"): NodeListOf<HTMLDivElement>;
    querySelectorAll(selectors: "dl"): NodeListOf<HTMLDListElement>;
    querySelectorAll(selectors: "dt"): NodeListOf<HTMLElement>;
    querySelectorAll(selectors: "ellipse"): NodeListOf<SVGEllipseElement>;
    querySelectorAll(selectors: "em"): NodeListOf<HTMLElement>;
    querySelectorAll(selectors: "embed"): NodeListOf<HTMLEmbedElement>;
    querySelectorAll(selectors: "feblend"): NodeListOf<SVGFEBlendElement>;
    querySelectorAll(selectors: "fecolormatrix"): NodeListOf<SVGFEColorMatrixElement>;
    querySelectorAll(selectors: "fecomponenttransfer"): NodeListOf<SVGFEComponentTransferElement>;
    querySelectorAll(selectors: "fecomposite"): NodeListOf<SVGFECompositeElement>;
    querySelectorAll(selectors: "feconvolvematrix"): NodeListOf<SVGFEConvolveMatrixElement>;
    querySelectorAll(selectors: "fediffuselighting"): NodeListOf<SVGFEDiffuseLightingElement>;
    querySelectorAll(selectors: "fedisplacementmap"): NodeListOf<SVGFEDisplacementMapElement>;
    querySelectorAll(selectors: "fedistantlight"): NodeListOf<SVGFEDistantLightElement>;
    querySelectorAll(selectors: "feflood"): NodeListOf<SVGFEFloodElement>;
    querySelectorAll(selectors: "fefunca"): NodeListOf<SVGFEFuncAElement>;
    querySelectorAll(selectors: "fefuncb"): NodeListOf<SVGFEFuncBElement>;
    querySelectorAll(selectors: "fefuncg"): NodeListOf<SVGFEFuncGElement>;
    querySelectorAll(selectors: "fefuncr"): NodeListOf<SVGFEFuncRElement>;
    querySelectorAll(selectors: "fegaussianblur"): NodeListOf<SVGFEGaussianBlurElement>;
    querySelectorAll(selectors: "feimage"): NodeListOf<SVGFEImageElement>;
    querySelectorAll(selectors: "femerge"): NodeListOf<SVGFEMergeElement>;
    querySelectorAll(selectors: "femergenode"): NodeListOf<SVGFEMergeNodeElement>;
    querySelectorAll(selectors: "femorphology"): NodeListOf<SVGFEMorphologyElement>;
    querySelectorAll(selectors: "feoffset"): NodeListOf<SVGFEOffsetElement>;
    querySelectorAll(selectors: "fepointlight"): NodeListOf<SVGFEPointLightElement>;
    querySelectorAll(selectors: "fespecularlighting"): NodeListOf<SVGFESpecularLightingElement>;
    querySelectorAll(selectors: "fespotlight"): NodeListOf<SVGFESpotLightElement>;
    querySelectorAll(selectors: "fetile"): NodeListOf<SVGFETileElement>;
    querySelectorAll(selectors: "feturbulence"): NodeListOf<SVGFETurbulenceElement>;
    querySelectorAll(selectors: "fieldset"): NodeListOf<HTMLFieldSetElement>;
    querySelectorAll(selectors: "figcaption"): NodeListOf<HTMLElement>;
    querySelectorAll(selectors: "figure"): NodeListOf<HTMLElement>;
    querySelectorAll(selectors: "filter"): NodeListOf<SVGFilterElement>;
    querySelectorAll(selectors: "font"): NodeListOf<HTMLFontElement>;
    querySelectorAll(selectors: "footer"): NodeListOf<HTMLElement>;
    querySelectorAll(selectors: "foreignobject"): NodeListOf<SVGForeignObjectElement>;
    querySelectorAll(selectors: "form"): NodeListOf<HTMLFormElement>;
    querySelectorAll(selectors: "frame"): NodeListOf<HTMLFrameElement>;
    querySelectorAll(selectors: "frameset"): NodeListOf<HTMLFrameSetElement>;
    querySelectorAll(selectors: "g"): NodeListOf<SVGGElement>;
    querySelectorAll(selectors: "h1"): NodeListOf<HTMLHeadingElement>;
    querySelectorAll(selectors: "h2"): NodeListOf<HTMLHeadingElement>;
    querySelectorAll(selectors: "h3"): NodeListOf<HTMLHeadingElement>;
    querySelectorAll(selectors: "h4"): NodeListOf<HTMLHeadingElement>;
    querySelectorAll(selectors: "h5"): NodeListOf<HTMLHeadingElement>;
    querySelectorAll(selectors: "h6"): NodeListOf<HTMLHeadingElement>;
    querySelectorAll(selectors: "head"): NodeListOf<HTMLHeadElement>;
    querySelectorAll(selectors: "header"): NodeListOf<HTMLElement>;
    querySelectorAll(selectors: "hgroup"): NodeListOf<HTMLElement>;
    querySelectorAll(selectors: "hr"): NodeListOf<HTMLHRElement>;
    querySelectorAll(selectors: "html"): NodeListOf<HTMLHtmlElement>;
    querySelectorAll(selectors: "i"): NodeListOf<HTMLElement>;
    querySelectorAll(selectors: "iframe"): NodeListOf<HTMLIFrameElement>;
    querySelectorAll(selectors: "image"): NodeListOf<SVGImageElement>;
    querySelectorAll(selectors: "img"): NodeListOf<HTMLImageElement>;
    querySelectorAll(selectors: "input"): NodeListOf<HTMLInputElement>;
    querySelectorAll(selectors: "ins"): NodeListOf<HTMLModElement>;
    querySelectorAll(selectors: "isindex"): NodeListOf<HTMLUnknownElement>;
    querySelectorAll(selectors: "kbd"): NodeListOf<HTMLElement>;
    querySelectorAll(selectors: "keygen"): NodeListOf<HTMLElement>;
    querySelectorAll(selectors: "label"): NodeListOf<HTMLLabelElement>;
    querySelectorAll(selectors: "legend"): NodeListOf<HTMLLegendElement>;
    querySelectorAll(selectors: "li"): NodeListOf<HTMLLIElement>;
    querySelectorAll(selectors: "line"): NodeListOf<SVGLineElement>;
    querySelectorAll(selectors: "lineargradient"): NodeListOf<SVGLinearGradientElement>;
    querySelectorAll(selectors: "link"): NodeListOf<HTMLLinkElement>;
    querySelectorAll(selectors: "listing"): NodeListOf<HTMLPreElement>;
    querySelectorAll(selectors: "map"): NodeListOf<HTMLMapElement>;
    querySelectorAll(selectors: "mark"): NodeListOf<HTMLElement>;
    querySelectorAll(selectors: "marker"): NodeListOf<SVGMarkerElement>;
    querySelectorAll(selectors: "marquee"): NodeListOf<HTMLMarqueeElement>;
    querySelectorAll(selectors: "mask"): NodeListOf<SVGMaskElement>;
    querySelectorAll(selectors: "menu"): NodeListOf<HTMLMenuElement>;
    querySelectorAll(selectors: "meta"): NodeListOf<HTMLMetaElement>;
    querySelectorAll(selectors: "metadata"): NodeListOf<SVGMetadataElement>;
    querySelectorAll(selectors: "meter"): NodeListOf<HTMLMeterElement>;
    querySelectorAll(selectors: "nav"): NodeListOf<HTMLElement>;
    querySelectorAll(selectors: "nextid"): NodeListOf<HTMLUnknownElement>;
    querySelectorAll(selectors: "nobr"): NodeListOf<HTMLElement>;
    querySelectorAll(selectors: "noframes"): NodeListOf<HTMLElement>;
    querySelectorAll(selectors: "noscript"): NodeListOf<HTMLElement>;
    querySelectorAll(selectors: "object"): NodeListOf<HTMLObjectElement>;
    querySelectorAll(selectors: "ol"): NodeListOf<HTMLOListElement>;
    querySelectorAll(selectors: "optgroup"): NodeListOf<HTMLOptGroupElement>;
    querySelectorAll(selectors: "option"): NodeListOf<HTMLOptionElement>;
    querySelectorAll(selectors: "p"): NodeListOf<HTMLParagraphElement>;
    querySelectorAll(selectors: "param"): NodeListOf<HTMLParamElement>;
    querySelectorAll(selectors: "path"): NodeListOf<SVGPathElement>;
    querySelectorAll(selectors: "pattern"): NodeListOf<SVGPatternElement>;
    querySelectorAll(selectors: "picture"): NodeListOf<HTMLPictureElement>;
    querySelectorAll(selectors: "plaintext"): NodeListOf<HTMLElement>;
    querySelectorAll(selectors: "polygon"): NodeListOf<SVGPolygonElement>;
    querySelectorAll(selectors: "polyline"): NodeListOf<SVGPolylineElement>;
    querySelectorAll(selectors: "pre"): NodeListOf<HTMLPreElement>;
    querySelectorAll(selectors: "progress"): NodeListOf<HTMLProgressElement>;
    querySelectorAll(selectors: "q"): NodeListOf<HTMLQuoteElement>;
    querySelectorAll(selectors: "radialgradient"): NodeListOf<SVGRadialGradientElement>;
    querySelectorAll(selectors: "rect"): NodeListOf<SVGRectElement>;
    querySelectorAll(selectors: "rt"): NodeListOf<HTMLElement>;
    querySelectorAll(selectors: "ruby"): NodeListOf<HTMLElement>;
    querySelectorAll(selectors: "s"): NodeListOf<HTMLElement>;
    querySelectorAll(selectors: "samp"): NodeListOf<HTMLElement>;
    querySelectorAll(selectors: "script"): NodeListOf<HTMLScriptElement>;
    querySelectorAll(selectors: "section"): NodeListOf<HTMLElement>;
    querySelectorAll(selectors: "select"): NodeListOf<HTMLSelectElement>;
    querySelectorAll(selectors: "small"): NodeListOf<HTMLElement>;
    querySelectorAll(selectors: "source"): NodeListOf<HTMLSourceElement>;
    querySelectorAll(selectors: "span"): NodeListOf<HTMLSpanElement>;
    querySelectorAll(selectors: "stop"): NodeListOf<SVGStopElement>;
    querySelectorAll(selectors: "strike"): NodeListOf<HTMLElement>;
    querySelectorAll(selectors: "strong"): NodeListOf<HTMLElement>;
    querySelectorAll(selectors: "style"): NodeListOf<HTMLStyleElement>;
    querySelectorAll(selectors: "sub"): NodeListOf<HTMLElement>;
    querySelectorAll(selectors: "sup"): NodeListOf<HTMLElement>;
    querySelectorAll(selectors: "svg"): NodeListOf<SVGSVGElement>;
    querySelectorAll(selectors: "switch"): NodeListOf<SVGSwitchElement>;
    querySelectorAll(selectors: "symbol"): NodeListOf<SVGSymbolElement>;
    querySelectorAll(selectors: "table"): NodeListOf<HTMLTableElement>;
    querySelectorAll(selectors: "tbody"): NodeListOf<HTMLTableSectionElement>;
    querySelectorAll(selectors: "td"): NodeListOf<HTMLTableDataCellElement>;
    querySelectorAll(selectors: "template"): NodeListOf<HTMLTemplateElement>;
    querySelectorAll(selectors: "text"): NodeListOf<SVGTextElement>;
    querySelectorAll(selectors: "textpath"): NodeListOf<SVGTextPathElement>;
    querySelectorAll(selectors: "textarea"): NodeListOf<HTMLTextAreaElement>;
    querySelectorAll(selectors: "tfoot"): NodeListOf<HTMLTableSectionElement>;
    querySelectorAll(selectors: "th"): NodeListOf<HTMLTableHeaderCellElement>;
    querySelectorAll(selectors: "thead"): NodeListOf<HTMLTableSectionElement>;
    querySelectorAll(selectors: "title"): NodeListOf<HTMLTitleElement>;
    querySelectorAll(selectors: "tr"): NodeListOf<HTMLTableRowElement>;
    querySelectorAll(selectors: "track"): NodeListOf<HTMLTrackElement>;
    querySelectorAll(selectors: "tspan"): NodeListOf<SVGTSpanElement>;
    querySelectorAll(selectors: "tt"): NodeListOf<HTMLElement>;
    querySelectorAll(selectors: "u"): NodeListOf<HTMLElement>;
    querySelectorAll(selectors: "ul"): NodeListOf<HTMLUListElement>;
    querySelectorAll(selectors: "use"): NodeListOf<SVGUseElement>;
    querySelectorAll(selectors: "var"): NodeListOf<HTMLElement>;
    querySelectorAll(selectors: "video"): NodeListOf<HTMLVideoElement>;
    querySelectorAll(selectors: "view"): NodeListOf<SVGViewElement>;
    querySelectorAll(selectors: "wbr"): NodeListOf<HTMLElement>;
    querySelectorAll(selectors: "x-ms-webview"): NodeListOf<MSHTMLWebViewElement>;
    querySelectorAll(selectors: "xmp"): NodeListOf<HTMLPreElement>;
    querySelectorAll(selectors: string): NodeListOf<Element>;
}

interface RandomSource {
    getRandomValues(array: ArrayBufferView): ArrayBufferView;
}

interface SVGAnimatedPathData {
    readonly pathSegList: SVGPathSegList;
}

interface SVGAnimatedPoints {
    readonly animatedPoints: SVGPointList;
    readonly points: SVGPointList;
}

interface SVGExternalResourcesRequired {
    readonly externalResourcesRequired: SVGAnimatedBoolean;
}

interface SVGFilterPrimitiveStandardAttributes extends SVGStylable {
    readonly height: SVGAnimatedLength;
    readonly result: SVGAnimatedString;
    readonly width: SVGAnimatedLength;
    readonly x: SVGAnimatedLength;
    readonly y: SVGAnimatedLength;
}

interface SVGFitToViewBox {
    readonly preserveAspectRatio: SVGAnimatedPreserveAspectRatio;
    readonly viewBox: SVGAnimatedRect;
}

interface SVGLangSpace {
    xmllang: string;
    xmlspace: string;
}

interface SVGLocatable {
    readonly farthestViewportElement: SVGElement;
    readonly nearestViewportElement: SVGElement;
    getBBox(): SVGRect;
    getCTM(): SVGMatrix;
    getScreenCTM(): SVGMatrix;
    getTransformToElement(element: SVGElement): SVGMatrix;
}

interface SVGStylable {
    className: any;
    readonly style: CSSStyleDeclaration;
}

interface SVGTests {
    readonly requiredExtensions: SVGStringList;
    readonly requiredFeatures: SVGStringList;
    readonly systemLanguage: SVGStringList;
    hasExtension(extension: string): boolean;
}

interface SVGTransformable extends SVGLocatable {
    readonly transform: SVGAnimatedTransformList;
}

interface SVGURIReference {
    readonly href: SVGAnimatedString;
}

interface WindowBase64 {
    atob(encodedString: string): string;
    btoa(rawString: string): string;
}

interface WindowConsole {
    readonly console: Console;
}

interface WindowLocalStorage {
    readonly localStorage: Storage;
}

interface WindowSessionStorage {
    readonly sessionStorage: Storage;
}

interface WindowTimers extends Object, WindowTimersExtension {
    clearInterval(handle: number): void;
    clearTimeout(handle: number): void;
    setInterval(handler: (...args: any[]) => void, timeout: number): number;
    setInterval(handler: any, timeout?: any, ...args: any[]): number;
    setTimeout(handler: (...args: any[]) => void, timeout: number): number;
    setTimeout(handler: any, timeout?: any, ...args: any[]): number;
}

interface WindowTimersExtension {
    clearImmediate(handle: number): void;
    setImmediate(handler: (...args: any[]) => void): number;
    setImmediate(handler: any, ...args: any[]): number;
}

interface XMLHttpRequestEventTarget {
    onabort: (this: this, ev: Event) => any;
    onerror: (this: this, ev: ErrorEvent) => any;
    onload: (this: this, ev: Event) => any;
    onloadend: (this: this, ev: ProgressEvent) => any;
    onloadstart: (this: this, ev: Event) => any;
    onprogress: (this: this, ev: ProgressEvent) => any;
    ontimeout: (this: this, ev: ProgressEvent) => any;
    addEventListener(type: "abort", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "error", listener: (this: this, ev: ErrorEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "load", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "loadend", listener: (this: this, ev: ProgressEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "loadstart", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "progress", listener: (this: this, ev: ProgressEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "timeout", listener: (this: this, ev: ProgressEvent) => any, useCapture?: boolean): void;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

interface StorageEventInit extends EventInit {
    key?: string;
    oldValue?: string;
    newValue?: string;
    url: string;
    storageArea?: Storage;
}

interface Canvas2DContextAttributes {
    alpha?: boolean;
    willReadFrequently?: boolean;
    storage?: boolean;
    [attribute: string]: boolean | string | undefined;
}

interface NodeListOf<TNode extends Node> extends NodeList {
    length: number;
    item(index: number): TNode;
    [index: number]: TNode;
}

interface HTMLCollectionOf<T extends Element> extends HTMLCollection {
    item(index: number): T;
    namedItem(name: string): T;
    [index: number]: T;
}

interface BlobPropertyBag {
    type?: string;
    endings?: string;
}

interface FilePropertyBag {
    type?: string;
    lastModified?: number;
}

interface EventListenerObject {
    handleEvent(evt: Event): void;
}

interface MessageEventInit extends EventInit {
    data?: any;
    origin?: string;
    lastEventId?: string;
    channel?: string;
    source?: any;
    ports?: MessagePort[];
}

interface ProgressEventInit extends EventInit {
    lengthComputable?: boolean;
    loaded?: number;
    total?: number;
}

interface ScrollOptions {
    behavior?: ScrollBehavior;
}

interface ScrollToOptions extends ScrollOptions {
    left?: number;
    top?: number;
}

interface ScrollIntoViewOptions extends ScrollOptions {
    block?: ScrollLogicalPosition;
    inline?: ScrollLogicalPosition;
}

interface ClipboardEventInit extends EventInit {
    data?: string;
    dataType?: string;
}

interface IDBArrayKey extends Array<IDBValidKey> {
}

interface RsaKeyGenParams extends Algorithm {
    modulusLength: number;
    publicExponent: Uint8Array;
}

interface RsaHashedKeyGenParams extends RsaKeyGenParams {
    hash: AlgorithmIdentifier;
}

interface RsaKeyAlgorithm extends KeyAlgorithm {
    modulusLength: number;
    publicExponent: Uint8Array;
}

interface RsaHashedKeyAlgorithm extends RsaKeyAlgorithm {
    hash: AlgorithmIdentifier;
}

interface RsaHashedImportParams {
    hash: AlgorithmIdentifier;
}

interface RsaPssParams {
    saltLength: number;
}

interface RsaOaepParams extends Algorithm {
    label?: BufferSource;
}

interface EcdsaParams extends Algorithm {
    hash: AlgorithmIdentifier;
}

interface EcKeyGenParams extends Algorithm {
    namedCurve: string;
}

interface EcKeyAlgorithm extends KeyAlgorithm {
    typedCurve: string;
}

interface EcKeyImportParams {
    namedCurve: string;
}

interface EcdhKeyDeriveParams extends Algorithm {
    public: CryptoKey;
}

interface AesCtrParams extends Algorithm {
    counter: BufferSource;
    length: number;
}

interface AesKeyAlgorithm extends KeyAlgorithm {
    length: number;
}

interface AesKeyGenParams extends Algorithm {
    length: number;
}

interface AesDerivedKeyParams extends Algorithm {
    length: number;
}

interface AesCbcParams extends Algorithm {
    iv: BufferSource;
}

interface AesCmacParams extends Algorithm {
    length: number;
}

interface AesGcmParams extends Algorithm {
    iv: BufferSource;
    additionalData?: BufferSource;
    tagLength?: number;
}

interface AesCfbParams extends Algorithm {
    iv: BufferSource;
}

interface HmacImportParams extends Algorithm {
    hash?: AlgorithmIdentifier;
    length?: number;
}

interface HmacKeyAlgorithm extends KeyAlgorithm {
    hash: AlgorithmIdentifier;
    length: number;
}

interface HmacKeyGenParams extends Algorithm {
    hash: AlgorithmIdentifier;
    length?: number;
}

interface DhKeyGenParams extends Algorithm {
    prime: Uint8Array;
    generator: Uint8Array;
}

interface DhKeyAlgorithm extends KeyAlgorithm {
    prime: Uint8Array;
    generator: Uint8Array;
}

interface DhKeyDeriveParams extends Algorithm {
    public: CryptoKey;
}

interface DhImportKeyParams extends Algorithm {
    prime: Uint8Array;
    generator: Uint8Array;
}

interface ConcatParams extends Algorithm {
    hash?: AlgorithmIdentifier;
    algorithmId: Uint8Array;
    partyUInfo: Uint8Array;
    partyVInfo: Uint8Array;
    publicInfo?: Uint8Array;
    privateInfo?: Uint8Array;
}

interface HkdfCtrParams extends Algorithm {
    hash: AlgorithmIdentifier;
    label: BufferSource;
    context: BufferSource;
}

interface Pbkdf2Params extends Algorithm {
    salt: BufferSource;
    iterations: number;
    hash: AlgorithmIdentifier;
}

interface RsaOtherPrimesInfo {
    r: string;
    d: string;
    t: string;
}

interface JsonWebKey {
    kty: string;
    use?: string;
    key_ops?: string[];
    alg?: string;
    kid?: string;
    x5u?: string;
    x5c?: string;
    x5t?: string;
    ext?: boolean;
    crv?: string;
    x?: string;
    y?: string;
    d?: string;
    n?: string;
    e?: string;
    p?: string;
    q?: string;
    dp?: string;
    dq?: string;
    qi?: string;
    oth?: RsaOtherPrimesInfo[];
    k?: string;
}

interface ParentNode {
    readonly children: HTMLCollection;
    readonly firstElementChild: Element;
    readonly lastElementChild: Element;
    readonly childElementCount: number;
}

declare type EventListenerOrEventListenerObject = EventListener | EventListenerObject;

interface ErrorEventHandler {
    (message: string, filename?: string, lineno?: number, colno?: number, error?:Error): void;
}
interface PositionCallback {
    (position: Position): void;
}
interface PositionErrorCallback {
    (error: PositionError): void;
}
interface MediaQueryListListener {
    (mql: MediaQueryList): void;
}
interface MSLaunchUriCallback {
    (): void;
}
interface FrameRequestCallback {
    (time: number): void;
}
interface MSUnsafeFunctionCallback {
    (): any;
}
interface MSExecAtPriorityFunctionCallback {
    (...args: any[]): any;
}
interface MutationCallback {
    (mutations: MutationRecord[], observer: MutationObserver): void;
}
interface DecodeSuccessCallback {
    (decodedData: AudioBuffer): void;
}
interface DecodeErrorCallback {
    (error: DOMException): void;
}
interface FunctionStringCallback {
    (data: string): void;
}
interface NavigatorUserMediaSuccessCallback {
    (stream: MediaStream): void;
}
interface NavigatorUserMediaErrorCallback {
    (error: MediaStreamError): void;
}
interface ForEachCallback {
    (keyId: any, status: string): void;
}
declare var Audio: {new(src?: string): HTMLAudioElement; };
declare var Image: {new(width?: number, height?: number): HTMLImageElement; };
declare var Option: {new(text?: string, value?: string, defaultSelected?: boolean, selected?: boolean): HTMLOptionElement; };
declare var applicationCache: ApplicationCache;
declare var clientInformation: Navigator;
declare var closed: boolean;
declare var crypto: Crypto;
declare var defaultStatus: string;
declare var devicePixelRatio: number;
declare var doNotTrack: string;
declare var document: Document;
declare var event: Event;
declare var external: External;
declare var frameElement: Element;
declare var frames: Window;
declare var history: History;
declare var innerHeight: number;
declare var innerWidth: number;
declare var length: number;
declare var location: Location;
declare var locationbar: BarProp;
declare var menubar: BarProp;
declare var msCredentials: MSCredentials;
declare const name: never;
declare var navigator: Navigator;
declare var offscreenBuffering: string | boolean;
declare var onabort: (this: Window, ev: UIEvent) => any;
declare var onafterprint: (this: Window, ev: Event) => any;
declare var onbeforeprint: (this: Window, ev: Event) => any;
declare var onbeforeunload: (this: Window, ev: BeforeUnloadEvent) => any;
declare var onblur: (this: Window, ev: FocusEvent) => any;
declare var oncanplay: (this: Window, ev: Event) => any;
declare var oncanplaythrough: (this: Window, ev: Event) => any;
declare var onchange: (this: Window, ev: Event) => any;
declare var onclick: (this: Window, ev: MouseEvent) => any;
declare var oncompassneedscalibration: (this: Window, ev: Event) => any;
declare var oncontextmenu: (this: Window, ev: PointerEvent) => any;
declare var ondblclick: (this: Window, ev: MouseEvent) => any;
declare var ondevicelight: (this: Window, ev: DeviceLightEvent) => any;
declare var ondevicemotion: (this: Window, ev: DeviceMotionEvent) => any;
declare var ondeviceorientation: (this: Window, ev: DeviceOrientationEvent) => any;
declare var ondrag: (this: Window, ev: DragEvent) => any;
declare var ondragend: (this: Window, ev: DragEvent) => any;
declare var ondragenter: (this: Window, ev: DragEvent) => any;
declare var ondragleave: (this: Window, ev: DragEvent) => any;
declare var ondragover: (this: Window, ev: DragEvent) => any;
declare var ondragstart: (this: Window, ev: DragEvent) => any;
declare var ondrop: (this: Window, ev: DragEvent) => any;
declare var ondurationchange: (this: Window, ev: Event) => any;
declare var onemptied: (this: Window, ev: Event) => any;
declare var onended: (this: Window, ev: MediaStreamErrorEvent) => any;
declare var onerror: ErrorEventHandler;
declare var onfocus: (this: Window, ev: FocusEvent) => any;
declare var onhashchange: (this: Window, ev: HashChangeEvent) => any;
declare var oninput: (this: Window, ev: Event) => any;
declare var oninvalid: (this: Window, ev: Event) => any;
declare var onkeydown: (this: Window, ev: KeyboardEvent) => any;
declare var onkeypress: (this: Window, ev: KeyboardEvent) => any;
declare var onkeyup: (this: Window, ev: KeyboardEvent) => any;
declare var onload: (this: Window, ev: Event) => any;
declare var onloadeddata: (this: Window, ev: Event) => any;
declare var onloadedmetadata: (this: Window, ev: Event) => any;
declare var onloadstart: (this: Window, ev: Event) => any;
declare var onmessage: (this: Window, ev: MessageEvent) => any;
declare var onmousedown: (this: Window, ev: MouseEvent) => any;
declare var onmouseenter: (this: Window, ev: MouseEvent) => any;
declare var onmouseleave: (this: Window, ev: MouseEvent) => any;
declare var onmousemove: (this: Window, ev: MouseEvent) => any;
declare var onmouseout: (this: Window, ev: MouseEvent) => any;
declare var onmouseover: (this: Window, ev: MouseEvent) => any;
declare var onmouseup: (this: Window, ev: MouseEvent) => any;
declare var onmousewheel: (this: Window, ev: WheelEvent) => any;
declare var onmsgesturechange: (this: Window, ev: MSGestureEvent) => any;
declare var onmsgesturedoubletap: (this: Window, ev: MSGestureEvent) => any;
declare var onmsgestureend: (this: Window, ev: MSGestureEvent) => any;
declare var onmsgesturehold: (this: Window, ev: MSGestureEvent) => any;
declare var onmsgesturestart: (this: Window, ev: MSGestureEvent) => any;
declare var onmsgesturetap: (this: Window, ev: MSGestureEvent) => any;
declare var onmsinertiastart: (this: Window, ev: MSGestureEvent) => any;
declare var onmspointercancel: (this: Window, ev: MSPointerEvent) => any;
declare var onmspointerdown: (this: Window, ev: MSPointerEvent) => any;
declare var onmspointerenter: (this: Window, ev: MSPointerEvent) => any;
declare var onmspointerleave: (this: Window, ev: MSPointerEvent) => any;
declare var onmspointermove: (this: Window, ev: MSPointerEvent) => any;
declare var onmspointerout: (this: Window, ev: MSPointerEvent) => any;
declare var onmspointerover: (this: Window, ev: MSPointerEvent) => any;
declare var onmspointerup: (this: Window, ev: MSPointerEvent) => any;
declare var onoffline: (this: Window, ev: Event) => any;
declare var ononline: (this: Window, ev: Event) => any;
declare var onorientationchange: (this: Window, ev: Event) => any;
declare var onpagehide: (this: Window, ev: PageTransitionEvent) => any;
declare var onpageshow: (this: Window, ev: PageTransitionEvent) => any;
declare var onpause: (this: Window, ev: Event) => any;
declare var onplay: (this: Window, ev: Event) => any;
declare var onplaying: (this: Window, ev: Event) => any;
declare var onpopstate: (this: Window, ev: PopStateEvent) => any;
declare var onprogress: (this: Window, ev: ProgressEvent) => any;
declare var onratechange: (this: Window, ev: Event) => any;
declare var onreadystatechange: (this: Window, ev: ProgressEvent) => any;
declare var onreset: (this: Window, ev: Event) => any;
declare var onresize: (this: Window, ev: UIEvent) => any;
declare var onscroll: (this: Window, ev: UIEvent) => any;
declare var onseeked: (this: Window, ev: Event) => any;
declare var onseeking: (this: Window, ev: Event) => any;
declare var onselect: (this: Window, ev: UIEvent) => any;
declare var onstalled: (this: Window, ev: Event) => any;
declare var onstorage: (this: Window, ev: StorageEvent) => any;
declare var onsubmit: (this: Window, ev: Event) => any;
declare var onsuspend: (this: Window, ev: Event) => any;
declare var ontimeupdate: (this: Window, ev: Event) => any;
declare var ontouchcancel: (ev: TouchEvent) => any;
declare var ontouchend: (ev: TouchEvent) => any;
declare var ontouchmove: (ev: TouchEvent) => any;
declare var ontouchstart: (ev: TouchEvent) => any;
declare var onunload: (this: Window, ev: Event) => any;
declare var onvolumechange: (this: Window, ev: Event) => any;
declare var onwaiting: (this: Window, ev: Event) => any;
declare var opener: any;
declare var orientation: string | number;
declare var outerHeight: number;
declare var outerWidth: number;
declare var pageXOffset: number;
declare var pageYOffset: number;
declare var parent: Window;
declare var performance: Performance;
declare var personalbar: BarProp;
declare var screen: Screen;
declare var screenLeft: number;
declare var screenTop: number;
declare var screenX: number;
declare var screenY: number;
declare var scrollX: number;
declare var scrollY: number;
declare var scrollbars: BarProp;
declare var self: Window;
declare var status: string;
declare var statusbar: BarProp;
declare var styleMedia: StyleMedia;
declare var toolbar: BarProp;
declare var top: Window;
declare var window: Window;
declare function alert(message?: any): void;
declare function blur(): void;
declare function cancelAnimationFrame(handle: number): void;
declare function captureEvents(): void;
declare function close(): void;
declare function confirm(message?: string): boolean;
declare function focus(): void;
declare function getComputedStyle(elt: Element, pseudoElt?: string): CSSStyleDeclaration;
declare function getMatchedCSSRules(elt: Element, pseudoElt?: string): CSSRuleList;
declare function getSelection(): Selection;
declare function matchMedia(mediaQuery: string): MediaQueryList;
declare function moveBy(x?: number, y?: number): void;
declare function moveTo(x?: number, y?: number): void;
declare function msWriteProfilerMark(profilerMarkName: string): void;
declare function open(url?: string, target?: string, features?: string, replace?: boolean): Window;
declare function postMessage(message: any, targetOrigin: string, transfer?: any[]): void;
declare function print(): void;
declare function prompt(message?: string, _default?: string): string | null;
declare function releaseEvents(): void;
declare function requestAnimationFrame(callback: FrameRequestCallback): number;
declare function resizeBy(x?: number, y?: number): void;
declare function resizeTo(x?: number, y?: number): void;
declare function scroll(x?: number, y?: number): void;
declare function scrollBy(x?: number, y?: number): void;
declare function scrollTo(x?: number, y?: number): void;
declare function webkitCancelAnimationFrame(handle: number): void;
declare function webkitConvertPointFromNodeToPage(node: Node, pt: WebKitPoint): WebKitPoint;
declare function webkitConvertPointFromPageToNode(node: Node, pt: WebKitPoint): WebKitPoint;
declare function webkitRequestAnimationFrame(callback: FrameRequestCallback): number;
declare function scroll(options?: ScrollToOptions): void;
declare function scrollTo(options?: ScrollToOptions): void;
declare function scrollBy(options?: ScrollToOptions): void;
declare function toString(): string;
declare function addEventListener(type: string, listener?: EventListenerOrEventListenerObject, useCapture?: boolean): void;
declare function dispatchEvent(evt: Event): boolean;
declare function removeEventListener(type: string, listener?: EventListenerOrEventListenerObject, useCapture?: boolean): void;
declare function clearInterval(handle: number): void;
declare function clearTimeout(handle: number): void;
declare function setInterval(handler: (...args: any[]) => void, timeout: number): number;
declare function setInterval(handler: any, timeout?: any, ...args: any[]): number;
declare function setTimeout(handler: (...args: any[]) => void, timeout: number): number;
declare function setTimeout(handler: any, timeout?: any, ...args: any[]): number;
declare function clearImmediate(handle: number): void;
declare function setImmediate(handler: (...args: any[]) => void): number;
declare function setImmediate(handler: any, ...args: any[]): number;
declare var sessionStorage: Storage;
declare var localStorage: Storage;
declare var console: Console;
declare var onpointercancel: (this: Window, ev: PointerEvent) => any;
declare var onpointerdown: (this: Window, ev: PointerEvent) => any;
declare var onpointerenter: (this: Window, ev: PointerEvent) => any;
declare var onpointerleave: (this: Window, ev: PointerEvent) => any;
declare var onpointermove: (this: Window, ev: PointerEvent) => any;
declare var onpointerout: (this: Window, ev: PointerEvent) => any;
declare var onpointerover: (this: Window, ev: PointerEvent) => any;
declare var onpointerup: (this: Window, ev: PointerEvent) => any;
declare var onwheel: (this: Window, ev: WheelEvent) => any;
declare var indexedDB: IDBFactory;
declare function atob(encodedString: string): string;
declare function btoa(rawString: string): string;
declare function addEventListener(type: "MSGestureChange", listener: (this: Window, ev: MSGestureEvent) => any, useCapture?: boolean): void;
declare function addEventListener(type: "MSGestureDoubleTap", listener: (this: Window, ev: MSGestureEvent) => any, useCapture?: boolean): void;
declare function addEventListener(type: "MSGestureEnd", listener: (this: Window, ev: MSGestureEvent) => any, useCapture?: boolean): void;
declare function addEventListener(type: "MSGestureHold", listener: (this: Window, ev: MSGestureEvent) => any, useCapture?: boolean): void;
declare function addEventListener(type: "MSGestureStart", listener: (this: Window, ev: MSGestureEvent) => any, useCapture?: boolean): void;
declare function addEventListener(type: "MSGestureTap", listener: (this: Window, ev: MSGestureEvent) => any, useCapture?: boolean): void;
declare function addEventListener(type: "MSInertiaStart", listener: (this: Window, ev: MSGestureEvent) => any, useCapture?: boolean): void;
declare function addEventListener(type: "MSPointerCancel", listener: (this: Window, ev: MSPointerEvent) => any, useCapture?: boolean): void;
declare function addEventListener(type: "MSPointerDown", listener: (this: Window, ev: MSPointerEvent) => any, useCapture?: boolean): void;
declare function addEventListener(type: "MSPointerEnter", listener: (this: Window, ev: MSPointerEvent) => any, useCapture?: boolean): void;
declare function addEventListener(type: "MSPointerLeave", listener: (this: Window, ev: MSPointerEvent) => any, useCapture?: boolean): void;
declare function addEventListener(type: "MSPointerMove", listener: (this: Window, ev: MSPointerEvent) => any, useCapture?: boolean): void;
declare function addEventListener(type: "MSPointerOut", listener: (this: Window, ev: MSPointerEvent) => any, useCapture?: boolean): void;
declare function addEventListener(type: "MSPointerOver", listener: (this: Window, ev: MSPointerEvent) => any, useCapture?: boolean): void;
declare function addEventListener(type: "MSPointerUp", listener: (this: Window, ev: MSPointerEvent) => any, useCapture?: boolean): void;
declare function addEventListener(type: "abort", listener: (this: Window, ev: UIEvent) => any, useCapture?: boolean): void;
declare function addEventListener(type: "afterprint", listener: (this: Window, ev: Event) => any, useCapture?: boolean): void;
declare function addEventListener(type: "beforeprint", listener: (this: Window, ev: Event) => any, useCapture?: boolean): void;
declare function addEventListener(type: "beforeunload", listener: (this: Window, ev: BeforeUnloadEvent) => any, useCapture?: boolean): void;
declare function addEventListener(type: "blur", listener: (this: Window, ev: FocusEvent) => any, useCapture?: boolean): void;
declare function addEventListener(type: "canplay", listener: (this: Window, ev: Event) => any, useCapture?: boolean): void;
declare function addEventListener(type: "canplaythrough", listener: (this: Window, ev: Event) => any, useCapture?: boolean): void;
declare function addEventListener(type: "change", listener: (this: Window, ev: Event) => any, useCapture?: boolean): void;
declare function addEventListener(type: "click", listener: (this: Window, ev: MouseEvent) => any, useCapture?: boolean): void;
declare function addEventListener(type: "compassneedscalibration", listener: (this: Window, ev: Event) => any, useCapture?: boolean): void;
declare function addEventListener(type: "contextmenu", listener: (this: Window, ev: PointerEvent) => any, useCapture?: boolean): void;
declare function addEventListener(type: "dblclick", listener: (this: Window, ev: MouseEvent) => any, useCapture?: boolean): void;
declare function addEventListener(type: "devicelight", listener: (this: Window, ev: DeviceLightEvent) => any, useCapture?: boolean): void;
declare function addEventListener(type: "devicemotion", listener: (this: Window, ev: DeviceMotionEvent) => any, useCapture?: boolean): void;
declare function addEventListener(type: "deviceorientation", listener: (this: Window, ev: DeviceOrientationEvent) => any, useCapture?: boolean): void;
declare function addEventListener(type: "drag", listener: (this: Window, ev: DragEvent) => any, useCapture?: boolean): void;
declare function addEventListener(type: "dragend", listener: (this: Window, ev: DragEvent) => any, useCapture?: boolean): void;
declare function addEventListener(type: "dragenter", listener: (this: Window, ev: DragEvent) => any, useCapture?: boolean): void;
declare function addEventListener(type: "dragleave", listener: (this: Window, ev: DragEvent) => any, useCapture?: boolean): void;
declare function addEventListener(type: "dragover", listener: (this: Window, ev: DragEvent) => any, useCapture?: boolean): void;
declare function addEventListener(type: "dragstart", listener: (this: Window, ev: DragEvent) => any, useCapture?: boolean): void;
declare function addEventListener(type: "drop", listener: (this: Window, ev: DragEvent) => any, useCapture?: boolean): void;
declare function addEventListener(type: "durationchange", listener: (this: Window, ev: Event) => any, useCapture?: boolean): void;
declare function addEventListener(type: "emptied", listener: (this: Window, ev: Event) => any, useCapture?: boolean): void;
declare function addEventListener(type: "ended", listener: (this: Window, ev: MediaStreamErrorEvent) => any, useCapture?: boolean): void;
declare function addEventListener(type: "focus", listener: (this: Window, ev: FocusEvent) => any, useCapture?: boolean): void;
declare function addEventListener(type: "hashchange", listener: (this: Window, ev: HashChangeEvent) => any, useCapture?: boolean): void;
declare function addEventListener(type: "input", listener: (this: Window, ev: Event) => any, useCapture?: boolean): void;
declare function addEventListener(type: "invalid", listener: (this: Window, ev: Event) => any, useCapture?: boolean): void;
declare function addEventListener(type: "keydown", listener: (this: Window, ev: KeyboardEvent) => any, useCapture?: boolean): void;
declare function addEventListener(type: "keypress", listener: (this: Window, ev: KeyboardEvent) => any, useCapture?: boolean): void;
declare function addEventListener(type: "keyup", listener: (this: Window, ev: KeyboardEvent) => any, useCapture?: boolean): void;
declare function addEventListener(type: "load", listener: (this: Window, ev: Event) => any, useCapture?: boolean): void;
declare function addEventListener(type: "loadeddata", listener: (this: Window, ev: Event) => any, useCapture?: boolean): void;
declare function addEventListener(type: "loadedmetadata", listener: (this: Window, ev: Event) => any, useCapture?: boolean): void;
declare function addEventListener(type: "loadstart", listener: (this: Window, ev: Event) => any, useCapture?: boolean): void;
declare function addEventListener(type: "message", listener: (this: Window, ev: MessageEvent) => any, useCapture?: boolean): void;
declare function addEventListener(type: "mousedown", listener: (this: Window, ev: MouseEvent) => any, useCapture?: boolean): void;
declare function addEventListener(type: "mouseenter", listener: (this: Window, ev: MouseEvent) => any, useCapture?: boolean): void;
declare function addEventListener(type: "mouseleave", listener: (this: Window, ev: MouseEvent) => any, useCapture?: boolean): void;
declare function addEventListener(type: "mousemove", listener: (this: Window, ev: MouseEvent) => any, useCapture?: boolean): void;
declare function addEventListener(type: "mouseout", listener: (this: Window, ev: MouseEvent) => any, useCapture?: boolean): void;
declare function addEventListener(type: "mouseover", listener: (this: Window, ev: MouseEvent) => any, useCapture?: boolean): void;
declare function addEventListener(type: "mouseup", listener: (this: Window, ev: MouseEvent) => any, useCapture?: boolean): void;
declare function addEventListener(type: "mousewheel", listener: (this: Window, ev: WheelEvent) => any, useCapture?: boolean): void;
declare function addEventListener(type: "offline", listener: (this: Window, ev: Event) => any, useCapture?: boolean): void;
declare function addEventListener(type: "online", listener: (this: Window, ev: Event) => any, useCapture?: boolean): void;
declare function addEventListener(type: "orientationchange", listener: (this: Window, ev: Event) => any, useCapture?: boolean): void;
declare function addEventListener(type: "pagehide", listener: (this: Window, ev: PageTransitionEvent) => any, useCapture?: boolean): void;
declare function addEventListener(type: "pageshow", listener: (this: Window, ev: PageTransitionEvent) => any, useCapture?: boolean): void;
declare function addEventListener(type: "pause", listener: (this: Window, ev: Event) => any, useCapture?: boolean): void;
declare function addEventListener(type: "play", listener: (this: Window, ev: Event) => any, useCapture?: boolean): void;
declare function addEventListener(type: "playing", listener: (this: Window, ev: Event) => any, useCapture?: boolean): void;
declare function addEventListener(type: "pointercancel", listener: (this: Window, ev: PointerEvent) => any, useCapture?: boolean): void;
declare function addEventListener(type: "pointerdown", listener: (this: Window, ev: PointerEvent) => any, useCapture?: boolean): void;
declare function addEventListener(type: "pointerenter", listener: (this: Window, ev: PointerEvent) => any, useCapture?: boolean): void;
declare function addEventListener(type: "pointerleave", listener: (this: Window, ev: PointerEvent) => any, useCapture?: boolean): void;
declare function addEventListener(type: "pointermove", listener: (this: Window, ev: PointerEvent) => any, useCapture?: boolean): void;
declare function addEventListener(type: "pointerout", listener: (this: Window, ev: PointerEvent) => any, useCapture?: boolean): void;
declare function addEventListener(type: "pointerover", listener: (this: Window, ev: PointerEvent) => any, useCapture?: boolean): void;
declare function addEventListener(type: "pointerup", listener: (this: Window, ev: PointerEvent) => any, useCapture?: boolean): void;
declare function addEventListener(type: "popstate", listener: (this: Window, ev: PopStateEvent) => any, useCapture?: boolean): void;
declare function addEventListener(type: "progress", listener: (this: Window, ev: ProgressEvent) => any, useCapture?: boolean): void;
declare function addEventListener(type: "ratechange", listener: (this: Window, ev: Event) => any, useCapture?: boolean): void;
declare function addEventListener(type: "readystatechange", listener: (this: Window, ev: ProgressEvent) => any, useCapture?: boolean): void;
declare function addEventListener(type: "reset", listener: (this: Window, ev: Event) => any, useCapture?: boolean): void;
declare function addEventListener(type: "resize", listener: (this: Window, ev: UIEvent) => any, useCapture?: boolean): void;
declare function addEventListener(type: "scroll", listener: (this: Window, ev: UIEvent) => any, useCapture?: boolean): void;
declare function addEventListener(type: "seeked", listener: (this: Window, ev: Event) => any, useCapture?: boolean): void;
declare function addEventListener(type: "seeking", listener: (this: Window, ev: Event) => any, useCapture?: boolean): void;
declare function addEventListener(type: "select", listener: (this: Window, ev: UIEvent) => any, useCapture?: boolean): void;
declare function addEventListener(type: "stalled", listener: (this: Window, ev: Event) => any, useCapture?: boolean): void;
declare function addEventListener(type: "storage", listener: (this: Window, ev: StorageEvent) => any, useCapture?: boolean): void;
declare function addEventListener(type: "submit", listener: (this: Window, ev: Event) => any, useCapture?: boolean): void;
declare function addEventListener(type: "suspend", listener: (this: Window, ev: Event) => any, useCapture?: boolean): void;
declare function addEventListener(type: "timeupdate", listener: (this: Window, ev: Event) => any, useCapture?: boolean): void;
declare function addEventListener(type: "unload", listener: (this: Window, ev: Event) => any, useCapture?: boolean): void;
declare function addEventListener(type: "volumechange", listener: (this: Window, ev: Event) => any, useCapture?: boolean): void;
declare function addEventListener(type: "waiting", listener: (this: Window, ev: Event) => any, useCapture?: boolean): void;
declare function addEventListener(type: "wheel", listener: (this: Window, ev: WheelEvent) => any, useCapture?: boolean): void;
declare function addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
type AAGUID = string;
type AlgorithmIdentifier = string | Algorithm;
type ConstrainBoolean = boolean | ConstrainBooleanParameters;
type ConstrainDOMString = string | string[] | ConstrainDOMStringParameters;
type ConstrainDouble = number | ConstrainDoubleRange;
type ConstrainLong = number | ConstrainLongRange;
type CryptoOperationData = ArrayBufferView;
type GLbitfield = number;
type GLboolean = boolean;
type GLbyte = number;
type GLclampf = number;
type GLenum = number;
type GLfloat = number;
type GLint = number;
type GLintptr = number;
type GLshort = number;
type GLsizei = number;
type GLsizeiptr = number;
type GLubyte = number;
type GLuint = number;
type GLushort = number;
type IDBKeyPath = string;
type KeyFormat = string;
type KeyType = string;
type KeyUsage = string;
type MSInboundPayload = MSVideoRecvPayload | MSAudioRecvPayload;
type MSLocalClientEvent = MSLocalClientEventBase | MSAudioLocalClientEvent;
type MSOutboundPayload = MSVideoSendPayload | MSAudioSendPayload;
type RTCIceGatherCandidate = RTCIceCandidate | RTCIceCandidateComplete;
type RTCTransport = RTCDtlsTransport | RTCSrtpSdesTransport;
type payloadtype = number;
type ScrollBehavior = "auto" | "instant" | "smooth";
type ScrollLogicalPosition = "start" | "center" | "end" | "nearest";
type IDBValidKey = number | string | Date | IDBArrayKey;
type BufferSource = ArrayBuffer | ArrayBufferView;
type MouseWheelEvent = WheelEvent;
/////////////////////////////
/// WorkerGlobalScope APIs
/////////////////////////////
// These are only available in a Web Worker
declare function importScripts(...urls: string[]): void;


/////////////////////////////
/// Windows Script Host APIS
/////////////////////////////


interface ActiveXObject {
    new (s: string): any;
}
declare var ActiveXObject: ActiveXObject;

interface ITextWriter {
    Write(s: string): void;
    WriteLine(s: string): void;
    Close(): void;
}

interface TextStreamBase {
    /**
     * The column number of the current character position in an input stream.
     */
    Column: number;

    /**
     * The current line number in an input stream.
     */
    Line: number;

    /**
     * Closes a text stream.
     * It is not necessary to close standard streams; they close automatically when the process ends. If
     * you close a standard stream, be aware that any other pointers to that standard stream become invalid.
     */
    Close(): void;
}

interface TextStreamWriter extends TextStreamBase {
    /**
     * Sends a string to an output stream.
     */
    Write(s: string): void;

    /**
     * Sends a specified number of blank lines (newline characters) to an output stream.
     */
    WriteBlankLines(intLines: number): void;

    /**
     * Sends a string followed by a newline character to an output stream.
     */
    WriteLine(s: string): void;
}

interface TextStreamReader extends TextStreamBase {
    /**
     * Returns a specified number of characters from an input stream, starting at the current pointer position.
     * Does not return until the ENTER key is pressed.
     * Can only be used on a stream in reading mode; causes an error in writing or appending mode.
     */
    Read(characters: number): string;

    /**
     * Returns all characters from an input stream.
     * Can only be used on a stream in reading mode; causes an error in writing or appending mode.
     */
    ReadAll(): string;

    /**
     * Returns an entire line from an input stream.
     * Although this method extracts the newline character, it does not add it to the returned string.
     * Can only be used on a stream in reading mode; causes an error in writing or appending mode.
     */
    ReadLine(): string;

    /**
     * Skips a specified number of characters when reading from an input text stream.
     * Can only be used on a stream in reading mode; causes an error in writing or appending mode.
     * @param characters Positive number of characters to skip forward. (Backward skipping is not supported.)
     */
    Skip(characters: number): void;

    /**
     * Skips the next line when reading from an input text stream.
     * Can only be used on a stream in reading mode, not writing or appending mode.
     */
    SkipLine(): void;

    /**
     * Indicates whether the stream pointer position is at the end of a line.
     */
    AtEndOfLine: boolean;

    /**
     * Indicates whether the stream pointer position is at the end of a stream.
     */
    AtEndOfStream: boolean;
}

declare var WScript: {
    /**
    * Outputs text to either a message box (under WScript.exe) or the command console window followed by
    * a newline (under CScript.exe).
    */
    Echo(s: any): void;

    /**
     * Exposes the write-only error output stream for the current script.
     * Can be accessed only while using CScript.exe.
     */
    StdErr: TextStreamWriter;

    /**
     * Exposes the write-only output stream for the current script.
     * Can be accessed only while using CScript.exe.
     */
    StdOut: TextStreamWriter;
    Arguments: { length: number; Item(n: number): string; };

    /**
     *  The full path of the currently running script.
     */
    ScriptFullName: string;

    /**
     * Forces the script to stop immediately, with an optional exit code.
     */
    Quit(exitCode?: number): number;

    /**
     * The Windows Script Host build version number.
     */
    BuildVersion: number;

    /**
     * Fully qualified path of the host executable.
     */
    FullName: string;

    /**
     * Gets/sets the script mode - interactive(true) or batch(false).
     */
    Interactive: boolean;

    /**
     * The name of the host executable (WScript.exe or CScript.exe).
     */
    Name: string;

    /**
     * Path of the directory containing the host executable.
     */
    Path: string;

    /**
     * The filename of the currently running script.
     */
    ScriptName: string;

    /**
     * Exposes the read-only input stream for the current script.
     * Can be accessed only while using CScript.exe.
     */
    StdIn: TextStreamReader;

    /**
     * Windows Script Host version
     */
    Version: string;

    /**
     * Connects a COM object's event sources to functions named with a given prefix, in the form prefix_event.
     */
    ConnectObject(objEventSource: any, strPrefix: string): void;

    /**
     * Creates a COM object.
     * @param strProgiID
     * @param strPrefix Function names in the form prefix_event will be bound to this object's COM events.
     */
    CreateObject(strProgID: string, strPrefix?: string): any;

    /**
     * Disconnects a COM object from its event sources.
     */
    DisconnectObject(obj: any): void;

    /**
     * Retrieves an existing object with the specified ProgID from memory, or creates a new one from a file.
     * @param strPathname Fully qualified path to the file containing the object persisted to disk.
     *                       For objects in memory, pass a zero-length string.
     * @param strProgID
     * @param strPrefix Function names in the form prefix_event will be bound to this object's COM events.
     */
    GetObject(strPathname: string, strProgID?: string, strPrefix?: string): any;

    /**
     * Suspends script execution for a specified length of time, then continues execution.
     * @param intTime Interval (in milliseconds) to suspend script execution.
     */
    Sleep(intTime: number): void;
};

/**
 * Allows enumerating over a COM collection, which may not have indexed item access.
 */
interface Enumerator<T> {
    /**
     * Returns true if the current item is the last one in the collection, or the collection is empty,
     * or the current item is undefined.
     */
    atEnd(): boolean;

    /**
     * Returns the current item in the collection
     */
    item(): T;

    /**
     * Resets the current item in the collection to the first item. If there are no items in the collection,
     * the current item is set to undefined.
     */
    moveFirst(): void;

    /**
     * Moves the current item to the next item in the collection. If the enumerator is at the end of
     * the collection or the collection is empty, the current item is set to undefined.
     */
    moveNext(): void;
}

interface EnumeratorConstructor {
    new <T>(collection: any): Enumerator<T>;
    new (collection: any): Enumerator<any>;
}

declare var Enumerator: EnumeratorConstructor;

/**
 * Enables reading from a COM safe array, which might have an alternate lower bound, or multiple dimensions.
 */
interface VBArray<T> {
    /**
     * Returns the number of dimensions (1-based).
     */
    dimensions(): number;

    /**
     * Takes an index for each dimension in the array, and returns the item at the corresponding location.
     */
    getItem(dimension1Index: number, ...dimensionNIndexes: number[]): T;

    /**
     * Returns the smallest available index for a given dimension.
     * @param dimension 1-based dimension (defaults to 1)
     */
    lbound(dimension?: number): number;

    /**
     * Returns the largest available index for a given dimension.
     * @param dimension 1-based dimension (defaults to 1)
     */
    ubound(dimension?: number): number;

    /**
     * Returns a Javascript array with all the elements in the VBArray. If there are multiple dimensions,
     * each successive dimension is appended to the end of the array.
     * Example: [[1,2,3],[4,5,6]] becomes [1,2,3,4,5,6]
     */
    toArray(): T[];
}

interface VBArrayConstructor {
    new <T>(safeArray: any): VBArray<T>;
    new (safeArray: any): VBArray<any>;
}

declare var VBArray: VBArrayConstructor;

/**
 * Automation date (VT_DATE)
 */
interface VarDate { }

interface DateConstructor {
    new (vd: VarDate): Date;
}

interface Date {
    getVarDate: () => VarDate;
}
/// <reference path="lib.dom.generated.d.ts" />

interface DOMTokenList {
    [Symbol.iterator](): IterableIterator<string>;
}

interface NodeList {
    [Symbol.iterator](): IterableIterator<Node>
}

interface NodeListOf<TNode extends Node> {
    [Symbol.iterator](): IterableIterator<TNode>
}
