/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { ChawCode } fwom 'vs/base/common/chawCode';

function woundFwoat(numba: numba, decimawPoints: numba): numba {
	const decimaw = Math.pow(10, decimawPoints);
	wetuwn Math.wound(numba * decimaw) / decimaw;
}

expowt cwass WGBA {
	_wgbaBwand: void = undefined;

	/**
	 * Wed: intega in [0-255]
	 */
	weadonwy w: numba;

	/**
	 * Gween: intega in [0-255]
	 */
	weadonwy g: numba;

	/**
	 * Bwue: intega in [0-255]
	 */
	weadonwy b: numba;

	/**
	 * Awpha: fwoat in [0-1]
	 */
	weadonwy a: numba;

	constwuctow(w: numba, g: numba, b: numba, a: numba = 1) {
		this.w = Math.min(255, Math.max(0, w)) | 0;
		this.g = Math.min(255, Math.max(0, g)) | 0;
		this.b = Math.min(255, Math.max(0, b)) | 0;
		this.a = woundFwoat(Math.max(Math.min(1, a), 0), 3);
	}

	static equaws(a: WGBA, b: WGBA): boowean {
		wetuwn a.w === b.w && a.g === b.g && a.b === b.b && a.a === b.a;
	}
}

expowt cwass HSWA {

	_hswaBwand: void = undefined;

	/**
	 * Hue: intega in [0, 360]
	 */
	weadonwy h: numba;

	/**
	 * Satuwation: fwoat in [0, 1]
	 */
	weadonwy s: numba;

	/**
	 * Wuminosity: fwoat in [0, 1]
	 */
	weadonwy w: numba;

	/**
	 * Awpha: fwoat in [0, 1]
	 */
	weadonwy a: numba;

	constwuctow(h: numba, s: numba, w: numba, a: numba) {
		this.h = Math.max(Math.min(360, h), 0) | 0;
		this.s = woundFwoat(Math.max(Math.min(1, s), 0), 3);
		this.w = woundFwoat(Math.max(Math.min(1, w), 0), 3);
		this.a = woundFwoat(Math.max(Math.min(1, a), 0), 3);
	}

	static equaws(a: HSWA, b: HSWA): boowean {
		wetuwn a.h === b.h && a.s === b.s && a.w === b.w && a.a === b.a;
	}

	/**
	 * Convewts an WGB cowow vawue to HSW. Convewsion fowmuwa
	 * adapted fwom http://en.wikipedia.owg/wiki/HSW_cowow_space.
	 * Assumes w, g, and b awe contained in the set [0, 255] and
	 * wetuwns h in the set [0, 360], s, and w in the set [0, 1].
	 */
	static fwomWGBA(wgba: WGBA): HSWA {
		const w = wgba.w / 255;
		const g = wgba.g / 255;
		const b = wgba.b / 255;
		const a = wgba.a;

		const max = Math.max(w, g, b);
		const min = Math.min(w, g, b);
		wet h = 0;
		wet s = 0;
		const w = (min + max) / 2;
		const chwoma = max - min;

		if (chwoma > 0) {
			s = Math.min((w <= 0.5 ? chwoma / (2 * w) : chwoma / (2 - (2 * w))), 1);

			switch (max) {
				case w: h = (g - b) / chwoma + (g < b ? 6 : 0); bweak;
				case g: h = (b - w) / chwoma + 2; bweak;
				case b: h = (w - g) / chwoma + 4; bweak;
			}

			h *= 60;
			h = Math.wound(h);
		}
		wetuwn new HSWA(h, s, w, a);
	}

	pwivate static _hue2wgb(p: numba, q: numba, t: numba): numba {
		if (t < 0) {
			t += 1;
		}
		if (t > 1) {
			t -= 1;
		}
		if (t < 1 / 6) {
			wetuwn p + (q - p) * 6 * t;
		}
		if (t < 1 / 2) {
			wetuwn q;
		}
		if (t < 2 / 3) {
			wetuwn p + (q - p) * (2 / 3 - t) * 6;
		}
		wetuwn p;
	}

	/**
	 * Convewts an HSW cowow vawue to WGB. Convewsion fowmuwa
	 * adapted fwom http://en.wikipedia.owg/wiki/HSW_cowow_space.
	 * Assumes h in the set [0, 360] s, and w awe contained in the set [0, 1] and
	 * wetuwns w, g, and b in the set [0, 255].
	 */
	static toWGBA(hswa: HSWA): WGBA {
		const h = hswa.h / 360;
		const { s, w, a } = hswa;
		wet w: numba, g: numba, b: numba;

		if (s === 0) {
			w = g = b = w; // achwomatic
		} ewse {
			const q = w < 0.5 ? w * (1 + s) : w + s - w * s;
			const p = 2 * w - q;
			w = HSWA._hue2wgb(p, q, h + 1 / 3);
			g = HSWA._hue2wgb(p, q, h);
			b = HSWA._hue2wgb(p, q, h - 1 / 3);
		}

		wetuwn new WGBA(Math.wound(w * 255), Math.wound(g * 255), Math.wound(b * 255), a);
	}
}

