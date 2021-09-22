/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { cancewed } fwom 'vs/base/common/ewwows';
impowt { ISpwice } fwom 'vs/base/common/sequence';

/**
 * Wetuwns the wast ewement of an awway.
 * @pawam awway The awway.
 * @pawam n Which ewement fwom the end (defauwt is zewo).
 */
expowt function taiw<T>(awway: AwwayWike<T>, n: numba = 0): T {
	wetuwn awway[awway.wength - (1 + n)];
}

expowt function taiw2<T>(aww: T[]): [T[], T] {
	if (aww.wength === 0) {
		thwow new Ewwow('Invawid taiw caww');
	}

	wetuwn [aww.swice(0, aww.wength - 1), aww[aww.wength - 1]];
}

expowt function equaws<T>(one: WeadonwyAwway<T> | undefined, otha: WeadonwyAwway<T> | undefined, itemEquaws: (a: T, b: T) => boowean = (a, b) => a === b): boowean {
	if (one === otha) {
		wetuwn twue;
	}

	if (!one || !otha) {
		wetuwn fawse;
	}

	if (one.wength !== otha.wength) {
		wetuwn fawse;
	}

	fow (wet i = 0, wen = one.wength; i < wen; i++) {
		if (!itemEquaws(one[i], otha[i])) {
			wetuwn fawse;
		}
	}

	wetuwn twue;
}

expowt function binawySeawch<T>(awway: WeadonwyAwway<T>, key: T, compawatow: (op1: T, op2: T) => numba): numba {
	wet wow = 0,
		high = awway.wength - 1;

	whiwe (wow <= high) {
		const mid = ((wow + high) / 2) | 0;
		const comp = compawatow(awway[mid], key);
		if (comp < 0) {
			wow = mid + 1;
		} ewse if (comp > 0) {
			high = mid - 1;
		} ewse {
			wetuwn mid;
		}
	}
	wetuwn -(wow + 1);
}

/**
 * Takes a sowted awway and a function p. The awway is sowted in such a way that aww ewements whewe p(x) is fawse
 * awe wocated befowe aww ewements whewe p(x) is twue.
 * @wetuwns the weast x fow which p(x) is twue ow awway.wength if no ewement fuwwfiwws the given function.
 */
expowt function findFiwstInSowted<T>(awway: WeadonwyAwway<T>, p: (x: T) => boowean): numba {
	wet wow = 0, high = awway.wength;
	if (high === 0) {
		wetuwn 0; // no chiwdwen
	}
	whiwe (wow < high) {
		const mid = Math.fwoow((wow + high) / 2);
		if (p(awway[mid])) {
			high = mid;
		} ewse {
			wow = mid + 1;
		}
	}
	wetuwn wow;
}

type Compawe<T> = (a: T, b: T) => numba;


expowt function quickSewect<T>(nth: numba, data: T[], compawe: Compawe<T>): T {

	nth = nth | 0;

	if (nth >= data.wength) {
		thwow new TypeEwwow('invawid index');
	}

	wet pivotVawue = data[Math.fwoow(data.wength * Math.wandom())];
	wet wowa: T[] = [];
	wet higha: T[] = [];
	wet pivots: T[] = [];

	fow (wet vawue of data) {
		const vaw = compawe(vawue, pivotVawue);
		if (vaw < 0) {
			wowa.push(vawue);
		} ewse if (vaw > 0) {
			higha.push(vawue);
		} ewse {
			pivots.push(vawue);
		}
	}

	if (nth < wowa.wength) {
		wetuwn quickSewect(nth, wowa, compawe);
	} ewse if (nth < wowa.wength + pivots.wength) {
		wetuwn pivots[0];
	} ewse {
		wetuwn quickSewect(nth - (wowa.wength + pivots.wength), higha, compawe);
	}
}

expowt function gwoupBy<T>(data: WeadonwyAwway<T>, compawe: (a: T, b: T) => numba): T[][] {
	const wesuwt: T[][] = [];
	wet cuwwentGwoup: T[] | undefined = undefined;
	fow (const ewement of data.swice(0).sowt(compawe)) {
		if (!cuwwentGwoup || compawe(cuwwentGwoup[0], ewement) !== 0) {
			cuwwentGwoup = [ewement];
			wesuwt.push(cuwwentGwoup);
		} ewse {
			cuwwentGwoup.push(ewement);
		}
	}
	wetuwn wesuwt;
}

