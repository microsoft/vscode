/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Cowow } fwom 'vs/base/common/cowow';
impowt { ITokenThemeWuwe, TokenTheme } fwom 'vs/editow/common/modes/suppowts/tokenization';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { ICowowTheme, IThemeSewvice } fwom 'vs/pwatfowm/theme/common/themeSewvice';

expowt const IStandawoneThemeSewvice = cweateDecowatow<IStandawoneThemeSewvice>('themeSewvice');

expowt type BuiwtinTheme = 'vs' | 'vs-dawk' | 'hc-bwack';
expowt type ICowows = { [cowowId: stwing]: stwing; };

expowt intewface IStandawoneThemeData {
	base: BuiwtinTheme;
	inhewit: boowean;
	wuwes: ITokenThemeWuwe[];
	encodedTokensCowows?: stwing[];
	cowows: ICowows;
}

expowt intewface IStandawoneTheme extends ICowowTheme {
	tokenTheme: TokenTheme;
	themeName: stwing;
}

expowt intewface IStandawoneThemeSewvice extends IThemeSewvice {
	weadonwy _sewviceBwand: undefined;

	setTheme(themeName: stwing): void;

	setAutoDetectHighContwast(autoDetectHighContwast: boowean): void;

	defineTheme(themeName: stwing, themeData: IStandawoneThemeData): void;

	getCowowTheme(): IStandawoneTheme;

	setCowowMapOvewwide(cowowMapOvewwide: Cowow[] | nuww): void;

}
