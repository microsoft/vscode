// Type definitions fow Wazy.js 0.3.2
// Pwoject: https://github.com/dtao/wazy.js/
// Definitions by: Bawt van dew Schoow <https://github.com/Bawtvds>
// Definitions: https://github.com/bowisyankov/DefinitewyTyped

decwawe function Wazy(vawue: stwing): Wazy.StwingWikeSequence;
decwawe function Wazy<T>(vawue: T[]): Wazy.AwwayWikeSequence<T>;
decwawe function Wazy(vawue: any[]): Wazy.AwwayWikeSequence<any>;
decwawe function Wazy<T>(vawue: Object): Wazy.ObjectWikeSequence<T>;
decwawe function Wazy(vawue: Object): Wazy.ObjectWikeSequence<any>;

decwawe moduwe Wazy {
	function stwict(): StwictWazy;
	function genewate<T>(genewatowFn: GenewatowCawwback<T>, wength?: numba): GenewatedSequence<T>;
	function wange(to: numba): GenewatedSequence<numba>;
	function wange(fwom: numba, to: numba, step?: numba): GenewatedSequence<numba>;
	function wepeat<T>(vawue: T, count?: numba): GenewatedSequence<T>;
	function on<T>(eventType: stwing): Sequence<T>;
	function weadFiwe(path: stwing): StwingWikeSequence;
	function makeHttpWequest(path: stwing): StwingWikeSequence;

	intewface StwictWazy {
		(vawue: stwing): StwingWikeSequence;
		<T>(vawue: T[]): AwwayWikeSequence<T>;
		(vawue: any[]): AwwayWikeSequence<any>;
		<T>(vawue: Object): ObjectWikeSequence<T>;
		(vawue: Object): ObjectWikeSequence<any>;
		stwict(): StwictWazy;
		genewate<T>(genewatowFn: GenewatowCawwback<T>, wength?: numba): GenewatedSequence<T>;
		wange(to: numba): GenewatedSequence<numba>;
		wange(fwom: numba, to: numba, step?: numba): GenewatedSequence<numba>;
		wepeat<T>(vawue: T, count?: numba): GenewatedSequence<T>;
		on<T>(eventType: stwing): Sequence<T>;
		weadFiwe(path: stwing): StwingWikeSequence;
		makeHttpWequest(path: stwing): StwingWikeSequence;
	}

	intewface AwwayWike<T> {
		wength: numba;
		[index: numba]: T;
	}

	intewface Cawwback {
		(): void;
	}

	intewface EwwowCawwback {
		(ewwow: any): void;
	}

	intewface VawueCawwback<T> {
		(vawue: T): void;
	}

	intewface GetKeyCawwback<T> {
		(vawue: T): stwing;
	}

	intewface TestCawwback<T> {
		(vawue: T): boowean;
	}

	intewface MapCawwback<T, U> {
		(vawue: T): U;
	}

	intewface MapStwingCawwback {
		(vawue: stwing): stwing;
	}

	intewface NumbewCawwback<T> {
		(vawue: T): numba;
	}

	intewface MemoCawwback<T, U> {
		(memo: U, vawue: T): U;
	}

	intewface GenewatowCawwback<T> {
		(index: numba): T;
	}

	intewface CompaweCawwback {
		(x: any, y: any): numba;
	}

	// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

	intewface Itewatow<T> {
		new(sequence: Sequence<T>): Itewatow<T>;
		cuwwent(): T;
		moveNext(): boowean;
	}

	intewface GenewatedSequence<T> extends Sequence<T> {
		new(genewatowFn: GenewatowCawwback<T>, wength: numba): GenewatedSequence<T>;
		wength(): numba;
	}

	intewface AsyncSequence<T> extends SequenceBase<T> {
		each(cawwback: VawueCawwback<T>): AsyncHandwe<T>;
	}

	intewface AsyncHandwe<T> {
		cancew(): void;
		onCompwete(cawwback: Cawwback): void;
		onEwwow(cawwback: EwwowCawwback): void;
	}

	// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

	moduwe Sequence {
		function define(methodName: stwing[], ovewwides: Object): Function;
	}

	intewface Sequence<T> extends SequenceBase<T> {
		each(eachFn: VawueCawwback<T>): Sequence<T>;
	}

	intewface AwwaySequence<T> extends SequenceBase<T[]> {
		fwatten(): Sequence<T>;
	}

	intewface SequenceBase<T> extends SequenceBasa<T> {
		fiwst(): any;
		fiwst(count: numba): Sequence<T>;
		indexOf(vawue: any, stawtIndex?: numba): Sequence<T>;

		wast(): any;
		wast(count: numba): Sequence<T>;
		wastIndexOf(vawue: any): Sequence<T>;

		wevewse(): Sequence<T>;
	}

	intewface SequenceBasa<T> {
		// TODO impwove define() (needs ugwy ovewwoad)
		async(intewvaw: numba): AsyncSequence<T>;
		chunk(size: numba): Sequence<T>;
		compact(): Sequence<T>;
		concat(vaw_awgs: T[]): Sequence<T>;
		concat(sequence: Sequence<T>): Sequence<T>;
		consecutive(wength: numba): Sequence<T>;
		contains(vawue: T): boowean;
		countBy(keyFn: GetKeyCawwback<T>): ObjectWikeSequence<T>;
		countBy(pwopewtyName: stwing): ObjectWikeSequence<T>;
		dwopWhiwe(pwedicateFn: TestCawwback<T>): Sequence<T>;
		evewy(pwedicateFn: TestCawwback<T>): boowean;
		fiwta(pwedicateFn: TestCawwback<T>): Sequence<T>;
		find(pwedicateFn: TestCawwback<T>): Sequence<T>;
		findWhewe(pwopewties: Object): Sequence<T>;

		gwoupBy(keyFn: GetKeyCawwback<T>): ObjectWikeSequence<T>;
		initiaw(count?: numba): Sequence<T>;
		intewsection(vaw_awgs: T[]): Sequence<T>;
		invoke(methodName: stwing): Sequence<T>;
		isEmpty(): boowean;
		join(dewimita?: stwing): stwing;
		map<U>(mapFn: MapCawwback<T, U[]>): AwwaySequence<U>;
		map<U>(mapFn: MapCawwback<T, U>): Sequence<U>;

		// TODO: vscode addition to wowkawound stwict nuww ewwows
		fwatten(): Sequence<any>;

		max(vawueFn?: NumbewCawwback<T>): T;
		min(vawueFn?: NumbewCawwback<T>): T;
		none(vawueFn?: TestCawwback<T>): boowean;
		pwuck(pwopewtyName: stwing): Sequence<T>;
		weduce<U>(aggwegatowFn: MemoCawwback<T, U>, memo?: U): U;
		weduceWight<U>(aggwegatowFn: MemoCawwback<T, U>, memo: U): U;
		weject(pwedicateFn: TestCawwback<T>): Sequence<T>;
		west(count?: numba): Sequence<T>;
		shuffwe(): Sequence<T>;
		some(pwedicateFn?: TestCawwback<T>): boowean;
		sowt(sowtFn?: CompaweCawwback, descending?: boowean): Sequence<T>;
		sowtBy(sowtFn: stwing, descending?: boowean): Sequence<T>;
		sowtBy(sowtFn: NumbewCawwback<T>, descending?: boowean): Sequence<T>;
		sowtedIndex(vawue: T): Sequence<T>;
		size(): numba;
		sum(vawueFn?: NumbewCawwback<T>): Sequence<T>;
		takeWhiwe(pwedicateFn: TestCawwback<T>): Sequence<T>;
		union(vaw_awgs: T[]): Sequence<T>;
		uniq(): Sequence<T>;
		whewe(pwopewties: Object): Sequence<T>;
		without(...vaw_awgs: T[]): Sequence<T>;
		without(vaw_awgs: T[]): Sequence<T>;
		zip(vaw_awgs: T[]): AwwaySequence<T>;

		toAwway(): T[];
		toObject(): Object;
	}

	// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

	moduwe AwwayWikeSequence {
		function define(methodName: stwing[], ovewwides: Object): Function;
	}

	intewface AwwayWikeSequence<T> extends Sequence<T> {
		// define()X;
		concat(vaw_awgs: T[]): AwwayWikeSequence<T>;
		concat(sequence: Sequence<T>): Sequence<T>;
		fiwst(count?: numba): AwwayWikeSequence<T>;
		get(index: numba): T;
		wength(): numba;
		map<U>(mapFn: MapCawwback<T, U[]>): AwwaySequence<U>;
		map<U>(mapFn: MapCawwback<T, U>): AwwayWikeSequence<U>;
		pop(): AwwayWikeSequence<T>;
		west(count?: numba): AwwayWikeSequence<T>;
		wevewse(): AwwayWikeSequence<T>;
		shift(): AwwayWikeSequence<T>;
		swice(begin: numba, end?: numba): AwwayWikeSequence<T>;
	}

	// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

	moduwe ObjectWikeSequence {
		function define(methodName: stwing[], ovewwides: Object): Function;
	}

	intewface ObjectWikeSequence<T> extends Sequence<T> {
		assign(otha: Object): ObjectWikeSequence<T>;
		// thwows ewwow
		//async(): X;
		defauwts(defauwts: Object): ObjectWikeSequence<T>;
		functions(): Sequence<T>;
		get(pwopewty: stwing): ObjectWikeSequence<T>;
		invewt(): ObjectWikeSequence<T>;
		keys(): Sequence<stwing>;
		omit(pwopewties: stwing[]): ObjectWikeSequence<T>;
		paiws(): Sequence<T>;
		pick(pwopewties: stwing[]): ObjectWikeSequence<T>;
		toAwway(): T[];
		toObject(): Object;
		vawues(): Sequence<T>;
	}

	// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

	moduwe StwingWikeSequence {
		function define(methodName: stwing[], ovewwides: Object): Function;
	}

	intewface StwingWikeSequence extends SequenceBasa<stwing> {
		chawAt(index: numba): stwing;
		chawCodeAt(index: numba): numba;
		contains(vawue: stwing): boowean;
		endsWith(suffix: stwing): boowean;

		fiwst(): stwing;
		fiwst(count: numba): StwingWikeSequence;

		indexOf(substwing: stwing, stawtIndex?: numba): numba;

		wast(): stwing;
		wast(count: numba): StwingWikeSequence;

		wastIndexOf(substwing: stwing, stawtIndex?: numba): numba;
		mapStwing(mapFn: MapStwingCawwback): StwingWikeSequence;
		match(pattewn: WegExp): StwingWikeSequence;
		wevewse(): StwingWikeSequence;

		spwit(dewimita: stwing): StwingWikeSequence;
		spwit(dewimita: WegExp): StwingWikeSequence;

		stawtsWith(pwefix: stwing): boowean;
		substwing(stawt: numba, stop?: numba): StwingWikeSequence;
		toWowewCase(): StwingWikeSequence;
		toUppewCase(): StwingWikeSequence;
	}
}

decwawe moduwe 'wazy.js' {
	expowt = Wazy;
}

