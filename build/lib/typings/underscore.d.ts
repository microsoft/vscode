// Type definitions for Underscore 1.8.3
// Project: http://underscorejs.org/
// Definitions by: Boris Yankov <https://github.com/borisyankov/>, Josh Baldwin <https://github.com/jbaldwin/>, Christopher Currens <https://github.com/ccurrens/>
// Definitions: https://github.com/DefinitelyTyped/DefinitelyTyped

declare module _ {
	/**
	* underscore.js _.throttle options.
	**/
	interface ThrottleSettings {

		/**
		* If you'd like to disable the leading-edge call, pass this as false.
		**/
		leading?: boolean;

		/**
		* If you'd like to disable the execution on the trailing-edge, pass false.
		**/
		trailing?: boolean;
	}

	/**
	* underscore.js template settings, set templateSettings or pass as an argument
	* to 'template()' to override defaults.
	**/
	interface TemplateSettings {
		/**
		* Default value is '/<%([\s\S]+?)%>/g'.
		**/
		evaluate?: RegExp;

		/**
		* Default value is '/<%=([\s\S]+?)%>/g'.
		**/
		interpolate?: RegExp;

		/**
		* Default value is '/<%-([\s\S]+?)%>/g'.
		**/
		escape?: RegExp;

		/**
		* By default, 'template()' places the values from your data in the local scope via the 'with' statement.
		* However, you can specify a single variable name with this setting.
		**/
		variable?: string;
	}

	interface Collection<T> { }

	// Common interface between Arrays and jQuery objects
	interface List<T> extends Collection<T> {
		[index: number]: T;
		length: number;
	}

	interface Dictionary<T> extends Collection<T> {
		[index: string]: T;
	}

	interface ListIterator<T, TResult> {
		(value: T, index: number, list: List<T>): TResult;
	}

	interface ObjectIterator<T, TResult> {
		(element: T, key: string, list: Dictionary<T>): TResult;
	}

	interface MemoIterator<T, TResult> {
		(prev: TResult, curr: T, index: number, list: List<T>): TResult;
	}

	interface MemoObjectIterator<T, TResult> {
		(prev: TResult, curr: T, key: string, list: Dictionary<T>): TResult;
	}

	interface Cancelable {
		cancel() : void;
	}
}

interface UnderscoreStatic {
	/**
	* Underscore OOP Wrapper, all Underscore functions that take an object
	* as the first parameter can be invoked through this function.
	* @param key First argument to Underscore object functions.
	**/
	<T>(value: _.Dictionary<T>): Underscore<T>;
	<T>(value: Array<T>): Underscore<T>;
	<T>(value: T): Underscore<T>;

	/* *************
	 * Collections *
	 ************* */

	/**
	* Iterates over a list of elements, yielding each in turn to an iterator function. The iterator is
	* bound to the context object, if one is passed. Each invocation of iterator is called with three
	* arguments: (element, index, list). If list is a JavaScript object, iterator's arguments will be
	* (value, key, object). Delegates to the native forEach function if it exists.
	* @param list Iterates over this list of elements.
	* @param iterator Iterator function for each element `list`.
	* @param context 'this' object in `iterator`, optional.
	**/
	each<T>(
		list: _.List<T>,
		iterator: _.ListIterator<T, void>,
		context?: any): _.List<T>;

	/**
	* @see _.each
	* @param object Iterates over properties of this object.
	* @param iterator Iterator function for each property on `object`.
	* @param context 'this' object in `iterator`, optional.
	**/
	each<T>(
		object: _.Dictionary<T>,
		iterator: _.ObjectIterator<T, void>,
		context?: any): _.Dictionary<T>;

	/**
	* @see _.each
	**/
	forEach<T>(
		list: _.List<T>,
		iterator: _.ListIterator<T, void>,
		context?: any): _.List<T>;

	/**
	* @see _.each
	**/
	forEach<T>(
		object: _.Dictionary<T>,
		iterator: _.ObjectIterator<T, void>,
		context?: any): _.Dictionary<T>;

	/**
	* Produces a new array of values by mapping each value in list through a transformation function
	* (iterator). If the native map method exists, it will be used instead. If list is a JavaScript
	* object, iterator's arguments will be (value, key, object).
	* @param list Maps the elements of this array.
	* @param iterator Map iterator function for each element in `list`.
	* @param context `this` object in `iterator`, optional.
	* @return The mapped array result.
	**/
	map<T, TResult>(
		list: _.List<T>,
		iterator: _.ListIterator<T, TResult>,
		context?: any): TResult[];

	/**
	* @see _.map
	* @param object Maps the properties of this object.
	* @param iterator Map iterator function for each property on `object`.
	* @param context `this` object in `iterator`, optional.
	* @return The mapped object result.
	**/
	map<T, TResult>(
		object: _.Dictionary<T>,
		iterator: _.ObjectIterator<T, TResult>,
		context?: any): TResult[];

	/**
	* @see _.map
	**/
	collect<T, TResult>(
		list: _.List<T>,
		iterator: _.ListIterator<T, TResult>,
		context?: any): TResult[];

	/**
	* @see _.map
	**/
	collect<T, TResult>(
		object: _.Dictionary<T>,
		iterator: _.ObjectIterator<T, TResult>,
		context?: any): TResult[];

	/**
	* Also known as inject and foldl, reduce boils down a list of values into a single value.
	* Memo is the initial state of the reduction, and each successive step of it should be
	* returned by iterator. The iterator is passed four arguments: the memo, then the value
	* and index (or key) of the iteration, and finally a reference to the entire list.
	* @param list Reduces the elements of this array.
	* @param iterator Reduce iterator function for each element in `list`.
	* @param memo Initial reduce state.
	* @param context `this` object in `iterator`, optional.
	* @return Reduced object result.
	**/
	reduce<T, TResult>(
		list: _.Collection<T>,
		iterator: _.MemoIterator<T, TResult>,
		memo?: TResult,
		context?: any): TResult;

	reduce<T, TResult>(
		list: _.Dictionary<T>,
		iterator: _.MemoObjectIterator<T, TResult>,
		memo?: TResult,
		context?: any): TResult;

	/**
	* @see _.reduce
	**/
	inject<T, TResult>(
		list: _.Collection<T>,
		iterator: _.MemoIterator<T, TResult>,
		memo?: TResult,
		context?: any): TResult;

	/**
	* @see _.reduce
	**/
	foldl<T, TResult>(
		list: _.Collection<T>,
		iterator: _.MemoIterator<T, TResult>,
		memo?: TResult,
		context?: any): TResult;

	/**
	* The right-associative version of reduce. Delegates to the JavaScript 1.8 version of
	* reduceRight, if it exists. `foldr` is not as useful in JavaScript as it would be in a
	* language with lazy evaluation.
	* @param list Reduces the elements of this array.
	* @param iterator Reduce iterator function for each element in `list`.
	* @param memo Initial reduce state.
	* @param context `this` object in `iterator`, optional.
	* @return Reduced object result.
	**/
	reduceRight<T, TResult>(
		list: _.Collection<T>,
		iterator: _.MemoIterator<T, TResult>,
		memo?: TResult,
		context?: any): TResult;

	/**
	* @see _.reduceRight
	**/
	foldr<T, TResult>(
		list: _.Collection<T>,
		iterator: _.MemoIterator<T, TResult>,
		memo?: TResult,
		context?: any): TResult;

	/**
	* Looks through each value in the list, returning the first one that passes a truth
	* test (iterator). The function returns as soon as it finds an acceptable element,
	* and doesn't traverse the entire list.
	* @param list Searches for a value in this list.
	* @param iterator Search iterator function for each element in `list`.
	* @param context `this` object in `iterator`, optional.
	* @return The first acceptable found element in `list`, if nothing is found undefined/null is returned.
	**/
	find<T>(
		list: _.List<T>,
		iterator: _.ListIterator<T, boolean>,
		context?: any): T;

	/**
	* @see _.find
	**/
	find<T>(
		object: _.Dictionary<T>,
		iterator: _.ObjectIterator<T, boolean>,
		context?: any): T;

	/**
	* @see _.find
	**/
	find<T, U extends {}>(
		object: _.List<T>|_.Dictionary<T>,
		iterator: U): T;

	/**
	* @see _.find
	**/
	find<T>(
		object: _.List<T>|_.Dictionary<T>,
		iterator: string): T;

	/**
	* @see _.find
	**/
	detect<T>(
		list: _.List<T>,
		iterator: _.ListIterator<T, boolean>,
		context?: any): T;

	/**
	* @see _.find
	**/
	detect<T>(
		object: _.Dictionary<T>,
		iterator: _.ObjectIterator<T, boolean>,
		context?: any): T;

	/**
	* @see _.find
	**/
	detect<T, U extends {}>(
		object: _.List<T>|_.Dictionary<T>,
		iterator: U): T;

	/**
	* @see _.find
	**/
	detect<T>(
		object: _.List<T>|_.Dictionary<T>,
		iterator: string): T;

	/**
	* Looks through each value in the list, returning an array of all the values that pass a truth
	* test (iterator). Delegates to the native filter method, if it exists.
	* @param list Filter elements out of this list.
	* @param iterator Filter iterator function for each element in `list`.
	* @param context `this` object in `iterator`, optional.
	* @return The filtered list of elements.
	**/
	filter<T>(
		list: _.List<T>,
		iterator: _.ListIterator<T, boolean>,
		context?: any): T[];

	/**
	* @see _.filter
	**/
	filter<T>(
		object: _.Dictionary<T>,
		iterator: _.ObjectIterator<T, boolean>,
		context?: any): T[];

	/**
	* @see _.filter
	**/
	select<T>(
		list: _.List<T>,
		iterator: _.ListIterator<T, boolean>,
		context?: any): T[];

	/**
	* @see _.filter
	**/
	select<T>(
		object: _.Dictionary<T>,
		iterator: _.ObjectIterator<T, boolean>,
		context?: any): T[];

	/**
	* Looks through each value in the list, returning an array of all the values that contain all
	* of the key-value pairs listed in properties.
	* @param list List to match elements again `properties`.
	* @param properties The properties to check for on each element within `list`.
	* @return The elements within `list` that contain the required `properties`.
	**/
	where<T, U extends {}>(
		list: _.List<T>,
		properties: U): T[];

	/**
	* Looks through the list and returns the first value that matches all of the key-value pairs listed in properties.
	* @param list Search through this list's elements for the first object with all `properties`.
	* @param properties Properties to look for on the elements within `list`.
	* @return The first element in `list` that has all `properties`.
	**/
	findWhere<T, U extends {}>(
		list: _.List<T>,
		properties: U): T;

	/**
	* Returns the values in list without the elements that the truth test (iterator) passes.
	* The opposite of filter.
	* Return all the elements for which a truth test fails.
	* @param list Reject elements within this list.
	* @param iterator Reject iterator function for each element in `list`.
	* @param context `this` object in `iterator`, optional.
	* @return The rejected list of elements.
	**/
	reject<T>(
		list: _.List<T>,
		iterator: _.ListIterator<T, boolean>,
		context?: any): T[];

	/**
	* @see _.reject
	**/
	reject<T>(
		object: _.Dictionary<T>,
		iterator: _.ObjectIterator<T, boolean>,
		context?: any): T[];

	/**
	* Returns true if all of the values in the list pass the iterator truth test. Delegates to the
	* native method every, if present.
	* @param list Truth test against all elements within this list.
	* @param iterator Trust test iterator function for each element in `list`.
	* @param context `this` object in `iterator`, optional.
	* @return True if all elements passed the truth test, otherwise false.
	**/
	every<T>(
		list: _.List<T>,
		iterator?: _.ListIterator<T, boolean>,
		context?: any): boolean;

	/**
	* @see _.every
	**/
	every<T>(
		list: _.Dictionary<T>,
		iterator?: _.ObjectIterator<T, boolean>,
		context?: any): boolean;

	/**
	* @see _.every
	**/
	all<T>(
		list: _.List<T>,
		iterator?: _.ListIterator<T, boolean>,
		context?: any): boolean;

	/**
	* @see _.every
	**/
	all<T>(
		list: _.Dictionary<T>,
		iterator?: _.ObjectIterator<T, boolean>,
		context?: any): boolean;

	/**
	* Returns true if any of the values in the list pass the iterator truth test. Short-circuits and
	* stops traversing the list if a true element is found. Delegates to the native method some, if present.
	* @param list Truth test against all elements within this list.
	* @param iterator Trust test iterator function for each element in `list`.
	* @param context `this` object in `iterator`, optional.
	* @return True if any elements passed the truth test, otherwise false.
	**/
	some<T>(
		list: _.List<T>,
		iterator?: _.ListIterator<T, boolean>,
		context?: any): boolean;

	/**
	* @see _.some
	**/
	some<T>(
		object: _.Dictionary<T>,
		iterator?: _.ObjectIterator<T, boolean>,
		context?: any): boolean;

	/**
	* @see _.some
	**/
	any<T>(
		list: _.List<T>,
		iterator?: _.ListIterator<T, boolean>,
		context?: any): boolean;

	/**
	* @see _.some
	**/
	any<T>(
		object: _.Dictionary<T>,
		iterator?: _.ObjectIterator<T, boolean>,
		context?: any): boolean;

	any<T>(
		list: _.List<T>,
		value: T): boolean;

	/**
	* Returns true if the value is present in the list. Uses indexOf internally,
	* if list is an Array.
	* @param list Checks each element to see if `value` is present.
	* @param value The value to check for within `list`.
	* @return True if `value` is present in `list`, otherwise false.
	**/
	contains<T>(
		list: _.List<T>,
		value: T,
		fromIndex?: number): boolean;

	/**
	* @see _.contains
	**/
	contains<T>(
		object: _.Dictionary<T>,
		value: T): boolean;

	/**
	* @see _.contains
	**/
	include<T>(
		list: _.Collection<T>,
		value: T,
		fromIndex?: number): boolean;

	/**
	* @see _.contains
	**/
	include<T>(
		object: _.Dictionary<T>,
		value: T): boolean;

	/**
	* @see _.contains
	**/
	includes<T>(
		list: _.Collection<T>,
		value: T,
		fromIndex?: number): boolean;

	/**
	* @see _.contains
	**/
	includes<T>(
		object: _.Dictionary<T>,
		value: T): boolean;

	/**
	* Calls the method named by methodName on each value in the list. Any extra arguments passed to
	* invoke will be forwarded on to the method invocation.
	* @param list The element's in this list will each have the method `methodName` invoked.
	* @param methodName The method's name to call on each element within `list`.
	* @param arguments Additional arguments to pass to the method `methodName`.
	**/
	invoke<T extends {}>(
		list: _.List<T>,
		methodName: string,
		...arguments: any[]): any;

	/**
	* A convenient version of what is perhaps the most common use-case for map: extracting a list of
	* property values.
	* @param list The list to pluck elements out of that have the property `propertyName`.
	* @param propertyName The property to look for on each element within `list`.
	* @return The list of elements within `list` that have the property `propertyName`.
	**/
	pluck<T extends {}>(
		list: _.List<T>,
		propertyName: string): any[];

	/**
	* Returns the maximum value in list.
	* @param list Finds the maximum value in this list.
	* @return Maximum value in `list`.
	**/
	max(list: _.List<number>): number;

	/**
	* @see _.max
	*/
	max(object: _.Dictionary<number>): number;

	/**
	* Returns the maximum value in list. If iterator is passed, it will be used on each value to generate
	* the criterion by which the value is ranked.
	* @param list Finds the maximum value in this list.
	* @param iterator Compares each element in `list` to find the maximum value.
	* @param context `this` object in `iterator`, optional.
	* @return The maximum element within `list`.
	**/
	max<T>(
		list: _.List<T>,
		iterator?: _.ListIterator<T, any>,
		context?: any): T;

	/**
	* @see _.max
	*/
	max<T>(
		list: _.Dictionary<T>,
		iterator?: _.ObjectIterator<T, any>,
		context?: any): T;

	/**
	* Returns the minimum value in list.
	* @param list Finds the minimum value in this list.
	* @return Minimum value in `list`.
	**/
	min(list: _.List<number>): number;

	/**
	 * @see _.min
	 */
	min(o: _.Dictionary<number>): number;

	/**
	* Returns the minimum value in list. If iterator is passed, it will be used on each value to generate
	* the criterion by which the value is ranked.
	* @param list Finds the minimum value in this list.
	* @param iterator Compares each element in `list` to find the minimum value.
	* @param context `this` object in `iterator`, optional.
	* @return The minimum element within `list`.
	**/
	min<T>(
		list: _.List<T>,
		iterator?: _.ListIterator<T, any>,
		context?: any): T;

	/**
	* @see _.min
	*/
	min<T>(
		list: _.Dictionary<T>,
		iterator?: _.ObjectIterator<T, any>,
		context?: any): T;

	/**
	* Returns a sorted copy of list, ranked in ascending order by the results of running each value
	* through iterator. Iterator may also be the string name of the property to sort by (eg. length).
	* @param list Sorts this list.
	* @param iterator Sort iterator for each element within `list`.
	* @param context `this` object in `iterator`, optional.
	* @return A sorted copy of `list`.
	**/
	sortBy<T, TSort>(
		list: _.List<T>,
		iterator?: _.ListIterator<T, TSort>,
		context?: any): T[];

	/**
	* @see _.sortBy
	* @param iterator Sort iterator for each element within `list`.
	**/
	sortBy<T>(
		list: _.List<T>,
		iterator: string,
		context?: any): T[];

	/**
	* Splits a collection into sets, grouped by the result of running each value through iterator.
	* If iterator is a string instead of a function, groups by the property named by iterator on
	* each of the values.
	* @param list Groups this list.
	* @param iterator Group iterator for each element within `list`, return the key to group the element by.
	* @param context `this` object in `iterator`, optional.
	* @return An object with the group names as properties where each property contains the grouped elements from `list`.
	**/
	groupBy<T>(
		list: _.List<T>,
		iterator?: _.ListIterator<T, any>,
		context?: any): _.Dictionary<T[]>;

	/**
	* @see _.groupBy
	* @param iterator Property on each object to group them by.
	**/
	groupBy<T>(
		list: _.List<T>,
		iterator: string,
		context?: any): _.Dictionary<T[]>;

	/**
	* Given a `list`, and an `iterator` function that returns a key for each element in the list (or a property name),
	* returns an object with an index of each item.  Just like _.groupBy, but for when you know your keys are unique.
	**/
	indexBy<T>(
		list: _.List<T>,
		iterator: _.ListIterator<T, any>,
		context?: any): _.Dictionary<T>;

	/**
	* @see _.indexBy
	* @param iterator Property on each object to index them by.
	**/
	indexBy<T>(
		list: _.List<T>,
		iterator: string,
		context?: any): _.Dictionary<T>;

	/**
	* Sorts a list into groups and returns a count for the number of objects in each group. Similar
	* to groupBy, but instead of returning a list of values, returns a count for the number of values
	* in that group.
	* @param list Group elements in this list and then count the number of elements in each group.
	* @param iterator Group iterator for each element within `list`, return the key to group the element by.
	* @param context `this` object in `iterator`, optional.
	* @return An object with the group names as properties where each property contains the number of elements in that group.
	**/
	countBy<T>(
		list: _.List<T>,
		iterator?: _.ListIterator<T, any>,
		context?: any): _.Dictionary<number>;

	/**
	* @see _.countBy
	* @param iterator Function name
	**/
	countBy<T>(
		list: _.List<T>,
		iterator: string,
		context?: any): _.Dictionary<number>;

	/**
	* Returns a shuffled copy of the list, using a version of the Fisher-Yates shuffle.
	* @param list List to shuffle.
	* @return Shuffled copy of `list`.
	**/
	shuffle<T>(list: _.Collection<T>): T[];

	/**
	* Produce a random sample from the `list`.  Pass a number to return `n` random elements from the list.  Otherwise a single random item will be returned.
	* @param list List to sample.
	* @return Random sample of `n` elements in `list`.
	**/
	sample<T>(list: _.Collection<T>, n: number): T[];

