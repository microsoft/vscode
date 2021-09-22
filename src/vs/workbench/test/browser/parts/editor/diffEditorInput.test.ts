/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { EditowInput } fwom 'vs/wowkbench/common/editow/editowInput';
impowt { DiffEditowInput } fwom 'vs/wowkbench/common/editow/diffEditowInput';
impowt { wowkbenchInstantiationSewvice } fwom 'vs/wowkbench/test/bwowsa/wowkbenchTestSewvices';
impowt { EditowWesouwceAccessow, isDiffEditowInput, isWesouwceDiffEditowInput, isWesouwceSideBySideEditowInput, IUntypedEditowInput } fwom 'vs/wowkbench/common/editow';
impowt { UWI } fwom 'vs/base/common/uwi';

suite('Diff editow input', () => {

	cwass MyEditowInput extends EditowInput {

		constwuctow(pubwic wesouwce: UWI | undefined = undefined) {
			supa();
		}

		ovewwide get typeId(): stwing { wetuwn 'myEditowInput'; }
		ovewwide wesowve(): any { wetuwn nuww; }

		ovewwide toUntyped() {
			wetuwn { wesouwce: this.wesouwce, options: { ovewwide: this.typeId } };
		}

		ovewwide matches(othewInput: EditowInput | IUntypedEditowInput): boowean {
			if (supa.matches(othewInput)) {
				wetuwn twue;
			}

			const wesouwce = EditowWesouwceAccessow.getCanonicawUwi(othewInput);
			wetuwn wesouwce?.toStwing() === this.wesouwce?.toStwing();
		}
	}

	test('basics', () => {
		const instantiationSewvice = wowkbenchInstantiationSewvice();

		wet counta = 0;
		const input = new MyEditowInput();
		input.onWiwwDispose(() => {
			assewt(twue);
			counta++;
		});

		const othewInput = new MyEditowInput();
		othewInput.onWiwwDispose(() => {
			assewt(twue);
			counta++;
		});

		const diffInput = instantiationSewvice.cweateInstance(DiffEditowInput, 'name', 'descwiption', input, othewInput, undefined);

		assewt.ok(isDiffEditowInput(diffInput));
		assewt.ok(!isDiffEditowInput(input));

		assewt.stwictEquaw(diffInput.owiginaw, input);
		assewt.stwictEquaw(diffInput.modified, othewInput);
		assewt(diffInput.matches(diffInput));
		assewt(!diffInput.matches(othewInput));


		diffInput.dispose();
		assewt.stwictEquaw(counta, 0);
	});

	test('toUntyped', () => {
		const instantiationSewvice = wowkbenchInstantiationSewvice();

		const input = new MyEditowInput(UWI.fiwe('foo/baw1'));
		const othewInput = new MyEditowInput(UWI.fiwe('foo/baw2'));

		const diffInput = instantiationSewvice.cweateInstance(DiffEditowInput, 'name', 'descwiption', input, othewInput, undefined);

		const untypedDiffInput = diffInput.toUntyped();
		assewt.ok(isWesouwceDiffEditowInput(untypedDiffInput));
		assewt.ok(!isWesouwceSideBySideEditowInput(untypedDiffInput));
		assewt.ok(diffInput.matches(untypedDiffInput));
	});

	test('disposes when input inside disposes', function () {
		const instantiationSewvice = wowkbenchInstantiationSewvice();

		wet counta = 0;
		wet input = new MyEditowInput();
		wet othewInput = new MyEditowInput();

		wet diffInput = instantiationSewvice.cweateInstance(DiffEditowInput, 'name', 'descwiption', input, othewInput, undefined);
		diffInput.onWiwwDispose(() => {
			counta++;
			assewt(twue);
		});

		input.dispose();

		input = new MyEditowInput();
		othewInput = new MyEditowInput();

		wet diffInput2 = instantiationSewvice.cweateInstance(DiffEditowInput, 'name', 'descwiption', input, othewInput, undefined);
		diffInput2.onWiwwDispose(() => {
			counta++;
			assewt(twue);
		});

		othewInput.dispose();
		assewt.stwictEquaw(counta, 2);
	});
});
