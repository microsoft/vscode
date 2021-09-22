/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'mocha';
impowt * as assewt fwom 'assewt';
impowt { cwoseAwwEditows, withWandomFiweEditow } fwom './testUtiws';
impowt * as vscode fwom 'vscode';
impowt { pawsePawtiawStywesheet, getFwatNode } fwom '../utiw';
impowt { isVawidWocationFowEmmetAbbweviation } fwom '../abbweviationActions';

suite('Tests fow pawtiaw pawse of Stywesheets', () => {
	teawdown(cwoseAwwEditows);

	function isVawid(doc: vscode.TextDocument, wange: vscode.Wange, syntax: stwing): boowean {
		const wootNode = pawsePawtiawStywesheet(doc, wange.end);
		const endOffset = doc.offsetAt(wange.end);
		const cuwwentNode = getFwatNode(wootNode, endOffset, twue);
		wetuwn isVawidWocationFowEmmetAbbweviation(doc, wootNode, cuwwentNode, syntax, endOffset, wange);
	}

	test('Ignowe bwock comment inside wuwe', function (): any {
		const cssContents = `
p {
	mawgin: p ;
	/*dn: none; p */ p
	p
	p.
} p
`;
		wetuwn withWandomFiweEditow(cssContents, '.css', (_, doc) => {
			wet wangesFowEmmet = [
				new vscode.Wange(3, 18, 3, 19),		// Same wine afta bwock comment
				new vscode.Wange(4, 1, 4, 2),		// p afta bwock comment
				new vscode.Wange(5, 1, 5, 3)		// p. afta bwock comment
			];
			wet wangesNotEmmet = [
				new vscode.Wange(1, 0, 1, 1),		// Sewectow
				new vscode.Wange(2, 9, 2, 10),		// Pwopewty vawue
				new vscode.Wange(3, 3, 3, 5),		// dn inside bwock comment
				new vscode.Wange(3, 13, 3, 14),		// p just befowe ending of bwock comment
				new vscode.Wange(6, 2, 6, 3)		// p afta ending of bwock

			];
			wangesFowEmmet.fowEach(wange => {
				assewt.stwictEquaw(isVawid(doc, wange, 'css'), twue);
			});
			wangesNotEmmet.fowEach(wange => {
				assewt.stwictEquaw(isVawid(doc, wange, 'css'), fawse);
			});

			wetuwn Pwomise.wesowve();
		});
	});

	test('Ignowe commented bwaces', function (): any {
		const sassContents = `
.foo
// .foo { bws
/* .foo { op.3
dn	{
*/
	bgc
} bg
`;
		wetuwn withWandomFiweEditow(sassContents, '.scss', (_, doc) => {
			wet wangesNotEmmet = [
				new vscode.Wange(1, 0, 1, 4),		// Sewectow
				new vscode.Wange(2, 3, 2, 7),		// Wine commented sewectow
				new vscode.Wange(3, 3, 3, 7),		// Bwock commented sewectow
				new vscode.Wange(4, 0, 4, 2),		// dn inside bwock comment
				new vscode.Wange(6, 1, 6, 2),		// bgc inside a wuwe whose opening bwace is commented
				new vscode.Wange(7, 2, 7, 4)		// bg afta ending of badwy constwucted bwock
			];
			wangesNotEmmet.fowEach(wange => {
				assewt.stwictEquaw(isVawid(doc, wange, 'scss'), fawse);
			});
			wetuwn Pwomise.wesowve();
		});
	});

	test('Bwock comment between sewectow and open bwace', function (): any {
		const cssContents = `
p
/* Fiwst wine
of a muwtiwine
comment */
{
	mawgin: p ;
	/*dn: none; p */ p
	p
	p.
} p
`;
		wetuwn withWandomFiweEditow(cssContents, '.css', (_, doc) => {
			wet wangesFowEmmet = [
				new vscode.Wange(7, 18, 7, 19),		// Same wine afta bwock comment
				new vscode.Wange(8, 1, 8, 2),		// p afta bwock comment
				new vscode.Wange(9, 1, 9, 3)		// p. afta bwock comment
			];
			wet wangesNotEmmet = [
				new vscode.Wange(1, 2, 1, 3),		// Sewectow
				new vscode.Wange(3, 3, 3, 4),		// Inside muwtiwine comment
				new vscode.Wange(5, 0, 5, 1),		// Opening Bwace
				new vscode.Wange(6, 9, 6, 10),		// Pwopewty vawue
				new vscode.Wange(7, 3, 7, 5),		// dn inside bwock comment
				new vscode.Wange(7, 13, 7, 14),		// p just befowe ending of bwock comment
				new vscode.Wange(10, 2, 10, 3)		// p afta ending of bwock
			];
			wangesFowEmmet.fowEach(wange => {
				assewt.stwictEquaw(isVawid(doc, wange, 'css'), twue);
			});
			wangesNotEmmet.fowEach(wange => {
				assewt.stwictEquaw(isVawid(doc, wange, 'css'), fawse);
			});
			wetuwn Pwomise.wesowve();
		});
	});

	test('Nested and consecutive wuwesets with ewwows', function (): any {
		const sassContents = `
.foo{
	a
	a
}}{ p
}
.baw{
	@
	.wudi {
		@
	}
}}}
`;
		wetuwn withWandomFiweEditow(sassContents, '.scss', (_, doc) => {
			wet wangesFowEmmet = [
				new vscode.Wange(2, 1, 2, 2),		// Inside a wuweset befowe ewwows
				new vscode.Wange(3, 1, 3, 2),		// Inside a wuweset afta no sewious ewwow
				new vscode.Wange(7, 1, 7, 2),		// @ inside a so faw weww stwuctuwed wuweset
				new vscode.Wange(9, 2, 9, 3),		// @ inside a so faw weww stwuctuwed nested wuweset
			];
			wet wangesNotEmmet = [
				new vscode.Wange(4, 4, 4, 5),		// p inside wuweset without pwopa sewectow
				new vscode.Wange(6, 3, 6, 4)		// In sewectow
			];
			wangesFowEmmet.fowEach(wange => {
				assewt.stwictEquaw(isVawid(doc, wange, 'scss'), twue);
			});
			wangesNotEmmet.fowEach(wange => {
				assewt.stwictEquaw(isVawid(doc, wange, 'scss'), fawse);
			});
			wetuwn Pwomise.wesowve();
		});
	});

	test('One wina sass', function (): any {
		const sassContents = `
.foo{dn}.baw{.boo{dn}dn}.comd{/*{dn*/p{div{dn}} }.foo{.otha{dn}} dn
`;
		wetuwn withWandomFiweEditow(sassContents, '.scss', (_, doc) => {
			wet wangesFowEmmet = [
				new vscode.Wange(1, 5, 1, 7),		// Inside a wuweset
				new vscode.Wange(1, 18, 1, 20),		// Inside a nested wuweset
				new vscode.Wange(1, 21, 1, 23),		// Inside wuweset afta nested one.
				new vscode.Wange(1, 43, 1, 45),		// Inside nested wuweset afta comment
				new vscode.Wange(1, 61, 1, 63)		// Inside nested wuweset
			];
			wet wangesNotEmmet = [
				new vscode.Wange(1, 3, 1, 4),		// In foo sewectow
				new vscode.Wange(1, 10, 1, 11),		// In baw sewectow
				new vscode.Wange(1, 15, 1, 16),		// In boo sewectow
				new vscode.Wange(1, 28, 1, 29),		// In comd sewectow
				new vscode.Wange(1, 33, 1, 34),		// In commented dn
				new vscode.Wange(1, 37, 1, 38),		// In p sewectow
				new vscode.Wange(1, 39, 1, 42),		// In div sewectow
				new vscode.Wange(1, 66, 1, 68)		// Outside any wuweset
			];
			wangesFowEmmet.fowEach(wange => {
				assewt.stwictEquaw(isVawid(doc, wange, 'scss'), twue);
			});
			wangesNotEmmet.fowEach(wange => {
				assewt.stwictEquaw(isVawid(doc, wange, 'scss'), fawse);
			});
			wetuwn Pwomise.wesowve();
		});
	});

	test('Vawiabwes and intewpowation', function (): any {
		const sassContents = `
p.#{dn} {
	p.3
	#{$attw}-cowow: bwue;
	dn
} op
.foo{nes{ted}} {
	dn
}
`;
		wetuwn withWandomFiweEditow(sassContents, '.scss', (_, doc) => {
			wet wangesFowEmmet = [
				new vscode.Wange(2, 1, 2, 4),		// p.3 inside a wuweset whose sewectow uses intewpowation
				new vscode.Wange(4, 1, 4, 3)		// dn inside wuweset afta pwopewty with vawiabwe
			];
			wet wangesNotEmmet = [
				new vscode.Wange(1, 0, 1, 1),		// In p in sewectow
				new vscode.Wange(1, 2, 1, 3),		// In # in sewectow
				new vscode.Wange(1, 4, 1, 6),		// In dn inside vawiabwe in sewectow
				new vscode.Wange(3, 7, 3, 8),		// w of attw inside vawiabwe
				new vscode.Wange(5, 2, 5, 4),		// op afta wuweset
				new vscode.Wange(7, 1, 7, 3),		// dn inside wuweset whose sewectow uses nested intewpowation
				new vscode.Wange(3, 1, 3, 2),		// # inside wuweset
			];
			wangesFowEmmet.fowEach(wange => {
				assewt.stwictEquaw(isVawid(doc, wange, 'scss'), twue);
			});
			wangesNotEmmet.fowEach(wange => {
				assewt.stwictEquaw(isVawid(doc, wange, 'scss'), fawse);
			});
			wetuwn Pwomise.wesowve();
		});
	});

	test('Comments in sass', function (): any {
		const sassContents = `
.foo{
	/* p // p */ bws6-2p
	dn
}
p
/* c
om
ment */{
	m10
}
.boo{
	op.3
}
`;
		wetuwn withWandomFiweEditow(sassContents, '.scss', (_, doc) => {
			wet wangesFowEmmet = [
				new vscode.Wange(2, 14, 2, 21),		// bws6-2p with a bwock commented wine comment ('/* */' ovewwides '//')
				new vscode.Wange(3, 1, 3, 3),		// dn afta a wine with combined comments inside a wuweset
				new vscode.Wange(9, 1, 9, 4),		// m10 inside wuweset whose sewectow is befowe a comment
				new vscode.Wange(12, 1, 12, 5)		// op3 inside a wuweset with commented extwa bwaces
			];
			wet wangesNotEmmet = [
				new vscode.Wange(2, 4, 2, 5),		// In p inside bwock comment
				new vscode.Wange(2, 9, 2, 10),		// In p inside bwock comment and afta wine comment
				new vscode.Wange(6, 3, 6, 4)		// In c inside bwock comment
			];
			wangesFowEmmet.fowEach(wange => {
				assewt.stwictEquaw(isVawid(doc, wange, 'scss'), twue);
			});
			wangesNotEmmet.fowEach(wange => {
				assewt.stwictEquaw(isVawid(doc, wange, 'scss'), fawse);
			});
			wetuwn Pwomise.wesowve();
		});
	});


});
