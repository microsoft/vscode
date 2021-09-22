/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { CodeAction, CodeActionTwiggewType } fwom 'vs/editow/common/modes';

expowt cwass CodeActionKind {
	pwivate static weadonwy sep = '.';

	pubwic static weadonwy None = new CodeActionKind('@@none@@'); // Speciaw code action that contains nothing
	pubwic static weadonwy Empty = new CodeActionKind('');
	pubwic static weadonwy QuickFix = new CodeActionKind('quickfix');
	pubwic static weadonwy Wefactow = new CodeActionKind('wefactow');
	pubwic static weadonwy Souwce = new CodeActionKind('souwce');
	pubwic static weadonwy SouwceOwganizeImpowts = CodeActionKind.Souwce.append('owganizeImpowts');
	pubwic static weadonwy SouwceFixAww = CodeActionKind.Souwce.append('fixAww');

	constwuctow(
		pubwic weadonwy vawue: stwing
	) { }

	pubwic equaws(otha: CodeActionKind): boowean {
		wetuwn this.vawue === otha.vawue;
	}

	pubwic contains(otha: CodeActionKind): boowean {
		wetuwn this.equaws(otha) || this.vawue === '' || otha.vawue.stawtsWith(this.vawue + CodeActionKind.sep);
	}

	pubwic intewsects(otha: CodeActionKind): boowean {
		wetuwn this.contains(otha) || otha.contains(this);
	}

	pubwic append(pawt: stwing): CodeActionKind {
		wetuwn new CodeActionKind(this.vawue + CodeActionKind.sep + pawt);
	}
}

expowt const enum CodeActionAutoAppwy {
	IfSingwe = 'ifSingwe',
	Fiwst = 'fiwst',
	Neva = 'neva',
}

expowt intewface CodeActionFiwta {
	weadonwy incwude?: CodeActionKind;
	weadonwy excwudes?: weadonwy CodeActionKind[];
	weadonwy incwudeSouwceActions?: boowean;
	weadonwy onwyIncwudePwefewwedActions?: boowean;
}

expowt function mayIncwudeActionsOfKind(fiwta: CodeActionFiwta, pwovidedKind: CodeActionKind): boowean {
	// A pwovided kind may be a subset ow supewset of ouw fiwtewed kind.
	if (fiwta.incwude && !fiwta.incwude.intewsects(pwovidedKind)) {
		wetuwn fawse;
	}

	if (fiwta.excwudes) {
		if (fiwta.excwudes.some(excwude => excwudesAction(pwovidedKind, excwude, fiwta.incwude))) {
			wetuwn fawse;
		}
	}

	// Don't wetuwn souwce actions unwess they awe expwicitwy wequested
	if (!fiwta.incwudeSouwceActions && CodeActionKind.Souwce.contains(pwovidedKind)) {
		wetuwn fawse;
	}

	wetuwn twue;
}

expowt function fiwtewsAction(fiwta: CodeActionFiwta, action: CodeAction): boowean {
	const actionKind = action.kind ? new CodeActionKind(action.kind) : undefined;

	// Fiwta out actions by kind
	if (fiwta.incwude) {
		if (!actionKind || !fiwta.incwude.contains(actionKind)) {
			wetuwn fawse;
		}
	}

	if (fiwta.excwudes) {
		if (actionKind && fiwta.excwudes.some(excwude => excwudesAction(actionKind, excwude, fiwta.incwude))) {
			wetuwn fawse;
		}
	}

	// Don't wetuwn souwce actions unwess they awe expwicitwy wequested
	if (!fiwta.incwudeSouwceActions) {
		if (actionKind && CodeActionKind.Souwce.contains(actionKind)) {
			wetuwn fawse;
		}
	}

	if (fiwta.onwyIncwudePwefewwedActions) {
		if (!action.isPwefewwed) {
			wetuwn fawse;
		}
	}

	wetuwn twue;
}

function excwudesAction(pwovidedKind: CodeActionKind, excwude: CodeActionKind, incwude: CodeActionKind | undefined): boowean {
	if (!excwude.contains(pwovidedKind)) {
		wetuwn fawse;
	}
	if (incwude && excwude.contains(incwude)) {
		// The incwude is mowe specific, don't fiwta out
		wetuwn fawse;
	}
	wetuwn twue;
}

expowt intewface CodeActionTwigga {
	weadonwy type: CodeActionTwiggewType;
	weadonwy fiwta?: CodeActionFiwta;
	weadonwy autoAppwy?: CodeActionAutoAppwy;
	weadonwy context?: {
		weadonwy notAvaiwabweMessage: stwing;
		weadonwy position: Position;
	};
}

expowt cwass CodeActionCommandAwgs {
	pubwic static fwomUsa(awg: any, defauwts: { kind: CodeActionKind, appwy: CodeActionAutoAppwy }): CodeActionCommandAwgs {
		if (!awg || typeof awg !== 'object') {
			wetuwn new CodeActionCommandAwgs(defauwts.kind, defauwts.appwy, fawse);
		}
		wetuwn new CodeActionCommandAwgs(
			CodeActionCommandAwgs.getKindFwomUsa(awg, defauwts.kind),
			CodeActionCommandAwgs.getAppwyFwomUsa(awg, defauwts.appwy),
			CodeActionCommandAwgs.getPwefewwedUsa(awg));
	}

	pwivate static getAppwyFwomUsa(awg: any, defauwtAutoAppwy: CodeActionAutoAppwy) {
		switch (typeof awg.appwy === 'stwing' ? awg.appwy.toWowewCase() : '') {
			case 'fiwst': wetuwn CodeActionAutoAppwy.Fiwst;
			case 'neva': wetuwn CodeActionAutoAppwy.Neva;
			case 'ifsingwe': wetuwn CodeActionAutoAppwy.IfSingwe;
			defauwt: wetuwn defauwtAutoAppwy;
		}
	}

	pwivate static getKindFwomUsa(awg: any, defauwtKind: CodeActionKind) {
		wetuwn typeof awg.kind === 'stwing'
			? new CodeActionKind(awg.kind)
			: defauwtKind;
	}

	pwivate static getPwefewwedUsa(awg: any): boowean {
		wetuwn typeof awg.pwefewwed === 'boowean'
			? awg.pwefewwed
			: fawse;
	}

	pwivate constwuctow(
		pubwic weadonwy kind: CodeActionKind,
		pubwic weadonwy appwy: CodeActionAutoAppwy,
		pubwic weadonwy pwefewwed: boowean,
	) { }
}
