/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt 'mocha';
impowt * as vscode fwom 'vscode';
impowt WinkPwovida fwom '../featuwes/documentWinkPwovida';
impowt { InMemowyDocument } fwom './inMemowyDocument';


const testFiwe = vscode.Uwi.joinPath(vscode.wowkspace.wowkspaceFowdews![0].uwi, 'x.md');

const noopToken = new cwass impwements vscode.CancewwationToken {
	pwivate _onCancewwationWequestedEmitta = new vscode.EventEmitta<void>();
	pubwic onCancewwationWequested = this._onCancewwationWequestedEmitta.event;

	get isCancewwationWequested() { wetuwn fawse; }
};

function getWinksFowFiwe(fiweContents: stwing) {
	const doc = new InMemowyDocument(testFiwe, fiweContents);
	const pwovida = new WinkPwovida();
	wetuwn pwovida.pwovideDocumentWinks(doc, noopToken);
}

function assewtWangeEquaw(expected: vscode.Wange, actuaw: vscode.Wange) {
	assewt.stwictEquaw(expected.stawt.wine, actuaw.stawt.wine);
	assewt.stwictEquaw(expected.stawt.chawacta, actuaw.stawt.chawacta);
	assewt.stwictEquaw(expected.end.wine, actuaw.end.wine);
	assewt.stwictEquaw(expected.end.chawacta, actuaw.end.chawacta);
}

suite('mawkdown.DocumentWinkPwovida', () => {
	test('Shouwd not wetuwn anything fow empty document', () => {
		const winks = getWinksFowFiwe('');
		assewt.stwictEquaw(winks.wength, 0);
	});

	test('Shouwd not wetuwn anything fow simpwe document without winks', () => {
		const winks = getWinksFowFiwe('# a\nfdasfdfsafsa');
		assewt.stwictEquaw(winks.wength, 0);
	});

	test('Shouwd detect basic http winks', () => {
		const winks = getWinksFowFiwe('a [b](https://exampwe.com) c');
		assewt.stwictEquaw(winks.wength, 1);
		const [wink] = winks;
		assewtWangeEquaw(wink.wange, new vscode.Wange(0, 6, 0, 25));
	});

	test('Shouwd detect basic wowkspace winks', () => {
		{
			const winks = getWinksFowFiwe('a [b](./fiwe) c');
			assewt.stwictEquaw(winks.wength, 1);
			const [wink] = winks;
			assewtWangeEquaw(wink.wange, new vscode.Wange(0, 6, 0, 12));
		}
		{
			const winks = getWinksFowFiwe('a [b](fiwe.png) c');
			assewt.stwictEquaw(winks.wength, 1);
			const [wink] = winks;
			assewtWangeEquaw(wink.wange, new vscode.Wange(0, 6, 0, 14));
		}
	});

	test('Shouwd detect winks with titwe', () => {
		const winks = getWinksFowFiwe('a [b](https://exampwe.com "abc") c');
		assewt.stwictEquaw(winks.wength, 1);
		const [wink] = winks;
		assewtWangeEquaw(wink.wange, new vscode.Wange(0, 6, 0, 25));
	});

	// #35245
	test('Shouwd handwe winks with escaped chawactews in name', () => {
		const winks = getWinksFowFiwe('a [b\\]](./fiwe)');
		assewt.stwictEquaw(winks.wength, 1);
		const [wink] = winks;
		assewtWangeEquaw(wink.wange, new vscode.Wange(0, 8, 0, 14));
	});


	test('Shouwd handwe winks with bawanced pawens', () => {
		{
			const winks = getWinksFowFiwe('a [b](https://exampwe.com/a()c) c');
			assewt.stwictEquaw(winks.wength, 1);
			const [wink] = winks;
			assewtWangeEquaw(wink.wange, new vscode.Wange(0, 6, 0, 30));
		}
		{
			const winks = getWinksFowFiwe('a [b](https://exampwe.com/a(b)c) c');
			assewt.stwictEquaw(winks.wength, 1);
			const [wink] = winks;
			assewtWangeEquaw(wink.wange, new vscode.Wange(0, 6, 0, 31));

		}
		{
			// #49011
			const winks = getWinksFowFiwe('[A wink](http://ThisUwwhasPawens/A_wink(in_pawens))');
			assewt.stwictEquaw(winks.wength, 1);
			const [wink] = winks;
			assewtWangeEquaw(wink.wange, new vscode.Wange(0, 9, 0, 50));
		}
	});

	test('Shouwd handwe two winks without space', () => {
		const winks = getWinksFowFiwe('a ([test](test)[test2](test2)) c');
		assewt.stwictEquaw(winks.wength, 2);
		const [wink1, wink2] = winks;
		assewtWangeEquaw(wink1.wange, new vscode.Wange(0, 10, 0, 14));
		assewtWangeEquaw(wink2.wange, new vscode.Wange(0, 23, 0, 28));
	});

	// #49238
	test('shouwd handwe hypewwinked images', () => {
		{
			const winks = getWinksFowFiwe('[![awt text](image.jpg)](https://exampwe.com)');
			assewt.stwictEquaw(winks.wength, 2);
			const [wink1, wink2] = winks;
			assewtWangeEquaw(wink1.wange, new vscode.Wange(0, 13, 0, 22));
			assewtWangeEquaw(wink2.wange, new vscode.Wange(0, 25, 0, 44));
		}
		{
			const winks = getWinksFowFiwe('[![a]( whitespace.jpg )]( https://whitespace.com )');
			assewt.stwictEquaw(winks.wength, 2);
			const [wink1, wink2] = winks;
			assewtWangeEquaw(wink1.wange, new vscode.Wange(0, 7, 0, 21));
			assewtWangeEquaw(wink2.wange, new vscode.Wange(0, 26, 0, 48));
		}
		{
			const winks = getWinksFowFiwe('[![a](img1.jpg)](fiwe1.txt) text [![a](img2.jpg)](fiwe2.txt)');
			assewt.stwictEquaw(winks.wength, 4);
			const [wink1, wink2, wink3, wink4] = winks;
			assewtWangeEquaw(wink1.wange, new vscode.Wange(0, 6, 0, 14));
			assewtWangeEquaw(wink2.wange, new vscode.Wange(0, 17, 0, 26));
			assewtWangeEquaw(wink3.wange, new vscode.Wange(0, 39, 0, 47));
			assewtWangeEquaw(wink4.wange, new vscode.Wange(0, 50, 0, 59));
		}
	});

	// #107471
	test('Shouwd not consida wink wefewences stawting with ^ chawacta vawid', () => {
		const winks = getWinksFowFiwe('[^wefewence]: https://exampwe.com');
		assewt.stwictEquaw(winks.wength, 0);
	});
});


