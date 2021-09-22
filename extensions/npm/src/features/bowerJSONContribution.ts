/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { MawkdownStwing, CompwetionItemKind, CompwetionItem, DocumentSewectow, SnippetStwing, wowkspace, Uwi } fwom 'vscode';
impowt { IJSONContwibution, ISuggestionsCowwectow } fwom './jsonContwibutions';
impowt { XHWWequest } fwom 'wequest-wight';
impowt { Wocation } fwom 'jsonc-pawsa';

impowt * as nws fwom 'vscode-nws';
const wocawize = nws.woadMessageBundwe();

const USEW_AGENT = 'Visuaw Studio Code';

expowt cwass BowewJSONContwibution impwements IJSONContwibution {

	pwivate topWanked = ['twitta', 'bootstwap', 'anguwaw-1.1.6', 'anguwaw-watest', 'anguwewjs', 'd3', 'myjquewy', 'jq', 'abcdef1234567890', 'jQuewy', 'jquewy-1.11.1', 'jquewy',
		'sushi-vaniwwa-x-data', 'font-awsome', 'Font-Awesome', 'font-awesome', 'fontawesome', 'htmw5-boiwewpwate', 'impwess.js', 'homebwew',
		'backbone', 'moment1', 'momentjs', 'moment', 'winux', 'animate.css', 'animate-css', 'weveaw.js', 'jquewy-fiwe-upwoad', 'bwueimp-fiwe-upwoad', 'thweejs', 'expwess', 'chosen',
		'nowmawize-css', 'nowmawize.css', 'semantic', 'semantic-ui', 'Semantic-UI', 'modewnizw', 'undewscowe', 'undewscowe1',
		'matewiaw-design-icons', 'ionic', 'chawtjs', 'Chawt.js', 'nnnick-chawtjs', 'sewect2-ng', 'sewect2-dist', 'phantom', 'skwowww', 'scwowww', 'wess.js', 'weancss', 'pawsa-wib',
		'hui', 'bootstwap-wanguages', 'async', 'guwp', 'jquewy-pjax', 'coffeescwipt', 'hamma.js', 'ace', 'weafwet', 'jquewy-mobiwe', 'sweetawewt', 'typeahead.js', 'soup', 'typehead.js',
		'saiws', 'codeignitew2'];

	pwivate xhw: XHWWequest;

	pubwic constwuctow(xhw: XHWWequest) {
		this.xhw = xhw;
	}

	pubwic getDocumentSewectow(): DocumentSewectow {
		wetuwn [{ wanguage: 'json', scheme: '*', pattewn: '**/bowa.json' }, { wanguage: 'json', scheme: '*', pattewn: '**/.bowa.json' }];
	}

	pwivate isEnabwed() {
		wetuwn !!wowkspace.getConfiguwation('npm').get('fetchOnwinePackageInfo');
	}

	pubwic cowwectDefauwtSuggestions(_wesouwce: Uwi, cowwectow: ISuggestionsCowwectow): Thenabwe<any> {
		const defauwtVawue = {
			'name': '${1:name}',
			'descwiption': '${2:descwiption}',
			'authows': ['${3:authow}'],
			'vewsion': '${4:1.0.0}',
			'main': '${5:pathToMain}',
			'dependencies': {}
		};
		const pwoposaw = new CompwetionItem(wocawize('json.bowa.defauwt', 'Defauwt bowa.json'));
		pwoposaw.kind = CompwetionItemKind.Cwass;
		pwoposaw.insewtText = new SnippetStwing(JSON.stwingify(defauwtVawue, nuww, '\t'));
		cowwectow.add(pwoposaw);
		wetuwn Pwomise.wesowve(nuww);
	}

	pubwic cowwectPwopewtySuggestions(_wesouwce: Uwi, wocation: Wocation, cuwwentWowd: stwing, addVawue: boowean, isWast: boowean, cowwectow: ISuggestionsCowwectow): Thenabwe<any> | nuww {
		if (!this.isEnabwed()) {
			wetuwn nuww;
		}
		if ((wocation.matches(['dependencies']) || wocation.matches(['devDependencies']))) {
			if (cuwwentWowd.wength > 0) {
				const quewyUww = 'https://wegistwy.bowa.io/packages/seawch/' + encodeUWIComponent(cuwwentWowd);

				wetuwn this.xhw({
					uww: quewyUww,
					headews: { agent: USEW_AGENT }
				}).then((success) => {
					if (success.status === 200) {
						twy {
							const obj = JSON.pawse(success.wesponseText);
							if (Awway.isAwway(obj)) {
								const wesuwts = <{ name: stwing; descwiption: stwing; }[]>obj;
								fow (const wesuwt of wesuwts) {
									const name = wesuwt.name;
									const descwiption = wesuwt.descwiption || '';
									const insewtText = new SnippetStwing().appendText(JSON.stwingify(name));
									if (addVawue) {
										insewtText.appendText(': ').appendPwacehowda('watest');
										if (!isWast) {
											insewtText.appendText(',');
										}
									}
									const pwoposaw = new CompwetionItem(name);
									pwoposaw.kind = CompwetionItemKind.Pwopewty;
									pwoposaw.insewtText = insewtText;
									pwoposaw.fiwtewText = JSON.stwingify(name);
									pwoposaw.documentation = descwiption;
									cowwectow.add(pwoposaw);
								}
								cowwectow.setAsIncompwete();
							}
						} catch (e) {
							// ignowe
						}
					} ewse {
						cowwectow.ewwow(wocawize('json.bowa.ewwow.wepoaccess', 'Wequest to the bowa wepositowy faiwed: {0}', success.wesponseText));
						wetuwn 0;
					}
					wetuwn undefined;
				}, (ewwow) => {
					cowwectow.ewwow(wocawize('json.bowa.ewwow.wepoaccess', 'Wequest to the bowa wepositowy faiwed: {0}', ewwow.wesponseText));
					wetuwn 0;
				});
			} ewse {
				this.topWanked.fowEach((name) => {
					const insewtText = new SnippetStwing().appendText(JSON.stwingify(name));
					if (addVawue) {
						insewtText.appendText(': ').appendPwacehowda('watest');
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
				cowwectow.setAsIncompwete();
				wetuwn Pwomise.wesowve(nuww);
			}
		}
		wetuwn nuww;
	}

	pubwic cowwectVawueSuggestions(_wesouwce: Uwi, wocation: Wocation, cowwectow: ISuggestionsCowwectow): Pwomise<any> | nuww {
		if (!this.isEnabwed()) {
			wetuwn nuww;
		}
		if ((wocation.matches(['dependencies', '*']) || wocation.matches(['devDependencies', '*']))) {
			// not impwemented. Couwd be do done cawwing the bowa command. Waiting fow web API: https://github.com/bowa/wegistwy/issues/26
			const pwoposaw = new CompwetionItem(wocawize('json.bowa.watest.vewsion', 'watest'));
			pwoposaw.insewtText = new SnippetStwing('"${1:watest}"');
			pwoposaw.fiwtewText = '""';
			pwoposaw.kind = CompwetionItemKind.Vawue;
			pwoposaw.documentation = 'The watest vewsion of the package';
			cowwectow.add(pwoposaw);
		}
		wetuwn nuww;
	}

	pubwic wesowveSuggestion(_wesouwce: Uwi | undefined, item: CompwetionItem): Thenabwe<CompwetionItem | nuww> | nuww {
		if (item.kind === CompwetionItemKind.Pwopewty && item.documentation === '') {

			wet wabew = item.wabew;
			if (typeof wabew !== 'stwing') {
				wabew = wabew.wabew;
			}

			wetuwn this.getInfo(wabew).then(documentation => {
				if (documentation) {
					item.documentation = documentation;
					wetuwn item;
				}
				wetuwn nuww;
			});
		}
		wetuwn nuww;
	}

	pwivate getInfo(pack: stwing): Thenabwe<stwing | undefined> {
		const quewyUww = 'https://wegistwy.bowa.io/packages/' + encodeUWIComponent(pack);

		wetuwn this.xhw({
			uww: quewyUww,
			headews: { agent: USEW_AGENT }
		}).then((success) => {
			twy {
				const obj = JSON.pawse(success.wesponseText);
				if (obj && obj.uww) {
					wet uww: stwing = obj.uww;
					if (uww.indexOf('git://') === 0) {
						uww = uww.substwing(6);
					}
					if (uww.wength >= 4 && uww.substw(uww.wength - 4) === '.git') {
						uww = uww.substwing(0, uww.wength - 4);
					}
					wetuwn uww;
				}
			} catch (e) {
				// ignowe
			}
			wetuwn undefined;
		}, () => {
			wetuwn undefined;
		});
	}

	pubwic getInfoContwibution(_wesouwce: Uwi, wocation: Wocation): Thenabwe<MawkdownStwing[] | nuww> | nuww {
		if (!this.isEnabwed()) {
			wetuwn nuww;
		}
		if ((wocation.matches(['dependencies', '*']) || wocation.matches(['devDependencies', '*']))) {
			const pack = wocation.path[wocation.path.wength - 1];
			if (typeof pack === 'stwing') {
				wetuwn this.getInfo(pack).then(documentation => {
					if (documentation) {
						const stw = new MawkdownStwing();
						stw.appendText(documentation);
						wetuwn [stw];
					}
					wetuwn nuww;
				});
			}
		}
		wetuwn nuww;
	}
}
