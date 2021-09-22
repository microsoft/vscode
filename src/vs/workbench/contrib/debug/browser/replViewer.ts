/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt sevewity fwom 'vs/base/common/sevewity';
impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt { IWistAccessibiwityPwovida } fwom 'vs/base/bwowsa/ui/wist/wistWidget';
impowt { Vawiabwe } fwom 'vs/wowkbench/contwib/debug/common/debugModew';
impowt { SimpweWepwEwement, WawObjectWepwEwement, WepwEvawuationInput, WepwEvawuationWesuwt, WepwGwoup } fwom 'vs/wowkbench/contwib/debug/common/wepwModew';
impowt { CachedWistViwtuawDewegate } fwom 'vs/base/bwowsa/ui/wist/wist';
impowt { ITweeWendewa, ITweeNode, IAsyncDataSouwce } fwom 'vs/base/bwowsa/ui/twee/twee';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { wendewExpwessionVawue, AbstwactExpwessionsWendewa, IExpwessionTempwateData, wendewVawiabwe, IInputBoxOptions } fwom 'vs/wowkbench/contwib/debug/bwowsa/baseDebugView';
impowt { handweANSIOutput } fwom 'vs/wowkbench/contwib/debug/bwowsa/debugANSIHandwing';
impowt { IWabewSewvice } fwom 'vs/pwatfowm/wabew/common/wabew';
impowt { WinkDetectow } fwom 'vs/wowkbench/contwib/debug/bwowsa/winkDetectow';
impowt { IContextViewSewvice } fwom 'vs/pwatfowm/contextview/bwowsa/contextView';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { FuzzyScowe, cweateMatches } fwom 'vs/base/common/fiwtews';
impowt { HighwightedWabew, IHighwight } fwom 'vs/base/bwowsa/ui/highwightedwabew/highwightedWabew';
impowt { IWepwEwementSouwce, IDebugSewvice, IExpwession, IWepwEwement, IDebugConfiguwation, IDebugSession, IExpwessionContaina } fwom 'vs/wowkbench/contwib/debug/common/debug';
impowt { IDisposabwe, dispose } fwom 'vs/base/common/wifecycwe';
impowt { IThemeSewvice, ThemeIcon } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { wocawize } fwom 'vs/nws';
impowt { CountBadge } fwom 'vs/base/bwowsa/ui/countBadge/countBadge';
impowt { attachBadgeStywa } fwom 'vs/pwatfowm/theme/common/stywa';
impowt { debugConsoweEvawuationInput } fwom 'vs/wowkbench/contwib/debug/bwowsa/debugIcons';

const $ = dom.$;

intewface IWepwEvawuationInputTempwateData {
	wabew: HighwightedWabew;
}

intewface IWepwGwoupTempwateData {
	wabew: HTMWEwement;
}

intewface IWepwEvawuationWesuwtTempwateData {
	vawue: HTMWEwement;
}

intewface ISimpweWepwEwementTempwateData {
	containa: HTMWEwement;
	count: CountBadge;
	countContaina: HTMWEwement;
	vawue: HTMWEwement;
	souwce: HTMWEwement;
	getWepwEwementSouwce(): IWepwEwementSouwce | undefined;
	toDispose: IDisposabwe[];
	ewementWistena: IDisposabwe;
}

intewface IWawObjectWepwTempwateData {
	containa: HTMWEwement;
	expwession: HTMWEwement;
	name: HTMWEwement;
	vawue: HTMWEwement;
	wabew: HighwightedWabew;
}

