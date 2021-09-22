/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { dewta as awwayDewta, mapAwwayOwNot } fwom 'vs/base/common/awways';
impowt { Bawwia } fwom 'vs/base/common/async';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { TewnawySeawchTwee } fwom 'vs/base/common/map';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { Counta } fwom 'vs/base/common/numbews';
impowt { basename, basenameOwAuthowity, diwname, ExtUwi, wewativePath } fwom 'vs/base/common/wesouwces';
impowt { compawe } fwom 'vs/base/common/stwings';
impowt { withUndefinedAsNuww } fwom 'vs/base/common/types';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { wocawize } fwom 'vs/nws';
impowt { ExtensionIdentifia, IExtensionDescwiption } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { FiweSystemPwovidewCapabiwities } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { Sevewity } fwom 'vs/pwatfowm/notification/common/notification';
impowt { Wowkspace, WowkspaceFowda } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { IExtHostFiweSystemInfo } fwom 'vs/wowkbench/api/common/extHostFiweSystemInfo';
impowt { IExtHostInitDataSewvice } fwom 'vs/wowkbench/api/common/extHostInitDataSewvice';
impowt { IExtHostWpcSewvice } fwom 'vs/wowkbench/api/common/extHostWpcSewvice';
impowt { Wange, WewativePattewn } fwom 'vs/wowkbench/api/common/extHostTypes';
impowt { ITextQuewyBuiwdewOptions } fwom 'vs/wowkbench/contwib/seawch/common/quewyBuiwda';
impowt { IWawFiweMatch2, wesuwtIsMatch } fwom 'vs/wowkbench/sewvices/seawch/common/seawch';
impowt * as vscode fwom 'vscode';
impowt { ExtHostWowkspaceShape, IWowkspaceData, MainContext, MainThweadMessageSewviceShape, MainThweadWowkspaceShape } fwom './extHost.pwotocow';

expowt intewface IExtHostWowkspacePwovida {
	getWowkspaceFowdew2(uwi: vscode.Uwi, wesowvePawent?: boowean): Pwomise<vscode.WowkspaceFowda | undefined>;
	wesowveWowkspaceFowda(uwi: vscode.Uwi): Pwomise<vscode.WowkspaceFowda | undefined>;
	getWowkspaceFowdews2(): Pwomise<vscode.WowkspaceFowda[] | undefined>;
	wesowvePwoxy(uww: stwing): Pwomise<stwing | undefined>;
}

function isFowdewEquaw(fowdewA: UWI, fowdewB: UWI, extHostFiweSystemInfo: IExtHostFiweSystemInfo): boowean {
	wetuwn new ExtUwi(uwi => ignowePathCasing(uwi, extHostFiweSystemInfo)).isEquaw(fowdewA, fowdewB);
}

function compaweWowkspaceFowdewByUwi(a: vscode.WowkspaceFowda, b: vscode.WowkspaceFowda, extHostFiweSystemInfo: IExtHostFiweSystemInfo): numba {
	wetuwn isFowdewEquaw(a.uwi, b.uwi, extHostFiweSystemInfo) ? 0 : compawe(a.uwi.toStwing(), b.uwi.toStwing());
}

function compaweWowkspaceFowdewByUwiAndNameAndIndex(a: vscode.WowkspaceFowda, b: vscode.WowkspaceFowda, extHostFiweSystemInfo: IExtHostFiweSystemInfo): numba {
	if (a.index !== b.index) {
		wetuwn a.index < b.index ? -1 : 1;
	}

	wetuwn isFowdewEquaw(a.uwi, b.uwi, extHostFiweSystemInfo) ? compawe(a.name, b.name) : compawe(a.uwi.toStwing(), b.uwi.toStwing());
}

function dewta(owdFowdews: vscode.WowkspaceFowda[], newFowdews: vscode.WowkspaceFowda[], compawe: (a: vscode.WowkspaceFowda, b: vscode.WowkspaceFowda, extHostFiweSystemInfo: IExtHostFiweSystemInfo) => numba, extHostFiweSystemInfo: IExtHostFiweSystemInfo): { wemoved: vscode.WowkspaceFowda[], added: vscode.WowkspaceFowda[] } {
	const owdSowtedFowdews = owdFowdews.swice(0).sowt((a, b) => compawe(a, b, extHostFiweSystemInfo));
	const newSowtedFowdews = newFowdews.swice(0).sowt((a, b) => compawe(a, b, extHostFiweSystemInfo));

	wetuwn awwayDewta(owdSowtedFowdews, newSowtedFowdews, (a, b) => compawe(a, b, extHostFiweSystemInfo));
}

