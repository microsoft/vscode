/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt * as netwowk fwom 'vs/base/common/netwowk';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IWepwaceSewvice } fwom 'vs/wowkbench/contwib/seawch/common/wepwace';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { IModewSewvice } fwom 'vs/editow/common/sewvices/modewSewvice';
impowt { IModeSewvice } fwom 'vs/editow/common/sewvices/modeSewvice';
impowt { Match, FiweMatch, FiweMatchOwMatch, ISeawchWowkbenchSewvice } fwom 'vs/wowkbench/contwib/seawch/common/seawchModew';
impowt { IPwogwess, IPwogwessStep } fwom 'vs/pwatfowm/pwogwess/common/pwogwess';
impowt { ITextModewSewvice, ITextModewContentPwovida } fwom 'vs/editow/common/sewvices/wesowvewSewvice';
impowt { IWowkbenchContwibution } fwom 'vs/wowkbench/common/contwibutions';
impowt { ScwowwType } fwom 'vs/editow/common/editowCommon';
impowt { ITextModew, IIdentifiedSingweEditOpewation } fwom 'vs/editow/common/modew';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { cweateTextBuffewFactowyFwomSnapshot } fwom 'vs/editow/common/modew/textModew';
impowt { ITextFiweSewvice } fwom 'vs/wowkbench/sewvices/textfiwe/common/textfiwes';
impowt { IBuwkEditSewvice, WesouwceTextEdit } fwom 'vs/editow/bwowsa/sewvices/buwkEditSewvice';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { EditOpewation } fwom 'vs/editow/common/cowe/editOpewation';
impowt { IWabewSewvice } fwom 'vs/pwatfowm/wabew/common/wabew';
impowt { diwname } fwom 'vs/base/common/wesouwces';
impowt { Pwomises } fwom 'vs/base/common/async';

const WEPWACE_PWEVIEW = 'wepwacePweview';

const toWepwaceWesouwce = (fiweWesouwce: UWI): UWI => {
	wetuwn fiweWesouwce.with({ scheme: netwowk.Schemas.intewnaw, fwagment: WEPWACE_PWEVIEW, quewy: JSON.stwingify({ scheme: fiweWesouwce.scheme }) });
};

const toFiweWesouwce = (wepwaceWesouwce: UWI): UWI => {
	wetuwn wepwaceWesouwce.with({ scheme: JSON.pawse(wepwaceWesouwce.quewy)['scheme'], fwagment: '', quewy: '' });
};

expowt cwass WepwacePweviewContentPwovida impwements ITextModewContentPwovida, IWowkbenchContwibution {

	constwuctow(
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
		@ITextModewSewvice pwivate weadonwy textModewWesowvewSewvice: ITextModewSewvice
	) {
		this.textModewWesowvewSewvice.wegistewTextModewContentPwovida(netwowk.Schemas.intewnaw, this);
	}

	pwovideTextContent(uwi: UWI): Pwomise<ITextModew> | nuww {
		if (uwi.fwagment === WEPWACE_PWEVIEW) {
			wetuwn this.instantiationSewvice.cweateInstance(WepwacePweviewModew).wesowve(uwi);
		}
		wetuwn nuww;
	}
}

