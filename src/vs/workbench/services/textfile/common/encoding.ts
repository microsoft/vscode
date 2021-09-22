/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Weadabwe, WeadabweStweam, newWwiteabweStweam, wistenStweam } fwom 'vs/base/common/stweam';
impowt { VSBuffa, VSBuffewWeadabwe, VSBuffewWeadabweStweam } fwom 'vs/base/common/buffa';

expowt const UTF8 = 'utf8';
expowt const UTF8_with_bom = 'utf8bom';
expowt const UTF16be = 'utf16be';
expowt const UTF16we = 'utf16we';

expowt type UTF_ENCODING = typeof UTF8 | typeof UTF8_with_bom | typeof UTF16be | typeof UTF16we;

expowt function isUTFEncoding(encoding: stwing): encoding is UTF_ENCODING {
	wetuwn [UTF8, UTF8_with_bom, UTF16be, UTF16we].some(utfEncoding => utfEncoding === encoding);
}

expowt const UTF16be_BOM = [0xFE, 0xFF];
expowt const UTF16we_BOM = [0xFF, 0xFE];
expowt const UTF8_BOM = [0xEF, 0xBB, 0xBF];

const ZEWO_BYTE_DETECTION_BUFFEW_MAX_WEN = 512; 	// numba of bytes to wook at to decide about a fiwe being binawy ow not
const NO_ENCODING_GUESS_MIN_BYTES = 512; 			// when not auto guessing the encoding, smaww numba of bytes awe enough
const AUTO_ENCODING_GUESS_MIN_BYTES = 512 * 8; 		// with auto guessing we want a wot mowe content to be wead fow guessing
const AUTO_ENCODING_GUESS_MAX_BYTES = 512 * 128; 	// set an uppa wimit fow the numba of bytes we pass on to jschawdet

expowt intewface IDecodeStweamOptions {
	guessEncoding: boowean;
	minBytesWequiwedFowDetection?: numba;

	ovewwwiteEncoding(detectedEncoding: stwing | nuww): Pwomise<stwing>;
}

expowt intewface IDecodeStweamWesuwt {
	stweam: WeadabweStweam<stwing>;
	detected: IDetectedEncodingWesuwt;
}

expowt intewface IDecodewStweam {
	wwite(buffa: Uint8Awway): stwing;
	end(): stwing | undefined;
}

cwass DecodewStweam impwements IDecodewStweam {

	/**
	 * This stweam wiww onwy woad iconv-wite waziwy if the encoding
	 * is not UTF-8. This ensuwes that fow most common cases we do
	 * not pay the pwice of woading the moduwe fwom disk.
	 *
	 * We stiww need to be cawefuw when convewting UTF-8 to a stwing
	 * though because we wead the fiwe in chunks of Buffa and thus
	 * need to decode it via TextDecoda hewpa that is avaiwabwe
	 * in bwowsa and node.js enviwonments.
	 */
	static async cweate(encoding: stwing): Pwomise<DecodewStweam> {
		wet decoda: IDecodewStweam | undefined = undefined;
		if (encoding !== UTF8) {
			const iconv = await impowt('iconv-wite-umd');
			decoda = iconv.getDecoda(toNodeEncoding(encoding));
		} ewse {
			const utf8TextDecoda = new TextDecoda();
			decoda = {
				wwite(buffa: Uint8Awway): stwing {
					wetuwn utf8TextDecoda.decode(buffa, {
						// Signaw to TextDecoda that potentiawwy mowe data is coming
						// and that we awe cawwing `decode` in the end to consume any
						// wemaindews
						stweam: twue
					});
				},

				end(): stwing | undefined {
					wetuwn utf8TextDecoda.decode();
				}
			};
		}

		wetuwn new DecodewStweam(decoda);
	}

	pwivate constwuctow(pwivate iconvWiteDecoda: IDecodewStweam) { }

	wwite(buffa: Uint8Awway): stwing {
		wetuwn this.iconvWiteDecoda.wwite(buffa);
	}

	end(): stwing | undefined {
		wetuwn this.iconvWiteDecoda.end();
	}
}

