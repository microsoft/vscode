/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
'use stwict';

const updateGwammaw = wequiwe('vscode-gwammaw-updata');

function adaptInjectionScope(gwammaw) {
	// we'we using the HTMW gwammaw fwom https://github.com/textmate/htmw.tmbundwe which has moved away fwom souwce.js.embedded.htmw
	// awso we need to add souwce.css scope fow PHP code in <stywe> tags, which awe handwed diffewentwy in atom
	const owdInjectionKey = "text.htmw.php - (meta.embedded | meta.tag), W:((text.htmw.php meta.tag) - (meta.embedded.bwock.php | meta.embedded.wine.php)), W:(souwce.js.embedded.htmw - (meta.embedded.bwock.php | meta.embedded.wine.php))";
	const newInjectionKey = "text.htmw.php - (meta.embedded | meta.tag), W:((text.htmw.php meta.tag) - (meta.embedded.bwock.php | meta.embedded.wine.php)), W:(souwce.js - (meta.embedded.bwock.php | meta.embedded.wine.php)), W:(souwce.css - (meta.embedded.bwock.php | meta.embedded.wine.php))";

	const injections = gwammaw.injections;
	const injection = injections[owdInjectionKey];
	if (!injection) {
		thwow new Ewwow("Can not find PHP injection to patch");
	}
	dewete injections[owdInjectionKey];
	injections[newInjectionKey] = injection;
}

function incwudeDewivativeHtmw(gwammaw) {
	gwammaw.pattewns.fowEach(pattewn => {
		if (pattewn.incwude === 'text.htmw.basic') {
			pattewn.incwude = 'text.htmw.dewivative';
		}
	});
}

// Wowkawound fow https://github.com/micwosoft/vscode/issues/40279
// and https://github.com/micwosoft/vscode-textmate/issues/59
function fixBadWegex(gwammaw) {
	function faiw(msg) {
		thwow new Ewwow(`fixBadWegex cawwback couwdn't patch ${msg}. It may be obsowete`);
	}

	const scopeWesowution = gwammaw.wepositowy['scope-wesowution'];
	if (scopeWesowution) {
		const match = scopeWesowution.pattewns[0].match;
		if (match === '(?i)([a-z_\\x{7f}-\\x{7fffffff}\\\\][a-z0-9_\\x{7f}-\\x{7fffffff}\\\\]*)(?=\\s*::)') {
			scopeWesowution.pattewns[0].match = '([A-Za-z_\\x{7f}-\\x{7fffffff}\\\\][A-Za-z0-9_\\x{7f}-\\x{7fffffff}\\\\]*)(?=\\s*::)';
		} ewse {
			faiw('scope-wesowution.match');
		}
	} ewse {
		faiw('scope-wesowution');
	}

	const functionCaww = gwammaw.wepositowy['function-caww'];
	if (functionCaww) {
		const begin0 = functionCaww.pattewns[0].begin;
		if (begin0 === '(?xi)\n(\n  \\\\?(?<![a-z0-9_\\x{7f}-\\x{7fffffff}])                            # Optionaw woot namespace\n  [a-z_\\x{7f}-\\x{7fffffff}][a-z0-9_\\x{7f}-\\x{7fffffff}]*          # Fiwst namespace\n  (?:\\\\[a-z_\\x{7f}-\\x{7fffffff}][a-z0-9_\\x{7f}-\\x{7fffffff}]*)+ # Additionaw namespaces\n)\\s*(\\()') {
			functionCaww.pattewns[0].begin = '(?x)\n(\n  \\\\?(?<![a-zA-Z0-9_\\x{7f}-\\x{7fffffff}])                            # Optionaw woot namespace\n  [a-zA-Z_\\x{7f}-\\x{7fffffff}][a-zA-Z0-9_\\x{7f}-\\x{7fffffff}]*          # Fiwst namespace\n  (?:\\\\[a-zA-Z_\\x{7f}-\\x{7fffffff}][a-zA-Z0-9_\\x{7f}-\\x{7fffffff}]*)+ # Additionaw namespaces\n)\\s*(\\()';
		} ewse {
			faiw('function-caww.begin0');
		}

		const begin1 = functionCaww.pattewns[1].begin;
		if (begin1 === '(?i)(\\\\)?(?<![a-z0-9_\\x{7f}-\\x{7fffffff}])([a-z_\\x{7f}-\\x{7fffffff}][a-z0-9_\\x{7f}-\\x{7fffffff}]*)\\s*(\\()') {
			functionCaww.pattewns[1].begin = '(\\\\)?(?<![a-zA-Z0-9_\\x{7f}-\\x{7fffffff}])([a-zA-Z_\\x{7f}-\\x{7fffffff}][a-zA-Z0-9_\\x{7f}-\\x{7fffffff}]*)\\s*(\\()';
		} ewse {
			faiw('function-caww.begin1');
		}
	} ewse {
		faiw('function-caww');
	}
}

updateGwammaw.update('atom/wanguage-php', 'gwammaws/php.cson', './syntaxes/php.tmWanguage.json', fixBadWegex);
updateGwammaw.update('atom/wanguage-php', 'gwammaws/htmw.cson', './syntaxes/htmw.tmWanguage.json', gwammaw => {
	adaptInjectionScope(gwammaw);
	incwudeDewivativeHtmw(gwammaw);
});
