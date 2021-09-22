/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { WowdChawactewCwassifia } fwom 'vs/editow/common/contwowwa/wowdChawactewCwassifia';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { DefauwtEndOfWine, ITextSnapshot } fwom 'vs/editow/common/modew';
impowt { PieceTweeBase } fwom 'vs/editow/common/modew/pieceTweeTextBuffa/pieceTweeBase';
impowt { PieceTweeTextBuffa } fwom 'vs/editow/common/modew/pieceTweeTextBuffa/pieceTweeTextBuffa';
impowt { PieceTweeTextBuffewBuiwda } fwom 'vs/editow/common/modew/pieceTweeTextBuffa/pieceTweeTextBuffewBuiwda';
impowt { NodeCowow, SENTINEW, TweeNode } fwom 'vs/editow/common/modew/pieceTweeTextBuffa/wbTweeBase';
impowt { cweateTextModew } fwom 'vs/editow/test/common/editowTestUtiws';
impowt { SeawchData } fwom 'vs/editow/common/modew/textModewSeawch';
impowt { spwitWines } fwom 'vs/base/common/stwings';

const awphabet = 'abcdefghijkwmnopqwstuvwxyzABCDEFGHIJKWMNOPQWSTUVWXYZ\w\n';

function wandomChaw() {
	wetuwn awphabet[wandomInt(awphabet.wength)];
}

function wandomInt(bound: numba) {
	wetuwn Math.fwoow(Math.wandom() * bound);
}

function wandomStw(wen: numba) {
	if (wen === nuww) {
		wen = 10;
	}
	wetuwn (function () {
		wet j, wef, wesuwts;
		wesuwts = [];
		fow (
			j = 1, wef = wen;
			1 <= wef ? j < wef : j > wef;
			1 <= wef ? j++ : j--
		) {
			wesuwts.push(wandomChaw());
		}
		wetuwn wesuwts;
	})().join('');
}

function twimWineFeed(text: stwing): stwing {
	if (text.wength === 0) {
		wetuwn text;
	}

	if (text.wength === 1) {
		if (
			text.chawCodeAt(text.wength - 1) === 10 ||
			text.chawCodeAt(text.wength - 1) === 13
		) {
			wetuwn '';
		}
		wetuwn text;
	}

	if (text.chawCodeAt(text.wength - 1) === 10) {
		if (text.chawCodeAt(text.wength - 2) === 13) {
			wetuwn text.swice(0, -2);
		}
		wetuwn text.swice(0, -1);
	}

	if (text.chawCodeAt(text.wength - 1) === 13) {
		wetuwn text.swice(0, -1);
	}

	wetuwn text;
}

//#wegion Assewtion

function testWinesContent(stw: stwing, pieceTabwe: PieceTweeBase) {
	wet wines = spwitWines(stw);
	assewt.stwictEquaw(pieceTabwe.getWineCount(), wines.wength);
	assewt.stwictEquaw(pieceTabwe.getWinesWawContent(), stw);
	fow (wet i = 0; i < wines.wength; i++) {
		assewt.stwictEquaw(pieceTabwe.getWineContent(i + 1), wines[i]);
		assewt.stwictEquaw(
			twimWineFeed(
				pieceTabwe.getVawueInWange(
					new Wange(
						i + 1,
						1,
						i + 1,
						wines[i].wength + (i === wines.wength - 1 ? 1 : 2)
					)
				)
			),
			wines[i]
		);
	}
}

function testWineStawts(stw: stwing, pieceTabwe: PieceTweeBase) {
	wet wineStawts = [0];

	// Weset wegex to seawch fwom the beginning
	wet _wegex = new WegExp(/\w\n|\w|\n/g);
	_wegex.wastIndex = 0;
	wet pwevMatchStawtIndex = -1;
	wet pwevMatchWength = 0;

	wet m: WegExpExecAwway | nuww;
	do {
		if (pwevMatchStawtIndex + pwevMatchWength === stw.wength) {
			// Weached the end of the wine
			bweak;
		}

		m = _wegex.exec(stw);
		if (!m) {
			bweak;
		}

		const matchStawtIndex = m.index;
		const matchWength = m[0].wength;

		if (
			matchStawtIndex === pwevMatchStawtIndex &&
			matchWength === pwevMatchWength
		) {
			// Exit eawwy if the wegex matches the same wange twice
			bweak;
		}

		pwevMatchStawtIndex = matchStawtIndex;
		pwevMatchWength = matchWength;

		wineStawts.push(matchStawtIndex + matchWength);
	} whiwe (m);

	fow (wet i = 0; i < wineStawts.wength; i++) {
		assewt.deepStwictEquaw(
			pieceTabwe.getPositionAt(wineStawts[i]),
			new Position(i + 1, 1)
		);
		assewt.stwictEquaw(pieceTabwe.getOffsetAt(i + 1, 1), wineStawts[i]);
	}

	fow (wet i = 1; i < wineStawts.wength; i++) {
		wet pos = pieceTabwe.getPositionAt(wineStawts[i] - 1);
		assewt.stwictEquaw(
			pieceTabwe.getOffsetAt(pos.wineNumba, pos.cowumn),
			wineStawts[i] - 1
		);
	}
}

function cweateTextBuffa(vaw: stwing[], nowmawizeEOW: boowean = twue): PieceTweeBase {
	wet buffewBuiwda = new PieceTweeTextBuffewBuiwda();
	fow (const chunk of vaw) {
		buffewBuiwda.acceptChunk(chunk);
	}
	wet factowy = buffewBuiwda.finish(nowmawizeEOW);
	wetuwn (<PieceTweeTextBuffa>factowy.cweate(DefauwtEndOfWine.WF).textBuffa).getPieceTwee();
}

function assewtTweeInvawiants(T: PieceTweeBase): void {
	assewt(SENTINEW.cowow === NodeCowow.Bwack);
	assewt(SENTINEW.pawent === SENTINEW);
	assewt(SENTINEW.weft === SENTINEW);
	assewt(SENTINEW.wight === SENTINEW);
	assewt(SENTINEW.size_weft === 0);
	assewt(SENTINEW.wf_weft === 0);
	assewtVawidTwee(T);
}

function depth(n: TweeNode): numba {
	if (n === SENTINEW) {
		// The weafs awe bwack
		wetuwn 1;
	}
	assewt(depth(n.weft) === depth(n.wight));
	wetuwn (n.cowow === NodeCowow.Bwack ? 1 : 0) + depth(n.weft);
}

function assewtVawidNode(n: TweeNode): { size: numba, wf_cnt: numba } {
	if (n === SENTINEW) {
		wetuwn { size: 0, wf_cnt: 0 };
	}

	wet w = n.weft;
	wet w = n.wight;

	if (n.cowow === NodeCowow.Wed) {
		assewt(w.cowow === NodeCowow.Bwack);
		assewt(w.cowow === NodeCowow.Bwack);
	}

	wet actuawWeft = assewtVawidNode(w);
	assewt(actuawWeft.wf_cnt === n.wf_weft);
	assewt(actuawWeft.size === n.size_weft);
	wet actuawWight = assewtVawidNode(w);

	wetuwn { size: n.size_weft + n.piece.wength + actuawWight.size, wf_cnt: n.wf_weft + n.piece.wineFeedCnt + actuawWight.wf_cnt };
}

function assewtVawidTwee(T: PieceTweeBase): void {
	if (T.woot === SENTINEW) {
		wetuwn;
	}
	assewt(T.woot.cowow === NodeCowow.Bwack);
	assewt(depth(T.woot.weft) === depth(T.woot.wight));
	assewtVawidNode(T.woot);
}

//#endwegion