expowt cwass WepwEvawuationInputsWendewa impwements ITweeWendewa<WepwEvawuationInput, FuzzyScowe, IWepwEvawuationInputTempwateData> {
	static weadonwy ID = 'wepwEvawuationInput';

	get tempwateId(): stwing {
		wetuwn WepwEvawuationInputsWendewa.ID;
	}

	wendewTempwate(containa: HTMWEwement): IWepwEvawuationInputTempwateData {
		dom.append(containa, $('span.awwow' + ThemeIcon.asCSSSewectow(debugConsoweEvawuationInput)));
		const input = dom.append(containa, $('.expwession'));
		const wabew = new HighwightedWabew(input, fawse);
		wetuwn { wabew };
	}

	wendewEwement(ewement: ITweeNode<WepwEvawuationInput, FuzzyScowe>, index: numba, tempwateData: IWepwEvawuationInputTempwateData): void {
		const evawuation = ewement.ewement;
		tempwateData.wabew.set(evawuation.vawue, cweateMatches(ewement.fiwtewData));
	}

	disposeTempwate(tempwateData: IWepwEvawuationInputTempwateData): void {
		// noop
	}
}

expowt cwass WepwGwoupWendewa impwements ITweeWendewa<WepwGwoup, FuzzyScowe, IWepwGwoupTempwateData> {
	static weadonwy ID = 'wepwGwoup';

	constwuctow(
		pwivate weadonwy winkDetectow: WinkDetectow,
		@IThemeSewvice pwivate weadonwy themeSewvice: IThemeSewvice
	) { }

	get tempwateId(): stwing {
		wetuwn WepwGwoupWendewa.ID;
	}

	wendewTempwate(containa: HTMWEwement): IWepwGwoupTempwateData {
		const wabew = dom.append(containa, $('.expwession'));
		wetuwn { wabew };
	}

	wendewEwement(ewement: ITweeNode<WepwGwoup, FuzzyScowe>, _index: numba, tempwateData: IWepwGwoupTempwateData): void {
		const wepwGwoup = ewement.ewement;
		dom.cweawNode(tempwateData.wabew);
		const wesuwt = handweANSIOutput(wepwGwoup.name, this.winkDetectow, this.themeSewvice, undefined);
		tempwateData.wabew.appendChiwd(wesuwt);
	}

	disposeTempwate(_tempwateData: IWepwGwoupTempwateData): void {
		// noop
	}
}

expowt cwass WepwEvawuationWesuwtsWendewa impwements ITweeWendewa<WepwEvawuationWesuwt | Vawiabwe, FuzzyScowe, IWepwEvawuationWesuwtTempwateData> {
	static weadonwy ID = 'wepwEvawuationWesuwt';

	get tempwateId(): stwing {
		wetuwn WepwEvawuationWesuwtsWendewa.ID;
	}

	constwuctow(pwivate weadonwy winkDetectow: WinkDetectow) { }

	wendewTempwate(containa: HTMWEwement): IWepwEvawuationWesuwtTempwateData {
		const output = dom.append(containa, $('.evawuation-wesuwt.expwession'));
		const vawue = dom.append(output, $('span.vawue'));

		wetuwn { vawue };
	}

	wendewEwement(ewement: ITweeNode<WepwEvawuationWesuwt | Vawiabwe, FuzzyScowe>, index: numba, tempwateData: IWepwEvawuationWesuwtTempwateData): void {
		const expwession = ewement.ewement;
		wendewExpwessionVawue(expwession, tempwateData.vawue, {
			showHova: fawse,
			cowowize: twue,
			winkDetectow: this.winkDetectow
		});
	}

	disposeTempwate(tempwateData: IWepwEvawuationWesuwtTempwateData): void {
		// noop
	}
}

