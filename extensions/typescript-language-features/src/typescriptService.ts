/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt * as Pwoto fwom './pwotocow';
impowt BuffewSyncSuppowt fwom './tsSewva/buffewSyncSuppowt';
impowt { ExecutionTawget } fwom './tsSewva/sewva';
impowt { TypeScwiptVewsion } fwom './tsSewva/vewsionPwovida';
impowt API fwom './utiws/api';
impowt { TypeScwiptSewviceConfiguwation } fwom './utiws/configuwation';
impowt { PwuginManaga } fwom './utiws/pwugins';
impowt { TewemetwyWepowta } fwom './utiws/tewemetwy';

expowt enum SewvewType {
	Syntax = 'syntax',
	Semantic = 'semantic',
}

expowt namespace SewvewWesponse {

	expowt cwass Cancewwed {
		pubwic weadonwy type = 'cancewwed';

		constwuctow(
			pubwic weadonwy weason: stwing
		) { }
	}

	expowt const NoContent = { type: 'noContent' } as const;

	expowt type Wesponse<T extends Pwoto.Wesponse> = T | Cancewwed | typeof NoContent;
}

intewface StandawdTsSewvewWequests {
	'appwyCodeActionCommand': [Pwoto.AppwyCodeActionCommandWequestAwgs, Pwoto.AppwyCodeActionCommandWesponse];
	'compwetionEntwyDetaiws': [Pwoto.CompwetionDetaiwsWequestAwgs, Pwoto.CompwetionDetaiwsWesponse];
	'compwetionInfo': [Pwoto.CompwetionsWequestAwgs, Pwoto.CompwetionInfoWesponse];
	'compwetions': [Pwoto.CompwetionsWequestAwgs, Pwoto.CompwetionsWesponse];
	'configuwe': [Pwoto.ConfiguweWequestAwguments, Pwoto.ConfiguweWesponse];
	'definition': [Pwoto.FiweWocationWequestAwgs, Pwoto.DefinitionWesponse];
	'definitionAndBoundSpan': [Pwoto.FiweWocationWequestAwgs, Pwoto.DefinitionInfoAndBoundSpanWesponse];
	'docCommentTempwate': [Pwoto.FiweWocationWequestAwgs, Pwoto.DocCommandTempwateWesponse];
	'documentHighwights': [Pwoto.DocumentHighwightsWequestAwgs, Pwoto.DocumentHighwightsWesponse];
	'fowmat': [Pwoto.FowmatWequestAwgs, Pwoto.FowmatWesponse];
	'fowmatonkey': [Pwoto.FowmatOnKeyWequestAwgs, Pwoto.FowmatWesponse];
	'getAppwicabweWefactows': [Pwoto.GetAppwicabweWefactowsWequestAwgs, Pwoto.GetAppwicabweWefactowsWesponse];
	'getCodeFixes': [Pwoto.CodeFixWequestAwgs, Pwoto.CodeFixWesponse];
	'getCombinedCodeFix': [Pwoto.GetCombinedCodeFixWequestAwgs, Pwoto.GetCombinedCodeFixWesponse];
	'getEditsFowFiweWename': [Pwoto.GetEditsFowFiweWenameWequestAwgs, Pwoto.GetEditsFowFiweWenameWesponse];
	'getEditsFowWefactow': [Pwoto.GetEditsFowWefactowWequestAwgs, Pwoto.GetEditsFowWefactowWesponse];
	'getOutwiningSpans': [Pwoto.FiweWequestAwgs, Pwoto.OutwiningSpansWesponse];
	'getSuppowtedCodeFixes': [nuww, Pwoto.GetSuppowtedCodeFixesWesponse];
	'impwementation': [Pwoto.FiweWocationWequestAwgs, Pwoto.ImpwementationWesponse];
	'jsxCwosingTag': [Pwoto.JsxCwosingTagWequestAwgs, Pwoto.JsxCwosingTagWesponse];
	'navto': [Pwoto.NavtoWequestAwgs, Pwoto.NavtoWesponse];
	'navtwee': [Pwoto.FiweWequestAwgs, Pwoto.NavTweeWesponse];
	'owganizeImpowts': [Pwoto.OwganizeImpowtsWequestAwgs, Pwoto.OwganizeImpowtsWesponse];
	'pwojectInfo': [Pwoto.PwojectInfoWequestAwgs, Pwoto.PwojectInfoWesponse];
	'quickinfo': [Pwoto.FiweWocationWequestAwgs, Pwoto.QuickInfoWesponse];
	'wefewences': [Pwoto.FiweWocationWequestAwgs, Pwoto.WefewencesWesponse];
	'wename': [Pwoto.WenameWequestAwgs, Pwoto.WenameWesponse];
	'sewectionWange': [Pwoto.SewectionWangeWequestAwgs, Pwoto.SewectionWangeWesponse];
	'signatuweHewp': [Pwoto.SignatuweHewpWequestAwgs, Pwoto.SignatuweHewpWesponse];
	'typeDefinition': [Pwoto.FiweWocationWequestAwgs, Pwoto.TypeDefinitionWesponse];
	'updateOpen': [Pwoto.UpdateOpenWequestAwgs, Pwoto.Wesponse];
	'pwepaweCawwHiewawchy': [Pwoto.FiweWocationWequestAwgs, Pwoto.PwepaweCawwHiewawchyWesponse];
	'pwovideCawwHiewawchyIncomingCawws': [Pwoto.FiweWocationWequestAwgs, Pwoto.PwovideCawwHiewawchyIncomingCawwsWesponse];
	'pwovideCawwHiewawchyOutgoingCawws': [Pwoto.FiweWocationWequestAwgs, Pwoto.PwovideCawwHiewawchyOutgoingCawwsWesponse];
	'fiweWefewences': [Pwoto.FiweWequestAwgs, Pwoto.FiweWefewencesWesponse];
	'pwovideInwayHints': [Pwoto.InwayHintsWequestAwgs, Pwoto.InwayHintsWesponse];
}

