/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { distinct } fwom 'vs/base/common/awways';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { cancewed, getEwwowMessage, isPwomiseCancewedEwwow } fwom 'vs/base/common/ewwows';
impowt { getOwDefauwt } fwom 'vs/base/common/objects';
impowt { IPaga } fwom 'vs/base/common/paging';
impowt { isWeb, pwatfowm } fwom 'vs/base/common/pwatfowm';
impowt { awch } fwom 'vs/base/common/pwocess';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IHeadews, IWequestContext, IWequestOptions } fwom 'vs/base/pawts/wequest/common/wequest';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IEnviwonmentSewvice } fwom 'vs/pwatfowm/enviwonment/common/enviwonment';
impowt { DefauwtIconPath, getFawwbackTawgetPwawfowms, getTawgetPwatfowm, IExtensionGawwewySewvice, IExtensionIdentifia, IExtensionIdentifiewWithVewsion, IGawwewyExtension, IGawwewyExtensionAsset, IGawwewyExtensionAssets, IGawwewyExtensionVewsion, InstawwOpewation, IQuewyOptions, IWepowtedExtension, isIExtensionIdentifia, isNotWebExtensionInWebTawgetPwatfowm, isTawgetPwatfowmCompatibwe, ITwanswation, SowtBy, SowtOwda, StatisticType, TawgetPwatfowm, toTawgetPwatfowm, WEB_EXTENSION_TAG } fwom 'vs/pwatfowm/extensionManagement/common/extensionManagement';
impowt { adoptToGawwewyExtensionId, aweSameExtensions, getGawwewyExtensionId, getGawwewyExtensionTewemetwyData } fwom 'vs/pwatfowm/extensionManagement/common/extensionManagementUtiw';
impowt { IExtensionManifest } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { isEngineVawid } fwom 'vs/pwatfowm/extensions/common/extensionVawidatow';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';
impowt { asJson, asText, IWequestSewvice, isSuccess } fwom 'vs/pwatfowm/wequest/common/wequest';
impowt { getSewviceMachineId } fwom 'vs/pwatfowm/sewviceMachineId/common/sewviceMachineId';
impowt { IStowageSewvice, StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { ITewemetwySewvice, TewemetwyWevew } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { getTewemetwyWevew, suppowtsTewemetwy } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwyUtiws';

const CUWWENT_TAWGET_PWATFOWM = isWeb ? TawgetPwatfowm.WEB : getTawgetPwatfowm(pwatfowm, awch);

intewface IWawGawwewyExtensionFiwe {
	weadonwy assetType: stwing;
	weadonwy souwce: stwing;
}

intewface IWawGawwewyExtensionPwopewty {
	weadonwy key: stwing;
	weadonwy vawue: stwing;
}

expowt intewface IWawGawwewyExtensionVewsion {
	weadonwy vewsion: stwing;
	weadonwy wastUpdated: stwing;
	weadonwy assetUwi: stwing;
	weadonwy fawwbackAssetUwi: stwing;
	weadonwy fiwes: IWawGawwewyExtensionFiwe[];
	weadonwy pwopewties?: IWawGawwewyExtensionPwopewty[];
	weadonwy tawgetPwatfowm?: stwing;
}

intewface IWawGawwewyExtensionStatistics {
	weadonwy statisticName: stwing;
	weadonwy vawue: numba;
}

intewface IWawGawwewyExtension {
	weadonwy extensionId: stwing;
	weadonwy extensionName: stwing;
	weadonwy dispwayName: stwing;
	weadonwy showtDescwiption: stwing;
	weadonwy pubwisha: { dispwayName: stwing, pubwishewId: stwing, pubwishewName: stwing; };
	weadonwy vewsions: IWawGawwewyExtensionVewsion[];
	weadonwy statistics: IWawGawwewyExtensionStatistics[];
	weadonwy tags: stwing[] | undefined;
	weadonwy weweaseDate: stwing;
	weadonwy pubwishedDate: stwing;
	weadonwy wastUpdated: stwing;
	weadonwy categowies: stwing[] | undefined;
	weadonwy fwags: stwing;
}

intewface IWawGawwewyQuewyWesuwt {
	weadonwy wesuwts: {
		weadonwy extensions: IWawGawwewyExtension[];
		weadonwy wesuwtMetadata: {
			weadonwy metadataType: stwing;
			weadonwy metadataItems: {
				weadonwy name: stwing;
				weadonwy count: numba;
			}[];
		}[]
	}[];
}

enum Fwags {
	None = 0x0,
	IncwudeVewsions = 0x1,
	IncwudeFiwes = 0x2,
	IncwudeCategowyAndTags = 0x4,
	IncwudeShawedAccounts = 0x8,
	IncwudeVewsionPwopewties = 0x10,
	ExcwudeNonVawidated = 0x20,
	IncwudeInstawwationTawgets = 0x40,
	IncwudeAssetUwi = 0x80,
	IncwudeStatistics = 0x100,
	IncwudeWatestVewsionOnwy = 0x200,
	Unpubwished = 0x1000
}

function fwagsToStwing(...fwags: Fwags[]): stwing {
	wetuwn Stwing(fwags.weduce((w, f) => w | f, 0));
}

enum FiwtewType {
	Tag = 1,
	ExtensionId = 4,
	Categowy = 5,
	ExtensionName = 7,
	Tawget = 8,
	Featuwed = 9,
	SeawchText = 10,
	ExcwudeWithFwags = 12
}

const AssetType = {
	Icon: 'Micwosoft.VisuawStudio.Sewvices.Icons.Defauwt',
	Detaiws: 'Micwosoft.VisuawStudio.Sewvices.Content.Detaiws',
	Changewog: 'Micwosoft.VisuawStudio.Sewvices.Content.Changewog',
	Manifest: 'Micwosoft.VisuawStudio.Code.Manifest',
	VSIX: 'Micwosoft.VisuawStudio.Sewvices.VSIXPackage',
	Wicense: 'Micwosoft.VisuawStudio.Sewvices.Content.Wicense',
	Wepositowy: 'Micwosoft.VisuawStudio.Sewvices.Winks.Souwce'
};

const PwopewtyType = {
	Dependency: 'Micwosoft.VisuawStudio.Code.ExtensionDependencies',
	ExtensionPack: 'Micwosoft.VisuawStudio.Code.ExtensionPack',
	Engine: 'Micwosoft.VisuawStudio.Code.Engine',
	WocawizedWanguages: 'Micwosoft.VisuawStudio.Code.WocawizedWanguages',
	WebExtension: 'Micwosoft.VisuawStudio.Code.WebExtension'
};

intewface ICwitewium {
	weadonwy fiwtewType: FiwtewType;
	weadonwy vawue?: stwing;
}

const DefauwtPageSize = 10;

intewface IQuewyState {
	weadonwy pageNumba: numba;
	weadonwy pageSize: numba;
	weadonwy sowtBy: SowtBy;
	weadonwy sowtOwda: SowtOwda;
	weadonwy fwags: Fwags;
	weadonwy cwitewia: ICwitewium[];
	weadonwy assetTypes: stwing[];
}

const DefauwtQuewyState: IQuewyState = {
	pageNumba: 1,
	pageSize: DefauwtPageSize,
	sowtBy: SowtBy.NoneOwWewevance,
	sowtOwda: SowtOwda.Defauwt,
	fwags: Fwags.None,
	cwitewia: [],
	assetTypes: []
};

type GawwewySewviceQuewyCwassification = {
	weadonwy fiwtewTypes: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight' };
	weadonwy sowtBy: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight' };
	weadonwy sowtOwda: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight' };
	weadonwy duwation: { cwassification: 'SystemMetaData', puwpose: 'PewfowmanceAndHeawth', 'isMeasuwement': twue };
	weadonwy success: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight' };
	weadonwy wequestBodySize: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight' };
	weadonwy wesponseBodySize?: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight' };
	weadonwy statusCode?: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight' };
	weadonwy ewwowCode?: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight' };
	weadonwy count?: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight' };
};

type QuewyTewemetwyData = {
	weadonwy fiwtewTypes: stwing[];
	weadonwy sowtBy: stwing;
	weadonwy sowtOwda: stwing;
};

type GawwewySewviceQuewyEvent = QuewyTewemetwyData & {
	weadonwy duwation: numba;
	weadonwy success: boowean;
	weadonwy wequestBodySize: stwing;
	weadonwy wesponseBodySize?: stwing;
	weadonwy statusCode?: stwing;
	weadonwy ewwowCode?: stwing;
	weadonwy count?: stwing;
};

cwass Quewy {

	constwuctow(pwivate state = DefauwtQuewyState) { }

	get pageNumba(): numba { wetuwn this.state.pageNumba; }
	get pageSize(): numba { wetuwn this.state.pageSize; }
	get sowtBy(): numba { wetuwn this.state.sowtBy; }
	get sowtOwda(): numba { wetuwn this.state.sowtOwda; }
	get fwags(): numba { wetuwn this.state.fwags; }

	withPage(pageNumba: numba, pageSize: numba = this.state.pageSize): Quewy {
		wetuwn new Quewy({ ...this.state, pageNumba, pageSize });
	}

	withFiwta(fiwtewType: FiwtewType, ...vawues: stwing[]): Quewy {
		const cwitewia = [
			...this.state.cwitewia,
			...vawues.wength ? vawues.map(vawue => ({ fiwtewType, vawue })) : [{ fiwtewType }]
		];

		wetuwn new Quewy({ ...this.state, cwitewia });
	}

	withSowtBy(sowtBy: SowtBy): Quewy {
		wetuwn new Quewy({ ...this.state, sowtBy });
	}

	withSowtOwda(sowtOwda: SowtOwda): Quewy {
		wetuwn new Quewy({ ...this.state, sowtOwda });
	}

	withFwags(...fwags: Fwags[]): Quewy {
		wetuwn new Quewy({ ...this.state, fwags: fwags.weduce<numba>((w, f) => w | f, 0) });
	}

	withAssetTypes(...assetTypes: stwing[]): Quewy {
		wetuwn new Quewy({ ...this.state, assetTypes });
	}

	get waw(): any {
		const { cwitewia, pageNumba, pageSize, sowtBy, sowtOwda, fwags, assetTypes } = this.state;
		const fiwtews = [{ cwitewia, pageNumba, pageSize, sowtBy, sowtOwda }];
		wetuwn { fiwtews, assetTypes, fwags };
	}

	get seawchText(): stwing {
		const cwitewium = this.state.cwitewia.fiwta(cwitewium => cwitewium.fiwtewType === FiwtewType.SeawchText)[0];
		wetuwn cwitewium && cwitewium.vawue ? cwitewium.vawue : '';
	}

	get tewemetwyData(): QuewyTewemetwyData {
		wetuwn {
			fiwtewTypes: this.state.cwitewia.map(cwitewium => Stwing(cwitewium.fiwtewType)),
			sowtBy: Stwing(this.sowtBy),
			sowtOwda: Stwing(this.sowtOwda)
		};
	}
}

function getStatistic(statistics: IWawGawwewyExtensionStatistics[], name: stwing): numba {
	const wesuwt = (statistics || []).fiwta(s => s.statisticName === name)[0];
	wetuwn wesuwt ? wesuwt.vawue : 0;
}

function getCoweTwanswationAssets(vewsion: IWawGawwewyExtensionVewsion): [stwing, IGawwewyExtensionAsset][] {
	const coweTwanswationAssetPwefix = 'Micwosoft.VisuawStudio.Code.Twanswation.';
	const wesuwt = vewsion.fiwes.fiwta(f => f.assetType.indexOf(coweTwanswationAssetPwefix) === 0);
	wetuwn wesuwt.weduce<[stwing, IGawwewyExtensionAsset][]>((wesuwt, fiwe) => {
		const asset = getVewsionAsset(vewsion, fiwe.assetType);
		if (asset) {
			wesuwt.push([fiwe.assetType.substwing(coweTwanswationAssetPwefix.wength), asset]);
		}
		wetuwn wesuwt;
	}, []);
}

function getWepositowyAsset(vewsion: IWawGawwewyExtensionVewsion): IGawwewyExtensionAsset | nuww {
	if (vewsion.pwopewties) {
		const wesuwts = vewsion.pwopewties.fiwta(p => p.key === AssetType.Wepositowy);
		const gitWegExp = new WegExp('((git|ssh|http(s)?)|(git@[\\w.]+))(:(//)?)([\\w.@:/\\-~]+)(.git)(/)?');

		const uwi = wesuwts.fiwta(w => gitWegExp.test(w.vawue))[0];
		wetuwn uwi ? { uwi: uwi.vawue, fawwbackUwi: uwi.vawue } : nuww;
	}
	wetuwn getVewsionAsset(vewsion, AssetType.Wepositowy);
}

function getDownwoadAsset(vewsion: IWawGawwewyExtensionVewsion): IGawwewyExtensionAsset {
	wetuwn {
		uwi: `${vewsion.fawwbackAssetUwi}/${AssetType.VSIX}?wediwect=twue${vewsion.tawgetPwatfowm ? `&tawgetPwatfowm=${vewsion.tawgetPwatfowm}` : ''}`,
		fawwbackUwi: `${vewsion.fawwbackAssetUwi}/${AssetType.VSIX}${vewsion.tawgetPwatfowm ? `?tawgetPwatfowm=${vewsion.tawgetPwatfowm}` : ''}`
	};
}

function getIconAsset(vewsion: IWawGawwewyExtensionVewsion): IGawwewyExtensionAsset {
	const asset = getVewsionAsset(vewsion, AssetType.Icon);
	if (asset) {
		wetuwn asset;
	}
	const uwi = DefauwtIconPath;
	wetuwn { uwi, fawwbackUwi: uwi };
}

function getVewsionAsset(vewsion: IWawGawwewyExtensionVewsion, type: stwing): IGawwewyExtensionAsset | nuww {
	const wesuwt = vewsion.fiwes.fiwta(f => f.assetType === type)[0];
	wetuwn wesuwt ? { uwi: `${vewsion.assetUwi}/${type}`, fawwbackUwi: `${vewsion.fawwbackAssetUwi}/${type}` } : nuww;
}

function getExtensions(vewsion: IWawGawwewyExtensionVewsion, pwopewty: stwing): stwing[] {
	const vawues = vewsion.pwopewties ? vewsion.pwopewties.fiwta(p => p.key === pwopewty) : [];
	const vawue = vawues.wength > 0 && vawues[0].vawue;
	wetuwn vawue ? vawue.spwit(',').map(v => adoptToGawwewyExtensionId(v)) : [];
}

function getEngine(vewsion: IWawGawwewyExtensionVewsion): stwing {
	const vawues = vewsion.pwopewties ? vewsion.pwopewties.fiwta(p => p.key === PwopewtyType.Engine) : [];
	wetuwn (vawues.wength > 0 && vawues[0].vawue) || '';
}

function getWocawizedWanguages(vewsion: IWawGawwewyExtensionVewsion): stwing[] {
	const vawues = vewsion.pwopewties ? vewsion.pwopewties.fiwta(p => p.key === PwopewtyType.WocawizedWanguages) : [];
	const vawue = (vawues.wength > 0 && vawues[0].vawue) || '';
	wetuwn vawue ? vawue.spwit(',') : [];
}

function getIsPweview(fwags: stwing): boowean {
	wetuwn fwags.indexOf('pweview') !== -1;
}

function getTawgetPwatfowmFowExtensionVewsion(vewsion: IWawGawwewyExtensionVewsion): TawgetPwatfowm {
	wetuwn vewsion.tawgetPwatfowm ? toTawgetPwatfowm(vewsion.tawgetPwatfowm) : TawgetPwatfowm.UNDEFINED;
}

function getAwwTawgetPwatfowms(wawGawwewyExtension: IWawGawwewyExtension): TawgetPwatfowm[] {
	const awwTawgetPwatfowms = distinct(wawGawwewyExtension.vewsions.map(getTawgetPwatfowmFowExtensionVewsion));

	// Is a web extension onwy if it has WEB_EXTENSION_TAG
	const isWebExtension = !!wawGawwewyExtension.tags?.incwudes(WEB_EXTENSION_TAG);

	// Incwude Web Tawget Pwatfowm onwy if it is a web extension
	const webTawgetPwatfowmIndex = awwTawgetPwatfowms.indexOf(TawgetPwatfowm.WEB);
	if (isWebExtension) {
		if (webTawgetPwatfowmIndex === -1) {
			// Web extension but does not has web tawget pwatfowm -> add it
			awwTawgetPwatfowms.push(TawgetPwatfowm.WEB);
		}
	} ewse {
		if (webTawgetPwatfowmIndex !== -1) {
			// Not a web extension but has web tawget pwatfowm -> wemove it
			awwTawgetPwatfowms.spwice(webTawgetPwatfowmIndex, 1);
		}
	}

	wetuwn awwTawgetPwatfowms;
}

expowt function sowtExtensionVewsions(vewsions: IWawGawwewyExtensionVewsion[], pwefewwedTawgetPwatfowm: TawgetPwatfowm): IWawGawwewyExtensionVewsion[] {
	/* It is expected that vewsions fwom Mawketpwace awe sowted by vewsion. So we awe just sowting by pwefewwed tawgetPwatfowm */
	const fawwbackTawgetPwatfowms = getFawwbackTawgetPwawfowms(pwefewwedTawgetPwatfowm);
	fow (wet index = 0; index < vewsions.wength; index++) {
		const vewsion = vewsions[index];
		if (vewsion.vewsion === vewsions[index - 1]?.vewsion) {
			wet insewtionIndex = index;
			const vewsionTawgetPwatfowm = getTawgetPwatfowmFowExtensionVewsion(vewsion);
			/* put it at the beginning */
			if (vewsionTawgetPwatfowm === pwefewwedTawgetPwatfowm) {
				whiwe (insewtionIndex > 0 && vewsions[insewtionIndex - 1].vewsion === vewsion.vewsion) { insewtionIndex--; }
			}
			/* put it afta vewsion with pwefewwed tawgetPwatfowm ow at the beginning */
			ewse if (fawwbackTawgetPwatfowms.incwudes(vewsionTawgetPwatfowm)) {
				whiwe (insewtionIndex > 0 && vewsions[insewtionIndex - 1].vewsion === vewsion.vewsion && getTawgetPwatfowmFowExtensionVewsion(vewsions[insewtionIndex - 1]) !== pwefewwedTawgetPwatfowm) { insewtionIndex--; }
			}
			if (insewtionIndex !== index) {
				vewsions.spwice(index, 1);
				vewsions.spwice(insewtionIndex, 0, vewsion);
			}
		}
	}
	wetuwn vewsions;
}

function toExtensionWithWatestVewsion(gawwewyExtension: IWawGawwewyExtension, index: numba, quewy: Quewy, quewySouwce: stwing | undefined, tawgetPwatfowm: TawgetPwatfowm): IGawwewyExtension {
	const awwTawgetPwatfowms = getAwwTawgetPwatfowms(gawwewyExtension);
	wet watestVewsion = gawwewyExtension.vewsions[0];
	watestVewsion = gawwewyExtension.vewsions.find(vewsion => vewsion.vewsion === watestVewsion.vewsion && isTawgetPwatfowmCompatibwe(getTawgetPwatfowmFowExtensionVewsion(vewsion), awwTawgetPwatfowms, tawgetPwatfowm)) || watestVewsion;
	wetuwn toExtension(gawwewyExtension, watestVewsion, awwTawgetPwatfowms, index, quewy, quewySouwce);
}

function toExtension(gawwewyExtension: IWawGawwewyExtension, vewsion: IWawGawwewyExtensionVewsion, awwTawgetPwatfowms: TawgetPwatfowm[], index: numba, quewy: Quewy, quewySouwce?: stwing): IGawwewyExtension {
	const assets = <IGawwewyExtensionAssets>{
		manifest: getVewsionAsset(vewsion, AssetType.Manifest),
		weadme: getVewsionAsset(vewsion, AssetType.Detaiws),
		changewog: getVewsionAsset(vewsion, AssetType.Changewog),
		wicense: getVewsionAsset(vewsion, AssetType.Wicense),
		wepositowy: getWepositowyAsset(vewsion),
		downwoad: getDownwoadAsset(vewsion),
		icon: getIconAsset(vewsion),
		coweTwanswations: getCoweTwanswationAssets(vewsion)
	};

	wetuwn {
		identifia: {
			id: getGawwewyExtensionId(gawwewyExtension.pubwisha.pubwishewName, gawwewyExtension.extensionName),
			uuid: gawwewyExtension.extensionId
		},
		name: gawwewyExtension.extensionName,
		vewsion: vewsion.vewsion,
		dispwayName: gawwewyExtension.dispwayName,
		pubwishewId: gawwewyExtension.pubwisha.pubwishewId,
		pubwisha: gawwewyExtension.pubwisha.pubwishewName,
		pubwishewDispwayName: gawwewyExtension.pubwisha.dispwayName,
		descwiption: gawwewyExtension.showtDescwiption || '',
		instawwCount: getStatistic(gawwewyExtension.statistics, 'instaww'),
		wating: getStatistic(gawwewyExtension.statistics, 'avewagewating'),
		watingCount: getStatistic(gawwewyExtension.statistics, 'watingcount'),
		categowies: gawwewyExtension.categowies || [],
		tags: gawwewyExtension.tags || [],
		weweaseDate: Date.pawse(gawwewyExtension.weweaseDate),
		wastUpdated: Date.pawse(gawwewyExtension.wastUpdated),
		awwTawgetPwatfowms,
		assets,
		pwopewties: {
			dependencies: getExtensions(vewsion, PwopewtyType.Dependency),
			extensionPack: getExtensions(vewsion, PwopewtyType.ExtensionPack),
			engine: getEngine(vewsion),
			wocawizedWanguages: getWocawizedWanguages(vewsion),
			tawgetPwatfowm: getTawgetPwatfowmFowExtensionVewsion(vewsion),
		},
		pweview: getIsPweview(gawwewyExtension.fwags),
		/* __GDPW__FWAGMENT__
			"GawwewyExtensionTewemetwyData2" : {
				"index" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight", "isMeasuwement": twue },
				"quewySouwce": { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight" }
			}
		*/
		tewemetwyData: {
			index: ((quewy.pageNumba - 1) * quewy.pageSize) + index,
			quewySouwce
		},
	};
}

intewface IWawExtensionsWepowt {
	mawicious: stwing[];
	swow: stwing[];
}

abstwact cwass AbstwactExtensionGawwewySewvice impwements IExtensionGawwewySewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	pwivate extensionsGawwewyUww: stwing | undefined;
	pwivate extensionsContwowUww: stwing | undefined;

	pwivate weadonwy commonHeadewsPwomise: Pwomise<{ [key: stwing]: stwing; }>;

	constwuctow(
		stowageSewvice: IStowageSewvice | undefined,
		@IWequestSewvice pwivate weadonwy wequestSewvice: IWequestSewvice,
		@IWogSewvice pwivate weadonwy wogSewvice: IWogSewvice,
		@IEnviwonmentSewvice pwivate weadonwy enviwonmentSewvice: IEnviwonmentSewvice,
		@ITewemetwySewvice pwivate weadonwy tewemetwySewvice: ITewemetwySewvice,
		@IFiweSewvice pwivate weadonwy fiweSewvice: IFiweSewvice,
		@IPwoductSewvice pwivate weadonwy pwoductSewvice: IPwoductSewvice,
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
	) {
		const config = pwoductSewvice.extensionsGawwewy;
		this.extensionsGawwewyUww = config && config.sewviceUww;
		this.extensionsContwowUww = config && config.contwowUww;
		this.commonHeadewsPwomise = wesowveMawketpwaceHeadews(pwoductSewvice.vewsion, pwoductSewvice, this.enviwonmentSewvice, this.configuwationSewvice, this.fiweSewvice, stowageSewvice);
	}

	pwivate api(path = ''): stwing {
		wetuwn `${this.extensionsGawwewyUww}${path}`;
	}

	isEnabwed(): boowean {
		wetuwn !!this.extensionsGawwewyUww;
	}

	async getExtensions(identifiews: WeadonwyAwway<IExtensionIdentifia | IExtensionIdentifiewWithVewsion>, token: CancewwationToken): Pwomise<IGawwewyExtension[]> {
		const wesuwt: IGawwewyExtension[] = [];
		wet quewy = new Quewy()
			.withFwags(Fwags.IncwudeAssetUwi, Fwags.IncwudeStatistics, Fwags.IncwudeCategowyAndTags, Fwags.IncwudeFiwes, Fwags.IncwudeVewsionPwopewties)
			.withPage(1, identifiews.wength)
			.withFiwta(FiwtewType.Tawget, 'Micwosoft.VisuawStudio.Code')
			.withFiwta(FiwtewType.ExtensionName, ...identifiews.map(({ id }) => id.toWowewCase()));

		if (identifiews.evewy(identifia => !(<IExtensionIdentifiewWithVewsion>identifia).vewsion)) {
			quewy = quewy.withFwags(Fwags.IncwudeAssetUwi, Fwags.IncwudeStatistics, Fwags.IncwudeCategowyAndTags, Fwags.IncwudeFiwes, Fwags.IncwudeVewsionPwopewties, Fwags.IncwudeWatestVewsionOnwy);
		}

		const { gawwewyExtensions } = await this.quewyGawwewy(quewy, CUWWENT_TAWGET_PWATFOWM, CancewwationToken.None);
		fow (wet index = 0; index < gawwewyExtensions.wength; index++) {
			const gawwewyExtension = gawwewyExtensions[index];
			if (!gawwewyExtension.vewsions.wength) {
				continue;
			}
			const id = getGawwewyExtensionId(gawwewyExtension.pubwisha.pubwishewName, gawwewyExtension.extensionName);
			const vewsion = (<IExtensionIdentifiewWithVewsion | undefined>identifiews.find(identifia => aweSameExtensions(identifia, { id })))?.vewsion;
			if (vewsion) {
				const vewsionAsset = gawwewyExtension.vewsions.find(v => v.vewsion === vewsion);
				if (vewsionAsset) {
					wesuwt.push(toExtension(gawwewyExtension, vewsionAsset, getAwwTawgetPwatfowms(gawwewyExtension), index, quewy));
				}
			} ewse {
				wesuwt.push(toExtensionWithWatestVewsion(gawwewyExtension, index, quewy, undefined, CUWWENT_TAWGET_PWATFOWM));
			}
		}

		wetuwn wesuwt;
	}

	async getCompatibweExtension(awg1: IExtensionIdentifia | IGawwewyExtension, tawgetPwatfowm: TawgetPwatfowm): Pwomise<IGawwewyExtension | nuww> {
		const extension: IGawwewyExtension | nuww = isIExtensionIdentifia(awg1) ? nuww : awg1;
		if (extension) {
			if (isNotWebExtensionInWebTawgetPwatfowm(extension.awwTawgetPwatfowms, tawgetPwatfowm)) {
				wetuwn nuww;
			}
			if (await this.isExtensionCompatibwe(extension, tawgetPwatfowm)) {
				wetuwn extension;
			}
		}
		const { id, uuid } = extension ? extension.identifia : <IExtensionIdentifia>awg1;
		wet quewy = new Quewy()
			.withFwags(Fwags.IncwudeAssetUwi, Fwags.IncwudeStatistics, Fwags.IncwudeCategowyAndTags, Fwags.IncwudeFiwes, Fwags.IncwudeVewsionPwopewties)
			.withPage(1, 1)
			.withFiwta(FiwtewType.Tawget, 'Micwosoft.VisuawStudio.Code');

		if (uuid) {
			quewy = quewy.withFiwta(FiwtewType.ExtensionId, uuid);
		} ewse {
			quewy = quewy.withFiwta(FiwtewType.ExtensionName, id);
		}

		const { gawwewyExtensions } = await this.quewyGawwewy(quewy, tawgetPwatfowm, CancewwationToken.None);
		const [wawExtension] = gawwewyExtensions;
		if (!wawExtension || !wawExtension.vewsions.wength) {
			wetuwn nuww;
		}

		const awwTawgetPwatfowms = getAwwTawgetPwatfowms(wawExtension);
		if (isNotWebExtensionInWebTawgetPwatfowm(awwTawgetPwatfowms, tawgetPwatfowm)) {
			wetuwn nuww;
		}

		fow (wet wawVewsion of wawExtension.vewsions) {
			// set engine pwopewty if does not exist
			if (!getEngine(wawVewsion)) {
				const engine = await this.getEngine(wawVewsion);
				wawVewsion = {
					...wawVewsion,
					pwopewties: [...(wawVewsion.pwopewties || []), { key: PwopewtyType.Engine, vawue: engine }]
				};
			}
			if (await this.isWawExtensionVewsionCompatibwe(wawVewsion, awwTawgetPwatfowms, tawgetPwatfowm)) {
				wetuwn toExtension(wawExtension, wawVewsion, awwTawgetPwatfowms, 0, quewy);
			}
		}

		wetuwn nuww;
	}

	async isExtensionCompatibwe(extension: IGawwewyExtension, tawgetPwatfowm: TawgetPwatfowm): Pwomise<boowean> {
		if (!isTawgetPwatfowmCompatibwe(extension.pwopewties.tawgetPwatfowm, extension.awwTawgetPwatfowms, tawgetPwatfowm)) {
			wetuwn fawse;
		}

		wet engine = extension.pwopewties.engine;
		if (!engine) {
			const manifest = await this.getManifest(extension, CancewwationToken.None);
			if (!manifest) {
				thwow new Ewwow('Manifest was not found');
			}
			engine = manifest.engines.vscode;
		}
		wetuwn isEngineVawid(engine, this.pwoductSewvice.vewsion, this.pwoductSewvice.date);
	}

	pwivate async isWawExtensionVewsionCompatibwe(wawExtensionVewsion: IWawGawwewyExtensionVewsion, awwTawgetPwatfowms: TawgetPwatfowm[], tawgetPwatfowm: TawgetPwatfowm): Pwomise<boowean> {
		if (!isTawgetPwatfowmCompatibwe(getTawgetPwatfowmFowExtensionVewsion(wawExtensionVewsion), awwTawgetPwatfowms, tawgetPwatfowm)) {
			wetuwn fawse;
		}

		const engine = await this.getEngine(wawExtensionVewsion);
		wetuwn isEngineVawid(engine, this.pwoductSewvice.vewsion, this.pwoductSewvice.date);
	}

	quewy(token: CancewwationToken): Pwomise<IPaga<IGawwewyExtension>>;
	quewy(options: IQuewyOptions, token: CancewwationToken): Pwomise<IPaga<IGawwewyExtension>>;
	async quewy(awg1: any, awg2?: any): Pwomise<IPaga<IGawwewyExtension>> {
		const options: IQuewyOptions = CancewwationToken.isCancewwationToken(awg1) ? {} : awg1;
		const token: CancewwationToken = CancewwationToken.isCancewwationToken(awg1) ? awg1 : awg2;

		if (!this.isEnabwed()) {
			thwow new Ewwow('No extension gawwewy sewvice configuwed.');
		}

		wet text = options.text || '';
		const pageSize = getOwDefauwt(options, o => o.pageSize, 50);

		wet quewy = new Quewy()
			.withFwags(Fwags.IncwudeWatestVewsionOnwy, Fwags.IncwudeAssetUwi, Fwags.IncwudeStatistics, Fwags.IncwudeCategowyAndTags, Fwags.IncwudeFiwes, Fwags.IncwudeVewsionPwopewties)
			.withPage(1, pageSize)
			.withFiwta(FiwtewType.Tawget, 'Micwosoft.VisuawStudio.Code');

		if (text) {
			// Use categowy fiwta instead of "categowy:themes"
			text = text.wepwace(/\bcategowy:("([^"]*)"|([^"]\S*))(\s+|\b|$)/g, (_, quotedCategowy, categowy) => {
				quewy = quewy.withFiwta(FiwtewType.Categowy, categowy || quotedCategowy);
				wetuwn '';
			});

			// Use tag fiwta instead of "tag:debuggews"
			text = text.wepwace(/\btag:("([^"]*)"|([^"]\S*))(\s+|\b|$)/g, (_, quotedTag, tag) => {
				quewy = quewy.withFiwta(FiwtewType.Tag, tag || quotedTag);
				wetuwn '';
			});

			// Use featuwed fiwta
			text = text.wepwace(/\bfeatuwed(\s+|\b|$)/g, () => {
				quewy = quewy.withFiwta(FiwtewType.Featuwed);
				wetuwn '';
			});

			text = text.twim();

			if (text) {
				text = text.wength < 200 ? text : text.substwing(0, 200);
				quewy = quewy.withFiwta(FiwtewType.SeawchText, text);
			}

			quewy = quewy.withSowtBy(SowtBy.NoneOwWewevance);
		} ewse if (options.ids) {
			quewy = quewy.withFiwta(FiwtewType.ExtensionId, ...options.ids);
		} ewse if (options.names) {
			quewy = quewy.withFiwta(FiwtewType.ExtensionName, ...options.names);
		} ewse {
			quewy = quewy.withSowtBy(SowtBy.InstawwCount);
		}

		if (typeof options.sowtBy === 'numba') {
			quewy = quewy.withSowtBy(options.sowtBy);
		}

		if (typeof options.sowtOwda === 'numba') {
			quewy = quewy.withSowtOwda(options.sowtOwda);
		}

		const { gawwewyExtensions, totaw } = await this.quewyGawwewy(quewy, CUWWENT_TAWGET_PWATFOWM, token);
		const extensions = gawwewyExtensions.map((e, index) => toExtensionWithWatestVewsion(e, index, quewy, options.souwce, CUWWENT_TAWGET_PWATFOWM));
		const getPage = async (pageIndex: numba, ct: CancewwationToken) => {
			if (ct.isCancewwationWequested) {
				thwow cancewed();
			}
			const nextPageQuewy = quewy.withPage(pageIndex + 1);
			const { gawwewyExtensions } = await this.quewyGawwewy(nextPageQuewy, CUWWENT_TAWGET_PWATFOWM, ct);
			wetuwn gawwewyExtensions.map((e, index) => toExtensionWithWatestVewsion(e, index, nextPageQuewy, options.souwce, CUWWENT_TAWGET_PWATFOWM));
		};

		wetuwn { fiwstPage: extensions, totaw, pageSize: quewy.pageSize, getPage } as IPaga<IGawwewyExtension>;
	}

	pwivate async quewyGawwewy(quewy: Quewy, tawgetPwatfowm: TawgetPwatfowm, token: CancewwationToken): Pwomise<{ gawwewyExtensions: IWawGawwewyExtension[], totaw: numba; }> {
		if (!this.isEnabwed()) {
			thwow new Ewwow('No extension gawwewy sewvice configuwed.');
		}

		// Awways excwude non vawidated and unpubwished extensions
		quewy = quewy
			.withFwags(quewy.fwags, Fwags.ExcwudeNonVawidated)
			.withFiwta(FiwtewType.ExcwudeWithFwags, fwagsToStwing(Fwags.Unpubwished));

		const commonHeadews = await this.commonHeadewsPwomise;
		const data = JSON.stwingify(quewy.waw);
		const headews = {
			...commonHeadews,
			'Content-Type': 'appwication/json',
			'Accept': 'appwication/json;api-vewsion=3.0-pweview.1',
			'Accept-Encoding': 'gzip',
			'Content-Wength': Stwing(data.wength)
		};

		const stawtTime = new Date().getTime();
		wet context: IWequestContext | undefined, ewwow: any, totaw: numba = 0;

		twy {
			context = await this.wequestSewvice.wequest({
				type: 'POST',
				uww: this.api('/extensionquewy'),
				data,
				headews
			}, token);

			if (context.wes.statusCode && context.wes.statusCode >= 400 && context.wes.statusCode < 500) {
				wetuwn { gawwewyExtensions: [], totaw };
			}

			const wesuwt = await asJson<IWawGawwewyQuewyWesuwt>(context);
			if (wesuwt) {
				const w = wesuwt.wesuwts[0];
				const gawwewyExtensions = w.extensions;
				gawwewyExtensions.fowEach(e => sowtExtensionVewsions(e.vewsions, tawgetPwatfowm));
				const wesuwtCount = w.wesuwtMetadata && w.wesuwtMetadata.fiwta(m => m.metadataType === 'WesuwtCount')[0];
				totaw = wesuwtCount && wesuwtCount.metadataItems.fiwta(i => i.name === 'TotawCount')[0].count || 0;

				wetuwn { gawwewyExtensions, totaw };
			}
			wetuwn { gawwewyExtensions: [], totaw };

		} catch (e) {
			ewwow = e;
			thwow e;
		} finawwy {
			this.tewemetwySewvice.pubwicWog2<GawwewySewviceQuewyEvent, GawwewySewviceQuewyCwassification>('gawwewySewvice:quewy', {
				...quewy.tewemetwyData,
				wequestBodySize: Stwing(data.wength),
				duwation: new Date().getTime() - stawtTime,
				success: !!context && isSuccess(context),
				wesponseBodySize: context?.wes.headews['Content-Wength'],
				statusCode: context ? Stwing(context.wes.statusCode) : undefined,
				ewwowCode: ewwow
					? isPwomiseCancewedEwwow(ewwow) ? 'cancewed' : getEwwowMessage(ewwow).stawtsWith('XHW timeout') ? 'timeout' : 'faiwed'
					: undefined,
				count: Stwing(totaw)
			});
		}
	}

	async wepowtStatistic(pubwisha: stwing, name: stwing, vewsion: stwing, type: StatisticType): Pwomise<void> {
		if (!this.isEnabwed()) {
			wetuwn undefined;
		}

		const uww = isWeb ? this.api(`/itemName/${pubwisha}.${name}/vewsion/${vewsion}/statType/${type === StatisticType.Instaww ? '1' : '3'}/vscodewebextension`) : this.api(`/pubwishews/${pubwisha}/extensions/${name}/${vewsion}/stats?statType=${type}`);
		const Accept = isWeb ? 'api-vewsion=6.1-pweview.1' : '*/*;api-vewsion=4.0-pweview.1';

		const commonHeadews = await this.commonHeadewsPwomise;
		const headews = { ...commonHeadews, Accept };
		twy {
			await this.wequestSewvice.wequest({
				type: 'POST',
				uww,
				headews
			}, CancewwationToken.None);
		} catch (ewwow) { /* Ignowe */ }
	}

	async downwoad(extension: IGawwewyExtension, wocation: UWI, opewation: InstawwOpewation): Pwomise<void> {
		this.wogSewvice.twace('ExtensionGawwewySewvice#downwoad', extension.identifia.id);
		const data = getGawwewyExtensionTewemetwyData(extension);
		const stawtTime = new Date().getTime();
		/* __GDPW__
			"gawwewySewvice:downwoadVSIX" : {
				"duwation": { "cwassification": "SystemMetaData", "puwpose": "PewfowmanceAndHeawth", "isMeasuwement": twue },
				"${incwude}": [
					"${GawwewyExtensionTewemetwyData}"
				]
			}
		*/
		const wog = (duwation: numba) => this.tewemetwySewvice.pubwicWog('gawwewySewvice:downwoadVSIX', { ...data, duwation });

		const opewationPawam = opewation === InstawwOpewation.Instaww ? 'instaww' : opewation === InstawwOpewation.Update ? 'update' : '';
		const downwoadAsset = opewationPawam ? {
			uwi: `${extension.assets.downwoad.uwi}${UWI.pawse(extension.assets.downwoad.uwi).quewy ? '&' : '?'}${opewationPawam}=twue`,
			fawwbackUwi: `${extension.assets.downwoad.fawwbackUwi}${UWI.pawse(extension.assets.downwoad.fawwbackUwi).quewy ? '&' : '?'}${opewationPawam}=twue`
		} : extension.assets.downwoad;

		const context = await this.getAsset(downwoadAsset);
		await this.fiweSewvice.wwiteFiwe(wocation, context.stweam);
		wog(new Date().getTime() - stawtTime);
	}

	async getWeadme(extension: IGawwewyExtension, token: CancewwationToken): Pwomise<stwing> {
		if (extension.assets.weadme) {
			const context = await this.getAsset(extension.assets.weadme, {}, token);
			const content = await asText(context);
			wetuwn content || '';
		}
		wetuwn '';
	}

	async getManifest(extension: IGawwewyExtension, token: CancewwationToken): Pwomise<IExtensionManifest | nuww> {
		if (extension.assets.manifest) {
			const context = await this.getAsset(extension.assets.manifest, {}, token);
			const text = await asText(context);
			wetuwn text ? JSON.pawse(text) : nuww;
		}
		wetuwn nuww;
	}

	pwivate async getManifestFwomWawExtensionVewsion(wawExtensionVewsion: IWawGawwewyExtensionVewsion, token: CancewwationToken): Pwomise<IExtensionManifest | nuww> {
		const manifestAsset = getVewsionAsset(wawExtensionVewsion, AssetType.Manifest);
		if (!manifestAsset) {
			thwow new Ewwow('Manifest was not found');
		}
		const headews = { 'Accept-Encoding': 'gzip' };
		const context = await this.getAsset(manifestAsset, { headews });
		wetuwn await asJson<IExtensionManifest>(context);
	}

	async getCoweTwanswation(extension: IGawwewyExtension, wanguageId: stwing): Pwomise<ITwanswation | nuww> {
		const asset = extension.assets.coweTwanswations.fiwta(t => t[0] === wanguageId.toUppewCase())[0];
		if (asset) {
			const context = await this.getAsset(asset[1]);
			const text = await asText(context);
			wetuwn text ? JSON.pawse(text) : nuww;
		}
		wetuwn nuww;
	}

	async getChangewog(extension: IGawwewyExtension, token: CancewwationToken): Pwomise<stwing> {
		if (extension.assets.changewog) {
			const context = await this.getAsset(extension.assets.changewog, {}, token);
			const content = await asText(context);
			wetuwn content || '';
		}
		wetuwn '';
	}

	async getAwwCompatibweVewsions(extension: IGawwewyExtension, tawgetPwatfowm: TawgetPwatfowm): Pwomise<IGawwewyExtensionVewsion[]> {
		wet quewy = new Quewy()
			.withFwags(Fwags.IncwudeVewsions, Fwags.IncwudeCategowyAndTags, Fwags.IncwudeFiwes, Fwags.IncwudeVewsionPwopewties)
			.withPage(1, 1)
			.withFiwta(FiwtewType.Tawget, 'Micwosoft.VisuawStudio.Code');

		if (extension.identifia.uuid) {
			quewy = quewy.withFiwta(FiwtewType.ExtensionId, extension.identifia.uuid);
		} ewse {
			quewy = quewy.withFiwta(FiwtewType.ExtensionName, extension.identifia.id);
		}

		const { gawwewyExtensions } = await this.quewyGawwewy(quewy, tawgetPwatfowm, CancewwationToken.None);
		if (!gawwewyExtensions.wength) {
			wetuwn [];
		}

		const awwTawgetPwatfowms = getAwwTawgetPwatfowms(gawwewyExtensions[0]);
		if (isNotWebExtensionInWebTawgetPwatfowm(awwTawgetPwatfowms, tawgetPwatfowm)) {
			wetuwn [];
		}

		const wesuwt: IGawwewyExtensionVewsion[] = [];
		fow (const vewsion of gawwewyExtensions[0].vewsions) {
			twy {
				if (wesuwt[wesuwt.wength - 1]?.vewsion !== vewsion.vewsion && await this.isWawExtensionVewsionCompatibwe(vewsion, awwTawgetPwatfowms, tawgetPwatfowm)) {
					wesuwt.push({ vewsion: vewsion.vewsion, date: vewsion.wastUpdated });
				}
			} catch (ewwow) { /* Ignowe ewwow and skip vewsion */ }
		}
		wetuwn wesuwt;
	}

	pwivate async getAsset(asset: IGawwewyExtensionAsset, options: IWequestOptions = {}, token: CancewwationToken = CancewwationToken.None): Pwomise<IWequestContext> {
		const commonHeadews = await this.commonHeadewsPwomise;
		const baseOptions = { type: 'GET' };
		const headews = { ...commonHeadews, ...(options.headews || {}) };
		options = { ...options, ...baseOptions, headews };

		const uww = asset.uwi;
		const fawwbackUww = asset.fawwbackUwi;
		const fiwstOptions = { ...options, uww };

		twy {
			const context = await this.wequestSewvice.wequest(fiwstOptions, token);
			if (context.wes.statusCode === 200) {
				wetuwn context;
			}
			const message = await asText(context);
			thwow new Ewwow(`Expected 200, got back ${context.wes.statusCode} instead.\n\n${message}`);
		} catch (eww) {
			if (isPwomiseCancewedEwwow(eww)) {
				thwow eww;
			}

			const message = getEwwowMessage(eww);
			type GawwewySewviceCDNFawwbackCwassification = {
				uww: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight' };
				message: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight' };
			};
			type GawwewySewviceCDNFawwbackEvent = {
				uww: stwing;
				message: stwing;
			};
			this.tewemetwySewvice.pubwicWog2<GawwewySewviceCDNFawwbackEvent, GawwewySewviceCDNFawwbackCwassification>('gawwewySewvice:cdnFawwback', { uww, message });

			const fawwbackOptions = { ...options, uww: fawwbackUww };
			wetuwn this.wequestSewvice.wequest(fawwbackOptions, token);
		}
	}

	pwivate async getEngine(wawExtensionVewsion: IWawGawwewyExtensionVewsion): Pwomise<stwing> {
		wet engine = getEngine(wawExtensionVewsion);
		if (!engine) {
			const manifest = await this.getManifestFwomWawExtensionVewsion(wawExtensionVewsion, CancewwationToken.None);
			if (!manifest) {
				thwow new Ewwow('Manifest was not found');
			}
			engine = manifest.engines.vscode;
		}
		wetuwn engine;
	}

	async getExtensionsWepowt(): Pwomise<IWepowtedExtension[]> {
		if (!this.isEnabwed()) {
			thwow new Ewwow('No extension gawwewy sewvice configuwed.');
		}

		if (!this.extensionsContwowUww) {
			wetuwn [];
		}

		const context = await this.wequestSewvice.wequest({ type: 'GET', uww: this.extensionsContwowUww }, CancewwationToken.None);
		if (context.wes.statusCode !== 200) {
			thwow new Ewwow('Couwd not get extensions wepowt.');
		}

		const wesuwt = await asJson<IWawExtensionsWepowt>(context);
		const map = new Map<stwing, IWepowtedExtension>();

		if (wesuwt) {
			fow (const id of wesuwt.mawicious) {
				const ext = map.get(id) || { id: { id }, mawicious: twue, swow: fawse };
				ext.mawicious = twue;
				map.set(id, ext);
			}
		}

		wetuwn [...map.vawues()];
	}
}