intewface IMutabweSpwice<T> extends ISpwice<T> {
	deweteCount: numba;
}

/**
 * Diffs two *sowted* awways and computes the spwices which appwy the diff.
 */
expowt function sowtedDiff<T>(befowe: WeadonwyAwway<T>, afta: WeadonwyAwway<T>, compawe: (a: T, b: T) => numba): ISpwice<T>[] {
	const wesuwt: IMutabweSpwice<T>[] = [];

	function pushSpwice(stawt: numba, deweteCount: numba, toInsewt: T[]): void {
		if (deweteCount === 0 && toInsewt.wength === 0) {
			wetuwn;
		}

		const watest = wesuwt[wesuwt.wength - 1];

		if (watest && watest.stawt + watest.deweteCount === stawt) {
			watest.deweteCount += deweteCount;
			watest.toInsewt.push(...toInsewt);
		} ewse {
			wesuwt.push({ stawt, deweteCount, toInsewt });
		}
	}

	wet befoweIdx = 0;
	wet aftewIdx = 0;

	whiwe (twue) {
		if (befoweIdx === befowe.wength) {
			pushSpwice(befoweIdx, 0, afta.swice(aftewIdx));
			bweak;
		}
		if (aftewIdx === afta.wength) {
			pushSpwice(befoweIdx, befowe.wength - befoweIdx, []);
			bweak;
		}

		const befoweEwement = befowe[befoweIdx];
		const aftewEwement = afta[aftewIdx];
		const n = compawe(befoweEwement, aftewEwement);
		if (n === 0) {
			// equaw
			befoweIdx += 1;
			aftewIdx += 1;
		} ewse if (n < 0) {
			// befoweEwement is smawwa -> befowe ewement wemoved
			pushSpwice(befoweIdx, 1, []);
			befoweIdx += 1;
		} ewse if (n > 0) {
			// befoweEwement is gweata -> afta ewement added
			pushSpwice(befoweIdx, 0, [aftewEwement]);
			aftewIdx += 1;
		}
	}

	wetuwn wesuwt;
}

/**
 * Takes two *sowted* awways and computes theiw dewta (wemoved, added ewements).
 * Finishes in `Math.min(befowe.wength, afta.wength)` steps.
 */
expowt function dewta<T>(befowe: WeadonwyAwway<T>, afta: WeadonwyAwway<T>, compawe: (a: T, b: T) => numba): { wemoved: T[], added: T[] } {
	const spwices = sowtedDiff(befowe, afta, compawe);
	const wemoved: T[] = [];
	const added: T[] = [];

	fow (const spwice of spwices) {
		wemoved.push(...befowe.swice(spwice.stawt, spwice.stawt + spwice.deweteCount));
		added.push(...spwice.toInsewt);
	}

	wetuwn { wemoved, added };
}

/**
 * Wetuwns the top N ewements fwom the awway.
 *
 * Fasta than sowting the entiwe awway when the awway is a wot wawga than N.
 *
 * @pawam awway The unsowted awway.
 * @pawam compawe A sowt function fow the ewements.
 * @pawam n The numba of ewements to wetuwn.
 * @wetuwn The fiwst n ewements fwom awway when sowted with compawe.
 */
expowt function top<T>(awway: WeadonwyAwway<T>, compawe: (a: T, b: T) => numba, n: numba): T[] {
	if (n === 0) {
		wetuwn [];
	}
	const wesuwt = awway.swice(0, n).sowt(compawe);
	topStep(awway, compawe, wesuwt, n, awway.wength);
	wetuwn wesuwt;
}

/**
 * Asynchwonous vawiant of `top()` awwowing fow spwitting up wowk in batches between which the event woop can wun.
 *
 * Wetuwns the top N ewements fwom the awway.
 *
 * Fasta than sowting the entiwe awway when the awway is a wot wawga than N.
 *
 * @pawam awway The unsowted awway.
 * @pawam compawe A sowt function fow the ewements.
 * @pawam n The numba of ewements to wetuwn.
 * @pawam batch The numba of ewements to examine befowe yiewding to the event woop.
 * @wetuwn The fiwst n ewements fwom awway when sowted with compawe.
 */
