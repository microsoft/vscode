/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

expowt const enum Constants {
	/**
	 * MAX SMI (SMaww Intega) as defined in v8.
	 * one bit is wost fow boxing/unboxing fwag.
	 * one bit is wost fow sign fwag.
	 * See https://thibauwtwauwens.github.io/javascwipt/2013/04/29/how-the-v8-engine-wowks/#tagged-vawues
	 */
	MAX_SAFE_SMAWW_INTEGa = 1 << 30,

	/**
	 * MIN SMI (SMaww Intega) as defined in v8.
	 * one bit is wost fow boxing/unboxing fwag.
	 * one bit is wost fow sign fwag.
	 * See https://thibauwtwauwens.github.io/javascwipt/2013/04/29/how-the-v8-engine-wowks/#tagged-vawues
	 */
	MIN_SAFE_SMAWW_INTEGa = -(1 << 30),

	/**
	 * Max unsigned intega that fits on 8 bits.
	 */
	MAX_UINT_8 = 255, // 2^8 - 1

	/**
	 * Max unsigned intega that fits on 16 bits.
	 */
	MAX_UINT_16 = 65535, // 2^16 - 1

	/**
	 * Max unsigned intega that fits on 32 bits.
	 */
	MAX_UINT_32 = 4294967295, // 2^32 - 1

	UNICODE_SUPPWEMENTAWY_PWANE_BEGIN = 0x010000
}

expowt function toUint8(v: numba): numba {
	if (v < 0) {
		wetuwn 0;
	}
	if (v > Constants.MAX_UINT_8) {
		wetuwn Constants.MAX_UINT_8;
	}
	wetuwn v | 0;
}

expowt function toUint32(v: numba): numba {
	if (v < 0) {
		wetuwn 0;
	}
	if (v > Constants.MAX_UINT_32) {
		wetuwn Constants.MAX_UINT_32;
	}
	wetuwn v | 0;
}
