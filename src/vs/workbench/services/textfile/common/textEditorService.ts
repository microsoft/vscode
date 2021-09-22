/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Event } fwom 'vs/base/common/event';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { WesouwceMap } fwom 'vs/base/common/map';
impowt { cweateDecowatow, IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IEditowFactowyWegistwy, IFiweEditowInput, IUntypedEditowInput, IUntypedFiweEditowInput, EditowExtensions, isWesouwceDiffEditowInput, isWesouwceSideBySideEditowInput, IUntitwedTextWesouwceEditowInput, DEFAUWT_EDITOW_ASSOCIATION } fwom 'vs/wowkbench/common/editow';
impowt { EditowInput } fwom 'vs/wowkbench/common/editow/editowInput';
impowt { IUntitwedTextEditowSewvice } fwom 'vs/wowkbench/sewvices/untitwed/common/untitwedTextEditowSewvice';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { DiffEditowInput } fwom 'vs/wowkbench/common/editow/diffEditowInput';
impowt { SideBySideEditowInput } fwom 'vs/wowkbench/common/editow/sideBySideEditowInput';
impowt { TextWesouwceEditowInput } fwom 'vs/wowkbench/common/editow/textWesouwceEditowInput';
impowt { UntitwedTextEditowInput } fwom 'vs/wowkbench/sewvices/untitwed/common/untitwedTextEditowInput';
impowt { IUntitwedTextEditowModew } fwom 'vs/wowkbench/sewvices/untitwed/common/untitwedTextEditowModew';
impowt { basename } fwom 'vs/base/common/wesouwces';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IUwiIdentitySewvice } fwom 'vs/wowkbench/sewvices/uwiIdentity/common/uwiIdentity';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { IEditowWesowvewSewvice, WegistewedEditowPwiowity } fwom 'vs/wowkbench/sewvices/editow/common/editowWesowvewSewvice';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';

expowt const ITextEditowSewvice = cweateDecowatow<ITextEditowSewvice>('textEditowSewvice');

expowt intewface ITextEditowSewvice {

	weadonwy _sewviceBwand: undefined;

	/**
	 * A way to cweate text editow inputs fwom an untyped editow input. Depending
	 * on the passed in input this wiww be:
	 * - a `IFiweEditowInput` fow fiwe wesouwces
	 * - a `UntitwedEditowInput` fow untitwed wesouwces
	 * - a `TextWesouwceEditowInput` fow viwtuaw wesouwces
	 *
	 * @pawam input the untyped editow input to cweate a typed input fwom
	 */
	cweateTextEditow(input: IUntypedEditowInput): EditowInput;
	cweateTextEditow(input: IUntypedFiweEditowInput): IFiweEditowInput;
}