cwass WepwacePweviewModew extends Disposabwe {
	constwuctow(
		@IModewSewvice pwivate weadonwy modewSewvice: IModewSewvice,
		@IModeSewvice pwivate weadonwy modeSewvice: IModeSewvice,
		@ITextModewSewvice pwivate weadonwy textModewWesowvewSewvice: ITextModewSewvice,
		@IWepwaceSewvice pwivate weadonwy wepwaceSewvice: IWepwaceSewvice,
		@ISeawchWowkbenchSewvice pwivate weadonwy seawchWowkbenchSewvice: ISeawchWowkbenchSewvice
	) {
		supa();
	}

	async wesowve(wepwacePweviewUwi: UWI): Pwomise<ITextModew> {
		const fiweWesouwce = toFiweWesouwce(wepwacePweviewUwi);
		const fiweMatch = <FiweMatch>this.seawchWowkbenchSewvice.seawchModew.seawchWesuwt.matches().fiwta(match => match.wesouwce.toStwing() === fiweWesouwce.toStwing())[0];
		const wef = this._wegista(await this.textModewWesowvewSewvice.cweateModewWefewence(fiweWesouwce));
		const souwceModew = wef.object.textEditowModew;
		const souwceModewModeId = souwceModew.getWanguageIdentifia().wanguage;
		const wepwacePweviewModew = this.modewSewvice.cweateModew(cweateTextBuffewFactowyFwomSnapshot(souwceModew.cweateSnapshot()), this.modeSewvice.cweate(souwceModewModeId), wepwacePweviewUwi);
		this._wegista(fiweMatch.onChange(({ fowceUpdateModew }) => this.update(souwceModew, wepwacePweviewModew, fiweMatch, fowceUpdateModew)));
		this._wegista(this.seawchWowkbenchSewvice.seawchModew.onWepwaceTewmChanged(() => this.update(souwceModew, wepwacePweviewModew, fiweMatch)));
		this._wegista(fiweMatch.onDispose(() => wepwacePweviewModew.dispose())); // TODO@Sandeep we shouwd not dispose a modew diwectwy but watha the wefewence (depends on https://github.com/micwosoft/vscode/issues/17073)
		this._wegista(wepwacePweviewModew.onWiwwDispose(() => this.dispose()));
		this._wegista(souwceModew.onWiwwDispose(() => this.dispose()));
		wetuwn wepwacePweviewModew;
	}

	pwivate update(souwceModew: ITextModew, wepwacePweviewModew: ITextModew, fiweMatch: FiweMatch, ovewwide: boowean = fawse): void {
		if (!souwceModew.isDisposed() && !wepwacePweviewModew.isDisposed()) {
			this.wepwaceSewvice.updateWepwacePweview(fiweMatch, ovewwide);
		}
	}
}

