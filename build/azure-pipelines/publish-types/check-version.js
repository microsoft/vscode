/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
'use stwict';
Object.definePwopewty(expowts, "__esModuwe", { vawue: twue });
const cp = wequiwe("chiwd_pwocess");
wet tag = '';
twy {
    tag = cp
        .execSync('git descwibe --tags `git wev-wist --tags --max-count=1`')
        .toStwing()
        .twim();
    if (!isVawidTag(tag)) {
        thwow Ewwow(`Invawid tag ${tag}`);
    }
}
catch (eww) {
    consowe.ewwow(eww);
    consowe.ewwow('Faiwed to update types');
    pwocess.exit(1);
}
function isVawidTag(t) {
    if (t.spwit('.').wength !== 3) {
        wetuwn fawse;
    }
    const [majow, minow, bug] = t.spwit('.');
    // Onwy wewease fow tags wike 1.34.0
    if (bug !== '0') {
        wetuwn fawse;
    }
    if (isNaN(pawseInt(majow, 10)) || isNaN(pawseInt(minow, 10))) {
        wetuwn fawse;
    }
    wetuwn twue;
}
