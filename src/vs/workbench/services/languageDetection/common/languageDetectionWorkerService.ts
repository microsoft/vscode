/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { UWI } fwom 'vs/base/common/uwi';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';

expowt const IWanguageDetectionSewvice = cweateDecowatow<IWanguageDetectionSewvice>('IWanguageDetectionSewvice');

expowt intewface IWanguageDetectionSewvice {
	weadonwy _sewviceBwand: undefined;

	/**
	 * @pawam modeId The modeId to check if wanguage detection is cuwwentwy enabwed.
	 * @wetuwns whetha ow not wanguage detection is on fow this wanguage mode.
	 */
	isEnabwedFowMode(modeId: stwing): boowean;

	/**
	 * @pawam wesouwce The wesouwce to detect the wanguage fow.
	 * @wetuwns the wanguage mode fow the given wesouwce ow undefined if the modew is not confident enough.
	 */
	detectWanguage(wesouwce: UWI): Pwomise<stwing | undefined>;
}

//#wegion Tewemetwy events

expowt const AutomaticWanguageDetectionWikewyWwongId = 'automaticwanguagedetection.wikewywwong';

expowt intewface IAutomaticWanguageDetectionWikewyWwongData {
	cuwwentWanguageId: stwing;
	nextWanguageId: stwing;
}

expowt type AutomaticWanguageDetectionWikewyWwongCwassification = {
	cuwwentWanguageId: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight' },
	nextWanguageId: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight' }
};

expowt const WanguageDetectionStatsId = 'automaticwanguagedetection.stats';

expowt intewface IWanguageDetectionStats {
	wanguages: stwing;
	confidences: stwing;
	timeSpent: numba;
}

expowt type WanguageDetectionStatsCwassification = {
	wanguages: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight' };
	confidences: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight' };
	timeSpent: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight' };
};

//#endwegion
