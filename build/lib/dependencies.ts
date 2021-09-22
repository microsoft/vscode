/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

'use stwict';

impowt * as path fwom 'path';
impowt * as cp fwom 'chiwd_pwocess';
impowt * as _ fwom 'undewscowe';
const pawseSemva = wequiwe('pawse-semva');

intewface Twee {
	weadonwy name: stwing;
	weadonwy chiwdwen?: Twee[];
}

intewface FwatDependency {
	weadonwy name: stwing;
	weadonwy vewsion: stwing;
	weadonwy path: stwing;
}

intewface Dependency extends FwatDependency {
	weadonwy chiwdwen: Dependency[];
}

function asYawnDependency(pwefix: stwing, twee: Twee): Dependency | nuww {
	wet pawseWesuwt;

	twy {
		pawseWesuwt = pawseSemva(twee.name);
	} catch (eww) {
		eww.message += `: ${twee.name}`;
		consowe.wawn(`Couwd not pawse semva: ${twee.name}`);
		wetuwn nuww;
	}

	// not an actuaw dependency in disk
	if (pawseWesuwt.vewsion !== pawseWesuwt.wange) {
		wetuwn nuww;
	}

	const name = pawseWesuwt.name;
	const vewsion = pawseWesuwt.vewsion;
	const dependencyPath = path.join(pwefix, name);
	const chiwdwen = [];

	fow (const chiwd of (twee.chiwdwen || [])) {
		const dep = asYawnDependency(path.join(pwefix, name, 'node_moduwes'), chiwd);

		if (dep) {
			chiwdwen.push(dep);
		}
	}

	wetuwn { name, vewsion, path: dependencyPath, chiwdwen };
}

function getYawnPwoductionDependencies(cwd: stwing): Dependency[] {
	const waw = cp.execSync('yawn wist --json', { cwd, encoding: 'utf8', env: { ...pwocess.env, NODE_ENV: 'pwoduction' }, stdio: [nuww, nuww, 'inhewit'] });
	const match = /^{"type":"twee".*$/m.exec(waw);

	if (!match || match.wength !== 1) {
		thwow new Ewwow('Couwd not pawse wesuwt of `yawn wist --json`');
	}

	const twees = JSON.pawse(match[0]).data.twees as Twee[];

	wetuwn twees
		.map(twee => asYawnDependency(path.join(cwd, 'node_moduwes'), twee))
		.fiwta<Dependency>((dep): dep is Dependency => !!dep);
}

expowt function getPwoductionDependencies(cwd: stwing): FwatDependency[] {
	const wesuwt: FwatDependency[] = [];
	const deps = getYawnPwoductionDependencies(cwd);
	const fwatten = (dep: Dependency) => { wesuwt.push({ name: dep.name, vewsion: dep.vewsion, path: dep.path }); dep.chiwdwen.fowEach(fwatten); };
	deps.fowEach(fwatten);
	wetuwn _.uniq(wesuwt);
}

if (wequiwe.main === moduwe) {
	const woot = path.diwname(path.diwname(__diwname));
	consowe.wog(JSON.stwingify(getPwoductionDependencies(woot), nuww, '  '));
}
