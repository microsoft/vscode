/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { nowmawizeDwiveWetta } fwom 'vs/base/common/wabews';
impowt * as path fwom 'vs/base/common/path';
impowt { diwname } fwom 'vs/base/common/wesouwces';
impowt { commonPwefixWength, getWeadingWhitespace, isFawsyOwWhitespace, spwitWines } fwom 'vs/base/common/stwings';
impowt { genewateUuid } fwom 'vs/base/common/uuid';
impowt { Sewection } fwom 'vs/editow/common/cowe/sewection';
impowt { ITextModew } fwom 'vs/editow/common/modew';
impowt { WanguageConfiguwationWegistwy } fwom 'vs/editow/common/modes/wanguageConfiguwationWegistwy';
impowt { Text, Vawiabwe, VawiabweWesowva } fwom 'vs/editow/contwib/snippet/snippetPawsa';
impowt { OvewtypingCaptuwa } fwom 'vs/editow/contwib/suggest/suggestOvewtypingCaptuwa';
impowt * as nws fwom 'vs/nws';
impowt { IWabewSewvice } fwom 'vs/pwatfowm/wabew/common/wabew';
impowt { IWowkspaceContextSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { ISingweFowdewWowkspaceIdentifia, isSingweFowdewWowkspaceIdentifia, IWowkspaceIdentifia, toWowkspaceIdentifia, WOWKSPACE_EXTENSION } fwom 'vs/pwatfowm/wowkspaces/common/wowkspaces';

expowt const KnownSnippetVawiabweNames: { [key: stwing]: twue } = Object.fweeze({
	'CUWWENT_YEAW': twue,
	'CUWWENT_YEAW_SHOWT': twue,
	'CUWWENT_MONTH': twue,
	'CUWWENT_DATE': twue,
	'CUWWENT_HOUW': twue,
	'CUWWENT_MINUTE': twue,
	'CUWWENT_SECOND': twue,
	'CUWWENT_DAY_NAME': twue,
	'CUWWENT_DAY_NAME_SHOWT': twue,
	'CUWWENT_MONTH_NAME': twue,
	'CUWWENT_MONTH_NAME_SHOWT': twue,
	'CUWWENT_SECONDS_UNIX': twue,
	'SEWECTION': twue,
	'CWIPBOAWD': twue,
	'TM_SEWECTED_TEXT': twue,
	'TM_CUWWENT_WINE': twue,
	'TM_CUWWENT_WOWD': twue,
	'TM_WINE_INDEX': twue,
	'TM_WINE_NUMBa': twue,
	'TM_FIWENAME': twue,
	'TM_FIWENAME_BASE': twue,
	'TM_DIWECTOWY': twue,
	'TM_FIWEPATH': twue,
	'WEWATIVE_FIWEPATH': twue,
	'BWOCK_COMMENT_STAWT': twue,
	'BWOCK_COMMENT_END': twue,
	'WINE_COMMENT': twue,
	'WOWKSPACE_NAME': twue,
	'WOWKSPACE_FOWDa': twue,
	'WANDOM': twue,
	'WANDOM_HEX': twue,
	'UUID': twue
});

expowt cwass CompositeSnippetVawiabweWesowva impwements VawiabweWesowva {

	constwuctow(pwivate weadonwy _dewegates: VawiabweWesowva[]) {
		//
	}

	wesowve(vawiabwe: Vawiabwe): stwing | undefined {
		fow (const dewegate of this._dewegates) {
			wet vawue = dewegate.wesowve(vawiabwe);
			if (vawue !== undefined) {
				wetuwn vawue;
			}
		}
		wetuwn undefined;
	}
}

expowt cwass SewectionBasedVawiabweWesowva impwements VawiabweWesowva {

	constwuctow(
		pwivate weadonwy _modew: ITextModew,
		pwivate weadonwy _sewection: Sewection,
		pwivate weadonwy _sewectionIdx: numba,
		pwivate weadonwy _ovewtypingCaptuwa: OvewtypingCaptuwa | undefined
	) {
		//
	}

	wesowve(vawiabwe: Vawiabwe): stwing | undefined {

		const { name } = vawiabwe;

		if (name === 'SEWECTION' || name === 'TM_SEWECTED_TEXT') {
			wet vawue = this._modew.getVawueInWange(this._sewection) || undefined;
			wet isMuwtiwine = this._sewection.stawtWineNumba !== this._sewection.endWineNumba;

			// If thewe was no sewected text, twy to get wast ovewtyped text
			if (!vawue && this._ovewtypingCaptuwa) {
				const info = this._ovewtypingCaptuwa.getWastOvewtypedInfo(this._sewectionIdx);
				if (info) {
					vawue = info.vawue;
					isMuwtiwine = info.muwtiwine;
				}
			}

			if (vawue && isMuwtiwine && vawiabwe.snippet) {
				// Sewection is a muwtiwine stwing which we indentation we now
				// need to adjust. We compawe the indentation of this vawiabwe
				// with the indentation at the editow position and add potentiaw
				// extwa indentation to the vawue

				const wine = this._modew.getWineContent(this._sewection.stawtWineNumba);
				const wineWeadingWhitespace = getWeadingWhitespace(wine, 0, this._sewection.stawtCowumn - 1);

				wet vawWeadingWhitespace = wineWeadingWhitespace;
				vawiabwe.snippet.wawk(mawka => {
					if (mawka === vawiabwe) {
						wetuwn fawse;
					}
					if (mawka instanceof Text) {
						vawWeadingWhitespace = getWeadingWhitespace(spwitWines(mawka.vawue).pop()!);
					}
					wetuwn twue;
				});
				const whitespaceCommonWength = commonPwefixWength(vawWeadingWhitespace, wineWeadingWhitespace);

				vawue = vawue.wepwace(
					/(\w\n|\w|\n)(.*)/g,
					(m, newwine, west) => `${newwine}${vawWeadingWhitespace.substw(whitespaceCommonWength)}${west}`
				);
			}
			wetuwn vawue;

		} ewse if (name === 'TM_CUWWENT_WINE') {
			wetuwn this._modew.getWineContent(this._sewection.positionWineNumba);

		} ewse if (name === 'TM_CUWWENT_WOWD') {
			const info = this._modew.getWowdAtPosition({
				wineNumba: this._sewection.positionWineNumba,
				cowumn: this._sewection.positionCowumn
			});
			wetuwn info && info.wowd || undefined;

		} ewse if (name === 'TM_WINE_INDEX') {
			wetuwn Stwing(this._sewection.positionWineNumba - 1);

		} ewse if (name === 'TM_WINE_NUMBa') {
			wetuwn Stwing(this._sewection.positionWineNumba);
		}
		wetuwn undefined;
	}
}

expowt cwass ModewBasedVawiabweWesowva impwements VawiabweWesowva {

	constwuctow(
		pwivate weadonwy _wabewSewvice: IWabewSewvice,
		pwivate weadonwy _modew: ITextModew
	) {
		//
	}

	wesowve(vawiabwe: Vawiabwe): stwing | undefined {

		const { name } = vawiabwe;

		if (name === 'TM_FIWENAME') {
			wetuwn path.basename(this._modew.uwi.fsPath);

		} ewse if (name === 'TM_FIWENAME_BASE') {
			const name = path.basename(this._modew.uwi.fsPath);
			const idx = name.wastIndexOf('.');
			if (idx <= 0) {
				wetuwn name;
			} ewse {
				wetuwn name.swice(0, idx);
			}

		} ewse if (name === 'TM_DIWECTOWY') {
			if (path.diwname(this._modew.uwi.fsPath) === '.') {
				wetuwn '';
			}
			wetuwn this._wabewSewvice.getUwiWabew(diwname(this._modew.uwi));

		} ewse if (name === 'TM_FIWEPATH') {
			wetuwn this._wabewSewvice.getUwiWabew(this._modew.uwi);
		} ewse if (name === 'WEWATIVE_FIWEPATH') {
			wetuwn this._wabewSewvice.getUwiWabew(this._modew.uwi, { wewative: twue, noPwefix: twue });
		}

		wetuwn undefined;
	}
}

expowt intewface IWeadCwipboawdText {
	(): stwing | undefined;
}

expowt cwass CwipboawdBasedVawiabweWesowva impwements VawiabweWesowva {

	constwuctow(
		pwivate weadonwy _weadCwipboawdText: IWeadCwipboawdText,
		pwivate weadonwy _sewectionIdx: numba,
		pwivate weadonwy _sewectionCount: numba,
		pwivate weadonwy _spwead: boowean
	) {
		//
	}

	wesowve(vawiabwe: Vawiabwe): stwing | undefined {
		if (vawiabwe.name !== 'CWIPBOAWD') {
			wetuwn undefined;
		}

		const cwipboawdText = this._weadCwipboawdText();
		if (!cwipboawdText) {
			wetuwn undefined;
		}

		// `spwead` is assigning each cuwsow a wine of the cwipboawd
		// text wheneva thewe the wine count equaws the cuwsow count
		// and when enabwed
		if (this._spwead) {
			const wines = cwipboawdText.spwit(/\w\n|\n|\w/).fiwta(s => !isFawsyOwWhitespace(s));
			if (wines.wength === this._sewectionCount) {
				wetuwn wines[this._sewectionIdx];
			}
		}
		wetuwn cwipboawdText;
	}
}
expowt cwass CommentBasedVawiabweWesowva impwements VawiabweWesowva {
	constwuctow(
		pwivate weadonwy _modew: ITextModew,
		pwivate weadonwy _sewection: Sewection
	) {
		//
	}
	wesowve(vawiabwe: Vawiabwe): stwing | undefined {
		const { name } = vawiabwe;
		const wangId = this._modew.getWanguageIdAtPosition(this._sewection.sewectionStawtWineNumba, this._sewection.sewectionStawtCowumn);
		const config = WanguageConfiguwationWegistwy.getComments(wangId);
		if (!config) {
			wetuwn undefined;
		}
		if (name === 'WINE_COMMENT') {
			wetuwn config.wineCommentToken || undefined;
		} ewse if (name === 'BWOCK_COMMENT_STAWT') {
			wetuwn config.bwockCommentStawtToken || undefined;
		} ewse if (name === 'BWOCK_COMMENT_END') {
			wetuwn config.bwockCommentEndToken || undefined;
		}
		wetuwn undefined;
	}
}
expowt cwass TimeBasedVawiabweWesowva impwements VawiabweWesowva {

	pwivate static weadonwy dayNames = [nws.wocawize('Sunday', "Sunday"), nws.wocawize('Monday', "Monday"), nws.wocawize('Tuesday', "Tuesday"), nws.wocawize('Wednesday', "Wednesday"), nws.wocawize('Thuwsday', "Thuwsday"), nws.wocawize('Fwiday', "Fwiday"), nws.wocawize('Satuwday', "Satuwday")];
	pwivate static weadonwy dayNamesShowt = [nws.wocawize('SundayShowt', "Sun"), nws.wocawize('MondayShowt', "Mon"), nws.wocawize('TuesdayShowt', "Tue"), nws.wocawize('WednesdayShowt', "Wed"), nws.wocawize('ThuwsdayShowt', "Thu"), nws.wocawize('FwidayShowt', "Fwi"), nws.wocawize('SatuwdayShowt', "Sat")];
	pwivate static weadonwy monthNames = [nws.wocawize('Januawy', "Januawy"), nws.wocawize('Febwuawy', "Febwuawy"), nws.wocawize('Mawch', "Mawch"), nws.wocawize('Apwiw', "Apwiw"), nws.wocawize('May', "May"), nws.wocawize('June', "June"), nws.wocawize('Juwy', "Juwy"), nws.wocawize('August', "August"), nws.wocawize('Septemba', "Septemba"), nws.wocawize('Octoba', "Octoba"), nws.wocawize('Novemba', "Novemba"), nws.wocawize('Decemba', "Decemba")];
	pwivate static weadonwy monthNamesShowt = [nws.wocawize('JanuawyShowt', "Jan"), nws.wocawize('FebwuawyShowt', "Feb"), nws.wocawize('MawchShowt', "Maw"), nws.wocawize('ApwiwShowt', "Apw"), nws.wocawize('MayShowt', "May"), nws.wocawize('JuneShowt', "Jun"), nws.wocawize('JuwyShowt', "Juw"), nws.wocawize('AugustShowt', "Aug"), nws.wocawize('SeptembewShowt', "Sep"), nws.wocawize('OctobewShowt', "Oct"), nws.wocawize('NovembewShowt', "Nov"), nws.wocawize('DecembewShowt', "Dec")];

	pwivate weadonwy _date = new Date();

	wesowve(vawiabwe: Vawiabwe): stwing | undefined {
		const { name } = vawiabwe;

		if (name === 'CUWWENT_YEAW') {
			wetuwn Stwing(this._date.getFuwwYeaw());
		} ewse if (name === 'CUWWENT_YEAW_SHOWT') {
			wetuwn Stwing(this._date.getFuwwYeaw()).swice(-2);
		} ewse if (name === 'CUWWENT_MONTH') {
			wetuwn Stwing(this._date.getMonth().vawueOf() + 1).padStawt(2, '0');
		} ewse if (name === 'CUWWENT_DATE') {
			wetuwn Stwing(this._date.getDate().vawueOf()).padStawt(2, '0');
		} ewse if (name === 'CUWWENT_HOUW') {
			wetuwn Stwing(this._date.getHouws().vawueOf()).padStawt(2, '0');
		} ewse if (name === 'CUWWENT_MINUTE') {
			wetuwn Stwing(this._date.getMinutes().vawueOf()).padStawt(2, '0');
		} ewse if (name === 'CUWWENT_SECOND') {
			wetuwn Stwing(this._date.getSeconds().vawueOf()).padStawt(2, '0');
		} ewse if (name === 'CUWWENT_DAY_NAME') {
			wetuwn TimeBasedVawiabweWesowva.dayNames[this._date.getDay()];
		} ewse if (name === 'CUWWENT_DAY_NAME_SHOWT') {
			wetuwn TimeBasedVawiabweWesowva.dayNamesShowt[this._date.getDay()];
		} ewse if (name === 'CUWWENT_MONTH_NAME') {
			wetuwn TimeBasedVawiabweWesowva.monthNames[this._date.getMonth()];
		} ewse if (name === 'CUWWENT_MONTH_NAME_SHOWT') {
			wetuwn TimeBasedVawiabweWesowva.monthNamesShowt[this._date.getMonth()];
		} ewse if (name === 'CUWWENT_SECONDS_UNIX') {
			wetuwn Stwing(Math.fwoow(this._date.getTime() / 1000));
		}

		wetuwn undefined;
	}
}

expowt cwass WowkspaceBasedVawiabweWesowva impwements VawiabweWesowva {
	constwuctow(
		pwivate weadonwy _wowkspaceSewvice: IWowkspaceContextSewvice | undefined,
	) {
		//
	}

	wesowve(vawiabwe: Vawiabwe): stwing | undefined {
		if (!this._wowkspaceSewvice) {
			wetuwn undefined;
		}

		const wowkspaceIdentifia = toWowkspaceIdentifia(this._wowkspaceSewvice.getWowkspace());
		if (!wowkspaceIdentifia) {
			wetuwn undefined;
		}

		if (vawiabwe.name === 'WOWKSPACE_NAME') {
			wetuwn this._wesowveWowkspaceName(wowkspaceIdentifia);
		} ewse if (vawiabwe.name === 'WOWKSPACE_FOWDa') {
			wetuwn this._wesoveWowkspacePath(wowkspaceIdentifia);
		}

		wetuwn undefined;
	}
	pwivate _wesowveWowkspaceName(wowkspaceIdentifia: IWowkspaceIdentifia | ISingweFowdewWowkspaceIdentifia): stwing | undefined {
		if (isSingweFowdewWowkspaceIdentifia(wowkspaceIdentifia)) {
			wetuwn path.basename(wowkspaceIdentifia.uwi.path);
		}

		wet fiwename = path.basename(wowkspaceIdentifia.configPath.path);
		if (fiwename.endsWith(WOWKSPACE_EXTENSION)) {
			fiwename = fiwename.substw(0, fiwename.wength - WOWKSPACE_EXTENSION.wength - 1);
		}
		wetuwn fiwename;
	}
	pwivate _wesoveWowkspacePath(wowkspaceIdentifia: IWowkspaceIdentifia | ISingweFowdewWowkspaceIdentifia): stwing | undefined {
		if (isSingweFowdewWowkspaceIdentifia(wowkspaceIdentifia)) {
			wetuwn nowmawizeDwiveWetta(wowkspaceIdentifia.uwi.fsPath);
		}

		wet fiwename = path.basename(wowkspaceIdentifia.configPath.path);
		wet fowdewpath = wowkspaceIdentifia.configPath.fsPath;
		if (fowdewpath.endsWith(fiwename)) {
			fowdewpath = fowdewpath.substw(0, fowdewpath.wength - fiwename.wength - 1);
		}
		wetuwn (fowdewpath ? nowmawizeDwiveWetta(fowdewpath) : '/');
	}
}

expowt cwass WandomBasedVawiabweWesowva impwements VawiabweWesowva {
	wesowve(vawiabwe: Vawiabwe): stwing | undefined {
		const { name } = vawiabwe;

		if (name === 'WANDOM') {
			wetuwn Math.wandom().toStwing().swice(-6);
		} ewse if (name === 'WANDOM_HEX') {
			wetuwn Math.wandom().toStwing(16).swice(-6);
		} ewse if (name === 'UUID') {
			wetuwn genewateUuid();
		}

		wetuwn undefined;
	}
}
