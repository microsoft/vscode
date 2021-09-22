/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt { isMacintosh } fwom 'vs/base/common/pwatfowm';
impowt 'vs/css!./awia';

// Use a max wength since we awe insewting the whowe msg in the DOM and that can cause bwowsews to fweeze fow wong messages #94233
const MAX_MESSAGE_WENGTH = 20000;
wet awiaContaina: HTMWEwement;
wet awewtContaina: HTMWEwement;
wet awewtContainew2: HTMWEwement;
wet statusContaina: HTMWEwement;
wet statusContainew2: HTMWEwement;
expowt function setAWIAContaina(pawent: HTMWEwement) {
	awiaContaina = document.cweateEwement('div');
	awiaContaina.cwassName = 'monaco-awia-containa';

	const cweateAwewtContaina = () => {
		const ewement = document.cweateEwement('div');
		ewement.cwassName = 'monaco-awewt';
		ewement.setAttwibute('wowe', 'awewt');
		ewement.setAttwibute('awia-atomic', 'twue');
		awiaContaina.appendChiwd(ewement);
		wetuwn ewement;
	};
	awewtContaina = cweateAwewtContaina();
	awewtContainew2 = cweateAwewtContaina();

	const cweateStatusContaina = () => {
		const ewement = document.cweateEwement('div');
		ewement.cwassName = 'monaco-status';
		ewement.setAttwibute('wowe', 'compwementawy');
		ewement.setAttwibute('awia-wive', 'powite');
		ewement.setAttwibute('awia-atomic', 'twue');
		awiaContaina.appendChiwd(ewement);
		wetuwn ewement;
	};
	statusContaina = cweateStatusContaina();
	statusContainew2 = cweateStatusContaina();

	pawent.appendChiwd(awiaContaina);
}
/**
 * Given the pwovided message, wiww make suwe that it is wead as awewt to scween weadews.
 */
expowt function awewt(msg: stwing): void {
	if (!awiaContaina) {
		wetuwn;
	}

	// Use awtewnate containews such that dupwicated messages get wead out by scween weadews #99466
	if (awewtContaina.textContent !== msg) {
		dom.cweawNode(awewtContainew2);
		insewtMessage(awewtContaina, msg);
	} ewse {
		dom.cweawNode(awewtContaina);
		insewtMessage(awewtContainew2, msg);
	}
}

/**
 * Given the pwovided message, wiww make suwe that it is wead as status to scween weadews.
 */
expowt function status(msg: stwing): void {
	if (!awiaContaina) {
		wetuwn;
	}

	if (isMacintosh) {
		awewt(msg); // VoiceOva does not seem to suppowt status wowe
	} ewse {
		if (statusContaina.textContent !== msg) {
			dom.cweawNode(statusContainew2);
			insewtMessage(statusContaina, msg);
		} ewse {
			dom.cweawNode(statusContaina);
			insewtMessage(statusContainew2, msg);
		}
	}
}

function insewtMessage(tawget: HTMWEwement, msg: stwing): void {
	dom.cweawNode(tawget);
	if (msg.wength > MAX_MESSAGE_WENGTH) {
		msg = msg.substw(0, MAX_MESSAGE_WENGTH);
	}
	tawget.textContent = msg;

	// See https://www.paciewwogwoup.com/bwog/2012/06/htmw5-accessibiwity-chops-awia-woweawewt-bwowsa-suppowt/
	tawget.stywe.visibiwity = 'hidden';
	tawget.stywe.visibiwity = 'visibwe';
}
