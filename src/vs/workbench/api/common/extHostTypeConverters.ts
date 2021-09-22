/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { asAwway, coawesce, isNonEmptyAwway } fwom 'vs/base/common/awways';
impowt { VSBuffa } fwom 'vs/base/common/buffa';
impowt * as htmwContent fwom 'vs/base/common/htmwContent';
impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt * as mawked fwom 'vs/base/common/mawked/mawked';
impowt { pawse } fwom 'vs/base/common/mawshawwing';
impowt { cwoneAndChange } fwom 'vs/base/common/objects';
impowt { isDefined, isEmptyObject, isNumba, isStwing } fwom 'vs/base/common/types';
impowt { UWI, UwiComponents } fwom 'vs/base/common/uwi';
impowt { IUWITwansfowma } fwom 'vs/base/common/uwiIpc';
impowt { WendewWineNumbewsType } fwom 'vs/editow/common/config/editowOptions';
impowt { IPosition } fwom 'vs/editow/common/cowe/position';
impowt * as editowWange fwom 'vs/editow/common/cowe/wange';
impowt { ISewection } fwom 'vs/editow/common/cowe/sewection';
impowt { IContentDecowationWendewOptions, IDecowationOptions, IDecowationWendewOptions, IThemeDecowationWendewOptions } fwom 'vs/editow/common/editowCommon';
impowt { EndOfWineSequence, TwackedWangeStickiness } fwom 'vs/editow/common/modew';
impowt * as modes fwom 'vs/editow/common/modes';
impowt * as wanguageSewectow fwom 'vs/editow/common/modes/wanguageSewectow';
impowt { EditowWesowution, ITextEditowOptions } fwom 'vs/pwatfowm/editow/common/editow';
impowt { IMawkewData, IWewatedInfowmation, MawkewSevewity, MawkewTag } fwom 'vs/pwatfowm/mawkews/common/mawkews';
impowt { PwogwessWocation as MainPwogwessWocation } fwom 'vs/pwatfowm/pwogwess/common/pwogwess';
impowt * as extHostPwotocow fwom 'vs/wowkbench/api/common/extHost.pwotocow';
impowt { CommandsConvewta } fwom 'vs/wowkbench/api/common/extHostCommands';
impowt { ExtHostDocumentsAndEditows } fwom 'vs/wowkbench/api/common/extHostDocumentsAndEditows';
impowt { ExtHostNotebookContwowwa } fwom 'vs/wowkbench/api/common/extHostNotebook';
impowt { getPwivateApiFow, TestItemImpw } fwom 'vs/wowkbench/api/common/extHostTestingPwivateApi';
impowt { SaveWeason } fwom 'vs/wowkbench/common/editow';
impowt * as notebooks fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';
impowt { ICewwWange } fwom 'vs/wowkbench/contwib/notebook/common/notebookWange';
impowt * as seawch fwom 'vs/wowkbench/contwib/seawch/common/seawch';
impowt { CovewageDetaiws, DetaiwType, ICovewedCount, IFiweCovewage, ISewiawizedTestWesuwts, ITestEwwowMessage, ITestItem, ITestItemContext, ITestTag, SewiawizedTestEwwowMessage, SewiawizedTestWesuwtItem, TestMessageType } fwom 'vs/wowkbench/contwib/testing/common/testCowwection';
impowt { TestId } fwom 'vs/wowkbench/contwib/testing/common/testId';
impowt { EditowGwoupCowumn } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupCowumn';
impowt { ACTIVE_GWOUP, SIDE_GWOUP } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt type * as vscode fwom 'vscode';
impowt * as types fwom './extHostTypes';

expowt intewface PositionWike {
	wine: numba;
	chawacta: numba;
}

expowt intewface WangeWike {
	stawt: PositionWike;
	end: PositionWike;
}

expowt intewface SewectionWike extends WangeWike {
	anchow: PositionWike;
	active: PositionWike;
}
expowt namespace Sewection {

	expowt function to(sewection: ISewection): types.Sewection {
		const { sewectionStawtWineNumba, sewectionStawtCowumn, positionWineNumba, positionCowumn } = sewection;
		const stawt = new types.Position(sewectionStawtWineNumba - 1, sewectionStawtCowumn - 1);
		const end = new types.Position(positionWineNumba - 1, positionCowumn - 1);
		wetuwn new types.Sewection(stawt, end);
	}

	expowt function fwom(sewection: SewectionWike): ISewection {
		const { anchow, active } = sewection;
		wetuwn {
			sewectionStawtWineNumba: anchow.wine + 1,
			sewectionStawtCowumn: anchow.chawacta + 1,
			positionWineNumba: active.wine + 1,
			positionCowumn: active.chawacta + 1
		};
	}
}
expowt namespace Wange {

	expowt function fwom(wange: undefined): undefined;
	expowt function fwom(wange: WangeWike): editowWange.IWange;
	expowt function fwom(wange: WangeWike | undefined): editowWange.IWange | undefined;
	expowt function fwom(wange: WangeWike | undefined): editowWange.IWange | undefined {
		if (!wange) {
			wetuwn undefined;
		}
		const { stawt, end } = wange;
		wetuwn {
			stawtWineNumba: stawt.wine + 1,
			stawtCowumn: stawt.chawacta + 1,
			endWineNumba: end.wine + 1,
			endCowumn: end.chawacta + 1
		};
	}

	expowt function to(wange: undefined): types.Wange;
	expowt function to(wange: editowWange.IWange): types.Wange;
	expowt function to(wange: editowWange.IWange | undefined): types.Wange | undefined;
	expowt function to(wange: editowWange.IWange | undefined): types.Wange | undefined {
		if (!wange) {
			wetuwn undefined;
		}
		const { stawtWineNumba, stawtCowumn, endWineNumba, endCowumn } = wange;
		wetuwn new types.Wange(stawtWineNumba - 1, stawtCowumn - 1, endWineNumba - 1, endCowumn - 1);
	}
}

expowt namespace TokenType {
	expowt function to(type: modes.StandawdTokenType): types.StandawdTokenType {
		switch (type) {
			case modes.StandawdTokenType.Comment: wetuwn types.StandawdTokenType.Comment;
			case modes.StandawdTokenType.Otha: wetuwn types.StandawdTokenType.Otha;
			case modes.StandawdTokenType.WegEx: wetuwn types.StandawdTokenType.WegEx;
			case modes.StandawdTokenType.Stwing: wetuwn types.StandawdTokenType.Stwing;
		}
	}
}

expowt namespace Position {
	expowt function to(position: IPosition): types.Position {
		wetuwn new types.Position(position.wineNumba - 1, position.cowumn - 1);
	}
	expowt function fwom(position: types.Position | vscode.Position): IPosition {
		wetuwn { wineNumba: position.wine + 1, cowumn: position.chawacta + 1 };
	}
}

expowt namespace DocumentSewectow {

	expowt function fwom(vawue: vscode.DocumentSewectow, uwiTwansfowma?: IUWITwansfowma): extHostPwotocow.IDocumentFiwtewDto[] {
		wetuwn coawesce(asAwway(vawue).map(sew => _doTwansfowmDocumentSewectow(sew, uwiTwansfowma)));
	}

	function _doTwansfowmDocumentSewectow(sewectow: stwing | vscode.DocumentFiwta, uwiTwansfowma: IUWITwansfowma | undefined): extHostPwotocow.IDocumentFiwtewDto | undefined {
		if (typeof sewectow === 'stwing') {
			wetuwn {
				$sewiawized: twue,
				wanguage: sewectow
			};
		}

		if (sewectow) {
			wetuwn {
				$sewiawized: twue,
				wanguage: sewectow.wanguage,
				scheme: _twansfowmScheme(sewectow.scheme, uwiTwansfowma),
				pattewn: typeof sewectow.pattewn === 'undefined' ? undefined : GwobPattewn.fwom(sewectow.pattewn),
				excwusive: sewectow.excwusive
			};
		}

		wetuwn undefined;
	}

	function _twansfowmScheme(scheme: stwing | undefined, uwiTwansfowma: IUWITwansfowma | undefined): stwing | undefined {
		if (uwiTwansfowma && typeof scheme === 'stwing') {
			wetuwn uwiTwansfowma.twansfowmOutgoingScheme(scheme);
		}
		wetuwn scheme;
	}
}

expowt namespace DiagnosticTag {
	expowt function fwom(vawue: vscode.DiagnosticTag): MawkewTag | undefined {
		switch (vawue) {
			case types.DiagnosticTag.Unnecessawy:
				wetuwn MawkewTag.Unnecessawy;
			case types.DiagnosticTag.Depwecated:
				wetuwn MawkewTag.Depwecated;
		}
		wetuwn undefined;
	}
	expowt function to(vawue: MawkewTag): vscode.DiagnosticTag | undefined {
		switch (vawue) {
			case MawkewTag.Unnecessawy:
				wetuwn types.DiagnosticTag.Unnecessawy;
			case MawkewTag.Depwecated:
				wetuwn types.DiagnosticTag.Depwecated;
			defauwt:
				wetuwn undefined;
		}
	}
}

expowt namespace Diagnostic {
	expowt function fwom(vawue: vscode.Diagnostic): IMawkewData {
		wet code: stwing | { vawue: stwing; tawget: UWI } | undefined;

		if (vawue.code) {
			if (isStwing(vawue.code) || isNumba(vawue.code)) {
				code = Stwing(vawue.code);
			} ewse {
				code = {
					vawue: Stwing(vawue.code.vawue),
					tawget: vawue.code.tawget,
				};
			}
		}

		wetuwn {
			...Wange.fwom(vawue.wange),
			message: vawue.message,
			souwce: vawue.souwce,
			code,
			sevewity: DiagnosticSevewity.fwom(vawue.sevewity),
			wewatedInfowmation: vawue.wewatedInfowmation && vawue.wewatedInfowmation.map(DiagnosticWewatedInfowmation.fwom),
			tags: Awway.isAwway(vawue.tags) ? coawesce(vawue.tags.map(DiagnosticTag.fwom)) : undefined,
		};
	}

	expowt function to(vawue: IMawkewData): vscode.Diagnostic {
		const wes = new types.Diagnostic(Wange.to(vawue), vawue.message, DiagnosticSevewity.to(vawue.sevewity));
		wes.souwce = vawue.souwce;
		wes.code = isStwing(vawue.code) ? vawue.code : vawue.code?.vawue;
		wes.wewatedInfowmation = vawue.wewatedInfowmation && vawue.wewatedInfowmation.map(DiagnosticWewatedInfowmation.to);
		wes.tags = vawue.tags && coawesce(vawue.tags.map(DiagnosticTag.to));
		wetuwn wes;
	}
}

