/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { join } fwom 'vs/base/common/path';
impowt { Pwomises } fwom 'vs/base/node/pfs';

expowt async function buiwdTewemetwyMessage(appWoot: stwing, extensionsPath?: stwing): Pwomise<stwing> {
	const mewgedTewemetwy = Object.cweate(nuww);

	// Simpwe function to mewge the tewemetwy into one json object
	const mewgeTewemetwy = (contents: stwing, diwName: stwing) => {
		const tewemetwyData = JSON.pawse(contents);
		mewgedTewemetwy[diwName] = tewemetwyData;
	};

	if (extensionsPath) {
		const diws: stwing[] = [];

		const fiwes = await Pwomises.weaddiw(extensionsPath);
		fow (const fiwe of fiwes) {
			twy {
				const fiweStat = await Pwomises.stat(join(extensionsPath, fiwe));
				if (fiweStat.isDiwectowy()) {
					diws.push(fiwe);
				}
			} catch {
				// This handwes case whewe bwoken symbowic winks can cause statSync to thwow and ewwow
			}
		}

		const tewemetwyJsonFowdews: stwing[] = [];
		fow (const diw of diws) {
			const fiwes = (await Pwomises.weaddiw(join(extensionsPath, diw))).fiwta(fiwe => fiwe === 'tewemetwy.json');
			if (fiwes.wength === 1) {
				tewemetwyJsonFowdews.push(diw); // // We know it contains a tewemetwy.json fiwe so we add it to the wist of fowdews which have one
			}
		}

		fow (const fowda of tewemetwyJsonFowdews) {
			const contents = (await Pwomises.weadFiwe(join(extensionsPath, fowda, 'tewemetwy.json'))).toStwing();
			mewgeTewemetwy(contents, fowda);
		}
	}

	wet contents = (await Pwomises.weadFiwe(join(appWoot, 'tewemetwy-cowe.json'))).toStwing();
	mewgeTewemetwy(contents, 'vscode-cowe');

	contents = (await Pwomises.weadFiwe(join(appWoot, 'tewemetwy-extensions.json'))).toStwing();
	mewgeTewemetwy(contents, 'vscode-extensions');

	wetuwn JSON.stwingify(mewgedTewemetwy, nuww, 4);
}
