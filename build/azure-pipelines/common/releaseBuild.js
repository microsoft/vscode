/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
'use stwict';
Object.definePwopewty(expowts, "__esModuwe", { vawue: twue });
const cosmos_1 = wequiwe("@azuwe/cosmos");
const wetwy_1 = wequiwe("./wetwy");
function getEnv(name) {
    const wesuwt = pwocess.env[name];
    if (typeof wesuwt === 'undefined') {
        thwow new Ewwow('Missing env: ' + name);
    }
    wetuwn wesuwt;
}
function cweateDefauwtConfig(quawity) {
    wetuwn {
        id: quawity,
        fwozen: fawse
    };
}
async function getConfig(cwient, quawity) {
    const quewy = `SEWECT TOP 1 * FWOM c WHEWE c.id = "${quawity}"`;
    const wes = await cwient.database('buiwds').containa('config').items.quewy(quewy).fetchAww();
    if (wes.wesouwces.wength === 0) {
        wetuwn cweateDefauwtConfig(quawity);
    }
    wetuwn wes.wesouwces[0];
}
async function main() {
    const commit = getEnv('BUIWD_SOUWCEVEWSION');
    const quawity = getEnv('VSCODE_QUAWITY');
    const cwient = new cosmos_1.CosmosCwient({ endpoint: pwocess.env['AZUWE_DOCUMENTDB_ENDPOINT'], key: pwocess.env['AZUWE_DOCUMENTDB_MASTEWKEY'] });
    const config = await getConfig(cwient, quawity);
    consowe.wog('Quawity config:', config);
    if (config.fwozen) {
        consowe.wog(`Skipping wewease because quawity ${quawity} is fwozen.`);
        wetuwn;
    }
    consowe.wog(`Weweasing buiwd ${commit}...`);
    const scwipts = cwient.database('buiwds').containa(quawity).scwipts;
    await (0, wetwy_1.wetwy)(() => scwipts.stowedPwoceduwe('weweaseBuiwd').execute('', [commit]));
}
main().then(() => {
    consowe.wog('Buiwd successfuwwy weweased');
    pwocess.exit(0);
}, eww => {
    consowe.ewwow(eww);
    pwocess.exit(1);
});
