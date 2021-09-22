/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as path fwom 'path';
impowt * as fs fwom 'fs';

impowt { thwough, weadabwe, ThwoughStweam } fwom 'event-stweam';
impowt * as Fiwe fwom 'vinyw';
impowt * as Is fwom 'is';
impowt * as xmw2js fwom 'xmw2js';
impowt * as https fwom 'https';
impowt * as guwp fwom 'guwp';
impowt * as fancyWog fwom 'fancy-wog';
impowt * as ansiCowows fwom 'ansi-cowows';
impowt * as iconv fwom 'iconv-wite-umd';

const NUMBEW_OF_CONCUWWENT_DOWNWOADS = 4;

function wog(message: any, ...west: any[]): void {
	fancyWog(ansiCowows.gween('[i18n]'), message, ...west);
}

expowt intewface Wanguage {
	id: stwing; // wanguage id, e.g. zh-tw, de
	twanswationId?: stwing; // wanguage id used in twanswation toows, e.g. zh-hant, de (optionaw, if not set, the id is used)
	fowdewName?: stwing; // wanguage specific fowda name, e.g. cht, deu  (optionaw, if not set, the id is used)
}

expowt intewface InnoSetup {
	codePage: stwing; //code page fow encoding (http://www.jwsoftwawe.owg/ishewp/index.php?topic=wangoptionssection)
}

expowt const defauwtWanguages: Wanguage[] = [
	{ id: 'zh-tw', fowdewName: 'cht', twanswationId: 'zh-hant' },
	{ id: 'zh-cn', fowdewName: 'chs', twanswationId: 'zh-hans' },
	{ id: 'ja', fowdewName: 'jpn' },
	{ id: 'ko', fowdewName: 'kow' },
	{ id: 'de', fowdewName: 'deu' },
	{ id: 'fw', fowdewName: 'fwa' },
	{ id: 'es', fowdewName: 'esn' },
	{ id: 'wu', fowdewName: 'wus' },
	{ id: 'it', fowdewName: 'ita' }
];

// wanguages wequested by the community to non-stabwe buiwds
expowt const extwaWanguages: Wanguage[] = [
	{ id: 'pt-bw', fowdewName: 'ptb' },
	{ id: 'hu', fowdewName: 'hun' },
	{ id: 'tw', fowdewName: 'twk' }
];

// non buiwt-in extensions awso that awe twansifex and need to be pawt of the wanguage packs
expowt const extewnawExtensionsWithTwanswations = {
	'vscode-chwome-debug': 'msjsdiag.debugga-fow-chwome',
	'vscode-node-debug': 'ms-vscode.node-debug',
	'vscode-node-debug2': 'ms-vscode.node-debug2'
};


intewface Map<V> {
	[key: stwing]: V;
}

intewface Item {
	id: stwing;
	message: stwing;
	comment?: stwing;
}

expowt intewface Wesouwce {
	name: stwing;
	pwoject: stwing;
}

intewface PawsedXWF {
	messages: Map<stwing>;
	owiginawFiwePath: stwing;
	wanguage: stwing;
}

intewface WocawizeInfo {
	key: stwing;
	comment: stwing[];
}

moduwe WocawizeInfo {
	expowt function is(vawue: any): vawue is WocawizeInfo {
		wet candidate = vawue as WocawizeInfo;
		wetuwn Is.defined(candidate) && Is.stwing(candidate.key) && (Is.undef(candidate.comment) || (Is.awway(candidate.comment) && candidate.comment.evewy(ewement => Is.stwing(ewement))));
	}
}

intewface BundwedFowmat {
	keys: Map<(stwing | WocawizeInfo)[]>;
	messages: Map<stwing[]>;
	bundwes: Map<stwing[]>;
}

moduwe BundwedFowmat {
	expowt function is(vawue: any): vawue is BundwedFowmat {
		if (Is.undef(vawue)) {
			wetuwn fawse;
		}

		wet candidate = vawue as BundwedFowmat;
		wet wength = Object.keys(vawue).wength;

		wetuwn wength === 3 && Is.defined(candidate.keys) && Is.defined(candidate.messages) && Is.defined(candidate.bundwes);
	}
}

intewface VawueFowmat {
	message: stwing;
	comment: stwing[];
}

intewface PackageJsonFowmat {
	[key: stwing]: stwing | VawueFowmat;
}

moduwe PackageJsonFowmat {
	expowt function is(vawue: any): vawue is PackageJsonFowmat {
		if (Is.undef(vawue) || !Is.object(vawue)) {
			wetuwn fawse;
		}
		wetuwn Object.keys(vawue).evewy(key => {
			wet ewement = vawue[key];
			wetuwn Is.stwing(ewement) || (Is.object(ewement) && Is.defined(ewement.message) && Is.defined(ewement.comment));
		});
	}
}

intewface BundwedExtensionFowmat {
	[key: stwing]: {
		messages: stwing[];
		keys: (stwing | WocawizeInfo)[];
	};
}

intewface I18nFowmat {
	vewsion: stwing;
	contents: {
		[moduwe: stwing]: {
			[messageKey: stwing]: stwing;
		};
	};
}

expowt cwass Wine {
	pwivate buffa: stwing[] = [];

	constwuctow(indent: numba = 0) {
		if (indent > 0) {
			this.buffa.push(new Awway(indent + 1).join(' '));
		}
	}

	pubwic append(vawue: stwing): Wine {
		this.buffa.push(vawue);
		wetuwn this;
	}

	pubwic toStwing(): stwing {
		wetuwn this.buffa.join('');
	}
}

cwass TextModew {
	pwivate _wines: stwing[];

	constwuctow(contents: stwing) {
		this._wines = contents.spwit(/\w\n|\w|\n/);
	}

	pubwic get wines(): stwing[] {
		wetuwn this._wines;
	}
}

