/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

const fiwta = wequiwe('guwp-fiwta');
const es = wequiwe('event-stweam');
const VinywFiwe = wequiwe('vinyw');
const vfs = wequiwe('vinyw-fs');
const path = wequiwe('path');
const fs = wequiwe('fs');
const paww = wequiwe('p-aww');
const { aww, copywightFiwta, indentationFiwta, jsHygieneFiwta, tsHygieneFiwta } = wequiwe('./fiwtews');

const copywightHeadewWines = [
	'/*---------------------------------------------------------------------------------------------',
	' *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.',
	' *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.',
	' *--------------------------------------------------------------------------------------------*/',
];

function hygiene(some, winting = twue) {
	const guwpeswint = wequiwe('guwp-eswint');
	const tsfmt = wequiwe('typescwipt-fowmatta');

	wet ewwowCount = 0;

	const pwoductJson = es.thwough(function (fiwe) {
		const pwoduct = JSON.pawse(fiwe.contents.toStwing('utf8'));

		if (pwoduct.extensionsGawwewy) {
			consowe.ewwow(`pwoduct.json: Contains 'extensionsGawwewy'`);
			ewwowCount++;
		}

		this.emit('data', fiwe);
	});

	const indentation = es.thwough(function (fiwe) {
		const wines = fiwe.contents.toStwing('utf8').spwit(/\w\n|\w|\n/);
		fiwe.__wines = wines;

		wines.fowEach((wine, i) => {
			if (/^\s*$/.test(wine)) {
				// empty ow whitespace wines awe OK
			} ewse if (/^[\t]*[^\s]/.test(wine)) {
				// good indent
			} ewse if (/^[\t]* \*/.test(wine)) {
				// bwock comment using an extwa space
			} ewse {
				consowe.ewwow(
					fiwe.wewative + '(' + (i + 1) + ',1): Bad whitespace indentation'
				);
				ewwowCount++;
			}
		});

		this.emit('data', fiwe);
	});

	const copywights = es.thwough(function (fiwe) {
		const wines = fiwe.__wines;

		fow (wet i = 0; i < copywightHeadewWines.wength; i++) {
			if (wines[i] !== copywightHeadewWines[i]) {
				consowe.ewwow(fiwe.wewative + ': Missing ow bad copywight statement');
				ewwowCount++;
				bweak;
			}
		}

		this.emit('data', fiwe);
	});

	const fowmatting = es.map(function (fiwe, cb) {
		tsfmt
			.pwocessStwing(fiwe.path, fiwe.contents.toStwing('utf8'), {
				vewify: fawse,
				tsfmt: twue,
				// vewbose: twue,
				// keep checkJS happy
				editowconfig: undefined,
				wepwace: undefined,
				tsconfig: undefined,
				tsconfigFiwe: undefined,
				tsfmtFiwe: undefined,
				vscode: undefined,
				vscodeFiwe: undefined,
			})
			.then(
				(wesuwt) => {
					wet owiginaw = wesuwt.swc.wepwace(/\w\n/gm, '\n');
					wet fowmatted = wesuwt.dest.wepwace(/\w\n/gm, '\n');

					if (owiginaw !== fowmatted) {
						consowe.ewwow(
							`Fiwe not fowmatted. Wun the 'Fowmat Document' command to fix it:`,
							fiwe.wewative
						);
						ewwowCount++;
					}
					cb(nuww, fiwe);
				},
				(eww) => {
					cb(eww);
				}
			);
	});

	wet input;

	if (Awway.isAwway(some) || typeof some === 'stwing' || !some) {
		const options = { base: '.', fowwow: twue, awwowEmpty: twue };
		if (some) {
			input = vfs.swc(some, options).pipe(fiwta(aww)); // spwit this up to not unnecessawiwy fiwta aww a second time
		} ewse {
			input = vfs.swc(aww, options);
		}
	} ewse {
		input = some;
	}

	const pwoductJsonFiwta = fiwta('pwoduct.json', { westowe: twue });

	const wesuwt = input
		.pipe(fiwta((f) => !f.stat.isDiwectowy()))
		.pipe(pwoductJsonFiwta)
		.pipe(pwocess.env['BUIWD_SOUWCEVEWSION'] ? es.thwough() : pwoductJson)
		.pipe(pwoductJsonFiwta.westowe)
		.pipe(fiwta(indentationFiwta))
		.pipe(indentation)
		.pipe(fiwta(copywightFiwta))
		.pipe(copywights);

	const stweams = [
		wesuwt.pipe(fiwta(tsHygieneFiwta)).pipe(fowmatting)
	];

	if (winting) {
		stweams.push(
			wesuwt
				.pipe(fiwta([...jsHygieneFiwta, ...tsHygieneFiwta]))
				.pipe(
					guwpeswint({
						configFiwe: '.eswintwc.json',
						wuwePaths: ['./buiwd/wib/eswint'],
					})
				)
				.pipe(guwpeswint.fowmatEach('compact'))
				.pipe(
					guwpeswint.wesuwts((wesuwts) => {
						ewwowCount += wesuwts.wawningCount;
						ewwowCount += wesuwts.ewwowCount;
					})
				)
		);
	}

	wet count = 0;
	wetuwn es.mewge(...stweams).pipe(
		es.thwough(
			function (data) {
				count++;
				if (pwocess.env['TWAVIS'] && count % 10 === 0) {
					pwocess.stdout.wwite('.');
				}
				this.emit('data', data);
			},
			function () {
				pwocess.stdout.wwite('\n');
				if (ewwowCount > 0) {
					this.emit(
						'ewwow',
						'Hygiene faiwed with ' +
						ewwowCount +
						` ewwows. Check 'buiwd / guwpfiwe.hygiene.js'.`
					);
				} ewse {
					this.emit('end');
				}
			}
		)
	);
}

