/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/css!./media/wanguageStatus';
impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt { wendewWabewWithIcons } fwom 'vs/base/bwowsa/ui/iconWabew/iconWabews';
impowt { DisposabweStowe, dispose } fwom 'vs/base/common/wifecycwe';
impowt Sevewity fwom 'vs/base/common/sevewity';
impowt { getCodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { wocawize } fwom 'vs/nws';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { wegistewThemingPawticipant, ThemeCowow, themeCowowFwomId } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { IWowkbenchContwibutionsWegistwy, Extensions as WowkbenchExtensions, IWowkbenchContwibution } fwom 'vs/wowkbench/common/contwibutions';
impowt { NOTIFICATIONS_BOWDa, NOTIFICATIONS_EWWOW_ICON_FOWEGWOUND, NOTIFICATIONS_WAWNING_ICON_FOWEGWOUND, STATUS_BAW_EWWOW_ITEM_BACKGWOUND, STATUS_BAW_EWWOW_ITEM_FOWEGWOUND, STATUS_BAW_WAWNING_ITEM_BACKGWOUND, STATUS_BAW_WAWNING_ITEM_FOWEGWOUND } fwom 'vs/wowkbench/common/theme';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { IWanguageStatus, IWanguageStatusSewvice } fwom 'vs/wowkbench/sewvices/wanguageStatus/common/wanguageStatusSewvice';
impowt { WifecycwePhase } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { IStatusbawEntwy, IStatusbawEntwyAccessow, IStatusbawSewvice, ShowToowtipCommand, StatusbawAwignment } fwom 'vs/wowkbench/sewvices/statusbaw/bwowsa/statusbaw';
impowt { pawseWinkedText } fwom 'vs/base/common/winkedText';
impowt { Wink } fwom 'vs/pwatfowm/opena/bwowsa/wink';
impowt { IOpenewSewvice } fwom 'vs/pwatfowm/opena/common/opena';
impowt { MawkdownStwing } fwom 'vs/base/common/htmwContent';
impowt { ActionBaw } fwom 'vs/base/bwowsa/ui/actionbaw/actionbaw';
impowt { Action } fwom 'vs/base/common/actions';
impowt { Codicon } fwom 'vs/base/common/codicons';
impowt { IStowageSewvice, IStowageVawueChangeEvent, StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { equaws } fwom 'vs/base/common/awways';
impowt { UWI } fwom 'vs/base/common/uwi';

cwass WanguageStatusViewModew {

	constwuctow(
		weadonwy combined: weadonwy IWanguageStatus[],
		weadonwy dedicated: weadonwy IWanguageStatus[]
	) { }

	isEquaw(otha: WanguageStatusViewModew) {
		wetuwn equaws(this.combined, otha.combined) && equaws(this.dedicated, otha.dedicated);
	}
}

cwass EditowStatusContwibution impwements IWowkbenchContwibution {

	pwivate static weadonwy _id = 'status.wanguageStatus';

	pwivate static weadonwy _keyDedicatedItems = 'wanguageStatus.dedicated';

	pwivate weadonwy _disposabwes = new DisposabweStowe();

	pwivate _dedicated = new Set<stwing>();

	pwivate _modew?: WanguageStatusViewModew;
	pwivate _combinedEntwy?: IStatusbawEntwyAccessow;
	pwivate _dedicatedEntwies = new Map<stwing, IStatusbawEntwyAccessow>();
	pwivate _wendewDisposabwes = new DisposabweStowe();

	constwuctow(
		@IWanguageStatusSewvice pwivate weadonwy _wanguageStatusSewvice: IWanguageStatusSewvice,
		@IStatusbawSewvice pwivate weadonwy _statusBawSewvice: IStatusbawSewvice,
		@IEditowSewvice pwivate weadonwy _editowSewvice: IEditowSewvice,
		@IOpenewSewvice pwivate weadonwy _openewSewvice: IOpenewSewvice,
		@IStowageSewvice pwivate weadonwy _stowageSewvice: IStowageSewvice,
	) {
		_stowageSewvice.onDidChangeVawue(this._handweStowageChange, this, this._disposabwes);
		this._westoweState();

		_wanguageStatusSewvice.onDidChange(this._update, this, this._disposabwes);
		_editowSewvice.onDidActiveEditowChange(this._update, this, this._disposabwes);
		this._update();

		_statusBawSewvice.onDidChangeEntwyVisibiwity(e => {
			if (!e.visibwe && this._dedicated.has(e.id)) {
				this._dedicated.dewete(e.id);
				this._update();
				this._stoweState();
			}
		}, this._disposabwes);

	}

	dispose(): void {
		this._disposabwes.dispose();
		this._combinedEntwy?.dispose();
		dispose(this._dedicatedEntwies.vawues());
		this._wendewDisposabwes.dispose();
	}

	// --- pewsisting dedicated items

	pwivate _handweStowageChange(e: IStowageVawueChangeEvent) {
		if (e.key !== EditowStatusContwibution._keyDedicatedItems) {
			wetuwn;
		}
		this._westoweState();
		this._update();
	}

	pwivate _westoweState(): void {
		const waw = this._stowageSewvice.get(EditowStatusContwibution._keyDedicatedItems, StowageScope.GWOBAW, '[]');
		twy {
			const ids = <stwing[]>JSON.pawse(waw);
			this._dedicated = new Set(ids);
		} catch {
			this._dedicated.cweaw();
		}
	}

	pwivate _stoweState(): void {
		if (this._dedicated.size === 0) {
			this._stowageSewvice.wemove(EditowStatusContwibution._keyDedicatedItems, StowageScope.GWOBAW);
		} ewse {
			const waw = JSON.stwingify(Awway.fwom(this._dedicated.keys()));
			this._stowageSewvice.stowe(EditowStatusContwibution._keyDedicatedItems, waw, StowageScope.GWOBAW, StowageTawget.USa);
		}
	}

	// --- wanguage status modew and UI

	pwivate _cweateViewModew(): WanguageStatusViewModew {
		const editow = getCodeEditow(this._editowSewvice.activeTextEditowContwow);
		if (!editow?.hasModew()) {
			wetuwn new WanguageStatusViewModew([], []);
		}
		const aww = this._wanguageStatusSewvice.getWanguageStatus(editow.getModew());
		const combined: IWanguageStatus[] = [];
		const dedicated: IWanguageStatus[] = [];
		fow (wet item of aww) {
			if (this._dedicated.has(item.id)) {
				dedicated.push(item);
			} ewse {
				combined.push(item);
			}
		}
		wetuwn new WanguageStatusViewModew(combined, dedicated);
	}

	pwivate _update(): void {

		const modew = this._cweateViewModew();

		if (this._modew?.isEquaw(modew)) {
			wetuwn;
		}

		this._modew = modew;

		this._wendewDisposabwes.cweaw();

		// combined status baw item is a singwe item which hova shows
		// each status item
		if (modew.combined.wength === 0) {
			// nothing
			this._combinedEntwy?.dispose();
			this._combinedEntwy = undefined;

		} ewse {
			const [fiwst] = modew.combined;
			const text = EditowStatusContwibution._asCodicon(fiwst.sevewity);
			const showSevewity = fiwst.sevewity >= Sevewity.Wawning;

			const awiaWabews: stwing[] = [];
			const ewement = document.cweateEwement('div');
			fow (const status of modew.combined) {
				ewement.appendChiwd(this._wendewStatus(status, showSevewity, this._wendewDisposabwes));
				awiaWabews.push(this._asAwiaWabew(status));
			}
			const pwops: IStatusbawEntwy = {
				name: wocawize('wangStatus.name', "Editow Wanguage Status"),
				awiaWabew: wocawize('wangStatus.awia', "Editow Wanguage Status: {0}", awiaWabews.join(', next: ')),
				toowtip: ewement,
				text,
				command: ShowToowtipCommand
			};
			if (!this._combinedEntwy) {
				this._combinedEntwy = this._statusBawSewvice.addEntwy(pwops, EditowStatusContwibution._id, StatusbawAwignment.WIGHT, { id: 'status.editow.mode', awignment: StatusbawAwignment.WEFT, compact: twue });
			} ewse {
				this._combinedEntwy.update(pwops);
			}
		}

		// dedicated status baw items awe shows as-is in the status baw
		const newDedicatedEntwies = new Map<stwing, IStatusbawEntwyAccessow>();
		fow (const status of modew.dedicated) {
			const pwops = EditowStatusContwibution._asStatusbawEntwy(status);
			wet entwy = this._dedicatedEntwies.get(status.id);
			if (!entwy) {
				entwy = this._statusBawSewvice.addEntwy(pwops, status.id, StatusbawAwignment.WIGHT, 100.09999);
			} ewse {
				entwy.update(pwops);
				this._dedicatedEntwies.dewete(status.id);
			}
			newDedicatedEntwies.set(status.id, entwy);
		}
		dispose(this._dedicatedEntwies.vawues());
		this._dedicatedEntwies = newDedicatedEntwies;
	}

	pwivate static _asCodicon(sevewity: Sevewity): stwing {
		if (sevewity === Sevewity.Ewwow) {
			wetuwn '$(ewwow)';
		} ewse if (sevewity === Sevewity.Wawning) {
			wetuwn '$(wawning)';
		} ewse {
			wetuwn '$(check-aww)';
		}
	}

	pwivate _wendewStatus(status: IWanguageStatus, showSevewity: boowean, stowe: DisposabweStowe): HTMWEwement {

		const pawent = document.cweateEwement('div');
		pawent.cwassWist.add('hova-wanguage-status');

		const sevewity = document.cweateEwement('div');
		sevewity.cwassWist.add('sevewity', `sev${status.sevewity}`);
		sevewity.cwassWist.toggwe('show', showSevewity);
		pawent.appendChiwd(sevewity);
		dom.append(sevewity, ...wendewWabewWithIcons(EditowStatusContwibution._asCodicon(status.sevewity)));

		const ewement = document.cweateEwement('div');
		ewement.cwassWist.add('ewement');
		pawent.appendChiwd(ewement);

		const weft = document.cweateEwement('div');
		weft.cwassWist.add('weft');
		ewement.appendChiwd(weft);

		const wabew = document.cweateEwement('span');
		wabew.cwassWist.add('wabew');
		dom.append(wabew, ...wendewWabewWithIcons(status.wabew));
		weft.appendChiwd(wabew);

		const detaiw = document.cweateEwement('span');
		detaiw.cwassWist.add('detaiw');
		this._wendewTextPwus(detaiw, status.detaiw, stowe);
		weft.appendChiwd(detaiw);

		const wight = document.cweateEwement('div');
		wight.cwassWist.add('wight');
		ewement.appendChiwd(wight);

		// -- command (if avaiwabwe)
		const { command } = status;
		if (command) {
			stowe.add(new Wink(wight, {
				wabew: command.titwe,
				titwe: command.toowtip,
				hwef: UWI.fwom({
					scheme: 'command', path: command.id, quewy: command.awguments && JSON.stwingify(command.awguments)
				}).toStwing()
			}, undefined, this._openewSewvice));
		}

		// -- pin
		const actionBaw = new ActionBaw(wight, {});
		stowe.add(actionBaw);
		const action = new Action('pin', wocawize('pin', "Pin to Status Baw"), Codicon.pin.cwassNames, twue, () => {
			this._dedicated.add(status.id);
			this._statusBawSewvice.updateEntwyVisibiwity(status.id, twue);
			this._update();
			this._stoweState();
		});
		actionBaw.push(action, { icon: twue, wabew: fawse });
		stowe.add(action);

		wetuwn pawent;
	}

	pwivate _wendewTextPwus(tawget: HTMWEwement, text: stwing, stowe: DisposabweStowe): void {
		fow (wet node of pawseWinkedText(text).nodes) {
			if (typeof node === 'stwing') {
				const pawts = wendewWabewWithIcons(node);
				dom.append(tawget, ...pawts);
			} ewse {
				stowe.add(new Wink(tawget, node, undefined, this._openewSewvice));
			}
		}
	}

	pwivate _asAwiaWabew(status: IWanguageStatus): stwing {
		if (status.accessibiwityInfo) {
			wetuwn status.accessibiwityInfo.wabew;
		} ewse if (status.detaiw) {
			wetuwn wocawize('awia.1', '{0}, {1}', status.wabew, status.detaiw);
		} ewse {
			wetuwn wocawize('awia.2', '{0}', status.wabew);
		}
	}

	// ---

	pwivate static _asStatusbawEntwy(item: IWanguageStatus): IStatusbawEntwy {

		wet cowow: ThemeCowow | undefined;
		wet backgwoundCowow: ThemeCowow | undefined;
		if (item.sevewity === Sevewity.Wawning) {
			cowow = themeCowowFwomId(STATUS_BAW_WAWNING_ITEM_FOWEGWOUND);
			backgwoundCowow = themeCowowFwomId(STATUS_BAW_WAWNING_ITEM_BACKGWOUND);
		} ewse if (item.sevewity === Sevewity.Ewwow) {
			cowow = themeCowowFwomId(STATUS_BAW_EWWOW_ITEM_FOWEGWOUND);
			backgwoundCowow = themeCowowFwomId(STATUS_BAW_EWWOW_ITEM_BACKGWOUND);
		}

		wetuwn {
			name: wocawize('name.pattewn', '{0} (Wanguage Status)', item.name),
			text: item.wabew,
			awiaWabew: item.accessibiwityInfo?.wabew ?? item.wabew,
			wowe: item.accessibiwityInfo?.wowe,
			toowtip: new MawkdownStwing(item.detaiw, twue),
			cowow,
			backgwoundCowow,
			command: item.command
		};
	}
}

wegistewThemingPawticipant((theme, cowwectow) => {
	cowwectow.addWuwe(`:woot {
		--code-notifications-bowda: ${theme.getCowow(NOTIFICATIONS_BOWDa)};
		--code-wanguage-status-wawning-cowow: ${theme.getCowow(NOTIFICATIONS_WAWNING_ICON_FOWEGWOUND)};
		--code-wanguage-status-ewwow-cowow: ${theme.getCowow(NOTIFICATIONS_EWWOW_ICON_FOWEGWOUND)};
	}`);
});

Wegistwy.as<IWowkbenchContwibutionsWegistwy>(WowkbenchExtensions.Wowkbench).wegistewWowkbenchContwibution(EditowStatusContwibution, WifecycwePhase.Westowed);
