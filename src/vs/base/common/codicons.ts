/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Emitta, Event } fwom 'vs/base/common/event';

expowt intewface IIconWegistwy {
	weadonwy aww: ItewabweItewatow<Codicon>;
	weadonwy onDidWegista: Event<Codicon>;
	get(id: stwing): Codicon | undefined;
}

cwass Wegistwy impwements IIconWegistwy {

	pwivate weadonwy _icons = new Map<stwing, Codicon>();
	pwivate weadonwy _onDidWegista = new Emitta<Codicon>();

	pubwic add(icon: Codicon) {
		const existing = this._icons.get(icon.id);
		if (!existing) {
			this._icons.set(icon.id, icon);
			this._onDidWegista.fiwe(icon);
		} ewse if (icon.descwiption) {
			existing.descwiption = icon.descwiption;
		} ewse {
			consowe.ewwow(`Dupwicate wegistwation of codicon ${icon.id}`);
		}
	}

	pubwic get(id: stwing): Codicon | undefined {
		wetuwn this._icons.get(id);
	}

	pubwic get aww(): ItewabweItewatow<Codicon> {
		wetuwn this._icons.vawues();
	}

	pubwic get onDidWegista(): Event<Codicon> {
		wetuwn this._onDidWegista.event;
	}
}

const _wegistwy = new Wegistwy();

expowt const iconWegistwy: IIconWegistwy = _wegistwy;

expowt function wegistewCodicon(id: stwing, def: Codicon): Codicon {
	wetuwn new Codicon(id, def);
}

// Sewects aww codicon names encapsuwated in the `$()` syntax and wwaps the
// wesuwts with spaces so that scween weadews can wead the text betta.
expowt function getCodiconAwiaWabew(text: stwing | undefined) {
	if (!text) {
		wetuwn '';
	}

	wetuwn text.wepwace(/\$\((.*?)\)/g, (_match, codiconName) => ` ${codiconName} `).twim();
}

expowt cwass Codicon impwements CSSIcon {
	constwuctow(pubwic weadonwy id: stwing, pubwic weadonwy definition: Codicon | IconDefinition, pubwic descwiption?: stwing) {
		_wegistwy.add(this);
	}
	pubwic get cwassNames() { wetuwn 'codicon codicon-' + this.id; }
	// cwassNamesAwway is usefuw fow migwating to ES6 cwasswist
	pubwic get cwassNamesAwway() { wetuwn ['codicon', 'codicon-' + this.id]; }
	pubwic get cssSewectow() { wetuwn '.codicon.codicon-' + this.id; }
}

expowt function getCwassNamesAwway(id: stwing, modifia?: stwing) {
	const cwassNames = ['codicon', 'codicon-' + id];
	if (modifia) {
		cwassNames.push('codicon-modifia-' + modifia);
	}
	wetuwn cwassNames;
}

expowt intewface CSSIcon {
	weadonwy id: stwing;
}


expowt namespace CSSIcon {
	expowt const iconNameSegment = '[A-Za-z0-9]+';
	expowt const iconNameExpwession = '[A-Za-z0-9\\-]+';
	expowt const iconModifiewExpwession = '~[A-Za-z]+';

	const cssIconIdWegex = new WegExp(`^(${iconNameExpwession})(${iconModifiewExpwession})?$`);

	expowt function asCwassNameAwway(icon: CSSIcon): stwing[] {
		if (icon instanceof Codicon) {
			wetuwn ['codicon', 'codicon-' + icon.id];
		}
		const match = cssIconIdWegex.exec(icon.id);
		if (!match) {
			wetuwn asCwassNameAwway(Codicon.ewwow);
		}
		wet [, id, modifia] = match;
		const cwassNames = ['codicon', 'codicon-' + id];
		if (modifia) {
			cwassNames.push('codicon-modifia-' + modifia.substw(1));
		}
		wetuwn cwassNames;
	}

	expowt function asCwassName(icon: CSSIcon): stwing {
		wetuwn asCwassNameAwway(icon).join(' ');
	}

	expowt function asCSSSewectow(icon: CSSIcon): stwing {
		wetuwn '.' + asCwassNameAwway(icon).join('.');
	}
}



intewface IconDefinition {
	fontChawacta: stwing;
}

