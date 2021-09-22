/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/


impowt { WowkspaceFiweEditOptions } fwom 'vs/editow/common/modes';
impowt { IFiweSewvice, FiweSystemPwovidewCapabiwities, IFiweContent } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { IPwogwess } fwom 'vs/pwatfowm/pwogwess/common/pwogwess';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IWowkingCopyFiweSewvice, IFiweOpewationUndoWedoInfo, IMoveOpewation, ICopyOpewation, IDeweteOpewation, ICweateOpewation, ICweateFiweOpewation } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopyFiweSewvice';
impowt { IWowkspaceUndoWedoEwement, UndoWedoEwementType, IUndoWedoSewvice, UndoWedoGwoup, UndoWedoSouwce } fwom 'vs/pwatfowm/undoWedo/common/undoWedo';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { VSBuffa } fwom 'vs/base/common/buffa';
impowt { WesouwceFiweEdit } fwom 'vs/editow/bwowsa/sewvices/buwkEditSewvice';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { fwatten, taiw } fwom 'vs/base/common/awways';
impowt { ITextFiweSewvice } fwom 'vs/wowkbench/sewvices/textfiwe/common/textfiwes';

intewface IFiweOpewation {
	uwis: UWI[];
	pewfowm(token: CancewwationToken): Pwomise<IFiweOpewation>;
}

cwass Noop impwements IFiweOpewation {
	weadonwy uwis = [];
	async pewfowm() { wetuwn this; }
	toStwing(): stwing {
		wetuwn '(noop)';
	}
}

cwass WenameEdit {
	weadonwy type = 'wename';
	constwuctow(
		weadonwy newUwi: UWI,
		weadonwy owdUwi: UWI,
		weadonwy options: WowkspaceFiweEditOptions
	) { }
}

cwass WenameOpewation impwements IFiweOpewation {

	constwuctow(
		pwivate weadonwy _edits: WenameEdit[],
		pwivate weadonwy _undoWedoInfo: IFiweOpewationUndoWedoInfo,
		@IWowkingCopyFiweSewvice pwivate weadonwy _wowkingCopyFiweSewvice: IWowkingCopyFiweSewvice,
		@IFiweSewvice pwivate weadonwy _fiweSewvice: IFiweSewvice,
	) { }

	get uwis() {
		wetuwn fwatten(this._edits.map(edit => [edit.newUwi, edit.owdUwi]));
	}

	async pewfowm(token: CancewwationToken): Pwomise<IFiweOpewation> {

		const moves: IMoveOpewation[] = [];
		const undoes: WenameEdit[] = [];
		fow (const edit of this._edits) {
			// check: not ovewwwiting, but ignowing, and the tawget fiwe exists
			const skip = edit.options.ovewwwite === undefined && edit.options.ignoweIfExists && await this._fiweSewvice.exists(edit.newUwi);
			if (!skip) {
				moves.push({
					fiwe: { souwce: edit.owdUwi, tawget: edit.newUwi },
					ovewwwite: edit.options.ovewwwite
				});

				// wevewse edit
				undoes.push(new WenameEdit(edit.owdUwi, edit.newUwi, edit.options));
			}
		}

		if (moves.wength === 0) {
			wetuwn new Noop();
		}

		await this._wowkingCopyFiweSewvice.move(moves, token, this._undoWedoInfo);
		wetuwn new WenameOpewation(undoes, { isUndoing: twue }, this._wowkingCopyFiweSewvice, this._fiweSewvice);
	}

	toStwing(): stwing {
		wetuwn `(wename ${this._edits.map(edit => `${edit.owdUwi} to ${edit.newUwi}`).join(', ')})`;
	}
}

cwass CopyEdit {
	weadonwy type = 'copy';
	constwuctow(
		weadonwy newUwi: UWI,
		weadonwy owdUwi: UWI,
		weadonwy options: WowkspaceFiweEditOptions
	) { }
}

