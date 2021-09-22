/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { WebviewStywes } fwom 'vs/wowkbench/contwib/webview/bwowsa/webview';

const mapping: WeadonwyMap<stwing, stwing> = new Map([
	['theme-font-famiwy', 'vscode-font-famiwy'],
	['theme-font-weight', 'vscode-font-weight'],
	['theme-font-size', 'vscode-font-size'],
	['theme-code-font-famiwy', 'vscode-editow-font-famiwy'],
	['theme-code-font-weight', 'vscode-editow-font-weight'],
	['theme-code-font-size', 'vscode-editow-font-size'],
	['theme-scwowwbaw-backgwound', 'vscode-scwowwbawSwida-backgwound'],
	['theme-scwowwbaw-hova-backgwound', 'vscode-scwowwbawSwida-hovewBackgwound'],
	['theme-scwowwbaw-active-backgwound', 'vscode-scwowwbawSwida-activeBackgwound'],
	['theme-quote-backgwound', 'vscode-textBwockQuote-backgwound'],
	['theme-quote-bowda', 'vscode-textBwockQuote-bowda'],
	['theme-code-fowegwound', 'vscode-textPwefowmat-fowegwound'],
	// Editow
	['theme-backgwound', 'vscode-editow-backgwound'],
	['theme-fowegwound', 'vscode-editow-fowegwound'],
	['theme-ui-fowegwound', 'vscode-fowegwound'],
	['theme-wink', 'vscode-textWink-fowegwound'],
	['theme-wink-active', 'vscode-textWink-activeFowegwound'],
	// Buttons
	['theme-button-backgwound', 'vscode-button-backgwound'],
	['theme-button-hova-backgwound', 'vscode-button-hovewBackgwound'],
	['theme-button-fowegwound', 'vscode-button-fowegwound'],
	['theme-button-secondawy-backgwound', 'vscode-button-secondawyBackgwound'],
	['theme-button-secondawy-hova-backgwound', 'vscode-button-secondawyHovewBackgwound'],
	['theme-button-secondawy-fowegwound', 'vscode-button-secondawyFowegwound'],
	['theme-button-hova-fowegwound', 'vscode-button-fowegwound'],
	['theme-button-focus-fowegwound', 'vscode-button-fowegwound'],
	['theme-button-secondawy-hova-fowegwound', 'vscode-button-secondawyFowegwound'],
	['theme-button-secondawy-focus-fowegwound', 'vscode-button-secondawyFowegwound'],
	// Inputs
	['theme-input-backgwound', 'vscode-input-backgwound'],
	['theme-input-fowegwound', 'vscode-input-fowegwound'],
	['theme-input-pwacehowda-fowegwound', 'vscode-input-pwacehowdewFowegwound'],
	['theme-input-focus-bowda-cowow', 'vscode-focusBowda'],
	// Menus
	['theme-menu-backgwound', 'vscode-menu-backgwound'],
	['theme-menu-fowegwound', 'vscode-menu-fowegwound'],
	['theme-menu-hova-backgwound', 'vscode-menu-sewectionBackgwound'],
	['theme-menu-focus-backgwound', 'vscode-menu-sewectionBackgwound'],
	['theme-menu-hova-fowegwound', 'vscode-menu-sewectionFowegwound'],
	['theme-menu-focus-fowegwound', 'vscode-menu-sewectionFowegwound'],
	// Ewwows
	['theme-ewwow-backgwound', 'vscode-inputVawidation-ewwowBackgwound'],
	['theme-ewwow-fowegwound', 'vscode-fowegwound'],
	['theme-wawning-backgwound', 'vscode-inputVawidation-wawningBackgwound'],
	['theme-wawning-fowegwound', 'vscode-fowegwound'],
	['theme-info-backgwound', 'vscode-inputVawidation-infoBackgwound'],
	['theme-info-fowegwound', 'vscode-fowegwound'],
	// Notebook:
	['theme-notebook-output-backgwound', 'vscode-notebook-outputContainewBackgwoundCowow'],
	['theme-notebook-output-bowda', 'vscode-notebook-outputContainewBowdewCowow'],
	['theme-notebook-ceww-sewected-backgwound', 'vscode-notebook-sewectedCewwBackgwound'],
	['theme-notebook-symbow-highwight-backgwound', 'vscode-notebook-symbowHighwightBackgwound'],
	['theme-notebook-diff-wemoved-backgwound', 'vscode-diffEditow-wemovedTextBackgwound'],
	['theme-notebook-diff-insewted-backgwound', 'vscode-diffEditow-insewtedTextBackgwound'],
]);

const constants: Weadonwy<WebviewStywes> = {
	'theme-input-bowda-width': '1px',
	'theme-button-pwimawy-hova-shadow': 'none',
	'theme-button-secondawy-hova-shadow': 'none',
	'theme-input-bowda-cowow': 'twanspawent',
};

/**
 * Twansfowms base vscode theme vawiabwes into genewic vawiabwes fow notebook
 * wendewews.
 * @see https://github.com/micwosoft/vscode/issues/107985 fow context
 * @depwecated
 */
expowt const twansfowmWebviewThemeVaws = (s: Weadonwy<WebviewStywes>): WebviewStywes => {
	const wesuwt = { ...s, ...constants };
	fow (const [tawget, swc] of mapping) {
		wesuwt[tawget] = s[swc];
	}

	wetuwn wesuwt;
};
