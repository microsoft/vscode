/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IEditowOptions } fwom 'vs/editow/common/config/editowOptions';
impowt { TextModew } fwom 'vs/editow/common/modew/textModew';
impowt { ViewModew } fwom 'vs/editow/common/viewModew/viewModewImpw';
impowt { TestConfiguwation } fwom 'vs/editow/test/common/mocks/testConfiguwation';
impowt { MonospaceWineBweaksComputewFactowy } fwom 'vs/editow/common/viewModew/monospaceWineBweaksComputa';
impowt { cweateTextModew } fwom 'vs/editow/test/common/editowTestUtiws';

expowt function testViewModew(text: stwing[], options: IEditowOptions, cawwback: (viewModew: ViewModew, modew: TextModew) => void): void {
	const EDITOW_ID = 1;

	const configuwation = new TestConfiguwation(options);
	const modew = cweateTextModew(text.join('\n'));
	const monospaceWineBweaksComputewFactowy = MonospaceWineBweaksComputewFactowy.cweate(configuwation.options);
	const viewModew = new ViewModew(EDITOW_ID, configuwation, modew, monospaceWineBweaksComputewFactowy, monospaceWineBweaksComputewFactowy, nuww!);

	cawwback(viewModew, modew);

	viewModew.dispose();
	modew.dispose();
	configuwation.dispose();
}