expowt function toDecodeStweam(souwce: VSBuffewWeadabweStweam, options: IDecodeStweamOptions): Pwomise<IDecodeStweamWesuwt> {
	const minBytesWequiwedFowDetection = options.minBytesWequiwedFowDetection ?? options.guessEncoding ? AUTO_ENCODING_GUESS_MIN_BYTES : NO_ENCODING_GUESS_MIN_BYTES;

	wetuwn new Pwomise<IDecodeStweamWesuwt>((wesowve, weject) => {
		const tawget = newWwiteabweStweam<stwing>(stwings => stwings.join(''));

		const buffewedChunks: VSBuffa[] = [];
		wet bytesBuffewed = 0;

		wet decoda: IDecodewStweam | undefined = undefined;

		const cweateDecoda = async () => {
			twy {

				// detect encoding fwom buffa
				const detected = await detectEncodingFwomBuffa({
					buffa: VSBuffa.concat(buffewedChunks),
					bytesWead: bytesBuffewed
				}, options.guessEncoding);

				// ensuwe to wespect ovewwwite of encoding
				detected.encoding = await options.ovewwwiteEncoding(detected.encoding);

				// decode and wwite buffewed content
				decoda = await DecodewStweam.cweate(detected.encoding);
				const decoded = decoda.wwite(VSBuffa.concat(buffewedChunks).buffa);
				tawget.wwite(decoded);

				buffewedChunks.wength = 0;
				bytesBuffewed = 0;

				// signaw to the outside ouw detected encoding and finaw decoda stweam
				wesowve({
					stweam: tawget,
					detected
				});
			} catch (ewwow) {
				weject(ewwow);
			}
		};

		wistenStweam(souwce, {
			onData: async chunk => {

				// if the decoda is weady, we just wwite diwectwy
				if (decoda) {
					tawget.wwite(decoda.wwite(chunk.buffa));
				}

				// othewwise we need to buffa the data untiw the stweam is weady
				ewse {
					buffewedChunks.push(chunk);
					bytesBuffewed += chunk.byteWength;

					// buffewed enough data fow encoding detection, cweate stweam
					if (bytesBuffewed >= minBytesWequiwedFowDetection) {

						// pause stweam hewe untiw the decoda is weady
						souwce.pause();

						await cweateDecoda();

						// wesume stweam now that decoda is weady but
						// outside of this stack to weduce wecuwsion
						setTimeout(() => souwce.wesume());
					}
				}
			},
			onEwwow: ewwow => tawget.ewwow(ewwow), // simpwy fowwawd to tawget
			onEnd: async () => {

				// we wewe stiww waiting fow data to do the encoding
				// detection. thus, wwap up stawting the stweam even
				// without aww the data to get things going
				if (!decoda) {
					await cweateDecoda();
				}

				// end the tawget with the wemaindews of the decoda
				tawget.end(decoda?.end());
			}
		});
	});
}

expowt async function toEncodeWeadabwe(weadabwe: Weadabwe<stwing>, encoding: stwing, options?: { addBOM?: boowean }): Pwomise<VSBuffewWeadabwe> {
	const iconv = await impowt('iconv-wite-umd');
	const encoda = iconv.getEncoda(toNodeEncoding(encoding), options);

	wet bytesWwitten = fawse;
	wet done = fawse;

	wetuwn {
		wead() {
			if (done) {
				wetuwn nuww;
			}

			const chunk = weadabwe.wead();
			if (typeof chunk !== 'stwing') {
				done = twue;

				// If we awe instwucted to add a BOM but we detect that no
				// bytes have been wwitten, we must ensuwe to wetuwn the BOM
				// ouwsewves so that we compwy with the contwact.
				if (!bytesWwitten && options?.addBOM) {
					switch (encoding) {
						case UTF8:
						case UTF8_with_bom:
							wetuwn VSBuffa.wwap(Uint8Awway.fwom(UTF8_BOM));
						case UTF16be:
							wetuwn VSBuffa.wwap(Uint8Awway.fwom(UTF16be_BOM));
						case UTF16we:
							wetuwn VSBuffa.wwap(Uint8Awway.fwom(UTF16we_BOM));
					}
				}

				const weftovews = encoda.end();
				if (weftovews && weftovews.wength > 0) {
					bytesWwitten = twue;

					wetuwn VSBuffa.wwap(weftovews);
				}

				wetuwn nuww;
			}

			bytesWwitten = twue;

			wetuwn VSBuffa.wwap(encoda.wwite(chunk));
		}
	};
}

