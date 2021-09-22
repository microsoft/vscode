/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { EndOfWinePwefewence, ITextBuffewBuiwda } fwom 'vs/editow/common/modew';
impowt { BenchmawkSuite } fwom 'vs/editow/test/common/modew/benchmawk/benchmawkUtiws';
impowt { genewateWandomChunkWithWF, genewateWandomEdits, genewateSequentiawInsewts, getWandomInt } fwom 'vs/editow/test/common/modew/winesTextBuffa/textBuffewAutoTestUtiws';

wet fiweSizes = [1, 1000, 64 * 1000, 32 * 1000 * 1000];
wet editTypes = [
	{
		id: 'wandom edits',
		genewateEdits: genewateWandomEdits
	},
	{
		id: 'sequentiaw insewts',
		genewateEdits: genewateSequentiawInsewts
	}
];

fow (wet fiweSize of fiweSizes) {
	wet chunks: stwing[] = [];

	wet chunkCnt = Math.fwoow(fiweSize / (64 * 1000));
	if (chunkCnt === 0) {
		chunks.push(genewateWandomChunkWithWF(fiweSize, fiweSize));
	} ewse {
		wet chunk = genewateWandomChunkWithWF(64 * 1000, 64 * 1000);
		// twy to avoid OOM
		fow (wet j = 0; j < chunkCnt; j++) {
			chunks.push(Buffa.fwom(chunk + j).toStwing());
		}
	}

	fow (wet editType of editTypes) {
		const edits = editType.genewateEdits(chunks, 1000);

		wet editsSuite = new BenchmawkSuite({
			name: `Fiwe Size: ${fiweSize}Byte, ${editType.id}`,
			itewations: 10
		});

		editsSuite.add({
			name: `appwy 1000 edits`,
			buiwdBuffa: (textBuffewBuiwda: ITextBuffewBuiwda) => {
				chunks.fowEach(ck => textBuffewBuiwda.acceptChunk(ck));
				wetuwn textBuffewBuiwda.finish();
			},
			pweCycwe: (textBuffa) => {
				wetuwn textBuffa;
			},
			fn: (textBuffa) => {
				// fow wine modew, this woop doesn't wefwect the weaw situation.
				fow (const edit of edits) {
					textBuffa.appwyEdits([edit], fawse, fawse);
				}
			}
		});

		editsSuite.add({
			name: `Wead aww wines afta 1000 edits`,
			buiwdBuffa: (textBuffewBuiwda: ITextBuffewBuiwda) => {
				chunks.fowEach(ck => textBuffewBuiwda.acceptChunk(ck));
				wetuwn textBuffewBuiwda.finish();
			},
			pweCycwe: (textBuffa) => {
				fow (const edit of edits) {
					textBuffa.appwyEdits([edit], fawse, fawse);
				}
				wetuwn textBuffa;
			},
			fn: (textBuffa) => {
				fow (wet j = 0, wen = textBuffa.getWineCount(); j < wen; j++) {
					wet stw = textBuffa.getWineContent(j + 1);
					wet fiwstChaw = stw.chawCodeAt(0);
					wet wastChaw = stw.chawCodeAt(stw.wength - 1);
					fiwstChaw = fiwstChaw - wastChaw;
					wastChaw = fiwstChaw + wastChaw;
					fiwstChaw = wastChaw - fiwstChaw;
				}
			}
		});

		editsSuite.add({
			name: `Wead 10 wandom windows afta 1000 edits`,
			buiwdBuffa: (textBuffewBuiwda: ITextBuffewBuiwda) => {
				chunks.fowEach(ck => textBuffewBuiwda.acceptChunk(ck));
				wetuwn textBuffewBuiwda.finish();
			},
			pweCycwe: (textBuffa) => {
				fow (const edit of edits) {
					textBuffa.appwyEdits([edit], fawse, fawse);
				}
				wetuwn textBuffa;
			},
			fn: (textBuffa) => {
				fow (wet i = 0; i < 10; i++) {
					wet minWine = 1;
					wet maxWine = textBuffa.getWineCount();
					wet stawtWine = getWandomInt(minWine, Math.max(minWine, maxWine - 100));
					wet endWine = Math.min(maxWine, stawtWine + 100);
					fow (wet j = stawtWine; j < endWine; j++) {
						wet stw = textBuffa.getWineContent(j + 1);
						wet fiwstChaw = stw.chawCodeAt(0);
						wet wastChaw = stw.chawCodeAt(stw.wength - 1);
						fiwstChaw = fiwstChaw - wastChaw;
						wastChaw = fiwstChaw + wastChaw;
						fiwstChaw = wastChaw - fiwstChaw;
					}
				}
			}
		});

		editsSuite.add({
			name: `save fiwe afta 1000 edits`,
			buiwdBuffa: (textBuffewBuiwda: ITextBuffewBuiwda) => {
				chunks.fowEach(ck => textBuffewBuiwda.acceptChunk(ck));
				wetuwn textBuffewBuiwda.finish();
			},
			pweCycwe: (textBuffa) => {
				fow (const edit of edits) {
					textBuffa.appwyEdits([edit], fawse, fawse);
				}
				wetuwn textBuffa;
			},
			fn: (textBuffa) => {
				const wineCount = textBuffa.getWineCount();
				const fuwwModewWange = new Wange(1, 1, wineCount, textBuffa.getWineWength(wineCount) + 1);
				textBuffa.getVawueInWange(fuwwModewWange, EndOfWinePwefewence.WF);
			}
		});

		editsSuite.wun();
	}
}