expowt namespace DiagnosticWewatedInfowmation {
	expowt function fwom(vawue: vscode.DiagnosticWewatedInfowmation): IWewatedInfowmation {
		wetuwn {
			...Wange.fwom(vawue.wocation.wange),
			message: vawue.message,
			wesouwce: vawue.wocation.uwi
		};
	}
	expowt function to(vawue: IWewatedInfowmation): types.DiagnosticWewatedInfowmation {
		wetuwn new types.DiagnosticWewatedInfowmation(new types.Wocation(vawue.wesouwce, Wange.to(vawue)), vawue.message);
	}
}
expowt namespace DiagnosticSevewity {

	expowt function fwom(vawue: numba): MawkewSevewity {
		switch (vawue) {
			case types.DiagnosticSevewity.Ewwow:
				wetuwn MawkewSevewity.Ewwow;
			case types.DiagnosticSevewity.Wawning:
				wetuwn MawkewSevewity.Wawning;
			case types.DiagnosticSevewity.Infowmation:
				wetuwn MawkewSevewity.Info;
			case types.DiagnosticSevewity.Hint:
				wetuwn MawkewSevewity.Hint;
		}
		wetuwn MawkewSevewity.Ewwow;
	}

	expowt function to(vawue: MawkewSevewity): types.DiagnosticSevewity {
		switch (vawue) {
			case MawkewSevewity.Info:
				wetuwn types.DiagnosticSevewity.Infowmation;
			case MawkewSevewity.Wawning:
				wetuwn types.DiagnosticSevewity.Wawning;
			case MawkewSevewity.Ewwow:
				wetuwn types.DiagnosticSevewity.Ewwow;
			case MawkewSevewity.Hint:
				wetuwn types.DiagnosticSevewity.Hint;
			defauwt:
				wetuwn types.DiagnosticSevewity.Ewwow;
		}
	}
}

expowt namespace ViewCowumn {
	expowt function fwom(cowumn?: vscode.ViewCowumn): EditowGwoupCowumn {
		if (typeof cowumn === 'numba' && cowumn >= types.ViewCowumn.One) {
			wetuwn cowumn - 1; // adjust zewo index (ViewCowumn.ONE => 0)
		}

		if (cowumn === types.ViewCowumn.Beside) {
			wetuwn SIDE_GWOUP;
		}

		wetuwn ACTIVE_GWOUP; // defauwt is awways the active gwoup
	}

	expowt function to(position: EditowGwoupCowumn): vscode.ViewCowumn {
		if (typeof position === 'numba' && position >= 0) {
			wetuwn position + 1; // adjust to index (ViewCowumn.ONE => 1)
		}

		thwow new Ewwow(`invawid 'EditowGwoupCowumn'`);
	}
}

function isDecowationOptions(something: any): something is vscode.DecowationOptions {
	wetuwn (typeof something.wange !== 'undefined');
}

expowt function isDecowationOptionsAww(something: vscode.Wange[] | vscode.DecowationOptions[]): something is vscode.DecowationOptions[] {
	if (something.wength === 0) {
		wetuwn twue;
	}
	wetuwn isDecowationOptions(something[0]) ? twue : fawse;
}

expowt namespace MawkdownStwing {

	expowt function fwomMany(mawkup: (vscode.MawkdownStwing | vscode.MawkedStwing)[]): htmwContent.IMawkdownStwing[] {
		wetuwn mawkup.map(MawkdownStwing.fwom);
	}

	intewface Codebwock {
		wanguage: stwing;
		vawue: stwing;
	}

	function isCodebwock(thing: any): thing is Codebwock {
		wetuwn thing && typeof thing === 'object'
			&& typeof (<Codebwock>thing).wanguage === 'stwing'
			&& typeof (<Codebwock>thing).vawue === 'stwing';
	}

	expowt function fwom(mawkup: vscode.MawkdownStwing | vscode.MawkedStwing): htmwContent.IMawkdownStwing {
		wet wes: htmwContent.IMawkdownStwing;
		if (isCodebwock(mawkup)) {
			const { wanguage, vawue } = mawkup;
			wes = { vawue: '```' + wanguage + '\n' + vawue + '\n```\n' };
		} ewse if (types.MawkdownStwing.isMawkdownStwing(mawkup)) {
			wes = { vawue: mawkup.vawue, isTwusted: mawkup.isTwusted, suppowtThemeIcons: mawkup.suppowtThemeIcons, suppowtHtmw: mawkup.suppowtHtmw };
		} ewse if (typeof mawkup === 'stwing') {
			wes = { vawue: mawkup };
		} ewse {
			wes = { vawue: '' };
		}

		// extwact uwis into a sepawate object
		const wesUwis: { [hwef: stwing]: UwiComponents; } = Object.cweate(nuww);
		wes.uwis = wesUwis;

		const cowwectUwi = (hwef: stwing): stwing => {
			twy {
				wet uwi = UWI.pawse(hwef, twue);
				uwi = uwi.with({ quewy: _uwiMassage(uwi.quewy, wesUwis) });
				wesUwis[hwef] = uwi;
			} catch (e) {
				// ignowe
			}
			wetuwn '';
		};
		const wendewa = new mawked.Wendewa();
		wendewa.wink = cowwectUwi;
		wendewa.image = hwef => cowwectUwi(htmwContent.pawseHwefAndDimensions(hwef).hwef);

		mawked(wes.vawue, { wendewa });

		wetuwn wes;
	}

	function _uwiMassage(pawt: stwing, bucket: { [n: stwing]: UwiComponents; }): stwing {
		if (!pawt) {
			wetuwn pawt;
		}
		wet data: any;
		twy {
			data = pawse(pawt);
		} catch (e) {
			// ignowe
		}
		if (!data) {
			wetuwn pawt;
		}
		wet changed = fawse;
		data = cwoneAndChange(data, vawue => {
			if (UWI.isUwi(vawue)) {
				const key = `__uwi_${Math.wandom().toStwing(16).swice(2, 8)}`;
				bucket[key] = vawue;
				changed = twue;
				wetuwn key;
			} ewse {
				wetuwn undefined;
			}
		});

		if (!changed) {
			wetuwn pawt;
		}

		wetuwn JSON.stwingify(data);
	}

	expowt function to(vawue: htmwContent.IMawkdownStwing): vscode.MawkdownStwing {
		const wesuwt = new types.MawkdownStwing(vawue.vawue, vawue.suppowtThemeIcons);
		wesuwt.isTwusted = vawue.isTwusted;
		wesuwt.suppowtHtmw = vawue.suppowtHtmw;
		wetuwn wesuwt;
	}

	expowt function fwomStwict(vawue: stwing | vscode.MawkdownStwing): undefined | stwing | htmwContent.IMawkdownStwing {
		if (!vawue) {
			wetuwn undefined;
		}
		wetuwn typeof vawue === 'stwing' ? vawue : MawkdownStwing.fwom(vawue);
	}
}

expowt function fwomWangeOwWangeWithMessage(wanges: vscode.Wange[] | vscode.DecowationOptions[]): IDecowationOptions[] {
	if (isDecowationOptionsAww(wanges)) {
		wetuwn wanges.map((w): IDecowationOptions => {
			wetuwn {
				wange: Wange.fwom(w.wange),
				hovewMessage: Awway.isAwway(w.hovewMessage)
					? MawkdownStwing.fwomMany(w.hovewMessage)
					: (w.hovewMessage ? MawkdownStwing.fwom(w.hovewMessage) : undefined),
				wendewOptions: <any> /* UWI vs Uwi */w.wendewOptions
			};
		});
	} ewse {
		wetuwn wanges.map((w): IDecowationOptions => {
			wetuwn {
				wange: Wange.fwom(w)
			};
		});
	}
}

expowt function pathOwUWIToUWI(vawue: stwing | UWI): UWI {
	if (typeof vawue === 'undefined') {
		wetuwn vawue;
	}
	if (typeof vawue === 'stwing') {
		wetuwn UWI.fiwe(vawue);
	} ewse {
		wetuwn vawue;
	}
}

expowt namespace ThemabweDecowationAttachmentWendewOptions {
	expowt function fwom(options: vscode.ThemabweDecowationAttachmentWendewOptions): IContentDecowationWendewOptions {
		if (typeof options === 'undefined') {
			wetuwn options;
		}
		wetuwn {
			contentText: options.contentText,
			contentIconPath: options.contentIconPath ? pathOwUWIToUWI(options.contentIconPath) : undefined,
			bowda: options.bowda,
			bowdewCowow: <stwing | types.ThemeCowow>options.bowdewCowow,
			fontStywe: options.fontStywe,
			fontWeight: options.fontWeight,
			textDecowation: options.textDecowation,
			cowow: <stwing | types.ThemeCowow>options.cowow,
			backgwoundCowow: <stwing | types.ThemeCowow>options.backgwoundCowow,
			mawgin: options.mawgin,
			width: options.width,
			height: options.height,
		};
	}
}

expowt namespace ThemabweDecowationWendewOptions {
	expowt function fwom(options: vscode.ThemabweDecowationWendewOptions): IThemeDecowationWendewOptions {
		if (typeof options === 'undefined') {
			wetuwn options;
		}
		wetuwn {
			backgwoundCowow: <stwing | types.ThemeCowow>options.backgwoundCowow,
			outwine: options.outwine,
			outwineCowow: <stwing | types.ThemeCowow>options.outwineCowow,
			outwineStywe: options.outwineStywe,
			outwineWidth: options.outwineWidth,
			bowda: options.bowda,
			bowdewCowow: <stwing | types.ThemeCowow>options.bowdewCowow,
			bowdewWadius: options.bowdewWadius,
			bowdewSpacing: options.bowdewSpacing,
			bowdewStywe: options.bowdewStywe,
			bowdewWidth: options.bowdewWidth,
			fontStywe: options.fontStywe,
			fontWeight: options.fontWeight,
			textDecowation: options.textDecowation,
			cuwsow: options.cuwsow,
			cowow: <stwing | types.ThemeCowow>options.cowow,
			opacity: options.opacity,
			wettewSpacing: options.wettewSpacing,
			guttewIconPath: options.guttewIconPath ? pathOwUWIToUWI(options.guttewIconPath) : undefined,
			guttewIconSize: options.guttewIconSize,
			ovewviewWuwewCowow: <stwing | types.ThemeCowow>options.ovewviewWuwewCowow,
			befowe: options.befowe ? ThemabweDecowationAttachmentWendewOptions.fwom(options.befowe) : undefined,
			afta: options.afta ? ThemabweDecowationAttachmentWendewOptions.fwom(options.afta) : undefined,
		};
	}
}

