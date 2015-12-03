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

declare var NaN: number;
declare var Infinity: number;

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
    prototype: Object;

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
      * Creates an object that has the specified prototype, and that optionally contains specified properties.
      * @param o Object to use as a prototype. May be null
      * @param properties JavaScript object that contains one or more property descriptors. 
      */
    create(o: any, properties?: PropertyDescriptorMap): any;

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
declare var Object: ObjectConstructor;

/**
  * Creates a new function.
  */
interface Function {
    /**
      * Calls the function, substituting the specified object for the this value of the function, and the specified array for the arguments of the function.
      * @param thisArg The object to be used as the this object.
      * @param argArray A set of arguments to be passed to the function.
      */
    apply(thisArg: any, argArray?: any): any;

    /**
      * Calls a method of an object, substituting another object for the current object.
      * @param thisArg The object to be used as the current object.
      * @param argArray A list of arguments to be passed to the method.
      */
    call(thisArg: any, ...argArray: any[]): any;

    /**
      * For a given function, creates a bound function that has the same body as the original function. 
      * The this object of the bound function is associated with the specified object, and has the specified initial parameters.
      * @param thisArg An object to which the this keyword can refer inside the new function.
      * @param argArray A list of arguments to be passed to the new function.
      */
    bind(thisArg: any, ...argArray: any[]): any;

    prototype: any;
    length: number;

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
    prototype: Function;
}

declare var Function: FunctionConstructor;

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
    match(regexp: string): RegExpMatchArray;

    /** 
      * Matches a string with a regular expression, and returns an array containing the results of that search.
      * @param regexp A regular expression object that contains the regular expression pattern and applicable flags. 
      */
    match(regexp: RegExp): RegExpMatchArray;

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
    length: number;

    // IE extensions
    /**
      * Gets a substring beginning at the specified location and having the specified length.
      * @param from The starting position of the desired substring. The index of the first character in the string is zero.
      * @param length The number of characters to include in the returned substring.
      */
    substr(from: number, length?: number): string;

    /** Returns the primitive value of the specified object. */
    valueOf(): string;

    [index: number]: string;
}

interface StringConstructor {
    new (value?: any): String;
    (value?: any): string;
    prototype: String;
    fromCharCode(...codes: number[]): string;
}

/** 
  * Allows manipulation and formatting of text strings and determination and location of substrings within strings. 
  */
declare var String: StringConstructor;

interface Boolean {
    /** Returns the primitive value of the specified object. */
    valueOf(): boolean;
}

interface BooleanConstructor {
    new (value?: any): Boolean;
    (value?: any): boolean;
    prototype: Boolean;
}

declare var Boolean: BooleanConstructor;

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
    prototype: Number;

    /** The largest number that can be represented in JavaScript. Equal to approximately 1.79E+308. */
    MAX_VALUE: number;

    /** The closest number to zero that can be represented in JavaScript. Equal to approximately 5.00E-324. */
    MIN_VALUE: number;

    /** 
      * A value that is not a number.
      * In equality comparisons, NaN does not equal any value, including itself. To test whether a value is equivalent to NaN, use the isNaN function.
      */
    NaN: number;

    /** 
      * A value that is less than the largest negative number that can be represented in JavaScript.
      * JavaScript displays NEGATIVE_INFINITY values as -infinity. 
      */
    NEGATIVE_INFINITY: number;

    /**
      * A value greater than the largest number that can be represented in JavaScript. 
      * JavaScript displays POSITIVE_INFINITY values as infinity. 
      */
    POSITIVE_INFINITY: number;
}

/** An object that represents a number of any kind. All JavaScript numbers are 64-bit floating-point numbers. */
declare var Number: NumberConstructor;

interface TemplateStringsArray extends Array<string> {
    raw: string[];
}

interface Math {
    /** The mathematical constant e. This is Euler's number, the base of natural logarithms. */
    E: number;
    /** The natural logarithm of 10. */
    LN10: number;
    /** The natural logarithm of 2. */
    LN2: number;
    /** The base-2 logarithm of e. */
    LOG2E: number;
    /** The base-10 logarithm of e. */
    LOG10E: number;
    /** Pi. This is the ratio of the circumference of a circle to its diameter. */
    PI: number;
    /** The square root of 0.5, or, equivalently, one divided by the square root of 2. */
    SQRT1_2: number;
    /** The square root of 2. */
    SQRT2: number;
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
declare var Math: Math;

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
    prototype: Date;
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

declare var Date: DateConstructor;

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
    exec(string: string): RegExpExecArray;

    /** 
      * Returns a Boolean value that indicates whether or not a pattern exists in a searched string.
      * @param string String on which to perform the search.
      */
    test(string: string): boolean;

    /** Returns a copy of the text of the regular expression pattern. Read-only. The regExp argument is a Regular expression object. It can be a variable name or a literal. */
    source: string;

    /** Returns a Boolean value indicating the state of the global flag (g) used with a regular expression. Default is false. Read-only. */
    global: boolean;

    /** Returns a Boolean value indicating the state of the ignoreCase flag (i) used with a regular expression. Default is false. Read-only. */
    ignoreCase: boolean;

    /** Returns a Boolean value indicating the state of the multiline flag (m) used with a regular expression. Default is false. Read-only. */
    multiline: boolean;

    lastIndex: number;

    // Non-standard extensions
    compile(): RegExp;
}

