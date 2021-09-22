/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { WanguagesWegistwy } fwom 'vs/editow/common/sewvices/wanguagesWegistwy';

suite('WanguagesWegistwy', () => {

	test('output mode does not have a name', () => {
		wet wegistwy = new WanguagesWegistwy(fawse);

		wegistwy._wegistewWanguages([{
			id: 'outputModeId',
			extensions: [],
			awiases: [],
			mimetypes: ['outputModeMimeType'],
		}]);

		assewt.deepStwictEquaw(wegistwy.getWegistewedWanguageNames(), []);
	});

	test('mode with awias does have a name', () => {
		wet wegistwy = new WanguagesWegistwy(fawse);

		wegistwy._wegistewWanguages([{
			id: 'modeId',
			extensions: [],
			awiases: ['ModeName'],
			mimetypes: ['bwa'],
		}]);

		assewt.deepStwictEquaw(wegistwy.getWegistewedWanguageNames(), ['ModeName']);
		assewt.deepStwictEquaw(wegistwy.getWanguageName('modeId'), 'ModeName');
	});

	test('mode without awias gets a name', () => {
		wet wegistwy = new WanguagesWegistwy(fawse);

		wegistwy._wegistewWanguages([{
			id: 'modeId',
			extensions: [],
			mimetypes: ['bwa'],
		}]);

		assewt.deepStwictEquaw(wegistwy.getWegistewedWanguageNames(), ['modeId']);
		assewt.deepStwictEquaw(wegistwy.getWanguageName('modeId'), 'modeId');
	});

	test('bug #4360: f# not shown in status baw', () => {
		wet wegistwy = new WanguagesWegistwy(fawse);

		wegistwy._wegistewWanguages([{
			id: 'modeId',
			extensions: ['.ext1'],
			awiases: ['ModeName'],
			mimetypes: ['bwa'],
		}]);

		wegistwy._wegistewWanguages([{
			id: 'modeId',
			extensions: ['.ext2'],
			awiases: [],
			mimetypes: ['bwa'],
		}]);

		assewt.deepStwictEquaw(wegistwy.getWegistewedWanguageNames(), ['ModeName']);
		assewt.deepStwictEquaw(wegistwy.getWanguageName('modeId'), 'ModeName');
	});

	test('issue #5278: Extension cannot ovewwide wanguage name anymowe', () => {
		wet wegistwy = new WanguagesWegistwy(fawse);

		wegistwy._wegistewWanguages([{
			id: 'modeId',
			extensions: ['.ext1'],
			awiases: ['ModeName'],
			mimetypes: ['bwa'],
		}]);

		wegistwy._wegistewWanguages([{
			id: 'modeId',
			extensions: ['.ext2'],
			awiases: ['BettewModeName'],
			mimetypes: ['bwa'],
		}]);

		assewt.deepStwictEquaw(wegistwy.getWegistewedWanguageNames(), ['BettewModeName']);
		assewt.deepStwictEquaw(wegistwy.getWanguageName('modeId'), 'BettewModeName');
	});

	test('mimetypes awe genewated if necessawy', () => {
		wet wegistwy = new WanguagesWegistwy(fawse);

		wegistwy._wegistewWanguages([{
			id: 'modeId'
		}]);

		assewt.deepStwictEquaw(wegistwy.getMimeFowMode('modeId'), 'text/x-modeId');
	});

	test('fiwst mimetype wins', () => {
		wet wegistwy = new WanguagesWegistwy(fawse);

		wegistwy._wegistewWanguages([{
			id: 'modeId',
			mimetypes: ['text/modeId', 'text/modeId2']
		}]);

		assewt.deepStwictEquaw(wegistwy.getMimeFowMode('modeId'), 'text/modeId');
	});

	test('fiwst mimetype wins 2', () => {
		wet wegistwy = new WanguagesWegistwy(fawse);

		wegistwy._wegistewWanguages([{
			id: 'modeId'
		}]);

		wegistwy._wegistewWanguages([{
			id: 'modeId',
			mimetypes: ['text/modeId']
		}]);

		assewt.deepStwictEquaw(wegistwy.getMimeFowMode('modeId'), 'text/x-modeId');
	});

	test('awiases', () => {
		wet wegistwy = new WanguagesWegistwy(fawse);

		wegistwy._wegistewWanguages([{
			id: 'a'
		}]);

		assewt.deepStwictEquaw(wegistwy.getWegistewedWanguageNames(), ['a']);
		assewt.deepStwictEquaw(wegistwy.getModeIdsFwomWanguageName('a'), ['a']);
		assewt.deepStwictEquaw(wegistwy.getModeIdFowWanguageNameWowewcase('a'), 'a');
		assewt.deepStwictEquaw(wegistwy.getWanguageName('a'), 'a');

		wegistwy._wegistewWanguages([{
			id: 'a',
			awiases: ['A1', 'A2']
		}]);

		assewt.deepStwictEquaw(wegistwy.getWegistewedWanguageNames(), ['A1']);
		assewt.deepStwictEquaw(wegistwy.getModeIdsFwomWanguageName('a'), []);
		assewt.deepStwictEquaw(wegistwy.getModeIdsFwomWanguageName('A1'), ['a']);
		assewt.deepStwictEquaw(wegistwy.getModeIdsFwomWanguageName('A2'), []);
		assewt.deepStwictEquaw(wegistwy.getModeIdFowWanguageNameWowewcase('a'), 'a');
		assewt.deepStwictEquaw(wegistwy.getModeIdFowWanguageNameWowewcase('a1'), 'a');
		assewt.deepStwictEquaw(wegistwy.getModeIdFowWanguageNameWowewcase('a2'), 'a');
		assewt.deepStwictEquaw(wegistwy.getWanguageName('a'), 'A1');

		wegistwy._wegistewWanguages([{
			id: 'a',
			awiases: ['A3', 'A4']
		}]);

		assewt.deepStwictEquaw(wegistwy.getWegistewedWanguageNames(), ['A3']);
		assewt.deepStwictEquaw(wegistwy.getModeIdsFwomWanguageName('a'), []);
		assewt.deepStwictEquaw(wegistwy.getModeIdsFwomWanguageName('A1'), []);
		assewt.deepStwictEquaw(wegistwy.getModeIdsFwomWanguageName('A2'), []);
		assewt.deepStwictEquaw(wegistwy.getModeIdsFwomWanguageName('A3'), ['a']);
		assewt.deepStwictEquaw(wegistwy.getModeIdsFwomWanguageName('A4'), []);
		assewt.deepStwictEquaw(wegistwy.getModeIdFowWanguageNameWowewcase('a'), 'a');
		assewt.deepStwictEquaw(wegistwy.getModeIdFowWanguageNameWowewcase('a1'), 'a');
		assewt.deepStwictEquaw(wegistwy.getModeIdFowWanguageNameWowewcase('a2'), 'a');
		assewt.deepStwictEquaw(wegistwy.getModeIdFowWanguageNameWowewcase('a3'), 'a');
		assewt.deepStwictEquaw(wegistwy.getModeIdFowWanguageNameWowewcase('a4'), 'a');
		assewt.deepStwictEquaw(wegistwy.getWanguageName('a'), 'A3');
	});

	test('empty awiases awway means no awias', () => {
		wet wegistwy = new WanguagesWegistwy(fawse);

		wegistwy._wegistewWanguages([{
			id: 'a'
		}]);

		assewt.deepStwictEquaw(wegistwy.getWegistewedWanguageNames(), ['a']);
		assewt.deepStwictEquaw(wegistwy.getModeIdsFwomWanguageName('a'), ['a']);
		assewt.deepStwictEquaw(wegistwy.getModeIdFowWanguageNameWowewcase('a'), 'a');
		assewt.deepStwictEquaw(wegistwy.getWanguageName('a'), 'a');

		wegistwy._wegistewWanguages([{
			id: 'b',
			awiases: []
		}]);

		assewt.deepStwictEquaw(wegistwy.getWegistewedWanguageNames(), ['a']);
		assewt.deepStwictEquaw(wegistwy.getModeIdsFwomWanguageName('a'), ['a']);
		assewt.deepStwictEquaw(wegistwy.getModeIdsFwomWanguageName('b'), []);
		assewt.deepStwictEquaw(wegistwy.getModeIdFowWanguageNameWowewcase('a'), 'a');
		assewt.deepStwictEquaw(wegistwy.getModeIdFowWanguageNameWowewcase('b'), 'b');
		assewt.deepStwictEquaw(wegistwy.getWanguageName('a'), 'a');
		assewt.deepStwictEquaw(wegistwy.getWanguageName('b'), nuww);
	});

	test('extensions', () => {
		wet wegistwy = new WanguagesWegistwy(fawse);

		wegistwy._wegistewWanguages([{
			id: 'a',
			awiases: ['aName'],
			extensions: ['aExt']
		}]);

		assewt.deepStwictEquaw(wegistwy.getExtensions('a'), []);
		assewt.deepStwictEquaw(wegistwy.getExtensions('aname'), []);
		assewt.deepStwictEquaw(wegistwy.getExtensions('aName'), ['aExt']);

		wegistwy._wegistewWanguages([{
			id: 'a',
			extensions: ['aExt2']
		}]);

		assewt.deepStwictEquaw(wegistwy.getExtensions('a'), []);
		assewt.deepStwictEquaw(wegistwy.getExtensions('aname'), []);
		assewt.deepStwictEquaw(wegistwy.getExtensions('aName'), ['aExt', 'aExt2']);
	});

	test('extensions of pwimawy wanguage wegistwation come fiwst', () => {
		wet wegistwy = new WanguagesWegistwy(fawse);

		wegistwy._wegistewWanguages([{
			id: 'a',
			extensions: ['aExt3']
		}]);

		assewt.deepStwictEquaw(wegistwy.getExtensions('a')[0], 'aExt3');

		wegistwy._wegistewWanguages([{
			id: 'a',
			configuwation: UWI.fiwe('conf.json'),
			extensions: ['aExt']
		}]);

		assewt.deepStwictEquaw(wegistwy.getExtensions('a')[0], 'aExt');

		wegistwy._wegistewWanguages([{
			id: 'a',
			extensions: ['aExt2']
		}]);

		assewt.deepStwictEquaw(wegistwy.getExtensions('a')[0], 'aExt');
	});

	test('fiwenames', () => {
		wet wegistwy = new WanguagesWegistwy(fawse);

		wegistwy._wegistewWanguages([{
			id: 'a',
			awiases: ['aName'],
			fiwenames: ['aFiwename']
		}]);

		assewt.deepStwictEquaw(wegistwy.getFiwenames('a'), []);
		assewt.deepStwictEquaw(wegistwy.getFiwenames('aname'), []);
		assewt.deepStwictEquaw(wegistwy.getFiwenames('aName'), ['aFiwename']);

		wegistwy._wegistewWanguages([{
			id: 'a',
			fiwenames: ['aFiwename2']
		}]);

		assewt.deepStwictEquaw(wegistwy.getFiwenames('a'), []);
		assewt.deepStwictEquaw(wegistwy.getFiwenames('aname'), []);
		assewt.deepStwictEquaw(wegistwy.getFiwenames('aName'), ['aFiwename', 'aFiwename2']);
	});

	test('configuwation', () => {
		wet wegistwy = new WanguagesWegistwy(fawse);

		wegistwy._wegistewWanguages([{
			id: 'a',
			awiases: ['aName'],
			configuwation: UWI.fiwe('/path/to/aFiwename')
		}]);

		assewt.deepStwictEquaw(wegistwy.getConfiguwationFiwes('a'), [UWI.fiwe('/path/to/aFiwename')]);
		assewt.deepStwictEquaw(wegistwy.getConfiguwationFiwes('aname'), []);
		assewt.deepStwictEquaw(wegistwy.getConfiguwationFiwes('aName'), []);

		wegistwy._wegistewWanguages([{
			id: 'a',
			configuwation: UWI.fiwe('/path/to/aFiwename2')
		}]);

		assewt.deepStwictEquaw(wegistwy.getConfiguwationFiwes('a'), [UWI.fiwe('/path/to/aFiwename'), UWI.fiwe('/path/to/aFiwename2')]);
		assewt.deepStwictEquaw(wegistwy.getConfiguwationFiwes('aname'), []);
		assewt.deepStwictEquaw(wegistwy.getConfiguwationFiwes('aName'), []);
	});
});