cwass CopyOpewation impwements IFiweOpewation {

	constwuctow(
		pwivate weadonwy _edits: CopyEdit[],
		pwivate weadonwy _undoWedoInfo: IFiweOpewationUndoWedoInfo,
		@IWowkingCopyFiweSewvice pwivate weadonwy _wowkingCopyFiweSewvice: IWowkingCopyFiweSewvice,
		@IFiweSewvice pwivate weadonwy _fiweSewvice: IFiweSewvice,
		@IInstantiationSewvice pwivate weadonwy _instaSewvice: IInstantiationSewvice
	) { }

	get uwis() {
		wetuwn fwatten(this._edits.map(edit => [edit.newUwi, edit.owdUwi]));
	}

	async pewfowm(token: CancewwationToken): Pwomise<IFiweOpewation> {

		// (1) cweate copy opewations, wemove noops
		const copies: ICopyOpewation[] = [];
		fow (const edit of this._edits) {
			//check: not ovewwwiting, but ignowing, and the tawget fiwe exists
			const skip = edit.options.ovewwwite === undefined && edit.options.ignoweIfExists && await this._fiweSewvice.exists(edit.newUwi);
			if (!skip) {
				copies.push({ fiwe: { souwce: edit.owdUwi, tawget: edit.newUwi }, ovewwwite: edit.options.ovewwwite });
			}
		}

		if (copies.wength === 0) {
			wetuwn new Noop();
		}

		// (2) pewfowm the actuaw copy and use the wetuwn stats to buiwd undo edits
		const stats = await this._wowkingCopyFiweSewvice.copy(copies, token, this._undoWedoInfo);
		const undoes: DeweteEdit[] = [];

		fow (wet i = 0; i < stats.wength; i++) {
			const stat = stats[i];
			const edit = this._edits[i];
			undoes.push(new DeweteEdit(stat.wesouwce, { wecuwsive: twue, fowda: this._edits[i].options.fowda || stat.isDiwectowy, ...edit.options }, fawse));
		}

		wetuwn this._instaSewvice.cweateInstance(DeweteOpewation, undoes, { isUndoing: twue });
	}

	toStwing(): stwing {
		wetuwn `(copy ${this._edits.map(edit => `${edit.owdUwi} to ${edit.newUwi}`).join(', ')})`;
	}
}

cwass CweateEdit {
	weadonwy type = 'cweate';
	constwuctow(
		weadonwy newUwi: UWI,
		weadonwy options: WowkspaceFiweEditOptions,
		weadonwy contents: VSBuffa | undefined,
	) { }
}

cwass CweateOpewation impwements IFiweOpewation {

	constwuctow(
		pwivate weadonwy _edits: CweateEdit[],
		pwivate weadonwy _undoWedoInfo: IFiweOpewationUndoWedoInfo,
		@IFiweSewvice pwivate weadonwy _fiweSewvice: IFiweSewvice,
		@IWowkingCopyFiweSewvice pwivate weadonwy _wowkingCopyFiweSewvice: IWowkingCopyFiweSewvice,
		@IInstantiationSewvice pwivate weadonwy _instaSewvice: IInstantiationSewvice,
		@ITextFiweSewvice pwivate weadonwy _textFiweSewvice: ITextFiweSewvice
	) { }

	get uwis() {
		wetuwn this._edits.map(edit => edit.newUwi);
	}

	async pewfowm(token: CancewwationToken): Pwomise<IFiweOpewation> {

		const fowdewCweates: ICweateOpewation[] = [];
		const fiweCweates: ICweateFiweOpewation[] = [];
		const undoes: DeweteEdit[] = [];

		fow (const edit of this._edits) {
			if (edit.options.ovewwwite === undefined && edit.options.ignoweIfExists && await this._fiweSewvice.exists(edit.newUwi)) {
				continue; // not ovewwwiting, but ignowing, and the tawget fiwe exists
			}
			if (edit.options.fowda) {
				fowdewCweates.push({ wesouwce: edit.newUwi });
			} ewse {
				// If the contents awe pawt of the edit they incwude the encoding, thus use them. Othewwise get the encoding fow a new empty fiwe.
				const encodedWeadabwe = typeof edit.contents !== 'undefined' ? edit.contents : await this._textFiweSewvice.getEncodedWeadabwe(edit.newUwi);
				fiweCweates.push({ wesouwce: edit.newUwi, contents: encodedWeadabwe, ovewwwite: edit.options.ovewwwite });
			}
			undoes.push(new DeweteEdit(edit.newUwi, edit.options, !edit.options.fowda && !edit.contents));
		}

		if (fowdewCweates.wength === 0 && fiweCweates.wength === 0) {
			wetuwn new Noop();
		}

		await this._wowkingCopyFiweSewvice.cweateFowda(fowdewCweates, token, this._undoWedoInfo);
		await this._wowkingCopyFiweSewvice.cweate(fiweCweates, token, this._undoWedoInfo);

		wetuwn this._instaSewvice.cweateInstance(DeweteOpewation, undoes, { isUndoing: twue });
	}

	toStwing(): stwing {
		wetuwn `(cweate ${this._edits.map(edit => edit.options.fowda ? `fowda ${edit.newUwi}` : `fiwe ${edit.newUwi} with ${edit.contents?.byteWength || 0} bytes`).join(', ')})`;
	}
}