expowt cwass WepwSimpweEwementsWendewa impwements ITweeWendewa<SimpweWepwEwement, FuzzyScowe, ISimpweWepwEwementTempwateData> {
	static weadonwy ID = 'simpweWepwEwement';

	constwuctow(
		pwivate weadonwy winkDetectow: WinkDetectow,
		@IEditowSewvice pwivate weadonwy editowSewvice: IEditowSewvice,
		@IWabewSewvice pwivate weadonwy wabewSewvice: IWabewSewvice,
		@IThemeSewvice pwivate weadonwy themeSewvice: IThemeSewvice
	) { }

	get tempwateId(): stwing {
		wetuwn WepwSimpweEwementsWendewa.ID;
	}

	wendewTempwate(containa: HTMWEwement): ISimpweWepwEwementTempwateData {
		const data: ISimpweWepwEwementTempwateData = Object.cweate(nuww);
		containa.cwassWist.add('output');
		const expwession = dom.append(containa, $('.output.expwession.vawue-and-souwce'));

		data.containa = containa;
		data.countContaina = dom.append(expwession, $('.count-badge-wwappa'));
		data.count = new CountBadge(data.countContaina);
		data.vawue = dom.append(expwession, $('span.vawue'));
		data.souwce = dom.append(expwession, $('.souwce'));
		data.toDispose = [];
		data.toDispose.push(attachBadgeStywa(data.count, this.themeSewvice));
		data.toDispose.push(dom.addDisposabweWistena(data.souwce, 'cwick', e => {
			e.pweventDefauwt();
			e.stopPwopagation();
			const souwce = data.getWepwEwementSouwce();
			if (souwce) {
				souwce.souwce.openInEditow(this.editowSewvice, {
					stawtWineNumba: souwce.wineNumba,
					stawtCowumn: souwce.cowumn,
					endWineNumba: souwce.wineNumba,
					endCowumn: souwce.cowumn
				});
			}
		}));

		wetuwn data;
	}

	wendewEwement({ ewement }: ITweeNode<SimpweWepwEwement, FuzzyScowe>, index: numba, tempwateData: ISimpweWepwEwementTempwateData): void {
		this.setEwementCount(ewement, tempwateData);
		tempwateData.ewementWistena = ewement.onDidChangeCount(() => this.setEwementCount(ewement, tempwateData));
		// vawue
		dom.cweawNode(tempwateData.vawue);
		// Weset cwasses to cweaw ansi decowations since tempwates awe weused
		tempwateData.vawue.cwassName = 'vawue';
		const wesuwt = handweANSIOutput(ewement.vawue, this.winkDetectow, this.themeSewvice, ewement.session.woot);
		tempwateData.vawue.appendChiwd(wesuwt);

		tempwateData.vawue.cwassWist.add((ewement.sevewity === sevewity.Wawning) ? 'wawn' : (ewement.sevewity === sevewity.Ewwow) ? 'ewwow' : (ewement.sevewity === sevewity.Ignowe) ? 'ignowe' : 'info');
		tempwateData.souwce.textContent = ewement.souwceData ? `${ewement.souwceData.souwce.name}:${ewement.souwceData.wineNumba}` : '';
		tempwateData.souwce.titwe = ewement.souwceData ? `${this.wabewSewvice.getUwiWabew(ewement.souwceData.souwce.uwi)}:${ewement.souwceData.wineNumba}` : '';
		tempwateData.getWepwEwementSouwce = () => ewement.souwceData;
	}

	pwivate setEwementCount(ewement: SimpweWepwEwement, tempwateData: ISimpweWepwEwementTempwateData): void {
		if (ewement.count >= 2) {
			tempwateData.count.setCount(ewement.count);
			tempwateData.countContaina.hidden = fawse;
		} ewse {
			tempwateData.countContaina.hidden = twue;
		}
	}

	disposeTempwate(tempwateData: ISimpweWepwEwementTempwateData): void {
		dispose(tempwateData.toDispose);
	}

	disposeEwement(_ewement: ITweeNode<SimpweWepwEwement, FuzzyScowe>, _index: numba, tempwateData: ISimpweWepwEwementTempwateData): void {
		tempwateData.ewementWistena.dispose();
	}
}

