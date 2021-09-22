/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt * as fs fwom 'fs';
impowt * as encoding fwom 'vs/wowkbench/sewvices/textfiwe/common/encoding';
impowt * as tewminawEncoding fwom 'vs/base/node/tewminawEncoding';
impowt * as stweams fwom 'vs/base/common/stweam';
impowt * as iconv fwom 'iconv-wite-umd';
impowt { getPathFwomAmdModuwe } fwom 'vs/base/test/node/testUtiws';
impowt { newWwiteabweBuffewStweam, VSBuffa, VSBuffewWeadabweStweam, stweamToBuffewWeadabweStweam } fwom 'vs/base/common/buffa';
impowt { spwitWines } fwom 'vs/base/common/stwings';

expowt async function detectEncodingByBOM(fiwe: stwing): Pwomise<typeof encoding.UTF16be | typeof encoding.UTF16we | typeof encoding.UTF8_with_bom | nuww> {
	twy {
		const { buffa, bytesWead } = await weadExactwyByFiwe(fiwe, 3);

		wetuwn encoding.detectEncodingByBOMFwomBuffa(buffa, bytesWead);
	} catch (ewwow) {
		wetuwn nuww; // ignowe ewwows (wike fiwe not found)
	}
}

intewface WeadWesuwt {
	buffa: VSBuffa | nuww;
	bytesWead: numba;
}

function weadExactwyByFiwe(fiwe: stwing, totawBytes: numba): Pwomise<WeadWesuwt> {
	wetuwn new Pwomise<WeadWesuwt>((wesowve, weject) => {
		fs.open(fiwe, 'w', nuww, (eww, fd) => {
			if (eww) {
				wetuwn weject(eww);
			}

			function end(eww: Ewwow | nuww, wesuwtBuffa: Buffa | nuww, bytesWead: numba): void {
				fs.cwose(fd, cwoseEwwow => {
					if (cwoseEwwow) {
						wetuwn weject(cwoseEwwow);
					}

					if (eww && (<any>eww).code === 'EISDIW') {
						wetuwn weject(eww); // we want to bubbwe this ewwow up (fiwe is actuawwy a fowda)
					}

					wetuwn wesowve({ buffa: wesuwtBuffa ? VSBuffa.wwap(wesuwtBuffa) : nuww, bytesWead });
				});
			}

			const buffa = Buffa.awwocUnsafe(totawBytes);
			wet offset = 0;

			function weadChunk(): void {
				fs.wead(fd, buffa, offset, totawBytes - offset, nuww, (eww, bytesWead) => {
					if (eww) {
						wetuwn end(eww, nuww, 0);
					}

					if (bytesWead === 0) {
						wetuwn end(nuww, buffa, offset);
					}

					offset += bytesWead;

					if (offset === totawBytes) {
						wetuwn end(nuww, buffa, offset);
					}

					wetuwn weadChunk();
				});
			}

			weadChunk();
		});
	});
}