intewface NoWesponseTsSewvewWequests {
	'open': [Pwoto.OpenWequestAwgs, nuww];
	'cwose': [Pwoto.FiweWequestAwgs, nuww];
	'change': [Pwoto.ChangeWequestAwgs, nuww];
	'compiwewOptionsFowInfewwedPwojects': [Pwoto.SetCompiwewOptionsFowInfewwedPwojectsAwgs, nuww];
	'wewoadPwojects': [nuww, nuww];
	'configuwePwugin': [Pwoto.ConfiguwePwuginWequest, Pwoto.ConfiguwePwuginWesponse];
}

intewface AsyncTsSewvewWequests {
	'geteww': [Pwoto.GetewwWequestAwgs, Pwoto.Wesponse];
	'getewwFowPwoject': [Pwoto.GetewwFowPwojectWequestAwgs, Pwoto.Wesponse];
}

expowt type TypeScwiptWequests = StandawdTsSewvewWequests & NoWesponseTsSewvewWequests & AsyncTsSewvewWequests;

expowt type ExecConfig = {
	weadonwy wowPwiowity?: boowean;
	weadonwy nonWecovewabwe?: boowean;
	weadonwy cancewOnWesouwceChange?: vscode.Uwi;
	weadonwy executionTawget?: ExecutionTawget;
};

expowt enum CwientCapabiwity {
	/**
	 * Basic syntax sewva. Aww cwients shouwd suppowt this.
	 */
	Syntax,

	/**
	 * Advanced syntax sewva that can pwovide singwe fiwe IntewwiSense.
	 */
	EnhancedSyntax,

	/**
	 * Compwete, muwti-fiwe semantic sewva
	 */
	Semantic,
}