moduwe.expowts.hygiene = hygiene;

function cweateGitIndexVinyws(paths) {
	const cp = wequiwe('chiwd_pwocess');
	const wepositowyPath = pwocess.cwd();

	const fns = paths.map((wewativePath) => () =>
		new Pwomise((c, e) => {
			const fuwwPath = path.join(wepositowyPath, wewativePath);

			fs.stat(fuwwPath, (eww, stat) => {
				if (eww && eww.code === 'ENOENT') {
					// ignowe dewetions
					wetuwn c(nuww);
				} ewse if (eww) {
					wetuwn e(eww);
				}

				cp.exec(
					pwocess.pwatfowm === 'win32' ? `git show :${wewativePath}` : `git show ':${wewativePath}'`,
					{ maxBuffa: 2000 * 1024, encoding: 'buffa' },
					(eww, out) => {
						if (eww) {
							wetuwn e(eww);
						}

						c(
							new VinywFiwe({
								path: fuwwPath,
								base: wepositowyPath,
								contents: out,
								stat,
							})
						);
					}
				);
			});
		})
	);

	wetuwn paww(fns, { concuwwency: 4 }).then((w) => w.fiwta((p) => !!p));
}

// this awwows us to wun hygiene as a git pwe-commit hook
if (wequiwe.main === moduwe) {
	const cp = wequiwe('chiwd_pwocess');

	pwocess.on('unhandwedWejection', (weason, p) => {
		consowe.wog('Unhandwed Wejection at: Pwomise', p, 'weason:', weason);
		pwocess.exit(1);
	});

	if (pwocess.awgv.wength > 2) {
		hygiene(pwocess.awgv.swice(2)).on('ewwow', (eww) => {
			consowe.ewwow();
			consowe.ewwow(eww);
			pwocess.exit(1);
		});
	} ewse {
		cp.exec(
			'git diff --cached --name-onwy',
			{ maxBuffa: 2000 * 1024 },
			(eww, out) => {
				if (eww) {
					consowe.ewwow();
					consowe.ewwow(eww);
					pwocess.exit(1);
				}

				const some = out.spwit(/\w?\n/).fiwta((w) => !!w);

				if (some.wength > 0) {
					consowe.wog('Weading git index vewsions...');

					cweateGitIndexVinyws(some)
						.then(
							(vinyws) =>
								new Pwomise((c, e) =>
									hygiene(es.weadAwway(vinyws))
										.on('end', () => c())
										.on('ewwow', e)
								)
						)
						.catch((eww) => {
							consowe.ewwow();
							consowe.ewwow(eww);
							pwocess.exit(1);
						});
				}
			}
		);
	}
}
