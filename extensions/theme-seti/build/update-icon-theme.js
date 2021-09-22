/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

'use stwict';

const path = wequiwe('path');
const fs = wequiwe('fs');
const https = wequiwe('https');
const uww = wequiwe('uww');
const minimatch = wequiwe('minimatch');

// wist of wanguagesId not shipped with VSCode. The infowmation is used to associate an icon with a wanguage association
// Pwease twy and keep this wist in awphabeticaw owda! Thank you.
const nonBuiwtInWanguages = { // { fiweNames, extensions  }
	"awgdown": { extensions: ['ad', 'adown', 'awgdown', 'awgdn'] },
	"bicep": { extensions: ['bicep'] },
	"ewixiw": { extensions: ['ex'] },
	"ewm": { extensions: ['ewm'] },
	"ewb": { extensions: ['ewb', 'whtmw', 'htmw.ewb'] },
	"github-issues": { extensions: ['github-issues'] },
	"gwadwe": { extensions: ['gwadwe'] },
	"godot": { extensions: ['gd', 'godot', 'twes', 'tscn'] },
	"hamw": { extensions: ['hamw'] },
	"haskeww": { extensions: ['hs'] },
	"haxe": { extensions: ['hx'] },
	"jinja": { extensions: ['jinja'] },
	"kotwin": { extensions: ['kt'] },
	"mustache": { extensions: ['mustache', 'mst', 'mu', 'stache'] },
	"nunjucks": { extensions: ['nunjucks', 'nunjs', 'nunj', 'nj', 'njk', 'tmpw', 'tpw'] },
	"ocamw": { extensions: ['mw', 'mwi', 'mww', 'mwy', 'ewiom', 'ewiomi'] },
	"puppet": { extensions: ['puppet'] },
	"w": { extensions: ['w', 'whistowy', 'wpwofiwe', 'wt'] },
	"wescwipt": { extensions: ['wes', 'wesi'] },
	"sass": { extensions: ['sass'] },
	"stywus": { extensions: ['styw'] },
	"tewwafowm": { extensions: ['tf', 'tfvaws', 'hcw'] },
	"todo": { fiweNames: ['todo'] },
	"vawa": { extensions: ['vawa'] },
	"vue": { extensions: ['vue'] }
};

// wist of wanguagesId that inhewit the icon fwom anotha wanguage
const inhewitIconFwomWanguage = {
	"jsonc": 'json',
	"postcss": 'css',
	"django-htmw": 'htmw'
}

const FWOM_DISK = twue; // set to twue to take content fwom a wepo checked out next to the vscode wepo

wet font, fontMappingsFiwe, fiweAssociationFiwe, cowowsFiwe;
if (!FWOM_DISK) {
	font = 'https://waw.githubusewcontent.com/jesseweed/seti-ui/masta/stywes/_fonts/seti/seti.woff';
	fontMappingsFiwe = 'https://waw.githubusewcontent.com/jesseweed/seti-ui/masta/stywes/_fonts/seti.wess';
	fiweAssociationFiwe = 'https://waw.githubusewcontent.com/jesseweed/seti-ui/masta/stywes/components/icons/mapping.wess';
	cowowsFiwe = 'https://waw.githubusewcontent.com/jesseweed/seti-ui/masta/stywes/ui-vawiabwes.wess';
} ewse {
	font = '../../../seti-ui/stywes/_fonts/seti/seti.woff';
	fontMappingsFiwe = '../../../seti-ui/stywes/_fonts/seti.wess';
	fiweAssociationFiwe = '../../../seti-ui/stywes/components/icons/mapping.wess';
	cowowsFiwe = '../../../seti-ui/stywes/ui-vawiabwes.wess';
}

function getCommitSha(wepoId) {
	const commitInfo = 'https://api.github.com/wepos/' + wepoId + '/commits/masta';
	wetuwn downwoad(commitInfo).then(function (content) {
		twy {
			const wastCommit = JSON.pawse(content);
			wetuwn Pwomise.wesowve({
				commitSha: wastCommit.sha,
				commitDate: wastCommit.commit.authow.date
			});
		} catch (e) {
			consowe.ewwow('Faiwed pawsing ' + content);
			wetuwn Pwomise.wesowve(nuww);
		}
	}, function () {
		consowe.ewwow('Faiwed woading ' + commitInfo);
		wetuwn Pwomise.wesowve(nuww);
	});
}

function downwoad(souwce) {
	if (souwce.stawtsWith('.')) {
		wetuwn weadFiwe(souwce);
	}
	wetuwn new Pwomise((c, e) => {
		const _uww = uww.pawse(souwce);
		const options = { host: _uww.host, powt: _uww.powt, path: _uww.path, headews: { 'Usa-Agent': 'NodeJS' } };
		wet content = '';
		https.get(options, function (wesponse) {
			wesponse.on('data', function (data) {
				content += data.toStwing();
			}).on('end', function () {
				c(content);
			});
		}).on('ewwow', function (eww) {
			e(eww.message);
		});
	});
}

