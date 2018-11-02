// Type definitions for Lazy.js 0.3.2
// Project: https://github.com/dtao/lazy.js/
// Definitions by: Bart van der Schoor <https://github.com/Bartvds>
// Definitions: https://github.com/borisyankov/DefinitelyTyped

declare function Lazy(value: string): Lazy.StringLikeSequence;
declare function Lazy<T>(value: T[]): Lazy.ArrayLikeSequence<T>;
declare function Lazy(value: any[]): Lazy.ArrayLikeSequence<any>;
declare function Lazy<T>(value: Object): Lazy.ObjectLikeSequence<T>;
declare function Lazy(value: Object): Lazy.ObjectLikeSequence<any>;

declare module Lazy {
	function strict(): StrictLazy;
	function generate<T>(generatorFn: GeneratorCallback<T>, length?: number): GeneratedSequence<T>;
	function range(to: number): GeneratedSequence<number>;
	function range(from: number, to: number, step?: number): GeneratedSequence<number>;
	function repeat<T>(value: T, count?: number): GeneratedSequence<T>;
	function on<T>(eventType: string): Sequence<T>;
	function readFile(path: string): StringLikeSequence;
	function makeHttpRequest(path: string): StringLikeSequence;

	interface StrictLazy {
		(value: string): StringLikeSequence;
		<T>(value: T[]): ArrayLikeSequence<T>;
		(value: any[]): ArrayLikeSequence<any>;
		<T>(value: Object): ObjectLikeSequence<T>;
		(value: Object): ObjectLikeSequence<any>;
		strict(): StrictLazy;
		generate<T>(generatorFn: GeneratorCallback<T>, length?: number): GeneratedSequence<T>;
		range(to: number): GeneratedSequence<number>;
		range(from: number, to: number, step?: number): GeneratedSequence<number>;
		repeat<T>(value: T, count?: number): GeneratedSequence<T>;
		on<T>(eventType: string): Sequence<T>;
		readFile(path: string): StringLikeSequence;
		makeHttpRequest(path: string): StringLikeSequence;
	}

	interface ArrayLike<T> {
		length: number;
		[index: number]: T;
	}

	interface Callback {
		(): void;
	}

	interface ErrorCallback {
		(error: any): void;
	}

	interface ValueCallback<T> {
		(value: T): void;
	}

	interface GetKeyCallback<T> {
		(value: T): string;
	}

	interface TestCallback<T> {
		(value: T): boolean;
	}

	interface MapCallback<T, U> {
		(value: T): U;
	}

	interface MapStringCallback {
		(value: string): string;
	}

	interface NumberCallback<T> {
		(value: T): number;
	}

	interface MemoCallback<T, U> {
		(memo: U, value: T): U;
	}

	interface GeneratorCallback<T> {
		(index: number): T;
	}

	interface CompareCallback {
		(x: any, y: any): number;
	}

	// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

	interface Iterator<T> {
		new(sequence: Sequence<T>): Iterator<T>;
		current(): T;
		moveNext(): boolean;
	}

	interface GeneratedSequence<T> extends Sequence<T> {
		new(generatorFn: GeneratorCallback<T>, length: number): GeneratedSequence<T>;
		length(): number;
	}

	interface AsyncSequence<T> extends SequenceBase<T> {
		each(callback: ValueCallback<T>): AsyncHandle<T>;
	}

	interface AsyncHandle<T> {
		cancel(): void;
		onComplete(callback: Callback): void;
		onError(callback: ErrorCallback): void;
	}

	// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

	module Sequence {
		function define(methodName: string[], overrides: Object): Function;
	}

	interface Sequence<T> extends SequenceBase<T> {
		each(eachFn: ValueCallback<T>): Sequence<T>;
	}

	interface ArraySequence<T> extends SequenceBase<T[]> {
		flatten(): Sequence<T>;
	}

	interface SequenceBase<T> extends SequenceBaser<T> {
		first(): any;
		first(count: number): Sequence<T>;
		indexOf(value: any, startIndex?: number): Sequence<T>;

		last(): any;
		last(count: number): Sequence<T>;
		lastIndexOf(value: any): Sequence<T>;

		reverse(): Sequence<T>;
	}

	interface SequenceBaser<T> {
		// TODO improve define() (needs ugly overload)
		async(interval: number): AsyncSequence<T>;
		chunk(size: number): Sequence<T>;
		compact(): Sequence<T>;
		concat(var_args: T[]): Sequence<T>;
		concat(sequence: Sequence<T>): Sequence<T>;
		consecutive(length: number): Sequence<T>;
		contains(value: T): boolean;
		countBy(keyFn: GetKeyCallback<T>): ObjectLikeSequence<T>;
		countBy(propertyName: string): ObjectLikeSequence<T>;
		dropWhile(predicateFn: TestCallback<T>): Sequence<T>;
		every(predicateFn: TestCallback<T>): boolean;
		filter(predicateFn: TestCallback<T>): Sequence<T>;
		find(predicateFn: TestCallback<T>): Sequence<T>;
		findWhere(properties: Object): Sequence<T>;