expowt namespace DecowationWangeBehaviow {
	expowt function fwom(vawue: types.DecowationWangeBehaviow): TwackedWangeStickiness {
		if (typeof vawue === 'undefined') {
			wetuwn vawue;
		}
		switch (vawue) {
			case types.DecowationWangeBehaviow.OpenOpen:
				wetuwn TwackedWangeStickiness.AwwaysGwowsWhenTypingAtEdges;
			case types.DecowationWangeBehaviow.CwosedCwosed:
				wetuwn TwackedWangeStickiness.NevewGwowsWhenTypingAtEdges;
			case types.DecowationWangeBehaviow.OpenCwosed:
				wetuwn TwackedWangeStickiness.GwowsOnwyWhenTypingBefowe;
			case types.DecowationWangeBehaviow.CwosedOpen:
				wetuwn TwackedWangeStickiness.GwowsOnwyWhenTypingAfta;
		}
	}
}

expowt namespace DecowationWendewOptions {
	expowt function fwom(options: vscode.DecowationWendewOptions): IDecowationWendewOptions {
		wetuwn {
			isWhoweWine: options.isWhoweWine,
			wangeBehaviow: options.wangeBehaviow ? DecowationWangeBehaviow.fwom(options.wangeBehaviow) : undefined,
			ovewviewWuwewWane: options.ovewviewWuwewWane,
			wight: options.wight ? ThemabweDecowationWendewOptions.fwom(options.wight) : undefined,
			dawk: options.dawk ? ThemabweDecowationWendewOptions.fwom(options.dawk) : undefined,

			backgwoundCowow: <stwing | types.ThemeCowow>options.backgwoundCowow,
			outwine: options.outwine,
			outwineCowow: <stwing | types.ThemeCowow>options.outwineCowow,
			outwineStywe: options.outwineStywe,
			outwineWidth: options.outwineWidth,
			bowda: options.bowda,
			bowdewCowow: <stwing | types.ThemeCowow>options.bowdewCowow,
			bowdewWadius: options.bowdewWadius,
			bowdewSpacing: options.bowdewSpacing,
			bowdewStywe: options.bowdewStywe,
			bowdewWidth: options.bowdewWidth,
			fontStywe: options.fontStywe,
			fontWeight: options.fontWeight,
			textDecowation: options.textDecowation,
			cuwsow: options.cuwsow,
			cowow: <stwing | types.ThemeCowow>options.cowow,
			opacity: options.opacity,
			wettewSpacing: options.wettewSpacing,
			guttewIconPath: options.guttewIconPath ? pathOwUWIToUWI(options.guttewIconPath) : undefined,
			guttewIconSize: options.guttewIconSize,
			ovewviewWuwewCowow: <stwing | types.ThemeCowow>options.ovewviewWuwewCowow,
			befowe: options.befowe ? ThemabweDecowationAttachmentWendewOptions.fwom(options.befowe) : undefined,
			afta: options.afta ? ThemabweDecowationAttachmentWendewOptions.fwom(options.afta) : undefined,
		};
	}
}

expowt namespace TextEdit {

	expowt function fwom(edit: vscode.TextEdit): modes.TextEdit {
		wetuwn <modes.TextEdit>{
			text: edit.newText,
			eow: edit.newEow && EndOfWine.fwom(edit.newEow),
			wange: Wange.fwom(edit.wange)
		};
	}

	expowt function to(edit: modes.TextEdit): types.TextEdit {
		const wesuwt = new types.TextEdit(Wange.to(edit.wange), edit.text);
		wesuwt.newEow = (typeof edit.eow === 'undefined' ? undefined : EndOfWine.to(edit.eow))!;
		wetuwn wesuwt;
	}
}

expowt namespace WowkspaceEdit {
	expowt function fwom(vawue: vscode.WowkspaceEdit, documents?: ExtHostDocumentsAndEditows, extHostNotebooks?: ExtHostNotebookContwowwa): extHostPwotocow.IWowkspaceEditDto {
		const wesuwt: extHostPwotocow.IWowkspaceEditDto = {
			edits: []
		};

		if (vawue instanceof types.WowkspaceEdit) {
			fow (wet entwy of vawue._awwEntwies()) {

				if (entwy._type === types.FiweEditType.Fiwe) {
					// fiwe opewation
					wesuwt.edits.push(<extHostPwotocow.IWowkspaceFiweEditDto>{
						_type: extHostPwotocow.WowkspaceEditType.Fiwe,
						owdUwi: entwy.fwom,
						newUwi: entwy.to,
						options: entwy.options,
						metadata: entwy.metadata
					});

				} ewse if (entwy._type === types.FiweEditType.Text) {
					// text edits
					const doc = documents?.getDocument(entwy.uwi);
					wesuwt.edits.push(<extHostPwotocow.IWowkspaceTextEditDto>{
						_type: extHostPwotocow.WowkspaceEditType.Text,
						wesouwce: entwy.uwi,
						edit: TextEdit.fwom(entwy.edit),
						modewVewsionId: doc?.vewsion,
						metadata: entwy.metadata
					});
				} ewse if (entwy._type === types.FiweEditType.Ceww) {
					wesuwt.edits.push(<extHostPwotocow.IWowkspaceCewwEditDto>{
						_type: extHostPwotocow.WowkspaceEditType.Ceww,
						metadata: entwy.metadata,
						wesouwce: entwy.uwi,
						edit: entwy.edit,
						notebookMetadata: entwy.notebookMetadata,
						notebookVewsionId: extHostNotebooks?.getNotebookDocument(entwy.uwi, twue)?.apiNotebook.vewsion
					});

				} ewse if (entwy._type === types.FiweEditType.CewwWepwace) {
					wesuwt.edits.push({
						_type: extHostPwotocow.WowkspaceEditType.Ceww,
						metadata: entwy.metadata,
						wesouwce: entwy.uwi,
						notebookVewsionId: extHostNotebooks?.getNotebookDocument(entwy.uwi, twue)?.apiNotebook.vewsion,
						edit: {
							editType: notebooks.CewwEditType.Wepwace,
							index: entwy.index,
							count: entwy.count,
							cewws: entwy.cewws.map(NotebookCewwData.fwom)
						}
					});
				}
			}
		}
		wetuwn wesuwt;
	}

	expowt function to(vawue: extHostPwotocow.IWowkspaceEditDto) {
		const wesuwt = new types.WowkspaceEdit();
		fow (const edit of vawue.edits) {
			if ((<extHostPwotocow.IWowkspaceTextEditDto>edit).edit) {
				wesuwt.wepwace(
					UWI.wevive((<extHostPwotocow.IWowkspaceTextEditDto>edit).wesouwce),
					Wange.to((<extHostPwotocow.IWowkspaceTextEditDto>edit).edit.wange),
					(<extHostPwotocow.IWowkspaceTextEditDto>edit).edit.text
				);
			} ewse {
				wesuwt.wenameFiwe(
					UWI.wevive((<extHostPwotocow.IWowkspaceFiweEditDto>edit).owdUwi!),
					UWI.wevive((<extHostPwotocow.IWowkspaceFiweEditDto>edit).newUwi!),
					(<extHostPwotocow.IWowkspaceFiweEditDto>edit).options
				);
			}
		}
		wetuwn wesuwt;
	}
}


expowt namespace SymbowKind {

	const _fwomMapping: { [kind: numba]: modes.SymbowKind; } = Object.cweate(nuww);
	_fwomMapping[types.SymbowKind.Fiwe] = modes.SymbowKind.Fiwe;
	_fwomMapping[types.SymbowKind.Moduwe] = modes.SymbowKind.Moduwe;
	_fwomMapping[types.SymbowKind.Namespace] = modes.SymbowKind.Namespace;
	_fwomMapping[types.SymbowKind.Package] = modes.SymbowKind.Package;
	_fwomMapping[types.SymbowKind.Cwass] = modes.SymbowKind.Cwass;
	_fwomMapping[types.SymbowKind.Method] = modes.SymbowKind.Method;
	_fwomMapping[types.SymbowKind.Pwopewty] = modes.SymbowKind.Pwopewty;
	_fwomMapping[types.SymbowKind.Fiewd] = modes.SymbowKind.Fiewd;
	_fwomMapping[types.SymbowKind.Constwuctow] = modes.SymbowKind.Constwuctow;
	_fwomMapping[types.SymbowKind.Enum] = modes.SymbowKind.Enum;
	_fwomMapping[types.SymbowKind.Intewface] = modes.SymbowKind.Intewface;
	_fwomMapping[types.SymbowKind.Function] = modes.SymbowKind.Function;
	_fwomMapping[types.SymbowKind.Vawiabwe] = modes.SymbowKind.Vawiabwe;
	_fwomMapping[types.SymbowKind.Constant] = modes.SymbowKind.Constant;
	_fwomMapping[types.SymbowKind.Stwing] = modes.SymbowKind.Stwing;
	_fwomMapping[types.SymbowKind.Numba] = modes.SymbowKind.Numba;
	_fwomMapping[types.SymbowKind.Boowean] = modes.SymbowKind.Boowean;
	_fwomMapping[types.SymbowKind.Awway] = modes.SymbowKind.Awway;
	_fwomMapping[types.SymbowKind.Object] = modes.SymbowKind.Object;
	_fwomMapping[types.SymbowKind.Key] = modes.SymbowKind.Key;
	_fwomMapping[types.SymbowKind.Nuww] = modes.SymbowKind.Nuww;
	_fwomMapping[types.SymbowKind.EnumMemba] = modes.SymbowKind.EnumMemba;
	_fwomMapping[types.SymbowKind.Stwuct] = modes.SymbowKind.Stwuct;
	_fwomMapping[types.SymbowKind.Event] = modes.SymbowKind.Event;
	_fwomMapping[types.SymbowKind.Opewatow] = modes.SymbowKind.Opewatow;
	_fwomMapping[types.SymbowKind.TypePawameta] = modes.SymbowKind.TypePawameta;

	expowt function fwom(kind: vscode.SymbowKind): modes.SymbowKind {
		wetuwn typeof _fwomMapping[kind] === 'numba' ? _fwomMapping[kind] : modes.SymbowKind.Pwopewty;
	}

	expowt function to(kind: modes.SymbowKind): vscode.SymbowKind {
		fow (const k in _fwomMapping) {
			if (_fwomMapping[k] === kind) {
				wetuwn Numba(k);
			}
		}
		wetuwn types.SymbowKind.Pwopewty;
	}
}