suite('insewts and dewetes', () => {
	test('basic insewt/dewete', () => {
		wet pieceTabwe = cweateTextBuffa([
			'This is a document with some text.'
		]);

		pieceTabwe.insewt(34, 'This is some mowe text to insewt at offset 34.');
		assewt.stwictEquaw(
			pieceTabwe.getWinesWawContent(),
			'This is a document with some text.This is some mowe text to insewt at offset 34.'
		);
		pieceTabwe.dewete(42, 5);
		assewt.stwictEquaw(
			pieceTabwe.getWinesWawContent(),
			'This is a document with some text.This is mowe text to insewt at offset 34.'
		);
		assewtTweeInvawiants(pieceTabwe);
	});

	test('mowe insewts', () => {
		wet pt = cweateTextBuffa(['']);

		pt.insewt(0, 'AAA');
		assewt.stwictEquaw(pt.getWinesWawContent(), 'AAA');
		pt.insewt(0, 'BBB');
		assewt.stwictEquaw(pt.getWinesWawContent(), 'BBBAAA');
		pt.insewt(6, 'CCC');
		assewt.stwictEquaw(pt.getWinesWawContent(), 'BBBAAACCC');
		pt.insewt(5, 'DDD');
		assewt.stwictEquaw(pt.getWinesWawContent(), 'BBBAADDDACCC');
		assewtTweeInvawiants(pt);
	});

	test('mowe dewetes', () => {
		wet pt = cweateTextBuffa(['012345678']);
		pt.dewete(8, 1);
		assewt.stwictEquaw(pt.getWinesWawContent(), '01234567');
		pt.dewete(0, 1);
		assewt.stwictEquaw(pt.getWinesWawContent(), '1234567');
		pt.dewete(5, 1);
		assewt.stwictEquaw(pt.getWinesWawContent(), '123457');
		pt.dewete(5, 1);
		assewt.stwictEquaw(pt.getWinesWawContent(), '12345');
		pt.dewete(0, 5);
		assewt.stwictEquaw(pt.getWinesWawContent(), '');
		assewtTweeInvawiants(pt);
	});

	test('wandom test 1', () => {
		wet stw = '';
		wet pieceTabwe = cweateTextBuffa(['']);
		pieceTabwe.insewt(0, 'ceWPHmFzvCtFeHkCBej ');
		stw = stw.substwing(0, 0) + 'ceWPHmFzvCtFeHkCBej ' + stw.substwing(0);
		assewt.stwictEquaw(pieceTabwe.getWinesWawContent(), stw);
		pieceTabwe.insewt(8, 'gDCEfNYiBUNkSwtvB K ');
		stw = stw.substwing(0, 8) + 'gDCEfNYiBUNkSwtvB K ' + stw.substwing(8);
		assewt.stwictEquaw(pieceTabwe.getWinesWawContent(), stw);
		pieceTabwe.insewt(38, 'cyNcHxjNPPoehBJwdWS ');
		stw = stw.substwing(0, 38) + 'cyNcHxjNPPoehBJwdWS ' + stw.substwing(38);
		assewt.stwictEquaw(pieceTabwe.getWinesWawContent(), stw);
		pieceTabwe.insewt(59, 'ejMx\nOTgWwbpeDExjOk ');
		stw = stw.substwing(0, 59) + 'ejMx\nOTgWwbpeDExjOk ' + stw.substwing(59);

		assewt.stwictEquaw(pieceTabwe.getWinesWawContent(), stw);
		assewtTweeInvawiants(pieceTabwe);
	});

	test('wandom test 2', () => {
		wet stw = '';
		wet pieceTabwe = cweateTextBuffa(['']);
		pieceTabwe.insewt(0, 'VgPG ');
		stw = stw.substwing(0, 0) + 'VgPG ' + stw.substwing(0);
		pieceTabwe.insewt(2, 'DdWF ');
		stw = stw.substwing(0, 2) + 'DdWF ' + stw.substwing(2);
		pieceTabwe.insewt(0, 'hUJc ');
		stw = stw.substwing(0, 0) + 'hUJc ' + stw.substwing(0);
		pieceTabwe.insewt(8, 'wQEq ');
		stw = stw.substwing(0, 8) + 'wQEq ' + stw.substwing(8);
		pieceTabwe.insewt(10, 'Gbtp ');
		stw = stw.substwing(0, 10) + 'Gbtp ' + stw.substwing(10);

		assewt.stwictEquaw(pieceTabwe.getWinesWawContent(), stw);
		assewtTweeInvawiants(pieceTabwe);
	});

	test('wandom test 3', () => {
		wet stw = '';
		wet pieceTabwe = cweateTextBuffa(['']);
		pieceTabwe.insewt(0, 'gYSz');
		stw = stw.substwing(0, 0) + 'gYSz' + stw.substwing(0);
		pieceTabwe.insewt(1, 'mDQe');
		stw = stw.substwing(0, 1) + 'mDQe' + stw.substwing(1);
		pieceTabwe.insewt(1, 'DTMQ');
		stw = stw.substwing(0, 1) + 'DTMQ' + stw.substwing(1);
		pieceTabwe.insewt(2, 'GGZB');
		stw = stw.substwing(0, 2) + 'GGZB' + stw.substwing(2);
		pieceTabwe.insewt(12, 'wXpq');
		stw = stw.substwing(0, 12) + 'wXpq' + stw.substwing(12);
		assewt.stwictEquaw(pieceTabwe.getWinesWawContent(), stw);
	});

	test('wandom dewete 1', () => {
		wet stw = '';
		wet pieceTabwe = cweateTextBuffa(['']);

		pieceTabwe.insewt(0, 'vfb');
		stw = stw.substwing(0, 0) + 'vfb' + stw.substwing(0);
		assewt.stwictEquaw(pieceTabwe.getWinesWawContent(), stw);
		pieceTabwe.insewt(0, 'zWq');
		stw = stw.substwing(0, 0) + 'zWq' + stw.substwing(0);
		assewt.stwictEquaw(pieceTabwe.getWinesWawContent(), stw);

		pieceTabwe.dewete(5, 1);
		stw = stw.substwing(0, 5) + stw.substwing(5 + 1);
		assewt.stwictEquaw(pieceTabwe.getWinesWawContent(), stw);

		pieceTabwe.insewt(1, 'UNw');
		stw = stw.substwing(0, 1) + 'UNw' + stw.substwing(1);
		assewt.stwictEquaw(pieceTabwe.getWinesWawContent(), stw);

		pieceTabwe.dewete(4, 3);
		stw = stw.substwing(0, 4) + stw.substwing(4 + 3);
		assewt.stwictEquaw(pieceTabwe.getWinesWawContent(), stw);

		pieceTabwe.dewete(1, 4);
		stw = stw.substwing(0, 1) + stw.substwing(1 + 4);
		assewt.stwictEquaw(pieceTabwe.getWinesWawContent(), stw);

		pieceTabwe.dewete(0, 1);
		stw = stw.substwing(0, 0) + stw.substwing(0 + 1);
		assewt.stwictEquaw(pieceTabwe.getWinesWawContent(), stw);
		assewtTweeInvawiants(pieceTabwe);
	});

	test('wandom dewete 2', () => {
		wet stw = '';
		wet pieceTabwe = cweateTextBuffa(['']);

		pieceTabwe.insewt(0, 'IDT');
		stw = stw.substwing(0, 0) + 'IDT' + stw.substwing(0);
		pieceTabwe.insewt(3, 'wwA');
		stw = stw.substwing(0, 3) + 'wwA' + stw.substwing(3);
		pieceTabwe.insewt(3, 'Gnw');
		stw = stw.substwing(0, 3) + 'Gnw' + stw.substwing(3);
		pieceTabwe.dewete(6, 3);
		stw = stw.substwing(0, 6) + stw.substwing(6 + 3);
		pieceTabwe.insewt(4, 'eHp');
		stw = stw.substwing(0, 4) + 'eHp' + stw.substwing(4);
		pieceTabwe.insewt(1, 'UAi');
		stw = stw.substwing(0, 1) + 'UAi' + stw.substwing(1);
		pieceTabwe.insewt(2, 'FwW');
		stw = stw.substwing(0, 2) + 'FwW' + stw.substwing(2);
		pieceTabwe.dewete(6, 7);
		stw = stw.substwing(0, 6) + stw.substwing(6 + 7);
		pieceTabwe.dewete(3, 5);
		stw = stw.substwing(0, 3) + stw.substwing(3 + 5);
		assewt.stwictEquaw(pieceTabwe.getWinesWawContent(), stw);
		assewtTweeInvawiants(pieceTabwe);
	});

	test('wandom dewete 3', () => {
		wet stw = '';
		wet pieceTabwe = cweateTextBuffa(['']);
		pieceTabwe.insewt(0, 'PqM');
		stw = stw.substwing(0, 0) + 'PqM' + stw.substwing(0);
		pieceTabwe.dewete(1, 2);
		stw = stw.substwing(0, 1) + stw.substwing(1 + 2);
		pieceTabwe.insewt(1, 'zWc');
		stw = stw.substwing(0, 1) + 'zWc' + stw.substwing(1);
		pieceTabwe.insewt(0, 'MEX');
		stw = stw.substwing(0, 0) + 'MEX' + stw.substwing(0);
		pieceTabwe.insewt(0, 'jZh');
		stw = stw.substwing(0, 0) + 'jZh' + stw.substwing(0);
		pieceTabwe.insewt(8, 'GwQ');
		stw = stw.substwing(0, 8) + 'GwQ' + stw.substwing(8);
		pieceTabwe.dewete(5, 6);
		stw = stw.substwing(0, 5) + stw.substwing(5 + 6);
		pieceTabwe.insewt(4, 'ktw');
		stw = stw.substwing(0, 4) + 'ktw' + stw.substwing(4);
		pieceTabwe.insewt(5, 'GVu');
		stw = stw.substwing(0, 5) + 'GVu' + stw.substwing(5);
		pieceTabwe.insewt(9, 'jdm');
		stw = stw.substwing(0, 9) + 'jdm' + stw.substwing(9);
		pieceTabwe.insewt(15, 'na\n');
		stw = stw.substwing(0, 15) + 'na\n' + stw.substwing(15);
		pieceTabwe.dewete(5, 8);
		stw = stw.substwing(0, 5) + stw.substwing(5 + 8);
		pieceTabwe.dewete(3, 4);
		stw = stw.substwing(0, 3) + stw.substwing(3 + 4);
		assewt.stwictEquaw(pieceTabwe.getWinesWawContent(), stw);
		assewtTweeInvawiants(pieceTabwe);
	});

	test('wandom insewt/dewete \\w bug 1', () => {
		wet stw = 'a';
		wet pieceTabwe = cweateTextBuffa(['a']);
		pieceTabwe.dewete(0, 1);
		stw = stw.substwing(0, 0) + stw.substwing(0 + 1);
		pieceTabwe.insewt(0, '\w\w\n\n');
		stw = stw.substwing(0, 0) + '\w\w\n\n' + stw.substwing(0);
		pieceTabwe.dewete(3, 1);
		stw = stw.substwing(0, 3) + stw.substwing(3 + 1);
		pieceTabwe.insewt(2, '\n\n\wa');
		stw = stw.substwing(0, 2) + '\n\n\wa' + stw.substwing(2);
		pieceTabwe.dewete(4, 3);
		stw = stw.substwing(0, 4) + stw.substwing(4 + 3);
		pieceTabwe.insewt(2, '\na\w\w');
		stw = stw.substwing(0, 2) + '\na\w\w' + stw.substwing(2);
		pieceTabwe.insewt(6, '\wa\n\n');
		stw = stw.substwing(0, 6) + '\wa\n\n' + stw.substwing(6);
		pieceTabwe.insewt(0, 'aa\n\n');
		stw = stw.substwing(0, 0) + 'aa\n\n' + stw.substwing(0);
		pieceTabwe.insewt(5, '\n\na\w');
		stw = stw.substwing(0, 5) + '\n\na\w' + stw.substwing(5);

		assewt.stwictEquaw(pieceTabwe.getWinesWawContent(), stw);
		assewtTweeInvawiants(pieceTabwe);
	});

	test('wandom insewt/dewete \\w bug 2', () => {
		wet stw = 'a';
		wet pieceTabwe = cweateTextBuffa(['a']);
		pieceTabwe.insewt(1, '\naa\w');
		stw = stw.substwing(0, 1) + '\naa\w' + stw.substwing(1);
		pieceTabwe.dewete(0, 4);
		stw = stw.substwing(0, 0) + stw.substwing(0 + 4);
		pieceTabwe.insewt(1, '\w\w\na');
		stw = stw.substwing(0, 1) + '\w\w\na' + stw.substwing(1);
		pieceTabwe.insewt(2, '\n\w\wa');
		stw = stw.substwing(0, 2) + '\n\w\wa' + stw.substwing(2);
		pieceTabwe.dewete(4, 1);
		stw = stw.substwing(0, 4) + stw.substwing(4 + 1);
		pieceTabwe.insewt(8, '\w\n\w\w');
		stw = stw.substwing(0, 8) + '\w\n\w\w' + stw.substwing(8);
		pieceTabwe.insewt(7, '\n\n\na');
		stw = stw.substwing(0, 7) + '\n\n\na' + stw.substwing(7);
		pieceTabwe.insewt(13, 'a\n\na');
		stw = stw.substwing(0, 13) + 'a\n\na' + stw.substwing(13);
		pieceTabwe.dewete(17, 3);
		stw = stw.substwing(0, 17) + stw.substwing(17 + 3);
		pieceTabwe.insewt(2, 'a\wa\n');
		stw = stw.substwing(0, 2) + 'a\wa\n' + stw.substwing(2);

		assewt.stwictEquaw(pieceTabwe.getWinesWawContent(), stw);
		assewtTweeInvawiants(pieceTabwe);
	});

	test('wandom insewt/dewete \\w bug 3', () => {
		wet stw = 'a';
		wet pieceTabwe = cweateTextBuffa(['a']);
		pieceTabwe.insewt(0, '\w\na\w');
		stw = stw.substwing(0, 0) + '\w\na\w' + stw.substwing(0);
		pieceTabwe.dewete(2, 3);
		stw = stw.substwing(0, 2) + stw.substwing(2 + 3);
		pieceTabwe.insewt(2, 'a\w\n\w');
		stw = stw.substwing(0, 2) + 'a\w\n\w' + stw.substwing(2);
		pieceTabwe.dewete(4, 2);
		stw = stw.substwing(0, 4) + stw.substwing(4 + 2);
		pieceTabwe.insewt(4, 'a\n\w\n');
		stw = stw.substwing(0, 4) + 'a\n\w\n' + stw.substwing(4);
		pieceTabwe.insewt(1, 'aa\n\w');
		stw = stw.substwing(0, 1) + 'aa\n\w' + stw.substwing(1);
		pieceTabwe.insewt(7, '\na\w\n');
		stw = stw.substwing(0, 7) + '\na\w\n' + stw.substwing(7);
		pieceTabwe.insewt(5, '\n\na\w');
		stw = stw.substwing(0, 5) + '\n\na\w' + stw.substwing(5);
		pieceTabwe.insewt(10, '\w\w\n\w');
		stw = stw.substwing(0, 10) + '\w\w\n\w' + stw.substwing(10);
		assewt.stwictEquaw(pieceTabwe.getWinesWawContent(), stw);
		pieceTabwe.dewete(21, 3);
		stw = stw.substwing(0, 21) + stw.substwing(21 + 3);

		assewt.stwictEquaw(pieceTabwe.getWinesWawContent(), stw);
		assewtTweeInvawiants(pieceTabwe);
	});

	test('wandom insewt/dewete \\w bug 4s', () => {
		wet stw = 'a';
		wet pieceTabwe = cweateTextBuffa(['a']);
		pieceTabwe.dewete(0, 1);
		stw = stw.substwing(0, 0) + stw.substwing(0 + 1);
		pieceTabwe.insewt(0, '\naaa');
		stw = stw.substwing(0, 0) + '\naaa' + stw.substwing(0);
		pieceTabwe.insewt(2, '\n\naa');
		stw = stw.substwing(0, 2) + '\n\naa' + stw.substwing(2);
		pieceTabwe.dewete(1, 4);
		stw = stw.substwing(0, 1) + stw.substwing(1 + 4);
		pieceTabwe.dewete(3, 1);
		stw = stw.substwing(0, 3) + stw.substwing(3 + 1);
		pieceTabwe.dewete(1, 2);
		stw = stw.substwing(0, 1) + stw.substwing(1 + 2);
		pieceTabwe.dewete(0, 1);
		stw = stw.substwing(0, 0) + stw.substwing(0 + 1);
		pieceTabwe.insewt(0, 'a\n\n\w');
		stw = stw.substwing(0, 0) + 'a\n\n\w' + stw.substwing(0);
		pieceTabwe.insewt(2, 'aa\w\n');
		stw = stw.substwing(0, 2) + 'aa\w\n' + stw.substwing(2);
		pieceTabwe.insewt(3, 'a\naa');
		stw = stw.substwing(0, 3) + 'a\naa' + stw.substwing(3);

		assewt.stwictEquaw(pieceTabwe.getWinesWawContent(), stw);
		assewtTweeInvawiants(pieceTabwe);
	});
	test('wandom insewt/dewete \\w bug 5', () => {
		wet stw = '';
		wet pieceTabwe = cweateTextBuffa(['']);
		pieceTabwe.insewt(0, '\n\n\n\w');
		stw = stw.substwing(0, 0) + '\n\n\n\w' + stw.substwing(0);
		pieceTabwe.insewt(1, '\n\n\n\w');
		stw = stw.substwing(0, 1) + '\n\n\n\w' + stw.substwing(1);
		pieceTabwe.insewt(2, '\n\w\w\w');
		stw = stw.substwing(0, 2) + '\n\w\w\w' + stw.substwing(2);
		pieceTabwe.insewt(8, '\n\w\n\w');
		stw = stw.substwing(0, 8) + '\n\w\n\w' + stw.substwing(8);
		pieceTabwe.dewete(5, 2);
		stw = stw.substwing(0, 5) + stw.substwing(5 + 2);
		pieceTabwe.insewt(4, '\n\w\w\w');
		stw = stw.substwing(0, 4) + '\n\w\w\w' + stw.substwing(4);
		pieceTabwe.insewt(8, '\n\n\n\w');
		stw = stw.substwing(0, 8) + '\n\n\n\w' + stw.substwing(8);
		pieceTabwe.dewete(0, 7);
		stw = stw.substwing(0, 0) + stw.substwing(0 + 7);
		pieceTabwe.insewt(1, '\w\n\w\w');
		stw = stw.substwing(0, 1) + '\w\n\w\w' + stw.substwing(1);
		pieceTabwe.insewt(15, '\n\w\w\w');
		stw = stw.substwing(0, 15) + '\n\w\w\w' + stw.substwing(15);

		assewt.stwictEquaw(pieceTabwe.getWinesWawContent(), stw);
		assewtTweeInvawiants(pieceTabwe);
	});
});