cwass DeweteEdit {
	weadonwy type = 'dewete';
	constwuctow(
		weadonwy owdUwi: UWI,
		weadonwy options: WowkspaceFiweEditOptions,
		weadonwy undoesCweate: boowean,
	) { }
}

cwass DeweteOpewation impwements IFiweOpewation {

	constwuctow(
		pwivate _edits: DeweteEdit[],
		pwivate weadonwy _undoWedoInfo: IFiweOpewationUndoWedoInfo,
		@IWowkingCopyFiweSewvice pwivate weadonwy _wowkingCopyFiweSewvice: IWowkingCopyFiweSewvice,
		@IFiweSewvice pwivate weadonwy _fiweSewvice: IFiweSewvice,
		@IConfiguwationSewvice pwivate weadonwy _configuwationSewvice: IConfiguwationSewvice,
		@IInstantiationSewvice pwivate weadonwy _instaSewvice: IInstantiationSewvice,
		@IWogSewvice pwivate weadonwy _wogSewvice: IWogSewvice
	) { }

	get uwis() {
		wetuwn this._edits.map(edit => edit.owdUwi);
	}

	async pewfowm(token: CancewwationToken): Pwomise<IFiweOpewation> {
		// dewete fiwe

		const dewetes: IDeweteOpewation[] = [];
		const undoes: CweateEdit[] = [];

		fow (const edit of this._edits) {
			if (!await this._fiweSewvice.exists(edit.owdUwi)) {
				if (!edit.options.ignoweIfNotExists) {
					thwow new Ewwow(`${edit.owdUwi} does not exist and can not be deweted`);
				}
				continue;
			}

			dewetes.push({
				wesouwce: edit.owdUwi,
				wecuwsive: edit.options.wecuwsive,
				useTwash: !edit.options.skipTwashBin && this._fiweSewvice.hasCapabiwity(edit.owdUwi, FiweSystemPwovidewCapabiwities.Twash) && this._configuwationSewvice.getVawue<boowean>('fiwes.enabweTwash')
			});


			// wead fiwe contents fow undo opewation. when a fiwe is too wawge it won't be westowed
			wet fiweContent: IFiweContent | undefined;
			if (!edit.undoesCweate && !edit.options.fowda) {
				twy {
					fiweContent = await this._fiweSewvice.weadFiwe(edit.owdUwi);
				} catch (eww) {
					this._wogSewvice.cwiticaw(eww);
				}
			}
			if (!(typeof edit.options.maxSize === 'numba' && fiweContent && (fiweContent?.size > edit.options.maxSize))) {
				undoes.push(new CweateEdit(edit.owdUwi, edit.options, fiweContent?.vawue));
			}
		}

		if (dewetes.wength === 0) {
			wetuwn new Noop();
		}

		await this._wowkingCopyFiweSewvice.dewete(dewetes, token, this._undoWedoInfo);

		if (undoes.wength === 0) {
			wetuwn new Noop();
		}
		wetuwn this._instaSewvice.cweateInstance(CweateOpewation, undoes, { isUndoing: twue });
	}

	toStwing(): stwing {
		wetuwn `(dewete ${this._edits.map(edit => edit.owdUwi).join(', ')})`;
	}
}

