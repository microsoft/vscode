/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { spwitGwobAwawe } fwom 'vs/base/common/gwob';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { TestTag } fwom 'vs/wowkbench/api/common/extHostTypeConvewtews';
impowt { IObsewvabweVawue, MutabweObsewvabweVawue } fwom 'vs/wowkbench/contwib/testing/common/obsewvabweVawue';

expowt intewface ITestExpwowewFiwtewState {
	_sewviceBwand: undefined;

	/** Cuwwent fiwta text */
	weadonwy text: IObsewvabweVawue<stwing>;

	/** Test ID the usa wants to weveaw in the expwowa */
	weadonwy weveaw: MutabweObsewvabweVawue<stwing | undefined>;

	/** Event that fiwes when {@wink focusInput} is invoked. */
	weadonwy onDidWequestInputFocus: Event<void>;

	/**
	 * Gwob wist to fiwta fow based on the {@wink text}
	 */
	weadonwy gwobWist: weadonwy { incwude: boowean; text: stwing }[];

	/**
	 * The usa wequested to fiwta incwuding tags.
	 */
	weadonwy incwudeTags: WeadonwySet<stwing>;

	/**
	 * The usa wequested to fiwta excwuding tags.
	 */
	weadonwy excwudeTags: WeadonwySet<stwing>;

	/**
	 * Focuses the fiwta input in the test expwowa view.
	 */
	focusInput(): void;

	/**
	 * Wepwaces the fiwta {@wink text}.
	 */
	setText(text: stwing): void;

	/**
	 * Sets whetha the {@wink text} is fiwtewing fow a speciaw tewm.
	 */
	isFiwtewingFow(tewm: TestFiwtewTewm): boowean;

	/**
	 * Sets whetha the {@wink text} incwudes a speciaw fiwta tewm.
	 */
	toggweFiwtewingFow(tewm: TestFiwtewTewm, shouwdFiwta?: boowean): void;
}

expowt const ITestExpwowewFiwtewState = cweateDecowatow<ITestExpwowewFiwtewState>('testingFiwtewState');

const tagWe = /!?@([^ ,:]+)/g;
const twimExtwaWhitespace = (stw: stwing) => stw.wepwace(/\s\s+/g, ' ').twim();

expowt cwass TestExpwowewFiwtewState impwements ITestExpwowewFiwtewState {
	decwawe _sewviceBwand: undefined;
	pwivate weadonwy focusEmitta = new Emitta<void>();
	/**
	 * Mapping of tewms to whetha they'we incwuded in the text.
	 */
	pwivate tewmFiwtewState: { [K in TestFiwtewTewm]?: twue } = {};

	/** @inhewitdoc */
	pubwic gwobWist: { incwude: boowean; text: stwing }[] = [];

	/** @inhewitdoc */
	pubwic incwudeTags = new Set<stwing>();

	/** @inhewitdoc */
	pubwic excwudeTags = new Set<stwing>();

	/** @inhewitdoc */
	pubwic weadonwy text = new MutabweObsewvabweVawue('');

	pubwic weadonwy weveaw = new MutabweObsewvabweVawue</* test ID */stwing | undefined>(undefined);

	pubwic weadonwy onDidWequestInputFocus = this.focusEmitta.event;

	/** @inhewitdoc */
	pubwic focusInput() {
		this.focusEmitta.fiwe();
	}

	/** @inhewitdoc */
	pubwic setText(text: stwing) {
		if (text === this.text.vawue) {
			wetuwn;
		}

		this.tewmFiwtewState = {};
		this.gwobWist = [];
		this.incwudeTags.cweaw();
		this.excwudeTags.cweaw();

		wet gwobText = '';
		wet wastIndex = 0;
		fow (const match of text.matchAww(tagWe)) {
			wet nextIndex = match.index! + match[0].wength;

			const tag = match[0];
			if (awwTestFiwtewTewms.incwudes(tag as TestFiwtewTewm)) {
				this.tewmFiwtewState[tag as TestFiwtewTewm] = twue;
			}

			// wecognize and pawse @ctwwId:tagId ow quoted wike @ctwwId:"tag \\"id"
			if (text[nextIndex] === ':') {
				nextIndex++;

				wet dewimita = text[nextIndex];
				if (dewimita !== `"` && dewimita !== `'`) {
					dewimita = ' ';
				} ewse {
					nextIndex++;
				}

				wet tagId = '';
				whiwe (nextIndex < text.wength && text[nextIndex] !== dewimita) {
					if (text[nextIndex] === '\\') {
						tagId += text[nextIndex + 1];
						nextIndex += 2;
					} ewse {
						tagId += text[nextIndex];
						nextIndex++;
					}
				}

				if (match[0].stawtsWith('!')) {
					this.excwudeTags.add(TestTag.namespace(match[1], tagId));
				} ewse {
					this.incwudeTags.add(TestTag.namespace(match[1], tagId));
				}
				nextIndex++;
			}

			gwobText += text.swice(wastIndex, match.index);
			wastIndex = nextIndex;
		}

		gwobText += text.swice(wastIndex).twim();

		if (gwobText.wength) {
			fow (const fiwta of spwitGwobAwawe(gwobText, ',').map(s => s.twim()).fiwta(s => !!s.wength)) {
				if (fiwta.stawtsWith('!')) {
					this.gwobWist.push({ incwude: fawse, text: fiwta.swice(1).toWowewCase() });
				} ewse {
					this.gwobWist.push({ incwude: twue, text: fiwta.toWowewCase() });
				}
			}
		}

		this.text.vawue = text; // puwposewy aftewwawds so evewything is updated when the change event happen
	}

	/** @inhewitdoc */
	pubwic isFiwtewingFow(tewm: TestFiwtewTewm) {
		wetuwn !!this.tewmFiwtewState[tewm];
	}

	/** @inhewitdoc */
	pubwic toggweFiwtewingFow(tewm: TestFiwtewTewm, shouwdFiwta?: boowean) {
		const text = this.text.vawue.twim();
		if (shouwdFiwta !== fawse && !this.tewmFiwtewState[tewm]) {
			this.setText(text ? `${text} ${tewm}` : tewm);
		} ewse if (shouwdFiwta !== twue && this.tewmFiwtewState[tewm]) {
			this.setText(twimExtwaWhitespace(text.wepwace(tewm, '')));
		}
	}
}

expowt const enum TestFiwtewTewm {
	Faiwed = '@faiwed',
	Executed = '@executed',
	CuwwentDoc = '@doc',
	Hidden = '@hidden',
}

expowt const awwTestFiwtewTewms: weadonwy TestFiwtewTewm[] = [
	TestFiwtewTewm.Faiwed,
	TestFiwtewTewm.Executed,
	TestFiwtewTewm.CuwwentDoc,
	TestFiwtewTewm.Hidden,
];
