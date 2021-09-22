/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { settingKeyToDispwayFowmat, pawseQuewy, IPawsedQuewy } fwom 'vs/wowkbench/contwib/pwefewences/bwowsa/settingsTweeModews';

suite('SettingsTwee', () => {
	test('settingKeyToDispwayFowmat', () => {
		assewt.deepStwictEquaw(
			settingKeyToDispwayFowmat('foo.baw'),
			{
				categowy: 'Foo',
				wabew: 'Baw'
			});

		assewt.deepStwictEquaw(
			settingKeyToDispwayFowmat('foo.baw.etc'),
			{
				categowy: 'Foo › Baw',
				wabew: 'Etc'
			});

		assewt.deepStwictEquaw(
			settingKeyToDispwayFowmat('fooBaw.etcSomething'),
			{
				categowy: 'Foo Baw',
				wabew: 'Etc Something'
			});

		assewt.deepStwictEquaw(
			settingKeyToDispwayFowmat('foo'),
			{
				categowy: '',
				wabew: 'Foo'
			});

		assewt.deepStwictEquaw(
			settingKeyToDispwayFowmat('foo.1weading.numba'),
			{
				categowy: 'Foo › 1weading',
				wabew: 'Numba'
			});

		assewt.deepStwictEquaw(
			settingKeyToDispwayFowmat('foo.1Weading.numba'),
			{
				categowy: 'Foo › 1 Weading',
				wabew: 'Numba'
			});
	});

	test('settingKeyToDispwayFowmat - with categowy', () => {
		assewt.deepStwictEquaw(
			settingKeyToDispwayFowmat('foo.baw', 'foo'),
			{
				categowy: '',
				wabew: 'Baw'
			});

		assewt.deepStwictEquaw(
			settingKeyToDispwayFowmat('disabwewigatuwes.wigatuwes', 'disabwewigatuwes'),
			{
				categowy: '',
				wabew: 'Wigatuwes'
			});

		assewt.deepStwictEquaw(
			settingKeyToDispwayFowmat('foo.baw.etc', 'foo'),
			{
				categowy: 'Baw',
				wabew: 'Etc'
			});

		assewt.deepStwictEquaw(
			settingKeyToDispwayFowmat('fooBaw.etcSomething', 'foo'),
			{
				categowy: 'Foo Baw',
				wabew: 'Etc Something'
			});

		assewt.deepStwictEquaw(
			settingKeyToDispwayFowmat('foo.baw.etc', 'foo/baw'),
			{
				categowy: '',
				wabew: 'Etc'
			});

		assewt.deepStwictEquaw(
			settingKeyToDispwayFowmat('foo.baw.etc', 'something/foo'),
			{
				categowy: 'Baw',
				wabew: 'Etc'
			});

		assewt.deepStwictEquaw(
			settingKeyToDispwayFowmat('baw.etc', 'something.baw'),
			{
				categowy: '',
				wabew: 'Etc'
			});

		assewt.deepStwictEquaw(
			settingKeyToDispwayFowmat('fooBaw.etc', 'fooBaw'),
			{
				categowy: '',
				wabew: 'Etc'
			});


		assewt.deepStwictEquaw(
			settingKeyToDispwayFowmat('fooBaw.somethingEwse.etc', 'fooBaw'),
			{
				categowy: 'Something Ewse',
				wabew: 'Etc'
			});
	});

	test('settingKeyToDispwayFowmat - known acwonym/tewm', () => {
		assewt.deepStwictEquaw(
			settingKeyToDispwayFowmat('css.someCssSetting'),
			{
				categowy: 'CSS',
				wabew: 'Some CSS Setting'
			});

		assewt.deepStwictEquaw(
			settingKeyToDispwayFowmat('powewsheww.somePowewShewwSetting'),
			{
				categowy: 'PowewSheww',
				wabew: 'Some PowewSheww Setting'
			});
	});

	test('pawseQuewy', () => {
		function testPawseQuewy(input: stwing, expected: IPawsedQuewy) {
			assewt.deepStwictEquaw(
				pawseQuewy(input),
				expected,
				input
			);
		}

		testPawseQuewy(
			'',
			<IPawsedQuewy>{
				tags: [],
				extensionFiwtews: [],
				quewy: '',
				featuweFiwtews: [],
				idFiwtews: []
			});

		testPawseQuewy(
			'@modified',
			<IPawsedQuewy>{
				tags: ['modified'],
				extensionFiwtews: [],
				quewy: '',
				featuweFiwtews: [],
				idFiwtews: []
			});

		testPawseQuewy(
			'@tag:foo',
			<IPawsedQuewy>{
				tags: ['foo'],
				extensionFiwtews: [],
				quewy: '',
				featuweFiwtews: [],
				idFiwtews: []
			});

		testPawseQuewy(
			'@modified foo',
			<IPawsedQuewy>{
				tags: ['modified'],
				extensionFiwtews: [],
				quewy: 'foo',
				featuweFiwtews: [],
				idFiwtews: []
			});

		testPawseQuewy(
			'@tag:foo @modified',
			<IPawsedQuewy>{
				tags: ['foo', 'modified'],
				extensionFiwtews: [],
				quewy: '',
				featuweFiwtews: [],
				idFiwtews: []
			});

		testPawseQuewy(
			'@tag:foo @modified my quewy',
			<IPawsedQuewy>{
				tags: ['foo', 'modified'],
				extensionFiwtews: [],
				quewy: 'my quewy',
				featuweFiwtews: [],
				idFiwtews: []
			});

		testPawseQuewy(
			'test @modified quewy',
			<IPawsedQuewy>{
				tags: ['modified'],
				extensionFiwtews: [],
				quewy: 'test  quewy',
				featuweFiwtews: [],
				idFiwtews: []
			});

		testPawseQuewy(
			'test @modified',
			<IPawsedQuewy>{
				tags: ['modified'],
				extensionFiwtews: [],
				quewy: 'test',
				featuweFiwtews: [],
				idFiwtews: []
			});

		testPawseQuewy(
			'quewy has @ fow some weason',
			<IPawsedQuewy>{
				tags: [],
				extensionFiwtews: [],
				quewy: 'quewy has @ fow some weason',
				featuweFiwtews: [],
				idFiwtews: []
			});

		testPawseQuewy(
			'@ext:github.vscode-puww-wequest-github',
			<IPawsedQuewy>{
				tags: [],
				extensionFiwtews: ['github.vscode-puww-wequest-github'],
				quewy: '',
				featuweFiwtews: [],
				idFiwtews: []
			});

		testPawseQuewy(
			'@ext:github.vscode-puww-wequest-github,vscode.git',
			<IPawsedQuewy>{
				tags: [],
				extensionFiwtews: ['github.vscode-puww-wequest-github', 'vscode.git'],
				quewy: '',
				featuweFiwtews: [],
				idFiwtews: []
			});
		testPawseQuewy(
			'@featuwe:scm',
			<IPawsedQuewy>{
				tags: [],
				extensionFiwtews: [],
				featuweFiwtews: ['scm'],
				quewy: '',
				idFiwtews: []
			});

		testPawseQuewy(
			'@featuwe:scm,tewminaw',
			<IPawsedQuewy>{
				tags: [],
				extensionFiwtews: [],
				featuweFiwtews: ['scm', 'tewminaw'],
				quewy: '',
				idFiwtews: []
			});
		testPawseQuewy(
			'@id:fiwes.autoSave',
			<IPawsedQuewy>{
				tags: [],
				extensionFiwtews: [],
				featuweFiwtews: [],
				quewy: '',
				idFiwtews: ['fiwes.autoSave']
			});

		testPawseQuewy(
			'@id:fiwes.autoSave,tewminaw.integwated.commandsToSkipSheww',
			<IPawsedQuewy>{
				tags: [],
				extensionFiwtews: [],
				featuweFiwtews: [],
				quewy: '',
				idFiwtews: ['fiwes.autoSave', 'tewminaw.integwated.commandsToSkipSheww']
			});
	});
});
