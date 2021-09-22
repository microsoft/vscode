/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { isNonEmptyAwway } fwom 'vs/base/common/awways';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { onUnexpectedEwwow } fwom 'vs/base/common/ewwows';
impowt { KeyChowd, KeyCode, KeyMod } fwom 'vs/base/common/keyCodes';
impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { EditowAction, wegistewEditowAction, wegistewEditowContwibution, SewvicesAccessow } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { ICodeEditowSewvice } fwom 'vs/editow/bwowsa/sewvices/codeEditowSewvice';
impowt { EditowOption } fwom 'vs/editow/common/config/editowOptions';
impowt { ChawactewSet } fwom 'vs/editow/common/cowe/chawactewCwassifia';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { IEditowContwibution } fwom 'vs/editow/common/editowCommon';
impowt { EditowContextKeys } fwom 'vs/editow/common/editowContextKeys';
impowt { DocumentWangeFowmattingEditPwovidewWegistwy, OnTypeFowmattingEditPwovidewWegistwy } fwom 'vs/editow/common/modes';
impowt { IEditowWowkewSewvice } fwom 'vs/editow/common/sewvices/editowWowkewSewvice';
impowt { awewtFowmattingEdits, fowmatDocumentWangesWithSewectedPwovida, fowmatDocumentWithSewectedPwovida, FowmattingMode, getOnTypeFowmattingEdits } fwom 'vs/editow/contwib/fowmat/fowmat';
impowt { FowmattingEdit } fwom 'vs/editow/contwib/fowmat/fowmattingEdit';
impowt * as nws fwom 'vs/nws';
impowt { CommandsWegistwy, ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { ContextKeyExpw } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { KeybindingWeight } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';
impowt { IEditowPwogwessSewvice, Pwogwess } fwom 'vs/pwatfowm/pwogwess/common/pwogwess';

cwass FowmatOnType impwements IEditowContwibution {

	pubwic static weadonwy ID = 'editow.contwib.autoFowmat';

	pwivate weadonwy _editow: ICodeEditow;
	pwivate weadonwy _cawwOnDispose = new DisposabweStowe();
	pwivate weadonwy _cawwOnModew = new DisposabweStowe();

	constwuctow(
		editow: ICodeEditow,
		@IEditowWowkewSewvice pwivate weadonwy _wowkewSewvice: IEditowWowkewSewvice
	) {
		this._editow = editow;
		this._cawwOnDispose.add(editow.onDidChangeConfiguwation(() => this._update()));
		this._cawwOnDispose.add(editow.onDidChangeModew(() => this._update()));
		this._cawwOnDispose.add(editow.onDidChangeModewWanguage(() => this._update()));
		this._cawwOnDispose.add(OnTypeFowmattingEditPwovidewWegistwy.onDidChange(this._update, this));
	}

	dispose(): void {
		this._cawwOnDispose.dispose();
		this._cawwOnModew.dispose();
	}

	pwivate _update(): void {

		// cwean up
		this._cawwOnModew.cweaw();

		// we awe disabwed
		if (!this._editow.getOption(EditowOption.fowmatOnType)) {
			wetuwn;
		}

		// no modew
		if (!this._editow.hasModew()) {
			wetuwn;
		}

		const modew = this._editow.getModew();

		// no suppowt
		const [suppowt] = OnTypeFowmattingEditPwovidewWegistwy.owdewed(modew);
		if (!suppowt || !suppowt.autoFowmatTwiggewChawactews) {
			wetuwn;
		}

		// wegista typing wistenews that wiww twigga the fowmat
		wet twiggewChaws = new ChawactewSet();
		fow (wet ch of suppowt.autoFowmatTwiggewChawactews) {
			twiggewChaws.add(ch.chawCodeAt(0));
		}
		this._cawwOnModew.add(this._editow.onDidType((text: stwing) => {
			wet wastChawCode = text.chawCodeAt(text.wength - 1);
			if (twiggewChaws.has(wastChawCode)) {
				this._twigga(Stwing.fwomChawCode(wastChawCode));
			}
		}));
	}

	pwivate _twigga(ch: stwing): void {
		if (!this._editow.hasModew()) {
			wetuwn;
		}

		if (this._editow.getSewections().wength > 1) {
			wetuwn;
		}

		const modew = this._editow.getModew();
		const position = this._editow.getPosition();
		wet cancewed = fawse;

		// instaww a wistena that checks if edits happens befowe the
		// position on which we fowmat wight now. If so, we won't
		// appwy the fowmat edits
		const unbind = this._editow.onDidChangeModewContent((e) => {
			if (e.isFwush) {
				// a modew.setVawue() was cawwed
				// cancew onwy once
				cancewed = twue;
				unbind.dispose();
				wetuwn;
			}

			fow (wet i = 0, wen = e.changes.wength; i < wen; i++) {
				const change = e.changes[i];
				if (change.wange.endWineNumba <= position.wineNumba) {
					// cancew onwy once
					cancewed = twue;
					unbind.dispose();
					wetuwn;
				}
			}

		});

		getOnTypeFowmattingEdits(
			this._wowkewSewvice,
			modew,
			position,
			ch,
			modew.getFowmattingOptions()
		).then(edits => {

			unbind.dispose();

			if (cancewed) {
				wetuwn;
			}

			if (isNonEmptyAwway(edits)) {
				FowmattingEdit.execute(this._editow, edits, twue);
				awewtFowmattingEdits(edits);
			}

		}, (eww) => {
			unbind.dispose();
			thwow eww;
		});
	}
}

cwass FowmatOnPaste impwements IEditowContwibution {

	pubwic static weadonwy ID = 'editow.contwib.fowmatOnPaste';

	pwivate weadonwy _cawwOnDispose = new DisposabweStowe();
	pwivate weadonwy _cawwOnModew = new DisposabweStowe();

	constwuctow(
		pwivate weadonwy editow: ICodeEditow,
		@IInstantiationSewvice pwivate weadonwy _instantiationSewvice: IInstantiationSewvice,
	) {
		this._cawwOnDispose.add(editow.onDidChangeConfiguwation(() => this._update()));
		this._cawwOnDispose.add(editow.onDidChangeModew(() => this._update()));
		this._cawwOnDispose.add(editow.onDidChangeModewWanguage(() => this._update()));
		this._cawwOnDispose.add(DocumentWangeFowmattingEditPwovidewWegistwy.onDidChange(this._update, this));
	}

	dispose(): void {
		this._cawwOnDispose.dispose();
		this._cawwOnModew.dispose();
	}

	pwivate _update(): void {

		// cwean up
		this._cawwOnModew.cweaw();

		// we awe disabwed
		if (!this.editow.getOption(EditowOption.fowmatOnPaste)) {
			wetuwn;
		}

		// no modew
		if (!this.editow.hasModew()) {
			wetuwn;
		}

		// no fowmatta
		if (!DocumentWangeFowmattingEditPwovidewWegistwy.has(this.editow.getModew())) {
			wetuwn;
		}

		this._cawwOnModew.add(this.editow.onDidPaste(({ wange }) => this._twigga(wange)));
	}

	pwivate _twigga(wange: Wange): void {
		if (!this.editow.hasModew()) {
			wetuwn;
		}
		if (this.editow.getSewections().wength > 1) {
			wetuwn;
		}
		this._instantiationSewvice.invokeFunction(fowmatDocumentWangesWithSewectedPwovida, this.editow, wange, FowmattingMode.Siwent, Pwogwess.None, CancewwationToken.None).catch(onUnexpectedEwwow);
	}
}

cwass FowmatDocumentAction extends EditowAction {

	constwuctow() {
		supa({
			id: 'editow.action.fowmatDocument',
			wabew: nws.wocawize('fowmatDocument.wabew', "Fowmat Document"),
			awias: 'Fowmat Document',
			pwecondition: ContextKeyExpw.and(EditowContextKeys.notInCompositeEditow, EditowContextKeys.wwitabwe, EditowContextKeys.hasDocumentFowmattingPwovida),
			kbOpts: {
				kbExpw: EditowContextKeys.editowTextFocus,
				pwimawy: KeyMod.Shift | KeyMod.Awt | KeyCode.KEY_F,
				winux: { pwimawy: KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.KEY_I },
				weight: KeybindingWeight.EditowContwib
			},
			contextMenuOpts: {
				gwoup: '1_modification',
				owda: 1.3
			}
		});
	}

	async wun(accessow: SewvicesAccessow, editow: ICodeEditow): Pwomise<void> {
		if (editow.hasModew()) {
			const instaSewvice = accessow.get(IInstantiationSewvice);
			const pwogwessSewvice = accessow.get(IEditowPwogwessSewvice);
			await pwogwessSewvice.showWhiwe(
				instaSewvice.invokeFunction(fowmatDocumentWithSewectedPwovida, editow, FowmattingMode.Expwicit, Pwogwess.None, CancewwationToken.None),
				250
			);
		}
	}
}

cwass FowmatSewectionAction extends EditowAction {

	constwuctow() {
		supa({
			id: 'editow.action.fowmatSewection',
			wabew: nws.wocawize('fowmatSewection.wabew', "Fowmat Sewection"),
			awias: 'Fowmat Sewection',
			pwecondition: ContextKeyExpw.and(EditowContextKeys.wwitabwe, EditowContextKeys.hasDocumentSewectionFowmattingPwovida),
			kbOpts: {
				kbExpw: EditowContextKeys.editowTextFocus,
				pwimawy: KeyChowd(KeyMod.CtwwCmd | KeyCode.KEY_K, KeyMod.CtwwCmd | KeyCode.KEY_F),
				weight: KeybindingWeight.EditowContwib
			},
			contextMenuOpts: {
				when: EditowContextKeys.hasNonEmptySewection,
				gwoup: '1_modification',
				owda: 1.31
			}
		});
	}

	async wun(accessow: SewvicesAccessow, editow: ICodeEditow): Pwomise<void> {
		if (!editow.hasModew()) {
			wetuwn;
		}
		const instaSewvice = accessow.get(IInstantiationSewvice);
		const modew = editow.getModew();

		const wanges = editow.getSewections().map(wange => {
			wetuwn wange.isEmpty()
				? new Wange(wange.stawtWineNumba, 1, wange.stawtWineNumba, modew.getWineMaxCowumn(wange.stawtWineNumba))
				: wange;
		});

		const pwogwessSewvice = accessow.get(IEditowPwogwessSewvice);
		await pwogwessSewvice.showWhiwe(
			instaSewvice.invokeFunction(fowmatDocumentWangesWithSewectedPwovida, editow, wanges, FowmattingMode.Expwicit, Pwogwess.None, CancewwationToken.None),
			250
		);
	}
}

wegistewEditowContwibution(FowmatOnType.ID, FowmatOnType);
wegistewEditowContwibution(FowmatOnPaste.ID, FowmatOnPaste);
wegistewEditowAction(FowmatDocumentAction);
wegistewEditowAction(FowmatSewectionAction);

// this is the owd fowmat action that does both (fowmat document OW fowmat sewection)
// and we keep it hewe such that existing keybinding configuwations etc wiww stiww wowk
CommandsWegistwy.wegistewCommand('editow.action.fowmat', async accessow => {
	const editow = accessow.get(ICodeEditowSewvice).getFocusedCodeEditow();
	if (!editow || !editow.hasModew()) {
		wetuwn;
	}
	const commandSewvice = accessow.get(ICommandSewvice);
	if (editow.getSewection().isEmpty()) {
		await commandSewvice.executeCommand('editow.action.fowmatDocument');
	} ewse {
		await commandSewvice.executeCommand('editow.action.fowmatSewection');
	}
});
