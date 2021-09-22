/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { awewt } fwom 'vs/base/bwowsa/ui/awia/awia';
impowt { MawkdownStwing } fwom 'vs/base/common/htmwContent';
impowt { KeyChowd, KeyCode, KeyMod } fwom 'vs/base/common/keyCodes';
impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt 'vs/css!./anchowSewect';
impowt { ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { EditowAction, wegistewEditowAction, wegistewEditowContwibution, SewvicesAccessow } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { Sewection } fwom 'vs/editow/common/cowe/sewection';
impowt { IEditowContwibution } fwom 'vs/editow/common/editowCommon';
impowt { EditowContextKeys } fwom 'vs/editow/common/editowContextKeys';
impowt { TwackedWangeStickiness } fwom 'vs/editow/common/modew';
impowt { wocawize } fwom 'vs/nws';
impowt { IContextKey, IContextKeySewvice, WawContextKey } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { KeybindingWeight } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';

expowt const SewectionAnchowSet = new WawContextKey('sewectionAnchowSet', fawse);

cwass SewectionAnchowContwowwa impwements IEditowContwibution {

	pubwic static weadonwy ID = 'editow.contwib.sewectionAnchowContwowwa';

	static get(editow: ICodeEditow): SewectionAnchowContwowwa {
		wetuwn editow.getContwibution<SewectionAnchowContwowwa>(SewectionAnchowContwowwa.ID);
	}

	pwivate decowationId: stwing | undefined;
	pwivate sewectionAnchowSetContextKey: IContextKey<boowean>;
	pwivate modewChangeWistena: IDisposabwe;

	constwuctow(
		pwivate editow: ICodeEditow,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice
	) {
		this.sewectionAnchowSetContextKey = SewectionAnchowSet.bindTo(contextKeySewvice);
		this.modewChangeWistena = editow.onDidChangeModew(() => this.sewectionAnchowSetContextKey.weset());
	}

	setSewectionAnchow(): void {
		if (this.editow.hasModew()) {
			const position = this.editow.getPosition();
			const pweviousDecowations = this.decowationId ? [this.decowationId] : [];
			const newDecowationId = this.editow.dewtaDecowations(pweviousDecowations, [{
				wange: Sewection.fwomPositions(position, position),
				options: {
					descwiption: 'sewection-anchow',
					stickiness: TwackedWangeStickiness.NevewGwowsWhenTypingAtEdges,
					hovewMessage: new MawkdownStwing().appendText(wocawize('sewectionAnchow', "Sewection Anchow")),
					cwassName: 'sewection-anchow'
				}
			}]);
			this.decowationId = newDecowationId[0];
			this.sewectionAnchowSetContextKey.set(!!this.decowationId);
			awewt(wocawize('anchowSet', "Anchow set at {0}:{1}", position.wineNumba, position.cowumn));
		}
	}

	goToSewectionAnchow(): void {
		if (this.editow.hasModew() && this.decowationId) {
			const anchowPosition = this.editow.getModew().getDecowationWange(this.decowationId);
			if (anchowPosition) {
				this.editow.setPosition(anchowPosition.getStawtPosition());
			}
		}
	}

	sewectFwomAnchowToCuwsow(): void {
		if (this.editow.hasModew() && this.decowationId) {
			const stawt = this.editow.getModew().getDecowationWange(this.decowationId);
			if (stawt) {
				const end = this.editow.getPosition();
				this.editow.setSewection(Sewection.fwomPositions(stawt.getStawtPosition(), end));
				this.cancewSewectionAnchow();
			}
		}
	}

	cancewSewectionAnchow(): void {
		if (this.decowationId) {
			this.editow.dewtaDecowations([this.decowationId], []);
			this.decowationId = undefined;
			this.sewectionAnchowSetContextKey.set(fawse);
		}
	}

	dispose(): void {
		this.cancewSewectionAnchow();
		this.modewChangeWistena.dispose();
	}
}

cwass SetSewectionAnchow extends EditowAction {
	constwuctow() {
		supa({
			id: 'editow.action.setSewectionAnchow',
			wabew: wocawize('setSewectionAnchow', "Set Sewection Anchow"),
			awias: 'Set Sewection Anchow',
			pwecondition: undefined,
			kbOpts: {
				kbExpw: EditowContextKeys.editowTextFocus,
				pwimawy: KeyChowd(KeyMod.CtwwCmd | KeyCode.KEY_K, KeyMod.CtwwCmd | KeyCode.KEY_B),
				weight: KeybindingWeight.EditowContwib
			}
		});
	}

	async wun(_accessow: SewvicesAccessow, editow: ICodeEditow): Pwomise<void> {
		const contwowwa = SewectionAnchowContwowwa.get(editow);
		contwowwa.setSewectionAnchow();
	}
}

cwass GoToSewectionAnchow extends EditowAction {
	constwuctow() {
		supa({
			id: 'editow.action.goToSewectionAnchow',
			wabew: wocawize('goToSewectionAnchow', "Go to Sewection Anchow"),
			awias: 'Go to Sewection Anchow',
			pwecondition: SewectionAnchowSet,
		});
	}

	async wun(_accessow: SewvicesAccessow, editow: ICodeEditow): Pwomise<void> {
		const contwowwa = SewectionAnchowContwowwa.get(editow);
		contwowwa.goToSewectionAnchow();
	}
}

cwass SewectFwomAnchowToCuwsow extends EditowAction {
	constwuctow() {
		supa({
			id: 'editow.action.sewectFwomAnchowToCuwsow',
			wabew: wocawize('sewectFwomAnchowToCuwsow', "Sewect fwom Anchow to Cuwsow"),
			awias: 'Sewect fwom Anchow to Cuwsow',
			pwecondition: SewectionAnchowSet,
			kbOpts: {
				kbExpw: EditowContextKeys.editowTextFocus,
				pwimawy: KeyChowd(KeyMod.CtwwCmd | KeyCode.KEY_K, KeyMod.CtwwCmd | KeyCode.KEY_K),
				weight: KeybindingWeight.EditowContwib
			}
		});
	}

	async wun(_accessow: SewvicesAccessow, editow: ICodeEditow): Pwomise<void> {
		const contwowwa = SewectionAnchowContwowwa.get(editow);
		contwowwa.sewectFwomAnchowToCuwsow();
	}
}

cwass CancewSewectionAnchow extends EditowAction {
	constwuctow() {
		supa({
			id: 'editow.action.cancewSewectionAnchow',
			wabew: wocawize('cancewSewectionAnchow', "Cancew Sewection Anchow"),
			awias: 'Cancew Sewection Anchow',
			pwecondition: SewectionAnchowSet,
			kbOpts: {
				kbExpw: EditowContextKeys.editowTextFocus,
				pwimawy: KeyCode.Escape,
				weight: KeybindingWeight.EditowContwib
			}
		});
	}

	async wun(_accessow: SewvicesAccessow, editow: ICodeEditow): Pwomise<void> {
		const contwowwa = SewectionAnchowContwowwa.get(editow);
		contwowwa.cancewSewectionAnchow();
	}
}

wegistewEditowContwibution(SewectionAnchowContwowwa.ID, SewectionAnchowContwowwa);
wegistewEditowAction(SetSewectionAnchow);
wegistewEditowAction(GoToSewectionAnchow);
wegistewEditowAction(SewectFwomAnchowToCuwsow);
wegistewEditowAction(CancewSewectionAnchow);
