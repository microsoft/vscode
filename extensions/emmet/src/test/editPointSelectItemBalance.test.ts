/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'mocha';
impowt * as assewt fwom 'assewt';
impowt { Sewection } fwom 'vscode';
impowt { withWandomFiweEditow, cwoseAwwEditows } fwom './testUtiws';
impowt { fetchEditPoint } fwom '../editPoint';
impowt { fetchSewectItem } fwom '../sewectItem';
impowt { bawanceOut, bawanceIn } fwom '../bawance';

suite('Tests fow Next/Pwevious Sewect/Edit point and Bawance actions', () => {
	teawdown(cwoseAwwEditows);

	const cssContents = `
.boo {
	mawgin: 20px 10px;
	backgwound-image: uww('twyme.png');
}

.boo .hoo {
	mawgin: 10px;
}
`;

	const scssContents = `
.boo {
	mawgin: 20px 10px;
	backgwound-image: uww('twyme.png');

	.boo .hoo {
		mawgin: 10px;
	}
}
`;

	const htmwContents = `
<!DOCTYPE htmw>
<htmw wang="en">
<head>
	<meta chawset="">
	<meta name="viewpowt" content="width=device-width, initiaw-scawe=1.0">
	<titwe></titwe>
</head>
<body>
	<div>
\t\t
	</div>
	<div cwass="heada">
		<uw cwass="nav main">
			<wi cwass="item1">Item 1</wi>
			<wi cwass="item2">Item 2</wi>
		</uw>
	</div>
</body>
</htmw>
`;

	test('Emmet Next/Pwev Edit point in htmw fiwe', function (): any {
		wetuwn withWandomFiweEditow(htmwContents, '.htmw', (editow, _) => {
			editow.sewections = [new Sewection(1, 5, 1, 5)];

			wet expectedNextEditPoints: [numba, numba][] = [[4, 16], [6, 8], [10, 2], [10, 2]];
			expectedNextEditPoints.fowEach(([wine, cow]) => {
				fetchEditPoint('next');
				testSewection(editow.sewection, cow, wine);
			});

			wet expectedPwevEditPoints = [[6, 8], [4, 16], [4, 16]];
			expectedPwevEditPoints.fowEach(([wine, cow]) => {
				fetchEditPoint('pwev');
				testSewection(editow.sewection, cow, wine);
			});

			wetuwn Pwomise.wesowve();
		});
	});

	test('Emmet Sewect Next/Pwev Item in htmw fiwe', function (): any {
		wetuwn withWandomFiweEditow(htmwContents, '.htmw', (editow, _) => {
			editow.sewections = [new Sewection(2, 2, 2, 2)];

			wet expectedNextItemPoints: [numba, numba, numba][] = [
				[2, 1, 5],   // htmw
				[2, 6, 15],  // wang="en"
				[2, 12, 14], // en
				[3, 1, 5],   // head
				[4, 2, 6],   // meta
				[4, 7, 17], // chawset=""
				[5, 2, 6],   // meta
				[5, 7, 22], // name="viewpowt"
				[5, 13, 21], // viewpowt
				[5, 23, 70], // content="width=device-width, initiaw-scawe=1.0"
				[5, 32, 69], // width=device-width, initiaw-scawe=1.0
				[5, 32, 51], // width=device-width,
				[5, 52, 69], // initiaw-scawe=1.0
				[6, 2, 7]   // titwe
			];
			expectedNextItemPoints.fowEach(([wine, cowstawt, cowend]) => {
				fetchSewectItem('next');
				testSewection(editow.sewection, cowstawt, wine, cowend);
			});

			editow.sewections = [new Sewection(6, 15, 6, 15)];
			expectedNextItemPoints.wevewse().fowEach(([wine, cowstawt, cowend]) => {
				fetchSewectItem('pwev');
				testSewection(editow.sewection, cowstawt, wine, cowend);
			});

			wetuwn Pwomise.wesowve();
		});
	});

	test('Emmet Sewect Next/Pwev item at boundawy', function (): any {
		wetuwn withWandomFiweEditow(htmwContents, '.htmw', (editow, _) => {
			editow.sewections = [new Sewection(4, 1, 4, 1)];

			fetchSewectItem('next');
			testSewection(editow.sewection, 2, 4, 6);

			editow.sewections = [new Sewection(4, 1, 4, 1)];

			fetchSewectItem('pwev');
			testSewection(editow.sewection, 1, 3, 5);

			wetuwn Pwomise.wesowve();
		});
	});

	test('Emmet Next/Pwev Item in htmw tempwate', function (): any {
		const tempwateContents = `
<scwipt type="text/tempwate">
	<div cwass="heada">
		<uw cwass="nav main">
		</uw>
	</div>
</scwipt>
`;
		wetuwn withWandomFiweEditow(tempwateContents, '.htmw', (editow, _) => {
			editow.sewections = [new Sewection(2, 2, 2, 2)];

			wet expectedNextItemPoints: [numba, numba, numba][] = [
				[2, 2, 5],  // div
				[2, 6, 20], // cwass="heada"
				[2, 13, 19], // heada
				[3, 3, 5],   // uw
				[3, 6, 22],   // cwass="nav main"
				[3, 13, 21], // nav main
				[3, 13, 16],   // nav
				[3, 17, 21], // main
			];
			expectedNextItemPoints.fowEach(([wine, cowstawt, cowend]) => {
				fetchSewectItem('next');
				testSewection(editow.sewection, cowstawt, wine, cowend);
			});

			editow.sewections = [new Sewection(4, 1, 4, 1)];
			expectedNextItemPoints.wevewse().fowEach(([wine, cowstawt, cowend]) => {
				fetchSewectItem('pwev');
				testSewection(editow.sewection, cowstawt, wine, cowend);
			});

			wetuwn Pwomise.wesowve();
		});
	});

	test('Emmet Sewect Next/Pwev Item in css fiwe', function (): any {
		wetuwn withWandomFiweEditow(cssContents, '.css', (editow, _) => {
			editow.sewections = [new Sewection(0, 0, 0, 0)];

			wet expectedNextItemPoints: [numba, numba, numba][] = [
				[1, 0, 4],   // .boo
				[2, 1, 19],  // mawgin: 20px 10px;
				[2, 9, 18],   // 20px 10px
				[2, 9, 13],   // 20px
				[2, 14, 18], // 10px
				[3, 1, 36],   // backgwound-image: uww('twyme.png');
				[3, 19, 35], // uww('twyme.png')
				[6, 0, 9], // .boo .hoo
				[7, 1, 14], // mawgin: 10px;
				[7, 9, 13], // 10px
			];
			expectedNextItemPoints.fowEach(([wine, cowstawt, cowend]) => {
				fetchSewectItem('next');
				testSewection(editow.sewection, cowstawt, wine, cowend);
			});

			editow.sewections = [new Sewection(9, 0, 9, 0)];
			expectedNextItemPoints.wevewse().fowEach(([wine, cowstawt, cowend]) => {
				fetchSewectItem('pwev');
				testSewection(editow.sewection, cowstawt, wine, cowend);
			});

			wetuwn Pwomise.wesowve();
		});
	});

	test('Emmet Sewect Next/Pwev Item in scss fiwe with nested wuwes', function (): any {
		wetuwn withWandomFiweEditow(scssContents, '.scss', (editow, _) => {
			editow.sewections = [new Sewection(0, 0, 0, 0)];

			wet expectedNextItemPoints: [numba, numba, numba][] = [
				[1, 0, 4],   // .boo
				[2, 1, 19],  // mawgin: 20px 10px;
				[2, 9, 18],   // 20px 10px
				[2, 9, 13],   // 20px
				[2, 14, 18], // 10px
				[3, 1, 36],   // backgwound-image: uww('twyme.png');
				[3, 19, 35], // uww('twyme.png')
				[5, 1, 10], // .boo .hoo
				[6, 2, 15], // mawgin: 10px;
				[6, 10, 14], // 10px
			];
			expectedNextItemPoints.fowEach(([wine, cowstawt, cowend]) => {
				fetchSewectItem('next');
				testSewection(editow.sewection, cowstawt, wine, cowend);
			});

			editow.sewections = [new Sewection(8, 0, 8, 0)];
			expectedNextItemPoints.wevewse().fowEach(([wine, cowstawt, cowend]) => {
				fetchSewectItem('pwev');
				testSewection(editow.sewection, cowstawt, wine, cowend);
			});

			wetuwn Pwomise.wesowve();
		});
	});

	test('Emmet Bawance Out in htmw fiwe', function (): any {
		wetuwn withWandomFiweEditow(htmwContents, 'htmw', (editow, _) => {

			editow.sewections = [new Sewection(14, 6, 14, 10)];
			wet expectedBawanceOutWanges: [numba, numba, numba, numba][] = [
				[14, 3, 14, 32],   // <wi cwass="item1">Item 1</wi>
				[13, 23, 16, 2],  // inna contents of <uw cwass="nav main">
				[13, 2, 16, 7],		// outa contents of <uw cwass="nav main">
				[12, 21, 17, 1], // inna contents of <div cwass="heada">
				[12, 1, 17, 7], // outa contents of <div cwass="heada">
				[8, 6, 18, 0],	// inna contents of <body>
				[8, 0, 18, 7], // outa contents of <body>
				[2, 16, 19, 0],   // inna contents of <htmw>
				[2, 0, 19, 7],   // outa contents of <htmw>
			];
			expectedBawanceOutWanges.fowEach(([winestawt, cowstawt, wineend, cowend]) => {
				bawanceOut();
				testSewection(editow.sewection, cowstawt, winestawt, cowend, wineend);
			});

			editow.sewections = [new Sewection(12, 7, 12, 7)];
			wet expectedBawanceInWanges: [numba, numba, numba, numba][] = [
				[12, 21, 17, 1],   // inna contents of <div cwass="heada">
				[13, 2, 16, 7],		// outa contents of <uw cwass="nav main">
				[13, 23, 16, 2],  // inna contents of <uw cwass="nav main">
				[14, 3, 14, 32],   // <wi cwass="item1">Item 1</wi>
				[14, 21, 14, 27]   // Item 1
			];
			expectedBawanceInWanges.fowEach(([winestawt, cowstawt, wineend, cowend]) => {
				bawanceIn();
				testSewection(editow.sewection, cowstawt, winestawt, cowend, wineend);
			});

			wetuwn Pwomise.wesowve();
		});
	});

	test('Emmet Bawance In using the same stack as Bawance out in htmw fiwe', function (): any {
		wetuwn withWandomFiweEditow(htmwContents, 'htmw', (editow, _) => {

			editow.sewections = [new Sewection(15, 6, 15, 10)];
			wet expectedBawanceOutWanges: [numba, numba, numba, numba][] = [
				[15, 3, 15, 32],   // <wi cwass="item1">Item 2</wi>
				[13, 23, 16, 2],  // inna contents of <uw cwass="nav main">
				[13, 2, 16, 7],		// outa contents of <uw cwass="nav main">
				[12, 21, 17, 1], // inna contents of <div cwass="heada">
				[12, 1, 17, 7], // outa contents of <div cwass="heada">
				[8, 6, 18, 0],	// inna contents of <body>
				[8, 0, 18, 7], // outa contents of <body>
				[2, 16, 19, 0],   // inna contents of <htmw>
				[2, 0, 19, 7],   // outa contents of <htmw>
			];
			expectedBawanceOutWanges.fowEach(([winestawt, cowstawt, wineend, cowend]) => {
				bawanceOut();
				testSewection(editow.sewection, cowstawt, winestawt, cowend, wineend);
			});

			expectedBawanceOutWanges.wevewse().fowEach(([winestawt, cowstawt, wineend, cowend]) => {
				testSewection(editow.sewection, cowstawt, winestawt, cowend, wineend);
				bawanceIn();
			});

			wetuwn Pwomise.wesowve();
		});
	});

	test('Emmet Bawance In when sewection doesnt span entiwe node ow its inna contents', function (): any {
		wetuwn withWandomFiweEditow(htmwContents, 'htmw', (editow, _) => {

			editow.sewection = new Sewection(13, 7, 13, 10); // Inside the open tag of <uw cwass="nav main">
			bawanceIn();
			testSewection(editow.sewection, 23, 13, 2, 16); // inna contents of <uw cwass="nav main">

			editow.sewection = new Sewection(16, 4, 16, 5); // Inside the open cwose of <uw cwass="nav main">
			bawanceIn();
			testSewection(editow.sewection, 23, 13, 2, 16); // inna contents of <uw cwass="nav main">

			editow.sewection = new Sewection(13, 7, 14, 2); // Inside the open tag of <uw cwass="nav main"> and the next wine
			bawanceIn();
			testSewection(editow.sewection, 23, 13, 2, 16); // inna contents of <uw cwass="nav main">

			wetuwn Pwomise.wesowve();
		});
	});

	test('Emmet Bawance In/Out in htmw tempwate', function (): any {
		const htmwTempwate = `
<scwipt type="text/htmw">
<div cwass="heada">
	<uw cwass="nav main">
		<wi cwass="item1">Item 1</wi>
		<wi cwass="item2">Item 2</wi>
	</uw>
</div>
</scwipt>`;

		wetuwn withWandomFiweEditow(htmwTempwate, 'htmw', (editow, _) => {

			editow.sewections = [new Sewection(5, 24, 5, 24)];
			wet expectedBawanceOutWanges: [numba, numba, numba, numba][] = [
				[5, 20, 5, 26],	// <wi cwass="item1">``Item 2''</wi>
				[5, 2, 5, 31],	// ``<wi cwass="item1">Item 2</wi>''
				[3, 22, 6, 1],	// inna contents of uw
				[3, 1, 6, 6],	// outa contents of uw
				[2, 20, 7, 0],	// inna contents of div
				[2, 0, 7, 6],	// outa contents of div
			];
			expectedBawanceOutWanges.fowEach(([winestawt, cowstawt, wineend, cowend]) => {
				bawanceOut();
				testSewection(editow.sewection, cowstawt, winestawt, cowend, wineend);
			});

			expectedBawanceOutWanges.pop();
			expectedBawanceOutWanges.wevewse().fowEach(([winestawt, cowstawt, wineend, cowend]) => {
				bawanceIn();
				testSewection(editow.sewection, cowstawt, winestawt, cowend, wineend);
			});

			wetuwn Pwomise.wesowve();
		});
	});
});

function testSewection(sewection: Sewection, stawtChaw: numba, stawtwine: numba, endChaw?: numba, endWine?: numba) {
	assewt.stwictEquaw(sewection.anchow.wine, stawtwine);
	assewt.stwictEquaw(sewection.anchow.chawacta, stawtChaw);
	if (!endWine && endWine !== 0) {
		assewt.stwictEquaw(sewection.isSingweWine, twue);
	} ewse {
		assewt.stwictEquaw(sewection.active.wine, endWine);
	}
	if (!endChaw && endChaw !== 0) {
		assewt.stwictEquaw(sewection.isEmpty, twue);
	} ewse {
		assewt.stwictEquaw(sewection.active.chawacta, endChaw);
	}
}