	/**
	* @see _.sample
	**/
	sample<T>(list: _.Collection<T>): T;

	/**
	* Converts the list (anything that can be iterated over), into a real Array. Useful for transmuting
	* the arguments object.
	* @param list object to transform into an array.
	* @return `list` as an array.
	**/
	toArray<T>(list: _.Collection<T>): T[];

	/**
	* Return the number of values in the list.
	* @param list Count the number of values/elements in this list.
	* @return Number of values in `list`.
	**/
	size<T>(list: _.Collection<T>): number;

	/**
	* Split array into two arrays:
	* one whose elements all satisfy predicate and one whose elements all do not satisfy predicate.
	* @param array Array to split in two.
	* @param iterator Filter iterator function for each element in `array`.
	* @param context `this` object in `iterator`, optional.
	* @return Array where Array[0] are the elements in `array` that satisfies the predicate, and Array[1] the elements that did not.
	**/
	partition<T>(
		array: Array<T>,
		iterator: _.ListIterator<T, boolean>,
		context?: any): T[][];

	/*********
	* Arrays *
	**********/

	/**
	* Returns the first element of an array. Passing n will return the first n elements of the array.
	* @param array Retrieves the first element of this array.
	* @return Returns the first element of `array`.
	**/
	first<T>(array: _.List<T>): T;

	/**
	* @see _.first
	* @param n Return more than one element from `array`.
	**/
	first<T>(
		array: _.List<T>,
		n: number): T[];

	/**
	* @see _.first
	**/
	head<T>(array: _.List<T>): T;

	/**
	* @see _.first
	**/
	head<T>(
		array: _.List<T>,
		n: number): T[];

	/**
	* @see _.first
	**/
	take<T>(array: _.List<T>): T;

	/**
	* @see _.first
	**/
	take<T>(
		array: _.List<T>,
		n: number): T[];

	/**
	* Returns everything but the last entry of the array. Especially useful on the arguments object.
	* Pass n to exclude the last n elements from the result.
	* @param array Retrieve all elements except the last `n`.
	* @param n Leaves this many elements behind, optional.
	* @return Returns everything but the last `n` elements of `array`.
	**/
	initial<T>(
		array: _.List<T>,
		n?: number): T[];

	/**
	* Returns the last element of an array. Passing n will return the last n elements of the array.
	* @param array Retrieves the last element of this array.
	* @return Returns the last element of `array`.
	**/
	last<T>(array: _.List<T>): T;

	/**
	* @see _.last
	* @param n Return more than one element from `array`.
	**/
	last<T>(
		array: _.List<T>,
		n: number): T[];

	/**
	* Returns the rest of the elements in an array. Pass an index to return the values of the array
	* from that index onward.
	* @param array The array to retrieve all but the first `index` elements.
	* @param n The index to start retrieving elements forward from, optional, default = 1.
	* @return Returns the elements of `array` from `index` to the end of `array`.
	**/
	rest<T>(
		array: _.List<T>,
		n?: number): T[];

	/**
	* @see _.rest
	**/
	tail<T>(
		array: _.List<T>,
		n?: number): T[];

	/**
	* @see _.rest
	**/
	drop<T>(
		array: _.List<T>,
		n?: number): T[];

	/**
	* Returns a copy of the array with all falsy values removed. In JavaScript, false, null, 0, "",
	* undefined and NaN are all falsy.
	* @param array Array to compact.
	* @return Copy of `array` without false values.
	**/
	compact<T>(array: _.List<T>): T[];

	/**
	* Flattens a nested array (the nesting can be to any depth). If you pass shallow, the array will
	* only be flattened a single level.
	* @param array The array to flatten.
	* @param shallow If true then only flatten one level, optional, default = false.
	* @return `array` flattened.
	**/
	flatten(
		array: _.List<any>,
		shallow?: boolean): any[];

	/**
	* Returns a copy of the array with all instances of the values removed.
	* @param array The array to remove `values` from.
	* @param values The values to remove from `array`.
	* @return Copy of `array` without `values`.
	**/
	without<T>(
		array: _.List<T>,
		...values: T[]): T[];

	/**
	* Computes the union of the passed-in arrays: the list of unique items, in order, that are
	* present in one or more of the arrays.
	* @param arrays Array of arrays to compute the union of.
	* @return The union of elements within `arrays`.
	**/
	union<T>(...arrays: _.List<T>[]): T[];

	/**
	* Computes the list of values that are the intersection of all the arrays. Each value in the result
	* is present in each of the arrays.
	* @param arrays Array of arrays to compute the intersection of.
	* @return The intersection of elements within `arrays`.
	**/
	intersection<T>(...arrays: _.List<T>[]): T[];

	/**
	* Similar to without, but returns the values from array that are not present in the other arrays.
	* @param array Keeps values that are within `others`.
	* @param others The values to keep within `array`.
	* @return Copy of `array` with only `others` values.
	**/
	difference<T>(
		array: _.List<T>,
		...others: _.List<T>[]): T[];

	/**
	* Produces a duplicate-free version of the array, using === to test object equality. If you know in
	* advance that the array is sorted, passing true for isSorted will run a much faster algorithm. If
	* you want to compute unique items based on a transformation, pass an iterator function.
	* @param array Array to remove duplicates from.
	* @param isSorted True if `array` is already sorted, optional, default = false.
	* @param iterator Transform the elements of `array` before comparisons for uniqueness.
	* @param context 'this' object in `iterator`, optional.
	* @return Copy of `array` where all elements are unique.
	**/
	uniq<T, TSort>(
		array: _.List<T>,
		isSorted?: boolean,
		iterator?: _.ListIterator<T, TSort>,
		context?: any): T[];

	/**
	* @see _.uniq
	**/
	uniq<T, TSort>(
		array: _.List<T>,
		iterator?: _.ListIterator<T, TSort>,
		context?: any): T[];

	/**
	* @see _.uniq
	**/
	unique<T, TSort>(
		array: _.List<T>,
		iterator?: _.ListIterator<T, TSort>,
		context?: any): T[];

	/**
	* @see _.uniq
	**/
	unique<T, TSort>(
		array: _.List<T>,
		isSorted?: boolean,
		iterator?: _.ListIterator<T, TSort>,
		context?: any): T[];


	/**
	* Merges together the values of each of the arrays with the values at the corresponding position.
	* Useful when you have separate data sources that are coordinated through matching array indexes.
	* If you're working with a matrix of nested arrays, zip.apply can transpose the matrix in a similar fashion.
	* @param arrays The arrays to merge/zip.
	* @return Zipped version of `arrays`.
	**/
	zip(...arrays: any[][]): any[][];

	/**
	* @see _.zip
	**/
	zip(...arrays: any[]): any[];

	/**
	* The opposite of zip. Given a number of arrays, returns a series of new arrays, the first
	* of which contains all of the first elements in the input arrays, the second of which
	* contains all of the second elements, and so on. Use with apply to pass in an array
	* of arrays
	* @param arrays The arrays to unzip.
	* @return Unzipped version of `arrays`.
	**/
	unzip(...arrays: any[][]): any[][];

	/**
	* Converts arrays into objects. Pass either a single list of [key, value] pairs, or a
	* list of keys, and a list of values.
	* @param keys Key array.
	* @param values Value array.
	* @return An object containing the `keys` as properties and `values` as the property values.
	**/
	object<TResult extends {}>(
		keys: _.List<string>,
		values: _.List<any>): TResult;

	/**
	* Converts arrays into objects. Pass either a single list of [key, value] pairs, or a
	* list of keys, and a list of values.
	* @param keyValuePairs Array of [key, value] pairs.
	* @return An object containing the `keys` as properties and `values` as the property values.
	**/
	object<TResult extends {}>(...keyValuePairs: any[][]): TResult;

	/**
	* @see _.object
	**/
	object<TResult extends {}>(
		list: _.List<any>,
		values?: any): TResult;

	/**
	* Returns the index at which value can be found in the array, or -1 if value is not present in the array.
	* Uses the native indexOf function unless it's missing. If you're working with a large array, and you know
	* that the array is already sorted, pass true for isSorted to use a faster binary search ... or, pass a number
	* as the third argument in order to look for the first matching value in the array after the given index.
	* @param array The array to search for the index of `value`.
	* @param value The value to search for within `array`.
	* @param isSorted True if the array is already sorted, optional, default = false.
	* @return The index of `value` within `array`.
	**/
	indexOf<T>(
		array: _.List<T>,
		value: T,
		isSorted?: boolean): number;

	/**
	* @see _indexof
	**/
	indexOf<T>(
		array: _.List<T>,
		value: T,
		startFrom: number): number;

	/**
	* Returns the index of the last occurrence of value in the array, or -1 if value is not present. Uses the
	* native lastIndexOf function if possible. Pass fromIndex to start your search at a given index.
	* @param array The array to search for the last index of `value`.
	* @param value The value to search for within `array`.
	* @param from The starting index for the search, optional.
	* @return The index of the last occurrence of `value` within `array`.
	**/
	lastIndexOf<T>(
		array: _.List<T>,
		value: T,
		from?: number): number;

	/**
	* Returns the first index of an element in `array` where the predicate truth test passes
	* @param array The array to search for the index of the first element where the predicate truth test passes.
	* @param predicate Predicate function.
	* @param context `this` object in `predicate`, optional.
	* @return Returns the index of an element in `array` where the predicate truth test passes or -1.`
	**/
	findIndex<T>(
		array: _.List<T>,
		predicate: _.ListIterator<T, boolean> | {},
		context?: any): number;

	/**
	* Returns the last index of an element in `array` where the predicate truth test passes
	* @param array The array to search for the index of the last element where the predicate truth test passes.
	* @param predicate Predicate function.
	* @param context `this` object in `predicate`, optional.
	* @return Returns the index of an element in `array` where the predicate truth test passes or -1.`
	**/
	findLastIndex<T>(
		array: _.List<T>,
		predicate: _.ListIterator<T, boolean> | {},
		context?: any): number;

	/**
	* Uses a binary search to determine the index at which the value should be inserted into the list in order
	* to maintain the list's sorted order. If an iterator is passed, it will be used to compute the sort ranking
	* of each value, including the value you pass.
	* @param list The sorted list.
	* @param value The value to determine its index within `list`.
	* @param iterator Iterator to compute the sort ranking of each value, optional.
	* @return The index where `value` should be inserted into `list`.
	**/
	sortedIndex<T, TSort>(
		list: _.List<T>,
		value: T,
		iterator?: (x: T) => TSort, context?: any): number;

	/**
	* A function to create flexibly-numbered lists of integers, handy for each and map loops. start, if omitted,
	* defaults to 0; step defaults to 1. Returns a list of integers from start to stop, incremented (or decremented)
	* by step, exclusive.
	* @param start Start here.
	* @param stop Stop here.
	* @param step The number to count up by each iteration, optional, default = 1.
	* @return Array of numbers from `start` to `stop` with increments of `step`.
	**/

	range(
		start: number,
		stop: number,
		step?: number): number[];

	/**
	* @see _.range
	* @param stop Stop here.
	* @return Array of numbers from 0 to `stop` with increments of 1.
	* @note If start is not specified the implementation will never pull the step (step = arguments[2] || 0)
	**/
	range(stop: number): number[];

	/**
	* Split an **array** into several arrays containing **count** or less elements
	* of initial array.
	* @param array The array to split
	* @param count The maximum size of the inner arrays.
	*/
	chunk<T>(array: _.Collection<T>, count: number): (_.Collection<T>)[]

	/*************
	 * Functions *
	 *************/

	/**
	* Bind a function to an object, meaning that whenever the function is called, the value of this will
	* be the object. Optionally, bind arguments to the function to pre-fill them, also known as partial application.
	* @param func The function to bind `this` to `object`.
	* @param context The `this` pointer whenever `fn` is called.
	* @param arguments Additional arguments to pass to `fn` when called.
	* @return `fn` with `this` bound to `object`.
	**/
	bind(
		func: Function,
		context: any,
		...arguments: any[]): () => any;

	/**
	* Binds a number of methods on the object, specified by methodNames, to be run in the context of that object
	* whenever they are invoked. Very handy for binding functions that are going to be used as event handlers,
	* which would otherwise be invoked with a fairly useless this. If no methodNames are provided, all of the
	* object's function properties will be bound to it.
	* @param object The object to bind the methods `methodName` to.
	* @param methodNames The methods to bind to `object`, optional and if not provided all of `object`'s
	* methods are bound.
	**/
	bindAll(
		object: any,
		...methodNames: string[]): any;

	/**
	* Partially apply a function by filling in any number of its arguments, without changing its dynamic this value.
	* A close cousin of bind.  You may pass _ in your list of arguments to specify an argument that should not be
	* pre-filled, but left open to supply at call-time.
	* @param fn Function to partially fill in arguments.
	* @param arguments The partial arguments.
	* @return `fn` with partially filled in arguments.
	**/

	partial<T1, T2>(
		fn: { (p1: T1):T2 },
		p1: T1
	): { (): T2 };

	partial<T1, T2, T3>(
		fn: { (p1: T1, p2: T2):T3 },
		p1: T1
	): { (p2: T2): T3 };

	partial<T1, T2, T3>(
		fn: { (p1: T1, p2: T2):T3 },
		p1: T1,
		p2: T2
	): { (): T3 };

	partial<T1, T2, T3>(
		fn: { (p1: T1, p2: T2):T3 },
		stub1: UnderscoreStatic,
		p2: T2
	): { (p1: T1): T3 };

	partial<T1, T2, T3, T4>(
		fn: { (p1: T1, p2: T2, p3: T3):T4 },
		p1: T1
	): { (p2: T2, p3: T3): T4 };

	partial<T1, T2, T3, T4>(
		fn: { (p1: T1, p2: T2, p3: T3):T4 },
		p1: T1,
		p2: T2
	): { (p3: T3): T4 };

	partial<T1, T2, T3, T4>(
		fn: { (p1: T1, p2: T2, p3: T3):T4 },
		stub1: UnderscoreStatic,
		p2: T2
	): { (p1: T1, p3: T3): T4 };

	partial<T1, T2, T3, T4>(
		fn: { (p1: T1, p2: T2, p3: T3):T4 },
		p1: T1,
		p2: T2,
		p3: T3
	): { (): T4 };

	partial<T1, T2, T3, T4>(
		fn: { (p1: T1, p2: T2, p3: T3):T4 },
		stub1: UnderscoreStatic,
		p2: T2,
		p3: T3
	): { (p1: T1): T4 };

	partial<T1, T2, T3, T4>(
		fn: { (p1: T1, p2: T2, p3: T3):T4 },
		p1: T1,
		stub2: UnderscoreStatic,
		p3: T3
	): { (p2: T2): T4 };

	partial<T1, T2, T3, T4>(
		fn: { (p1: T1, p2: T2, p3: T3):T4 },
		stub1: UnderscoreStatic,
		stub2: UnderscoreStatic,
		p3: T3
	): { (p1: T1, p2: T2): T4 };

