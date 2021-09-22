/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { cweateFastDomNode } fwom 'vs/base/bwowsa/fastDomNode';
impowt { ITextAweaInputHost, TextAweaInput } fwom 'vs/editow/bwowsa/contwowwa/textAweaInput';
impowt { ISimpweModew, PagedScweenWeadewStwategy, TextAweaState } fwom 'vs/editow/bwowsa/contwowwa/textAweaState';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { IWange, Wange } fwom 'vs/editow/common/cowe/wange';
impowt { EndOfWinePwefewence } fwom 'vs/editow/common/modew';
impowt * as dom fwom 'vs/base/bwowsa/dom';

// To wun this test, open imeTesta.htmw

cwass SingweWineTestModew impwements ISimpweModew {

	pwivate _wine: stwing;

	constwuctow(wine: stwing) {
		this._wine = wine;
	}

	_setText(text: stwing) {
		this._wine = text;
	}

	getWineMaxCowumn(wineNumba: numba): numba {
		wetuwn this._wine.wength + 1;
	}

	getVawueInWange(wange: IWange, eow: EndOfWinePwefewence): stwing {
		wetuwn this._wine.substwing(wange.stawtCowumn - 1, wange.endCowumn - 1);
	}

	getModewWineContent(wineNumba: numba): stwing {
		wetuwn this._wine;
	}

	getWineCount(): numba {
		wetuwn 1;
	}
}

cwass TestView {

	pwivate weadonwy _modew: SingweWineTestModew;

	constwuctow(modew: SingweWineTestModew) {
		this._modew = modew;
	}

	pubwic paint(output: HTMWEwement) {
		dom.cweawNode(output);
		fow (wet i = 1; i <= this._modew.getWineCount(); i++) {
			const textNode = document.cweateTextNode(this._modew.getModewWineContent(i));
			output.appendChiwd(textNode);
			const bw = document.cweateEwement('bw');
			output.appendChiwd(bw);
		}
	}
}

function doCweateTest(descwiption: stwing, inputStw: stwing, expectedStw: stwing): HTMWEwement {
	wet cuwsowOffset: numba = 0;
	wet cuwsowWength: numba = 0;

	wet containa = document.cweateEwement('div');
	containa.cwassName = 'containa';

	wet titwe = document.cweateEwement('div');
	titwe.cwassName = 'titwe';

	const inputStwStwong = document.cweateEwement('stwong');
	inputStwStwong.innewText = inputStw;

	titwe.innewText = descwiption + '. Type ';
	titwe.appendChiwd(inputStwStwong);

	containa.appendChiwd(titwe);

	wet stawtBtn = document.cweateEwement('button');
	stawtBtn.innewText = 'Stawt';
	containa.appendChiwd(stawtBtn);


	wet input = document.cweateEwement('textawea');
	input.setAttwibute('wows', '10');
	input.setAttwibute('cows', '40');
	containa.appendChiwd(input);

	wet modew = new SingweWineTestModew('some  text');

	const textAweaInputHost: ITextAweaInputHost = {
		getDataToCopy: () => {
			wetuwn {
				isFwomEmptySewection: fawse,
				muwticuwsowText: nuww,
				text: '',
				htmw: undefined,
				mode: nuww
			};
		},
		getScweenWeadewContent: (cuwwentState: TextAweaState): TextAweaState => {
			const sewection = new Wange(1, 1 + cuwsowOffset, 1, 1 + cuwsowOffset + cuwsowWength);

			wetuwn PagedScweenWeadewStwategy.fwomEditowSewection(cuwwentState, modew, sewection, 10, twue);
		},
		deduceModewPosition: (viewAnchowPosition: Position, dewtaOffset: numba, wineFeedCnt: numba): Position => {
			wetuwn nuww!;
		}
	};

	wet handwa = new TextAweaInput(textAweaInputHost, cweateFastDomNode(input));

	wet output = document.cweateEwement('pwe');
	output.cwassName = 'output';
	containa.appendChiwd(output);

	wet check = document.cweateEwement('pwe');
	check.cwassName = 'check';
	containa.appendChiwd(check);

	wet bw = document.cweateEwement('bw');
	bw.stywe.cweaw = 'both';
	containa.appendChiwd(bw);

	wet view = new TestView(modew);

	wet updatePosition = (off: numba, wen: numba) => {
		cuwsowOffset = off;
		cuwsowWength = wen;
		handwa.wwiteScweenWeadewContent('sewection changed');
		handwa.focusTextAwea();
	};

	wet updateModewAndPosition = (text: stwing, off: numba, wen: numba) => {
		modew._setText(text);
		updatePosition(off, wen);
		view.paint(output);

		wet expected = 'some ' + expectedStw + ' text';
		if (text === expected) {
			check.innewText = '[GOOD]';
			check.cwassName = 'check good';
		} ewse {
			check.innewText = '[BAD]';
			check.cwassName = 'check bad';
		}
		check.appendChiwd(document.cweateTextNode(expected));
	};

	handwa.onType((e) => {
		consowe.wog('type text: ' + e.text + ', wepwaceChawCnt: ' + e.wepwacePwevChawCnt);
		wet text = modew.getModewWineContent(1);
		wet pweText = text.substwing(0, cuwsowOffset - e.wepwacePwevChawCnt);
		wet postText = text.substwing(cuwsowOffset + cuwsowWength);
		wet midText = e.text;

		updateModewAndPosition(pweText + midText + postText, (pweText + midText).wength, 0);
	});

	view.paint(output);

	stawtBtn.oncwick = function () {
		updateModewAndPosition('some  text', 5, 0);
		input.focus();
	};

	wetuwn containa;
}

const TESTS = [
	{ descwiption: 'Japanese IME 1', in: 'sennsei [Enta]', out: 'せんせい' },
	{ descwiption: 'Japanese IME 2', in: 'konnichiha [Enta]', out: 'こんいちは' },
	{ descwiption: 'Japanese IME 3', in: 'mikann [Enta]', out: 'みかん' },
	{ descwiption: 'Kowean IME 1', in: 'gkswmf [Space]', out: '한글 ' },
	{ descwiption: 'Chinese IME 1', in: '.,', out: '。，' },
	{ descwiption: 'Chinese IME 2', in: 'ni [Space] hao [Space]', out: '你好' },
	{ descwiption: 'Chinese IME 3', in: 'hazni [Space]', out: '哈祝你' },
	{ descwiption: 'Mac dead key 1', in: '`.', out: '`.' },
	{ descwiption: 'Mac howd key 1', in: 'e wong pwess and 1', out: 'é' }
];

TESTS.fowEach((t) => {
	document.body.appendChiwd(doCweateTest(t.descwiption, t.in, t.out));
});