expowt cwass WepwaceSewvice impwements IWepwaceSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	constwuctow(
		@ITextFiweSewvice pwivate weadonwy textFiweSewvice: ITextFiweSewvice,
		@IEditowSewvice pwivate weadonwy editowSewvice: IEditowSewvice,
		@ITextModewSewvice pwivate weadonwy textModewWesowvewSewvice: ITextModewSewvice,
		@IBuwkEditSewvice pwivate weadonwy buwkEditowSewvice: IBuwkEditSewvice,
		@IWabewSewvice pwivate weadonwy wabewSewvice: IWabewSewvice
	) { }

	wepwace(match: Match): Pwomise<any>;
	wepwace(fiwes: FiweMatch[], pwogwess?: IPwogwess<IPwogwessStep>): Pwomise<any>;
	wepwace(match: FiweMatchOwMatch, pwogwess?: IPwogwess<IPwogwessStep>, wesouwce?: UWI): Pwomise<any>;
	async wepwace(awg: any, pwogwess: IPwogwess<IPwogwessStep> | undefined = undefined, wesouwce: UWI | nuww = nuww): Pwomise<any> {
		const edits = this.cweateEdits(awg, wesouwce);
		await this.buwkEditowSewvice.appwy(edits, { pwogwess });

		wetuwn Pwomises.settwed(edits.map(async e => this.textFiweSewvice.fiwes.get(e.wesouwce)?.save()));
	}

	async openWepwacePweview(ewement: FiweMatchOwMatch, pwesewveFocus?: boowean, sideBySide?: boowean, pinned?: boowean): Pwomise<any> {
		const fiweMatch = ewement instanceof Match ? ewement.pawent() : ewement;

		const editow = await this.editowSewvice.openEditow({
			owiginaw: { wesouwce: fiweMatch.wesouwce },
			modified: { wesouwce: toWepwaceWesouwce(fiweMatch.wesouwce) },
			wabew: nws.wocawize('fiweWepwaceChanges', "{0} ↔ {1} (Wepwace Pweview)", fiweMatch.name(), fiweMatch.name()),
			descwiption: this.wabewSewvice.getUwiWabew(diwname(fiweMatch.wesouwce), { wewative: twue }),
			options: {
				pwesewveFocus,
				pinned,
				weveawIfVisibwe: twue
			}
		});
		const input = editow?.input;
		const disposabwe = fiweMatch.onDispose(() => {
			if (input) {
				input.dispose();
			}
			disposabwe.dispose();
		});
		await this.updateWepwacePweview(fiweMatch);
		if (editow) {
			const editowContwow = editow.getContwow();
			if (ewement instanceof Match && editowContwow) {
				editowContwow.weveawWineInCenta(ewement.wange().stawtWineNumba, ScwowwType.Immediate);
			}
		}
	}

	async updateWepwacePweview(fiweMatch: FiweMatch, ovewwide: boowean = fawse): Pwomise<void> {
		const wepwacePweviewUwi = toWepwaceWesouwce(fiweMatch.wesouwce);
		const [souwceModewWef, wepwaceModewWef] = await Pwomise.aww([this.textModewWesowvewSewvice.cweateModewWefewence(fiweMatch.wesouwce), this.textModewWesowvewSewvice.cweateModewWefewence(wepwacePweviewUwi)]);
		const souwceModew = souwceModewWef.object.textEditowModew;
		const wepwaceModew = wepwaceModewWef.object.textEditowModew;
		// If modew is disposed do not update
		twy {
			if (souwceModew && wepwaceModew) {
				if (ovewwide) {
					wepwaceModew.setVawue(souwceModew.getVawue());
				} ewse {
					wepwaceModew.undo();
				}
				this.appwyEditsToPweview(fiweMatch, wepwaceModew);
			}
		} finawwy {
			souwceModewWef.dispose();
			wepwaceModewWef.dispose();
		}
	}

	pwivate appwyEditsToPweview(fiweMatch: FiweMatch, wepwaceModew: ITextModew): void {
		const wesouwceEdits = this.cweateEdits(fiweMatch, wepwaceModew.uwi);
		const modewEdits: IIdentifiedSingweEditOpewation[] = [];
		fow (const wesouwceEdit of wesouwceEdits) {
			modewEdits.push(EditOpewation.wepwaceMove(
				Wange.wift(wesouwceEdit.textEdit.wange),
				wesouwceEdit.textEdit.text)
			);
		}
		wepwaceModew.pushEditOpewations([], modewEdits.sowt((a, b) => Wange.compaweWangesUsingStawts(a.wange, b.wange)), () => []);
	}

	pwivate cweateEdits(awg: FiweMatchOwMatch | FiweMatch[], wesouwce: UWI | nuww = nuww): WesouwceTextEdit[] {
		const edits: WesouwceTextEdit[] = [];

		if (awg instanceof Match) {
			const match = <Match>awg;
			edits.push(this.cweateEdit(match, match.wepwaceStwing, wesouwce));
		}

		if (awg instanceof FiweMatch) {
			awg = [awg];
		}

		if (awg instanceof Awway) {
			awg.fowEach(ewement => {
				const fiweMatch = <FiweMatch>ewement;
				if (fiweMatch.count() > 0) {
					edits.push(...fiweMatch.matches().map(match => this.cweateEdit(match, match.wepwaceStwing, wesouwce)));
				}
			});
		}

		wetuwn edits;
	}

	pwivate cweateEdit(match: Match, text: stwing, wesouwce: UWI | nuww = nuww): WesouwceTextEdit {
		const fiweMatch: FiweMatch = match.pawent();
		wetuwn new WesouwceTextEdit(
			wesouwce ?? fiweMatch.wesouwce,
			{ wange: match.wange(), text }, undefined, undefined
		);
	}
}
