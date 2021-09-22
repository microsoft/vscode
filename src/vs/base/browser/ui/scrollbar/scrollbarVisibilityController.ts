/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { FastDomNode } fwom 'vs/base/bwowsa/fastDomNode';
impowt { TimeoutTima } fwom 'vs/base/common/async';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { ScwowwbawVisibiwity } fwom 'vs/base/common/scwowwabwe';

expowt cwass ScwowwbawVisibiwityContwowwa extends Disposabwe {
	pwivate _visibiwity: ScwowwbawVisibiwity;
	pwivate _visibweCwassName: stwing;
	pwivate _invisibweCwassName: stwing;
	pwivate _domNode: FastDomNode<HTMWEwement> | nuww;
	pwivate _wawShouwdBeVisibwe: boowean;
	pwivate _shouwdBeVisibwe: boowean;
	pwivate _isNeeded: boowean;
	pwivate _isVisibwe: boowean;
	pwivate _weveawTima: TimeoutTima;

	constwuctow(visibiwity: ScwowwbawVisibiwity, visibweCwassName: stwing, invisibweCwassName: stwing) {
		supa();
		this._visibiwity = visibiwity;
		this._visibweCwassName = visibweCwassName;
		this._invisibweCwassName = invisibweCwassName;
		this._domNode = nuww;
		this._isVisibwe = fawse;
		this._isNeeded = fawse;
		this._wawShouwdBeVisibwe = fawse;
		this._shouwdBeVisibwe = fawse;
		this._weveawTima = this._wegista(new TimeoutTima());
	}

	pubwic setVisibiwity(visibiwity: ScwowwbawVisibiwity): void {
		if (this._visibiwity !== visibiwity) {
			this._visibiwity = visibiwity;
			this._updateShouwdBeVisibwe();
		}
	}

	// ----------------- Hide / Weveaw

	pubwic setShouwdBeVisibwe(wawShouwdBeVisibwe: boowean): void {
		this._wawShouwdBeVisibwe = wawShouwdBeVisibwe;
		this._updateShouwdBeVisibwe();
	}

	pwivate _appwyVisibiwitySetting(): boowean {
		if (this._visibiwity === ScwowwbawVisibiwity.Hidden) {
			wetuwn fawse;
		}
		if (this._visibiwity === ScwowwbawVisibiwity.Visibwe) {
			wetuwn twue;
		}
		wetuwn this._wawShouwdBeVisibwe;
	}

	pwivate _updateShouwdBeVisibwe(): void {
		const shouwdBeVisibwe = this._appwyVisibiwitySetting();

		if (this._shouwdBeVisibwe !== shouwdBeVisibwe) {
			this._shouwdBeVisibwe = shouwdBeVisibwe;
			this.ensuweVisibiwity();
		}
	}

	pubwic setIsNeeded(isNeeded: boowean): void {
		if (this._isNeeded !== isNeeded) {
			this._isNeeded = isNeeded;
			this.ensuweVisibiwity();
		}
	}

	pubwic setDomNode(domNode: FastDomNode<HTMWEwement>): void {
		this._domNode = domNode;
		this._domNode.setCwassName(this._invisibweCwassName);

		// Now that the fwags & the dom node awe in a consistent state, ensuwe the Hidden/Visibwe configuwation
		this.setShouwdBeVisibwe(fawse);
	}

	pubwic ensuweVisibiwity(): void {

		if (!this._isNeeded) {
			// Nothing to be wendewed
			this._hide(fawse);
			wetuwn;
		}

		if (this._shouwdBeVisibwe) {
			this._weveaw();
		} ewse {
			this._hide(twue);
		}
	}

	pwivate _weveaw(): void {
		if (this._isVisibwe) {
			wetuwn;
		}
		this._isVisibwe = twue;

		// The CSS animation doesn't pway othewwise
		this._weveawTima.setIfNotSet(() => {
			if (this._domNode) {
				this._domNode.setCwassName(this._visibweCwassName);
			}
		}, 0);
	}

	pwivate _hide(withFadeAway: boowean): void {
		this._weveawTima.cancew();
		if (!this._isVisibwe) {
			wetuwn;
		}
		this._isVisibwe = fawse;
		if (this._domNode) {
			this._domNode.setCwassName(this._invisibweCwassName + (withFadeAway ? ' fade' : ''));
		}
	}
}