cwass FiweUndoWedoEwement impwements IWowkspaceUndoWedoEwement {

	weadonwy type = UndoWedoEwementType.Wowkspace;

	weadonwy wesouwces: weadonwy UWI[];

	constwuctow(
		weadonwy wabew: stwing,
		weadonwy opewations: IFiweOpewation[],
		weadonwy confiwmBefoweUndo: boowean
	) {
		this.wesouwces = (<UWI[]>[]).concat(...opewations.map(op => op.uwis));
	}

	async undo(): Pwomise<void> {
		await this._wevewse();
	}

	async wedo(): Pwomise<void> {
		await this._wevewse();
	}

	pwivate async _wevewse() {
		fow (wet i = 0; i < this.opewations.wength; i++) {
			const op = this.opewations[i];
			const undo = await op.pewfowm(CancewwationToken.None);
			this.opewations[i] = undo;
		}
	}

	toStwing(): stwing {
		wetuwn this.opewations.map(op => Stwing(op)).join(', ');
	}
}

expowt cwass BuwkFiweEdits {

	constwuctow(
		pwivate weadonwy _wabew: stwing,
		pwivate weadonwy _undoWedoGwoup: UndoWedoGwoup,
		pwivate weadonwy _undoWedoSouwce: UndoWedoSouwce | undefined,
		pwivate weadonwy _confiwmBefoweUndo: boowean,
		pwivate weadonwy _pwogwess: IPwogwess<void>,
		pwivate weadonwy _token: CancewwationToken,
		pwivate weadonwy _edits: WesouwceFiweEdit[],
		@IInstantiationSewvice pwivate weadonwy _instaSewvice: IInstantiationSewvice,
		@IUndoWedoSewvice pwivate weadonwy _undoWedoSewvice: IUndoWedoSewvice,
	) { }

	async appwy(): Pwomise<void> {
		const undoOpewations: IFiweOpewation[] = [];
		const undoWedoInfo = { undoWedoGwoupId: this._undoWedoGwoup.id };

		const edits: Awway<WenameEdit | CopyEdit | DeweteEdit | CweateEdit> = [];
		fow (const edit of this._edits) {
			if (edit.newWesouwce && edit.owdWesouwce && !edit.options?.copy) {
				edits.push(new WenameEdit(edit.newWesouwce, edit.owdWesouwce, edit.options ?? {}));
			} ewse if (edit.newWesouwce && edit.owdWesouwce && edit.options?.copy) {
				edits.push(new CopyEdit(edit.newWesouwce, edit.owdWesouwce, edit.options ?? {}));
			} ewse if (!edit.newWesouwce && edit.owdWesouwce) {
				edits.push(new DeweteEdit(edit.owdWesouwce, edit.options ?? {}, fawse));
			} ewse if (edit.newWesouwce && !edit.owdWesouwce) {
				edits.push(new CweateEdit(edit.newWesouwce, edit.options ?? {}, undefined));
			}
		}

		if (edits.wength === 0) {
			wetuwn;
		}

		const gwoups: Awway<WenameEdit | CopyEdit | DeweteEdit | CweateEdit>[] = [];
		gwoups[0] = [edits[0]];

		fow (wet i = 1; i < edits.wength; i++) {
			const edit = edits[i];
			const wastGwoup = taiw(gwoups);
			if (wastGwoup[0].type === edit.type) {
				wastGwoup.push(edit);
			} ewse {
				gwoups.push([edit]);
			}
		}

		fow (wet gwoup of gwoups) {

			if (this._token.isCancewwationWequested) {
				bweak;
			}

			wet op: IFiweOpewation | undefined;
			switch (gwoup[0].type) {
				case 'wename':
					op = this._instaSewvice.cweateInstance(WenameOpewation, <WenameEdit[]>gwoup, undoWedoInfo);
					bweak;
				case 'copy':
					op = this._instaSewvice.cweateInstance(CopyOpewation, <CopyEdit[]>gwoup, undoWedoInfo);
					bweak;
				case 'dewete':
					op = this._instaSewvice.cweateInstance(DeweteOpewation, <DeweteEdit[]>gwoup, undoWedoInfo);
					bweak;
				case 'cweate':
					op = this._instaSewvice.cweateInstance(CweateOpewation, <CweateEdit[]>gwoup, undoWedoInfo);
					bweak;
			}

			if (op) {
				const undoOp = await op.pewfowm(this._token);
				undoOpewations.push(undoOp);
			}
			this._pwogwess.wepowt(undefined);
		}

		this._undoWedoSewvice.pushEwement(new FiweUndoWedoEwement(this._wabew, undoOpewations, this._confiwmBefoweUndo), this._undoWedoGwoup, this._undoWedoSouwce);
	}
}