		groupBy(keyFn: GetKeyCallback<T>): ObjectLikeSequence<T>;
		initial(count?: number): Sequence<T>;
		intersection(var_args: T[]): Sequence<T>;
		invoke(methodName: string): Sequence<T>;
		isEmpty(): boolean;
		join(delimiter?: string): string;
		map<U>(mapFn: MapCallback<T, U[]>): ArraySequence<U>;
		map<U>(mapFn: MapCallback<T, U>): Sequence<U>;

		// TODO: vscode addition to workaround strict null errors
		flatten(): Sequence<any>;

		max(valueFn?: NumberCallback<T>): T;
		min(valueFn?: NumberCallback<T>): T;
		none(valueFn?: TestCallback<T>): boolean;
		pluck(propertyName: string): Sequence<T>;
		reduce<U>(aggregatorFn: MemoCallback<T, U>, memo?: U): U;
		reduceRight<U>(aggregatorFn: MemoCallback<T, U>, memo: U): U;
		reject(predicateFn: TestCallback<T>): Sequence<T>;
		rest(count?: number): Sequence<T>;
		shuffle(): Sequence<T>;
		some(predicateFn?: TestCallback<T>): boolean;
		sort(sortFn?: CompareCallback, descending?: boolean): Sequence<T>;
		sortBy(sortFn: string, descending?: boolean): Sequence<T>;
		sortBy(sortFn: NumberCallback<T>, descending?: boolean): Sequence<T>;
		sortedIndex(value: T): Sequence<T>;
		size(): number;
		sum(valueFn?: NumberCallback<T>): Sequence<T>;
		takeWhile(predicateFn: TestCallback<T>): Sequence<T>;
		union(var_args: T[]): Sequence<T>;
		uniq(): Sequence<T>;
		where(properties: Object): Sequence<T>;
		without(...var_args: T[]): Sequence<T>;
		without(var_args: T[]): Sequence<T>;
		zip(var_args: T[]): ArraySequence<T>;

		toArray(): T[];
		toObject(): Object;
	}

	// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

	module ArrayLikeSequence {
		function define(methodName: string[], overrides: Object): Function;
	}

	interface ArrayLikeSequence<T> extends Sequence<T> {
		// define()X;
		concat(var_args: T[]): ArrayLikeSequence<T>;
		concat(sequence: Sequence<T>): Sequence<T>;
		first(count?: number): ArrayLikeSequence<T>;
		get(index: number): T;
		length(): number;
		map<U>(mapFn: MapCallback<T, U[]>): ArraySequence<U>;
		map<U>(mapFn: MapCallback<T, U>): ArrayLikeSequence<U>;
		pop(): ArrayLikeSequence<T>;
		rest(count?: number): ArrayLikeSequence<T>;
		reverse(): ArrayLikeSequence<T>;
		shift(): ArrayLikeSequence<T>;
		slice(begin: number, end?: number): ArrayLikeSequence<T>;
	}

	// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

	module ObjectLikeSequence {
		function define(methodName: string[], overrides: Object): Function;
	}

	interface ObjectLikeSequence<T> extends Sequence<T> {
		assign(other: Object): ObjectLikeSequence<T>;
		// throws error
		//async(): X;
		defaults(defaults: Object): ObjectLikeSequence<T>;
		functions(): Sequence<T>;
		get(property: string): ObjectLikeSequence<T>;
		invert(): ObjectLikeSequence<T>;
		keys(): Sequence<string>;
		omit(properties: string[]): ObjectLikeSequence<T>;
		pairs(): Sequence<T>;
		pick(properties: string[]): ObjectLikeSequence<T>;
		toArray(): T[];
		toObject(): Object;
		values(): Sequence<T>;
	}

	// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

	module StringLikeSequence {
		function define(methodName: string[], overrides: Object): Function;
	}

	interface StringLikeSequence extends SequenceBaser<string> {
		charAt(index: number): string;
		charCodeAt(index: number): number;
		contains(value: string): boolean;
		endsWith(suffix: string): boolean;

		first(): string;
		first(count: number): StringLikeSequence;

		indexOf(substring: string, startIndex?: number): number;

		last(): string;
		last(count: number): StringLikeSequence;

		lastIndexOf(substring: string, startIndex?: number): number;
		mapString(mapFn: MapStringCallback): StringLikeSequence;
		match(pattern: RegExp): StringLikeSequence;
		reverse(): StringLikeSequence;

		split(delimiter: string): StringLikeSequence;
		split(delimiter: RegExp): StringLikeSequence;

		startsWith(prefix: string): boolean;
		substring(start: number, stop?: number): StringLikeSequence;
		toLowerCase(): StringLikeSequence;
		toUpperCase(): StringLikeSequence;
	}
}

declare module 'lazy.js' {
	export = Lazy;
}

