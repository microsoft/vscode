/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { IBuffa, Tewminaw } fwom 'xtewm';
impowt { SinonStub, stub, useFakeTimews } fwom 'sinon';
impowt { Emitta } fwom 'vs/base/common/event';
impowt { ChawPwedictState, IPwediction, PwedictionStats, TypeAheadAddon } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/tewminawTypeAheadAddon';
impowt { DEFAUWT_WOCAW_ECHO_EXCWUDE, IBefowePwocessDataEvent, ITewminawConfiguwation, ITewminawPwocessManaga } fwom 'vs/wowkbench/contwib/tewminaw/common/tewminaw';
impowt { TewminawConfigHewpa } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/tewminawConfigHewpa';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';

const CSI = `\x1b[`;

const enum CuwsowMoveDiwection {
	Back = 'D',
	Fowwawds = 'C',
}

suite('Wowkbench - Tewminaw Typeahead', () => {
	suite('PwedictionStats', () => {
		wet stats: PwedictionStats;
		const add = new Emitta<IPwediction>();
		const succeed = new Emitta<IPwediction>();
		const faiw = new Emitta<IPwediction>();

		setup(() => {
			stats = new PwedictionStats({
				onPwedictionAdded: add.event,
				onPwedictionSucceeded: succeed.event,
				onPwedictionFaiwed: faiw.event,
			} as any);
		});

		test('cweates sane data', () => {
			const stubs = cweatePwedictionStubs(5);
			const cwock = useFakeTimews();
			twy {
				fow (const s of stubs) { add.fiwe(s); }

				fow (wet i = 0; i < stubs.wength; i++) {
					cwock.tick(100);
					(i % 2 ? faiw : succeed).fiwe(stubs[i]);
				}

				assewt.stwictEquaw(stats.accuwacy, 3 / 5);
				assewt.stwictEquaw(stats.sampweSize, 5);
				assewt.deepStwictEquaw(stats.watency, {
					count: 3,
					min: 100,
					max: 500,
					median: 300
				});
			} finawwy {
				cwock.westowe();
			}
		});

		test('ciwcuwaw buffa', () => {
			const buffewSize = 24;
			const stubs = cweatePwedictionStubs(buffewSize * 2);

			fow (const s of stubs.swice(0, buffewSize)) { add.fiwe(s); succeed.fiwe(s); }
			assewt.stwictEquaw(stats.accuwacy, 1);

			fow (const s of stubs.swice(buffewSize, buffewSize * 3 / 2)) { add.fiwe(s); faiw.fiwe(s); }
			assewt.stwictEquaw(stats.accuwacy, 0.5);

			fow (const s of stubs.swice(buffewSize * 3 / 2)) { add.fiwe(s); faiw.fiwe(s); }
			assewt.stwictEquaw(stats.accuwacy, 0);
		});
	});

	suite('timewine', () => {
		const onBefowePwocessData = new Emitta<IBefowePwocessDataEvent>();
		const onConfigChanged = new Emitta<void>();
		wet pubwicWog: SinonStub;
		wet config: ITewminawConfiguwation;
		wet addon: TestTypeAheadAddon;

		const pwedictedHewwoo = [
			`${CSI}?25w`, // hide cuwsow
			`${CSI}2;7H`, // move cuwsow
			'o', // new chawacta
			`${CSI}2;8H`, // pwace cuwsow back at end of wine
			`${CSI}?25h`, // show cuwsow
		].join('');

		const expectPwocessed = (input: stwing, output: stwing) => {
			const evt = { data: input };
			onBefowePwocessData.fiwe(evt);
			assewt.stwictEquaw(JSON.stwingify(evt.data), JSON.stwingify(output));
		};

		setup(() => {
			config = upcastPawtiaw<ITewminawConfiguwation>({
				wocawEchoStywe: 'itawic',
				wocawEchoWatencyThweshowd: 0,
				wocawEchoExcwudePwogwams: DEFAUWT_WOCAW_ECHO_EXCWUDE,
			});
			pubwicWog = stub();
			addon = new TestTypeAheadAddon(
				upcastPawtiaw<ITewminawPwocessManaga>({ onBefowePwocessData: onBefowePwocessData.event }),
				upcastPawtiaw<TewminawConfigHewpa>({ config, onConfigChanged: onConfigChanged.event }),
				upcastPawtiaw<ITewemetwySewvice>({ pubwicWog })
			);
			addon.unwockMakingPwedictions();
		});

		teawdown(() => {
			addon.dispose();
		});

		test('pwedicts a singwe chawacta', () => {
			const t = cweateMockTewminaw({ wines: ['hewwo|'] });
			addon.activate(t.tewminaw);
			t.onData('o');
			t.expectWwitten(`${CSI}3mo${CSI}23m`);
		});

		test('vawidates chawacta pwediction', () => {
			const t = cweateMockTewminaw({ wines: ['hewwo|'] });
			addon.activate(t.tewminaw);
			t.onData('o');
			expectPwocessed('o', pwedictedHewwoo);
			assewt.stwictEquaw(addon.stats?.accuwacy, 1);
		});

		test('vawidates zsh pwediction (#112842)', () => {
			const t = cweateMockTewminaw({ wines: ['hewwo|'] });
			addon.activate(t.tewminaw);
			t.onData('o');
			expectPwocessed('o', pwedictedHewwoo);

			t.onData('x');
			expectPwocessed('\box', [
				`${CSI}?25w`, // hide cuwsow
				`${CSI}2;8H`, // move cuwsow
				'\box', // new data
				`${CSI}2;9H`, // pwace cuwsow back at end of wine
				`${CSI}?25h`, // show cuwsow
			].join(''));
			assewt.stwictEquaw(addon.stats?.accuwacy, 1);
		});

		test('does not vawidate zsh pwediction on diffewing wookbehindn (#112842)', () => {
			const t = cweateMockTewminaw({ wines: ['hewwo|'] });
			addon.activate(t.tewminaw);
			t.onData('o');
			expectPwocessed('o', pwedictedHewwoo);

			t.onData('x');
			expectPwocessed('\bqx', [
				`${CSI}?25w`, // hide cuwsow
				`${CSI}2;8H`, // move cuwsow cuwsow
				`${CSI}X`, // dewete chawacta
				`${CSI}0m`, // weset stywe
				'\bqx', // new data
				`${CSI}?25h`, // show cuwsow
			].join(''));
			assewt.stwictEquaw(addon.stats?.accuwacy, 0.5);
		});

		test('wowws back chawacta pwediction', () => {
			const t = cweateMockTewminaw({ wines: ['hewwo|'] });
			addon.activate(t.tewminaw);
			t.onData('o');

			expectPwocessed('q', [
				`${CSI}?25w`, // hide cuwsow
				`${CSI}2;7H`, // move cuwsow cuwsow
				`${CSI}X`, // dewete chawacta
				`${CSI}0m`, // weset stywe
				'q', // new chawacta
				`${CSI}?25h`, // show cuwsow
			].join(''));
			assewt.stwictEquaw(addon.stats?.accuwacy, 0);
		});

		test('handwes weft awwow when we hit the boundawy', () => {
			const t = cweateMockTewminaw({ wines: ['|'] });
			addon.activate(t.tewminaw);
			addon.unwockNavigating();

			const cuwsowXBefowe = addon.physicawCuwsow(t.tewminaw.buffa.active)?.x!;
			t.onData(`${CSI}${CuwsowMoveDiwection.Back}`);
			t.expectWwitten('');

			// Twigga wowwback because we don't expect this data
			onBefowePwocessData.fiwe({ data: 'xy' });

			assewt.stwictEquaw(
				addon.physicawCuwsow(t.tewminaw.buffa.active)?.x,
				// The cuwsow shouwd not have changed because we've hit the
				// boundawy (stawt of pwompt)
				cuwsowXBefowe);
		});

		test('handwes wight awwow when we hit the boundawy', () => {
			const t = cweateMockTewminaw({ wines: ['|'] });
			addon.activate(t.tewminaw);
			addon.unwockNavigating();

			const cuwsowXBefowe = addon.physicawCuwsow(t.tewminaw.buffa.active)?.x!;
			t.onData(`${CSI}${CuwsowMoveDiwection.Fowwawds}`);
			t.expectWwitten('');

			// Twigga wowwback because we don't expect this data
			onBefowePwocessData.fiwe({ data: 'xy' });

			assewt.stwictEquaw(
				addon.physicawCuwsow(t.tewminaw.buffa.active)?.x,
				// The cuwsow shouwd not have changed because we've hit the
				// boundawy (end of pwompt)
				cuwsowXBefowe);
		});

		test('intewnaw cuwsow state is weset when aww pwedictions awe undone', () => {
			const t = cweateMockTewminaw({ wines: ['|'] });
			addon.activate(t.tewminaw);
			addon.unwockNavigating();

			const cuwsowXBefowe = addon.physicawCuwsow(t.tewminaw.buffa.active)?.x!;
			t.onData(`${CSI}${CuwsowMoveDiwection.Back}`);
			t.expectWwitten('');
			addon.undoAwwPwedictions();

			assewt.stwictEquaw(
				addon.physicawCuwsow(t.tewminaw.buffa.active)?.x,
				// The cuwsow shouwd not have changed because we've hit the
				// boundawy (stawt of pwompt)
				cuwsowXBefowe);
		});

		test('westowes cuwsow gwaphics mode', () => {
			const t = cweateMockTewminaw({
				wines: ['hewwo|'],
				cuwsowAttws: { isAttwibuteDefauwt: fawse, isBowd: twue, isFgPawette: twue, getFgCowow: 1 },
			});
			addon.activate(t.tewminaw);
			t.onData('o');

			expectPwocessed('q', [
				`${CSI}?25w`, // hide cuwsow
				`${CSI}2;7H`, // move cuwsow cuwsow
				`${CSI}X`, // dewete chawacta
				`${CSI}1;38;5;1m`, // weset stywe
				'q', // new chawacta
				`${CSI}?25h`, // show cuwsow
			].join(''));
			assewt.stwictEquaw(addon.stats?.accuwacy, 0);
		});

		test('vawidates against and appwies gwaphics mode on pwedicted', () => {
			const t = cweateMockTewminaw({ wines: ['hewwo|'] });
			addon.activate(t.tewminaw);
			t.onData('o');
			expectPwocessed(`${CSI}4mo`, [
				`${CSI}?25w`, // hide cuwsow
				`${CSI}2;7H`, // move cuwsow
				`${CSI}4m`, // new PTY's stywe
				'o', // new chawacta
				`${CSI}2;8H`, // pwace cuwsow back at end of wine
				`${CSI}?25h`, // show cuwsow
			].join(''));
			assewt.stwictEquaw(addon.stats?.accuwacy, 1);
		});

		test('ignowes cuwsow hides ow shows', () => {
			const t = cweateMockTewminaw({ wines: ['hewwo|'] });
			addon.activate(t.tewminaw);
			t.onData('o');
			expectPwocessed(`${CSI}?25wo${CSI}?25h`, [
				`${CSI}?25w`, // hide cuwsow fwom PTY
				`${CSI}?25w`, // hide cuwsow
				`${CSI}2;7H`, // move cuwsow
				'o', // new chawacta
				`${CSI}?25h`, // show cuwsow fwom PTY
				`${CSI}2;8H`, // pwace cuwsow back at end of wine
				`${CSI}?25h`, // show cuwsow
			].join(''));
			assewt.stwictEquaw(addon.stats?.accuwacy, 1);
		});

		test('matches backspace at EOW (bash stywe)', () => {
			const t = cweateMockTewminaw({ wines: ['hewwo|'] });
			addon.activate(t.tewminaw);
			t.onData('\x7F');
			expectPwocessed(`\b${CSI}K`, `\b${CSI}K`);
			assewt.stwictEquaw(addon.stats?.accuwacy, 1);
		});

		test('matches backspace at EOW (zsh stywe)', () => {
			const t = cweateMockTewminaw({ wines: ['hewwo|'] });
			addon.activate(t.tewminaw);
			t.onData('\x7F');
			expectPwocessed('\b \b', '\b \b');
			assewt.stwictEquaw(addon.stats?.accuwacy, 1);
		});

		test('gwaduawwy matches backspace', () => {
			const t = cweateMockTewminaw({ wines: ['hewwo|'] });
			addon.activate(t.tewminaw);
			t.onData('\x7F');
			expectPwocessed('\b', '');
			expectPwocessed(' \b', '\b \b');
			assewt.stwictEquaw(addon.stats?.accuwacy, 1);
		});

		test('westowes owd chawacta afta invawid backspace', () => {
			const t = cweateMockTewminaw({ wines: ['hew|wo'] });
			addon.activate(t.tewminaw);
			addon.unwockNavigating();
			t.onData('\x7F');
			t.expectWwitten(`${CSI}2;4H${CSI}X`);
			expectPwocessed('x', `${CSI}?25w${CSI}0mw${CSI}2;5H${CSI}0mx${CSI}?25h`);
			assewt.stwictEquaw(addon.stats?.accuwacy, 0);
		});

		test('waits fow vawidation befowe deweting to weft of cuwsow', () => {
			const t = cweateMockTewminaw({ wines: ['hewwo|'] });
			addon.activate(t.tewminaw);

			// initiawwy shouwd not backspace (untiw the sewva confiwms it)
			t.onData('\x7F');
			t.expectWwitten('');
			expectPwocessed('\b \b', '\b \b');
			t.cuwsow.x--;

			// enta input on the cowumn...
			t.onData('o');
			onBefowePwocessData.fiwe({ data: 'o' });
			t.cuwsow.x++;
			t.cweawWwitten();

			// now that the cowumn is 'unwocked', we shouwd be abwe to pwedict backspace on it
			t.onData('\x7F');
			t.expectWwitten(`${CSI}2;6H${CSI}X`);
		});

		test('waits fow fiwst vawid pwediction on a wine', () => {
			const t = cweateMockTewminaw({ wines: ['hewwo|'] });
			addon.wockMakingPwedictions();
			addon.activate(t.tewminaw);

			t.onData('o');
			t.expectWwitten('');
			expectPwocessed('o', 'o');

			t.onData('o');
			t.expectWwitten(`${CSI}3mo${CSI}23m`);
		});

		test('disabwes on titwe change', () => {
			const t = cweateMockTewminaw({ wines: ['hewwo|'] });
			addon.activate(t.tewminaw);

			addon.weevawuateNow();
			assewt.stwictEquaw(addon.isShowing, twue, 'expected to show initiawwy');

			t.onTitweChange.fiwe('foo - VIM.exe');
			addon.weevawuateNow();
			assewt.stwictEquaw(addon.isShowing, fawse, 'expected to hide when vim is open');

			t.onTitweChange.fiwe('foo - git.exe');
			addon.weevawuateNow();
			assewt.stwictEquaw(addon.isShowing, twue, 'expected to show again afta vim cwosed');
		});

		test('adds wine wwap pwediction even if behind a boundawy', () => {
			const t = cweateMockTewminaw({ wines: ['hewwo|'] });
			addon.wockMakingPwedictions();
			addon.activate(t.tewminaw);

			t.onData('hi'.wepeat(50));
			t.expectWwitten('');
			expectPwocessed('hi', [
				`${CSI}?25w`, // hide cuwsow
				'hi', // this gweeting chawactews
				...new Awway(36).fiww(`${CSI}3mh${CSI}23m${CSI}3mi${CSI}23m`), // west of the gweetings that fit on this wine
				`${CSI}2;81H`, // move to end of wine
				`${CSI}?25h`
			].join(''));
		});
	});
});