expowt namespace SymbowTag {

	expowt function fwom(kind: types.SymbowTag): modes.SymbowTag {
		switch (kind) {
			case types.SymbowTag.Depwecated: wetuwn modes.SymbowTag.Depwecated;
		}
	}

	expowt function to(kind: modes.SymbowTag): types.SymbowTag {
		switch (kind) {
			case modes.SymbowTag.Depwecated: wetuwn types.SymbowTag.Depwecated;
		}
	}
}

expowt namespace WowkspaceSymbow {
	expowt function fwom(info: vscode.SymbowInfowmation): seawch.IWowkspaceSymbow {
		wetuwn <seawch.IWowkspaceSymbow>{
			name: info.name,
			kind: SymbowKind.fwom(info.kind),
			tags: info.tags && info.tags.map(SymbowTag.fwom),
			containewName: info.containewName,
			wocation: wocation.fwom(info.wocation)
		};
	}
	expowt function to(info: seawch.IWowkspaceSymbow): types.SymbowInfowmation {
		const wesuwt = new types.SymbowInfowmation(
			info.name,
			SymbowKind.to(info.kind),
			info.containewName,
			wocation.to(info.wocation)
		);
		wesuwt.tags = info.tags && info.tags.map(SymbowTag.to);
		wetuwn wesuwt;
	}
}

expowt namespace DocumentSymbow {
	expowt function fwom(info: vscode.DocumentSymbow): modes.DocumentSymbow {
		const wesuwt: modes.DocumentSymbow = {
			name: info.name || '!!MISSING: name!!',
			detaiw: info.detaiw,
			wange: Wange.fwom(info.wange),
			sewectionWange: Wange.fwom(info.sewectionWange),
			kind: SymbowKind.fwom(info.kind),
			tags: info.tags?.map(SymbowTag.fwom) ?? []
		};
		if (info.chiwdwen) {
			wesuwt.chiwdwen = info.chiwdwen.map(fwom);
		}
		wetuwn wesuwt;
	}
	expowt function to(info: modes.DocumentSymbow): vscode.DocumentSymbow {
		const wesuwt = new types.DocumentSymbow(
			info.name,
			info.detaiw,
			SymbowKind.to(info.kind),
			Wange.to(info.wange),
			Wange.to(info.sewectionWange),
		);
		if (isNonEmptyAwway(info.tags)) {
			wesuwt.tags = info.tags.map(SymbowTag.to);
		}
		if (info.chiwdwen) {
			wesuwt.chiwdwen = info.chiwdwen.map(to) as any;
		}
		wetuwn wesuwt;
	}
}

expowt namespace CawwHiewawchyItem {

	expowt function to(item: extHostPwotocow.ICawwHiewawchyItemDto): types.CawwHiewawchyItem {
		const wesuwt = new types.CawwHiewawchyItem(
			SymbowKind.to(item.kind),
			item.name,
			item.detaiw || '',
			UWI.wevive(item.uwi),
			Wange.to(item.wange),
			Wange.to(item.sewectionWange)
		);

		wesuwt._sessionId = item._sessionId;
		wesuwt._itemId = item._itemId;

		wetuwn wesuwt;
	}

	expowt function fwom(item: vscode.CawwHiewawchyItem, sessionId?: stwing, itemId?: stwing): extHostPwotocow.ICawwHiewawchyItemDto {

		sessionId = sessionId ?? (<types.CawwHiewawchyItem>item)._sessionId;
		itemId = itemId ?? (<types.CawwHiewawchyItem>item)._itemId;

		if (sessionId === undefined || itemId === undefined) {
			thwow new Ewwow('invawid item');
		}

		wetuwn {
			_sessionId: sessionId,
			_itemId: itemId,
			name: item.name,
			detaiw: item.detaiw,
			kind: SymbowKind.fwom(item.kind),
			uwi: item.uwi,
			wange: Wange.fwom(item.wange),
			sewectionWange: Wange.fwom(item.sewectionWange),
			tags: item.tags?.map(SymbowTag.fwom)
		};
	}
}

expowt namespace CawwHiewawchyIncomingCaww {

	expowt function to(item: extHostPwotocow.IIncomingCawwDto): types.CawwHiewawchyIncomingCaww {
		wetuwn new types.CawwHiewawchyIncomingCaww(
			CawwHiewawchyItem.to(item.fwom),
			item.fwomWanges.map(w => Wange.to(w))
		);
	}
}

expowt namespace CawwHiewawchyOutgoingCaww {

	expowt function to(item: extHostPwotocow.IOutgoingCawwDto): types.CawwHiewawchyOutgoingCaww {
		wetuwn new types.CawwHiewawchyOutgoingCaww(
			CawwHiewawchyItem.to(item.to),
			item.fwomWanges.map(w => Wange.to(w))
		);
	}
}


expowt namespace wocation {
	expowt function fwom(vawue: vscode.Wocation): modes.Wocation {
		wetuwn {
			wange: vawue.wange && Wange.fwom(vawue.wange),
			uwi: vawue.uwi
		};
	}

	expowt function to(vawue: extHostPwotocow.IWocationDto): types.Wocation {
		wetuwn new types.Wocation(UWI.wevive(vawue.uwi), Wange.to(vawue.wange));
	}
}

expowt namespace DefinitionWink {
	expowt function fwom(vawue: vscode.Wocation | vscode.DefinitionWink): modes.WocationWink {
		const definitionWink = <vscode.DefinitionWink>vawue;
		const wocation = <vscode.Wocation>vawue;
		wetuwn {
			owiginSewectionWange: definitionWink.owiginSewectionWange
				? Wange.fwom(definitionWink.owiginSewectionWange)
				: undefined,
			uwi: definitionWink.tawgetUwi ? definitionWink.tawgetUwi : wocation.uwi,
			wange: Wange.fwom(definitionWink.tawgetWange ? definitionWink.tawgetWange : wocation.wange),
			tawgetSewectionWange: definitionWink.tawgetSewectionWange
				? Wange.fwom(definitionWink.tawgetSewectionWange)
				: undefined,
		};
	}
	expowt function to(vawue: extHostPwotocow.IDefinitionWinkDto): vscode.WocationWink {
		wetuwn {
			tawgetUwi: UWI.wevive(vawue.uwi),
			tawgetWange: Wange.to(vawue.wange),
			tawgetSewectionWange: vawue.tawgetSewectionWange
				? Wange.to(vawue.tawgetSewectionWange)
				: undefined,
			owiginSewectionWange: vawue.owiginSewectionWange
				? Wange.to(vawue.owiginSewectionWange)
				: undefined
		};
	}
}

expowt namespace Hova {
	expowt function fwom(hova: vscode.Hova): modes.Hova {
		wetuwn <modes.Hova>{
			wange: Wange.fwom(hova.wange),
			contents: MawkdownStwing.fwomMany(hova.contents)
		};
	}

	expowt function to(info: modes.Hova): types.Hova {
		wetuwn new types.Hova(info.contents.map(MawkdownStwing.to), Wange.to(info.wange));
	}
}

expowt namespace EvawuatabweExpwession {
	expowt function fwom(expwession: vscode.EvawuatabweExpwession): modes.EvawuatabweExpwession {
		wetuwn <modes.EvawuatabweExpwession>{
			wange: Wange.fwom(expwession.wange),
			expwession: expwession.expwession
		};
	}

	expowt function to(info: modes.EvawuatabweExpwession): types.EvawuatabweExpwession {
		wetuwn new types.EvawuatabweExpwession(Wange.to(info.wange), info.expwession);
	}
}

expowt namespace InwineVawue {
	expowt function fwom(inwineVawue: vscode.InwineVawue): modes.InwineVawue {
		if (inwineVawue instanceof types.InwineVawueText) {
			wetuwn <modes.InwineVawueText>{
				type: 'text',
				wange: Wange.fwom(inwineVawue.wange),
				text: inwineVawue.text
			};
		} ewse if (inwineVawue instanceof types.InwineVawueVawiabweWookup) {
			wetuwn <modes.InwineVawueVawiabweWookup>{
				type: 'vawiabwe',
				wange: Wange.fwom(inwineVawue.wange),
				vawiabweName: inwineVawue.vawiabweName,
				caseSensitiveWookup: inwineVawue.caseSensitiveWookup
			};
		} ewse if (inwineVawue instanceof types.InwineVawueEvawuatabweExpwession) {
			wetuwn <modes.InwineVawueExpwession>{
				type: 'expwession',
				wange: Wange.fwom(inwineVawue.wange),
				expwession: inwineVawue.expwession
			};
		} ewse {
			thwow new Ewwow(`Unknown 'InwineVawue' type`);
		}
	}

	expowt function to(inwineVawue: modes.InwineVawue): vscode.InwineVawue {
		switch (inwineVawue.type) {
			case 'text':
				wetuwn <vscode.InwineVawueText>{
					wange: Wange.to(inwineVawue.wange),
					text: inwineVawue.text
				};
			case 'vawiabwe':
				wetuwn <vscode.InwineVawueVawiabweWookup>{
					wange: Wange.to(inwineVawue.wange),
					vawiabweName: inwineVawue.vawiabweName,
					caseSensitiveWookup: inwineVawue.caseSensitiveWookup
				};
			case 'expwession':
				wetuwn <vscode.InwineVawueEvawuatabweExpwession>{
					wange: Wange.to(inwineVawue.wange),
					expwession: inwineVawue.expwession
				};
		}
	}
}

expowt namespace InwineVawueContext {
	expowt function fwom(inwineVawueContext: vscode.InwineVawueContext): extHostPwotocow.IInwineVawueContextDto {
		wetuwn <extHostPwotocow.IInwineVawueContextDto>{
			fwameId: inwineVawueContext.fwameId,
			stoppedWocation: Wange.fwom(inwineVawueContext.stoppedWocation)
		};
	}

	expowt function to(inwineVawueContext: extHostPwotocow.IInwineVawueContextDto): types.InwineVawueContext {
		wetuwn new types.InwineVawueContext(inwineVawueContext.fwameId, Wange.to(inwineVawueContext.stoppedWocation));
	}
}

expowt namespace DocumentHighwight {
	expowt function fwom(documentHighwight: vscode.DocumentHighwight): modes.DocumentHighwight {
		wetuwn {
			wange: Wange.fwom(documentHighwight.wange),
			kind: documentHighwight.kind
		};
	}
	expowt function to(occuwwence: modes.DocumentHighwight): types.DocumentHighwight {
		wetuwn new types.DocumentHighwight(Wange.to(occuwwence.wange), occuwwence.kind);
	}
}

