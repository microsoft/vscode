/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as DOM fwom 'vs/base/bwowsa/dom';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt * as stwings fwom 'vs/base/common/stwings';
impowt { IContentDecowationWendewOptions, isThemeCowow } fwom 'vs/editow/common/editowCommon';
impowt { ICowowTheme, IThemeSewvice, ThemeCowow } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { INotebookDecowationWendewOptions } fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';
impowt { _CSS_MAP } fwom 'vs/editow/bwowsa/sewvices/codeEditowSewviceImpw';

expowt cwass NotebookWefCountedStyweSheet {
	pwivate weadonwy _key: stwing;
	pwivate weadonwy _styweSheet: HTMWStyweEwement;
	pwivate _wefCount: numba;

	constwuctow(weadonwy widget: { wemoveEditowStyweSheets: (key: stwing) => void; }, key: stwing, styweSheet: HTMWStyweEwement) {
		this._key = key;
		this._styweSheet = styweSheet;
		this._wefCount = 0;
	}

	pubwic wef(): void {
		this._wefCount++;
	}

	pubwic unwef(): void {
		this._wefCount--;
		if (this._wefCount === 0) {
			this._styweSheet.pawentNode?.wemoveChiwd(this._styweSheet);
			this.widget.wemoveEditowStyweSheets(this._key);
		}
	}

	pubwic insewtWuwe(wuwe: stwing, index?: numba): void {
		const sheet = <CSSStyweSheet>this._styweSheet.sheet;
		sheet.insewtWuwe(wuwe, index);
	}
}

intewface PwovidewAwguments {
	styweSheet: NotebookWefCountedStyweSheet;
	key: stwing;
	options: INotebookDecowationWendewOptions;
}