interface RegExpConstructor {
    new (pattern: string, flags?: string): RegExp;
    (pattern: string, flags?: string): RegExp;
    prototype: RegExp;

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

declare var RegExp: RegExpConstructor;

interface Error {
    name: string;
    message: string;
}

interface ErrorConstructor {
    new (message?: string): Error;
    (message?: string): Error;
    prototype: Error;
}

declare var Error: ErrorConstructor;

interface EvalError extends Error {
}

interface EvalErrorConstructor {
    new (message?: string): EvalError;
    (message?: string): EvalError;
    prototype: EvalError;
}

declare var EvalError: EvalErrorConstructor;

interface RangeError extends Error {
}

interface RangeErrorConstructor {
    new (message?: string): RangeError;
    (message?: string): RangeError;
    prototype: RangeError;
}

declare var RangeError: RangeErrorConstructor;

interface ReferenceError extends Error {
}

interface ReferenceErrorConstructor {
    new (message?: string): ReferenceError;
    (message?: string): ReferenceError;
    prototype: ReferenceError;
}

declare var ReferenceError: ReferenceErrorConstructor;

interface SyntaxError extends Error {
}

interface SyntaxErrorConstructor {
    new (message?: string): SyntaxError;
    (message?: string): SyntaxError;
    prototype: SyntaxError;
}

declare var SyntaxError: SyntaxErrorConstructor;

interface TypeError extends Error {
}

interface TypeErrorConstructor {
    new (message?: string): TypeError;
    (message?: string): TypeError;
    prototype: TypeError;
}

declare var TypeError: TypeErrorConstructor;

interface URIError extends Error {
}

interface URIErrorConstructor {
    new (message?: string): URIError;
    (message?: string): URIError;
    prototype: URIError;
}

declare var URIError: URIErrorConstructor;

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
      */
    stringify(value: any): string;
    /**
      * Converts a JavaScript value to a JavaScript Object Notation (JSON) string.
      * @param value A JavaScript value, usually an object or array, to be converted.
      * @param replacer A function that transforms the results.
      */
    stringify(value: any, replacer: (key: string, value: any) => any): string;
    /**
      * Converts a JavaScript value to a JavaScript Object Notation (JSON) string.
      * @param value A JavaScript value, usually an object or array, to be converted.
      * @param replacer Array that transforms the results.
      */
    stringify(value: any, replacer: any[]): string;
    /**
      * Converts a JavaScript value to a JavaScript Object Notation (JSON) string.
      * @param value A JavaScript value, usually an object or array, to be converted.
      * @param replacer A function that transforms the results.
      * @param space Adds indentation, white space, and line break characters to the return-value JSON text to make it easier to read.
      */
    stringify(value: any, replacer: (key: string, value: any) => any, space: string | number): string;
    /**
      * Converts a JavaScript value to a JavaScript Object Notation (JSON) string.
      * @param value A JavaScript value, usually an object or array, to be converted.
      * @param replacer Array that transforms the results.
      * @param space Adds indentation, white space, and line break characters to the return-value JSON text to make it easier to read.
      */
    stringify(value: any, replacer: any[], space: string | number): string;
}
/**
  * An intrinsic object that provides functions to convert JavaScript values to and from the JavaScript Object Notation (JSON) format.
  */
declare var JSON: JSON;


/////////////////////////////
/// ECMAScript Array API (specially handled by compiler)
/////////////////////////////

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
    pop(): T;
    /**
      * Combines two or more arrays.
      * @param items Additional items to add to the end of array1.
      */
    concat<U extends T[]>(...items: U[]): T[];
    /**
      * Combines two or more arrays.
      * @param items Additional items to add to the end of array1.
      */
    concat(...items: T[]): T[];
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
    shift(): T;
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
    sort(compareFn?: (a: T, b: T) => number): T[];

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
    filter(callbackfn: (value: T, index: number, array: T[]) => boolean, thisArg?: any): T[];

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
    prototype: Array<any>;
}

declare var Array: ArrayConstructor;

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
    length: number;
    [n: number]: T;
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
    byteLength: number;

    /**
      * Returns a section of an ArrayBuffer.
      */
    slice(begin:number, end?:number): ArrayBuffer;
}

interface ArrayBufferConstructor {
    prototype: ArrayBuffer;
    new (byteLength: number): ArrayBuffer;
    isView(arg: any): boolean;
}
declare var ArrayBuffer: ArrayBufferConstructor;

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
    buffer: ArrayBuffer;
    byteLength: number;
    byteOffset: number;
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
declare var DataView: DataViewConstructor;

/**
  * A typed array of 8-bit integer values. The contents are initialized to 0. If the requested 
  * number of bytes could not be allocated an exception is raised.
  */
interface Int8Array {
    /**
      * The size in bytes of each element in the array. 
      */
    BYTES_PER_ELEMENT: number;

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

    /** 
      * Returns the this object after copying a section of the array identified by start and end
      * to the same array starting at position target
      * @param target If target is negative, it is treated as length+target where length is the 
      * length of the array. 
      * @param start If start is negative, it is treated as length+start. If end is negative, it 
      * is treated as length+end.
      * @param end If not specified, length of the this object is used as its default value. 
      */
    copyWithin(target: number, start: number, end?: number): Int8Array;

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
    fill(value: number, start?: number, end?: number): Int8Array;

    /**
      * Returns the elements of an array that meet the condition specified in a callback function. 
      * @param callbackfn A function that accepts up to three arguments. The filter method calls 
      * the callbackfn function one time for each element in the array. 
      * @param thisArg An object to which the this keyword can refer in the callbackfn function. 
      * If thisArg is omitted, undefined is used as the this value.
      */
    filter(callbackfn: (value: number, index: number, array: Int8Array) => boolean, thisArg?: any): Int8Array;

    /** 
      * Returns the value of the first element in the array where predicate is true, and undefined 
      * otherwise.
      * @param predicate find calls predicate once for each element of the array, in ascending 
      * order, until it finds one where predicate returns true. If such an element is found, find 
      * immediately returns that element value. Otherwise, find returns undefined.
      * @param thisArg If provided, it will be used as the this value for each invocation of 
      * predicate. If it is not provided, undefined is used instead.
      */
    find(predicate: (value: number, index: number, obj: Array<number>) => boolean, thisArg?: any): number;

