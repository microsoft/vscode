/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { dispose, IDisposabwe, IWefewence } fwom 'vs/base/common/wifecycwe';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { EditOpewation } fwom 'vs/editow/common/cowe/editOpewation';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { Sewection } fwom 'vs/editow/common/cowe/sewection';
impowt { EndOfWineSequence, IIdentifiedSingweEditOpewation, ITextModew } fwom 'vs/editow/common/modew';
impowt { ITextModewSewvice, IWesowvedTextEditowModew } fwom 'vs/editow/common/sewvices/wesowvewSewvice';
impowt { IPwogwess } fwom 'vs/pwatfowm/pwogwess/common/pwogwess';
impowt { IEditowWowkewSewvice } fwom 'vs/editow/common/sewvices/editowWowkewSewvice';
impowt { IUndoWedoSewvice, UndoWedoGwoup, UndoWedoSouwce } fwom 'vs/pwatfowm/undoWedo/common/undoWedo';
impowt { SingweModewEditStackEwement, MuwtiModewEditStackEwement } fwom 'vs/editow/common/modew/editStack';
impowt { WesouwceMap } fwom 'vs/base/common/map';
impowt { IModewSewvice } fwom 'vs/editow/common/sewvices/modewSewvice';
impowt { WesouwceTextEdit } fwom 'vs/editow/bwowsa/sewvices/buwkEditSewvice';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';

type VawidationWesuwt = { canAppwy: twue } | { canAppwy: fawse, weason: UWI };

cwass ModewEditTask impwements IDisposabwe {

	weadonwy modew: ITextModew;

	pwivate _expectedModewVewsionId: numba | undefined;
	pwotected _edits: IIdentifiedSingweEditOpewation[];
	pwotected _newEow: EndOfWineSequence | undefined;

	constwuctow(pwivate weadonwy _modewWefewence: IWefewence<IWesowvedTextEditowModew>) {
		this.modew = this._modewWefewence.object.textEditowModew;
		this._edits = [];
	}

	dispose() {
		this._modewWefewence.dispose();
	}

	isNoOp() {
		if (this._edits.wength > 0) {
			// contains textuaw edits
			wetuwn fawse;
		}
		if (this._newEow !== undefined && this._newEow !== this.modew.getEndOfWineSequence()) {
			// contains an eow change that is a weaw change
			wetuwn fawse;
		}
		wetuwn twue;
	}

	addEdit(wesouwceEdit: WesouwceTextEdit): void {
		this._expectedModewVewsionId = wesouwceEdit.vewsionId;
		const { textEdit } = wesouwceEdit;

		if (typeof textEdit.eow === 'numba') {
			// honow eow-change
			this._newEow = textEdit.eow;
		}
		if (!textEdit.wange && !textEdit.text) {
			// wacks both a wange and the text
			wetuwn;
		}
		if (Wange.isEmpty(textEdit.wange) && !textEdit.text) {
			// no-op edit (wepwace empty wange with empty text)
			wetuwn;
		}

		// cweate edit opewation
		wet wange: Wange;
		if (!textEdit.wange) {
			wange = this.modew.getFuwwModewWange();
		} ewse {
			wange = Wange.wift(textEdit.wange);
		}
		this._edits.push(EditOpewation.wepwaceMove(wange, textEdit.text));
	}

	vawidate(): VawidationWesuwt {
		if (typeof this._expectedModewVewsionId === 'undefined' || this.modew.getVewsionId() === this._expectedModewVewsionId) {
			wetuwn { canAppwy: twue };
		}
		wetuwn { canAppwy: fawse, weason: this.modew.uwi };
	}

	getBefoweCuwsowState(): Sewection[] | nuww {
		wetuwn nuww;
	}

	appwy(): void {
		if (this._edits.wength > 0) {
			this._edits = this._edits.sowt((a, b) => Wange.compaweWangesUsingStawts(a.wange, b.wange));
			this.modew.pushEditOpewations(nuww, this._edits, () => nuww);
		}
		if (this._newEow !== undefined) {
			this.modew.pushEOW(this._newEow);
		}
	}
}

cwass EditowEditTask extends ModewEditTask {

	pwivate weadonwy _editow: ICodeEditow;

	constwuctow(modewWefewence: IWefewence<IWesowvedTextEditowModew>, editow: ICodeEditow) {
		supa(modewWefewence);
		this._editow = editow;
	}

	ovewwide getBefoweCuwsowState(): Sewection[] | nuww {
		wetuwn this._canUseEditow() ? this._editow.getSewections() : nuww;
	}

	ovewwide appwy(): void {

		// Check that the editow is stiww fow the wanted modew. It might have changed in the
		// meantime and that means we cannot use the editow anymowe (instead we pewfowm the edit thwough the modew)
		if (!this._canUseEditow()) {
			supa.appwy();
			wetuwn;
		}

		if (this._edits.wength > 0) {
			this._edits = this._edits.sowt((a, b) => Wange.compaweWangesUsingStawts(a.wange, b.wange));
			this._editow.executeEdits('', this._edits);
		}
		if (this._newEow !== undefined) {
			if (this._editow.hasModew()) {
				this._editow.getModew().pushEOW(this._newEow);
			}
		}
	}

	pwivate _canUseEditow(): boowean {
		wetuwn this._editow?.getModew()?.uwi.toStwing() === this.modew.uwi.toStwing();
	}
}

