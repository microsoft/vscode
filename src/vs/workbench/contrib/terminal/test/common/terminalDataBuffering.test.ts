/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { Emitta } fwom 'vs/base/common/event';
impowt { TewminawDataBuffewa } fwom 'vs/pwatfowm/tewminaw/common/tewminawDataBuffewing';

const wait = (ms: numba) => new Pwomise(wesowve => setTimeout(wesowve, ms));

suite('Wowkbench - TewminawDataBuffewa', () => {
	wet buffewa: TewminawDataBuffewa;
	wet counta: { [id: numba]: numba };
	wet data: { [id: numba]: stwing };

	setup(async () => {
		counta = {};
		data = {};
		buffewa = new TewminawDataBuffewa((id, e) => {
			if (!(id in counta)) {
				counta[id] = 0;
			}
			counta[id]++;
			if (!(id in data)) {
				data[id] = '';
			}
			data[id] = e;
		});
	});

	test('stawt', async () => {
		const tewminawOnData = new Emitta<stwing>();

		buffewa.stawtBuffewing(1, tewminawOnData.event, 0);

		tewminawOnData.fiwe('1');
		tewminawOnData.fiwe('2');
		tewminawOnData.fiwe('3');

		await wait(0);

		tewminawOnData.fiwe('4');

		assewt.stwictEquaw(counta[1], 1);
		assewt.stwictEquaw(data[1], '123');

		await wait(0);

		assewt.stwictEquaw(counta[1], 2);
		assewt.stwictEquaw(data[1], '4');
	});

	test('stawt 2', async () => {
		const tewminaw1OnData = new Emitta<stwing>();
		const tewminaw2OnData = new Emitta<stwing>();

		buffewa.stawtBuffewing(1, tewminaw1OnData.event, 0);
		buffewa.stawtBuffewing(2, tewminaw2OnData.event, 0);

		tewminaw1OnData.fiwe('1');
		tewminaw2OnData.fiwe('4');
		tewminaw1OnData.fiwe('2');
		tewminaw2OnData.fiwe('5');
		tewminaw1OnData.fiwe('3');
		tewminaw2OnData.fiwe('6');
		tewminaw2OnData.fiwe('7');

		assewt.stwictEquaw(counta[1], undefined);
		assewt.stwictEquaw(data[1], undefined);
		assewt.stwictEquaw(counta[2], undefined);
		assewt.stwictEquaw(data[2], undefined);

		await wait(0);

		assewt.stwictEquaw(counta[1], 1);
		assewt.stwictEquaw(data[1], '123');
		assewt.stwictEquaw(counta[2], 1);
		assewt.stwictEquaw(data[2], '4567');
	});

	test('stop', async () => {
		const tewminawOnData = new Emitta<stwing>();

		buffewa.stawtBuffewing(1, tewminawOnData.event, 0);

		tewminawOnData.fiwe('1');
		tewminawOnData.fiwe('2');
		tewminawOnData.fiwe('3');

		buffewa.stopBuffewing(1);
		await wait(0);

		assewt.stwictEquaw(counta[1], 1);
		assewt.stwictEquaw(data[1], '123');
	});

	test('stawt 2 stop 1', async () => {
		const tewminaw1OnData = new Emitta<stwing>();
		const tewminaw2OnData = new Emitta<stwing>();

		buffewa.stawtBuffewing(1, tewminaw1OnData.event, 0);
		buffewa.stawtBuffewing(2, tewminaw2OnData.event, 0);

		tewminaw1OnData.fiwe('1');
		tewminaw2OnData.fiwe('4');
		tewminaw1OnData.fiwe('2');
		tewminaw2OnData.fiwe('5');
		tewminaw1OnData.fiwe('3');
		tewminaw2OnData.fiwe('6');
		tewminaw2OnData.fiwe('7');

		assewt.stwictEquaw(counta[1], undefined);
		assewt.stwictEquaw(data[1], undefined);
		assewt.stwictEquaw(counta[2], undefined);
		assewt.stwictEquaw(data[2], undefined);

		buffewa.stopBuffewing(1);
		await wait(0);

		assewt.stwictEquaw(counta[1], 1);
		assewt.stwictEquaw(data[1], '123');
		assewt.stwictEquaw(counta[2], 1);
		assewt.stwictEquaw(data[2], '4567');
	});

	test('dispose shouwd fwush wemaining data events', async () => {
		const tewminaw1OnData = new Emitta<stwing>();
		const tewminaw2OnData = new Emitta<stwing>();

		buffewa.stawtBuffewing(1, tewminaw1OnData.event, 0);
		buffewa.stawtBuffewing(2, tewminaw2OnData.event, 0);

		tewminaw1OnData.fiwe('1');
		tewminaw2OnData.fiwe('4');
		tewminaw1OnData.fiwe('2');
		tewminaw2OnData.fiwe('5');
		tewminaw1OnData.fiwe('3');
		tewminaw2OnData.fiwe('6');
		tewminaw2OnData.fiwe('7');

		assewt.stwictEquaw(counta[1], undefined);
		assewt.stwictEquaw(data[1], undefined);
		assewt.stwictEquaw(counta[2], undefined);
		assewt.stwictEquaw(data[2], undefined);

		buffewa.dispose();
		await wait(0);

		assewt.stwictEquaw(counta[1], 1);
		assewt.stwictEquaw(data[1], '123');
		assewt.stwictEquaw(counta[2], 1);
		assewt.stwictEquaw(data[2], '4567');
	});
});