    /** 
      * Returns the index of the first element in the array where predicate is true, and undefined 
      * otherwise.
      * @param predicate find calls predicate once for each element of the array, in ascending 
      * order, until it finds one where predicate returns true. If such an element is found, find 
      * immediately returns that element value. Otherwise, find returns undefined.
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
    length: number;

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
    sort(compareFn?: (a: number, b: number) => number): Int8Array;

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
    prototype: Int8Array;
    new (length: number): Int8Array;
    new (array: ArrayLike<number>): Int8Array;
    new (buffer: ArrayBuffer, byteOffset?: number, length?: number): Int8Array;

    /**
      * The size in bytes of each element in the array. 
      */
    BYTES_PER_ELEMENT: number;

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
declare var Int8Array: Int8ArrayConstructor;

/**
  * A typed array of 8-bit unsigned integer values. The contents are initialized to 0. If the 
  * requested number of bytes could not be allocated an exception is raised.
  */
interface Uint8Array {
    /**
      * The size in bytes of each element in the array. 
      */
    BYTES_PER_ELEMENT: number;

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

    /** 
      * Returns the this object after copying a section of the array identified by start and end
      * to the same array starting at position target
      * @param target If target is negative, it is treated as length+target where length is the 
      * length of the array. 
      * @param start If start is negative, it is treated as length+start. If end is negative, it 
      * is treated as length+end.
      * @param end If not specified, length of the this object is used as its default value. 
      */
    copyWithin(target: number, start: number, end?: number): Uint8Array;

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
    fill(value: number, start?: number, end?: number): Uint8Array;

    /**
      * Returns the elements of an array that meet the condition specified in a callback function. 
      * @param callbackfn A function that accepts up to three arguments. The filter method calls 
      * the callbackfn function one time for each element in the array. 
      * @param thisArg An object to which the this keyword can refer in the callbackfn function. 
      * If thisArg is omitted, undefined is used as the this value.
      */
    filter(callbackfn: (value: number, index: number, array: Uint8Array) => boolean, thisArg?: any): Uint8Array;

    /** 
      * Returns the value of the first element in the array where predicate is true, and undefined 
      * otherwise.
      * @param predicate find calls predicate once for each element of the array, in ascending 
      * order, until it finds one where predicate returns true. If such an element is found, find 
      * immediately returns that element value. Otherwise, find returns undefined.
      * @param thisArg If provided, it will be used as the this value for each invocation of 
      * predicate. If it is not provided, undefined is used instead.
      */
    find(predicate: (value: number, index: number, obj: Array<number>) => boolean, thisArg?: any): number;

    /** 
      * Returns the index of the first element in the array where predicate is true, and undefined 
      * otherwise.
      * @param predicate find calls predicate once for each element of the array, in ascending 
      * order, until it finds one where predicate returns true. If such an element is found, find 
      * immediately returns that element value. Otherwise, find returns undefined.
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
    length: number;

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
    sort(compareFn?: (a: number, b: number) => number): Uint8Array;

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
    prototype: Uint8Array;
    new (length: number): Uint8Array;
    new (array: ArrayLike<number>): Uint8Array;
    new (buffer: ArrayBuffer, byteOffset?: number, length?: number): Uint8Array;

    /**
      * The size in bytes of each element in the array. 
      */
    BYTES_PER_ELEMENT: number;

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
declare var Uint8Array: Uint8ArrayConstructor;

/**
  * A typed array of 8-bit unsigned integer (clamped) values. The contents are initialized to 0. 
  * If the requested number of bytes could not be allocated an exception is raised.
  */
interface Uint8ClampedArray {
    /**
      * The size in bytes of each element in the array. 
      */
    BYTES_PER_ELEMENT: number;

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

    /** 
      * Returns the this object after copying a section of the array identified by start and end
      * to the same array starting at position target
      * @param target If target is negative, it is treated as length+target where length is the 
      * length of the array. 
      * @param start If start is negative, it is treated as length+start. If end is negative, it 
      * is treated as length+end.
      * @param end If not specified, length of the this object is used as its default value. 
      */
    copyWithin(target: number, start: number, end?: number): Uint8ClampedArray;

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
    fill(value: number, start?: number, end?: number): Uint8ClampedArray;

    /**
      * Returns the elements of an array that meet the condition specified in a callback function. 
      * @param callbackfn A function that accepts up to three arguments. The filter method calls 
      * the callbackfn function one time for each element in the array. 
      * @param thisArg An object to which the this keyword can refer in the callbackfn function. 
      * If thisArg is omitted, undefined is used as the this value.
      */
    filter(callbackfn: (value: number, index: number, array: Uint8ClampedArray) => boolean, thisArg?: any): Uint8ClampedArray;

    /** 
      * Returns the value of the first element in the array where predicate is true, and undefined 
      * otherwise.
      * @param predicate find calls predicate once for each element of the array, in ascending 
      * order, until it finds one where predicate returns true. If such an element is found, find 
      * immediately returns that element value. Otherwise, find returns undefined.
      * @param thisArg If provided, it will be used as the this value for each invocation of 
      * predicate. If it is not provided, undefined is used instead.
      */
    find(predicate: (value: number, index: number, obj: Array<number>) => boolean, thisArg?: any): number;

    /** 
      * Returns the index of the first element in the array where predicate is true, and undefined 
      * otherwise.
      * @param predicate find calls predicate once for each element of the array, in ascending 
      * order, until it finds one where predicate returns true. If such an element is found, find 
      * immediately returns that element value. Otherwise, find returns undefined.
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
    length: number;

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
    sort(compareFn?: (a: number, b: number) => number): Uint8ClampedArray;

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
    prototype: Uint8ClampedArray;
    new (length: number): Uint8ClampedArray;
    new (array: ArrayLike<number>): Uint8ClampedArray;
    new (buffer: ArrayBuffer, byteOffset?: number, length?: number): Uint8ClampedArray;

    /**
      * The size in bytes of each element in the array. 
      */
    BYTES_PER_ELEMENT: number;

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
declare var Uint8ClampedArray: Uint8ClampedArrayConstructor;

/**
  * A typed array of 16-bit signed integer values. The contents are initialized to 0. If the 
  * requested number of bytes could not be allocated an exception is raised.
  */
interface Int16Array {
    /**
      * The size in bytes of each element in the array. 
      */
    BYTES_PER_ELEMENT: number;

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

