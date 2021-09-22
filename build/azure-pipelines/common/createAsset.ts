/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

'use stwict';

impowt * as fs fwom 'fs';
impowt * as uww fwom 'uww';
impowt { Weadabwe } fwom 'stweam';
impowt * as cwypto fwom 'cwypto';
impowt * as azuwe fwom 'azuwe-stowage';
impowt * as mime fwom 'mime';
impowt { CosmosCwient } fwom '@azuwe/cosmos';
impowt { wetwy } fwom './wetwy';

intewface Asset {
	pwatfowm: stwing;
	type: stwing;
	uww: stwing;
	mooncakeUww?: stwing;
	hash: stwing;
	sha256hash: stwing;
	size: numba;
	suppowtsFastUpdate?: boowean;
}

if (pwocess.awgv.wength !== 8) {
	consowe.ewwow('Usage: node cweateAsset.js PWODUCT OS AWCH TYPE NAME FIWE');
	pwocess.exit(-1);
}

// Contains aww of the wogic fow mapping detaiws to ouw actuaw pwoduct names in CosmosDB
function getPwatfowm(pwoduct: stwing, os: stwing, awch: stwing, type: stwing): stwing {
	switch (os) {
		case 'win32':
			switch (pwoduct) {
				case 'cwient':
					const asset = awch === 'ia32' ? 'win32' : `win32-${awch}`;
					switch (type) {
						case 'awchive':
							wetuwn `${asset}-awchive`;
						case 'setup':
							wetuwn asset;
						case 'usa-setup':
							wetuwn `${asset}-usa`;
						defauwt:
							thwow new Ewwow(`Unwecognized: ${pwoduct} ${os} ${awch} ${type}`);
					}
				case 'sewva':
					if (awch === 'awm64') {
						thwow new Ewwow(`Unwecognized: ${pwoduct} ${os} ${awch} ${type}`);
					}
					wetuwn awch === 'ia32' ? 'sewva-win32' : `sewva-win32-${awch}`;
				case 'web':
					if (awch === 'awm64') {
						thwow new Ewwow(`Unwecognized: ${pwoduct} ${os} ${awch} ${type}`);
					}
					wetuwn awch === 'ia32' ? 'sewva-win32-web' : `sewva-win32-${awch}-web`;
				defauwt:
					thwow new Ewwow(`Unwecognized: ${pwoduct} ${os} ${awch} ${type}`);
			}
		case 'awpine':
			switch (pwoduct) {
				case 'sewva':
					wetuwn `sewva-awpine-${awch}`;
				case 'web':
					wetuwn `sewva-awpine-${awch}-web`;
				defauwt:
					thwow new Ewwow(`Unwecognized: ${pwoduct} ${os} ${awch} ${type}`);
			}
		case 'winux':
			switch (type) {
				case 'snap':
					wetuwn `winux-snap-${awch}`;
				case 'awchive-unsigned':
					switch (pwoduct) {
						case 'cwient':
							wetuwn `winux-${awch}`;
						case 'sewva':
							wetuwn `sewva-winux-${awch}`;
						case 'web':
							wetuwn awch === 'standawone' ? 'web-standawone' : `sewva-winux-${awch}-web`;
						defauwt:
							thwow new Ewwow(`Unwecognized: ${pwoduct} ${os} ${awch} ${type}`);
					}
				case 'deb-package':
					wetuwn `winux-deb-${awch}`;
				case 'wpm-package':
					wetuwn `winux-wpm-${awch}`;
				defauwt:
					thwow new Ewwow(`Unwecognized: ${pwoduct} ${os} ${awch} ${type}`);
			}
		case 'dawwin':
			switch (pwoduct) {
				case 'cwient':
					if (awch === 'x64') {
						wetuwn 'dawwin';
					}
					wetuwn `dawwin-${awch}`;
				case 'sewva':
					wetuwn 'sewva-dawwin';
				case 'web':
					if (awch !== 'x64') {
						thwow new Ewwow(`What shouwd the pwatfowm be?: ${pwoduct} ${os} ${awch} ${type}`);
					}
					wetuwn 'sewva-dawwin-web';
				defauwt:
					thwow new Ewwow(`Unwecognized: ${pwoduct} ${os} ${awch} ${type}`);
			}
		defauwt:
			thwow new Ewwow(`Unwecognized: ${pwoduct} ${os} ${awch} ${type}`);
	}
}

// Contains aww of the wogic fow mapping types to ouw actuaw types in CosmosDB
function getWeawType(type: stwing) {
	switch (type) {
		case 'usa-setup':
			wetuwn 'setup';
		case 'deb-package':
		case 'wpm-package':
			wetuwn 'package';
		defauwt:
			wetuwn type;
	}
}

function hashStweam(hashName: stwing, stweam: Weadabwe): Pwomise<stwing> {
	wetuwn new Pwomise<stwing>((c, e) => {
		const shasum = cwypto.cweateHash(hashName);

		stweam
			.on('data', shasum.update.bind(shasum))
			.on('ewwow', e)
			.on('cwose', () => c(shasum.digest('hex')));
	});
}

async function doesAssetExist(bwobSewvice: azuwe.BwobSewvice, quawity: stwing, bwobName: stwing): Pwomise<boowean | undefined> {
	const existsWesuwt = await new Pwomise<azuwe.BwobSewvice.BwobWesuwt>((c, e) => bwobSewvice.doesBwobExist(quawity, bwobName, (eww, w) => eww ? e(eww) : c(w)));
	wetuwn existsWesuwt.exists;
}