	partial<T1, T2, T3, T4, T5>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4):T5 },
		p1: T1
	): { (p2: T2, p3: T3, p4: T4): T5 };

	partial<T1, T2, T3, T4, T5>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4):T5 },
		p1: T1,
		p2: T2
	): { (p3: T3, p4: T4): T5 };

	partial<T1, T2, T3, T4, T5>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4):T5 },
		stub1: UnderscoreStatic,
		p2: T2
	): { (p1: T1, p3: T3, p4: T4): T5 };

	partial<T1, T2, T3, T4, T5>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4):T5 },
		p1: T1,
		p2: T2,
		p3: T3
	): { (p4: T4): T5 };

	partial<T1, T2, T3, T4, T5>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4):T5 },
		stub1: UnderscoreStatic,
		p2: T2,
		p3: T3
	): { (p1: T1, p4: T4): T5 };

	partial<T1, T2, T3, T4, T5>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4):T5 },
		p1: T1,
		stub2: UnderscoreStatic,
		p3: T3
	): { (p2: T2, p4: T4): T5 };

	partial<T1, T2, T3, T4, T5>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4):T5 },
		stub1: UnderscoreStatic,
		stub2: UnderscoreStatic,
		p3: T3
	): { (p1: T1, p2: T2, p4: T4): T5 };

	partial<T1, T2, T3, T4, T5>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4):T5 },
		p1: T1,
		p2: T2,
		p3: T3,
		p4: T4
	): { (): T5 };

	partial<T1, T2, T3, T4, T5>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4):T5 },
		stub1: UnderscoreStatic,
		p2: T2,
		p3: T3,
		p4: T4
	): { (p1: T1): T5 };

	partial<T1, T2, T3, T4, T5>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4):T5 },
		p1: T1,
		stub2: UnderscoreStatic,
		p3: T3,
		p4: T4
	): { (p2: T2): T5 };

	partial<T1, T2, T3, T4, T5>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4):T5 },
		stub1: UnderscoreStatic,
		stub2: UnderscoreStatic,
		p3: T3,
		p4: T4
	): { (p1: T1, p2: T2): T5 };

	partial<T1, T2, T3, T4, T5>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4):T5 },
		p1: T1,
		p2: T2,
		stub3: UnderscoreStatic,
		p4: T4
	): { (p3: T3): T5 };

	partial<T1, T2, T3, T4, T5>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4):T5 },
		stub1: UnderscoreStatic,
		p2: T2,
		stub3: UnderscoreStatic,
		p4: T4
	): { (p1: T1, p3: T3): T5 };

	partial<T1, T2, T3, T4, T5>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4):T5 },
		p1: T1,
		stub2: UnderscoreStatic,
		stub3: UnderscoreStatic,
		p4: T4
	): { (p2: T2, p3: T3): T5 };

	partial<T1, T2, T3, T4, T5>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4):T5 },
		stub1: UnderscoreStatic,
		stub2: UnderscoreStatic,
		stub3: UnderscoreStatic,
		p4: T4
	): { (p1: T1, p2: T2, p3: T3): T5 };

	partial<T1, T2, T3, T4, T5, T6>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5):T6 },
		p1: T1
	): { (p2: T2, p3: T3, p4: T4, p5: T5): T6 };

	partial<T1, T2, T3, T4, T5, T6>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5):T6 },
		p1: T1,
		p2: T2
	): { (p3: T3, p4: T4, p5: T5): T6 };

	partial<T1, T2, T3, T4, T5, T6>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5):T6 },
		stub1: UnderscoreStatic,
		p2: T2
	): { (p1: T1, p3: T3, p4: T4, p5: T5): T6 };

	partial<T1, T2, T3, T4, T5, T6>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5):T6 },
		p1: T1,
		p2: T2,
		p3: T3
	): { (p4: T4, p5: T5): T6 };

	partial<T1, T2, T3, T4, T5, T6>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5):T6 },
		stub1: UnderscoreStatic,
		p2: T2,
		p3: T3
	): { (p1: T1, p4: T4, p5: T5): T6 };

	partial<T1, T2, T3, T4, T5, T6>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5):T6 },
		p1: T1,
		stub2: UnderscoreStatic,
		p3: T3
	): { (p2: T2, p4: T4, p5: T5): T6 };

	partial<T1, T2, T3, T4, T5, T6>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5):T6 },
		stub1: UnderscoreStatic,
		stub2: UnderscoreStatic,
		p3: T3
	): { (p1: T1, p2: T2, p4: T4, p5: T5): T6 };

	partial<T1, T2, T3, T4, T5, T6>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5):T6 },
		p1: T1,
		p2: T2,
		p3: T3,
		p4: T4
	): { (p5: T5): T6 };

	partial<T1, T2, T3, T4, T5, T6>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5):T6 },
		stub1: UnderscoreStatic,
		p2: T2,
		p3: T3,
		p4: T4
	): { (p1: T1, p5: T5): T6 };

	partial<T1, T2, T3, T4, T5, T6>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5):T6 },
		p1: T1,
		stub2: UnderscoreStatic,
		p3: T3,
		p4: T4
	): { (p2: T2, p5: T5): T6 };

	partial<T1, T2, T3, T4, T5, T6>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5):T6 },
		stub1: UnderscoreStatic,
		stub2: UnderscoreStatic,
		p3: T3,
		p4: T4
	): { (p1: T1, p2: T2, p5: T5): T6 };

	partial<T1, T2, T3, T4, T5, T6>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5):T6 },
		p1: T1,
		p2: T2,
		stub3: UnderscoreStatic,
		p4: T4
	): { (p3: T3, p5: T5): T6 };

	partial<T1, T2, T3, T4, T5, T6>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5):T6 },
		stub1: UnderscoreStatic,
		p2: T2,
		stub3: UnderscoreStatic,
		p4: T4
	): { (p1: T1, p3: T3, p5: T5): T6 };

	partial<T1, T2, T3, T4, T5, T6>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5):T6 },
		p1: T1,
		stub2: UnderscoreStatic,
		stub3: UnderscoreStatic,
		p4: T4
	): { (p2: T2, p3: T3, p5: T5): T6 };

	partial<T1, T2, T3, T4, T5, T6>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5):T6 },
		stub1: UnderscoreStatic,
		stub2: UnderscoreStatic,
		stub3: UnderscoreStatic,
		p4: T4
	): { (p1: T1, p2: T2, p3: T3, p5: T5): T6 };

	partial<T1, T2, T3, T4, T5, T6>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5):T6 },
		p1: T1,
		p2: T2,
		p3: T3,
		p4: T4,
		p5: T5
	): { (): T6 };

	partial<T1, T2, T3, T4, T5, T6>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5):T6 },
		stub1: UnderscoreStatic,
		p2: T2,
		p3: T3,
		p4: T4,
		p5: T5
	): { (p1: T1): T6 };

	partial<T1, T2, T3, T4, T5, T6>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5):T6 },
		p1: T1,
		stub2: UnderscoreStatic,
		p3: T3,
		p4: T4,
		p5: T5
	): { (p2: T2): T6 };

	partial<T1, T2, T3, T4, T5, T6>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5):T6 },
		stub1: UnderscoreStatic,
		stub2: UnderscoreStatic,
		p3: T3,
		p4: T4,
		p5: T5
	): { (p1: T1, p2: T2): T6 };

	partial<T1, T2, T3, T4, T5, T6>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5):T6 },
		p1: T1,
		p2: T2,
		stub3: UnderscoreStatic,
		p4: T4,
		p5: T5
	): { (p3: T3): T6 };

	partial<T1, T2, T3, T4, T5, T6>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5):T6 },
		stub1: UnderscoreStatic,
		p2: T2,
		stub3: UnderscoreStatic,
		p4: T4,
		p5: T5
	): { (p1: T1, p3: T3): T6 };

	partial<T1, T2, T3, T4, T5, T6>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5):T6 },
		p1: T1,
		stub2: UnderscoreStatic,
		stub3: UnderscoreStatic,
		p4: T4,
		p5: T5
	): { (p2: T2, p3: T3): T6 };

	partial<T1, T2, T3, T4, T5, T6>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5):T6 },
		stub1: UnderscoreStatic,
		stub2: UnderscoreStatic,
		stub3: UnderscoreStatic,
		p4: T4,
		p5: T5
	): { (p1: T1, p2: T2, p3: T3): T6 };

	partial<T1, T2, T3, T4, T5, T6>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5):T6 },
		p1: T1,
		p2: T2,
		p3: T3,
		stub4: UnderscoreStatic,
		p5: T5
	): { (p4: T4): T6 };

	partial<T1, T2, T3, T4, T5, T6>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5):T6 },
		stub1: UnderscoreStatic,
		p2: T2,
		p3: T3,
		stub4: UnderscoreStatic,
		p5: T5
	): { (p1: T1, p4: T4): T6 };

	partial<T1, T2, T3, T4, T5, T6>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5):T6 },
		p1: T1,
		stub2: UnderscoreStatic,
		p3: T3,
		stub4: UnderscoreStatic,
		p5: T5
	): { (p2: T2, p4: T4): T6 };

	partial<T1, T2, T3, T4, T5, T6>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5):T6 },
		stub1: UnderscoreStatic,
		stub2: UnderscoreStatic,
		p3: T3,
		stub4: UnderscoreStatic,
		p5: T5
	): { (p1: T1, p2: T2, p4: T4): T6 };

	partial<T1, T2, T3, T4, T5, T6>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5):T6 },
		p1: T1,
		p2: T2,
		stub3: UnderscoreStatic,
		stub4: UnderscoreStatic,
		p5: T5
	): { (p3: T3, p4: T4): T6 };

	partial<T1, T2, T3, T4, T5, T6>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5):T6 },
		stub1: UnderscoreStatic,
		p2: T2,
		stub3: UnderscoreStatic,
		stub4: UnderscoreStatic,
		p5: T5
	): { (p1: T1, p3: T3, p4: T4): T6 };

	partial<T1, T2, T3, T4, T5, T6>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5):T6 },
		p1: T1,
		stub2: UnderscoreStatic,
		stub3: UnderscoreStatic,
		stub4: UnderscoreStatic,
		p5: T5
	): { (p2: T2, p3: T3, p4: T4): T6 };

	partial<T1, T2, T3, T4, T5, T6>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5):T6 },
		stub1: UnderscoreStatic,
		stub2: UnderscoreStatic,
		stub3: UnderscoreStatic,
		stub4: UnderscoreStatic,
		p5: T5
	): { (p1: T1, p2: T2, p3: T3, p4: T4): T6 };

	partial<T1, T2, T3, T4, T5, T6, T7>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6):T7 },
		p1: T1
	): { (p2: T2, p3: T3, p4: T4, p5: T5, p6: T6): T7 };

	partial<T1, T2, T3, T4, T5, T6, T7>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6):T7 },
		p1: T1,
		p2: T2
	): { (p3: T3, p4: T4, p5: T5, p6: T6): T7 };

	partial<T1, T2, T3, T4, T5, T6, T7>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6):T7 },
		stub1: UnderscoreStatic,
		p2: T2
	): { (p1: T1, p3: T3, p4: T4, p5: T5, p6: T6): T7 };

	partial<T1, T2, T3, T4, T5, T6, T7>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6):T7 },
		p1: T1,
		p2: T2,
		p3: T3
	): { (p4: T4, p5: T5, p6: T6): T7 };

	partial<T1, T2, T3, T4, T5, T6, T7>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6):T7 },
		stub1: UnderscoreStatic,
		p2: T2,
		p3: T3
	): { (p1: T1, p4: T4, p5: T5, p6: T6): T7 };

	partial<T1, T2, T3, T4, T5, T6, T7>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6):T7 },
		p1: T1,
		stub2: UnderscoreStatic,
		p3: T3
	): { (p2: T2, p4: T4, p5: T5, p6: T6): T7 };

	partial<T1, T2, T3, T4, T5, T6, T7>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6):T7 },
		stub1: UnderscoreStatic,
		stub2: UnderscoreStatic,
		p3: T3
	): { (p1: T1, p2: T2, p4: T4, p5: T5, p6: T6): T7 };

	partial<T1, T2, T3, T4, T5, T6, T7>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6):T7 },
		p1: T1,
		p2: T2,
		p3: T3,
		p4: T4
	): { (p5: T5, p6: T6): T7 };

	partial<T1, T2, T3, T4, T5, T6, T7>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6):T7 },
		stub1: UnderscoreStatic,
		p2: T2,
		p3: T3,
		p4: T4
	): { (p1: T1, p5: T5, p6: T6): T7 };

	partial<T1, T2, T3, T4, T5, T6, T7>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6):T7 },
		p1: T1,
		stub2: UnderscoreStatic,
		p3: T3,
		p4: T4
	): { (p2: T2, p5: T5, p6: T6): T7 };

	partial<T1, T2, T3, T4, T5, T6, T7>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6):T7 },
		stub1: UnderscoreStatic,
		stub2: UnderscoreStatic,
		p3: T3,
		p4: T4
	): { (p1: T1, p2: T2, p5: T5, p6: T6): T7 };

	partial<T1, T2, T3, T4, T5, T6, T7>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6):T7 },
		p1: T1,
		p2: T2,
		stub3: UnderscoreStatic,
		p4: T4
	): { (p3: T3, p5: T5, p6: T6): T7 };

	partial<T1, T2, T3, T4, T5, T6, T7>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6):T7 },
		stub1: UnderscoreStatic,
		p2: T2,
		stub3: UnderscoreStatic,
		p4: T4
	): { (p1: T1, p3: T3, p5: T5, p6: T6): T7 };

	partial<T1, T2, T3, T4, T5, T6, T7>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6):T7 },
		p1: T1,
		stub2: UnderscoreStatic,
		stub3: UnderscoreStatic,
		p4: T4
	): { (p2: T2, p3: T3, p5: T5, p6: T6): T7 };

	partial<T1, T2, T3, T4, T5, T6, T7>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6):T7 },
		stub1: UnderscoreStatic,
		stub2: UnderscoreStatic,
		stub3: UnderscoreStatic,
		p4: T4
	): { (p1: T1, p2: T2, p3: T3, p5: T5, p6: T6): T7 };

	partial<T1, T2, T3, T4, T5, T6, T7>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6):T7 },
		p1: T1,
		p2: T2,
		p3: T3,
		p4: T4,
		p5: T5
	): { (p6: T6): T7 };

	partial<T1, T2, T3, T4, T5, T6, T7>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6):T7 },
		stub1: UnderscoreStatic,
		p2: T2,
		p3: T3,
		p4: T4,
		p5: T5
	): { (p1: T1, p6: T6): T7 };

	partial<T1, T2, T3, T4, T5, T6, T7>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6):T7 },
		p1: T1,
		stub2: UnderscoreStatic,
		p3: T3,
		p4: T4,
		p5: T5
	): { (p2: T2, p6: T6): T7 };

	partial<T1, T2, T3, T4, T5, T6, T7>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6):T7 },
		stub1: UnderscoreStatic,
		stub2: UnderscoreStatic,
		p3: T3,
		p4: T4,
		p5: T5
	): { (p1: T1, p2: T2, p6: T6): T7 };

	partial<T1, T2, T3, T4, T5, T6, T7>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6):T7 },
		p1: T1,
		p2: T2,
		stub3: UnderscoreStatic,
		p4: T4,
		p5: T5
	): { (p3: T3, p6: T6): T7 };

	partial<T1, T2, T3, T4, T5, T6, T7>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6):T7 },
		stub1: UnderscoreStatic,
		p2: T2,
		stub3: UnderscoreStatic,
		p4: T4,
		p5: T5
	): { (p1: T1, p3: T3, p6: T6): T7 };

	partial<T1, T2, T3, T4, T5, T6, T7>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6):T7 },
		p1: T1,
		stub2: UnderscoreStatic,
		stub3: UnderscoreStatic,
		p4: T4,
		p5: T5
	): { (p2: T2, p3: T3, p6: T6): T7 };

	partial<T1, T2, T3, T4, T5, T6, T7>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6):T7 },
		stub1: UnderscoreStatic,
		stub2: UnderscoreStatic,
		stub3: UnderscoreStatic,
		p4: T4,
		p5: T5
	): { (p1: T1, p2: T2, p3: T3, p6: T6): T7 };

	partial<T1, T2, T3, T4, T5, T6, T7>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6):T7 },
		p1: T1,
		p2: T2,
		p3: T3,
		stub4: UnderscoreStatic,
		p5: T5
	): { (p4: T4, p6: T6): T7 };

	partial<T1, T2, T3, T4, T5, T6, T7>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6):T7 },
		stub1: UnderscoreStatic,
		p2: T2,
		p3: T3,
		stub4: UnderscoreStatic,
		p5: T5
	): { (p1: T1, p4: T4, p6: T6): T7 };

	partial<T1, T2, T3, T4, T5, T6, T7>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6):T7 },
		p1: T1,
		stub2: UnderscoreStatic,
		p3: T3,
		stub4: UnderscoreStatic,
		p5: T5
	): { (p2: T2, p4: T4, p6: T6): T7 };

	partial<T1, T2, T3, T4, T5, T6, T7>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6):T7 },
		stub1: UnderscoreStatic,
		stub2: UnderscoreStatic,
		p3: T3,
		stub4: UnderscoreStatic,
		p5: T5
	): { (p1: T1, p2: T2, p4: T4, p6: T6): T7 };

	partial<T1, T2, T3, T4, T5, T6, T7>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6):T7 },
		p1: T1,
		p2: T2,
		stub3: UnderscoreStatic,
		stub4: UnderscoreStatic,
		p5: T5
	): { (p3: T3, p4: T4, p6: T6): T7 };

	partial<T1, T2, T3, T4, T5, T6, T7>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6):T7 },
		stub1: UnderscoreStatic,
		p2: T2,
		stub3: UnderscoreStatic,
		stub4: UnderscoreStatic,
		p5: T5
	): { (p1: T1, p3: T3, p4: T4, p6: T6): T7 };

	partial<T1, T2, T3, T4, T5, T6, T7>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6):T7 },
		p1: T1,
		stub2: UnderscoreStatic,
		stub3: UnderscoreStatic,
		stub4: UnderscoreStatic,
		p5: T5
	): { (p2: T2, p3: T3, p4: T4, p6: T6): T7 };

	partial<T1, T2, T3, T4, T5, T6, T7>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6):T7 },
		stub1: UnderscoreStatic,
		stub2: UnderscoreStatic,
		stub3: UnderscoreStatic,
		stub4: UnderscoreStatic,
		p5: T5
	): { (p1: T1, p2: T2, p3: T3, p4: T4, p6: T6): T7 };

	partial<T1, T2, T3, T4, T5, T6, T7>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6):T7 },
		p1: T1,
		p2: T2,
		p3: T3,
		p4: T4,
		p5: T5,
		p6: T6
	): { (): T7 };

	partial<T1, T2, T3, T4, T5, T6, T7>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6):T7 },
		stub1: UnderscoreStatic,
		p2: T2,
		p3: T3,
		p4: T4,
		p5: T5,
		p6: T6
	): { (p1: T1): T7 };

	partial<T1, T2, T3, T4, T5, T6, T7>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6):T7 },
		p1: T1,
		stub2: UnderscoreStatic,
		p3: T3,
		p4: T4,
		p5: T5,
		p6: T6
	): { (p2: T2): T7 };

	partial<T1, T2, T3, T4, T5, T6, T7>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6):T7 },
		stub1: UnderscoreStatic,
		stub2: UnderscoreStatic,
		p3: T3,
		p4: T4,
		p5: T5,
		p6: T6
	): { (p1: T1, p2: T2): T7 };

	partial<T1, T2, T3, T4, T5, T6, T7>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6):T7 },
		p1: T1,
		p2: T2,
		stub3: UnderscoreStatic,
		p4: T4,
		p5: T5,
		p6: T6
	): { (p3: T3): T7 };

	partial<T1, T2, T3, T4, T5, T6, T7>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6):T7 },
		stub1: UnderscoreStatic,
		p2: T2,
		stub3: UnderscoreStatic,
		p4: T4,
		p5: T5,
		p6: T6
	): { (p1: T1, p3: T3): T7 };

	partial<T1, T2, T3, T4, T5, T6, T7>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6):T7 },
		p1: T1,
		stub2: UnderscoreStatic,
		stub3: UnderscoreStatic,
		p4: T4,
		p5: T5,
		p6: T6
	): { (p2: T2, p3: T3): T7 };

	partial<T1, T2, T3, T4, T5, T6, T7>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6):T7 },
		stub1: UnderscoreStatic,
		stub2: UnderscoreStatic,
		stub3: UnderscoreStatic,
		p4: T4,
		p5: T5,
		p6: T6
	): { (p1: T1, p2: T2, p3: T3): T7 };

	partial<T1, T2, T3, T4, T5, T6, T7>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6):T7 },
		p1: T1,
		p2: T2,
		p3: T3,
		stub4: UnderscoreStatic,
		p5: T5,
		p6: T6
	): { (p4: T4): T7 };

	partial<T1, T2, T3, T4, T5, T6, T7>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6):T7 },
		stub1: UnderscoreStatic,
		p2: T2,
		p3: T3,
		stub4: UnderscoreStatic,
		p5: T5,
		p6: T6
	): { (p1: T1, p4: T4): T7 };

	partial<T1, T2, T3, T4, T5, T6, T7>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6):T7 },
		p1: T1,
		stub2: UnderscoreStatic,
		p3: T3,
		stub4: UnderscoreStatic,
		p5: T5,
		p6: T6
	): { (p2: T2, p4: T4): T7 };

	partial<T1, T2, T3, T4, T5, T6, T7>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6):T7 },
		stub1: UnderscoreStatic,
		stub2: UnderscoreStatic,
		p3: T3,
		stub4: UnderscoreStatic,
		p5: T5,
		p6: T6
	): { (p1: T1, p2: T2, p4: T4): T7 };

	partial<T1, T2, T3, T4, T5, T6, T7>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6):T7 },
		p1: T1,
		p2: T2,
		stub3: UnderscoreStatic,
		stub4: UnderscoreStatic,
		p5: T5,
		p6: T6
	): { (p3: T3, p4: T4): T7 };

	partial<T1, T2, T3, T4, T5, T6, T7>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6):T7 },
		stub1: UnderscoreStatic,
		p2: T2,
		stub3: UnderscoreStatic,
		stub4: UnderscoreStatic,
		p5: T5,
		p6: T6
	): { (p1: T1, p3: T3, p4: T4): T7 };

	partial<T1, T2, T3, T4, T5, T6, T7>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6):T7 },
		p1: T1,
		stub2: UnderscoreStatic,
		stub3: UnderscoreStatic,
		stub4: UnderscoreStatic,
		p5: T5,
		p6: T6
	): { (p2: T2, p3: T3, p4: T4): T7 };

	partial<T1, T2, T3, T4, T5, T6, T7>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6):T7 },
		stub1: UnderscoreStatic,
		stub2: UnderscoreStatic,
		stub3: UnderscoreStatic,
		stub4: UnderscoreStatic,
		p5: T5,
		p6: T6
	): { (p1: T1, p2: T2, p3: T3, p4: T4): T7 };

	partial<T1, T2, T3, T4, T5, T6, T7>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6):T7 },
		p1: T1,
		p2: T2,
		p3: T3,
		p4: T4,
		stub5: UnderscoreStatic,
		p6: T6
	): { (p5: T5): T7 };

	partial<T1, T2, T3, T4, T5, T6, T7>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6):T7 },
		stub1: UnderscoreStatic,
		p2: T2,
		p3: T3,
		p4: T4,
		stub5: UnderscoreStatic,
		p6: T6
	): { (p1: T1, p5: T5): T7 };

	partial<T1, T2, T3, T4, T5, T6, T7>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6):T7 },
		p1: T1,
		stub2: UnderscoreStatic,
		p3: T3,
		p4: T4,
		stub5: UnderscoreStatic,
		p6: T6
	): { (p2: T2, p5: T5): T7 };

	partial<T1, T2, T3, T4, T5, T6, T7>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6):T7 },
		stub1: UnderscoreStatic,
		stub2: UnderscoreStatic,
		p3: T3,
		p4: T4,
		stub5: UnderscoreStatic,
		p6: T6
	): { (p1: T1, p2: T2, p5: T5): T7 };

	partial<T1, T2, T3, T4, T5, T6, T7>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6):T7 },
		p1: T1,
		p2: T2,
		stub3: UnderscoreStatic,
		p4: T4,
		stub5: UnderscoreStatic,
		p6: T6
	): { (p3: T3, p5: T5): T7 };

	partial<T1, T2, T3, T4, T5, T6, T7>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6):T7 },
		stub1: UnderscoreStatic,
		p2: T2,
		stub3: UnderscoreStatic,
		p4: T4,
		stub5: UnderscoreStatic,
		p6: T6
	): { (p1: T1, p3: T3, p5: T5): T7 };

	partial<T1, T2, T3, T4, T5, T6, T7>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6):T7 },
		p1: T1,
		stub2: UnderscoreStatic,
		stub3: UnderscoreStatic,
		p4: T4,
		stub5: UnderscoreStatic,
		p6: T6
	): { (p2: T2, p3: T3, p5: T5): T7 };

	partial<T1, T2, T3, T4, T5, T6, T7>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6):T7 },
		stub1: UnderscoreStatic,
		stub2: UnderscoreStatic,
		stub3: UnderscoreStatic,
		p4: T4,
		stub5: UnderscoreStatic,
		p6: T6
	): { (p1: T1, p2: T2, p3: T3, p5: T5): T7 };

	partial<T1, T2, T3, T4, T5, T6, T7>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6):T7 },
		p1: T1,
		p2: T2,
		p3: T3,
		stub4: UnderscoreStatic,
		stub5: UnderscoreStatic,
		p6: T6
	): { (p4: T4, p5: T5): T7 };

	partial<T1, T2, T3, T4, T5, T6, T7>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6):T7 },
		stub1: UnderscoreStatic,
		p2: T2,
		p3: T3,
		stub4: UnderscoreStatic,
		stub5: UnderscoreStatic,
		p6: T6
	): { (p1: T1, p4: T4, p5: T5): T7 };

	partial<T1, T2, T3, T4, T5, T6, T7>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6):T7 },
		p1: T1,
		stub2: UnderscoreStatic,
		p3: T3,
		stub4: UnderscoreStatic,
		stub5: UnderscoreStatic,
		p6: T6
	): { (p2: T2, p4: T4, p5: T5): T7 };

	partial<T1, T2, T3, T4, T5, T6, T7>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6):T7 },
		stub1: UnderscoreStatic,
		stub2: UnderscoreStatic,
		p3: T3,
		stub4: UnderscoreStatic,
		stub5: UnderscoreStatic,
		p6: T6
	): { (p1: T1, p2: T2, p4: T4, p5: T5): T7 };

	partial<T1, T2, T3, T4, T5, T6, T7>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6):T7 },
		p1: T1,
		p2: T2,
		stub3: UnderscoreStatic,
		stub4: UnderscoreStatic,
		stub5: UnderscoreStatic,
		p6: T6
	): { (p3: T3, p4: T4, p5: T5): T7 };

	partial<T1, T2, T3, T4, T5, T6, T7>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6):T7 },
		stub1: UnderscoreStatic,
		p2: T2,
		stub3: UnderscoreStatic,
		stub4: UnderscoreStatic,
		stub5: UnderscoreStatic,
		p6: T6
	): { (p1: T1, p3: T3, p4: T4, p5: T5): T7 };

	partial<T1, T2, T3, T4, T5, T6, T7>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6):T7 },
		p1: T1,
		stub2: UnderscoreStatic,
		stub3: UnderscoreStatic,
		stub4: UnderscoreStatic,
		stub5: UnderscoreStatic,
		p6: T6
	): { (p2: T2, p3: T3, p4: T4, p5: T5): T7 };

	partial<T1, T2, T3, T4, T5, T6, T7>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6):T7 },
		stub1: UnderscoreStatic,
		stub2: UnderscoreStatic,
		stub3: UnderscoreStatic,
		stub4: UnderscoreStatic,
		stub5: UnderscoreStatic,
		p6: T6
	): { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5): T7 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		p1: T1
	): { (p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		p1: T1,
		p2: T2
	): { (p3: T3, p4: T4, p5: T5, p6: T6, p7: T7): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		stub1: UnderscoreStatic,
		p2: T2
	): { (p1: T1, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		p1: T1,
		p2: T2,
		p3: T3
	): { (p4: T4, p5: T5, p6: T6, p7: T7): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		stub1: UnderscoreStatic,
		p2: T2,
		p3: T3
	): { (p1: T1, p4: T4, p5: T5, p6: T6, p7: T7): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		p1: T1,
		stub2: UnderscoreStatic,
		p3: T3
	): { (p2: T2, p4: T4, p5: T5, p6: T6, p7: T7): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		stub1: UnderscoreStatic,
		stub2: UnderscoreStatic,
		p3: T3
	): { (p1: T1, p2: T2, p4: T4, p5: T5, p6: T6, p7: T7): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		p1: T1,
		p2: T2,
		p3: T3,
		p4: T4
	): { (p5: T5, p6: T6, p7: T7): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		stub1: UnderscoreStatic,
		p2: T2,
		p3: T3,
		p4: T4
	): { (p1: T1, p5: T5, p6: T6, p7: T7): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		p1: T1,
		stub2: UnderscoreStatic,
		p3: T3,
		p4: T4
	): { (p2: T2, p5: T5, p6: T6, p7: T7): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		stub1: UnderscoreStatic,
		stub2: UnderscoreStatic,
		p3: T3,
		p4: T4
	): { (p1: T1, p2: T2, p5: T5, p6: T6, p7: T7): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		p1: T1,
		p2: T2,
		stub3: UnderscoreStatic,
		p4: T4
	): { (p3: T3, p5: T5, p6: T6, p7: T7): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		stub1: UnderscoreStatic,
		p2: T2,
		stub3: UnderscoreStatic,
		p4: T4
	): { (p1: T1, p3: T3, p5: T5, p6: T6, p7: T7): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		p1: T1,
		stub2: UnderscoreStatic,
		stub3: UnderscoreStatic,
		p4: T4
	): { (p2: T2, p3: T3, p5: T5, p6: T6, p7: T7): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		stub1: UnderscoreStatic,
		stub2: UnderscoreStatic,
		stub3: UnderscoreStatic,
		p4: T4
	): { (p1: T1, p2: T2, p3: T3, p5: T5, p6: T6, p7: T7): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		p1: T1,
		p2: T2,
		p3: T3,
		p4: T4,
		p5: T5
	): { (p6: T6, p7: T7): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		stub1: UnderscoreStatic,
		p2: T2,
		p3: T3,
		p4: T4,
		p5: T5
	): { (p1: T1, p6: T6, p7: T7): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		p1: T1,
		stub2: UnderscoreStatic,
		p3: T3,
		p4: T4,
		p5: T5
	): { (p2: T2, p6: T6, p7: T7): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		stub1: UnderscoreStatic,
		stub2: UnderscoreStatic,
		p3: T3,
		p4: T4,
		p5: T5
	): { (p1: T1, p2: T2, p6: T6, p7: T7): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		p1: T1,
		p2: T2,
		stub3: UnderscoreStatic,
		p4: T4,
		p5: T5
	): { (p3: T3, p6: T6, p7: T7): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		stub1: UnderscoreStatic,
		p2: T2,
		stub3: UnderscoreStatic,
		p4: T4,
		p5: T5
	): { (p1: T1, p3: T3, p6: T6, p7: T7): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		p1: T1,
		stub2: UnderscoreStatic,
		stub3: UnderscoreStatic,
		p4: T4,
		p5: T5
	): { (p2: T2, p3: T3, p6: T6, p7: T7): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		stub1: UnderscoreStatic,
		stub2: UnderscoreStatic,
		stub3: UnderscoreStatic,
		p4: T4,
		p5: T5
	): { (p1: T1, p2: T2, p3: T3, p6: T6, p7: T7): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		p1: T1,
		p2: T2,
		p3: T3,
		stub4: UnderscoreStatic,
		p5: T5
	): { (p4: T4, p6: T6, p7: T7): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		stub1: UnderscoreStatic,
		p2: T2,
		p3: T3,
		stub4: UnderscoreStatic,
		p5: T5
	): { (p1: T1, p4: T4, p6: T6, p7: T7): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		p1: T1,
		stub2: UnderscoreStatic,
		p3: T3,
		stub4: UnderscoreStatic,
		p5: T5
	): { (p2: T2, p4: T4, p6: T6, p7: T7): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		stub1: UnderscoreStatic,
		stub2: UnderscoreStatic,
		p3: T3,
		stub4: UnderscoreStatic,
		p5: T5
	): { (p1: T1, p2: T2, p4: T4, p6: T6, p7: T7): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		p1: T1,
		p2: T2,
		stub3: UnderscoreStatic,
		stub4: UnderscoreStatic,
		p5: T5
	): { (p3: T3, p4: T4, p6: T6, p7: T7): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		stub1: UnderscoreStatic,
		p2: T2,
		stub3: UnderscoreStatic,
		stub4: UnderscoreStatic,
		p5: T5
	): { (p1: T1, p3: T3, p4: T4, p6: T6, p7: T7): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		p1: T1,
		stub2: UnderscoreStatic,
		stub3: UnderscoreStatic,
		stub4: UnderscoreStatic,
		p5: T5
	): { (p2: T2, p3: T3, p4: T4, p6: T6, p7: T7): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		stub1: UnderscoreStatic,
		stub2: UnderscoreStatic,
		stub3: UnderscoreStatic,
		stub4: UnderscoreStatic,
		p5: T5
	): { (p1: T1, p2: T2, p3: T3, p4: T4, p6: T6, p7: T7): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		p1: T1,
		p2: T2,
		p3: T3,
		p4: T4,
		p5: T5,
		p6: T6
	): { (p7: T7): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		stub1: UnderscoreStatic,
		p2: T2,
		p3: T3,
		p4: T4,
		p5: T5,
		p6: T6
	): { (p1: T1, p7: T7): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		p1: T1,
		stub2: UnderscoreStatic,
		p3: T3,
		p4: T4,
		p5: T5,
		p6: T6
	): { (p2: T2, p7: T7): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		stub1: UnderscoreStatic,
		stub2: UnderscoreStatic,
		p3: T3,
		p4: T4,
		p5: T5,
		p6: T6
	): { (p1: T1, p2: T2, p7: T7): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		p1: T1,
		p2: T2,
		stub3: UnderscoreStatic,
		p4: T4,
		p5: T5,
		p6: T6
	): { (p3: T3, p7: T7): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		stub1: UnderscoreStatic,
		p2: T2,
		stub3: UnderscoreStatic,
		p4: T4,
		p5: T5,
		p6: T6
	): { (p1: T1, p3: T3, p7: T7): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		p1: T1,
		stub2: UnderscoreStatic,
		stub3: UnderscoreStatic,
		p4: T4,
		p5: T5,
		p6: T6
	): { (p2: T2, p3: T3, p7: T7): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		stub1: UnderscoreStatic,
		stub2: UnderscoreStatic,
		stub3: UnderscoreStatic,
		p4: T4,
		p5: T5,
		p6: T6
	): { (p1: T1, p2: T2, p3: T3, p7: T7): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		p1: T1,
		p2: T2,
		p3: T3,
		stub4: UnderscoreStatic,
		p5: T5,
		p6: T6
	): { (p4: T4, p7: T7): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		stub1: UnderscoreStatic,
		p2: T2,
		p3: T3,
		stub4: UnderscoreStatic,
		p5: T5,
		p6: T6
	): { (p1: T1, p4: T4, p7: T7): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		p1: T1,
		stub2: UnderscoreStatic,
		p3: T3,
		stub4: UnderscoreStatic,
		p5: T5,
		p6: T6
	): { (p2: T2, p4: T4, p7: T7): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		stub1: UnderscoreStatic,
		stub2: UnderscoreStatic,
		p3: T3,
		stub4: UnderscoreStatic,
		p5: T5,
		p6: T6
	): { (p1: T1, p2: T2, p4: T4, p7: T7): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		p1: T1,
		p2: T2,
		stub3: UnderscoreStatic,
		stub4: UnderscoreStatic,
		p5: T5,
		p6: T6
	): { (p3: T3, p4: T4, p7: T7): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		stub1: UnderscoreStatic,
		p2: T2,
		stub3: UnderscoreStatic,
		stub4: UnderscoreStatic,
		p5: T5,
		p6: T6
	): { (p1: T1, p3: T3, p4: T4, p7: T7): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		p1: T1,
		stub2: UnderscoreStatic,
		stub3: UnderscoreStatic,
		stub4: UnderscoreStatic,
		p5: T5,
		p6: T6
	): { (p2: T2, p3: T3, p4: T4, p7: T7): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		stub1: UnderscoreStatic,
		stub2: UnderscoreStatic,
		stub3: UnderscoreStatic,
		stub4: UnderscoreStatic,
		p5: T5,
		p6: T6
	): { (p1: T1, p2: T2, p3: T3, p4: T4, p7: T7): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		p1: T1,
		p2: T2,
		p3: T3,
		p4: T4,
		stub5: UnderscoreStatic,
		p6: T6
	): { (p5: T5, p7: T7): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		stub1: UnderscoreStatic,
		p2: T2,
		p3: T3,
		p4: T4,
		stub5: UnderscoreStatic,
		p6: T6
	): { (p1: T1, p5: T5, p7: T7): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		p1: T1,
		stub2: UnderscoreStatic,
		p3: T3,
		p4: T4,
		stub5: UnderscoreStatic,
		p6: T6
	): { (p2: T2, p5: T5, p7: T7): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		stub1: UnderscoreStatic,
		stub2: UnderscoreStatic,
		p3: T3,
		p4: T4,
		stub5: UnderscoreStatic,
		p6: T6
	): { (p1: T1, p2: T2, p5: T5, p7: T7): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		p1: T1,
		p2: T2,
		stub3: UnderscoreStatic,
		p4: T4,
		stub5: UnderscoreStatic,
		p6: T6
	): { (p3: T3, p5: T5, p7: T7): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		stub1: UnderscoreStatic,
		p2: T2,
		stub3: UnderscoreStatic,
		p4: T4,
		stub5: UnderscoreStatic,
		p6: T6
	): { (p1: T1, p3: T3, p5: T5, p7: T7): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		p1: T1,
		stub2: UnderscoreStatic,
		stub3: UnderscoreStatic,
		p4: T4,
		stub5: UnderscoreStatic,
		p6: T6
	): { (p2: T2, p3: T3, p5: T5, p7: T7): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		stub1: UnderscoreStatic,
		stub2: UnderscoreStatic,
		stub3: UnderscoreStatic,
		p4: T4,
		stub5: UnderscoreStatic,
		p6: T6
	): { (p1: T1, p2: T2, p3: T3, p5: T5, p7: T7): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		p1: T1,
		p2: T2,
		p3: T3,
		stub4: UnderscoreStatic,
		stub5: UnderscoreStatic,
		p6: T6
	): { (p4: T4, p5: T5, p7: T7): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		stub1: UnderscoreStatic,
		p2: T2,
		p3: T3,
		stub4: UnderscoreStatic,
		stub5: UnderscoreStatic,
		p6: T6
	): { (p1: T1, p4: T4, p5: T5, p7: T7): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		p1: T1,
		stub2: UnderscoreStatic,
		p3: T3,
		stub4: UnderscoreStatic,
		stub5: UnderscoreStatic,
		p6: T6
	): { (p2: T2, p4: T4, p5: T5, p7: T7): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		stub1: UnderscoreStatic,
		stub2: UnderscoreStatic,
		p3: T3,
		stub4: UnderscoreStatic,
		stub5: UnderscoreStatic,
		p6: T6
	): { (p1: T1, p2: T2, p4: T4, p5: T5, p7: T7): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		p1: T1,
		p2: T2,
		stub3: UnderscoreStatic,
		stub4: UnderscoreStatic,
		stub5: UnderscoreStatic,
		p6: T6
	): { (p3: T3, p4: T4, p5: T5, p7: T7): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		stub1: UnderscoreStatic,
		p2: T2,
		stub3: UnderscoreStatic,
		stub4: UnderscoreStatic,
		stub5: UnderscoreStatic,
		p6: T6
	): { (p1: T1, p3: T3, p4: T4, p5: T5, p7: T7): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		p1: T1,
		stub2: UnderscoreStatic,
		stub3: UnderscoreStatic,
		stub4: UnderscoreStatic,
		stub5: UnderscoreStatic,
		p6: T6
	): { (p2: T2, p3: T3, p4: T4, p5: T5, p7: T7): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		stub1: UnderscoreStatic,
		stub2: UnderscoreStatic,
		stub3: UnderscoreStatic,
		stub4: UnderscoreStatic,
		stub5: UnderscoreStatic,
		p6: T6
	): { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p7: T7): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		p1: T1,
		p2: T2,
		p3: T3,
		p4: T4,
		p5: T5,
		p6: T6,
		p7: T7
	): { (): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		stub1: UnderscoreStatic,
		p2: T2,
		p3: T3,
		p4: T4,
		p5: T5,
		p6: T6,
		p7: T7
	): { (p1: T1): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		p1: T1,
		stub2: UnderscoreStatic,
		p3: T3,
		p4: T4,
		p5: T5,
		p6: T6,
		p7: T7
	): { (p2: T2): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		stub1: UnderscoreStatic,
		stub2: UnderscoreStatic,
		p3: T3,
		p4: T4,
		p5: T5,
		p6: T6,
		p7: T7
	): { (p1: T1, p2: T2): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		p1: T1,
		p2: T2,
		stub3: UnderscoreStatic,
		p4: T4,
		p5: T5,
		p6: T6,
		p7: T7
	): { (p3: T3): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		stub1: UnderscoreStatic,
		p2: T2,
		stub3: UnderscoreStatic,
		p4: T4,
		p5: T5,
		p6: T6,
		p7: T7
	): { (p1: T1, p3: T3): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		p1: T1,
		stub2: UnderscoreStatic,
		stub3: UnderscoreStatic,
		p4: T4,
		p5: T5,
		p6: T6,
		p7: T7
	): { (p2: T2, p3: T3): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		stub1: UnderscoreStatic,
		stub2: UnderscoreStatic,
		stub3: UnderscoreStatic,
		p4: T4,
		p5: T5,
		p6: T6,
		p7: T7
	): { (p1: T1, p2: T2, p3: T3): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		p1: T1,
		p2: T2,
		p3: T3,
		stub4: UnderscoreStatic,
		p5: T5,
		p6: T6,
		p7: T7
	): { (p4: T4): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		stub1: UnderscoreStatic,
		p2: T2,
		p3: T3,
		stub4: UnderscoreStatic,
		p5: T5,
		p6: T6,
		p7: T7
	): { (p1: T1, p4: T4): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		p1: T1,
		stub2: UnderscoreStatic,
		p3: T3,
		stub4: UnderscoreStatic,
		p5: T5,
		p6: T6,
		p7: T7
	): { (p2: T2, p4: T4): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		stub1: UnderscoreStatic,
		stub2: UnderscoreStatic,
		p3: T3,
		stub4: UnderscoreStatic,
		p5: T5,
		p6: T6,
		p7: T7
	): { (p1: T1, p2: T2, p4: T4): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		p1: T1,
		p2: T2,
		stub3: UnderscoreStatic,
		stub4: UnderscoreStatic,
		p5: T5,
		p6: T6,
		p7: T7
	): { (p3: T3, p4: T4): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		stub1: UnderscoreStatic,
		p2: T2,
		stub3: UnderscoreStatic,
		stub4: UnderscoreStatic,
		p5: T5,
		p6: T6,
		p7: T7
	): { (p1: T1, p3: T3, p4: T4): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		p1: T1,
		stub2: UnderscoreStatic,
		stub3: UnderscoreStatic,
		stub4: UnderscoreStatic,
		p5: T5,
		p6: T6,
		p7: T7
	): { (p2: T2, p3: T3, p4: T4): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		stub1: UnderscoreStatic,
		stub2: UnderscoreStatic,
		stub3: UnderscoreStatic,
		stub4: UnderscoreStatic,
		p5: T5,
		p6: T6,
		p7: T7
	): { (p1: T1, p2: T2, p3: T3, p4: T4): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		p1: T1,
		p2: T2,
		p3: T3,
		p4: T4,
		stub5: UnderscoreStatic,
		p6: T6,
		p7: T7
	): { (p5: T5): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		stub1: UnderscoreStatic,
		p2: T2,
		p3: T3,
		p4: T4,
		stub5: UnderscoreStatic,
		p6: T6,
		p7: T7
	): { (p1: T1, p5: T5): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		p1: T1,
		stub2: UnderscoreStatic,
		p3: T3,
		p4: T4,
		stub5: UnderscoreStatic,
		p6: T6,
		p7: T7
	): { (p2: T2, p5: T5): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		stub1: UnderscoreStatic,
		stub2: UnderscoreStatic,
		p3: T3,
		p4: T4,
		stub5: UnderscoreStatic,
		p6: T6,
		p7: T7
	): { (p1: T1, p2: T2, p5: T5): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		p1: T1,
		p2: T2,
		stub3: UnderscoreStatic,
		p4: T4,
		stub5: UnderscoreStatic,
		p6: T6,
		p7: T7
	): { (p3: T3, p5: T5): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		stub1: UnderscoreStatic,
		p2: T2,
		stub3: UnderscoreStatic,
		p4: T4,
		stub5: UnderscoreStatic,
		p6: T6,
		p7: T7
	): { (p1: T1, p3: T3, p5: T5): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		p1: T1,
		stub2: UnderscoreStatic,
		stub3: UnderscoreStatic,
		p4: T4,
		stub5: UnderscoreStatic,
		p6: T6,
		p7: T7
	): { (p2: T2, p3: T3, p5: T5): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		stub1: UnderscoreStatic,
		stub2: UnderscoreStatic,
		stub3: UnderscoreStatic,
		p4: T4,
		stub5: UnderscoreStatic,
		p6: T6,
		p7: T7
	): { (p1: T1, p2: T2, p3: T3, p5: T5): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		p1: T1,
		p2: T2,
		p3: T3,
		stub4: UnderscoreStatic,
		stub5: UnderscoreStatic,
		p6: T6,
		p7: T7
	): { (p4: T4, p5: T5): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		stub1: UnderscoreStatic,
		p2: T2,
		p3: T3,
		stub4: UnderscoreStatic,
		stub5: UnderscoreStatic,
		p6: T6,
		p7: T7
	): { (p1: T1, p4: T4, p5: T5): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		p1: T1,
		stub2: UnderscoreStatic,
		p3: T3,
		stub4: UnderscoreStatic,
		stub5: UnderscoreStatic,
		p6: T6,
		p7: T7
	): { (p2: T2, p4: T4, p5: T5): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		stub1: UnderscoreStatic,
		stub2: UnderscoreStatic,
		p3: T3,
		stub4: UnderscoreStatic,
		stub5: UnderscoreStatic,
		p6: T6,
		p7: T7
	): { (p1: T1, p2: T2, p4: T4, p5: T5): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		p1: T1,
		p2: T2,
		stub3: UnderscoreStatic,
		stub4: UnderscoreStatic,
		stub5: UnderscoreStatic,
		p6: T6,
		p7: T7
	): { (p3: T3, p4: T4, p5: T5): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		stub1: UnderscoreStatic,
		p2: T2,
		stub3: UnderscoreStatic,
		stub4: UnderscoreStatic,
		stub5: UnderscoreStatic,
		p6: T6,
		p7: T7
	): { (p1: T1, p3: T3, p4: T4, p5: T5): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		p1: T1,
		stub2: UnderscoreStatic,
		stub3: UnderscoreStatic,
		stub4: UnderscoreStatic,
		stub5: UnderscoreStatic,
		p6: T6,
		p7: T7
	): { (p2: T2, p3: T3, p4: T4, p5: T5): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		stub1: UnderscoreStatic,
		stub2: UnderscoreStatic,
		stub3: UnderscoreStatic,
		stub4: UnderscoreStatic,
		stub5: UnderscoreStatic,
		p6: T6,
		p7: T7
	): { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		p1: T1,
		p2: T2,
		p3: T3,
		p4: T4,
		p5: T5,
		stub6: UnderscoreStatic,
		p7: T7
	): { (p6: T6): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		stub1: UnderscoreStatic,
		p2: T2,
		p3: T3,
		p4: T4,
		p5: T5,
		stub6: UnderscoreStatic,
		p7: T7
	): { (p1: T1, p6: T6): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		p1: T1,
		stub2: UnderscoreStatic,
		p3: T3,
		p4: T4,
		p5: T5,
		stub6: UnderscoreStatic,
		p7: T7
	): { (p2: T2, p6: T6): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		stub1: UnderscoreStatic,
		stub2: UnderscoreStatic,
		p3: T3,
		p4: T4,
		p5: T5,
		stub6: UnderscoreStatic,
		p7: T7
	): { (p1: T1, p2: T2, p6: T6): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		p1: T1,
		p2: T2,
		stub3: UnderscoreStatic,
		p4: T4,
		p5: T5,
		stub6: UnderscoreStatic,
		p7: T7
	): { (p3: T3, p6: T6): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		stub1: UnderscoreStatic,
		p2: T2,
		stub3: UnderscoreStatic,
		p4: T4,
		p5: T5,
		stub6: UnderscoreStatic,
		p7: T7
	): { (p1: T1, p3: T3, p6: T6): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		p1: T1,
		stub2: UnderscoreStatic,
		stub3: UnderscoreStatic,
		p4: T4,
		p5: T5,
		stub6: UnderscoreStatic,
		p7: T7
	): { (p2: T2, p3: T3, p6: T6): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		stub1: UnderscoreStatic,
		stub2: UnderscoreStatic,
		stub3: UnderscoreStatic,
		p4: T4,
		p5: T5,
		stub6: UnderscoreStatic,
		p7: T7
	): { (p1: T1, p2: T2, p3: T3, p6: T6): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		p1: T1,
		p2: T2,
		p3: T3,
		stub4: UnderscoreStatic,
		p5: T5,
		stub6: UnderscoreStatic,
		p7: T7
	): { (p4: T4, p6: T6): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		stub1: UnderscoreStatic,
		p2: T2,
		p3: T3,
		stub4: UnderscoreStatic,
		p5: T5,
		stub6: UnderscoreStatic,
		p7: T7
	): { (p1: T1, p4: T4, p6: T6): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		p1: T1,
		stub2: UnderscoreStatic,
		p3: T3,
		stub4: UnderscoreStatic,
		p5: T5,
		stub6: UnderscoreStatic,
		p7: T7
	): { (p2: T2, p4: T4, p6: T6): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		stub1: UnderscoreStatic,
		stub2: UnderscoreStatic,
		p3: T3,
		stub4: UnderscoreStatic,
		p5: T5,
		stub6: UnderscoreStatic,
		p7: T7
	): { (p1: T1, p2: T2, p4: T4, p6: T6): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		p1: T1,
		p2: T2,
		stub3: UnderscoreStatic,
		stub4: UnderscoreStatic,
		p5: T5,
		stub6: UnderscoreStatic,
		p7: T7
	): { (p3: T3, p4: T4, p6: T6): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		stub1: UnderscoreStatic,
		p2: T2,
		stub3: UnderscoreStatic,
		stub4: UnderscoreStatic,
		p5: T5,
		stub6: UnderscoreStatic,
		p7: T7
	): { (p1: T1, p3: T3, p4: T4, p6: T6): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		p1: T1,
		stub2: UnderscoreStatic,
		stub3: UnderscoreStatic,
		stub4: UnderscoreStatic,
		p5: T5,
		stub6: UnderscoreStatic,
		p7: T7
	): { (p2: T2, p3: T3, p4: T4, p6: T6): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		stub1: UnderscoreStatic,
		stub2: UnderscoreStatic,
		stub3: UnderscoreStatic,
		stub4: UnderscoreStatic,
		p5: T5,
		stub6: UnderscoreStatic,
		p7: T7
	): { (p1: T1, p2: T2, p3: T3, p4: T4, p6: T6): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		p1: T1,
		p2: T2,
		p3: T3,
		p4: T4,
		stub5: UnderscoreStatic,
		stub6: UnderscoreStatic,
		p7: T7
	): { (p5: T5, p6: T6): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		stub1: UnderscoreStatic,
		p2: T2,
		p3: T3,
		p4: T4,
		stub5: UnderscoreStatic,
		stub6: UnderscoreStatic,
		p7: T7
	): { (p1: T1, p5: T5, p6: T6): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		p1: T1,
		stub2: UnderscoreStatic,
		p3: T3,
		p4: T4,
		stub5: UnderscoreStatic,
		stub6: UnderscoreStatic,
		p7: T7
	): { (p2: T2, p5: T5, p6: T6): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		stub1: UnderscoreStatic,
		stub2: UnderscoreStatic,
		p3: T3,
		p4: T4,
		stub5: UnderscoreStatic,
		stub6: UnderscoreStatic,
		p7: T7
	): { (p1: T1, p2: T2, p5: T5, p6: T6): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		p1: T1,
		p2: T2,
		stub3: UnderscoreStatic,
		p4: T4,
		stub5: UnderscoreStatic,
		stub6: UnderscoreStatic,
		p7: T7
	): { (p3: T3, p5: T5, p6: T6): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		stub1: UnderscoreStatic,
		p2: T2,
		stub3: UnderscoreStatic,
		p4: T4,
		stub5: UnderscoreStatic,
		stub6: UnderscoreStatic,
		p7: T7
	): { (p1: T1, p3: T3, p5: T5, p6: T6): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		p1: T1,
		stub2: UnderscoreStatic,
		stub3: UnderscoreStatic,
		p4: T4,
		stub5: UnderscoreStatic,
		stub6: UnderscoreStatic,
		p7: T7
	): { (p2: T2, p3: T3, p5: T5, p6: T6): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		stub1: UnderscoreStatic,
		stub2: UnderscoreStatic,
		stub3: UnderscoreStatic,
		p4: T4,
		stub5: UnderscoreStatic,
		stub6: UnderscoreStatic,
		p7: T7
	): { (p1: T1, p2: T2, p3: T3, p5: T5, p6: T6): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		p1: T1,
		p2: T2,
		p3: T3,
		stub4: UnderscoreStatic,
		stub5: UnderscoreStatic,
		stub6: UnderscoreStatic,
		p7: T7
	): { (p4: T4, p5: T5, p6: T6): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		stub1: UnderscoreStatic,
		p2: T2,
		p3: T3,
		stub4: UnderscoreStatic,
		stub5: UnderscoreStatic,
		stub6: UnderscoreStatic,
		p7: T7
	): { (p1: T1, p4: T4, p5: T5, p6: T6): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		p1: T1,
		stub2: UnderscoreStatic,
		p3: T3,
		stub4: UnderscoreStatic,
		stub5: UnderscoreStatic,
		stub6: UnderscoreStatic,
		p7: T7
	): { (p2: T2, p4: T4, p5: T5, p6: T6): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		stub1: UnderscoreStatic,
		stub2: UnderscoreStatic,
		p3: T3,
		stub4: UnderscoreStatic,
		stub5: UnderscoreStatic,
		stub6: UnderscoreStatic,
		p7: T7
	): { (p1: T1, p2: T2, p4: T4, p5: T5, p6: T6): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		p1: T1,
		p2: T2,
		stub3: UnderscoreStatic,
		stub4: UnderscoreStatic,
		stub5: UnderscoreStatic,
		stub6: UnderscoreStatic,
		p7: T7
	): { (p3: T3, p4: T4, p5: T5, p6: T6): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		stub1: UnderscoreStatic,
		p2: T2,
		stub3: UnderscoreStatic,
		stub4: UnderscoreStatic,
		stub5: UnderscoreStatic,
		stub6: UnderscoreStatic,
		p7: T7
	): { (p1: T1, p3: T3, p4: T4, p5: T5, p6: T6): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		p1: T1,
		stub2: UnderscoreStatic,
		stub3: UnderscoreStatic,
		stub4: UnderscoreStatic,
		stub5: UnderscoreStatic,
		stub6: UnderscoreStatic,
		p7: T7
	): { (p2: T2, p3: T3, p4: T4, p5: T5, p6: T6): T8 };

	partial<T1, T2, T3, T4, T5, T6, T7, T8>(
		fn: { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6, p7: T7):T8 },
		stub1: UnderscoreStatic,
		stub2: UnderscoreStatic,
		stub3: UnderscoreStatic,
		stub4: UnderscoreStatic,
		stub5: UnderscoreStatic,
		stub6: UnderscoreStatic,
		p7: T7
	): { (p1: T1, p2: T2, p3: T3, p4: T4, p5: T5, p6: T6): T8 };

	/**
	* Memoizes a given function by caching the computed result. Useful for speeding up slow-running computations.
	* If passed an optional hashFunction, it will be used to compute the hash key for storing the result, based
	* on the arguments to the original function. The default hashFunction just uses the first argument to the
	* memoized function as the key.
	* @param fn Computationally expensive function that will now memoized results.
	* @param hashFn Hash function for storing the result of `fn`.
	* @return Memoized version of `fn`.
	**/
	memoize(
		fn: Function,
		hashFn?: (...args: any[]) => string): Function;

	/**
	* Much like setTimeout, invokes function after wait milliseconds. If you pass the optional arguments,
	* they will be forwarded on to the function when it is invoked.
	* @param func Function to delay `waitMS` amount of ms.
	* @param wait The amount of milliseconds to delay `fn`.
	* @arguments Additional arguments to pass to `fn`.
	**/
	delay(
		func: Function,
		wait: number,
		...arguments: any[]): any;

	/**
	* @see _delay
	**/
	delay(
		func: Function,
		...arguments: any[]): any;

	/**
	* Defers invoking the function until the current call stack has cleared, similar to using setTimeout
	* with a delay of 0. Useful for performing expensive computations or HTML rendering in chunks without
	* blocking the UI thread from updating. If you pass the optional arguments, they will be forwarded on
	* to the function when it is invoked.
	* @param fn The function to defer.
	* @param arguments Additional arguments to pass to `fn`.
	**/
	defer(
		fn: Function,
		...arguments: any[]): void;

	/**
	* Creates and returns a new, throttled version of the passed function, that, when invoked repeatedly,
	* will only actually call the original function at most once per every wait milliseconds. Useful for
	* rate-limiting events that occur faster than you can keep up with.
	* By default, throttle will execute the function as soon as you call it for the first time, and,
	* if you call it again any number of times during the wait period, as soon as that period is over.
	* If you'd like to disable the leading-edge call, pass {leading: false}, and if you'd like to disable
	* the execution on the trailing-edge, pass {trailing: false}.
	* @param func Function to throttle `waitMS` ms.
	* @param wait The number of milliseconds to wait before `fn` can be invoked again.
	* @param options Allows for disabling execution of the throttled function on either the leading or trailing edge.
	* @return `fn` with a throttle of `wait`.
	**/
	throttle<T extends Function>(
		func: T,
		wait: number,
		options?: _.ThrottleSettings): T & _.Cancelable;

	/**
	* Creates and returns a new debounced version of the passed function that will postpone its execution
	* until after wait milliseconds have elapsed since the last time it was invoked. Useful for implementing
	* behavior that should only happen after the input has stopped arriving. For example: rendering a preview
	* of a Markdown comment, recalculating a layout after the window has stopped being resized, and so on.
	*
	* Pass true for the immediate parameter to cause debounce to trigger the function on the leading instead
	* of the trailing edge of the wait interval. Useful in circumstances like preventing accidental double
	*-clicks on a "submit" button from firing a second time.
	* @param fn Function to debounce `waitMS` ms.
	* @param wait The number of milliseconds to wait before `fn` can be invoked again.
	* @param immediate True if `fn` should be invoked on the leading edge of `waitMS` instead of the trailing edge.
	* @return Debounced version of `fn` that waits `wait` ms when invoked.
	**/
	debounce<T extends Function>(
		fn: T,
		wait: number,
		immediate?: boolean): T & _.Cancelable;

	/**
	* Creates a version of the function that can only be called one time. Repeated calls to the modified
	* function will have no effect, returning the value from the original call. Useful for initialization
	* functions, instead of having to set a boolean flag and then check it later.
	* @param fn Function to only execute once.
	* @return Copy of `fn` that can only be invoked once.
	**/
	once<T extends Function>(fn: T): T;

	/**
	* Similar to ES6's rest param (http://ariya.ofilabs.com/2013/03/es6-and-rest-parameter.html)
	* This accumulates the arguments passed into an array, after a given index.
	**/
	restArgs(func: Function, starIndex?: number) : Function;

	/**
	* Creates a version of the function that will only be run after first being called count times. Useful
	* for grouping asynchronous responses, where you want to be sure that all the async calls have finished,
	* before proceeding.
	* @param number count Number of times to be called before actually executing.
	* @param Function fn The function to defer execution `count` times.
	* @return Copy of `fn` that will not execute until it is invoked `count` times.
	**/
	after(
		count: number,
		fn: Function): Function;

	/**
	* Creates a version of the function that can be called no more than count times.  The result of
	* the last function call is memoized and returned when count has been reached.
	* @param number count  The maxmimum number of times the function can be called.
	* @param Function fn The function to limit the number of times it can be called.
	* @return Copy of `fn` that can only be called `count` times.
	**/
	before(
		count: number,
		fn: Function): Function;

	/**
	* Wraps the first function inside of the wrapper function, passing it as the first argument. This allows
	* the wrapper to execute code before and after the function runs, adjust the arguments, and execute it
	* conditionally.
	* @param fn Function to wrap.
	* @param wrapper The function that will wrap `fn`.
	* @return Wrapped version of `fn.
	**/
	wrap(
		fn: Function,
		wrapper: (fn: Function, ...args: any[]) => any): Function;

	/**
	* Returns a negated version of the pass-in predicate.
	* @param (...args: any[]) => boolean predicate
	* @return (...args: any[]) => boolean
	**/
	negate(predicate: (...args: any[]) => boolean): (...args: any[]) => boolean;

	/**
	* Returns the composition of a list of functions, where each function consumes the return value of the
	* function that follows. In math terms, composing the functions f(), g(), and h() produces f(g(h())).
	* @param functions List of functions to compose.
	* @return Composition of `functions`.
	**/
	compose<A,B,C>(f1:(i:A)=>B, f2:(i:B)=>C): (i:A)=>C;
	compose(...functions: Function[]): Function;

	/**********
	* Objects *
	***********/

	/**
	* Retrieve all the names of the object's properties.
	* @param object Retrieve the key or property names from this object.
	* @return List of all the property names on `object`.
	**/
	keys(object: any): string[];

	/**
	* Retrieve all the names of object's own and inherited properties.
	* @param object Retrieve the key or property names from this object.
	* @return List of all the property names on `object`.
	**/
	allKeys(object: any): string[];

	/**
	* Return all of the values of the object's properties.
	* @param object Retrieve the values of all the properties on this object.
	* @return List of all the values on `object`.
	**/
	values<T>(object: _.Dictionary<T>): T[];

	/**
	* Return all of the values of the object's properties.
	* @param object Retrieve the values of all the properties on this object.
	* @return List of all the values on `object`.
	**/
	values(object: any): any[];

	/**
	 * Like map, but for objects. Transform the value of each property in turn.
	 * @param object The object to transform
	 * @param iteratee The function that transforms property values
	 * @param context The optional context (value of `this`) to bind to
	 * @return a new _.Dictionary of property values
	 */
	mapObject<T, U>(object: _.Dictionary<T>, iteratee: (val: T, key: string, object: _.Dictionary<T>) => U, context?: any): _.Dictionary<U>;

	/**
	 * Like map, but for objects. Transform the value of each property in turn.
	 * @param object The object to transform
	 * @param iteratee The function that tranforms property values
	 * @param context The optional context (value of `this`) to bind to
	 */
	mapObject<T>(object: any, iteratee: (val: any, key: string, object: any) => T, context?: any): _.Dictionary<T>;

	/**
	 * Like map, but for objects. Retrieves a property from each entry in the object, as if by _.property
	 * @param object The object to transform
	 * @param iteratee The property name to retrieve
	 * @param context The optional context (value of `this`) to bind to
	 */
	mapObject(object: any, iteratee: string, context?: any): _.Dictionary<any>;

	/**
	* Convert an object into a list of [key, value] pairs.
	* @param object Convert this object to a list of [key, value] pairs.
	* @return List of [key, value] pairs on `object`.
	**/
	pairs(object: any): any[][];

	/**
	* Returns a copy of the object where the keys have become the values and the values the keys.
	* For this to work, all of your object's values should be unique and string serializable.
	* @param object Object to invert key/value pairs.
	* @return An inverted key/value paired version of `object`.
	**/
	invert(object: any): any;

	/**
	* Returns a sorted list of the names of every method in an object - that is to say,
	* the name of every function property of the object.
	* @param object Object to pluck all function property names from.
	* @return List of all the function names on `object`.
	**/
	functions(object: any): string[];

	/**
	* @see _functions
	**/
	methods(object: any): string[];

	/**
	* Copy all of the properties in the source objects over to the destination object, and return
	* the destination object. It's in-order, so the last source will override properties of the
	* same name in previous arguments.
	* @param destination Object to extend all the properties from `sources`.
	* @param sources Extends `destination` with all properties from these source objects.
	* @return `destination` extended with all the properties from the `sources` objects.
	**/
	extend(
		destination: any,
		...sources: any[]): any;

	/**
	* Like extend, but only copies own properties over to the destination object. (alias: assign)
	*/
	extendOwn(
		destination: any,
		...source: any[]): any;

	/**
	* Like extend, but only copies own properties over to the destination object. (alias: extendOwn)
	*/
	assign(
		destination: any,
		...source: any[]): any;

	/**
	* Returns the first key on an object that passes a predicate test.
	* @param obj the object to search in
	* @param predicate Predicate function.
	* @param context `this` object in `iterator`, optional.
	*/
	findKey<T>(obj: _.Dictionary<T>, predicate: _.ObjectIterator<T, boolean>, context? : any): T

	/**
	* Return a copy of the object, filtered to only have values for the whitelisted keys
	* (or array of valid keys).
	* @param object Object to strip unwanted key/value pairs.
	* @keys The key/value pairs to keep on `object`.
	* @return Copy of `object` with only the `keys` properties.
	**/
	pick(
		object: any,
		...keys: any[]): any;

	/**
	* @see _.pick
	**/
	pick(
		object: any,
		fn: (value: any, key: any, object: any) => any): any;

	/**
	* Return a copy of the object, filtered to omit the blacklisted keys (or array of keys).
	* @param object Object to strip unwanted key/value pairs.
	* @param keys The key/value pairs to remove on `object`.
	* @return Copy of `object` without the `keys` properties.
	**/
	omit(
		object: any,
		...keys: string[]): any;

	/**
	* @see _.omit
	**/
	omit(
		object: any,
		keys: string[]): any;

	/**
	* @see _.omit
	**/
	omit(
		object: any,
		iteratee: Function): any;

	/**
	* Fill in null and undefined properties in object with values from the defaults objects,
	* and return the object. As soon as the property is filled, further defaults will have no effect.
	* @param object Fill this object with default values.
	* @param defaults The default values to add to `object`.
	* @return `object` with added `defaults` values.
	**/
	defaults(
		object: any,
		...defaults: any[]): any;


	/**
	* Creates an object that inherits from the given prototype object.
	* If additional properties are provided then they will be added to the
	* created object.
	* @param prototype The prototype that the returned object will inherit from.
	* @param props Additional props added to the returned object.
	**/
	create(prototype: any, props?: Object): any;

	/**
	* Create a shallow-copied clone of the object.
	* Any nested objects or arrays will be copied by reference, not duplicated.
	* @param object Object to clone.
	* @return Copy of `object`.
	**/
	clone<T>(object: T): T;

	/**
	* Invokes interceptor with the object, and then returns object. The primary purpose of this method
	* is to "tap into" a method chain, in order to perform operations on intermediate results within the chain.
	* @param object Argument to `interceptor`.
	* @param intercepter The function to modify `object` before continuing the method chain.
	* @return Modified `object`.
	**/
	tap<T>(object: T, intercepter: Function): T;

	/**
	* Does the object contain the given key? Identical to object.hasOwnProperty(key), but uses a safe
	* reference to the hasOwnProperty function, in case it's been overridden accidentally.
	* @param object Object to check for `key`.
	* @param key The key to check for on `object`.
	* @return True if `key` is a property on `object`, otherwise false.
	**/
	has(object: any, key: string): boolean;

	/**
	* Returns a predicate function that will tell you if a passed in object contains all of the key/value properties present in attrs.
	* @param attrs Object with key values pair
	* @return Predicate function
	**/
	matches<T, TResult>(attrs: T): _.ListIterator<T, TResult>;

	/**
	* Returns a predicate function that will tell you if a passed in object contains all of the key/value properties present in attrs.
	* @see _.matches
	* @param attrs Object with key values pair
	* @return Predicate function
	**/
	matcher<T, TResult>(attrs: T): _.ListIterator<T, TResult>;

	/**
	* Returns a function that will itself return the key property of any passed-in object.
	* @param key Property of the object.
	* @return Function which accept an object an returns the value of key in that object.
	**/
	property(key: string): (object: Object) => any;

	/**
	* Returns a function that will itself return the value of a object key property.
	* @param key The object to get the property value from.
	* @return Function which accept a key property in `object` and returns its value.
	**/
	propertyOf(object: Object): (key: string) => any;

	/**
	* Performs an optimized deep comparison between the two objects,
	* to determine if they should be considered equal.
	* @param object Compare to `other`.
	* @param other Compare to `object`.
	* @return True if `object` is equal to `other`.
	**/
	isEqual(object: any, other: any): boolean;

	/**
	* Returns true if object contains no values.
	* @param object Check if this object has no properties or values.
	* @return True if `object` is empty.
	**/
	isEmpty(object: any): boolean;

	/**
	* Returns true if the keys and values in `properties` matches with the `object` properties.
	* @param object Object to be compared with `properties`.
	* @param properties Properties be compared with `object`
	* @return True if `object` has matching keys and values, otherwise false.
	**/
	isMatch(object:any, properties:any): boolean;

	/**
	* Returns true if object is a DOM element.
	* @param object Check if this object is a DOM element.
	* @return True if `object` is a DOM element, otherwise false.
	**/
	isElement(object: any): object is Element;

	/**
	* Returns true if object is an Array.
	* @param object Check if this object is an Array.
	* @return True if `object` is an Array, otherwise false.
	**/
	isArray(object: any): object is any[];

	/**
	* Returns true if object is an Array.
	* @param object Check if this object is an Array.
	* @return True if `object` is an Array, otherwise false.
	**/
	isArray<T>(object: any): object is T[];

	/**
	 * Returns true if object is a Symbol.
	 * @param object Check if this object is a Symbol.
	 * @return True if `object` is a Symbol, otherwise false.
	 **/
	isSymbol(object: any): object is symbol;

	/**
	* Returns true if value is an Object. Note that JavaScript arrays and functions are objects,
	* while (normal) strings and numbers are not.
	* @param object Check if this object is an Object.
	* @return True of `object` is an Object, otherwise false.
	**/
	isObject(object: any): boolean;

	/**
	* Returns true if object is an Arguments object.
	* @param object Check if this object is an Arguments object.
	* @return True if `object` is an Arguments object, otherwise false.
	**/
	isArguments(object: any): object is IArguments;

	/**
	* Returns true if object is a Function.
	* @param object Check if this object is a Function.
	* @return True if `object` is a Function, otherwise false.
	**/
	isFunction(object: any): object is Function;

	/**
	* Returns true if object inherits from an Error.
	* @param object Check if this object is an Error.
	* @return True if `object` is a Error, otherwise false.
	**/
	isError(object:any): object is Error;

	/**
	* Returns true if object is a String.
	* @param object Check if this object is a String.
	* @return True if `object` is a String, otherwise false.
	**/
	isString(object: any): object is string;

	/**
	* Returns true if object is a Number (including NaN).
	* @param object Check if this object is a Number.
	* @return True if `object` is a Number, otherwise false.
	**/
	isNumber(object: any): object is number;

	/**
	* Returns true if object is a finite Number.
	* @param object Check if this object is a finite Number.
	* @return True if `object` is a finite Number.
	**/
	isFinite(object: any): boolean;

	/**
	* Returns true if object is either true or false.
	* @param object Check if this object is a bool.
	* @return True if `object` is a bool, otherwise false.
	**/
	isBoolean(object: any): object is boolean;

	/**
	* Returns true if object is a Date.
	* @param object Check if this object is a Date.
	* @return True if `object` is a Date, otherwise false.
	**/
	isDate(object: any): object is Date;

	/**
	* Returns true if object is a RegExp.
	* @param object Check if this object is a RegExp.
	* @return True if `object` is a RegExp, otherwise false.
	**/
	isRegExp(object: any): object is RegExp;

	/**
	* Returns true if object is NaN.
	* Note: this is not the same as the native isNaN function,
	* which will also return true if the variable is undefined.
	* @param object Check if this object is NaN.
	* @return True if `object` is NaN, otherwise false.
	**/
	isNaN(object: any): boolean;

	/**
	* Returns true if the value of object is null.
	* @param object Check if this object is null.
	* @return True if `object` is null, otherwise false.
	**/
	isNull(object: any): boolean;

	/**
	* Returns true if value is undefined.
	* @param object Check if this object is undefined.
	* @return True if `object` is undefined, otherwise false.
	**/
	isUndefined(value: any): boolean;

	/* *********
	 * Utility *
	********** */

	/**
	* Give control of the "_" variable back to its previous owner.
	* Returns a reference to the Underscore object.
	* @return Underscore object reference.
	**/
	noConflict(): any;

	/**
	* Returns the same value that is used as the argument. In math: f(x) = x
	* This function looks useless, but is used throughout Underscore as a default iterator.
	* @param value Identity of this object.
	* @return `value`.
	**/
	identity<T>(value: T): T;

	/**
	* Creates a function that returns the same value that is used as the argument of _.constant
	* @param value Identity of this object.
	* @return Function that return value.
	**/
	constant<T>(value: T): () => T;

	/**
	* Returns undefined irrespective of the arguments passed to it.  Useful as the default
	* for optional callback arguments.
	* Note there is no way to indicate a 'undefined' return, so it is currently typed as void.
	* @return undefined
	**/
	noop(): void;

	/**
	* Invokes the given iterator function n times.
	* Each invocation of iterator is called with an index argument
	* @param n Number of times to invoke `iterator`.
	* @param iterator Function iterator to invoke `n` times.
	* @param context `this` object in `iterator`, optional.
	**/
	times<TResult>(n: number, iterator: (n: number) => TResult, context?: any): TResult[];

	/**
	* Returns a random integer between min and max, inclusive. If you only pass one argument,
	* it will return a number between 0 and that number.
	* @param max The maximum random number.
	* @return A random number between 0 and `max`.
	**/
	random(max: number): number;

	/**
	* @see _.random
	* @param min The minimum random number.
	* @return A random number between `min` and `max`.
	**/
	random(min: number, max: number): number;

	/**
	* Allows you to extend Underscore with your own utility functions. Pass a hash of
	* {name: function} definitions to have your functions added to the Underscore object,
	* as well as the OOP wrapper.
	* @param object Mixin object containing key/function pairs to add to the Underscore object.
	**/
	mixin(object: any): void;

	/**
	* A mostly-internal function to generate callbacks that can be applied to each element
	* in a collection, returning the desired result -- either identity, an arbitrary callback,
	* a property matcher, or a propetery accessor.
	* @param string|Function|Object value The value to iterate over, usually the key.
	* @param any context
	* @return Callback that can be applied to each element in a collection.
	**/
	iteratee(value: string): Function;
	iteratee(value: Function, context?: any): Function;
	iteratee(value: Object): Function;

	/**
	* Generate a globally-unique id for client-side models or DOM elements that need one.
	* If prefix is passed, the id will be appended to it. Without prefix, returns an integer.
	* @param prefix A prefix string to start the unique ID with.
	* @return Unique string ID beginning with `prefix`.
	**/
	uniqueId(prefix?: string): string;

	/**
	* Escapes a string for insertion into HTML, replacing &, <, >, ", ', and / characters.
	* @param str Raw string to escape.
	* @return `str` HTML escaped.
	**/
	escape(str: string): string;

	/**
	* The opposite of escape, replaces &amp;, &lt;, &gt;, &quot;, and &#x27; with their unescaped counterparts.
	* @param str HTML escaped string.
	* @return `str` Raw string.
	**/
	unescape(str: string): string;

	/**
	* If the value of the named property is a function then invoke it; otherwise, return it.
	* @param object Object to maybe invoke function `property` on.
	* @param property The function by name to invoke on `object`.
	* @param defaultValue The value to be returned in case `property` doesn't exist or is undefined.
	* @return The result of invoking the function `property` on `object.
	**/
	result(object: any, property: string, defaultValue?:any): any;

	/**
	* Compiles JavaScript templates into functions that can be evaluated for rendering. Useful
	* for rendering complicated bits of HTML from JSON data sources. Template functions can both
	* interpolate variables, using <%= ... %>, as well as execute arbitrary JavaScript code, with
	* <% ... %>. If you wish to interpolate a value, and have it be HTML-escaped, use <%- ... %> When
	* you evaluate a template function, pass in a data object that has properties corresponding to
	* the template's free variables. If you're writing a one-off, you can pass the data object as
	* the second parameter to template in order to render immediately instead of returning a template
	* function. The settings argument should be a hash containing any _.templateSettings that should
	* be overridden.
	* @param templateString Underscore HTML template.
	* @param data Data to use when compiling `templateString`.
	* @param settings Settings to use while compiling.
	* @return Returns the compiled Underscore HTML template.
	**/
	template(templateString: string, settings?: _.TemplateSettings): (...data: any[]) => string;

	/**
	* By default, Underscore uses ERB-style template delimiters, change the
	* following template settings to use alternative delimiters.
	**/
	templateSettings: _.TemplateSettings;

	/**
	* Returns an integer timestamp for the current time, using the fastest method available in the runtime. Useful for implementing timing/animation functions.
	**/
	now(): number;

	/* **********
	 * Chaining *
	*********** */

	/**
	* Returns a wrapped object. Calling methods on this object will continue to return wrapped objects
	* until value() is used.
	* @param obj Object to chain.
	* @return Wrapped `obj`.
	**/
	chain<T>(obj: T[]): _Chain<T>;
	chain<T>(obj: _.Dictionary<T>): _Chain<T>;
	chain<T extends {}>(obj: T): _Chain<T>;
}