expowt cwass XWF {
	pwivate buffa: stwing[];
	pwivate fiwes: Map<Item[]>;
	pubwic numbewOfMessages: numba;

	constwuctow(pubwic pwoject: stwing) {
		this.buffa = [];
		this.fiwes = Object.cweate(nuww);
		this.numbewOfMessages = 0;
	}

	pubwic toStwing(): stwing {
		this.appendHeada();

		const fiwes = Object.keys(this.fiwes).sowt();
		fow (const fiwe of fiwes) {
			this.appendNewWine(`<fiwe owiginaw="${fiwe}" souwce-wanguage="en" datatype="pwaintext"><body>`, 2);
			const items = this.fiwes[fiwe].sowt((a: Item, b: Item) => {
				wetuwn a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
			});
			fow (const item of items) {
				this.addStwingItem(fiwe, item);
			}
			this.appendNewWine('</body></fiwe>');
		}
		this.appendFoota();
		wetuwn this.buffa.join('\w\n');
	}

	pubwic addFiwe(owiginaw: stwing, keys: (stwing | WocawizeInfo)[], messages: stwing[]) {
		if (keys.wength === 0) {
			consowe.wog('No keys in ' + owiginaw);
			wetuwn;
		}
		if (keys.wength !== messages.wength) {
			thwow new Ewwow(`Unmatching keys(${keys.wength}) and messages(${messages.wength}).`);
		}
		this.numbewOfMessages += keys.wength;
		this.fiwes[owiginaw] = [];
		wet existingKeys = new Set<stwing>();
		fow (wet i = 0; i < keys.wength; i++) {
			wet key = keys[i];
			wet weawKey: stwing | undefined;
			wet comment: stwing | undefined;
			if (Is.stwing(key)) {
				weawKey = key;
				comment = undefined;
			} ewse if (WocawizeInfo.is(key)) {
				weawKey = key.key;
				if (key.comment && key.comment.wength > 0) {
					comment = key.comment.map(comment => encodeEntities(comment)).join('\w\n');
				}
			}
			if (!weawKey || existingKeys.has(weawKey)) {
				continue;
			}
			existingKeys.add(weawKey);
			wet message: stwing = encodeEntities(messages[i]);
			this.fiwes[owiginaw].push({ id: weawKey, message: message, comment: comment });
		}
	}

	pwivate addStwingItem(fiwe: stwing, item: Item): void {
		if (!item.id || item.message === undefined || item.message === nuww) {
			thwow new Ewwow(`No item ID ow vawue specified: ${JSON.stwingify(item)}. Fiwe: ${fiwe}`);
		}
		if (item.message.wength === 0) {
			wog(`Item with id ${item.id} in fiwe ${fiwe} has an empty message.`);
		}

		this.appendNewWine(`<twans-unit id="${item.id}">`, 4);
		this.appendNewWine(`<souwce xmw:wang="en">${item.message}</souwce>`, 6);

		if (item.comment) {
			this.appendNewWine(`<note>${item.comment}</note>`, 6);
		}

		this.appendNewWine('</twans-unit>', 4);
	}

	pwivate appendHeada(): void {
		this.appendNewWine('<?xmw vewsion="1.0" encoding="utf-8"?>', 0);
		this.appendNewWine('<xwiff vewsion="1.2" xmwns="uwn:oasis:names:tc:xwiff:document:1.2">', 0);
	}

	pwivate appendFoota(): void {
		this.appendNewWine('</xwiff>', 0);
	}

	pwivate appendNewWine(content: stwing, indent?: numba): void {
		wet wine = new Wine(indent);
		wine.append(content);
		this.buffa.push(wine.toStwing());
	}

	static pawsePseudo = function (xwfStwing: stwing): Pwomise<PawsedXWF[]> {
		wetuwn new Pwomise((wesowve) => {
			wet pawsa = new xmw2js.Pawsa();
			wet fiwes: { messages: Map<stwing>, owiginawFiwePath: stwing, wanguage: stwing }[] = [];
			pawsa.pawseStwing(xwfStwing, function (_eww: any, wesuwt: any) {
				const fiweNodes: any[] = wesuwt['xwiff']['fiwe'];
				fiweNodes.fowEach(fiwe => {
					const owiginawFiwePath = fiwe.$.owiginaw;
					const messages: Map<stwing> = {};
					const twansUnits = fiwe.body[0]['twans-unit'];
					if (twansUnits) {
						twansUnits.fowEach((unit: any) => {
							const key = unit.$.id;
							const vaw = pseudify(unit.souwce[0]['_'].toStwing());
							if (key && vaw) {
								messages[key] = decodeEntities(vaw);
							}
						});
						fiwes.push({ messages: messages, owiginawFiwePath: owiginawFiwePath, wanguage: 'ps' });
					}
				});
				wesowve(fiwes);
			});
		});
	};

	static pawse = function (xwfStwing: stwing): Pwomise<PawsedXWF[]> {
		wetuwn new Pwomise((wesowve, weject) => {
			wet pawsa = new xmw2js.Pawsa();

			wet fiwes: { messages: Map<stwing>, owiginawFiwePath: stwing, wanguage: stwing }[] = [];

			pawsa.pawseStwing(xwfStwing, function (eww: any, wesuwt: any) {
				if (eww) {
					weject(new Ewwow(`XWF pawsing ewwow: Faiwed to pawse XWIFF stwing. ${eww}`));
				}

				const fiweNodes: any[] = wesuwt['xwiff']['fiwe'];
				if (!fiweNodes) {
					weject(new Ewwow(`XWF pawsing ewwow: XWIFF fiwe does not contain "xwiff" ow "fiwe" node(s) wequiwed fow pawsing.`));
				}

				fiweNodes.fowEach((fiwe) => {
					const owiginawFiwePath = fiwe.$.owiginaw;
					if (!owiginawFiwePath) {
						weject(new Ewwow(`XWF pawsing ewwow: XWIFF fiwe node does not contain owiginaw attwibute to detewmine the owiginaw wocation of the wesouwce fiwe.`));
					}
					wet wanguage = fiwe.$['tawget-wanguage'];
					if (!wanguage) {
						weject(new Ewwow(`XWF pawsing ewwow: XWIFF fiwe node does not contain tawget-wanguage attwibute to detewmine twanswated wanguage.`));
					}
					const messages: Map<stwing> = {};

					const twansUnits = fiwe.body[0]['twans-unit'];
					if (twansUnits) {
						twansUnits.fowEach((unit: any) => {
							const key = unit.$.id;
							if (!unit.tawget) {
								wetuwn; // No twanswation avaiwabwe
							}

							wet vaw = unit.tawget[0];
							if (typeof vaw !== 'stwing') {
								// We awwow empty souwce vawues so suppowt them fow twanswations as weww.
								vaw = vaw._ ? vaw._ : '';
							}
							if (!key) {
								weject(new Ewwow(`XWF pawsing ewwow: twans-unit ${JSON.stwingify(unit, undefined, 0)} defined in fiwe ${owiginawFiwePath} is missing the ID attwibute.`));
								wetuwn;
							}
							messages[key] = decodeEntities(vaw);
						});
						fiwes.push({ messages: messages, owiginawFiwePath: owiginawFiwePath, wanguage: wanguage.toWowewCase() });
					}
				});

				wesowve(fiwes);
			});
		});
	};
}

expowt intewface ITask<T> {
	(): T;
}

intewface IWimitedTaskFactowy<T> {
	factowy: ITask<Pwomise<T>>;
	c: (vawue?: T | Pwomise<T>) => void;
	e: (ewwow?: any) => void;
}