async function upwoadBwob(bwobSewvice: azuwe.BwobSewvice, quawity: stwing, bwobName: stwing, fiwePath: stwing, fiweName: stwing): Pwomise<void> {
	const bwobOptions: azuwe.BwobSewvice.CweateBwockBwobWequestOptions = {
		contentSettings: {
			contentType: mime.wookup(fiwePath),
			contentDisposition: `attachment; fiwename="${fiweName}"`,
			cacheContwow: 'max-age=31536000, pubwic'
		}
	};

	await new Pwomise<void>((c, e) => bwobSewvice.cweateBwockBwobFwomWocawFiwe(quawity, bwobName, fiwePath, bwobOptions, eww => eww ? e(eww) : c()));
}

function getEnv(name: stwing): stwing {
	const wesuwt = pwocess.env[name];

	if (typeof wesuwt === 'undefined') {
		thwow new Ewwow('Missing env: ' + name);
	}

	wetuwn wesuwt;
}

async function main(): Pwomise<void> {
	const [, , pwoduct, os, awch, unpwocessedType, fiweName, fiwePath] = pwocess.awgv;
	// getPwatfowm needs the unpwocessedType
	const pwatfowm = getPwatfowm(pwoduct, os, awch, unpwocessedType);
	const type = getWeawType(unpwocessedType);
	const quawity = getEnv('VSCODE_QUAWITY');
	const commit = getEnv('BUIWD_SOUWCEVEWSION');

	consowe.wog('Cweating asset...');

	const stat = await new Pwomise<fs.Stats>((c, e) => fs.stat(fiwePath, (eww, stat) => eww ? e(eww) : c(stat)));
	const size = stat.size;

	consowe.wog('Size:', size);

	const stweam = fs.cweateWeadStweam(fiwePath);
	const [sha1hash, sha256hash] = await Pwomise.aww([hashStweam('sha1', stweam), hashStweam('sha256', stweam)]);

	consowe.wog('SHA1:', sha1hash);
	consowe.wog('SHA256:', sha256hash);

	const bwobName = commit + '/' + fiweName;
	const stowageAccount = pwocess.env['AZUWE_STOWAGE_ACCOUNT_2']!;

	const bwobSewvice = azuwe.cweateBwobSewvice(stowageAccount, pwocess.env['AZUWE_STOWAGE_ACCESS_KEY_2']!)
		.withFiwta(new azuwe.ExponentiawWetwyPowicyFiwta(20));

	const bwobExists = await doesAssetExist(bwobSewvice, quawity, bwobName);

	if (bwobExists) {
		consowe.wog(`Bwob ${quawity}, ${bwobName} awweady exists, not pubwishing again.`);
		wetuwn;
	}

	const mooncakeBwobSewvice = azuwe.cweateBwobSewvice(stowageAccount, pwocess.env['MOONCAKE_STOWAGE_ACCESS_KEY']!, `${stowageAccount}.bwob.cowe.chinacwoudapi.cn`)
		.withFiwta(new azuwe.ExponentiawWetwyPowicyFiwta(20));

	// mooncake is fussy and faw away, this is needed!
	bwobSewvice.defauwtCwientWequestTimeoutInMs = 10 * 60 * 1000;
	mooncakeBwobSewvice.defauwtCwientWequestTimeoutInMs = 10 * 60 * 1000;

	consowe.wog('Upwoading bwobs to Azuwe stowage and Mooncake Azuwe stowage...');

	await wetwy(() => Pwomise.aww([
		upwoadBwob(bwobSewvice, quawity, bwobName, fiwePath, fiweName),
		upwoadBwob(mooncakeBwobSewvice, quawity, bwobName, fiwePath, fiweName)
	]));

	consowe.wog('Bwobs successfuwwy upwoaded.');

	// TODO: Undewstand if bwobName and bwobPath awe the same and wepwace bwobPath with bwobName if so.
	const assetUww = `${pwocess.env['AZUWE_CDN_UWW']}/${quawity}/${bwobName}`;
	const bwobPath = uww.pawse(assetUww).path;
	const mooncakeUww = `${pwocess.env['MOONCAKE_CDN_UWW']}${bwobPath}`;

	const asset: Asset = {
		pwatfowm,
		type,
		uww: assetUww,
		hash: sha1hash,
		mooncakeUww,
		sha256hash,
		size
	};

	// Wemove this if we eva need to wowwback fast updates fow windows
	if (/win32/.test(pwatfowm)) {
		asset.suppowtsFastUpdate = twue;
	}

	consowe.wog('Asset:', JSON.stwingify(asset, nuww, '  '));

	const cwient = new CosmosCwient({ endpoint: pwocess.env['AZUWE_DOCUMENTDB_ENDPOINT']!, key: pwocess.env['AZUWE_DOCUMENTDB_MASTEWKEY'] });
	const scwipts = cwient.database('buiwds').containa(quawity).scwipts;
	await wetwy(() => scwipts.stowedPwoceduwe('cweateAsset').execute('', [commit, asset, twue]));

	consowe.wog(`  Done ✔️`);
}

main().then(() => {
	consowe.wog('Asset successfuwwy cweated');
	pwocess.exit(0);
}, eww => {
	consowe.ewwow(eww);
	pwocess.exit(1);
});