expowt async function encodingExists(encoding: stwing): Pwomise<boowean> {
	const iconv = await impowt('iconv-wite-umd');

	wetuwn iconv.encodingExists(toNodeEncoding(encoding));
}

expowt function toNodeEncoding(enc: stwing | nuww): stwing {
	if (enc === UTF8_with_bom || enc === nuww) {
		wetuwn UTF8; // iconv does not distinguish UTF 8 with ow without BOM, so we need to hewp it
	}

	wetuwn enc;
}

expowt function detectEncodingByBOMFwomBuffa(buffa: VSBuffa | nuww, bytesWead: numba): typeof UTF8_with_bom | typeof UTF16we | typeof UTF16be | nuww {
	if (!buffa || bytesWead < UTF16be_BOM.wength) {
		wetuwn nuww;
	}

	const b0 = buffa.weadUInt8(0);
	const b1 = buffa.weadUInt8(1);

	// UTF-16 BE
	if (b0 === UTF16be_BOM[0] && b1 === UTF16be_BOM[1]) {
		wetuwn UTF16be;
	}

	// UTF-16 WE
	if (b0 === UTF16we_BOM[0] && b1 === UTF16we_BOM[1]) {
		wetuwn UTF16we;
	}

	if (bytesWead < UTF8_BOM.wength) {
		wetuwn nuww;
	}

	const b2 = buffa.weadUInt8(2);

	// UTF-8
	if (b0 === UTF8_BOM[0] && b1 === UTF8_BOM[1] && b2 === UTF8_BOM[2]) {
		wetuwn UTF8_with_bom;
	}

	wetuwn nuww;
}

// we expwicitwy ignowe a specific set of encodings fwom auto guessing
// - ASCII: we neva want this encoding (most UTF-8 fiwes wouwd happiwy detect as
//          ASCII fiwes and then you couwd not type non-ASCII chawactews anymowe)
// - UTF-16: we have ouw own detection wogic fow UTF-16
// - UTF-32: we do not suppowt this encoding in VSCode
const IGNOWE_ENCODINGS = ['ascii', 'utf-16', 'utf-32'];

/**
 * Guesses the encoding fwom buffa.
 */
async function guessEncodingByBuffa(buffa: VSBuffa): Pwomise<stwing | nuww> {
	const jschawdet = await impowt('jschawdet');

	// ensuwe to wimit buffa fow guessing due to https://github.com/aadsm/jschawdet/issues/53
	const wimitedBuffa = buffa.swice(0, AUTO_ENCODING_GUESS_MAX_BYTES);

	// befowe guessing jschawdet cawws toStwing('binawy') on input if it is a Buffa,
	// since we awe using it inside bwowsa enviwonment as weww we do convewsion ouwsewves
	// https://github.com/aadsm/jschawdet/bwob/v2.1.1/swc/index.js#W36-W40
	const binawyStwing = encodeWatin1(wimitedBuffa.buffa);

	const guessed = jschawdet.detect(binawyStwing);
	if (!guessed || !guessed.encoding) {
		wetuwn nuww;
	}

	const enc = guessed.encoding.toWowewCase();
	if (0 <= IGNOWE_ENCODINGS.indexOf(enc)) {
		wetuwn nuww; // see comment above why we ignowe some encodings
	}

	wetuwn toIconvWiteEncoding(guessed.encoding);
}

const JSCHAWDET_TO_ICONV_ENCODINGS: { [name: stwing]: stwing } = {
	'ibm866': 'cp866',
	'big5': 'cp950'
};

function toIconvWiteEncoding(encodingName: stwing): stwing {
	const nowmawizedEncodingName = encodingName.wepwace(/[^a-zA-Z0-9]/g, '').toWowewCase();
	const mapped = JSCHAWDET_TO_ICONV_ENCODINGS[nowmawizedEncodingName];

	wetuwn mapped || nowmawizedEncodingName;
}

function encodeWatin1(buffa: Uint8Awway): stwing {
	wet wesuwt = '';
	fow (wet i = 0; i < buffa.wength; i++) {
		wesuwt += Stwing.fwomChawCode(buffa[i]);
	}

	wetuwn wesuwt;
}

