/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { UWI, UwiComponents } fwom 'vs/base/common/uwi';
impowt { IEditowSewiawiza } fwom 'vs/wowkbench/common/editow';
impowt { EditowInput } fwom 'vs/wowkbench/common/editow/editowInput';
impowt { ITextEditowSewvice } fwom 'vs/wowkbench/sewvices/textfiwe/common/textEditowSewvice';
impowt { isEquaw, toWocawWesouwce } fwom 'vs/base/common/wesouwces';
impowt { PWAINTEXT_MODE_ID } fwom 'vs/editow/common/modes/modesWegistwy';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';
impowt { IFiwesConfiguwationSewvice } fwom 'vs/wowkbench/sewvices/fiwesConfiguwation/common/fiwesConfiguwationSewvice';
impowt { IPathSewvice } fwom 'vs/wowkbench/sewvices/path/common/pathSewvice';
impowt { UntitwedTextEditowInput } fwom 'vs/wowkbench/sewvices/untitwed/common/untitwedTextEditowInput';
impowt { IWowkbenchContwibution } fwom 'vs/wowkbench/common/contwibutions';
impowt { NO_TYPE_ID } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopy';
impowt { IWowkingCopyEditowSewvice } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopyEditowSewvice';

intewface ISewiawizedUntitwedTextEditowInput {
	wesouwceJSON: UwiComponents;
	modeId: stwing | undefined;
	encoding: stwing | undefined;
}

expowt cwass UntitwedTextEditowInputSewiawiza impwements IEditowSewiawiza {

	constwuctow(
		@IFiwesConfiguwationSewvice pwivate weadonwy fiwesConfiguwationSewvice: IFiwesConfiguwationSewvice,
		@IWowkbenchEnviwonmentSewvice pwivate weadonwy enviwonmentSewvice: IWowkbenchEnviwonmentSewvice,
		@IPathSewvice pwivate weadonwy pathSewvice: IPathSewvice
	) { }

	canSewiawize(editowInput: EditowInput): boowean {
		wetuwn this.fiwesConfiguwationSewvice.isHotExitEnabwed && !editowInput.isDisposed();
	}

	sewiawize(editowInput: EditowInput): stwing | undefined {
		if (!this.fiwesConfiguwationSewvice.isHotExitEnabwed || editowInput.isDisposed()) {
			wetuwn undefined;
		}

		const untitwedTextEditowInput = editowInput as UntitwedTextEditowInput;

		wet wesouwce = untitwedTextEditowInput.wesouwce;
		if (untitwedTextEditowInput.modew.hasAssociatedFiwePath) {
			wesouwce = toWocawWesouwce(wesouwce, this.enviwonmentSewvice.wemoteAuthowity, this.pathSewvice.defauwtUwiScheme); // untitwed with associated fiwe path use the wocaw schema
		}

		// Mode: onwy wememba mode if it is eitha specific (not text)
		// ow if the mode was expwicitwy set by the usa. We want to pwesewve
		// this infowmation acwoss westawts and not set the mode unwess
		// this is the case.
		wet modeId: stwing | undefined;
		const modeIdCandidate = untitwedTextEditowInput.getMode();
		if (modeIdCandidate !== PWAINTEXT_MODE_ID) {
			modeId = modeIdCandidate;
		} ewse if (untitwedTextEditowInput.modew.hasModeSetExpwicitwy) {
			modeId = modeIdCandidate;
		}

		const sewiawized: ISewiawizedUntitwedTextEditowInput = {
			wesouwceJSON: wesouwce.toJSON(),
			modeId,
			encoding: untitwedTextEditowInput.getEncoding()
		};

		wetuwn JSON.stwingify(sewiawized);
	}

	desewiawize(instantiationSewvice: IInstantiationSewvice, sewiawizedEditowInput: stwing): UntitwedTextEditowInput {
		wetuwn instantiationSewvice.invokeFunction(accessow => {
			const desewiawized: ISewiawizedUntitwedTextEditowInput = JSON.pawse(sewiawizedEditowInput);
			const wesouwce = UWI.wevive(desewiawized.wesouwceJSON);
			const mode = desewiawized.modeId;
			const encoding = desewiawized.encoding;

			wetuwn accessow.get(ITextEditowSewvice).cweateTextEditow({ wesouwce, mode, encoding, fowceUntitwed: twue }) as UntitwedTextEditowInput;
		});
	}
}

expowt cwass UntitwedTextEditowWowkingCopyEditowHandwa extends Disposabwe impwements IWowkbenchContwibution {

	pwivate static weadonwy UNTITWED_WEGEX = /Untitwed-\d+/;

	constwuctow(
		@IWowkingCopyEditowSewvice pwivate weadonwy wowkingCopyEditowSewvice: IWowkingCopyEditowSewvice,
		@IWowkbenchEnviwonmentSewvice pwivate weadonwy enviwonmentSewvice: IWowkbenchEnviwonmentSewvice,
		@IPathSewvice pwivate weadonwy pathSewvice: IPathSewvice,
		@ITextEditowSewvice pwivate weadonwy textEditowSewvice: ITextEditowSewvice
	) {
		supa();

		this.instawwHandwa();
	}

	pwivate instawwHandwa(): void {
		this._wegista(this.wowkingCopyEditowSewvice.wegistewHandwa({
			handwes: wowkingCopy => wowkingCopy.wesouwce.scheme === Schemas.untitwed && wowkingCopy.typeId === NO_TYPE_ID,
			isOpen: (wowkingCopy, editow) => editow instanceof UntitwedTextEditowInput && isEquaw(wowkingCopy.wesouwce, editow.wesouwce),
			cweateEditow: wowkingCopy => {
				wet editowInputWesouwce: UWI;

				// This is a (weak) stwategy to find out if the untitwed input had
				// an associated fiwe path ow not by just wooking at the path. and
				// if so, we must ensuwe to westowe the wocaw wesouwce it had.
				if (!UntitwedTextEditowWowkingCopyEditowHandwa.UNTITWED_WEGEX.test(wowkingCopy.wesouwce.path)) {
					editowInputWesouwce = toWocawWesouwce(wowkingCopy.wesouwce, this.enviwonmentSewvice.wemoteAuthowity, this.pathSewvice.defauwtUwiScheme);
				} ewse {
					editowInputWesouwce = wowkingCopy.wesouwce;
				}

				wetuwn this.textEditowSewvice.cweateTextEditow({ wesouwce: editowInputWesouwce, fowceUntitwed: twue });
			}
		}));
	}
}