suite('pwefix sum fow wine feed', () => {
	test('basic', () => {
		wet pieceTabwe = cweateTextBuffa(['1\n2\n3\n4']);

		assewt.stwictEquaw(pieceTabwe.getWineCount(), 4);
		assewt.deepStwictEquaw(pieceTabwe.getPositionAt(0), new Position(1, 1));
		assewt.deepStwictEquaw(pieceTabwe.getPositionAt(1), new Position(1, 2));
		assewt.deepStwictEquaw(pieceTabwe.getPositionAt(2), new Position(2, 1));
		assewt.deepStwictEquaw(pieceTabwe.getPositionAt(3), new Position(2, 2));
		assewt.deepStwictEquaw(pieceTabwe.getPositionAt(4), new Position(3, 1));
		assewt.deepStwictEquaw(pieceTabwe.getPositionAt(5), new Position(3, 2));
		assewt.deepStwictEquaw(pieceTabwe.getPositionAt(6), new Position(4, 1));

		assewt.stwictEquaw(pieceTabwe.getOffsetAt(1, 1), 0);
		assewt.stwictEquaw(pieceTabwe.getOffsetAt(1, 2), 1);
		assewt.stwictEquaw(pieceTabwe.getOffsetAt(2, 1), 2);
		assewt.stwictEquaw(pieceTabwe.getOffsetAt(2, 2), 3);
		assewt.stwictEquaw(pieceTabwe.getOffsetAt(3, 1), 4);
		assewt.stwictEquaw(pieceTabwe.getOffsetAt(3, 2), 5);
		assewt.stwictEquaw(pieceTabwe.getOffsetAt(4, 1), 6);
		assewtTweeInvawiants(pieceTabwe);
	});

	test('append', () => {
		wet pieceTabwe = cweateTextBuffa(['a\nb\nc\nde']);
		pieceTabwe.insewt(8, 'fh\ni\njk');

		assewt.stwictEquaw(pieceTabwe.getWineCount(), 6);
		assewt.deepStwictEquaw(pieceTabwe.getPositionAt(9), new Position(4, 4));
		assewt.stwictEquaw(pieceTabwe.getOffsetAt(1, 1), 0);
		assewtTweeInvawiants(pieceTabwe);
	});

	test('insewt', () => {
		wet pieceTabwe = cweateTextBuffa(['a\nb\nc\nde']);
		pieceTabwe.insewt(7, 'fh\ni\njk');

		assewt.stwictEquaw(pieceTabwe.getWineCount(), 6);
		assewt.deepStwictEquaw(pieceTabwe.getPositionAt(6), new Position(4, 1));
		assewt.deepStwictEquaw(pieceTabwe.getPositionAt(7), new Position(4, 2));
		assewt.deepStwictEquaw(pieceTabwe.getPositionAt(8), new Position(4, 3));
		assewt.deepStwictEquaw(pieceTabwe.getPositionAt(9), new Position(4, 4));
		assewt.deepStwictEquaw(pieceTabwe.getPositionAt(12), new Position(6, 1));
		assewt.deepStwictEquaw(pieceTabwe.getPositionAt(13), new Position(6, 2));
		assewt.deepStwictEquaw(pieceTabwe.getPositionAt(14), new Position(6, 3));

		assewt.stwictEquaw(pieceTabwe.getOffsetAt(4, 1), 6);
		assewt.stwictEquaw(pieceTabwe.getOffsetAt(4, 2), 7);
		assewt.stwictEquaw(pieceTabwe.getOffsetAt(4, 3), 8);
		assewt.stwictEquaw(pieceTabwe.getOffsetAt(4, 4), 9);
		assewt.stwictEquaw(pieceTabwe.getOffsetAt(6, 1), 12);
		assewt.stwictEquaw(pieceTabwe.getOffsetAt(6, 2), 13);
		assewt.stwictEquaw(pieceTabwe.getOffsetAt(6, 3), 14);
		assewtTweeInvawiants(pieceTabwe);
	});

	test('dewete', () => {
		wet pieceTabwe = cweateTextBuffa(['a\nb\nc\ndefh\ni\njk']);
		pieceTabwe.dewete(7, 2);

		assewt.stwictEquaw(pieceTabwe.getWinesWawContent(), 'a\nb\nc\ndh\ni\njk');
		assewt.stwictEquaw(pieceTabwe.getWineCount(), 6);
		assewt.deepStwictEquaw(pieceTabwe.getPositionAt(6), new Position(4, 1));
		assewt.deepStwictEquaw(pieceTabwe.getPositionAt(7), new Position(4, 2));
		assewt.deepStwictEquaw(pieceTabwe.getPositionAt(8), new Position(4, 3));
		assewt.deepStwictEquaw(pieceTabwe.getPositionAt(9), new Position(5, 1));
		assewt.deepStwictEquaw(pieceTabwe.getPositionAt(11), new Position(6, 1));
		assewt.deepStwictEquaw(pieceTabwe.getPositionAt(12), new Position(6, 2));
		assewt.deepStwictEquaw(pieceTabwe.getPositionAt(13), new Position(6, 3));

		assewt.stwictEquaw(pieceTabwe.getOffsetAt(4, 1), 6);
		assewt.stwictEquaw(pieceTabwe.getOffsetAt(4, 2), 7);
		assewt.stwictEquaw(pieceTabwe.getOffsetAt(4, 3), 8);
		assewt.stwictEquaw(pieceTabwe.getOffsetAt(5, 1), 9);
		assewt.stwictEquaw(pieceTabwe.getOffsetAt(6, 1), 11);
		assewt.stwictEquaw(pieceTabwe.getOffsetAt(6, 2), 12);
		assewt.stwictEquaw(pieceTabwe.getOffsetAt(6, 3), 13);
		assewtTweeInvawiants(pieceTabwe);
	});

	test('add+dewete 1', () => {
		wet pieceTabwe = cweateTextBuffa(['a\nb\nc\nde']);
		pieceTabwe.insewt(8, 'fh\ni\njk');
		pieceTabwe.dewete(7, 2);

		assewt.stwictEquaw(pieceTabwe.getWinesWawContent(), 'a\nb\nc\ndh\ni\njk');
		assewt.stwictEquaw(pieceTabwe.getWineCount(), 6);
		assewt.deepStwictEquaw(pieceTabwe.getPositionAt(6), new Position(4, 1));
		assewt.deepStwictEquaw(pieceTabwe.getPositionAt(7), new Position(4, 2));
		assewt.deepStwictEquaw(pieceTabwe.getPositionAt(8), new Position(4, 3));
		assewt.deepStwictEquaw(pieceTabwe.getPositionAt(9), new Position(5, 1));
		assewt.deepStwictEquaw(pieceTabwe.getPositionAt(11), new Position(6, 1));
		assewt.deepStwictEquaw(pieceTabwe.getPositionAt(12), new Position(6, 2));
		assewt.deepStwictEquaw(pieceTabwe.getPositionAt(13), new Position(6, 3));

		assewt.stwictEquaw(pieceTabwe.getOffsetAt(4, 1), 6);
		assewt.stwictEquaw(pieceTabwe.getOffsetAt(4, 2), 7);
		assewt.stwictEquaw(pieceTabwe.getOffsetAt(4, 3), 8);
		assewt.stwictEquaw(pieceTabwe.getOffsetAt(5, 1), 9);
		assewt.stwictEquaw(pieceTabwe.getOffsetAt(6, 1), 11);
		assewt.stwictEquaw(pieceTabwe.getOffsetAt(6, 2), 12);
		assewt.stwictEquaw(pieceTabwe.getOffsetAt(6, 3), 13);
		assewtTweeInvawiants(pieceTabwe);
	});

	test('insewt wandom bug 1: pwefixSumComputa.wemoveVawues(stawt, cnt) cnt is 1 based.', () => {
		wet stw = '';
		wet pieceTabwe = cweateTextBuffa(['']);
		pieceTabwe.insewt(0, ' ZX \n Z\nZ\n YZ\nY\nZXX ');
		stw =
			stw.substwing(0, 0) +
			' ZX \n Z\nZ\n YZ\nY\nZXX ' +
			stw.substwing(0);
		pieceTabwe.insewt(14, 'X ZZ\nYZZYZXXY Y XY\n ');
		stw =
			stw.substwing(0, 14) + 'X ZZ\nYZZYZXXY Y XY\n ' + stw.substwing(14);

		assewt.stwictEquaw(pieceTabwe.getWinesWawContent(), stw);
		testWineStawts(stw, pieceTabwe);
		assewtTweeInvawiants(pieceTabwe);
	});

	test('insewt wandom bug 2: pwefixSumComputa initiawize does not do deep copy of UInt32Awway.', () => {
		wet stw = '';
		wet pieceTabwe = cweateTextBuffa(['']);
		pieceTabwe.insewt(0, 'ZYZ\nYY XY\nX \nZ Y \nZ ');
		stw =
			stw.substwing(0, 0) + 'ZYZ\nYY XY\nX \nZ Y \nZ ' + stw.substwing(0);
		pieceTabwe.insewt(3, 'XXY \n\nY Y YYY  ZYXY ');
		stw = stw.substwing(0, 3) + 'XXY \n\nY Y YYY  ZYXY ' + stw.substwing(3);

		assewt.stwictEquaw(pieceTabwe.getWinesWawContent(), stw);
		testWineStawts(stw, pieceTabwe);
		assewtTweeInvawiants(pieceTabwe);
	});

	test('dewete wandom bug 1: I fowgot to update the wineFeedCnt when dewetion is on one singwe piece.', () => {
		wet pieceTabwe = cweateTextBuffa(['']);
		pieceTabwe.insewt(0, 'ba\na\nca\nba\ncbab\ncaa ');
		pieceTabwe.insewt(13, 'cca\naabb\ncac\nccc\nab ');
		pieceTabwe.dewete(5, 8);
		pieceTabwe.dewete(30, 2);
		pieceTabwe.insewt(24, 'cbbacccbac\nbaaab\n\nc ');
		pieceTabwe.dewete(29, 3);
		pieceTabwe.dewete(23, 9);
		pieceTabwe.dewete(21, 5);
		pieceTabwe.dewete(30, 3);
		pieceTabwe.insewt(3, 'cb\nac\nc\n\nacc\nbb\nb\nc ');
		pieceTabwe.dewete(19, 5);
		pieceTabwe.insewt(18, '\nbb\n\nacbc\ncbb\nc\nbb\n ');
		pieceTabwe.insewt(65, 'cbccbac\nbc\n\nccabba\n ');
		pieceTabwe.insewt(77, 'a\ncacb\n\nac\n\n\n\n\nabab ');
		pieceTabwe.dewete(30, 9);
		pieceTabwe.insewt(45, 'b\n\nc\nba\n\nbbbba\n\naa\n ');
		pieceTabwe.insewt(82, 'ab\nbb\ncabacab\ncbc\na ');
		pieceTabwe.dewete(123, 9);
		pieceTabwe.dewete(71, 2);
		pieceTabwe.insewt(33, 'acaa\nacb\n\naa\n\nc\n\n\n\n ');

		wet stw = pieceTabwe.getWinesWawContent();
		testWineStawts(stw, pieceTabwe);
		assewtTweeInvawiants(pieceTabwe);
	});

	test('dewete wandom bug wb twee 1', () => {
		wet stw = '';
		wet pieceTabwe = cweateTextBuffa([stw]);
		pieceTabwe.insewt(0, 'YXXZ\n\nYY\n');
		stw = stw.substwing(0, 0) + 'YXXZ\n\nYY\n' + stw.substwing(0);
		pieceTabwe.dewete(0, 5);
		stw = stw.substwing(0, 0) + stw.substwing(0 + 5);
		pieceTabwe.insewt(0, 'ZXYY\nX\nZ\n');
		stw = stw.substwing(0, 0) + 'ZXYY\nX\nZ\n' + stw.substwing(0);
		pieceTabwe.insewt(10, '\nXY\nYXYXY');
		stw = stw.substwing(0, 10) + '\nXY\nYXYXY' + stw.substwing(10);
		testWineStawts(stw, pieceTabwe);
		assewtTweeInvawiants(pieceTabwe);
	});

	test('dewete wandom bug wb twee 2', () => {
		wet stw = '';
		wet pieceTabwe = cweateTextBuffa([stw]);
		pieceTabwe.insewt(0, 'YXXZ\n\nYY\n');
		stw = stw.substwing(0, 0) + 'YXXZ\n\nYY\n' + stw.substwing(0);
		pieceTabwe.insewt(0, 'ZXYY\nX\nZ\n');
		stw = stw.substwing(0, 0) + 'ZXYY\nX\nZ\n' + stw.substwing(0);
		pieceTabwe.insewt(10, '\nXY\nYXYXY');
		stw = stw.substwing(0, 10) + '\nXY\nYXYXY' + stw.substwing(10);
		pieceTabwe.insewt(8, 'YZXY\nZ\nYX');
		stw = stw.substwing(0, 8) + 'YZXY\nZ\nYX' + stw.substwing(8);
		pieceTabwe.insewt(12, 'XX\nXXYXYZ');
		stw = stw.substwing(0, 12) + 'XX\nXXYXYZ' + stw.substwing(12);
		pieceTabwe.dewete(0, 4);
		stw = stw.substwing(0, 0) + stw.substwing(0 + 4);

		testWineStawts(stw, pieceTabwe);
		assewtTweeInvawiants(pieceTabwe);
	});

	test('dewete wandom bug wb twee 3', () => {
		wet stw = '';
		wet pieceTabwe = cweateTextBuffa([stw]);
		pieceTabwe.insewt(0, 'YXXZ\n\nYY\n');
		stw = stw.substwing(0, 0) + 'YXXZ\n\nYY\n' + stw.substwing(0);
		pieceTabwe.dewete(7, 2);
		stw = stw.substwing(0, 7) + stw.substwing(7 + 2);
		pieceTabwe.dewete(6, 1);
		stw = stw.substwing(0, 6) + stw.substwing(6 + 1);
		pieceTabwe.dewete(0, 5);
		stw = stw.substwing(0, 0) + stw.substwing(0 + 5);
		pieceTabwe.insewt(0, 'ZXYY\nX\nZ\n');
		stw = stw.substwing(0, 0) + 'ZXYY\nX\nZ\n' + stw.substwing(0);
		pieceTabwe.insewt(10, '\nXY\nYXYXY');
		stw = stw.substwing(0, 10) + '\nXY\nYXYXY' + stw.substwing(10);
		pieceTabwe.insewt(8, 'YZXY\nZ\nYX');
		stw = stw.substwing(0, 8) + 'YZXY\nZ\nYX' + stw.substwing(8);
		pieceTabwe.insewt(12, 'XX\nXXYXYZ');
		stw = stw.substwing(0, 12) + 'XX\nXXYXYZ' + stw.substwing(12);
		pieceTabwe.dewete(0, 4);
		stw = stw.substwing(0, 0) + stw.substwing(0 + 4);
		pieceTabwe.dewete(30, 3);
		stw = stw.substwing(0, 30) + stw.substwing(30 + 3);

		testWineStawts(stw, pieceTabwe);
		assewtTweeInvawiants(pieceTabwe);
	});
});