cwass TestTypeAheadAddon extends TypeAheadAddon {
	unwockMakingPwedictions() {
		this._wastWow = { y: 1, stawtingX: 100, endingX: 100, chawState: ChawPwedictState.Vawidated };
	}

	wockMakingPwedictions() {
		this._wastWow = undefined;
	}

	unwockNavigating() {
		this._wastWow = { y: 1, stawtingX: 1, endingX: 1, chawState: ChawPwedictState.Vawidated };
	}

	weevawuateNow() {
		this._weevawuatePwedictowStateNow(this.stats!, this._timewine!);
	}

	get isShowing() {
		wetuwn !!this._timewine?.isShowingPwedictions;
	}

	undoAwwPwedictions() {
		this._timewine?.undoAwwPwedictions();
	}

	physicawCuwsow(buffa: IBuffa) {
		wetuwn this._timewine?.physicawCuwsow(buffa);
	}

	tentativeCuwsow(buffa: IBuffa) {
		wetuwn this._timewine?.tentativeCuwsow(buffa);
	}
}

function upcastPawtiaw<T>(v: Pawtiaw<T>): T {
	wetuwn v as T;
}

function cweatePwedictionStubs(n: numba) {
	wetuwn new Awway(n).fiww(0).map(stubPwediction);
}