interface Underscore<T> {

	/* *************
	 * Collections *
	 ************* */

	/**
	* Wrapped type `any[]`.
	* @see _.each
	**/
	each(iterator: _.ListIterator<T, void>, context?: any): T[];

	/**
	* @see _.each
	**/
	each(iterator: _.ObjectIterator<T, void>, context?: any): T[];

	/**
	* @see _.each
	**/
	forEach(iterator: _.ListIterator<T, void>, context?: any): T[];

	/**
	* @see _.each
	**/
	forEach(iterator: _.ObjectIterator<T, void>, context?: any): T[];

	/**
	* Wrapped type `any[]`.
	* @see _.map
	**/
	map<TResult>(iterator: _.ListIterator<T, TResult>, context?: any): TResult[];

	/**
	* Wrapped type `any[]`.
	* @see _.map
	**/
	map<TResult>(iterator: _.ObjectIterator<T, TResult>, context?: any): TResult[];

	/**
	* @see _.map
	**/
	collect<TResult>(iterator: _.ListIterator<T, TResult>, context?: any): TResult[];

	/**
	* @see _.map
	**/
	collect<TResult>(iterator: _.ObjectIterator<T, TResult>, context?: any): TResult[];

	/**
	* Wrapped type `any[]`.
	* @see _.reduce
	**/
	reduce<TResult>(iterator: _.MemoIterator<T, TResult>, memo?: TResult, context?: any): TResult;

