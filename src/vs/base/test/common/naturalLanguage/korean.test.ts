/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-file

import { strictEqual } from 'assert';
import { getKoreanAltChars } from 'vs/base/common/naturalLanguage/korean';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';

function getKoreanAltCharsForString(text: string): string {
	let result = '';
	for (let i = 0; i < text.length; i++) {
		const chars = getKoreanAltChars(text.charCodeAt(i));
		if (chars) {
			result += String.fromCharCode(...Array.from(chars));
		} else {
			result += text.charAt(i);
		}
	}
	return result;
}

suite('Korean', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	suite('getKoreanAltChars', () => {
		test('Modern initial consonants', () => {
			const cases = new Map([
				['ᄀ', 'r'],
				['ᄁ', 'R'],
				['ᄂ', 's'],
				['ᄃ', 'e'],
				['ᄄ', 'E'],
				['ᄅ', 'f'],
				['ᄆ', 'a'],
				['ᄇ', 'q'],
				['ᄈ', 'Q'],
				['ᄉ', 't'],
				['ᄊ', 'T'],
				['ᄋ', 'd'],
				['ᄌ', 'w'],
				['ᄍ', 'W'],
				['ᄎ', 'c'],
				['ᄏ', 'z'],
				['ᄐ', 'x'],
				['ᄑ', 'v'],
				['ᄒ', 'g'],
			]);
			for (const [hangul, alt] of cases.entries()) {
				strictEqual(getKoreanAltCharsForString(hangul), alt, `"${hangul}" should result in "${alt}"`);
			}
		});

		test('Modern latter consonants', () => {
			const cases = new Map([
				['ᆨ', 'r'],
				['ᆩ', 'R'],
				['ᆪ', 'rt'],
				['ᆫ', 's'],
				['ᆬ', 'sw'],
				['ᆭ', 'sg'],
				['ᆮ', 'e'],
				['ᆯ', 'f'],
				['ᆰ', 'fr'],
				['ᆱ', 'fa'],
				['ᆲ', 'fq'],
				['ᆳ', 'ft'],
				['ᆴ', 'fx'],
				['ᆵ', 'fv'],
				['ᆶ', 'fg'],
				['ᆷ', 'a'],
				['ᆸ', 'q'],
				['ᆹ', 'qt'],
				['ᆺ', 't'],
				['ᆻ', 'T'],
				['ᆼ', 'd'],
				['ᆽ', 'w'],
				['ᆾ', 'c'],
				['ᆿ', 'z'],
				['ᇀ', 'x'],
				['ᇁ', 'v'],
				['ᇂ', 'g'],
			]);
			for (const [hangul, alt] of cases.entries()) {
				strictEqual(getKoreanAltCharsForString(hangul), alt, `"${hangul}" (0x${hangul.charCodeAt(0).toString(16)}) should result in "${alt}"`);
			}
		});

		test('Modern vowels', () => {
			const cases = new Map([
				['ᅡ', 'k'],
				['ᅢ', 'o'],
				['ᅣ', 'i'],
				['ᅤ', 'O'],
				['ᅥ', 'j'],
				['ᅦ', 'p'],
				['ᅧ', 'u'],
				['ᅨ', 'P'],
				['ᅩ', 'h'],
				['ᅪ', 'hk'],
				['ᅫ', 'ho'],
				['ᅬ', 'hl'],
				['ᅭ', 'y'],
				['ᅮ', 'n'],
				['ᅯ', 'nj'],
				['ᅰ', 'np'],
				['ᅱ', 'nl'],
				['ᅲ', 'b'],
				['ᅳ', 'm'],
				['ᅴ', 'ml'],
				['ᅵ', 'l'],
			]);
			for (const [hangul, alt] of cases.entries()) {
				strictEqual(getKoreanAltCharsForString(hangul), alt, `"${hangul}" (0x${hangul.charCodeAt(0).toString(16)}) should result in "${alt}"`);
			}
		});

		test('Compatibility Jamo', () => {
			const cases = new Map([
				['ㄱ', 'r'],
				['ㄲ', 'R'],
				['ㄳ', 'rt'],
				['ㄴ', 's'],
				['ㄵ', 'sw'],
				['ㄶ', 'sg'],
				['ㄷ', 'e'],
				['ㄸ', 'E'],
				['ㄹ', 'f'],
				['ㄺ', 'fr'],
				['ㄻ', 'fa'],
				['ㄼ', 'fq'],
				['ㄽ', 'ft'],
				['ㄾ', 'fx'],
				['ㄿ', 'fv'],
				['ㅀ', 'fg'],
				['ㅁ', 'a'],
				['ㅂ', 'q'],
				['ㅃ', 'Q'],
				['ㅄ', 'qt'],
				['ㅅ', 't'],
				['ㅆ', 'T'],
				['ㅇ', 'd'],
				['ㅈ', 'w'],
				['ㅉ', 'W'],
				['ㅊ', 'c'],
				['ㅋ', 'z'],
				['ㅌ', 'x'],
				['ㅍ', 'v'],
				['ㅎ', 'g'],
				['ㅏ', 'k'],
				['ㅐ', 'o'],
				['ㅑ', 'i'],
				['ㅒ', 'O'],
				['ㅓ', 'j'],
				['ㅔ', 'p'],
				['ㅕ', 'u'],
				['ㅖ', 'P'],
				['ㅗ', 'h'],
				['ㅘ', 'hk'],
				['ㅙ', 'ho'],
				['ㅚ', 'hl'],
				['ㅛ', 'y'],
				['ㅜ', 'n'],
				['ㅝ', 'nj'],
				['ㅞ', 'np'],
				['ㅟ', 'nl'],
				['ㅠ', 'b'],
				['ㅡ', 'm'],
				['ㅢ', 'ml'],
				['ㅣ', 'l'],
				// HF: Hangul Filler (everything after this is archaic)
			]);
			for (const [hangul, alt] of cases.entries()) {
				strictEqual(getKoreanAltCharsForString(hangul), alt, `"${hangul}" (0x${hangul.charCodeAt(0).toString(16)}) should result in "${alt}"`);
			}
		});

		// There are too many characters to test exhaustively, so select some
		// real world use cases from this code base (workbench contrib names)
		test('Composed samples', () => {
			const cases = new Map([
				['ㅁㅊㅊㄷㄴ냐ㅠㅑㅣㅑ쇼', 'accessibility'],
				['ㅁㅊ채ㅕㅜㅅ뚜샤시드둣ㄴ', 'accountEntitlements'],
				['며야ㅐ쳗ㄴ', 'audioCues'],
				['ㅠㄱㅁ찯셰먁채ㅣㅐ걐ㄷㄱ2ㅆ디듣ㅅ교', 'bracketPairColorizer2Telemetry'],
				['ㅠㅕㅣㅏㄸ얏', 'bulkEdit'],
				['ㅊ미ㅣㅗㅑㄷㄱㅁㄱ초ㅛ', 'callHierarchy'],
				['촘ㅅ', 'chat'],
				['챙ㄷㅁㅊ샤ㅐㅜㄴ', 'codeActions'],
				['챙ㄷㄸ야색', 'codeEditor'],
				['채ㅡㅡ뭉ㄴ', 'commands'],
				['채ㅡㅡ둣ㄴ', 'comments'],
				['채ㅜ럏ㄸ테ㅐㄳㄷㄱ', 'configExporter'],
				['채ㅜㅅㄷㅌ스두ㅕ', 'contextmenu'],
				['쳔새ㅡㄸ야색', 'customEditor'],
				['ㅇ듀ㅕㅎ', 'debug'],
				['ㅇ덱ㄷㅊㅁㅅㄷㅇㄸㅌㅅ두냐ㅐㅜㅡㅑㅎㄱㅁ색', 'deprecatedExtensionMigrator'],
				['ㄷ얏ㄴㄷㄴ냐ㅐㅜㄴ', 'editSessions'],
				['드ㅡㄷㅅ', 'emmet'],
				['ㄷㅌㅅ두냐ㅐㅜㄴ', 'extensions'],
				['ㄷㅌㅅㄷ구밌ㄷ그ㅑㅜ미', 'externalTerminal'],
				['ㄷㅌㅅㄷ구미ㅕ갸ㅒㅔ둗ㄱ', 'externalUriOpener'],
				['랴ㅣㄷㄴ', 'files'],
				['래ㅣ야ㅜㅎ', 'folding'],
				['래금ㅅ', 'format'],
				['ㅑㅟ묘ㅗㅑㅜㅅㄴ', 'inlayHints'],
				['ㅑㅟㅑㅜㄷ촘ㅅ', 'inlineChat'],
				['ㅑㅜㅅㄷㄱㅁㅊ샾ㄷ', 'interactive'],
				['ㅑㄴ녇', 'issue'],
				['ㅏ됴ㅠㅑㅜ야ㅜㅎㄴ', 'keybindings'],
				['ㅣ무혐ㅎㄷㅇㄷㅅㄷㅊ샤ㅐㅜ', 'languageDetection'],
				['ㅣ무혐ㅎㄷㄴㅅㅁ션', 'languageStatus'],
				['ㅣㅑㅡㅑ샤ㅜ얓ㅁ색', 'limitIndicator'],
				['ㅣㅑㄴㅅ', 'list'],
				['ㅣㅐㅊ미ㅗㅑㄴ새교', 'localHistory'],
				['ㅣㅐㅊ미ㅑㅋㅁ샤ㅐㅜ', 'localization'],
				['ㅣㅐㅎㄴ', 'logs'],
				['ㅡ메ㅔㄷㅇㄸ얏ㄴ', 'mappedEdits'],
				['ㅡㅁ가애주', 'markdown'],
				['ㅡㅁ갇ㄱㄴ', 'markers'],
				['ㅡㄷㄱㅎㄷㄸ야색', 'mergeEditor'],
				['ㅡㅕㅣ샤얄ㄹㄸ야색', 'multiDiffEditor'],
				['ㅜㅐㅅ듀ㅐㅐㅏ', 'notebook'],
				['ㅐㅕ시ㅑㅜㄷ', 'outline'],
				['ㅐㅕ세ㅕㅅ', 'output'],
				['ㅔㄷㄱ래그뭋ㄷ', 'performance'],
				['ㅔㄱㄷㄹㄷㄱ둧ㄷㄴ', 'preferences'],
				['벼ㅑ참ㅊㅊㄷㄴㄴ', 'quickaccess'],
				['ㄱ디며ㅜ촏ㄱ', 'relauncher'],
				['ㄱ드ㅐㅅㄷ', 'remote'],
				['ㄱ드ㅐㅅㄷ쎠ㅜㅜ디', 'remoteTunnel'],
				['ㄴㅁ노', 'sash'],
				['ㄴ츠', 'scm'],
				['ㄴㄷㅁㄱ초', 'search'],
				['ㄴㄷㅁㄱ초ㄸ야색', 'searchEditor'],
				['놈ㄱㄷ', 'share'],
				['누ㅑㅔㅔㄷㅅㄴ', 'snippets'],
				['넫ㄷ초', 'speech'],
				['네ㅣㅁ노', 'splash'],
				['녁ㅍ됸', 'surveys'],
				['ㅅㅁㅎㄴ', 'tags'],
				['ㅅㅁ난', 'tasks'],
				['ㅅ디듣ㅅ교', 'telemetry'],
				['ㅅㄷ그ㅑㅜ미', 'terminal'],
				['ㅅㄷ그ㅑㅜ미채ㅜㅅ갸ㅠ', 'terminalContrib'],
				['ㅅㄷㄴ샤ㅜㅎ', 'testing'],
				['소듣ㄴ', 'themes'],
				['샤ㅡ디ㅑㅜㄷ', 'timeline'],
				['쇼ㅔ도ㅑㄷㄱㅁㄱ초ㅛ', 'typeHierarchy'],
				['ㅕㅔㅇㅁㅅㄷ', 'update'],
				['ㅕ기', 'url'],
				['ㅕㄴㄷㄱㅇㅁㅅ몌개랴ㅣㄷ', 'userDataProfile'],
				['ㅕㄴㄷㄱㅇㅁㅅㅁ뇨ㅜㅊ', 'userDataSync'],
				['ㅈ듀퍋ㅈ', 'webview'],
				['ㅈ듀퍋졔무디', 'webviewPanel'],
				['ㅈ듀퍋ㅈ퍋ㅈ', 'webviewView'],
				['ㅈ디채ㅡ듀무ㅜㄷㄱ', 'welcomeBanner'],
				['ㅈ디채ㅡㄷ야미ㅐㅎ', 'welcomeDialog'],
				['ㅈ디채ㅡㄷㅎㄷㅅ샤ㅜㅎㄴㅅㅁㄳㄷㅇ', 'welcomeGettingStarted'],
				['ㅈ디채ㅡㄷ퍋ㅈㄴ', 'welcomeViews'],
				['ㅈ디채ㅡㄷㅉ미ㅏ소개ㅕ호', 'welcomeWalkthrough'],
				['재가넴ㅊㄷ', 'workspace'],
				['재가넴ㅊㄷㄴ', 'workspaces'],
			]);
			for (const [hangul, alt] of cases.entries()) {
				// Compare with lower case as some cases do not have
				// corresponding hangul inputs
				strictEqual(
					getKoreanAltCharsForString(hangul).toLowerCase(),
					alt.toLowerCase(),
					`"${hangul}" (0x${hangul.charCodeAt(0).toString(16)}) should result in "${alt}"`
				);
			}
		});
	});
});
