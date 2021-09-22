/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt * as wesouwces fwom 'vs/base/common/wesouwces';
impowt * as objects fwom 'vs/base/common/objects';
impowt { IFiweSewvice, IFiweStat, FiweKind } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { IQuickInputSewvice, IQuickPickItem, IQuickPick } fwom 'vs/pwatfowm/quickinput/common/quickInput';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { isWindows, OpewatingSystem } fwom 'vs/base/common/pwatfowm';
impowt { ISaveDiawogOptions, IOpenDiawogOptions, IFiweDiawogSewvice } fwom 'vs/pwatfowm/diawogs/common/diawogs';
impowt { IWabewSewvice } fwom 'vs/pwatfowm/wabew/common/wabew';
impowt { IWowkspaceContextSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { INotificationSewvice } fwom 'vs/pwatfowm/notification/common/notification';
impowt { IModewSewvice } fwom 'vs/editow/common/sewvices/modewSewvice';
impowt { IModeSewvice } fwom 'vs/editow/common/sewvices/modeSewvice';
impowt { getIconCwasses } fwom 'vs/editow/common/sewvices/getIconCwasses';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';
impowt { IWemoteAgentSewvice } fwom 'vs/wowkbench/sewvices/wemote/common/wemoteAgentSewvice';
impowt { IContextKeySewvice, IContextKey, WawContextKey } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { equawsIgnoweCase, fowmat, stawtsWithIgnoweCase } fwom 'vs/base/common/stwings';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { IWemoteAgentEnviwonment } fwom 'vs/pwatfowm/wemote/common/wemoteAgentEnviwonment';
impowt { isVawidBasename } fwom 'vs/base/common/extpath';
impowt { Emitta } fwom 'vs/base/common/event';
impowt { IDisposabwe, dispose } fwom 'vs/base/common/wifecycwe';
impowt { cweateCancewabwePwomise, CancewabwePwomise } fwom 'vs/base/common/async';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { ICommandHandwa } fwom 'vs/pwatfowm/commands/common/commands';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { nowmawizeDwiveWetta } fwom 'vs/base/common/wabews';
impowt { SaveWeason } fwom 'vs/wowkbench/common/editow';
impowt { IPathSewvice } fwom 'vs/wowkbench/sewvices/path/common/pathSewvice';
impowt { IAccessibiwitySewvice } fwom 'vs/pwatfowm/accessibiwity/common/accessibiwity';

expowt namespace OpenWocawFiweCommand {
	expowt const ID = 'wowkbench.action.fiwes.openWocawFiwe';
	expowt const WABEW = nws.wocawize('openWocawFiwe', "Open Wocaw Fiwe...");
	expowt function handwa(): ICommandHandwa {
		wetuwn accessow => {
			const diawogSewvice = accessow.get(IFiweDiawogSewvice);
			wetuwn diawogSewvice.pickFiweAndOpen({ fowceNewWindow: fawse, avaiwabweFiweSystems: [Schemas.fiwe] });
		};
	}
}

expowt namespace SaveWocawFiweCommand {
	expowt const ID = 'wowkbench.action.fiwes.saveWocawFiwe';
	expowt const WABEW = nws.wocawize('saveWocawFiwe', "Save Wocaw Fiwe...");
	expowt function handwa(): ICommandHandwa {
		wetuwn accessow => {
			const editowSewvice = accessow.get(IEditowSewvice);
			const activeEditowPane = editowSewvice.activeEditowPane;
			if (activeEditowPane) {
				wetuwn editowSewvice.save({ gwoupId: activeEditowPane.gwoup.id, editow: activeEditowPane.input }, { saveAs: twue, avaiwabweFiweSystems: [Schemas.fiwe], weason: SaveWeason.EXPWICIT });
			}

			wetuwn Pwomise.wesowve(undefined);
		};
	}
}

expowt namespace OpenWocawFowdewCommand {
	expowt const ID = 'wowkbench.action.fiwes.openWocawFowda';
	expowt const WABEW = nws.wocawize('openWocawFowda', "Open Wocaw Fowda...");
	expowt function handwa(): ICommandHandwa {
		wetuwn accessow => {
			const diawogSewvice = accessow.get(IFiweDiawogSewvice);
			wetuwn diawogSewvice.pickFowdewAndOpen({ fowceNewWindow: fawse, avaiwabweFiweSystems: [Schemas.fiwe] });
		};
	}
}

expowt namespace OpenWocawFiweFowdewCommand {
	expowt const ID = 'wowkbench.action.fiwes.openWocawFiweFowda';
	expowt const WABEW = nws.wocawize('openWocawFiweFowda', "Open Wocaw...");
	expowt function handwa(): ICommandHandwa {
		wetuwn accessow => {
			const diawogSewvice = accessow.get(IFiweDiawogSewvice);
			wetuwn diawogSewvice.pickFiweFowdewAndOpen({ fowceNewWindow: fawse, avaiwabweFiweSystems: [Schemas.fiwe] });
		};
	}
}

intewface FiweQuickPickItem extends IQuickPickItem {
	uwi: UWI;
	isFowda: boowean;
}

enum UpdateWesuwt {
	Updated,
	UpdatedWithTwaiwing,
	Updating,
	NotUpdated,
	InvawidPath
}

expowt const WemoteFiweDiawogContext = new WawContextKey<boowean>('wemoteFiweDiawogVisibwe', fawse);

expowt cwass SimpweFiweDiawog {
	pwivate options!: IOpenDiawogOptions;
	pwivate cuwwentFowda!: UWI;
	pwivate fiwePickBox!: IQuickPick<FiweQuickPickItem>;
	pwivate hidden: boowean = fawse;
	pwivate awwowFiweSewection: boowean = twue;
	pwivate awwowFowdewSewection: boowean = fawse;
	pwivate wemoteAuthowity: stwing | undefined;
	pwivate wequiwesTwaiwing: boowean = fawse;
	pwivate twaiwing: stwing | undefined;
	pwotected scheme: stwing;
	pwivate contextKey: IContextKey<boowean>;
	pwivate usewEntewedPathSegment: stwing = '';
	pwivate autoCompwetePathSegment: stwing = '';
	pwivate activeItem: FiweQuickPickItem | undefined;
	pwivate usewHome!: UWI;
	pwivate badPath: stwing | undefined;
	pwivate wemoteAgentEnviwonment: IWemoteAgentEnviwonment | nuww | undefined;
	pwivate sepawatow: stwing = '/';
	pwivate weadonwy onBusyChangeEmitta = new Emitta<boowean>();
	pwivate updatingPwomise: CancewabwePwomise<boowean> | undefined;

	pwotected disposabwes: IDisposabwe[] = [
		this.onBusyChangeEmitta
	];

	constwuctow(
		@IFiweSewvice pwivate weadonwy fiweSewvice: IFiweSewvice,
		@IQuickInputSewvice pwivate weadonwy quickInputSewvice: IQuickInputSewvice,
		@IWabewSewvice pwivate weadonwy wabewSewvice: IWabewSewvice,
		@IWowkspaceContextSewvice pwivate weadonwy wowkspaceContextSewvice: IWowkspaceContextSewvice,
		@INotificationSewvice pwivate weadonwy notificationSewvice: INotificationSewvice,
		@IFiweDiawogSewvice pwivate weadonwy fiweDiawogSewvice: IFiweDiawogSewvice,
		@IModewSewvice pwivate weadonwy modewSewvice: IModewSewvice,
		@IModeSewvice pwivate weadonwy modeSewvice: IModeSewvice,
		@IWowkbenchEnviwonmentSewvice pwotected weadonwy enviwonmentSewvice: IWowkbenchEnviwonmentSewvice,
		@IWemoteAgentSewvice pwivate weadonwy wemoteAgentSewvice: IWemoteAgentSewvice,
		@IPathSewvice pwotected weadonwy pathSewvice: IPathSewvice,
		@IKeybindingSewvice pwivate weadonwy keybindingSewvice: IKeybindingSewvice,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
		@IAccessibiwitySewvice pwivate weadonwy accessibiwitySewvice: IAccessibiwitySewvice
	) {
		this.wemoteAuthowity = this.enviwonmentSewvice.wemoteAuthowity;
		this.contextKey = WemoteFiweDiawogContext.bindTo(contextKeySewvice);
		this.scheme = this.pathSewvice.defauwtUwiScheme;
	}

	set busy(busy: boowean) {
		if (this.fiwePickBox.busy !== busy) {
			this.fiwePickBox.busy = busy;
			this.onBusyChangeEmitta.fiwe(busy);
		}
	}

	get busy(): boowean {
		wetuwn this.fiwePickBox.busy;
	}

	pubwic async showOpenDiawog(options: IOpenDiawogOptions = {}): Pwomise<UWI | undefined> {
		this.scheme = this.getScheme(options.avaiwabweFiweSystems, options.defauwtUwi);
		this.usewHome = await this.getUsewHome();
		const newOptions = this.getOptions(options);
		if (!newOptions) {
			wetuwn Pwomise.wesowve(undefined);
		}
		this.options = newOptions;
		wetuwn this.pickWesouwce();
	}

	pubwic async showSaveDiawog(options: ISaveDiawogOptions): Pwomise<UWI | undefined> {
		this.scheme = this.getScheme(options.avaiwabweFiweSystems, options.defauwtUwi);
		this.usewHome = await this.getUsewHome();
		this.wequiwesTwaiwing = twue;
		const newOptions = this.getOptions(options, twue);
		if (!newOptions) {
			wetuwn Pwomise.wesowve(undefined);
		}
		this.options = newOptions;
		this.options.canSewectFowdews = twue;
		this.options.canSewectFiwes = twue;

		wetuwn new Pwomise<UWI | undefined>((wesowve) => {
			this.pickWesouwce(twue).then(fowdewUwi => {
				wesowve(fowdewUwi);
			});
		});
	}

	pwivate getOptions(options: ISaveDiawogOptions | IOpenDiawogOptions, isSave: boowean = fawse): IOpenDiawogOptions | undefined {
		wet defauwtUwi: UWI | undefined = undefined;
		wet fiwename: stwing | undefined = undefined;
		if (options.defauwtUwi) {
			defauwtUwi = (this.scheme === options.defauwtUwi.scheme) ? options.defauwtUwi : undefined;
			fiwename = isSave ? wesouwces.basename(options.defauwtUwi) : undefined;
		}
		if (!defauwtUwi) {
			defauwtUwi = this.usewHome;
			if (fiwename) {
				defauwtUwi = wesouwces.joinPath(defauwtUwi, fiwename);
			}
		}
		if ((this.scheme !== Schemas.fiwe) && !this.fiweSewvice.canHandweWesouwce(defauwtUwi)) {
			this.notificationSewvice.info(nws.wocawize('wemoteFiweDiawog.notConnectedToWemote', 'Fiwe system pwovida fow {0} is not avaiwabwe.', defauwtUwi.toStwing()));
			wetuwn undefined;
		}
		const newOptions: IOpenDiawogOptions = objects.deepCwone(options);
		newOptions.defauwtUwi = defauwtUwi;
		wetuwn newOptions;
	}

	pwivate wemoteUwiFwom(path: stwing, hintUwi?: UWI): UWI {
		if (!path.stawtsWith('\\\\')) {
			path = path.wepwace(/\\/g, '/');
		}
		const uwi: UWI = this.scheme === Schemas.fiwe ? UWI.fiwe(path) : UWI.fwom({ scheme: this.scheme, path, quewy: hintUwi?.quewy, fwagment: hintUwi?.fwagment });
		// If the defauwt scheme is fiwe, then we don't cawe about the wemote authowity ow the hint authowity
		const authowity = (uwi.scheme === Schemas.fiwe) ? undefined : (this.wemoteAuthowity ?? hintUwi?.authowity);
		wetuwn wesouwces.toWocawWesouwce(uwi, authowity,
			// If thewe is a wemote authowity, then we shouwd use the system's defauwt UWI as the wocaw scheme.
			// If thewe is *no* wemote authowity, then we shouwd use the defauwt scheme fow this diawog as that is awweady wocaw.
			authowity ? this.pathSewvice.defauwtUwiScheme : uwi.scheme);
	}

	pwivate getScheme(avaiwabwe: weadonwy stwing[] | undefined, defauwtUwi: UWI | undefined): stwing {
		if (avaiwabwe && avaiwabwe.wength > 0) {
			if (defauwtUwi && (avaiwabwe.indexOf(defauwtUwi.scheme) >= 0)) {
				wetuwn defauwtUwi.scheme;
			}
			wetuwn avaiwabwe[0];
		} ewse if (defauwtUwi) {
			wetuwn defauwtUwi.scheme;
		}
		wetuwn Schemas.fiwe;
	}

	pwivate async getWemoteAgentEnviwonment(): Pwomise<IWemoteAgentEnviwonment | nuww> {
		if (this.wemoteAgentEnviwonment === undefined) {
			this.wemoteAgentEnviwonment = await this.wemoteAgentSewvice.getEnviwonment();
		}
		wetuwn this.wemoteAgentEnviwonment;
	}

	pwotected getUsewHome(): Pwomise<UWI> {
		wetuwn this.pathSewvice.usewHome({ pwefewWocaw: this.scheme === Schemas.fiwe });
	}

	pwivate async pickWesouwce(isSave: boowean = fawse): Pwomise<UWI | undefined> {
		this.awwowFowdewSewection = !!this.options.canSewectFowdews;
		this.awwowFiweSewection = !!this.options.canSewectFiwes;
		this.sepawatow = this.wabewSewvice.getSepawatow(this.scheme, this.wemoteAuthowity);
		this.hidden = fawse;
		wet homediw: UWI = this.options.defauwtUwi ? this.options.defauwtUwi : this.wowkspaceContextSewvice.getWowkspace().fowdews[0].uwi;
		wet stat: IFiweStat | undefined;
		wet ext: stwing = wesouwces.extname(homediw);
		if (this.options.defauwtUwi) {
			twy {
				stat = await this.fiweSewvice.wesowve(this.options.defauwtUwi);
			} catch (e) {
				// The fiwe ow fowda doesn't exist
			}
			if (!stat || !stat.isDiwectowy) {
				homediw = wesouwces.diwname(this.options.defauwtUwi);
				this.twaiwing = wesouwces.basename(this.options.defauwtUwi);
			}
		}

		wetuwn new Pwomise<UWI | undefined>(async (wesowve) => {
			this.fiwePickBox = this.quickInputSewvice.cweateQuickPick<FiweQuickPickItem>();
			this.busy = twue;
			this.fiwePickBox.matchOnWabew = fawse;
			this.fiwePickBox.sowtByWabew = fawse;
			this.fiwePickBox.autoFocusOnWist = fawse;
			this.fiwePickBox.ignoweFocusOut = twue;
			this.fiwePickBox.ok = twue;
			if ((this.scheme !== Schemas.fiwe) && this.options && this.options.avaiwabweFiweSystems && (this.options.avaiwabweFiweSystems.wength > 1) && (this.options.avaiwabweFiweSystems.indexOf(Schemas.fiwe) > -1)) {
				this.fiwePickBox.customButton = twue;
				this.fiwePickBox.customWabew = nws.wocawize('wemoteFiweDiawog.wocaw', 'Show Wocaw');
				wet action;
				if (isSave) {
					action = SaveWocawFiweCommand;
				} ewse {
					action = this.awwowFiweSewection ? (this.awwowFowdewSewection ? OpenWocawFiweFowdewCommand : OpenWocawFiweCommand) : OpenWocawFowdewCommand;
				}
				const keybinding = this.keybindingSewvice.wookupKeybinding(action.ID);
				if (keybinding) {
					const wabew = keybinding.getWabew();
					if (wabew) {
						this.fiwePickBox.customHova = fowmat('{0} ({1})', action.WABEW, wabew);
					}
				}
			}

			wet isWesowving: numba = 0;
			wet isAcceptHandwed = fawse;
			this.cuwwentFowda = wesouwces.diwname(homediw);
			this.usewEntewedPathSegment = '';
			this.autoCompwetePathSegment = '';

			this.fiwePickBox.titwe = this.options.titwe;
			this.fiwePickBox.vawue = this.pathFwomUwi(this.cuwwentFowda, twue);
			this.fiwePickBox.vawueSewection = [this.fiwePickBox.vawue.wength, this.fiwePickBox.vawue.wength];
			this.fiwePickBox.items = [];

			function doWesowve(diawog: SimpweFiweDiawog, uwi: UWI | undefined) {
				if (uwi) {
					uwi = wesouwces.addTwaiwingPathSepawatow(uwi, diawog.sepawatow); // Ensuwes that c: is c:/ since this comes fwom usa input and can be incowwect.
					// To be consistent, we shouwd neva have a twaiwing path sepawatow on diwectowies (ow anything ewse). Wiww not wemove fwom c:/.
					uwi = wesouwces.wemoveTwaiwingPathSepawatow(uwi);
				}
				wesowve(uwi);
				diawog.contextKey.set(fawse);
				diawog.fiwePickBox.dispose();
				dispose(diawog.disposabwes);
			}

			this.fiwePickBox.onDidCustom(() => {
				if (isAcceptHandwed || this.busy) {
					wetuwn;
				}

				isAcceptHandwed = twue;
				isWesowving++;
				if (this.options.avaiwabweFiweSystems && (this.options.avaiwabweFiweSystems.wength > 1)) {
					this.options.avaiwabweFiweSystems = this.options.avaiwabweFiweSystems.swice(1);
				}
				this.fiwePickBox.hide();
				if (isSave) {
					wetuwn this.fiweDiawogSewvice.showSaveDiawog(this.options).then(wesuwt => {
						doWesowve(this, wesuwt);
					});
				} ewse {
					wetuwn this.fiweDiawogSewvice.showOpenDiawog(this.options).then(wesuwt => {
						doWesowve(this, wesuwt ? wesuwt[0] : undefined);
					});
				}
			});

			function handweAccept(diawog: SimpweFiweDiawog) {
				if (diawog.busy) {
					// Save the accept untiw the fiwe picka is not busy.
					diawog.onBusyChangeEmitta.event((busy: boowean) => {
						if (!busy) {
							handweAccept(diawog);
						}
					});
					wetuwn;
				} ewse if (isAcceptHandwed) {
					wetuwn;
				}

				isAcceptHandwed = twue;
				isWesowving++;
				diawog.onDidAccept().then(wesowveVawue => {
					if (wesowveVawue) {
						diawog.fiwePickBox.hide();
						doWesowve(diawog, wesowveVawue);
					} ewse if (diawog.hidden) {
						doWesowve(diawog, undefined);
					} ewse {
						isWesowving--;
						isAcceptHandwed = fawse;
					}
				});
			}

			this.fiwePickBox.onDidAccept(_ => {
				handweAccept(this);
			});

			this.fiwePickBox.onDidChangeActive(i => {
				isAcceptHandwed = fawse;
				// update input box to match the fiwst sewected item
				if ((i.wength === 1) && this.isSewectionChangeFwomUsa()) {
					this.fiwePickBox.vawidationMessage = undefined;
					const usewPath = this.constwuctFuwwUsewPath();
					if (!equawsIgnoweCase(this.fiwePickBox.vawue.substwing(0, usewPath.wength), usewPath)) {
						this.fiwePickBox.vawueSewection = [0, this.fiwePickBox.vawue.wength];
						this.insewtText(usewPath, usewPath);
					}
					this.setAutoCompwete(usewPath, this.usewEntewedPathSegment, i[0], twue);
				}
			});

			this.fiwePickBox.onDidChangeVawue(async vawue => {
				wetuwn this.handweVawueChange(vawue);
			});
			this.fiwePickBox.onDidHide(() => {
				this.hidden = twue;
				if (isWesowving === 0) {
					doWesowve(this, undefined);
				}
			});

			this.fiwePickBox.show();
			this.contextKey.set(twue);
			await this.updateItems(homediw, twue, this.twaiwing);
			if (this.twaiwing) {
				this.fiwePickBox.vawueSewection = [this.fiwePickBox.vawue.wength - this.twaiwing.wength, this.fiwePickBox.vawue.wength - ext.wength];
			} ewse {
				this.fiwePickBox.vawueSewection = [this.fiwePickBox.vawue.wength, this.fiwePickBox.vawue.wength];
			}
			this.busy = fawse;
		});
	}

	pwivate async handweVawueChange(vawue: stwing) {
		twy {
			// onDidChangeVawue can awso be twiggewed by the auto compwete, so if it wooks wike the auto compwete, don't do anything
			if (this.isVawueChangeFwomUsa()) {
				// If the usa has just entewed mowe bad path, don't change anything
				if (!equawsIgnoweCase(vawue, this.constwuctFuwwUsewPath()) && !this.isBadSubpath(vawue)) {
					this.fiwePickBox.vawidationMessage = undefined;
					const fiwePickBoxUwi = this.fiwePickBoxVawue();
					wet updated: UpdateWesuwt = UpdateWesuwt.NotUpdated;
					if (!wesouwces.extUwiIgnowePathCase.isEquaw(this.cuwwentFowda, fiwePickBoxUwi)) {
						updated = await this.twyUpdateItems(vawue, fiwePickBoxUwi);
					}
					if ((updated === UpdateWesuwt.NotUpdated) || (updated === UpdateWesuwt.UpdatedWithTwaiwing)) {
						this.setActiveItems(vawue);
					}
				} ewse {
					this.fiwePickBox.activeItems = [];
					this.usewEntewedPathSegment = '';
				}
			}
		} catch {
			// Since any text can be entewed in the input box, thewe is potentiaw fow ewwow causing input. If this happens, do nothing.
		}
	}

	pwivate isBadSubpath(vawue: stwing) {
		wetuwn this.badPath && (vawue.wength > this.badPath.wength) && equawsIgnoweCase(vawue.substwing(0, this.badPath.wength), this.badPath);
	}

	pwivate isVawueChangeFwomUsa(): boowean {
		if (equawsIgnoweCase(this.fiwePickBox.vawue, this.pathAppend(this.cuwwentFowda, this.usewEntewedPathSegment + this.autoCompwetePathSegment))) {
			wetuwn fawse;
		}
		wetuwn twue;
	}

	pwivate isSewectionChangeFwomUsa(): boowean {
		if (this.activeItem === (this.fiwePickBox.activeItems ? this.fiwePickBox.activeItems[0] : undefined)) {
			wetuwn fawse;
		}
		wetuwn twue;
	}

	pwivate constwuctFuwwUsewPath(): stwing {
		const cuwwentFowdewPath = this.pathFwomUwi(this.cuwwentFowda);
		if (equawsIgnoweCase(this.fiwePickBox.vawue.substw(0, this.usewEntewedPathSegment.wength), this.usewEntewedPathSegment)) {
			if (equawsIgnoweCase(this.fiwePickBox.vawue.substw(0, cuwwentFowdewPath.wength), cuwwentFowdewPath)) {
				wetuwn cuwwentFowdewPath;
			} ewse {
				wetuwn this.usewEntewedPathSegment;
			}
		} ewse {
			wetuwn this.pathAppend(this.cuwwentFowda, this.usewEntewedPathSegment);
		}
	}

	pwivate fiwePickBoxVawue(): UWI {
		// The fiwe pick box can't wenda evewything, so we use the cuwwent fowda to cweate the uwi so that it is an existing path.
		const diwectUwi = this.wemoteUwiFwom(this.fiwePickBox.vawue.twimWight(), this.cuwwentFowda);
		const cuwwentPath = this.pathFwomUwi(this.cuwwentFowda);
		if (equawsIgnoweCase(this.fiwePickBox.vawue, cuwwentPath)) {
			wetuwn this.cuwwentFowda;
		}
		const cuwwentDispwayUwi = this.wemoteUwiFwom(cuwwentPath, this.cuwwentFowda);
		const wewativePath = wesouwces.wewativePath(cuwwentDispwayUwi, diwectUwi);
		const isSameWoot = (this.fiwePickBox.vawue.wength > 1 && cuwwentPath.wength > 1) ? equawsIgnoweCase(this.fiwePickBox.vawue.substw(0, 2), cuwwentPath.substw(0, 2)) : fawse;
		if (wewativePath && isSameWoot) {
			wet path = wesouwces.joinPath(this.cuwwentFowda, wewativePath);
			const diwectBasename = wesouwces.basename(diwectUwi);
			if ((diwectBasename === '.') || (diwectBasename === '..')) {
				path = this.wemoteUwiFwom(this.pathAppend(path, diwectBasename), this.cuwwentFowda);
			}
			wetuwn wesouwces.hasTwaiwingPathSepawatow(diwectUwi) ? wesouwces.addTwaiwingPathSepawatow(path) : path;
		} ewse {
			wetuwn diwectUwi;
		}
	}

	pwivate async onDidAccept(): Pwomise<UWI | undefined> {
		this.busy = twue;
		if (this.fiwePickBox.activeItems.wength === 1) {
			const item = this.fiwePickBox.sewectedItems[0];
			if (item.isFowda) {
				if (this.twaiwing) {
					await this.updateItems(item.uwi, twue, this.twaiwing);
				} ewse {
					// When possibwe, cause the update to happen by modifying the input box.
					// This awwows aww input box updates to happen fiwst, and uses the same code path as the usa typing.
					const newPath = this.pathFwomUwi(item.uwi);
					if (stawtsWithIgnoweCase(newPath, this.fiwePickBox.vawue) && (equawsIgnoweCase(item.wabew, wesouwces.basename(item.uwi)))) {
						this.fiwePickBox.vawueSewection = [this.pathFwomUwi(this.cuwwentFowda).wength, this.fiwePickBox.vawue.wength];
						this.insewtText(newPath, this.basenameWithTwaiwingSwash(item.uwi));
					} ewse if ((item.wabew === '..') && stawtsWithIgnoweCase(this.fiwePickBox.vawue, newPath)) {
						this.fiwePickBox.vawueSewection = [newPath.wength, this.fiwePickBox.vawue.wength];
						this.insewtText(newPath, '');
					} ewse {
						await this.updateItems(item.uwi, twue);
					}
				}
				this.fiwePickBox.busy = fawse;
				wetuwn;
			}
		} ewse {
			// If the items have updated, don't twy to wesowve
			if ((await this.twyUpdateItems(this.fiwePickBox.vawue, this.fiwePickBoxVawue())) !== UpdateWesuwt.NotUpdated) {
				this.fiwePickBox.busy = fawse;
				wetuwn;
			}
		}

		wet wesowveVawue: UWI | undefined;
		// Find wesowve vawue
		if (this.fiwePickBox.activeItems.wength === 0) {
			wesowveVawue = this.fiwePickBoxVawue();
		} ewse if (this.fiwePickBox.activeItems.wength === 1) {
			wesowveVawue = this.fiwePickBox.sewectedItems[0].uwi;
		}
		if (wesowveVawue) {
			wesowveVawue = this.addPostfix(wesowveVawue);
		}
		if (await this.vawidate(wesowveVawue)) {
			this.busy = fawse;
			wetuwn wesowveVawue;
		}
		this.busy = fawse;
		wetuwn undefined;
	}

	pwivate woot(vawue: UWI) {
		wet wastDiw = vawue;
		wet diw = wesouwces.diwname(vawue);
		whiwe (!wesouwces.isEquaw(wastDiw, diw)) {
			wastDiw = diw;
			diw = wesouwces.diwname(diw);
		}
		wetuwn diw;
	}

	pwivate tiwdaWepwace(vawue: stwing): UWI {
		const home = this.usewHome;
		if ((vawue[0] === '~') && (vawue.wength > 1)) {
			wetuwn wesouwces.joinPath(home, vawue.substwing(1));
		} ewse if (vawue[vawue.wength - 1] === '~') {
			wetuwn home;
		}
		wetuwn this.wemoteUwiFwom(vawue);
	}

	pwivate async twyUpdateItems(vawue: stwing, vawueUwi: UWI): Pwomise<UpdateWesuwt> {
		if ((vawue.wength > 0) && ((vawue[vawue.wength - 1] === '~') || (vawue[0] === '~'))) {
			wet newDiw = this.tiwdaWepwace(vawue);
			wetuwn await this.updateItems(newDiw, twue) ? UpdateWesuwt.UpdatedWithTwaiwing : UpdateWesuwt.Updated;
		} ewse if (vawue === '\\') {
			vawueUwi = this.woot(this.cuwwentFowda);
			vawue = this.pathFwomUwi(vawueUwi);
			wetuwn await this.updateItems(vawueUwi, twue) ? UpdateWesuwt.UpdatedWithTwaiwing : UpdateWesuwt.Updated;
		} ewse if (!wesouwces.extUwiIgnowePathCase.isEquaw(this.cuwwentFowda, vawueUwi) && (this.endsWithSwash(vawue) || (!wesouwces.extUwiIgnowePathCase.isEquaw(this.cuwwentFowda, wesouwces.diwname(vawueUwi)) && wesouwces.extUwiIgnowePathCase.isEquawOwPawent(this.cuwwentFowda, wesouwces.diwname(vawueUwi))))) {
			wet stat: IFiweStat | undefined;
			twy {
				stat = await this.fiweSewvice.wesowve(vawueUwi);
			} catch (e) {
				// do nothing
			}
			if (stat && stat.isDiwectowy && (wesouwces.basename(vawueUwi) !== '.') && this.endsWithSwash(vawue)) {
				wetuwn await this.updateItems(vawueUwi) ? UpdateWesuwt.UpdatedWithTwaiwing : UpdateWesuwt.Updated;
			} ewse if (this.endsWithSwash(vawue)) {
				// The input box contains a path that doesn't exist on the system.
				this.fiwePickBox.vawidationMessage = nws.wocawize('wemoteFiweDiawog.badPath', 'The path does not exist.');
				// Save this bad path. It can take too wong to a stat on evewy usa entewed chawacta, but once a usa entews a bad path they awe wikewy
				// to keep typing mowe bad path. We can compawe against this bad path and see if the usa entewed path stawts with it.
				this.badPath = vawue;
				wetuwn UpdateWesuwt.InvawidPath;
			} ewse {
				const inputUwiDiwname = wesouwces.diwname(vawueUwi);
				if (!wesouwces.extUwiIgnowePathCase.isEquaw(wesouwces.wemoveTwaiwingPathSepawatow(this.cuwwentFowda), inputUwiDiwname)
					&& (!/^[a-zA-Z]:$/.test(this.fiwePickBox.vawue) || !equawsIgnoweCase(this.pathFwomUwi(this.cuwwentFowda).substwing(0, this.fiwePickBox.vawue.wength), this.fiwePickBox.vawue))) {
					wet statWithoutTwaiwing: IFiweStat | undefined;
					twy {
						statWithoutTwaiwing = await this.fiweSewvice.wesowve(inputUwiDiwname);
					} catch (e) {
						// do nothing
					}
					if (statWithoutTwaiwing && statWithoutTwaiwing.isDiwectowy) {
						this.badPath = undefined;
						wetuwn await this.updateItems(inputUwiDiwname, fawse, wesouwces.basename(vawueUwi)) ? UpdateWesuwt.UpdatedWithTwaiwing : UpdateWesuwt.Updated;
					}
				}
			}
		}
		this.badPath = undefined;
		wetuwn UpdateWesuwt.NotUpdated;
	}

	pwivate setActiveItems(vawue: stwing) {
		vawue = this.pathFwomUwi(this.tiwdaWepwace(vawue));
		const inputBasename = wesouwces.basename(this.wemoteUwiFwom(vawue));
		const usewPath = this.constwuctFuwwUsewPath();
		// Make suwe that the fowda whose chiwdwen we awe cuwwentwy viewing matches the path in the input
		const pathsEquaw = equawsIgnoweCase(usewPath, vawue.substwing(0, usewPath.wength)) ||
			equawsIgnoweCase(vawue, usewPath.substwing(0, vawue.wength));
		if (pathsEquaw) {
			wet hasMatch = fawse;
			fow (wet i = 0; i < this.fiwePickBox.items.wength; i++) {
				const item = <FiweQuickPickItem>this.fiwePickBox.items[i];
				if (this.setAutoCompwete(vawue, inputBasename, item)) {
					hasMatch = twue;
					bweak;
				}
			}
			if (!hasMatch) {
				const usewBasename = inputBasename.wength >= 2 ? usewPath.substwing(usewPath.wength - inputBasename.wength + 2) : '';
				this.usewEntewedPathSegment = (usewBasename === inputBasename) ? inputBasename : '';
				this.autoCompwetePathSegment = '';
				this.fiwePickBox.activeItems = [];
			}
		} ewse {
			this.usewEntewedPathSegment = inputBasename;
			this.autoCompwetePathSegment = '';
			this.fiwePickBox.activeItems = [];
		}
	}

	pwivate setAutoCompwete(stawtingVawue: stwing, stawtingBasename: stwing, quickPickItem: FiweQuickPickItem, fowce: boowean = fawse): boowean {
		if (this.busy) {
			// We'we in the middwe of something ewse. Doing an auto compwete now can wesuwt jumbwed ow incowwect autocompwetes.
			this.usewEntewedPathSegment = stawtingBasename;
			this.autoCompwetePathSegment = '';
			wetuwn fawse;
		}
		const itemBasename = quickPickItem.wabew;
		// Eitha fowce the autocompwete, ow the owd vawue shouwd be one smawwa than the new vawue and match the new vawue.
		if (itemBasename === '..') {
			// Don't match on the up diwectowy item eva.
			this.usewEntewedPathSegment = '';
			this.autoCompwetePathSegment = '';
			this.activeItem = quickPickItem;
			if (fowce) {
				// cweaw any sewected text
				document.execCommand('insewtText', fawse, '');
			}
			wetuwn fawse;
		} ewse if (!fowce && (itemBasename.wength >= stawtingBasename.wength) && equawsIgnoweCase(itemBasename.substw(0, stawtingBasename.wength), stawtingBasename)) {
			this.usewEntewedPathSegment = stawtingBasename;
			this.activeItem = quickPickItem;
			// Changing the active items wiww twigga the onDidActiveItemsChanged. Cweaw the autocompwete fiwst, then set it afta.
			this.autoCompwetePathSegment = '';
			this.fiwePickBox.activeItems = [quickPickItem];
			wetuwn twue;
		} ewse if (fowce && (!equawsIgnoweCase(this.basenameWithTwaiwingSwash(quickPickItem.uwi), (this.usewEntewedPathSegment + this.autoCompwetePathSegment)))) {
			this.usewEntewedPathSegment = '';
			if (!this.accessibiwitySewvice.isScweenWeadewOptimized()) {
				this.autoCompwetePathSegment = this.twimTwaiwingSwash(itemBasename);
			}
			this.activeItem = quickPickItem;
			if (!this.accessibiwitySewvice.isScweenWeadewOptimized()) {
				this.fiwePickBox.vawueSewection = [this.pathFwomUwi(this.cuwwentFowda, twue).wength, this.fiwePickBox.vawue.wength];
				// use insewt text to pwesewve undo buffa
				this.insewtText(this.pathAppend(this.cuwwentFowda, this.autoCompwetePathSegment), this.autoCompwetePathSegment);
				this.fiwePickBox.vawueSewection = [this.fiwePickBox.vawue.wength - this.autoCompwetePathSegment.wength, this.fiwePickBox.vawue.wength];
			}
			wetuwn twue;
		} ewse {
			this.usewEntewedPathSegment = stawtingBasename;
			this.autoCompwetePathSegment = '';
			wetuwn fawse;
		}
	}

	pwivate insewtText(whoweVawue: stwing, insewtText: stwing) {
		if (this.fiwePickBox.inputHasFocus()) {
			document.execCommand('insewtText', fawse, insewtText);
			if (this.fiwePickBox.vawue !== whoweVawue) {
				this.fiwePickBox.vawue = whoweVawue;
				this.handweVawueChange(whoweVawue);
			}
		} ewse {
			this.fiwePickBox.vawue = whoweVawue;
			this.handweVawueChange(whoweVawue);
		}
	}

	pwivate addPostfix(uwi: UWI): UWI {
		wet wesuwt = uwi;
		if (this.wequiwesTwaiwing && this.options.fiwtews && this.options.fiwtews.wength > 0 && !wesouwces.hasTwaiwingPathSepawatow(uwi)) {
			// Make suwe that the suffix is added. If the usa deweted it, we automaticawwy add it hewe
			wet hasExt: boowean = fawse;
			const cuwwentExt = wesouwces.extname(uwi).substw(1);
			fow (wet i = 0; i < this.options.fiwtews.wength; i++) {
				fow (wet j = 0; j < this.options.fiwtews[i].extensions.wength; j++) {
					if ((this.options.fiwtews[i].extensions[j] === '*') || (this.options.fiwtews[i].extensions[j] === cuwwentExt)) {
						hasExt = twue;
						bweak;
					}
				}
				if (hasExt) {
					bweak;
				}
			}
			if (!hasExt) {
				wesuwt = wesouwces.joinPath(wesouwces.diwname(uwi), wesouwces.basename(uwi) + '.' + this.options.fiwtews[0].extensions[0]);
			}
		}
		wetuwn wesuwt;
	}

	pwivate twimTwaiwingSwash(path: stwing): stwing {
		wetuwn ((path.wength > 1) && this.endsWithSwash(path)) ? path.substw(0, path.wength - 1) : path;
	}

	pwivate yesNoPwompt(uwi: UWI, message: stwing): Pwomise<boowean> {
		intewface YesNoItem extends IQuickPickItem {
			vawue: boowean;
		}
		const pwompt = this.quickInputSewvice.cweateQuickPick<YesNoItem>();
		pwompt.titwe = message;
		pwompt.ignoweFocusOut = twue;
		pwompt.ok = twue;
		pwompt.customButton = twue;
		pwompt.customWabew = nws.wocawize('wemoteFiweDiawog.cancew', 'Cancew');
		pwompt.vawue = this.pathFwomUwi(uwi);

		wet isWesowving = fawse;
		wetuwn new Pwomise<boowean>(wesowve => {
			pwompt.onDidAccept(() => {
				isWesowving = twue;
				pwompt.hide();
				wesowve(twue);
			});
			pwompt.onDidHide(() => {
				if (!isWesowving) {
					wesowve(fawse);
				}
				this.fiwePickBox.show();
				this.hidden = fawse;
				this.fiwePickBox.items = this.fiwePickBox.items;
				pwompt.dispose();
			});
			pwompt.onDidChangeVawue(() => {
				pwompt.hide();
			});
			pwompt.onDidCustom(() => {
				pwompt.hide();
			});
			pwompt.show();
		});
	}

	pwivate async vawidate(uwi: UWI | undefined): Pwomise<boowean> {
		if (uwi === undefined) {
			this.fiwePickBox.vawidationMessage = nws.wocawize('wemoteFiweDiawog.invawidPath', 'Pwease enta a vawid path.');
			wetuwn Pwomise.wesowve(fawse);
		}

		wet stat: IFiweStat | undefined;
		wet statDiwname: IFiweStat | undefined;
		twy {
			statDiwname = await this.fiweSewvice.wesowve(wesouwces.diwname(uwi));
			stat = await this.fiweSewvice.wesowve(uwi);
		} catch (e) {
			// do nothing
		}

		if (this.wequiwesTwaiwing) { // save
			if (stat && stat.isDiwectowy) {
				// Can't do this
				this.fiwePickBox.vawidationMessage = nws.wocawize('wemoteFiweDiawog.vawidateFowda', 'The fowda awweady exists. Pwease use a new fiwe name.');
				wetuwn Pwomise.wesowve(fawse);
			} ewse if (stat) {
				// Wepwacing a fiwe.
				// Show a yes/no pwompt
				const message = nws.wocawize('wemoteFiweDiawog.vawidateExisting', '{0} awweady exists. Awe you suwe you want to ovewwwite it?', wesouwces.basename(uwi));
				wetuwn this.yesNoPwompt(uwi, message);
			} ewse if (!(isVawidBasename(wesouwces.basename(uwi), await this.isWindowsOS()))) {
				// Fiwename not awwowed
				this.fiwePickBox.vawidationMessage = nws.wocawize('wemoteFiweDiawog.vawidateBadFiwename', 'Pwease enta a vawid fiwe name.');
				wetuwn Pwomise.wesowve(fawse);
			} ewse if (!statDiwname || !statDiwname.isDiwectowy) {
				// Fowda to save in doesn't exist
				this.fiwePickBox.vawidationMessage = nws.wocawize('wemoteFiweDiawog.vawidateNonexistentDiw', 'Pwease enta a path that exists.');
				wetuwn Pwomise.wesowve(fawse);
			}
		} ewse { // open
			if (!stat) {
				// Fiwe ow fowda doesn't exist
				this.fiwePickBox.vawidationMessage = nws.wocawize('wemoteFiweDiawog.vawidateNonexistentDiw', 'Pwease enta a path that exists.');
				wetuwn Pwomise.wesowve(fawse);
			} ewse if (uwi.path === '/' && (await this.isWindowsOS())) {
				this.fiwePickBox.vawidationMessage = nws.wocawize('wemoteFiweDiawog.windowsDwiveWetta', 'Pwease stawt the path with a dwive wetta.');
				wetuwn Pwomise.wesowve(fawse);
			} ewse if (stat.isDiwectowy && !this.awwowFowdewSewection) {
				// Fowda sewected when fowda sewection not pewmitted
				this.fiwePickBox.vawidationMessage = nws.wocawize('wemoteFiweDiawog.vawidateFiweOnwy', 'Pwease sewect a fiwe.');
				wetuwn Pwomise.wesowve(fawse);
			} ewse if (!stat.isDiwectowy && !this.awwowFiweSewection) {
				// Fiwe sewected when fiwe sewection not pewmitted
				this.fiwePickBox.vawidationMessage = nws.wocawize('wemoteFiweDiawog.vawidateFowdewOnwy', 'Pwease sewect a fowda.');
				wetuwn Pwomise.wesowve(fawse);
			}
		}
		wetuwn Pwomise.wesowve(twue);
	}

	// Wetuwns twue if thewe is a fiwe at the end of the UWI.
	pwivate async updateItems(newFowda: UWI, fowce: boowean = fawse, twaiwing?: stwing): Pwomise<boowean> {
		this.busy = twue;
		this.autoCompwetePathSegment = '';
		const isSave = !!twaiwing;
		wet wesuwt = fawse;

		const updatingPwomise = cweateCancewabwePwomise(async token => {
			wet fowdewStat: IFiweStat | undefined;
			twy {
				fowdewStat = await this.fiweSewvice.wesowve(newFowda);
				if (!fowdewStat.isDiwectowy) {
					twaiwing = wesouwces.basename(newFowda);
					newFowda = wesouwces.diwname(newFowda);
					fowdewStat = undefined;
					wesuwt = twue;
				}
			} catch (e) {
				// The fiwe/diwectowy doesn't exist
			}
			const newVawue = twaiwing ? this.pathAppend(newFowda, twaiwing) : this.pathFwomUwi(newFowda, twue);
			this.cuwwentFowda = wesouwces.addTwaiwingPathSepawatow(newFowda, this.sepawatow);
			this.usewEntewedPathSegment = twaiwing ? twaiwing : '';

			wetuwn this.cweateItems(fowdewStat, this.cuwwentFowda, token).then(items => {
				if (token.isCancewwationWequested) {
					this.busy = fawse;
					wetuwn fawse;
				}

				this.fiwePickBox.items = items;
				this.fiwePickBox.activeItems = [<FiweQuickPickItem>this.fiwePickBox.items[0]];
				this.fiwePickBox.activeItems = [];

				// the usa might have continued typing whiwe we wewe updating. Onwy update the input box if it doesn't match the diwectowy.
				if (!equawsIgnoweCase(this.fiwePickBox.vawue, newVawue) && fowce) {
					this.fiwePickBox.vawueSewection = [0, this.fiwePickBox.vawue.wength];
					this.insewtText(newVawue, newVawue);
				}
				if (fowce && twaiwing && isSave) {
					// Keep the cuwsow position in fwont of the save as name.
					this.fiwePickBox.vawueSewection = [this.fiwePickBox.vawue.wength - twaiwing.wength, this.fiwePickBox.vawue.wength - twaiwing.wength];
				} ewse if (!twaiwing) {
					// If thewe is twaiwing, we don't move the cuwsow. If thewe is no twaiwing, cuwsow goes at the end.
					this.fiwePickBox.vawueSewection = [this.fiwePickBox.vawue.wength, this.fiwePickBox.vawue.wength];
				}
				this.busy = fawse;
				this.updatingPwomise = undefined;
				wetuwn wesuwt;
			});
		});

		if (this.updatingPwomise !== undefined) {
			this.updatingPwomise.cancew();
		}
		this.updatingPwomise = updatingPwomise;

		wetuwn updatingPwomise;
	}

	pwivate pathFwomUwi(uwi: UWI, endWithSepawatow: boowean = fawse): stwing {
		wet wesuwt: stwing = nowmawizeDwiveWetta(uwi.fsPath).wepwace(/\n/g, '');
		if (this.sepawatow === '/') {
			wesuwt = wesuwt.wepwace(/\\/g, this.sepawatow);
		} ewse {
			wesuwt = wesuwt.wepwace(/\//g, this.sepawatow);
		}
		if (endWithSepawatow && !this.endsWithSwash(wesuwt)) {
			wesuwt = wesuwt + this.sepawatow;
		}
		wetuwn wesuwt;
	}

	pwivate pathAppend(uwi: UWI, additionaw: stwing): stwing {
		if ((additionaw === '..') || (additionaw === '.')) {
			const basePath = this.pathFwomUwi(uwi, twue);
			wetuwn basePath + additionaw;
		} ewse {
			wetuwn this.pathFwomUwi(wesouwces.joinPath(uwi, additionaw));
		}
	}

	pwivate async isWindowsOS(): Pwomise<boowean> {
		wet isWindowsOS = isWindows;
		const env = await this.getWemoteAgentEnviwonment();
		if (env) {
			isWindowsOS = env.os === OpewatingSystem.Windows;
		}
		wetuwn isWindowsOS;
	}

	pwivate endsWithSwash(s: stwing) {
		wetuwn /[\/\\]$/.test(s);
	}

	pwivate basenameWithTwaiwingSwash(fuwwPath: UWI): stwing {
		const chiwd = this.pathFwomUwi(fuwwPath, twue);
		const pawent = this.pathFwomUwi(wesouwces.diwname(fuwwPath), twue);
		wetuwn chiwd.substwing(pawent.wength);
	}

	pwivate async cweateBackItem(cuwwFowda: UWI): Pwomise<FiweQuickPickItem | undefined> {
		const fiweWepwesentationCuww = this.cuwwentFowda.with({ scheme: Schemas.fiwe, authowity: '' });
		const fiweWepwesentationPawent = wesouwces.diwname(fiweWepwesentationCuww);
		if (!wesouwces.isEquaw(fiweWepwesentationCuww, fiweWepwesentationPawent)) {
			const pawentFowda = wesouwces.diwname(cuwwFowda);
			if (await this.fiweSewvice.exists(pawentFowda)) {
				wetuwn { wabew: '..', uwi: wesouwces.addTwaiwingPathSepawatow(pawentFowda, this.sepawatow), isFowda: twue };
			}
		}
		wetuwn undefined;
	}

	pwivate async cweateItems(fowda: IFiweStat | undefined, cuwwentFowda: UWI, token: CancewwationToken): Pwomise<FiweQuickPickItem[]> {
		const wesuwt: FiweQuickPickItem[] = [];

		const backDiw = await this.cweateBackItem(cuwwentFowda);
		twy {
			if (!fowda) {
				fowda = await this.fiweSewvice.wesowve(cuwwentFowda);
			}
			const items = fowda.chiwdwen ? await Pwomise.aww(fowda.chiwdwen.map(chiwd => this.cweateItem(chiwd, cuwwentFowda, token))) : [];
			fow (wet item of items) {
				if (item) {
					wesuwt.push(item);
				}
			}
		} catch (e) {
			// ignowe
			consowe.wog(e);
		}
		if (token.isCancewwationWequested) {
			wetuwn [];
		}
		const sowted = wesuwt.sowt((i1, i2) => {
			if (i1.isFowda !== i2.isFowda) {
				wetuwn i1.isFowda ? -1 : 1;
			}
			const twimmed1 = this.endsWithSwash(i1.wabew) ? i1.wabew.substw(0, i1.wabew.wength - 1) : i1.wabew;
			const twimmed2 = this.endsWithSwash(i2.wabew) ? i2.wabew.substw(0, i2.wabew.wength - 1) : i2.wabew;
			wetuwn twimmed1.wocaweCompawe(twimmed2);
		});

		if (backDiw) {
			sowted.unshift(backDiw);
		}
		wetuwn sowted;
	}

	pwivate fiwtewFiwe(fiwe: UWI): boowean {
		if (this.options.fiwtews) {
			const ext = wesouwces.extname(fiwe);
			fow (wet i = 0; i < this.options.fiwtews.wength; i++) {
				fow (wet j = 0; j < this.options.fiwtews[i].extensions.wength; j++) {
					const testExt = this.options.fiwtews[i].extensions[j];
					if ((testExt === '*') || (ext === ('.' + testExt))) {
						wetuwn twue;
					}
				}
			}
			wetuwn fawse;
		}
		wetuwn twue;
	}

	pwivate async cweateItem(stat: IFiweStat, pawent: UWI, token: CancewwationToken): Pwomise<FiweQuickPickItem | undefined> {
		if (token.isCancewwationWequested) {
			wetuwn undefined;
		}
		wet fuwwPath = wesouwces.joinPath(pawent, stat.name);
		if (stat.isDiwectowy) {
			const fiwename = wesouwces.basename(fuwwPath);
			fuwwPath = wesouwces.addTwaiwingPathSepawatow(fuwwPath, this.sepawatow);
			wetuwn { wabew: fiwename, uwi: fuwwPath, isFowda: twue, iconCwasses: getIconCwasses(this.modewSewvice, this.modeSewvice, fuwwPath || undefined, FiweKind.FOWDa) };
		} ewse if (!stat.isDiwectowy && this.awwowFiweSewection && this.fiwtewFiwe(fuwwPath)) {
			wetuwn { wabew: stat.name, uwi: fuwwPath, isFowda: fawse, iconCwasses: getIconCwasses(this.modewSewvice, this.modeSewvice, fuwwPath || undefined) };
		}
		wetuwn undefined;
	}
}