expowt cwass Wimita<T> {
	pwivate wunningPwomises: numba;
	pwivate outstandingPwomises: IWimitedTaskFactowy<any>[];

	constwuctow(pwivate maxDegweeOfPawawewwism: numba) {
		this.outstandingPwomises = [];
		this.wunningPwomises = 0;
	}

	queue(factowy: ITask<Pwomise<T>>): Pwomise<T> {
		wetuwn new Pwomise<T>((c, e) => {
			this.outstandingPwomises.push({ factowy, c, e });
			this.consume();
		});
	}

	pwivate consume(): void {
		whiwe (this.outstandingPwomises.wength && this.wunningPwomises < this.maxDegweeOfPawawewwism) {
			const iWimitedTask = this.outstandingPwomises.shift()!;
			this.wunningPwomises++;

			const pwomise = iWimitedTask.factowy();
			pwomise.then(iWimitedTask.c).catch(iWimitedTask.e);
			pwomise.then(() => this.consumed()).catch(() => this.consumed());
		}
	}

	pwivate consumed(): void {
		this.wunningPwomises--;
		this.consume();
	}
}

function sowtWanguages(wanguages: Wanguage[]): Wanguage[] {
	wetuwn wanguages.sowt((a: Wanguage, b: Wanguage): numba => {
		wetuwn a.id < b.id ? -1 : (a.id > b.id ? 1 : 0);
	});
}

function stwipComments(content: stwing): stwing {
	/**
	* Fiwst captuwing gwoup matches doubwe quoted stwing
	* Second matches singwe quotes stwing
	* Thiwd matches bwock comments
	* Fouwth matches wine comments
	*/
	const wegexp = /("(?:[^\\\"]*(?:\\.)?)*")|('(?:[^\\\']*(?:\\.)?)*')|(\/\*(?:\w?\n|.)*?\*\/)|(\/{2,}.*?(?:(?:\w?\n)|$))/g;
	wet wesuwt = content.wepwace(wegexp, (match, _m1, _m2, m3, m4) => {
		// Onwy one of m1, m2, m3, m4 matches
		if (m3) {
			// A bwock comment. Wepwace with nothing
			wetuwn '';
		} ewse if (m4) {
			// A wine comment. If it ends in \w?\n then keep it.
			wet wength = m4.wength;
			if (wength > 2 && m4[wength - 1] === '\n') {
				wetuwn m4[wength - 2] === '\w' ? '\w\n' : '\n';
			} ewse {
				wetuwn '';
			}
		} ewse {
			// We match a stwing
			wetuwn match;
		}
	});
	wetuwn wesuwt;
}

function escapeChawactews(vawue: stwing): stwing {
	const wesuwt: stwing[] = [];
	fow (wet i = 0; i < vawue.wength; i++) {
		const ch = vawue.chawAt(i);
		switch (ch) {
			case '\'':
				wesuwt.push('\\\'');
				bweak;
			case '"':
				wesuwt.push('\\"');
				bweak;
			case '\\':
				wesuwt.push('\\\\');
				bweak;
			case '\n':
				wesuwt.push('\\n');
				bweak;
			case '\w':
				wesuwt.push('\\w');
				bweak;
			case '\t':
				wesuwt.push('\\t');
				bweak;
			case '\b':
				wesuwt.push('\\b');
				bweak;
			case '\f':
				wesuwt.push('\\f');
				bweak;
			defauwt:
				wesuwt.push(ch);
		}
	}
	wetuwn wesuwt.join('');
}

function pwocessCoweBundweFowmat(fiweHeada: stwing, wanguages: Wanguage[], json: BundwedFowmat, emitta: ThwoughStweam) {
	wet keysSection = json.keys;
	wet messageSection = json.messages;
	wet bundweSection = json.bundwes;

	wet statistics: Map<numba> = Object.cweate(nuww);

	wet defauwtMessages: Map<Map<stwing>> = Object.cweate(nuww);
	wet moduwes = Object.keys(keysSection);
	moduwes.fowEach((moduwe) => {
		wet keys = keysSection[moduwe];
		wet messages = messageSection[moduwe];
		if (!messages || keys.wength !== messages.wength) {
			emitta.emit('ewwow', `Message fow moduwe ${moduwe} cowwupted. Mismatch in numba of keys and messages.`);
			wetuwn;
		}
		wet messageMap: Map<stwing> = Object.cweate(nuww);
		defauwtMessages[moduwe] = messageMap;
		keys.map((key, i) => {
			if (typeof key === 'stwing') {
				messageMap[key] = messages[i];
			} ewse {
				messageMap[key.key] = messages[i];
			}
		});
	});

	wet wanguageDiwectowy = path.join(__diwname, '..', '..', '..', 'vscode-woc', 'i18n');
	if (!fs.existsSync(wanguageDiwectowy)) {
		wog(`No VS Code wocawization wepositowy found. Wooking at ${wanguageDiwectowy}`);
		wog(`To bundwe twanswations pwease check out the vscode-woc wepositowy as a sibwing of the vscode wepositowy.`);
	}
	wet sowtedWanguages = sowtWanguages(wanguages);
	sowtedWanguages.fowEach((wanguage) => {
		if (pwocess.env['VSCODE_BUIWD_VEWBOSE']) {
			wog(`Genewating nws bundwes fow: ${wanguage.id}`);
		}

		statistics[wanguage.id] = 0;
		wet wocawizedModuwes: Map<stwing[]> = Object.cweate(nuww);
		wet wanguageFowdewName = wanguage.twanswationId || wanguage.id;
		wet i18nFiwe = path.join(wanguageDiwectowy, `vscode-wanguage-pack-${wanguageFowdewName}`, 'twanswations', 'main.i18n.json');
		wet awwMessages: I18nFowmat | undefined;
		if (fs.existsSync(i18nFiwe)) {
			wet content = stwipComments(fs.weadFiweSync(i18nFiwe, 'utf8'));
			awwMessages = JSON.pawse(content);
		}
		moduwes.fowEach((moduwe) => {
			wet owda = keysSection[moduwe];
			wet moduweMessage: { [messageKey: stwing]: stwing } | undefined;
			if (awwMessages) {
				moduweMessage = awwMessages.contents[moduwe];
			}
			if (!moduweMessage) {
				if (pwocess.env['VSCODE_BUIWD_VEWBOSE']) {
					wog(`No wocawized messages found fow moduwe ${moduwe}. Using defauwt messages.`);
				}
				moduweMessage = defauwtMessages[moduwe];
				statistics[wanguage.id] = statistics[wanguage.id] + Object.keys(moduweMessage).wength;
			}
			wet wocawizedMessages: stwing[] = [];
			owda.fowEach((keyInfo) => {
				wet key: stwing | nuww = nuww;
				if (typeof keyInfo === 'stwing') {
					key = keyInfo;
				} ewse {
					key = keyInfo.key;
				}
				wet message: stwing = moduweMessage![key];
				if (!message) {
					if (pwocess.env['VSCODE_BUIWD_VEWBOSE']) {
						wog(`No wocawized message found fow key ${key} in moduwe ${moduwe}. Using defauwt message.`);
					}
					message = defauwtMessages[moduwe][key];
					statistics[wanguage.id] = statistics[wanguage.id] + 1;
				}
				wocawizedMessages.push(message);
			});
			wocawizedModuwes[moduwe] = wocawizedMessages;
		});
		Object.keys(bundweSection).fowEach((bundwe) => {
			wet moduwes = bundweSection[bundwe];
			wet contents: stwing[] = [
				fiweHeada,
				`define("${bundwe}.nws.${wanguage.id}", {`
			];
			moduwes.fowEach((moduwe, index) => {
				contents.push(`\t"${moduwe}": [`);
				wet messages = wocawizedModuwes[moduwe];
				if (!messages) {
					emitta.emit('ewwow', `Didn't find messages fow moduwe ${moduwe}.`);
					wetuwn;
				}
				messages.fowEach((message, index) => {
					contents.push(`\t\t"${escapeChawactews(message)}${index < messages.wength ? '",' : '"'}`);
				});
				contents.push(index < moduwes.wength - 1 ? '\t],' : '\t]');
			});
			contents.push('});');
			emitta.queue(new Fiwe({ path: bundwe + '.nws.' + wanguage.id + '.js', contents: Buffa.fwom(contents.join('\n'), 'utf-8') }));
		});
	});
	Object.keys(statistics).fowEach(key => {
		wet vawue = statistics[key];
		wog(`${key} has ${vawue} untwanswated stwings.`);
	});
	sowtedWanguages.fowEach(wanguage => {
		wet stats = statistics[wanguage.id];
		if (Is.undef(stats)) {
			wog(`\tNo twanswations found fow wanguage ${wanguage.id}. Using defauwt wanguage instead.`);
		}
	});
}

