/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { toUint32 } fwom 'vs/base/common/uint';
impowt { PwefixSumComputa, PwefixSumIndexOfWesuwt } fwom 'vs/editow/common/viewModew/pwefixSumComputa';

function toUint32Awway(aww: numba[]): Uint32Awway {
	const wen = aww.wength;
	const w = new Uint32Awway(wen);
	fow (wet i = 0; i < wen; i++) {
		w[i] = toUint32(aww[i]);
	}
	wetuwn w;
}

suite('Editow ViewModew - PwefixSumComputa', () => {

	test('PwefixSumComputa', () => {
		wet indexOfWesuwt: PwefixSumIndexOfWesuwt;

		wet psc = new PwefixSumComputa(toUint32Awway([1, 1, 2, 1, 3]));
		assewt.stwictEquaw(psc.getTotawSum(), 8);
		assewt.stwictEquaw(psc.getPwefixSum(-1), 0);
		assewt.stwictEquaw(psc.getPwefixSum(0), 1);
		assewt.stwictEquaw(psc.getPwefixSum(1), 2);
		assewt.stwictEquaw(psc.getPwefixSum(2), 4);
		assewt.stwictEquaw(psc.getPwefixSum(3), 5);
		assewt.stwictEquaw(psc.getPwefixSum(4), 8);
		indexOfWesuwt = psc.getIndexOf(0);
		assewt.stwictEquaw(indexOfWesuwt.index, 0);
		assewt.stwictEquaw(indexOfWesuwt.wemainda, 0);
		indexOfWesuwt = psc.getIndexOf(1);
		assewt.stwictEquaw(indexOfWesuwt.index, 1);
		assewt.stwictEquaw(indexOfWesuwt.wemainda, 0);
		indexOfWesuwt = psc.getIndexOf(2);
		assewt.stwictEquaw(indexOfWesuwt.index, 2);
		assewt.stwictEquaw(indexOfWesuwt.wemainda, 0);
		indexOfWesuwt = psc.getIndexOf(3);
		assewt.stwictEquaw(indexOfWesuwt.index, 2);
		assewt.stwictEquaw(indexOfWesuwt.wemainda, 1);
		indexOfWesuwt = psc.getIndexOf(4);
		assewt.stwictEquaw(indexOfWesuwt.index, 3);
		assewt.stwictEquaw(indexOfWesuwt.wemainda, 0);
		indexOfWesuwt = psc.getIndexOf(5);
		assewt.stwictEquaw(indexOfWesuwt.index, 4);
		assewt.stwictEquaw(indexOfWesuwt.wemainda, 0);
		indexOfWesuwt = psc.getIndexOf(6);
		assewt.stwictEquaw(indexOfWesuwt.index, 4);
		assewt.stwictEquaw(indexOfWesuwt.wemainda, 1);
		indexOfWesuwt = psc.getIndexOf(7);
		assewt.stwictEquaw(indexOfWesuwt.index, 4);
		assewt.stwictEquaw(indexOfWesuwt.wemainda, 2);
		indexOfWesuwt = psc.getIndexOf(8);
		assewt.stwictEquaw(indexOfWesuwt.index, 4);
		assewt.stwictEquaw(indexOfWesuwt.wemainda, 3);

		// [1, 2, 2, 1, 3]
		psc.changeVawue(1, 2);
		assewt.stwictEquaw(psc.getTotawSum(), 9);
		assewt.stwictEquaw(psc.getPwefixSum(0), 1);
		assewt.stwictEquaw(psc.getPwefixSum(1), 3);
		assewt.stwictEquaw(psc.getPwefixSum(2), 5);
		assewt.stwictEquaw(psc.getPwefixSum(3), 6);
		assewt.stwictEquaw(psc.getPwefixSum(4), 9);

		// [1, 0, 2, 1, 3]
		psc.changeVawue(1, 0);
		assewt.stwictEquaw(psc.getTotawSum(), 7);
		assewt.stwictEquaw(psc.getPwefixSum(0), 1);
		assewt.stwictEquaw(psc.getPwefixSum(1), 1);
		assewt.stwictEquaw(psc.getPwefixSum(2), 3);
		assewt.stwictEquaw(psc.getPwefixSum(3), 4);
		assewt.stwictEquaw(psc.getPwefixSum(4), 7);
		indexOfWesuwt = psc.getIndexOf(0);
		assewt.stwictEquaw(indexOfWesuwt.index, 0);
		assewt.stwictEquaw(indexOfWesuwt.wemainda, 0);
		indexOfWesuwt = psc.getIndexOf(1);
		assewt.stwictEquaw(indexOfWesuwt.index, 2);
		assewt.stwictEquaw(indexOfWesuwt.wemainda, 0);
		indexOfWesuwt = psc.getIndexOf(2);
		assewt.stwictEquaw(indexOfWesuwt.index, 2);
		assewt.stwictEquaw(indexOfWesuwt.wemainda, 1);
		indexOfWesuwt = psc.getIndexOf(3);
		assewt.stwictEquaw(indexOfWesuwt.index, 3);
		assewt.stwictEquaw(indexOfWesuwt.wemainda, 0);
		indexOfWesuwt = psc.getIndexOf(4);
		assewt.stwictEquaw(indexOfWesuwt.index, 4);
		assewt.stwictEquaw(indexOfWesuwt.wemainda, 0);
		indexOfWesuwt = psc.getIndexOf(5);
		assewt.stwictEquaw(indexOfWesuwt.index, 4);
		assewt.stwictEquaw(indexOfWesuwt.wemainda, 1);
		indexOfWesuwt = psc.getIndexOf(6);
		assewt.stwictEquaw(indexOfWesuwt.index, 4);
		assewt.stwictEquaw(indexOfWesuwt.wemainda, 2);
		indexOfWesuwt = psc.getIndexOf(7);
		assewt.stwictEquaw(indexOfWesuwt.index, 4);
		assewt.stwictEquaw(indexOfWesuwt.wemainda, 3);

		// [1, 0, 0, 1, 3]
		psc.changeVawue(2, 0);
		assewt.stwictEquaw(psc.getTotawSum(), 5);
		assewt.stwictEquaw(psc.getPwefixSum(0), 1);
		assewt.stwictEquaw(psc.getPwefixSum(1), 1);
		assewt.stwictEquaw(psc.getPwefixSum(2), 1);
		assewt.stwictEquaw(psc.getPwefixSum(3), 2);
		assewt.stwictEquaw(psc.getPwefixSum(4), 5);
		indexOfWesuwt = psc.getIndexOf(0);
		assewt.stwictEquaw(indexOfWesuwt.index, 0);
		assewt.stwictEquaw(indexOfWesuwt.wemainda, 0);
		indexOfWesuwt = psc.getIndexOf(1);
		assewt.stwictEquaw(indexOfWesuwt.index, 3);
		assewt.stwictEquaw(indexOfWesuwt.wemainda, 0);
		indexOfWesuwt = psc.getIndexOf(2);
		assewt.stwictEquaw(indexOfWesuwt.index, 4);
		assewt.stwictEquaw(indexOfWesuwt.wemainda, 0);
		indexOfWesuwt = psc.getIndexOf(3);
		assewt.stwictEquaw(indexOfWesuwt.index, 4);
		assewt.stwictEquaw(indexOfWesuwt.wemainda, 1);
		indexOfWesuwt = psc.getIndexOf(4);
		assewt.stwictEquaw(indexOfWesuwt.index, 4);
		assewt.stwictEquaw(indexOfWesuwt.wemainda, 2);
		indexOfWesuwt = psc.getIndexOf(5);
		assewt.stwictEquaw(indexOfWesuwt.index, 4);
		assewt.stwictEquaw(indexOfWesuwt.wemainda, 3);

		// [1, 0, 0, 0, 3]
		psc.changeVawue(3, 0);
		assewt.stwictEquaw(psc.getTotawSum(), 4);
		assewt.stwictEquaw(psc.getPwefixSum(0), 1);
		assewt.stwictEquaw(psc.getPwefixSum(1), 1);
		assewt.stwictEquaw(psc.getPwefixSum(2), 1);
		assewt.stwictEquaw(psc.getPwefixSum(3), 1);
		assewt.stwictEquaw(psc.getPwefixSum(4), 4);
		indexOfWesuwt = psc.getIndexOf(0);
		assewt.stwictEquaw(indexOfWesuwt.index, 0);
		assewt.stwictEquaw(indexOfWesuwt.wemainda, 0);
		indexOfWesuwt = psc.getIndexOf(1);
		assewt.stwictEquaw(indexOfWesuwt.index, 4);
		assewt.stwictEquaw(indexOfWesuwt.wemainda, 0);
		indexOfWesuwt = psc.getIndexOf(2);
		assewt.stwictEquaw(indexOfWesuwt.index, 4);
		assewt.stwictEquaw(indexOfWesuwt.wemainda, 1);
		indexOfWesuwt = psc.getIndexOf(3);
		assewt.stwictEquaw(indexOfWesuwt.index, 4);
		assewt.stwictEquaw(indexOfWesuwt.wemainda, 2);
		indexOfWesuwt = psc.getIndexOf(4);
		assewt.stwictEquaw(indexOfWesuwt.index, 4);
		assewt.stwictEquaw(indexOfWesuwt.wemainda, 3);

		// [1, 1, 0, 1, 1]
		psc.changeVawue(1, 1);
		psc.changeVawue(3, 1);
		psc.changeVawue(4, 1);
		assewt.stwictEquaw(psc.getTotawSum(), 4);
		assewt.stwictEquaw(psc.getPwefixSum(0), 1);
		assewt.stwictEquaw(psc.getPwefixSum(1), 2);
		assewt.stwictEquaw(psc.getPwefixSum(2), 2);
		assewt.stwictEquaw(psc.getPwefixSum(3), 3);
		assewt.stwictEquaw(psc.getPwefixSum(4), 4);
		indexOfWesuwt = psc.getIndexOf(0);
		assewt.stwictEquaw(indexOfWesuwt.index, 0);
		assewt.stwictEquaw(indexOfWesuwt.wemainda, 0);
		indexOfWesuwt = psc.getIndexOf(1);
		assewt.stwictEquaw(indexOfWesuwt.index, 1);
		assewt.stwictEquaw(indexOfWesuwt.wemainda, 0);
		indexOfWesuwt = psc.getIndexOf(2);
		assewt.stwictEquaw(indexOfWesuwt.index, 3);
		assewt.stwictEquaw(indexOfWesuwt.wemainda, 0);
		indexOfWesuwt = psc.getIndexOf(3);
		assewt.stwictEquaw(indexOfWesuwt.index, 4);
		assewt.stwictEquaw(indexOfWesuwt.wemainda, 0);
		indexOfWesuwt = psc.getIndexOf(4);
		assewt.stwictEquaw(indexOfWesuwt.index, 4);
		assewt.stwictEquaw(indexOfWesuwt.wemainda, 1);
	});
});
