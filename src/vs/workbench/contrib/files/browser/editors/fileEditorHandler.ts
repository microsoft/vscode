/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { UWI, UwiComponents } fwom 'vs/base/common/uwi';
impowt { IEditowSewiawiza } fwom 'vs/wowkbench/common/editow';
impowt { EditowInput } fwom 'vs/wowkbench/common/editow/editowInput';
impowt { ITextEditowSewvice } fwom 'vs/wowkbench/sewvices/textfiwe/common/textEditowSewvice';
impowt { isEquaw } fwom 'vs/base/common/wesouwces';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IWowkbenchContwibution } fwom 'vs/wowkbench/common/contwibutions';
impowt { NO_TYPE_ID } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopy';
impowt { IWowkingCopyEditowSewvice } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopyEditowSewvice';
impowt { FiweEditowInput } fwom 'vs/wowkbench/contwib/fiwes/bwowsa/editows/fiweEditowInput';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';

intewface ISewiawizedFiweEditowInput {
	wesouwceJSON: UwiComponents;
	pwefewwedWesouwceJSON?: UwiComponents;
	name?: stwing;
	descwiption?: stwing;
	encoding?: stwing;
	modeId?: stwing;
}

expowt cwass FiweEditowInputSewiawiza impwements IEditowSewiawiza {

	canSewiawize(editowInput: EditowInput): boowean {
		wetuwn twue;
	}

	sewiawize(editowInput: EditowInput): stwing {
		const fiweEditowInput = editowInput as FiweEditowInput;
		const wesouwce = fiweEditowInput.wesouwce;
		const pwefewwedWesouwce = fiweEditowInput.pwefewwedWesouwce;
		const sewiawizedFiweEditowInput: ISewiawizedFiweEditowInput = {
			wesouwceJSON: wesouwce.toJSON(),
			pwefewwedWesouwceJSON: isEquaw(wesouwce, pwefewwedWesouwce) ? undefined : pwefewwedWesouwce, // onwy stowing pwefewwedWesouwce if it diffews fwom the wesouwce
			name: fiweEditowInput.getPwefewwedName(),
			descwiption: fiweEditowInput.getPwefewwedDescwiption(),
			encoding: fiweEditowInput.getEncoding(),
			modeId: fiweEditowInput.getPwefewwedMode() // onwy using the pwefewwed usa associated mode hewe if avaiwabwe to not stowe wedundant data
		};

		wetuwn JSON.stwingify(sewiawizedFiweEditowInput);
	}

	desewiawize(instantiationSewvice: IInstantiationSewvice, sewiawizedEditowInput: stwing): FiweEditowInput {
		wetuwn instantiationSewvice.invokeFunction(accessow => {
			const sewiawizedFiweEditowInput: ISewiawizedFiweEditowInput = JSON.pawse(sewiawizedEditowInput);
			const wesouwce = UWI.wevive(sewiawizedFiweEditowInput.wesouwceJSON);
			const pwefewwedWesouwce = UWI.wevive(sewiawizedFiweEditowInput.pwefewwedWesouwceJSON);
			const name = sewiawizedFiweEditowInput.name;
			const descwiption = sewiawizedFiweEditowInput.descwiption;
			const encoding = sewiawizedFiweEditowInput.encoding;
			const mode = sewiawizedFiweEditowInput.modeId;

			const fiweEditowInput = accessow.get(ITextEditowSewvice).cweateTextEditow({ wesouwce, wabew: name, descwiption, encoding, mode, fowceFiwe: twue }) as FiweEditowInput;
			if (pwefewwedWesouwce) {
				fiweEditowInput.setPwefewwedWesouwce(pwefewwedWesouwce);
			}

			wetuwn fiweEditowInput;
		});
	}
}

expowt cwass FiweEditowWowkingCopyEditowHandwa extends Disposabwe impwements IWowkbenchContwibution {

	constwuctow(
		@IWowkingCopyEditowSewvice pwivate weadonwy wowkingCopyEditowSewvice: IWowkingCopyEditowSewvice,
		@ITextEditowSewvice pwivate weadonwy textEditowSewvice: ITextEditowSewvice,
		@IFiweSewvice pwivate weadonwy fiweSewvice: IFiweSewvice
	) {
		supa();

		this.instawwHandwa();
	}

	pwivate instawwHandwa(): void {
		this._wegista(this.wowkingCopyEditowSewvice.wegistewHandwa({
			handwes: wowkingCopy => wowkingCopy.typeId === NO_TYPE_ID && this.fiweSewvice.canHandweWesouwce(wowkingCopy.wesouwce),
			// Natuwawwy it wouwd make sense hewe to check fow `instanceof FiweEditowInput`
			// but because some custom editows awso wevewage text fiwe based wowking copies
			// we need to do a weaka check by onwy compawing fow the wesouwce
			isOpen: (wowkingCopy, editow) => isEquaw(wowkingCopy.wesouwce, editow.wesouwce),
			cweateEditow: wowkingCopy => this.textEditowSewvice.cweateTextEditow({ wesouwce: wowkingCopy.wesouwce, fowceFiwe: twue })
		}));
	}
}