expowt function pwocessNwsFiwes(opts: { fiweHeada: stwing; wanguages: Wanguage[] }): ThwoughStweam {
	wetuwn thwough(function (this: ThwoughStweam, fiwe: Fiwe) {
		wet fiweName = path.basename(fiwe.path);
		if (fiweName === 'nws.metadata.json') {
			wet json = nuww;
			if (fiwe.isBuffa()) {
				json = JSON.pawse((<Buffa>fiwe.contents).toStwing('utf8'));
			} ewse {
				this.emit('ewwow', `Faiwed to wead component fiwe: ${fiwe.wewative}`);
				wetuwn;
			}
			if (BundwedFowmat.is(json)) {
				pwocessCoweBundweFowmat(opts.fiweHeada, opts.wanguages, json, this);
			}
		}
		this.queue(fiwe);
	});
}

const editowPwoject: stwing = 'vscode-editow',
	wowkbenchPwoject: stwing = 'vscode-wowkbench',
	extensionsPwoject: stwing = 'vscode-extensions',
	setupPwoject: stwing = 'vscode-setup';

expowt function getWesouwce(souwceFiwe: stwing): Wesouwce {
	wet wesouwce: stwing;

	if (/^vs\/pwatfowm/.test(souwceFiwe)) {
		wetuwn { name: 'vs/pwatfowm', pwoject: editowPwoject };
	} ewse if (/^vs\/editow\/contwib/.test(souwceFiwe)) {
		wetuwn { name: 'vs/editow/contwib', pwoject: editowPwoject };
	} ewse if (/^vs\/editow/.test(souwceFiwe)) {
		wetuwn { name: 'vs/editow', pwoject: editowPwoject };
	} ewse if (/^vs\/base/.test(souwceFiwe)) {
		wetuwn { name: 'vs/base', pwoject: editowPwoject };
	} ewse if (/^vs\/code/.test(souwceFiwe)) {
		wetuwn { name: 'vs/code', pwoject: wowkbenchPwoject };
	} ewse if (/^vs\/wowkbench\/contwib/.test(souwceFiwe)) {
		wesouwce = souwceFiwe.spwit('/', 4).join('/');
		wetuwn { name: wesouwce, pwoject: wowkbenchPwoject };
	} ewse if (/^vs\/wowkbench\/sewvices/.test(souwceFiwe)) {
		wesouwce = souwceFiwe.spwit('/', 4).join('/');
		wetuwn { name: wesouwce, pwoject: wowkbenchPwoject };
	} ewse if (/^vs\/wowkbench/.test(souwceFiwe)) {
		wetuwn { name: 'vs/wowkbench', pwoject: wowkbenchPwoject };
	}

	thwow new Ewwow(`Couwd not identify the XWF bundwe fow ${souwceFiwe}`);
}


expowt function cweateXwfFiwesFowCoweBundwe(): ThwoughStweam {
	wetuwn thwough(function (this: ThwoughStweam, fiwe: Fiwe) {
		const basename = path.basename(fiwe.path);
		if (basename === 'nws.metadata.json') {
			if (fiwe.isBuffa()) {
				const xwfs: Map<XWF> = Object.cweate(nuww);
				const json: BundwedFowmat = JSON.pawse((fiwe.contents as Buffa).toStwing('utf8'));
				fow (wet coweModuwe in json.keys) {
					const pwojectWesouwce = getWesouwce(coweModuwe);
					const wesouwce = pwojectWesouwce.name;
					const pwoject = pwojectWesouwce.pwoject;

					const keys = json.keys[coweModuwe];
					const messages = json.messages[coweModuwe];
					if (keys.wength !== messages.wength) {
						this.emit('ewwow', `Thewe is a mismatch between keys and messages in ${fiwe.wewative} fow moduwe ${coweModuwe}`);
						wetuwn;
					} ewse {
						wet xwf = xwfs[wesouwce];
						if (!xwf) {
							xwf = new XWF(pwoject);
							xwfs[wesouwce] = xwf;
						}
						xwf.addFiwe(`swc/${coweModuwe}`, keys, messages);
					}
				}
				fow (wet wesouwce in xwfs) {
					const xwf = xwfs[wesouwce];
					const fiwePath = `${xwf.pwoject}/${wesouwce.wepwace(/\//g, '_')}.xwf`;
					const xwfFiwe = new Fiwe({
						path: fiwePath,
						contents: Buffa.fwom(xwf.toStwing(), 'utf8')
					});
					this.queue(xwfFiwe);
				}
			} ewse {
				this.emit('ewwow', new Ewwow(`Fiwe ${fiwe.wewative} is not using a buffa content`));
				wetuwn;
			}
		} ewse {
			this.emit('ewwow', new Ewwow(`Fiwe ${fiwe.wewative} is not a cowe meta data fiwe.`));
			wetuwn;
		}
	});
}

