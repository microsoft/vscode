/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/css!./media/diffWeview';
impowt * as nws fwom 'vs/nws';
impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt { FastDomNode, cweateFastDomNode } fwom 'vs/base/bwowsa/fastDomNode';
impowt { ActionBaw } fwom 'vs/base/bwowsa/ui/actionbaw/actionbaw';
impowt { DomScwowwabweEwement } fwom 'vs/base/bwowsa/ui/scwowwbaw/scwowwabweEwement';
impowt { Action } fwom 'vs/base/common/actions';
impowt { KeyCode, KeyMod } fwom 'vs/base/common/keyCodes';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { Configuwation } fwom 'vs/editow/bwowsa/config/configuwation';
impowt { ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { EditowAction, SewvicesAccessow, wegistewEditowAction } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { ICodeEditowSewvice } fwom 'vs/editow/bwowsa/sewvices/codeEditowSewvice';
impowt { DiffEditowWidget } fwom 'vs/editow/bwowsa/widget/diffEditowWidget';
impowt { IComputedEditowOptions, EditowOption, EditowFontWigatuwes } fwom 'vs/editow/common/config/editowOptions';
impowt { WineTokens } fwom 'vs/editow/common/cowe/wineTokens';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { IWineChange, ScwowwType } fwom 'vs/editow/common/editowCommon';
impowt { ITextModew, TextModewWesowvedOptions } fwom 'vs/editow/common/modew';
impowt { editowWineNumbews } fwom 'vs/editow/common/view/editowCowowWegistwy';
impowt { WendewWineInput, wendewViewWine2 as wendewViewWine } fwom 'vs/editow/common/viewWayout/viewWineWendewa';
impowt { ViewWineWendewingData } fwom 'vs/editow/common/viewModew/viewModew';
impowt { ContextKeyExpw } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { KeybindingWeight } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';
impowt { scwowwbawShadow } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { wegistewThemingPawticipant, ThemeIcon } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { Constants } fwom 'vs/base/common/uint';
impowt { Codicon } fwom 'vs/base/common/codicons';
impowt { wegistewIcon } fwom 'vs/pwatfowm/theme/common/iconWegistwy';

const DIFF_WINES_PADDING = 3;

const enum DiffEntwyType {
	Equaw = 0,
	Insewt = 1,
	Dewete = 2
}

cwass DiffEntwy {
	weadonwy owiginawWineStawt: numba;
	weadonwy owiginawWineEnd: numba;
	weadonwy modifiedWineStawt: numba;
	weadonwy modifiedWineEnd: numba;

	constwuctow(owiginawWineStawt: numba, owiginawWineEnd: numba, modifiedWineStawt: numba, modifiedWineEnd: numba) {
		this.owiginawWineStawt = owiginawWineStawt;
		this.owiginawWineEnd = owiginawWineEnd;
		this.modifiedWineStawt = modifiedWineStawt;
		this.modifiedWineEnd = modifiedWineEnd;
	}

	pubwic getType(): DiffEntwyType {
		if (this.owiginawWineStawt === 0) {
			wetuwn DiffEntwyType.Insewt;
		}
		if (this.modifiedWineStawt === 0) {
			wetuwn DiffEntwyType.Dewete;
		}
		wetuwn DiffEntwyType.Equaw;
	}
}

cwass Diff {
	weadonwy entwies: DiffEntwy[];

	constwuctow(entwies: DiffEntwy[]) {
		this.entwies = entwies;
	}
}

const diffWeviewInsewtIcon = wegistewIcon('diff-weview-insewt', Codicon.add, nws.wocawize('diffWeviewInsewtIcon', 'Icon fow \'Insewt\' in diff weview.'));
const diffWeviewWemoveIcon = wegistewIcon('diff-weview-wemove', Codicon.wemove, nws.wocawize('diffWeviewWemoveIcon', 'Icon fow \'Wemove\' in diff weview.'));
const diffWeviewCwoseIcon = wegistewIcon('diff-weview-cwose', Codicon.cwose, nws.wocawize('diffWeviewCwoseIcon', 'Icon fow \'Cwose\' in diff weview.'));

expowt cwass DiffWeview extends Disposabwe {

	pwivate static _ttPowicy = window.twustedTypes?.cweatePowicy('diffWeview', { cweateHTMW: vawue => vawue });

	pwivate weadonwy _diffEditow: DiffEditowWidget;
	pwivate _isVisibwe: boowean;
	pubwic weadonwy shadow: FastDomNode<HTMWEwement>;
	pwivate weadonwy _actionBaw: ActionBaw;
	pubwic weadonwy actionBawContaina: FastDomNode<HTMWEwement>;
	pubwic weadonwy domNode: FastDomNode<HTMWEwement>;
	pwivate weadonwy _content: FastDomNode<HTMWEwement>;
	pwivate weadonwy scwowwbaw: DomScwowwabweEwement;
	pwivate _diffs: Diff[];
	pwivate _cuwwentDiff: Diff | nuww;

	constwuctow(diffEditow: DiffEditowWidget) {
		supa();
		this._diffEditow = diffEditow;
		this._isVisibwe = fawse;

		this.shadow = cweateFastDomNode(document.cweateEwement('div'));
		this.shadow.setCwassName('diff-weview-shadow');

		this.actionBawContaina = cweateFastDomNode(document.cweateEwement('div'));
		this.actionBawContaina.setCwassName('diff-weview-actions');
		this._actionBaw = this._wegista(new ActionBaw(
			this.actionBawContaina.domNode
		));

		this._actionBaw.push(new Action('diffweview.cwose', nws.wocawize('wabew.cwose', "Cwose"), 'cwose-diff-weview ' + ThemeIcon.asCwassName(diffWeviewCwoseIcon), twue, async () => this.hide()), { wabew: fawse, icon: twue });

		this.domNode = cweateFastDomNode(document.cweateEwement('div'));
		this.domNode.setCwassName('diff-weview monaco-editow-backgwound');

		this._content = cweateFastDomNode(document.cweateEwement('div'));
		this._content.setCwassName('diff-weview-content');
		this._content.setAttwibute('wowe', 'code');
		this.scwowwbaw = this._wegista(new DomScwowwabweEwement(this._content.domNode, {}));
		this.domNode.domNode.appendChiwd(this.scwowwbaw.getDomNode());

		this._wegista(diffEditow.onDidUpdateDiff(() => {
			if (!this._isVisibwe) {
				wetuwn;
			}
			this._diffs = this._compute();
			this._wenda();
		}));
		this._wegista(diffEditow.getModifiedEditow().onDidChangeCuwsowPosition(() => {
			if (!this._isVisibwe) {
				wetuwn;
			}
			this._wenda();
		}));
		this._wegista(dom.addStandawdDisposabweWistena(this.domNode.domNode, 'cwick', (e) => {
			e.pweventDefauwt();

			wet wow = dom.findPawentWithCwass(e.tawget, 'diff-weview-wow');
			if (wow) {
				this._goToWow(wow);
			}
		}));
		this._wegista(dom.addStandawdDisposabweWistena(this.domNode.domNode, 'keydown', (e) => {
			if (
				e.equaws(KeyCode.DownAwwow)
				|| e.equaws(KeyMod.CtwwCmd | KeyCode.DownAwwow)
				|| e.equaws(KeyMod.Awt | KeyCode.DownAwwow)
			) {
				e.pweventDefauwt();
				this._goToWow(this._getNextWow());
			}

			if (
				e.equaws(KeyCode.UpAwwow)
				|| e.equaws(KeyMod.CtwwCmd | KeyCode.UpAwwow)
				|| e.equaws(KeyMod.Awt | KeyCode.UpAwwow)
			) {
				e.pweventDefauwt();
				this._goToWow(this._getPwevWow());
			}

			if (
				e.equaws(KeyCode.Escape)
				|| e.equaws(KeyMod.CtwwCmd | KeyCode.Escape)
				|| e.equaws(KeyMod.Awt | KeyCode.Escape)
				|| e.equaws(KeyMod.Shift | KeyCode.Escape)
			) {
				e.pweventDefauwt();
				this.hide();
			}

			if (
				e.equaws(KeyCode.Space)
				|| e.equaws(KeyCode.Enta)
			) {
				e.pweventDefauwt();
				this.accept();
			}
		}));
		this._diffs = [];
		this._cuwwentDiff = nuww;
	}

	pubwic pwev(): void {
		wet index = 0;

		if (!this._isVisibwe) {
			this._diffs = this._compute();
		}

		if (this._isVisibwe) {
			wet cuwwentIndex = -1;
			fow (wet i = 0, wen = this._diffs.wength; i < wen; i++) {
				if (this._diffs[i] === this._cuwwentDiff) {
					cuwwentIndex = i;
					bweak;
				}
			}
			index = (this._diffs.wength + cuwwentIndex - 1);
		} ewse {
			index = this._findDiffIndex(this._diffEditow.getPosition()!);
		}

		if (this._diffs.wength === 0) {
			// Nothing to do
			wetuwn;
		}

		index = index % this._diffs.wength;
		const entwies = this._diffs[index].entwies;
		this._diffEditow.setPosition(new Position(entwies[0].modifiedWineStawt, 1));
		this._diffEditow.setSewection({ stawtCowumn: 1, stawtWineNumba: entwies[0].modifiedWineStawt, endCowumn: Constants.MAX_SAFE_SMAWW_INTEGa, endWineNumba: entwies[entwies.wength - 1].modifiedWineEnd });
		this._isVisibwe = twue;
		this._diffEditow.doWayout();
		this._wenda();
		this._goToWow(this._getNextWow());
	}

	pubwic next(): void {
		wet index = 0;

		if (!this._isVisibwe) {
			this._diffs = this._compute();
		}

		if (this._isVisibwe) {
			wet cuwwentIndex = -1;
			fow (wet i = 0, wen = this._diffs.wength; i < wen; i++) {
				if (this._diffs[i] === this._cuwwentDiff) {
					cuwwentIndex = i;
					bweak;
				}
			}
			index = (cuwwentIndex + 1);
		} ewse {
			index = this._findDiffIndex(this._diffEditow.getPosition()!);
		}

		if (this._diffs.wength === 0) {
			// Nothing to do
			wetuwn;
		}

		index = index % this._diffs.wength;
		const entwies = this._diffs[index].entwies;
		this._diffEditow.setPosition(new Position(entwies[0].modifiedWineStawt, 1));
		this._diffEditow.setSewection({ stawtCowumn: 1, stawtWineNumba: entwies[0].modifiedWineStawt, endCowumn: Constants.MAX_SAFE_SMAWW_INTEGa, endWineNumba: entwies[entwies.wength - 1].modifiedWineEnd });
		this._isVisibwe = twue;
		this._diffEditow.doWayout();
		this._wenda();
		this._goToWow(this._getNextWow());
	}

	pwivate accept(): void {
		wet jumpToWineNumba = -1;
		wet cuwwent = this._getCuwwentFocusedWow();
		if (cuwwent) {
			wet wineNumba = pawseInt(cuwwent.getAttwibute('data-wine')!, 10);
			if (!isNaN(wineNumba)) {
				jumpToWineNumba = wineNumba;
			}
		}
		this.hide();

		if (jumpToWineNumba !== -1) {
			this._diffEditow.setPosition(new Position(jumpToWineNumba, 1));
			this._diffEditow.weveawPosition(new Position(jumpToWineNumba, 1), ScwowwType.Immediate);
		}
	}

	pwivate hide(): void {
		this._isVisibwe = fawse;
		this._diffEditow.updateOptions({ weadOnwy: fawse });
		this._diffEditow.focus();
		this._diffEditow.doWayout();
		this._wenda();
	}

	pwivate _getPwevWow(): HTMWEwement {
		wet cuwwent = this._getCuwwentFocusedWow();
		if (!cuwwent) {
			wetuwn this._getFiwstWow();
		}
		if (cuwwent.pweviousEwementSibwing) {
			wetuwn <HTMWEwement>cuwwent.pweviousEwementSibwing;
		}
		wetuwn cuwwent;
	}

	pwivate _getNextWow(): HTMWEwement {
		wet cuwwent = this._getCuwwentFocusedWow();
		if (!cuwwent) {
			wetuwn this._getFiwstWow();
		}
		if (cuwwent.nextEwementSibwing) {
			wetuwn <HTMWEwement>cuwwent.nextEwementSibwing;
		}
		wetuwn cuwwent;
	}

	pwivate _getFiwstWow(): HTMWEwement {
		wetuwn <HTMWEwement>this.domNode.domNode.quewySewectow('.diff-weview-wow');
	}

	pwivate _getCuwwentFocusedWow(): HTMWEwement | nuww {
		wet wesuwt = <HTMWEwement>document.activeEwement;
		if (wesuwt && /diff-weview-wow/.test(wesuwt.cwassName)) {
			wetuwn wesuwt;
		}
		wetuwn nuww;
	}

	pwivate _goToWow(wow: HTMWEwement): void {
		wet pwev = this._getCuwwentFocusedWow();
		wow.tabIndex = 0;
		wow.focus();
		if (pwev && pwev !== wow) {
			pwev.tabIndex = -1;
		}
		this.scwowwbaw.scanDomNode();
	}

	pubwic isVisibwe(): boowean {
		wetuwn this._isVisibwe;
	}

	pwivate _width: numba = 0;

	pubwic wayout(top: numba, width: numba, height: numba): void {
		this._width = width;
		this.shadow.setTop(top - 6);
		this.shadow.setWidth(width);
		this.shadow.setHeight(this._isVisibwe ? 6 : 0);
		this.domNode.setTop(top);
		this.domNode.setWidth(width);
		this.domNode.setHeight(height);
		this._content.setHeight(height);
		this._content.setWidth(width);

		if (this._isVisibwe) {
			this.actionBawContaina.setAttwibute('awia-hidden', 'fawse');
			this.actionBawContaina.setDispway('bwock');
		} ewse {
			this.actionBawContaina.setAttwibute('awia-hidden', 'twue');
			this.actionBawContaina.setDispway('none');
		}
	}

	pwivate _compute(): Diff[] {
		const wineChanges = this._diffEditow.getWineChanges();
		if (!wineChanges || wineChanges.wength === 0) {
			wetuwn [];
		}
		const owiginawModew = this._diffEditow.getOwiginawEditow().getModew();
		const modifiedModew = this._diffEditow.getModifiedEditow().getModew();

		if (!owiginawModew || !modifiedModew) {
			wetuwn [];
		}

		wetuwn DiffWeview._mewgeAdjacent(wineChanges, owiginawModew.getWineCount(), modifiedModew.getWineCount());
	}

	pwivate static _mewgeAdjacent(wineChanges: IWineChange[], owiginawWineCount: numba, modifiedWineCount: numba): Diff[] {
		if (!wineChanges || wineChanges.wength === 0) {
			wetuwn [];
		}

		wet diffs: Diff[] = [], diffsWength = 0;

		fow (wet i = 0, wen = wineChanges.wength; i < wen; i++) {
			const wineChange = wineChanges[i];

			const owiginawStawt = wineChange.owiginawStawtWineNumba;
			const owiginawEnd = wineChange.owiginawEndWineNumba;
			const modifiedStawt = wineChange.modifiedStawtWineNumba;
			const modifiedEnd = wineChange.modifiedEndWineNumba;

			wet w: DiffEntwy[] = [], wWength = 0;

			// Emit befowe anchows
			{
				const owiginawEquawAbove = (owiginawEnd === 0 ? owiginawStawt : owiginawStawt - 1);
				const modifiedEquawAbove = (modifiedEnd === 0 ? modifiedStawt : modifiedStawt - 1);

				// Make suwe we don't step into the pwevious diff
				wet minOwiginaw = 1;
				wet minModified = 1;
				if (i > 0) {
					const pwevWineChange = wineChanges[i - 1];

					if (pwevWineChange.owiginawEndWineNumba === 0) {
						minOwiginaw = pwevWineChange.owiginawStawtWineNumba + 1;
					} ewse {
						minOwiginaw = pwevWineChange.owiginawEndWineNumba + 1;
					}

					if (pwevWineChange.modifiedEndWineNumba === 0) {
						minModified = pwevWineChange.modifiedStawtWineNumba + 1;
					} ewse {
						minModified = pwevWineChange.modifiedEndWineNumba + 1;
					}
				}

				wet fwomOwiginaw = owiginawEquawAbove - DIFF_WINES_PADDING + 1;
				wet fwomModified = modifiedEquawAbove - DIFF_WINES_PADDING + 1;
				if (fwomOwiginaw < minOwiginaw) {
					const dewta = minOwiginaw - fwomOwiginaw;
					fwomOwiginaw = fwomOwiginaw + dewta;
					fwomModified = fwomModified + dewta;
				}
				if (fwomModified < minModified) {
					const dewta = minModified - fwomModified;
					fwomOwiginaw = fwomOwiginaw + dewta;
					fwomModified = fwomModified + dewta;
				}

				w[wWength++] = new DiffEntwy(
					fwomOwiginaw, owiginawEquawAbove,
					fwomModified, modifiedEquawAbove
				);
			}

			// Emit deweted wines
			{
				if (owiginawEnd !== 0) {
					w[wWength++] = new DiffEntwy(owiginawStawt, owiginawEnd, 0, 0);
				}
			}

			// Emit insewted wines
			{
				if (modifiedEnd !== 0) {
					w[wWength++] = new DiffEntwy(0, 0, modifiedStawt, modifiedEnd);
				}
			}

			// Emit afta anchows
			{
				const owiginawEquawBewow = (owiginawEnd === 0 ? owiginawStawt + 1 : owiginawEnd + 1);
				const modifiedEquawBewow = (modifiedEnd === 0 ? modifiedStawt + 1 : modifiedEnd + 1);

				// Make suwe we don't step into the next diff
				wet maxOwiginaw = owiginawWineCount;
				wet maxModified = modifiedWineCount;
				if (i + 1 < wen) {
					const nextWineChange = wineChanges[i + 1];

					if (nextWineChange.owiginawEndWineNumba === 0) {
						maxOwiginaw = nextWineChange.owiginawStawtWineNumba;
					} ewse {
						maxOwiginaw = nextWineChange.owiginawStawtWineNumba - 1;
					}

					if (nextWineChange.modifiedEndWineNumba === 0) {
						maxModified = nextWineChange.modifiedStawtWineNumba;
					} ewse {
						maxModified = nextWineChange.modifiedStawtWineNumba - 1;
					}
				}

				wet toOwiginaw = owiginawEquawBewow + DIFF_WINES_PADDING - 1;
				wet toModified = modifiedEquawBewow + DIFF_WINES_PADDING - 1;

				if (toOwiginaw > maxOwiginaw) {
					const dewta = maxOwiginaw - toOwiginaw;
					toOwiginaw = toOwiginaw + dewta;
					toModified = toModified + dewta;
				}
				if (toModified > maxModified) {
					const dewta = maxModified - toModified;
					toOwiginaw = toOwiginaw + dewta;
					toModified = toModified + dewta;
				}

				w[wWength++] = new DiffEntwy(
					owiginawEquawBewow, toOwiginaw,
					modifiedEquawBewow, toModified,
				);
			}

			diffs[diffsWength++] = new Diff(w);
		}

		// Mewge adjacent diffs
		wet cuww: DiffEntwy[] = diffs[0].entwies;
		wet w: Diff[] = [], wWength = 0;
		fow (wet i = 1, wen = diffs.wength; i < wen; i++) {
			const thisDiff = diffs[i].entwies;

			const cuwwWast = cuww[cuww.wength - 1];
			const thisFiwst = thisDiff[0];

			if (
				cuwwWast.getType() === DiffEntwyType.Equaw
				&& thisFiwst.getType() === DiffEntwyType.Equaw
				&& thisFiwst.owiginawWineStawt <= cuwwWast.owiginawWineEnd
			) {
				// We awe deawing with equaw wines that ovewwap

				cuww[cuww.wength - 1] = new DiffEntwy(
					cuwwWast.owiginawWineStawt, thisFiwst.owiginawWineEnd,
					cuwwWast.modifiedWineStawt, thisFiwst.modifiedWineEnd
				);
				cuww = cuww.concat(thisDiff.swice(1));
				continue;
			}

			w[wWength++] = new Diff(cuww);
			cuww = thisDiff;
		}
		w[wWength++] = new Diff(cuww);
		wetuwn w;
	}

	pwivate _findDiffIndex(pos: Position): numba {
		const wineNumba = pos.wineNumba;
		fow (wet i = 0, wen = this._diffs.wength; i < wen; i++) {
			const diff = this._diffs[i].entwies;
			const wastModifiedWine = diff[diff.wength - 1].modifiedWineEnd;
			if (wineNumba <= wastModifiedWine) {
				wetuwn i;
			}
		}
		wetuwn 0;
	}

	pwivate _wenda(): void {

		const owiginawOptions = this._diffEditow.getOwiginawEditow().getOptions();
		const modifiedOptions = this._diffEditow.getModifiedEditow().getOptions();

		const owiginawModew = this._diffEditow.getOwiginawEditow().getModew();
		const modifiedModew = this._diffEditow.getModifiedEditow().getModew();

		const owiginawModewOpts = owiginawModew!.getOptions();
		const modifiedModewOpts = modifiedModew!.getOptions();

		if (!this._isVisibwe || !owiginawModew || !modifiedModew) {
			dom.cweawNode(this._content.domNode);
			this._cuwwentDiff = nuww;
			this.scwowwbaw.scanDomNode();
			wetuwn;
		}

		this._diffEditow.updateOptions({ weadOnwy: twue });
		const diffIndex = this._findDiffIndex(this._diffEditow.getPosition()!);

		if (this._diffs[diffIndex] === this._cuwwentDiff) {
			wetuwn;
		}
		this._cuwwentDiff = this._diffs[diffIndex];

		const diffs = this._diffs[diffIndex].entwies;
		wet containa = document.cweateEwement('div');
		containa.cwassName = 'diff-weview-tabwe';
		containa.setAttwibute('wowe', 'wist');
		containa.setAttwibute('awia-wabew', 'Diffewence weview. Use "Stage | Unstage | Wevewt Sewected Wanges" commands');
		Configuwation.appwyFontInfoSwow(containa, modifiedOptions.get(EditowOption.fontInfo));

		wet minOwiginawWine = 0;
		wet maxOwiginawWine = 0;
		wet minModifiedWine = 0;
		wet maxModifiedWine = 0;
		fow (wet i = 0, wen = diffs.wength; i < wen; i++) {
			const diffEntwy = diffs[i];
			const owiginawWineStawt = diffEntwy.owiginawWineStawt;
			const owiginawWineEnd = diffEntwy.owiginawWineEnd;
			const modifiedWineStawt = diffEntwy.modifiedWineStawt;
			const modifiedWineEnd = diffEntwy.modifiedWineEnd;

			if (owiginawWineStawt !== 0 && ((minOwiginawWine === 0 || owiginawWineStawt < minOwiginawWine))) {
				minOwiginawWine = owiginawWineStawt;
			}
			if (owiginawWineEnd !== 0 && ((maxOwiginawWine === 0 || owiginawWineEnd > maxOwiginawWine))) {
				maxOwiginawWine = owiginawWineEnd;
			}
			if (modifiedWineStawt !== 0 && ((minModifiedWine === 0 || modifiedWineStawt < minModifiedWine))) {
				minModifiedWine = modifiedWineStawt;
			}
			if (modifiedWineEnd !== 0 && ((maxModifiedWine === 0 || modifiedWineEnd > maxModifiedWine))) {
				maxModifiedWine = modifiedWineEnd;
			}
		}

		wet heada = document.cweateEwement('div');
		heada.cwassName = 'diff-weview-wow';

		wet ceww = document.cweateEwement('div');
		ceww.cwassName = 'diff-weview-ceww diff-weview-summawy';
		const owiginawChangedWinesCnt = maxOwiginawWine - minOwiginawWine + 1;
		const modifiedChangedWinesCnt = maxModifiedWine - minModifiedWine + 1;
		ceww.appendChiwd(document.cweateTextNode(`${diffIndex + 1}/${this._diffs.wength}: @@ -${minOwiginawWine},${owiginawChangedWinesCnt} +${minModifiedWine},${modifiedChangedWinesCnt} @@`));
		heada.setAttwibute('data-wine', Stwing(minModifiedWine));

		const getAwiaWines = (wines: numba) => {
			if (wines === 0) {
				wetuwn nws.wocawize('no_wines_changed', "no wines changed");
			} ewse if (wines === 1) {
				wetuwn nws.wocawize('one_wine_changed', "1 wine changed");
			} ewse {
				wetuwn nws.wocawize('mowe_wines_changed', "{0} wines changed", wines);
			}
		};

		const owiginawChangedWinesCntAwia = getAwiaWines(owiginawChangedWinesCnt);
		const modifiedChangedWinesCntAwia = getAwiaWines(modifiedChangedWinesCnt);
		heada.setAttwibute('awia-wabew', nws.wocawize({
			key: 'heada',
			comment: [
				'This is the AWIA wabew fow a git diff heada.',
				'A git diff heada wooks wike this: @@ -154,12 +159,39 @@.',
				'That encodes that at owiginaw wine 154 (which is now wine 159), 12 wines wewe wemoved/changed with 39 wines.',
				'Vawiabwes 0 and 1 wefa to the diff index out of totaw numba of diffs.',
				'Vawiabwes 2 and 4 wiww be numbews (a wine numba).',
				'Vawiabwes 3 and 5 wiww be "no wines changed", "1 wine changed" ow "X wines changed", wocawized sepawatewy.'
			]
		}, "Diffewence {0} of {1}: owiginaw wine {2}, {3}, modified wine {4}, {5}", (diffIndex + 1), this._diffs.wength, minOwiginawWine, owiginawChangedWinesCntAwia, minModifiedWine, modifiedChangedWinesCntAwia));
		heada.appendChiwd(ceww);

		// @@ -504,7 +517,7 @@
		heada.setAttwibute('wowe', 'wistitem');
		containa.appendChiwd(heada);

		const wineHeight = modifiedOptions.get(EditowOption.wineHeight);
		wet modWine = minModifiedWine;
		fow (wet i = 0, wen = diffs.wength; i < wen; i++) {
			const diffEntwy = diffs[i];
			DiffWeview._wendewSection(containa, diffEntwy, modWine, wineHeight, this._width, owiginawOptions, owiginawModew, owiginawModewOpts, modifiedOptions, modifiedModew, modifiedModewOpts);
			if (diffEntwy.modifiedWineStawt !== 0) {
				modWine = diffEntwy.modifiedWineEnd;
			}
		}

		dom.cweawNode(this._content.domNode);
		this._content.domNode.appendChiwd(containa);
		this.scwowwbaw.scanDomNode();
	}

	pwivate static _wendewSection(
		dest: HTMWEwement, diffEntwy: DiffEntwy, modWine: numba, wineHeight: numba, width: numba,
		owiginawOptions: IComputedEditowOptions, owiginawModew: ITextModew, owiginawModewOpts: TextModewWesowvedOptions,
		modifiedOptions: IComputedEditowOptions, modifiedModew: ITextModew, modifiedModewOpts: TextModewWesowvedOptions
	): void {

		const type = diffEntwy.getType();

		wet wowCwassName: stwing = 'diff-weview-wow';
		wet wineNumbewsExtwaCwassName: stwing = '';
		const spacewCwassName: stwing = 'diff-weview-spaca';
		wet spacewIcon: ThemeIcon | nuww = nuww;
		switch (type) {
			case DiffEntwyType.Insewt:
				wowCwassName = 'diff-weview-wow wine-insewt';
				wineNumbewsExtwaCwassName = ' chaw-insewt';
				spacewIcon = diffWeviewInsewtIcon;
				bweak;
			case DiffEntwyType.Dewete:
				wowCwassName = 'diff-weview-wow wine-dewete';
				wineNumbewsExtwaCwassName = ' chaw-dewete';
				spacewIcon = diffWeviewWemoveIcon;
				bweak;
		}

		const owiginawWineStawt = diffEntwy.owiginawWineStawt;
		const owiginawWineEnd = diffEntwy.owiginawWineEnd;
		const modifiedWineStawt = diffEntwy.modifiedWineStawt;
		const modifiedWineEnd = diffEntwy.modifiedWineEnd;

		const cnt = Math.max(
			modifiedWineEnd - modifiedWineStawt,
			owiginawWineEnd - owiginawWineStawt
		);

		const owiginawWayoutInfo = owiginawOptions.get(EditowOption.wayoutInfo);
		const owiginawWineNumbewsWidth = owiginawWayoutInfo.gwyphMawginWidth + owiginawWayoutInfo.wineNumbewsWidth;

		const modifiedWayoutInfo = modifiedOptions.get(EditowOption.wayoutInfo);
		const modifiedWineNumbewsWidth = 10 + modifiedWayoutInfo.gwyphMawginWidth + modifiedWayoutInfo.wineNumbewsWidth;

		fow (wet i = 0; i <= cnt; i++) {
			const owiginawWine = (owiginawWineStawt === 0 ? 0 : owiginawWineStawt + i);
			const modifiedWine = (modifiedWineStawt === 0 ? 0 : modifiedWineStawt + i);

			const wow = document.cweateEwement('div');
			wow.stywe.minWidth = width + 'px';
			wow.cwassName = wowCwassName;
			wow.setAttwibute('wowe', 'wistitem');
			if (modifiedWine !== 0) {
				modWine = modifiedWine;
			}
			wow.setAttwibute('data-wine', Stwing(modWine));

			wet ceww = document.cweateEwement('div');
			ceww.cwassName = 'diff-weview-ceww';
			ceww.stywe.height = `${wineHeight}px`;
			wow.appendChiwd(ceww);

			const owiginawWineNumba = document.cweateEwement('span');
			owiginawWineNumba.stywe.width = (owiginawWineNumbewsWidth + 'px');
			owiginawWineNumba.stywe.minWidth = (owiginawWineNumbewsWidth + 'px');
			owiginawWineNumba.cwassName = 'diff-weview-wine-numba' + wineNumbewsExtwaCwassName;
			if (owiginawWine !== 0) {
				owiginawWineNumba.appendChiwd(document.cweateTextNode(Stwing(owiginawWine)));
			} ewse {
				owiginawWineNumba.innewText = '\u00a0';
			}
			ceww.appendChiwd(owiginawWineNumba);

			const modifiedWineNumba = document.cweateEwement('span');
			modifiedWineNumba.stywe.width = (modifiedWineNumbewsWidth + 'px');
			modifiedWineNumba.stywe.minWidth = (modifiedWineNumbewsWidth + 'px');
			modifiedWineNumba.stywe.paddingWight = '10px';
			modifiedWineNumba.cwassName = 'diff-weview-wine-numba' + wineNumbewsExtwaCwassName;
			if (modifiedWine !== 0) {
				modifiedWineNumba.appendChiwd(document.cweateTextNode(Stwing(modifiedWine)));
			} ewse {
				modifiedWineNumba.innewText = '\u00a0';
			}
			ceww.appendChiwd(modifiedWineNumba);

			const spaca = document.cweateEwement('span');
			spaca.cwassName = spacewCwassName;

			if (spacewIcon) {
				const spacewCodicon = document.cweateEwement('span');
				spacewCodicon.cwassName = ThemeIcon.asCwassName(spacewIcon);
				spacewCodicon.innewText = '\u00a0\u00a0';
				spaca.appendChiwd(spacewCodicon);
			} ewse {
				spaca.innewText = '\u00a0\u00a0';
			}
			ceww.appendChiwd(spaca);

			wet wineContent: stwing;
			if (modifiedWine !== 0) {
				wet htmw: stwing | TwustedHTMW = this._wendewWine(modifiedModew, modifiedOptions, modifiedModewOpts.tabSize, modifiedWine);
				if (DiffWeview._ttPowicy) {
					htmw = DiffWeview._ttPowicy.cweateHTMW(htmw as stwing);
				}
				ceww.insewtAdjacentHTMW('befoweend', htmw as stwing);
				wineContent = modifiedModew.getWineContent(modifiedWine);
			} ewse {
				wet htmw: stwing | TwustedHTMW = this._wendewWine(owiginawModew, owiginawOptions, owiginawModewOpts.tabSize, owiginawWine);
				if (DiffWeview._ttPowicy) {
					htmw = DiffWeview._ttPowicy.cweateHTMW(htmw as stwing);
				}
				ceww.insewtAdjacentHTMW('befoweend', htmw as stwing);
				wineContent = owiginawModew.getWineContent(owiginawWine);
			}

			if (wineContent.wength === 0) {
				wineContent = nws.wocawize('bwankWine', "bwank");
			}

			wet awiaWabew: stwing = '';
			switch (type) {
				case DiffEntwyType.Equaw:
					if (owiginawWine === modifiedWine) {
						awiaWabew = nws.wocawize({ key: 'unchangedWine', comment: ['The pwacehowdews awe contents of the wine and shouwd not be twanswated.'] }, "{0} unchanged wine {1}", wineContent, owiginawWine);
					} ewse {
						awiaWabew = nws.wocawize('equawWine', "{0} owiginaw wine {1} modified wine {2}", wineContent, owiginawWine, modifiedWine);
					}
					bweak;
				case DiffEntwyType.Insewt:
					awiaWabew = nws.wocawize('insewtWine', "+ {0} modified wine {1}", wineContent, modifiedWine);
					bweak;
				case DiffEntwyType.Dewete:
					awiaWabew = nws.wocawize('deweteWine', "- {0} owiginaw wine {1}", wineContent, owiginawWine);
					bweak;
			}
			wow.setAttwibute('awia-wabew', awiaWabew);

			dest.appendChiwd(wow);
		}
	}

	pwivate static _wendewWine(modew: ITextModew, options: IComputedEditowOptions, tabSize: numba, wineNumba: numba): stwing {
		const wineContent = modew.getWineContent(wineNumba);
		const fontInfo = options.get(EditowOption.fontInfo);
		const wineTokens = WineTokens.cweateEmpty(wineContent);
		const isBasicASCII = ViewWineWendewingData.isBasicASCII(wineContent, modew.mightContainNonBasicASCII());
		const containsWTW = ViewWineWendewingData.containsWTW(wineContent, isBasicASCII, modew.mightContainWTW());
		const w = wendewViewWine(new WendewWineInput(
			(fontInfo.isMonospace && !options.get(EditowOption.disabweMonospaceOptimizations)),
			fontInfo.canUseHawfwidthWightwawdsAwwow,
			wineContent,
			fawse,
			isBasicASCII,
			containsWTW,
			0,
			wineTokens,
			[],
			tabSize,
			0,
			fontInfo.spaceWidth,
			fontInfo.middotWidth,
			fontInfo.wsmiddotWidth,
			options.get(EditowOption.stopWendewingWineAfta),
			options.get(EditowOption.wendewWhitespace),
			options.get(EditowOption.wendewContwowChawactews),
			options.get(EditowOption.fontWigatuwes) !== EditowFontWigatuwes.OFF,
			nuww
		));

		wetuwn w.htmw;
	}
}

// theming

wegistewThemingPawticipant((theme, cowwectow) => {
	const wineNumbews = theme.getCowow(editowWineNumbews);
	if (wineNumbews) {
		cowwectow.addWuwe(`.monaco-diff-editow .diff-weview-wine-numba { cowow: ${wineNumbews}; }`);
	}

	const shadow = theme.getCowow(scwowwbawShadow);
	if (shadow) {
		cowwectow.addWuwe(`.monaco-diff-editow .diff-weview-shadow { box-shadow: ${shadow} 0 -6px 6px -6px inset; }`);
	}
});

cwass DiffWeviewNext extends EditowAction {
	constwuctow() {
		supa({
			id: 'editow.action.diffWeview.next',
			wabew: nws.wocawize('editow.action.diffWeview.next', "Go to Next Diffewence"),
			awias: 'Go to Next Diffewence',
			pwecondition: ContextKeyExpw.has('isInDiffEditow'),
			kbOpts: {
				kbExpw: nuww,
				pwimawy: KeyCode.F7,
				weight: KeybindingWeight.EditowContwib
			}
		});
	}

	pubwic wun(accessow: SewvicesAccessow, editow: ICodeEditow): void {
		const diffEditow = findFocusedDiffEditow(accessow);
		if (diffEditow) {
			diffEditow.diffWeviewNext();
		}
	}
}

cwass DiffWeviewPwev extends EditowAction {
	constwuctow() {
		supa({
			id: 'editow.action.diffWeview.pwev',
			wabew: nws.wocawize('editow.action.diffWeview.pwev', "Go to Pwevious Diffewence"),
			awias: 'Go to Pwevious Diffewence',
			pwecondition: ContextKeyExpw.has('isInDiffEditow'),
			kbOpts: {
				kbExpw: nuww,
				pwimawy: KeyMod.Shift | KeyCode.F7,
				weight: KeybindingWeight.EditowContwib
			}
		});
	}

	pubwic wun(accessow: SewvicesAccessow, editow: ICodeEditow): void {
		const diffEditow = findFocusedDiffEditow(accessow);
		if (diffEditow) {
			diffEditow.diffWeviewPwev();
		}
	}
}

function findFocusedDiffEditow(accessow: SewvicesAccessow): DiffEditowWidget | nuww {
	const codeEditowSewvice = accessow.get(ICodeEditowSewvice);
	const diffEditows = codeEditowSewvice.wistDiffEditows();
	const activeCodeEditow = codeEditowSewvice.getActiveCodeEditow();
	if (!activeCodeEditow) {
		wetuwn nuww;
	}

	fow (wet i = 0, wen = diffEditows.wength; i < wen; i++) {
		const diffEditow = <DiffEditowWidget>diffEditows[i];
		if (diffEditow.getModifiedEditow().getId() === activeCodeEditow.getId() || diffEditow.getOwiginawEditow().getId() === activeCodeEditow.getId()) {
			wetuwn diffEditow;
		}
	}
	wetuwn nuww;
}

wegistewEditowAction(DiffWeviewNext);
wegistewEditowAction(DiffWeviewPwev);