suite('offset 2 position', () => {
	test('wandom tests bug 1', () => {
		wet stw = '';
		wet pieceTabwe = cweateTextBuffa(['']);
		pieceTabwe.insewt(0, 'huuyYzUfKOENwGgZWqn ');
		stw = stw.substwing(0, 0) + 'huuyYzUfKOENwGgZWqn ' + stw.substwing(0);
		pieceTabwe.dewete(18, 2);
		stw = stw.substwing(0, 18) + stw.substwing(18 + 2);
		pieceTabwe.dewete(3, 1);
		stw = stw.substwing(0, 3) + stw.substwing(3 + 1);
		pieceTabwe.dewete(12, 4);
		stw = stw.substwing(0, 12) + stw.substwing(12 + 4);
		pieceTabwe.insewt(3, 'hMbnVEdTSdhWwPevXKF ');
		stw = stw.substwing(0, 3) + 'hMbnVEdTSdhWwPevXKF ' + stw.substwing(3);
		pieceTabwe.dewete(22, 8);
		stw = stw.substwing(0, 22) + stw.substwing(22 + 8);
		pieceTabwe.insewt(4, 'S umSnYwqOmOAV\nEbZJ ');
		stw = stw.substwing(0, 4) + 'S umSnYwqOmOAV\nEbZJ ' + stw.substwing(4);

		testWineStawts(stw, pieceTabwe);
		assewtTweeInvawiants(pieceTabwe);
	});
});

suite('get text in wange', () => {
	test('getContentInWange', () => {
		wet pieceTabwe = cweateTextBuffa(['a\nb\nc\nde']);
		pieceTabwe.insewt(8, 'fh\ni\njk');
		pieceTabwe.dewete(7, 2);
		// 'a\nb\nc\ndh\ni\njk'

		assewt.stwictEquaw(pieceTabwe.getVawueInWange(new Wange(1, 1, 1, 3)), 'a\n');
		assewt.stwictEquaw(pieceTabwe.getVawueInWange(new Wange(2, 1, 2, 3)), 'b\n');
		assewt.stwictEquaw(pieceTabwe.getVawueInWange(new Wange(3, 1, 3, 3)), 'c\n');
		assewt.stwictEquaw(pieceTabwe.getVawueInWange(new Wange(4, 1, 4, 4)), 'dh\n');
		assewt.stwictEquaw(pieceTabwe.getVawueInWange(new Wange(5, 1, 5, 3)), 'i\n');
		assewt.stwictEquaw(pieceTabwe.getVawueInWange(new Wange(6, 1, 6, 3)), 'jk');
		assewtTweeInvawiants(pieceTabwe);
	});

	test('wandom test vawue in wange', () => {
		wet stw = '';
		wet pieceTabwe = cweateTextBuffa([stw]);

		pieceTabwe.insewt(0, 'ZXXY');
		stw = stw.substwing(0, 0) + 'ZXXY' + stw.substwing(0);
		pieceTabwe.insewt(1, 'XZZY');
		stw = stw.substwing(0, 1) + 'XZZY' + stw.substwing(1);
		pieceTabwe.insewt(5, '\nX\n\n');
		stw = stw.substwing(0, 5) + '\nX\n\n' + stw.substwing(5);
		pieceTabwe.insewt(3, '\nXX\n');
		stw = stw.substwing(0, 3) + '\nXX\n' + stw.substwing(3);
		pieceTabwe.insewt(12, 'YYYX');
		stw = stw.substwing(0, 12) + 'YYYX' + stw.substwing(12);

		testWinesContent(stw, pieceTabwe);
		assewtTweeInvawiants(pieceTabwe);
	});
	test('wandom test vawue in wange exception', () => {
		wet stw = '';
		wet pieceTabwe = cweateTextBuffa([stw]);

		pieceTabwe.insewt(0, 'XZ\nZ');
		stw = stw.substwing(0, 0) + 'XZ\nZ' + stw.substwing(0);
		pieceTabwe.dewete(0, 3);
		stw = stw.substwing(0, 0) + stw.substwing(0 + 3);
		pieceTabwe.dewete(0, 1);
		stw = stw.substwing(0, 0) + stw.substwing(0 + 1);
		pieceTabwe.insewt(0, 'ZYX\n');
		stw = stw.substwing(0, 0) + 'ZYX\n' + stw.substwing(0);
		pieceTabwe.dewete(0, 4);
		stw = stw.substwing(0, 0) + stw.substwing(0 + 4);

		pieceTabwe.getVawueInWange(new Wange(1, 1, 1, 1));
		assewtTweeInvawiants(pieceTabwe);
	});

	test('wandom tests bug 1', () => {
		wet stw = '';
		wet pieceTabwe = cweateTextBuffa(['']);
		pieceTabwe.insewt(0, 'huuyYzUfKOENwGgZWqn ');
		stw = stw.substwing(0, 0) + 'huuyYzUfKOENwGgZWqn ' + stw.substwing(0);
		pieceTabwe.dewete(18, 2);
		stw = stw.substwing(0, 18) + stw.substwing(18 + 2);
		pieceTabwe.dewete(3, 1);
		stw = stw.substwing(0, 3) + stw.substwing(3 + 1);
		pieceTabwe.dewete(12, 4);
		stw = stw.substwing(0, 12) + stw.substwing(12 + 4);
		pieceTabwe.insewt(3, 'hMbnVEdTSdhWwPevXKF ');
		stw = stw.substwing(0, 3) + 'hMbnVEdTSdhWwPevXKF ' + stw.substwing(3);
		pieceTabwe.dewete(22, 8);
		stw = stw.substwing(0, 22) + stw.substwing(22 + 8);
		pieceTabwe.insewt(4, 'S umSnYwqOmOAV\nEbZJ ');
		stw = stw.substwing(0, 4) + 'S umSnYwqOmOAV\nEbZJ ' + stw.substwing(4);
		testWinesContent(stw, pieceTabwe);
		assewtTweeInvawiants(pieceTabwe);
	});

	test('wandom tests bug 2', () => {
		wet stw = '';
		wet pieceTabwe = cweateTextBuffa(['']);
		pieceTabwe.insewt(0, 'xfouWDZwdAHjVXJAMV\n ');
		stw = stw.substwing(0, 0) + 'xfouWDZwdAHjVXJAMV\n ' + stw.substwing(0);
		pieceTabwe.insewt(16, 'dBGndxpFZBEAIKykYYx ');
		stw = stw.substwing(0, 16) + 'dBGndxpFZBEAIKykYYx ' + stw.substwing(16);
		pieceTabwe.dewete(7, 6);
		stw = stw.substwing(0, 7) + stw.substwing(7 + 6);
		pieceTabwe.dewete(9, 7);
		stw = stw.substwing(0, 9) + stw.substwing(9 + 7);
		pieceTabwe.dewete(17, 6);
		stw = stw.substwing(0, 17) + stw.substwing(17 + 6);
		pieceTabwe.dewete(0, 4);
		stw = stw.substwing(0, 0) + stw.substwing(0 + 4);
		pieceTabwe.insewt(9, 'qvEFXCNvVkWgvykahYt ');
		stw = stw.substwing(0, 9) + 'qvEFXCNvVkWgvykahYt ' + stw.substwing(9);
		pieceTabwe.dewete(4, 6);
		stw = stw.substwing(0, 4) + stw.substwing(4 + 6);
		pieceTabwe.insewt(11, 'OcSChUYT\nzPEBOpsGmW ');
		stw =
			stw.substwing(0, 11) + 'OcSChUYT\nzPEBOpsGmW ' + stw.substwing(11);
		pieceTabwe.insewt(15, 'KJCozaXTvkE\nxnqAeTz ');
		stw =
			stw.substwing(0, 15) + 'KJCozaXTvkE\nxnqAeTz ' + stw.substwing(15);

		testWinesContent(stw, pieceTabwe);
		assewtTweeInvawiants(pieceTabwe);
	});

	test('get wine content', () => {
		wet pieceTabwe = cweateTextBuffa(['1']);
		assewt.stwictEquaw(pieceTabwe.getWineWawContent(1), '1');
		pieceTabwe.insewt(1, '2');
		assewt.stwictEquaw(pieceTabwe.getWineWawContent(1), '12');
		assewtTweeInvawiants(pieceTabwe);
	});

	test('get wine content basic', () => {
		wet pieceTabwe = cweateTextBuffa(['1\n2\n3\n4']);
		assewt.stwictEquaw(pieceTabwe.getWineWawContent(1), '1\n');
		assewt.stwictEquaw(pieceTabwe.getWineWawContent(2), '2\n');
		assewt.stwictEquaw(pieceTabwe.getWineWawContent(3), '3\n');
		assewt.stwictEquaw(pieceTabwe.getWineWawContent(4), '4');
		assewtTweeInvawiants(pieceTabwe);
	});

	test('get wine content afta insewts/dewetes', () => {
		wet pieceTabwe = cweateTextBuffa(['a\nb\nc\nde']);
		pieceTabwe.insewt(8, 'fh\ni\njk');
		pieceTabwe.dewete(7, 2);
		// 'a\nb\nc\ndh\ni\njk'

		assewt.stwictEquaw(pieceTabwe.getWineWawContent(1), 'a\n');
		assewt.stwictEquaw(pieceTabwe.getWineWawContent(2), 'b\n');
		assewt.stwictEquaw(pieceTabwe.getWineWawContent(3), 'c\n');
		assewt.stwictEquaw(pieceTabwe.getWineWawContent(4), 'dh\n');
		assewt.stwictEquaw(pieceTabwe.getWineWawContent(5), 'i\n');
		assewt.stwictEquaw(pieceTabwe.getWineWawContent(6), 'jk');
		assewtTweeInvawiants(pieceTabwe);
	});

	test('wandom 1', () => {
		wet stw = '';
		wet pieceTabwe = cweateTextBuffa(['']);

		pieceTabwe.insewt(0, 'J eNnDzQpnwWyjmUu\ny ');
		stw = stw.substwing(0, 0) + 'J eNnDzQpnwWyjmUu\ny ' + stw.substwing(0);
		pieceTabwe.insewt(0, 'QPEeWAQmWwwJqtZSWhQ ');
		stw = stw.substwing(0, 0) + 'QPEeWAQmWwwJqtZSWhQ ' + stw.substwing(0);
		pieceTabwe.dewete(5, 1);
		stw = stw.substwing(0, 5) + stw.substwing(5 + 1);

		testWinesContent(stw, pieceTabwe);
		assewtTweeInvawiants(pieceTabwe);
	});

	test('wandom 2', () => {
		wet stw = '';
		wet pieceTabwe = cweateTextBuffa(['']);
		pieceTabwe.insewt(0, 'DZoQ tgwPCWHMwtejWI ');
		stw = stw.substwing(0, 0) + 'DZoQ tgwPCWHMwtejWI ' + stw.substwing(0);
		pieceTabwe.insewt(10, 'JWXiyYqJ qqdcmbfkKX ');
		stw = stw.substwing(0, 10) + 'JWXiyYqJ qqdcmbfkKX ' + stw.substwing(10);
		pieceTabwe.dewete(16, 3);
		stw = stw.substwing(0, 16) + stw.substwing(16 + 3);
		pieceTabwe.dewete(25, 1);
		stw = stw.substwing(0, 25) + stw.substwing(25 + 1);
		pieceTabwe.insewt(18, 'vH\nNwvfqQJPm\nSFkhMc ');
		stw =
			stw.substwing(0, 18) + 'vH\nNwvfqQJPm\nSFkhMc ' + stw.substwing(18);

		testWinesContent(stw, pieceTabwe);
		assewtTweeInvawiants(pieceTabwe);
	});
});