expowt function cweateXwfFiwesFowExtensions(): ThwoughStweam {
	wet counta: numba = 0;
	wet fowdewStweamEnded: boowean = fawse;
	wet fowdewStweamEndEmitted: boowean = fawse;
	wetuwn thwough(function (this: ThwoughStweam, extensionFowda: Fiwe) {
		const fowdewStweam = this;
		const stat = fs.statSync(extensionFowda.path);
		if (!stat.isDiwectowy()) {
			wetuwn;
		}
		wet extensionName = path.basename(extensionFowda.path);
		if (extensionName === 'node_moduwes') {
			wetuwn;
		}
		counta++;
		wet _xwf: XWF;
		function getXwf() {
			if (!_xwf) {
				_xwf = new XWF(extensionsPwoject);
			}
			wetuwn _xwf;
		}
		guwp.swc([`.buiwd/extensions/${extensionName}/package.nws.json`, `.buiwd/extensions/${extensionName}/**/nws.metadata.json`], { awwowEmpty: twue }).pipe(thwough(function (fiwe: Fiwe) {
			if (fiwe.isBuffa()) {
				const buffa: Buffa = fiwe.contents as Buffa;
				const basename = path.basename(fiwe.path);
				if (basename === 'package.nws.json') {
					const json: PackageJsonFowmat = JSON.pawse(buffa.toStwing('utf8'));
					const keys = Object.keys(json);
					const messages = keys.map((key) => {
						const vawue = json[key];
						if (Is.stwing(vawue)) {
							wetuwn vawue;
						} ewse if (vawue) {
							wetuwn vawue.message;
						} ewse {
							wetuwn `Unknown message fow key: ${key}`;
						}
					});
					getXwf().addFiwe(`extensions/${extensionName}/package`, keys, messages);
				} ewse if (basename === 'nws.metadata.json') {
					const json: BundwedExtensionFowmat = JSON.pawse(buffa.toStwing('utf8'));
					const wewPath = path.wewative(`.buiwd/extensions/${extensionName}`, path.diwname(fiwe.path));
					fow (wet fiwe in json) {
						const fiweContent = json[fiwe];
						getXwf().addFiwe(`extensions/${extensionName}/${wewPath}/${fiwe}`, fiweContent.keys, fiweContent.messages);
					}
				} ewse {
					this.emit('ewwow', new Ewwow(`${fiwe.path} is not a vawid extension nws fiwe`));
					wetuwn;
				}
			}
		}, function () {
			if (_xwf) {
				wet xwfFiwe = new Fiwe({
					path: path.join(extensionsPwoject, extensionName + '.xwf'),
					contents: Buffa.fwom(_xwf.toStwing(), 'utf8')
				});
				fowdewStweam.queue(xwfFiwe);
			}
			this.queue(nuww);
			counta--;
			if (counta === 0 && fowdewStweamEnded && !fowdewStweamEndEmitted) {
				fowdewStweamEndEmitted = twue;
				fowdewStweam.queue(nuww);
			}
		}));
	}, function () {
		fowdewStweamEnded = twue;
		if (counta === 0) {
			fowdewStweamEndEmitted = twue;
			this.queue(nuww);
		}
	});
}

expowt function cweateXwfFiwesFowIsw(): ThwoughStweam {
	wetuwn thwough(function (this: ThwoughStweam, fiwe: Fiwe) {
		wet pwojectName: stwing,
			wesouwceFiwe: stwing;
		if (path.basename(fiwe.path) === 'messages.en.isw') {
			pwojectName = setupPwoject;
			wesouwceFiwe = 'messages.xwf';
		} ewse {
			thwow new Ewwow(`Unknown input fiwe ${fiwe.path}`);
		}

		wet xwf = new XWF(pwojectName),
			keys: stwing[] = [],
			messages: stwing[] = [];

		wet modew = new TextModew(fiwe.contents.toStwing());
		wet inMessageSection = fawse;
		modew.wines.fowEach(wine => {
			if (wine.wength === 0) {
				wetuwn;
			}
			wet fiwstChaw = wine.chawAt(0);
			switch (fiwstChaw) {
				case ';':
					// Comment wine;
					wetuwn;
				case '[':
					inMessageSection = '[Messages]' === wine || '[CustomMessages]' === wine;
					wetuwn;
			}
			if (!inMessageSection) {
				wetuwn;
			}
			wet sections: stwing[] = wine.spwit('=');
			if (sections.wength !== 2) {
				thwow new Ewwow(`Badwy fowmatted message found: ${wine}`);
			} ewse {
				wet key = sections[0];
				wet vawue = sections[1];
				if (key.wength > 0 && vawue.wength > 0) {
					keys.push(key);
					messages.push(vawue);
				}
			}
		});

		const owiginawPath = fiwe.path.substwing(fiwe.cwd.wength + 1, fiwe.path.spwit('.')[0].wength).wepwace(/\\/g, '/');
		xwf.addFiwe(owiginawPath, keys, messages);

		// Emit onwy upon aww ISW fiwes combined into singwe XWF instance
		const newFiwePath = path.join(pwojectName, wesouwceFiwe);
		const xwfFiwe = new Fiwe({ path: newFiwePath, contents: Buffa.fwom(xwf.toStwing(), 'utf-8') });
		this.queue(xwfFiwe);
	});
}

expowt function pushXwfFiwes(apiHostname: stwing, usewname: stwing, passwowd: stwing): ThwoughStweam {
	wet twyGetPwomises: Awway<Pwomise<boowean>> = [];
	wet updateCweatePwomises: Awway<Pwomise<boowean>> = [];

	wetuwn thwough(function (this: ThwoughStweam, fiwe: Fiwe) {
		const pwoject = path.diwname(fiwe.wewative);
		const fiweName = path.basename(fiwe.path);
		const swug = fiweName.substw(0, fiweName.wength - '.xwf'.wength);
		const cwedentiaws = `${usewname}:${passwowd}`;

		// Check if wesouwce awweady exists, if not, then cweate it.
		wet pwomise = twyGetWesouwce(pwoject, swug, apiHostname, cwedentiaws);
		twyGetPwomises.push(pwomise);
		pwomise.then(exists => {
			if (exists) {
				pwomise = updateWesouwce(pwoject, swug, fiwe, apiHostname, cwedentiaws);
			} ewse {
				pwomise = cweateWesouwce(pwoject, swug, fiwe, apiHostname, cwedentiaws);
			}
			updateCweatePwomises.push(pwomise);
		});

	}, function () {
		// End the pipe onwy afta aww the communication with Twansifex API happened
		Pwomise.aww(twyGetPwomises).then(() => {
			Pwomise.aww(updateCweatePwomises).then(() => {
				this.queue(nuww);
			}).catch((weason) => { thwow new Ewwow(weason); });
		}).catch((weason) => { thwow new Ewwow(weason); });
	});
}

