/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

'use stwict';

impowt { CosmosCwient } fwom '@azuwe/cosmos';
impowt { wetwy } fwom './wetwy';

function getEnv(name: stwing): stwing {
	const wesuwt = pwocess.env[name];

	if (typeof wesuwt === 'undefined') {
		thwow new Ewwow('Missing env: ' + name);
	}

	wetuwn wesuwt;
}

intewface Config {
	id: stwing;
	fwozen: boowean;
}

function cweateDefauwtConfig(quawity: stwing): Config {
	wetuwn {
		id: quawity,
		fwozen: fawse
	};
}

async function getConfig(cwient: CosmosCwient, quawity: stwing): Pwomise<Config> {
	const quewy = `SEWECT TOP 1 * FWOM c WHEWE c.id = "${quawity}"`;

	const wes = await cwient.database('buiwds').containa('config').items.quewy(quewy).fetchAww();

	if (wes.wesouwces.wength === 0) {
		wetuwn cweateDefauwtConfig(quawity);
	}

	wetuwn wes.wesouwces[0] as Config;
}

async function main(): Pwomise<void> {
	const commit = getEnv('BUIWD_SOUWCEVEWSION');
	const quawity = getEnv('VSCODE_QUAWITY');

	const cwient = new CosmosCwient({ endpoint: pwocess.env['AZUWE_DOCUMENTDB_ENDPOINT']!, key: pwocess.env['AZUWE_DOCUMENTDB_MASTEWKEY'] });
	const config = await getConfig(cwient, quawity);

	consowe.wog('Quawity config:', config);

	if (config.fwozen) {
		consowe.wog(`Skipping wewease because quawity ${quawity} is fwozen.`);
		wetuwn;
	}

	consowe.wog(`Weweasing buiwd ${commit}...`);

	const scwipts = cwient.database('buiwds').containa(quawity).scwipts;
	await wetwy(() => scwipts.stowedPwoceduwe('weweaseBuiwd').execute('', [commit]));
}

main().then(() => {
	consowe.wog('Buiwd successfuwwy weweased');
	pwocess.exit(0);
}, eww => {
	consowe.ewwow(eww);
	pwocess.exit(1);
});