    /** 
      * Returns the this object after copying a section of the array identified by start and end
      * to the same array starting at position target
      * @param target If target is negative, it is treated as length+target where length is the 
      * length of the array. 
      * @param start If start is negative, it is treated as length+start. If end is negative, it 
      * is treated as length+end.
      * @param end If not specified, length of the this object is used as its default value. 
      */
    copyWithin(target: number, start: number, end?: number): Int16Array;

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
    fill(value: number, start?: number, end?: number): Int16Array;

    /**
      * Returns the elements of an array that meet the condition specified in a callback function. 
      * @param callbackfn A function that accepts up to three arguments. The filter method calls 
      * the callbackfn function one time for each element in the array. 
      * @param thisArg An object to which the this keyword can refer in the callbackfn function. 
      * If thisArg is omitted, undefined is used as the this value.
      */
    filter(callbackfn: (value: number, index: number, array: Int16Array) => boolean, thisArg?: any): Int16Array;

    /** 
      * Returns the value of the first element in the array where predicate is true, and undefined 
      * otherwise.
      * @param predicate find calls predicate once for each element of the array, in ascending 
      * order, until it finds one where predicate returns true. If such an element is found, find 
      * immediately returns that element value. Otherwise, find returns undefined.
      * @param thisArg If provided, it will be used as the this value for each invocation of 
      * predicate. If it is not provided, undefined is used instead.
      */
    find(predicate: (value: number, index: number, obj: Array<number>) => boolean, thisArg?: any): number;

    /** 
      * Returns the index of the first element in the array where predicate is true, and undefined 
      * otherwise.
      * @param predicate find calls predicate once for each element of the array, in ascending 
      * order, until it finds one where predicate returns true. If such an element is found, find 
      * immediately returns that element value. Otherwise, find returns undefined.
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
    length: number;

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
    sort(compareFn?: (a: number, b: number) => number): Int16Array;

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
    prototype: Int16Array;
    new (length: number): Int16Array;
    new (array: ArrayLike<number>): Int16Array;
    new (buffer: ArrayBuffer, byteOffset?: number, length?: number): Int16Array;

    /**
      * The size in bytes of each element in the array. 
      */
    BYTES_PER_ELEMENT: number;

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
declare var Int16Array: Int16ArrayConstructor;

/**
  * A typed array of 16-bit unsigned integer values. The contents are initialized to 0. If the 
  * requested number of bytes could not be allocated an exception is raised.
  */
interface Uint16Array {
    /**
      * The size in bytes of each element in the array. 
      */
    BYTES_PER_ELEMENT: number;

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

    /** 
      * Returns the this object after copying a section of the array identified by start and end
      * to the same array starting at position target
      * @param target If target is negative, it is treated as length+target where length is the 
      * length of the array. 
      * @param start If start is negative, it is treated as length+start. If end is negative, it 
      * is treated as length+end.
      * @param end If not specified, length of the this object is used as its default value. 
      */
    copyWithin(target: number, start: number, end?: number): Uint16Array;

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
    fill(value: number, start?: number, end?: number): Uint16Array;

    /**
      * Returns the elements of an array that meet the condition specified in a callback function. 
      * @param callbackfn A function that accepts up to three arguments. The filter method calls 
      * the callbackfn function one time for each element in the array. 
      * @param thisArg An object to which the this keyword can refer in the callbackfn function. 
      * If thisArg is omitted, undefined is used as the this value.
      */
    filter(callbackfn: (value: number, index: number, array: Uint16Array) => boolean, thisArg?: any): Uint16Array;

    /** 
      * Returns the value of the first element in the array where predicate is true, and undefined 
      * otherwise.
      * @param predicate find calls predicate once for each element of the array, in ascending 
      * order, until it finds one where predicate returns true. If such an element is found, find 
      * immediately returns that element value. Otherwise, find returns undefined.
      * @param thisArg If provided, it will be used as the this value for each invocation of 
      * predicate. If it is not provided, undefined is used instead.
      */
    find(predicate: (value: number, index: number, obj: Array<number>) => boolean, thisArg?: any): number;

    /** 
      * Returns the index of the first element in the array where predicate is true, and undefined 
      * otherwise.
      * @param predicate find calls predicate once for each element of the array, in ascending 
      * order, until it finds one where predicate returns true. If such an element is found, find 
      * immediately returns that element value. Otherwise, find returns undefined.
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
    length: number;

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
    sort(compareFn?: (a: number, b: number) => number): Uint16Array;

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
    prototype: Uint16Array;
    new (length: number): Uint16Array;
    new (array: ArrayLike<number>): Uint16Array;
    new (buffer: ArrayBuffer, byteOffset?: number, length?: number): Uint16Array;

    /**
      * The size in bytes of each element in the array. 
      */
    BYTES_PER_ELEMENT: number;

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
declare var Uint16Array: Uint16ArrayConstructor;
/**
  * A typed array of 32-bit signed integer values. The contents are initialized to 0. If the 
  * requested number of bytes could not be allocated an exception is raised.
  */
interface Int32Array {
    /**
      * The size in bytes of each element in the array. 
      */
    BYTES_PER_ELEMENT: number;

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

    /** 
      * Returns the this object after copying a section of the array identified by start and end
      * to the same array starting at position target
      * @param target If target is negative, it is treated as length+target where length is the 
      * length of the array. 
      * @param start If start is negative, it is treated as length+start. If end is negative, it 
      * is treated as length+end.
      * @param end If not specified, length of the this object is used as its default value. 
      */
    copyWithin(target: number, start: number, end?: number): Int32Array;

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
    fill(value: number, start?: number, end?: number): Int32Array;