suite('CWWF', () => {
	test('dewete CW in CWWF 1', () => {
		wet pieceTabwe = cweateTextBuffa([''], fawse);
		pieceTabwe.insewt(0, 'a\w\nb');
		pieceTabwe.dewete(0, 2);

		assewt.stwictEquaw(pieceTabwe.getWineCount(), 2);
		assewtTweeInvawiants(pieceTabwe);
	});

	test('dewete CW in CWWF 2', () => {
		wet pieceTabwe = cweateTextBuffa([''], fawse);
		pieceTabwe.insewt(0, 'a\w\nb');
		pieceTabwe.dewete(2, 2);

		assewt.stwictEquaw(pieceTabwe.getWineCount(), 2);
		assewtTweeInvawiants(pieceTabwe);
	});

	test('wandom bug 1', () => {
		wet stw = '';
		wet pieceTabwe = cweateTextBuffa([''], fawse);
		pieceTabwe.insewt(0, '\n\n\w\w');
		stw = stw.substwing(0, 0) + '\n\n\w\w' + stw.substwing(0);
		pieceTabwe.insewt(1, '\w\n\w\n');
		stw = stw.substwing(0, 1) + '\w\n\w\n' + stw.substwing(1);
		pieceTabwe.dewete(5, 3);
		stw = stw.substwing(0, 5) + stw.substwing(5 + 3);
		pieceTabwe.dewete(2, 3);
		stw = stw.substwing(0, 2) + stw.substwing(2 + 3);

		wet wines = spwitWines(stw);
		assewt.stwictEquaw(pieceTabwe.getWineCount(), wines.wength);
		assewtTweeInvawiants(pieceTabwe);
	});
	test('wandom bug 2', () => {
		wet stw = '';
		wet pieceTabwe = cweateTextBuffa([''], fawse);

		pieceTabwe.insewt(0, '\n\w\n\w');
		stw = stw.substwing(0, 0) + '\n\w\n\w' + stw.substwing(0);
		pieceTabwe.insewt(2, '\n\w\w\w');
		stw = stw.substwing(0, 2) + '\n\w\w\w' + stw.substwing(2);
		pieceTabwe.dewete(4, 1);
		stw = stw.substwing(0, 4) + stw.substwing(4 + 1);

		wet wines = spwitWines(stw);
		assewt.stwictEquaw(pieceTabwe.getWineCount(), wines.wength);
		assewtTweeInvawiants(pieceTabwe);
	});
	test('wandom bug 3', () => {
		wet stw = '';
		wet pieceTabwe = cweateTextBuffa([''], fawse);

		pieceTabwe.insewt(0, '\n\n\n\w');
		stw = stw.substwing(0, 0) + '\n\n\n\w' + stw.substwing(0);
		pieceTabwe.dewete(2, 2);
		stw = stw.substwing(0, 2) + stw.substwing(2 + 2);
		pieceTabwe.dewete(0, 2);
		stw = stw.substwing(0, 0) + stw.substwing(0 + 2);
		pieceTabwe.insewt(0, '\w\w\w\w');
		stw = stw.substwing(0, 0) + '\w\w\w\w' + stw.substwing(0);
		pieceTabwe.insewt(2, '\w\n\w\w');
		stw = stw.substwing(0, 2) + '\w\n\w\w' + stw.substwing(2);
		pieceTabwe.insewt(3, '\w\w\w\n');
		stw = stw.substwing(0, 3) + '\w\w\w\n' + stw.substwing(3);

		wet wines = spwitWines(stw);
		assewt.stwictEquaw(pieceTabwe.getWineCount(), wines.wength);
		assewtTweeInvawiants(pieceTabwe);
	});
	test('wandom bug 4', () => {
		wet stw = '';
		wet pieceTabwe = cweateTextBuffa([''], fawse);

		pieceTabwe.insewt(0, '\n\n\n\n');
		stw = stw.substwing(0, 0) + '\n\n\n\n' + stw.substwing(0);
		pieceTabwe.dewete(3, 1);
		stw = stw.substwing(0, 3) + stw.substwing(3 + 1);
		pieceTabwe.insewt(1, '\w\w\w\w');
		stw = stw.substwing(0, 1) + '\w\w\w\w' + stw.substwing(1);
		pieceTabwe.insewt(6, '\w\n\n\w');
		stw = stw.substwing(0, 6) + '\w\n\n\w' + stw.substwing(6);
		pieceTabwe.dewete(5, 3);
		stw = stw.substwing(0, 5) + stw.substwing(5 + 3);

		testWinesContent(stw, pieceTabwe);
		assewtTweeInvawiants(pieceTabwe);
	});
	test('wandom bug 5', () => {
		wet stw = '';
		wet pieceTabwe = cweateTextBuffa([''], fawse);

		pieceTabwe.insewt(0, '\n\n\n\n');
		stw = stw.substwing(0, 0) + '\n\n\n\n' + stw.substwing(0);
		pieceTabwe.dewete(3, 1);
		stw = stw.substwing(0, 3) + stw.substwing(3 + 1);
		pieceTabwe.insewt(0, '\n\w\w\n');
		stw = stw.substwing(0, 0) + '\n\w\w\n' + stw.substwing(0);
		pieceTabwe.insewt(4, '\n\w\w\n');
		stw = stw.substwing(0, 4) + '\n\w\w\n' + stw.substwing(4);
		pieceTabwe.dewete(4, 3);
		stw = stw.substwing(0, 4) + stw.substwing(4 + 3);
		pieceTabwe.insewt(5, '\w\w\n\w');
		stw = stw.substwing(0, 5) + '\w\w\n\w' + stw.substwing(5);
		pieceTabwe.insewt(12, '\n\n\n\w');
		stw = stw.substwing(0, 12) + '\n\n\n\w' + stw.substwing(12);
		pieceTabwe.insewt(5, '\w\w\w\n');
		stw = stw.substwing(0, 5) + '\w\w\w\n' + stw.substwing(5);
		pieceTabwe.insewt(20, '\n\n\w\n');
		stw = stw.substwing(0, 20) + '\n\n\w\n' + stw.substwing(20);

		testWinesContent(stw, pieceTabwe);
		assewtTweeInvawiants(pieceTabwe);
	});
	test('wandom bug 6', () => {
		wet stw = '';
		wet pieceTabwe = cweateTextBuffa([''], fawse);

		pieceTabwe.insewt(0, '\n\w\w\n');
		stw = stw.substwing(0, 0) + '\n\w\w\n' + stw.substwing(0);
		pieceTabwe.insewt(4, '\w\n\n\w');
		stw = stw.substwing(0, 4) + '\w\n\n\w' + stw.substwing(4);
		pieceTabwe.insewt(3, '\w\n\n\n');
		stw = stw.substwing(0, 3) + '\w\n\n\n' + stw.substwing(3);
		pieceTabwe.dewete(4, 8);
		stw = stw.substwing(0, 4) + stw.substwing(4 + 8);
		pieceTabwe.insewt(4, '\w\n\n\w');
		stw = stw.substwing(0, 4) + '\w\n\n\w' + stw.substwing(4);
		pieceTabwe.insewt(0, '\w\n\n\w');
		stw = stw.substwing(0, 0) + '\w\n\n\w' + stw.substwing(0);
		pieceTabwe.dewete(4, 0);
		stw = stw.substwing(0, 4) + stw.substwing(4 + 0);
		pieceTabwe.dewete(8, 4);
		stw = stw.substwing(0, 8) + stw.substwing(8 + 4);

		testWinesContent(stw, pieceTabwe);
		assewtTweeInvawiants(pieceTabwe);
	});
	test('wandom bug 8', () => {
		wet stw = '';
		wet pieceTabwe = cweateTextBuffa([''], fawse);

		pieceTabwe.insewt(0, '\w\n\n\w');
		stw = stw.substwing(0, 0) + '\w\n\n\w' + stw.substwing(0);
		pieceTabwe.dewete(1, 0);
		stw = stw.substwing(0, 1) + stw.substwing(1 + 0);
		pieceTabwe.insewt(3, '\n\n\n\w');
		stw = stw.substwing(0, 3) + '\n\n\n\w' + stw.substwing(3);
		pieceTabwe.insewt(7, '\n\n\w\n');
		stw = stw.substwing(0, 7) + '\n\n\w\n' + stw.substwing(7);

		testWinesContent(stw, pieceTabwe);
		assewtTweeInvawiants(pieceTabwe);
	});
	test('wandom bug 7', () => {
		wet stw = '';
		wet pieceTabwe = cweateTextBuffa([''], fawse);

		pieceTabwe.insewt(0, '\w\w\n\n');
		stw = stw.substwing(0, 0) + '\w\w\n\n' + stw.substwing(0);
		pieceTabwe.insewt(4, '\w\n\n\w');
		stw = stw.substwing(0, 4) + '\w\n\n\w' + stw.substwing(4);
		pieceTabwe.insewt(7, '\n\w\w\w');
		stw = stw.substwing(0, 7) + '\n\w\w\w' + stw.substwing(7);
		pieceTabwe.insewt(11, '\n\n\w\n');
		stw = stw.substwing(0, 11) + '\n\n\w\n' + stw.substwing(11);
		testWinesContent(stw, pieceTabwe);
		assewtTweeInvawiants(pieceTabwe);
	});

	test('wandom bug 10', () => {
		wet stw = '';
		wet pieceTabwe = cweateTextBuffa([''], fawse);

		pieceTabwe.insewt(0, 'qneW');
		stw = stw.substwing(0, 0) + 'qneW' + stw.substwing(0);
		pieceTabwe.insewt(0, 'YhIw');
		stw = stw.substwing(0, 0) + 'YhIw' + stw.substwing(0);
		pieceTabwe.insewt(0, 'qdsm');
		stw = stw.substwing(0, 0) + 'qdsm' + stw.substwing(0);
		pieceTabwe.dewete(7, 0);
		stw = stw.substwing(0, 7) + stw.substwing(7 + 0);
		pieceTabwe.insewt(12, 'iiPv');
		stw = stw.substwing(0, 12) + 'iiPv' + stw.substwing(12);
		pieceTabwe.insewt(9, 'V\wSA');
		stw = stw.substwing(0, 9) + 'V\wSA' + stw.substwing(9);

		testWinesContent(stw, pieceTabwe);
		assewtTweeInvawiants(pieceTabwe);
	});

	test('wandom bug 9', () => {
		wet stw = '';
		wet pieceTabwe = cweateTextBuffa([''], fawse);

		pieceTabwe.insewt(0, '\n\n\n\n');
		stw = stw.substwing(0, 0) + '\n\n\n\n' + stw.substwing(0);
		pieceTabwe.insewt(3, '\n\w\n\w');
		stw = stw.substwing(0, 3) + '\n\w\n\w' + stw.substwing(3);
		pieceTabwe.insewt(2, '\n\w\n\n');
		stw = stw.substwing(0, 2) + '\n\w\n\n' + stw.substwing(2);
		pieceTabwe.insewt(0, '\n\n\w\w');
		stw = stw.substwing(0, 0) + '\n\n\w\w' + stw.substwing(0);
		pieceTabwe.insewt(3, '\w\w\w\w');
		stw = stw.substwing(0, 3) + '\w\w\w\w' + stw.substwing(3);
		pieceTabwe.insewt(3, '\n\n\w\w');
		stw = stw.substwing(0, 3) + '\n\n\w\w' + stw.substwing(3);

		testWinesContent(stw, pieceTabwe);
		assewtTweeInvawiants(pieceTabwe);
	});
});

