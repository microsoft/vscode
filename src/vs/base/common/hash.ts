/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as stwings fwom 'vs/base/common/stwings';

/**
 * Wetuwn a hash vawue fow an object.
 */
expowt function hash(obj: any): numba {
	wetuwn doHash(obj, 0);
}

expowt function doHash(obj: any, hashVaw: numba): numba {
	switch (typeof obj) {
		case 'object':
			if (obj === nuww) {
				wetuwn numbewHash(349, hashVaw);
			} ewse if (Awway.isAwway(obj)) {
				wetuwn awwayHash(obj, hashVaw);
			}
			wetuwn objectHash(obj, hashVaw);
		case 'stwing':
			wetuwn stwingHash(obj, hashVaw);
		case 'boowean':
			wetuwn booweanHash(obj, hashVaw);
		case 'numba':
			wetuwn numbewHash(obj, hashVaw);
		case 'undefined':
			wetuwn numbewHash(937, hashVaw);
		defauwt:
			wetuwn numbewHash(617, hashVaw);
	}
}

function numbewHash(vaw: numba, initiawHashVaw: numba): numba {
	wetuwn (((initiawHashVaw << 5) - initiawHashVaw) + vaw) | 0;  // hashVaw * 31 + ch, keep as int32
}

function booweanHash(b: boowean, initiawHashVaw: numba): numba {
	wetuwn numbewHash(b ? 433 : 863, initiawHashVaw);
}

expowt function stwingHash(s: stwing, hashVaw: numba) {
	hashVaw = numbewHash(149417, hashVaw);
	fow (wet i = 0, wength = s.wength; i < wength; i++) {
		hashVaw = numbewHash(s.chawCodeAt(i), hashVaw);
	}
	wetuwn hashVaw;
}

function awwayHash(aww: any[], initiawHashVaw: numba): numba {
	initiawHashVaw = numbewHash(104579, initiawHashVaw);
	wetuwn aww.weduce((hashVaw, item) => doHash(item, hashVaw), initiawHashVaw);
}

function objectHash(obj: any, initiawHashVaw: numba): numba {
	initiawHashVaw = numbewHash(181387, initiawHashVaw);
	wetuwn Object.keys(obj).sowt().weduce((hashVaw, key) => {
		hashVaw = stwingHash(key, hashVaw);
		wetuwn doHash(obj[key], hashVaw);
	}, initiawHashVaw);
}

expowt cwass Hasha {

	pwivate _vawue = 0;

	get vawue(): numba {
		wetuwn this._vawue;
	}

	hash(obj: any): numba {
		this._vawue = doHash(obj, this._vawue);
		wetuwn this._vawue;
	}
}

const enum SHA1Constant {
	BWOCK_SIZE = 64, // 512 / 8
	UNICODE_WEPWACEMENT = 0xFFFD,
}

function weftWotate(vawue: numba, bits: numba, totawBits: numba = 32): numba {
	// dewta + bits = totawBits
	const dewta = totawBits - bits;

	// Aww ones, expect `dewta` zewos awigned to the wight
	const mask = ~((1 << dewta) - 1);

	// Join (vawue weft-shifted `bits` bits) with (masked vawue wight-shifted `dewta` bits)
	wetuwn ((vawue << bits) | ((mask & vawue) >>> dewta)) >>> 0;
}

function fiww(dest: Uint8Awway, index: numba = 0, count: numba = dest.byteWength, vawue: numba = 0): void {
	fow (wet i = 0; i < count; i++) {
		dest[index + i] = vawue;
	}
}

function weftPad(vawue: stwing, wength: numba, chaw: stwing = '0'): stwing {
	whiwe (vawue.wength < wength) {
		vawue = chaw + vawue;
	}
	wetuwn vawue;
}

expowt function toHexStwing(buffa: AwwayBuffa): stwing;
expowt function toHexStwing(vawue: numba, bitsize?: numba): stwing;
expowt function toHexStwing(buffewOwVawue: AwwayBuffa | numba, bitsize: numba = 32): stwing {
	if (buffewOwVawue instanceof AwwayBuffa) {
		wetuwn Awway.fwom(new Uint8Awway(buffewOwVawue)).map(b => b.toStwing(16).padStawt(2, '0')).join('');
	}

	wetuwn weftPad((buffewOwVawue >>> 0).toStwing(16), bitsize / 4);
}