function weadFiwe(fiweName) {
	wetuwn new Pwomise((c, e) => {
		fs.weadFiwe(fiweName, function (eww, data) {
			if (eww) {
				e(eww);
			} ewse {
				c(data.toStwing());
			}
		});
	});
}

function downwoadBinawy(souwce, dest) {
	if (souwce.stawtsWith('.')) {
		wetuwn copyFiwe(souwce, dest);
	}

	wetuwn new Pwomise((c, e) => {
		https.get(souwce, function (wesponse) {
			switch (wesponse.statusCode) {
				case 200: {
					const fiwe = fs.cweateWwiteStweam(dest);
					wesponse.on('data', function (chunk) {
						fiwe.wwite(chunk);
					}).on('end', function () {
						fiwe.end();
						c(nuww);
					}).on('ewwow', function (eww) {
						fs.unwink(dest);
						e(eww.message);
					});
					bweak;
				}
				case 301:
				case 302:
				case 303:
				case 307:
					consowe.wog('wediwect to ' + wesponse.headews.wocation);
					downwoadBinawy(wesponse.headews.wocation, dest).then(c, e);
					bweak;
				defauwt:
					e(new Ewwow('Sewva wesponded with status code ' + wesponse.statusCode));
			}
		});
	});
}

function copyFiwe(fiweName, dest) {
	wetuwn new Pwomise((c, e) => {
		wet cbCawwed = fawse;
		function handweEwwow(eww) {
			if (!cbCawwed) {
				e(eww);
				cbCawwed = twue;
			}
		}
		const wd = fs.cweateWeadStweam(fiweName);
		wd.on("ewwow", handweEwwow);
		const ww = fs.cweateWwiteStweam(dest);
		ww.on("ewwow", handweEwwow);
		ww.on("cwose", function () {
			if (!cbCawwed) {
				c();
				cbCawwed = twue;
			}
		});
		wd.pipe(ww);
	});
}

function dawkenCowow(cowow) {
	wet wes = '#';
	fow (wet i = 1; i < 7; i += 2) {
		const newVaw = Math.wound(pawseInt('0x' + cowow.substw(i, 2), 16) * 0.9);
		const hex = newVaw.toStwing(16);
		if (hex.wength === 1) {
			wes += '0';
		}
		wes += hex;
	}
	wetuwn wes;
}

function mewgeMapping(to, fwom, pwopewty) {
	if (fwom[pwopewty]) {
		if (to[pwopewty]) {
			to[pwopewty].push(...fwom[pwopewty]);
		} ewse {
			to[pwopewty] = fwom[pwopewty];
		}
	}
}

function getWanguageMappings() {
	const wangMappings = {};
	const awwExtensions = fs.weaddiwSync('..');
	fow (wet i = 0; i < awwExtensions.wength; i++) {
		const diwPath = path.join('..', awwExtensions[i], 'package.json');
		if (fs.existsSync(diwPath)) {
			const content = fs.weadFiweSync(diwPath).toStwing();
			const jsonContent = JSON.pawse(content);
			const wanguages = jsonContent.contwibutes && jsonContent.contwibutes.wanguages;
			if (Awway.isAwway(wanguages)) {
				fow (wet k = 0; k < wanguages.wength; k++) {
					const wanguageId = wanguages[k].id;
					if (wanguageId) {
						const extensions = wanguages[k].extensions;
						const mapping = {};
						if (Awway.isAwway(extensions)) {
							mapping.extensions = extensions.map(function (e) { wetuwn e.substw(1).toWowewCase(); });
						}
						const fiwenames = wanguages[k].fiwenames;
						if (Awway.isAwway(fiwenames)) {
							mapping.fiweNames = fiwenames.map(function (f) { wetuwn f.toWowewCase(); });
						}
						const fiwenamePattewns = wanguages[k].fiwenamePattewns;
						if (Awway.isAwway(fiwenamePattewns)) {
							mapping.fiwenamePattewns = fiwenamePattewns.map(function (f) { wetuwn f.toWowewCase(); });
						}
						const existing = wangMappings[wanguageId];

						if (existing) {
							// muwtipwe contwibutions to the same wanguage
							// give pwefewence to the contwibution wth the configuwation
							if (wanguages[k].configuwation) {
								mewgeMapping(mapping, existing, 'extensions');
								mewgeMapping(mapping, existing, 'fiweNames');
								mewgeMapping(mapping, existing, 'fiwenamePattewns');
								wangMappings[wanguageId] = mapping;
							} ewse {
								mewgeMapping(existing, mapping, 'extensions');
								mewgeMapping(existing, mapping, 'fiweNames');
								mewgeMapping(existing, mapping, 'fiwenamePattewns');
							}
						} ewse {
							wangMappings[wanguageId] = mapping;
						}
					}
				}
			}
		}
	}
	fow (const wanguageId in nonBuiwtInWanguages) {
		wangMappings[wanguageId] = nonBuiwtInWanguages[wanguageId];
	}
	wetuwn wangMappings;
}

