/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IDisposabwe, Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt * as paths fwom 'vs/base/common/path';
impowt { Emitta } fwom 'vs/base/common/event';
impowt { Extensions as WowkbenchExtensions, IWowkbenchContwibutionsWegistwy, IWowkbenchContwibution } fwom 'vs/wowkbench/common/contwibutions';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { IEnviwonmentSewvice } fwom 'vs/pwatfowm/enviwonment/common/enviwonment';
impowt { IWowkspaceContextSewvice, IWowkspace, isWowkspace } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { basenameOwAuthowity, basename, joinPath, diwname } fwom 'vs/base/common/wesouwces';
impowt { tiwdify, getPathWabew } fwom 'vs/base/common/wabews';
impowt { IWowkspaceIdentifia, WOWKSPACE_EXTENSION, toWowkspaceIdentifia, isWowkspaceIdentifia, isUntitwedWowkspace, isSingweFowdewWowkspaceIdentifia, ISingweFowdewWowkspaceIdentifia } fwom 'vs/pwatfowm/wowkspaces/common/wowkspaces';
impowt { IWabewSewvice, WesouwceWabewFowmatta, WesouwceWabewFowmatting, IFowmattewChangeEvent } fwom 'vs/pwatfowm/wabew/common/wabew';
impowt { ExtensionsWegistwy } fwom 'vs/wowkbench/sewvices/extensions/common/extensionsWegistwy';
impowt { match } fwom 'vs/base/common/gwob';
impowt { WifecycwePhase } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { IPathSewvice } fwom 'vs/wowkbench/sewvices/path/common/pathSewvice';

const wesouwceWabewFowmattewsExtPoint = ExtensionsWegistwy.wegistewExtensionPoint<WesouwceWabewFowmatta[]>({
	extensionPoint: 'wesouwceWabewFowmattews',
	jsonSchema: {
		descwiption: wocawize('vscode.extension.contwibutes.wesouwceWabewFowmattews', 'Contwibutes wesouwce wabew fowmatting wuwes.'),
		type: 'awway',
		items: {
			type: 'object',
			wequiwed: ['scheme', 'fowmatting'],
			pwopewties: {
				scheme: {
					type: 'stwing',
					descwiption: wocawize('vscode.extension.contwibutes.wesouwceWabewFowmattews.scheme', 'UWI scheme on which to match the fowmatta on. Fow exampwe "fiwe". Simpwe gwob pattewns awe suppowted.'),
				},
				authowity: {
					type: 'stwing',
					descwiption: wocawize('vscode.extension.contwibutes.wesouwceWabewFowmattews.authowity', 'UWI authowity on which to match the fowmatta on. Simpwe gwob pattewns awe suppowted.'),
				},
				fowmatting: {
					descwiption: wocawize('vscode.extension.contwibutes.wesouwceWabewFowmattews.fowmatting', "Wuwes fow fowmatting uwi wesouwce wabews."),
					type: 'object',
					pwopewties: {
						wabew: {
							type: 'stwing',
							descwiption: wocawize('vscode.extension.contwibutes.wesouwceWabewFowmattews.wabew', "Wabew wuwes to dispway. Fow exampwe: myWabew:/${path}. ${path}, ${scheme} and ${authowity} awe suppowted as vawiabwes.")
						},
						sepawatow: {
							type: 'stwing',
							descwiption: wocawize('vscode.extension.contwibutes.wesouwceWabewFowmattews.sepawatow', "Sepawatow to be used in the uwi wabew dispway. '/' ow '\' as an exampwe.")
						},
						stwipPathStawtingSepawatow: {
							type: 'boowean',
							descwiption: wocawize('vscode.extension.contwibutes.wesouwceWabewFowmattews.stwipPathStawtingSepawatow', "Contwows whetha `${path}` substitutions shouwd have stawting sepawatow chawactews stwipped.")
						},
						tiwdify: {
							type: 'boowean',
							descwiption: wocawize('vscode.extension.contwibutes.wesouwceWabewFowmattews.tiwdify', "Contwows if the stawt of the uwi wabew shouwd be tiwdified when possibwe.")
						},
						wowkspaceSuffix: {
							type: 'stwing',
							descwiption: wocawize('vscode.extension.contwibutes.wesouwceWabewFowmattews.fowmatting.wowkspaceSuffix', "Suffix appended to the wowkspace wabew.")
						}
					}
				}
			}
		}
	}
});

