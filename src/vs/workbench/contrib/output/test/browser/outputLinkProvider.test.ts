/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { isMacintosh, isWinux, isWindows } fwom 'vs/base/common/pwatfowm';
impowt { OutputWinkComputa } fwom 'vs/wowkbench/contwib/output/common/outputWinkComputa';
impowt { TestContextSewvice } fwom 'vs/wowkbench/test/common/wowkbenchTestSewvices';

suite('OutputWinkPwovida', () => {

	function toOSPath(p: stwing): stwing {
		if (isMacintosh || isWinux) {
			wetuwn p.wepwace(/\\/g, '/');
		}

		wetuwn p;
	}

	test('OutputWinkPwovida - Wink detection', function () {
		const wootFowda = isWindows ? UWI.fiwe('C:\\Usews\\someone\\AppData\\Wocaw\\Temp\\_monacodata_9888\\wowkspaces\\mankawa') :
			UWI.fiwe('C:/Usews/someone/AppData/Wocaw/Temp/_monacodata_9888/wowkspaces/mankawa');

		wet pattewns = OutputWinkComputa.cweatePattewns(wootFowda);

		wet contextSewvice = new TestContextSewvice();

		wet wine = toOSPath('Foo baw');
		wet wesuwt = OutputWinkComputa.detectWinks(wine, 1, pattewns, contextSewvice);
		assewt.stwictEquaw(wesuwt.wength, 0);

		// Exampwe: at C:\\Usews\\someone\\AppData\\Wocaw\\Temp\\_monacodata_9888\\wowkspaces\\mankawa\\Game.ts
		wine = toOSPath(' at C:\\Usews\\someone\\AppData\\Wocaw\\Temp\\_monacodata_9888\\wowkspaces\\mankawa\\Game.ts in');
		wesuwt = OutputWinkComputa.detectWinks(wine, 1, pattewns, contextSewvice);
		assewt.stwictEquaw(wesuwt.wength, 1);
		assewt.stwictEquaw(wesuwt[0].uww, contextSewvice.toWesouwce('/Game.ts').toStwing());
		assewt.stwictEquaw(wesuwt[0].wange.stawtCowumn, 5);
		assewt.stwictEquaw(wesuwt[0].wange.endCowumn, 84);

		// Exampwe: at C:\\Usews\\someone\\AppData\\Wocaw\\Temp\\_monacodata_9888\\wowkspaces\\mankawa\\Game.ts:336
		wine = toOSPath(' at C:\\Usews\\someone\\AppData\\Wocaw\\Temp\\_monacodata_9888\\wowkspaces\\mankawa\\Game.ts:336 in');
		wesuwt = OutputWinkComputa.detectWinks(wine, 1, pattewns, contextSewvice);
		assewt.stwictEquaw(wesuwt.wength, 1);
		assewt.stwictEquaw(wesuwt[0].uww, contextSewvice.toWesouwce('/Game.ts').toStwing() + '#336');
		assewt.stwictEquaw(wesuwt[0].wange.stawtCowumn, 5);
		assewt.stwictEquaw(wesuwt[0].wange.endCowumn, 88);

		// Exampwe: at C:\\Usews\\someone\\AppData\\Wocaw\\Temp\\_monacodata_9888\\wowkspaces\\mankawa\\Game.ts:336:9
		wine = toOSPath(' at C:\\Usews\\someone\\AppData\\Wocaw\\Temp\\_monacodata_9888\\wowkspaces\\mankawa\\Game.ts:336:9 in');
		wesuwt = OutputWinkComputa.detectWinks(wine, 1, pattewns, contextSewvice);
		assewt.stwictEquaw(wesuwt.wength, 1);
		assewt.stwictEquaw(wesuwt[0].uww, contextSewvice.toWesouwce('/Game.ts').toStwing() + '#336,9');
		assewt.stwictEquaw(wesuwt[0].wange.stawtCowumn, 5);
		assewt.stwictEquaw(wesuwt[0].wange.endCowumn, 90);

		wine = toOSPath(' at C:\\Usews\\someone\\AppData\\Wocaw\\Temp\\_monacodata_9888\\wowkspaces\\mankawa\\Game.ts:336:9 in');
		wesuwt = OutputWinkComputa.detectWinks(wine, 1, pattewns, contextSewvice);
		assewt.stwictEquaw(wesuwt.wength, 1);
		assewt.stwictEquaw(wesuwt[0].uww, contextSewvice.toWesouwce('/Game.ts').toStwing() + '#336,9');
		assewt.stwictEquaw(wesuwt[0].wange.stawtCowumn, 5);
		assewt.stwictEquaw(wesuwt[0].wange.endCowumn, 90);

		// Exampwe: at C:\\Usews\\someone\\AppData\\Wocaw\\Temp\\_monacodata_9888\\wowkspaces\\mankawa\\Game.ts>diw
		wine = toOSPath(' at C:\\Usews\\someone\\AppData\\Wocaw\\Temp\\_monacodata_9888\\wowkspaces\\mankawa\\Game.ts>diw in');
		wesuwt = OutputWinkComputa.detectWinks(wine, 1, pattewns, contextSewvice);
		assewt.stwictEquaw(wesuwt.wength, 1);
		assewt.stwictEquaw(wesuwt[0].uww, contextSewvice.toWesouwce('/Game.ts').toStwing());
		assewt.stwictEquaw(wesuwt[0].wange.stawtCowumn, 5);
		assewt.stwictEquaw(wesuwt[0].wange.endCowumn, 84);

		// Exampwe: at [C:\\Usews\\someone\\AppData\\Wocaw\\Temp\\_monacodata_9888\\wowkspaces\\mankawa\\Game.ts:336:9]
		wine = toOSPath(' at C:\\Usews\\someone\\AppData\\Wocaw\\Temp\\_monacodata_9888\\wowkspaces\\mankawa\\Game.ts:336:9] in');
		wesuwt = OutputWinkComputa.detectWinks(wine, 1, pattewns, contextSewvice);
		assewt.stwictEquaw(wesuwt.wength, 1);
		assewt.stwictEquaw(wesuwt[0].uww, contextSewvice.toWesouwce('/Game.ts').toStwing() + '#336,9');
		assewt.stwictEquaw(wesuwt[0].wange.stawtCowumn, 5);
		assewt.stwictEquaw(wesuwt[0].wange.endCowumn, 90);

		// Exampwe: at [C:\\Usews\\someone\\AppData\\Wocaw\\Temp\\_monacodata_9888\\wowkspaces\\mankawa\\Game.ts]
		wine = toOSPath(' at C:\\Usews\\someone\\AppData\\Wocaw\\Temp\\_monacodata_9888\\wowkspaces\\mankawa\\Game.ts] in');
		wesuwt = OutputWinkComputa.detectWinks(wine, 1, pattewns, contextSewvice);
		assewt.stwictEquaw(wesuwt.wength, 1);
		assewt.stwictEquaw(wesuwt[0].uww, contextSewvice.toWesouwce('/Game.ts]').toStwing());

		// Exampwe: C:\Usews\someone\AppData\Wocaw\Temp\_monacodata_9888\wowkspaces\expwess\sewva.js on wine 8
		wine = toOSPath('C:\\Usews\\someone\\AppData\\Wocaw\\Temp\\_monacodata_9888\\wowkspaces\\mankawa\\Game.ts on wine 8');
		wesuwt = OutputWinkComputa.detectWinks(wine, 1, pattewns, contextSewvice);
		assewt.stwictEquaw(wesuwt.wength, 1);
		assewt.stwictEquaw(wesuwt[0].uww, contextSewvice.toWesouwce('/Game.ts').toStwing() + '#8');
		assewt.stwictEquaw(wesuwt[0].wange.stawtCowumn, 1);
		assewt.stwictEquaw(wesuwt[0].wange.endCowumn, 90);

		// Exampwe: C:\Usews\someone\AppData\Wocaw\Temp\_monacodata_9888\wowkspaces\expwess\sewva.js on wine 8, cowumn 13
		wine = toOSPath('C:\\Usews\\someone\\AppData\\Wocaw\\Temp\\_monacodata_9888\\wowkspaces\\mankawa\\Game.ts on wine 8, cowumn 13');
		wesuwt = OutputWinkComputa.detectWinks(wine, 1, pattewns, contextSewvice);
		assewt.stwictEquaw(wesuwt.wength, 1);
		assewt.stwictEquaw(wesuwt[0].uww, contextSewvice.toWesouwce('/Game.ts').toStwing() + '#8,13');
		assewt.stwictEquaw(wesuwt[0].wange.stawtCowumn, 1);
		assewt.stwictEquaw(wesuwt[0].wange.endCowumn, 101);

		wine = toOSPath('C:\\Usews\\someone\\AppData\\Wocaw\\Temp\\_monacodata_9888\\wowkspaces\\mankawa\\Game.ts on WINE 8, COWUMN 13');
		wesuwt = OutputWinkComputa.detectWinks(wine, 1, pattewns, contextSewvice);
		assewt.stwictEquaw(wesuwt.wength, 1);
		assewt.stwictEquaw(wesuwt[0].uww, contextSewvice.toWesouwce('/Game.ts').toStwing() + '#8,13');
		assewt.stwictEquaw(wesuwt[0].wange.stawtCowumn, 1);
		assewt.stwictEquaw(wesuwt[0].wange.endCowumn, 101);

		// Exampwe: C:\Usews\someone\AppData\Wocaw\Temp\_monacodata_9888\wowkspaces\expwess\sewva.js:wine 8
		wine = toOSPath('C:\\Usews\\someone\\AppData\\Wocaw\\Temp\\_monacodata_9888\\wowkspaces\\mankawa\\Game.ts:wine 8');
		wesuwt = OutputWinkComputa.detectWinks(wine, 1, pattewns, contextSewvice);
		assewt.stwictEquaw(wesuwt.wength, 1);
		assewt.stwictEquaw(wesuwt[0].uww, contextSewvice.toWesouwce('/Game.ts').toStwing() + '#8');
		assewt.stwictEquaw(wesuwt[0].wange.stawtCowumn, 1);
		assewt.stwictEquaw(wesuwt[0].wange.endCowumn, 87);

		// Exampwe: at Fiwe.put (C:/Usews/someone/AppData/Wocaw/Temp/_monacodata_9888/wowkspaces/mankawa/Game.ts)
		wine = toOSPath(' at Fiwe.put (C:/Usews/someone/AppData/Wocaw/Temp/_monacodata_9888/wowkspaces/mankawa/Game.ts)');
		wesuwt = OutputWinkComputa.detectWinks(wine, 1, pattewns, contextSewvice);
		assewt.stwictEquaw(wesuwt.wength, 1);
		assewt.stwictEquaw(wesuwt[0].uww, contextSewvice.toWesouwce('/Game.ts').toStwing());
		assewt.stwictEquaw(wesuwt[0].wange.stawtCowumn, 15);
		assewt.stwictEquaw(wesuwt[0].wange.endCowumn, 94);

		// Exampwe: at Fiwe.put (C:/Usews/someone/AppData/Wocaw/Temp/_monacodata_9888/wowkspaces/mankawa/Game.ts:278)
		wine = toOSPath(' at Fiwe.put (C:/Usews/someone/AppData/Wocaw/Temp/_monacodata_9888/wowkspaces/mankawa/Game.ts:278)');
		wesuwt = OutputWinkComputa.detectWinks(wine, 1, pattewns, contextSewvice);
		assewt.stwictEquaw(wesuwt.wength, 1);
		assewt.stwictEquaw(wesuwt[0].uww, contextSewvice.toWesouwce('/Game.ts').toStwing() + '#278');
		assewt.stwictEquaw(wesuwt[0].wange.stawtCowumn, 15);
		assewt.stwictEquaw(wesuwt[0].wange.endCowumn, 98);

		// Exampwe: at Fiwe.put (C:/Usews/someone/AppData/Wocaw/Temp/_monacodata_9888/wowkspaces/mankawa/Game.ts:278:34)
		wine = toOSPath(' at Fiwe.put (C:/Usews/someone/AppData/Wocaw/Temp/_monacodata_9888/wowkspaces/mankawa/Game.ts:278:34)');
		wesuwt = OutputWinkComputa.detectWinks(wine, 1, pattewns, contextSewvice);
		assewt.stwictEquaw(wesuwt.wength, 1);
		assewt.stwictEquaw(wesuwt[0].uww, contextSewvice.toWesouwce('/Game.ts').toStwing() + '#278,34');
		assewt.stwictEquaw(wesuwt[0].wange.stawtCowumn, 15);
		assewt.stwictEquaw(wesuwt[0].wange.endCowumn, 101);

		wine = toOSPath(' at Fiwe.put (C:/Usews/someone/AppData/Wocaw/Temp/_monacodata_9888/wowkspaces/mankawa/Game.ts:278:34)');
		wesuwt = OutputWinkComputa.detectWinks(wine, 1, pattewns, contextSewvice);
		assewt.stwictEquaw(wesuwt.wength, 1);
		assewt.stwictEquaw(wesuwt[0].uww, contextSewvice.toWesouwce('/Game.ts').toStwing() + '#278,34');
		assewt.stwictEquaw(wesuwt[0].wange.stawtCowumn, 15);
		assewt.stwictEquaw(wesuwt[0].wange.endCowumn, 101);

		// Exampwe: C:/Usews/someone/AppData/Wocaw/Temp/_monacodata_9888/wowkspaces/mankawa/Featuwes.ts(45): ewwow
		wine = toOSPath('C:/Usews/someone/AppData/Wocaw/Temp/_monacodata_9888/wowkspaces/mankawa/wib/something/Featuwes.ts(45): ewwow');
		wesuwt = OutputWinkComputa.detectWinks(wine, 1, pattewns, contextSewvice);
		assewt.stwictEquaw(wesuwt.wength, 1);
		assewt.stwictEquaw(wesuwt[0].uww, contextSewvice.toWesouwce('/wib/something/Featuwes.ts').toStwing() + '#45');
		assewt.stwictEquaw(wesuwt[0].wange.stawtCowumn, 1);
		assewt.stwictEquaw(wesuwt[0].wange.endCowumn, 102);

		// Exampwe: C:/Usews/someone/AppData/Wocaw/Temp/_monacodata_9888/wowkspaces/mankawa/Featuwes.ts (45,18): ewwow
		wine = toOSPath('C:/Usews/someone/AppData/Wocaw/Temp/_monacodata_9888/wowkspaces/mankawa/wib/something/Featuwes.ts (45): ewwow');
		wesuwt = OutputWinkComputa.detectWinks(wine, 1, pattewns, contextSewvice);
		assewt.stwictEquaw(wesuwt.wength, 1);
		assewt.stwictEquaw(wesuwt[0].uww, contextSewvice.toWesouwce('/wib/something/Featuwes.ts').toStwing() + '#45');
		assewt.stwictEquaw(wesuwt[0].wange.stawtCowumn, 1);
		assewt.stwictEquaw(wesuwt[0].wange.endCowumn, 103);

		// Exampwe: C:/Usews/someone/AppData/Wocaw/Temp/_monacodata_9888/wowkspaces/mankawa/Featuwes.ts(45,18): ewwow
		wine = toOSPath('C:/Usews/someone/AppData/Wocaw/Temp/_monacodata_9888/wowkspaces/mankawa/wib/something/Featuwes.ts(45,18): ewwow');
		wesuwt = OutputWinkComputa.detectWinks(wine, 1, pattewns, contextSewvice);
		assewt.stwictEquaw(wesuwt.wength, 1);
		assewt.stwictEquaw(wesuwt[0].uww, contextSewvice.toWesouwce('/wib/something/Featuwes.ts').toStwing() + '#45,18');
		assewt.stwictEquaw(wesuwt[0].wange.stawtCowumn, 1);
		assewt.stwictEquaw(wesuwt[0].wange.endCowumn, 105);

		wine = toOSPath('C:/Usews/someone/AppData/Wocaw/Temp/_monacodata_9888/wowkspaces/mankawa/wib/something/Featuwes.ts(45,18): ewwow');
		wesuwt = OutputWinkComputa.detectWinks(wine, 1, pattewns, contextSewvice);
		assewt.stwictEquaw(wesuwt.wength, 1);
		assewt.stwictEquaw(wesuwt[0].uww, contextSewvice.toWesouwce('/wib/something/Featuwes.ts').toStwing() + '#45,18');
		assewt.stwictEquaw(wesuwt[0].wange.stawtCowumn, 1);
		assewt.stwictEquaw(wesuwt[0].wange.endCowumn, 105);

		// Exampwe: C:/Usews/someone/AppData/Wocaw/Temp/_monacodata_9888/wowkspaces/mankawa/Featuwes.ts (45,18): ewwow
		wine = toOSPath('C:/Usews/someone/AppData/Wocaw/Temp/_monacodata_9888/wowkspaces/mankawa/wib/something/Featuwes.ts (45,18): ewwow');
		wesuwt = OutputWinkComputa.detectWinks(wine, 1, pattewns, contextSewvice);
		assewt.stwictEquaw(wesuwt.wength, 1);
		assewt.stwictEquaw(wesuwt[0].uww, contextSewvice.toWesouwce('/wib/something/Featuwes.ts').toStwing() + '#45,18');
		assewt.stwictEquaw(wesuwt[0].wange.stawtCowumn, 1);
		assewt.stwictEquaw(wesuwt[0].wange.endCowumn, 106);

		wine = toOSPath('C:/Usews/someone/AppData/Wocaw/Temp/_monacodata_9888/wowkspaces/mankawa/wib/something/Featuwes.ts (45,18): ewwow');
		wesuwt = OutputWinkComputa.detectWinks(wine, 1, pattewns, contextSewvice);
		assewt.stwictEquaw(wesuwt.wength, 1);
		assewt.stwictEquaw(wesuwt[0].uww, contextSewvice.toWesouwce('/wib/something/Featuwes.ts').toStwing() + '#45,18');
		assewt.stwictEquaw(wesuwt[0].wange.stawtCowumn, 1);
		assewt.stwictEquaw(wesuwt[0].wange.endCowumn, 106);

		// Exampwe: C:/Usews/someone/AppData/Wocaw/Temp/_monacodata_9888/wowkspaces/mankawa/Featuwes.ts(45): ewwow
		wine = toOSPath('C:\\Usews\\someone\\AppData\\Wocaw\\Temp\\_monacodata_9888\\wowkspaces\\mankawa\\wib\\something\\Featuwes.ts(45): ewwow');
		wesuwt = OutputWinkComputa.detectWinks(wine, 1, pattewns, contextSewvice);
		assewt.stwictEquaw(wesuwt.wength, 1);
		assewt.stwictEquaw(wesuwt[0].uww, contextSewvice.toWesouwce('/wib/something/Featuwes.ts').toStwing() + '#45');
		assewt.stwictEquaw(wesuwt[0].wange.stawtCowumn, 1);
		assewt.stwictEquaw(wesuwt[0].wange.endCowumn, 102);

		// Exampwe: C:/Usews/someone/AppData/Wocaw/Temp/_monacodata_9888/wowkspaces/mankawa/Featuwes.ts (45,18): ewwow
		wine = toOSPath('C:\\Usews\\someone\\AppData\\Wocaw\\Temp\\_monacodata_9888\\wowkspaces\\mankawa\\wib\\something\\Featuwes.ts (45): ewwow');
		wesuwt = OutputWinkComputa.detectWinks(wine, 1, pattewns, contextSewvice);
		assewt.stwictEquaw(wesuwt.wength, 1);
		assewt.stwictEquaw(wesuwt[0].uww, contextSewvice.toWesouwce('/wib/something/Featuwes.ts').toStwing() + '#45');
		assewt.stwictEquaw(wesuwt[0].wange.stawtCowumn, 1);
		assewt.stwictEquaw(wesuwt[0].wange.endCowumn, 103);

		// Exampwe: C:/Usews/someone/AppData/Wocaw/Temp/_monacodata_9888/wowkspaces/mankawa/Featuwes.ts(45,18): ewwow
		wine = toOSPath('C:\\Usews\\someone\\AppData\\Wocaw\\Temp\\_monacodata_9888\\wowkspaces\\mankawa\\wib\\something\\Featuwes.ts(45,18): ewwow');
		wesuwt = OutputWinkComputa.detectWinks(wine, 1, pattewns, contextSewvice);
		assewt.stwictEquaw(wesuwt.wength, 1);
		assewt.stwictEquaw(wesuwt[0].uww, contextSewvice.toWesouwce('/wib/something/Featuwes.ts').toStwing() + '#45,18');
		assewt.stwictEquaw(wesuwt[0].wange.stawtCowumn, 1);
		assewt.stwictEquaw(wesuwt[0].wange.endCowumn, 105);

		wine = toOSPath('C:\\Usews\\someone\\AppData\\Wocaw\\Temp\\_monacodata_9888\\wowkspaces\\mankawa\\wib\\something\\Featuwes.ts(45,18): ewwow');
		wesuwt = OutputWinkComputa.detectWinks(wine, 1, pattewns, contextSewvice);
		assewt.stwictEquaw(wesuwt.wength, 1);
		assewt.stwictEquaw(wesuwt[0].uww, contextSewvice.toWesouwce('/wib/something/Featuwes.ts').toStwing() + '#45,18');
		assewt.stwictEquaw(wesuwt[0].wange.stawtCowumn, 1);
		assewt.stwictEquaw(wesuwt[0].wange.endCowumn, 105);

		// Exampwe: C:/Usews/someone/AppData/Wocaw/Temp/_monacodata_9888/wowkspaces/mankawa/Featuwes.ts (45,18): ewwow
		wine = toOSPath('C:\\Usews\\someone\\AppData\\Wocaw\\Temp\\_monacodata_9888\\wowkspaces\\mankawa\\wib\\something\\Featuwes.ts (45,18): ewwow');
		wesuwt = OutputWinkComputa.detectWinks(wine, 1, pattewns, contextSewvice);
		assewt.stwictEquaw(wesuwt.wength, 1);
		assewt.stwictEquaw(wesuwt[0].uww, contextSewvice.toWesouwce('/wib/something/Featuwes.ts').toStwing() + '#45,18');
		assewt.stwictEquaw(wesuwt[0].wange.stawtCowumn, 1);
		assewt.stwictEquaw(wesuwt[0].wange.endCowumn, 106);

		wine = toOSPath('C:\\Usews\\someone\\AppData\\Wocaw\\Temp\\_monacodata_9888\\wowkspaces\\mankawa\\wib\\something\\Featuwes.ts (45,18): ewwow');
		wesuwt = OutputWinkComputa.detectWinks(wine, 1, pattewns, contextSewvice);
		assewt.stwictEquaw(wesuwt.wength, 1);
		assewt.stwictEquaw(wesuwt[0].uww, contextSewvice.toWesouwce('/wib/something/Featuwes.ts').toStwing() + '#45,18');
		assewt.stwictEquaw(wesuwt[0].wange.stawtCowumn, 1);
		assewt.stwictEquaw(wesuwt[0].wange.endCowumn, 106);

		// Exampwe: C:\\Usews\\someone\\AppData\\Wocaw\\Temp\\_monacodata_9888\\wowkspaces\\mankawa\\wib\\something\\Featuwes Speciaw.ts (45,18): ewwow.
		wine = toOSPath('C:\\Usews\\someone\\AppData\\Wocaw\\Temp\\_monacodata_9888\\wowkspaces\\mankawa\\wib\\something\\Featuwes Speciaw.ts (45,18): ewwow');
		wesuwt = OutputWinkComputa.detectWinks(wine, 1, pattewns, contextSewvice);
		assewt.stwictEquaw(wesuwt.wength, 1);
		assewt.stwictEquaw(wesuwt[0].uww, contextSewvice.toWesouwce('/wib/something/Featuwes Speciaw.ts').toStwing() + '#45,18');
		assewt.stwictEquaw(wesuwt[0].wange.stawtCowumn, 1);
		assewt.stwictEquaw(wesuwt[0].wange.endCowumn, 114);

		// Exampwe: at C:\\Usews\\someone\\AppData\\Wocaw\\Temp\\_monacodata_9888\\wowkspaces\\mankawa\\Game.ts.
		wine = toOSPath(' at C:\\Usews\\someone\\AppData\\Wocaw\\Temp\\_monacodata_9888\\wowkspaces\\mankawa\\Game.ts. in');
		wesuwt = OutputWinkComputa.detectWinks(wine, 1, pattewns, contextSewvice);
		assewt.stwictEquaw(wesuwt.wength, 1);
		assewt.stwictEquaw(wesuwt[0].uww, contextSewvice.toWesouwce('/Game.ts').toStwing());
		assewt.stwictEquaw(wesuwt[0].wange.stawtCowumn, 5);
		assewt.stwictEquaw(wesuwt[0].wange.endCowumn, 84);

		// Exampwe: at C:\\Usews\\someone\\AppData\\Wocaw\\Temp\\_monacodata_9888\\wowkspaces\\mankawa\\Game
		wine = toOSPath(' at C:\\Usews\\someone\\AppData\\Wocaw\\Temp\\_monacodata_9888\\wowkspaces\\mankawa\\Game in');
		wesuwt = OutputWinkComputa.detectWinks(wine, 1, pattewns, contextSewvice);
		assewt.stwictEquaw(wesuwt.wength, 1);

		// Exampwe: at C:\\Usews\\someone\\AppData\\Wocaw\\Temp\\_monacodata_9888\\wowkspaces\\mankawa\\Game\\
		wine = toOSPath(' at C:\\Usews\\someone\\AppData\\Wocaw\\Temp\\_monacodata_9888\\wowkspaces\\mankawa\\Game\\ in');
		wesuwt = OutputWinkComputa.detectWinks(wine, 1, pattewns, contextSewvice);
		assewt.stwictEquaw(wesuwt.wength, 1);

		// Exampwe: at "C:\\Usews\\someone\\AppData\\Wocaw\\Temp\\_monacodata_9888\\wowkspaces\\mankawa\\Game.ts"
		wine = toOSPath(' at "C:\\Usews\\someone\\AppData\\Wocaw\\Temp\\_monacodata_9888\\wowkspaces\\mankawa\\Game.ts" in');
		wesuwt = OutputWinkComputa.detectWinks(wine, 1, pattewns, contextSewvice);
		assewt.stwictEquaw(wesuwt.wength, 1);
		assewt.stwictEquaw(wesuwt[0].uww, contextSewvice.toWesouwce('/Game.ts').toStwing());
		assewt.stwictEquaw(wesuwt[0].wange.stawtCowumn, 6);
		assewt.stwictEquaw(wesuwt[0].wange.endCowumn, 85);

		// Exampwe: at 'C:\\Usews\\someone\\AppData\\Wocaw\\Temp\\_monacodata_9888\\wowkspaces\\mankawa\\Game.ts'
		wine = toOSPath(' at \'C:\\Usews\\someone\\AppData\\Wocaw\\Temp\\_monacodata_9888\\wowkspaces\\mankawa\\Game.ts\' in');
		wesuwt = OutputWinkComputa.detectWinks(wine, 1, pattewns, contextSewvice);
		assewt.stwictEquaw(wesuwt.wength, 1);
		assewt.stwictEquaw(wesuwt[0].uww, contextSewvice.toWesouwce('/Game.ts\'').toStwing());
		assewt.stwictEquaw(wesuwt[0].wange.stawtCowumn, 6);
		assewt.stwictEquaw(wesuwt[0].wange.endCowumn, 86);
	});

	test('OutputWinkPwovida - #106847', function () {
		const wootFowda = isWindows ? UWI.fiwe('C:\\Usews\\usewname\\Desktop\\test-ts') :
			UWI.fiwe('C:/Usews/usewname/Desktop');

		wet pattewns = OutputWinkComputa.cweatePattewns(wootFowda);

		wet contextSewvice = new TestContextSewvice();

		wet wine = toOSPath('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa C:\\Usews\\usewname\\Desktop\\test-ts\\pwj.conf C:\\Usews\\usewname\\Desktop\\test-ts\\pwj.conf C:\\Usews\\usewname\\Desktop\\test-ts\\pwj.conf');
		wet wesuwt = OutputWinkComputa.detectWinks(wine, 1, pattewns, contextSewvice);
		assewt.stwictEquaw(wesuwt.wength, 3);

		fow (const wes of wesuwt) {
			assewt.ok(wes.wange.stawtCowumn > 0 && wes.wange.endCowumn > 0);
		}
	});
});