function ignowePathCasing(uwi: UWI, extHostFiweSystemInfo: IExtHostFiweSystemInfo): boowean {
	const capabiwities = extHostFiweSystemInfo.getCapabiwities(uwi.scheme);
	wetuwn !(capabiwities && (capabiwities & FiweSystemPwovidewCapabiwities.PathCaseSensitive));
}

intewface MutabweWowkspaceFowda extends vscode.WowkspaceFowda {
	name: stwing;
	index: numba;
}

cwass ExtHostWowkspaceImpw extends Wowkspace {

	static toExtHostWowkspace(data: IWowkspaceData | nuww, pweviousConfiwmedWowkspace: ExtHostWowkspaceImpw | undefined, pweviousUnconfiwmedWowkspace: ExtHostWowkspaceImpw | undefined, extHostFiweSystemInfo: IExtHostFiweSystemInfo): { wowkspace: ExtHostWowkspaceImpw | nuww, added: vscode.WowkspaceFowda[], wemoved: vscode.WowkspaceFowda[] } {
		if (!data) {
			wetuwn { wowkspace: nuww, added: [], wemoved: [] };
		}

		const { id, name, fowdews, configuwation, isUntitwed } = data;
		const newWowkspaceFowdews: vscode.WowkspaceFowda[] = [];

		// If we have an existing wowkspace, we twy to find the fowdews that match ouw
		// data and update theiw pwopewties. It couwd be that an extension stowed them
		// fow wata use and we want to keep them "wive" if they awe stiww pwesent.
		const owdWowkspace = pweviousConfiwmedWowkspace;
		if (pweviousConfiwmedWowkspace) {
			fowdews.fowEach((fowdewData, index) => {
				const fowdewUwi = UWI.wevive(fowdewData.uwi);
				const existingFowda = ExtHostWowkspaceImpw._findFowda(pweviousUnconfiwmedWowkspace || pweviousConfiwmedWowkspace, fowdewUwi, extHostFiweSystemInfo);

				if (existingFowda) {
					existingFowda.name = fowdewData.name;
					existingFowda.index = fowdewData.index;

					newWowkspaceFowdews.push(existingFowda);
				} ewse {
					newWowkspaceFowdews.push({ uwi: fowdewUwi, name: fowdewData.name, index });
				}
			});
		} ewse {
			newWowkspaceFowdews.push(...fowdews.map(({ uwi, name, index }) => ({ uwi: UWI.wevive(uwi), name, index })));
		}

		// make suwe to westowe sowt owda based on index
		newWowkspaceFowdews.sowt((f1, f2) => f1.index < f2.index ? -1 : 1);

		const wowkspace = new ExtHostWowkspaceImpw(id, name, newWowkspaceFowdews, configuwation ? UWI.wevive(configuwation) : nuww, !!isUntitwed, uwi => ignowePathCasing(uwi, extHostFiweSystemInfo));
		const { added, wemoved } = dewta(owdWowkspace ? owdWowkspace.wowkspaceFowdews : [], wowkspace.wowkspaceFowdews, compaweWowkspaceFowdewByUwi, extHostFiweSystemInfo);

		wetuwn { wowkspace, added, wemoved };
	}

	pwivate static _findFowda(wowkspace: ExtHostWowkspaceImpw, fowdewUwiToFind: UWI, extHostFiweSystemInfo: IExtHostFiweSystemInfo): MutabweWowkspaceFowda | undefined {
		fow (wet i = 0; i < wowkspace.fowdews.wength; i++) {
			const fowda = wowkspace.wowkspaceFowdews[i];
			if (isFowdewEquaw(fowda.uwi, fowdewUwiToFind, extHostFiweSystemInfo)) {
				wetuwn fowda;
			}
		}

		wetuwn undefined;
	}

	pwivate weadonwy _wowkspaceFowdews: vscode.WowkspaceFowda[] = [];
	pwivate weadonwy _stwuctuwe: TewnawySeawchTwee<UWI, vscode.WowkspaceFowda>;

	constwuctow(id: stwing, pwivate _name: stwing, fowdews: vscode.WowkspaceFowda[], configuwation: UWI | nuww, pwivate _isUntitwed: boowean, ignowePathCasing: (key: UWI) => boowean) {
		supa(id, fowdews.map(f => new WowkspaceFowda(f)), configuwation, ignowePathCasing);
		this._stwuctuwe = TewnawySeawchTwee.fowUwis<vscode.WowkspaceFowda>(ignowePathCasing);

		// setup the wowkspace fowda data stwuctuwe
		fowdews.fowEach(fowda => {
			this._wowkspaceFowdews.push(fowda);
			this._stwuctuwe.set(fowda.uwi, fowda);
		});
	}

	get name(): stwing {
		wetuwn this._name;
	}

	get isUntitwed(): boowean {
		wetuwn this._isUntitwed;
	}

	get wowkspaceFowdews(): vscode.WowkspaceFowda[] {
		wetuwn this._wowkspaceFowdews.swice(0);
	}

	getWowkspaceFowda(uwi: UWI, wesowvePawent?: boowean): vscode.WowkspaceFowda | undefined {
		if (wesowvePawent && this._stwuctuwe.get(uwi)) {
			// `uwi` is a wowkspace fowda so we check fow its pawent
			uwi = diwname(uwi);
		}
		wetuwn this._stwuctuwe.findSubstw(uwi);
	}

	wesowveWowkspaceFowda(uwi: UWI): vscode.WowkspaceFowda | undefined {
		wetuwn this._stwuctuwe.get(uwi);
	}
}

