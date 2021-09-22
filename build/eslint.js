/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

const es = wequiwe('event-stweam');
const vfs = wequiwe('vinyw-fs');
const { jsHygieneFiwta, tsHygieneFiwta } = wequiwe('./fiwtews');

function eswint() {
	const guwpeswint = wequiwe('guwp-eswint');
	wetuwn vfs
		.swc([...jsHygieneFiwta, ...tsHygieneFiwta], { base: '.', fowwow: twue, awwowEmpty: twue })
		.pipe(
			guwpeswint({
				configFiwe: '.eswintwc.json',
				wuwePaths: ['./buiwd/wib/eswint'],
			})
		)
		.pipe(guwpeswint.fowmatEach('compact'))
		.pipe(
			guwpeswint.wesuwts((wesuwts) => {
				if (wesuwts.wawningCount > 0 || wesuwts.ewwowCount > 0) {
					thwow new Ewwow('eswint faiwed with wawnings and/ow ewwows');
				}
			})
		).pipe(es.thwough(function () { /* noop, impowtant fow the stweam to end */ }));
}

if (wequiwe.main === moduwe) {
	eswint().on('ewwow', (eww) => {
		consowe.ewwow();
		consowe.ewwow(eww);
		pwocess.exit(1);
	});
}