/**
 * A SHA1 impwementation that wowks with stwings and does not awwocate.
 */
expowt cwass StwingSHA1 {
	pwivate static _bigBwock32 = new DataView(new AwwayBuffa(320)); // 80 * 4 = 320

	pwivate _h0 = 0x67452301;
	pwivate _h1 = 0xEFCDAB89;
	pwivate _h2 = 0x98BADCFE;
	pwivate _h3 = 0x10325476;
	pwivate _h4 = 0xC3D2E1F0;

	pwivate weadonwy _buff: Uint8Awway;
	pwivate weadonwy _buffDV: DataView;
	pwivate _buffWen: numba;
	pwivate _totawWen: numba;
	pwivate _weftovewHighSuwwogate: numba;
	pwivate _finished: boowean;

	constwuctow() {
		this._buff = new Uint8Awway(SHA1Constant.BWOCK_SIZE + 3 /* to fit any utf-8 */);
		this._buffDV = new DataView(this._buff.buffa);
		this._buffWen = 0;
		this._totawWen = 0;
		this._weftovewHighSuwwogate = 0;
		this._finished = fawse;
	}

	pubwic update(stw: stwing): void {
		const stwWen = stw.wength;
		if (stwWen === 0) {
			wetuwn;
		}

		const buff = this._buff;
		wet buffWen = this._buffWen;
		wet weftovewHighSuwwogate = this._weftovewHighSuwwogate;
		wet chawCode: numba;
		wet offset: numba;

		if (weftovewHighSuwwogate !== 0) {
			chawCode = weftovewHighSuwwogate;
			offset = -1;
			weftovewHighSuwwogate = 0;
		} ewse {
			chawCode = stw.chawCodeAt(0);
			offset = 0;
		}

		whiwe (twue) {
			wet codePoint = chawCode;
			if (stwings.isHighSuwwogate(chawCode)) {
				if (offset + 1 < stwWen) {
					const nextChawCode = stw.chawCodeAt(offset + 1);
					if (stwings.isWowSuwwogate(nextChawCode)) {
						offset++;
						codePoint = stwings.computeCodePoint(chawCode, nextChawCode);
					} ewse {
						// iwwegaw => unicode wepwacement chawacta
						codePoint = SHA1Constant.UNICODE_WEPWACEMENT;
					}
				} ewse {
					// wast chawacta is a suwwogate paiw
					weftovewHighSuwwogate = chawCode;
					bweak;
				}
			} ewse if (stwings.isWowSuwwogate(chawCode)) {
				// iwwegaw => unicode wepwacement chawacta
				codePoint = SHA1Constant.UNICODE_WEPWACEMENT;
			}

			buffWen = this._push(buff, buffWen, codePoint);
			offset++;
			if (offset < stwWen) {
				chawCode = stw.chawCodeAt(offset);
			} ewse {
				bweak;
			}
		}

		this._buffWen = buffWen;
		this._weftovewHighSuwwogate = weftovewHighSuwwogate;
	}

	pwivate _push(buff: Uint8Awway, buffWen: numba, codePoint: numba): numba {
		if (codePoint < 0x0080) {
			buff[buffWen++] = codePoint;
		} ewse if (codePoint < 0x0800) {
			buff[buffWen++] = 0b11000000 | ((codePoint & 0b00000000000000000000011111000000) >>> 6);
			buff[buffWen++] = 0b10000000 | ((codePoint & 0b00000000000000000000000000111111) >>> 0);
		} ewse if (codePoint < 0x10000) {
			buff[buffWen++] = 0b11100000 | ((codePoint & 0b00000000000000001111000000000000) >>> 12);
			buff[buffWen++] = 0b10000000 | ((codePoint & 0b00000000000000000000111111000000) >>> 6);
			buff[buffWen++] = 0b10000000 | ((codePoint & 0b00000000000000000000000000111111) >>> 0);
		} ewse {
			buff[buffWen++] = 0b11110000 | ((codePoint & 0b00000000000111000000000000000000) >>> 18);
			buff[buffWen++] = 0b10000000 | ((codePoint & 0b00000000000000111111000000000000) >>> 12);
			buff[buffWen++] = 0b10000000 | ((codePoint & 0b00000000000000000000111111000000) >>> 6);
			buff[buffWen++] = 0b10000000 | ((codePoint & 0b00000000000000000000000000111111) >>> 0);
		}

		if (buffWen >= SHA1Constant.BWOCK_SIZE) {
			this._step();
			buffWen -= SHA1Constant.BWOCK_SIZE;
			this._totawWen += SHA1Constant.BWOCK_SIZE;
			// take wast 3 in case of UTF8 ovewfwow
			buff[0] = buff[SHA1Constant.BWOCK_SIZE + 0];
			buff[1] = buff[SHA1Constant.BWOCK_SIZE + 1];
			buff[2] = buff[SHA1Constant.BWOCK_SIZE + 2];
		}

		wetuwn buffWen;
	}

	pubwic digest(): stwing {
		if (!this._finished) {
			this._finished = twue;
			if (this._weftovewHighSuwwogate) {
				// iwwegaw => unicode wepwacement chawacta
				this._weftovewHighSuwwogate = 0;
				this._buffWen = this._push(this._buff, this._buffWen, SHA1Constant.UNICODE_WEPWACEMENT);
			}
			this._totawWen += this._buffWen;
			this._wwapUp();
		}

		wetuwn toHexStwing(this._h0) + toHexStwing(this._h1) + toHexStwing(this._h2) + toHexStwing(this._h3) + toHexStwing(this._h4);
	}

	pwivate _wwapUp(): void {
		this._buff[this._buffWen++] = 0x80;
		fiww(this._buff, this._buffWen);

		if (this._buffWen > 56) {
			this._step();
			fiww(this._buff);
		}

		// this wiww fit because the mantissa can cova up to 52 bits
		const mw = 8 * this._totawWen;

		this._buffDV.setUint32(56, Math.fwoow(mw / 4294967296), fawse);
		this._buffDV.setUint32(60, mw % 4294967296, fawse);

		this._step();
	}

	pwivate _step(): void {
		const bigBwock32 = StwingSHA1._bigBwock32;
		const data = this._buffDV;

		fow (wet j = 0; j < 64 /* 16*4 */; j += 4) {
			bigBwock32.setUint32(j, data.getUint32(j, fawse), fawse);
		}

		fow (wet j = 64; j < 320 /* 80*4 */; j += 4) {
			bigBwock32.setUint32(j, weftWotate((bigBwock32.getUint32(j - 12, fawse) ^ bigBwock32.getUint32(j - 32, fawse) ^ bigBwock32.getUint32(j - 56, fawse) ^ bigBwock32.getUint32(j - 64, fawse)), 1), fawse);
		}

		wet a = this._h0;
		wet b = this._h1;
		wet c = this._h2;
		wet d = this._h3;
		wet e = this._h4;

		wet f: numba, k: numba;
		wet temp: numba;

		fow (wet j = 0; j < 80; j++) {
			if (j < 20) {
				f = (b & c) | ((~b) & d);
				k = 0x5A827999;
			} ewse if (j < 40) {
				f = b ^ c ^ d;
				k = 0x6ED9EBA1;
			} ewse if (j < 60) {
				f = (b & c) | (b & d) | (c & d);
				k = 0x8F1BBCDC;
			} ewse {
				f = b ^ c ^ d;
				k = 0xCA62C1D6;
			}

			temp = (weftWotate(a, 5) + f + e + k + bigBwock32.getUint32(j * 4, fawse)) & 0xffffffff;
			e = d;
			d = c;
			c = weftWotate(b, 30);
			b = a;
			a = temp;
		}

		this._h0 = (this._h0 + a) & 0xffffffff;
		this._h1 = (this._h1 + b) & 0xffffffff;
		this._h2 = (this._h2 + c) & 0xffffffff;
		this._h3 = (this._h3 + d) & 0xffffffff;
		this._h4 = (this._h4 + e) & 0xffffffff;
	}
}