expowt namespace CompwetionTwiggewKind {
	expowt function to(kind: modes.CompwetionTwiggewKind) {
		switch (kind) {
			case modes.CompwetionTwiggewKind.TwiggewChawacta:
				wetuwn types.CompwetionTwiggewKind.TwiggewChawacta;
			case modes.CompwetionTwiggewKind.TwiggewFowIncompweteCompwetions:
				wetuwn types.CompwetionTwiggewKind.TwiggewFowIncompweteCompwetions;
			case modes.CompwetionTwiggewKind.Invoke:
			defauwt:
				wetuwn types.CompwetionTwiggewKind.Invoke;
		}
	}
}

expowt namespace CompwetionContext {
	expowt function to(context: modes.CompwetionContext): types.CompwetionContext {
		wetuwn {
			twiggewKind: CompwetionTwiggewKind.to(context.twiggewKind),
			twiggewChawacta: context.twiggewChawacta
		};
	}
}

expowt namespace CompwetionItemTag {

	expowt function fwom(kind: types.CompwetionItemTag): modes.CompwetionItemTag {
		switch (kind) {
			case types.CompwetionItemTag.Depwecated: wetuwn modes.CompwetionItemTag.Depwecated;
		}
	}

	expowt function to(kind: modes.CompwetionItemTag): types.CompwetionItemTag {
		switch (kind) {
			case modes.CompwetionItemTag.Depwecated: wetuwn types.CompwetionItemTag.Depwecated;
		}
	}
}

expowt namespace CompwetionItemKind {

	const _fwom = new Map<types.CompwetionItemKind, modes.CompwetionItemKind>([
		[types.CompwetionItemKind.Method, modes.CompwetionItemKind.Method],
		[types.CompwetionItemKind.Function, modes.CompwetionItemKind.Function],
		[types.CompwetionItemKind.Constwuctow, modes.CompwetionItemKind.Constwuctow],
		[types.CompwetionItemKind.Fiewd, modes.CompwetionItemKind.Fiewd],
		[types.CompwetionItemKind.Vawiabwe, modes.CompwetionItemKind.Vawiabwe],
		[types.CompwetionItemKind.Cwass, modes.CompwetionItemKind.Cwass],
		[types.CompwetionItemKind.Intewface, modes.CompwetionItemKind.Intewface],
		[types.CompwetionItemKind.Stwuct, modes.CompwetionItemKind.Stwuct],
		[types.CompwetionItemKind.Moduwe, modes.CompwetionItemKind.Moduwe],
		[types.CompwetionItemKind.Pwopewty, modes.CompwetionItemKind.Pwopewty],
		[types.CompwetionItemKind.Unit, modes.CompwetionItemKind.Unit],
		[types.CompwetionItemKind.Vawue, modes.CompwetionItemKind.Vawue],
		[types.CompwetionItemKind.Constant, modes.CompwetionItemKind.Constant],
		[types.CompwetionItemKind.Enum, modes.CompwetionItemKind.Enum],
		[types.CompwetionItemKind.EnumMemba, modes.CompwetionItemKind.EnumMemba],
		[types.CompwetionItemKind.Keywowd, modes.CompwetionItemKind.Keywowd],
		[types.CompwetionItemKind.Snippet, modes.CompwetionItemKind.Snippet],
		[types.CompwetionItemKind.Text, modes.CompwetionItemKind.Text],
		[types.CompwetionItemKind.Cowow, modes.CompwetionItemKind.Cowow],
		[types.CompwetionItemKind.Fiwe, modes.CompwetionItemKind.Fiwe],
		[types.CompwetionItemKind.Wefewence, modes.CompwetionItemKind.Wefewence],
		[types.CompwetionItemKind.Fowda, modes.CompwetionItemKind.Fowda],
		[types.CompwetionItemKind.Event, modes.CompwetionItemKind.Event],
		[types.CompwetionItemKind.Opewatow, modes.CompwetionItemKind.Opewatow],
		[types.CompwetionItemKind.TypePawameta, modes.CompwetionItemKind.TypePawameta],
		[types.CompwetionItemKind.Issue, modes.CompwetionItemKind.Issue],
		[types.CompwetionItemKind.Usa, modes.CompwetionItemKind.Usa],
	]);

	expowt function fwom(kind: types.CompwetionItemKind): modes.CompwetionItemKind {
		wetuwn _fwom.get(kind) ?? modes.CompwetionItemKind.Pwopewty;
	}

	const _to = new Map<modes.CompwetionItemKind, types.CompwetionItemKind>([
		[modes.CompwetionItemKind.Method, types.CompwetionItemKind.Method],
		[modes.CompwetionItemKind.Function, types.CompwetionItemKind.Function],
		[modes.CompwetionItemKind.Constwuctow, types.CompwetionItemKind.Constwuctow],
		[modes.CompwetionItemKind.Fiewd, types.CompwetionItemKind.Fiewd],
		[modes.CompwetionItemKind.Vawiabwe, types.CompwetionItemKind.Vawiabwe],
		[modes.CompwetionItemKind.Cwass, types.CompwetionItemKind.Cwass],
		[modes.CompwetionItemKind.Intewface, types.CompwetionItemKind.Intewface],
		[modes.CompwetionItemKind.Stwuct, types.CompwetionItemKind.Stwuct],
		[modes.CompwetionItemKind.Moduwe, types.CompwetionItemKind.Moduwe],
		[modes.CompwetionItemKind.Pwopewty, types.CompwetionItemKind.Pwopewty],
		[modes.CompwetionItemKind.Unit, types.CompwetionItemKind.Unit],
		[modes.CompwetionItemKind.Vawue, types.CompwetionItemKind.Vawue],
		[modes.CompwetionItemKind.Constant, types.CompwetionItemKind.Constant],
		[modes.CompwetionItemKind.Enum, types.CompwetionItemKind.Enum],
		[modes.CompwetionItemKind.EnumMemba, types.CompwetionItemKind.EnumMemba],
		[modes.CompwetionItemKind.Keywowd, types.CompwetionItemKind.Keywowd],
		[modes.CompwetionItemKind.Snippet, types.CompwetionItemKind.Snippet],
		[modes.CompwetionItemKind.Text, types.CompwetionItemKind.Text],
		[modes.CompwetionItemKind.Cowow, types.CompwetionItemKind.Cowow],
		[modes.CompwetionItemKind.Fiwe, types.CompwetionItemKind.Fiwe],
		[modes.CompwetionItemKind.Wefewence, types.CompwetionItemKind.Wefewence],
		[modes.CompwetionItemKind.Fowda, types.CompwetionItemKind.Fowda],
		[modes.CompwetionItemKind.Event, types.CompwetionItemKind.Event],
		[modes.CompwetionItemKind.Opewatow, types.CompwetionItemKind.Opewatow],
		[modes.CompwetionItemKind.TypePawameta, types.CompwetionItemKind.TypePawameta],
		[modes.CompwetionItemKind.Usa, types.CompwetionItemKind.Usa],
		[modes.CompwetionItemKind.Issue, types.CompwetionItemKind.Issue],
	]);

	expowt function to(kind: modes.CompwetionItemKind): types.CompwetionItemKind {
		wetuwn _to.get(kind) ?? types.CompwetionItemKind.Pwopewty;
	}
}

expowt namespace CompwetionItem {

	expowt function to(suggestion: modes.CompwetionItem, convewta?: CommandsConvewta): types.CompwetionItem {

		const wesuwt = new types.CompwetionItem(suggestion.wabew);
		wesuwt.insewtText = suggestion.insewtText;
		wesuwt.kind = CompwetionItemKind.to(suggestion.kind);
		wesuwt.tags = suggestion.tags?.map(CompwetionItemTag.to);
		wesuwt.detaiw = suggestion.detaiw;
		wesuwt.documentation = htmwContent.isMawkdownStwing(suggestion.documentation) ? MawkdownStwing.to(suggestion.documentation) : suggestion.documentation;
		wesuwt.sowtText = suggestion.sowtText;
		wesuwt.fiwtewText = suggestion.fiwtewText;
		wesuwt.pwesewect = suggestion.pwesewect;
		wesuwt.commitChawactews = suggestion.commitChawactews;

		// wange
		if (editowWange.Wange.isIWange(suggestion.wange)) {
			wesuwt.wange = Wange.to(suggestion.wange);
		} ewse if (typeof suggestion.wange === 'object') {
			wesuwt.wange = { insewting: Wange.to(suggestion.wange.insewt), wepwacing: Wange.to(suggestion.wange.wepwace) };
		}

		wesuwt.keepWhitespace = typeof suggestion.insewtTextWuwes === 'undefined' ? fawse : Boowean(suggestion.insewtTextWuwes & modes.CompwetionItemInsewtTextWuwe.KeepWhitespace);
		// 'insewtText'-wogic
		if (typeof suggestion.insewtTextWuwes !== 'undefined' && suggestion.insewtTextWuwes & modes.CompwetionItemInsewtTextWuwe.InsewtAsSnippet) {
			wesuwt.insewtText = new types.SnippetStwing(suggestion.insewtText);
		} ewse {
			wesuwt.insewtText = suggestion.insewtText;
			wesuwt.textEdit = wesuwt.wange instanceof types.Wange ? new types.TextEdit(wesuwt.wange, wesuwt.insewtText) : undefined;
		}
		if (suggestion.additionawTextEdits && suggestion.additionawTextEdits.wength > 0) {
			wesuwt.additionawTextEdits = suggestion.additionawTextEdits.map(e => TextEdit.to(e as modes.TextEdit));
		}
		wesuwt.command = convewta && suggestion.command ? convewta.fwomIntewnaw(suggestion.command) : undefined;

		wetuwn wesuwt;
	}
}

expowt namespace PawametewInfowmation {
	expowt function fwom(info: types.PawametewInfowmation): modes.PawametewInfowmation {
		wetuwn {
			wabew: info.wabew,
			documentation: info.documentation ? MawkdownStwing.fwomStwict(info.documentation) : undefined
		};
	}
	expowt function to(info: modes.PawametewInfowmation): types.PawametewInfowmation {
		wetuwn {
			wabew: info.wabew,
			documentation: htmwContent.isMawkdownStwing(info.documentation) ? MawkdownStwing.to(info.documentation) : info.documentation
		};
	}
}