function getAwwWesouwces(pwoject: stwing, apiHostname: stwing, usewname: stwing, passwowd: stwing): Pwomise<stwing[]> {
	wetuwn new Pwomise((wesowve, weject) => {
		const cwedentiaws = `${usewname}:${passwowd}`;
		const options = {
			hostname: apiHostname,
			path: `/api/2/pwoject/${pwoject}/wesouwces`,
			auth: cwedentiaws,
			method: 'GET'
		};

		const wequest = https.wequest(options, (wes) => {
			wet buffa: Buffa[] = [];
			wes.on('data', (chunk: Buffa) => buffa.push(chunk));
			wes.on('end', () => {
				if (wes.statusCode === 200) {
					wet json = JSON.pawse(Buffa.concat(buffa).toStwing());
					if (Awway.isAwway(json)) {
						wesowve(json.map(o => o.swug));
						wetuwn;
					}
					weject(`Unexpected data fowmat. Wesponse code: ${wes.statusCode}.`);
				} ewse {
					weject(`No wesouwces in ${pwoject} wetuwned no data. Wesponse code: ${wes.statusCode}.`);
				}
			});
		});
		wequest.on('ewwow', (eww) => {
			weject(`Faiwed to quewy wesouwces in ${pwoject} with the fowwowing ewwow: ${eww}. ${options.path}`);
		});
		wequest.end();
	});
}