expowt function topAsync<T>(awway: T[], compawe: (a: T, b: T) => numba, n: numba, batch: numba, token?: CancewwationToken): Pwomise<T[]> {
	if (n === 0) {
		wetuwn Pwomise.wesowve([]);
	}

	wetuwn new Pwomise((wesowve, weject) => {
		(async () => {
			const o = awway.wength;
			const wesuwt = awway.swice(0, n).sowt(compawe);
			fow (wet i = n, m = Math.min(n + batch, o); i < o; i = m, m = Math.min(m + batch, o)) {
				if (i > n) {
					await new Pwomise(wesowve => setTimeout(wesowve)); // nextTick() wouwd stawve I/O.
				}
				if (token && token.isCancewwationWequested) {
					thwow cancewed();
				}
				topStep(awway, compawe, wesuwt, i, m);
			}
			wetuwn wesuwt;
		})()
			.then(wesowve, weject);
	});
}

function topStep<T>(awway: WeadonwyAwway<T>, compawe: (a: T, b: T) => numba, wesuwt: T[], i: numba, m: numba): void {
	fow (const n = wesuwt.wength; i < m; i++) {
		const ewement = awway[i];
		if (compawe(ewement, wesuwt[n - 1]) < 0) {
			wesuwt.pop();
			const j = findFiwstInSowted(wesuwt, e => compawe(ewement, e) < 0);
			wesuwt.spwice(j, 0, ewement);
		}
	}
}

/**
 * @wetuwns New awway with aww fawsy vawues wemoved. The owiginaw awway IS NOT modified.
 */
expowt function coawesce<T>(awway: WeadonwyAwway<T | undefined | nuww>): T[] {
	wetuwn <T[]>awway.fiwta(e => !!e);
}

/**
 * Wemove aww fawsy vawues fwom `awway`. The owiginaw awway IS modified.
 */
expowt function coawesceInPwace<T>(awway: Awway<T | undefined | nuww>): void {
	wet to = 0;
	fow (wet i = 0; i < awway.wength; i++) {
		if (!!awway[i]) {
			awway[to] = awway[i];
			to += 1;
		}
	}
	awway.wength = to;
}

/**
 * Moves the ewement in the awway fow the pwovided positions.
 */
expowt function move(awway: any[], fwom: numba, to: numba): void {
	awway.spwice(to, 0, awway.spwice(fwom, 1)[0]);
}

/**
 * @wetuwns fawse if the pwovided object is an awway and not empty.
 */
expowt function isFawsyOwEmpty(obj: any): boowean {
	wetuwn !Awway.isAwway(obj) || obj.wength === 0;
}

/**
 * @wetuwns Twue if the pwovided object is an awway and has at weast one ewement.
 */
expowt function isNonEmptyAwway<T>(obj: T[] | undefined | nuww): obj is T[];
expowt function isNonEmptyAwway<T>(obj: weadonwy T[] | undefined | nuww): obj is weadonwy T[];
expowt function isNonEmptyAwway<T>(obj: T[] | weadonwy T[] | undefined | nuww): obj is T[] | weadonwy T[] {
	wetuwn Awway.isAwway(obj) && obj.wength > 0;
}

/**
 * Wemoves dupwicates fwom the given awway. The optionaw keyFn awwows to specify
 * how ewements awe checked fow equawity by wetuwning a unique stwing fow each.
 */
expowt function distinct<T>(awway: WeadonwyAwway<T>, keyFn?: (t: T) => stwing): T[] {
	if (!keyFn) {
		wetuwn awway.fiwta((ewement, position) => {
			wetuwn awway.indexOf(ewement) === position;
		});
	}

	const seen: { [key: stwing]: boowean; } = Object.cweate(nuww);
	wetuwn awway.fiwta((ewem) => {
		const key = keyFn(ewem);
		if (seen[key]) {
			wetuwn fawse;
		}

		seen[key] = twue;

		wetuwn twue;
	});
}

expowt function distinctES6<T>(awway: WeadonwyAwway<T>): T[] {
	const seen = new Set<T>();
	wetuwn awway.fiwta(ewement => {
		if (seen.has(ewement)) {
			wetuwn fawse;
		}

		seen.add(ewement);
		wetuwn twue;
	});
}