    /**
      * Returns the elements of an array that meet the condition specified in a callback function. 
      * @param callbackfn A function that accepts up to three arguments. The filter method calls 
      * the callbackfn function one time for each element in the array. 
      * @param thisArg An object to which the this keyword can refer in the callbackfn function. 
      * If thisArg is omitted, undefined is used as the this value.
      */
    filter(callbackfn: (value: number, index: number, array: Int32Array) => boolean, thisArg?: any): Int32Array;

    /** 
      * Returns the value of the first element in the array where predicate is true, and undefined 
      * otherwise.
      * @param predicate find calls predicate once for each element of the array, in ascending 
      * order, until it finds one where predicate returns true. If such an element is found, find 
      * immediately returns that element value. Otherwise, find returns undefined.
      * @param thisArg If provided, it will be used as the this value for each invocation of 
      * predicate. If it is not provided, undefined is used instead.
      */
    find(predicate: (value: number, index: number, obj: Array<number>) => boolean, thisArg?: any): number;

    /** 
      * Returns the index of the first element in the array where predicate is true, and undefined 
      * otherwise.
      * @param predicate find calls predicate once for each element of the array, in ascending 
      * order, until it finds one where predicate returns true. If such an element is found, find 
      * immediately returns that element value. Otherwise, find returns undefined.
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
    length: number;

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
    sort(compareFn?: (a: number, b: number) => number): Int32Array;

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
    prototype: Int32Array;
    new (length: number): Int32Array;
    new (array: ArrayLike<number>): Int32Array;
    new (buffer: ArrayBuffer, byteOffset?: number, length?: number): Int32Array;

    /**
      * The size in bytes of each element in the array. 
      */
    BYTES_PER_ELEMENT: number;

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
declare var Int32Array: Int32ArrayConstructor;

/**
  * A typed array of 32-bit unsigned integer values. The contents are initialized to 0. If the 
  * requested number of bytes could not be allocated an exception is raised.
  */
interface Uint32Array {
    /**
      * The size in bytes of each element in the array. 
      */
    BYTES_PER_ELEMENT: number;

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

    /** 
      * Returns the this object after copying a section of the array identified by start and end
      * to the same array starting at position target
      * @param target If target is negative, it is treated as length+target where length is the 
      * length of the array. 
      * @param start If start is negative, it is treated as length+start. If end is negative, it 
      * is treated as length+end.
      * @param end If not specified, length of the this object is used as its default value. 
      */
    copyWithin(target: number, start: number, end?: number): Uint32Array;

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
    fill(value: number, start?: number, end?: number): Uint32Array;

    /**
      * Returns the elements of an array that meet the condition specified in a callback function. 
      * @param callbackfn A function that accepts up to three arguments. The filter method calls 
      * the callbackfn function one time for each element in the array. 
      * @param thisArg An object to which the this keyword can refer in the callbackfn function. 
      * If thisArg is omitted, undefined is used as the this value.
      */
    filter(callbackfn: (value: number, index: number, array: Uint32Array) => boolean, thisArg?: any): Uint32Array;

    /** 
      * Returns the value of the first element in the array where predicate is true, and undefined 
      * otherwise.
      * @param predicate find calls predicate once for each element of the array, in ascending 
      * order, until it finds one where predicate returns true. If such an element is found, find 
      * immediately returns that element value. Otherwise, find returns undefined.
      * @param thisArg If provided, it will be used as the this value for each invocation of 
      * predicate. If it is not provided, undefined is used instead.
      */
    find(predicate: (value: number, index: number, obj: Array<number>) => boolean, thisArg?: any): number;

    /** 
      * Returns the index of the first element in the array where predicate is true, and undefined 
      * otherwise.
      * @param predicate find calls predicate once for each element of the array, in ascending 
      * order, until it finds one where predicate returns true. If such an element is found, find 
      * immediately returns that element value. Otherwise, find returns undefined.
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
    length: number;

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
    sort(compareFn?: (a: number, b: number) => number): Uint32Array;

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
    prototype: Uint32Array;
    new (length: number): Uint32Array;
    new (array: ArrayLike<number>): Uint32Array;
    new (buffer: ArrayBuffer, byteOffset?: number, length?: number): Uint32Array;

    /**
      * The size in bytes of each element in the array. 
      */
    BYTES_PER_ELEMENT: number;

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
declare var Uint32Array: Uint32ArrayConstructor;

/**
  * A typed array of 32-bit float values. The contents are initialized to 0. If the requested number
  * of bytes could not be allocated an exception is raised.
  */
interface Float32Array {
    /**
      * The size in bytes of each element in the array. 
      */
    BYTES_PER_ELEMENT: number;

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

    /** 
      * Returns the this object after copying a section of the array identified by start and end
      * to the same array starting at position target
      * @param target If target is negative, it is treated as length+target where length is the 
      * length of the array. 
      * @param start If start is negative, it is treated as length+start. If end is negative, it 
      * is treated as length+end.
      * @param end If not specified, length of the this object is used as its default value. 
      */
    copyWithin(target: number, start: number, end?: number): Float32Array;

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
    fill(value: number, start?: number, end?: number): Float32Array;

    /**
      * Returns the elements of an array that meet the condition specified in a callback function. 
      * @param callbackfn A function that accepts up to three arguments. The filter method calls 
      * the callbackfn function one time for each element in the array. 
      * @param thisArg An object to which the this keyword can refer in the callbackfn function. 
      * If thisArg is omitted, undefined is used as the this value.
      */
    filter(callbackfn: (value: number, index: number, array: Float32Array) => boolean, thisArg?: any): Float32Array;

    /** 
      * Returns the value of the first element in the array where predicate is true, and undefined 
      * otherwise.
      * @param predicate find calls predicate once for each element of the array, in ascending 
      * order, until it finds one where predicate returns true. If such an element is found, find 
      * immediately returns that element value. Otherwise, find returns undefined.
      * @param thisArg If provided, it will be used as the this value for each invocation of 
      * predicate. If it is not provided, undefined is used instead.
      */
    find(predicate: (value: number, index: number, obj: Array<number>) => boolean, thisArg?: any): number;

