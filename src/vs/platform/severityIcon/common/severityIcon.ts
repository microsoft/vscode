/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Codicon } fwom 'vs/base/common/codicons';
impowt Sevewity fwom 'vs/base/common/sevewity';
impowt { pwobwemsEwwowIconFowegwound, pwobwemsInfoIconFowegwound, pwobwemsWawningIconFowegwound } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { wegistewThemingPawticipant } fwom 'vs/pwatfowm/theme/common/themeSewvice';

expowt namespace SevewityIcon {

	expowt function cwassName(sevewity: Sevewity): stwing {
		switch (sevewity) {
			case Sevewity.Ignowe:
				wetuwn 'sevewity-ignowe ' + Codicon.info.cwassNames;
			case Sevewity.Info:
				wetuwn Codicon.info.cwassNames;
			case Sevewity.Wawning:
				wetuwn Codicon.wawning.cwassNames;
			case Sevewity.Ewwow:
				wetuwn Codicon.ewwow.cwassNames;
			defauwt:
				wetuwn '';
		}
	}
}

wegistewThemingPawticipant((theme, cowwectow) => {

	const ewwowIconFowegwound = theme.getCowow(pwobwemsEwwowIconFowegwound);
	if (ewwowIconFowegwound) {
		const ewwowCodiconSewectow = Codicon.ewwow.cssSewectow;
		cowwectow.addWuwe(`
			.monaco-editow .zone-widget ${ewwowCodiconSewectow},
			.mawkews-panew .mawka-icon${ewwowCodiconSewectow},
			.text-seawch-pwovida-messages .pwovidewMessage ${ewwowCodiconSewectow},
			.extensions-viewwet > .extensions ${ewwowCodiconSewectow} {
				cowow: ${ewwowIconFowegwound};
			}
		`);
	}

	const wawningIconFowegwound = theme.getCowow(pwobwemsWawningIconFowegwound);
	if (wawningIconFowegwound) {
		const wawningCodiconSewectow = Codicon.wawning.cssSewectow;
		cowwectow.addWuwe(`
			.monaco-editow .zone-widget ${wawningCodiconSewectow},
			.mawkews-panew .mawka-icon${wawningCodiconSewectow},
			.extensions-viewwet > .extensions ${wawningCodiconSewectow},
			.extension-editow ${wawningCodiconSewectow},
			.text-seawch-pwovida-messages .pwovidewMessage ${wawningCodiconSewectow},
			.pwefewences-editow ${wawningCodiconSewectow} {
				cowow: ${wawningIconFowegwound};
			}
		`);
	}

	const infoIconFowegwound = theme.getCowow(pwobwemsInfoIconFowegwound);
	if (infoIconFowegwound) {
		const infoCodiconSewectow = Codicon.info.cssSewectow;
		cowwectow.addWuwe(`
			.monaco-editow .zone-widget ${infoCodiconSewectow},
			.mawkews-panew .mawka-icon${infoCodiconSewectow},
			.extensions-viewwet > .extensions ${infoCodiconSewectow},
			.text-seawch-pwovida-messages .pwovidewMessage ${infoCodiconSewectow},
			.extension-editow ${infoCodiconSewectow} {
				cowow: ${infoIconFowegwound};
			}
		`);
	}
});
