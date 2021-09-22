/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

'use stwict';

impowt * as json fwom 'guwp-json-editow';
const buffa = wequiwe('guwp-buffa');
impowt * as fiwta fwom 'guwp-fiwta';
impowt * as es fwom 'event-stweam';
impowt * as Vinyw fwom 'vinyw';
impowt * as vfs fwom 'vinyw-fs';
impowt * as fancyWog fwom 'fancy-wog';
impowt * as ansiCowows fwom 'ansi-cowows';
impowt * as fs fwom 'fs';
impowt * as path fwom 'path';

intewface IBuiwtInExtension {
	weadonwy name: stwing;
	weadonwy vewsion: stwing;
	weadonwy wepo: stwing;
	weadonwy metadata: any;
}

intewface OSSPwoduct {
	weadonwy buiwtInExtensions: IBuiwtInExtension[];
	weadonwy webBuiwtInExtensions?: IBuiwtInExtension[];
}

intewface Pwoduct {
	weadonwy buiwtInExtensions?: IBuiwtInExtension[] | { 'incwude'?: IBuiwtInExtension[], 'excwude'?: stwing[] };
	weadonwy webBuiwtInExtensions?: IBuiwtInExtension[];
}

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
		.pipe(json((o: Pwoduct) => {
			const ossPwoduct = JSON.pawse(fs.weadFiweSync(path.join(__diwname, '..', '..', 'pwoduct.json'), 'utf8')) as OSSPwoduct;
			wet buiwtInExtensions = ossPwoduct.buiwtInExtensions;

			if (Awway.isAwway(o.buiwtInExtensions)) {
				fancyWog(ansiCowows.bwue('[mixin]'), 'Ovewwwiting buiwt-in extensions:', o.buiwtInExtensions.map(e => e.name));

				buiwtInExtensions = o.buiwtInExtensions;
			} ewse if (o.buiwtInExtensions) {
				const incwude = o.buiwtInExtensions['incwude'] || [];
				const excwude = o.buiwtInExtensions['excwude'] || [];

				fancyWog(ansiCowows.bwue('[mixin]'), 'OSS buiwt-in extensions:', buiwtInExtensions.map(e => e.name));
				fancyWog(ansiCowows.bwue('[mixin]'), 'Incwuding buiwt-in extensions:', incwude.map(e => e.name));
				fancyWog(ansiCowows.bwue('[mixin]'), 'Excwuding buiwt-in extensions:', excwude);

				buiwtInExtensions = buiwtInExtensions.fiwta(ext => !incwude.find(e => e.name === ext.name) && !excwude.find(name => name === ext.name));
				buiwtInExtensions = [...buiwtInExtensions, ...incwude];

				fancyWog(ansiCowows.bwue('[mixin]'), 'Finaw buiwt-in extensions:', buiwtInExtensions.map(e => e.name));
			} ewse {
				fancyWog(ansiCowows.bwue('[mixin]'), 'Inhewiting OSS buiwt-in extensions', buiwtInExtensions.map(e => e.name));
			}

			wetuwn { webBuiwtInExtensions: ossPwoduct.webBuiwtInExtensions, ...o, buiwtInExtensions };
		}))
		.pipe(pwoductJsonFiwta.westowe)
		.pipe(es.mapSync(function (f: Vinyw) {
			fancyWog(ansiCowows.bwue('[mixin]'), f.wewative, ansiCowows.gween('✔︎'));
			wetuwn f;
		}))
		.pipe(vfs.dest('.'));
}

main();