    /** 
      * Returns the index of the first element in the array where predicate is true, and undefined 
      * otherwise.
      * @param predicate find calls predicate once for each element of the array, in ascending 
      * order, until it finds one where predicate returns true. If such an element is found, find 
      * immediately returns that element value. Otherwise, find returns undefined.
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
    length: number;

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
    sort(compareFn?: (a: number, b: number) => number): Float32Array;

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
    prototype: Float32Array;
    new (length: number): Float32Array;
    new (array: ArrayLike<number>): Float32Array;
    new (buffer: ArrayBuffer, byteOffset?: number, length?: number): Float32Array;

    /**
      * The size in bytes of each element in the array. 
      */
    BYTES_PER_ELEMENT: number;

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
declare var Float32Array: Float32ArrayConstructor;

/**
  * A typed array of 64-bit float values. The contents are initialized to 0. If the requested 
  * number of bytes could not be allocated an exception is raised.
  */
interface Float64Array {
    /**
      * The size in bytes of each element in the array. 
      */
    BYTES_PER_ELEMENT: number;

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

    /** 
      * Returns the this object after copying a section of the array identified by start and end
      * to the same array starting at position target
      * @param target If target is negative, it is treated as length+target where length is the 
      * length of the array. 
      * @param start If start is negative, it is treated as length+start. If end is negative, it 
      * is treated as length+end.
      * @param end If not specified, length of the this object is used as its default value. 
      */
    copyWithin(target: number, start: number, end?: number): Float64Array;

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
    fill(value: number, start?: number, end?: number): Float64Array;

    /**
      * Returns the elements of an array that meet the condition specified in a callback function. 
      * @param callbackfn A function that accepts up to three arguments. The filter method calls 
      * the callbackfn function one time for each element in the array. 
      * @param thisArg An object to which the this keyword can refer in the callbackfn function. 
      * If thisArg is omitted, undefined is used as the this value.
      */
    filter(callbackfn: (value: number, index: number, array: Float64Array) => boolean, thisArg?: any): Float64Array;

    /** 
      * Returns the value of the first element in the array where predicate is true, and undefined 
      * otherwise.
      * @param predicate find calls predicate once for each element of the array, in ascending 
      * order, until it finds one where predicate returns true. If such an element is found, find 
      * immediately returns that element value. Otherwise, find returns undefined.
      * @param thisArg If provided, it will be used as the this value for each invocation of 
      * predicate. If it is not provided, undefined is used instead.
      */
    find(predicate: (value: number, index: number, obj: Array<number>) => boolean, thisArg?: any): number;

    /** 
      * Returns the index of the first element in the array where predicate is true, and undefined 
      * otherwise.
      * @param predicate find calls predicate once for each element of the array, in ascending 
      * order, until it finds one where predicate returns true. If such an element is found, find 
      * immediately returns that element value. Otherwise, find returns undefined.
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
    length: number;

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
    sort(compareFn?: (a: number, b: number) => number): Float64Array;

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
    prototype: Float64Array;
    new (length: number): Float64Array;
    new (array: ArrayLike<number>): Float64Array;
    new (buffer: ArrayBuffer, byteOffset?: number, length?: number): Float64Array;

    /**
      * The size in bytes of each element in the array. 
      */
    BYTES_PER_ELEMENT: number;

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
declare var Float64Array: Float64ArrayConstructor;
declare type PropertyKey = string | number | symbol;

interface Symbol {
    /** Returns a string representation of an object. */
    toString(): string;

    /** Returns the primitive value of the specified object. */
    valueOf(): Object;

    [Symbol.toStringTag]: string;
}

interface SymbolConstructor {
    /** 
      * A reference to the prototype. 
      */
    prototype: Symbol;

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
    keyFor(sym: symbol): string;

    // Well-known Symbols

    /** 
      * A method that determines if a constructor object recognizes an object as one of the 
      * constructor’s instances. Called by the semantics of the instanceof operator. 
      */
    hasInstance: symbol;

    /** 
      * A Boolean value that if true indicates that an object should flatten to its array elements
      * by Array.prototype.concat.
      */
    isConcatSpreadable: symbol;

    /** 
      * A method that returns the default iterator for an object. Called by the semantics of the 
      * for-of statement.
      */
    iterator: symbol;

    /**
      * A regular expression method that matches the regular expression against a string. Called 
      * by the String.prototype.match method. 
      */
    match: symbol;

    /** 
      * A regular expression method that replaces matched substrings of a string. Called by the 
      * String.prototype.replace method.
      */
    replace: symbol;

    /**
      * A regular expression method that returns the index within a string that matches the 
      * regular expression. Called by the String.prototype.search method.
      */
    search: symbol;

    /** 
      * A function valued property that is the constructor function that is used to create 
      * derived objects.
      */
    species: symbol;

    /**
      * A regular expression method that splits a string at the indices that match the regular 
      * expression. Called by the String.prototype.split method.
      */
    split: symbol;

    /** 
      * A method that converts an object to a corresponding primitive value.
      * Called by the ToPrimitive abstract operation.
      */
    toPrimitive: symbol;

    /** 
      * A String value that is used in the creation of the default string description of an object.
      * Called by the built-in method Object.prototype.toString.
      */
    toStringTag: symbol;

    /**
      * An Object whose own property names are property names that are excluded from the 'with'
      * environment bindings of the associated objects.
      */
    unscopables: symbol;
}
declare var Symbol: SymbolConstructor;

interface Object {
    /**
      * Determines whether an object has a property with the specified name. 
      * @param v A property name.
      */
    hasOwnProperty(v: PropertyKey): boolean;

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

interface Function {
    /**
      * Returns the name of the function. Function names are read-only and can not be changed.
      */
    name: string;

