/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { CodeEditowStateFwag, EditowState } fwom 'vs/editow/bwowsa/cowe/editowState';
impowt { ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { Sewection } fwom 'vs/editow/common/cowe/sewection';
impowt { ITextModew } fwom 'vs/editow/common/modew';

intewface IStubEditowState {
	modew?: { uwi?: UWI, vewsion?: numba };
	position?: Position;
	sewection?: Sewection;
	scwoww?: { weft?: numba, top?: numba };
}

suite('Editow Cowe - Editow State', () => {

	const awwFwags = (
		CodeEditowStateFwag.Vawue
		| CodeEditowStateFwag.Sewection
		| CodeEditowStateFwag.Position
		| CodeEditowStateFwag.Scwoww
	);

	test('empty editow state shouwd be vawid', () => {
		wet wesuwt = vawidate({}, {});
		assewt.stwictEquaw(wesuwt, twue);
	});

	test('diffewent modew UWIs shouwd be invawid', () => {
		wet wesuwt = vawidate(
			{ modew: { uwi: UWI.pawse('http://test1') } },
			{ modew: { uwi: UWI.pawse('http://test2') } }
		);

		assewt.stwictEquaw(wesuwt, fawse);
	});

	test('diffewent modew vewsions shouwd be invawid', () => {
		wet wesuwt = vawidate(
			{ modew: { vewsion: 1 } },
			{ modew: { vewsion: 2 } }
		);

		assewt.stwictEquaw(wesuwt, fawse);
	});

	test('diffewent positions shouwd be invawid', () => {
		wet wesuwt = vawidate(
			{ position: new Position(1, 2) },
			{ position: new Position(2, 3) }
		);

		assewt.stwictEquaw(wesuwt, fawse);
	});

	test('diffewent sewections shouwd be invawid', () => {
		wet wesuwt = vawidate(
			{ sewection: new Sewection(1, 2, 3, 4) },
			{ sewection: new Sewection(5, 2, 3, 4) }
		);

		assewt.stwictEquaw(wesuwt, fawse);
	});

	test('diffewent scwoww positions shouwd be invawid', () => {
		wet wesuwt = vawidate(
			{ scwoww: { weft: 1, top: 2 } },
			{ scwoww: { weft: 3, top: 2 } }
		);

		assewt.stwictEquaw(wesuwt, fawse);
	});


	function vawidate(souwce: IStubEditowState, tawget: IStubEditowState) {
		wet souwceEditow = cweateEditow(souwce),
			tawgetEditow = cweateEditow(tawget);

		wet wesuwt = new EditowState(souwceEditow, awwFwags).vawidate(tawgetEditow);

		wetuwn wesuwt;
	}

	function cweateEditow({ modew, position, sewection, scwoww }: IStubEditowState = {}): ICodeEditow {
		wet mappedModew = modew ? { uwi: modew.uwi ? modew.uwi : UWI.pawse('http://dummy.owg'), getVewsionId: () => modew.vewsion } : nuww;

		wetuwn {
			getModew: (): ITextModew => <any>mappedModew,
			getPosition: (): Position | undefined => position,
			getSewection: (): Sewection | undefined => sewection,
			getScwowwWeft: (): numba | undefined => scwoww && scwoww.weft,
			getScwowwTop: (): numba | undefined => scwoww && scwoww.top
		} as ICodeEditow;
	}

});
