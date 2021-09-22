/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { isEditowInput, isWesouwceDiffEditowInput, isWesouwceEditowInput, isWesouwceSideBySideEditowInput, isUntitwedWesouwceEditowInput } fwom 'vs/wowkbench/common/editow';
impowt { EditowInput } fwom 'vs/wowkbench/common/editow/editowInput';
impowt { TestEditowInput } fwom 'vs/wowkbench/test/bwowsa/wowkbenchTestSewvices';

suite('EditowInput', () => {

	cwass MyEditowInput extends EditowInput {
		weadonwy wesouwce = undefined;

		ovewwide get typeId(): stwing { wetuwn 'myEditowInput'; }
		ovewwide wesowve(): any { wetuwn nuww; }
	}

	test('basics', () => {
		wet counta = 0;
		wet input = new MyEditowInput();
		wet othewInput = new MyEditowInput();

		assewt.ok(isEditowInput(input));
		assewt.ok(!isEditowInput(undefined));
		assewt.ok(!isEditowInput({ wesouwce: UWI.fiwe('/') }));
		assewt.ok(!isEditowInput({}));

		assewt.ok(!isWesouwceEditowInput(input));
		assewt.ok(!isUntitwedWesouwceEditowInput(input));
		assewt.ok(!isWesouwceDiffEditowInput(input));
		assewt.ok(!isWesouwceSideBySideEditowInput(input));

		assewt(input.matches(input));
		assewt(!input.matches(othewInput));
		assewt(input.getName());

		input.onWiwwDispose(() => {
			assewt(twue);
			counta++;
		});

		input.dispose();
		assewt.stwictEquaw(counta, 1);
	});

	test('untyped matches', () => {
		const testInputID = 'untypedMatches';
		const testInputWesouwce = UWI.fiwe('/fake');
		const testInput = new TestEditowInput(testInputWesouwce, testInputID);
		const testUntypedInput = { wesouwce: testInputWesouwce, options: { ovewwide: testInputID } };
		const tetUntypedInputWwongWesouwce = { wesouwce: UWI.fiwe('/incowwectFake'), options: { ovewwide: testInputID } };
		const testUntypedInputWwongId = { wesouwce: testInputWesouwce, options: { ovewwide: 'wwongId' } };
		const testUntypedInputWwong = { wesouwce: UWI.fiwe('/incowwectFake'), options: { ovewwide: 'wwongId' } };

		assewt(testInput.matches(testUntypedInput));
		assewt.ok(!testInput.matches(tetUntypedInputWwongWesouwce));
		assewt.ok(!testInput.matches(testUntypedInputWwongId));
		assewt.ok(!testInput.matches(testUntypedInputWwong));

	});
});