    /**
     * Determines whether the given value inherits from this function if this function was used
     * as a constructor function.
     *
     * A constructor function can control which objects are recognized as its instances by
     * 'instanceof' by overriding this method.
     */
    [Symbol.hasInstance](value: any): boolean;
}

interface NumberConstructor {
    /**
      * The value of Number.EPSILON is the difference between 1 and the smallest value greater than 1
      * that is representable as a Number value, which is approximately: 
      * 2.2204460492503130808472633361816 x 10‍−‍16.
      */
    EPSILON: number;

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
      * The value of Number.MIN_SAFE_INTEGER is 9007199254740991 2^53 − 1.
      */
    MAX_SAFE_INTEGER: number;

    /** 
      * The value of the smallest integer n such that n and n − 1 are both exactly representable as 
      * a Number value. 
      * The value of Number.MIN_SAFE_INTEGER is −9007199254740991 (−(2^53 − 1)).
      */
    MIN_SAFE_INTEGER: number;

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

interface Array<T> {
    /** Iterator */
    [Symbol.iterator](): IterableIterator<T>;

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

    /** 
      * Returns the value of the first element in the array where predicate is true, and undefined 
      * otherwise.
      * @param predicate find calls predicate once for each element of the array, in ascending 
      * order, until it finds one where predicate returns true. If such an element is found, find 
      * immediately returns that element value. Otherwise, find returns undefined.
      * @param thisArg If provided, it will be used as the this value for each invocation of 
      * predicate. If it is not provided, undefined is used instead.
      */
    find(predicate: (value: T, index: number, obj: Array<T>) => boolean, thisArg?: any): T;

    /** 
      * Returns the index of the first element in the array where predicate is true, and undefined 
      * otherwise.
      * @param predicate find calls predicate once for each element of the array, in ascending 
      * order, until it finds one where predicate returns true. If such an element is found, find 
      * immediately returns that element value. Otherwise, find returns undefined.
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
    fill(value: T, start?: number, end?: number): T[];

    /** 
      * Returns the this object after copying a section of the array identified by start and end
      * to the same array starting at position target
      * @param target If target is negative, it is treated as length+target where length is the 
      * length of the array. 
      * @param start If start is negative, it is treated as length+start. If end is negative, it 
      * is treated as length+end.
      * @param end If not specified, length of the this object is used as its default value. 
      */
    copyWithin(target: number, start: number, end?: number): T[];
}

interface IArguments {
    /** Iterator */
    [Symbol.iterator](): IterableIterator<any>;
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
      * Creates an array from an iterable object.
      * @param iterable An iterable object to convert to an array.
      * @param mapfn A mapping function to call on every element of the array.
      * @param thisArg Value of 'this' used to invoke the mapfn.
      */
    from<T, U>(iterable: Iterable<T>, mapfn: (v: T, k: number) => U, thisArg?: any): Array<U>;

    /**
      * Creates an array from an array-like object.
      * @param arrayLike An array-like object to convert to an array.
      */
    from<T>(arrayLike: ArrayLike<T>): Array<T>;

    /**
      * Creates an array from an iterable object.
      * @param iterable An iterable object to convert to an array.
      */
    from<T>(iterable: Iterable<T>): Array<T>;

    /**
      * Returns a new array from a set of elements.
      * @param items A set of elements to include in the new array object.
      */
    of<T>(...items: T[]): Array<T>;
}

interface String {
    /** Iterator */
    [Symbol.iterator](): IterableIterator<string>;

    /**
      * Returns a nonnegative integer Number less than 1114112 (0x110000) that is the code point 
      * value of the UTF-16 encoded code point starting at the string element at position pos in 
      * the String resulting from converting this object to a String. 
      * If there is no element at that position, the result is undefined. 
      * If a valid UTF-16 surrogate pair does not begin at pos, the result is the code unit at pos.
      */
    codePointAt(pos: number): number;

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

    // Overloads for objects with methods of well-known symbols.

    /**
      * Matches a string an object that supports being matched against, and returns an array containing the results of that search.
      * @param matcher An object that supports being matched against.
      */
    match(matcher: { [Symbol.match](string: string): RegExpMatchArray; }): RegExpMatchArray;

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

interface IteratorResult<T> {
    done: boolean;
    value?: T;
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

interface GeneratorFunction extends Function {

}

interface GeneratorFunctionConstructor {
    /**
      * Creates a new Generator function.
      * @param args A list of arguments the function accepts.
      */
    new (...args: string[]): GeneratorFunction;
    (...args: string[]): GeneratorFunction;
    prototype: GeneratorFunction;
}
declare var GeneratorFunction: GeneratorFunctionConstructor;

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

    [Symbol.toStringTag]: string;
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

interface RegExp {
    /**
      * Matches a string with this regular expression, and returns an array containing the results of
      * that search.
      * @param string A string to search within.
      */
    [Symbol.match](string: string): RegExpMatchArray;

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
    flags: string;

    /** 
      * Returns a Boolean value indicating the state of the sticky flag (y) used with a regular 
      * expression. Default is false. Read-only. 
      */
    sticky: boolean;

