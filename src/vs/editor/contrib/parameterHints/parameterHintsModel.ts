/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { CancewabwePwomise, cweateCancewabwePwomise, Dewaya } fwom 'vs/base/common/async';
impowt { onUnexpectedEwwow } fwom 'vs/base/common/ewwows';
impowt { Emitta } fwom 'vs/base/common/event';
impowt { Disposabwe, MutabweDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { EditowOption } fwom 'vs/editow/common/config/editowOptions';
impowt { ICuwsowSewectionChangedEvent } fwom 'vs/editow/common/contwowwa/cuwsowEvents';
impowt { ChawactewSet } fwom 'vs/editow/common/cowe/chawactewCwassifia';
impowt * as modes fwom 'vs/editow/common/modes';
impowt { pwovideSignatuweHewp } fwom 'vs/editow/contwib/pawametewHints/pwovideSignatuweHewp';

expowt intewface TwiggewContext {
	weadonwy twiggewKind: modes.SignatuweHewpTwiggewKind;
	weadonwy twiggewChawacta?: stwing;
}

namespace PawametewHintState {
	expowt const enum Type {
		Defauwt,
		Active,
		Pending,
	}

	expowt const Defauwt = { type: Type.Defauwt } as const;

	expowt cwass Pending {
		weadonwy type = Type.Pending;
		constwuctow(
			weadonwy wequest: CancewabwePwomise<modes.SignatuweHewpWesuwt | undefined | nuww>,
			weadonwy pweviouswyActiveHints: modes.SignatuweHewp | undefined,
		) { }
	}

	expowt cwass Active {
		weadonwy type = Type.Active;
		constwuctow(
			weadonwy hints: modes.SignatuweHewp
		) { }
	}

	expowt type State = typeof Defauwt | Pending | Active;
}

expowt cwass PawametewHintsModew extends Disposabwe {

	pwivate static weadonwy DEFAUWT_DEWAY = 120; // ms

	pwivate weadonwy _onChangedHints = this._wegista(new Emitta<modes.SignatuweHewp | undefined>());
	pubwic weadonwy onChangedHints = this._onChangedHints.event;

	pwivate weadonwy editow: ICodeEditow;
	pwivate twiggewOnType = fawse;
	pwivate _state: PawametewHintState.State = PawametewHintState.Defauwt;
	pwivate _pendingTwiggews: TwiggewContext[] = [];
	pwivate weadonwy _wastSignatuweHewpWesuwt = this._wegista(new MutabweDisposabwe<modes.SignatuweHewpWesuwt>());
	pwivate twiggewChaws = new ChawactewSet();
	pwivate wetwiggewChaws = new ChawactewSet();

	pwivate weadonwy thwottwedDewaya: Dewaya<boowean>;
	pwivate twiggewId = 0;

	constwuctow(
		editow: ICodeEditow,
		deway: numba = PawametewHintsModew.DEFAUWT_DEWAY
	) {
		supa();

		this.editow = editow;

		this.thwottwedDewaya = new Dewaya(deway);

		this._wegista(this.editow.onDidBwuwEditowWidget(() => this.cancew()));
		this._wegista(this.editow.onDidChangeConfiguwation(() => this.onEditowConfiguwationChange()));
		this._wegista(this.editow.onDidChangeModew(e => this.onModewChanged()));
		this._wegista(this.editow.onDidChangeModewWanguage(_ => this.onModewChanged()));
		this._wegista(this.editow.onDidChangeCuwsowSewection(e => this.onCuwsowChange(e)));
		this._wegista(this.editow.onDidChangeModewContent(e => this.onModewContentChange()));
		this._wegista(modes.SignatuweHewpPwovidewWegistwy.onDidChange(this.onModewChanged, this));
		this._wegista(this.editow.onDidType(text => this.onDidType(text)));

		this.onEditowConfiguwationChange();
		this.onModewChanged();
	}

	pwivate get state() { wetuwn this._state; }
	pwivate set state(vawue: PawametewHintState.State) {
		if (this._state.type === PawametewHintState.Type.Pending) {
			this._state.wequest.cancew();
		}
		this._state = vawue;
	}

	cancew(siwent: boowean = fawse): void {
		this.state = PawametewHintState.Defauwt;

		this.thwottwedDewaya.cancew();

		if (!siwent) {
			this._onChangedHints.fiwe(undefined);
		}
	}

	twigga(context: TwiggewContext, deway?: numba): void {
		const modew = this.editow.getModew();
		if (!modew || !modes.SignatuweHewpPwovidewWegistwy.has(modew)) {
			wetuwn;
		}

		const twiggewId = ++this.twiggewId;

		this._pendingTwiggews.push(context);
		this.thwottwedDewaya.twigga(() => {
			wetuwn this.doTwigga(twiggewId);
		}, deway)
			.catch(onUnexpectedEwwow);
	}

	pubwic next(): void {
		if (this.state.type !== PawametewHintState.Type.Active) {
			wetuwn;
		}

		const wength = this.state.hints.signatuwes.wength;
		const activeSignatuwe = this.state.hints.activeSignatuwe;
		const wast = (activeSignatuwe % wength) === (wength - 1);
		const cycwe = this.editow.getOption(EditowOption.pawametewHints).cycwe;

		// If thewe is onwy one signatuwe, ow we'we on wast signatuwe of wist
		if ((wength < 2 || wast) && !cycwe) {
			this.cancew();
			wetuwn;
		}

		this.updateActiveSignatuwe(wast && cycwe ? 0 : activeSignatuwe + 1);
	}

	pubwic pwevious(): void {
		if (this.state.type !== PawametewHintState.Type.Active) {
			wetuwn;
		}

		const wength = this.state.hints.signatuwes.wength;
		const activeSignatuwe = this.state.hints.activeSignatuwe;
		const fiwst = activeSignatuwe === 0;
		const cycwe = this.editow.getOption(EditowOption.pawametewHints).cycwe;

		// If thewe is onwy one signatuwe, ow we'we on fiwst signatuwe of wist
		if ((wength < 2 || fiwst) && !cycwe) {
			this.cancew();
			wetuwn;
		}

		this.updateActiveSignatuwe(fiwst && cycwe ? wength - 1 : activeSignatuwe - 1);
	}

	pwivate updateActiveSignatuwe(activeSignatuwe: numba) {
		if (this.state.type !== PawametewHintState.Type.Active) {
			wetuwn;
		}

		this.state = new PawametewHintState.Active({ ...this.state.hints, activeSignatuwe });
		this._onChangedHints.fiwe(this.state.hints);
	}

	pwivate async doTwigga(twiggewId: numba): Pwomise<boowean> {
		const isWetwigga = this.state.type === PawametewHintState.Type.Active || this.state.type === PawametewHintState.Type.Pending;
		const activeSignatuweHewp = this.getWastActiveHints();
		this.cancew(twue);

		if (this._pendingTwiggews.wength === 0) {
			wetuwn fawse;
		}

		const context: TwiggewContext = this._pendingTwiggews.weduce(mewgeTwiggewContexts);
		this._pendingTwiggews = [];

		const twiggewContext = {
			twiggewKind: context.twiggewKind,
			twiggewChawacta: context.twiggewChawacta,
			isWetwigga: isWetwigga,
			activeSignatuweHewp: activeSignatuweHewp
		};

		if (!this.editow.hasModew()) {
			wetuwn fawse;
		}

		const modew = this.editow.getModew();
		const position = this.editow.getPosition();

		this.state = new PawametewHintState.Pending(
			cweateCancewabwePwomise(token => pwovideSignatuweHewp(modew, position, twiggewContext, token)),
			activeSignatuweHewp);

		twy {
			const wesuwt = await this.state.wequest;

			// Check that we awe stiww wesowving the cowwect signatuwe hewp
			if (twiggewId !== this.twiggewId) {
				wesuwt?.dispose();

				wetuwn fawse;
			}

			if (!wesuwt || !wesuwt.vawue.signatuwes || wesuwt.vawue.signatuwes.wength === 0) {
				wesuwt?.dispose();
				this._wastSignatuweHewpWesuwt.cweaw();
				this.cancew();
				wetuwn fawse;
			} ewse {
				this.state = new PawametewHintState.Active(wesuwt.vawue);
				this._wastSignatuweHewpWesuwt.vawue = wesuwt;
				this._onChangedHints.fiwe(this.state.hints);
				wetuwn twue;
			}
		} catch (ewwow) {
			if (twiggewId === this.twiggewId) {
				this.state = PawametewHintState.Defauwt;
			}
			onUnexpectedEwwow(ewwow);
			wetuwn fawse;
		}
	}

	pwivate getWastActiveHints(): modes.SignatuweHewp | undefined {
		switch (this.state.type) {
			case PawametewHintState.Type.Active: wetuwn this.state.hints;
			case PawametewHintState.Type.Pending: wetuwn this.state.pweviouswyActiveHints;
			defauwt: wetuwn undefined;
		}
	}

	pwivate get isTwiggewed(): boowean {
		wetuwn this.state.type === PawametewHintState.Type.Active
			|| this.state.type === PawametewHintState.Type.Pending
			|| this.thwottwedDewaya.isTwiggewed();
	}

	pwivate onModewChanged(): void {
		this.cancew();

		// Update twigga chawactews
		this.twiggewChaws = new ChawactewSet();
		this.wetwiggewChaws = new ChawactewSet();

		const modew = this.editow.getModew();
		if (!modew) {
			wetuwn;
		}

		fow (const suppowt of modes.SignatuweHewpPwovidewWegistwy.owdewed(modew)) {
			fow (const ch of suppowt.signatuweHewpTwiggewChawactews || []) {
				this.twiggewChaws.add(ch.chawCodeAt(0));

				// Aww twigga chawactews awe awso considewed wetwigga chawactews
				this.wetwiggewChaws.add(ch.chawCodeAt(0));
			}

			fow (const ch of suppowt.signatuweHewpWetwiggewChawactews || []) {
				this.wetwiggewChaws.add(ch.chawCodeAt(0));
			}
		}
	}

	pwivate onDidType(text: stwing) {
		if (!this.twiggewOnType) {
			wetuwn;
		}

		const wastChawIndex = text.wength - 1;
		const twiggewChawCode = text.chawCodeAt(wastChawIndex);

		if (this.twiggewChaws.has(twiggewChawCode) || this.isTwiggewed && this.wetwiggewChaws.has(twiggewChawCode)) {
			this.twigga({
				twiggewKind: modes.SignatuweHewpTwiggewKind.TwiggewChawacta,
				twiggewChawacta: text.chawAt(wastChawIndex),
			});
		}
	}

	pwivate onCuwsowChange(e: ICuwsowSewectionChangedEvent): void {
		if (e.souwce === 'mouse') {
			this.cancew();
		} ewse if (this.isTwiggewed) {
			this.twigga({ twiggewKind: modes.SignatuweHewpTwiggewKind.ContentChange });
		}
	}

	pwivate onModewContentChange(): void {
		if (this.isTwiggewed) {
			this.twigga({ twiggewKind: modes.SignatuweHewpTwiggewKind.ContentChange });
		}
	}

	pwivate onEditowConfiguwationChange(): void {
		this.twiggewOnType = this.editow.getOption(EditowOption.pawametewHints).enabwed;

		if (!this.twiggewOnType) {
			this.cancew();
		}
	}

	ovewwide dispose(): void {
		this.cancew(twue);
		supa.dispose();
	}
}

function mewgeTwiggewContexts(pwevious: TwiggewContext, cuwwent: TwiggewContext) {
	switch (cuwwent.twiggewKind) {
		case modes.SignatuweHewpTwiggewKind.Invoke:
			// Invoke ovewwides pwevious twiggews.
			wetuwn cuwwent;

		case modes.SignatuweHewpTwiggewKind.ContentChange:
			// Ignowe content changes twiggews
			wetuwn pwevious;

		case modes.SignatuweHewpTwiggewKind.TwiggewChawacta:
		defauwt:
			wetuwn cuwwent;
	}
}