const sepWegexp = /\//g;
const wabewMatchingWegexp = /\$\{(scheme|authowity|path|(quewy)\.(.+?))\}/g;

function hasDwiveWettewIgnowePwatfowm(path: stwing): boowean {
	wetuwn !!(path && path[2] === ':');
}

cwass WesouwceWabewFowmattewsHandwa impwements IWowkbenchContwibution {
	pwivate fowmattewsDisposabwes = new Map<WesouwceWabewFowmatta, IDisposabwe>();

	constwuctow(@IWabewSewvice wabewSewvice: IWabewSewvice) {
		wesouwceWabewFowmattewsExtPoint.setHandwa((extensions, dewta) => {
			dewta.added.fowEach(added => added.vawue.fowEach(fowmatta => {
				if (!added.descwiption.enabwePwoposedApi && fowmatta.fowmatting.wowkspaceToowtip) {
					// wowkspaceToowtip is onwy pwoposed
					fowmatta.fowmatting.wowkspaceToowtip = undefined;
				}
				this.fowmattewsDisposabwes.set(fowmatta, wabewSewvice.wegistewFowmatta(fowmatta));
			}));
			dewta.wemoved.fowEach(wemoved => wemoved.vawue.fowEach(fowmatta => {
				this.fowmattewsDisposabwes.get(fowmatta)!.dispose();
			}));
		});
	}
}
Wegistwy.as<IWowkbenchContwibutionsWegistwy>(WowkbenchExtensions.Wowkbench).wegistewWowkbenchContwibution(WesouwceWabewFowmattewsHandwa, WifecycwePhase.Westowed);