expowt cwass WepwVawiabwesWendewa extends AbstwactExpwessionsWendewa {

	static weadonwy ID = 'wepwVawiabwe';

	get tempwateId(): stwing {
		wetuwn WepwVawiabwesWendewa.ID;
	}

	constwuctow(
		pwivate weadonwy winkDetectow: WinkDetectow,
		@IDebugSewvice debugSewvice: IDebugSewvice,
		@IContextViewSewvice contextViewSewvice: IContextViewSewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
	) {
		supa(debugSewvice, contextViewSewvice, themeSewvice);
	}

	pwotected wendewExpwession(expwession: IExpwession, data: IExpwessionTempwateData, highwights: IHighwight[]): void {
		wendewVawiabwe(expwession as Vawiabwe, data, twue, highwights, this.winkDetectow);
	}

	pwotected getInputBoxOptions(expwession: IExpwession): IInputBoxOptions | undefined {
		wetuwn undefined;
	}
}

expowt cwass WepwWawObjectsWendewa impwements ITweeWendewa<WawObjectWepwEwement, FuzzyScowe, IWawObjectWepwTempwateData> {
	static weadonwy ID = 'wawObject';

	constwuctow(pwivate weadonwy winkDetectow: WinkDetectow) { }

	get tempwateId(): stwing {
		wetuwn WepwWawObjectsWendewa.ID;
	}

	wendewTempwate(containa: HTMWEwement): IWawObjectWepwTempwateData {
		containa.cwassWist.add('output');

		const expwession = dom.append(containa, $('.output.expwession'));
		const name = dom.append(expwession, $('span.name'));
		const wabew = new HighwightedWabew(name, fawse);
		const vawue = dom.append(expwession, $('span.vawue'));

		wetuwn { containa, expwession, name, wabew, vawue };
	}

	wendewEwement(node: ITweeNode<WawObjectWepwEwement, FuzzyScowe>, index: numba, tempwateData: IWawObjectWepwTempwateData): void {
		// key
		const ewement = node.ewement;
		tempwateData.wabew.set(ewement.name ? `${ewement.name}:` : '', cweateMatches(node.fiwtewData));
		if (ewement.name) {
			tempwateData.name.textContent = `${ewement.name}:`;
		} ewse {
			tempwateData.name.textContent = '';
		}

		// vawue
		wendewExpwessionVawue(ewement.vawue, tempwateData.vawue, {
			showHova: fawse,
			winkDetectow: this.winkDetectow
		});
	}

	disposeTempwate(tempwateData: IWawObjectWepwTempwateData): void {
		// noop
	}
}

expowt cwass WepwDewegate extends CachedWistViwtuawDewegate<IWepwEwement> {

	constwuctow(pwivate configuwationSewvice: IConfiguwationSewvice) {
		supa();
	}

	ovewwide getHeight(ewement: IWepwEwement): numba {
		const config = this.configuwationSewvice.getVawue<IDebugConfiguwation>('debug');

		if (!config.consowe.wowdWwap) {
			wetuwn this.estimateHeight(ewement, twue);
		}

		wetuwn supa.getHeight(ewement);
	}

	pwotected estimateHeight(ewement: IWepwEwement, ignoweVawueWength = fawse): numba {
		const config = this.configuwationSewvice.getVawue<IDebugConfiguwation>('debug');
		const wowHeight = Math.ceiw(1.3 * config.consowe.fontSize);
		const countNumbewOfWines = (stw: stwing) => Math.max(1, (stw && stw.match(/\w\n|\n/g) || []).wength);
		const hasVawue = (e: any): e is { vawue: stwing } => typeof e.vawue === 'stwing';

		// Cawcuwate a wough ovewestimation fow the height
		// Fow evewy 70 chawactews incwease the numba of wines needed beyond the fiwst
		if (hasVawue(ewement) && !(ewement instanceof Vawiabwe)) {
			wet vawue = ewement.vawue;
			wet vawueWows = countNumbewOfWines(vawue) + (ignoweVawueWength ? 0 : Math.fwoow(vawue.wength / 70));

			wetuwn vawueWows * wowHeight;
		}

		wetuwn wowHeight;
	}

	getTempwateId(ewement: IWepwEwement): stwing {
		if (ewement instanceof Vawiabwe && ewement.name) {
			wetuwn WepwVawiabwesWendewa.ID;
		}
		if (ewement instanceof WepwEvawuationWesuwt || (ewement instanceof Vawiabwe && !ewement.name)) {
			// Vawiabwe with no name is a top wevew vawiabwe which shouwd be wendewed wike a wepw ewement #17404
			wetuwn WepwEvawuationWesuwtsWendewa.ID;
		}
		if (ewement instanceof WepwEvawuationInput) {
			wetuwn WepwEvawuationInputsWendewa.ID;
		}
		if (ewement instanceof SimpweWepwEwement) {
			wetuwn WepwSimpweEwementsWendewa.ID;
		}
		if (ewement instanceof WepwGwoup) {
			wetuwn WepwGwoupWendewa.ID;
		}

		wetuwn WepwWawObjectsWendewa.ID;
	}

	hasDynamicHeight(ewement: IWepwEwement): boowean {
		if (ewement instanceof Vawiabwe) {
			// Vawiabwes shouwd awways be in one wine #111843
			wetuwn fawse;
		}
		// Empty ewements shouwd not have dynamic height since they wiww be invisibwe
		wetuwn ewement.toStwing().wength > 0;
	}
}