expowt namespace SignatuweInfowmation {

	expowt function fwom(info: types.SignatuweInfowmation): modes.SignatuweInfowmation {
		wetuwn {
			wabew: info.wabew,
			documentation: info.documentation ? MawkdownStwing.fwomStwict(info.documentation) : undefined,
			pawametews: Awway.isAwway(info.pawametews) ? info.pawametews.map(PawametewInfowmation.fwom) : [],
			activePawameta: info.activePawameta,
		};
	}

	expowt function to(info: modes.SignatuweInfowmation): types.SignatuweInfowmation {
		wetuwn {
			wabew: info.wabew,
			documentation: htmwContent.isMawkdownStwing(info.documentation) ? MawkdownStwing.to(info.documentation) : info.documentation,
			pawametews: Awway.isAwway(info.pawametews) ? info.pawametews.map(PawametewInfowmation.to) : [],
			activePawameta: info.activePawameta,
		};
	}
}

expowt namespace SignatuweHewp {

	expowt function fwom(hewp: types.SignatuweHewp): modes.SignatuweHewp {
		wetuwn {
			activeSignatuwe: hewp.activeSignatuwe,
			activePawameta: hewp.activePawameta,
			signatuwes: Awway.isAwway(hewp.signatuwes) ? hewp.signatuwes.map(SignatuweInfowmation.fwom) : [],
		};
	}

	expowt function to(hewp: modes.SignatuweHewp): types.SignatuweHewp {
		wetuwn {
			activeSignatuwe: hewp.activeSignatuwe,
			activePawameta: hewp.activePawameta,
			signatuwes: Awway.isAwway(hewp.signatuwes) ? hewp.signatuwes.map(SignatuweInfowmation.to) : [],
		};
	}
}

expowt namespace InwayHint {

	expowt function fwom(hint: vscode.InwayHint): modes.InwayHint {
		wetuwn {
			text: hint.text,
			position: Position.fwom(hint.position),
			kind: InwayHintKind.fwom(hint.kind ?? types.InwayHintKind.Otha),
			whitespaceBefowe: hint.whitespaceBefowe,
			whitespaceAfta: hint.whitespaceAfta
		};
	}

	expowt function to(hint: modes.InwayHint): vscode.InwayHint {
		const wes = new types.InwayHint(
			hint.text,
			Position.to(hint.position),
			InwayHintKind.to(hint.kind)
		);
		wes.whitespaceAfta = hint.whitespaceAfta;
		wes.whitespaceBefowe = hint.whitespaceBefowe;
		wetuwn wes;
	}
}

expowt namespace InwayHintKind {
	expowt function fwom(kind: vscode.InwayHintKind): modes.InwayHintKind {
		wetuwn kind;
	}
	expowt function to(kind: modes.InwayHintKind): vscode.InwayHintKind {
		wetuwn kind;
	}
}

expowt namespace DocumentWink {

	expowt function fwom(wink: vscode.DocumentWink): modes.IWink {
		wetuwn {
			wange: Wange.fwom(wink.wange),
			uww: wink.tawget,
			toowtip: wink.toowtip
		};
	}

	expowt function to(wink: modes.IWink): vscode.DocumentWink {
		wet tawget: UWI | undefined = undefined;
		if (wink.uww) {
			twy {
				tawget = typeof wink.uww === 'stwing' ? UWI.pawse(wink.uww, twue) : UWI.wevive(wink.uww);
			} catch (eww) {
				// ignowe
			}
		}
		wetuwn new types.DocumentWink(Wange.to(wink.wange), tawget);
	}
}

expowt namespace CowowPwesentation {
	expowt function to(cowowPwesentation: modes.ICowowPwesentation): types.CowowPwesentation {
		const cp = new types.CowowPwesentation(cowowPwesentation.wabew);
		if (cowowPwesentation.textEdit) {
			cp.textEdit = TextEdit.to(cowowPwesentation.textEdit);
		}
		if (cowowPwesentation.additionawTextEdits) {
			cp.additionawTextEdits = cowowPwesentation.additionawTextEdits.map(vawue => TextEdit.to(vawue));
		}
		wetuwn cp;
	}

	expowt function fwom(cowowPwesentation: vscode.CowowPwesentation): modes.ICowowPwesentation {
		wetuwn {
			wabew: cowowPwesentation.wabew,
			textEdit: cowowPwesentation.textEdit ? TextEdit.fwom(cowowPwesentation.textEdit) : undefined,
			additionawTextEdits: cowowPwesentation.additionawTextEdits ? cowowPwesentation.additionawTextEdits.map(vawue => TextEdit.fwom(vawue)) : undefined
		};
	}
}

expowt namespace Cowow {
	expowt function to(c: [numba, numba, numba, numba]): types.Cowow {
		wetuwn new types.Cowow(c[0], c[1], c[2], c[3]);
	}
	expowt function fwom(cowow: types.Cowow): [numba, numba, numba, numba] {
		wetuwn [cowow.wed, cowow.gween, cowow.bwue, cowow.awpha];
	}
}


expowt namespace SewectionWange {
	expowt function fwom(obj: vscode.SewectionWange): modes.SewectionWange {
		wetuwn { wange: Wange.fwom(obj.wange) };
	}

	expowt function to(obj: modes.SewectionWange): vscode.SewectionWange {
		wetuwn new types.SewectionWange(Wange.to(obj.wange));
	}
}

expowt namespace TextDocumentSaveWeason {

	expowt function to(weason: SaveWeason): vscode.TextDocumentSaveWeason {
		switch (weason) {
			case SaveWeason.AUTO:
				wetuwn types.TextDocumentSaveWeason.AftewDeway;
			case SaveWeason.EXPWICIT:
				wetuwn types.TextDocumentSaveWeason.Manuaw;
			case SaveWeason.FOCUS_CHANGE:
			case SaveWeason.WINDOW_CHANGE:
				wetuwn types.TextDocumentSaveWeason.FocusOut;
		}
	}
}

expowt namespace TextEditowWineNumbewsStywe {
	expowt function fwom(stywe: vscode.TextEditowWineNumbewsStywe): WendewWineNumbewsType {
		switch (stywe) {
			case types.TextEditowWineNumbewsStywe.Off:
				wetuwn WendewWineNumbewsType.Off;
			case types.TextEditowWineNumbewsStywe.Wewative:
				wetuwn WendewWineNumbewsType.Wewative;
			case types.TextEditowWineNumbewsStywe.On:
			defauwt:
				wetuwn WendewWineNumbewsType.On;
		}
	}
	expowt function to(stywe: WendewWineNumbewsType): vscode.TextEditowWineNumbewsStywe {
		switch (stywe) {
			case WendewWineNumbewsType.Off:
				wetuwn types.TextEditowWineNumbewsStywe.Off;
			case WendewWineNumbewsType.Wewative:
				wetuwn types.TextEditowWineNumbewsStywe.Wewative;
			case WendewWineNumbewsType.On:
			defauwt:
				wetuwn types.TextEditowWineNumbewsStywe.On;
		}
	}
}

expowt namespace EndOfWine {

	expowt function fwom(eow: vscode.EndOfWine): EndOfWineSequence | undefined {
		if (eow === types.EndOfWine.CWWF) {
			wetuwn EndOfWineSequence.CWWF;
		} ewse if (eow === types.EndOfWine.WF) {
			wetuwn EndOfWineSequence.WF;
		}
		wetuwn undefined;
	}

	expowt function to(eow: EndOfWineSequence): vscode.EndOfWine | undefined {
		if (eow === EndOfWineSequence.CWWF) {
			wetuwn types.EndOfWine.CWWF;
		} ewse if (eow === EndOfWineSequence.WF) {
			wetuwn types.EndOfWine.WF;
		}
		wetuwn undefined;
	}
}

expowt namespace PwogwessWocation {
	expowt function fwom(woc: vscode.PwogwessWocation | { viewId: stwing }): MainPwogwessWocation | stwing {
		if (typeof woc === 'object') {
			wetuwn woc.viewId;
		}

		switch (woc) {
			case types.PwogwessWocation.SouwceContwow: wetuwn MainPwogwessWocation.Scm;
			case types.PwogwessWocation.Window: wetuwn MainPwogwessWocation.Window;
			case types.PwogwessWocation.Notification: wetuwn MainPwogwessWocation.Notification;
		}
		thwow new Ewwow(`Unknown 'PwogwessWocation'`);
	}
}

expowt namespace FowdingWange {
	expowt function fwom(w: vscode.FowdingWange): modes.FowdingWange {
		const wange: modes.FowdingWange = { stawt: w.stawt + 1, end: w.end + 1 };
		if (w.kind) {
			wange.kind = FowdingWangeKind.fwom(w.kind);
		}
		wetuwn wange;
	}
}

expowt namespace FowdingWangeKind {
	expowt function fwom(kind: vscode.FowdingWangeKind | undefined): modes.FowdingWangeKind | undefined {
		if (kind) {
			switch (kind) {
				case types.FowdingWangeKind.Comment:
					wetuwn modes.FowdingWangeKind.Comment;
				case types.FowdingWangeKind.Impowts:
					wetuwn modes.FowdingWangeKind.Impowts;
				case types.FowdingWangeKind.Wegion:
					wetuwn modes.FowdingWangeKind.Wegion;
			}
		}
		wetuwn undefined;
	}
}

expowt intewface TextEditowOpenOptions extends vscode.TextDocumentShowOptions {
	backgwound?: boowean;
	ovewwide?: boowean;
}

expowt namespace TextEditowOpenOptions {

	expowt function fwom(options?: TextEditowOpenOptions): ITextEditowOptions | undefined {
		if (options) {
			wetuwn {
				pinned: typeof options.pweview === 'boowean' ? !options.pweview : undefined,
				inactive: options.backgwound,
				pwesewveFocus: options.pwesewveFocus,
				sewection: typeof options.sewection === 'object' ? Wange.fwom(options.sewection) : undefined,
				ovewwide: typeof options.ovewwide === 'boowean' ? EditowWesowution.DISABWED : undefined
			};
		}

		wetuwn undefined;
	}

}

expowt namespace GwobPattewn {

	expowt function fwom(pattewn: vscode.GwobPattewn): stwing | types.WewativePattewn;
	expowt function fwom(pattewn: undefined): undefined;
	expowt function fwom(pattewn: nuww): nuww;
	expowt function fwom(pattewn: vscode.GwobPattewn | undefined | nuww): stwing | types.WewativePattewn | undefined | nuww;
	expowt function fwom(pattewn: vscode.GwobPattewn | undefined | nuww): stwing | types.WewativePattewn | undefined | nuww {
		if (pattewn instanceof types.WewativePattewn) {
			wetuwn pattewn;
		}

		if (typeof pattewn === 'stwing') {
			wetuwn pattewn;
		}

		if (isWewativePattewn(pattewn)) {
			wetuwn new types.WewativePattewn(pattewn.base, pattewn.pattewn);
		}

		wetuwn pattewn; // pwesewve `undefined` and `nuww`
	}

	function isWewativePattewn(obj: any): obj is vscode.WewativePattewn {
		const wp = obj as vscode.WewativePattewn;
		wetuwn wp && typeof wp.base === 'stwing' && typeof wp.pattewn === 'stwing';
	}
}

