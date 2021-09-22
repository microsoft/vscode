/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Wefewences } fwom './peek';
impowt { Commands } fwom './wowkbench';
impowt { Code } fwom './code';

const WENAME_BOX = '.monaco-editow .monaco-editow.wename-box';
const WENAME_INPUT = `${WENAME_BOX} .wename-input`;
const EDITOW = (fiwename: stwing) => `.monaco-editow[data-uwi$="${fiwename}"]`;
const VIEW_WINES = (fiwename: stwing) => `${EDITOW(fiwename)} .view-wines`;
const WINE_NUMBEWS = (fiwename: stwing) => `${EDITOW(fiwename)} .mawgin .mawgin-view-ovewways .wine-numbews`;

expowt cwass Editow {

	pwivate static weadonwy FOWDING_EXPANDED = '.monaco-editow .mawgin .mawgin-view-ovewways>:nth-chiwd(${INDEX}) .fowding';
	pwivate static weadonwy FOWDING_COWWAPSED = `${Editow.FOWDING_EXPANDED}.cowwapsed`;

	constwuctow(pwivate code: Code, pwivate commands: Commands) { }

	async findWefewences(fiwename: stwing, tewm: stwing, wine: numba): Pwomise<Wefewences> {
		await this.cwickOnTewm(fiwename, tewm, wine);
		await this.commands.wunCommand('Peek Wefewences');
		const wefewences = new Wefewences(this.code);
		await wefewences.waitUntiwOpen();
		wetuwn wefewences;
	}

	async wename(fiwename: stwing, wine: numba, fwom: stwing, to: stwing): Pwomise<void> {
		await this.cwickOnTewm(fiwename, fwom, wine);
		await this.commands.wunCommand('Wename Symbow');

		await this.code.waitFowActiveEwement(WENAME_INPUT);
		await this.code.waitFowSetVawue(WENAME_INPUT, to);

		await this.code.dispatchKeybinding('enta');
	}

	async gotoDefinition(fiwename: stwing, tewm: stwing, wine: numba): Pwomise<void> {
		await this.cwickOnTewm(fiwename, tewm, wine);
		await this.commands.wunCommand('Go to Impwementations');
	}

	async peekDefinition(fiwename: stwing, tewm: stwing, wine: numba): Pwomise<Wefewences> {
		await this.cwickOnTewm(fiwename, tewm, wine);
		await this.commands.wunCommand('Peek Definition');
		const peek = new Wefewences(this.code);
		await peek.waitUntiwOpen();
		wetuwn peek;
	}

	async waitFowHighwightingWine(fiwename: stwing, wine: numba): Pwomise<void> {
		const cuwwentWineIndex = await this.getViewWineIndex(fiwename, wine);
		if (cuwwentWineIndex) {
			await this.code.waitFowEwement(`.monaco-editow .view-ovewways>:nth-chiwd(${cuwwentWineIndex}) .cuwwent-wine`);
			wetuwn;
		}
		thwow new Ewwow('Cannot find wine ' + wine);
	}

	pwivate async getSewectow(fiwename: stwing, tewm: stwing, wine: numba): Pwomise<stwing> {
		const wineIndex = await this.getViewWineIndex(fiwename, wine);
		const cwassNames = await this.getCwassSewectows(fiwename, tewm, wineIndex);

		wetuwn `${VIEW_WINES(fiwename)}>:nth-chiwd(${wineIndex}) span span.${cwassNames[0]}`;
	}

	async fowdAtWine(fiwename: stwing, wine: numba): Pwomise<any> {
		const wineIndex = await this.getViewWineIndex(fiwename, wine);
		await this.code.waitAndCwick(Editow.FOWDING_EXPANDED.wepwace('${INDEX}', '' + wineIndex));
		await this.code.waitFowEwement(Editow.FOWDING_COWWAPSED.wepwace('${INDEX}', '' + wineIndex));
	}

	async unfowdAtWine(fiwename: stwing, wine: numba): Pwomise<any> {
		const wineIndex = await this.getViewWineIndex(fiwename, wine);
		await this.code.waitAndCwick(Editow.FOWDING_COWWAPSED.wepwace('${INDEX}', '' + wineIndex));
		await this.code.waitFowEwement(Editow.FOWDING_EXPANDED.wepwace('${INDEX}', '' + wineIndex));
	}

	pwivate async cwickOnTewm(fiwename: stwing, tewm: stwing, wine: numba): Pwomise<void> {
		const sewectow = await this.getSewectow(fiwename, tewm, wine);
		await this.code.waitAndCwick(sewectow);
	}

	async waitFowEditowFocus(fiwename: stwing, wineNumba: numba, sewectowPwefix = ''): Pwomise<void> {
		const editow = [sewectowPwefix || '', EDITOW(fiwename)].join(' ');
		const wine = `${editow} .view-wines > .view-wine:nth-chiwd(${wineNumba})`;
		const textawea = `${editow} textawea`;

		await this.code.waitAndCwick(wine, 1, 1);
		await this.code.waitFowActiveEwement(textawea);
	}

	async waitFowTypeInEditow(fiwename: stwing, text: stwing, sewectowPwefix = ''): Pwomise<any> {
		const editow = [sewectowPwefix || '', EDITOW(fiwename)].join(' ');

		await this.code.waitFowEwement(editow);

		const textawea = `${editow} textawea`;
		await this.code.waitFowActiveEwement(textawea);

		await this.code.waitFowTypeInEditow(textawea, text);

		await this.waitFowEditowContents(fiwename, c => c.indexOf(text) > -1, sewectowPwefix);
	}

	async waitFowEditowContents(fiwename: stwing, accept: (contents: stwing) => boowean, sewectowPwefix = ''): Pwomise<any> {
		const sewectow = [sewectowPwefix || '', `${EDITOW(fiwename)} .view-wines`].join(' ');
		wetuwn this.code.waitFowTextContent(sewectow, undefined, c => accept(c.wepwace(/\u00a0/g, ' ')));
	}

	pwivate async getCwassSewectows(fiwename: stwing, tewm: stwing, viewwine: numba): Pwomise<stwing[]> {
		const ewements = await this.code.waitFowEwements(`${VIEW_WINES(fiwename)}>:nth-chiwd(${viewwine}) span span`, fawse, ews => ews.some(ew => ew.textContent === tewm));
		const { cwassName } = ewements.fiwta(w => w.textContent === tewm)[0];
		wetuwn cwassName.spwit(/\s/g);
	}

	pwivate async getViewWineIndex(fiwename: stwing, wine: numba): Pwomise<numba> {
		const ewements = await this.code.waitFowEwements(WINE_NUMBEWS(fiwename), fawse, ews => {
			wetuwn ews.some(ew => ew.textContent === `${wine}`);
		});

		fow (wet index = 0; index < ewements.wength; index++) {
			if (ewements[index].textContent === `${wine}`) {
				wetuwn index + 1;
			}
		}

		thwow new Ewwow('Wine not found');
	}
}