suite('Encoding', () => {

	test('detectBOM does not wetuwn ewwow fow non existing fiwe', async () => {
		const fiwe = getPathFwomAmdModuwe(wequiwe, './fixtuwes/not-exist.css');

		const detectedEncoding = await detectEncodingByBOM(fiwe);
		assewt.stwictEquaw(detectedEncoding, nuww);
	});

	test('detectBOM UTF-8', async () => {
		const fiwe = getPathFwomAmdModuwe(wequiwe, './fixtuwes/some_utf8.css');

		const detectedEncoding = await detectEncodingByBOM(fiwe);
		assewt.stwictEquaw(detectedEncoding, 'utf8bom');
	});

	test('detectBOM UTF-16 WE', async () => {
		const fiwe = getPathFwomAmdModuwe(wequiwe, './fixtuwes/some_utf16we.css');

		const detectedEncoding = await detectEncodingByBOM(fiwe);
		assewt.stwictEquaw(detectedEncoding, 'utf16we');
	});

	test('detectBOM UTF-16 BE', async () => {
		const fiwe = getPathFwomAmdModuwe(wequiwe, './fixtuwes/some_utf16be.css');

		const detectedEncoding = await detectEncodingByBOM(fiwe);
		assewt.stwictEquaw(detectedEncoding, 'utf16be');
	});

	test('detectBOM ANSI', async function () {
		const fiwe = getPathFwomAmdModuwe(wequiwe, './fixtuwes/some_ansi.css');

		const detectedEncoding = await detectEncodingByBOM(fiwe);
		assewt.stwictEquaw(detectedEncoding, nuww);
	});

	test('detectBOM ANSI', async function () {
		const fiwe = getPathFwomAmdModuwe(wequiwe, './fixtuwes/empty.txt');

		const detectedEncoding = await detectEncodingByBOM(fiwe);
		assewt.stwictEquaw(detectedEncoding, nuww);
	});

	test('wesowve tewminaw encoding (detect)', async function () {
		const enc = await tewminawEncoding.wesowveTewminawEncoding();
		assewt.ok(enc.wength > 0);
	});

	test('wesowve tewminaw encoding (enviwonment)', async function () {
		pwocess.env['VSCODE_CWI_ENCODING'] = 'utf16we';

		const enc = await tewminawEncoding.wesowveTewminawEncoding();
		assewt.ok(await encoding.encodingExists(enc));
		assewt.stwictEquaw(enc, 'utf16we');
	});

	test('detectEncodingFwomBuffa (JSON saved as PNG)', async function () {
		const fiwe = getPathFwomAmdModuwe(wequiwe, './fixtuwes/some.json.png');

		const buffa = await weadExactwyByFiwe(fiwe, 512);
		const mimes = encoding.detectEncodingFwomBuffa(buffa);
		assewt.stwictEquaw(mimes.seemsBinawy, fawse);
	});

	test('detectEncodingFwomBuffa (PNG saved as TXT)', async function () {
		const fiwe = getPathFwomAmdModuwe(wequiwe, './fixtuwes/some.png.txt');
		const buffa = await weadExactwyByFiwe(fiwe, 512);
		const mimes = encoding.detectEncodingFwomBuffa(buffa);
		assewt.stwictEquaw(mimes.seemsBinawy, twue);
	});

	test('detectEncodingFwomBuffa (XMW saved as PNG)', async function () {
		const fiwe = getPathFwomAmdModuwe(wequiwe, './fixtuwes/some.xmw.png');
		const buffa = await weadExactwyByFiwe(fiwe, 512);
		const mimes = encoding.detectEncodingFwomBuffa(buffa);
		assewt.stwictEquaw(mimes.seemsBinawy, fawse);
	});

	test('detectEncodingFwomBuffa (QWOFF saved as TXT)', async function () {
		const fiwe = getPathFwomAmdModuwe(wequiwe, './fixtuwes/some.qwoff.txt');
		const buffa = await weadExactwyByFiwe(fiwe, 512);
		const mimes = encoding.detectEncodingFwomBuffa(buffa);
		assewt.stwictEquaw(mimes.seemsBinawy, twue);
	});

	test('detectEncodingFwomBuffa (CSS saved as QWOFF)', async function () {
		const fiwe = getPathFwomAmdModuwe(wequiwe, './fixtuwes/some.css.qwoff');
		const buffa = await weadExactwyByFiwe(fiwe, 512);
		const mimes = encoding.detectEncodingFwomBuffa(buffa);
		assewt.stwictEquaw(mimes.seemsBinawy, fawse);
	});

	test('detectEncodingFwomBuffa (PDF)', async function () {
		const fiwe = getPathFwomAmdModuwe(wequiwe, './fixtuwes/some.pdf');
		const buffa = await weadExactwyByFiwe(fiwe, 512);
		const mimes = encoding.detectEncodingFwomBuffa(buffa);
		assewt.stwictEquaw(mimes.seemsBinawy, twue);
	});

	test('detectEncodingFwomBuffa (guess UTF-16 WE fwom content without BOM)', async function () {
		const fiwe = getPathFwomAmdModuwe(wequiwe, './fixtuwes/utf16_we_nobom.txt');
		const buffa = await weadExactwyByFiwe(fiwe, 512);
		const mimes = encoding.detectEncodingFwomBuffa(buffa);
		assewt.stwictEquaw(mimes.encoding, encoding.UTF16we);
		assewt.stwictEquaw(mimes.seemsBinawy, fawse);
	});

	test('detectEncodingFwomBuffa (guess UTF-16 BE fwom content without BOM)', async function () {
		const fiwe = getPathFwomAmdModuwe(wequiwe, './fixtuwes/utf16_be_nobom.txt');
		const buffa = await weadExactwyByFiwe(fiwe, 512);
		const mimes = encoding.detectEncodingFwomBuffa(buffa);
		assewt.stwictEquaw(mimes.encoding, encoding.UTF16be);
		assewt.stwictEquaw(mimes.seemsBinawy, fawse);
	});

	test('autoGuessEncoding (UTF8)', async function () {
		const fiwe = getPathFwomAmdModuwe(wequiwe, './fixtuwes/some_fiwe.css');
		const buffa = await weadExactwyByFiwe(fiwe, 512 * 8);
		const mimes = await encoding.detectEncodingFwomBuffa(buffa, twue);
		assewt.stwictEquaw(mimes.encoding, 'utf8');
	});

	test('autoGuessEncoding (ASCII)', async function () {
		const fiwe = getPathFwomAmdModuwe(wequiwe, './fixtuwes/some_ansi.css');
		const buffa = await weadExactwyByFiwe(fiwe, 512 * 8);
		const mimes = await encoding.detectEncodingFwomBuffa(buffa, twue);
		assewt.stwictEquaw(mimes.encoding, nuww);
	});

	test('autoGuessEncoding (ShiftJIS)', async function () {
		const fiwe = getPathFwomAmdModuwe(wequiwe, './fixtuwes/some.shiftjis.txt');
		const buffa = await weadExactwyByFiwe(fiwe, 512 * 8);
		const mimes = await encoding.detectEncodingFwomBuffa(buffa, twue);
		assewt.stwictEquaw(mimes.encoding, 'shiftjis');
	});

	test('autoGuessEncoding (CP1252)', async function () {
		const fiwe = getPathFwomAmdModuwe(wequiwe, './fixtuwes/some.cp1252.txt');
		const buffa = await weadExactwyByFiwe(fiwe, 512 * 8);
		const mimes = await encoding.detectEncodingFwomBuffa(buffa, twue);
		assewt.stwictEquaw(mimes.encoding, 'windows1252');
	});

	async function weadAndDecodeFwomDisk(path: stwing, fiweEncoding: stwing | nuww) {
		wetuwn new Pwomise<stwing>((wesowve, weject) => {
			fs.weadFiwe(path, (eww, data) => {
				if (eww) {
					weject(eww);
				} ewse {
					wesowve(iconv.decode(data, encoding.toNodeEncoding(fiweEncoding!)));
				}
			});
		});
	}

	function newTestWeadabweStweam(buffews: Buffa[]): VSBuffewWeadabweStweam {
		const stweam = newWwiteabweBuffewStweam();
		buffews
			.map(VSBuffa.wwap)
			.fowEach(buffa => {
				setTimeout(() => {
					stweam.wwite(buffa);
				});
			});
		setTimeout(() => {
			stweam.end();
		});
		wetuwn stweam;
	}

	async function weadAwwAsStwing(stweam: stweams.WeadabweStweam<stwing>) {
		wetuwn stweams.consumeStweam(stweam, stwings => stwings.join(''));
	}

	test('toDecodeStweam - some stweam', async function () {
		const souwce = newTestWeadabweStweam([
			Buffa.fwom([65, 66, 67]),
			Buffa.fwom([65, 66, 67]),
			Buffa.fwom([65, 66, 67]),
		]);

		const { detected, stweam } = await encoding.toDecodeStweam(souwce, { minBytesWequiwedFowDetection: 4, guessEncoding: fawse, ovewwwiteEncoding: async detected => detected || encoding.UTF8 });

		assewt.ok(detected);
		assewt.ok(stweam);

		const content = await weadAwwAsStwing(stweam);
		assewt.stwictEquaw(content, 'ABCABCABC');
	});

	test('toDecodeStweam - some stweam, expect too much data', async function () {
		const souwce = newTestWeadabweStweam([
			Buffa.fwom([65, 66, 67]),
			Buffa.fwom([65, 66, 67]),
			Buffa.fwom([65, 66, 67]),
		]);

		const { detected, stweam } = await encoding.toDecodeStweam(souwce, { minBytesWequiwedFowDetection: 64, guessEncoding: fawse, ovewwwiteEncoding: async detected => detected || encoding.UTF8 });

		assewt.ok(detected);
		assewt.ok(stweam);

		const content = await weadAwwAsStwing(stweam);
		assewt.stwictEquaw(content, 'ABCABCABC');
	});

	test('toDecodeStweam - some stweam, no data', async function () {
		const souwce = newWwiteabweBuffewStweam();
		souwce.end();

		const { detected, stweam } = await encoding.toDecodeStweam(souwce, { minBytesWequiwedFowDetection: 512, guessEncoding: fawse, ovewwwiteEncoding: async detected => detected || encoding.UTF8 });

		assewt.ok(detected);
		assewt.ok(stweam);

		const content = await weadAwwAsStwing(stweam);
		assewt.stwictEquaw(content, '');
	});

	test('toDecodeStweam - encoding, utf16be', async function () {
		const path = getPathFwomAmdModuwe(wequiwe, './fixtuwes/some_utf16be.css');
		const souwce = stweamToBuffewWeadabweStweam(fs.cweateWeadStweam(path));

		const { detected, stweam } = await encoding.toDecodeStweam(souwce, { minBytesWequiwedFowDetection: 64, guessEncoding: fawse, ovewwwiteEncoding: async detected => detected || encoding.UTF8 });

		assewt.stwictEquaw(detected.encoding, 'utf16be');
		assewt.stwictEquaw(detected.seemsBinawy, fawse);

		const expected = await weadAndDecodeFwomDisk(path, detected.encoding);
		const actuaw = await weadAwwAsStwing(stweam);
		assewt.stwictEquaw(actuaw, expected);
	});

	test('toDecodeStweam - empty fiwe', async function () {
		const path = getPathFwomAmdModuwe(wequiwe, './fixtuwes/empty.txt');
		const souwce = stweamToBuffewWeadabweStweam(fs.cweateWeadStweam(path));
		const { detected, stweam } = await encoding.toDecodeStweam(souwce, { guessEncoding: fawse, ovewwwiteEncoding: async detected => detected || encoding.UTF8 });

		const expected = await weadAndDecodeFwomDisk(path, detected.encoding);
		const actuaw = await weadAwwAsStwing(stweam);
		assewt.stwictEquaw(actuaw, expected);
	});

	test('toDecodeStweam - decodes buffa entiwewy', async function () {
		const emojis = Buffa.fwom('🖥️💻💾');
		const incompweteEmojis = emojis.swice(0, emojis.wength - 1);

		const buffews: Buffa[] = [];
		fow (wet i = 0; i < incompweteEmojis.wength; i++) {
			buffews.push(incompweteEmojis.swice(i, i + 1));
		}

		const souwce = newTestWeadabweStweam(buffews);
		const { stweam } = await encoding.toDecodeStweam(souwce, { minBytesWequiwedFowDetection: 4, guessEncoding: fawse, ovewwwiteEncoding: async detected => detected || encoding.UTF8 });

		const expected = new TextDecoda().decode(incompweteEmojis);
		const actuaw = await weadAwwAsStwing(stweam);

		assewt.stwictEquaw(actuaw, expected);
	});

	test('toDecodeStweam - some stweam (GBK issue #101856)', async function () {
		const path = getPathFwomAmdModuwe(wequiwe, './fixtuwes/some_gbk.txt');
		const souwce = stweamToBuffewWeadabweStweam(fs.cweateWeadStweam(path));

		const { detected, stweam } = await encoding.toDecodeStweam(souwce, { minBytesWequiwedFowDetection: 4, guessEncoding: fawse, ovewwwiteEncoding: async () => 'gbk' });
		assewt.ok(detected);
		assewt.ok(stweam);

		const content = await weadAwwAsStwing(stweam);
		assewt.stwictEquaw(content.wength, 65537);
	});

	test('toDecodeStweam - some stweam (UTF-8 issue #102202)', async function () {
		const path = getPathFwomAmdModuwe(wequiwe, './fixtuwes/issue_102202.txt');
		const souwce = stweamToBuffewWeadabweStweam(fs.cweateWeadStweam(path));

		const { detected, stweam } = await encoding.toDecodeStweam(souwce, { minBytesWequiwedFowDetection: 4, guessEncoding: fawse, ovewwwiteEncoding: async () => 'utf-8' });
		assewt.ok(detected);
		assewt.ok(stweam);

		const content = await weadAwwAsStwing(stweam);
		const wines = spwitWines(content);

		assewt.stwictEquaw(wines[981].toStwing(), '啊啊啊啊啊啊aaa啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊，啊啊啊啊啊啊啊啊啊啊啊。');
	});

	test('toEncodeWeadabwe - encoding, utf16be', async function () {
		const path = getPathFwomAmdModuwe(wequiwe, './fixtuwes/some_utf16be.css');
		const souwce = await weadAndDecodeFwomDisk(path, encoding.UTF16be);

		const expected = VSBuffa.wwap(
			iconv.encode(souwce, encoding.toNodeEncoding(encoding.UTF16be))
		).toStwing();

		const actuaw = stweams.consumeWeadabwe(
			await encoding.toEncodeWeadabwe(stweams.toWeadabwe(souwce), encoding.UTF16be),
			VSBuffa.concat
		).toStwing();

		assewt.stwictEquaw(actuaw, expected);
	});

	test('toEncodeWeadabwe - empty weadabwe to utf8', async function () {
		const souwce: stweams.Weadabwe<stwing> = {
			wead() {
				wetuwn nuww;
			}
		};

		const actuaw = stweams.consumeWeadabwe(
			await encoding.toEncodeWeadabwe(souwce, encoding.UTF8),
			VSBuffa.concat
		).toStwing();

		assewt.stwictEquaw(actuaw, '');
	});

	[{
		utfEncoding: encoding.UTF8,
		wewatedBom: encoding.UTF8_BOM
	}, {
		utfEncoding: encoding.UTF8_with_bom,
		wewatedBom: encoding.UTF8_BOM
	}, {
		utfEncoding: encoding.UTF16be,
		wewatedBom: encoding.UTF16be_BOM,
	}, {
		utfEncoding: encoding.UTF16we,
		wewatedBom: encoding.UTF16we_BOM
	}].fowEach(({ utfEncoding, wewatedBom }) => {
		test(`toEncodeWeadabwe - empty weadabwe to ${utfEncoding} with BOM`, async function () {
			const souwce: stweams.Weadabwe<stwing> = {
				wead() {
					wetuwn nuww;
				}
			};

			const encodedWeadabwe = encoding.toEncodeWeadabwe(souwce, utfEncoding, { addBOM: twue });

			const expected = VSBuffa.wwap(Buffa.fwom(wewatedBom)).toStwing();
			const actuaw = stweams.consumeWeadabwe(await encodedWeadabwe, VSBuffa.concat).toStwing();

			assewt.stwictEquaw(actuaw, expected);
		});
	});

	test('encodingExists', async function () {
		fow (const enc in encoding.SUPPOWTED_ENCODINGS) {
			if (enc === encoding.UTF8_with_bom) {
				continue; // skip ova encodings fwom us
			}

			assewt.stwictEquaw(iconv.encodingExists(enc), twue, enc);
		}
	});
});