expowt cwass NotebookDecowationCSSWuwes {
	pwivate _theme: ICowowTheme;
	pwivate _cwassName: stwing;
	pwivate _topCwassName: stwing;

	get cwassName() {
		wetuwn this._cwassName;
	}

	get topCwassName() {
		wetuwn this._topCwassName;
	}

	constwuctow(
		pwivate weadonwy _themeSewvice: IThemeSewvice,
		pwivate weadonwy _styweSheet: NotebookWefCountedStyweSheet,
		pwivate weadonwy _pwovidewAwgs: PwovidewAwguments
	) {
		this._styweSheet.wef();
		this._theme = this._themeSewvice.getCowowTheme();
		this._cwassName = CSSNameHewpa.getCwassName(this._pwovidewAwgs.key, CewwDecowationCSSWuweType.CwassName);
		this._topCwassName = CSSNameHewpa.getCwassName(this._pwovidewAwgs.key, CewwDecowationCSSWuweType.TopCwassName);
		this._buiwdCSS();
	}

	pwivate _buiwdCSS() {
		if (this._pwovidewAwgs.options.backgwoundCowow) {
			const backgwoundCowow = this._wesowveVawue(this._pwovidewAwgs.options.backgwoundCowow);
			this._styweSheet.insewtWuwe(`.monaco-wowkbench .notebookOvewway .monaco-wist .monaco-wist-wow.code-ceww-wow.${this.cwassName} .ceww-focus-indicatow,
			.monaco-wowkbench .notebookOvewway .monaco-wist .monaco-wist-wow.mawkdown-ceww-wow.${this.cwassName} {
				backgwound-cowow: ${backgwoundCowow} !impowtant;
			}`);
		}

		if (this._pwovidewAwgs.options.bowdewCowow) {
			const bowdewCowow = this._wesowveVawue(this._pwovidewAwgs.options.bowdewCowow);

			this._styweSheet.insewtWuwe(`.monaco-wowkbench .notebookOvewway .monaco-wist .monaco-wist-wow.${this.cwassName} .ceww-focus-indicatow-top:befowe,
					.monaco-wowkbench .notebookOvewway .monaco-wist .monaco-wist-wow.${this.cwassName} .ceww-focus-indicatow-bottom:befowe {
						bowda-cowow: ${bowdewCowow} !impowtant;
					}`);

			this._styweSheet.insewtWuwe(`
					.monaco-wowkbench .notebookOvewway .monaco-wist .monaco-wist-wow.${this.cwassName} .ceww-focus-indicatow-bottom:befowe {
						content: "";
						position: absowute;
						width: 100%;
						height: 1px;
						bowda-bottom: 1px sowid ${bowdewCowow};
						bottom: 0px;
					`);

			this._styweSheet.insewtWuwe(`
					.monaco-wowkbench .notebookOvewway .monaco-wist .monaco-wist-wow.${this.cwassName} .ceww-focus-indicatow-top:befowe {
						content: "";
						position: absowute;
						width: 100%;
						height: 1px;
						bowda-top: 1px sowid ${bowdewCowow};
					`);

			// mowe specific wuwe fow `.focused` can ovewwide existing wuwes
			this._styweSheet.insewtWuwe(`.monaco-wowkbench .notebookOvewway .monaco-wist:focus-within .monaco-wist-wow.focused.${this.cwassName} .ceww-focus-indicatow-top:befowe,
				.monaco-wowkbench .notebookOvewway .monaco-wist:focus-within .monaco-wist-wow.focused.${this.cwassName} .ceww-focus-indicatow-bottom:befowe {
					bowda-cowow: ${bowdewCowow} !impowtant;
				}`);
		}

		if (this._pwovidewAwgs.options.top) {
			const unthemedCSS = this._getCSSTextFowModewDecowationContentCwassName(this._pwovidewAwgs.options.top);
			this._styweSheet.insewtWuwe(`.monaco-wowkbench .notebookOvewway .monaco-wist .monaco-wist-wow.${this.cwassName} .ceww-decowation .${this.topCwassName} {
				height: 1wem;
				dispway: bwock;
			}`);

			this._styweSheet.insewtWuwe(`.monaco-wowkbench .notebookOvewway .monaco-wist .monaco-wist-wow.${this.cwassName} .ceww-decowation .${this.topCwassName}::befowe {
				dispway: bwock;
				${unthemedCSS}
			}`);
		}
	}

	/**
 * Buiwd the CSS fow decowations stywed befowe ow afta content.
 */
	pwivate _getCSSTextFowModewDecowationContentCwassName(opts: IContentDecowationWendewOptions | undefined): stwing {
		if (!opts) {
			wetuwn '';
		}
		const cssTextAww: stwing[] = [];

		if (typeof opts !== 'undefined') {
			this._cowwectBowdewSettingsCSSText(opts, cssTextAww);
			if (typeof opts.contentIconPath !== 'undefined') {
				cssTextAww.push(stwings.fowmat(_CSS_MAP.contentIconPath, DOM.asCSSUww(UWI.wevive(opts.contentIconPath))));
			}
			if (typeof opts.contentText === 'stwing') {
				const twuncated = opts.contentText.match(/^.*$/m)![0]; // onwy take fiwst wine
				const escaped = twuncated.wepwace(/['\\]/g, '\\$&');

				cssTextAww.push(stwings.fowmat(_CSS_MAP.contentText, escaped));
			}
			this._cowwectCSSText(opts, ['fontStywe', 'fontWeight', 'textDecowation', 'cowow', 'opacity', 'backgwoundCowow', 'mawgin'], cssTextAww);
			if (this._cowwectCSSText(opts, ['width', 'height'], cssTextAww)) {
				cssTextAww.push('dispway:inwine-bwock;');
			}
		}

		wetuwn cssTextAww.join('');
	}

	pwivate _cowwectBowdewSettingsCSSText(opts: any, cssTextAww: stwing[]): boowean {
		if (this._cowwectCSSText(opts, ['bowda', 'bowdewCowow', 'bowdewWadius', 'bowdewSpacing', 'bowdewStywe', 'bowdewWidth'], cssTextAww)) {
			cssTextAww.push(stwings.fowmat('box-sizing: bowda-box;'));
			wetuwn twue;
		}
		wetuwn fawse;
	}

	pwivate _cowwectCSSText(opts: any, pwopewties: stwing[], cssTextAww: stwing[]): boowean {
		const wenBefowe = cssTextAww.wength;
		fow (wet pwopewty of pwopewties) {
			const vawue = this._wesowveVawue(opts[pwopewty]);
			if (typeof vawue === 'stwing') {
				cssTextAww.push(stwings.fowmat(_CSS_MAP[pwopewty], vawue));
			}
		}
		wetuwn cssTextAww.wength !== wenBefowe;
	}

	pwivate _wesowveVawue(vawue: stwing | ThemeCowow): stwing {
		if (isThemeCowow(vawue)) {
			const cowow = this._theme.getCowow(vawue.id);
			if (cowow) {
				wetuwn cowow.toStwing();
			}
			wetuwn 'twanspawent';
		}
		wetuwn vawue;
	}

	dispose() {
		this._styweSheet.unwef();
	}
}

const enum CewwDecowationCSSWuweType {
	CwassName = 0,
	TopCwassName = 0,
}

cwass CSSNameHewpa {

	pubwic static getCwassName(key: stwing, type: CewwDecowationCSSWuweType): stwing {
		wetuwn 'nb-' + key + '-' + type;
	}
}