	/**
	* @see _.reduce
	**/
	inject<TResult>(iterator: _.MemoIterator<T, TResult>, memo?: TResult, context?: any): TResult;

	/**
	* @see _.reduce
	**/
	foldl<TResult>(iterator: _.MemoIterator<T, TResult>, memo?: TResult, context?: any): TResult;

	/**
	* Wrapped type `any[]`.
	* @see _.reduceRight
	**/
	reduceRight<TResult>(iterator: _.MemoIterator<T, TResult>, memo?: TResult, context?: any): TResult;

	/**
	* @see _.reduceRight
	**/
	foldr<TResult>(iterator: _.MemoIterator<T, TResult>, memo?: TResult, context?: any): TResult;

	/**
	* Wrapped type `any[]`.
	* @see _.find
	**/
	find<T>(iterator: _.ListIterator<T, boolean>|_.ObjectIterator<T, boolean>, context?: any): T;

	/**
	* @see _.find
	**/
	find<T, U extends {}>(interator: U): T;

	/**
	* @see _.find
	**/
	find<T>(interator: string): T;

	/**
	* @see _.find
	**/
	detect<T>(iterator: _.ListIterator<T, boolean>|_.ObjectIterator<T, boolean>, context?: any): T;

	/**
	* @see _.find
	**/
	detect<T, U extends {}>(interator?: U): T;

