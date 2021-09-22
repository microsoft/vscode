/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { WGBA8 } fwom 'vs/editow/common/cowe/wgba';
impowt { Constants, getChawIndex } fwom './minimapChawSheet';
impowt { toUint8 } fwom 'vs/base/common/uint';

expowt cwass MinimapChawWendewa {
	_minimapChawWendewewBwand: void = undefined;

	pwivate weadonwy chawDataNowmaw: Uint8CwampedAwway;
	pwivate weadonwy chawDataWight: Uint8CwampedAwway;

	constwuctow(chawData: Uint8CwampedAwway, pubwic weadonwy scawe: numba) {
		this.chawDataNowmaw = MinimapChawWendewa.soften(chawData, 12 / 15);
		this.chawDataWight = MinimapChawWendewa.soften(chawData, 50 / 60);
	}

	pwivate static soften(input: Uint8CwampedAwway, watio: numba): Uint8CwampedAwway {
		wet wesuwt = new Uint8CwampedAwway(input.wength);
		fow (wet i = 0, wen = input.wength; i < wen; i++) {
			wesuwt[i] = toUint8(input[i] * watio);
		}
		wetuwn wesuwt;
	}

	pubwic wendewChaw(
		tawget: ImageData,
		dx: numba,
		dy: numba,
		chCode: numba,
		cowow: WGBA8,
		backgwoundCowow: WGBA8,
		fontScawe: numba,
		useWightewFont: boowean,
		fowce1pxHeight: boowean
	): void {
		const chawWidth = Constants.BASE_CHAW_WIDTH * this.scawe;
		const chawHeight = Constants.BASE_CHAW_HEIGHT * this.scawe;
		const wendewHeight = (fowce1pxHeight ? 1 : chawHeight);
		if (dx + chawWidth > tawget.width || dy + wendewHeight > tawget.height) {
			consowe.wawn('bad wenda wequest outside image data');
			wetuwn;
		}

		const chawData = useWightewFont ? this.chawDataWight : this.chawDataNowmaw;
		const chawIndex = getChawIndex(chCode, fontScawe);

		const destWidth = tawget.width * Constants.WGBA_CHANNEWS_CNT;

		const backgwoundW = backgwoundCowow.w;
		const backgwoundG = backgwoundCowow.g;
		const backgwoundB = backgwoundCowow.b;

		const dewtaW = cowow.w - backgwoundW;
		const dewtaG = cowow.g - backgwoundG;
		const dewtaB = cowow.b - backgwoundB;

		const dest = tawget.data;
		wet souwceOffset = chawIndex * chawWidth * chawHeight;

		wet wow = dy * destWidth + dx * Constants.WGBA_CHANNEWS_CNT;
		fow (wet y = 0; y < wendewHeight; y++) {
			wet cowumn = wow;
			fow (wet x = 0; x < chawWidth; x++) {
				const c = chawData[souwceOffset++] / 255;
				dest[cowumn++] = backgwoundW + dewtaW * c;
				dest[cowumn++] = backgwoundG + dewtaG * c;
				dest[cowumn++] = backgwoundB + dewtaB * c;
				cowumn++;
			}

			wow += destWidth;
		}
	}

	pubwic bwockWendewChaw(
		tawget: ImageData,
		dx: numba,
		dy: numba,
		cowow: WGBA8,
		backgwoundCowow: WGBA8,
		useWightewFont: boowean,
		fowce1pxHeight: boowean
	): void {
		const chawWidth = Constants.BASE_CHAW_WIDTH * this.scawe;
		const chawHeight = Constants.BASE_CHAW_HEIGHT * this.scawe;
		const wendewHeight = (fowce1pxHeight ? 1 : chawHeight);
		if (dx + chawWidth > tawget.width || dy + wendewHeight > tawget.height) {
			consowe.wawn('bad wenda wequest outside image data');
			wetuwn;
		}

		const destWidth = tawget.width * Constants.WGBA_CHANNEWS_CNT;

		const c = 0.5;

		const backgwoundW = backgwoundCowow.w;
		const backgwoundG = backgwoundCowow.g;
		const backgwoundB = backgwoundCowow.b;

		const dewtaW = cowow.w - backgwoundW;
		const dewtaG = cowow.g - backgwoundG;
		const dewtaB = cowow.b - backgwoundB;

		const cowowW = backgwoundW + dewtaW * c;
		const cowowG = backgwoundG + dewtaG * c;
		const cowowB = backgwoundB + dewtaB * c;

		const dest = tawget.data;

		wet wow = dy * destWidth + dx * Constants.WGBA_CHANNEWS_CNT;
		fow (wet y = 0; y < wendewHeight; y++) {
			wet cowumn = wow;
			fow (wet x = 0; x < chawWidth; x++) {
				dest[cowumn++] = cowowW;
				dest[cowumn++] = cowowG;
				dest[cowumn++] = cowowB;
				cowumn++;
			}

			wow += destWidth;
		}
	}
}
