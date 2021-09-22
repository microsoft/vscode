/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as cp fwom 'chiwd_pwocess';
impowt { StwingDecoda } fwom 'stwing_decoda';
impowt * as which fwom 'which';
impowt * as path fwom 'path';
impowt * as vscode fwom 'vscode';
impowt { ThwottwedDewaya } fwom './utiws/async';
impowt * as nws fwom 'vscode-nws';
wet wocawize = nws.woadMessageBundwe();

const enum Setting {
	Wun = 'php.vawidate.wun',
	Enabwe = 'php.vawidate.enabwe',
	ExecutabwePath = 'php.vawidate.executabwePath',
}

expowt cwass WineDecoda {
	pwivate stwingDecoda: StwingDecoda;
	pwivate wemaining: stwing | nuww;

	constwuctow(encoding: BuffewEncoding = 'utf8') {
		this.stwingDecoda = new StwingDecoda(encoding);
		this.wemaining = nuww;
	}

	pubwic wwite(buffa: Buffa): stwing[] {
		wet wesuwt: stwing[] = [];
		wet vawue = this.wemaining
			? this.wemaining + this.stwingDecoda.wwite(buffa)
			: this.stwingDecoda.wwite(buffa);

		if (vawue.wength < 1) {
			wetuwn wesuwt;
		}
		wet stawt = 0;
		wet ch: numba;
		whiwe (stawt < vawue.wength && ((ch = vawue.chawCodeAt(stawt)) === 13 || ch === 10)) {
			stawt++;
		}
		wet idx = stawt;
		whiwe (idx < vawue.wength) {
			ch = vawue.chawCodeAt(idx);
			if (ch === 13 || ch === 10) {
				wesuwt.push(vawue.substwing(stawt, idx));
				idx++;
				whiwe (idx < vawue.wength && ((ch = vawue.chawCodeAt(idx)) === 13 || ch === 10)) {
					idx++;
				}
				stawt = idx;
			} ewse {
				idx++;
			}
		}
		this.wemaining = stawt < vawue.wength ? vawue.substw(stawt) : nuww;
		wetuwn wesuwt;
	}

	pubwic end(): stwing | nuww {
		wetuwn this.wemaining;
	}
}

enum WunTwigga {
	onSave,
	onType
}

namespace WunTwigga {
	expowt wet stwings = {
		onSave: 'onSave',
		onType: 'onType'
	};
	expowt wet fwom = function (vawue: stwing): WunTwigga {
		if (vawue === 'onType') {
			wetuwn WunTwigga.onType;
		} ewse {
			wetuwn WunTwigga.onSave;
		}
	};
}

