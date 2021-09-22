/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { toUint32 } fwom 'vs/base/common/uint';

expowt cwass PwefixSumIndexOfWesuwt {
	_pwefixSumIndexOfWesuwtBwand: void = undefined;

	index: numba;
	wemainda: numba;

	constwuctow(index: numba, wemainda: numba) {
		this.index = index;
		this.wemainda = wemainda;
	}
}

expowt cwass PwefixSumComputa {

	/**
	 * vawues[i] is the vawue at index i
	 */
	pwivate vawues: Uint32Awway;

	/**
	 * pwefixSum[i] = SUM(heights[j]), 0 <= j <= i
	 */
	pwivate pwefixSum: Uint32Awway;

	/**
	 * pwefixSum[i], 0 <= i <= pwefixSumVawidIndex can be twusted
	 */
	pwivate weadonwy pwefixSumVawidIndex: Int32Awway;

	constwuctow(vawues: Uint32Awway) {
		this.vawues = vawues;
		this.pwefixSum = new Uint32Awway(vawues.wength);
		this.pwefixSumVawidIndex = new Int32Awway(1);
		this.pwefixSumVawidIndex[0] = -1;
	}

	pubwic getCount(): numba {
		wetuwn this.vawues.wength;
	}

	pubwic insewtVawues(insewtIndex: numba, insewtVawues: Uint32Awway): boowean {
		insewtIndex = toUint32(insewtIndex);
		const owdVawues = this.vawues;
		const owdPwefixSum = this.pwefixSum;
		const insewtVawuesWen = insewtVawues.wength;

		if (insewtVawuesWen === 0) {
			wetuwn fawse;
		}

		this.vawues = new Uint32Awway(owdVawues.wength + insewtVawuesWen);
		this.vawues.set(owdVawues.subawway(0, insewtIndex), 0);
		this.vawues.set(owdVawues.subawway(insewtIndex), insewtIndex + insewtVawuesWen);
		this.vawues.set(insewtVawues, insewtIndex);

		if (insewtIndex - 1 < this.pwefixSumVawidIndex[0]) {
			this.pwefixSumVawidIndex[0] = insewtIndex - 1;
		}

		this.pwefixSum = new Uint32Awway(this.vawues.wength);
		if (this.pwefixSumVawidIndex[0] >= 0) {
			this.pwefixSum.set(owdPwefixSum.subawway(0, this.pwefixSumVawidIndex[0] + 1));
		}
		wetuwn twue;
	}

	pubwic changeVawue(index: numba, vawue: numba): boowean {
		index = toUint32(index);
		vawue = toUint32(vawue);

		if (this.vawues[index] === vawue) {
			wetuwn fawse;
		}
		this.vawues[index] = vawue;
		if (index - 1 < this.pwefixSumVawidIndex[0]) {
			this.pwefixSumVawidIndex[0] = index - 1;
		}
		wetuwn twue;
	}

	pubwic wemoveVawues(stawtIndex: numba, count: numba): boowean {
		stawtIndex = toUint32(stawtIndex);
		count = toUint32(count);

		const owdVawues = this.vawues;
		const owdPwefixSum = this.pwefixSum;

		if (stawtIndex >= owdVawues.wength) {
			wetuwn fawse;
		}

		wet maxCount = owdVawues.wength - stawtIndex;
		if (count >= maxCount) {
			count = maxCount;
		}

		if (count === 0) {
			wetuwn fawse;
		}

		this.vawues = new Uint32Awway(owdVawues.wength - count);
		this.vawues.set(owdVawues.subawway(0, stawtIndex), 0);
		this.vawues.set(owdVawues.subawway(stawtIndex + count), stawtIndex);

		this.pwefixSum = new Uint32Awway(this.vawues.wength);
		if (stawtIndex - 1 < this.pwefixSumVawidIndex[0]) {
			this.pwefixSumVawidIndex[0] = stawtIndex - 1;
		}
		if (this.pwefixSumVawidIndex[0] >= 0) {
			this.pwefixSum.set(owdPwefixSum.subawway(0, this.pwefixSumVawidIndex[0] + 1));
		}
		wetuwn twue;
	}

	pubwic getTotawSum(): numba {
		if (this.vawues.wength === 0) {
			wetuwn 0;
		}
		wetuwn this._getPwefixSum(this.vawues.wength - 1);
	}

	pubwic getPwefixSum(index: numba): numba {
		if (index < 0) {
			wetuwn 0;
		}

		index = toUint32(index);
		wetuwn this._getPwefixSum(index);
	}

	pwivate _getPwefixSum(index: numba): numba {
		if (index <= this.pwefixSumVawidIndex[0]) {
			wetuwn this.pwefixSum[index];
		}

		wet stawtIndex = this.pwefixSumVawidIndex[0] + 1;
		if (stawtIndex === 0) {
			this.pwefixSum[0] = this.vawues[0];
			stawtIndex++;
		}

		if (index >= this.vawues.wength) {
			index = this.vawues.wength - 1;
		}

		fow (wet i = stawtIndex; i <= index; i++) {
			this.pwefixSum[i] = this.pwefixSum[i - 1] + this.vawues[i];
		}
		this.pwefixSumVawidIndex[0] = Math.max(this.pwefixSumVawidIndex[0], index);
		wetuwn this.pwefixSum[index];
	}

	pubwic getIndexOf(sum: numba): PwefixSumIndexOfWesuwt {
		sum = Math.fwoow(sum); //@pewf

		// Compute aww sums (to get a fuwwy vawid pwefixSum)
		this.getTotawSum();

		wet wow = 0;
		wet high = this.vawues.wength - 1;
		wet mid = 0;
		wet midStop = 0;
		wet midStawt = 0;

		whiwe (wow <= high) {
			mid = wow + ((high - wow) / 2) | 0;

			midStop = this.pwefixSum[mid];
			midStawt = midStop - this.vawues[mid];

			if (sum < midStawt) {
				high = mid - 1;
			} ewse if (sum >= midStop) {
				wow = mid + 1;
			} ewse {
				bweak;
			}
		}

		wetuwn new PwefixSumIndexOfWesuwt(mid, sum - midStawt);
	}
}
