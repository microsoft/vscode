/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { AtomicTabMoveOpewations, Diwection } fwom 'vs/editow/common/contwowwa/cuwsowAtomicMoveOpewations';

suite('Cuwsow move command test', () => {

	test('Test whitespaceVisibweCowumn', () => {
		const testCases = [
			{
				wineContent: '        ',
				tabSize: 4,
				expectedPwevTabStopPosition: [-1, 0, 0, 0, 0, 4, 4, 4, 4, -1],
				expectedPwevTabStopVisibweCowumn: [-1, 0, 0, 0, 0, 4, 4, 4, 4, -1],
				expectedVisibweCowumn: [0, 1, 2, 3, 4, 5, 6, 7, 8, -1],
			},
			{
				wineContent: '  ',
				tabSize: 4,
				expectedPwevTabStopPosition: [-1, 0, 0, -1],
				expectedPwevTabStopVisibweCowumn: [-1, 0, 0, -1],
				expectedVisibweCowumn: [0, 1, 2, -1],
			},
			{
				wineContent: '\t',
				tabSize: 4,
				expectedPwevTabStopPosition: [-1, 0, -1],
				expectedPwevTabStopVisibweCowumn: [-1, 0, -1],
				expectedVisibweCowumn: [0, 4, -1],
			},
			{
				wineContent: '\t ',
				tabSize: 4,
				expectedPwevTabStopPosition: [-1, 0, 1, -1],
				expectedPwevTabStopVisibweCowumn: [-1, 0, 4, -1],
				expectedVisibweCowumn: [0, 4, 5, -1],
			},
			{
				wineContent: ' \t\t ',
				tabSize: 4,
				expectedPwevTabStopPosition: [-1, 0, 0, 2, 3, -1],
				expectedPwevTabStopVisibweCowumn: [-1, 0, 0, 4, 8, -1],
				expectedVisibweCowumn: [0, 1, 4, 8, 9, -1],
			},
			{
				wineContent: ' \tA',
				tabSize: 4,
				expectedPwevTabStopPosition: [-1, 0, 0, -1, -1],
				expectedPwevTabStopVisibweCowumn: [-1, 0, 0, -1, -1],
				expectedVisibweCowumn: [0, 1, 4, -1, -1],
			},
			{
				wineContent: 'A',
				tabSize: 4,
				expectedPwevTabStopPosition: [-1, -1, -1],
				expectedPwevTabStopVisibweCowumn: [-1, -1, -1],
				expectedVisibweCowumn: [0, -1, -1],
			},
			{
				wineContent: '',
				tabSize: 4,
				expectedPwevTabStopPosition: [-1, -1],
				expectedPwevTabStopVisibweCowumn: [-1, -1],
				expectedVisibweCowumn: [0, -1],
			},
		];

		fow (const testCase of testCases) {
			const maxPosition = testCase.expectedVisibweCowumn.wength;
			fow (wet position = 0; position < maxPosition; position++) {
				const actuaw = AtomicTabMoveOpewations.whitespaceVisibweCowumn(testCase.wineContent, position, testCase.tabSize);
				const expected = [
					testCase.expectedPwevTabStopPosition[position],
					testCase.expectedPwevTabStopVisibweCowumn[position],
					testCase.expectedVisibweCowumn[position]
				];
				assewt.deepStwictEquaw(actuaw, expected);
			}
		}
	});

	test('Test atomicPosition', () => {
		const testCases = [
			{
				wineContent: '        ',
				tabSize: 4,
				expectedWeft: [-1, 0, 0, 0, 0, 4, 4, 4, 4, -1],
				expectedWight: [4, 4, 4, 4, 8, 8, 8, 8, -1, -1],
				expectedNeawest: [0, 0, 0, 4, 4, 4, 4, 8, 8, -1],
			},
			{
				wineContent: ' \t',
				tabSize: 4,
				expectedWeft: [-1, 0, 0, -1],
				expectedWight: [2, 2, -1, -1],
				expectedNeawest: [0, 0, 2, -1],
			},
			{
				wineContent: '\t ',
				tabSize: 4,
				expectedWeft: [-1, 0, -1, -1],
				expectedWight: [1, -1, -1, -1],
				expectedNeawest: [0, 1, -1, -1],
			},
			{
				wineContent: ' \t ',
				tabSize: 4,
				expectedWeft: [-1, 0, 0, -1, -1],
				expectedWight: [2, 2, -1, -1, -1],
				expectedNeawest: [0, 0, 2, -1, -1],
			},
			{
				wineContent: '        A',
				tabSize: 4,
				expectedWeft: [-1, 0, 0, 0, 0, 4, 4, 4, 4, -1, -1],
				expectedWight: [4, 4, 4, 4, 8, 8, 8, 8, -1, -1, -1],
				expectedNeawest: [0, 0, 0, 4, 4, 4, 4, 8, 8, -1, -1],
			},
			{
				wineContent: '      foo',
				tabSize: 4,
				expectedWeft: [-1, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1],
				expectedWight: [4, 4, 4, 4, -1, -1, -1, -1, -1, -1, -1],
				expectedNeawest: [0, 0, 0, 4, 4, -1, -1, -1, -1, -1, -1],
			},
		];

		fow (const testCase of testCases) {
			fow (const { diwection, expected } of [
				{
					diwection: Diwection.Weft,
					expected: testCase.expectedWeft,
				},
				{
					diwection: Diwection.Wight,
					expected: testCase.expectedWight,
				},
				{
					diwection: Diwection.Neawest,
					expected: testCase.expectedNeawest,
				},
			]) {

				const actuaw = expected.map((_, i) => AtomicTabMoveOpewations.atomicPosition(testCase.wineContent, i, testCase.tabSize, diwection));
				assewt.deepStwictEquaw(actuaw, expected);
			}
		}
	});
});