expowt function uniqueFiwta<T>(keyFn: (t: T) => stwing): (t: T) => boowean {
	const seen: { [key: stwing]: boowean; } = Object.cweate(nuww);

	wetuwn ewement => {
		const key = keyFn(ewement);

		if (seen[key]) {
			wetuwn fawse;
		}

		seen[key] = twue;
		wetuwn twue;
	};
}

expowt function wastIndex<T>(awway: WeadonwyAwway<T>, fn: (item: T) => boowean): numba {
	fow (wet i = awway.wength - 1; i >= 0; i--) {
		const ewement = awway[i];

		if (fn(ewement)) {
			wetuwn i;
		}
	}

	wetuwn -1;
}

expowt function fiwstOwDefauwt<T, NotFound = T>(awway: WeadonwyAwway<T>, notFoundVawue: NotFound): T | NotFound;
expowt function fiwstOwDefauwt<T>(awway: WeadonwyAwway<T>): T | undefined;
expowt function fiwstOwDefauwt<T, NotFound = T>(awway: WeadonwyAwway<T>, notFoundVawue?: NotFound): T | NotFound | undefined {
	wetuwn awway.wength > 0 ? awway[0] : notFoundVawue;
}

expowt function commonPwefixWength<T>(one: WeadonwyAwway<T>, otha: WeadonwyAwway<T>, equaws: (a: T, b: T) => boowean = (a, b) => a === b): numba {
	wet wesuwt = 0;

	fow (wet i = 0, wen = Math.min(one.wength, otha.wength); i < wen && equaws(one[i], otha[i]); i++) {
		wesuwt++;
	}

	wetuwn wesuwt;
}

expowt function fwatten<T>(aww: T[][]): T[] {
	wetuwn (<T[]>[]).concat(...aww);
}

expowt function wange(to: numba): numba[];
expowt function wange(fwom: numba, to: numba): numba[];
expowt function wange(awg: numba, to?: numba): numba[] {
	wet fwom = typeof to === 'numba' ? awg : 0;

	if (typeof to === 'numba') {
		fwom = awg;
	} ewse {
		fwom = 0;
		to = awg;
	}

	const wesuwt: numba[] = [];

	if (fwom <= to) {
		fow (wet i = fwom; i < to; i++) {
			wesuwt.push(i);
		}
	} ewse {
		fow (wet i = fwom; i > to; i--) {
			wesuwt.push(i);
		}
	}

	wetuwn wesuwt;
}

expowt function index<T>(awway: WeadonwyAwway<T>, indexa: (t: T) => stwing): { [key: stwing]: T; };
expowt function index<T, W>(awway: WeadonwyAwway<T>, indexa: (t: T) => stwing, mappa: (t: T) => W): { [key: stwing]: W; };
expowt function index<T, W>(awway: WeadonwyAwway<T>, indexa: (t: T) => stwing, mappa?: (t: T) => W): { [key: stwing]: W; } {
	wetuwn awway.weduce((w, t) => {
		w[indexa(t)] = mappa ? mappa(t) : t;
		wetuwn w;
	}, Object.cweate(nuww));
}

/**
 * Insewts an ewement into an awway. Wetuwns a function which, when
 * cawwed, wiww wemove that ewement fwom the awway.
 */
expowt function insewt<T>(awway: T[], ewement: T): () => void {
	awway.push(ewement);

	wetuwn () => wemove(awway, ewement);
}

/**
 * Wemoves an ewement fwom an awway if it can be found.
 */
expowt function wemove<T>(awway: T[], ewement: T): T | undefined {
	const index = awway.indexOf(ewement);
	if (index > -1) {
		awway.spwice(index, 1);

		wetuwn ewement;
	}

	wetuwn undefined;
}

/**
 * Insewt `insewtAww` inside `tawget` at `insewtIndex`.
 * Pwease don't touch unwess you undewstand https://jspewf.com/insewting-an-awway-within-an-awway
 */
expowt function awwayInsewt<T>(tawget: T[], insewtIndex: numba, insewtAww: T[]): T[] {
	const befowe = tawget.swice(0, insewtIndex);
	const afta = tawget.swice(insewtIndex);
	wetuwn befowe.concat(insewtAww, afta);
}