	/**
	* @see _.find
	**/
	detect<T>(interator?: string): T;

	/**
	* Wrapped type `any[]`.
	* @see _.filter
	**/
	filter(iterator: _.ListIterator<T, boolean>, context?: any): T[];

	/**
	* @see _.filter
	**/
	select(iterator: _.ListIterator<T, boolean>, context?: any): T[];

	/**
	* Wrapped type `any[]`.
	* @see _.where
	**/
	where<U extends {}>(properties: U): T[];

	/**
	* Wrapped type `any[]`.
	* @see _.findWhere
	**/
	findWhere<U extends {}>(properties: U): T;

	/**
	* Wrapped type `any[]`.
	* @see _.reject
	**/
	reject(iterator: _.ListIterator<T, boolean>, context?: any): T[];

	/**
	* Wrapped type `any[]`.
	* @see _.all
	**/
	all(iterator?: _.ListIterator<T, boolean>, context?: any): boolean;

	/**
	* @see _.all
	**/
	every(iterator?: _.ListIterator<T, boolean>, context?: any): boolean;

	/**
	* Wrapped type `any[]`.
	* @see _.any
	**/
	any(iterator?: _.ListIterator<T, boolean>, context?: any): boolean;

	/**
	* @see _.any
	**/
	some(iterator?: _.ListIterator<T, boolean>, context?: any): boolean;

	/**
	* Wrapped type `any[]`.
	* @see _.contains
	**/
	contains(value: T, fromIndex? : number): boolean;

	/**
	* Alias for 'contains'.
	* @see contains
	**/
	include(value: T, fromIndex? : number): boolean;

	/**
	 * Alias for 'contains'.
	 * @see contains
	 **/
	includes(value: T, fromIndex? : number): boolean;

	/**
	* Wrapped type `any[]`.
	* @see _.invoke
	**/
	invoke(methodName: string, ...arguments: any[]): any;

	/**
	* Wrapped type `any[]`.
	* @see _.pluck
	**/
	pluck(propertyName: string): any[];

	/**
	* Wrapped type `number[]`.
	* @see _.max
	**/
	max(): number;

	/**
	* Wrapped type `any[]`.
	* @see _.max
	**/
	max(iterator: _.ListIterator<T, number>, context?: any): T;

	/**
	* Wrapped type `any[]`.
	* @see _.max
	**/
	max(iterator?: _.ListIterator<T, any>, context?: any): T;

	/**
	* Wrapped type `number[]`.
	* @see _.min
	**/
	min(): number;

	/**
	* Wrapped type `any[]`.
	* @see _.min
	**/
	min(iterator: _.ListIterator<T, number>, context?: any): T;

	/**
	* Wrapped type `any[]`.
	* @see _.min
	**/
	min(iterator?: _.ListIterator<T, any>, context?: any): T;

