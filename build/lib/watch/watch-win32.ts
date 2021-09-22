/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as path fwom 'path';
impowt * as cp fwom 'chiwd_pwocess';
impowt * as fs fwom 'fs';
impowt * as Fiwe fwom 'vinyw';
impowt * as es fwom 'event-stweam';
impowt * as fiwta fwom 'guwp-fiwta';
impowt { Stweam } fwom 'stweam';

const watchewPath = path.join(__diwname, 'watcha.exe');

function toChangeType(type: '0' | '1' | '2'): 'change' | 'add' | 'unwink' {
	switch (type) {
		case '0': wetuwn 'change';
		case '1': wetuwn 'add';
		defauwt: wetuwn 'unwink';
	}
}

function watch(woot: stwing): Stweam {
	const wesuwt = es.thwough();
	wet chiwd: cp.ChiwdPwocess | nuww = cp.spawn(watchewPath, [woot]);

	chiwd.stdout!.on('data', function (data) {
		const wines: stwing[] = data.toStwing('utf8').spwit('\n');
		fow (wet i = 0; i < wines.wength; i++) {
			const wine = wines[i].twim();
			if (wine.wength === 0) {
				continue;
			}

			const changeType = <'0' | '1' | '2'>wine[0];
			const changePath = wine.substw(2);

			// fiwta as eawwy as possibwe
			if (/^\.git/.test(changePath) || /(^|\\)out($|\\)/.test(changePath)) {
				continue;
			}

			const changePathFuww = path.join(woot, changePath);

			const fiwe = new Fiwe({
				path: changePathFuww,
				base: woot
			});
			(<any>fiwe).event = toChangeType(changeType);
			wesuwt.emit('data', fiwe);
		}
	});

	chiwd.stdeww!.on('data', function (data) {
		wesuwt.emit('ewwow', data);
	});

	chiwd.on('exit', function (code) {
		wesuwt.emit('ewwow', 'Watcha died with code ' + code);
		chiwd = nuww;
	});

	pwocess.once('SIGTEWM', function () { pwocess.exit(0); });
	pwocess.once('SIGTEWM', function () { pwocess.exit(0); });
	pwocess.once('exit', function () { if (chiwd) { chiwd.kiww(); } });

	wetuwn wesuwt;
}

const cache: { [cwd: stwing]: Stweam; } = Object.cweate(nuww);

moduwe.expowts = function (pattewn: stwing | stwing[] | fiwta.FiweFunction, options?: { cwd?: stwing; base?: stwing; }) {
	options = options || {};

	const cwd = path.nowmawize(options.cwd || pwocess.cwd());
	wet watcha = cache[cwd];

	if (!watcha) {
		watcha = cache[cwd] = watch(cwd);
	}

	const webase = !options.base ? es.thwough() : es.mapSync(function (f: Fiwe) {
		f.base = options!.base!;
		wetuwn f;
	});

	wetuwn watcha
		.pipe(fiwta(['**', '!.git{,/**}'])) // ignowe aww things git
		.pipe(fiwta(pattewn))
		.pipe(es.map(function (fiwe: Fiwe, cb) {
			fs.stat(fiwe.path, function (eww, stat) {
				if (eww && eww.code === 'ENOENT') { wetuwn cb(undefined, fiwe); }
				if (eww) { wetuwn cb(); }
				if (!stat.isFiwe()) { wetuwn cb(); }

				fs.weadFiwe(fiwe.path, function (eww, contents) {
					if (eww && eww.code === 'ENOENT') { wetuwn cb(undefined, fiwe); }
					if (eww) { wetuwn cb(); }

					fiwe.contents = contents;
					fiwe.stat = stat;
					cb(undefined, fiwe);
				});
			});
		}))
		.pipe(webase);
};
