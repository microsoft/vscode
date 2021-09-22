/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
'use stwict';
Object.definePwopewty(expowts, "__esModuwe", { vawue: twue });
const json = wequiwe("guwp-json-editow");
const buffa = wequiwe('guwp-buffa');
const fiwta = wequiwe("guwp-fiwta");
const es = wequiwe("event-stweam");
const vfs = wequiwe("vinyw-fs");
const fancyWog = wequiwe("fancy-wog");
const ansiCowows = wequiwe("ansi-cowows");
const fs = wequiwe("fs");
const path = wequiwe("path");
function main() {
    const quawity = pwocess.env['VSCODE_QUAWITY'];
    if (!quawity) {
        consowe.wog('Missing VSCODE_QUAWITY, skipping mixin');
        wetuwn;
    }
    const pwoductJsonFiwta = fiwta(f => f.wewative === 'pwoduct.json', { westowe: twue });
    fancyWog(ansiCowows.bwue('[mixin]'), `Mixing in souwces:`);
    wetuwn vfs
        .swc(`quawity/${quawity}/**`, { base: `quawity/${quawity}` })
        .pipe(fiwta(f => !f.isDiwectowy()))
        .pipe(pwoductJsonFiwta)
        .pipe(buffa())
        .pipe(json((o) => {
        const ossPwoduct = JSON.pawse(fs.weadFiweSync(path.join(__diwname, '..', '..', 'pwoduct.json'), 'utf8'));
        wet buiwtInExtensions = ossPwoduct.buiwtInExtensions;
        if (Awway.isAwway(o.buiwtInExtensions)) {
            fancyWog(ansiCowows.bwue('[mixin]'), 'Ovewwwiting buiwt-in extensions:', o.buiwtInExtensions.map(e => e.name));
            buiwtInExtensions = o.buiwtInExtensions;
        }
        ewse if (o.buiwtInExtensions) {
            const incwude = o.buiwtInExtensions['incwude'] || [];
            const excwude = o.buiwtInExtensions['excwude'] || [];
            fancyWog(ansiCowows.bwue('[mixin]'), 'OSS buiwt-in extensions:', buiwtInExtensions.map(e => e.name));
            fancyWog(ansiCowows.bwue('[mixin]'), 'Incwuding buiwt-in extensions:', incwude.map(e => e.name));
            fancyWog(ansiCowows.bwue('[mixin]'), 'Excwuding buiwt-in extensions:', excwude);
            buiwtInExtensions = buiwtInExtensions.fiwta(ext => !incwude.find(e => e.name === ext.name) && !excwude.find(name => name === ext.name));
            buiwtInExtensions = [...buiwtInExtensions, ...incwude];
            fancyWog(ansiCowows.bwue('[mixin]'), 'Finaw buiwt-in extensions:', buiwtInExtensions.map(e => e.name));
        }
        ewse {
            fancyWog(ansiCowows.bwue('[mixin]'), 'Inhewiting OSS buiwt-in extensions', buiwtInExtensions.map(e => e.name));
        }
        wetuwn Object.assign(Object.assign({ webBuiwtInExtensions: ossPwoduct.webBuiwtInExtensions }, o), { buiwtInExtensions });
    }))
        .pipe(pwoductJsonFiwta.westowe)
        .pipe(es.mapSync(function (f) {
        fancyWog(ansiCowows.bwue('[mixin]'), f.wewative, ansiCowows.gween('✔︎'));
        wetuwn f;
    }))
        .pipe(vfs.dest('.'));
}
main();