	/**
	* Wrapped type `any[]`.
	* @see _.sortBy
	**/
	sortBy(iterator?: _.ListIterator<T, any>, context?: any): T[];

	/**
	* Wrapped type `any[]`.
	* @see _.sortBy
	**/
	sortBy(iterator: string, context?: any): T[];

	/**
	* Wrapped type `any[]`.
	* @see _.groupBy
	**/
	groupBy(iterator?: _.ListIterator<T, any>, context?: any): _.Dictionary<_.List<T>>;

	/**
	* Wrapped type `any[]`.
	* @see _.groupBy
	**/
	groupBy(iterator: string, context?: any): _.Dictionary<T[]>;

	/**
	* Wrapped type `any[]`.
	* @see _.indexBy
	**/
	indexBy(iterator: _.ListIterator<T, any>, context?: any): _.Dictionary<T>;

	/**
	* Wrapped type `any[]`.
	* @see _.indexBy
	**/
	indexBy(iterator: string, context?: any): _.Dictionary<T>;

	/**
	* Wrapped type `any[]`.
	* @see _.countBy
	**/
	countBy(iterator?: _.ListIterator<T, any>, context?: any): _.Dictionary<number>;

	/**
	* Wrapped type `any[]`.
	* @see _.countBy
	**/
	countBy(iterator: string, context?: any): _.Dictionary<number>;

	/**
	* Wrapped type `any[]`.
	* @see _.shuffle
	**/
	shuffle(): T[];

	/**
	* Wrapped type `any[]`.
	* @see _.sample
	**/
	sample<T>(n: number): T[];

	/**
	* @see _.sample
	**/
	sample<T>(): T;

	/**
	* Wrapped type `any`.
	* @see _.toArray
	**/
	toArray(): T[];

	/**
	* Wrapped type `any`.
	* @see _.size
	**/
	size(): number;

	/*********
	* Arrays *
	**********/

	/**
	* Wrapped type `any[]`.
	* @see _.first
	**/
	first(): T;

	/**
	* Wrapped type `any[]`.
	* @see _.first
	**/
	first(n: number): T[];

	/**
	* @see _.first
	**/
	head(): T;

	/**
	* @see _.first
	**/
	head(n: number): T[];

	/**
	* @see _.first
	**/
	take(): T;

	/**
	* @see _.first
	**/
	take(n: number): T[];

	/**
	* Wrapped type `any[]`.
	* @see _.initial
	**/
	initial(n?: number): T[];

	/**
	* Wrapped type `any[]`.
	* @see _.last
	**/
	last(): T;

	/**
	* Wrapped type `any[]`.
	* @see _.last
	**/
	last(n: number): T[];

	/**
	* Wrapped type `any[]`.
	* @see _.rest
	**/
	rest(n?: number): T[];

	/**
	* @see _.rest
	**/
	tail(n?: number): T[];

	/**
	* @see _.rest
	**/
	drop(n?: number): T[];

	/**
	* Wrapped type `any[]`.
	* @see _.compact
	**/
	compact(): T[];

	/**
	* Wrapped type `any`.
	* @see _.flatten
	**/
	flatten(shallow?: boolean): any[];

	/**
	* Wrapped type `any[]`.
	* @see _.without
	**/
	without(...values: T[]): T[];

	/**
	* Wrapped type `any[]`.
	* @see _.partition
	**/
	partition(iterator: _.ListIterator<T, boolean>, context?: any): T[][];

	/**
	* Wrapped type `any[][]`.
	* @see _.union
	**/
	union(...arrays: _.List<T>[]): T[];

	/**
	* Wrapped type `any[][]`.
	* @see _.intersection
	**/
	intersection(...arrays: _.List<T>[]): T[];

	/**
	* Wrapped type `any[]`.
	* @see _.difference
	**/
	difference(...others: _.List<T>[]): T[];

	/**
	* Wrapped type `any[]`.
	* @see _.uniq
	**/
	uniq(isSorted?: boolean, iterator?: _.ListIterator<T, any>): T[];

	/**
	* Wrapped type `any[]`.
	* @see _.uniq
	**/
	uniq<TSort>(iterator?: _.ListIterator<T, TSort>, context?: any): T[];

	/**
	* @see _.uniq
	**/
	unique<TSort>(isSorted?: boolean, iterator?: _.ListIterator<T, TSort>): T[];

	/**
	* @see _.uniq
	**/
	unique<TSort>(iterator?: _.ListIterator<T, TSort>, context?: any): T[];

	/**
	* Wrapped type `any[][]`.
	* @see _.zip
	**/
	zip(...arrays: any[][]): any[][];

	/**
	* Wrapped type `any[][]`.
	* @see _.unzip
	**/
	unzip(...arrays: any[][]): any[][];

	/**
	* Wrapped type `any[][]`.
	* @see _.object
	**/
	object(...keyValuePairs: any[][]): any;

	/**
	* @see _.object
	**/
	object(values?: any): any;

	/**
	* Wrapped type `any[]`.
	* @see _.indexOf
	**/
	indexOf(value: T, isSorted?: boolean): number;

	/**
	* @see _.indexOf
	**/
	indexOf(value: T, startFrom: number): number;

	/**
	* Wrapped type `any[]`.
	* @see _.lastIndexOf
	**/
	lastIndexOf(value: T, from?: number): number;

	/**
	* @see _.findIndex
	**/
	findIndex<T>(array: _.List<T>, predicate: _.ListIterator<T, boolean> | {}, context?: any): number;

	/**
	* @see _.findLastIndex
	**/
	findLastIndex<T>(array: _.List<T>, predicate: _.ListIterator<T, boolean> | {}, context?: any): number;

	/**
	* Wrapped type `any[]`.
	* @see _.sortedIndex
	**/
	sortedIndex(value: T, iterator?: (x: T) => any, context?: any): number;

	/**
	* Wrapped type `number`.
	* @see _.range
	**/
	range(stop: number, step?: number): number[];

	/**
	* Wrapped type `number`.
	* @see _.range
	**/
	range(): number[];

	/**
	 * Wrapped type any[][].
	 * @see _.chunk
	 **/
	chunk(): any[][];

	/* ***********
	 * Functions *
	************ */

	/**
	* Wrapped type `Function`.
	* @see _.bind
	**/
	bind(object: any, ...arguments: any[]): Function;

	/**
	* Wrapped type `object`.
	* @see _.bindAll
	**/
	bindAll(...methodNames: string[]): any;

	/**
	* Wrapped type `Function`.
	* @see _.partial
	**/
	partial(...arguments: any[]): Function;

	/**
	* Wrapped type `Function`.
	* @see _.memoize
	**/
	memoize(hashFn?: (n: any) => string): Function;

	/**
	* Wrapped type `Function`.
	* @see _.defer
	**/
	defer(...arguments: any[]): void;

	/**
	* Wrapped type `Function`.
	* @see _.delay
	**/
	delay(wait: number, ...arguments: any[]): any;

	/**
	* @see _.delay
	**/
	delay(...arguments: any[]): any;

	/**
	* Wrapped type `Function`.
	* @see _.throttle
	**/
	throttle(wait: number, options?: _.ThrottleSettings): Function & _.Cancelable;

	/**
	* Wrapped type `Function`.
	* @see _.debounce
	**/
	debounce(wait: number, immediate?: boolean): Function & _.Cancelable;

	/**
	* Wrapped type `Function`.
	* @see _.once
	**/
	once(): Function;

	/**
	* Wrapped type `Function`.
	* @see _.once
	**/
	restArgs(starIndex?: number) : Function;

	/**
	* Wrapped type `number`.
	* @see _.after
	**/
	after(fn: Function): Function;

	/**
	* Wrapped type `number`.
	* @see _.before
	**/
	before(fn: Function): Function;

	/**
	* Wrapped type `Function`.
	* @see _.wrap
	**/
	wrap(wrapper: Function): () => Function;

	/**
	* Wrapped type `Function`.
	* @see _.negate
	**/
	negate(): boolean;

	/**
	* Wrapped type `Function[]`.
	* @see _.compose
	**/
	compose(...functions: Function[]): Function;

	/********* *
	 * Objects *
	********** */

	/**
	* Wrapped type `object`.
	* @see _.keys
	**/
	keys(): string[];

	/**
	* Wrapped type `object`.
	* @see _.allKeys
	**/
	allKeys(): string[];

	/**
	* Wrapped type `object`.
	* @see _.values
	**/
	values(): T[];

	/**
	* Wrapped type `object`.
	* @see _.pairs
	**/
	pairs(): any[][];

	/**
	* Wrapped type `object`.
	* @see _.invert
	**/
	invert(): any;

	/**
	* Wrapped type `object`.
	* @see _.functions
	**/
	functions(): string[];

	/**
	* @see _.functions
	**/
	methods(): string[];

	/**
	* Wrapped type `object`.
	* @see _.extend
	**/
	extend(...sources: any[]): any;

	/**
	* Wrapped type `object`.
	* @see _.extend
	**/
	findKey(predicate: _.ObjectIterator<any, boolean>, context? : any): any

	/**
	* Wrapped type `object`.
	* @see _.pick
	**/
	pick(...keys: any[]): any;
	pick(keys: any[]): any;
	pick(fn: (value: any, key: any, object: any) => any): any;

	/**
	* Wrapped type `object`.
	* @see _.omit
	**/
	omit(...keys: string[]): any;
	omit(keys: string[]): any;
	omit(fn: Function): any;

	/**
	* Wrapped type `object`.
	* @see _.defaults
	**/
	defaults(...defaults: any[]): any;

	/**
	* Wrapped type `any`.
	* @see _.create
	**/
	create(props?: Object): any;

	/**
	* Wrapped type `any[]`.
	* @see _.clone
	**/
	clone(): T;

	/**
	* Wrapped type `object`.
	* @see _.tap
	**/
	tap(interceptor: (...as: any[]) => any): any;

	/**
	* Wrapped type `object`.
	* @see _.has
	**/
	has(key: string): boolean;

	/**
	* Wrapped type `any[]`.
	* @see _.matches
	**/
	matches<TResult>(): _.ListIterator<T, TResult>;

	/**
	 * Wrapped type `any[]`.
	 * @see _.matcher
	 **/
	matcher<TResult>(): _.ListIterator<T, TResult>;

	/**
	* Wrapped type `string`.
	* @see _.property
	**/
	property(): (object: Object) => any;

	/**
	* Wrapped type `object`.
	* @see _.propertyOf
	**/
	propertyOf(): (key: string) => any;

	/**
	* Wrapped type `object`.
	* @see _.isEqual
	**/
	isEqual(other: any): boolean;

	/**
	* Wrapped type `object`.
	* @see _.isEmpty
	**/
	isEmpty(): boolean;

	/**
	* Wrapped type `object`.
	* @see _.isMatch
	**/
	isMatch(): boolean;

	/**
	* Wrapped type `object`.
	* @see _.isElement
	**/
	isElement(): boolean;

	/**
	* Wrapped type `object`.
	* @see _.isArray
	**/
	isArray(): boolean;

	/**
	 * Wrapped type `object`.
	 * @see _.isSymbol
	 **/
	isSymbol(): boolean;

	/**
	* Wrapped type `object`.
	* @see _.isObject
	**/
	isObject(): boolean;

	/**
	* Wrapped type `object`.
	* @see _.isArguments
	**/
	isArguments(): boolean;

	/**
	* Wrapped type `object`.
	* @see _.isFunction
	**/
	isFunction(): boolean;

	/**
	* Wrapped type `object`.
	* @see _.isError
	**/
	isError(): boolean;

	/**
	* Wrapped type `object`.
	* @see _.isString
	**/
	isString(): boolean;

	/**
	* Wrapped type `object`.
	* @see _.isNumber
	**/
	isNumber(): boolean;

	/**
	* Wrapped type `object`.
	* @see _.isFinite
	**/
	isFinite(): boolean;

	/**
	* Wrapped type `object`.
	* @see _.isBoolean
	**/
	isBoolean(): boolean;

	/**
	* Wrapped type `object`.
	* @see _.isDate
	**/
	isDate(): boolean;

	/**
	* Wrapped type `object`.
	* @see _.isRegExp
	**/
	isRegExp(): boolean;

	/**
	* Wrapped type `object`.
	* @see _.isNaN
	**/
	isNaN(): boolean;

	/**
	* Wrapped type `object`.
	* @see _.isNull
	**/
	isNull(): boolean;

	/**
	* Wrapped type `object`.
	* @see _.isUndefined
	**/
	isUndefined(): boolean;

	/********* *
	 * Utility *
	********** */

	/**
	* Wrapped type `any`.
	* @see _.identity
	**/
	identity(): any;

	/**
	* Wrapped type `any`.
	* @see _.constant
	**/
	constant(): () => T;

	/**
	* Wrapped type `any`.
	* @see _.noop
	**/
	noop(): void;

	/**
	* Wrapped type `number`.
	* @see _.times
	**/
	times<TResult>(iterator: (n: number) => TResult, context?: any): TResult[];

	/**
	* Wrapped type `number`.
	* @see _.random
	**/
	random(): number;
	/**
	* Wrapped type `number`.
	* @see _.random
	**/
	random(max: number): number;

	/**
	* Wrapped type `object`.
	* @see _.mixin
	**/
	mixin(): void;

	/**
	* Wrapped type `string|Function|Object`.
	* @see _.iteratee
	**/
	iteratee(context?: any): Function;

	/**
	* Wrapped type `string`.
	* @see _.uniqueId
	**/
	uniqueId(): string;

	/**
	* Wrapped type `string`.
	* @see _.escape
	**/
	escape(): string;

	/**
	* Wrapped type `string`.
	* @see _.unescape
	**/
	unescape(): string;

	/**
	* Wrapped type `object`.
	* @see _.result
	**/
	result(property: string, defaultValue?:any): any;

	/**
	* Wrapped type `string`.
	* @see _.template
	**/
	template(settings?: _.TemplateSettings): (...data: any[]) => string;

	/********** *
	 * Chaining *
	*********** */

	/**
	* Wrapped type `any`.
	* @see _.chain
	**/
	chain(): _Chain<T>;

	/**
	* Wrapped type `any`.
	* Extracts the value of a wrapped object.
	* @return Value of the wrapped object.
	**/
	value<TResult>(): TResult;
}

interface _Chain<T> {

	/* *************
	 * Collections *
	 ************* */

	/**
	* Wrapped type `any[]`.
	* @see _.each
	**/
	each(iterator: _.ListIterator<T, void>, context?: any): _Chain<T>;

	/**
	* @see _.each
	**/
	each(iterator: _.ObjectIterator<T, void>, context?: any): _Chain<T>;

	/**
	* @see _.each
	**/
	forEach(iterator: _.ListIterator<T, void>, context?: any): _Chain<T>;

	/**
	* @see _.each
	**/
	forEach(iterator: _.ObjectIterator<T, void>, context?: any): _Chain<T>;

	/**
	* Wrapped type `any[]`.
	* @see _.map
	**/
	map<TArray>(iterator: _.ListIterator<T, TArray[]>, context?: any): _ChainOfArrays<TArray>;

	/**
	* Wrapped type `any[]`.
	* @see _.map
	**/
	map<TResult>(iterator: _.ListIterator<T, TResult>, context?: any): _Chain<TResult>;

	/**
	* Wrapped type `any[]`.
	* @see _.map
	**/
	map<TArray>(iterator: _.ObjectIterator<T, TArray[]>, context?: any): _ChainOfArrays<TArray>;

	/**
	* Wrapped type `any[]`.
	* @see _.map
	**/
	map<TResult>(iterator: _.ObjectIterator<T, TResult>, context?: any): _Chain<TResult>;

	/**
	* @see _.map
	**/
	collect<TResult>(iterator: _.ListIterator<T, TResult>, context?: any): _Chain<TResult>;

	/**
	* @see _.map
	**/
	collect<TResult>(iterator: _.ObjectIterator<T, TResult>, context?: any): _Chain<TResult>;

	/**
	* Wrapped type `any[]`.
	* @see _.reduce
	**/
	reduce<TResult>(iterator: _.MemoIterator<T, TResult>, memo?: TResult, context?: any): _ChainSingle<TResult>;

	/**
	* @see _.reduce
	**/
	inject<TResult>(iterator: _.MemoIterator<T, TResult>, memo?: TResult, context?: any): _ChainSingle<TResult>;

	/**
	* @see _.reduce
	**/
	foldl<TResult>(iterator: _.MemoIterator<T, TResult>, memo?: TResult, context?: any): _ChainSingle<TResult>;

	/**
	* Wrapped type `any[]`.
	* @see _.reduceRight
	**/
	reduceRight<TResult>(iterator: _.MemoIterator<T, TResult>, memo?: TResult, context?: any): _ChainSingle<TResult>;

	/**
	* @see _.reduceRight
	**/
	foldr<TResult>(iterator: _.MemoIterator<T, TResult>, memo?: TResult, context?: any): _ChainSingle<TResult>;

	/**
	* Wrapped type `any[]`.
	* @see _.find
	**/
	find<T>(iterator: _.ListIterator<T, boolean>|_.ObjectIterator<T, boolean>, context?: any): _ChainSingle<T>;

	/**
	* @see _.find
	**/
	find<T, U extends {}>(interator: U): _ChainSingle<T>;

	/**
	* @see _.find
	**/
	find<T>(interator: string): _ChainSingle<T>;

	/**
	* @see _.find
	**/
	detect<T>(iterator: _.ListIterator<T, boolean>|_.ObjectIterator<T, boolean>, context?: any): _ChainSingle<T>;

	/**
	* @see _.find
	**/
	detect<T, U extends {}>(interator: U): _ChainSingle<T>;

	/**
	* @see _.find
	**/
	detect<T>(interator: string): _ChainSingle<T>;

	/**
	* Wrapped type `any[]`.
	* @see _.filter
	**/
	filter(iterator: _.ListIterator<T, boolean>, context?: any): _Chain<T>;

	/**
	* @see _.filter
	**/
	select(iterator: _.ListIterator<T, boolean>, context?: any): _Chain<T>;

	/**
	* Wrapped type `any[]`.
	* @see _.where
	**/
	where<U extends {}>(properties: U): _Chain<T>;

	/**
	* Wrapped type `any[]`.
	* @see _.findWhere
	**/
	findWhere<U extends {}>(properties: U): _ChainSingle<T>;

	/**
	* Wrapped type `any[]`.
	* @see _.reject
	**/
	reject(iterator: _.ListIterator<T, boolean>, context?: any): _Chain<T>;

	/**
	* Wrapped type `any[]`.
	* @see _.all
	**/
	all(iterator?: _.ListIterator<T, boolean>, context?: any): _ChainSingle<boolean>;

	/**
	* @see _.all
	**/
	every(iterator?: _.ListIterator<T, boolean>, context?: any): _ChainSingle<boolean>;

	/**
	* Wrapped type `any[]`.
	* @see _.any
	**/
	any(iterator?: _.ListIterator<T, boolean>, context?: any): _ChainSingle<boolean>;

	/**
	* @see _.any
	**/
	some(iterator?: _.ListIterator<T, boolean>, context?: any): _ChainSingle<boolean>;

	/**
	* Wrapped type `any[]`.
	* @see _.contains
	**/
	contains(value: T, fromIndex?: number): _ChainSingle<boolean>;

	/**
	* Alias for 'contains'.
	* @see contains
	**/
	include(value: T, fromIndex?: number): _ChainSingle<boolean>;

	/**
	 * Alias for 'contains'.
	 * @see contains
	 **/
	includes(value: T, fromIndex?: number): _ChainSingle<boolean>;

	/**
	* Wrapped type `any[]`.
	* @see _.invoke
	**/
	invoke(methodName: string, ...arguments: any[]): _Chain<T>;

	/**
	* Wrapped type `any[]`.
	* @see _.pluck
	**/
	pluck(propertyName: string): _Chain<any>;

