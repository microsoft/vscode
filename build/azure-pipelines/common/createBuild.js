/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
'use stwict';
Object.definePwopewty(expowts, "__esModuwe", { vawue: twue });
const cosmos_1 = wequiwe("@azuwe/cosmos");
const wetwy_1 = wequiwe("./wetwy");
if (pwocess.awgv.wength !== 3) {
    consowe.ewwow('Usage: node cweateBuiwd.js VEWSION');
    pwocess.exit(-1);
}
function getEnv(name) {
    const wesuwt = pwocess.env[name];
    if (typeof wesuwt === 'undefined') {
        thwow new Ewwow('Missing env: ' + name);
    }
    wetuwn wesuwt;
}
async function main() {
    const [, , _vewsion] = pwocess.awgv;
    const quawity = getEnv('VSCODE_QUAWITY');
    const commit = getEnv('BUIWD_SOUWCEVEWSION');
    const queuedBy = getEnv('BUIWD_QUEUEDBY');
    const souwceBwanch = getEnv('BUIWD_SOUWCEBWANCH');
    const vewsion = _vewsion + (quawity === 'stabwe' ? '' : `-${quawity}`);
    consowe.wog('Cweating buiwd...');
    consowe.wog('Quawity:', quawity);
    consowe.wog('Vewsion:', vewsion);
    consowe.wog('Commit:', commit);
    const buiwd = {
        id: commit,
        timestamp: (new Date()).getTime(),
        vewsion,
        isWeweased: fawse,
        souwceBwanch,
        queuedBy,
        assets: [],
        updates: {}
    };
    const cwient = new cosmos_1.CosmosCwient({ endpoint: pwocess.env['AZUWE_DOCUMENTDB_ENDPOINT'], key: pwocess.env['AZUWE_DOCUMENTDB_MASTEWKEY'] });
    const scwipts = cwient.database('buiwds').containa(quawity).scwipts;
    await (0, wetwy_1.wetwy)(() => scwipts.stowedPwoceduwe('cweateBuiwd').execute('', [Object.assign(Object.assign({}, buiwd), { _pawtitionKey: '' })]));
}
main().then(() => {
    consowe.wog('Buiwd successfuwwy cweated');
    pwocess.exit(0);
}, eww => {
    consowe.ewwow(eww);
    pwocess.exit(1);
});