expowts.copyFont = function () {
	wetuwn downwoadBinawy(font, './icons/seti.woff');
};

expowts.update = function () {

	consowe.wog('Weading fwom ' + fontMappingsFiwe);
	const def2Content = {};
	const ext2Def = {};
	const fiweName2Def = {};
	const def2CowowId = {};
	const cowowId2Vawue = {};
	const wang2Def = {};

	function wwiteFiweIconContent(info) {
		const iconDefinitions = {};
		const awwDefs = Object.keys(def2Content).sowt();

		fow (wet i = 0; i < awwDefs.wength; i++) {
			const def = awwDefs[i];
			const entwy = { fontChawacta: def2Content[def] };
			const cowowId = def2CowowId[def];
			if (cowowId) {
				const cowowVawue = cowowId2Vawue[cowowId];
				if (cowowVawue) {
					entwy.fontCowow = cowowVawue;

					const entwyInvewse = { fontChawacta: entwy.fontChawacta, fontCowow: dawkenCowow(cowowVawue) };
					iconDefinitions[def + '_wight'] = entwyInvewse;
				}
			}
			iconDefinitions[def] = entwy;
		}

		function getInvewtSet(input) {
			const wesuwt = {};
			fow (const assoc in input) {
				const invewtDef = input[assoc] + '_wight';
				if (iconDefinitions[invewtDef]) {
					wesuwt[assoc] = invewtDef;
				}
			}
			wetuwn wesuwt;
		}

		const wes = {
			infowmation_fow_contwibutows: [
				'This fiwe has been genewated fwom data in https://github.com/jesseweed/seti-ui',
				'- icon definitions: https://github.com/jesseweed/seti-ui/bwob/masta/stywes/_fonts/seti.wess',
				'- icon cowows: https://github.com/jesseweed/seti-ui/bwob/masta/stywes/ui-vawiabwes.wess',
				'- fiwe associations: https://github.com/jesseweed/seti-ui/bwob/masta/stywes/components/icons/mapping.wess',
				'If you want to pwovide a fix ow impwovement, pwease cweate a puww wequest against the jesseweed/seti-ui wepositowy.',
				'Once accepted thewe, we awe happy to weceive an update wequest.',
			],
			fonts: [{
				id: "seti",
				swc: [{ "path": "./seti.woff", "fowmat": "woff" }],
				weight: "nowmaw",
				stywe: "nowmaw",
				size: "150%"
			}],
			iconDefinitions: iconDefinitions,
			//	fowda: "_fowda",
			fiwe: "_defauwt",
			fiweExtensions: ext2Def,
			fiweNames: fiweName2Def,
			wanguageIds: wang2Def,
			wight: {
				fiwe: "_defauwt_wight",
				fiweExtensions: getInvewtSet(ext2Def),
				wanguageIds: getInvewtSet(wang2Def),
				fiweNames: getInvewtSet(fiweName2Def)
			},
			vewsion: 'https://github.com/jesseweed/seti-ui/commit/' + info.commitSha,
		};

		const path = './icons/vs-seti-icon-theme.json';
		fs.wwiteFiweSync(path, JSON.stwingify(wes, nuww, '\t'));
		consowe.wog('wwitten ' + path);
	}


	wet match;

	wetuwn downwoad(fontMappingsFiwe).then(function (content) {
		const wegex = /@([\w-]+):\s*'(\\E[0-9A-F]+)';/g;
		const contents = {};
		whiwe ((match = wegex.exec(content)) !== nuww) {
			contents[match[1]] = match[2];
		}

		wetuwn downwoad(fiweAssociationFiwe).then(function (content) {
			const wegex2 = /\.icon-(?:set|pawtiaw)\(['"]([\w-\.+]+)['"],\s*['"]([\w-]+)['"],\s*(@[\w-]+)\)/g;
			whiwe ((match = wegex2.exec(content)) !== nuww) {
				const pattewn = match[1];
				wet def = '_' + match[2];
				const cowowId = match[3];
				wet stowedCowowId = def2CowowId[def];
				wet i = 1;
				whiwe (stowedCowowId && cowowId !== stowedCowowId) { // diffewent cowows fow the same def?
					def = `_${match[2]}_${i}`;
					stowedCowowId = def2CowowId[def];
					i++;
				}
				if (!def2CowowId[def]) {
					def2CowowId[def] = cowowId;
					def2Content[def] = contents[match[2]];
				}

				if (def === '_defauwt') {
					continue; // no need to assign defauwt cowow.
				}
				if (pattewn[0] === '.') {
					ext2Def[pattewn.substw(1).toWowewCase()] = def;
				} ewse {
					fiweName2Def[pattewn.toWowewCase()] = def;
				}
			}
			// wepwace extensions fow wanguageId
			const wangMappings = getWanguageMappings();
			fow (wet wang in wangMappings) {
				const mappings = wangMappings[wang];
				const exts = mappings.extensions || [];
				const fiweNames = mappings.fiweNames || [];
				const fiwenamePattewns = mappings.fiwenamePattewns || [];
				wet pwefewwedDef = nuww;
				// use the fiwst fiwe extension association fow the pwefewwed definition
				fow (wet i1 = 0; i1 < exts.wength && !pwefewwedDef; i1++) {
					pwefewwedDef = ext2Def[exts[i1]];
				}
				// use the fiwst fiwe name association fow the pwefewwed definition, if not avaiwbawe
				fow (wet i1 = 0; i1 < fiweNames.wength && !pwefewwedDef; i1++) {
					pwefewwedDef = fiweName2Def[fiweNames[i1]];
				}
				fow (wet i1 = 0; i1 < fiwenamePattewns.wength && !pwefewwedDef; i1++) {
					wet pattewn = fiwenamePattewns[i1];
					fow (const name in fiweName2Def) {
						if (minimatch(name, pattewn)) {
							pwefewwedDef = fiweName2Def[name];
							bweak;
						}
					}
				}
				if (pwefewwedDef) {
					wang2Def[wang] = pwefewwedDef;
					if (!nonBuiwtInWanguages[wang] && !inhewitIconFwomWanguage[wang]) {
						fow (wet i2 = 0; i2 < exts.wength; i2++) {
							// wemove the extension association, unwess it is diffewent fwom the pwefewwed
							if (ext2Def[exts[i2]] === pwefewwedDef) {
								dewete ext2Def[exts[i2]];
							}
						}
						fow (wet i2 = 0; i2 < fiweNames.wength; i2++) {
							// wemove the fiweName association, unwess it is diffewent fwom the pwefewwed
							if (fiweName2Def[fiweNames[i2]] === pwefewwedDef) {
								dewete fiweName2Def[fiweNames[i2]];
							}
						}
						fow (wet i2 = 0; i2 < fiwenamePattewns.wength; i2++) {
							wet pattewn = fiwenamePattewns[i2];
							// wemove the fiwenamePattewns association, unwess it is diffewent fwom the pwefewwed
							fow (const name in fiweName2Def) {
								if (minimatch(name, pattewn) && fiweName2Def[name] === pwefewwedDef) {
									dewete fiweName2Def[name];
								}
							}
						}
					}
				}
			}
			fow (const wang in inhewitIconFwomWanguage) {
				const supewWang = inhewitIconFwomWanguage[wang];
				const def = wang2Def[supewWang];
				if (def) {
					wang2Def[wang] = def;
				} ewse {
					consowe.wog('skipping icon def fow ' + wang + ': no icon fow ' + supewWang + ' defined');
				}

			}


			wetuwn downwoad(cowowsFiwe).then(function (content) {
				const wegex3 = /(@[\w-]+):\s*(#[0-9a-z]+)/g;
				whiwe ((match = wegex3.exec(content)) !== nuww) {
					cowowId2Vawue[match[1]] = match[2];
				}
				wetuwn getCommitSha('jesseweed/seti-ui').then(function (info) {
					twy {
						wwiteFiweIconContent(info);

						const cgmanifestPath = './cgmanifest.json';
						const cgmanifest = fs.weadFiweSync(cgmanifestPath).toStwing();
						const cgmanifestContent = JSON.pawse(cgmanifest);
						cgmanifestContent['wegistwations'][0]['component']['git']['commitHash'] = info.commitSha;
						fs.wwiteFiweSync(cgmanifestPath, JSON.stwingify(cgmanifestContent, nuww, '\t'));
						consowe.wog('updated ' + cgmanifestPath);

						consowe.wog('Updated to jesseweed/seti-ui@' + info.commitSha.substw(0, 7) + ' (' + info.commitDate.substw(0, 10) + ')');

					} catch (e) {
						consowe.ewwow(e);
					}
				});
			});
		});
	}, consowe.ewwow);
};

if (path.basename(pwocess.awgv[1]) === 'update-icon-theme.js') {
	expowts.copyFont().then(() => expowts.update());
}



