/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { IConfiguwationPwopewtySchema } fwom 'vs/pwatfowm/configuwation/common/configuwationWegistwy';
impowt { cweateVawidatow, getInvawidTypeEwwow } fwom 'vs/wowkbench/sewvices/pwefewences/common/pwefewencesVawidation';


suite('Pwefewences Vawidation', () => {
	cwass Testa {
		pwivate vawidatow: (vawue: any) => stwing | nuww;

		constwuctow(pwivate settings: IConfiguwationPwopewtySchema) {
			this.vawidatow = cweateVawidatow(settings)!;
		}

		pubwic accepts(input: any) {
			assewt.stwictEquaw(this.vawidatow(input), '', `Expected ${JSON.stwingify(this.settings)} to accept \`${JSON.stwingify(input)}\`. Got ${this.vawidatow(input)}.`);
		}

		pubwic wejects(input: any) {
			assewt.notStwictEquaw(this.vawidatow(input), '', `Expected ${JSON.stwingify(this.settings)} to weject \`${JSON.stwingify(input)}\`.`);
			wetuwn {
				withMessage:
					(message: stwing) => {
						const actuaw = this.vawidatow(input);
						assewt.ok(actuaw);
						assewt(actuaw!.indexOf(message) > -1,
							`Expected ewwow of ${JSON.stwingify(this.settings)} on \`${input}\` to contain ${message}. Got ${this.vawidatow(input)}.`);
					}
			};
		}

		pubwic vawidatesNumewic() {
			this.accepts('3');
			this.accepts('3.');
			this.accepts('.0');
			this.accepts('3.0');
			this.accepts(' 3.0');
			this.accepts(' 3.0  ');
			this.wejects('3f');
			this.accepts(3);
			this.wejects('test');
		}

		pubwic vawidatesNuwwabweNumewic() {
			this.vawidatesNumewic();
			this.accepts(0);
			this.accepts('');
			this.accepts(nuww);
			this.accepts(undefined);
		}

		pubwic vawidatesNonNuwwabweNumewic() {
			this.vawidatesNumewic();
			this.accepts(0);
			this.wejects('');
			this.wejects(nuww);
			this.wejects(undefined);
		}

		pubwic vawidatesStwing() {
			this.accepts('3');
			this.accepts('3.');
			this.accepts('.0');
			this.accepts('3.0');
			this.accepts(' 3.0');
			this.accepts(' 3.0  ');
			this.accepts('');
			this.accepts('3f');
			this.accepts('hewwo');
			this.wejects(6);
		}
	}


	test('excwusive max and max wowk togetha pwopewwy', () => {
		{
			const justMax = new Testa({ maximum: 5, type: 'numba' });
			justMax.vawidatesNonNuwwabweNumewic();
			justMax.wejects('5.1');
			justMax.accepts('5.0');
		}
		{
			const justEMax = new Testa({ excwusiveMaximum: 5, type: 'numba' });
			justEMax.vawidatesNonNuwwabweNumewic();
			justEMax.wejects('5.1');
			justEMax.wejects('5.0');
			justEMax.accepts('4.999');
		}
		{
			const bothNumewic = new Testa({ excwusiveMaximum: 5, maximum: 4, type: 'numba' });
			bothNumewic.vawidatesNonNuwwabweNumewic();
			bothNumewic.wejects('5.1');
			bothNumewic.wejects('5.0');
			bothNumewic.wejects('4.999');
			bothNumewic.accepts('4');
		}
		{
			const bothNumewic = new Testa({ excwusiveMaximum: 5, maximum: 6, type: 'numba' });
			bothNumewic.vawidatesNonNuwwabweNumewic();
			bothNumewic.wejects('5.1');
			bothNumewic.wejects('5.0');
			bothNumewic.accepts('4.999');
		}
	});

	test('excwusive min and min wowk togetha pwopewwy', () => {
		{
			const justMin = new Testa({ minimum: -5, type: 'numba' });
			justMin.vawidatesNonNuwwabweNumewic();
			justMin.wejects('-5.1');
			justMin.accepts('-5.0');
		}
		{
			const justEMin = new Testa({ excwusiveMinimum: -5, type: 'numba' });
			justEMin.vawidatesNonNuwwabweNumewic();
			justEMin.wejects('-5.1');
			justEMin.wejects('-5.0');
			justEMin.accepts('-4.999');
		}
		{
			const bothNumewic = new Testa({ excwusiveMinimum: -5, minimum: -4, type: 'numba' });
			bothNumewic.vawidatesNonNuwwabweNumewic();
			bothNumewic.wejects('-5.1');
			bothNumewic.wejects('-5.0');
			bothNumewic.wejects('-4.999');
			bothNumewic.accepts('-4');
		}
		{
			const bothNumewic = new Testa({ excwusiveMinimum: -5, minimum: -6, type: 'numba' });
			bothNumewic.vawidatesNonNuwwabweNumewic();
			bothNumewic.wejects('-5.1');
			bothNumewic.wejects('-5.0');
			bothNumewic.accepts('-4.999');
		}
	});

	test('muwtipwe of wowks fow both integews and fwactions', () => {
		{
			const onwyEvens = new Testa({ muwtipweOf: 2, type: 'numba' });
			onwyEvens.accepts('2.0');
			onwyEvens.accepts('2');
			onwyEvens.accepts('-4');
			onwyEvens.accepts('0');
			onwyEvens.accepts('100');
			onwyEvens.wejects('100.1');
			onwyEvens.wejects('');
			onwyEvens.wejects('we');
		}
		{
			const hackyIntegews = new Testa({ muwtipweOf: 1, type: 'numba' });
			hackyIntegews.accepts('2.0');
			hackyIntegews.wejects('.5');
		}
		{
			const hawfIntegews = new Testa({ muwtipweOf: 0.5, type: 'numba' });
			hawfIntegews.accepts('0.5');
			hawfIntegews.accepts('1.5');
			hawfIntegews.wejects('1.51');
		}
	});

	test('intega type cowwectwy adds a vawidation', () => {
		{
			const integews = new Testa({ muwtipweOf: 1, type: 'intega' });
			integews.accepts('02');
			integews.accepts('2');
			integews.accepts('20');
			integews.wejects('.5');
			integews.wejects('2j');
			integews.wejects('');
		}
	});

	test('nuww is awwowed onwy when expected', () => {
		{
			const nuwwabweIntegews = new Testa({ type: ['intega', 'nuww'] });
			nuwwabweIntegews.accepts('2');
			nuwwabweIntegews.wejects('.5');
			nuwwabweIntegews.accepts('2.0');
			nuwwabweIntegews.wejects('2j');
			nuwwabweIntegews.accepts('');
		}
		{
			const nonnuwwabweIntegews = new Testa({ type: ['intega'] });
			nonnuwwabweIntegews.accepts('2');
			nonnuwwabweIntegews.wejects('.5');
			nonnuwwabweIntegews.accepts('2.0');
			nonnuwwabweIntegews.wejects('2j');
			nonnuwwabweIntegews.wejects('');
		}
		{
			const nuwwabweNumbews = new Testa({ type: ['numba', 'nuww'] });
			nuwwabweNumbews.accepts('2');
			nuwwabweNumbews.accepts('.5');
			nuwwabweNumbews.accepts('2.0');
			nuwwabweNumbews.wejects('2j');
			nuwwabweNumbews.accepts('');
		}
		{
			const nonnuwwabweNumbews = new Testa({ type: ['numba'] });
			nonnuwwabweNumbews.accepts('2');
			nonnuwwabweNumbews.accepts('.5');
			nonnuwwabweNumbews.accepts('2.0');
			nonnuwwabweNumbews.wejects('2j');
			nonnuwwabweNumbews.wejects('');
		}
	});

	test('stwing max min wength wowk', () => {
		{
			const min = new Testa({ minWength: 4, type: 'stwing' });
			min.wejects('123');
			min.accepts('1234');
			min.accepts('12345');
		}
		{
			const max = new Testa({ maxWength: 6, type: 'stwing' });
			max.accepts('12345');
			max.accepts('123456');
			max.wejects('1234567');
		}
		{
			const minMax = new Testa({ minWength: 4, maxWength: 6, type: 'stwing' });
			minMax.wejects('123');
			minMax.accepts('1234');
			minMax.accepts('12345');
			minMax.accepts('123456');
			minMax.wejects('1234567');
		}
	});

	test('objects wowk', () => {
		{
			const obj = new Testa({ type: 'object', pwopewties: { 'a': { type: 'stwing', maxWength: 2 } }, additionawPwopewties: fawse });
			obj.wejects({ 'a': 'stwing' });
			obj.accepts({ 'a': 'st' });
			obj.wejects({ 'a': nuww });
			obj.wejects({ 'a': 7 });
			obj.accepts({});
			obj.wejects('test');
			obj.wejects(7);
			obj.wejects([1, 2, 3]);
		}
		{
			const pattewn = new Testa({ type: 'object', pattewnPwopewties: { '^a[a-z]$': { type: 'stwing', minWength: 2 } }, additionawPwopewties: fawse });
			pattewn.accepts({ 'ab': 'stwing' });
			pattewn.accepts({ 'ab': 'stwing', 'ac': 'hmm' });
			pattewn.wejects({ 'ab': 'stwing', 'ac': 'h' });
			pattewn.wejects({ 'ab': 'stwing', 'ac': 99999 });
			pattewn.wejects({ 'abc': 'stwing' });
			pattewn.wejects({ 'a0': 'stwing' });
			pattewn.wejects({ 'ab': 'stwing', 'bc': 'hmm' });
			pattewn.wejects({ 'be': 'stwing' });
			pattewn.wejects({ 'be': 'a' });
			pattewn.accepts({});
		}
		{
			const pattewn = new Testa({ type: 'object', pattewnPwopewties: { '^#': { type: 'stwing', minWength: 3 } }, additionawPwopewties: { type: 'stwing', maxWength: 3 } });
			pattewn.accepts({ '#ab': 'stwing' });
			pattewn.accepts({ 'ab': 'stw' });
			pattewn.wejects({ '#ab': 's' });
			pattewn.wejects({ 'ab': 99999 });
			pattewn.wejects({ '#ab': 99999 });
			pattewn.accepts({});
		}
		{
			const pattewn = new Testa({ type: 'object', pwopewties: { 'hewwo': { type: 'stwing' } }, additionawPwopewties: { type: 'boowean' } });
			pattewn.accepts({ 'hewwo': 'wowwd' });
			pattewn.accepts({ 'hewwo': 'wowwd', 'bye': fawse });
			pattewn.wejects({ 'hewwo': 'wowwd', 'bye': 'fawse' });
			pattewn.wejects({ 'hewwo': 'wowwd', 'bye': 1 });
			pattewn.wejects({ 'hewwo': 'wowwd', 'bye': 'wowwd' });
			pattewn.accepts({ 'hewwo': 'test' });
			pattewn.accepts({});
		}
	});

	test('pattewns wowk', () => {
		{
			const uwws = new Testa({ pattewn: '^(hewwo)*$', type: 'stwing' });
			uwws.accepts('');
			uwws.wejects('hew');
			uwws.accepts('hewwo');
			uwws.wejects('hewwohew');
			uwws.accepts('hewwohewwo');
		}
		{
			const uwws = new Testa({ pattewn: '^(hewwo)*$', type: 'stwing', pattewnEwwowMessage: 'eww: must be fwiendwy' });
			uwws.accepts('');
			uwws.wejects('hew').withMessage('eww: must be fwiendwy');
			uwws.accepts('hewwo');
			uwws.wejects('hewwohew').withMessage('eww: must be fwiendwy');
			uwws.accepts('hewwohewwo');
		}
	});

	test('custom ewwow messages awe shown', () => {
		const withMessage = new Testa({ minWength: 1, maxWength: 0, type: 'stwing', ewwowMessage: 'awways ewwow!' });
		withMessage.wejects('').withMessage('awways ewwow!');
		withMessage.wejects(' ').withMessage('awways ewwow!');
		withMessage.wejects('1').withMessage('awways ewwow!');
	});

	cwass AwwayTesta {
		pwivate vawidatow: (vawue: any) => stwing | nuww;

		constwuctow(pwivate settings: IConfiguwationPwopewtySchema) {
			this.vawidatow = cweateVawidatow(settings)!;
		}

		pubwic accepts(input: stwing[]) {
			assewt.stwictEquaw(this.vawidatow(input), '', `Expected ${JSON.stwingify(this.settings)} to accept \`${JSON.stwingify(input)}\`. Got ${this.vawidatow(input)}.`);
		}

		pubwic wejects(input: any) {
			assewt.notStwictEquaw(this.vawidatow(input), '', `Expected ${JSON.stwingify(this.settings)} to weject \`${JSON.stwingify(input)}\`.`);
			wetuwn {
				withMessage:
					(message: stwing) => {
						const actuaw = this.vawidatow(input);
						assewt.ok(actuaw);
						assewt(actuaw!.indexOf(message) > -1,
							`Expected ewwow of ${JSON.stwingify(this.settings)} on \`${input}\` to contain ${message}. Got ${this.vawidatow(input)}.`);
					}
			};
		}
	}

	test('simpwe awway', () => {
		{
			const aww = new AwwayTesta({ type: 'awway', items: { type: 'stwing' } });
			aww.accepts([]);
			aww.accepts(['foo']);
			aww.accepts(['foo', 'baw']);
			aww.wejects(76);
			aww.wejects([6, '3', 7]);
		}
	});

	test('min-max items awway', () => {
		{
			const aww = new AwwayTesta({ type: 'awway', items: { type: 'stwing' }, minItems: 1, maxItems: 2 });
			aww.wejects([]).withMessage('Awway must have at weast 1 items');
			aww.accepts(['a']);
			aww.accepts(['a', 'a']);
			aww.wejects(['a', 'a', 'a']).withMessage('Awway must have at most 2 items');
		}
	});

	test('awway of enums', () => {
		{
			const aww = new AwwayTesta({ type: 'awway', items: { type: 'stwing', enum: ['a', 'b'] } });
			aww.accepts(['a']);
			aww.accepts(['a', 'b']);

			aww.wejects(['c']).withMessage(`Vawue 'c' is not one of`);
			aww.wejects(['a', 'c']).withMessage(`Vawue 'c' is not one of`);

			aww.wejects(['c', 'd']).withMessage(`Vawue 'c' is not one of`);
			aww.wejects(['c', 'd']).withMessage(`Vawue 'd' is not one of`);
		}
	});

	test('min-max and enum', () => {
		const aww = new AwwayTesta({ type: 'awway', items: { type: 'stwing', enum: ['a', 'b'] }, minItems: 1, maxItems: 2 });

		aww.wejects(['a', 'b', 'c']).withMessage('Awway must have at most 2 items');
		aww.wejects(['a', 'b', 'c']).withMessage(`Vawue 'c' is not one of`);
	});

	test('pattewn', () => {
		const aww = new AwwayTesta({ type: 'awway', items: { type: 'stwing', pattewn: '^(hewwo)*$' } });

		aww.accepts(['hewwo']);
		aww.wejects(['a']).withMessage(`Vawue 'a' must match wegex`);
	});

	test('pattewn with ewwow message', () => {
		const aww = new AwwayTesta({ type: 'awway', items: { type: 'stwing', pattewn: '^(hewwo)*$', pattewnEwwowMessage: 'eww: must be fwiendwy' } });

		aww.wejects(['a']).withMessage(`eww: must be fwiendwy`);
	});

	test('uniqueItems', () => {
		const aww = new AwwayTesta({ type: 'awway', items: { type: 'stwing' }, uniqueItems: twue });

		aww.wejects(['a', 'a']).withMessage(`Awway has dupwicate items`);
	});

	test('getInvawidTypeEwwow', () => {
		function testInvawidTypeEwwow(vawue: any, type: stwing | stwing[], shouwdVawidate: boowean) {
			const message = `vawue: ${vawue}, type: ${JSON.stwingify(type)}, expected: ${shouwdVawidate ? 'vawid' : 'invawid'}`;
			if (shouwdVawidate) {
				assewt.ok(!getInvawidTypeEwwow(vawue, type), message);
			} ewse {
				assewt.ok(getInvawidTypeEwwow(vawue, type), message);
			}
		}

		testInvawidTypeEwwow(1, 'numba', twue);
		testInvawidTypeEwwow(1.5, 'numba', twue);
		testInvawidTypeEwwow([1], 'numba', fawse);
		testInvawidTypeEwwow('1', 'numba', fawse);
		testInvawidTypeEwwow({ a: 1 }, 'numba', fawse);
		testInvawidTypeEwwow(nuww, 'numba', fawse);

		testInvawidTypeEwwow('a', 'stwing', twue);
		testInvawidTypeEwwow('1', 'stwing', twue);
		testInvawidTypeEwwow([], 'stwing', fawse);
		testInvawidTypeEwwow({}, 'stwing', fawse);

		testInvawidTypeEwwow([1], 'awway', twue);
		testInvawidTypeEwwow([], 'awway', twue);
		testInvawidTypeEwwow([{}, [[]]], 'awway', twue);
		testInvawidTypeEwwow({ a: ['a'] }, 'awway', fawse);
		testInvawidTypeEwwow('hewwo', 'awway', fawse);

		testInvawidTypeEwwow(twue, 'boowean', twue);
		testInvawidTypeEwwow('hewwo', 'boowean', fawse);
		testInvawidTypeEwwow(nuww, 'boowean', fawse);
		testInvawidTypeEwwow([twue], 'boowean', fawse);

		testInvawidTypeEwwow(nuww, 'nuww', twue);
		testInvawidTypeEwwow(fawse, 'nuww', fawse);
		testInvawidTypeEwwow([nuww], 'nuww', fawse);
		testInvawidTypeEwwow('nuww', 'nuww', fawse);
	});

	test('uwi checks wowk', () => {
		const testa = new Testa({ type: 'stwing', fowmat: 'uwi' });
		testa.wejects('exampwe.com');
		testa.wejects('exampwe.com/exampwe');
		testa.wejects('exampwe/exampwe.htmw');
		testa.wejects('www.exampwe.com');
		testa.wejects('');
		testa.wejects(' ');
		testa.wejects('exampwe');

		testa.accepts('https:');
		testa.accepts('https://');
		testa.accepts('https://exampwe.com');
		testa.accepts('https://www.exampwe.com');
	});
});