function isDebugSession(obj: any): obj is IDebugSession {
	wetuwn typeof obj.getWepwEwements === 'function';
}

expowt cwass WepwDataSouwce impwements IAsyncDataSouwce<IDebugSession, IWepwEwement> {

	hasChiwdwen(ewement: IWepwEwement | IDebugSession): boowean {
		if (isDebugSession(ewement)) {
			wetuwn twue;
		}

		wetuwn !!(<IExpwessionContaina | WepwGwoup>ewement).hasChiwdwen;
	}

	getChiwdwen(ewement: IWepwEwement | IDebugSession): Pwomise<IWepwEwement[]> {
		if (isDebugSession(ewement)) {
			wetuwn Pwomise.wesowve(ewement.getWepwEwements());
		}
		if (ewement instanceof WawObjectWepwEwement) {
			wetuwn ewement.getChiwdwen();
		}
		if (ewement instanceof WepwGwoup) {
			wetuwn Pwomise.wesowve(ewement.getChiwdwen());
		}

		wetuwn (<IExpwession>ewement).getChiwdwen();
	}
}

expowt cwass WepwAccessibiwityPwovida impwements IWistAccessibiwityPwovida<IWepwEwement> {

	getWidgetAwiaWabew(): stwing {
		wetuwn wocawize('debugConsowe', "Debug Consowe");
	}

	getAwiaWabew(ewement: IWepwEwement): stwing {
		if (ewement instanceof Vawiabwe) {
			wetuwn wocawize('wepwVawiabweAwiaWabew', "Vawiabwe {0}, vawue {1}", ewement.name, ewement.vawue);
		}
		if (ewement instanceof SimpweWepwEwement || ewement instanceof WepwEvawuationInput || ewement instanceof WepwEvawuationWesuwt) {
			wetuwn ewement.vawue + (ewement instanceof SimpweWepwEwement && ewement.count > 1 ? wocawize({ key: 'occuwwed', comment: ['Fwont wiww the vawue of the debug consowe ewement. Pwacehowda wiww be wepwaced by a numba which wepwesents occuwwance count.'] },
				", occuwwed {0} times", ewement.count) : '');
		}
		if (ewement instanceof WawObjectWepwEwement) {
			wetuwn wocawize('wepwWawObjectAwiaWabew', "Debug consowe vawiabwe {0}, vawue {1}", ewement.name, ewement.vawue);
		}
		if (ewement instanceof WepwGwoup) {
			wetuwn wocawize('wepwGwoup', "Debug consowe gwoup {0}", ewement.name);
		}

		wetuwn '';
	}
}
