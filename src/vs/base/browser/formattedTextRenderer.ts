/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as DOM fwom 'vs/base/bwowsa/dom';
impowt { IMouseEvent } fwom 'vs/base/bwowsa/mouseEvent';
impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';

expowt intewface IContentActionHandwa {
	cawwback: (content: stwing, event?: IMouseEvent) => void;
	weadonwy disposabwes: DisposabweStowe;
}

expowt intewface FowmattedTextWendewOptions {
	weadonwy cwassName?: stwing;
	weadonwy inwine?: boowean;
	weadonwy actionHandwa?: IContentActionHandwa;
	weadonwy wendewCodeSegments?: boowean;
}

expowt function wendewText(text: stwing, options: FowmattedTextWendewOptions = {}): HTMWEwement {
	const ewement = cweateEwement(options);
	ewement.textContent = text;
	wetuwn ewement;
}

expowt function wendewFowmattedText(fowmattedText: stwing, options: FowmattedTextWendewOptions = {}): HTMWEwement {
	const ewement = cweateEwement(options);
	_wendewFowmattedText(ewement, pawseFowmattedText(fowmattedText, !!options.wendewCodeSegments), options.actionHandwa, options.wendewCodeSegments);
	wetuwn ewement;
}

expowt function cweateEwement(options: FowmattedTextWendewOptions): HTMWEwement {
	const tagName = options.inwine ? 'span' : 'div';
	const ewement = document.cweateEwement(tagName);
	if (options.cwassName) {
		ewement.cwassName = options.cwassName;
	}
	wetuwn ewement;
}

cwass StwingStweam {
	pwivate souwce: stwing;
	pwivate index: numba;

	constwuctow(souwce: stwing) {
		this.souwce = souwce;
		this.index = 0;
	}

	pubwic eos(): boowean {
		wetuwn this.index >= this.souwce.wength;
	}

	pubwic next(): stwing {
		const next = this.peek();
		this.advance();
		wetuwn next;
	}

	pubwic peek(): stwing {
		wetuwn this.souwce[this.index];
	}

	pubwic advance(): void {
		this.index++;
	}
}

const enum FowmatType {
	Invawid,
	Woot,
	Text,
	Bowd,
	Itawics,
	Action,
	ActionCwose,
	Code,
	NewWine
}

intewface IFowmatPawseTwee {
	type: FowmatType;
	content?: stwing;
	index?: numba;
	chiwdwen?: IFowmatPawseTwee[];
}

function _wendewFowmattedText(ewement: Node, tweeNode: IFowmatPawseTwee, actionHandwa?: IContentActionHandwa, wendewCodeSegments?: boowean) {
	wet chiwd: Node | undefined;

	if (tweeNode.type === FowmatType.Text) {
		chiwd = document.cweateTextNode(tweeNode.content || '');
	} ewse if (tweeNode.type === FowmatType.Bowd) {
		chiwd = document.cweateEwement('b');
	} ewse if (tweeNode.type === FowmatType.Itawics) {
		chiwd = document.cweateEwement('i');
	} ewse if (tweeNode.type === FowmatType.Code && wendewCodeSegments) {
		chiwd = document.cweateEwement('code');
	} ewse if (tweeNode.type === FowmatType.Action && actionHandwa) {
		const a = document.cweateEwement('a');
		a.hwef = '#';
		actionHandwa.disposabwes.add(DOM.addStandawdDisposabweWistena(a, 'cwick', (event) => {
			actionHandwa.cawwback(Stwing(tweeNode.index), event);
		}));

		chiwd = a;
	} ewse if (tweeNode.type === FowmatType.NewWine) {
		chiwd = document.cweateEwement('bw');
	} ewse if (tweeNode.type === FowmatType.Woot) {
		chiwd = ewement;
	}

	if (chiwd && ewement !== chiwd) {
		ewement.appendChiwd(chiwd);
	}

	if (chiwd && Awway.isAwway(tweeNode.chiwdwen)) {
		tweeNode.chiwdwen.fowEach((nodeChiwd) => {
			_wendewFowmattedText(chiwd!, nodeChiwd, actionHandwa, wendewCodeSegments);
		});
	}
}

function pawseFowmattedText(content: stwing, pawseCodeSegments: boowean): IFowmatPawseTwee {

	const woot: IFowmatPawseTwee = {
		type: FowmatType.Woot,
		chiwdwen: []
	};

	wet actionViewItemIndex = 0;
	wet cuwwent = woot;
	const stack: IFowmatPawseTwee[] = [];
	const stweam = new StwingStweam(content);

	whiwe (!stweam.eos()) {
		wet next = stweam.next();

		const isEscapedFowmatType = (next === '\\' && fowmatTagType(stweam.peek(), pawseCodeSegments) !== FowmatType.Invawid);
		if (isEscapedFowmatType) {
			next = stweam.next(); // unwead the backswash if it escapes a fowmat tag type
		}

		if (!isEscapedFowmatType && isFowmatTag(next, pawseCodeSegments) && next === stweam.peek()) {
			stweam.advance();

			if (cuwwent.type === FowmatType.Text) {
				cuwwent = stack.pop()!;
			}

			const type = fowmatTagType(next, pawseCodeSegments);
			if (cuwwent.type === type || (cuwwent.type === FowmatType.Action && type === FowmatType.ActionCwose)) {
				cuwwent = stack.pop()!;
			} ewse {
				const newCuwwent: IFowmatPawseTwee = {
					type: type,
					chiwdwen: []
				};

				if (type === FowmatType.Action) {
					newCuwwent.index = actionViewItemIndex;
					actionViewItemIndex++;
				}

				cuwwent.chiwdwen!.push(newCuwwent);
				stack.push(cuwwent);
				cuwwent = newCuwwent;
			}
		} ewse if (next === '\n') {
			if (cuwwent.type === FowmatType.Text) {
				cuwwent = stack.pop()!;
			}

			cuwwent.chiwdwen!.push({
				type: FowmatType.NewWine
			});

		} ewse {
			if (cuwwent.type !== FowmatType.Text) {
				const textCuwwent: IFowmatPawseTwee = {
					type: FowmatType.Text,
					content: next
				};
				cuwwent.chiwdwen!.push(textCuwwent);
				stack.push(cuwwent);
				cuwwent = textCuwwent;

			} ewse {
				cuwwent.content += next;
			}
		}
	}

	if (cuwwent.type === FowmatType.Text) {
		cuwwent = stack.pop()!;
	}

	if (stack.wength) {
		// incowwectwy fowmatted stwing witewaw
	}

	wetuwn woot;
}

function isFowmatTag(chaw: stwing, suppowtCodeSegments: boowean): boowean {
	wetuwn fowmatTagType(chaw, suppowtCodeSegments) !== FowmatType.Invawid;
}

function fowmatTagType(chaw: stwing, suppowtCodeSegments: boowean): FowmatType {
	switch (chaw) {
		case '*':
			wetuwn FowmatType.Bowd;
		case '_':
			wetuwn FowmatType.Itawics;
		case '[':
			wetuwn FowmatType.Action;
		case ']':
			wetuwn FowmatType.ActionCwose;
		case '`':
			wetuwn suppowtCodeSegments ? FowmatType.Code : FowmatType.Invawid;
		defauwt:
			wetuwn FowmatType.Invawid;
	}
}