    /** 
      * Returns a Boolean value indicating the state of the Unicode flag (u) used with a regular 
      * expression. Default is false. Read-only. 
      */
    unicode: boolean;
}

interface RegExpConstructor {
    [Symbol.species](): RegExpConstructor;
}

interface Map<K, V> {
    clear(): void;
    delete(key: K): boolean;
    entries(): IterableIterator<[K, V]>;
    forEach(callbackfn: (value: V, index: K, map: Map<K, V>) => void, thisArg?: any): void;
    get(key: K): V;
    has(key: K): boolean;
    keys(): IterableIterator<K>;
    set(key: K, value?: V): Map<K, V>;
    size: number;
    values(): IterableIterator<V>;
    [Symbol.iterator]():IterableIterator<[K,V]>;
    [Symbol.toStringTag]: string;
}

interface MapConstructor {
    new (): Map<any, any>;
    new <K, V>(): Map<K, V>;
    new <K, V>(iterable: Iterable<[K, V]>): Map<K, V>;
    prototype: Map<any, any>;
}
declare var Map: MapConstructor;

interface WeakMap<K, V> {
    clear(): void;
    delete(key: K): boolean;
    get(key: K): V;
    has(key: K): boolean;
    set(key: K, value?: V): WeakMap<K, V>;
    [Symbol.toStringTag]: string;
}

interface WeakMapConstructor {
    new (): WeakMap<any, any>;
    new <K, V>(): WeakMap<K, V>;
    new <K, V>(iterable: Iterable<[K, V]>): WeakMap<K, V>;
    prototype: WeakMap<any, any>;
}
declare var WeakMap: WeakMapConstructor;

interface Set<T> {
    add(value: T): Set<T>;
    clear(): void;
    delete(value: T): boolean;
    entries(): IterableIterator<[T, T]>;
    forEach(callbackfn: (value: T, index: T, set: Set<T>) => void, thisArg?: any): void;
    has(value: T): boolean;
    keys(): IterableIterator<T>;
    size: number;
    values(): IterableIterator<T>;
    [Symbol.iterator]():IterableIterator<T>;
    [Symbol.toStringTag]: string;
}

interface SetConstructor {
    new (): Set<any>;
    new <T>(): Set<T>;
    new <T>(iterable: Iterable<T>): Set<T>;
    prototype: Set<any>;
}
declare var Set: SetConstructor;

interface WeakSet<T> {
    add(value: T): WeakSet<T>;
    clear(): void;
    delete(value: T): boolean;
    has(value: T): boolean;
    [Symbol.toStringTag]: string;
}

interface WeakSetConstructor {
    new (): WeakSet<any>;
    new <T>(): WeakSet<T>;
    new <T>(iterable: Iterable<T>): WeakSet<T>;
    prototype: WeakSet<any>;
}
declare var WeakSet: WeakSetConstructor;

interface JSON {
    [Symbol.toStringTag]: string;
}

/**
  * Represents a raw buffer of binary data, which is used to store data for the 
  * different typed arrays. ArrayBuffers cannot be read from or written to directly, 
  * but can be passed to a typed array or DataView Object to interpret the raw 
  * buffer as needed. 
  */
interface ArrayBuffer {
    [Symbol.toStringTag]: string;
}

interface DataView {
    [Symbol.toStringTag]: string;
}

/**
  * A typed array of 8-bit integer values. The contents are initialized to 0. If the requested 
  * number of bytes could not be allocated an exception is raised.
  */
interface Int8Array {
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
    [Symbol.iterator](): IterableIterator<number>;
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
    [Symbol.iterator](): IterableIterator<number>;
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

    [Symbol.iterator](): IterableIterator<number>;
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


    [Symbol.iterator](): IterableIterator<number>;
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
    [Symbol.iterator](): IterableIterator<number>;
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
    [Symbol.iterator](): IterableIterator<number>;
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
    [Symbol.iterator](): IterableIterator<number>;
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
    [Symbol.iterator](): IterableIterator<number>;
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
    [Symbol.iterator](): IterableIterator<number>;
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
}

interface ProxyHandler<T> {
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
declare var Proxy: ProxyConstructor;

declare namespace Reflect {
    function apply(target: Function, thisArgument: any, argumentsList: ArrayLike<any>): any;
    function construct(target: Function, argumentsList: ArrayLike<any>, newTarget?: any): any;
    function defineProperty(target: any, propertyKey: PropertyKey, attributes: PropertyDescriptor): boolean;
    function deleteProperty(target: any, propertyKey: PropertyKey): boolean;
    function enumerate(target: any): IterableIterator<any>;
    function get(target: any, propertyKey: PropertyKey, receiver?: any): any;
    function getOwnPropertyDescriptor(target: any, propertyKey: PropertyKey): PropertyDescriptor;
    function getPrototypeOf(target: any): any;
    function has(target: any, propertyKey: string): boolean;
    function has(target: any, propertyKey: symbol): boolean;
    function isExtensible(target: any): boolean;
    function ownKeys(target: any): Array<PropertyKey>;
    function preventExtensions(target: any): boolean;
    function set(target: any, propertyKey: PropertyKey, value: any, receiver? :any): boolean;
    function setPrototypeOf(target: any, proto: any): boolean;
}

/**
 * Represents the completion of an asynchronous operation
 */
interface Promise<T> {
    /**
    * Attaches callbacks for the resolution and/or rejection of the Promise.
    * @param onfulfilled The callback to execute when the Promise is resolved.
    * @param onrejected The callback to execute when the Promise is rejected.
    * @returns A Promise for the completion of which ever callback is executed.
    */
    then<TResult>(onfulfilled?: (value: T) => TResult | PromiseLike<TResult>, onrejected?: (reason: any) => TResult | PromiseLike<TResult>): Promise<TResult>;
    then<TResult>(onfulfilled?: (value: T) => TResult | PromiseLike<TResult>, onrejected?: (reason: any) => void): Promise<TResult>;

    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch(onrejected?: (reason: any) => T | PromiseLike<T>): Promise<T>;
    catch(onrejected?: (reason: any) => void): Promise<T>;

    [Symbol.toStringTag]: string;
}

interface PromiseConstructor {
    /** 
      * A reference to the prototype. 
      */
    prototype: Promise<any>;

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
    all<T>(values: Iterable<T | PromiseLike<T>>): Promise<T[]>;

    /**
     * Creates a Promise that is resolved or rejected when any of the provided Promises are resolved 
     * or rejected.
     * @param values An array of Promises.
     * @returns A new Promise.
     */
    race<T>(values: Iterable<T | PromiseLike<T>>): Promise<T>;

    /**
     * Creates a new rejected promise for the provided reason.
     * @param reason The reason the promise was rejected.
     * @returns A new rejected Promise.
     */
    reject(reason: any): Promise<void>;

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

    [Symbol.species]: Function;
}

declare var Promise: PromiseConstructor;
