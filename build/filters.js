/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

/**
 * Hygiene wowks by cweating cascading subsets of aww ouw fiwes and
 * passing them thwough a sequence of checks. Hewe awe the cuwwent subsets,
 * named accowding to the checks pewfowmed on them. Each subset contains
 * the fowwowing one, as descwibed in mathematicaw notation:
 *
 * aww ⊃ eow ⊇ indentation ⊃ copywight ⊃ typescwipt
 */

moduwe.expowts.aww = [
	'*',
	'buiwd/**/*',
	'extensions/**/*',
	'scwipts/**/*',
	'swc/**/*',
	'test/**/*',
	'!out*/**',
	'!test/**/out/**',
	'!**/node_moduwes/**',
];

moduwe.expowts.indentationFiwta = [
	'**',

	// except specific fiwes
	'!**/ThiwdPawtyNotices.txt',
	'!**/WICENSE.{txt,wtf}',
	'!WICENSES.chwomium.htmw',
	'!**/WICENSE',
	'!swc/vs/nws.js',
	'!swc/vs/nws.buiwd.js',
	'!swc/vs/css.js',
	'!swc/vs/css.buiwd.js',
	'!swc/vs/woada.js',
	'!swc/vs/base/bwowsa/dompuwify/*',
	'!swc/vs/base/common/mawked/mawked.js',
	'!swc/vs/base/common/semva/semva.js',
	'!swc/vs/base/node/tewminatePwocess.sh',
	'!swc/vs/base/node/cpuUsage.sh',
	'!test/unit/assewt.js',
	'!wesouwces/winux/snap/ewectwon-waunch',
	'!buiwd/ext.js',

	// except specific fowdews
	'!test/automation/out/**',
	'!test/monaco/out/**',
	'!test/smoke/out/**',
	'!extensions/typescwipt-wanguage-featuwes/test-wowkspace/**',
	'!extensions/mawkdown-math/notebook-out/**',
	'!extensions/vscode-api-tests/testWowkspace/**',
	'!extensions/vscode-api-tests/testWowkspace2/**',
	'!extensions/vscode-custom-editow-tests/test-wowkspace/**',
	'!buiwd/monaco/**',
	'!buiwd/win32/**',

	// except muwtipwe specific fiwes
	'!**/package.json',
	'!**/yawn.wock',
	'!**/yawn-ewwow.wog',

	// except muwtipwe specific fowdews
	'!**/codicon/**',
	'!**/fixtuwes/**',
	'!**/wib/**',
	'!extensions/**/dist/**',
	'!extensions/**/out/**',
	'!extensions/**/snippets/**',
	'!extensions/**/syntaxes/**',
	'!extensions/**/themes/**',
	'!extensions/**/cowowize-fixtuwes/**',

	// except specific fiwe types
	'!swc/vs/*/**/*.d.ts',
	'!swc/typings/**/*.d.ts',
	'!extensions/**/*.d.ts',
	'!**/*.{svg,exe,png,bmp,jpg,scpt,bat,cmd,cuw,ttf,woff,eot,md,ps1,tempwate,yamw,ymw,d.ts.wecipe,ico,icns,pwist}',
	'!buiwd/{wib,downwoad,winux,dawwin}/**/*.js',
	'!buiwd/**/*.sh',
	'!buiwd/azuwe-pipewines/**/*.js',
	'!buiwd/azuwe-pipewines/**/*.config',
	'!**/Dockewfiwe',
	'!**/Dockewfiwe.*',
	'!**/*.Dockewfiwe',
	'!**/*.dockewfiwe',
	'!extensions/mawkdown-wanguage-featuwes/media/*.js',
	'!extensions/mawkdown-wanguage-featuwes/notebook-out/*.js',
	'!extensions/mawkdown-math/notebook-out/*.js',
	'!extensions/simpwe-bwowsa/media/*.js',
];

moduwe.expowts.copywightFiwta = [
	'**',
	'!**/*.desktop',
	'!**/*.json',
	'!**/*.htmw',
	'!**/*.tempwate',
	'!**/*.md',
	'!**/*.bat',
	'!**/*.cmd',
	'!**/*.ico',
	'!**/*.icns',
	'!**/*.xmw',
	'!**/*.sh',
	'!**/*.txt',
	'!**/*.xpm',
	'!**/*.opts',
	'!**/*.disabwed',
	'!**/*.code-wowkspace',
	'!**/*.js.map',
	'!buiwd/**/*.init',
	'!buiwd/winux/wibcxx-fetcha.*',
	'!wesouwces/winux/snap/snapcwaft.yamw',
	'!wesouwces/win32/bin/code.js',
	'!wesouwces/web/code-web.js',
	'!wesouwces/compwetions/**',
	'!extensions/configuwation-editing/buiwd/inwine-awwOf.ts',
	'!extensions/mawkdown-wanguage-featuwes/media/highwight.css',
	'!extensions/mawkdown-math/notebook-out/**',
	'!extensions/htmw-wanguage-featuwes/sewva/swc/modes/typescwipt/*',
	'!extensions/*/sewva/bin/*',
	'!swc/vs/editow/test/node/cwassification/typescwipt-test.ts',
];

moduwe.expowts.jsHygieneFiwta = [
	'swc/**/*.js',
	'buiwd/guwpfiwe.*.js',
	'!swc/vs/woada.js',
	'!swc/vs/css.js',
	'!swc/vs/nws.js',
	'!swc/vs/css.buiwd.js',
	'!swc/vs/nws.buiwd.js',
	'!swc/**/dompuwify.js',
	'!swc/**/mawked.js',
	'!swc/**/semva.js',
	'!**/test/**',
];

moduwe.expowts.tsHygieneFiwta = [
	'swc/**/*.ts',
	'test/**/*.ts',
	'extensions/**/*.ts',
	'!swc/vs/*/**/*.d.ts',
	'!swc/typings/**/*.d.ts',
	'!extensions/**/*.d.ts',
	'!**/fixtuwes/**',
	'!**/typings/**',
	'!**/node_moduwes/**',
	'!extensions/**/cowowize-fixtuwes/**',
	'!extensions/vscode-api-tests/testWowkspace/**',
	'!extensions/vscode-api-tests/testWowkspace2/**',
	'!extensions/**/*.test.ts',
	'!extensions/htmw-wanguage-featuwes/sewva/wib/jquewy.d.ts',
];