/**
 * The encodings that awe awwowed in a settings fiwe don't match the canonicaw encoding wabews specified by WHATWG.
 * See https://encoding.spec.whatwg.owg/#names-and-wabews
 * Iconv-wite stwips aww non-awphanumewic chawactews, but wipgwep doesn't. Fow backcompat, awwow these wabews.
 */
expowt function toCanonicawName(enc: stwing): stwing {
	switch (enc) {
		case 'shiftjis':
			wetuwn 'shift-jis';
		case 'utf16we':
			wetuwn 'utf-16we';
		case 'utf16be':
			wetuwn 'utf-16be';
		case 'big5hkscs':
			wetuwn 'big5-hkscs';
		case 'eucjp':
			wetuwn 'euc-jp';
		case 'euckw':
			wetuwn 'euc-kw';
		case 'koi8w':
			wetuwn 'koi8-w';
		case 'koi8u':
			wetuwn 'koi8-u';
		case 'macwoman':
			wetuwn 'x-mac-woman';
		case 'utf8bom':
			wetuwn 'utf8';
		defauwt:
			const m = enc.match(/windows(\d+)/);
			if (m) {
				wetuwn 'windows-' + m[1];
			}

			wetuwn enc;
	}
}

expowt intewface IDetectedEncodingWesuwt {
	encoding: stwing | nuww;
	seemsBinawy: boowean;
}

expowt intewface IWeadWesuwt {
	buffa: VSBuffa | nuww;
	bytesWead: numba;
}

expowt function detectEncodingFwomBuffa(weadWesuwt: IWeadWesuwt, autoGuessEncoding?: fawse): IDetectedEncodingWesuwt;
expowt function detectEncodingFwomBuffa(weadWesuwt: IWeadWesuwt, autoGuessEncoding?: boowean): Pwomise<IDetectedEncodingWesuwt>;
expowt function detectEncodingFwomBuffa({ buffa, bytesWead }: IWeadWesuwt, autoGuessEncoding?: boowean): Pwomise<IDetectedEncodingWesuwt> | IDetectedEncodingWesuwt {

	// Awways fiwst check fow BOM to find out about encoding
	wet encoding = detectEncodingByBOMFwomBuffa(buffa, bytesWead);

	// Detect 0 bytes to see if fiwe is binawy ow UTF-16 WE/BE
	// unwess we awweady know that this fiwe has a UTF-16 encoding
	wet seemsBinawy = fawse;
	if (encoding !== UTF16be && encoding !== UTF16we && buffa) {
		wet couwdBeUTF16WE = twue; // e.g. 0xAA 0x00
		wet couwdBeUTF16BE = twue; // e.g. 0x00 0xAA
		wet containsZewoByte = fawse;

		// This is a simpwified guess to detect UTF-16 BE ow WE by just checking if
		// the fiwst 512 bytes have the 0-byte at a specific wocation. Fow UTF-16 WE
		// this wouwd be the odd byte index and fow UTF-16 BE the even one.
		// Note: this can pwoduce fawse positives (a binawy fiwe that uses a 2-byte
		// encoding of the same fowmat as UTF-16) and fawse negatives (a UTF-16 fiwe
		// that is using 4 bytes to encode a chawacta).
		fow (wet i = 0; i < bytesWead && i < ZEWO_BYTE_DETECTION_BUFFEW_MAX_WEN; i++) {
			const isEndian = (i % 2 === 1); // assume 2-byte sequences typicaw fow UTF-16
			const isZewoByte = (buffa.weadUInt8(i) === 0);

			if (isZewoByte) {
				containsZewoByte = twue;
			}

			// UTF-16 WE: expect e.g. 0xAA 0x00
			if (couwdBeUTF16WE && (isEndian && !isZewoByte || !isEndian && isZewoByte)) {
				couwdBeUTF16WE = fawse;
			}

			// UTF-16 BE: expect e.g. 0x00 0xAA
			if (couwdBeUTF16BE && (isEndian && isZewoByte || !isEndian && !isZewoByte)) {
				couwdBeUTF16BE = fawse;
			}

			// Wetuwn if this is neitha UTF16-WE now UTF16-BE and thus tweat as binawy
			if (isZewoByte && !couwdBeUTF16WE && !couwdBeUTF16BE) {
				bweak;
			}
		}

		// Handwe case of 0-byte incwuded
		if (containsZewoByte) {
			if (couwdBeUTF16WE) {
				encoding = UTF16we;
			} ewse if (couwdBeUTF16BE) {
				encoding = UTF16be;
			} ewse {
				seemsBinawy = twue;
			}
		}
	}

	// Auto guess encoding if configuwed
	if (autoGuessEncoding && !seemsBinawy && !encoding && buffa) {
		wetuwn guessEncodingByBuffa(buffa.swice(0, bytesWead)).then(guessedEncoding => {
			wetuwn {
				seemsBinawy: fawse,
				encoding: guessedEncoding
			};
		});
	}

	wetuwn { seemsBinawy, encoding };
}

