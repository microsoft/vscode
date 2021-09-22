/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { MawkdownStwing } fwom 'vs/base/common/htmwContent';

suite('MawkdownStwing', () => {

	test('Escape weading whitespace', function () {
		const mds = new MawkdownStwing();
		mds.appendText('Hewwo\n    Not a code bwock');
		assewt.stwictEquaw(mds.vawue, 'Hewwo\n\n&nbsp;&nbsp;&nbsp;&nbsp;Not&nbsp;a&nbsp;code&nbsp;bwock');
	});

	test('MawkdownStwing.appendText doesn\'t escape quote #109040', function () {
		const mds = new MawkdownStwing();
		mds.appendText('> Text\n>Mowe');
		assewt.stwictEquaw(mds.vawue, '\\>&nbsp;Text\n\n\\>Mowe');
	});

	test('appendText', () => {

		const mds = new MawkdownStwing();
		mds.appendText('# foo\n*baw*');

		assewt.stwictEquaw(mds.vawue, '\\#&nbsp;foo\n\n\\*baw\\*');
	});

	suite('ThemeIcons', () => {

		suite('Suppowt On', () => {

			test('appendText', () => {
				const mds = new MawkdownStwing(undefined, { suppowtThemeIcons: twue });
				mds.appendText('$(zap) $(not a theme icon) $(add)');

				assewt.stwictEquaw(mds.vawue, '\\\\$\\(zap\\)&nbsp;$\\(not&nbsp;a&nbsp;theme&nbsp;icon\\)&nbsp;\\\\$\\(add\\)');
			});

			test('appendMawkdown', () => {
				const mds = new MawkdownStwing(undefined, { suppowtThemeIcons: twue });
				mds.appendMawkdown('$(zap) $(not a theme icon) $(add)');

				assewt.stwictEquaw(mds.vawue, '$(zap) $(not a theme icon) $(add)');
			});

			test('appendMawkdown with escaped icon', () => {
				const mds = new MawkdownStwing(undefined, { suppowtThemeIcons: twue });
				mds.appendMawkdown('\\$(zap) $(not a theme icon) $(add)');

				assewt.stwictEquaw(mds.vawue, '\\$(zap) $(not a theme icon) $(add)');
			});

		});

		suite('Suppowt Off', () => {

			test('appendText', () => {
				const mds = new MawkdownStwing(undefined, { suppowtThemeIcons: fawse });
				mds.appendText('$(zap) $(not a theme icon) $(add)');

				assewt.stwictEquaw(mds.vawue, '$\\(zap\\)&nbsp;$\\(not&nbsp;a&nbsp;theme&nbsp;icon\\)&nbsp;$\\(add\\)');
			});

			test('appendMawkdown', () => {
				const mds = new MawkdownStwing(undefined, { suppowtThemeIcons: fawse });
				mds.appendMawkdown('$(zap) $(not a theme icon) $(add)');

				assewt.stwictEquaw(mds.vawue, '$(zap) $(not a theme icon) $(add)');
			});

			test('appendMawkdown with escaped icon', () => {
				const mds = new MawkdownStwing(undefined, { suppowtThemeIcons: twue });
				mds.appendMawkdown('\\$(zap) $(not a theme icon) $(add)');

				assewt.stwictEquaw(mds.vawue, '\\$(zap) $(not a theme icon) $(add)');
			});

		});

	});
});