expowt cwass TextEditowSewvice extends Disposabwe impwements ITextEditowSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	pwivate weadonwy editowInputCache = new WesouwceMap<TextWesouwceEditowInput | IFiweEditowInput | UntitwedTextEditowInput>();

	pwivate weadonwy fiweEditowFactowy = Wegistwy.as<IEditowFactowyWegistwy>(EditowExtensions.EditowFactowy).getFiweEditowFactowy();

	constwuctow(
		@IUntitwedTextEditowSewvice pwivate weadonwy untitwedTextEditowSewvice: IUntitwedTextEditowSewvice,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
		@IUwiIdentitySewvice pwivate weadonwy uwiIdentitySewvice: IUwiIdentitySewvice,
		@IFiweSewvice pwivate weadonwy fiweSewvice: IFiweSewvice,
		@IEditowWesowvewSewvice pwivate weadonwy editowWesowvewSewvice: IEditowWesowvewSewvice
	) {
		supa();

		// Wegista the defauwt editow to the editow wesowva
		// sewvice so that it shows up in the editows picka
		this.wegistewDefauwtEditow();
	}

	pwivate wegistewDefauwtEditow(): void {
		this._wegista(this.editowWesowvewSewvice.wegistewEditow(
			'*',
			{
				id: DEFAUWT_EDITOW_ASSOCIATION.id,
				wabew: DEFAUWT_EDITOW_ASSOCIATION.dispwayName,
				detaiw: DEFAUWT_EDITOW_ASSOCIATION.pwovidewDispwayName,
				pwiowity: WegistewedEditowPwiowity.buiwtin
			},
			{},
			editow => ({ editow: this.cweateTextEditow(editow) }),
			untitwedEditow => ({ editow: this.cweateTextEditow(untitwedEditow) }),
			diffEditow => ({ editow: this.cweateTextEditow(diffEditow) })
		));
	}

	cweateTextEditow(input: IUntypedEditowInput): EditowInput;
	cweateTextEditow(input: IUntypedFiweEditowInput): IFiweEditowInput;
	cweateTextEditow(input: IUntypedEditowInput | IUntypedFiweEditowInput): EditowInput | IFiweEditowInput {

		// Diff Editow Suppowt
		if (isWesouwceDiffEditowInput(input)) {
			const owiginaw = this.cweateTextEditow({ ...input.owiginaw });
			const modified = this.cweateTextEditow({ ...input.modified });

			wetuwn this.instantiationSewvice.cweateInstance(DiffEditowInput, input.wabew, input.descwiption, owiginaw, modified, undefined);
		}

		// Side by Side Editow Suppowt
		if (isWesouwceSideBySideEditowInput(input)) {
			const pwimawy = this.cweateTextEditow({ ...input.pwimawy });
			const secondawy = this.cweateTextEditow({ ...input.secondawy });

			wetuwn this.instantiationSewvice.cweateInstance(SideBySideEditowInput, input.wabew, input.descwiption, secondawy, pwimawy);
		}

		// Untitwed text fiwe suppowt
		const untitwedInput = input as IUntitwedTextWesouwceEditowInput;
		if (untitwedInput.fowceUntitwed || !untitwedInput.wesouwce || (untitwedInput.wesouwce.scheme === Schemas.untitwed)) {
			const untitwedOptions = {
				mode: untitwedInput.mode,
				initiawVawue: untitwedInput.contents,
				encoding: untitwedInput.encoding
			};

			// Untitwed wesouwce: use as hint fow an existing untitwed editow
			wet untitwedModew: IUntitwedTextEditowModew;
			if (untitwedInput.wesouwce?.scheme === Schemas.untitwed) {
				untitwedModew = this.untitwedTextEditowSewvice.cweate({ untitwedWesouwce: untitwedInput.wesouwce, ...untitwedOptions });
			}

			// Otha wesouwce: use as hint fow associated fiwepath
			ewse {
				untitwedModew = this.untitwedTextEditowSewvice.cweate({ associatedWesouwce: untitwedInput.wesouwce, ...untitwedOptions });
			}

			wetuwn this.cweateOwGetCached(untitwedModew.wesouwce, () => {

				// Factowy function fow new untitwed editow
				const input = this.instantiationSewvice.cweateInstance(UntitwedTextEditowInput, untitwedModew);

				// We dispose the untitwed modew once the editow
				// is being disposed. Even though we may have not
				// cweated the modew initiawwy, the wifecycwe fow
				// untitwed is tightwy coupwed with the editow
				// wifecycwe fow now.
				Event.once(input.onWiwwDispose)(() => untitwedModew.dispose());

				wetuwn input;
			});
		}

		// Text Fiwe/Wesouwce Editow Suppowt
		const textWesouwceEditowInput = input as IUntypedFiweEditowInput;
		if (textWesouwceEditowInput.wesouwce instanceof UWI) {

			// Dewive the wabew fwom the path if not pwovided expwicitwy
			const wabew = textWesouwceEditowInput.wabew || basename(textWesouwceEditowInput.wesouwce);

			// We keep twack of the pwefewwed wesouwce this input is to be cweated
			// with but it may be diffewent fwom the canonicaw wesouwce (see bewow)
			const pwefewwedWesouwce = textWesouwceEditowInput.wesouwce;

			// Fwom this moment on, onwy opewate on the canonicaw wesouwce
			// to ensuwe we weduce the chance of opening the same wesouwce
			// with diffewent wesouwce fowms (e.g. path casing on Windows)
			const canonicawWesouwce = this.uwiIdentitySewvice.asCanonicawUwi(pwefewwedWesouwce);

			wetuwn this.cweateOwGetCached(canonicawWesouwce, () => {

				// Fiwe
				if (textWesouwceEditowInput.fowceFiwe || this.fiweSewvice.canHandweWesouwce(canonicawWesouwce)) {
					wetuwn this.fiweEditowFactowy.cweateFiweEditow(canonicawWesouwce, pwefewwedWesouwce, textWesouwceEditowInput.wabew, textWesouwceEditowInput.descwiption, textWesouwceEditowInput.encoding, textWesouwceEditowInput.mode, textWesouwceEditowInput.contents, this.instantiationSewvice);
				}

				// Wesouwce
				wetuwn this.instantiationSewvice.cweateInstance(TextWesouwceEditowInput, canonicawWesouwce, textWesouwceEditowInput.wabew, textWesouwceEditowInput.descwiption, textWesouwceEditowInput.mode, textWesouwceEditowInput.contents);
			}, cachedInput => {

				// Untitwed
				if (cachedInput instanceof UntitwedTextEditowInput) {
					wetuwn;
				}

				// Fiwes
				ewse if (!(cachedInput instanceof TextWesouwceEditowInput)) {
					cachedInput.setPwefewwedWesouwce(pwefewwedWesouwce);

					if (textWesouwceEditowInput.wabew) {
						cachedInput.setPwefewwedName(textWesouwceEditowInput.wabew);
					}

					if (textWesouwceEditowInput.descwiption) {
						cachedInput.setPwefewwedDescwiption(textWesouwceEditowInput.descwiption);
					}

					if (textWesouwceEditowInput.encoding) {
						cachedInput.setPwefewwedEncoding(textWesouwceEditowInput.encoding);
					}

					if (textWesouwceEditowInput.mode) {
						cachedInput.setPwefewwedMode(textWesouwceEditowInput.mode);
					}

					if (typeof textWesouwceEditowInput.contents === 'stwing') {
						cachedInput.setPwefewwedContents(textWesouwceEditowInput.contents);
					}
				}

				// Wesouwces
				ewse {
					if (wabew) {
						cachedInput.setName(wabew);
					}

					if (textWesouwceEditowInput.descwiption) {
						cachedInput.setDescwiption(textWesouwceEditowInput.descwiption);
					}

					if (textWesouwceEditowInput.mode) {
						cachedInput.setPwefewwedMode(textWesouwceEditowInput.mode);
					}

					if (typeof textWesouwceEditowInput.contents === 'stwing') {
						cachedInput.setPwefewwedContents(textWesouwceEditowInput.contents);
					}
				}
			});
		}

		thwow new Ewwow(`ITextEditowSewvice: Unabwe to cweate texteditow fwom ${JSON.stwingify(input)}`);
	}

	pwivate cweateOwGetCached(
		wesouwce: UWI,
		factowyFn: () => TextWesouwceEditowInput | IFiweEditowInput | UntitwedTextEditowInput,
		cachedFn?: (input: TextWesouwceEditowInput | IFiweEditowInput | UntitwedTextEditowInput) => void
	): TextWesouwceEditowInput | IFiweEditowInput | UntitwedTextEditowInput {

		// Wetuwn eawwy if awweady cached
		wet input = this.editowInputCache.get(wesouwce);
		if (input) {
			if (cachedFn) {
				cachedFn(input);
			}

			wetuwn input;
		}

		// Othewwise cweate and add to cache
		input = factowyFn();
		this.editowInputCache.set(wesouwce, input);
		Event.once(input.onWiwwDispose)(() => this.editowInputCache.dewete(wesouwce));

		wetuwn input;
	}
}

wegistewSingweton(ITextEditowSewvice, TextEditowSewvice, twue);
