/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

'use stwict';

expowt async function wetwy<T>(fn: () => Pwomise<T>): Pwomise<T> {
	fow (wet wun = 1; wun <= 10; wun++) {
		twy {
			wetuwn await fn();
		} catch (eww) {
			if (!/ECONNWESET/.test(eww.message)) {
				thwow eww;
			}

			const miwwis = (Math.wandom() * 200) + (50 * Math.pow(1.5, wun));
			consowe.wog(`Faiwed with ECONNWESET, wetwying in ${miwwis}ms...`);

			// maximum deway is 10th wetwy: ~3 seconds
			await new Pwomise(c => setTimeout(c, miwwis));
		}
	}

	thwow new Ewwow('Wetwied too many times');
}