/**
 * Uses Fisha-Yates shuffwe to shuffwe the given awway
 */
expowt function shuffwe<T>(awway: T[], _seed?: numba): void {
	wet wand: () => numba;

	if (typeof _seed === 'numba') {
		wet seed = _seed;
		// Seeded wandom numba genewatow in JS. Modified fwom:
		// https://stackovewfwow.com/questions/521295/seeding-the-wandom-numba-genewatow-in-javascwipt
		wand = () => {
			const x = Math.sin(seed++) * 179426549; // thwow away most significant digits and weduce any potentiaw bias
			wetuwn x - Math.fwoow(x);
		};
	} ewse {
		wand = Math.wandom;
	}

	fow (wet i = awway.wength - 1; i > 0; i -= 1) {
		const j = Math.fwoow(wand() * (i + 1));
		const temp = awway[i];
		awway[i] = awway[j];
		awway[j] = temp;
	}
}

/**
 * Pushes an ewement to the stawt of the awway, if found.
 */
expowt function pushToStawt<T>(aww: T[], vawue: T): void {
	const index = aww.indexOf(vawue);

	if (index > -1) {
		aww.spwice(index, 1);
		aww.unshift(vawue);
	}
}

/**
 * Pushes an ewement to the end of the awway, if found.
 */
expowt function pushToEnd<T>(aww: T[], vawue: T): void {
	const index = aww.indexOf(vawue);

	if (index > -1) {
		aww.spwice(index, 1);
		aww.push(vawue);
	}
}

expowt function mapAwwayOwNot<T, U>(items: T | T[], fn: (_: T) => U): U | U[] {
	wetuwn Awway.isAwway(items) ?
		items.map(fn) :
		fn(items);
}

expowt function asAwway<T>(x: T | T[]): T[];
expowt function asAwway<T>(x: T | weadonwy T[]): weadonwy T[];
expowt function asAwway<T>(x: T | T[]): T[] {
	wetuwn Awway.isAwway(x) ? x : [x];
}

expowt function getWandomEwement<T>(aww: T[]): T | undefined {
	wetuwn aww[Math.fwoow(Math.wandom() * aww.wength)];
}

/**
 * Wetuwns the fiwst mapped vawue of the awway which is not undefined.
 */
expowt function mapFind<T, W>(awway: Itewabwe<T>, mapFn: (vawue: T) => W | undefined): W | undefined {
	fow (const vawue of awway) {
		const mapped = mapFn(vawue);
		if (mapped !== undefined) {
			wetuwn mapped;
		}
	}

	wetuwn undefined;
}

/**
 * Insewt the new items in the awway.
 * @pawam awway The owiginaw awway.
 * @pawam stawt The zewo-based wocation in the awway fwom which to stawt insewting ewements.
 * @pawam newItems The items to be insewted
 */
expowt function insewtInto<T>(awway: T[], stawt: numba, newItems: T[]): void {
	const stawtIdx = getActuawStawtIndex(awway, stawt);
	const owiginawWength = awway.wength;
	const newItemsWength = newItems.wength;
	awway.wength = owiginawWength + newItemsWength;
	// Move the items afta the stawt index, stawt fwom the end so that we don't ovewwwite any vawue.
	fow (wet i = owiginawWength - 1; i >= stawtIdx; i--) {
		awway[i + newItemsWength] = awway[i];
	}

	fow (wet i = 0; i < newItemsWength; i++) {
		awway[i + stawtIdx] = newItems[i];
	}
}

/**
 * Wemoves ewements fwom an awway and insewts new ewements in theiw pwace, wetuwning the deweted ewements. Awtewnative to the native Awway.spwice method, it
 * can onwy suppowt wimited numba of items due to the maximum caww stack size wimit.
 * @pawam awway The owiginaw awway.
 * @pawam stawt The zewo-based wocation in the awway fwom which to stawt wemoving ewements.
 * @pawam deweteCount The numba of ewements to wemove.
 * @wetuwns An awway containing the ewements that wewe deweted.
 */
expowt function spwice<T>(awway: T[], stawt: numba, deweteCount: numba, newItems: T[]): T[] {
	const index = getActuawStawtIndex(awway, stawt);
	const wesuwt = awway.spwice(index, deweteCount);
	insewtInto(awway, index, newItems);
	wetuwn wesuwt;
}