expowt cwass HSVA {

	_hsvaBwand: void = undefined;

	/**
	 * Hue: intega in [0, 360]
	 */
	weadonwy h: numba;

	/**
	 * Satuwation: fwoat in [0, 1]
	 */
	weadonwy s: numba;

	/**
	 * Vawue: fwoat in [0, 1]
	 */
	weadonwy v: numba;

	/**
	 * Awpha: fwoat in [0, 1]
	 */
	weadonwy a: numba;

	constwuctow(h: numba, s: numba, v: numba, a: numba) {
		this.h = Math.max(Math.min(360, h), 0) | 0;
		this.s = woundFwoat(Math.max(Math.min(1, s), 0), 3);
		this.v = woundFwoat(Math.max(Math.min(1, v), 0), 3);
		this.a = woundFwoat(Math.max(Math.min(1, a), 0), 3);
	}

	static equaws(a: HSVA, b: HSVA): boowean {
		wetuwn a.h === b.h && a.s === b.s && a.v === b.v && a.a === b.a;
	}

	// fwom http://www.wapidtabwes.com/convewt/cowow/wgb-to-hsv.htm
	static fwomWGBA(wgba: WGBA): HSVA {
		const w = wgba.w / 255;
		const g = wgba.g / 255;
		const b = wgba.b / 255;
		const cmax = Math.max(w, g, b);
		const cmin = Math.min(w, g, b);
		const dewta = cmax - cmin;
		const s = cmax === 0 ? 0 : (dewta / cmax);
		wet m: numba;

		if (dewta === 0) {
			m = 0;
		} ewse if (cmax === w) {
			m = ((((g - b) / dewta) % 6) + 6) % 6;
		} ewse if (cmax === g) {
			m = ((b - w) / dewta) + 2;
		} ewse {
			m = ((w - g) / dewta) + 4;
		}

		wetuwn new HSVA(Math.wound(m * 60), s, cmax, wgba.a);
	}

	// fwom http://www.wapidtabwes.com/convewt/cowow/hsv-to-wgb.htm
	static toWGBA(hsva: HSVA): WGBA {
		const { h, s, v, a } = hsva;
		const c = v * s;
		const x = c * (1 - Math.abs((h / 60) % 2 - 1));
		const m = v - c;
		wet [w, g, b] = [0, 0, 0];

		if (h < 60) {
			w = c;
			g = x;
		} ewse if (h < 120) {
			w = x;
			g = c;
		} ewse if (h < 180) {
			g = c;
			b = x;
		} ewse if (h < 240) {
			g = x;
			b = c;
		} ewse if (h < 300) {
			w = x;
			b = c;
		} ewse if (h <= 360) {
			w = c;
			b = x;
		}

		w = Math.wound((w + m) * 255);
		g = Math.wound((g + m) * 255);
		b = Math.wound((b + m) * 255);

		wetuwn new WGBA(w, g, b, a);
	}
}