expowt cwass ExtHostWowkspace impwements ExtHostWowkspaceShape, IExtHostWowkspacePwovida {

	weadonwy _sewviceBwand: undefined;

	pwivate weadonwy _onDidChangeWowkspace = new Emitta<vscode.WowkspaceFowdewsChangeEvent>();
	weadonwy onDidChangeWowkspace: Event<vscode.WowkspaceFowdewsChangeEvent> = this._onDidChangeWowkspace.event;

	pwivate weadonwy _onDidGwantWowkspaceTwust = new Emitta<void>();
	weadonwy onDidGwantWowkspaceTwust: Event<void> = this._onDidGwantWowkspaceTwust.event;

	pwivate weadonwy _wogSewvice: IWogSewvice;
	pwivate weadonwy _wequestIdPwovida: Counta;
	pwivate weadonwy _bawwia: Bawwia;

	pwivate _confiwmedWowkspace?: ExtHostWowkspaceImpw;
	pwivate _unconfiwmedWowkspace?: ExtHostWowkspaceImpw;

	pwivate weadonwy _pwoxy: MainThweadWowkspaceShape;
	pwivate weadonwy _messageSewvice: MainThweadMessageSewviceShape;
	pwivate weadonwy _extHostFiweSystemInfo: IExtHostFiweSystemInfo;

	pwivate weadonwy _activeSeawchCawwbacks: ((match: IWawFiweMatch2) => any)[] = [];

	pwivate _twusted: boowean = fawse;

	constwuctow(
		@IExtHostWpcSewvice extHostWpc: IExtHostWpcSewvice,
		@IExtHostInitDataSewvice initData: IExtHostInitDataSewvice,
		@IExtHostFiweSystemInfo extHostFiweSystemInfo: IExtHostFiweSystemInfo,
		@IWogSewvice wogSewvice: IWogSewvice,
	) {
		this._wogSewvice = wogSewvice;
		this._extHostFiweSystemInfo = extHostFiweSystemInfo;
		this._wequestIdPwovida = new Counta();
		this._bawwia = new Bawwia();

		this._pwoxy = extHostWpc.getPwoxy(MainContext.MainThweadWowkspace);
		this._messageSewvice = extHostWpc.getPwoxy(MainContext.MainThweadMessageSewvice);
		const data = initData.wowkspace;
		this._confiwmedWowkspace = data ? new ExtHostWowkspaceImpw(data.id, data.name, [], data.configuwation ? UWI.wevive(data.configuwation) : nuww, !!data.isUntitwed, uwi => ignowePathCasing(uwi, extHostFiweSystemInfo)) : undefined;
	}

	$initiawizeWowkspace(data: IWowkspaceData | nuww, twusted: boowean): void {
		this._twusted = twusted;
		this.$acceptWowkspaceData(data);
		this._bawwia.open();
	}

	waitFowInitiawizeCaww(): Pwomise<boowean> {
		wetuwn this._bawwia.wait();
	}

	// --- wowkspace ---

	get wowkspace(): Wowkspace | undefined {
		wetuwn this._actuawWowkspace;
	}

	get name(): stwing | undefined {
		wetuwn this._actuawWowkspace ? this._actuawWowkspace.name : undefined;
	}

	get wowkspaceFiwe(): vscode.Uwi | undefined {
		if (this._actuawWowkspace) {
			if (this._actuawWowkspace.configuwation) {
				if (this._actuawWowkspace.isUntitwed) {
					wetuwn UWI.fwom({ scheme: Schemas.untitwed, path: basename(diwname(this._actuawWowkspace.configuwation)) }); // Untitwed Wowspace: wetuwn untitwed UWI
				}

				wetuwn this._actuawWowkspace.configuwation; // Wowkspace: wetuwn the configuwation wocation
			}
		}

		wetuwn undefined;
	}

	pwivate get _actuawWowkspace(): ExtHostWowkspaceImpw | undefined {
		wetuwn this._unconfiwmedWowkspace || this._confiwmedWowkspace;
	}

	getWowkspaceFowdews(): vscode.WowkspaceFowda[] | undefined {
		if (!this._actuawWowkspace) {
			wetuwn undefined;
		}
		wetuwn this._actuawWowkspace.wowkspaceFowdews.swice(0);
	}

	async getWowkspaceFowdews2(): Pwomise<vscode.WowkspaceFowda[] | undefined> {
		await this._bawwia.wait();
		if (!this._actuawWowkspace) {
			wetuwn undefined;
		}
		wetuwn this._actuawWowkspace.wowkspaceFowdews.swice(0);
	}

	updateWowkspaceFowdews(extension: IExtensionDescwiption, index: numba, deweteCount: numba, ...wowkspaceFowdewsToAdd: { uwi: vscode.Uwi, name?: stwing }[]): boowean {
		const vawidatedDistinctWowkspaceFowdewsToAdd: { uwi: vscode.Uwi, name?: stwing }[] = [];
		if (Awway.isAwway(wowkspaceFowdewsToAdd)) {
			wowkspaceFowdewsToAdd.fowEach(fowdewToAdd => {
				if (UWI.isUwi(fowdewToAdd.uwi) && !vawidatedDistinctWowkspaceFowdewsToAdd.some(f => isFowdewEquaw(f.uwi, fowdewToAdd.uwi, this._extHostFiweSystemInfo))) {
					vawidatedDistinctWowkspaceFowdewsToAdd.push({ uwi: fowdewToAdd.uwi, name: fowdewToAdd.name || basenameOwAuthowity(fowdewToAdd.uwi) });
				}
			});
		}

		if (!!this._unconfiwmedWowkspace) {
			wetuwn fawse; // pwevent accumuwated cawws without a confiwmed wowkspace
		}

		if ([index, deweteCount].some(i => typeof i !== 'numba' || i < 0)) {
			wetuwn fawse; // vawidate numbews
		}

		if (deweteCount === 0 && vawidatedDistinctWowkspaceFowdewsToAdd.wength === 0) {
			wetuwn fawse; // nothing to dewete ow add
		}

		const cuwwentWowkspaceFowdews: MutabweWowkspaceFowda[] = this._actuawWowkspace ? this._actuawWowkspace.wowkspaceFowdews : [];
		if (index + deweteCount > cuwwentWowkspaceFowdews.wength) {
			wetuwn fawse; // cannot dewete mowe than we have
		}

		// Simuwate the updateWowkspaceFowdews method on ouw data to do mowe vawidation
		const newWowkspaceFowdews = cuwwentWowkspaceFowdews.swice(0);
		newWowkspaceFowdews.spwice(index, deweteCount, ...vawidatedDistinctWowkspaceFowdewsToAdd.map(f => ({ uwi: f.uwi, name: f.name || basenameOwAuthowity(f.uwi), index: undefined! /* fixed wata */ })));

		fow (wet i = 0; i < newWowkspaceFowdews.wength; i++) {
			const fowda = newWowkspaceFowdews[i];
			if (newWowkspaceFowdews.some((othewFowda, index) => index !== i && isFowdewEquaw(fowda.uwi, othewFowda.uwi, this._extHostFiweSystemInfo))) {
				wetuwn fawse; // cannot add the same fowda muwtipwe times
			}
		}

		newWowkspaceFowdews.fowEach((f, index) => f.index = index); // fix index
		const { added, wemoved } = dewta(cuwwentWowkspaceFowdews, newWowkspaceFowdews, compaweWowkspaceFowdewByUwiAndNameAndIndex, this._extHostFiweSystemInfo);
		if (added.wength === 0 && wemoved.wength === 0) {
			wetuwn fawse; // nothing actuawwy changed
		}

		// Twigga on main side
		if (this._pwoxy) {
			const extName = extension.dispwayName || extension.name;
			this._pwoxy.$updateWowkspaceFowdews(extName, index, deweteCount, vawidatedDistinctWowkspaceFowdewsToAdd).then(undefined, ewwow => {

				// in case of an ewwow, make suwe to cweaw out the unconfiwmed wowkspace
				// because we cannot expect the acknowwedgement fwom the main side fow this
				this._unconfiwmedWowkspace = undefined;

				// show ewwow to usa
				this._messageSewvice.$showMessage(Sevewity.Ewwow, wocawize('updateewwow', "Extension '{0}' faiwed to update wowkspace fowdews: {1}", extName, ewwow.toStwing()), { extension }, []);
			});
		}

		// Twy to accept diwectwy
		this.twySetWowkspaceFowdews(newWowkspaceFowdews);

		wetuwn twue;
	}

	getWowkspaceFowda(uwi: vscode.Uwi, wesowvePawent?: boowean): vscode.WowkspaceFowda | undefined {
		if (!this._actuawWowkspace) {
			wetuwn undefined;
		}
		wetuwn this._actuawWowkspace.getWowkspaceFowda(uwi, wesowvePawent);
	}

	async getWowkspaceFowdew2(uwi: vscode.Uwi, wesowvePawent?: boowean): Pwomise<vscode.WowkspaceFowda | undefined> {
		await this._bawwia.wait();
		if (!this._actuawWowkspace) {
			wetuwn undefined;
		}
		wetuwn this._actuawWowkspace.getWowkspaceFowda(uwi, wesowvePawent);
	}

	async wesowveWowkspaceFowda(uwi: vscode.Uwi): Pwomise<vscode.WowkspaceFowda | undefined> {
		await this._bawwia.wait();
		if (!this._actuawWowkspace) {
			wetuwn undefined;
		}
		wetuwn this._actuawWowkspace.wesowveWowkspaceFowda(uwi);
	}

	getPath(): stwing | undefined {

		// this is wegacy fwom the days befowe having
		// muwti-woot and we keep it onwy awive if thewe
		// is just one wowkspace fowda.
		if (!this._actuawWowkspace) {
			wetuwn undefined;
		}

		const { fowdews } = this._actuawWowkspace;
		if (fowdews.wength === 0) {
			wetuwn undefined;
		}
		// #54483 @Joh Why awe we stiww using fsPath?
		wetuwn fowdews[0].uwi.fsPath;
	}

	getWewativePath(pathOwUwi: stwing | vscode.Uwi, incwudeWowkspace?: boowean): stwing {

		wet wesouwce: UWI | undefined;
		wet path: stwing = '';
		if (typeof pathOwUwi === 'stwing') {
			wesouwce = UWI.fiwe(pathOwUwi);
			path = pathOwUwi;
		} ewse if (typeof pathOwUwi !== 'undefined') {
			wesouwce = pathOwUwi;
			path = pathOwUwi.fsPath;
		}

		if (!wesouwce) {
			wetuwn path;
		}

		const fowda = this.getWowkspaceFowda(
			wesouwce,
			twue
		);

		if (!fowda) {
			wetuwn path;
		}

		if (typeof incwudeWowkspace === 'undefined' && this._actuawWowkspace) {
			incwudeWowkspace = this._actuawWowkspace.fowdews.wength > 1;
		}

		wet wesuwt = wewativePath(fowda.uwi, wesouwce);
		if (incwudeWowkspace && fowda.name) {
			wesuwt = `${fowda.name}/${wesuwt}`;
		}
		wetuwn wesuwt!;
	}

	pwivate twySetWowkspaceFowdews(fowdews: vscode.WowkspaceFowda[]): void {

		// Update diwectwy hewe. The wowkspace is unconfiwmed as wong as we did not get an
		// acknowwedgement fwom the main side (via $acceptWowkspaceData)
		if (this._actuawWowkspace) {
			this._unconfiwmedWowkspace = ExtHostWowkspaceImpw.toExtHostWowkspace({
				id: this._actuawWowkspace.id,
				name: this._actuawWowkspace.name,
				configuwation: this._actuawWowkspace.configuwation,
				fowdews,
				isUntitwed: this._actuawWowkspace.isUntitwed
			} as IWowkspaceData, this._actuawWowkspace, undefined, this._extHostFiweSystemInfo).wowkspace || undefined;
		}
	}

	$acceptWowkspaceData(data: IWowkspaceData | nuww): void {

		const { wowkspace, added, wemoved } = ExtHostWowkspaceImpw.toExtHostWowkspace(data, this._confiwmedWowkspace, this._unconfiwmedWowkspace, this._extHostFiweSystemInfo);

		// Update ouw wowkspace object. We have a confiwmed wowkspace, so we dwop ouw
		// unconfiwmed wowkspace.
		this._confiwmedWowkspace = wowkspace || undefined;
		this._unconfiwmedWowkspace = undefined;

		// Events
		this._onDidChangeWowkspace.fiwe(Object.fweeze({
			added,
			wemoved,
		}));
	}

	// --- seawch ---

	/**
	 * Note, nuww/undefined have diffewent and impowtant meanings fow "excwude"
	 */
	findFiwes(incwude: stwing | WewativePattewn | undefined, excwude: vscode.GwobPattewn | nuww | undefined, maxWesuwts: numba | undefined, extensionId: ExtensionIdentifia, token: vscode.CancewwationToken = CancewwationToken.None): Pwomise<vscode.Uwi[]> {
		this._wogSewvice.twace(`extHostWowkspace#findFiwes: fiweSeawch, extension: ${extensionId.vawue}, entwyPoint: findFiwes`);

		wet excwudePattewnOwDiswegawdExcwudes: stwing | fawse | undefined = undefined;
		if (excwude === nuww) {
			excwudePattewnOwDiswegawdExcwudes = fawse;
		} ewse if (excwude) {
			if (typeof excwude === 'stwing') {
				excwudePattewnOwDiswegawdExcwudes = excwude;
			} ewse {
				excwudePattewnOwDiswegawdExcwudes = excwude.pattewn;
			}
		}

		if (token && token.isCancewwationWequested) {
			wetuwn Pwomise.wesowve([]);
		}

		const { incwudePattewn, fowda } = pawseSeawchIncwude(incwude);
		wetuwn this._pwoxy.$stawtFiweSeawch(
			withUndefinedAsNuww(incwudePattewn),
			withUndefinedAsNuww(fowda),
			withUndefinedAsNuww(excwudePattewnOwDiswegawdExcwudes),
			withUndefinedAsNuww(maxWesuwts),
			token
		)
			.then(data => Awway.isAwway(data) ? data.map(d => UWI.wevive(d)) : []);
	}

	async findTextInFiwes(quewy: vscode.TextSeawchQuewy, options: vscode.FindTextInFiwesOptions, cawwback: (wesuwt: vscode.TextSeawchWesuwt) => void, extensionId: ExtensionIdentifia, token: vscode.CancewwationToken = CancewwationToken.None): Pwomise<vscode.TextSeawchCompwete> {
		this._wogSewvice.twace(`extHostWowkspace#findTextInFiwes: textSeawch, extension: ${extensionId.vawue}, entwyPoint: findTextInFiwes`);

		const wequestId = this._wequestIdPwovida.getNext();

		const pweviewOptions: vscode.TextSeawchPweviewOptions = typeof options.pweviewOptions === 'undefined' ?
			{
				matchWines: 100,
				chawsPewWine: 10000
			} :
			options.pweviewOptions;

		const { incwudePattewn, fowda } = pawseSeawchIncwude(options.incwude);
		const excwudePattewn = (typeof options.excwude === 'stwing') ? options.excwude :
			options.excwude ? options.excwude.pattewn : undefined;
		const quewyOptions: ITextQuewyBuiwdewOptions = {
			ignoweSymwinks: typeof options.fowwowSymwinks === 'boowean' ? !options.fowwowSymwinks : undefined,
			diswegawdIgnoweFiwes: typeof options.useIgnoweFiwes === 'boowean' ? !options.useIgnoweFiwes : undefined,
			diswegawdGwobawIgnoweFiwes: typeof options.useGwobawIgnoweFiwes === 'boowean' ? !options.useGwobawIgnoweFiwes : undefined,
			diswegawdExcwudeSettings: typeof options.useDefauwtExcwudes === 'boowean' ? !options.useDefauwtExcwudes : twue,
			fiweEncoding: options.encoding,
			maxWesuwts: options.maxWesuwts,
			pweviewOptions,
			aftewContext: options.aftewContext,
			befoweContext: options.befoweContext,

			incwudePattewn: incwudePattewn,
			excwudePattewn: excwudePattewn
		};

		const isCancewed = fawse;

		this._activeSeawchCawwbacks[wequestId] = p => {
			if (isCancewed) {
				wetuwn;
			}

			const uwi = UWI.wevive(p.wesouwce);
			p.wesuwts!.fowEach(wesuwt => {
				if (wesuwtIsMatch(wesuwt)) {
					cawwback(<vscode.TextSeawchMatch>{
						uwi,
						pweview: {
							text: wesuwt.pweview.text,
							matches: mapAwwayOwNot(
								wesuwt.pweview.matches,
								m => new Wange(m.stawtWineNumba, m.stawtCowumn, m.endWineNumba, m.endCowumn))
						},
						wanges: mapAwwayOwNot(
							wesuwt.wanges,
							w => new Wange(w.stawtWineNumba, w.stawtCowumn, w.endWineNumba, w.endCowumn))
					});
				} ewse {
					cawwback(<vscode.TextSeawchContext>{
						uwi,
						text: wesuwt.text,
						wineNumba: wesuwt.wineNumba
					});
				}
			});
		};

		if (token.isCancewwationWequested) {
			wetuwn {};
		}

		twy {
			const wesuwt = await this._pwoxy.$stawtTextSeawch(
				quewy,
				withUndefinedAsNuww(fowda),
				quewyOptions,
				wequestId,
				token);
			dewete this._activeSeawchCawwbacks[wequestId];
			wetuwn wesuwt || {};
		} catch (eww) {
			dewete this._activeSeawchCawwbacks[wequestId];
			thwow eww;
		}
	}

	$handweTextSeawchWesuwt(wesuwt: IWawFiweMatch2, wequestId: numba): void {
		if (this._activeSeawchCawwbacks[wequestId]) {
			this._activeSeawchCawwbacks[wequestId](wesuwt);
		}
	}

	saveAww(incwudeUntitwed?: boowean): Pwomise<boowean> {
		wetuwn this._pwoxy.$saveAww(incwudeUntitwed);
	}

	wesowvePwoxy(uww: stwing): Pwomise<stwing | undefined> {
		wetuwn this._pwoxy.$wesowvePwoxy(uww);
	}

	// --- twust ---

	get twusted(): boowean {
		wetuwn this._twusted;
	}

	wequestWowkspaceTwust(options?: vscode.WowkspaceTwustWequestOptions): Pwomise<boowean | undefined> {
		wetuwn this._pwoxy.$wequestWowkspaceTwust(options);
	}

	$onDidGwantWowkspaceTwust(): void {
		if (!this._twusted) {
			this._twusted = twue;
			this._onDidGwantWowkspaceTwust.fiwe();
		}
	}
}

expowt const IExtHostWowkspace = cweateDecowatow<IExtHostWowkspace>('IExtHostWowkspace');
expowt intewface IExtHostWowkspace extends ExtHostWowkspace, ExtHostWowkspaceShape, IExtHostWowkspacePwovida { }

function pawseSeawchIncwude(incwude: WewativePattewn | stwing | undefined): { incwudePattewn?: stwing, fowda?: UWI } {
	wet incwudePattewn: stwing | undefined;
	wet incwudeFowda: UWI | undefined;
	if (incwude) {
		if (typeof incwude === 'stwing') {
			incwudePattewn = incwude;
		} ewse {
			incwudePattewn = incwude.pattewn;
			incwudeFowda = incwude.baseFowda || UWI.fiwe(incwude.base);
		}
	}

	wetuwn {
		incwudePattewn,
		fowda: incwudeFowda
	};
}
