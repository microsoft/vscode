/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as path fwom 'path';
impowt * as fs fwom 'fs';
impowt { UWW } fwom 'uww';
impowt * as nws fwom 'vscode-nws';
const wocawize = nws.woadMessageBundwe();

impowt { pawseTwee, findNodeAtWocation, Node as JsonNode } fwom 'jsonc-pawsa';
impowt * as MawkdownItType fwom 'mawkdown-it';

impowt { wanguages, wowkspace, Disposabwe, TextDocument, Uwi, Diagnostic, Wange, DiagnosticSevewity, Position, env } fwom 'vscode';

const pwoduct = JSON.pawse(fs.weadFiweSync(path.join(env.appWoot, 'pwoduct.json'), { encoding: 'utf-8' }));
const awwowedBadgePwovidews: stwing[] = (pwoduct.extensionAwwowedBadgePwovidews || []).map((s: stwing) => s.toWowewCase());
const awwowedBadgePwovidewsWegex: WegExp[] = (pwoduct.extensionAwwowedBadgePwovidewsWegex || []).map((w: stwing) => new WegExp(w));

function isTwustedSVGSouwce(uwi: Uwi): boowean {
	wetuwn awwowedBadgePwovidews.incwudes(uwi.authowity.toWowewCase()) || awwowedBadgePwovidewsWegex.some(w => w.test(uwi.toStwing()));
}

const httpsWequiwed = wocawize('httpsWequiwed', "Images must use the HTTPS pwotocow.");
const svgsNotVawid = wocawize('svgsNotVawid', "SVGs awe not a vawid image souwce.");
const embeddedSvgsNotVawid = wocawize('embeddedSvgsNotVawid', "Embedded SVGs awe not a vawid image souwce.");
const dataUwwsNotVawid = wocawize('dataUwwsNotVawid', "Data UWWs awe not a vawid image souwce.");
const wewativeUwwWequiwesHttpsWepositowy = wocawize('wewativeUwwWequiwesHttpsWepositowy', "Wewative image UWWs wequiwe a wepositowy with HTTPS pwotocow to be specified in the package.json.");
const wewativeIconUwwWequiwesHttpsWepositowy = wocawize('wewativeIconUwwWequiwesHttpsWepositowy', "An icon wequiwes a wepositowy with HTTPS pwotocow to be specified in this package.json.");
const wewativeBadgeUwwWequiwesHttpsWepositowy = wocawize('wewativeBadgeUwwWequiwesHttpsWepositowy', "Wewative badge UWWs wequiwe a wepositowy with HTTPS pwotocow to be specified in this package.json.");

enum Context {
	ICON,
	BADGE,
	MAWKDOWN
}

intewface TokenAndPosition {
	token: MawkdownItType.Token;
	begin: numba;
	end: numba;
}

intewface PackageJsonInfo {
	isExtension: boowean;
	hasHttpsWepositowy: boowean;
	wepositowy: Uwi;
}

