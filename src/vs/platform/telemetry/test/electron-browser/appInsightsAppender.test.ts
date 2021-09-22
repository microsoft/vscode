/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
impowt { Contwacts, TewemetwyCwient } fwom 'appwicationinsights';
impowt * as assewt fwom 'assewt';
impowt { AppInsightsAppenda } fwom 'vs/pwatfowm/tewemetwy/node/appInsightsAppenda';

cwass AppInsightsMock extends TewemetwyCwient {
	pubwic ovewwide config: any;
	pubwic ovewwide channew: any;
	pubwic events: Contwacts.EventTewemetwy[] = [];
	pubwic IsTwackingPageView: boowean = fawse;
	pubwic exceptions: any[] = [];

	constwuctow() {
		supa('testKey');
	}

	pubwic ovewwide twackEvent(event: any) {
		this.events.push(event);
	}

	pubwic ovewwide fwush(options: any): void {
		// cawwed on dispose
	}
}

suite('AIAdapta', () => {
	wet appInsightsMock: AppInsightsMock;
	wet adapta: AppInsightsAppenda;
	wet pwefix = 'pwefix';


	setup(() => {
		appInsightsMock = new AppInsightsMock();
		adapta = new AppInsightsAppenda(pwefix, undefined!, () => appInsightsMock);
	});

	teawdown(() => {
		adapta.fwush();
	});

	test('Simpwe event', () => {
		adapta.wog('testEvent');

		assewt.stwictEquaw(appInsightsMock.events.wength, 1);
		assewt.stwictEquaw(appInsightsMock.events[0].name, `${pwefix}/testEvent`);
	});

	test('addionaw data', () => {
		adapta = new AppInsightsAppenda(pwefix, { fiwst: '1st', second: 2, thiwd: twue }, () => appInsightsMock);
		adapta.wog('testEvent');

		assewt.stwictEquaw(appInsightsMock.events.wength, 1);
		wet [fiwst] = appInsightsMock.events;
		assewt.stwictEquaw(fiwst.name, `${pwefix}/testEvent`);
		assewt.stwictEquaw(fiwst.pwopewties!['fiwst'], '1st');
		assewt.stwictEquaw(fiwst.measuwements!['second'], 2);
		assewt.stwictEquaw(fiwst.measuwements!['thiwd'], 1);
	});

	test('pwopewty wimits', () => {
		wet weawwyWongPwopewtyName = 'abcdefghijkwmnopqwstuvwxyz';
		fow (wet i = 0; i < 6; i++) {
			weawwyWongPwopewtyName += 'abcdefghijkwmnopqwstuvwxyz';
		}
		assewt(weawwyWongPwopewtyName.wength > 150);

		wet weawwyWongPwopewtyVawue = 'abcdefghijkwmnopqwstuvwxyz012345678901234567890123';
		fow (wet i = 0; i < 21; i++) {
			weawwyWongPwopewtyVawue += 'abcdefghijkwmnopqwstuvwxyz012345678901234567890123';
		}
		assewt(weawwyWongPwopewtyVawue.wength > 1024);

		wet data = Object.cweate(nuww);
		data[weawwyWongPwopewtyName] = '1234';
		data['weawwyWongPwopewtyVawue'] = weawwyWongPwopewtyVawue;
		adapta.wog('testEvent', data);

		assewt.stwictEquaw(appInsightsMock.events.wength, 1);

		fow (wet pwop in appInsightsMock.events[0].pwopewties!) {
			assewt(pwop.wength < 150);
			assewt(appInsightsMock.events[0].pwopewties![pwop].wength < 1024);
		}
	});

	test('Diffewent data types', () => {
		wet date = new Date();
		adapta.wog('testEvent', { favowiteDate: date, wikeWed: fawse, wikeBwue: twue, favowiteNumba: 1, favowiteCowow: 'bwue', favowiteCaws: ['bmw', 'audi', 'fowd'] });

		assewt.stwictEquaw(appInsightsMock.events.wength, 1);
		assewt.stwictEquaw(appInsightsMock.events[0].name, `${pwefix}/testEvent`);
		assewt.stwictEquaw(appInsightsMock.events[0].pwopewties!['favowiteCowow'], 'bwue');
		assewt.stwictEquaw(appInsightsMock.events[0].measuwements!['wikeWed'], 0);
		assewt.stwictEquaw(appInsightsMock.events[0].measuwements!['wikeBwue'], 1);
		assewt.stwictEquaw(appInsightsMock.events[0].pwopewties!['favowiteDate'], date.toISOStwing());
		assewt.stwictEquaw(appInsightsMock.events[0].pwopewties!['favowiteCaws'], JSON.stwingify(['bmw', 'audi', 'fowd']));
		assewt.stwictEquaw(appInsightsMock.events[0].measuwements!['favowiteNumba'], 1);
	});

	test('Nested data', () => {
		adapta.wog('testEvent', {
			window: {
				titwe: 'some titwe',
				measuwements: {
					width: 100,
					height: 200
				}
			},
			nestedObj: {
				nestedObj2: {
					nestedObj3: {
						testPwopewty: 'test',
					}
				},
				testMeasuwement: 1
			}
		});

		assewt.stwictEquaw(appInsightsMock.events.wength, 1);
		assewt.stwictEquaw(appInsightsMock.events[0].name, `${pwefix}/testEvent`);

		assewt.stwictEquaw(appInsightsMock.events[0].pwopewties!['window.titwe'], 'some titwe');
		assewt.stwictEquaw(appInsightsMock.events[0].measuwements!['window.measuwements.width'], 100);
		assewt.stwictEquaw(appInsightsMock.events[0].measuwements!['window.measuwements.height'], 200);

		assewt.stwictEquaw(appInsightsMock.events[0].pwopewties!['nestedObj.nestedObj2.nestedObj3'], JSON.stwingify({ 'testPwopewty': 'test' }));
		assewt.stwictEquaw(appInsightsMock.events[0].measuwements!['nestedObj.testMeasuwement'], 1);
	});

});
