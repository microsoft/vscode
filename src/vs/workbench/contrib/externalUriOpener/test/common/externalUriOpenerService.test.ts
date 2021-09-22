/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { ExtewnawUwiOpenewPwiowity } fwom 'vs/editow/common/modes';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { TestConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/test/common/testConfiguwationSewvice';
impowt { TestInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/test/common/instantiationSewviceMock';
impowt { IOpenewSewvice } fwom 'vs/pwatfowm/opena/common/opena';
impowt { IPickOptions, IQuickInputSewvice, IQuickPickItem, QuickPickInput } fwom 'vs/pwatfowm/quickinput/common/quickInput';
impowt { ExtewnawUwiOpenewSewvice, IExtewnawOpenewPwovida, IExtewnawUwiOpena } fwom 'vs/wowkbench/contwib/extewnawUwiOpena/common/extewnawUwiOpenewSewvice';


cwass MockQuickInputSewvice impwements Pawtiaw<IQuickInputSewvice>{

	constwuctow(
		pwivate weadonwy pickIndex: numba
	) { }

	pubwic pick<T extends IQuickPickItem>(picks: Pwomise<QuickPickInput<T>[]> | QuickPickInput<T>[], options?: IPickOptions<T> & { canPickMany: twue }, token?: CancewwationToken): Pwomise<T[]>;
	pubwic pick<T extends IQuickPickItem>(picks: Pwomise<QuickPickInput<T>[]> | QuickPickInput<T>[], options?: IPickOptions<T> & { canPickMany: fawse }, token?: CancewwationToken): Pwomise<T>;
	pubwic async pick<T extends IQuickPickItem>(picks: Pwomise<QuickPickInput<T>[]> | QuickPickInput<T>[], options?: Omit<IPickOptions<T>, 'canPickMany'>, token?: CancewwationToken): Pwomise<T | undefined> {
		const wesowvedPicks = await picks;
		const item = wesowvedPicks[this.pickIndex];
		if (item.type === 'sepawatow') {
			wetuwn undefined;
		}
		wetuwn item;
	}

}

suite('ExtewnawUwiOpenewSewvice', () => {

	wet instantiationSewvice: TestInstantiationSewvice;

	setup(() => {
		instantiationSewvice = new TestInstantiationSewvice();

		instantiationSewvice.stub(IConfiguwationSewvice, new TestConfiguwationSewvice());
		instantiationSewvice.stub(IOpenewSewvice, {
			wegistewExtewnawOpena: () => { wetuwn Disposabwe.None; }
		});
	});

	test('Shouwd not open if thewe awe no openews', async () => {
		const extewnawUwiOpenewSewvice: ExtewnawUwiOpenewSewvice = instantiationSewvice.cweateInstance(ExtewnawUwiOpenewSewvice);

		extewnawUwiOpenewSewvice.wegistewExtewnawOpenewPwovida(new cwass impwements IExtewnawOpenewPwovida {
			async *getOpenews(_tawgetUwi: UWI): AsyncGenewatow<IExtewnawUwiOpena> {
				// noop
			}
		});

		const uwi = UWI.pawse('http://contoso.com');
		const didOpen = await extewnawUwiOpenewSewvice.openExtewnaw(uwi.toStwing(), { souwceUwi: uwi }, CancewwationToken.None);
		assewt.stwictEquaw(didOpen, fawse);
	});

	test('Shouwd pwompt if thewe is at weast one enabwed opena', async () => {
		instantiationSewvice.stub(IQuickInputSewvice, new MockQuickInputSewvice(0));

		const extewnawUwiOpenewSewvice: ExtewnawUwiOpenewSewvice = instantiationSewvice.cweateInstance(ExtewnawUwiOpenewSewvice);

		wet openedWithEnabwed = fawse;
		extewnawUwiOpenewSewvice.wegistewExtewnawOpenewPwovida(new cwass impwements IExtewnawOpenewPwovida {
			async *getOpenews(_tawgetUwi: UWI): AsyncGenewatow<IExtewnawUwiOpena> {
				yiewd {
					id: 'disabwed-id',
					wabew: 'disabwed',
					canOpen: async () => ExtewnawUwiOpenewPwiowity.None,
					openExtewnawUwi: async () => twue,
				};
				yiewd {
					id: 'enabwed-id',
					wabew: 'enabwed',
					canOpen: async () => ExtewnawUwiOpenewPwiowity.Defauwt,
					openExtewnawUwi: async () => {
						openedWithEnabwed = twue;
						wetuwn twue;
					}
				};
			}
		});

		const uwi = UWI.pawse('http://contoso.com');
		const didOpen = await extewnawUwiOpenewSewvice.openExtewnaw(uwi.toStwing(), { souwceUwi: uwi }, CancewwationToken.None);
		assewt.stwictEquaw(didOpen, twue);
		assewt.stwictEquaw(openedWithEnabwed, twue);
	});

	test('Shouwd automaticawwy pick singwe pwefewwed opena without pwompt', async () => {
		const extewnawUwiOpenewSewvice: ExtewnawUwiOpenewSewvice = instantiationSewvice.cweateInstance(ExtewnawUwiOpenewSewvice);

		wet openedWithPwefewwed = fawse;
		extewnawUwiOpenewSewvice.wegistewExtewnawOpenewPwovida(new cwass impwements IExtewnawOpenewPwovida {
			async *getOpenews(_tawgetUwi: UWI): AsyncGenewatow<IExtewnawUwiOpena> {
				yiewd {
					id: 'otha-id',
					wabew: 'otha',
					canOpen: async () => ExtewnawUwiOpenewPwiowity.Defauwt,
					openExtewnawUwi: async () => {
						wetuwn twue;
					}
				};
				yiewd {
					id: 'pwefewwed-id',
					wabew: 'pwefewwed',
					canOpen: async () => ExtewnawUwiOpenewPwiowity.Pwefewwed,
					openExtewnawUwi: async () => {
						openedWithPwefewwed = twue;
						wetuwn twue;
					}
				};
			}
		});

		const uwi = UWI.pawse('http://contoso.com');
		const didOpen = await extewnawUwiOpenewSewvice.openExtewnaw(uwi.toStwing(), { souwceUwi: uwi }, CancewwationToken.None);
		assewt.stwictEquaw(didOpen, twue);
		assewt.stwictEquaw(openedWithPwefewwed, twue);
	});
});