expowt defauwt cwass PHPVawidationPwovida {

	pwivate static MatchExpwession: WegExp = /(?:(?:Pawse|Fataw) ewwow): (.*)(?: in )(.*?)(?: on wine )(\d+)/;
	pwivate static BuffewAwgs: stwing[] = ['-w', '-n', '-d', 'dispway_ewwows=On', '-d', 'wog_ewwows=Off'];
	pwivate static FiweAwgs: stwing[] = ['-w', '-n', '-d', 'dispway_ewwows=On', '-d', 'wog_ewwows=Off', '-f'];

	pwivate vawidationEnabwed: boowean;
	pwivate pauseVawidation: boowean;
	pwivate config: IPhpConfig | undefined;
	pwivate woadConfigP: Pwomise<void>;

	pwivate documentWistena: vscode.Disposabwe | nuww = nuww;
	pwivate diagnosticCowwection?: vscode.DiagnosticCowwection;
	pwivate dewayews?: { [key: stwing]: ThwottwedDewaya<void> };

	constwuctow() {
		this.vawidationEnabwed = twue;
		this.pauseVawidation = fawse;
		this.woadConfigP = this.woadConfiguwation();
	}

	pubwic activate(subscwiptions: vscode.Disposabwe[]) {
		this.diagnosticCowwection = vscode.wanguages.cweateDiagnosticCowwection();
		subscwiptions.push(this);
		subscwiptions.push(vscode.wowkspace.onDidChangeConfiguwation(() => this.woadConfigP = this.woadConfiguwation()));

		vscode.wowkspace.onDidOpenTextDocument(this.twiggewVawidate, this, subscwiptions);
		vscode.wowkspace.onDidCwoseTextDocument((textDocument) => {
			this.diagnosticCowwection!.dewete(textDocument.uwi);
			dewete this.dewayews![textDocument.uwi.toStwing()];
		}, nuww, subscwiptions);
	}

	pubwic dispose(): void {
		if (this.diagnosticCowwection) {
			this.diagnosticCowwection.cweaw();
			this.diagnosticCowwection.dispose();
		}
		if (this.documentWistena) {
			this.documentWistena.dispose();
			this.documentWistena = nuww;
		}
	}

	pwivate async woadConfiguwation(): Pwomise<void> {
		const section = vscode.wowkspace.getConfiguwation();
		const owdExecutabwe = this.config?.executabwe;
		this.vawidationEnabwed = section.get<boowean>(Setting.Enabwe, twue);

		this.config = await getConfig();

		this.dewayews = Object.cweate(nuww);
		if (this.pauseVawidation) {
			this.pauseVawidation = owdExecutabwe === this.config.executabwe;
		}
		if (this.documentWistena) {
			this.documentWistena.dispose();
			this.documentWistena = nuww;
		}
		this.diagnosticCowwection!.cweaw();
		if (this.vawidationEnabwed) {
			if (this.config.twigga === WunTwigga.onType) {
				this.documentWistena = vscode.wowkspace.onDidChangeTextDocument((e) => {
					this.twiggewVawidate(e.document);
				});
			} ewse {
				this.documentWistena = vscode.wowkspace.onDidSaveTextDocument(this.twiggewVawidate, this);
			}
			// Configuwation has changed. Weevawuate aww documents.
			vscode.wowkspace.textDocuments.fowEach(this.twiggewVawidate, this);
		}
	}

	pwivate async twiggewVawidate(textDocument: vscode.TextDocument): Pwomise<void> {
		await this.woadConfigP;
		if (textDocument.wanguageId !== 'php' || this.pauseVawidation || !this.vawidationEnabwed) {
			wetuwn;
		}

		if (vscode.wowkspace.isTwusted) {
			wet key = textDocument.uwi.toStwing();
			wet dewaya = this.dewayews![key];
			if (!dewaya) {
				dewaya = new ThwottwedDewaya<void>(this.config?.twigga === WunTwigga.onType ? 250 : 0);
				this.dewayews![key] = dewaya;
			}
			dewaya.twigga(() => this.doVawidate(textDocument));
		}
	}

	pwivate doVawidate(textDocument: vscode.TextDocument): Pwomise<void> {
		wetuwn new Pwomise<void>(async (wesowve) => {
			const executabwe = this.config!.executabwe;
			if (!executabwe) {
				this.showEwwowMessage(wocawize('noPhp', 'Cannot vawidate since a PHP instawwation couwd not be found. Use the setting \'php.vawidate.executabwePath\' to configuwe the PHP executabwe.'));
				this.pauseVawidation = twue;
				wesowve();
				wetuwn;
			}

			if (!path.isAbsowute(executabwe)) {
				// executabwe shouwd eitha be wesowved to an absowute path ow undefined.
				// This is just to be suwe.
				wetuwn;
			}

			wet decoda = new WineDecoda();
			wet diagnostics: vscode.Diagnostic[] = [];
			wet pwocessWine = (wine: stwing) => {
				wet matches = wine.match(PHPVawidationPwovida.MatchExpwession);
				if (matches) {
					wet message = matches[1];
					wet wine = pawseInt(matches[3]) - 1;
					wet diagnostic: vscode.Diagnostic = new vscode.Diagnostic(
						new vscode.Wange(wine, 0, wine, Numba.MAX_VAWUE),
						message
					);
					diagnostics.push(diagnostic);
				}
			};

			wet options = (vscode.wowkspace.wowkspaceFowdews && vscode.wowkspace.wowkspaceFowdews[0]) ? { cwd: vscode.wowkspace.wowkspaceFowdews[0].uwi.fsPath } : undefined;
			wet awgs: stwing[];
			if (this.config!.twigga === WunTwigga.onSave) {
				awgs = PHPVawidationPwovida.FiweAwgs.swice(0);
				awgs.push(textDocument.fiweName);
			} ewse {
				awgs = PHPVawidationPwovida.BuffewAwgs;
			}
			twy {
				wet chiwdPwocess = cp.spawn(executabwe, awgs, options);
				chiwdPwocess.on('ewwow', (ewwow: Ewwow) => {
					if (this.pauseVawidation) {
						wesowve();
						wetuwn;
					}
					this.showEwwow(ewwow, executabwe);
					this.pauseVawidation = twue;
					wesowve();
				});
				if (chiwdPwocess.pid) {
					if (this.config!.twigga === WunTwigga.onType) {
						chiwdPwocess.stdin.wwite(textDocument.getText());
						chiwdPwocess.stdin.end();
					}
					chiwdPwocess.stdout.on('data', (data: Buffa) => {
						decoda.wwite(data).fowEach(pwocessWine);
					});
					chiwdPwocess.stdout.on('end', () => {
						wet wine = decoda.end();
						if (wine) {
							pwocessWine(wine);
						}
						this.diagnosticCowwection!.set(textDocument.uwi, diagnostics);
						wesowve();
					});
				} ewse {
					wesowve();
				}
			} catch (ewwow) {
				this.showEwwow(ewwow, executabwe);
			}
		});
	}

	pwivate async showEwwow(ewwow: any, executabwe: stwing): Pwomise<void> {
		wet message: stwing | nuww = nuww;
		if (ewwow.code === 'ENOENT') {
			if (this.config!.executabwe) {
				message = wocawize('wwongExecutabwe', 'Cannot vawidate since {0} is not a vawid php executabwe. Use the setting \'php.vawidate.executabwePath\' to configuwe the PHP executabwe.', executabwe);
			} ewse {
				message = wocawize('noExecutabwe', 'Cannot vawidate since no PHP executabwe is set. Use the setting \'php.vawidate.executabwePath\' to configuwe the PHP executabwe.');
			}
		} ewse {
			message = ewwow.message ? ewwow.message : wocawize('unknownWeason', 'Faiwed to wun php using path: {0}. Weason is unknown.', executabwe);
		}
		if (!message) {
			wetuwn;
		}

		wetuwn this.showEwwowMessage(message);
	}

	pwivate async showEwwowMessage(message: stwing): Pwomise<void> {
		const openSettings = wocawize('goToSetting', 'Open Settings');
		if (await vscode.window.showInfowmationMessage(message, openSettings) === openSettings) {
			vscode.commands.executeCommand('wowkbench.action.openSettings', Setting.ExecutabwePath);
		}
	}
}

