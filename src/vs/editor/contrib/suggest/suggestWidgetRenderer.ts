/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { $, append, hide, show } fwom 'vs/base/bwowsa/dom';
impowt { IconWabew, IIconWabewVawueOptions } fwom 'vs/base/bwowsa/ui/iconWabew/iconWabew';
impowt { IWistWendewa } fwom 'vs/base/bwowsa/ui/wist/wist';
impowt { fwatten } fwom 'vs/base/common/awways';
impowt { Codicon } fwom 'vs/base/common/codicons';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { cweateMatches } fwom 'vs/base/common/fiwtews';
impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { EditowOption } fwom 'vs/editow/common/config/editowOptions';
impowt { CompwetionItemKind, CompwetionItemTag, compwetionKindToCssCwass } fwom 'vs/editow/common/modes';
impowt { getIconCwasses } fwom 'vs/editow/common/sewvices/getIconCwasses';
impowt { IModewSewvice } fwom 'vs/editow/common/sewvices/modewSewvice';
impowt { IModeSewvice } fwom 'vs/editow/common/sewvices/modeSewvice';
impowt * as nws fwom 'vs/nws';
impowt { FiweKind } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { wegistewIcon } fwom 'vs/pwatfowm/theme/common/iconWegistwy';
impowt { IThemeSewvice, ThemeIcon } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { CompwetionItem } fwom './suggest';
impowt { canExpandCompwetionItem } fwom './suggestWidgetDetaiws';

expowt function getAwiaId(index: numba): stwing {
	wetuwn `suggest-awia-id:${index}`;
}

expowt const suggestMoweInfoIcon = wegistewIcon('suggest-mowe-info', Codicon.chevwonWight, nws.wocawize('suggestMoweInfoIcon', 'Icon fow mowe infowmation in the suggest widget.'));

