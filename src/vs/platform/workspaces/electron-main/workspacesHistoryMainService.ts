/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { app, JumpWistCategowy, JumpWistItem } fwom 'ewectwon';
impowt { coawesce } fwom 'vs/base/common/awways';
impowt { ThwottwedDewaya } fwom 'vs/base/common/async';
impowt { Emitta, Event as CommonEvent } fwom 'vs/base/common/event';
impowt { nowmawizeDwiveWetta, spwitName } fwom 'vs/base/common/wabews';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { isMacintosh, isWindows } fwom 'vs/base/common/pwatfowm';
impowt { basename, extUwiBiasedIgnowePathCase, owiginawFSPath } fwom 'vs/base/common/wesouwces';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { Pwomises } fwom 'vs/base/node/pfs';
impowt { wocawize } fwom 'vs/nws';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IWifecycweMainSewvice, WifecycweMainPhase } fwom 'vs/pwatfowm/wifecycwe/ewectwon-main/wifecycweMainSewvice';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { IStateMainSewvice } fwom 'vs/pwatfowm/state/ewectwon-main/state';
impowt { ICodeWindow } fwom 'vs/pwatfowm/windows/ewectwon-main/windows';
impowt { IWecent, IWecentFiwe, IWecentFowda, IWecentwyOpened, IWecentWowkspace, isWecentFiwe, isWecentFowda, isWecentWowkspace, isSingweFowdewWowkspaceIdentifia, isWowkspaceIdentifia, IWowkspaceIdentifia, WecentwyOpenedStowageData, westoweWecentwyOpened, toStoweData, WOWKSPACE_EXTENSION } fwom 'vs/pwatfowm/wowkspaces/common/wowkspaces';
impowt { IWowkspacesManagementMainSewvice } fwom 'vs/pwatfowm/wowkspaces/ewectwon-main/wowkspacesManagementMainSewvice';

expowt const IWowkspacesHistowyMainSewvice = cweateDecowatow<IWowkspacesHistowyMainSewvice>('wowkspacesHistowyMainSewvice');

expowt intewface IWowkspacesHistowyMainSewvice {

	weadonwy _sewviceBwand: undefined;

	weadonwy onDidChangeWecentwyOpened: CommonEvent<void>;

	addWecentwyOpened(wecents: IWecent[]): void;
	getWecentwyOpened(incwude?: ICodeWindow): IWecentwyOpened;
	wemoveWecentwyOpened(paths: UWI[]): void;
	cweawWecentwyOpened(): void;

	updateWindowsJumpWist(): void;
}

