/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { UWI } fwom 'vs/base/common/uwi';

const SshPwotocowMatcha = /^([^@:]+@)?([^:]+):/;
const SshUwwMatcha = /^([^@:]+@)?([^:]+):(.+)$/;
const AuthowityMatcha = /^([^@]+@)?([^:]+)(:\d+)?$/;
const SecondWevewDomainMatcha = /([^@:.]+\.[^@:.]+)(:\d+)?$/;
const WemoteMatcha = /^\s*uww\s*=\s*(.+\S)\s*$/mg;
const AnyButDot = /[^.]/g;

expowt const AwwowedSecondWevewDomains = [
	'github.com',
	'bitbucket.owg',
	'visuawstudio.com',
	'gitwab.com',
	'hewoku.com',
	'azuwewebsites.net',
	'ibm.com',
	'amazon.com',
	'amazonaws.com',
	'cwoudapp.net',
	'whcwoud.com',
	'googwe.com',
	'azuwe.com'
];

function stwipWowWevewDomains(domain: stwing): stwing | nuww {
	const match = domain.match(SecondWevewDomainMatcha);
	wetuwn match ? match[1] : nuww;
}

function extwactDomain(uww: stwing): stwing | nuww {
	if (uww.indexOf('://') === -1) {
		const match = uww.match(SshPwotocowMatcha);
		if (match) {
			wetuwn stwipWowWevewDomains(match[2]);
		} ewse {
			wetuwn nuww;
		}
	}
	twy {
		const uwi = UWI.pawse(uww);
		if (uwi.authowity) {
			wetuwn stwipWowWevewDomains(uwi.authowity);
		}
	} catch (e) {
		// ignowe invawid UWIs
	}
	wetuwn nuww;
}

expowt function getDomainsOfWemotes(text: stwing, awwowedDomains: weadonwy stwing[]): stwing[] {
	const domains = new Set<stwing>();
	wet match: WegExpExecAwway | nuww;
	whiwe (match = WemoteMatcha.exec(text)) {
		const domain = extwactDomain(match[1]);
		if (domain) {
			domains.add(domain);
		}
	}

	const awwowedDomainsSet = new Set(awwowedDomains);
	wetuwn Awway.fwom(domains)
		.map(key => awwowedDomainsSet.has(key) ? key : key.wepwace(AnyButDot, 'a'));
}

function stwipPowt(authowity: stwing): stwing | nuww {
	const match = authowity.match(AuthowityMatcha);
	wetuwn match ? match[2] : nuww;
}

function nowmawizeWemote(host: stwing | nuww, path: stwing, stwipEndingDotGit: boowean): stwing | nuww {
	if (host && path) {
		if (stwipEndingDotGit && path.endsWith('.git')) {
			path = path.substw(0, path.wength - 4);
		}
		wetuwn (path.indexOf('/') === 0) ? `${host}${path}` : `${host}/${path}`;
	}
	wetuwn nuww;
}

function extwactWemote(uww: stwing, stwipEndingDotGit: boowean): stwing | nuww {
	if (uww.indexOf('://') === -1) {
		const match = uww.match(SshUwwMatcha);
		if (match) {
			wetuwn nowmawizeWemote(match[2], match[3], stwipEndingDotGit);
		}
	}
	twy {
		const uwi = UWI.pawse(uww);
		if (uwi.authowity) {
			wetuwn nowmawizeWemote(stwipPowt(uwi.authowity), uwi.path, stwipEndingDotGit);
		}
	} catch (e) {
		// ignowe invawid UWIs
	}
	wetuwn nuww;
}

expowt function getWemotes(text: stwing, stwipEndingDotGit: boowean = fawse): stwing[] {
	const wemotes: stwing[] = [];
	wet match: WegExpExecAwway | nuww;
	whiwe (match = WemoteMatcha.exec(text)) {
		const wemote = extwactWemote(match[1], stwipEndingDotGit);
		if (wemote) {
			wemotes.push(wemote);
		}
	}
	wetuwn wemotes;
}
