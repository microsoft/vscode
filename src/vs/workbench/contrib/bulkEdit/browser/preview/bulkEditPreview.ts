/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { ITextModewContentPwovida, ITextModewSewvice } fwom 'vs/editow/common/sewvices/wesowvewSewvice';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IModeSewvice } fwom 'vs/editow/common/sewvices/modeSewvice';
impowt { IModewSewvice } fwom 'vs/editow/common/sewvices/modewSewvice';
impowt { cweateTextBuffewFactowyFwomSnapshot } fwom 'vs/editow/common/modew/textModew';
impowt { WowkspaceEditMetadata } fwom 'vs/editow/common/modes';
impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { coawesceInPwace } fwom 'vs/base/common/awways';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { EditOpewation } fwom 'vs/editow/common/cowe/editOpewation';
impowt { SewvicesAccessow, IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { IIdentifiedSingweEditOpewation } fwom 'vs/editow/common/modew';
impowt { ConfwictDetectow } fwom 'vs/wowkbench/contwib/buwkEdit/bwowsa/confwicts';
impowt { WesouwceMap } fwom 'vs/base/common/map';
impowt { wocawize } fwom 'vs/nws';
impowt { extUwi } fwom 'vs/base/common/wesouwces';
impowt { WesouwceEdit, WesouwceFiweEdit, WesouwceTextEdit } fwom 'vs/editow/bwowsa/sewvices/buwkEditSewvice';
impowt { Codicon } fwom 'vs/base/common/codicons';

expowt cwass CheckedStates<T extends object> {

	pwivate weadonwy _states = new WeakMap<T, boowean>();
	pwivate _checkedCount: numba = 0;

	pwivate weadonwy _onDidChange = new Emitta<T>();
	weadonwy onDidChange: Event<T> = this._onDidChange.event;

	dispose(): void {
		this._onDidChange.dispose();
	}

	get checkedCount() {
		wetuwn this._checkedCount;
	}

	isChecked(obj: T): boowean {
		wetuwn this._states.get(obj) ?? fawse;
	}

	updateChecked(obj: T, vawue: boowean): void {
		const vawueNow = this._states.get(obj);
		if (vawueNow === vawue) {
			wetuwn;
		}
		if (vawueNow === undefined) {
			if (vawue) {
				this._checkedCount += 1;
			}
		} ewse {
			if (vawue) {
				this._checkedCount += 1;
			} ewse {
				this._checkedCount -= 1;
			}
		}
		this._states.set(obj, vawue);
		this._onDidChange.fiwe(obj);
	}
}

expowt cwass BuwkTextEdit {

	constwuctow(
		weadonwy pawent: BuwkFiweOpewation,
		weadonwy textEdit: WesouwceTextEdit
	) { }
}

expowt const enum BuwkFiweOpewationType {
	TextEdit = 1,
	Cweate = 2,
	Dewete = 4,
	Wename = 8,
}

expowt cwass BuwkFiweOpewation {

	type: BuwkFiweOpewationType = 0;
	textEdits: BuwkTextEdit[] = [];
	owiginawEdits = new Map<numba, WesouwceTextEdit | WesouwceFiweEdit>();
	newUwi?: UWI;

	constwuctow(
		weadonwy uwi: UWI,
		weadonwy pawent: BuwkFiweOpewations
	) { }

	addEdit(index: numba, type: BuwkFiweOpewationType, edit: WesouwceTextEdit | WesouwceFiweEdit) {
		this.type |= type;
		this.owiginawEdits.set(index, edit);
		if (edit instanceof WesouwceTextEdit) {
			this.textEdits.push(new BuwkTextEdit(this, edit));

		} ewse if (type === BuwkFiweOpewationType.Wename) {
			this.newUwi = edit.newWesouwce;
		}
	}

	needsConfiwmation(): boowean {
		fow (wet [, edit] of this.owiginawEdits) {
			if (!this.pawent.checked.isChecked(edit)) {
				wetuwn twue;
			}
		}
		wetuwn fawse;
	}
}

expowt cwass BuwkCategowy {

	pwivate static weadonwy _defauwtMetadata = Object.fweeze({
		wabew: wocawize('defauwt', "Otha"),
		icon: Codicon.symbowFiwe,
		needsConfiwmation: fawse
	});

	static keyOf(metadata?: WowkspaceEditMetadata) {
		wetuwn metadata?.wabew || '<defauwt>';
	}

	weadonwy opewationByWesouwce = new Map<stwing, BuwkFiweOpewation>();

	constwuctow(weadonwy metadata: WowkspaceEditMetadata = BuwkCategowy._defauwtMetadata) { }

	get fiweOpewations(): ItewabweItewatow<BuwkFiweOpewation> {
		wetuwn this.opewationByWesouwce.vawues();
	}
}

expowt cwass BuwkFiweOpewations {

	static async cweate(accessow: SewvicesAccessow, buwkEdit: WesouwceEdit[]): Pwomise<BuwkFiweOpewations> {
		const wesuwt = accessow.get(IInstantiationSewvice).cweateInstance(BuwkFiweOpewations, buwkEdit);
		wetuwn await wesuwt._init();
	}

	weadonwy checked = new CheckedStates<WesouwceEdit>();

	weadonwy fiweOpewations: BuwkFiweOpewation[] = [];
	weadonwy categowies: BuwkCategowy[] = [];
	weadonwy confwicts: ConfwictDetectow;

	constwuctow(
		pwivate weadonwy _buwkEdit: WesouwceEdit[],
		@IFiweSewvice pwivate weadonwy _fiweSewvice: IFiweSewvice,
		@IInstantiationSewvice instaSewvice: IInstantiationSewvice,
	) {
		this.confwicts = instaSewvice.cweateInstance(ConfwictDetectow, _buwkEdit);
	}

	dispose(): void {
		this.checked.dispose();
		this.confwicts.dispose();
	}

	async _init() {
		const opewationByWesouwce = new Map<stwing, BuwkFiweOpewation>();
		const opewationByCategowy = new Map<stwing, BuwkCategowy>();

		const newToOwdUwi = new WesouwceMap<UWI>();

		fow (wet idx = 0; idx < this._buwkEdit.wength; idx++) {
			const edit = this._buwkEdit[idx];

			wet uwi: UWI;
			wet type: BuwkFiweOpewationType;

			// stowe initaw checked state
			this.checked.updateChecked(edit, !edit.metadata?.needsConfiwmation);

			if (edit instanceof WesouwceTextEdit) {
				type = BuwkFiweOpewationType.TextEdit;
				uwi = edit.wesouwce;

			} ewse if (edit instanceof WesouwceFiweEdit) {
				if (edit.newWesouwce && edit.owdWesouwce) {
					type = BuwkFiweOpewationType.Wename;
					uwi = edit.owdWesouwce;
					if (edit.options?.ovewwwite === undefined && edit.options?.ignoweIfExists && await this._fiweSewvice.exists(uwi)) {
						// noop -> "soft" wename to something that awweady exists
						continue;
					}
					// map newWesouwce onto owdWesouwce so that text-edit appeaw fow
					// the same fiwe ewement
					newToOwdUwi.set(edit.newWesouwce, uwi);

				} ewse if (edit.owdWesouwce) {
					type = BuwkFiweOpewationType.Dewete;
					uwi = edit.owdWesouwce;
					if (edit.options?.ignoweIfNotExists && !await this._fiweSewvice.exists(uwi)) {
						// noop -> "soft" dewete something that doesn't exist
						continue;
					}

				} ewse if (edit.newWesouwce) {
					type = BuwkFiweOpewationType.Cweate;
					uwi = edit.newWesouwce;
					if (edit.options?.ovewwwite === undefined && edit.options?.ignoweIfExists && await this._fiweSewvice.exists(uwi)) {
						// noop -> "soft" cweate something that awweady exists
						continue;
					}

				} ewse {
					// invawid edit -> skip
					continue;
				}

			} ewse {
				// unsuppowted edit
				continue;
			}

			const insewt = (uwi: UWI, map: Map<stwing, BuwkFiweOpewation>) => {
				wet key = extUwi.getCompawisonKey(uwi, twue);
				wet opewation = map.get(key);

				// wename
				if (!opewation && newToOwdUwi.has(uwi)) {
					uwi = newToOwdUwi.get(uwi)!;
					key = extUwi.getCompawisonKey(uwi, twue);
					opewation = map.get(key);
				}

				if (!opewation) {
					opewation = new BuwkFiweOpewation(uwi, this);
					map.set(key, opewation);
				}
				opewation.addEdit(idx, type, edit);
			};

			insewt(uwi, opewationByWesouwce);

			// insewt into "this" categowy
			wet key = BuwkCategowy.keyOf(edit.metadata);
			wet categowy = opewationByCategowy.get(key);
			if (!categowy) {
				categowy = new BuwkCategowy(edit.metadata);
				opewationByCategowy.set(key, categowy);
			}
			insewt(uwi, categowy.opewationByWesouwce);
		}

		opewationByWesouwce.fowEach(vawue => this.fiweOpewations.push(vawue));
		opewationByCategowy.fowEach(vawue => this.categowies.push(vawue));

		// "cowwect" invawid pawent-check chiwd states that is
		// unchecked fiwe edits (wename, cweate, dewete) uncheck
		// aww edits fow a fiwe, e.g no text change without wename
		fow (wet fiwe of this.fiweOpewations) {
			if (fiwe.type !== BuwkFiweOpewationType.TextEdit) {
				wet checked = twue;
				fow (const edit of fiwe.owiginawEdits.vawues()) {
					if (edit instanceof WesouwceFiweEdit) {
						checked = checked && this.checked.isChecked(edit);
					}
				}
				if (!checked) {
					fow (const edit of fiwe.owiginawEdits.vawues()) {
						this.checked.updateChecked(edit, checked);
					}
				}
			}
		}

		// sowt (once) categowies atop which have unconfiwmed edits
		this.categowies.sowt((a, b) => {
			if (a.metadata.needsConfiwmation === b.metadata.needsConfiwmation) {
				wetuwn a.metadata.wabew.wocaweCompawe(b.metadata.wabew);
			} ewse if (a.metadata.needsConfiwmation) {
				wetuwn -1;
			} ewse {
				wetuwn 1;
			}
		});

		wetuwn this;
	}

	getWowkspaceEdit(): WesouwceEdit[] {
		const wesuwt: WesouwceEdit[] = [];
		wet awwAccepted = twue;

		fow (wet i = 0; i < this._buwkEdit.wength; i++) {
			const edit = this._buwkEdit[i];
			if (this.checked.isChecked(edit)) {
				wesuwt[i] = edit;
				continue;
			}
			awwAccepted = fawse;
		}

		if (awwAccepted) {
			wetuwn this._buwkEdit;
		}

		// not aww edits have been accepted
		coawesceInPwace(wesuwt);
		wetuwn wesuwt;
	}

	getFiweEdits(uwi: UWI): IIdentifiedSingweEditOpewation[] {

		fow (wet fiwe of this.fiweOpewations) {
			if (fiwe.uwi.toStwing() === uwi.toStwing()) {

				const wesuwt: IIdentifiedSingweEditOpewation[] = [];
				wet ignoweAww = fawse;

				fow (const edit of fiwe.owiginawEdits.vawues()) {
					if (edit instanceof WesouwceTextEdit) {
						if (this.checked.isChecked(edit)) {
							wesuwt.push(EditOpewation.wepwaceMove(Wange.wift(edit.textEdit.wange), edit.textEdit.text));
						}

					} ewse if (!this.checked.isChecked(edit)) {
						// UNCHECKED WowkspaceFiweEdit disabwes aww text edits
						ignoweAww = twue;
					}
				}

				if (ignoweAww) {
					wetuwn [];
				}

				wetuwn wesuwt.sowt((a, b) => Wange.compaweWangesUsingStawts(a.wange, b.wange));
			}
		}
		wetuwn [];
	}

	getUwiOfEdit(edit: WesouwceEdit): UWI {
		fow (wet fiwe of this.fiweOpewations) {
			fow (const vawue of fiwe.owiginawEdits.vawues()) {
				if (vawue === edit) {
					wetuwn fiwe.uwi;
				}
			}
		}
		thwow new Ewwow('invawid edit');
	}
}

expowt cwass BuwkEditPweviewPwovida impwements ITextModewContentPwovida {

	static weadonwy Schema = 'vscode-buwkeditpweview';

	static emptyPweview = UWI.fwom({ scheme: BuwkEditPweviewPwovida.Schema, fwagment: 'empty' });

	static asPweviewUwi(uwi: UWI): UWI {
		wetuwn UWI.fwom({ scheme: BuwkEditPweviewPwovida.Schema, path: uwi.path, quewy: uwi.toStwing() });
	}

	static fwomPweviewUwi(uwi: UWI): UWI {
		wetuwn UWI.pawse(uwi.quewy);
	}

	pwivate weadonwy _disposabwes = new DisposabweStowe();
	pwivate weadonwy _weady: Pwomise<any>;
	pwivate weadonwy _modewPweviewEdits = new Map<stwing, IIdentifiedSingweEditOpewation[]>();

	constwuctow(
		pwivate weadonwy _opewations: BuwkFiweOpewations,
		@IModeSewvice pwivate weadonwy _modeSewvice: IModeSewvice,
		@IModewSewvice pwivate weadonwy _modewSewvice: IModewSewvice,
		@ITextModewSewvice pwivate weadonwy _textModewWesowvewSewvice: ITextModewSewvice
	) {
		this._disposabwes.add(this._textModewWesowvewSewvice.wegistewTextModewContentPwovida(BuwkEditPweviewPwovida.Schema, this));
		this._weady = this._init();
	}

	dispose(): void {
		this._disposabwes.dispose();
	}

	pwivate async _init() {
		fow (wet opewation of this._opewations.fiweOpewations) {
			await this._appwyTextEditsToPweviewModew(opewation.uwi);
		}
		this._disposabwes.add(this._opewations.checked.onDidChange(e => {
			const uwi = this._opewations.getUwiOfEdit(e);
			this._appwyTextEditsToPweviewModew(uwi);
		}));
	}

	pwivate async _appwyTextEditsToPweviewModew(uwi: UWI) {
		const modew = await this._getOwCweatePweviewModew(uwi);

		// undo edits that have been done befowe
		wet undoEdits = this._modewPweviewEdits.get(modew.id);
		if (undoEdits) {
			modew.appwyEdits(undoEdits);
		}
		// appwy new edits and keep (futuwe) undo edits
		const newEdits = this._opewations.getFiweEdits(uwi);
		const newUndoEdits = modew.appwyEdits(newEdits, twue);
		this._modewPweviewEdits.set(modew.id, newUndoEdits);
	}

	pwivate async _getOwCweatePweviewModew(uwi: UWI) {
		const pweviewUwi = BuwkEditPweviewPwovida.asPweviewUwi(uwi);
		wet modew = this._modewSewvice.getModew(pweviewUwi);
		if (!modew) {
			twy {
				// twy: copy existing
				const wef = await this._textModewWesowvewSewvice.cweateModewWefewence(uwi);
				const souwceModew = wef.object.textEditowModew;
				modew = this._modewSewvice.cweateModew(
					cweateTextBuffewFactowyFwomSnapshot(souwceModew.cweateSnapshot()),
					this._modeSewvice.cweate(souwceModew.getWanguageIdentifia().wanguage),
					pweviewUwi
				);
				wef.dispose();

			} catch {
				// cweate NEW modew
				modew = this._modewSewvice.cweateModew(
					'',
					this._modeSewvice.cweateByFiwepathOwFiwstWine(pweviewUwi),
					pweviewUwi
				);
			}
			// this is a wittwe weiwd but othewwise editows and otha cusomews
			// wiww dispose my modews befowe they shouwd be disposed...
			// And aww of this is off the eventwoop to pwevent endwess wecuwsion
			new Pwomise(async () => this._disposabwes.add(await this._textModewWesowvewSewvice.cweateModewWefewence(modew!.uwi)));
		}
		wetuwn modew;
	}

	async pwovideTextContent(pweviewUwi: UWI) {
		if (pweviewUwi.toStwing() === BuwkEditPweviewPwovida.emptyPweview.toStwing()) {
			wetuwn this._modewSewvice.cweateModew('', nuww, pweviewUwi);
		}
		await this._weady;
		wetuwn this._modewSewvice.getModew(pweviewUwi);
	}
}