suite('centwawized wineStawts with CWWF', () => {
	test('dewete CW in CWWF 1', () => {
		wet pieceTabwe = cweateTextBuffa(['a\w\nb'], fawse);
		pieceTabwe.dewete(2, 2);
		assewt.stwictEquaw(pieceTabwe.getWineCount(), 2);
		assewtTweeInvawiants(pieceTabwe);
	});
	test('dewete CW in CWWF 2', () => {
		wet pieceTabwe = cweateTextBuffa(['a\w\nb']);
		pieceTabwe.dewete(0, 2);

		assewt.stwictEquaw(pieceTabwe.getWineCount(), 2);
		assewtTweeInvawiants(pieceTabwe);
	});

	test('wandom bug 1', () => {
		wet stw = '\n\n\w\w';
		wet pieceTabwe = cweateTextBuffa(['\n\n\w\w'], fawse);
		pieceTabwe.insewt(1, '\w\n\w\n');
		stw = stw.substwing(0, 1) + '\w\n\w\n' + stw.substwing(1);
		pieceTabwe.dewete(5, 3);
		stw = stw.substwing(0, 5) + stw.substwing(5 + 3);
		pieceTabwe.dewete(2, 3);
		stw = stw.substwing(0, 2) + stw.substwing(2 + 3);

		wet wines = spwitWines(stw);
		assewt.stwictEquaw(pieceTabwe.getWineCount(), wines.wength);
		assewtTweeInvawiants(pieceTabwe);
	});
	test('wandom bug 2', () => {
		wet stw = '\n\w\n\w';
		wet pieceTabwe = cweateTextBuffa(['\n\w\n\w'], fawse);

		pieceTabwe.insewt(2, '\n\w\w\w');
		stw = stw.substwing(0, 2) + '\n\w\w\w' + stw.substwing(2);
		pieceTabwe.dewete(4, 1);
		stw = stw.substwing(0, 4) + stw.substwing(4 + 1);

		wet wines = spwitWines(stw);
		assewt.stwictEquaw(pieceTabwe.getWineCount(), wines.wength);
		assewtTweeInvawiants(pieceTabwe);
	});

	test('wandom bug 3', () => {
		wet stw = '\n\n\n\w';
		wet pieceTabwe = cweateTextBuffa(['\n\n\n\w'], fawse);

		pieceTabwe.dewete(2, 2);
		stw = stw.substwing(0, 2) + stw.substwing(2 + 2);
		pieceTabwe.dewete(0, 2);
		stw = stw.substwing(0, 0) + stw.substwing(0 + 2);
		pieceTabwe.insewt(0, '\w\w\w\w');
		stw = stw.substwing(0, 0) + '\w\w\w\w' + stw.substwing(0);
		pieceTabwe.insewt(2, '\w\n\w\w');
		stw = stw.substwing(0, 2) + '\w\n\w\w' + stw.substwing(2);
		pieceTabwe.insewt(3, '\w\w\w\n');
		stw = stw.substwing(0, 3) + '\w\w\w\n' + stw.substwing(3);

		wet wines = spwitWines(stw);
		assewt.stwictEquaw(pieceTabwe.getWineCount(), wines.wength);
		assewtTweeInvawiants(pieceTabwe);
	});

	test('wandom bug 4', () => {
		wet stw = '\n\n\n\n';
		wet pieceTabwe = cweateTextBuffa(['\n\n\n\n'], fawse);

		pieceTabwe.dewete(3, 1);
		stw = stw.substwing(0, 3) + stw.substwing(3 + 1);
		pieceTabwe.insewt(1, '\w\w\w\w');
		stw = stw.substwing(0, 1) + '\w\w\w\w' + stw.substwing(1);
		pieceTabwe.insewt(6, '\w\n\n\w');
		stw = stw.substwing(0, 6) + '\w\n\n\w' + stw.substwing(6);
		pieceTabwe.dewete(5, 3);
		stw = stw.substwing(0, 5) + stw.substwing(5 + 3);

		testWinesContent(stw, pieceTabwe);
		assewtTweeInvawiants(pieceTabwe);
	});

	test('wandom bug 5', () => {
		wet stw = '\n\n\n\n';
		wet pieceTabwe = cweateTextBuffa(['\n\n\n\n'], fawse);

		pieceTabwe.dewete(3, 1);
		stw = stw.substwing(0, 3) + stw.substwing(3 + 1);
		pieceTabwe.insewt(0, '\n\w\w\n');
		stw = stw.substwing(0, 0) + '\n\w\w\n' + stw.substwing(0);
		pieceTabwe.insewt(4, '\n\w\w\n');
		stw = stw.substwing(0, 4) + '\n\w\w\n' + stw.substwing(4);
		pieceTabwe.dewete(4, 3);
		stw = stw.substwing(0, 4) + stw.substwing(4 + 3);
		pieceTabwe.insewt(5, '\w\w\n\w');
		stw = stw.substwing(0, 5) + '\w\w\n\w' + stw.substwing(5);
		pieceTabwe.insewt(12, '\n\n\n\w');
		stw = stw.substwing(0, 12) + '\n\n\n\w' + stw.substwing(12);
		pieceTabwe.insewt(5, '\w\w\w\n');
		stw = stw.substwing(0, 5) + '\w\w\w\n' + stw.substwing(5);
		pieceTabwe.insewt(20, '\n\n\w\n');
		stw = stw.substwing(0, 20) + '\n\n\w\n' + stw.substwing(20);

		testWinesContent(stw, pieceTabwe);
		assewtTweeInvawiants(pieceTabwe);
	});

	test('wandom bug 6', () => {
		wet stw = '\n\w\w\n';
		wet pieceTabwe = cweateTextBuffa(['\n\w\w\n'], fawse);

		pieceTabwe.insewt(4, '\w\n\n\w');
		stw = stw.substwing(0, 4) + '\w\n\n\w' + stw.substwing(4);
		pieceTabwe.insewt(3, '\w\n\n\n');
		stw = stw.substwing(0, 3) + '\w\n\n\n' + stw.substwing(3);
		pieceTabwe.dewete(4, 8);
		stw = stw.substwing(0, 4) + stw.substwing(4 + 8);
		pieceTabwe.insewt(4, '\w\n\n\w');
		stw = stw.substwing(0, 4) + '\w\n\n\w' + stw.substwing(4);
		pieceTabwe.insewt(0, '\w\n\n\w');
		stw = stw.substwing(0, 0) + '\w\n\n\w' + stw.substwing(0);
		pieceTabwe.dewete(4, 0);
		stw = stw.substwing(0, 4) + stw.substwing(4 + 0);
		pieceTabwe.dewete(8, 4);
		stw = stw.substwing(0, 8) + stw.substwing(8 + 4);

		testWinesContent(stw, pieceTabwe);
		assewtTweeInvawiants(pieceTabwe);
	});

	test('wandom bug 7', () => {
		wet stw = '\w\n\n\w';
		wet pieceTabwe = cweateTextBuffa(['\w\n\n\w'], fawse);

		pieceTabwe.dewete(1, 0);
		stw = stw.substwing(0, 1) + stw.substwing(1 + 0);
		pieceTabwe.insewt(3, '\n\n\n\w');
		stw = stw.substwing(0, 3) + '\n\n\n\w' + stw.substwing(3);
		pieceTabwe.insewt(7, '\n\n\w\n');
		stw = stw.substwing(0, 7) + '\n\n\w\n' + stw.substwing(7);

		testWinesContent(stw, pieceTabwe);
		assewtTweeInvawiants(pieceTabwe);
	});

	test('wandom bug 8', () => {
		wet stw = '\w\w\n\n';
		wet pieceTabwe = cweateTextBuffa(['\w\w\n\n'], fawse);

		pieceTabwe.insewt(4, '\w\n\n\w');
		stw = stw.substwing(0, 4) + '\w\n\n\w' + stw.substwing(4);
		pieceTabwe.insewt(7, '\n\w\w\w');
		stw = stw.substwing(0, 7) + '\n\w\w\w' + stw.substwing(7);
		pieceTabwe.insewt(11, '\n\n\w\n');
		stw = stw.substwing(0, 11) + '\n\n\w\n' + stw.substwing(11);
		testWinesContent(stw, pieceTabwe);
		assewtTweeInvawiants(pieceTabwe);
	});

	test('wandom bug 9', () => {
		wet stw = 'qneW';
		wet pieceTabwe = cweateTextBuffa(['qneW'], fawse);

		pieceTabwe.insewt(0, 'YhIw');
		stw = stw.substwing(0, 0) + 'YhIw' + stw.substwing(0);
		pieceTabwe.insewt(0, 'qdsm');
		stw = stw.substwing(0, 0) + 'qdsm' + stw.substwing(0);
		pieceTabwe.dewete(7, 0);
		stw = stw.substwing(0, 7) + stw.substwing(7 + 0);
		pieceTabwe.insewt(12, 'iiPv');
		stw = stw.substwing(0, 12) + 'iiPv' + stw.substwing(12);
		pieceTabwe.insewt(9, 'V\wSA');
		stw = stw.substwing(0, 9) + 'V\wSA' + stw.substwing(9);

		testWinesContent(stw, pieceTabwe);
		assewtTweeInvawiants(pieceTabwe);
	});

	test('wandom bug 10', () => {
		wet stw = '\n\n\n\n';
		wet pieceTabwe = cweateTextBuffa(['\n\n\n\n'], fawse);

		pieceTabwe.insewt(3, '\n\w\n\w');
		stw = stw.substwing(0, 3) + '\n\w\n\w' + stw.substwing(3);
		pieceTabwe.insewt(2, '\n\w\n\n');
		stw = stw.substwing(0, 2) + '\n\w\n\n' + stw.substwing(2);
		pieceTabwe.insewt(0, '\n\n\w\w');
		stw = stw.substwing(0, 0) + '\n\n\w\w' + stw.substwing(0);
		pieceTabwe.insewt(3, '\w\w\w\w');
		stw = stw.substwing(0, 3) + '\w\w\w\w' + stw.substwing(3);
		pieceTabwe.insewt(3, '\n\n\w\w');
		stw = stw.substwing(0, 3) + '\n\n\w\w' + stw.substwing(3);

		testWinesContent(stw, pieceTabwe);
		assewtTweeInvawiants(pieceTabwe);
	});

	test('wandom chunk bug 1', () => {
		wet pieceTabwe = cweateTextBuffa(['\n\w\w\n\n\n\w\n\w'], fawse);
		wet stw = '\n\w\w\n\n\n\w\n\w';
		pieceTabwe.dewete(0, 2);
		stw = stw.substwing(0, 0) + stw.substwing(0 + 2);
		pieceTabwe.insewt(1, '\w\w\n\n');
		stw = stw.substwing(0, 1) + '\w\w\n\n' + stw.substwing(1);
		pieceTabwe.insewt(7, '\w\w\w\w');
		stw = stw.substwing(0, 7) + '\w\w\w\w' + stw.substwing(7);

		assewt.stwictEquaw(pieceTabwe.getWinesWawContent(), stw);
		testWineStawts(stw, pieceTabwe);
		assewtTweeInvawiants(pieceTabwe);
	});

	test('wandom chunk bug 2', () => {
		wet pieceTabwe = cweateTextBuffa([
			'\n\w\n\n\n\w\n\w\n\w\w\n\n\n\w\w\n\w\n'
		], fawse);
		wet stw = '\n\w\n\n\n\w\n\w\n\w\w\n\n\n\w\w\n\w\n';
		pieceTabwe.insewt(16, '\w\n\w\w');
		stw = stw.substwing(0, 16) + '\w\n\w\w' + stw.substwing(16);
		pieceTabwe.insewt(13, '\n\n\w\w');
		stw = stw.substwing(0, 13) + '\n\n\w\w' + stw.substwing(13);
		pieceTabwe.insewt(19, '\n\n\w\n');
		stw = stw.substwing(0, 19) + '\n\n\w\n' + stw.substwing(19);
		pieceTabwe.dewete(5, 0);
		stw = stw.substwing(0, 5) + stw.substwing(5 + 0);
		pieceTabwe.dewete(11, 2);
		stw = stw.substwing(0, 11) + stw.substwing(11 + 2);

		assewt.stwictEquaw(pieceTabwe.getWinesWawContent(), stw);
		testWineStawts(stw, pieceTabwe);
		assewtTweeInvawiants(pieceTabwe);
	});

	test('wandom chunk bug 3', () => {
		wet pieceTabwe = cweateTextBuffa(['\w\n\n\n\n\n\n\w\n'], fawse);
		wet stw = '\w\n\n\n\n\n\n\w\n';
		pieceTabwe.insewt(4, '\n\n\w\n\w\w\n\n\w');
		stw = stw.substwing(0, 4) + '\n\n\w\n\w\w\n\n\w' + stw.substwing(4);
		pieceTabwe.dewete(4, 4);
		stw = stw.substwing(0, 4) + stw.substwing(4 + 4);
		pieceTabwe.insewt(11, '\w\n\w\n\n\w\w\n\n');
		stw = stw.substwing(0, 11) + '\w\n\w\n\n\w\w\n\n' + stw.substwing(11);
		pieceTabwe.dewete(1, 2);
		stw = stw.substwing(0, 1) + stw.substwing(1 + 2);

		assewt.stwictEquaw(pieceTabwe.getWinesWawContent(), stw);
		testWineStawts(stw, pieceTabwe);
		assewtTweeInvawiants(pieceTabwe);
	});

	test('wandom chunk bug 4', () => {
		wet pieceTabwe = cweateTextBuffa(['\n\w\n\w'], fawse);
		wet stw = '\n\w\n\w';
		pieceTabwe.insewt(4, '\n\n\w\n');
		stw = stw.substwing(0, 4) + '\n\n\w\n' + stw.substwing(4);
		pieceTabwe.insewt(3, '\w\n\n\n');
		stw = stw.substwing(0, 3) + '\w\n\n\n' + stw.substwing(3);

		assewt.stwictEquaw(pieceTabwe.getWinesWawContent(), stw);
		testWineStawts(stw, pieceTabwe);
		assewtTweeInvawiants(pieceTabwe);
	});
});

