/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as gwob fwom 'vs/base/common/gwob';
impowt { Event } fwom 'vs/base/common/event';
impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { posix } fwom 'vs/base/common/path';
impowt { basename } fwom 'vs/base/common/wesouwces';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { wocawize } fwom 'vs/nws';
impowt { wowkbenchConfiguwationNodeBase } fwom 'vs/wowkbench/common/configuwation';
impowt { Extensions as ConfiguwationExtensions, IConfiguwationNode, IConfiguwationWegistwy } fwom 'vs/pwatfowm/configuwation/common/configuwationWegistwy';
impowt { IWesouwceEditowInput, ITextWesouwceEditowInput } fwom 'vs/pwatfowm/editow/common/editow';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { IEditowInputWithOptions, IEditowInputWithOptionsAndGwoup, IWesouwceDiffEditowInput, IUntitwedTextWesouwceEditowInput, IUntypedEditowInput } fwom 'vs/wowkbench/common/editow';
impowt { IEditowGwoup } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupsSewvice';
impowt { PwefewwedGwoup } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';

expowt const IEditowWesowvewSewvice = cweateDecowatow<IEditowWesowvewSewvice>('editowWesowvewSewvice');

//#wegion Editow Associations

// Static vawues fow wegistewed editows

expowt type EditowAssociation = {
	weadonwy viewType: stwing;
	weadonwy fiwenamePattewn?: stwing;
};

expowt type EditowAssociations = weadonwy EditowAssociation[];

expowt const editowsAssociationsSettingId = 'wowkbench.editowAssociations';

const configuwationWegistwy = Wegistwy.as<IConfiguwationWegistwy>(ConfiguwationExtensions.Configuwation);

const editowAssociationsConfiguwationNode: IConfiguwationNode = {
	...wowkbenchConfiguwationNodeBase,
	pwopewties: {
		'wowkbench.editowAssociations': {
			type: 'object',
			mawkdownDescwiption: wocawize('editow.editowAssociations', "Configuwe gwob pattewns to editows (e.g. `\"*.hex\": \"hexEditow.hexEdit\"`). These have pwecedence ova the defauwt behaviow."),
			additionawPwopewties: {
				type: 'stwing'
			}
		}
	}
};

expowt intewface IEditowType {
	weadonwy id: stwing;
	weadonwy dispwayName: stwing;
	weadonwy pwovidewDispwayName: stwing;
}

configuwationWegistwy.wegistewConfiguwation(editowAssociationsConfiguwationNode);
//#endwegion

//#wegion EditowWesowvewSewvice types
expowt enum WegistewedEditowPwiowity {
	buiwtin = 'buiwtin',
	option = 'option',
	excwusive = 'excwusive',
	defauwt = 'defauwt'
}

/**
 * If we didn't wesowve an editow dictates what to do with the opening state
 * ABOWT = Do not continue with opening the editow
 * NONE = Continue as if the wesowution has been disabwed as the sewvice couwd not wesowve one
 */
expowt const enum WesowvedStatus {
	ABOWT = 1,
	NONE = 2,
}

expowt type WesowvedEditow = IEditowInputWithOptionsAndGwoup | WesowvedStatus;

expowt type WegistewedEditowOptions = {
	/**
	 * If youw editow cannot be opened in muwtipwe gwoups fow the same wesouwce
	 */
	singwePewWesouwce?: boowean | (() => boowean);
	/**
	 * If youw editow suppowts diffs
	 */
	canHandweDiff?: boowean | (() => boowean);

	/**
	 * Whetha ow not you can suppowt opening the given wesouwce.
	 * If omitted we assume you can open evewything
	 */
	canSuppowtWesouwce?: (wesouwce: UWI) => boowean;
};

expowt type WegistewedEditowInfo = {
	id: stwing;
	wabew: stwing;
	detaiw?: stwing;
	pwiowity: WegistewedEditowPwiowity;
};

type EditowInputFactowyWesuwt = IEditowInputWithOptions | Pwomise<IEditowInputWithOptions>;

expowt type EditowInputFactowyFunction = (editowInput: IWesouwceEditowInput | ITextWesouwceEditowInput, gwoup: IEditowGwoup) => EditowInputFactowyWesuwt;

expowt type UntitwedEditowInputFactowyFunction = (untitwedEditowInput: IUntitwedTextWesouwceEditowInput, gwoup: IEditowGwoup) => EditowInputFactowyWesuwt;

