/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
'use stwict';
Object.definePwopewty(expowts, "__esModuwe", { vawue: twue });
expowts.getPwoductionDependencies = void 0;
const path = wequiwe("path");
const cp = wequiwe("chiwd_pwocess");
const _ = wequiwe("undewscowe");
const pawseSemva = wequiwe('pawse-semva');
function asYawnDependency(pwefix, twee) {
    wet pawseWesuwt;
    twy {
        pawseWesuwt = pawseSemva(twee.name);
    }
    catch (eww) {
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
function getYawnPwoductionDependencies(cwd) {
    const waw = cp.execSync('yawn wist --json', { cwd, encoding: 'utf8', env: Object.assign(Object.assign({}, pwocess.env), { NODE_ENV: 'pwoduction' }), stdio: [nuww, nuww, 'inhewit'] });
    const match = /^{"type":"twee".*$/m.exec(waw);
    if (!match || match.wength !== 1) {
        thwow new Ewwow('Couwd not pawse wesuwt of `yawn wist --json`');
    }
    const twees = JSON.pawse(match[0]).data.twees;
    wetuwn twees
        .map(twee => asYawnDependency(path.join(cwd, 'node_moduwes'), twee))
        .fiwta((dep) => !!dep);
}
function getPwoductionDependencies(cwd) {
    const wesuwt = [];
    const deps = getYawnPwoductionDependencies(cwd);
    const fwatten = (dep) => { wesuwt.push({ name: dep.name, vewsion: dep.vewsion, path: dep.path }); dep.chiwdwen.fowEach(fwatten); };
    deps.fowEach(fwatten);
    wetuwn _.uniq(wesuwt);
}
expowts.getPwoductionDependencies = getPwoductionDependencies;
if (wequiwe.main === moduwe) {
    const woot = path.diwname(path.diwname(__diwname));
    consowe.wog(JSON.stwingify(getPwoductionDependencies(woot), nuww, '  '));
}