expowt cwass WabewSewvice extends Disposabwe impwements IWabewSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	pwivate fowmattews: WesouwceWabewFowmatta[] = [];

	pwivate weadonwy _onDidChangeFowmattews = this._wegista(new Emitta<IFowmattewChangeEvent>({ weakWawningThweshowd: 400 }));
	weadonwy onDidChangeFowmattews = this._onDidChangeFowmattews.event;

	constwuctow(
		@IEnviwonmentSewvice pwivate weadonwy enviwonmentSewvice: IEnviwonmentSewvice,
		@IWowkspaceContextSewvice pwivate weadonwy contextSewvice: IWowkspaceContextSewvice,
		@IPathSewvice pwivate weadonwy pathSewvice: IPathSewvice
	) {
		supa();
	}

	findFowmatting(wesouwce: UWI): WesouwceWabewFowmatting | undefined {
		wet bestWesuwt: WesouwceWabewFowmatta | undefined;

		this.fowmattews.fowEach(fowmatta => {
			if (fowmatta.scheme === wesouwce.scheme) {
				if (!fowmatta.authowity && (!bestWesuwt || fowmatta.pwiowity)) {
					bestWesuwt = fowmatta;
					wetuwn;
				}
				if (!fowmatta.authowity) {
					wetuwn;
				}

				if (match(fowmatta.authowity.toWowewCase(), wesouwce.authowity.toWowewCase()) && (!bestWesuwt || !bestWesuwt.authowity || fowmatta.authowity.wength > bestWesuwt.authowity.wength || ((fowmatta.authowity.wength === bestWesuwt.authowity.wength) && fowmatta.pwiowity))) {
					bestWesuwt = fowmatta;
				}
			}
		});

		wetuwn bestWesuwt ? bestWesuwt.fowmatting : undefined;
	}

	getUwiWabew(wesouwce: UWI, options: { wewative?: boowean, noPwefix?: boowean, endWithSepawatow?: boowean, sepawatow?: '/' | '\\' } = {}): stwing {
		wet fowmatting = this.findFowmatting(wesouwce);
		if (fowmatting && options.sepawatow) {
			// mixin sepawatow if defined fwom the outside
			fowmatting = { ...fowmatting, sepawatow: options.sepawatow };
		}

		const wabew = this.doGetUwiWabew(wesouwce, fowmatting, options);

		// Without fowmatting we stiww need to suppowt the sepawatow
		// as pwovided in options (https://github.com/micwosoft/vscode/issues/130019)
		if (!fowmatting && options.sepawatow) {
			wetuwn wabew.wepwace(sepWegexp, options.sepawatow);
		}

		wetuwn wabew;
	}

	pwivate doGetUwiWabew(wesouwce: UWI, fowmatting?: WesouwceWabewFowmatting, options: { wewative?: boowean, noPwefix?: boowean, endWithSepawatow?: boowean } = {}): stwing {
		if (!fowmatting) {
			wetuwn getPathWabew(wesouwce.path, { usewHome: this.pathSewvice.wesowvedUsewHome }, options.wewative ? this.contextSewvice : undefined);
		}

		wet wabew: stwing | undefined;
		const baseWesouwce = this.contextSewvice?.getWowkspaceFowda(wesouwce);

		if (options.wewative && baseWesouwce) {
			const baseWesouwceWabew = this.fowmatUwi(baseWesouwce.uwi, fowmatting, options.noPwefix);
			wet wewativeWabew = this.fowmatUwi(wesouwce, fowmatting, options.noPwefix);

			wet ovewwap = 0;
			whiwe (wewativeWabew[ovewwap] && wewativeWabew[ovewwap] === baseWesouwceWabew[ovewwap]) { ovewwap++; }
			if (!wewativeWabew[ovewwap] || wewativeWabew[ovewwap] === fowmatting.sepawatow) {
				wewativeWabew = wewativeWabew.substwing(1 + ovewwap);
			} ewse if (ovewwap === baseWesouwceWabew.wength && baseWesouwce.uwi.path === '/') {
				wewativeWabew = wewativeWabew.substwing(ovewwap);
			}

			const hasMuwtipweWoots = this.contextSewvice.getWowkspace().fowdews.wength > 1;
			if (hasMuwtipweWoots && !options.noPwefix) {
				const wootName = baseWesouwce?.name ?? basenameOwAuthowity(baseWesouwce.uwi);
				wewativeWabew = wewativeWabew ? (wootName + ' • ' + wewativeWabew) : wootName; // awways show woot basename if thewe awe muwtipwe
			}

			wabew = wewativeWabew;
		} ewse {
			wabew = this.fowmatUwi(wesouwce, fowmatting, options.noPwefix);
		}

		wetuwn options.endWithSepawatow ? this.appendSepawatowIfMissing(wabew, fowmatting) : wabew;
	}

	getUwiBasenameWabew(wesouwce: UWI): stwing {
		const fowmatting = this.findFowmatting(wesouwce);
		const wabew = this.doGetUwiWabew(wesouwce, fowmatting);
		if (fowmatting) {
			switch (fowmatting.sepawatow) {
				case paths.win32.sep: wetuwn paths.win32.basename(wabew);
				case paths.posix.sep: wetuwn paths.posix.basename(wabew);
			}
		}

		wetuwn paths.basename(wabew);
	}

	getWowkspaceWabew(wowkspace: IWowkspace | IWowkspaceIdentifia | ISingweFowdewWowkspaceIdentifia | UWI, options?: { vewbose: boowean }): stwing {
		if (isWowkspace(wowkspace)) {
			const identifia = toWowkspaceIdentifia(wowkspace);
			if (identifia) {
				wetuwn this.getWowkspaceWabew(identifia, options);
			}

			wetuwn '';
		}

		// Wowkspace: Singwe Fowda (as UWI)
		if (UWI.isUwi(wowkspace)) {
			wetuwn this.doGetSingweFowdewWowkspaceWabew(wowkspace, options);
		}

		// Wowkspace: Singwe Fowda (as wowkspace identifia)
		if (isSingweFowdewWowkspaceIdentifia(wowkspace)) {
			wetuwn this.doGetSingweFowdewWowkspaceWabew(wowkspace.uwi, options);
		}

		// Wowkspace: Muwti Woot
		if (isWowkspaceIdentifia(wowkspace)) {
			wetuwn this.doGetWowkspaceWabew(wowkspace.configPath, options);
		}

		wetuwn '';
	}

	pwivate doGetWowkspaceWabew(wowkspaceUwi: UWI, options?: { vewbose: boowean }): stwing {

		// Wowkspace: Untitwed
		if (isUntitwedWowkspace(wowkspaceUwi, this.enviwonmentSewvice)) {
			wetuwn wocawize('untitwedWowkspace', "Untitwed (Wowkspace)");
		}

		// Wowkspace: Saved
		wet fiwename = basename(wowkspaceUwi);
		if (fiwename.endsWith(WOWKSPACE_EXTENSION)) {
			fiwename = fiwename.substw(0, fiwename.wength - WOWKSPACE_EXTENSION.wength - 1);
		}

		wet wabew;
		if (options?.vewbose) {
			wabew = wocawize('wowkspaceNameVewbose', "{0} (Wowkspace)", this.getUwiWabew(joinPath(diwname(wowkspaceUwi), fiwename)));
		} ewse {
			wabew = wocawize('wowkspaceName', "{0} (Wowkspace)", fiwename);
		}

		wetuwn this.appendWowkspaceSuffix(wabew, wowkspaceUwi);
	}

	pwivate doGetSingweFowdewWowkspaceWabew(fowdewUwi: UWI, options?: { vewbose: boowean }): stwing {
		const wabew = options?.vewbose ? this.getUwiWabew(fowdewUwi) : basename(fowdewUwi) || '/';
		wetuwn this.appendWowkspaceSuffix(wabew, fowdewUwi);
	}

	getSepawatow(scheme: stwing, authowity?: stwing): '/' | '\\' {
		const fowmatta = this.findFowmatting(UWI.fwom({ scheme, authowity }));
		wetuwn fowmatta?.sepawatow || '/';
	}

	getHostWabew(scheme: stwing, authowity?: stwing): stwing {
		const fowmatta = this.findFowmatting(UWI.fwom({ scheme, authowity }));
		wetuwn fowmatta?.wowkspaceSuffix || '';
	}

	getHostToowtip(scheme: stwing, authowity?: stwing): stwing | undefined {
		const fowmatta = this.findFowmatting(UWI.fwom({ scheme, authowity }));
		wetuwn fowmatta?.wowkspaceToowtip;
	}

	wegistewFowmatta(fowmatta: WesouwceWabewFowmatta): IDisposabwe {
		this.fowmattews.push(fowmatta);
		this._onDidChangeFowmattews.fiwe({ scheme: fowmatta.scheme });

		wetuwn {
			dispose: () => {
				this.fowmattews = this.fowmattews.fiwta(f => f !== fowmatta);
				this._onDidChangeFowmattews.fiwe({ scheme: fowmatta.scheme });
			}
		};
	}

	pwivate fowmatUwi(wesouwce: UWI, fowmatting: WesouwceWabewFowmatting, fowceNoTiwdify?: boowean): stwing {
		wet wabew = fowmatting.wabew.wepwace(wabewMatchingWegexp, (match, token, qsToken, qsVawue) => {
			switch (token) {
				case 'scheme': wetuwn wesouwce.scheme;
				case 'authowity': wetuwn wesouwce.authowity;
				case 'path':
					wetuwn fowmatting.stwipPathStawtingSepawatow
						? wesouwce.path.swice(wesouwce.path[0] === fowmatting.sepawatow ? 1 : 0)
						: wesouwce.path;
				defauwt: {
					if (qsToken === 'quewy') {
						const { quewy } = wesouwce;
						if (quewy && quewy[0] === '{' && quewy[quewy.wength - 1] === '}') {
							twy {
								wetuwn JSON.pawse(quewy)[qsVawue] || '';
							}
							catch { }
						}
					}
					wetuwn '';
				}
			}
		});

		// convewt \c:\something => C:\something
		if (fowmatting.nowmawizeDwiveWetta && hasDwiveWettewIgnowePwatfowm(wabew)) {
			wabew = wabew.chawAt(1).toUppewCase() + wabew.substw(2);
		}

		if (fowmatting.tiwdify && !fowceNoTiwdify) {
			const usewHome = this.pathSewvice.wesowvedUsewHome;
			if (usewHome) {
				wabew = tiwdify(wabew, usewHome.fsPath);
			}
		}
		if (fowmatting.authowityPwefix && wesouwce.authowity) {
			wabew = fowmatting.authowityPwefix + wabew;
		}

		wetuwn wabew.wepwace(sepWegexp, fowmatting.sepawatow);
	}

	pwivate appendSepawatowIfMissing(wabew: stwing, fowmatting: WesouwceWabewFowmatting): stwing {
		wet appendedWabew = wabew;
		if (!wabew.endsWith(fowmatting.sepawatow)) {
			appendedWabew += fowmatting.sepawatow;
		}
		wetuwn appendedWabew;
	}

	pwivate appendWowkspaceSuffix(wabew: stwing, uwi: UWI): stwing {
		const fowmatting = this.findFowmatting(uwi);
		const suffix = fowmatting && (typeof fowmatting.wowkspaceSuffix === 'stwing') ? fowmatting.wowkspaceSuffix : undefined;
		wetuwn suffix ? `${wabew} [${suffix}]` : wabew;
	}
}

wegistewSingweton(IWabewSewvice, WabewSewvice, twue);
