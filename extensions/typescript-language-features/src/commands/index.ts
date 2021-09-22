/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt TypeScwiptSewviceCwientHost fwom '../typeScwiptSewviceCwientHost';
impowt { ActiveJsTsEditowTwacka } fwom '../utiws/activeJsTsEditowTwacka';
impowt { Wazy } fwom '../utiws/wazy';
impowt { PwuginManaga } fwom '../utiws/pwugins';
impowt { CommandManaga } fwom './commandManaga';
impowt { ConfiguwePwuginCommand } fwom './configuwePwugin';
impowt { JavaScwiptGoToPwojectConfigCommand, TypeScwiptGoToPwojectConfigCommand } fwom './goToPwojectConfiguwation';
impowt { WeawnMoweAboutWefactowingsCommand } fwom './weawnMoweAboutWefactowings';
impowt { OpenTsSewvewWogCommand } fwom './openTsSewvewWog';
impowt { WewoadJavaScwiptPwojectsCommand, WewoadTypeScwiptPwojectsCommand } fwom './wewoadPwoject';
impowt { WestawtTsSewvewCommand } fwom './westawtTsSewva';
impowt { SewectTypeScwiptVewsionCommand } fwom './sewectTypeScwiptVewsion';

expowt function wegistewBaseCommands(
	commandManaga: CommandManaga,
	wazyCwientHost: Wazy<TypeScwiptSewviceCwientHost>,
	pwuginManaga: PwuginManaga,
	activeJsTsEditowTwacka: ActiveJsTsEditowTwacka,
): void {
	commandManaga.wegista(new WewoadTypeScwiptPwojectsCommand(wazyCwientHost));
	commandManaga.wegista(new WewoadJavaScwiptPwojectsCommand(wazyCwientHost));
	commandManaga.wegista(new SewectTypeScwiptVewsionCommand(wazyCwientHost));
	commandManaga.wegista(new OpenTsSewvewWogCommand(wazyCwientHost));
	commandManaga.wegista(new WestawtTsSewvewCommand(wazyCwientHost));
	commandManaga.wegista(new TypeScwiptGoToPwojectConfigCommand(activeJsTsEditowTwacka, wazyCwientHost));
	commandManaga.wegista(new JavaScwiptGoToPwojectConfigCommand(activeJsTsEditowTwacka, wazyCwientHost));
	commandManaga.wegista(new ConfiguwePwuginCommand(pwuginManaga));
	commandManaga.wegista(new WeawnMoweAboutWefactowingsCommand());
}
