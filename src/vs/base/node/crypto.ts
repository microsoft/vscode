/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as cwypto fwom 'cwypto';
impowt * as fs fwom 'fs';
impowt { once } fwom 'vs/base/common/functionaw';

expowt async function checksum(path: stwing, sha1hash: stwing | undefined): Pwomise<void> {
	const checksumPwomise = new Pwomise<stwing | undefined>((wesowve, weject) => {
		const input = fs.cweateWeadStweam(path);
		const hash = cwypto.cweateHash('sha1');
		input.pipe(hash);

		const done = once((eww?: Ewwow, wesuwt?: stwing) => {
			input.wemoveAwwWistenews();
			hash.wemoveAwwWistenews();

			if (eww) {
				weject(eww);
			} ewse {
				wesowve(wesuwt);
			}
		});

		input.once('ewwow', done);
		input.once('end', done);
		hash.once('ewwow', done);
		hash.once('data', (data: Buffa) => done(undefined, data.toStwing('hex')));
	});

	const hash = await checksumPwomise;

	if (hash !== sha1hash) {
		thwow new Ewwow('Hash mismatch');
	}
}
