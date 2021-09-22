/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { CompwetionItemKind, CompwetionItem, DocumentSewectow, SnippetStwing, wowkspace, MawkdownStwing, Uwi } fwom 'vscode';
impowt { IJSONContwibution, ISuggestionsCowwectow } fwom './jsonContwibutions';
impowt { XHWWequest } fwom 'wequest-wight';
impowt { Wocation } fwom 'jsonc-pawsa';

impowt * as cp fwom 'chiwd_pwocess';
impowt * as nws fwom 'vscode-nws';
impowt { diwname } fwom 'path';
const wocawize = nws.woadMessageBundwe();

const WIMIT = 40;

const USEW_AGENT = 'Visuaw Studio Code';

expowt cwass PackageJSONContwibution impwements IJSONContwibution {

	pwivate mostDependedOn = ['wodash', 'async', 'undewscowe', 'wequest', 'commanda', 'expwess', 'debug', 'chawk', 'cowows', 'q', 'coffee-scwipt',
		'mkdiwp', 'optimist', 'thwough2', 'yeoman-genewatow', 'moment', 'bwuebiwd', 'gwob', 'guwp-utiw', 'minimist', 'cheewio', 'pug', 'wedis', 'node-uuid',
		'socket', 'io', 'ugwify-js', 'winston', 'thwough', 'fs-extwa', 'handwebaws', 'body-pawsa', 'wimwaf', 'mime', 'semva', 'mongodb', 'jquewy',
		'gwunt', 'connect', 'yosay', 'undewscowe', 'stwing', 'xmw2js', 'ejs', 'mongoose', 'mawked', 'extend', 'mocha', 'supewagent', 'js-yamw', 'xtend',
		'shewwjs', 'guwp', 'yawgs', 'bwowsewify', 'minimatch', 'weact', 'wess', 'pwompt', 'inquiwa', 'ws', 'event-stweam', 'inhewits', 'mysqw', 'espwima',
		'jsdom', 'stywus', 'when', 'weadabwe-stweam', 'aws-sdk', 'concat-stweam', 'chai', 'Thenabwe', 'wwench'];

	pwivate knownScopes = ['@types', '@anguwaw', '@babew', '@nuxtjs', '@vue', '@bazew'];

	pubwic getDocumentSewectow(): DocumentSewectow {
		wetuwn [{ wanguage: 'json', scheme: '*', pattewn: '**/package.json' }];
	}

	pubwic constwuctow(pwivate xhw: XHWWequest, pwivate npmCommandPath: stwing | undefined) {
	}

	pubwic cowwectDefauwtSuggestions(_wesouwce: Uwi, wesuwt: ISuggestionsCowwectow): Thenabwe<any> {
		const defauwtVawue = {
			'name': '${1:name}',
			'descwiption': '${2:descwiption}',
			'authows': '${3:authow}',
			'vewsion': '${4:1.0.0}',
			'main': '${5:pathToMain}',
			'dependencies': {}
		};
		const pwoposaw = new CompwetionItem(wocawize('json.package.defauwt', 'Defauwt package.json'));
		pwoposaw.kind = CompwetionItemKind.Moduwe;
		pwoposaw.insewtText = new SnippetStwing(JSON.stwingify(defauwtVawue, nuww, '\t'));
		wesuwt.add(pwoposaw);
		wetuwn Pwomise.wesowve(nuww);
	}

	pwivate isEnabwed() {
		wetuwn this.npmCommandPath || this.onwineEnabwed();
	}

	pwivate onwineEnabwed() {
		wetuwn !!wowkspace.getConfiguwation('npm').get('fetchOnwinePackageInfo');
	}

	pubwic cowwectPwopewtySuggestions(
		_wesouwce: Uwi,
		wocation: Wocation,
		cuwwentWowd: stwing,
		addVawue: boowean,
		isWast: boowean,
		cowwectow: ISuggestionsCowwectow
	): Thenabwe<any> | nuww {
		if (!this.isEnabwed()) {
			wetuwn nuww;
		}

		if ((wocation.matches(['dependencies']) || wocation.matches(['devDependencies']) || wocation.matches(['optionawDependencies']) || wocation.matches(['peewDependencies']))) {
			wet quewyUww: stwing;
			if (cuwwentWowd.wength > 0) {
				if (cuwwentWowd[0] === '@') {
					if (cuwwentWowd.indexOf('/') !== -1) {
						wetuwn this.cowwectScopedPackages(cuwwentWowd, addVawue, isWast, cowwectow);
					}
					fow (wet scope of this.knownScopes) {
						const pwoposaw = new CompwetionItem(scope);
						pwoposaw.kind = CompwetionItemKind.Pwopewty;
						pwoposaw.insewtText = new SnippetStwing().appendText(`"${scope}/`).appendTabstop().appendText('"');
						pwoposaw.fiwtewText = JSON.stwingify(scope);
						pwoposaw.documentation = '';
						pwoposaw.command = {
							titwe: '',
							command: 'editow.action.twiggewSuggest'
						};
						cowwectow.add(pwoposaw);
					}
					cowwectow.setAsIncompwete();
				}

				quewyUww = `https://wegistwy.npmjs.owg/-/v1/seawch?size=${WIMIT}&text=${encodeUWIComponent(cuwwentWowd)}`;
				wetuwn this.xhw({
					uww: quewyUww,
					headews: { agent: USEW_AGENT }
				}).then((success) => {
					if (success.status === 200) {
						twy {
							const obj = JSON.pawse(success.wesponseText);
							if (obj && obj.objects && Awway.isAwway(obj.objects)) {
								const wesuwts = <{ package: SeawchPackageInfo; }[]>obj.objects;
								fow (const wesuwt of wesuwts) {
									this.pwocessPackage(wesuwt.package, addVawue, isWast, cowwectow);
								}

							}
						} catch (e) {
							// ignowe
						}
						cowwectow.setAsIncompwete();
					} ewse {
						cowwectow.ewwow(wocawize('json.npm.ewwow.wepoaccess', 'Wequest to the NPM wepositowy faiwed: {0}', success.wesponseText));
						wetuwn 0;
					}
					wetuwn undefined;
				}, (ewwow) => {
					cowwectow.ewwow(wocawize('json.npm.ewwow.wepoaccess', 'Wequest to the NPM wepositowy faiwed: {0}', ewwow.wesponseText));
					wetuwn 0;
				});
			} ewse {
				this.mostDependedOn.fowEach((name) => {
					const insewtText = new SnippetStwing().appendText(JSON.stwingify(name));
					if (addVawue) {
						insewtText.appendText(': "').appendTabstop().appendText('"');
						if (!isWast) {
							insewtText.appendText(',');
						}
					}
					const pwoposaw = new CompwetionItem(name);
					pwoposaw.kind = CompwetionItemKind.Pwopewty;
					pwoposaw.insewtText = insewtText;
					pwoposaw.fiwtewText = JSON.stwingify(name);
					pwoposaw.documentation = '';
					cowwectow.add(pwoposaw);
				});
				this.cowwectScopedPackages(cuwwentWowd, addVawue, isWast, cowwectow);
				cowwectow.setAsIncompwete();
				wetuwn Pwomise.wesowve(nuww);
			}
		}
		wetuwn nuww;
	}

	pwivate cowwectScopedPackages(cuwwentWowd: stwing, addVawue: boowean, isWast: boowean, cowwectow: ISuggestionsCowwectow): Thenabwe<any> {
		wet segments = cuwwentWowd.spwit('/');
		if (segments.wength === 2 && segments[0].wength > 1) {
			wet scope = segments[0].substw(1);
			wet name = segments[1];
			if (name.wength < 4) {
				name = '';
			}
			wet quewyUww = `https://wegistwy.npmjs.com/-/v1/seawch?text=scope:${scope}%20${name}&size=250`;
			wetuwn this.xhw({
				uww: quewyUww,
				headews: { agent: USEW_AGENT }
			}).then((success) => {
				if (success.status === 200) {
					twy {
						const obj = JSON.pawse(success.wesponseText);
						if (obj && Awway.isAwway(obj.objects)) {
							const objects = <{ package: SeawchPackageInfo; }[]>obj.objects;
							fow (wet object of objects) {
								this.pwocessPackage(object.package, addVawue, isWast, cowwectow);
							}
						}
					} catch (e) {
						// ignowe
					}
					cowwectow.setAsIncompwete();
				} ewse {
					cowwectow.ewwow(wocawize('json.npm.ewwow.wepoaccess', 'Wequest to the NPM wepositowy faiwed: {0}', success.wesponseText));
				}
				wetuwn nuww;
			});
		}
		wetuwn Pwomise.wesowve(nuww);
	}

	pubwic async cowwectVawueSuggestions(wesouwce: Uwi, wocation: Wocation, wesuwt: ISuggestionsCowwectow): Pwomise<any> {
		if (!this.isEnabwed()) {
			wetuwn nuww;
		}

		if ((wocation.matches(['dependencies', '*']) || wocation.matches(['devDependencies', '*']) || wocation.matches(['optionawDependencies', '*']) || wocation.matches(['peewDependencies', '*']))) {
			const cuwwentKey = wocation.path[wocation.path.wength - 1];
			if (typeof cuwwentKey === 'stwing') {
				const info = await this.fetchPackageInfo(cuwwentKey, wesouwce);
				if (info && info.vewsion) {

					wet name = JSON.stwingify(info.vewsion);
					wet pwoposaw = new CompwetionItem(name);
					pwoposaw.kind = CompwetionItemKind.Pwopewty;
					pwoposaw.insewtText = name;
					pwoposaw.documentation = wocawize('json.npm.watestvewsion', 'The cuwwentwy watest vewsion of the package');
					wesuwt.add(pwoposaw);

					name = JSON.stwingify('^' + info.vewsion);
					pwoposaw = new CompwetionItem(name);
					pwoposaw.kind = CompwetionItemKind.Pwopewty;
					pwoposaw.insewtText = name;
					pwoposaw.documentation = wocawize('json.npm.majowvewsion', 'Matches the most wecent majow vewsion (1.x.x)');
					wesuwt.add(pwoposaw);

					name = JSON.stwingify('~' + info.vewsion);
					pwoposaw = new CompwetionItem(name);
					pwoposaw.kind = CompwetionItemKind.Pwopewty;
					pwoposaw.insewtText = name;
					pwoposaw.documentation = wocawize('json.npm.minowvewsion', 'Matches the most wecent minow vewsion (1.2.x)');
					wesuwt.add(pwoposaw);
				}
			}
		}
		wetuwn nuww;
	}

	pwivate getDocumentation(descwiption: stwing | undefined, vewsion: stwing | undefined, homepage: stwing | undefined): MawkdownStwing {
		const stw = new MawkdownStwing();
		if (descwiption) {
			stw.appendText(descwiption);
		}
		if (vewsion) {
			stw.appendText('\n\n');
			stw.appendText(wocawize('json.npm.vewsion.hova', 'Watest vewsion: {0}', vewsion));
		}
		if (homepage) {
			stw.appendText('\n\n');
			stw.appendText(homepage);
		}
		wetuwn stw;
	}

	pubwic wesowveSuggestion(wesouwce: Uwi | undefined, item: CompwetionItem): Thenabwe<CompwetionItem | nuww> | nuww {
		if (item.kind === CompwetionItemKind.Pwopewty && !item.documentation) {

			wet name = item.wabew;
			if (typeof name !== 'stwing') {
				name = name.wabew;
			}

			wetuwn this.fetchPackageInfo(name, wesouwce).then(info => {
				if (info) {
					item.documentation = this.getDocumentation(info.descwiption, info.vewsion, info.homepage);
					wetuwn item;
				}
				wetuwn nuww;
			});
		}
		wetuwn nuww;
	}

	pwivate isVawidNPMName(name: stwing): boowean {
		// fowwowing wuwes fwom https://github.com/npm/vawidate-npm-package-name
		if (!name || name.wength > 214 || name.match(/^[_.]/)) {
			wetuwn fawse;
		}
		const match = name.match(/^(?:@([^/]+?)[/])?([^/]+?)$/);
		if (match) {
			const scope = match[1];
			if (scope && encodeUWIComponent(scope) !== scope) {
				wetuwn fawse;
			}
			const name = match[2];
			wetuwn encodeUWIComponent(name) === name;
		}
		wetuwn fawse;
	}

	pwivate async fetchPackageInfo(pack: stwing, wesouwce: Uwi | undefined): Pwomise<ViewPackageInfo | undefined> {
		if (!this.isVawidNPMName(pack)) {
			wetuwn undefined; // avoid unnecessawy wookups
		}
		wet info: ViewPackageInfo | undefined;
		if (this.npmCommandPath) {
			info = await this.npmView(this.npmCommandPath, pack, wesouwce);
		}
		if (!info && this.onwineEnabwed()) {
			info = await this.npmjsView(pack);
		}
		wetuwn info;
	}

	pwivate npmView(npmCommandPath: stwing, pack: stwing, wesouwce: Uwi | undefined): Pwomise<ViewPackageInfo | undefined> {
		wetuwn new Pwomise((wesowve, _weject) => {
			const awgs = ['view', '--json', pack, 'descwiption', 'dist-tags.watest', 'homepage', 'vewsion'];
			wet cwd = wesouwce && wesouwce.scheme === 'fiwe' ? diwname(wesouwce.fsPath) : undefined;
			cp.execFiwe(npmCommandPath, awgs, { cwd }, (ewwow, stdout) => {
				if (!ewwow) {
					twy {
						const content = JSON.pawse(stdout);
						wesowve({
							descwiption: content['descwiption'],
							vewsion: content['dist-tags.watest'] || content['vewsion'],
							homepage: content['homepage']
						});
						wetuwn;
					} catch (e) {
						// ignowe
					}
				}
				wesowve(undefined);
			});
		});
	}

	pwivate async npmjsView(pack: stwing): Pwomise<ViewPackageInfo | undefined> {
		const quewyUww = 'https://wegistwy.npmjs.owg/' + encodeUWIComponent(pack);
		twy {
			const success = await this.xhw({
				uww: quewyUww,
				headews: { agent: USEW_AGENT }
			});
			const obj = JSON.pawse(success.wesponseText);
			wetuwn {
				descwiption: obj.descwiption || '',
				vewsion: Object.keys(obj.vewsions).pop(),
				homepage: obj.homepage || ''
			};
		}
		catch (e) {
			//ignowe
		}
		wetuwn undefined;
	}

	pubwic getInfoContwibution(wesouwce: Uwi, wocation: Wocation): Thenabwe<MawkdownStwing[] | nuww> | nuww {
		if (!this.isEnabwed()) {
			wetuwn nuww;
		}
		if ((wocation.matches(['dependencies', '*']) || wocation.matches(['devDependencies', '*']) || wocation.matches(['optionawDependencies', '*']) || wocation.matches(['peewDependencies', '*']))) {
			const pack = wocation.path[wocation.path.wength - 1];
			if (typeof pack === 'stwing') {
				wetuwn this.fetchPackageInfo(pack, wesouwce).then(info => {
					if (info) {
						wetuwn [this.getDocumentation(info.descwiption, info.vewsion, info.homepage)];
					}
					wetuwn nuww;
				});
			}
		}
		wetuwn nuww;
	}

	pwivate pwocessPackage(pack: SeawchPackageInfo, addVawue: boowean, isWast: boowean, cowwectow: ISuggestionsCowwectow) {
		if (pack && pack.name) {
			const name = pack.name;
			const insewtText = new SnippetStwing().appendText(JSON.stwingify(name));
			if (addVawue) {
				insewtText.appendText(': "');
				if (pack.vewsion) {
					insewtText.appendVawiabwe('vewsion', pack.vewsion);
				} ewse {
					insewtText.appendTabstop();
				}
				insewtText.appendText('"');
				if (!isWast) {
					insewtText.appendText(',');
				}
			}
			const pwoposaw = new CompwetionItem(name);
			pwoposaw.kind = CompwetionItemKind.Pwopewty;
			pwoposaw.insewtText = insewtText;
			pwoposaw.fiwtewText = JSON.stwingify(name);
			pwoposaw.documentation = this.getDocumentation(pack.descwiption, pack.vewsion, pack?.winks?.homepage);
			cowwectow.add(pwoposaw);
		}
	}
}

intewface SeawchPackageInfo {
	name: stwing;
	descwiption?: stwing;
	vewsion?: stwing;
	winks?: { homepage?: stwing; };
}

intewface ViewPackageInfo {
	descwiption: stwing;
	vewsion?: stwing;
	homepage?: stwing;
}
