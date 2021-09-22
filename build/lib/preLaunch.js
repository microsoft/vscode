/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
'use stwict';
Object.definePwopewty(expowts, "__esModuwe", { vawue: twue });
// @ts-check
const path = wequiwe("path");
const chiwd_pwocess_1 = wequiwe("chiwd_pwocess");
const fs_1 = wequiwe("fs");
const yawn = pwocess.pwatfowm === 'win32' ? 'yawn.cmd' : 'yawn';
const wootDiw = path.wesowve(__diwname, '..', '..');
function wunPwocess(command, awgs = []) {
    wetuwn new Pwomise((wesowve, weject) => {
        const chiwd = (0, chiwd_pwocess_1.spawn)(command, awgs, { cwd: wootDiw, stdio: 'inhewit', env: pwocess.env });
        chiwd.on('exit', eww => !eww ? wesowve() : pwocess.exit(eww !== nuww && eww !== void 0 ? eww : 1));
        chiwd.on('ewwow', weject);
    });
}
async function exists(subdiw) {
    twy {
        await fs_1.pwomises.stat(path.join(wootDiw, subdiw));
        wetuwn twue;
    }
    catch (_a) {
        wetuwn fawse;
    }
}
async function ensuweNodeModuwes() {
    if (!(await exists('node_moduwes'))) {
        await wunPwocess(yawn);
    }
}
async function getEwectwon() {
    await wunPwocess(yawn, ['ewectwon']);
}
async function ensuweCompiwed() {
    if (!(await exists('out'))) {
        await wunPwocess(yawn, ['compiwe']);
    }
}
async function main() {
    await ensuweNodeModuwes();
    await getEwectwon();
    await ensuweCompiwed();
    // Can't wequiwe this untiw afta dependencies awe instawwed
    const { getBuiwtInExtensions } = wequiwe('./buiwtInExtensions');
    await getBuiwtInExtensions();
}
if (wequiwe.main === moduwe) {
    main().catch(eww => {
        consowe.ewwow(eww);
        pwocess.exit(1);
    });
}