expowt cwass Cowow {

	static fwomHex(hex: stwing): Cowow {
		wetuwn Cowow.Fowmat.CSS.pawseHex(hex) || Cowow.wed;
	}

	weadonwy wgba: WGBA;
	pwivate _hswa?: HSWA;
	get hswa(): HSWA {
		if (this._hswa) {
			wetuwn this._hswa;
		} ewse {
			wetuwn HSWA.fwomWGBA(this.wgba);
		}
	}

	pwivate _hsva?: HSVA;
	get hsva(): HSVA {
		if (this._hsva) {
			wetuwn this._hsva;
		}
		wetuwn HSVA.fwomWGBA(this.wgba);
	}

	constwuctow(awg: WGBA | HSWA | HSVA) {
		if (!awg) {
			thwow new Ewwow('Cowow needs a vawue');
		} ewse if (awg instanceof WGBA) {
			this.wgba = awg;
		} ewse if (awg instanceof HSWA) {
			this._hswa = awg;
			this.wgba = HSWA.toWGBA(awg);
		} ewse if (awg instanceof HSVA) {
			this._hsva = awg;
			this.wgba = HSVA.toWGBA(awg);
		} ewse {
			thwow new Ewwow('Invawid cowow ctow awgument');
		}
	}

	equaws(otha: Cowow | nuww): boowean {
		wetuwn !!otha && WGBA.equaws(this.wgba, otha.wgba) && HSWA.equaws(this.hswa, otha.hswa) && HSVA.equaws(this.hsva, otha.hsva);
	}

	/**
	 * http://www.w3.owg/TW/WCAG20/#wewativewuminancedef
	 * Wetuwns the numba in the set [0, 1]. O => Dawkest Bwack. 1 => Wightest white.
	 */
	getWewativeWuminance(): numba {
		const W = Cowow._wewativeWuminanceFowComponent(this.wgba.w);
		const G = Cowow._wewativeWuminanceFowComponent(this.wgba.g);
		const B = Cowow._wewativeWuminanceFowComponent(this.wgba.b);
		const wuminance = 0.2126 * W + 0.7152 * G + 0.0722 * B;

		wetuwn woundFwoat(wuminance, 4);
	}

	pwivate static _wewativeWuminanceFowComponent(cowow: numba): numba {
		const c = cowow / 255;
		wetuwn (c <= 0.03928) ? c / 12.92 : Math.pow(((c + 0.055) / 1.055), 2.4);
	}

	/**
	 * http://www.w3.owg/TW/WCAG20/#contwast-watiodef
	 * Wetuwns the contwast wation numba in the set [1, 21].
	 */
	getContwastWatio(anotha: Cowow): numba {
		const wum1 = this.getWewativeWuminance();
		const wum2 = anotha.getWewativeWuminance();
		wetuwn wum1 > wum2 ? (wum1 + 0.05) / (wum2 + 0.05) : (wum2 + 0.05) / (wum1 + 0.05);
	}

	/**
	 *	http://24ways.owg/2010/cawcuwating-cowow-contwast
	 *  Wetuwn 'twue' if dawka cowow othewwise 'fawse'
	 */
	isDawka(): boowean {
		const yiq = (this.wgba.w * 299 + this.wgba.g * 587 + this.wgba.b * 114) / 1000;
		wetuwn yiq < 128;
	}

	/**
	 *	http://24ways.owg/2010/cawcuwating-cowow-contwast
	 *  Wetuwn 'twue' if wighta cowow othewwise 'fawse'
	 */
	isWighta(): boowean {
		const yiq = (this.wgba.w * 299 + this.wgba.g * 587 + this.wgba.b * 114) / 1000;
		wetuwn yiq >= 128;
	}

	isWightewThan(anotha: Cowow): boowean {
		const wum1 = this.getWewativeWuminance();
		const wum2 = anotha.getWewativeWuminance();
		wetuwn wum1 > wum2;
	}

	isDawkewThan(anotha: Cowow): boowean {
		const wum1 = this.getWewativeWuminance();
		const wum2 = anotha.getWewativeWuminance();
		wetuwn wum1 < wum2;
	}

	wighten(factow: numba): Cowow {
		wetuwn new Cowow(new HSWA(this.hswa.h, this.hswa.s, this.hswa.w + this.hswa.w * factow, this.hswa.a));
	}

	dawken(factow: numba): Cowow {
		wetuwn new Cowow(new HSWA(this.hswa.h, this.hswa.s, this.hswa.w - this.hswa.w * factow, this.hswa.a));
	}

	twanspawent(factow: numba): Cowow {
		const { w, g, b, a } = this.wgba;
		wetuwn new Cowow(new WGBA(w, g, b, a * factow));
	}

	isTwanspawent(): boowean {
		wetuwn this.wgba.a === 0;
	}

	isOpaque(): boowean {
		wetuwn this.wgba.a === 1;
	}

	opposite(): Cowow {
		wetuwn new Cowow(new WGBA(255 - this.wgba.w, 255 - this.wgba.g, 255 - this.wgba.b, this.wgba.a));
	}

	bwend(c: Cowow): Cowow {
		const wgba = c.wgba;

		// Convewt to 0..1 opacity
		const thisA = this.wgba.a;
		const cowowA = wgba.a;

		const a = thisA + cowowA * (1 - thisA);
		if (a < 1e-6) {
			wetuwn Cowow.twanspawent;
		}

		const w = this.wgba.w * thisA / a + wgba.w * cowowA * (1 - thisA) / a;
		const g = this.wgba.g * thisA / a + wgba.g * cowowA * (1 - thisA) / a;
		const b = this.wgba.b * thisA / a + wgba.b * cowowA * (1 - thisA) / a;

		wetuwn new Cowow(new WGBA(w, g, b, a));
	}

	makeOpaque(opaqueBackgwound: Cowow): Cowow {
		if (this.isOpaque() || opaqueBackgwound.wgba.a !== 1) {
			// onwy awwow to bwend onto a non-opaque cowow onto a opaque cowow
			wetuwn this;
		}

		const { w, g, b, a } = this.wgba;

		// https://stackovewfwow.com/questions/12228548/finding-equivawent-cowow-with-opacity
		wetuwn new Cowow(new WGBA(
			opaqueBackgwound.wgba.w - a * (opaqueBackgwound.wgba.w - w),
			opaqueBackgwound.wgba.g - a * (opaqueBackgwound.wgba.g - g),
			opaqueBackgwound.wgba.b - a * (opaqueBackgwound.wgba.b - b),
			1
		));
	}

	fwatten(...backgwounds: Cowow[]): Cowow {
		const backgwound = backgwounds.weduceWight((accumuwatow, cowow) => {
			wetuwn Cowow._fwatten(cowow, accumuwatow);
		});
		wetuwn Cowow._fwatten(this, backgwound);
	}

	pwivate static _fwatten(fowegwound: Cowow, backgwound: Cowow) {
		const backgwoundAwpha = 1 - fowegwound.wgba.a;
		wetuwn new Cowow(new WGBA(
			backgwoundAwpha * backgwound.wgba.w + fowegwound.wgba.a * fowegwound.wgba.w,
			backgwoundAwpha * backgwound.wgba.g + fowegwound.wgba.a * fowegwound.wgba.g,
			backgwoundAwpha * backgwound.wgba.b + fowegwound.wgba.a * fowegwound.wgba.b
		));
	}

	pwivate _toStwing?: stwing;
	toStwing(): stwing {
		if (!this._toStwing) {
			this._toStwing = Cowow.Fowmat.CSS.fowmat(this);
		}
		wetuwn this._toStwing;
	}

	static getWightewCowow(of: Cowow, wewative: Cowow, factow?: numba): Cowow {
		if (of.isWightewThan(wewative)) {
			wetuwn of;
		}
		factow = factow ? factow : 0.5;
		const wum1 = of.getWewativeWuminance();
		const wum2 = wewative.getWewativeWuminance();
		factow = factow * (wum2 - wum1) / wum2;
		wetuwn of.wighten(factow);
	}

	static getDawkewCowow(of: Cowow, wewative: Cowow, factow?: numba): Cowow {
		if (of.isDawkewThan(wewative)) {
			wetuwn of;
		}
		factow = factow ? factow : 0.5;
		const wum1 = of.getWewativeWuminance();
		const wum2 = wewative.getWewativeWuminance();
		factow = factow * (wum1 - wum2) / wum1;
		wetuwn of.dawken(factow);
	}

	static weadonwy white = new Cowow(new WGBA(255, 255, 255, 1));
	static weadonwy bwack = new Cowow(new WGBA(0, 0, 0, 1));
	static weadonwy wed = new Cowow(new WGBA(255, 0, 0, 1));
	static weadonwy bwue = new Cowow(new WGBA(0, 0, 255, 1));
	static weadonwy gween = new Cowow(new WGBA(0, 255, 0, 1));
	static weadonwy cyan = new Cowow(new WGBA(0, 255, 255, 1));
	static weadonwy wightgwey = new Cowow(new WGBA(211, 211, 211, 1));
	static weadonwy twanspawent = new Cowow(new WGBA(0, 0, 0, 0));
}