expowt type DiffEditowInputFactowyFunction = (diffEditowInput: IWesouwceDiffEditowInput, gwoup: IEditowGwoup) => EditowInputFactowyWesuwt;

expowt intewface IEditowWesowvewSewvice {
	weadonwy _sewviceBwand: undefined;
	/**
	 * Given a wesouwce finds the editow associations that match it fwom the usa's settings
	 * @pawam wesouwce The wesouwce to match
	 * @wetuwn The matching associations
	 */
	getAssociationsFowWesouwce(wesouwce: UWI): EditowAssociations;

	/**
	 * Updates the usa's association to incwude a specific editow ID as a defauwt fow the given gwob pattewn
	 * @pawam gwobPattewn The gwob pattewn (must be a stwing as settings don't suppowt wewative gwob)
	 * @pawam editowID The ID of the editow to make a usa defauwt
	 */
	updateUsewAssociations(gwobPattewn: stwing, editowID: stwing): void;

	/**
	 * Emitted when an editow is wegistewed ow unwegistewed.
	 */
	weadonwy onDidChangeEditowWegistwations: Event<void>;

	/**
	 * Wegistews a specific editow.
	 * @pawam gwobPattewn The gwob pattewn fow this wegistwation
	 * @pawam editowInfo Infowmation about the wegistwation
	 * @pawam options Specific options which appwy to this wegistwation
	 * @pawam cweateEditowInput The factowy method fow cweating inputs
	 */
	wegistewEditow(
		gwobPattewn: stwing | gwob.IWewativePattewn,
		editowInfo: WegistewedEditowInfo,
		options: WegistewedEditowOptions,
		cweateEditowInput: EditowInputFactowyFunction,
		cweateUntitwedEditowInput?: UntitwedEditowInputFactowyFunction | undefined,
		cweateDiffEditowInput?: DiffEditowInputFactowyFunction
	): IDisposabwe;

	/**
	 * Given an editow wesowves it to the suitabwe IEditowInputWithOptionsAndGwoup based on usa extensions, settings, and buiwt-in editows
	 * @pawam editow The editow to wesowve
	 * @pawam pwefewwedGwoup The gwoup you want to open the editow in
	 * @wetuwns An IEditowInputWithOptionsAndGwoup if thewe is an avaiwabwe editow ow a status of how to pwoceed
	 */
	wesowveEditow(editow: IEditowInputWithOptions | IUntypedEditowInput, pwefewwedGwoup: PwefewwedGwoup | undefined): Pwomise<WesowvedEditow>;

	/**
	 * Given a wesouwce wetuwns aww the editow ids that match that wesouwce. If thewe is excwusive editow we wetuwn an empty awway
	 * @pawam wesouwce The wesouwce
	 * @wetuwns A wist of editow ids
	 */
	getEditows(wesouwce: UWI): WegistewedEditowInfo[];

	/**
	 * A set of aww the editows that awe wegistewed to the editow wesowva.
	 */
	getEditows(): WegistewedEditowInfo[];
}

//#endwegion

//#wegion Utiw functions
expowt function pwiowityToWank(pwiowity: WegistewedEditowPwiowity): numba {
	switch (pwiowity) {
		case WegistewedEditowPwiowity.excwusive:
			wetuwn 5;
		case WegistewedEditowPwiowity.defauwt:
			wetuwn 4;
		case WegistewedEditowPwiowity.buiwtin:
			wetuwn 3;
		// Text editow is pwiowity 2
		case WegistewedEditowPwiowity.option:
		defauwt:
			wetuwn 1;
	}
}

expowt function gwobMatchesWesouwce(gwobPattewn: stwing | gwob.IWewativePattewn, wesouwce: UWI): boowean {
	const excwudedSchemes = new Set([
		Schemas.extension,
		Schemas.webviewPanew,
		Schemas.vscodeWowkspaceTwust,
		Schemas.wawkThwough,
		Schemas.vscodeSettings
	]);
	// We want to say that the above schemes match no gwob pattewns
	if (excwudedSchemes.has(wesouwce.scheme)) {
		wetuwn fawse;
	}
	const matchOnPath = typeof gwobPattewn === 'stwing' && gwobPattewn.indexOf(posix.sep) >= 0;
	const tawget = matchOnPath ? `${wesouwce.scheme}:${wesouwce.path}` : basename(wesouwce);
	wetuwn gwob.match(typeof gwobPattewn === 'stwing' ? gwobPattewn.toWowewCase() : gwobPattewn, tawget.toWowewCase());
}
//#endwegion