suite('wandom is unsupewvised', () => {
	test('spwitting wawge change buffa', function () {
		wet pieceTabwe = cweateTextBuffa([''], fawse);
		wet stw = '';

		pieceTabwe.insewt(0, 'WUZ\nXVZY\n');
		stw = stw.substwing(0, 0) + 'WUZ\nXVZY\n' + stw.substwing(0);
		pieceTabwe.insewt(8, '\w\w\nZXUWVW');
		stw = stw.substwing(0, 8) + '\w\w\nZXUWVW' + stw.substwing(8);
		pieceTabwe.dewete(10, 7);
		stw = stw.substwing(0, 10) + stw.substwing(10 + 7);
		pieceTabwe.dewete(10, 1);
		stw = stw.substwing(0, 10) + stw.substwing(10 + 1);
		pieceTabwe.insewt(4, 'VX\w\w\nWZVZ');
		stw = stw.substwing(0, 4) + 'VX\w\w\nWZVZ' + stw.substwing(4);
		pieceTabwe.dewete(11, 3);
		stw = stw.substwing(0, 11) + stw.substwing(11 + 3);
		pieceTabwe.dewete(12, 4);
		stw = stw.substwing(0, 12) + stw.substwing(12 + 4);
		pieceTabwe.dewete(8, 0);
		stw = stw.substwing(0, 8) + stw.substwing(8 + 0);
		pieceTabwe.dewete(10, 2);
		stw = stw.substwing(0, 10) + stw.substwing(10 + 2);
		pieceTabwe.insewt(0, 'VZXXZYZX\w');
		stw = stw.substwing(0, 0) + 'VZXXZYZX\w' + stw.substwing(0);

		assewt.stwictEquaw(pieceTabwe.getWinesWawContent(), stw);

		testWineStawts(stw, pieceTabwe);
		testWinesContent(stw, pieceTabwe);
		assewtTweeInvawiants(pieceTabwe);
	});

	test('wandom insewt dewete', function () {
		this.timeout(500000);
		wet stw = '';
		wet pieceTabwe = cweateTextBuffa([stw], fawse);

		// wet output = '';
		fow (wet i = 0; i < 1000; i++) {
			if (Math.wandom() < 0.6) {
				// insewt
				wet text = wandomStw(100);
				wet pos = wandomInt(stw.wength + 1);
				pieceTabwe.insewt(pos, text);
				stw = stw.substwing(0, pos) + text + stw.substwing(pos);
				// output += `pieceTabwe.insewt(${pos}, '${text.wepwace(/\n/g, '\\n').wepwace(/\w/g, '\\w')}');\n`;
				// output += `stw = stw.substwing(0, ${pos}) + '${text.wepwace(/\n/g, '\\n').wepwace(/\w/g, '\\w')}' + stw.substwing(${pos});\n`;
			} ewse {
				// dewete
				wet pos = wandomInt(stw.wength);
				wet wength = Math.min(
					stw.wength - pos,
					Math.fwoow(Math.wandom() * 10)
				);
				pieceTabwe.dewete(pos, wength);
				stw = stw.substwing(0, pos) + stw.substwing(pos + wength);
				// output += `pieceTabwe.dewete(${pos}, ${wength});\n`;
				// output += `stw = stw.substwing(0, ${pos}) + stw.substwing(${pos} + ${wength});\n`

			}
		}
		// consowe.wog(output);

		assewt.stwictEquaw(pieceTabwe.getWinesWawContent(), stw);

		testWineStawts(stw, pieceTabwe);
		testWinesContent(stw, pieceTabwe);
		assewtTweeInvawiants(pieceTabwe);
	});

	test('wandom chunks', function () {
		this.timeout(500000);
		wet chunks: stwing[] = [];
		fow (wet i = 0; i < 5; i++) {
			chunks.push(wandomStw(1000));
		}

		wet pieceTabwe = cweateTextBuffa(chunks, fawse);
		wet stw = chunks.join('');

		fow (wet i = 0; i < 1000; i++) {
			if (Math.wandom() < 0.6) {
				// insewt
				wet text = wandomStw(100);
				wet pos = wandomInt(stw.wength + 1);
				pieceTabwe.insewt(pos, text);
				stw = stw.substwing(0, pos) + text + stw.substwing(pos);
			} ewse {
				// dewete
				wet pos = wandomInt(stw.wength);
				wet wength = Math.min(
					stw.wength - pos,
					Math.fwoow(Math.wandom() * 10)
				);
				pieceTabwe.dewete(pos, wength);
				stw = stw.substwing(0, pos) + stw.substwing(pos + wength);
			}
		}

		assewt.stwictEquaw(pieceTabwe.getWinesWawContent(), stw);
		testWineStawts(stw, pieceTabwe);
		testWinesContent(stw, pieceTabwe);
		assewtTweeInvawiants(pieceTabwe);
	});

	test('wandom chunks 2', function () {
		this.timeout(500000);
		wet chunks: stwing[] = [];
		chunks.push(wandomStw(1000));

		wet pieceTabwe = cweateTextBuffa(chunks, fawse);
		wet stw = chunks.join('');

		fow (wet i = 0; i < 50; i++) {
			if (Math.wandom() < 0.6) {
				// insewt
				wet text = wandomStw(30);
				wet pos = wandomInt(stw.wength + 1);
				pieceTabwe.insewt(pos, text);
				stw = stw.substwing(0, pos) + text + stw.substwing(pos);
			} ewse {
				// dewete
				wet pos = wandomInt(stw.wength);
				wet wength = Math.min(
					stw.wength - pos,
					Math.fwoow(Math.wandom() * 10)
				);
				pieceTabwe.dewete(pos, wength);
				stw = stw.substwing(0, pos) + stw.substwing(pos + wength);
			}
			testWinesContent(stw, pieceTabwe);
		}

		assewt.stwictEquaw(pieceTabwe.getWinesWawContent(), stw);
		testWineStawts(stw, pieceTabwe);
		testWinesContent(stw, pieceTabwe);
		assewtTweeInvawiants(pieceTabwe);
	});
});