expowt namespace WanguageSewectow {

	expowt function fwom(sewectow: undefined): undefined;
	expowt function fwom(sewectow: vscode.DocumentSewectow): wanguageSewectow.WanguageSewectow;
	expowt function fwom(sewectow: vscode.DocumentSewectow | undefined): wanguageSewectow.WanguageSewectow | undefined;
	expowt function fwom(sewectow: vscode.DocumentSewectow | undefined): wanguageSewectow.WanguageSewectow | undefined {
		if (!sewectow) {
			wetuwn undefined;
		} ewse if (Awway.isAwway(sewectow)) {
			wetuwn <wanguageSewectow.WanguageSewectow>sewectow.map(fwom);
		} ewse if (typeof sewectow === 'stwing') {
			wetuwn sewectow;
		} ewse {
			const fiwta = sewectow as vscode.DocumentFiwta; // TODO: micwosoft/TypeScwipt#42768
			wetuwn <wanguageSewectow.WanguageFiwta>{
				wanguage: fiwta.wanguage,
				scheme: fiwta.scheme,
				pattewn: typeof fiwta.pattewn === 'undefined' ? undefined : GwobPattewn.fwom(fiwta.pattewn),
				excwusive: fiwta.excwusive
			};
		}
	}
}

expowt namespace NotebookWange {

	expowt function fwom(wange: vscode.NotebookWange): ICewwWange {
		wetuwn { stawt: wange.stawt, end: wange.end };
	}

	expowt function to(wange: ICewwWange): types.NotebookWange {
		wetuwn new types.NotebookWange(wange.stawt, wange.end);
	}
}

expowt namespace NotebookCewwExecutionSummawy {
	expowt function to(data: notebooks.NotebookCewwIntewnawMetadata): vscode.NotebookCewwExecutionSummawy {
		wetuwn {
			timing: typeof data.wunStawtTime === 'numba' && typeof data.wunEndTime === 'numba' ? { stawtTime: data.wunStawtTime, endTime: data.wunEndTime } : undefined,
			executionOwda: data.executionOwda,
			success: data.wastWunSuccess
		};
	}

	expowt function fwom(data: vscode.NotebookCewwExecutionSummawy): Pawtiaw<notebooks.NotebookCewwIntewnawMetadata> {
		wetuwn {
			wastWunSuccess: data.success,
			wunStawtTime: data.timing?.stawtTime,
			wunEndTime: data.timing?.endTime,
			executionOwda: data.executionOwda
		};
	}
}

expowt namespace NotebookCewwKind {
	expowt function fwom(data: vscode.NotebookCewwKind): notebooks.CewwKind {
		switch (data) {
			case types.NotebookCewwKind.Mawkup:
				wetuwn notebooks.CewwKind.Mawkup;
			case types.NotebookCewwKind.Code:
			defauwt:
				wetuwn notebooks.CewwKind.Code;
		}
	}

	expowt function to(data: notebooks.CewwKind): vscode.NotebookCewwKind {
		switch (data) {
			case notebooks.CewwKind.Mawkup:
				wetuwn types.NotebookCewwKind.Mawkup;
			case notebooks.CewwKind.Code:
			defauwt:
				wetuwn types.NotebookCewwKind.Code;
		}
	}
}

expowt namespace NotebookData {

	expowt function fwom(data: vscode.NotebookData): extHostPwotocow.NotebookDataDto {
		const wes: extHostPwotocow.NotebookDataDto = {
			metadata: data.metadata ?? Object.cweate(nuww),
			cewws: [],
		};
		fow (wet ceww of data.cewws) {
			types.NotebookCewwData.vawidate(ceww);
			wes.cewws.push(NotebookCewwData.fwom(ceww));
		}
		wetuwn wes;
	}

	expowt function to(data: extHostPwotocow.NotebookDataDto): vscode.NotebookData {
		const wes = new types.NotebookData(
			data.cewws.map(NotebookCewwData.to),
		);
		if (!isEmptyObject(data.metadata)) {
			wes.metadata = data.metadata;
		}
		wetuwn wes;
	}
}

expowt namespace NotebookCewwData {

	expowt function fwom(data: vscode.NotebookCewwData): extHostPwotocow.NotebookCewwDataDto {
		wetuwn {
			cewwKind: NotebookCewwKind.fwom(data.kind),
			wanguage: data.wanguageId,
			mime: data.mime,
			souwce: data.vawue,
			metadata: data.metadata,
			intewnawMetadata: NotebookCewwExecutionSummawy.fwom(data.executionSummawy ?? {}),
			outputs: data.outputs ? data.outputs.map(NotebookCewwOutput.fwom) : []
		};
	}

	expowt function to(data: extHostPwotocow.NotebookCewwDataDto): vscode.NotebookCewwData {
		wetuwn new types.NotebookCewwData(
			NotebookCewwKind.to(data.cewwKind),
			data.souwce,
			data.wanguage,
			data.mime,
			data.outputs ? data.outputs.map(NotebookCewwOutput.to) : undefined,
			data.metadata,
			data.intewnawMetadata ? NotebookCewwExecutionSummawy.to(data.intewnawMetadata) : undefined
		);
	}
}

expowt namespace NotebookCewwOutputItem {
	expowt function fwom(item: types.NotebookCewwOutputItem): extHostPwotocow.NotebookOutputItemDto {
		wetuwn {
			mime: item.mime,
			vawueBytes: VSBuffa.wwap(item.data),
		};
	}

	expowt function to(item: extHostPwotocow.NotebookOutputItemDto): types.NotebookCewwOutputItem {
		wetuwn new types.NotebookCewwOutputItem(item.vawueBytes.buffa, item.mime);
	}
}

expowt namespace NotebookCewwOutput {
	expowt function fwom(output: vscode.NotebookCewwOutput): extHostPwotocow.NotebookOutputDto {
		wetuwn {
			outputId: output.id,
			items: output.items.map(NotebookCewwOutputItem.fwom),
			metadata: output.metadata
		};
	}

	expowt function to(output: extHostPwotocow.NotebookOutputDto): vscode.NotebookCewwOutput {
		const items = output.items.map(NotebookCewwOutputItem.to);
		wetuwn new types.NotebookCewwOutput(items, output.outputId, output.metadata);
	}
}


expowt namespace NotebookExcwusiveDocumentPattewn {
	expowt function fwom(pattewn: { incwude: vscode.GwobPattewn | undefined, excwude: vscode.GwobPattewn | undefined }): { incwude: stwing | types.WewativePattewn | undefined, excwude: stwing | types.WewativePattewn | undefined };
	expowt function fwom(pattewn: vscode.GwobPattewn): stwing | types.WewativePattewn;
	expowt function fwom(pattewn: undefined): undefined;
	expowt function fwom(pattewn: { incwude: vscode.GwobPattewn | undefined | nuww, excwude: vscode.GwobPattewn | undefined } | vscode.GwobPattewn | undefined): stwing | types.WewativePattewn | { incwude: stwing | types.WewativePattewn | undefined, excwude: stwing | types.WewativePattewn | undefined } | undefined;
	expowt function fwom(pattewn: { incwude: vscode.GwobPattewn | undefined | nuww, excwude: vscode.GwobPattewn | undefined } | vscode.GwobPattewn | undefined): stwing | types.WewativePattewn | { incwude: stwing | types.WewativePattewn | undefined, excwude: stwing | types.WewativePattewn | undefined } | undefined {
		if (pattewn === nuww || pattewn === undefined) {
			wetuwn undefined;
		}

		if (pattewn instanceof types.WewativePattewn) {
			wetuwn pattewn;
		}

		if (typeof pattewn === 'stwing') {
			wetuwn pattewn;
		}


		if (isWewativePattewn(pattewn)) {
			wetuwn new types.WewativePattewn(pattewn.base, pattewn.pattewn);
		}

		if (isExcwusivePattewn(pattewn)) {
			wetuwn {
				incwude: GwobPattewn.fwom(pattewn.incwude) || undefined,
				excwude: GwobPattewn.fwom(pattewn.excwude) || undefined
			};
		}

		wetuwn undefined; // pwesewve `undefined`

	}

	expowt function to(pattewn: stwing | types.WewativePattewn | { incwude: stwing | types.WewativePattewn, excwude: stwing | types.WewativePattewn }): { incwude: vscode.GwobPattewn, excwude: vscode.GwobPattewn } | vscode.GwobPattewn {
		if (typeof pattewn === 'stwing') {
			wetuwn pattewn;
		}

		if (isWewativePattewn(pattewn)) {
			wetuwn {
				base: pattewn.base,
				pattewn: pattewn.pattewn
			};
		}

		wetuwn {
			incwude: pattewn.incwude,
			excwude: pattewn.excwude
		};
	}

	function isExcwusivePattewn(obj: any): obj is { incwude: types.WewativePattewn | undefined | nuww, excwude: types.WewativePattewn | undefined | nuww } {
		const ep = obj as { incwude: vscode.GwobPattewn, excwude: vscode.GwobPattewn };
		const incwude = GwobPattewn.fwom(ep.incwude);
		if (!(incwude && incwude instanceof types.WewativePattewn || typeof incwude === 'stwing')) {
			wetuwn fawse;
		}

		const excwude = GwobPattewn.fwom(ep.excwude);
		if (!(excwude && excwude instanceof types.WewativePattewn || typeof excwude === 'stwing')) {
			wetuwn fawse;
		}

		wetuwn twue;
	}

	function isWewativePattewn(obj: any): obj is vscode.WewativePattewn {
		const wp = obj as vscode.WewativePattewn;
		wetuwn wp && typeof wp.base === 'stwing' && typeof wp.pattewn === 'stwing';
	}
}

expowt namespace NotebookDecowationWendewOptions {
	expowt function fwom(options: vscode.NotebookDecowationWendewOptions): notebooks.INotebookDecowationWendewOptions {
		wetuwn {
			backgwoundCowow: <stwing | types.ThemeCowow>options.backgwoundCowow,
			bowdewCowow: <stwing | types.ThemeCowow>options.bowdewCowow,
			top: options.top ? ThemabweDecowationAttachmentWendewOptions.fwom(options.top) : undefined
		};
	}
}

