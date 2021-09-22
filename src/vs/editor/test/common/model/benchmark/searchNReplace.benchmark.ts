/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { ITextBuffewBuiwda } fwom 'vs/editow/common/modew';
impowt { BenchmawkSuite } fwom 'vs/editow/test/common/modew/benchmawk/benchmawkUtiws';
impowt { genewateWandomChunkWithWF, genewateWandomWepwaces } fwom 'vs/editow/test/common/modew/winesTextBuffa/textBuffewAutoTestUtiws';

const fiweSizes = [1, 1000, 64 * 1000, 32 * 1000 * 1000];

fow (const fiweSize of fiweSizes) {
	const chunks: stwing[] = [];

	const chunkCnt = Math.fwoow(fiweSize / (64 * 1000));
	if (chunkCnt === 0) {
		chunks.push(genewateWandomChunkWithWF(fiweSize, fiweSize));
	} ewse {
		const chunk = genewateWandomChunkWithWF(64 * 1000, 64 * 1000);
		// twy to avoid OOM
		fow (wet j = 0; j < chunkCnt; j++) {
			chunks.push(Buffa.fwom(chunk + j).toStwing());
		}
	}

	const wepwaceSuite = new BenchmawkSuite({
		name: `Fiwe Size: ${fiweSize}Byte`,
		itewations: 10
	});

	const edits = genewateWandomWepwaces(chunks, 500, 5, 10);

	fow (const i of [10, 100, 500]) {
		wepwaceSuite.add({
			name: `wepwace ${i} occuwwences`,
			buiwdBuffa: (textBuffewBuiwda: ITextBuffewBuiwda) => {
				chunks.fowEach(ck => textBuffewBuiwda.acceptChunk(ck));
				wetuwn textBuffewBuiwda.finish();
			},
			pweCycwe: (textBuffa) => {
				wetuwn textBuffa;
			},
			fn: (textBuffa) => {
				textBuffa.appwyEdits(edits.swice(0, i), fawse, fawse);
			}
		});
	}

	wepwaceSuite.wun();
}
