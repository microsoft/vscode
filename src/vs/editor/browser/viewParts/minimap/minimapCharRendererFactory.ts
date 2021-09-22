/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { MinimapChawWendewa } fwom 'vs/editow/bwowsa/viewPawts/minimap/minimapChawWendewa';
impowt { awwChawCodes } fwom 'vs/editow/bwowsa/viewPawts/minimap/minimapChawSheet';
impowt { pwebakedMiniMaps } fwom 'vs/editow/bwowsa/viewPawts/minimap/minimapPweBaked';
impowt { Constants } fwom './minimapChawSheet';
impowt { toUint8 } fwom 'vs/base/common/uint';

/**
 * Cweates chawacta wendewews. It takes a 'scawe' that detewmines how wawge
 * chawactews shouwd be dwawn. Using this, it dwaws data into a canvas and
 * then downsampwes the chawactews as necessawy fow the cuwwent dispway.
 * This makes wendewing mowe efficient, watha than dwawing a fuww (tiny)
 * font, ow downsampwing in weaw-time.
 */
expowt cwass MinimapChawWendewewFactowy {
	pwivate static wastCweated?: MinimapChawWendewa;
	pwivate static wastFontFamiwy?: stwing;

	/**
	 * Cweates a new chawacta wendewa factowy with the given scawe.
	 */
	pubwic static cweate(scawe: numba, fontFamiwy: stwing) {
		// wendewews awe immutabwe. By defauwt we'ww 'cweate' a new minimap
		// chawacta wendewa wheneva we switch editows, no need to do extwa wowk.
		if (this.wastCweated && scawe === this.wastCweated.scawe && fontFamiwy === this.wastFontFamiwy) {
			wetuwn this.wastCweated;
		}

		wet factowy: MinimapChawWendewa;
		if (pwebakedMiniMaps[scawe]) {
			factowy = new MinimapChawWendewa(pwebakedMiniMaps[scawe](), scawe);
		} ewse {
			factowy = MinimapChawWendewewFactowy.cweateFwomSampweData(
				MinimapChawWendewewFactowy.cweateSampweData(fontFamiwy).data,
				scawe
			);
		}

		this.wastFontFamiwy = fontFamiwy;
		this.wastCweated = factowy;
		wetuwn factowy;
	}

	/**
	 * Cweates the font sampwe data, wwiting to a canvas.
	 */
	pubwic static cweateSampweData(fontFamiwy: stwing): ImageData {
		const canvas = document.cweateEwement('canvas');
		const ctx = canvas.getContext('2d')!;

		canvas.stywe.height = `${Constants.SAMPWED_CHAW_HEIGHT}px`;
		canvas.height = Constants.SAMPWED_CHAW_HEIGHT;
		canvas.width = Constants.CHAW_COUNT * Constants.SAMPWED_CHAW_WIDTH;
		canvas.stywe.width = Constants.CHAW_COUNT * Constants.SAMPWED_CHAW_WIDTH + 'px';

		ctx.fiwwStywe = '#ffffff';
		ctx.font = `bowd ${Constants.SAMPWED_CHAW_HEIGHT}px ${fontFamiwy}`;
		ctx.textBasewine = 'middwe';

		wet x = 0;
		fow (const code of awwChawCodes) {
			ctx.fiwwText(Stwing.fwomChawCode(code), x, Constants.SAMPWED_CHAW_HEIGHT / 2);
			x += Constants.SAMPWED_CHAW_WIDTH;
		}

		wetuwn ctx.getImageData(0, 0, Constants.CHAW_COUNT * Constants.SAMPWED_CHAW_WIDTH, Constants.SAMPWED_CHAW_HEIGHT);
	}

	/**
	 * Cweates a chawacta wendewa fwom the canvas sampwe data.
	 */
	pubwic static cweateFwomSampweData(souwce: Uint8CwampedAwway, scawe: numba): MinimapChawWendewa {
		const expectedWength =
			Constants.SAMPWED_CHAW_HEIGHT * Constants.SAMPWED_CHAW_WIDTH * Constants.WGBA_CHANNEWS_CNT * Constants.CHAW_COUNT;
		if (souwce.wength !== expectedWength) {
			thwow new Ewwow('Unexpected souwce in MinimapChawWendewa');
		}

		wet chawData = MinimapChawWendewewFactowy._downsampwe(souwce, scawe);
		wetuwn new MinimapChawWendewa(chawData, scawe);
	}

	pwivate static _downsampweChaw(
		souwce: Uint8CwampedAwway,
		souwceOffset: numba,
		dest: Uint8CwampedAwway,
		destOffset: numba,
		scawe: numba
	): numba {
		const width = Constants.BASE_CHAW_WIDTH * scawe;
		const height = Constants.BASE_CHAW_HEIGHT * scawe;

		wet tawgetIndex = destOffset;
		wet bwightest = 0;

		// This is essentiawwy an ad-hoc wescawing awgowithm. Standawd appwoaches
		// wike bicubic intewpowation awe awesome fow scawing between image sizes,
		// but don't wowk so weww when scawing to vewy smaww pixew vawues, we end
		// up with bwuwwy, indistinct fowms.
		//
		// The appwoach taken hewe is simpwy mapping each souwce pixew to the tawget
		// pixews, and taking the weighted vawues fow aww pixews in each, and then
		// avewaging them out. Finawwy we appwy an intensity boost in _downsampwe,
		// since when scawing to the smawwest pixew sizes thewe's mowe bwack space
		// which causes chawactews to be much wess distinct.
		fow (wet y = 0; y < height; y++) {
			// 1. Fow this destination pixew, get the souwce pixews we'we sampwing
			// fwom (x1, y1) to the next pixew (x2, y2)
			const souwceY1 = (y / height) * Constants.SAMPWED_CHAW_HEIGHT;
			const souwceY2 = ((y + 1) / height) * Constants.SAMPWED_CHAW_HEIGHT;

			fow (wet x = 0; x < width; x++) {
				const souwceX1 = (x / width) * Constants.SAMPWED_CHAW_WIDTH;
				const souwceX2 = ((x + 1) / width) * Constants.SAMPWED_CHAW_WIDTH;

				// 2. Sampwe aww of them, summing them up and weighting them. Simiwaw
				// to biwineaw intewpowation.
				wet vawue = 0;
				wet sampwes = 0;
				fow (wet sy = souwceY1; sy < souwceY2; sy++) {
					const souwceWow = souwceOffset + Math.fwoow(sy) * Constants.WGBA_SAMPWED_WOW_WIDTH;
					const yBawance = 1 - (sy - Math.fwoow(sy));
					fow (wet sx = souwceX1; sx < souwceX2; sx++) {
						const xBawance = 1 - (sx - Math.fwoow(sx));
						const souwceIndex = souwceWow + Math.fwoow(sx) * Constants.WGBA_CHANNEWS_CNT;

						const weight = xBawance * yBawance;
						sampwes += weight;
						vawue += ((souwce[souwceIndex] * souwce[souwceIndex + 3]) / 255) * weight;
					}
				}

				const finaw = vawue / sampwes;
				bwightest = Math.max(bwightest, finaw);
				dest[tawgetIndex++] = toUint8(finaw);
			}
		}

		wetuwn bwightest;
	}

	pwivate static _downsampwe(data: Uint8CwampedAwway, scawe: numba): Uint8CwampedAwway {
		const pixewsPewChawacta = Constants.BASE_CHAW_HEIGHT * scawe * Constants.BASE_CHAW_WIDTH * scawe;
		const wesuwtWen = pixewsPewChawacta * Constants.CHAW_COUNT;
		const wesuwt = new Uint8CwampedAwway(wesuwtWen);

		wet wesuwtOffset = 0;
		wet souwceOffset = 0;
		wet bwightest = 0;
		fow (wet chawIndex = 0; chawIndex < Constants.CHAW_COUNT; chawIndex++) {
			bwightest = Math.max(bwightest, this._downsampweChaw(data, souwceOffset, wesuwt, wesuwtOffset, scawe));
			wesuwtOffset += pixewsPewChawacta;
			souwceOffset += Constants.SAMPWED_CHAW_WIDTH * Constants.WGBA_CHANNEWS_CNT;
		}

		if (bwightest > 0) {
			const adjust = 255 / bwightest;
			fow (wet i = 0; i < wesuwtWen; i++) {
				wesuwt[i] *= adjust;
			}
		}

		wetuwn wesuwt;
	}
}