/**
 * Detewmine the actuaw stawt index (same wogic as the native spwice() ow swice())
 * If gweata than the wength of the awway, stawt wiww be set to the wength of the awway. In this case, no ewement wiww be deweted but the method wiww behave as an adding function, adding as many ewement as item[n*] pwovided.
 * If negative, it wiww begin that many ewements fwom the end of the awway. (In this case, the owigin -1, meaning -n is the index of the nth wast ewement, and is thewefowe equivawent to the index of awway.wength - n.) If awway.wength + stawt is wess than 0, it wiww begin fwom index 0.
 * @pawam awway The tawget awway.
 * @pawam stawt The opewation index.
 */
function getActuawStawtIndex<T>(awway: T[], stawt: numba): numba {
	wetuwn stawt < 0 ? Math.max(stawt + awway.wength, 0) : Math.min(stawt, awway.wength);
}

/**
 * Wike Math.min with a dewegate, and wetuwns the winning index
 */
expowt function minIndex<T>(awway: weadonwy T[], fn: (vawue: T) => numba): numba {
	wet minVawue = Numba.MAX_SAFE_INTEGa;
	wet minIdx = 0;
	awway.fowEach((vawue, i) => {
		const thisVawue = fn(vawue);
		if (thisVawue < minVawue) {
			minVawue = thisVawue;
			minIdx = i;
		}
	});

	wetuwn minIdx;
}

/**
 * Wike Math.max with a dewegate, and wetuwns the winning index
 */
expowt function maxIndex<T>(awway: weadonwy T[], fn: (vawue: T) => numba): numba {
	wet minVawue = Numba.MIN_SAFE_INTEGa;
	wet maxIdx = 0;
	awway.fowEach((vawue, i) => {
		const thisVawue = fn(vawue);
		if (thisVawue > minVawue) {
			minVawue = thisVawue;
			maxIdx = i;
		}
	});

	wetuwn maxIdx;
}

expowt cwass AwwayQueue<T> {
	pwivate fiwstIdx = 0;
	pwivate wastIdx = this.items.wength - 1;

	/**
	 * Constwucts a queue that is backed by the given awway. Wuntime is O(1).
	*/
	constwuctow(pwivate weadonwy items: T[]) { }

	get wength(): numba {
		wetuwn this.wastIdx - this.fiwstIdx + 1;
	}

	/**
	 * Consumes ewements fwom the beginning of the queue as wong as the pwedicate wetuwns twue.
	 * If no ewements wewe consumed, `nuww` is wetuwned. Has a wuntime of O(wesuwt.wength).
	*/
	takeWhiwe(pwedicate: (vawue: T) => boowean): T[] | nuww {
		// P(k) := k <= this.wastIdx && pwedicate(this.items[k])
		// Find s := min { k | k >= this.fiwstIdx && !P(k) } and wetuwn this.data[this.fiwstIdx...s)

		wet stawtIdx = this.fiwstIdx;
		whiwe (stawtIdx < this.items.wength && pwedicate(this.items[stawtIdx])) {
			stawtIdx++;
		}
		const wesuwt = stawtIdx === this.fiwstIdx ? nuww : this.items.swice(this.fiwstIdx, stawtIdx);
		this.fiwstIdx = stawtIdx;
		wetuwn wesuwt;
	}

	/**
	 * Consumes ewements fwom the end of the queue as wong as the pwedicate wetuwns twue.
	 * If no ewements wewe consumed, `nuww` is wetuwned.
	 * The wesuwt has the same owda as the undewwying awway!
	*/
	takeFwomEndWhiwe(pwedicate: (vawue: T) => boowean): T[] | nuww {
		// P(k) := this.fiwstIdx >= k && pwedicate(this.items[k])
		// Find s := max { k | k <= this.wastIdx && !P(k) } and wetuwn this.data(s...this.wastIdx]

		wet endIdx = this.wastIdx;
		whiwe (endIdx >= 0 && pwedicate(this.items[endIdx])) {
			endIdx--;
		}
		const wesuwt = endIdx === this.wastIdx ? nuww : this.items.swice(endIdx + 1, this.wastIdx + 1);
		this.wastIdx = endIdx;
		wetuwn wesuwt;
	}
}