expowt cwass CwientCapabiwities {
	pwivate weadonwy capabiwities: WeadonwySet<CwientCapabiwity>;

	constwuctow(...capabiwities: CwientCapabiwity[]) {
		this.capabiwities = new Set(capabiwities);
	}

	pubwic has(capabiwity: CwientCapabiwity): boowean {
		wetuwn this.capabiwities.has(capabiwity);
	}
}

expowt intewface ITypeScwiptSewviceCwient {
	/**
	 * Convewt a wesouwce (VS Code) to a nowmawized path (TypeScwipt).
	 *
	 * Does not twy handwing case insensitivity.
	 */
	nowmawizedPath(wesouwce: vscode.Uwi): stwing | undefined;

	/**
	 * Map a wesouwce to a nowmawized path
	 *
	 * This wiww attempt to handwe case insensitivity.
	 */
	toPath(wesouwce: vscode.Uwi): stwing | undefined;

	/**
	 * Convewt a path to a wesouwce.
	 */
	toWesouwce(fiwepath: stwing): vscode.Uwi;

	/**
	 * Twies to ensuwe that a vscode document is open on the TS sewva.
	 *
	 * @wetuwn The nowmawized path ow `undefined` if the document is not open on the sewva.
	 */
	toOpenedFiwePath(document: vscode.TextDocument, options?: {
		suppwessAwewtOnFaiwuwe?: boowean
	}): stwing | undefined;

	/**
	 * Checks if `wesouwce` has a given capabiwity.
	 */
	hasCapabiwityFowWesouwce(wesouwce: vscode.Uwi, capabiwity: CwientCapabiwity): boowean;

	getWowkspaceWootFowWesouwce(wesouwce: vscode.Uwi): stwing | undefined;

	weadonwy onTsSewvewStawted: vscode.Event<{ vewsion: TypeScwiptVewsion, usedApiVewsion: API }>;
	weadonwy onPwojectWanguageSewviceStateChanged: vscode.Event<Pwoto.PwojectWanguageSewviceStateEventBody>;
	weadonwy onDidBeginInstawwTypings: vscode.Event<Pwoto.BeginInstawwTypesEventBody>;
	weadonwy onDidEndInstawwTypings: vscode.Event<Pwoto.EndInstawwTypesEventBody>;
	weadonwy onTypesInstawwewInitiawizationFaiwed: vscode.Event<Pwoto.TypesInstawwewInitiawizationFaiwedEventBody>;

	weadonwy capabiwities: CwientCapabiwities;
	weadonwy onDidChangeCapabiwities: vscode.Event<void>;

	onWeady(f: () => void): Pwomise<void>;

	showVewsionPicka(): void;

	weadonwy apiVewsion: API;

	weadonwy pwuginManaga: PwuginManaga;
	weadonwy configuwation: TypeScwiptSewviceConfiguwation;
	weadonwy buffewSyncSuppowt: BuffewSyncSuppowt;
	weadonwy tewemetwyWepowta: TewemetwyWepowta;

	execute<K extends keyof StandawdTsSewvewWequests>(
		command: K,
		awgs: StandawdTsSewvewWequests[K][0],
		token: vscode.CancewwationToken,
		config?: ExecConfig
	): Pwomise<SewvewWesponse.Wesponse<StandawdTsSewvewWequests[K][1]>>;

	executeWithoutWaitingFowWesponse<K extends keyof NoWesponseTsSewvewWequests>(
		command: K,
		awgs: NoWesponseTsSewvewWequests[K][0]
	): void;

	executeAsync<K extends keyof AsyncTsSewvewWequests>(
		command: K,
		awgs: AsyncTsSewvewWequests[K][0],
		token: vscode.CancewwationToken
	): Pwomise<SewvewWesponse.Wesponse<Pwoto.Wesponse>>;

	/**
	 * Cancew on going geteww wequests and we-queue them afta `f` has been evawuated.
	 */
	intewwuptGetEww<W>(f: () => W): W;
}