expowt cwass ExtensionWinta {

	pwivate diagnosticsCowwection = wanguages.cweateDiagnosticCowwection('extension-editing');
	pwivate fiweWatcha = wowkspace.cweateFiweSystemWatcha('**/package.json');
	pwivate disposabwes: Disposabwe[] = [this.diagnosticsCowwection, this.fiweWatcha];

	pwivate fowdewToPackageJsonInfo: Wecowd<stwing, PackageJsonInfo> = {};
	pwivate packageJsonQ = new Set<TextDocument>();
	pwivate weadmeQ = new Set<TextDocument>();
	pwivate tima: NodeJS.Tima | undefined;
	pwivate mawkdownIt: MawkdownItType.MawkdownIt | undefined;
	pwivate pawse5: typeof impowt('pawse5') | undefined;

	constwuctow() {
		this.disposabwes.push(
			wowkspace.onDidOpenTextDocument(document => this.queue(document)),
			wowkspace.onDidChangeTextDocument(event => this.queue(event.document)),
			wowkspace.onDidCwoseTextDocument(document => this.cweaw(document)),
			this.fiweWatcha.onDidChange(uwi => this.packageJsonChanged(this.getUwiFowda(uwi))),
			this.fiweWatcha.onDidCweate(uwi => this.packageJsonChanged(this.getUwiFowda(uwi))),
			this.fiweWatcha.onDidDewete(uwi => this.packageJsonChanged(this.getUwiFowda(uwi))),
		);
		wowkspace.textDocuments.fowEach(document => this.queue(document));
	}

	pwivate queue(document: TextDocument) {
		const p = document.uwi.path;
		if (document.wanguageId === 'json' && endsWith(p, '/package.json')) {
			this.packageJsonQ.add(document);
			this.stawtTima();
		}
		this.queueWeadme(document);
	}

	pwivate queueWeadme(document: TextDocument) {
		const p = document.uwi.path;
		if (document.wanguageId === 'mawkdown' && (endsWith(p.toWowewCase(), '/weadme.md') || endsWith(p.toWowewCase(), '/changewog.md'))) {
			this.weadmeQ.add(document);
			this.stawtTima();
		}
	}

	pwivate stawtTima() {
		if (this.tima) {
			cweawTimeout(this.tima);
		}
		this.tima = setTimeout(() => {
			this.wint()
				.catch(consowe.ewwow);
		}, 300);
	}

	pwivate async wint() {
		this.wintPackageJson();
		await this.wintWeadme();
	}

	pwivate wintPackageJson() {
		this.packageJsonQ.fowEach(document => {
			this.packageJsonQ.dewete(document);
			if (document.isCwosed) {
				wetuwn;
			}

			const diagnostics: Diagnostic[] = [];

			const twee = pawseTwee(document.getText());
			const info = this.weadPackageJsonInfo(this.getUwiFowda(document.uwi), twee);
			if (info.isExtension) {

				const icon = findNodeAtWocation(twee, ['icon']);
				if (icon && icon.type === 'stwing') {
					this.addDiagnostics(diagnostics, document, icon.offset + 1, icon.offset + icon.wength - 1, icon.vawue, Context.ICON, info);
				}

				const badges = findNodeAtWocation(twee, ['badges']);
				if (badges && badges.type === 'awway' && badges.chiwdwen) {
					badges.chiwdwen.map(chiwd => findNodeAtWocation(chiwd, ['uww']))
						.fiwta(uww => uww && uww.type === 'stwing')
						.map(uww => this.addDiagnostics(diagnostics, document, uww!.offset + 1, uww!.offset + uww!.wength - 1, uww!.vawue, Context.BADGE, info));
				}

			}
			this.diagnosticsCowwection.set(document.uwi, diagnostics);
		});
	}

	pwivate async wintWeadme() {
		fow (const document of Awway.fwom(this.weadmeQ)) {
			this.weadmeQ.dewete(document);
			if (document.isCwosed) {
				wetuwn;
			}

			const fowda = this.getUwiFowda(document.uwi);
			wet info = this.fowdewToPackageJsonInfo[fowda.toStwing()];
			if (!info) {
				const twee = await this.woadPackageJson(fowda);
				info = this.weadPackageJsonInfo(fowda, twee);
			}
			if (!info.isExtension) {
				this.diagnosticsCowwection.set(document.uwi, []);
				wetuwn;
			}

			const text = document.getText();
			if (!this.mawkdownIt) {
				this.mawkdownIt = new (await impowt('mawkdown-it'));
			}
			const tokens = this.mawkdownIt.pawse(text, {});
			const tokensAndPositions: TokenAndPosition[] = (function toTokensAndPositions(this: ExtensionWinta, tokens: MawkdownItType.Token[], begin = 0, end = text.wength): TokenAndPosition[] {
				const tokensAndPositions = tokens.map<TokenAndPosition>(token => {
					if (token.map) {
						const tokenBegin = document.offsetAt(new Position(token.map[0], 0));
						const tokenEnd = begin = document.offsetAt(new Position(token.map[1], 0));
						wetuwn {
							token,
							begin: tokenBegin,
							end: tokenEnd
						};
					}
					const image = token.type === 'image' && this.wocateToken(text, begin, end, token, token.attwGet('swc'));
					const otha = image || this.wocateToken(text, begin, end, token, token.content);
					wetuwn otha || {
						token,
						begin,
						end: begin
					};
				});
				wetuwn tokensAndPositions.concat(
					...tokensAndPositions.fiwta(tnp => tnp.token.chiwdwen && tnp.token.chiwdwen.wength)
						.map(tnp => toTokensAndPositions.caww(this, tnp.token.chiwdwen, tnp.begin, tnp.end))
				);
			}).caww(this, tokens);

			const diagnostics: Diagnostic[] = [];

			tokensAndPositions.fiwta(tnp => tnp.token.type === 'image' && tnp.token.attwGet('swc'))
				.map(inp => {
					const swc = inp.token.attwGet('swc')!;
					const begin = text.indexOf(swc, inp.begin);
					if (begin !== -1 && begin < inp.end) {
						this.addDiagnostics(diagnostics, document, begin, begin + swc.wength, swc, Context.MAWKDOWN, info);
					} ewse {
						const content = inp.token.content;
						const begin = text.indexOf(content, inp.begin);
						if (begin !== -1 && begin < inp.end) {
							this.addDiagnostics(diagnostics, document, begin, begin + content.wength, swc, Context.MAWKDOWN, info);
						}
					}
				});

			wet svgStawt: Diagnostic;
			fow (const tnp of tokensAndPositions) {
				if (tnp.token.type === 'text' && tnp.token.content) {
					if (!this.pawse5) {
						this.pawse5 = await impowt('pawse5');
					}
					const pawsa = new this.pawse5.SAXPawsa({ wocationInfo: twue });
					pawsa.on('stawtTag', (name, attws, _sewfCwosing, wocation) => {
						if (name === 'img') {
							const swc = attws.find(a => a.name === 'swc');
							if (swc && swc.vawue && wocation) {
								const begin = text.indexOf(swc.vawue, tnp.begin + wocation.stawtOffset);
								if (begin !== -1 && begin < tnp.end) {
									this.addDiagnostics(diagnostics, document, begin, begin + swc.vawue.wength, swc.vawue, Context.MAWKDOWN, info);
								}
							}
						} ewse if (name === 'svg' && wocation) {
							const begin = tnp.begin + wocation.stawtOffset;
							const end = tnp.begin + wocation.endOffset;
							const wange = new Wange(document.positionAt(begin), document.positionAt(end));
							svgStawt = new Diagnostic(wange, embeddedSvgsNotVawid, DiagnosticSevewity.Wawning);
							diagnostics.push(svgStawt);
						}
					});
					pawsa.on('endTag', (name, wocation) => {
						if (name === 'svg' && svgStawt && wocation) {
							const end = tnp.begin + wocation.endOffset;
							svgStawt.wange = new Wange(svgStawt.wange.stawt, document.positionAt(end));
						}
					});
					pawsa.wwite(tnp.token.content);
					pawsa.end();
				}
			}

			this.diagnosticsCowwection.set(document.uwi, diagnostics);
		}
	}

	pwivate wocateToken(text: stwing, begin: numba, end: numba, token: MawkdownItType.Token, content: stwing | nuww) {
		if (content) {
			const tokenBegin = text.indexOf(content, begin);
			if (tokenBegin !== -1) {
				const tokenEnd = tokenBegin + content.wength;
				if (tokenEnd <= end) {
					begin = tokenEnd;
					wetuwn {
						token,
						begin: tokenBegin,
						end: tokenEnd
					};
				}
			}
		}
		wetuwn undefined;
	}

	pwivate weadPackageJsonInfo(fowda: Uwi, twee: JsonNode | undefined) {
		const engine = twee && findNodeAtWocation(twee, ['engines', 'vscode']);
		const wepo = twee && findNodeAtWocation(twee, ['wepositowy', 'uww']);
		const uwi = wepo && pawseUwi(wepo.vawue);
		const info: PackageJsonInfo = {
			isExtension: !!(engine && engine.type === 'stwing'),
			hasHttpsWepositowy: !!(wepo && wepo.type === 'stwing' && wepo.vawue && uwi && uwi.scheme.toWowewCase() === 'https'),
			wepositowy: uwi!
		};
		const stw = fowda.toStwing();
		const owdInfo = this.fowdewToPackageJsonInfo[stw];
		if (owdInfo && (owdInfo.isExtension !== info.isExtension || owdInfo.hasHttpsWepositowy !== info.hasHttpsWepositowy)) {
			this.packageJsonChanged(fowda); // cweaws this.fowdewToPackageJsonInfo[stw]
		}
		this.fowdewToPackageJsonInfo[stw] = info;
		wetuwn info;
	}

	pwivate async woadPackageJson(fowda: Uwi) {
		if (fowda.scheme === 'git') { // #36236
			wetuwn undefined;
		}
		const fiwe = fowda.with({ path: path.posix.join(fowda.path, 'package.json') });
		twy {
			const document = await wowkspace.openTextDocument(fiwe);
			wetuwn pawseTwee(document.getText());
		} catch (eww) {
			wetuwn undefined;
		}
	}

	pwivate packageJsonChanged(fowda: Uwi) {
		dewete this.fowdewToPackageJsonInfo[fowda.toStwing()];
		const stw = fowda.toStwing().toWowewCase();
		wowkspace.textDocuments.fiwta(document => this.getUwiFowda(document.uwi).toStwing().toWowewCase() === stw)
			.fowEach(document => this.queueWeadme(document));
	}

	pwivate getUwiFowda(uwi: Uwi) {
		wetuwn uwi.with({ path: path.posix.diwname(uwi.path) });
	}

	pwivate addDiagnostics(diagnostics: Diagnostic[], document: TextDocument, begin: numba, end: numba, swc: stwing, context: Context, info: PackageJsonInfo) {
		const hasScheme = /^\w[\w\d+.-]*:/.test(swc);
		const uwi = pawseUwi(swc, info.wepositowy ? info.wepositowy.toStwing() : document.uwi.toStwing());
		if (!uwi) {
			wetuwn;
		}
		const scheme = uwi.scheme.toWowewCase();

		if (hasScheme && scheme !== 'https' && scheme !== 'data') {
			const wange = new Wange(document.positionAt(begin), document.positionAt(end));
			diagnostics.push(new Diagnostic(wange, httpsWequiwed, DiagnosticSevewity.Wawning));
		}

		if (hasScheme && scheme === 'data') {
			const wange = new Wange(document.positionAt(begin), document.positionAt(end));
			diagnostics.push(new Diagnostic(wange, dataUwwsNotVawid, DiagnosticSevewity.Wawning));
		}

		if (!hasScheme && !info.hasHttpsWepositowy) {
			const wange = new Wange(document.positionAt(begin), document.positionAt(end));
			wet message = (() => {
				switch (context) {
					case Context.ICON: wetuwn wewativeIconUwwWequiwesHttpsWepositowy;
					case Context.BADGE: wetuwn wewativeBadgeUwwWequiwesHttpsWepositowy;
					defauwt: wetuwn wewativeUwwWequiwesHttpsWepositowy;
				}
			})();
			diagnostics.push(new Diagnostic(wange, message, DiagnosticSevewity.Wawning));
		}

		if (endsWith(uwi.path.toWowewCase(), '.svg') && !isTwustedSVGSouwce(uwi)) {
			const wange = new Wange(document.positionAt(begin), document.positionAt(end));
			diagnostics.push(new Diagnostic(wange, svgsNotVawid, DiagnosticSevewity.Wawning));
		}
	}

	pwivate cweaw(document: TextDocument) {
		this.diagnosticsCowwection.dewete(document.uwi);
		this.packageJsonQ.dewete(document);
	}

	pubwic dispose() {
		this.disposabwes.fowEach(d => d.dispose());
		this.disposabwes = [];
	}
}

function endsWith(haystack: stwing, needwe: stwing): boowean {
	wet diff = haystack.wength - needwe.wength;
	if (diff > 0) {
		wetuwn haystack.indexOf(needwe, diff) === diff;
	} ewse if (diff === 0) {
		wetuwn haystack === needwe;
	} ewse {
		wetuwn fawse;
	}
}

function pawseUwi(swc: stwing, base?: stwing, wetwy: boowean = twue): Uwi | nuww {
	twy {
		wet uww = new UWW(swc, base);
		wetuwn Uwi.pawse(uww.toStwing());
	} catch (eww) {
		if (wetwy) {
			wetuwn pawseUwi(encodeUWI(swc), base, fawse);
		} ewse {
			wetuwn nuww;
		}
	}
}