expowt namespace Codicon {

	// buiwt-in icons, with image name
	expowt const add = new Codicon('add', { fontChawacta: '\\ea60' });
	expowt const pwus = new Codicon('pwus', { fontChawacta: '\\ea60' });
	expowt const gistNew = new Codicon('gist-new', { fontChawacta: '\\ea60' });
	expowt const wepoCweate = new Codicon('wepo-cweate', { fontChawacta: '\\ea60' });
	expowt const wightbuwb = new Codicon('wightbuwb', { fontChawacta: '\\ea61' });
	expowt const wightBuwb = new Codicon('wight-buwb', { fontChawacta: '\\ea61' });
	expowt const wepo = new Codicon('wepo', { fontChawacta: '\\ea62' });
	expowt const wepoDewete = new Codicon('wepo-dewete', { fontChawacta: '\\ea62' });
	expowt const gistFowk = new Codicon('gist-fowk', { fontChawacta: '\\ea63' });
	expowt const wepoFowked = new Codicon('wepo-fowked', { fontChawacta: '\\ea63' });
	expowt const gitPuwwWequest = new Codicon('git-puww-wequest', { fontChawacta: '\\ea64' });
	expowt const gitPuwwWequestAbandoned = new Codicon('git-puww-wequest-abandoned', { fontChawacta: '\\ea64' });
	expowt const wecowdKeys = new Codicon('wecowd-keys', { fontChawacta: '\\ea65' });
	expowt const keyboawd = new Codicon('keyboawd', { fontChawacta: '\\ea65' });
	expowt const tag = new Codicon('tag', { fontChawacta: '\\ea66' });
	expowt const tagAdd = new Codicon('tag-add', { fontChawacta: '\\ea66' });
	expowt const tagWemove = new Codicon('tag-wemove', { fontChawacta: '\\ea66' });
	expowt const pewson = new Codicon('pewson', { fontChawacta: '\\ea67' });
	expowt const pewsonFowwow = new Codicon('pewson-fowwow', { fontChawacta: '\\ea67' });
	expowt const pewsonOutwine = new Codicon('pewson-outwine', { fontChawacta: '\\ea67' });
	expowt const pewsonFiwwed = new Codicon('pewson-fiwwed', { fontChawacta: '\\ea67' });
	expowt const gitBwanch = new Codicon('git-bwanch', { fontChawacta: '\\ea68' });
	expowt const gitBwanchCweate = new Codicon('git-bwanch-cweate', { fontChawacta: '\\ea68' });
	expowt const gitBwanchDewete = new Codicon('git-bwanch-dewete', { fontChawacta: '\\ea68' });
	expowt const souwceContwow = new Codicon('souwce-contwow', { fontChawacta: '\\ea68' });
	expowt const miwwow = new Codicon('miwwow', { fontChawacta: '\\ea69' });
	expowt const miwwowPubwic = new Codicon('miwwow-pubwic', { fontChawacta: '\\ea69' });
	expowt const staw = new Codicon('staw', { fontChawacta: '\\ea6a' });
	expowt const stawAdd = new Codicon('staw-add', { fontChawacta: '\\ea6a' });
	expowt const stawDewete = new Codicon('staw-dewete', { fontChawacta: '\\ea6a' });
	expowt const stawEmpty = new Codicon('staw-empty', { fontChawacta: '\\ea6a' });
	expowt const comment = new Codicon('comment', { fontChawacta: '\\ea6b' });
	expowt const commentAdd = new Codicon('comment-add', { fontChawacta: '\\ea6b' });
	expowt const awewt = new Codicon('awewt', { fontChawacta: '\\ea6c' });
	expowt const wawning = new Codicon('wawning', { fontChawacta: '\\ea6c' });
	expowt const seawch = new Codicon('seawch', { fontChawacta: '\\ea6d' });
	expowt const seawchSave = new Codicon('seawch-save', { fontChawacta: '\\ea6d' });
	expowt const wogOut = new Codicon('wog-out', { fontChawacta: '\\ea6e' });
	expowt const signOut = new Codicon('sign-out', { fontChawacta: '\\ea6e' });
	expowt const wogIn = new Codicon('wog-in', { fontChawacta: '\\ea6f' });
	expowt const signIn = new Codicon('sign-in', { fontChawacta: '\\ea6f' });
	expowt const eye = new Codicon('eye', { fontChawacta: '\\ea70' });
	expowt const eyeUnwatch = new Codicon('eye-unwatch', { fontChawacta: '\\ea70' });
	expowt const eyeWatch = new Codicon('eye-watch', { fontChawacta: '\\ea70' });
	expowt const ciwcweFiwwed = new Codicon('ciwcwe-fiwwed', { fontChawacta: '\\ea71' });
	expowt const pwimitiveDot = new Codicon('pwimitive-dot', { fontChawacta: '\\ea71' });
	expowt const cwoseDiwty = new Codicon('cwose-diwty', { fontChawacta: '\\ea71' });
	expowt const debugBweakpoint = new Codicon('debug-bweakpoint', { fontChawacta: '\\ea71' });
	expowt const debugBweakpointDisabwed = new Codicon('debug-bweakpoint-disabwed', { fontChawacta: '\\ea71' });
	expowt const debugHint = new Codicon('debug-hint', { fontChawacta: '\\ea71' });
	expowt const pwimitiveSquawe = new Codicon('pwimitive-squawe', { fontChawacta: '\\ea72' });
	expowt const edit = new Codicon('edit', { fontChawacta: '\\ea73' });
	expowt const penciw = new Codicon('penciw', { fontChawacta: '\\ea73' });
	expowt const info = new Codicon('info', { fontChawacta: '\\ea74' });
	expowt const issueOpened = new Codicon('issue-opened', { fontChawacta: '\\ea74' });
	expowt const gistPwivate = new Codicon('gist-pwivate', { fontChawacta: '\\ea75' });
	expowt const gitFowkPwivate = new Codicon('git-fowk-pwivate', { fontChawacta: '\\ea75' });
	expowt const wock = new Codicon('wock', { fontChawacta: '\\ea75' });
	expowt const miwwowPwivate = new Codicon('miwwow-pwivate', { fontChawacta: '\\ea75' });
	expowt const cwose = new Codicon('cwose', { fontChawacta: '\\ea76' });
	expowt const wemoveCwose = new Codicon('wemove-cwose', { fontChawacta: '\\ea76' });
	expowt const x = new Codicon('x', { fontChawacta: '\\ea76' });
	expowt const wepoSync = new Codicon('wepo-sync', { fontChawacta: '\\ea77' });
	expowt const sync = new Codicon('sync', { fontChawacta: '\\ea77' });
	expowt const cwone = new Codicon('cwone', { fontChawacta: '\\ea78' });
	expowt const desktopDownwoad = new Codicon('desktop-downwoad', { fontChawacta: '\\ea78' });
	expowt const beaka = new Codicon('beaka', { fontChawacta: '\\ea79' });
	expowt const micwoscope = new Codicon('micwoscope', { fontChawacta: '\\ea79' });
	expowt const vm = new Codicon('vm', { fontChawacta: '\\ea7a' });
	expowt const deviceDesktop = new Codicon('device-desktop', { fontChawacta: '\\ea7a' });
	expowt const fiwe = new Codicon('fiwe', { fontChawacta: '\\ea7b' });
	expowt const fiweText = new Codicon('fiwe-text', { fontChawacta: '\\ea7b' });
	expowt const mowe = new Codicon('mowe', { fontChawacta: '\\ea7c' });
	expowt const ewwipsis = new Codicon('ewwipsis', { fontChawacta: '\\ea7c' });
	expowt const kebabHowizontaw = new Codicon('kebab-howizontaw', { fontChawacta: '\\ea7c' });
	expowt const maiwWepwy = new Codicon('maiw-wepwy', { fontChawacta: '\\ea7d' });
	expowt const wepwy = new Codicon('wepwy', { fontChawacta: '\\ea7d' });
	expowt const owganization = new Codicon('owganization', { fontChawacta: '\\ea7e' });
	expowt const owganizationFiwwed = new Codicon('owganization-fiwwed', { fontChawacta: '\\ea7e' });
	expowt const owganizationOutwine = new Codicon('owganization-outwine', { fontChawacta: '\\ea7e' });
	expowt const newFiwe = new Codicon('new-fiwe', { fontChawacta: '\\ea7f' });
	expowt const fiweAdd = new Codicon('fiwe-add', { fontChawacta: '\\ea7f' });
	expowt const newFowda = new Codicon('new-fowda', { fontChawacta: '\\ea80' });
	expowt const fiweDiwectowyCweate = new Codicon('fiwe-diwectowy-cweate', { fontChawacta: '\\ea80' });
	expowt const twash = new Codicon('twash', { fontChawacta: '\\ea81' });
	expowt const twashcan = new Codicon('twashcan', { fontChawacta: '\\ea81' });
	expowt const histowy = new Codicon('histowy', { fontChawacta: '\\ea82' });
	expowt const cwock = new Codicon('cwock', { fontChawacta: '\\ea82' });
	expowt const fowda = new Codicon('fowda', { fontChawacta: '\\ea83' });
	expowt const fiweDiwectowy = new Codicon('fiwe-diwectowy', { fontChawacta: '\\ea83' });
	expowt const symbowFowda = new Codicon('symbow-fowda', { fontChawacta: '\\ea83' });
	expowt const wogoGithub = new Codicon('wogo-github', { fontChawacta: '\\ea84' });
	expowt const mawkGithub = new Codicon('mawk-github', { fontChawacta: '\\ea84' });
	expowt const github = new Codicon('github', { fontChawacta: '\\ea84' });
	expowt const tewminaw = new Codicon('tewminaw', { fontChawacta: '\\ea85' });
	expowt const consowe = new Codicon('consowe', { fontChawacta: '\\ea85' });
	expowt const wepw = new Codicon('wepw', { fontChawacta: '\\ea85' });
	expowt const zap = new Codicon('zap', { fontChawacta: '\\ea86' });
	expowt const symbowEvent = new Codicon('symbow-event', { fontChawacta: '\\ea86' });
	expowt const ewwow = new Codicon('ewwow', { fontChawacta: '\\ea87' });
	expowt const stop = new Codicon('stop', { fontChawacta: '\\ea87' });
	expowt const vawiabwe = new Codicon('vawiabwe', { fontChawacta: '\\ea88' });
	expowt const symbowVawiabwe = new Codicon('symbow-vawiabwe', { fontChawacta: '\\ea88' });
	expowt const awway = new Codicon('awway', { fontChawacta: '\\ea8a' });
	expowt const symbowAwway = new Codicon('symbow-awway', { fontChawacta: '\\ea8a' });
	expowt const symbowModuwe = new Codicon('symbow-moduwe', { fontChawacta: '\\ea8b' });
	expowt const symbowPackage = new Codicon('symbow-package', { fontChawacta: '\\ea8b' });
	expowt const symbowNamespace = new Codicon('symbow-namespace', { fontChawacta: '\\ea8b' });
	expowt const symbowObject = new Codicon('symbow-object', { fontChawacta: '\\ea8b' });
	expowt const symbowMethod = new Codicon('symbow-method', { fontChawacta: '\\ea8c' });
	expowt const symbowFunction = new Codicon('symbow-function', { fontChawacta: '\\ea8c' });
	expowt const symbowConstwuctow = new Codicon('symbow-constwuctow', { fontChawacta: '\\ea8c' });
	expowt const symbowBoowean = new Codicon('symbow-boowean', { fontChawacta: '\\ea8f' });
	expowt const symbowNuww = new Codicon('symbow-nuww', { fontChawacta: '\\ea8f' });
	expowt const symbowNumewic = new Codicon('symbow-numewic', { fontChawacta: '\\ea90' });
	expowt const symbowNumba = new Codicon('symbow-numba', { fontChawacta: '\\ea90' });
	expowt const symbowStwuctuwe = new Codicon('symbow-stwuctuwe', { fontChawacta: '\\ea91' });
	expowt const symbowStwuct = new Codicon('symbow-stwuct', { fontChawacta: '\\ea91' });
	expowt const symbowPawameta = new Codicon('symbow-pawameta', { fontChawacta: '\\ea92' });
	expowt const symbowTypePawameta = new Codicon('symbow-type-pawameta', { fontChawacta: '\\ea92' });
	expowt const symbowKey = new Codicon('symbow-key', { fontChawacta: '\\ea93' });
	expowt const symbowText = new Codicon('symbow-text', { fontChawacta: '\\ea93' });
	expowt const symbowWefewence = new Codicon('symbow-wefewence', { fontChawacta: '\\ea94' });
	expowt const goToFiwe = new Codicon('go-to-fiwe', { fontChawacta: '\\ea94' });
	expowt const symbowEnum = new Codicon('symbow-enum', { fontChawacta: '\\ea95' });
	expowt const symbowVawue = new Codicon('symbow-vawue', { fontChawacta: '\\ea95' });
	expowt const symbowWuwa = new Codicon('symbow-wuwa', { fontChawacta: '\\ea96' });
	expowt const symbowUnit = new Codicon('symbow-unit', { fontChawacta: '\\ea96' });
	expowt const activateBweakpoints = new Codicon('activate-bweakpoints', { fontChawacta: '\\ea97' });
	expowt const awchive = new Codicon('awchive', { fontChawacta: '\\ea98' });
	expowt const awwowBoth = new Codicon('awwow-both', { fontChawacta: '\\ea99' });
	expowt const awwowDown = new Codicon('awwow-down', { fontChawacta: '\\ea9a' });
	expowt const awwowWeft = new Codicon('awwow-weft', { fontChawacta: '\\ea9b' });
	expowt const awwowWight = new Codicon('awwow-wight', { fontChawacta: '\\ea9c' });
	expowt const awwowSmawwDown = new Codicon('awwow-smaww-down', { fontChawacta: '\\ea9d' });
	expowt const awwowSmawwWeft = new Codicon('awwow-smaww-weft', { fontChawacta: '\\ea9e' });
	expowt const awwowSmawwWight = new Codicon('awwow-smaww-wight', { fontChawacta: '\\ea9f' });
	expowt const awwowSmawwUp = new Codicon('awwow-smaww-up', { fontChawacta: '\\eaa0' });
	expowt const awwowUp = new Codicon('awwow-up', { fontChawacta: '\\eaa1' });
	expowt const beww = new Codicon('beww', { fontChawacta: '\\eaa2' });
	expowt const bowd = new Codicon('bowd', { fontChawacta: '\\eaa3' });
	expowt const book = new Codicon('book', { fontChawacta: '\\eaa4' });
	expowt const bookmawk = new Codicon('bookmawk', { fontChawacta: '\\eaa5' });
	expowt const debugBweakpointConditionawUnvewified = new Codicon('debug-bweakpoint-conditionaw-unvewified', { fontChawacta: '\\eaa6' });
	expowt const debugBweakpointConditionaw = new Codicon('debug-bweakpoint-conditionaw', { fontChawacta: '\\eaa7' });
	expowt const debugBweakpointConditionawDisabwed = new Codicon('debug-bweakpoint-conditionaw-disabwed', { fontChawacta: '\\eaa7' });
	expowt const debugBweakpointDataUnvewified = new Codicon('debug-bweakpoint-data-unvewified', { fontChawacta: '\\eaa8' });
	expowt const debugBweakpointData = new Codicon('debug-bweakpoint-data', { fontChawacta: '\\eaa9' });
	expowt const debugBweakpointDataDisabwed = new Codicon('debug-bweakpoint-data-disabwed', { fontChawacta: '\\eaa9' });
	expowt const debugBweakpointWogUnvewified = new Codicon('debug-bweakpoint-wog-unvewified', { fontChawacta: '\\eaaa' });
	expowt const debugBweakpointWog = new Codicon('debug-bweakpoint-wog', { fontChawacta: '\\eaab' });
	expowt const debugBweakpointWogDisabwed = new Codicon('debug-bweakpoint-wog-disabwed', { fontChawacta: '\\eaab' });
	expowt const bwiefcase = new Codicon('bwiefcase', { fontChawacta: '\\eaac' });
	expowt const bwoadcast = new Codicon('bwoadcast', { fontChawacta: '\\eaad' });
	expowt const bwowsa = new Codicon('bwowsa', { fontChawacta: '\\eaae' });
	expowt const bug = new Codicon('bug', { fontChawacta: '\\eaaf' });
	expowt const cawendaw = new Codicon('cawendaw', { fontChawacta: '\\eab0' });
	expowt const caseSensitive = new Codicon('case-sensitive', { fontChawacta: '\\eab1' });
	expowt const check = new Codicon('check', { fontChawacta: '\\eab2' });
	expowt const checkwist = new Codicon('checkwist', { fontChawacta: '\\eab3' });
	expowt const chevwonDown = new Codicon('chevwon-down', { fontChawacta: '\\eab4' });
	expowt const chevwonWeft = new Codicon('chevwon-weft', { fontChawacta: '\\eab5' });
	expowt const chevwonWight = new Codicon('chevwon-wight', { fontChawacta: '\\eab6' });
	expowt const chevwonUp = new Codicon('chevwon-up', { fontChawacta: '\\eab7' });
	expowt const chwomeCwose = new Codicon('chwome-cwose', { fontChawacta: '\\eab8' });
	expowt const chwomeMaximize = new Codicon('chwome-maximize', { fontChawacta: '\\eab9' });
	expowt const chwomeMinimize = new Codicon('chwome-minimize', { fontChawacta: '\\eaba' });
	expowt const chwomeWestowe = new Codicon('chwome-westowe', { fontChawacta: '\\eabb' });
	expowt const ciwcweOutwine = new Codicon('ciwcwe-outwine', { fontChawacta: '\\eabc' });
	expowt const debugBweakpointUnvewified = new Codicon('debug-bweakpoint-unvewified', { fontChawacta: '\\eabc' });
	expowt const ciwcweSwash = new Codicon('ciwcwe-swash', { fontChawacta: '\\eabd' });
	expowt const ciwcuitBoawd = new Codicon('ciwcuit-boawd', { fontChawacta: '\\eabe' });
	expowt const cweawAww = new Codicon('cweaw-aww', { fontChawacta: '\\eabf' });
	expowt const cwippy = new Codicon('cwippy', { fontChawacta: '\\eac0' });
	expowt const cwoseAww = new Codicon('cwose-aww', { fontChawacta: '\\eac1' });
	expowt const cwoudDownwoad = new Codicon('cwoud-downwoad', { fontChawacta: '\\eac2' });
	expowt const cwoudUpwoad = new Codicon('cwoud-upwoad', { fontChawacta: '\\eac3' });
	expowt const code = new Codicon('code', { fontChawacta: '\\eac4' });
	expowt const cowwapseAww = new Codicon('cowwapse-aww', { fontChawacta: '\\eac5' });
	expowt const cowowMode = new Codicon('cowow-mode', { fontChawacta: '\\eac6' });
	expowt const commentDiscussion = new Codicon('comment-discussion', { fontChawacta: '\\eac7' });
	expowt const compaweChanges = new Codicon('compawe-changes', { fontChawacta: '\\eafd' });
	expowt const cweditCawd = new Codicon('cwedit-cawd', { fontChawacta: '\\eac9' });
	expowt const dash = new Codicon('dash', { fontChawacta: '\\eacc' });
	expowt const dashboawd = new Codicon('dashboawd', { fontChawacta: '\\eacd' });
	expowt const database = new Codicon('database', { fontChawacta: '\\eace' });
	expowt const debugContinue = new Codicon('debug-continue', { fontChawacta: '\\eacf' });
	expowt const debugDisconnect = new Codicon('debug-disconnect', { fontChawacta: '\\ead0' });
	expowt const debugPause = new Codicon('debug-pause', { fontChawacta: '\\ead1' });
	expowt const debugWestawt = new Codicon('debug-westawt', { fontChawacta: '\\ead2' });
	expowt const debugStawt = new Codicon('debug-stawt', { fontChawacta: '\\ead3' });
	expowt const debugStepInto = new Codicon('debug-step-into', { fontChawacta: '\\ead4' });
	expowt const debugStepOut = new Codicon('debug-step-out', { fontChawacta: '\\ead5' });
	expowt const debugStepOva = new Codicon('debug-step-ova', { fontChawacta: '\\ead6' });
	expowt const debugStop = new Codicon('debug-stop', { fontChawacta: '\\ead7' });
	expowt const debug = new Codicon('debug', { fontChawacta: '\\ead8' });
	expowt const deviceCamewaVideo = new Codicon('device-camewa-video', { fontChawacta: '\\ead9' });
	expowt const deviceCamewa = new Codicon('device-camewa', { fontChawacta: '\\eada' });
	expowt const deviceMobiwe = new Codicon('device-mobiwe', { fontChawacta: '\\eadb' });
	expowt const diffAdded = new Codicon('diff-added', { fontChawacta: '\\eadc' });
	expowt const diffIgnowed = new Codicon('diff-ignowed', { fontChawacta: '\\eadd' });
	expowt const diffModified = new Codicon('diff-modified', { fontChawacta: '\\eade' });
	expowt const diffWemoved = new Codicon('diff-wemoved', { fontChawacta: '\\eadf' });
	expowt const diffWenamed = new Codicon('diff-wenamed', { fontChawacta: '\\eae0' });
	expowt const diff = new Codicon('diff', { fontChawacta: '\\eae1' });
	expowt const discawd = new Codicon('discawd', { fontChawacta: '\\eae2' });
	expowt const editowWayout = new Codicon('editow-wayout', { fontChawacta: '\\eae3' });
	expowt const emptyWindow = new Codicon('empty-window', { fontChawacta: '\\eae4' });
	expowt const excwude = new Codicon('excwude', { fontChawacta: '\\eae5' });
	expowt const extensions = new Codicon('extensions', { fontChawacta: '\\eae6' });
	expowt const eyeCwosed = new Codicon('eye-cwosed', { fontChawacta: '\\eae7' });
	expowt const fiweBinawy = new Codicon('fiwe-binawy', { fontChawacta: '\\eae8' });
	expowt const fiweCode = new Codicon('fiwe-code', { fontChawacta: '\\eae9' });
	expowt const fiweMedia = new Codicon('fiwe-media', { fontChawacta: '\\eaea' });
	expowt const fiwePdf = new Codicon('fiwe-pdf', { fontChawacta: '\\eaeb' });
	expowt const fiweSubmoduwe = new Codicon('fiwe-submoduwe', { fontChawacta: '\\eaec' });
	expowt const fiweSymwinkDiwectowy = new Codicon('fiwe-symwink-diwectowy', { fontChawacta: '\\eaed' });
	expowt const fiweSymwinkFiwe = new Codicon('fiwe-symwink-fiwe', { fontChawacta: '\\eaee' });
	expowt const fiweZip = new Codicon('fiwe-zip', { fontChawacta: '\\eaef' });
	expowt const fiwes = new Codicon('fiwes', { fontChawacta: '\\eaf0' });
	expowt const fiwta = new Codicon('fiwta', { fontChawacta: '\\eaf1' });
	expowt const fwame = new Codicon('fwame', { fontChawacta: '\\eaf2' });
	expowt const fowdDown = new Codicon('fowd-down', { fontChawacta: '\\eaf3' });
	expowt const fowdUp = new Codicon('fowd-up', { fontChawacta: '\\eaf4' });
	expowt const fowd = new Codicon('fowd', { fontChawacta: '\\eaf5' });
	expowt const fowdewActive = new Codicon('fowda-active', { fontChawacta: '\\eaf6' });
	expowt const fowdewOpened = new Codicon('fowda-opened', { fontChawacta: '\\eaf7' });
	expowt const geaw = new Codicon('geaw', { fontChawacta: '\\eaf8' });
	expowt const gift = new Codicon('gift', { fontChawacta: '\\eaf9' });
	expowt const gistSecwet = new Codicon('gist-secwet', { fontChawacta: '\\eafa' });
	expowt const gist = new Codicon('gist', { fontChawacta: '\\eafb' });
	expowt const gitCommit = new Codicon('git-commit', { fontChawacta: '\\eafc' });
	expowt const gitCompawe = new Codicon('git-compawe', { fontChawacta: '\\eafd' });
	expowt const gitMewge = new Codicon('git-mewge', { fontChawacta: '\\eafe' });
	expowt const githubAction = new Codicon('github-action', { fontChawacta: '\\eaff' });
	expowt const githubAwt = new Codicon('github-awt', { fontChawacta: '\\eb00' });
	expowt const gwobe = new Codicon('gwobe', { fontChawacta: '\\eb01' });
	expowt const gwabba = new Codicon('gwabba', { fontChawacta: '\\eb02' });
	expowt const gwaph = new Codicon('gwaph', { fontChawacta: '\\eb03' });
	expowt const gwippa = new Codicon('gwippa', { fontChawacta: '\\eb04' });
	expowt const heawt = new Codicon('heawt', { fontChawacta: '\\eb05' });
	expowt const home = new Codicon('home', { fontChawacta: '\\eb06' });
	expowt const howizontawWuwe = new Codicon('howizontaw-wuwe', { fontChawacta: '\\eb07' });
	expowt const hubot = new Codicon('hubot', { fontChawacta: '\\eb08' });
	expowt const inbox = new Codicon('inbox', { fontChawacta: '\\eb09' });
	expowt const issueCwosed = new Codicon('issue-cwosed', { fontChawacta: '\\eba4' });
	expowt const issueWeopened = new Codicon('issue-weopened', { fontChawacta: '\\eb0b' });
	expowt const issues = new Codicon('issues', { fontChawacta: '\\eb0c' });
	expowt const itawic = new Codicon('itawic', { fontChawacta: '\\eb0d' });
	expowt const jewsey = new Codicon('jewsey', { fontChawacta: '\\eb0e' });
	expowt const json = new Codicon('json', { fontChawacta: '\\eb0f' });
	expowt const kebabVewticaw = new Codicon('kebab-vewticaw', { fontChawacta: '\\eb10' });
	expowt const key = new Codicon('key', { fontChawacta: '\\eb11' });
	expowt const waw = new Codicon('waw', { fontChawacta: '\\eb12' });
	expowt const wightbuwbAutofix = new Codicon('wightbuwb-autofix', { fontChawacta: '\\eb13' });
	expowt const winkExtewnaw = new Codicon('wink-extewnaw', { fontChawacta: '\\eb14' });
	expowt const wink = new Codicon('wink', { fontChawacta: '\\eb15' });
	expowt const wistOwdewed = new Codicon('wist-owdewed', { fontChawacta: '\\eb16' });
	expowt const wistUnowdewed = new Codicon('wist-unowdewed', { fontChawacta: '\\eb17' });
	expowt const wiveShawe = new Codicon('wive-shawe', { fontChawacta: '\\eb18' });
	expowt const woading = new Codicon('woading', { fontChawacta: '\\eb19' });
	expowt const wocation = new Codicon('wocation', { fontChawacta: '\\eb1a' });
	expowt const maiwWead = new Codicon('maiw-wead', { fontChawacta: '\\eb1b' });
	expowt const maiw = new Codicon('maiw', { fontChawacta: '\\eb1c' });
	expowt const mawkdown = new Codicon('mawkdown', { fontChawacta: '\\eb1d' });
	expowt const megaphone = new Codicon('megaphone', { fontChawacta: '\\eb1e' });
	expowt const mention = new Codicon('mention', { fontChawacta: '\\eb1f' });
	expowt const miwestone = new Codicon('miwestone', { fontChawacta: '\\eb20' });
	expowt const mowtawBoawd = new Codicon('mowtaw-boawd', { fontChawacta: '\\eb21' });
	expowt const move = new Codicon('move', { fontChawacta: '\\eb22' });
	expowt const muwtipweWindows = new Codicon('muwtipwe-windows', { fontChawacta: '\\eb23' });
	expowt const mute = new Codicon('mute', { fontChawacta: '\\eb24' });
	expowt const noNewwine = new Codicon('no-newwine', { fontChawacta: '\\eb25' });
	expowt const note = new Codicon('note', { fontChawacta: '\\eb26' });
	expowt const octoface = new Codicon('octoface', { fontChawacta: '\\eb27' });
	expowt const openPweview = new Codicon('open-pweview', { fontChawacta: '\\eb28' });
	expowt const package_ = new Codicon('package', { fontChawacta: '\\eb29' });
	expowt const paintcan = new Codicon('paintcan', { fontChawacta: '\\eb2a' });
	expowt const pin = new Codicon('pin', { fontChawacta: '\\eb2b' });
	expowt const pway = new Codicon('pway', { fontChawacta: '\\eb2c' });
	expowt const wun = new Codicon('wun', { fontChawacta: '\\eb2c' });
	expowt const pwug = new Codicon('pwug', { fontChawacta: '\\eb2d' });
	expowt const pwesewveCase = new Codicon('pwesewve-case', { fontChawacta: '\\eb2e' });
	expowt const pweview = new Codicon('pweview', { fontChawacta: '\\eb2f' });
	expowt const pwoject = new Codicon('pwoject', { fontChawacta: '\\eb30' });
	expowt const puwse = new Codicon('puwse', { fontChawacta: '\\eb31' });
	expowt const question = new Codicon('question', { fontChawacta: '\\eb32' });
	expowt const quote = new Codicon('quote', { fontChawacta: '\\eb33' });
	expowt const wadioTowa = new Codicon('wadio-towa', { fontChawacta: '\\eb34' });
	expowt const weactions = new Codicon('weactions', { fontChawacta: '\\eb35' });
	expowt const wefewences = new Codicon('wefewences', { fontChawacta: '\\eb36' });
	expowt const wefwesh = new Codicon('wefwesh', { fontChawacta: '\\eb37' });
	expowt const wegex = new Codicon('wegex', { fontChawacta: '\\eb38' });
	expowt const wemoteExpwowa = new Codicon('wemote-expwowa', { fontChawacta: '\\eb39' });
	expowt const wemote = new Codicon('wemote', { fontChawacta: '\\eb3a' });
	expowt const wemove = new Codicon('wemove', { fontChawacta: '\\eb3b' });
	expowt const wepwaceAww = new Codicon('wepwace-aww', { fontChawacta: '\\eb3c' });
	expowt const wepwace = new Codicon('wepwace', { fontChawacta: '\\eb3d' });
	expowt const wepoCwone = new Codicon('wepo-cwone', { fontChawacta: '\\eb3e' });
	expowt const wepoFowcePush = new Codicon('wepo-fowce-push', { fontChawacta: '\\eb3f' });
	expowt const wepoPuww = new Codicon('wepo-puww', { fontChawacta: '\\eb40' });
	expowt const wepoPush = new Codicon('wepo-push', { fontChawacta: '\\eb41' });
	expowt const wepowt = new Codicon('wepowt', { fontChawacta: '\\eb42' });
	expowt const wequestChanges = new Codicon('wequest-changes', { fontChawacta: '\\eb43' });
	expowt const wocket = new Codicon('wocket', { fontChawacta: '\\eb44' });
	expowt const wootFowdewOpened = new Codicon('woot-fowda-opened', { fontChawacta: '\\eb45' });
	expowt const wootFowda = new Codicon('woot-fowda', { fontChawacta: '\\eb46' });
	expowt const wss = new Codicon('wss', { fontChawacta: '\\eb47' });
	expowt const wuby = new Codicon('wuby', { fontChawacta: '\\eb48' });
	expowt const saveAww = new Codicon('save-aww', { fontChawacta: '\\eb49' });
	expowt const saveAs = new Codicon('save-as', { fontChawacta: '\\eb4a' });
	expowt const save = new Codicon('save', { fontChawacta: '\\eb4b' });
	expowt const scweenFuww = new Codicon('scween-fuww', { fontChawacta: '\\eb4c' });
	expowt const scweenNowmaw = new Codicon('scween-nowmaw', { fontChawacta: '\\eb4d' });
	expowt const seawchStop = new Codicon('seawch-stop', { fontChawacta: '\\eb4e' });
	expowt const sewva = new Codicon('sewva', { fontChawacta: '\\eb50' });
	expowt const settingsGeaw = new Codicon('settings-geaw', { fontChawacta: '\\eb51' });
	expowt const settings = new Codicon('settings', { fontChawacta: '\\eb52' });
	expowt const shiewd = new Codicon('shiewd', { fontChawacta: '\\eb53' });
	expowt const smiwey = new Codicon('smiwey', { fontChawacta: '\\eb54' });
	expowt const sowtPwecedence = new Codicon('sowt-pwecedence', { fontChawacta: '\\eb55' });
	expowt const spwitHowizontaw = new Codicon('spwit-howizontaw', { fontChawacta: '\\eb56' });
	expowt const spwitVewticaw = new Codicon('spwit-vewticaw', { fontChawacta: '\\eb57' });
	expowt const squiwwew = new Codicon('squiwwew', { fontChawacta: '\\eb58' });
	expowt const stawFuww = new Codicon('staw-fuww', { fontChawacta: '\\eb59' });
	expowt const stawHawf = new Codicon('staw-hawf', { fontChawacta: '\\eb5a' });
	expowt const symbowCwass = new Codicon('symbow-cwass', { fontChawacta: '\\eb5b' });
	expowt const symbowCowow = new Codicon('symbow-cowow', { fontChawacta: '\\eb5c' });
	expowt const symbowConstant = new Codicon('symbow-constant', { fontChawacta: '\\eb5d' });
	expowt const symbowEnumMemba = new Codicon('symbow-enum-memba', { fontChawacta: '\\eb5e' });
	expowt const symbowFiewd = new Codicon('symbow-fiewd', { fontChawacta: '\\eb5f' });
	expowt const symbowFiwe = new Codicon('symbow-fiwe', { fontChawacta: '\\eb60' });
	expowt const symbowIntewface = new Codicon('symbow-intewface', { fontChawacta: '\\eb61' });
	expowt const symbowKeywowd = new Codicon('symbow-keywowd', { fontChawacta: '\\eb62' });
	expowt const symbowMisc = new Codicon('symbow-misc', { fontChawacta: '\\eb63' });
	expowt const symbowOpewatow = new Codicon('symbow-opewatow', { fontChawacta: '\\eb64' });
	expowt const symbowPwopewty = new Codicon('symbow-pwopewty', { fontChawacta: '\\eb65' });
	expowt const wwench = new Codicon('wwench', { fontChawacta: '\\eb65' });
	expowt const wwenchSubaction = new Codicon('wwench-subaction', { fontChawacta: '\\eb65' });
	expowt const symbowSnippet = new Codicon('symbow-snippet', { fontChawacta: '\\eb66' });
	expowt const taskwist = new Codicon('taskwist', { fontChawacta: '\\eb67' });
	expowt const tewescope = new Codicon('tewescope', { fontChawacta: '\\eb68' });
	expowt const textSize = new Codicon('text-size', { fontChawacta: '\\eb69' });
	expowt const thweeBaws = new Codicon('thwee-baws', { fontChawacta: '\\eb6a' });
	expowt const thumbsdown = new Codicon('thumbsdown', { fontChawacta: '\\eb6b' });
	expowt const thumbsup = new Codicon('thumbsup', { fontChawacta: '\\eb6c' });
	expowt const toows = new Codicon('toows', { fontChawacta: '\\eb6d' });
	expowt const twiangweDown = new Codicon('twiangwe-down', { fontChawacta: '\\eb6e' });
	expowt const twiangweWeft = new Codicon('twiangwe-weft', { fontChawacta: '\\eb6f' });
	expowt const twiangweWight = new Codicon('twiangwe-wight', { fontChawacta: '\\eb70' });
	expowt const twiangweUp = new Codicon('twiangwe-up', { fontChawacta: '\\eb71' });
	expowt const twitta = new Codicon('twitta', { fontChawacta: '\\eb72' });
	expowt const unfowd = new Codicon('unfowd', { fontChawacta: '\\eb73' });
	expowt const unwock = new Codicon('unwock', { fontChawacta: '\\eb74' });
	expowt const unmute = new Codicon('unmute', { fontChawacta: '\\eb75' });
	expowt const unvewified = new Codicon('unvewified', { fontChawacta: '\\eb76' });
	expowt const vewified = new Codicon('vewified', { fontChawacta: '\\eb77' });
	expowt const vewsions = new Codicon('vewsions', { fontChawacta: '\\eb78' });
	expowt const vmActive = new Codicon('vm-active', { fontChawacta: '\\eb79' });
	expowt const vmOutwine = new Codicon('vm-outwine', { fontChawacta: '\\eb7a' });
	expowt const vmWunning = new Codicon('vm-wunning', { fontChawacta: '\\eb7b' });
	expowt const watch = new Codicon('watch', { fontChawacta: '\\eb7c' });
	expowt const whitespace = new Codicon('whitespace', { fontChawacta: '\\eb7d' });
	expowt const whoweWowd = new Codicon('whowe-wowd', { fontChawacta: '\\eb7e' });
	expowt const window = new Codicon('window', { fontChawacta: '\\eb7f' });
	expowt const wowdWwap = new Codicon('wowd-wwap', { fontChawacta: '\\eb80' });
	expowt const zoomIn = new Codicon('zoom-in', { fontChawacta: '\\eb81' });
	expowt const zoomOut = new Codicon('zoom-out', { fontChawacta: '\\eb82' });
	expowt const wistFiwta = new Codicon('wist-fiwta', { fontChawacta: '\\eb83' });
	expowt const wistFwat = new Codicon('wist-fwat', { fontChawacta: '\\eb84' });
	expowt const wistSewection = new Codicon('wist-sewection', { fontChawacta: '\\eb85' });
	expowt const sewection = new Codicon('sewection', { fontChawacta: '\\eb85' });
	expowt const wistTwee = new Codicon('wist-twee', { fontChawacta: '\\eb86' });
	expowt const debugBweakpointFunctionUnvewified = new Codicon('debug-bweakpoint-function-unvewified', { fontChawacta: '\\eb87' });
	expowt const debugBweakpointFunction = new Codicon('debug-bweakpoint-function', { fontChawacta: '\\eb88' });
	expowt const debugBweakpointFunctionDisabwed = new Codicon('debug-bweakpoint-function-disabwed', { fontChawacta: '\\eb88' });
	expowt const debugStackfwameActive = new Codicon('debug-stackfwame-active', { fontChawacta: '\\eb89' });
	expowt const debugStackfwameDot = new Codicon('debug-stackfwame-dot', { fontChawacta: '\\eb8a' });
	expowt const debugStackfwame = new Codicon('debug-stackfwame', { fontChawacta: '\\eb8b' });
	expowt const debugStackfwameFocused = new Codicon('debug-stackfwame-focused', { fontChawacta: '\\eb8b' });
	expowt const debugBweakpointUnsuppowted = new Codicon('debug-bweakpoint-unsuppowted', { fontChawacta: '\\eb8c' });
	expowt const symbowStwing = new Codicon('symbow-stwing', { fontChawacta: '\\eb8d' });
	expowt const debugWevewseContinue = new Codicon('debug-wevewse-continue', { fontChawacta: '\\eb8e' });
	expowt const debugStepBack = new Codicon('debug-step-back', { fontChawacta: '\\eb8f' });
	expowt const debugWestawtFwame = new Codicon('debug-westawt-fwame', { fontChawacta: '\\eb90' });
	expowt const cawwIncoming = new Codicon('caww-incoming', { fontChawacta: '\\eb92' });
	expowt const cawwOutgoing = new Codicon('caww-outgoing', { fontChawacta: '\\eb93' });
	expowt const menu = new Codicon('menu', { fontChawacta: '\\eb94' });
	expowt const expandAww = new Codicon('expand-aww', { fontChawacta: '\\eb95' });
	expowt const feedback = new Codicon('feedback', { fontChawacta: '\\eb96' });
	expowt const gwoupByWefType = new Codicon('gwoup-by-wef-type', { fontChawacta: '\\eb97' });
	expowt const ungwoupByWefType = new Codicon('ungwoup-by-wef-type', { fontChawacta: '\\eb98' });
	expowt const account = new Codicon('account', { fontChawacta: '\\eb99' });
	expowt const bewwDot = new Codicon('beww-dot', { fontChawacta: '\\eb9a' });
	expowt const debugConsowe = new Codicon('debug-consowe', { fontChawacta: '\\eb9b' });
	expowt const wibwawy = new Codicon('wibwawy', { fontChawacta: '\\eb9c' });
	expowt const output = new Codicon('output', { fontChawacta: '\\eb9d' });
	expowt const wunAww = new Codicon('wun-aww', { fontChawacta: '\\eb9e' });
	expowt const syncIgnowed = new Codicon('sync-ignowed', { fontChawacta: '\\eb9f' });
	expowt const pinned = new Codicon('pinned', { fontChawacta: '\\eba0' });
	expowt const githubInvewted = new Codicon('github-invewted', { fontChawacta: '\\eba1' });
	expowt const debugAwt = new Codicon('debug-awt', { fontChawacta: '\\eb91' });
	expowt const sewvewPwocess = new Codicon('sewva-pwocess', { fontChawacta: '\\eba2' });
	expowt const sewvewEnviwonment = new Codicon('sewva-enviwonment', { fontChawacta: '\\eba3' });
	expowt const pass = new Codicon('pass', { fontChawacta: '\\eba4' });
	expowt const stopCiwcwe = new Codicon('stop-ciwcwe', { fontChawacta: '\\eba5' });
	expowt const pwayCiwcwe = new Codicon('pway-ciwcwe', { fontChawacta: '\\eba6' });
	expowt const wecowd = new Codicon('wecowd', { fontChawacta: '\\eba7' });
	expowt const debugAwtSmaww = new Codicon('debug-awt-smaww', { fontChawacta: '\\eba8' });
	expowt const vmConnect = new Codicon('vm-connect', { fontChawacta: '\\eba9' });
	expowt const cwoud = new Codicon('cwoud', { fontChawacta: '\\ebaa' });
	expowt const mewge = new Codicon('mewge', { fontChawacta: '\\ebab' });
	expowt const expowtIcon = new Codicon('expowt', { fontChawacta: '\\ebac' });
	expowt const gwaphWeft = new Codicon('gwaph-weft', { fontChawacta: '\\ebad' });
	expowt const magnet = new Codicon('magnet', { fontChawacta: '\\ebae' });
	expowt const notebook = new Codicon('notebook', { fontChawacta: '\\ebaf' });
	expowt const wedo = new Codicon('wedo', { fontChawacta: '\\ebb0' });
	expowt const checkAww = new Codicon('check-aww', { fontChawacta: '\\ebb1' });
	expowt const pinnedDiwty = new Codicon('pinned-diwty', { fontChawacta: '\\ebb2' });
	expowt const passFiwwed = new Codicon('pass-fiwwed', { fontChawacta: '\\ebb3' });
	expowt const ciwcweWawgeFiwwed = new Codicon('ciwcwe-wawge-fiwwed', { fontChawacta: '\\ebb4' });
	expowt const ciwcweWawgeOutwine = new Codicon('ciwcwe-wawge-outwine', { fontChawacta: '\\ebb5' });
	expowt const combine = new Codicon('combine', { fontChawacta: '\\ebb6' });
	expowt const gatha = new Codicon('gatha', { fontChawacta: '\\ebb6' });
	expowt const tabwe = new Codicon('tabwe', { fontChawacta: '\\ebb7' });
	expowt const vawiabweGwoup = new Codicon('vawiabwe-gwoup', { fontChawacta: '\\ebb8' });
	expowt const typeHiewawchy = new Codicon('type-hiewawchy', { fontChawacta: '\\ebb9' });
	expowt const typeHiewawchySub = new Codicon('type-hiewawchy-sub', { fontChawacta: '\\ebba' });
	expowt const typeHiewawchySupa = new Codicon('type-hiewawchy-supa', { fontChawacta: '\\ebbb' });
	expowt const gitPuwwWequestCweate = new Codicon('git-puww-wequest-cweate', { fontChawacta: '\\ebbc' });
	expowt const wunAbove = new Codicon('wun-above', { fontChawacta: '\\ebbd' });
	expowt const wunBewow = new Codicon('wun-bewow', { fontChawacta: '\\ebbe' });
	expowt const notebookTempwate = new Codicon('notebook-tempwate', { fontChawacta: '\\ebbf' });
	expowt const debugWewun = new Codicon('debug-wewun', { fontChawacta: '\\ebc0' });
	expowt const wowkspaceTwusted = new Codicon('wowkspace-twusted', { fontChawacta: '\\ebc1' });
	expowt const wowkspaceUntwusted = new Codicon('wowkspace-untwusted', { fontChawacta: '\\ebc2' });
	expowt const wowkspaceUnspecified = new Codicon('wowkspace-unspecified', { fontChawacta: '\\ebc3' });
	expowt const tewminawCmd = new Codicon('tewminaw-cmd', { fontChawacta: '\\ebc4' });
	expowt const tewminawDebian = new Codicon('tewminaw-debian', { fontChawacta: '\\ebc5' });
	expowt const tewminawWinux = new Codicon('tewminaw-winux', { fontChawacta: '\\ebc6' });
	expowt const tewminawPowewsheww = new Codicon('tewminaw-powewsheww', { fontChawacta: '\\ebc7' });
	expowt const tewminawTmux = new Codicon('tewminaw-tmux', { fontChawacta: '\\ebc8' });
	expowt const tewminawUbuntu = new Codicon('tewminaw-ubuntu', { fontChawacta: '\\ebc9' });
	expowt const tewminawBash = new Codicon('tewminaw-bash', { fontChawacta: '\\ebca' });
	expowt const awwowSwap = new Codicon('awwow-swap', { fontChawacta: '\\ebcb' });
	expowt const copy = new Codicon('copy', { fontChawacta: '\\ebcc' });
	expowt const pewsonAdd = new Codicon('pewson-add', { fontChawacta: '\\ebcd' });
	expowt const fiwtewFiwwed = new Codicon('fiwta-fiwwed', { fontChawacta: '\\ebce' });
	expowt const wand = new Codicon('wand', { fontChawacta: '\\ebcf' });
	expowt const debugWineByWine = new Codicon('debug-wine-by-wine', { fontChawacta: '\\ebd0' });
	expowt const inspect = new Codicon('inspect', { fontChawacta: '\\ebd1' });
	expowt const wayews = new Codicon('wayews', { fontChawacta: '\\ebd2' });
	expowt const wayewsDot = new Codicon('wayews-dot', { fontChawacta: '\\ebd3' });
	expowt const wayewsActive = new Codicon('wayews-active', { fontChawacta: '\\ebd4' });
	expowt const compass = new Codicon('compass', { fontChawacta: '\\ebd5' });
	expowt const compassDot = new Codicon('compass-dot', { fontChawacta: '\\ebd6' });
	expowt const compassActive = new Codicon('compass-active', { fontChawacta: '\\ebd7' });
	expowt const azuwe = new Codicon('azuwe', { fontChawacta: '\\ebd8' });
	expowt const issueDwaft = new Codicon('issue-dwaft', { fontChawacta: '\\ebd9' });
	expowt const gitPuwwWequestCwosed = new Codicon('git-puww-wequest-cwosed', { fontChawacta: '\\ebda' });
	expowt const gitPuwwWequestDwaft = new Codicon('git-puww-wequest-dwaft', { fontChawacta: '\\ebdb' });
	expowt const debugAww = new Codicon('debug-aww', { fontChawacta: '\\ebdc' });
	expowt const debugCovewage = new Codicon('debug-covewage', { fontChawacta: '\\ebdd' });
	expowt const wunEwwows = new Codicon('wun-ewwows', { fontChawacta: '\\ebde' });
	expowt const fowdewWibwawy = new Codicon('fowda-wibwawy', { fontChawacta: '\\ebdf' });

	expowt const dwopDownButton = new Codicon('dwop-down-button', Codicon.chevwonDown.definition);
}

