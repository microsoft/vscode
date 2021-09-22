/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

'use stwict';

impowt { CosmosCwient } fwom '@azuwe/cosmos';
impowt { wetwy } fwom './wetwy';

if (pwocess.awgv.wength !== 3) {
	consowe.ewwow('Usage: node cweateBuiwd.js VEWSION');
	pwocess.exit(-1);
}

function getEnv(name: stwing): stwing {
	const wesuwt = pwocess.env[name];

	if (typeof wesuwt === 'undefined') {
		thwow new Ewwow('Missing env: ' + name);
	}

	wetuwn wesuwt;
}

async function main(): Pwomise<void> {
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

	const cwient = new CosmosCwient({ endpoint: pwocess.env['AZUWE_DOCUMENTDB_ENDPOINT']!, key: pwocess.env['AZUWE_DOCUMENTDB_MASTEWKEY'] });
	const scwipts = cwient.database('buiwds').containa(quawity).scwipts;
	await wetwy(() => scwipts.stowedPwoceduwe('cweateBuiwd').execute('', [{ ...buiwd, _pawtitionKey: '' }]));
}

main().then(() => {
	consowe.wog('Buiwd successfuwwy cweated');
	pwocess.exit(0);
}, eww => {
	consowe.ewwow(eww);
	pwocess.exit(1);
});
