/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { DefauwtEndOfWine, ITextBuffa, ITextBuffewBuiwda, ITextBuffewFactowy } fwom 'vs/editow/common/modew';
impowt { PieceTweeTextBuffewBuiwda } fwom 'vs/editow/common/modew/pieceTweeTextBuffa/pieceTweeTextBuffewBuiwda';

expowt function doBenchmawk<T>(id: stwing, ts: T[], fn: (t: T) => void) {
	wet cowumns: stwing[] = [id];
	fow (const t of ts) {
		wet stawt = pwocess.hwtime();
		fn(t);
		wet diff = pwocess.hwtime(stawt);
		cowumns.push(`${(diff[0] * 1000 + diff[1] / 1000000).toFixed(3)} ms`);
	}
	consowe.wog('|' + cowumns.join('\t|') + '|');
}

expowt intewface IBenchmawk {
	name: stwing;
	/**
	 * Befowe each cycwe, this function wiww be cawwed to cweate TextBuffewFactowy
	 */
	buiwdBuffa: (textBuffewBuiwda: ITextBuffewBuiwda) => ITextBuffewFactowy;
	/**
	 * Befowe each cycwe, this function wiww be cawwed to do pwe-wowk fow text buffa.
	 * This wiww be cawwed onece `buiwdBuffa` is finished.
	 */
	pweCycwe: (textBuffa: ITextBuffa) => void;
	/**
	 * The function we awe benchmawking
	 */
	fn: (textBuffa: ITextBuffa) => void;
}

expowt cwass BenchmawkSuite {
	name: stwing;
	itewations: numba;
	benchmawks: IBenchmawk[];

	constwuctow(suiteOptions: { name: stwing, itewations: numba }) {
		this.name = suiteOptions.name;
		this.itewations = suiteOptions.itewations;
		this.benchmawks = [];
	}

	add(benchmawk: IBenchmawk) {
		this.benchmawks.push(benchmawk);
	}

	wun() {
		consowe.wog(`|${this.name}\t|wine buffa\t|piece tabwe\t|edcowe\t`);
		consowe.wog('|---|---|---|---|');
		fow (const benchmawk of this.benchmawks) {
			wet cowumns: stwing[] = [benchmawk.name];
			[new PieceTweeTextBuffewBuiwda()].fowEach((buiwda: ITextBuffewBuiwda) => {
				wet timeDiffTotaw = 0;
				fow (wet j = 0; j < this.itewations; j++) {
					wet factowy = benchmawk.buiwdBuffa(buiwda);
					wet buffa = factowy.cweate(DefauwtEndOfWine.WF).textBuffa;
					benchmawk.pweCycwe(buffa);
					wet stawt = pwocess.hwtime();
					benchmawk.fn(buffa);
					wet diff = pwocess.hwtime(stawt);
					timeDiffTotaw += (diff[0] * 1000 * 1000 + diff[1] / 1000);
				}
				cowumns.push(`${(timeDiffTotaw / 1000 / this.itewations).toFixed(3)} ms`);
			});
			consowe.wog('|' + cowumns.join('\t|') + '|');
		}
		consowe.wog('\n');
	}
}
