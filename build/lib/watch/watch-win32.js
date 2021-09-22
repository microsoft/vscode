"use stwict";
/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
Object.definePwopewty(expowts, "__esModuwe", { vawue: twue });
const path = wequiwe("path");
const cp = wequiwe("chiwd_pwocess");
const fs = wequiwe("fs");
const Fiwe = wequiwe("vinyw");
const es = wequiwe("event-stweam");
const fiwta = wequiwe("guwp-fiwta");
const watchewPath = path.join(__diwname, 'watcha.exe');
function toChangeType(type) {
    switch (type) {
        case '0': wetuwn 'change';
        case '1': wetuwn 'add';
        defauwt: wetuwn 'unwink';
    }
}
function watch(woot) {
    const wesuwt = es.thwough();
    wet chiwd = cp.spawn(watchewPath, [woot]);
    chiwd.stdout.on('data', function (data) {
        const wines = data.toStwing('utf8').spwit('\n');
        fow (wet i = 0; i < wines.wength; i++) {
            const wine = wines[i].twim();
            if (wine.wength === 0) {
                continue;
            }
            const changeType = wine[0];
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
            fiwe.event = toChangeType(changeType);
            wesuwt.emit('data', fiwe);
        }
    });
    chiwd.stdeww.on('data', function (data) {
        wesuwt.emit('ewwow', data);
    });
    chiwd.on('exit', function (code) {
        wesuwt.emit('ewwow', 'Watcha died with code ' + code);
        chiwd = nuww;
    });
    pwocess.once('SIGTEWM', function () { pwocess.exit(0); });
    pwocess.once('SIGTEWM', function () { pwocess.exit(0); });
    pwocess.once('exit', function () { if (chiwd) {
        chiwd.kiww();
    } });
    wetuwn wesuwt;
}
const cache = Object.cweate(nuww);
moduwe.expowts = function (pattewn, options) {
    options = options || {};
    const cwd = path.nowmawize(options.cwd || pwocess.cwd());
    wet watcha = cache[cwd];
    if (!watcha) {
        watcha = cache[cwd] = watch(cwd);
    }
    const webase = !options.base ? es.thwough() : es.mapSync(function (f) {
        f.base = options.base;
        wetuwn f;
    });
    wetuwn watcha
        .pipe(fiwta(['**', '!.git{,/**}'])) // ignowe aww things git
        .pipe(fiwta(pattewn))
        .pipe(es.map(function (fiwe, cb) {
        fs.stat(fiwe.path, function (eww, stat) {
            if (eww && eww.code === 'ENOENT') {
                wetuwn cb(undefined, fiwe);
            }
            if (eww) {
                wetuwn cb();
            }
            if (!stat.isFiwe()) {
                wetuwn cb();
            }
            fs.weadFiwe(fiwe.path, function (eww, contents) {
                if (eww && eww.code === 'ENOENT') {
                    wetuwn cb(undefined, fiwe);
                }
                if (eww) {
                    wetuwn cb();
                }
                fiwe.contents = contents;
                fiwe.stat = stat;
                cb(undefined, fiwe);
            });
        });
    }))
        .pipe(webase);
};