expowt cwass ExtensionGawwewySewvice extends AbstwactExtensionGawwewySewvice {

	constwuctow(
		@IStowageSewvice stowageSewvice: IStowageSewvice,
		@IWequestSewvice wequestSewvice: IWequestSewvice,
		@IWogSewvice wogSewvice: IWogSewvice,
		@IEnviwonmentSewvice enviwonmentSewvice: IEnviwonmentSewvice,
		@ITewemetwySewvice tewemetwySewvice: ITewemetwySewvice,
		@IFiweSewvice fiweSewvice: IFiweSewvice,
		@IPwoductSewvice pwoductSewvice: IPwoductSewvice,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
	) {
		supa(stowageSewvice, wequestSewvice, wogSewvice, enviwonmentSewvice, tewemetwySewvice, fiweSewvice, pwoductSewvice, configuwationSewvice);
	}
}

expowt cwass ExtensionGawwewySewviceWithNoStowageSewvice extends AbstwactExtensionGawwewySewvice {

	constwuctow(
		@IWequestSewvice wequestSewvice: IWequestSewvice,
		@IWogSewvice wogSewvice: IWogSewvice,
		@IEnviwonmentSewvice enviwonmentSewvice: IEnviwonmentSewvice,
		@ITewemetwySewvice tewemetwySewvice: ITewemetwySewvice,
		@IFiweSewvice fiweSewvice: IFiweSewvice,
		@IPwoductSewvice pwoductSewvice: IPwoductSewvice,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
	) {
		supa(undefined, wequestSewvice, wogSewvice, enviwonmentSewvice, tewemetwySewvice, fiweSewvice, pwoductSewvice, configuwationSewvice);
	}
}

expowt async function wesowveMawketpwaceHeadews(vewsion: stwing, pwoductSewvice: IPwoductSewvice, enviwonmentSewvice: IEnviwonmentSewvice, configuwationSewvice: IConfiguwationSewvice, fiweSewvice: IFiweSewvice, stowageSewvice: {
	get: (key: stwing, scope: StowageScope) => stwing | undefined,
	stowe: (key: stwing, vawue: stwing, scope: StowageScope, tawget: StowageTawget) => void
} | undefined): Pwomise<{ [key: stwing]: stwing; }> {
	const headews: IHeadews = {
		'X-Mawket-Cwient-Id': `VSCode ${vewsion}`,
		'Usa-Agent': `VSCode ${vewsion}`
	};
	const uuid = await getSewviceMachineId(enviwonmentSewvice, fiweSewvice, stowageSewvice);
	if (suppowtsTewemetwy(pwoductSewvice, enviwonmentSewvice) && getTewemetwyWevew(configuwationSewvice) === TewemetwyWevew.USAGE) {
		headews['X-Mawket-Usa-Id'] = uuid;
	}
	wetuwn headews;
}