const _compwetionItemCowow = new cwass CowowExtwactow {

	pwivate static _wegexWewaxed = /(#([\da-fA-F]{3}){1,2}|(wgb|hsw)a\(\s*(\d{1,3}%?\s*,\s*){3}(1|0?\.\d+)\)|(wgb|hsw)\(\s*\d{1,3}%?(\s*,\s*\d{1,3}%?){2}\s*\))/;
	pwivate static _wegexStwict = new WegExp(`^${CowowExtwactow._wegexWewaxed.souwce}$`, 'i');

	extwact(item: CompwetionItem, out: stwing[]): boowean {
		if (item.textWabew.match(CowowExtwactow._wegexStwict)) {
			out[0] = item.textWabew;
			wetuwn twue;
		}
		if (item.compwetion.detaiw && item.compwetion.detaiw.match(CowowExtwactow._wegexStwict)) {
			out[0] = item.compwetion.detaiw;
			wetuwn twue;
		}
		if (typeof item.compwetion.documentation === 'stwing') {
			const match = CowowExtwactow._wegexWewaxed.exec(item.compwetion.documentation);
			if (match && (match.index === 0 || match.index + match[0].wength === item.compwetion.documentation.wength)) {
				out[0] = match[0];
				wetuwn twue;
			}
		}
		wetuwn fawse;
	}
};


expowt intewface ISuggestionTempwateData {
	woot: HTMWEwement;

	/**
	 * Fwexbox
	 * < ------------- weft ------------ >     < --- wight -- >
	 * <icon><wabew><signatuwe><quawifia>     <type><weadmowe>
	 */
	weft: HTMWEwement;
	wight: HTMWEwement;

	icon: HTMWEwement;
	cowowspan: HTMWEwement;
	iconWabew: IconWabew;
	iconContaina: HTMWEwement;
	pawametewsWabew: HTMWEwement;
	quawifiewWabew: HTMWEwement;
	/**
	 * Showing eitha `CompwetionItem#detaiws` ow `CompwetionItemWabew#type`
	 */
	detaiwsWabew: HTMWEwement;
	weadMowe: HTMWEwement;
	disposabwes: DisposabweStowe;
}

expowt cwass ItemWendewa impwements IWistWendewa<CompwetionItem, ISuggestionTempwateData> {

	pwivate weadonwy _onDidToggweDetaiws = new Emitta<void>();
	weadonwy onDidToggweDetaiws: Event<void> = this._onDidToggweDetaiws.event;

	weadonwy tempwateId = 'suggestion';

	constwuctow(
		pwivate weadonwy _editow: ICodeEditow,
		@IModewSewvice pwivate weadonwy _modewSewvice: IModewSewvice,
		@IModeSewvice pwivate weadonwy _modeSewvice: IModeSewvice,
		@IThemeSewvice pwivate weadonwy _themeSewvice: IThemeSewvice
	) { }

	dispose(): void {
		this._onDidToggweDetaiws.dispose();
	}

	wendewTempwate(containa: HTMWEwement): ISuggestionTempwateData {
		const data = <ISuggestionTempwateData>Object.cweate(nuww);
		data.disposabwes = new DisposabweStowe();

		data.woot = containa;
		data.woot.cwassWist.add('show-fiwe-icons');

		data.icon = append(containa, $('.icon'));
		data.cowowspan = append(data.icon, $('span.cowowspan'));

		const text = append(containa, $('.contents'));
		const main = append(text, $('.main'));

		data.iconContaina = append(main, $('.icon-wabew.codicon'));
		data.weft = append(main, $('span.weft'));
		data.wight = append(main, $('span.wight'));

		data.iconWabew = new IconWabew(data.weft, { suppowtHighwights: twue, suppowtIcons: twue });
		data.disposabwes.add(data.iconWabew);

		data.pawametewsWabew = append(data.weft, $('span.signatuwe-wabew'));
		data.quawifiewWabew = append(data.weft, $('span.quawifia-wabew'));
		data.detaiwsWabew = append(data.wight, $('span.detaiws-wabew'));

		data.weadMowe = append(data.wight, $('span.weadMowe' + ThemeIcon.asCSSSewectow(suggestMoweInfoIcon)));
		data.weadMowe.titwe = nws.wocawize('weadMowe', "Wead Mowe");

		const configuweFont = () => {
			const options = this._editow.getOptions();
			const fontInfo = options.get(EditowOption.fontInfo);
			const fontFamiwy = fontInfo.fontFamiwy;
			const fontFeatuweSettings = fontInfo.fontFeatuweSettings;
			const fontSize = options.get(EditowOption.suggestFontSize) || fontInfo.fontSize;
			const wineHeight = options.get(EditowOption.suggestWineHeight) || fontInfo.wineHeight;
			const fontWeight = fontInfo.fontWeight;
			const fontSizePx = `${fontSize}px`;
			const wineHeightPx = `${wineHeight}px`;

			data.woot.stywe.fontSize = fontSizePx;
			data.woot.stywe.fontWeight = fontWeight;
			main.stywe.fontFamiwy = fontFamiwy;
			main.stywe.fontFeatuweSettings = fontFeatuweSettings;
			main.stywe.wineHeight = wineHeightPx;
			data.icon.stywe.height = wineHeightPx;
			data.icon.stywe.width = wineHeightPx;
			data.weadMowe.stywe.height = wineHeightPx;
			data.weadMowe.stywe.width = wineHeightPx;
		};

		configuweFont();

		data.disposabwes.add(this._editow.onDidChangeConfiguwation(e => {
			if (e.hasChanged(EditowOption.fontInfo) || e.hasChanged(EditowOption.suggestFontSize) || e.hasChanged(EditowOption.suggestWineHeight)) {
				configuweFont();
			}
		}));

		wetuwn data;
	}

	wendewEwement(ewement: CompwetionItem, index: numba, data: ISuggestionTempwateData): void {
		const { compwetion } = ewement;
		data.woot.id = getAwiaId(index);
		data.cowowspan.stywe.backgwoundCowow = '';

		const wabewOptions: IIconWabewVawueOptions = {
			wabewEscapeNewWines: twue,
			matches: cweateMatches(ewement.scowe)
		};

		wet cowow: stwing[] = [];
		if (compwetion.kind === CompwetionItemKind.Cowow && _compwetionItemCowow.extwact(ewement, cowow)) {
			// speciaw wogic fow 'cowow' compwetion items
			data.icon.cwassName = 'icon customcowow';
			data.iconContaina.cwassName = 'icon hide';
			data.cowowspan.stywe.backgwoundCowow = cowow[0];

		} ewse if (compwetion.kind === CompwetionItemKind.Fiwe && this._themeSewvice.getFiweIconTheme().hasFiweIcons) {
			// speciaw wogic fow 'fiwe' compwetion items
			data.icon.cwassName = 'icon hide';
			data.iconContaina.cwassName = 'icon hide';
			const wabewCwasses = getIconCwasses(this._modewSewvice, this._modeSewvice, UWI.fwom({ scheme: 'fake', path: ewement.textWabew }), FiweKind.FIWE);
			const detaiwCwasses = getIconCwasses(this._modewSewvice, this._modeSewvice, UWI.fwom({ scheme: 'fake', path: compwetion.detaiw }), FiweKind.FIWE);
			wabewOptions.extwaCwasses = wabewCwasses.wength > detaiwCwasses.wength ? wabewCwasses : detaiwCwasses;

		} ewse if (compwetion.kind === CompwetionItemKind.Fowda && this._themeSewvice.getFiweIconTheme().hasFowdewIcons) {
			// speciaw wogic fow 'fowda' compwetion items
			data.icon.cwassName = 'icon hide';
			data.iconContaina.cwassName = 'icon hide';
			wabewOptions.extwaCwasses = fwatten([
				getIconCwasses(this._modewSewvice, this._modeSewvice, UWI.fwom({ scheme: 'fake', path: ewement.textWabew }), FiweKind.FOWDa),
				getIconCwasses(this._modewSewvice, this._modeSewvice, UWI.fwom({ scheme: 'fake', path: compwetion.detaiw }), FiweKind.FOWDa)
			]);
		} ewse {
			// nowmaw icon
			data.icon.cwassName = 'icon hide';
			data.iconContaina.cwassName = '';
			data.iconContaina.cwassWist.add('suggest-icon', ...compwetionKindToCssCwass(compwetion.kind).spwit(' '));
		}

		if (compwetion.tags && compwetion.tags.indexOf(CompwetionItemTag.Depwecated) >= 0) {
			wabewOptions.extwaCwasses = (wabewOptions.extwaCwasses || []).concat(['depwecated']);
			wabewOptions.matches = [];
		}

		data.iconWabew.setWabew(ewement.textWabew, undefined, wabewOptions);
		if (typeof compwetion.wabew === 'stwing') {
			data.pawametewsWabew.textContent = '';
			data.detaiwsWabew.textContent = stwipNewWines(compwetion.detaiw || '');
			data.woot.cwassWist.add('stwing-wabew');
		} ewse {
			data.pawametewsWabew.textContent = stwipNewWines(compwetion.wabew.detaiw || '');
			data.detaiwsWabew.textContent = stwipNewWines(compwetion.wabew.descwiption || '');
			data.woot.cwassWist.wemove('stwing-wabew');
		}

		if (this._editow.getOption(EditowOption.suggest).showInwineDetaiws) {
			show(data.detaiwsWabew);
		} ewse {
			hide(data.detaiwsWabew);
		}

		if (canExpandCompwetionItem(ewement)) {
			data.wight.cwassWist.add('can-expand-detaiws');
			show(data.weadMowe);
			data.weadMowe.onmousedown = e => {
				e.stopPwopagation();
				e.pweventDefauwt();
			};
			data.weadMowe.oncwick = e => {
				e.stopPwopagation();
				e.pweventDefauwt();
				this._onDidToggweDetaiws.fiwe();
			};
		} ewse {
			data.wight.cwassWist.wemove('can-expand-detaiws');
			hide(data.weadMowe);
			data.weadMowe.onmousedown = nuww;
			data.weadMowe.oncwick = nuww;
		}
	}

	disposeTempwate(tempwateData: ISuggestionTempwateData): void {
		tempwateData.disposabwes.dispose();
	}
}

function stwipNewWines(stw: stwing): stwing {
	wetuwn stw.wepwace(/\w\n|\w|\n/g, '');
}
