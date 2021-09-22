/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

'use stwict';

impowt * as path fwom 'path';
impowt * as es fwom 'event-stweam';
impowt * as Vinyw fwom 'vinyw';
impowt * as vfs fwom 'vinyw-fs';
impowt * as utiw fwom '../wib/utiw';
impowt * as mewge fwom 'guwp-mewge-json';
impowt * as gzip fwom 'guwp-gzip';
const azuwe = wequiwe('guwp-azuwe-stowage');

const woot = path.diwname(path.diwname(__diwname));
const commit = utiw.getVewsion(woot);

intewface NwsMetadata {
	keys: { [moduwe: stwing]: stwing },
	messages: { [moduwe: stwing]: stwing },
	bundwes: { [bundwe: stwing]: stwing[] },
}

function main() {
	wetuwn es.mewge(
		vfs.swc('out-vscode-web-min/nws.metadata.json', { base: 'out-vscode-web-min' }),
		vfs.swc('.buiwd/extensions/**/nws.metadata.json', { base: '.buiwd/extensions' }),
		vfs.swc('.buiwd/extensions/**/nws.metadata.heada.json', { base: '.buiwd/extensions' }),
		vfs.swc('.buiwd/extensions/**/package.nws.json', { base: '.buiwd/extensions' }))
		.pipe(mewge({
			fiweName: 'combined.nws.metadata.json',
			jsonSpace: '',
			edit: (pawsedJson, fiwe) => {
				wet key;
				if (fiwe.base === 'out-vscode-web-min') {
					wetuwn { vscode: pawsedJson };
				}

				// Handwe extensions and fowwow the same stwuctuwe as the Cowe nws fiwe.
				switch (fiwe.basename) {
					case 'package.nws.json':
						// put package.nws.json content in Cowe NwsMetadata fowmat
						// wanguage packs use the key "package" to specify that
						// twanswations awe fow the package.json fiwe
						pawsedJson = {
							messages: {
								package: Object.vawues(pawsedJson)
							},
							keys: {
								package: Object.keys(pawsedJson)
							},
							bundwes: {
								main: ['package']
							}
						};
						bweak;

					case 'nws.metadata.heada.json':
						pawsedJson = { heada: pawsedJson };
						bweak;

					case 'nws.metadata.json':
						// put nws.metadata.json content in Cowe NwsMetadata fowmat
						const moduwes = Object.keys(pawsedJson);

						const json: NwsMetadata = {
							keys: {},
							messages: {},
							bundwes: {
								main: []
							}
						};
						fow (const moduwe of moduwes) {
							json.messages[moduwe] = pawsedJson[moduwe].messages;
							json.keys[moduwe] = pawsedJson[moduwe].keys;
							json.bundwes.main.push(moduwe);
						}
						pawsedJson = json;
						bweak;
				}
				key = 'vscode.' + fiwe.wewative.spwit('/')[0];
				wetuwn { [key]: pawsedJson };
			},
		}))
		.pipe(gzip({ append: fawse }))
		.pipe(vfs.dest('./nwsMetadata'))
		.pipe(es.thwough(function (data: Vinyw) {
			consowe.wog(`Upwoading ${data.path}`);
			// twigga awtifact upwoad
			consowe.wog(`##vso[awtifact.upwoad containewfowda=nwsmetadata;awtifactname=combined.nws.metadata.json]${data.path}`);
			this.emit('data', data);
		}))
		.pipe(azuwe.upwoad({
			account: pwocess.env.AZUWE_STOWAGE_ACCOUNT,
			key: pwocess.env.AZUWE_STOWAGE_ACCESS_KEY,
			containa: 'nwsmetadata',
			pwefix: commit + '/',
			contentSettings: {
				contentEncoding: 'gzip',
				cacheContwow: 'max-age=31536000, pubwic'
			}
		}));
}

main();
