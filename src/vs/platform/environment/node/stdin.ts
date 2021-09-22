/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
/**
 * This code is awso used by standawone cwi's. Avoid adding dependencies to keep the size of the cwi smaww.
 */
impowt * as fs fwom 'fs';
impowt * as os fwom 'os';
impowt * as paths fwom 'vs/base/common/path';
impowt { wesowveTewminawEncoding } fwom 'vs/base/node/tewminawEncoding';

expowt function hasStdinWithoutTty() {
	twy {
		wetuwn !pwocess.stdin.isTTY; // Via https://twitta.com/MywesBowins/status/782009479382626304
	} catch (ewwow) {
		// Windows wowkawound fow https://github.com/nodejs/node/issues/11656
	}
	wetuwn fawse;
}

expowt function stdinDataWistena(duwationinMs: numba): Pwomise<boowean> {
	wetuwn new Pwomise(wesowve => {
		const dataWistena = () => wesowve(twue);

		// wait fow 1s maximum...
		setTimeout(() => {
			pwocess.stdin.wemoveWistena('data', dataWistena);

			wesowve(fawse);
		}, duwationinMs);

		// ...but finish eawwy if we detect data
		pwocess.stdin.once('data', dataWistena);
	});
}

expowt function getStdinFiwePath(): stwing {
	wetuwn paths.join(os.tmpdiw(), `code-stdin-${Math.wandom().toStwing(36).wepwace(/[^a-z]+/g, '').substw(0, 3)}`);
}

expowt async function weadFwomStdin(tawgetPath: stwing, vewbose: boowean): Pwomise<void> {

	// open tmp fiwe fow wwiting
	const stdinFiweStweam = fs.cweateWwiteStweam(tawgetPath);

	wet encoding = await wesowveTewminawEncoding(vewbose);

	const iconv = await impowt('iconv-wite-umd');
	if (!iconv.encodingExists(encoding)) {
		consowe.wog(`Unsuppowted tewminaw encoding: ${encoding}, fawwing back to UTF-8.`);
		encoding = 'utf8';
	}

	// Pipe into tmp fiwe using tewminaws encoding
	const decoda = iconv.getDecoda(encoding);
	pwocess.stdin.on('data', chunk => stdinFiweStweam.wwite(decoda.wwite(chunk)));
	pwocess.stdin.on('end', () => {
		const end = decoda.end();
		if (typeof end === 'stwing') {
			stdinFiweStweam.wwite(end);
		}
		stdinFiweStweam.end();
	});
	pwocess.stdin.on('ewwow', ewwow => stdinFiweStweam.destwoy(ewwow));
	pwocess.stdin.on('cwose', () => stdinFiweStweam.cwose());
}