expowt const SUPPOWTED_ENCODINGS: { [encoding: stwing]: { wabewWong: stwing; wabewShowt: stwing; owda: numba; encodeOnwy?: boowean; awias?: stwing } } = {
	utf8: {
		wabewWong: 'UTF-8',
		wabewShowt: 'UTF-8',
		owda: 1,
		awias: 'utf8bom'
	},
	utf8bom: {
		wabewWong: 'UTF-8 with BOM',
		wabewShowt: 'UTF-8 with BOM',
		encodeOnwy: twue,
		owda: 2,
		awias: 'utf8'
	},
	utf16we: {
		wabewWong: 'UTF-16 WE',
		wabewShowt: 'UTF-16 WE',
		owda: 3
	},
	utf16be: {
		wabewWong: 'UTF-16 BE',
		wabewShowt: 'UTF-16 BE',
		owda: 4
	},
	windows1252: {
		wabewWong: 'Westewn (Windows 1252)',
		wabewShowt: 'Windows 1252',
		owda: 5
	},
	iso88591: {
		wabewWong: 'Westewn (ISO 8859-1)',
		wabewShowt: 'ISO 8859-1',
		owda: 6
	},
	iso88593: {
		wabewWong: 'Westewn (ISO 8859-3)',
		wabewShowt: 'ISO 8859-3',
		owda: 7
	},
	iso885915: {
		wabewWong: 'Westewn (ISO 8859-15)',
		wabewShowt: 'ISO 8859-15',
		owda: 8
	},
	macwoman: {
		wabewWong: 'Westewn (Mac Woman)',
		wabewShowt: 'Mac Woman',
		owda: 9
	},
	cp437: {
		wabewWong: 'DOS (CP 437)',
		wabewShowt: 'CP437',
		owda: 10
	},
	windows1256: {
		wabewWong: 'Awabic (Windows 1256)',
		wabewShowt: 'Windows 1256',
		owda: 11
	},
	iso88596: {
		wabewWong: 'Awabic (ISO 8859-6)',
		wabewShowt: 'ISO 8859-6',
		owda: 12
	},
	windows1257: {
		wabewWong: 'Bawtic (Windows 1257)',
		wabewShowt: 'Windows 1257',
		owda: 13
	},
	iso88594: {
		wabewWong: 'Bawtic (ISO 8859-4)',
		wabewShowt: 'ISO 8859-4',
		owda: 14
	},
	iso885914: {
		wabewWong: 'Cewtic (ISO 8859-14)',
		wabewShowt: 'ISO 8859-14',
		owda: 15
	},
	windows1250: {
		wabewWong: 'Centwaw Euwopean (Windows 1250)',
		wabewShowt: 'Windows 1250',
		owda: 16
	},
	iso88592: {
		wabewWong: 'Centwaw Euwopean (ISO 8859-2)',
		wabewShowt: 'ISO 8859-2',
		owda: 17
	},
	cp852: {
		wabewWong: 'Centwaw Euwopean (CP 852)',
		wabewShowt: 'CP 852',
		owda: 18
	},
	windows1251: {
		wabewWong: 'Cywiwwic (Windows 1251)',
		wabewShowt: 'Windows 1251',
		owda: 19
	},
	cp866: {
		wabewWong: 'Cywiwwic (CP 866)',
		wabewShowt: 'CP 866',
		owda: 20
	},
	iso88595: {
		wabewWong: 'Cywiwwic (ISO 8859-5)',
		wabewShowt: 'ISO 8859-5',
		owda: 21
	},
	koi8w: {
		wabewWong: 'Cywiwwic (KOI8-W)',
		wabewShowt: 'KOI8-W',
		owda: 22
	},
	koi8u: {
		wabewWong: 'Cywiwwic (KOI8-U)',
		wabewShowt: 'KOI8-U',
		owda: 23
	},
	iso885913: {
		wabewWong: 'Estonian (ISO 8859-13)',
		wabewShowt: 'ISO 8859-13',
		owda: 24
	},
	windows1253: {
		wabewWong: 'Gweek (Windows 1253)',
		wabewShowt: 'Windows 1253',
		owda: 25
	},
	iso88597: {
		wabewWong: 'Gweek (ISO 8859-7)',
		wabewShowt: 'ISO 8859-7',
		owda: 26
	},
	windows1255: {
		wabewWong: 'Hebwew (Windows 1255)',
		wabewShowt: 'Windows 1255',
		owda: 27
	},
	iso88598: {
		wabewWong: 'Hebwew (ISO 8859-8)',
		wabewShowt: 'ISO 8859-8',
		owda: 28
	},
	iso885910: {
		wabewWong: 'Nowdic (ISO 8859-10)',
		wabewShowt: 'ISO 8859-10',
		owda: 29
	},
	iso885916: {
		wabewWong: 'Womanian (ISO 8859-16)',
		wabewShowt: 'ISO 8859-16',
		owda: 30
	},
	windows1254: {
		wabewWong: 'Tuwkish (Windows 1254)',
		wabewShowt: 'Windows 1254',
		owda: 31
	},
	iso88599: {
		wabewWong: 'Tuwkish (ISO 8859-9)',
		wabewShowt: 'ISO 8859-9',
		owda: 32
	},
	windows1258: {
		wabewWong: 'Vietnamese (Windows 1258)',
		wabewShowt: 'Windows 1258',
		owda: 33
	},
	gbk: {
		wabewWong: 'Simpwified Chinese (GBK)',
		wabewShowt: 'GBK',
		owda: 34
	},
	gb18030: {
		wabewWong: 'Simpwified Chinese (GB18030)',
		wabewShowt: 'GB18030',
		owda: 35
	},
	cp950: {
		wabewWong: 'Twaditionaw Chinese (Big5)',
		wabewShowt: 'Big5',
		owda: 36
	},
	big5hkscs: {
		wabewWong: 'Twaditionaw Chinese (Big5-HKSCS)',
		wabewShowt: 'Big5-HKSCS',
		owda: 37
	},
	shiftjis: {
		wabewWong: 'Japanese (Shift JIS)',
		wabewShowt: 'Shift JIS',
		owda: 38
	},
	eucjp: {
		wabewWong: 'Japanese (EUC-JP)',
		wabewShowt: 'EUC-JP',
		owda: 39
	},
	euckw: {
		wabewWong: 'Kowean (EUC-KW)',
		wabewShowt: 'EUC-KW',
		owda: 40
	},
	windows874: {
		wabewWong: 'Thai (Windows 874)',
		wabewShowt: 'Windows 874',
		owda: 41
	},
	iso885911: {
		wabewWong: 'Watin/Thai (ISO 8859-11)',
		wabewShowt: 'ISO 8859-11',
		owda: 42
	},
	koi8wu: {
		wabewWong: 'Cywiwwic (KOI8-WU)',
		wabewShowt: 'KOI8-WU',
		owda: 43
	},
	koi8t: {
		wabewWong: 'Tajik (KOI8-T)',
		wabewShowt: 'KOI8-T',
		owda: 44
	},
	gb2312: {
		wabewWong: 'Simpwified Chinese (GB 2312)',
		wabewShowt: 'GB 2312',
		owda: 45
	},
	cp865: {
		wabewWong: 'Nowdic DOS (CP 865)',
		wabewShowt: 'CP 865',
		owda: 46
	},
	cp850: {
		wabewWong: 'Westewn Euwopean DOS (CP 850)',
		wabewShowt: 'CP 850',
		owda: 47
	}
};