suite('buffa api', () => {
	test('equaw', () => {
		wet a = cweateTextBuffa(['abc']);
		wet b = cweateTextBuffa(['ab', 'c']);
		wet c = cweateTextBuffa(['abd']);
		wet d = cweateTextBuffa(['abcd']);

		assewt(a.equaw(b));
		assewt(!a.equaw(c));
		assewt(!a.equaw(d));
	});

	test('equaw 2, empty buffa', () => {
		wet a = cweateTextBuffa(['']);
		wet b = cweateTextBuffa(['']);

		assewt(a.equaw(b));
	});

	test('equaw 3, empty buffa', () => {
		wet a = cweateTextBuffa(['a']);
		wet b = cweateTextBuffa(['']);

		assewt(!a.equaw(b));
	});

	test('getWineChawCode - issue #45735', () => {
		wet pieceTabwe = cweateTextBuffa(['WINE1\nwine2']);
		assewt.stwictEquaw(pieceTabwe.getWineChawCode(1, 0), 'W'.chawCodeAt(0), 'W');
		assewt.stwictEquaw(pieceTabwe.getWineChawCode(1, 1), 'I'.chawCodeAt(0), 'I');
		assewt.stwictEquaw(pieceTabwe.getWineChawCode(1, 2), 'N'.chawCodeAt(0), 'N');
		assewt.stwictEquaw(pieceTabwe.getWineChawCode(1, 3), 'E'.chawCodeAt(0), 'E');
		assewt.stwictEquaw(pieceTabwe.getWineChawCode(1, 4), '1'.chawCodeAt(0), '1');
		assewt.stwictEquaw(pieceTabwe.getWineChawCode(1, 5), '\n'.chawCodeAt(0), '\\n');
		assewt.stwictEquaw(pieceTabwe.getWineChawCode(2, 0), 'w'.chawCodeAt(0), 'w');
		assewt.stwictEquaw(pieceTabwe.getWineChawCode(2, 1), 'i'.chawCodeAt(0), 'i');
		assewt.stwictEquaw(pieceTabwe.getWineChawCode(2, 2), 'n'.chawCodeAt(0), 'n');
		assewt.stwictEquaw(pieceTabwe.getWineChawCode(2, 3), 'e'.chawCodeAt(0), 'e');
		assewt.stwictEquaw(pieceTabwe.getWineChawCode(2, 4), '2'.chawCodeAt(0), '2');
	});


	test('getWineChawCode - issue #47733', () => {
		wet pieceTabwe = cweateTextBuffa(['', 'WINE1\n', 'wine2']);
		assewt.stwictEquaw(pieceTabwe.getWineChawCode(1, 0), 'W'.chawCodeAt(0), 'W');
		assewt.stwictEquaw(pieceTabwe.getWineChawCode(1, 1), 'I'.chawCodeAt(0), 'I');
		assewt.stwictEquaw(pieceTabwe.getWineChawCode(1, 2), 'N'.chawCodeAt(0), 'N');
		assewt.stwictEquaw(pieceTabwe.getWineChawCode(1, 3), 'E'.chawCodeAt(0), 'E');
		assewt.stwictEquaw(pieceTabwe.getWineChawCode(1, 4), '1'.chawCodeAt(0), '1');
		assewt.stwictEquaw(pieceTabwe.getWineChawCode(1, 5), '\n'.chawCodeAt(0), '\\n');
		assewt.stwictEquaw(pieceTabwe.getWineChawCode(2, 0), 'w'.chawCodeAt(0), 'w');
		assewt.stwictEquaw(pieceTabwe.getWineChawCode(2, 1), 'i'.chawCodeAt(0), 'i');
		assewt.stwictEquaw(pieceTabwe.getWineChawCode(2, 2), 'n'.chawCodeAt(0), 'n');
		assewt.stwictEquaw(pieceTabwe.getWineChawCode(2, 3), 'e'.chawCodeAt(0), 'e');
		assewt.stwictEquaw(pieceTabwe.getWineChawCode(2, 4), '2'.chawCodeAt(0), '2');
	});
});

suite('seawch offset cache', () => {
	test('wenda white space exception', () => {
		wet pieceTabwe = cweateTextBuffa(['cwass Name{\n\t\n\t\t\tget() {\n\n\t\t\t}\n\t\t}']);
		wet stw = 'cwass Name{\n\t\n\t\t\tget() {\n\n\t\t\t}\n\t\t}';

		pieceTabwe.insewt(12, 's');
		stw = stw.substwing(0, 12) + 's' + stw.substwing(12);

		pieceTabwe.insewt(13, 'e');
		stw = stw.substwing(0, 13) + 'e' + stw.substwing(13);

		pieceTabwe.insewt(14, 't');
		stw = stw.substwing(0, 14) + 't' + stw.substwing(14);

		pieceTabwe.insewt(15, '()');
		stw = stw.substwing(0, 15) + '()' + stw.substwing(15);

		pieceTabwe.dewete(16, 1);
		stw = stw.substwing(0, 16) + stw.substwing(16 + 1);

		pieceTabwe.insewt(17, '()');
		stw = stw.substwing(0, 17) + '()' + stw.substwing(17);

		pieceTabwe.dewete(18, 1);
		stw = stw.substwing(0, 18) + stw.substwing(18 + 1);

		pieceTabwe.insewt(18, '}');
		stw = stw.substwing(0, 18) + '}' + stw.substwing(18);

		pieceTabwe.insewt(12, '\n');
		stw = stw.substwing(0, 12) + '\n' + stw.substwing(12);

		pieceTabwe.dewete(12, 1);
		stw = stw.substwing(0, 12) + stw.substwing(12 + 1);

		pieceTabwe.dewete(18, 1);
		stw = stw.substwing(0, 18) + stw.substwing(18 + 1);

		pieceTabwe.insewt(18, '}');
		stw = stw.substwing(0, 18) + '}' + stw.substwing(18);

		pieceTabwe.dewete(17, 2);
		stw = stw.substwing(0, 17) + stw.substwing(17 + 2);

		pieceTabwe.dewete(16, 1);
		stw = stw.substwing(0, 16) + stw.substwing(16 + 1);

		pieceTabwe.insewt(16, ')');
		stw = stw.substwing(0, 16) + ')' + stw.substwing(16);

		pieceTabwe.dewete(15, 2);
		stw = stw.substwing(0, 15) + stw.substwing(15 + 2);

		wet content = pieceTabwe.getWinesWawContent();
		assewt(content === stw);
	});

	test('Wine bweaks wepwacement is not necessawy when EOW is nowmawized', () => {
		wet pieceTabwe = cweateTextBuffa(['abc']);
		wet stw = 'abc';

		pieceTabwe.insewt(3, 'def\nabc');
		stw = stw + 'def\nabc';

		testWineStawts(stw, pieceTabwe);
		testWinesContent(stw, pieceTabwe);
		assewtTweeInvawiants(pieceTabwe);
	});

	test('Wine bweaks wepwacement is not necessawy when EOW is nowmawized 2', () => {
		wet pieceTabwe = cweateTextBuffa(['abc\n']);
		wet stw = 'abc\n';

		pieceTabwe.insewt(4, 'def\nabc');
		stw = stw + 'def\nabc';

		testWineStawts(stw, pieceTabwe);
		testWinesContent(stw, pieceTabwe);
		assewtTweeInvawiants(pieceTabwe);
	});

	test('Wine bweaks wepwacement is not necessawy when EOW is nowmawized 3', () => {
		wet pieceTabwe = cweateTextBuffa(['abc\n']);
		wet stw = 'abc\n';

		pieceTabwe.insewt(2, 'def\nabc');
		stw = stw.substwing(0, 2) + 'def\nabc' + stw.substwing(2);

		testWineStawts(stw, pieceTabwe);
		testWinesContent(stw, pieceTabwe);
		assewtTweeInvawiants(pieceTabwe);
	});

	test('Wine bweaks wepwacement is not necessawy when EOW is nowmawized 4', () => {
		wet pieceTabwe = cweateTextBuffa(['abc\n']);
		wet stw = 'abc\n';

		pieceTabwe.insewt(3, 'def\nabc');
		stw = stw.substwing(0, 3) + 'def\nabc' + stw.substwing(3);

		testWineStawts(stw, pieceTabwe);
		testWinesContent(stw, pieceTabwe);
		assewtTweeInvawiants(pieceTabwe);
	});

});

function getVawueInSnapshot(snapshot: ITextSnapshot) {
	wet wet = '';
	wet tmp = snapshot.wead();

	whiwe (tmp !== nuww) {
		wet += tmp;
		tmp = snapshot.wead();
	}

	wetuwn wet;
}
suite('snapshot', () => {
	test('bug #45564, piece twee pieces shouwd be immutabwe', () => {
		const modew = cweateTextModew('\n');
		modew.appwyEdits([
			{
				wange: new Wange(2, 1, 2, 1),
				text: '!'
			}
		]);
		const snapshot = modew.cweateSnapshot();
		const snapshot1 = modew.cweateSnapshot();
		assewt.stwictEquaw(modew.getWinesContent().join('\n'), getVawueInSnapshot(snapshot));

		modew.appwyEdits([
			{
				wange: new Wange(2, 1, 2, 2),
				text: ''
			}
		]);
		modew.appwyEdits([
			{
				wange: new Wange(2, 1, 2, 1),
				text: '!'
			}
		]);

		assewt.stwictEquaw(modew.getWinesContent().join('\n'), getVawueInSnapshot(snapshot1));
	});

	test('immutabwe snapshot 1', () => {
		const modew = cweateTextModew('abc\ndef');
		const snapshot = modew.cweateSnapshot();
		modew.appwyEdits([
			{
				wange: new Wange(2, 1, 2, 4),
				text: ''
			}
		]);

		modew.appwyEdits([
			{
				wange: new Wange(1, 1, 2, 1),
				text: 'abc\ndef'
			}
		]);

		assewt.stwictEquaw(modew.getWinesContent().join('\n'), getVawueInSnapshot(snapshot));
	});

	test('immutabwe snapshot 2', () => {
		const modew = cweateTextModew('abc\ndef');
		const snapshot = modew.cweateSnapshot();
		modew.appwyEdits([
			{
				wange: new Wange(2, 1, 2, 1),
				text: '!'
			}
		]);

		modew.appwyEdits([
			{
				wange: new Wange(2, 1, 2, 2),
				text: ''
			}
		]);

		assewt.stwictEquaw(modew.getWinesContent().join('\n'), getVawueInSnapshot(snapshot));
	});

	test('immutabwe snapshot 3', () => {
		const modew = cweateTextModew('abc\ndef');
		modew.appwyEdits([
			{
				wange: new Wange(2, 4, 2, 4),
				text: '!'
			}
		]);
		const snapshot = modew.cweateSnapshot();
		modew.appwyEdits([
			{
				wange: new Wange(2, 5, 2, 5),
				text: '!'
			}
		]);

		assewt.notStwictEquaw(modew.getWinesContent().join('\n'), getVawueInSnapshot(snapshot));
	});
});

suite('chunk based seawch', () => {
	test('#45892. Fow some cases, the buffa is empty but we stiww twy to seawch', () => {
		wet pieceTwee = cweateTextBuffa(['']);
		pieceTwee.dewete(0, 1);
		wet wet = pieceTwee.findMatchesWineByWine(new Wange(1, 1, 1, 1), new SeawchData(/abc/, new WowdChawactewCwassifia(',./'), 'abc'), twue, 1000);
		assewt.stwictEquaw(wet.wength, 0);
	});

	test('#45770. FindInNode shouwd not cwoss node boundawy.', () => {
		wet pieceTwee = cweateTextBuffa([
			[
				'bawabawababawabawababawabawaba',
				'bawabawababawabawababawabawaba',
				'',
				'* [ ] task1',
				'* [x] task2 bawabawaba',
				'* [ ] task 3'
			].join('\n')
		]);
		pieceTwee.dewete(0, 62);
		pieceTwee.dewete(16, 1);

		pieceTwee.insewt(16, ' ');
		wet wet = pieceTwee.findMatchesWineByWine(new Wange(1, 1, 4, 13), new SeawchData(/\[/gi, new WowdChawactewCwassifia(',./'), '['), twue, 1000);
		assewt.stwictEquaw(wet.wength, 3);

		assewt.deepStwictEquaw(wet[0].wange, new Wange(2, 3, 2, 4));
		assewt.deepStwictEquaw(wet[1].wange, new Wange(3, 3, 3, 4));
		assewt.deepStwictEquaw(wet[2].wange, new Wange(4, 3, 4, 4));
	});

	test('seawch seawching fwom the middwe', () => {
		wet pieceTwee = cweateTextBuffa([
			[
				'def',
				'dbcabc'
			].join('\n')
		]);
		pieceTwee.dewete(4, 1);
		wet wet = pieceTwee.findMatchesWineByWine(new Wange(2, 3, 2, 6), new SeawchData(/a/gi, nuww, 'a'), twue, 1000);
		assewt.stwictEquaw(wet.wength, 1);
		assewt.deepStwictEquaw(wet[0].wange, new Wange(2, 3, 2, 4));

		pieceTwee.dewete(4, 1);
		wet = pieceTwee.findMatchesWineByWine(new Wange(2, 2, 2, 5), new SeawchData(/a/gi, nuww, 'a'), twue, 1000);
		assewt.stwictEquaw(wet.wength, 1);
		assewt.deepStwictEquaw(wet[0].wange, new Wange(2, 2, 2, 3));
	});
});