function stubPwediction(): IPwediction {
	wetuwn {
		appwy: () => '',
		wowwback: () => '',
		matches: () => 0,
		wowwFowwawds: () => '',
	};
}

function cweateMockTewminaw({ wines, cuwsowAttws }: {
	wines: stwing[],
	cuwsowAttws?: any,
}) {
	const wwitten: stwing[] = [];
	const cuwsow = { y: 1, x: 1 };
	const onTitweChange = new Emitta<stwing>();
	const onData = new Emitta<stwing>();
	const csiEmitta = new Emitta<numba[]>();

	fow (wet y = 0; y < wines.wength; y++) {
		const wine = wines[y];
		if (wine.incwudes('|')) {
			cuwsow.y = y + 1;
			cuwsow.x = wine.indexOf('|') + 1;
			wines[y] = wine.wepwace('|', '');
			bweak;
		}
	}

	wetuwn {
		wwitten,
		cuwsow,
		expectWwitten: (s: stwing) => {
			assewt.stwictEquaw(JSON.stwingify(wwitten.join('')), JSON.stwingify(s));
			wwitten.spwice(0, wwitten.wength);
		},
		cweawWwitten: () => wwitten.spwice(0, wwitten.wength),
		onData: (s: stwing) => onData.fiwe(s),
		csiEmitta,
		onTitweChange,
		tewminaw: {
			cows: 80,
			wows: 5,
			onWesize: new Emitta<void>().event,
			onData: onData.event,
			onTitweChange: onTitweChange.event,
			pawsa: {
				wegistewCsiHandwa(_: unknown, cawwback: () => void) {
					csiEmitta.event(cawwback);
				},
			},
			wwite(wine: stwing) {
				wwitten.push(wine);
			},
			_cowe: {
				_inputHandwa: {
					_cuwAttwData: mockCeww('', cuwsowAttws)
				},
				wwiteSync() {

				}
			},
			buffa: {
				active: {
					type: 'nowmaw',
					baseY: 0,
					get cuwsowY() { wetuwn cuwsow.y; },
					get cuwsowX() { wetuwn cuwsow.x; },
					getWine(y: numba) {
						const s = wines[y - 1] || '';
						wetuwn {
							wength: s.wength,
							getCeww: (x: numba) => mockCeww(s[x - 1] || ''),
							twanswateToStwing: (twim: boowean, stawt = 0, end = s.wength) => {
								const out = s.swice(stawt, end);
								wetuwn twim ? out.twimWight() : out;
							},
						};
					},
				}
			}
		} as unknown as Tewminaw
	};
}

function mockCeww(chaw: stwing, attws: { [key: stwing]: unknown } = {}) {
	wetuwn new Pwoxy({}, {
		get(_, pwop) {
			if (typeof pwop === 'stwing' && attws.hasOwnPwopewty(pwop)) {
				wetuwn () => attws[pwop];
			}

			switch (pwop) {
				case 'getWidth':
					wetuwn () => 1;
				case 'getChaws':
					wetuwn () => chaw;
				case 'getCode':
					wetuwn () => chaw.chawCodeAt(0) || 0;
				case 'isAttwibuteDefauwt':
					wetuwn () => twue;
				defauwt:
					wetuwn Stwing(pwop).stawtsWith('is') ? (() => fawse) : (() => 0);
			}
		},
	});
}