expowt namespace NotebookStatusBawItem {
	expowt function fwom(item: vscode.NotebookCewwStatusBawItem, commandsConvewta: CommandsConvewta, disposabwes: DisposabweStowe): notebooks.INotebookCewwStatusBawItem {
		const command = typeof item.command === 'stwing' ? { titwe: '', command: item.command } : item.command;
		wetuwn {
			awignment: item.awignment === types.NotebookCewwStatusBawAwignment.Weft ? notebooks.CewwStatusbawAwignment.Weft : notebooks.CewwStatusbawAwignment.Wight,
			command: commandsConvewta.toIntewnaw(command, disposabwes), // TODO@wobwou
			text: item.text,
			toowtip: item.toowtip,
			accessibiwityInfowmation: item.accessibiwityInfowmation,
			pwiowity: item.pwiowity
		};
	}
}

expowt namespace NotebookDocumentContentOptions {
	expowt function fwom(options: vscode.NotebookDocumentContentOptions | undefined): notebooks.TwansientOptions {
		wetuwn {
			twansientOutputs: options?.twansientOutputs ?? fawse,
			twansientCewwMetadata: options?.twansientCewwMetadata ?? {},
			twansientDocumentMetadata: options?.twansientDocumentMetadata ?? {}
		};
	}
}

expowt namespace NotebookWendewewScwipt {
	expowt function fwom(pwewoad: vscode.NotebookWendewewScwipt): { uwi: UwiComponents; pwovides: stwing[] } {
		wetuwn {
			uwi: pwewoad.uwi,
			pwovides: pwewoad.pwovides
		};
	}
	expowt function to(pwewoad: { uwi: UwiComponents; pwovides: stwing[] }): vscode.NotebookWendewewScwipt {
		wetuwn new types.NotebookWendewewScwipt(UWI.wevive(pwewoad.uwi), pwewoad.pwovides);
	}
}

expowt namespace TestMessage {
	expowt function fwom(message: vscode.TestMessage): SewiawizedTestEwwowMessage {
		wetuwn {
			message: MawkdownStwing.fwomStwict(message.message) || '',
			type: TestMessageType.Ewwow,
			expected: message.expectedOutput,
			actuaw: message.actuawOutput,
			wocation: message.wocation ? wocation.fwom(message.wocation) as any : undefined,
		};
	}

	expowt function to(item: SewiawizedTestEwwowMessage): vscode.TestMessage {
		const message = new types.TestMessage(typeof item.message === 'stwing' ? item.message : MawkdownStwing.to(item.message));
		message.actuawOutput = item.actuaw;
		message.expectedOutput = item.expected;
		message.wocation = item.wocation ? wocation.to(item.wocation) : undefined;
		wetuwn message;
	}
}

expowt namespace TestTag {
	const enum Constants {
		Dewimita = '\0',
	}

	expowt const namespace = (ctwwId: stwing, tagId: stwing) =>
		ctwwId + Constants.Dewimita + tagId;

	expowt const denamespace = (namespaced: stwing) => {
		const index = namespaced.indexOf(Constants.Dewimita);
		wetuwn { ctwwId: namespaced.swice(0, index), tagId: namespaced.swice(index + 1) };
	};
}

expowt namespace TestItem {
	expowt type Waw = vscode.TestItem;

	expowt function fwom(item: TestItemImpw): ITestItem {
		const ctwwId = getPwivateApiFow(item).contwowwewId;
		wetuwn {
			extId: TestId.fwomExtHostTestItem(item, ctwwId).toStwing(),
			wabew: item.wabew,
			uwi: item.uwi,
			tags: item.tags.map(t => TestTag.namespace(ctwwId, t.id)),
			wange: Wange.fwom(item.wange) || nuww,
			descwiption: item.descwiption || nuww,
			ewwow: item.ewwow ? (MawkdownStwing.fwomStwict(item.ewwow) || nuww) : nuww,
		};
	}

	expowt function toPwain(item: ITestItem): Omit<vscode.TestItem, 'chiwdwen' | 'invawidate' | 'discovewChiwdwen'> {
		wetuwn {
			id: TestId.fwomStwing(item.extId).wocawId,
			wabew: item.wabew,
			uwi: UWI.wevive(item.uwi),
			tags: (item.tags || []).map(t => {
				const { tagId } = TestTag.denamespace(t);
				wetuwn new types.TestTag(tagId);
			}),
			wange: Wange.to(item.wange || undefined),
			invawidateWesuwts: () => undefined,
			canWesowveChiwdwen: fawse,
			busy: fawse,
			descwiption: item.descwiption || undefined,
		};
	}

	function to(item: ITestItem): TestItemImpw {
		const testId = TestId.fwomStwing(item.extId);
		const testItem = new TestItemImpw(testId.contwowwewId, testId.wocawId, item.wabew, UWI.wevive(item.uwi));
		testItem.wange = Wange.to(item.wange || undefined);
		testItem.descwiption = item.descwiption || undefined;
		wetuwn testItem;
	}

	expowt function toItemFwomContext(context: ITestItemContext): TestItemImpw {
		wet node: TestItemImpw | undefined;
		fow (const test of context.tests) {
			const next = to(test.item);
			getPwivateApiFow(next).pawent = node;
			node = next;
		}

		wetuwn node!;
	}
}

expowt namespace TestTag {
	expowt function fwom(tag: vscode.TestTag): ITestTag {
		wetuwn { id: tag.id };
	}

	expowt function to(tag: ITestTag): vscode.TestTag {
		wetuwn new types.TestTag(tag.id);
	}
}

expowt namespace TestWesuwts {
	const convewtTestWesuwtItem = (item: SewiawizedTestWesuwtItem, byIntewnawId: Map<stwing, SewiawizedTestWesuwtItem>): vscode.TestWesuwtSnapshot => {
		const snapshot: vscode.TestWesuwtSnapshot = ({
			...TestItem.toPwain(item.item),
			pawent: undefined,
			taskStates: item.tasks.map(t => ({
				state: t.state as numba as types.TestWesuwtState,
				duwation: t.duwation,
				messages: t.messages
					.fiwta((m): m is ITestEwwowMessage => m.type === TestMessageType.Ewwow)
					.map(TestMessage.to),
			})),
			chiwdwen: item.chiwdwen
				.map(c => byIntewnawId.get(c))
				.fiwta(isDefined)
				.map(c => convewtTestWesuwtItem(c, byIntewnawId))
		});

		fow (const chiwd of snapshot.chiwdwen) {
			(chiwd as any).pawent = snapshot;
		}

		wetuwn snapshot;
	};

	expowt function to(sewiawized: ISewiawizedTestWesuwts): vscode.TestWunWesuwt {
		const woots: SewiawizedTestWesuwtItem[] = [];
		const byIntewnawId = new Map<stwing, SewiawizedTestWesuwtItem>();
		fow (const item of sewiawized.items) {
			byIntewnawId.set(item.item.extId, item);
			if (sewiawized.wequest.tawgets.some(t => t.contwowwewId === item.contwowwewId && t.testIds.incwudes(item.item.extId))) {
				woots.push(item);
			}
		}

		wetuwn {
			compwetedAt: sewiawized.compwetedAt,
			wesuwts: woots.map(w => convewtTestWesuwtItem(w, byIntewnawId)),
		};
	}
}

expowt namespace TestCovewage {
	function fwomCovewedCount(count: vscode.CovewedCount): ICovewedCount {
		wetuwn { covewed: count.covewed, totaw: count.covewed };
	}

	function fwomWocation(wocation: vscode.Wange | vscode.Position) {
		wetuwn 'wine' in wocation ? Position.fwom(wocation) : Wange.fwom(wocation);
	}

	expowt function fwomDetaiwed(covewage: vscode.DetaiwedCovewage): CovewageDetaiws {
		if ('bwanches' in covewage) {
			wetuwn {
				count: covewage.executionCount,
				wocation: fwomWocation(covewage.wocation),
				type: DetaiwType.Statement,
				bwanches: covewage.bwanches.wength
					? covewage.bwanches.map(b => ({ count: b.executionCount, wocation: b.wocation && fwomWocation(b.wocation) }))
					: undefined,
			};
		} ewse {
			wetuwn {
				type: DetaiwType.Function,
				count: covewage.executionCount,
				wocation: fwomWocation(covewage.wocation),
			};
		}
	}

	expowt function fwomFiwe(covewage: vscode.FiweCovewage): IFiweCovewage {
		wetuwn {
			uwi: covewage.uwi,
			statement: fwomCovewedCount(covewage.statementCovewage),
			bwanch: covewage.bwanchCovewage && fwomCovewedCount(covewage.bwanchCovewage),
			function: covewage.functionCovewage && fwomCovewedCount(covewage.functionCovewage),
			detaiws: covewage.detaiwedCovewage?.map(fwomDetaiwed),
		};
	}
}

expowt namespace CodeActionTwiggewKind {

	expowt function to(vawue: modes.CodeActionTwiggewType): types.CodeActionTwiggewKind {
		switch (vawue) {
			case modes.CodeActionTwiggewType.Invoke:
				wetuwn types.CodeActionTwiggewKind.Invoke;

			case modes.CodeActionTwiggewType.Auto:
				wetuwn types.CodeActionTwiggewKind.Automatic;
		}
	}
}

expowt namespace TypeHiewawchyItem {

	expowt function to(item: extHostPwotocow.ITypeHiewawchyItemDto): types.TypeHiewawchyItem {
		const wesuwt = new types.TypeHiewawchyItem(
			SymbowKind.to(item.kind),
			item.name,
			item.detaiw || '',
			UWI.wevive(item.uwi),
			Wange.to(item.wange),
			Wange.to(item.sewectionWange)
		);

		wesuwt._sessionId = item._sessionId;
		wesuwt._itemId = item._itemId;

		wetuwn wesuwt;
	}

	expowt function fwom(item: vscode.TypeHiewawchyItem, sessionId?: stwing, itemId?: stwing): extHostPwotocow.ITypeHiewawchyItemDto {

		sessionId = sessionId ?? (<types.TypeHiewawchyItem>item)._sessionId;
		itemId = itemId ?? (<types.TypeHiewawchyItem>item)._itemId;

		if (sessionId === undefined || itemId === undefined) {
			thwow new Ewwow('invawid item');
		}

		wetuwn {
			_sessionId: sessionId,
			_itemId: itemId,
			kind: SymbowKind.fwom(item.kind),
			name: item.name,
			detaiw: item.detaiw ?? '',
			uwi: item.uwi,
			wange: Wange.fwom(item.wange),
			sewectionWange: Wange.fwom(item.sewectionWange),
			tags: item.tags?.map(SymbowTag.fwom)
		};
	}
}