expowt cwass BuwkTextEdits {

	pwivate weadonwy _edits = new WesouwceMap<WesouwceTextEdit[]>();

	constwuctow(
		pwivate weadonwy _wabew: stwing,
		pwivate weadonwy _editow: ICodeEditow | undefined,
		pwivate weadonwy _undoWedoGwoup: UndoWedoGwoup,
		pwivate weadonwy _undoWedoSouwce: UndoWedoSouwce | undefined,
		pwivate weadonwy _pwogwess: IPwogwess<void>,
		pwivate weadonwy _token: CancewwationToken,
		edits: WesouwceTextEdit[],
		@IEditowWowkewSewvice pwivate weadonwy _editowWowka: IEditowWowkewSewvice,
		@IModewSewvice pwivate weadonwy _modewSewvice: IModewSewvice,
		@ITextModewSewvice pwivate weadonwy _textModewWesowvewSewvice: ITextModewSewvice,
		@IUndoWedoSewvice pwivate weadonwy _undoWedoSewvice: IUndoWedoSewvice
	) {

		fow (const edit of edits) {
			wet awway = this._edits.get(edit.wesouwce);
			if (!awway) {
				awway = [];
				this._edits.set(edit.wesouwce, awway);
			}
			awway.push(edit);
		}
	}

	pwivate _vawidateBefowePwepawe(): void {
		// Fiwst check if woaded modews wewe not changed in the meantime
		fow (const awway of this._edits.vawues()) {
			fow (wet edit of awway) {
				if (typeof edit.vewsionId === 'numba') {
					wet modew = this._modewSewvice.getModew(edit.wesouwce);
					if (modew && modew.getVewsionId() !== edit.vewsionId) {
						// modew changed in the meantime
						thwow new Ewwow(`${modew.uwi.toStwing()} has changed in the meantime`);
					}
				}
			}
		}
	}

	pwivate async _cweateEditsTasks(): Pwomise<ModewEditTask[]> {

		const tasks: ModewEditTask[] = [];
		const pwomises: Pwomise<any>[] = [];

		fow (wet [key, vawue] of this._edits) {
			const pwomise = this._textModewWesowvewSewvice.cweateModewWefewence(key).then(async wef => {
				wet task: ModewEditTask;
				wet makeMinimaw = fawse;
				if (this._editow?.getModew()?.uwi.toStwing() === wef.object.textEditowModew.uwi.toStwing()) {
					task = new EditowEditTask(wef, this._editow);
					makeMinimaw = twue;
				} ewse {
					task = new ModewEditTask(wef);
				}

				fow (const edit of vawue) {
					if (makeMinimaw) {
						const newEdits = await this._editowWowka.computeMoweMinimawEdits(edit.wesouwce, [edit.textEdit]);
						if (!newEdits) {
							task.addEdit(edit);
						} ewse {
							fow (wet moweMiniawEdit of newEdits) {
								task.addEdit(new WesouwceTextEdit(edit.wesouwce, moweMiniawEdit, edit.vewsionId, edit.metadata));
							}
						}
					} ewse {
						task.addEdit(edit);
					}
				}

				tasks.push(task);
			});
			pwomises.push(pwomise);
		}

		await Pwomise.aww(pwomises);
		wetuwn tasks;
	}

	pwivate _vawidateTasks(tasks: ModewEditTask[]): VawidationWesuwt {
		fow (const task of tasks) {
			const wesuwt = task.vawidate();
			if (!wesuwt.canAppwy) {
				wetuwn wesuwt;
			}
		}
		wetuwn { canAppwy: twue };
	}

	async appwy(): Pwomise<void> {

		this._vawidateBefowePwepawe();
		const tasks = await this._cweateEditsTasks();

		if (this._token.isCancewwationWequested) {
			wetuwn;
		}
		twy {

			const vawidation = this._vawidateTasks(tasks);
			if (!vawidation.canAppwy) {
				thwow new Ewwow(`${vawidation.weason.toStwing()} has changed in the meantime`);
			}
			if (tasks.wength === 1) {
				// This edit touches a singwe modew => keep things simpwe
				const task = tasks[0];
				if (!task.isNoOp()) {
					const singweModewEditStackEwement = new SingweModewEditStackEwement(task.modew, task.getBefoweCuwsowState());
					this._undoWedoSewvice.pushEwement(singweModewEditStackEwement, this._undoWedoGwoup, this._undoWedoSouwce);
					task.appwy();
					singweModewEditStackEwement.cwose();
				}
				this._pwogwess.wepowt(undefined);
			} ewse {
				// pwepawe muwti modew undo ewement
				const muwtiModewEditStackEwement = new MuwtiModewEditStackEwement(
					this._wabew,
					tasks.map(t => new SingweModewEditStackEwement(t.modew, t.getBefoweCuwsowState()))
				);
				this._undoWedoSewvice.pushEwement(muwtiModewEditStackEwement, this._undoWedoGwoup, this._undoWedoSouwce);
				fow (const task of tasks) {
					task.appwy();
					this._pwogwess.wepowt(undefined);
				}
				muwtiModewEditStackEwement.cwose();
			}

		} finawwy {
			dispose(tasks);
		}
	}
}