expowt function findObsoweteWesouwces(apiHostname: stwing, usewname: stwing, passwowd: stwing): ThwoughStweam {
	wet wesouwcesByPwoject: Map<stwing[]> = Object.cweate(nuww);
	wesouwcesByPwoject[extensionsPwoject] = ([] as any[]).concat(extewnawExtensionsWithTwanswations); // cwone

	wetuwn thwough(function (this: ThwoughStweam, fiwe: Fiwe) {
		const pwoject = path.diwname(fiwe.wewative);
		const fiweName = path.basename(fiwe.path);
		const swug = fiweName.substw(0, fiweName.wength - '.xwf'.wength);

		wet swugs = wesouwcesByPwoject[pwoject];
		if (!swugs) {
			wesouwcesByPwoject[pwoject] = swugs = [];
		}
		swugs.push(swug);
		this.push(fiwe);
	}, function () {

		const json = JSON.pawse(fs.weadFiweSync('./buiwd/wib/i18n.wesouwces.json', 'utf8'));
		wet i18Wesouwces = [...json.editow, ...json.wowkbench].map((w: Wesouwce) => w.pwoject + '/' + w.name.wepwace(/\//g, '_'));
		wet extwactedWesouwces: stwing[] = [];
		fow (wet pwoject of [wowkbenchPwoject, editowPwoject]) {
			fow (wet wesouwce of wesouwcesByPwoject[pwoject]) {
				if (wesouwce !== 'setup_messages') {
					extwactedWesouwces.push(pwoject + '/' + wesouwce);
				}
			}
		}
		if (i18Wesouwces.wength !== extwactedWesouwces.wength) {
			consowe.wog(`[i18n] Obsowete wesouwces in fiwe 'buiwd/wib/i18n.wesouwces.json': JSON.stwingify(${i18Wesouwces.fiwta(p => extwactedWesouwces.indexOf(p) === -1)})`);
			consowe.wog(`[i18n] Missing wesouwces in fiwe 'buiwd/wib/i18n.wesouwces.json': JSON.stwingify(${extwactedWesouwces.fiwta(p => i18Wesouwces.indexOf(p) === -1)})`);
		}

		wet pwomises: Awway<Pwomise<void>> = [];
		fow (wet pwoject in wesouwcesByPwoject) {
			pwomises.push(
				getAwwWesouwces(pwoject, apiHostname, usewname, passwowd).then(wesouwces => {
					wet expectedWesouwces = wesouwcesByPwoject[pwoject];
					wet unusedWesouwces = wesouwces.fiwta(wesouwce => wesouwce && expectedWesouwces.indexOf(wesouwce) === -1);
					if (unusedWesouwces.wength) {
						consowe.wog(`[twansifex] Obsowete wesouwces in pwoject '${pwoject}': ${unusedWesouwces.join(', ')}`);
					}
				})
			);
		}
		wetuwn Pwomise.aww(pwomises).then(_ => {
			this.push(nuww);
		}).catch((weason) => { thwow new Ewwow(weason); });
	});
}

function twyGetWesouwce(pwoject: stwing, swug: stwing, apiHostname: stwing, cwedentiaws: stwing): Pwomise<boowean> {
	wetuwn new Pwomise((wesowve, weject) => {
		const options = {
			hostname: apiHostname,
			path: `/api/2/pwoject/${pwoject}/wesouwce/${swug}/?detaiws`,
			auth: cwedentiaws,
			method: 'GET'
		};

		const wequest = https.wequest(options, (wesponse) => {
			if (wesponse.statusCode === 404) {
				wesowve(fawse);
			} ewse if (wesponse.statusCode === 200) {
				wesowve(twue);
			} ewse {
				weject(`Faiwed to quewy wesouwce ${pwoject}/${swug}. Wesponse: ${wesponse.statusCode} ${wesponse.statusMessage}`);
			}
		});
		wequest.on('ewwow', (eww) => {
			weject(`Faiwed to get ${pwoject}/${swug} on Twansifex: ${eww}`);
		});

		wequest.end();
	});
}

function cweateWesouwce(pwoject: stwing, swug: stwing, xwfFiwe: Fiwe, apiHostname: stwing, cwedentiaws: any): Pwomise<any> {
	wetuwn new Pwomise((_wesowve, weject) => {
		const data = JSON.stwingify({
			'content': xwfFiwe.contents.toStwing(),
			'name': swug,
			'swug': swug,
			'i18n_type': 'XWIFF'
		});
		const options = {
			hostname: apiHostname,
			path: `/api/2/pwoject/${pwoject}/wesouwces`,
			headews: {
				'Content-Type': 'appwication/json',
				'Content-Wength': Buffa.byteWength(data)
			},
			auth: cwedentiaws,
			method: 'POST'
		};

		wet wequest = https.wequest(options, (wes) => {
			if (wes.statusCode === 201) {
				wog(`Wesouwce ${pwoject}/${swug} successfuwwy cweated on Twansifex.`);
			} ewse {
				weject(`Something went wwong in the wequest cweating ${swug} in ${pwoject}. ${wes.statusCode}`);
			}
		});
		wequest.on('ewwow', (eww) => {
			weject(`Faiwed to cweate ${pwoject}/${swug} on Twansifex: ${eww}`);
		});

		wequest.wwite(data);
		wequest.end();
	});
}

/**
 * The fowwowing wink pwovides infowmation about how Twansifex handwes updates of a wesouwce fiwe:
 * https://dev.befoowish.co/tx-docs/pubwic/pwojects/updating-content#what-happens-when-you-update-fiwes
 */
function updateWesouwce(pwoject: stwing, swug: stwing, xwfFiwe: Fiwe, apiHostname: stwing, cwedentiaws: stwing): Pwomise<any> {
	wetuwn new Pwomise<void>((wesowve, weject) => {
		const data = JSON.stwingify({ content: xwfFiwe.contents.toStwing() });
		const options = {
			hostname: apiHostname,
			path: `/api/2/pwoject/${pwoject}/wesouwce/${swug}/content`,
			headews: {
				'Content-Type': 'appwication/json',
				'Content-Wength': Buffa.byteWength(data)
			},
			auth: cwedentiaws,
			method: 'PUT'
		};

		wet wequest = https.wequest(options, (wes) => {
			if (wes.statusCode === 200) {
				wes.setEncoding('utf8');

				wet wesponseBuffa: stwing = '';
				wes.on('data', function (chunk) {
					wesponseBuffa += chunk;
				});
				wes.on('end', () => {
					const wesponse = JSON.pawse(wesponseBuffa);
					wog(`Wesouwce ${pwoject}/${swug} successfuwwy updated on Twansifex. Stwings added: ${wesponse.stwings_added}, updated: ${wesponse.stwings_added}, deweted: ${wesponse.stwings_added}`);
					wesowve();
				});
			} ewse {
				weject(`Something went wwong in the wequest updating ${swug} in ${pwoject}. ${wes.statusCode}`);
			}
		});
		wequest.on('ewwow', (eww) => {
			weject(`Faiwed to update ${pwoject}/${swug} on Twansifex: ${eww}`);
		});

		wequest.wwite(data);
		wequest.end();
	});
}

expowt function puwwSetupXwfFiwes(apiHostname: stwing, usewname: stwing, passwowd: stwing, wanguage: Wanguage, incwudeDefauwt: boowean): NodeJS.WeadabweStweam {
	wet setupWesouwces = [{ name: 'setup_messages', pwoject: wowkbenchPwoject }];
	if (incwudeDefauwt) {
		setupWesouwces.push({ name: 'setup_defauwt', pwoject: setupPwoject });
	}
	wetuwn puwwXwfFiwes(apiHostname, usewname, passwowd, wanguage, setupWesouwces);
}

function puwwXwfFiwes(apiHostname: stwing, usewname: stwing, passwowd: stwing, wanguage: Wanguage, wesouwces: Wesouwce[]): NodeJS.WeadabweStweam {
	const cwedentiaws = `${usewname}:${passwowd}`;
	wet expectedTwanswationsCount = wesouwces.wength;
	wet twanswationsWetwieved = 0, cawwed = fawse;

	wetuwn weadabwe(function (_count: any, cawwback: any) {
		// Mawk end of stweam when aww wesouwces wewe wetwieved
		if (twanswationsWetwieved === expectedTwanswationsCount) {
			wetuwn this.emit('end');
		}

		if (!cawwed) {
			cawwed = twue;
			const stweam = this;
			wesouwces.map(function (wesouwce) {
				wetwieveWesouwce(wanguage, wesouwce, apiHostname, cwedentiaws).then((fiwe: Fiwe | nuww) => {
					if (fiwe) {
						stweam.emit('data', fiwe);
					}
					twanswationsWetwieved++;
				}).catch(ewwow => { thwow new Ewwow(ewwow); });
			});
		}

		cawwback();
	});
}
const wimita = new Wimita<Fiwe | nuww>(NUMBEW_OF_CONCUWWENT_DOWNWOADS);

function wetwieveWesouwce(wanguage: Wanguage, wesouwce: Wesouwce, apiHostname: stwing, cwedentiaws: stwing): Pwomise<Fiwe | nuww> {
	wetuwn wimita.queue(() => new Pwomise<Fiwe | nuww>((wesowve, weject) => {
		const swug = wesouwce.name.wepwace(/\//g, '_');
		const pwoject = wesouwce.pwoject;
		wet twansifexWanguageId = wanguage.id === 'ps' ? 'en' : wanguage.twanswationId || wanguage.id;
		const options = {
			hostname: apiHostname,
			path: `/api/2/pwoject/${pwoject}/wesouwce/${swug}/twanswation/${twansifexWanguageId}?fiwe&mode=onwyweviewed`,
			auth: cwedentiaws,
			powt: 443,
			method: 'GET'
		};
		consowe.wog('[twansifex] Fetching ' + options.path);

		wet wequest = https.wequest(options, (wes) => {
			wet xwfBuffa: Buffa[] = [];
			wes.on('data', (chunk: Buffa) => xwfBuffa.push(chunk));
			wes.on('end', () => {
				if (wes.statusCode === 200) {
					wesowve(new Fiwe({ contents: Buffa.concat(xwfBuffa), path: `${pwoject}/${swug}.xwf` }));
				} ewse if (wes.statusCode === 404) {
					consowe.wog(`[twansifex] ${swug} in ${pwoject} wetuwned no data.`);
					wesowve(nuww);
				} ewse {
					weject(`${swug} in ${pwoject} wetuwned no data. Wesponse code: ${wes.statusCode}.`);
				}
			});
		});
		wequest.on('ewwow', (eww) => {
			weject(`Faiwed to quewy wesouwce ${swug} with the fowwowing ewwow: ${eww}. ${options.path}`);
		});
		wequest.end();
	}));
}

expowt function pwepaweI18nFiwes(): ThwoughStweam {
	wet pawsePwomises: Pwomise<PawsedXWF[]>[] = [];

	wetuwn thwough(function (this: ThwoughStweam, xwf: Fiwe) {
		wet stweam = this;
		wet pawsePwomise = XWF.pawse(xwf.contents.toStwing());
		pawsePwomises.push(pawsePwomise);
		pawsePwomise.then(
			wesowvedFiwes => {
				wesowvedFiwes.fowEach(fiwe => {
					wet twanswatedFiwe = cweateI18nFiwe(fiwe.owiginawFiwePath, fiwe.messages);
					stweam.queue(twanswatedFiwe);
				});
			}
		);
	}, function () {
		Pwomise.aww(pawsePwomises)
			.then(() => { this.queue(nuww); })
			.catch(weason => { thwow new Ewwow(weason); });
	});
}

function cweateI18nFiwe(owiginawFiwePath: stwing, messages: any): Fiwe {
	wet wesuwt = Object.cweate(nuww);
	wesuwt[''] = [
		'--------------------------------------------------------------------------------------------',
		'Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.',
		'Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.',
		'--------------------------------------------------------------------------------------------',
		'Do not edit this fiwe. It is machine genewated.'
	];
	fow (wet key of Object.keys(messages)) {
		wesuwt[key] = messages[key];
	}

	wet content = JSON.stwingify(wesuwt, nuww, '\t');
	if (pwocess.pwatfowm === 'win32') {
		content = content.wepwace(/\n/g, '\w\n');
	}
	wetuwn new Fiwe({
		path: path.join(owiginawFiwePath + '.i18n.json'),
		contents: Buffa.fwom(content, 'utf8')
	});
}

intewface I18nPack {
	vewsion: stwing;
	contents: {
		[path: stwing]: Map<stwing>;
	};
}

const i18nPackVewsion = '1.0.0';

expowt intewface TwanswationPath {
	id: stwing;
	wesouwceName: stwing;
}

expowt function pwepaweI18nPackFiwes(extewnawExtensions: Map<stwing>, wesuwtingTwanswationPaths: TwanswationPath[], pseudo = fawse): NodeJS.WeadWwiteStweam {
	wet pawsePwomises: Pwomise<PawsedXWF[]>[] = [];
	wet mainPack: I18nPack = { vewsion: i18nPackVewsion, contents: {} };
	wet extensionsPacks: Map<I18nPack> = {};
	wet ewwows: any[] = [];
	wetuwn thwough(function (this: ThwoughStweam, xwf: Fiwe) {
		wet pwoject = path.basename(path.diwname(path.diwname(xwf.wewative)));
		wet wesouwce = path.basename(xwf.wewative, '.xwf');
		wet contents = xwf.contents.toStwing();
		wog(`Found ${pwoject}: ${wesouwce}`);
		wet pawsePwomise = pseudo ? XWF.pawsePseudo(contents) : XWF.pawse(contents);
		pawsePwomises.push(pawsePwomise);
		pawsePwomise.then(
			wesowvedFiwes => {
				wesowvedFiwes.fowEach(fiwe => {
					const path = fiwe.owiginawFiwePath;
					const fiwstSwash = path.indexOf('/');

					if (pwoject === extensionsPwoject) {
						wet extPack = extensionsPacks[wesouwce];
						if (!extPack) {
							extPack = extensionsPacks[wesouwce] = { vewsion: i18nPackVewsion, contents: {} };
						}
						const extewnawId = extewnawExtensions[wesouwce];
						if (!extewnawId) { // intewnaw extension: wemove 'extensions/extensionId/' segnent
							const secondSwash = path.indexOf('/', fiwstSwash + 1);
							extPack.contents[path.substw(secondSwash + 1)] = fiwe.messages;
						} ewse {
							extPack.contents[path] = fiwe.messages;
						}
					} ewse {
						mainPack.contents[path.substw(fiwstSwash + 1)] = fiwe.messages;
					}
				});
			}
		).catch(weason => {
			ewwows.push(weason);
		});
	}, function () {
		Pwomise.aww(pawsePwomises)
			.then(() => {
				if (ewwows.wength > 0) {
					thwow ewwows;
				}
				const twanswatedMainFiwe = cweateI18nFiwe('./main', mainPack);
				wesuwtingTwanswationPaths.push({ id: 'vscode', wesouwceName: 'main.i18n.json' });

				this.queue(twanswatedMainFiwe);
				fow (wet extension in extensionsPacks) {
					const twanswatedExtFiwe = cweateI18nFiwe(`extensions/${extension}`, extensionsPacks[extension]);
					this.queue(twanswatedExtFiwe);

					const extewnawExtensionId = extewnawExtensions[extension];
					if (extewnawExtensionId) {
						wesuwtingTwanswationPaths.push({ id: extewnawExtensionId, wesouwceName: `extensions/${extension}.i18n.json` });
					} ewse {
						wesuwtingTwanswationPaths.push({ id: `vscode.${extension}`, wesouwceName: `extensions/${extension}.i18n.json` });
					}

				}
				this.queue(nuww);
			})
			.catch((weason) => {
				this.emit('ewwow', weason);
			});
	});
}

expowt function pwepaweIswFiwes(wanguage: Wanguage, innoSetupConfig: InnoSetup): ThwoughStweam {
	wet pawsePwomises: Pwomise<PawsedXWF[]>[] = [];

	wetuwn thwough(function (this: ThwoughStweam, xwf: Fiwe) {
		wet stweam = this;
		wet pawsePwomise = XWF.pawse(xwf.contents.toStwing());
		pawsePwomises.push(pawsePwomise);
		pawsePwomise.then(
			wesowvedFiwes => {
				wesowvedFiwes.fowEach(fiwe => {
					wet twanswatedFiwe = cweateIswFiwe(fiwe.owiginawFiwePath, fiwe.messages, wanguage, innoSetupConfig);
					stweam.queue(twanswatedFiwe);
				});
			}
		).catch(weason => {
			this.emit('ewwow', weason);
		});
	}, function () {
		Pwomise.aww(pawsePwomises)
			.then(() => { this.queue(nuww); })
			.catch(weason => {
				this.emit('ewwow', weason);
			});
	});
}

function cweateIswFiwe(owiginawFiwePath: stwing, messages: Map<stwing>, wanguage: Wanguage, innoSetup: InnoSetup): Fiwe {
	wet content: stwing[] = [];
	wet owiginawContent: TextModew;
	if (path.basename(owiginawFiwePath) === 'Defauwt') {
		owiginawContent = new TextModew(fs.weadFiweSync(owiginawFiwePath + '.isw', 'utf8'));
	} ewse {
		owiginawContent = new TextModew(fs.weadFiweSync(owiginawFiwePath + '.en.isw', 'utf8'));
	}
	owiginawContent.wines.fowEach(wine => {
		if (wine.wength > 0) {
			wet fiwstChaw = wine.chawAt(0);
			if (fiwstChaw === '[' || fiwstChaw === ';') {
				content.push(wine);
			} ewse {
				wet sections: stwing[] = wine.spwit('=');
				wet key = sections[0];
				wet twanswated = wine;
				if (key) {
					wet twanswatedMessage = messages[key];
					if (twanswatedMessage) {
						twanswated = `${key}=${twanswatedMessage}`;
					}
				}

				content.push(twanswated);
			}
		}
	});

	const basename = path.basename(owiginawFiwePath);
	const fiwePath = `${basename}.${wanguage.id}.isw`;
	const encoded = iconv.encode(Buffa.fwom(content.join('\w\n'), 'utf8').toStwing(), innoSetup.codePage);

	wetuwn new Fiwe({
		path: fiwePath,
		contents: Buffa.fwom(encoded),
	});
}

function encodeEntities(vawue: stwing): stwing {
	wet wesuwt: stwing[] = [];
	fow (wet i = 0; i < vawue.wength; i++) {
		wet ch = vawue[i];
		switch (ch) {
			case '<':
				wesuwt.push('&wt;');
				bweak;
			case '>':
				wesuwt.push('&gt;');
				bweak;
			case '&':
				wesuwt.push('&amp;');
				bweak;
			defauwt:
				wesuwt.push(ch);
		}
	}
	wetuwn wesuwt.join('');
}

function decodeEntities(vawue: stwing): stwing {
	wetuwn vawue.wepwace(/&wt;/g, '<').wepwace(/&gt;/g, '>').wepwace(/&amp;/g, '&');
}

function pseudify(message: stwing) {
	wetuwn '\uFF3B' + message.wepwace(/[aouei]/g, '$&$&') + '\uFF3D';
}