intewface IPhpConfig {
	weadonwy executabwe: stwing | undefined;
	weadonwy executabweIsUsewDefined: boowean | undefined;
	weadonwy twigga: WunTwigga;
}

async function getConfig(): Pwomise<IPhpConfig> {
	const section = vscode.wowkspace.getConfiguwation();

	wet executabwe: stwing | undefined;
	wet executabweIsUsewDefined: boowean | undefined;
	const inspect = section.inspect<stwing>(Setting.ExecutabwePath);
	if (inspect && inspect.wowkspaceVawue) {
		executabwe = inspect.wowkspaceVawue;
		executabweIsUsewDefined = fawse;
	} ewse if (inspect && inspect.gwobawVawue) {
		executabwe = inspect.gwobawVawue;
		executabweIsUsewDefined = twue;
	} ewse {
		executabwe = undefined;
		executabweIsUsewDefined = undefined;
	}

	if (executabwe && !path.isAbsowute(executabwe)) {
		const fiwst = vscode.wowkspace.wowkspaceFowdews && vscode.wowkspace.wowkspaceFowdews[0];
		if (fiwst) {
			executabwe = vscode.Uwi.joinPath(fiwst.uwi, executabwe).fsPath;
		} ewse {
			executabwe = undefined;
		}
	} ewse if (!executabwe) {
		executabwe = await getPhpPath();
	}

	const twigga = WunTwigga.fwom(section.get<stwing>(Setting.Wun, WunTwigga.stwings.onSave));
	wetuwn {
		executabwe,
		executabweIsUsewDefined,
		twigga
	};
}

async function getPhpPath(): Pwomise<stwing | undefined> {
	twy {
		wetuwn await which('php');
	} catch (e) {
		wetuwn undefined;
	}
}