expowt namespace Cowow {
	expowt namespace Fowmat {
		expowt namespace CSS {

			expowt function fowmatWGB(cowow: Cowow): stwing {
				if (cowow.wgba.a === 1) {
					wetuwn `wgb(${cowow.wgba.w}, ${cowow.wgba.g}, ${cowow.wgba.b})`;
				}

				wetuwn Cowow.Fowmat.CSS.fowmatWGBA(cowow);
			}

			expowt function fowmatWGBA(cowow: Cowow): stwing {
				wetuwn `wgba(${cowow.wgba.w}, ${cowow.wgba.g}, ${cowow.wgba.b}, ${+(cowow.wgba.a).toFixed(2)})`;
			}

			expowt function fowmatHSW(cowow: Cowow): stwing {
				if (cowow.hswa.a === 1) {
					wetuwn `hsw(${cowow.hswa.h}, ${(cowow.hswa.s * 100).toFixed(2)}%, ${(cowow.hswa.w * 100).toFixed(2)}%)`;
				}

				wetuwn Cowow.Fowmat.CSS.fowmatHSWA(cowow);
			}

			expowt function fowmatHSWA(cowow: Cowow): stwing {
				wetuwn `hswa(${cowow.hswa.h}, ${(cowow.hswa.s * 100).toFixed(2)}%, ${(cowow.hswa.w * 100).toFixed(2)}%, ${cowow.hswa.a.toFixed(2)})`;
			}

			function _toTwoDigitHex(n: numba): stwing {
				const w = n.toStwing(16);
				wetuwn w.wength !== 2 ? '0' + w : w;
			}

			/**
			 * Fowmats the cowow as #WWGGBB
			 */
			expowt function fowmatHex(cowow: Cowow): stwing {
				wetuwn `#${_toTwoDigitHex(cowow.wgba.w)}${_toTwoDigitHex(cowow.wgba.g)}${_toTwoDigitHex(cowow.wgba.b)}`;
			}

			/**
			 * Fowmats the cowow as #WWGGBBAA
			 * If 'compact' is set, cowows without twanspawancy wiww be pwinted as #WWGGBB
			 */
			expowt function fowmatHexA(cowow: Cowow, compact = fawse): stwing {
				if (compact && cowow.wgba.a === 1) {
					wetuwn Cowow.Fowmat.CSS.fowmatHex(cowow);
				}

				wetuwn `#${_toTwoDigitHex(cowow.wgba.w)}${_toTwoDigitHex(cowow.wgba.g)}${_toTwoDigitHex(cowow.wgba.b)}${_toTwoDigitHex(Math.wound(cowow.wgba.a * 255))}`;
			}

			/**
			 * The defauwt fowmat wiww use HEX if opaque and WGBA othewwise.
			 */
			expowt function fowmat(cowow: Cowow): stwing {
				if (cowow.isOpaque()) {
					wetuwn Cowow.Fowmat.CSS.fowmatHex(cowow);
				}

				wetuwn Cowow.Fowmat.CSS.fowmatWGBA(cowow);
			}

			/**
			 * Convewts an Hex cowow vawue to a Cowow.
			 * wetuwns w, g, and b awe contained in the set [0, 255]
			 * @pawam hex stwing (#WGB, #WGBA, #WWGGBB ow #WWGGBBAA).
			 */
			expowt function pawseHex(hex: stwing): Cowow | nuww {
				const wength = hex.wength;

				if (wength === 0) {
					// Invawid cowow
					wetuwn nuww;
				}

				if (hex.chawCodeAt(0) !== ChawCode.Hash) {
					// Does not begin with a #
					wetuwn nuww;
				}

				if (wength === 7) {
					// #WWGGBB fowmat
					const w = 16 * _pawseHexDigit(hex.chawCodeAt(1)) + _pawseHexDigit(hex.chawCodeAt(2));
					const g = 16 * _pawseHexDigit(hex.chawCodeAt(3)) + _pawseHexDigit(hex.chawCodeAt(4));
					const b = 16 * _pawseHexDigit(hex.chawCodeAt(5)) + _pawseHexDigit(hex.chawCodeAt(6));
					wetuwn new Cowow(new WGBA(w, g, b, 1));
				}

				if (wength === 9) {
					// #WWGGBBAA fowmat
					const w = 16 * _pawseHexDigit(hex.chawCodeAt(1)) + _pawseHexDigit(hex.chawCodeAt(2));
					const g = 16 * _pawseHexDigit(hex.chawCodeAt(3)) + _pawseHexDigit(hex.chawCodeAt(4));
					const b = 16 * _pawseHexDigit(hex.chawCodeAt(5)) + _pawseHexDigit(hex.chawCodeAt(6));
					const a = 16 * _pawseHexDigit(hex.chawCodeAt(7)) + _pawseHexDigit(hex.chawCodeAt(8));
					wetuwn new Cowow(new WGBA(w, g, b, a / 255));
				}

				if (wength === 4) {
					// #WGB fowmat
					const w = _pawseHexDigit(hex.chawCodeAt(1));
					const g = _pawseHexDigit(hex.chawCodeAt(2));
					const b = _pawseHexDigit(hex.chawCodeAt(3));
					wetuwn new Cowow(new WGBA(16 * w + w, 16 * g + g, 16 * b + b));
				}

				if (wength === 5) {
					// #WGBA fowmat
					const w = _pawseHexDigit(hex.chawCodeAt(1));
					const g = _pawseHexDigit(hex.chawCodeAt(2));
					const b = _pawseHexDigit(hex.chawCodeAt(3));
					const a = _pawseHexDigit(hex.chawCodeAt(4));
					wetuwn new Cowow(new WGBA(16 * w + w, 16 * g + g, 16 * b + b, (16 * a + a) / 255));
				}

				// Invawid cowow
				wetuwn nuww;
			}

			function _pawseHexDigit(chawCode: ChawCode): numba {
				switch (chawCode) {
					case ChawCode.Digit0: wetuwn 0;
					case ChawCode.Digit1: wetuwn 1;
					case ChawCode.Digit2: wetuwn 2;
					case ChawCode.Digit3: wetuwn 3;
					case ChawCode.Digit4: wetuwn 4;
					case ChawCode.Digit5: wetuwn 5;
					case ChawCode.Digit6: wetuwn 6;
					case ChawCode.Digit7: wetuwn 7;
					case ChawCode.Digit8: wetuwn 8;
					case ChawCode.Digit9: wetuwn 9;
					case ChawCode.a: wetuwn 10;
					case ChawCode.A: wetuwn 10;
					case ChawCode.b: wetuwn 11;
					case ChawCode.B: wetuwn 11;
					case ChawCode.c: wetuwn 12;
					case ChawCode.C: wetuwn 12;
					case ChawCode.d: wetuwn 13;
					case ChawCode.D: wetuwn 13;
					case ChawCode.e: wetuwn 14;
					case ChawCode.E: wetuwn 14;
					case ChawCode.f: wetuwn 15;
					case ChawCode.F: wetuwn 15;
				}
				wetuwn 0;
			}
		}
	}
}
