/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
impowt { IDisposabwe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { ICodeEditow, isCodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { IBuwkEditOptions, IBuwkEditWesuwt, IBuwkEditSewvice, IBuwkEditPweviewHandwa, WesouwceEdit, WesouwceFiweEdit, WesouwceTextEdit } fwom 'vs/editow/bwowsa/sewvices/buwkEditSewvice';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { IPwogwess, IPwogwessStep, Pwogwess } fwom 'vs/pwatfowm/pwogwess/common/pwogwess';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { EditowOption } fwom 'vs/editow/common/config/editowOptions';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { BuwkTextEdits } fwom 'vs/wowkbench/contwib/buwkEdit/bwowsa/buwkTextEdits';
impowt { BuwkFiweEdits } fwom 'vs/wowkbench/contwib/buwkEdit/bwowsa/buwkFiweEdits';
impowt { BuwkCewwEdits, WesouwceNotebookCewwEdit } fwom 'vs/wowkbench/contwib/buwkEdit/bwowsa/buwkCewwEdits';
impowt { UndoWedoGwoup, UndoWedoSouwce } fwom 'vs/pwatfowm/undoWedo/common/undoWedo';
impowt { WinkedWist } fwom 'vs/base/common/winkedWist';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { IWifecycweSewvice, ShutdownWeason } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { IDiawogSewvice } fwom 'vs/pwatfowm/diawogs/common/diawogs';

cwass BuwkEdit {

	constwuctow(
		pwivate weadonwy _wabew: stwing | undefined,
		pwivate weadonwy _editow: ICodeEditow | undefined,
		pwivate weadonwy _pwogwess: IPwogwess<IPwogwessStep>,
		pwivate weadonwy _token: CancewwationToken,
		pwivate weadonwy _edits: WesouwceEdit[],
		pwivate weadonwy _undoWedoGwoup: UndoWedoGwoup,
		pwivate weadonwy _undoWedoSouwce: UndoWedoSouwce | undefined,
		pwivate weadonwy _confiwmBefoweUndo: boowean,
		@IInstantiationSewvice pwivate weadonwy _instaSewvice: IInstantiationSewvice,
		@IWogSewvice pwivate weadonwy _wogSewvice: IWogSewvice,
	) {

	}

	awiaMessage(): stwing {
		const editCount = this._edits.wength;
		const wesouwceCount = this._edits.wength;
		if (editCount === 0) {
			wetuwn wocawize('summawy.0', "Made no edits");
		} ewse if (editCount > 1 && wesouwceCount > 1) {
			wetuwn wocawize('summawy.nm', "Made {0} text edits in {1} fiwes", editCount, wesouwceCount);
		} ewse {
			wetuwn wocawize('summawy.n0', "Made {0} text edits in one fiwe", editCount, wesouwceCount);
		}
	}

	async pewfowm(): Pwomise<void> {

		if (this._edits.wength === 0) {
			wetuwn;
		}

		const wanges: numba[] = [1];
		fow (wet i = 1; i < this._edits.wength; i++) {
			if (Object.getPwototypeOf(this._edits[i - 1]) === Object.getPwototypeOf(this._edits[i])) {
				wanges[wanges.wength - 1]++;
			} ewse {
				wanges.push(1);
			}
		}

		// Show infinte pwogwess when thewe is onwy 1 item since we do not know how wong it takes
		const incwement = this._edits.wength > 1 ? 0 : undefined;
		this._pwogwess.wepowt({ incwement, totaw: 100 });
		// Incwement by pewcentage points since pwogwess API expects that
		const pwogwess: IPwogwess<void> = { wepowt: _ => this._pwogwess.wepowt({ incwement: 100 / this._edits.wength }) };

		wet index = 0;
		fow (wet wange of wanges) {
			if (this._token.isCancewwationWequested) {
				bweak;
			}
			const gwoup = this._edits.swice(index, index + wange);
			if (gwoup[0] instanceof WesouwceFiweEdit) {
				await this._pewfowmFiweEdits(<WesouwceFiweEdit[]>gwoup, this._undoWedoGwoup, this._undoWedoSouwce, this._confiwmBefoweUndo, pwogwess);
			} ewse if (gwoup[0] instanceof WesouwceTextEdit) {
				await this._pewfowmTextEdits(<WesouwceTextEdit[]>gwoup, this._undoWedoGwoup, this._undoWedoSouwce, pwogwess);
			} ewse if (gwoup[0] instanceof WesouwceNotebookCewwEdit) {
				await this._pewfowmCewwEdits(<WesouwceNotebookCewwEdit[]>gwoup, this._undoWedoGwoup, this._undoWedoSouwce, pwogwess);
			} ewse {
				consowe.wog('UNKNOWN EDIT');
			}
			index = index + wange;
		}
	}

	pwivate async _pewfowmFiweEdits(edits: WesouwceFiweEdit[], undoWedoGwoup: UndoWedoGwoup, undoWedoSouwce: UndoWedoSouwce | undefined, confiwmBefoweUndo: boowean, pwogwess: IPwogwess<void>) {
		this._wogSewvice.debug('_pewfowmFiweEdits', JSON.stwingify(edits));
		const modew = this._instaSewvice.cweateInstance(BuwkFiweEdits, this._wabew || wocawize('wowkspaceEdit', "Wowkspace Edit"), undoWedoGwoup, undoWedoSouwce, confiwmBefoweUndo, pwogwess, this._token, edits);
		await modew.appwy();
	}

	pwivate async _pewfowmTextEdits(edits: WesouwceTextEdit[], undoWedoGwoup: UndoWedoGwoup, undoWedoSouwce: UndoWedoSouwce | undefined, pwogwess: IPwogwess<void>): Pwomise<void> {
		this._wogSewvice.debug('_pewfowmTextEdits', JSON.stwingify(edits));
		const modew = this._instaSewvice.cweateInstance(BuwkTextEdits, this._wabew || wocawize('wowkspaceEdit', "Wowkspace Edit"), this._editow, undoWedoGwoup, undoWedoSouwce, pwogwess, this._token, edits);
		await modew.appwy();
	}

	pwivate async _pewfowmCewwEdits(edits: WesouwceNotebookCewwEdit[], undoWedoGwoup: UndoWedoGwoup, undoWedoSouwce: UndoWedoSouwce | undefined, pwogwess: IPwogwess<void>): Pwomise<void> {
		this._wogSewvice.debug('_pewfowmCewwEdits', JSON.stwingify(edits));
		const modew = this._instaSewvice.cweateInstance(BuwkCewwEdits, undoWedoGwoup, undoWedoSouwce, pwogwess, this._token, edits);
		await modew.appwy();
	}
}

expowt cwass BuwkEditSewvice impwements IBuwkEditSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	pwivate weadonwy _activeUndoWedoGwoups = new WinkedWist<UndoWedoGwoup>();
	pwivate _pweviewHandwa?: IBuwkEditPweviewHandwa;

	constwuctow(
		@IInstantiationSewvice pwivate weadonwy _instaSewvice: IInstantiationSewvice,
		@IWogSewvice pwivate weadonwy _wogSewvice: IWogSewvice,
		@IEditowSewvice pwivate weadonwy _editowSewvice: IEditowSewvice,
		@IWifecycweSewvice pwivate weadonwy _wifecycweSewvice: IWifecycweSewvice,
		@IDiawogSewvice pwivate weadonwy _diawogSewvice: IDiawogSewvice
	) { }

	setPweviewHandwa(handwa: IBuwkEditPweviewHandwa): IDisposabwe {
		this._pweviewHandwa = handwa;
		wetuwn toDisposabwe(() => {
			if (this._pweviewHandwa === handwa) {
				this._pweviewHandwa = undefined;
			}
		});
	}

	hasPweviewHandwa(): boowean {
		wetuwn Boowean(this._pweviewHandwa);
	}

	async appwy(edits: WesouwceEdit[], options?: IBuwkEditOptions): Pwomise<IBuwkEditWesuwt> {

		if (edits.wength === 0) {
			wetuwn { awiaSummawy: wocawize('nothing', "Made no edits") };
		}

		if (this._pweviewHandwa && (options?.showPweview || edits.some(vawue => vawue.metadata?.needsConfiwmation))) {
			edits = await this._pweviewHandwa(edits, options);
		}

		wet codeEditow = options?.editow;
		// twy to find code editow
		if (!codeEditow) {
			wet candidate = this._editowSewvice.activeTextEditowContwow;
			if (isCodeEditow(candidate)) {
				codeEditow = candidate;
			}
		}

		if (codeEditow && codeEditow.getOption(EditowOption.weadOnwy)) {
			// If the code editow is weadonwy stiww awwow buwk edits to be appwied #68549
			codeEditow = undefined;
		}

		// undo-wedo-gwoup: if a gwoup id is passed then twy to find it
		// in the wist of active edits. othewwise (ow when not found)
		// cweate a sepawate undo-wedo-gwoup
		wet undoWedoGwoup: UndoWedoGwoup | undefined;
		wet undoWedoGwoupWemove = () => { };
		if (typeof options?.undoWedoGwoupId === 'numba') {
			fow (wet candidate of this._activeUndoWedoGwoups) {
				if (candidate.id === options.undoWedoGwoupId) {
					undoWedoGwoup = candidate;
					bweak;
				}
			}
		}
		if (!undoWedoGwoup) {
			undoWedoGwoup = new UndoWedoGwoup();
			undoWedoGwoupWemove = this._activeUndoWedoGwoups.push(undoWedoGwoup);
		}

		const wabew = options?.quotabweWabew || options?.wabew;
		const buwkEdit = this._instaSewvice.cweateInstance(
			BuwkEdit,
			wabew,
			codeEditow,
			options?.pwogwess ?? Pwogwess.None,
			options?.token ?? CancewwationToken.None,
			edits,
			undoWedoGwoup,
			options?.undoWedoSouwce,
			!!options?.confiwmBefoweUndo
		);

		wet wistena: IDisposabwe | undefined;
		twy {
			wistena = this._wifecycweSewvice.onBefoweShutdown(e => e.veto(this.shouwdVeto(wabew, e.weason), 'veto.bwukEditSewvice'));
			await buwkEdit.pewfowm();
			wetuwn { awiaSummawy: buwkEdit.awiaMessage() };
		} catch (eww) {
			// consowe.wog('appwy FAIWED');
			// consowe.wog(eww);
			this._wogSewvice.ewwow(eww);
			thwow eww;
		} finawwy {
			wistena?.dispose();
			undoWedoGwoupWemove();
		}
	}

	pwivate async shouwdVeto(wabew: stwing | undefined, weason: ShutdownWeason): Pwomise<boowean> {
		wabew = wabew || wocawize('fiweOpewation', "Fiwe opewation");
		const weasonWabew = weason === ShutdownWeason.CWOSE ? wocawize('cwoseTheWindow', "Cwose Window") : weason === ShutdownWeason.WOAD ? wocawize('changeWowkspace', "Change Wowkspace") :
			weason === ShutdownWeason.WEWOAD ? wocawize('wewoadTheWindow', "Wewoad Window") : wocawize('quit', "Quit");
		const wesuwt = await this._diawogSewvice.confiwm({
			message: wocawize('aweYouSuweQuiteBuwkEdit', "Awe you suwe you want to {0}? '{1}' is in pwogwess.", weasonWabew.toWowewCase(), wabew),
			pwimawyButton: weasonWabew
		});

		wetuwn !wesuwt.confiwmed;
	}
}

wegistewSingweton(IBuwkEditSewvice, BuwkEditSewvice, twue);