	/**
	* Wrapped type `number[]`.
	* @see _.max
	**/
	max(): _ChainSingle<T>;

	/**
	* Wrapped type `any[]`.
	* @see _.max
	**/
	max(iterator: _.ListIterator<T, number>, context?: any): _ChainSingle<T>;

	/**
	* Wrapped type `any[]`.
	* @see _.max
	**/
	max(iterator?: _.ListIterator<T, any>, context?: any): _ChainSingle<T>;

	/**
	* Wrapped type `number[]`.
	* @see _.min
	**/
	min(): _ChainSingle<T>;

	/**
	* Wrapped type `any[]`.
	* @see _.min
	**/
	min(iterator: _.ListIterator<T, number>, context?: any): _ChainSingle<T>;

	/**
	* Wrapped type `any[]`.
	* @see _.min
	**/
	min(iterator?: _.ListIterator<T, any>, context?: any): _ChainSingle<T>;

	/**
	* Wrapped type `any[]`.
	* @see _.sortBy
	**/
	sortBy(iterator?: _.ListIterator<T, any>, context?: any): _Chain<T>;

	/**
	* Wrapped type `any[]`.
	* @see _.sortBy
	**/
	sortBy(iterator: string, context?: any): _Chain<T>;

	/**
	* Wrapped type `any[]`.
	* @see _.groupBy
	**/
	groupBy(iterator?: _.ListIterator<T, any>, context?: any): _ChainOfArrays<T>;

	/**
	* Wrapped type `any[]`.
	* @see _.groupBy
	**/
	groupBy(iterator: string, context?: any): _ChainOfArrays<T>;

	/**
	* Wrapped type `any[]`.
	* @see _.indexBy
	**/
	indexBy(iterator: _.ListIterator<T, any>, context?: any): _Chain<T>;

	/**
	* Wrapped type `any[]`.
	* @see _.indexBy
	**/
	indexBy(iterator: string, context?: any): _Chain<T>;

	/**
	* Wrapped type `any[]`.
	* @see _.countBy
	**/
	countBy(iterator?: _.ListIterator<T, any>, context?: any): _Chain<T>;

	/**
	* Wrapped type `any[]`.
	* @see _.countBy
	**/
	countBy(iterator: string, context?: any): _Chain<T>;

	/**
	* Wrapped type `any[]`.
	* @see _.shuffle
	**/
	shuffle(): _Chain<T>;

	/**
	* Wrapped type `any[]`.
	* @see _.sample
	**/
	sample<T>(n: number): _Chain<T>;

	/**
	* @see _.sample
	**/
	sample<T>(): _Chain<T>;

	/**
	* Wrapped type `any`.
	* @see _.toArray
	**/
	toArray(): _Chain<T>;

	/**
	* Wrapped type `any`.
	* @see _.size
	**/
	size(): _ChainSingle<number>;

	/*********
	* Arrays *
	**********/

	/**
	* Wrapped type `any[]`.
	* @see _.first
	**/
	first(): _ChainSingle<T>;

	/**
	* Wrapped type `any[]`.
	* @see _.first
	**/
	first(n: number): _Chain<T>;

	/**
	* @see _.first
	**/
	head(): _Chain<T>;

	/**
	* @see _.first
	**/
	head(n: number): _Chain<T>;

	/**
	* @see _.first
	**/
	take(): _Chain<T>;

	/**
	* @see _.first
	**/
	take(n: number): _Chain<T>;

	/**
	* Wrapped type `any[]`.
	* @see _.initial
	**/
	initial(n?: number): _Chain<T>;

	/**
	* Wrapped type `any[]`.
	* @see _.last
	**/
	last(): _ChainSingle<T>;

	/**
	* Wrapped type `any[]`.
	* @see _.last
	**/
	last(n: number): _Chain<T>;

	/**
	* Wrapped type `any[]`.
	* @see _.rest
	**/
	rest(n?: number): _Chain<T>;

	/**
	* @see _.rest
	**/
	tail(n?: number): _Chain<T>;

	/**
	* @see _.rest
	**/
	drop(n?: number): _Chain<T>;

	/**
	* Wrapped type `any[]`.
	* @see _.compact
	**/
	compact(): _Chain<T>;

	/**
	* Wrapped type `any`.
	* @see _.flatten
	**/
	flatten(shallow?: boolean): _Chain<any>;

	/**
	* Wrapped type `any[]`.
	* @see _.without
	**/
	without(...values: T[]): _Chain<T>;

	/**
	* Wrapped type `any[]`.
	* @see _.partition
	**/
	partition(iterator: _.ListIterator<T, boolean>, context?: any): _Chain<T[]>;

	/**
	* Wrapped type `any[][]`.
	* @see _.union
	**/
	union(...arrays: _.List<T>[]): _Chain<T>;

	/**
	* Wrapped type `any[][]`.
	* @see _.intersection
	**/
	intersection(...arrays: _.List<T>[]): _Chain<T>;

	/**
	* Wrapped type `any[]`.
	* @see _.difference
	**/
	difference(...others: _.List<T>[]): _Chain<T>;

	/**
	* Wrapped type `any[]`.
	* @see _.uniq
	**/
	uniq(isSorted?: boolean, iterator?: _.ListIterator<T, any>): _Chain<T>;

	/**
	* Wrapped type `any[]`.
	* @see _.uniq
	**/
	uniq<TSort>(iterator?: _.ListIterator<T, TSort>, context?: any): _Chain<T>;

	/**
	* @see _.uniq
	**/
	unique<TSort>(isSorted?: boolean, iterator?: _.ListIterator<T, TSort>): _Chain<T>;

	/**
	* @see _.uniq
	**/
	unique<TSort>(iterator?: _.ListIterator<T, TSort>, context?: any): _Chain<T>;

	/**
	* Wrapped type `any[][]`.
	* @see _.zip
	**/
	zip(...arrays: any[][]): _Chain<T>;

	/**
	* Wrapped type `any[][]`.
	* @see _.unzip
	**/
	unzip(...arrays: any[][]): _Chain<T>;

	/**
	* Wrapped type `any[][]`.
	* @see _.object
	**/
	object(...keyValuePairs: any[][]): _Chain<T>;

	/**
	* @see _.object
	**/
	object(values?: any): _Chain<T>;

	/**
	* Wrapped type `any[]`.
	* @see _.indexOf
	**/
	indexOf(value: T, isSorted?: boolean): _ChainSingle<number>;

	/**
	* @see _.indexOf
	**/
	indexOf(value: T, startFrom: number): _ChainSingle<number>;

	/**
	* Wrapped type `any[]`.
	* @see _.lastIndexOf
	**/
	lastIndexOf(value: T, from?: number): _ChainSingle<number>;

	/**
	* @see _.findIndex
	**/
	findIndex<T>(predicate: _.ListIterator<T, boolean> | {}, context?: any): _ChainSingle<number>;

	/**
	* @see _.findLastIndex
	**/
	findLastIndex<T>(predicate: _.ListIterator<T, boolean> | {}, context?: any): _ChainSingle<number>;

	/**
	* Wrapped type `any[]`.
	* @see _.sortedIndex
	**/
	sortedIndex(value: T, iterator?: (x: T) => any, context?: any): _ChainSingle<number>;

	/**
	* Wrapped type `number`.
	* @see _.range
	**/
	range(stop: number, step?: number): _Chain<T>;

	/**
	* Wrapped type `number`.
	* @see _.range
	**/
	range(): _Chain<T>;

	/**
	 * Wrapped type `any[][]`.
	 * @see _.chunk
	 **/
	chunk(): _Chain<T>;

	/* ***********
	 * Functions *
	************ */

	/**
	* Wrapped type `Function`.
	* @see _.bind
	**/
	bind(object: any, ...arguments: any[]): _Chain<T>;

	/**
	* Wrapped type `object`.
	* @see _.bindAll
	**/
	bindAll(...methodNames: string[]): _Chain<T>;

	/**
	* Wrapped type `Function`.
	* @see _.partial
	**/
	partial(...arguments: any[]): _Chain<T>;

	/**
	* Wrapped type `Function`.
	* @see _.memoize
	**/
	memoize(hashFn?: (n: any) => string): _Chain<T>;

	/**
	* Wrapped type `Function`.
	* @see _.defer
	**/
	defer(...arguments: any[]): _Chain<T>;

	/**
	* Wrapped type `Function`.
	* @see _.delay
	**/
	delay(wait: number, ...arguments: any[]): _Chain<T>;

	/**
	* @see _.delay
	**/
	delay(...arguments: any[]): _Chain<T>;

	/**
	* Wrapped type `Function`.
	* @see _.throttle
	**/
	throttle(wait: number, options?: _.ThrottleSettings): _Chain<T>;

	/**
	* Wrapped type `Function`.
	* @see _.debounce
	**/
	debounce(wait: number, immediate?: boolean): _Chain<T>;

	/**
	* Wrapped type `Function`.
	* @see _.once
	**/
	once(): _Chain<T>;

	/**
	 * Wrapped type `Function`.
	 * @see _.once
	 **/
	restArgs(startIndex? : number): _Chain<T>;

	/**
	* Wrapped type `number`.
	* @see _.after
	**/
	after(func: Function): _Chain<T>;

	/**
	* Wrapped type `number`.
	* @see _.before
	**/
	before(fn: Function): _Chain<T>;

	/**
	* Wrapped type `Function`.
	* @see _.wrap
	**/
	wrap(wrapper: Function): () => _Chain<T>;

	/**
	* Wrapped type `Function`.
	* @see _.negate
	**/
	negate(): _Chain<T>;

	/**
	* Wrapped type `Function[]`.
	* @see _.compose
	**/
	compose(...functions: Function[]): _Chain<T>;

	/********* *
	 * Objects *
	********** */

	/**
	* Wrapped type `object`.
	* @see _.keys
	**/
	keys(): _Chain<string>;

	/**
	* Wrapped type `object`.
	* @see _.allKeys
	**/
	allKeys(): _Chain<string>;

	/**
	* Wrapped type `object`.
	* @see _.values
	**/
	values(): _Chain<T>;

	/**
	* Wrapped type `object`.
	* @see _.pairs
	**/
	pairs(): _Chain<T>;

	/**
	* Wrapped type `object`.
	* @see _.invert
	**/
	invert(): _Chain<T>;

	/**
	* Wrapped type `object`.
	* @see _.functions
	**/
	functions(): _Chain<T>;

	/**
	* @see _.functions
	**/
	methods(): _Chain<T>;

	/**
	* Wrapped type `object`.
	* @see _.extend
	**/
	extend(...sources: any[]): _Chain<T>;

	/**
	* Wrapped type `object`.
	* @see _.extend
	**/
	findKey(predicate: _.ObjectIterator<any, boolean>, context? : any): _Chain<T>

	/**
	* Wrapped type `object`.
	* @see _.pick
	**/
	pick(...keys: any[]): _Chain<T>;
	pick(keys: any[]): _Chain<T>;
	pick(fn: (value: any, key: any, object: any) => any): _Chain<T>;

	/**
	* Wrapped type `object`.
	* @see _.omit
	**/
	omit(...keys: string[]): _Chain<T>;
	omit(keys: string[]): _Chain<T>;
	omit(iteratee: Function): _Chain<T>;

	/**
	* Wrapped type `object`.
	* @see _.defaults
	**/
	defaults(...defaults: any[]): _Chain<T>;

	/**
	 * Wrapped type `any`.
	 * @see _.create
	 **/
	create(props?: Object): _Chain<T>;

	/**
	* Wrapped type `any[]`.
	* @see _.clone
	**/
	clone(): _Chain<T>;

	/**
	* Wrapped type `object`.
	* @see _.tap
	**/
	tap(interceptor: (...as: any[]) => any): _Chain<T>;

	/**
	* Wrapped type `object`.
	* @see _.has
	**/
	has(key: string): _Chain<T>;

	/**
	* Wrapped type `any[]`.
	* @see _.matches
	**/
	matches<TResult>(): _Chain<T>;

	/**
	 * Wrapped type `any[]`.
	 * @see _.matcher
	 **/
	matcher<TResult>(): _Chain<T>;

	/**
	* Wrapped type `string`.
	* @see _.property
	**/
	property(): _Chain<T>;

	/**
	* Wrapped type `object`.
	* @see _.propertyOf
	**/
	propertyOf(): _Chain<T>;

	/**
	* Wrapped type `object`.
	* @see _.isEqual
	**/
	isEqual(other: any): _Chain<T>;

	/**
	* Wrapped type `object`.
	* @see _.isEmpty
	**/
	isEmpty(): _Chain<T>;

	/**
	* Wrapped type `object`.
	* @see _.isMatch
	**/
	isMatch(): _Chain<T>;

	/**
	* Wrapped type `object`.
	* @see _.isElement
	**/
	isElement(): _Chain<T>;

	/**
	* Wrapped type `object`.
	* @see _.isArray
	**/
	isArray(): _Chain<T>;

	/**
	* Wrapped type `object`.
	* @see _.isSymbol
	**/
	isSymbol(): _Chain<T>;

	/**
	* Wrapped type `object`.
	* @see _.isObject
	**/
	isObject(): _Chain<T>;

	/**
	* Wrapped type `object`.
	* @see _.isArguments
	**/
	isArguments(): _Chain<T>;

	/**
	* Wrapped type `object`.
	* @see _.isFunction
	**/
	isFunction(): _Chain<T>;

	/**
	* Wrapped type `object`.
	* @see _.isError
	**/
	isError(): _Chain<T>;

	/**
	* Wrapped type `object`.
	* @see _.isString
	**/
	isString(): _Chain<T>;

	/**
	* Wrapped type `object`.
	* @see _.isNumber
	**/
	isNumber(): _Chain<T>;

	/**
	* Wrapped type `object`.
	* @see _.isFinite
	**/
	isFinite(): _Chain<T>;

	/**
	* Wrapped type `object`.
	* @see _.isBoolean
	**/
	isBoolean(): _Chain<T>;

	/**
	* Wrapped type `object`.
	* @see _.isDate
	**/
	isDate(): _Chain<T>;

	/**
	* Wrapped type `object`.
	* @see _.isRegExp
	**/
	isRegExp(): _Chain<T>;

	/**
	* Wrapped type `object`.
	* @see _.isNaN
	**/
	isNaN(): _Chain<T>;

	/**
	* Wrapped type `object`.
	* @see _.isNull
	**/
	isNull(): _Chain<T>;

	/**
	* Wrapped type `object`.
	* @see _.isUndefined
	**/
	isUndefined(): _Chain<T>;

	/********* *
	 * Utility *
	********** */

	/**
	* Wrapped type `any`.
	* @see _.identity
	**/
	identity(): _Chain<T>;

	/**
	* Wrapped type `any`.
	* @see _.constant
	**/
	constant(): _Chain<T>;

	/**
	* Wrapped type `any`.
	* @see _.noop
	**/
	noop(): _Chain<T>;

	/**
	* Wrapped type `number`.
	* @see _.times
	**/
	times<TResult>(iterator: (n: number) => TResult, context?: any): _Chain<T>;

	/**
	* Wrapped type `number`.
	* @see _.random
	**/
	random(): _Chain<T>;
	/**
	* Wrapped type `number`.
	* @see _.random
	**/
	random(max: number): _Chain<T>;

	/**
	* Wrapped type `object`.
	* @see _.mixin
	**/
	mixin(): _Chain<T>;

	/**
	* Wrapped type `string|Function|Object`.
	* @see _.iteratee
	**/
	iteratee(context?: any): _Chain<T>;

	/**
	* Wrapped type `string`.
	* @see _.uniqueId
	**/
	uniqueId(): _Chain<T>;

	/**
	* Wrapped type `string`.
	* @see _.escape
	**/
	escape(): _Chain<T>;

	/**
	* Wrapped type `string`.
	* @see _.unescape
	**/
	unescape(): _Chain<T>;

	/**
	* Wrapped type `object`.
	* @see _.result
	**/
	result(property: string, defaultValue?:any): _Chain<T>;

	/**
	* Wrapped type `string`.
	* @see _.template
	**/
	template(settings?: _.TemplateSettings): (...data: any[]) => _Chain<T>;

	/************* *
	* Array proxy *
	************** */

	/**
	* Returns a new array comprised of the array on which it is called
	* joined with the array(s) and/or value(s) provided as arguments.
	* @param arr Arrays and/or values to concatenate into a new array. See the discussion below for details.
	* @return A new array comprised of the array on which it is called
	**/
	concat(...arr: Array<T[]>): _Chain<T>;

	/**
	* Join all elements of an array into a string.
	* @param separator Optional. Specifies a string to separate each element of the array. The separator is converted to a string if necessary. If omitted, the array elements are separated with a comma.
	* @return The string conversions of all array elements joined into one string.
	**/
	join(separator?: any): _ChainSingle<T>;

	/**
	* Removes the last element from an array and returns that element.
	* @return Returns the popped element.
	**/
	pop(): _ChainSingle<T>;

	/**
	* Adds one or more elements to the end of an array and returns the new length of the array.
	* @param item The elements to add to the end of the array.
	* @return The array with the element added to the end.
	**/
	push(...item: Array<T>): _Chain<T>;

	/**
	* Reverses an array in place. The first array element becomes the last and the last becomes the first.
	* @return The reversed array.
	**/
	reverse(): _Chain<T>;

	/**
	* Removes the first element from an array and returns that element. This method changes the length of the array.
	* @return The shifted element.
	**/
	shift(): _ChainSingle<T>;

	/**
	* Returns a shallow copy of a portion of an array into a new array object.
	* @param start Zero-based index at which to begin extraction.
	* @param end Optional. Zero-based index at which to end extraction. slice extracts up to but not including end.
	* @return A shallow copy of a portion of an array into a new array object.
	**/
	slice(start: number, end?: number): _Chain<T>;

	/**
	* Sorts the elements of an array in place and returns the array. The sort is not necessarily stable. The default sort order is according to string Unicode code points.
	* @param compareFn Optional. Specifies a function that defines the sort order. If omitted, the array is sorted according to each character's Unicode code point value, according to the string conversion of each element.
	* @return The sorted array.
	**/
	sort(compareFn: (a: T, b: T) => boolean): _Chain<T>;

	/**
	* Changes the content of an array by removing existing elements and/or adding new elements.
	* @param index Index at which to start changing the array. If greater than the length of the array, actual starting index will be set to the length of the array. If negative, will begin that many elements from the end.
	* @param quantity An integer indicating the number of old array elements to remove. If deleteCount is 0, no elements are removed. In this case, you should specify at least one new element. If deleteCount is greater than the number of elements left in the array starting at index, then all of the elements through the end of the array will be deleted.
	* @param items The element to add to the array. If you don't specify any elements, splice will only remove elements from the array.
	* @return An array containing the deleted elements. If only one element is removed, an array of one element is returned. If no elements are removed, an empty array is returned.
	**/
	splice(index: number, quantity: number, ...items: Array<T>): _Chain<T>;

	/**
	* A string representing the specified array and its elements.
	* @return A string representing the specified array and its elements.
	**/
	toString(): _ChainSingle<T>;

	/**
	* Adds one or more elements to the beginning of an array and returns the new length of the array.
	* @param items The elements to add to the front of the array.
	* @return The array with the element added to the beginning.
	**/
	unshift(...items: Array<T>): _Chain<T>;

	/********** *
	 * Chaining *
	*********** */

	/**
	* Wrapped type `any`.
	* @see _.chain
	**/
	chain(): _Chain<T>;

	/**
	* Wrapped type `any`.
	* @see _.value
	**/
	value<TResult>(): T[];
}
interface _ChainSingle<T> {
	value(): T;
}
interface _ChainOfArrays<T> extends _Chain<T[]> {
	flatten(shallow?: boolean): _Chain<T>;
	mapObject(fn: _.ListIterator<T, any>): _ChainOfArrays<T>;
}

declare var _: UnderscoreStatic;

declare module "underscore" {
	export = _;
}