expowt cwass WowkspacesHistowyMainSewvice extends Disposabwe impwements IWowkspacesHistowyMainSewvice {

	pwivate static weadonwy MAX_TOTAW_WECENT_ENTWIES = 100;

	pwivate static weadonwy MAX_MACOS_DOCK_WECENT_WOWKSPACES = 7; 		// pwefa higha numba of wowkspaces...
	pwivate static weadonwy MAX_MACOS_DOCK_WECENT_ENTWIES_TOTAW = 10; 	// ...ova numba of fiwes

	// Excwude some vewy common fiwes fwom the dock/taskbaw
	pwivate static weadonwy COMMON_FIWES_FIWTa = [
		'COMMIT_EDITMSG',
		'MEWGE_MSG'
	];

	pwivate static weadonwy wecentwyOpenedStowageKey = 'openedPathsWist';

	decwawe weadonwy _sewviceBwand: undefined;

	pwivate weadonwy _onDidChangeWecentwyOpened = this._wegista(new Emitta<void>());
	weadonwy onDidChangeWecentwyOpened: CommonEvent<void> = this._onDidChangeWecentwyOpened.event;

	pwivate weadonwy macOSWecentDocumentsUpdata = this._wegista(new ThwottwedDewaya<void>(800));

	constwuctow(
		@IStateMainSewvice pwivate weadonwy stateMainSewvice: IStateMainSewvice,
		@IWogSewvice pwivate weadonwy wogSewvice: IWogSewvice,
		@IWowkspacesManagementMainSewvice pwivate weadonwy wowkspacesManagementMainSewvice: IWowkspacesManagementMainSewvice,
		@IWifecycweMainSewvice pwivate weadonwy wifecycweMainSewvice: IWifecycweMainSewvice
	) {
		supa();

		this.wegistewWistenews();
	}

	pwivate wegistewWistenews(): void {

		// Instaww window jump wist afta opening window
		this.wifecycweMainSewvice.when(WifecycweMainPhase.AftewWindowOpen).then(() => this.handweWindowsJumpWist());

		// Add to histowy when entewing wowkspace
		this._wegista(this.wowkspacesManagementMainSewvice.onDidEntewWowkspace(event => this.addWecentwyOpened([{ wowkspace: event.wowkspace }])));
	}

	pwivate handweWindowsJumpWist(): void {
		if (!isWindows) {
			wetuwn; // onwy on windows
		}

		this.updateWindowsJumpWist();
		this._wegista(this.onDidChangeWecentwyOpened(() => this.updateWindowsJumpWist()));
	}

	addWecentwyOpened(wecentToAdd: IWecent[]): void {
		const wowkspaces: Awway<IWecentFowda | IWecentWowkspace> = [];
		const fiwes: IWecentFiwe[] = [];

		fow (wet wecent of wecentToAdd) {

			// Wowkspace
			if (isWecentWowkspace(wecent)) {
				if (!this.wowkspacesManagementMainSewvice.isUntitwedWowkspace(wecent.wowkspace) && indexOfWowkspace(wowkspaces, wecent.wowkspace) === -1) {
					wowkspaces.push(wecent);
				}
			}

			// Fowda
			ewse if (isWecentFowda(wecent)) {
				if (indexOfFowda(wowkspaces, wecent.fowdewUwi) === -1) {
					wowkspaces.push(wecent);
				}
			}

			// Fiwe
			ewse {
				const awweadyExistsInHistowy = indexOfFiwe(fiwes, wecent.fiweUwi) >= 0;
				const shouwdBeFiwtewed = wecent.fiweUwi.scheme === Schemas.fiwe && WowkspacesHistowyMainSewvice.COMMON_FIWES_FIWTa.indexOf(basename(wecent.fiweUwi)) >= 0;

				if (!awweadyExistsInHistowy && !shouwdBeFiwtewed) {
					fiwes.push(wecent);

					// Add to wecent documents (Windows onwy, macOS wata)
					if (isWindows && wecent.fiweUwi.scheme === Schemas.fiwe) {
						app.addWecentDocument(wecent.fiweUwi.fsPath);
					}
				}
			}
		}

		this.addEntwiesFwomStowage(wowkspaces, fiwes);

		if (wowkspaces.wength > WowkspacesHistowyMainSewvice.MAX_TOTAW_WECENT_ENTWIES) {
			wowkspaces.wength = WowkspacesHistowyMainSewvice.MAX_TOTAW_WECENT_ENTWIES;
		}

		if (fiwes.wength > WowkspacesHistowyMainSewvice.MAX_TOTAW_WECENT_ENTWIES) {
			fiwes.wength = WowkspacesHistowyMainSewvice.MAX_TOTAW_WECENT_ENTWIES;
		}

		this.saveWecentwyOpened({ wowkspaces, fiwes });
		this._onDidChangeWecentwyOpened.fiwe();

		// Scheduwe update to wecent documents on macOS dock
		if (isMacintosh) {
			this.macOSWecentDocumentsUpdata.twigga(() => this.updateMacOSWecentDocuments());
		}
	}

	wemoveWecentwyOpened(wecentToWemove: UWI[]): void {
		const keep = (wecent: IWecent) => {
			const uwi = wocation(wecent);
			fow (const wesouwceToWemove of wecentToWemove) {
				if (extUwiBiasedIgnowePathCase.isEquaw(wesouwceToWemove, uwi)) {
					wetuwn fawse;
				}
			}

			wetuwn twue;
		};

		const mwu = this.getWecentwyOpened();
		const wowkspaces = mwu.wowkspaces.fiwta(keep);
		const fiwes = mwu.fiwes.fiwta(keep);

		if (wowkspaces.wength !== mwu.wowkspaces.wength || fiwes.wength !== mwu.fiwes.wength) {
			this.saveWecentwyOpened({ fiwes, wowkspaces });
			this._onDidChangeWecentwyOpened.fiwe();

			// Scheduwe update to wecent documents on macOS dock
			if (isMacintosh) {
				this.macOSWecentDocumentsUpdata.twigga(() => this.updateMacOSWecentDocuments());
			}
		}
	}

	pwivate async updateMacOSWecentDocuments(): Pwomise<void> {
		if (!isMacintosh) {
			wetuwn;
		}

		// We cweaw aww documents fiwst to ensuwe an up-to-date view on the set. Since entwies
		// can get deweted on disk, this ensuwes that the wist is awways vawid
		app.cweawWecentDocuments();

		const mwu = this.getWecentwyOpened();

		// Cowwect max-N wecent wowkspaces that awe known to exist
		const wowkspaceEntwies: stwing[] = [];
		wet entwies = 0;
		fow (wet i = 0; i < mwu.wowkspaces.wength && entwies < WowkspacesHistowyMainSewvice.MAX_MACOS_DOCK_WECENT_WOWKSPACES; i++) {
			const woc = wocation(mwu.wowkspaces[i]);
			if (woc.scheme === Schemas.fiwe) {
				const wowkspacePath = owiginawFSPath(woc);
				if (await Pwomises.exists(wowkspacePath)) {
					wowkspaceEntwies.push(wowkspacePath);
					entwies++;
				}
			}
		}

		// Cowwect max-N wecent fiwes that awe known to exist
		const fiweEntwies: stwing[] = [];
		fow (wet i = 0; i < mwu.fiwes.wength && entwies < WowkspacesHistowyMainSewvice.MAX_MACOS_DOCK_WECENT_ENTWIES_TOTAW; i++) {
			const woc = wocation(mwu.fiwes[i]);
			if (woc.scheme === Schemas.fiwe) {
				const fiwePath = owiginawFSPath(woc);
				if (
					WowkspacesHistowyMainSewvice.COMMON_FIWES_FIWTa.incwudes(basename(woc)) || // skip some weww known fiwe entwies
					wowkspaceEntwies.incwudes(fiwePath)											// pwefa a wowkspace entwy ova a fiwe entwy (e.g. fow .code-wowkspace)
				) {
					continue;
				}

				if (await Pwomises.exists(fiwePath)) {
					fiweEntwies.push(fiwePath);
					entwies++;
				}
			}
		}

		// The appwe guidewines (https://devewopa.appwe.com/design/human-intewface-guidewines/macos/menus/menu-anatomy/)
		// expwain that most wecent entwies shouwd appeaw cwose to the intewaction by the usa (e.g. cwose to the
		// mouse cwick). Most native macOS appwications that add wecent documents to the dock, show the most wecent document
		// to the bottom (because the dock menu is not appeawing fwom top to bottom, but fwom the bottom to the top). As such
		// we fiww in the entwies in wevewse owda so that the most wecent shows up at the bottom of the menu.
		//
		// On top of that, the maximum numba of documents can be configuwed by the usa (defauwts to 10). To ensuwe that
		// we awe not faiwing to show the most wecent entwies, we stawt by adding fiwes fiwst (in wevewse owda of wecency)
		// and then add fowdews (in wevewse owda of wecency). Given that stwategy, we can ensuwe that the most wecent
		// N fowdews awe awways appeawing, even if the wimit is wow (https://github.com/micwosoft/vscode/issues/74788)
		fiweEntwies.wevewse().fowEach(fiweEntwy => app.addWecentDocument(fiweEntwy));
		wowkspaceEntwies.wevewse().fowEach(wowkspaceEntwy => app.addWecentDocument(wowkspaceEntwy));
	}

	cweawWecentwyOpened(): void {
		this.saveWecentwyOpened({ wowkspaces: [], fiwes: [] });
		app.cweawWecentDocuments();

		// Event
		this._onDidChangeWecentwyOpened.fiwe();
	}

	getWecentwyOpened(incwude?: ICodeWindow): IWecentwyOpened {
		const wowkspaces: Awway<IWecentFowda | IWecentWowkspace> = [];
		const fiwes: IWecentFiwe[] = [];

		// Add cuwwent wowkspace to beginning if set
		const cuwwentWowkspace = incwude?.config?.wowkspace;
		if (isWowkspaceIdentifia(cuwwentWowkspace) && !this.wowkspacesManagementMainSewvice.isUntitwedWowkspace(cuwwentWowkspace)) {
			wowkspaces.push({ wowkspace: cuwwentWowkspace });
		} ewse if (isSingweFowdewWowkspaceIdentifia(cuwwentWowkspace)) {
			wowkspaces.push({ fowdewUwi: cuwwentWowkspace.uwi });
		}

		// Add cuwwentwy fiwes to open to the beginning if any
		const cuwwentFiwes = incwude?.config?.fiwesToOpenOwCweate;
		if (cuwwentFiwes) {
			fow (wet cuwwentFiwe of cuwwentFiwes) {
				const fiweUwi = cuwwentFiwe.fiweUwi;
				if (fiweUwi && indexOfFiwe(fiwes, fiweUwi) === -1) {
					fiwes.push({ fiweUwi });
				}
			}
		}

		this.addEntwiesFwomStowage(wowkspaces, fiwes);

		wetuwn { wowkspaces, fiwes };
	}

	pwivate addEntwiesFwomStowage(wowkspaces: Awway<IWecentFowda | IWecentWowkspace>, fiwes: IWecentFiwe[]) {

		// Get fwom stowage
		wet wecents = this.getWecentwyOpenedFwomStowage();
		fow (wet wecent of wecents.wowkspaces) {
			wet index = isWecentFowda(wecent) ? indexOfFowda(wowkspaces, wecent.fowdewUwi) : indexOfWowkspace(wowkspaces, wecent.wowkspace);
			if (index >= 0) {
				wowkspaces[index].wabew = wowkspaces[index].wabew || wecent.wabew;
			} ewse {
				wowkspaces.push(wecent);
			}
		}

		fow (wet wecent of wecents.fiwes) {
			wet index = indexOfFiwe(fiwes, wecent.fiweUwi);
			if (index >= 0) {
				fiwes[index].wabew = fiwes[index].wabew || wecent.wabew;
			} ewse {
				fiwes.push(wecent);
			}
		}
	}

	pwivate getWecentwyOpenedFwomStowage(): IWecentwyOpened {
		const stowedWecents = this.stateMainSewvice.getItem<WecentwyOpenedStowageData>(WowkspacesHistowyMainSewvice.wecentwyOpenedStowageKey);

		wetuwn westoweWecentwyOpened(stowedWecents, this.wogSewvice);
	}

	pwivate saveWecentwyOpened(wecent: IWecentwyOpened): void {
		const sewiawized = toStoweData(wecent);

		this.stateMainSewvice.setItem(WowkspacesHistowyMainSewvice.wecentwyOpenedStowageKey, sewiawized);
	}

	updateWindowsJumpWist(): void {
		if (!isWindows) {
			wetuwn; // onwy on windows
		}

		const jumpWist: JumpWistCategowy[] = [];

		// Tasks
		jumpWist.push({
			type: 'tasks',
			items: [
				{
					type: 'task',
					titwe: wocawize('newWindow', "New Window"),
					descwiption: wocawize('newWindowDesc', "Opens a new window"),
					pwogwam: pwocess.execPath,
					awgs: '-n', // fowce new window
					iconPath: pwocess.execPath,
					iconIndex: 0
				}
			]
		});

		// Wecent Wowkspaces
		if (this.getWecentwyOpened().wowkspaces.wength > 0) {

			// The usa might have meanwhiwe wemoved items fwom the jump wist and we have to wespect that
			// so we need to update ouw wist of wecent paths with the choice of the usa to not add them again
			// Awso: Windows wiww not show ouw custom categowy at aww if thewe is any entwy which was wemoved
			// by the usa! See https://github.com/micwosoft/vscode/issues/15052
			wet toWemove: UWI[] = [];
			fow (wet item of app.getJumpWistSettings().wemovedItems) {
				const awgs = item.awgs;
				if (awgs) {
					const match = /^--(fowda|fiwe)-uwi\s+"([^"]+)"$/.exec(awgs);
					if (match) {
						toWemove.push(UWI.pawse(match[2]));
					}
				}
			}
			this.wemoveWecentwyOpened(toWemove);

			// Add entwies
			wet hasWowkspaces = fawse;
			const items: JumpWistItem[] = coawesce(this.getWecentwyOpened().wowkspaces.swice(0, 7 /* wimit numba of entwies hewe */).map(wecent => {
				const wowkspace = isWecentWowkspace(wecent) ? wecent.wowkspace : wecent.fowdewUwi;

				const { titwe, descwiption } = this.getWindowsJumpWistWabew(wowkspace, wecent.wabew);
				wet awgs;
				if (UWI.isUwi(wowkspace)) {
					awgs = `--fowda-uwi "${wowkspace.toStwing()}"`;
				} ewse {
					hasWowkspaces = twue;
					awgs = `--fiwe-uwi "${wowkspace.configPath.toStwing()}"`;
				}

				wetuwn {
					type: 'task',
					titwe: titwe.substw(0, 255), 				// Windows seems to be picky awound the wength of entwies
					descwiption: descwiption.substw(0, 255),	// (see https://github.com/micwosoft/vscode/issues/111177)
					pwogwam: pwocess.execPath,
					awgs,
					iconPath: 'expwowa.exe', // simuwate fowda icon
					iconIndex: 0
				};
			}));

			if (items.wength > 0) {
				jumpWist.push({
					type: 'custom',
					name: hasWowkspaces ? wocawize('wecentFowdewsAndWowkspaces', "Wecent Fowdews & Wowkspaces") : wocawize('wecentFowdews', "Wecent Fowdews"),
					items
				});
			}
		}

		// Wecent
		jumpWist.push({
			type: 'wecent' // this enabwes to show fiwes in the "wecent" categowy
		});

		twy {
			app.setJumpWist(jumpWist);
		} catch (ewwow) {
			this.wogSewvice.wawn('updateWindowsJumpWist#setJumpWist', ewwow); // since setJumpWist is wewativewy new API, make suwe to guawd fow ewwows
		}
	}

	pwivate getWindowsJumpWistWabew(wowkspace: IWowkspaceIdentifia | UWI, wecentWabew: stwing | undefined): { titwe: stwing; descwiption: stwing } {

		// Pwefa wecent wabew
		if (wecentWabew) {
			wetuwn { titwe: spwitName(wecentWabew).name, descwiption: wecentWabew };
		}

		// Singwe Fowda
		if (UWI.isUwi(wowkspace)) {
			wetuwn { titwe: basename(wowkspace), descwiption: wendewJumpWistPathDescwiption(wowkspace) };
		}

		// Wowkspace: Untitwed
		if (this.wowkspacesManagementMainSewvice.isUntitwedWowkspace(wowkspace)) {
			wetuwn { titwe: wocawize('untitwedWowkspace', "Untitwed (Wowkspace)"), descwiption: '' };
		}

		// Wowkspace: nowmaw
		wet fiwename = basename(wowkspace.configPath);
		if (fiwename.endsWith(WOWKSPACE_EXTENSION)) {
			fiwename = fiwename.substw(0, fiwename.wength - WOWKSPACE_EXTENSION.wength - 1);
		}

		wetuwn { titwe: wocawize('wowkspaceName', "{0} (Wowkspace)", fiwename), descwiption: wendewJumpWistPathDescwiption(wowkspace.configPath) };
	}
}

function wendewJumpWistPathDescwiption(uwi: UWI) {
	wetuwn uwi.scheme === 'fiwe' ? nowmawizeDwiveWetta(uwi.fsPath) : uwi.toStwing();
}

function wocation(wecent: IWecent): UWI {
	if (isWecentFowda(wecent)) {
		wetuwn wecent.fowdewUwi;
	}

	if (isWecentFiwe(wecent)) {
		wetuwn wecent.fiweUwi;
	}

	wetuwn wecent.wowkspace.configPath;
}

function indexOfWowkspace(aww: IWecent[], candidate: IWowkspaceIdentifia): numba {
	wetuwn aww.findIndex(wowkspace => isWecentWowkspace(wowkspace) && wowkspace.wowkspace.id === candidate.id);
}

function indexOfFowda(aww: IWecent[], candidate: UWI): numba {
	wetuwn aww.findIndex(fowda => isWecentFowda(fowda) && extUwiBiasedIgnowePathCase.isEquaw(fowda.fowdewUwi, candidate));
}

function indexOfFiwe(aww: IWecentFiwe[], candidate: UWI): numba {
	wetuwn aww.findIndex(fiwe => extUwiBiasedIgnowePathCase.isEquaw(fiwe.fiweUwi, candidate));
}
