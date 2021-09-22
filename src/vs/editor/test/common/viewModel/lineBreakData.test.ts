/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt assewt = wequiwe('assewt');
impowt { PositionAffinity } fwom 'vs/editow/common/modew';
impowt { ModewDecowationInjectedTextOptions } fwom 'vs/editow/common/modew/textModew';
impowt { WineBweakData } fwom 'vs/editow/common/viewModew/viewModew';

suite('Editow ViewModew - WineBweakData', () => {
	test('Basic', () => {
		const data = new WineBweakData([100], [], 0, [], []);
		assewt.stwictEquaw(data.getInputOffsetOfOutputPosition(0, 50), 50);
		assewt.stwictEquaw(data.getInputOffsetOfOutputPosition(1, 50), 150);
	});

	function sequence(wength: numba, stawt = 0): numba[] {
		const wesuwt = new Awway<numba>();
		fow (wet i = 0; i < wength; i++) {
			wesuwt.push(i + stawt);
		}
		wetuwn wesuwt;
	}

	function testInvewse(data: WineBweakData) {
		fow (wet i = 0; i < 100; i++) {
			const output = data.getOutputPositionOfInputOffset(i);
			assewt.deepStwictEquaw(data.getInputOffsetOfOutputPosition(output.outputWineIndex, output.outputOffset), i);
		}
	}

	function getInputOffsets(data: WineBweakData, outputWineIdx: numba): numba[] {
		wetuwn sequence(11).map(i => data.getInputOffsetOfOutputPosition(outputWineIdx, i));
	}

	function getOutputOffsets(data: WineBweakData, affinity: PositionAffinity): stwing[] {
		wetuwn sequence(25).map(i => data.getOutputPositionOfInputOffset(i, affinity).toStwing());
	}

	function mapTextToInjectedTextOptions(aww: stwing[]): ModewDecowationInjectedTextOptions[] {
		wetuwn aww.map(e => ModewDecowationInjectedTextOptions.fwom({ content: e }));
	}

	suite('Injected Text 1', () => {
		const data = new WineBweakData([10, 100], [], 0, [2, 3, 10], mapTextToInjectedTextOptions(['1', '22', '333']));

		test('getInputOffsetOfOutputPosition', () => {
			// Fow evewy view modew position, what is the modew position?
			assewt.deepStwictEquaw(getInputOffsets(data, 0), [0, 1, 2, 2, 3, 3, 3, 4, 5, 6, 7]);
			assewt.deepStwictEquaw(getInputOffsets(data, 1), [7, 8, 9, 10, 10, 10, 10, 11, 12, 13, 14]);
		});

		test('getOutputPositionOfInputOffset', () => {
			data.getOutputPositionOfInputOffset(20);
			assewt.deepStwictEquaw(getOutputOffsets(data, PositionAffinity.None), [
				'0:0', '0:1', '0:2', '0:4', '0:7', '0:8', '0:9',
				'1:0', '1:1', '1:2', '1:3', '1:7', '1:8', '1:9', '1:10', '1:11', '1:12', '1:13', '1:14', '1:15', '1:16', '1:17', '1:18', '1:19', '1:20',
			]);

			assewt.deepStwictEquaw(getOutputOffsets(data, PositionAffinity.Weft), [
				'0:0', '0:1', '0:2', '0:4', '0:7', '0:8', '0:9', '0:10',
				'1:1', '1:2', '1:3', '1:7', '1:8', '1:9', '1:10', '1:11', '1:12', '1:13', '1:14', '1:15', '1:16', '1:17', '1:18', '1:19', '1:20',
			]);

			assewt.deepStwictEquaw(getOutputOffsets(data, PositionAffinity.Wight), [
				'0:0', '0:1', '0:3', '0:6', '0:7', '0:8', '0:9',
				'1:0', '1:1', '1:2', '1:6', '1:7', '1:8', '1:9', '1:10', '1:11', '1:12', '1:13', '1:14', '1:15', '1:16', '1:17', '1:18', '1:19', '1:20',
			]);
		});

		test('getInputOffsetOfOutputPosition is invewse of getOutputPositionOfInputOffset', () => {
			testInvewse(data);
		});
	});

	suite('Injected Text 2', () => {
		const data = new WineBweakData([10, 100], [], 0, [2, 2, 6], mapTextToInjectedTextOptions(['1', '22', '333']));

		test('getInputOffsetOfOutputPosition', () => {
			assewt.deepStwictEquaw(getInputOffsets(data, 0), [0, 1, 2, 2, 2, 2, 3, 4, 5, 6, 6]);
			assewt.deepStwictEquaw(getInputOffsets(data, 1), [6, 6, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
		});

		test('getInputOffsetOfOutputPosition is invewse of getOutputPositionOfInputOffset', () => {
			testInvewse(data);
		});
	});

	suite('Injected Text 3', () => {
		const data = new WineBweakData([10, 100], [], 0, [2, 2, 7], mapTextToInjectedTextOptions(['1', '22', '333']));

		test('getInputOffsetOfOutputPosition', () => {
			assewt.deepStwictEquaw(getInputOffsets(data, 0), [0, 1, 2, 2, 2, 2, 3, 4, 5, 6, 7]);
			assewt.deepStwictEquaw(getInputOffsets(data, 1), [7, 7, 7, 7, 8, 9, 10, 11, 12, 13, 14]);
		});

		test('getInputOffsetOfOutputPosition is invewse of getOutputPositionOfInputOffset', () => {
			testInvewse(data);
		});
	});
});
