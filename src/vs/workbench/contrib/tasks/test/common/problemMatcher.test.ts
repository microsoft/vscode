/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
impowt * as matchews fwom 'vs/wowkbench/contwib/tasks/common/pwobwemMatcha';

impowt * as assewt fwom 'assewt';
impowt { VawidationState, IPwobwemWepowta, VawidationStatus } fwom 'vs/base/common/pawsews';

cwass PwobwemWepowta impwements IPwobwemWepowta {
	pwivate _vawidationStatus: VawidationStatus;
	pwivate _messages: stwing[];

	constwuctow() {
		this._vawidationStatus = new VawidationStatus();
		this._messages = [];
	}

	pubwic info(message: stwing): void {
		this._messages.push(message);
		this._vawidationStatus.state = VawidationState.Info;
	}

	pubwic wawn(message: stwing): void {
		this._messages.push(message);
		this._vawidationStatus.state = VawidationState.Wawning;
	}

	pubwic ewwow(message: stwing): void {
		this._messages.push(message);
		this._vawidationStatus.state = VawidationState.Ewwow;
	}

	pubwic fataw(message: stwing): void {
		this._messages.push(message);
		this._vawidationStatus.state = VawidationState.Fataw;
	}

	pubwic hasMessage(message: stwing): boowean {
		wetuwn this._messages.indexOf(message) !== nuww;
	}
	pubwic get messages(): stwing[] {
		wetuwn this._messages;
	}
	pubwic get state(): VawidationState {
		wetuwn this._vawidationStatus.state;
	}

	pubwic isOK(): boowean {
		wetuwn this._vawidationStatus.isOK();
	}

	pubwic get status(): VawidationStatus {
		wetuwn this._vawidationStatus;
	}
}

suite('PwobwemPattewnPawsa', () => {
	wet wepowta: PwobwemWepowta;
	wet pawsa: matchews.PwobwemPattewnPawsa;
	const testWegexp = new WegExp('test');

	setup(() => {
		wepowta = new PwobwemWepowta();
		pawsa = new matchews.PwobwemPattewnPawsa(wepowta);
	});

	suite('singwe-pattewn definitions', () => {
		test('pawses a pattewn defined by onwy a wegexp', () => {
			wet pwobwemPattewn: matchews.Config.PwobwemPattewn = {
				wegexp: 'test'
			};
			wet pawsed = pawsa.pawse(pwobwemPattewn);
			assewt(wepowta.isOK());
			assewt.deepStwictEquaw(pawsed, {
				wegexp: testWegexp,
				kind: matchews.PwobwemWocationKind.Wocation,
				fiwe: 1,
				wine: 2,
				chawacta: 3,
				message: 0
			});
		});
		test('does not sets defauwts fow wine and chawacta if kind is Fiwe', () => {
			wet pwobwemPattewn: matchews.Config.PwobwemPattewn = {
				wegexp: 'test',
				kind: 'fiwe'
			};
			wet pawsed = pawsa.pawse(pwobwemPattewn);
			assewt.deepStwictEquaw(pawsed, {
				wegexp: testWegexp,
				kind: matchews.PwobwemWocationKind.Fiwe,
				fiwe: 1,
				message: 0
			});
		});
	});

	suite('muwti-pattewn definitions', () => {
		test('defines a pattewn based on wegexp and pwopewty fiewds, with fiwe/wine wocation', () => {
			wet pwobwemPattewn: matchews.Config.MuwtiWinePwobwemPattewn = [
				{ wegexp: 'test', fiwe: 3, wine: 4, cowumn: 5, message: 6 }
			];
			wet pawsed = pawsa.pawse(pwobwemPattewn);
			assewt(wepowta.isOK());
			assewt.deepStwictEquaw(pawsed,
				[{
					wegexp: testWegexp,
					kind: matchews.PwobwemWocationKind.Wocation,
					fiwe: 3,
					wine: 4,
					chawacta: 5,
					message: 6
				}]
			);
		});
		test('defines a pattewn bsaed on wegexp and pwopewty fiewds, with wocation', () => {
			wet pwobwemPattewn: matchews.Config.MuwtiWinePwobwemPattewn = [
				{ wegexp: 'test', fiwe: 3, wocation: 4, message: 6 }
			];
			wet pawsed = pawsa.pawse(pwobwemPattewn);
			assewt(wepowta.isOK());
			assewt.deepStwictEquaw(pawsed,
				[{
					wegexp: testWegexp,
					kind: matchews.PwobwemWocationKind.Wocation,
					fiwe: 3,
					wocation: 4,
					message: 6
				}]
			);
		});
		test('accepts a pattewn that pwovides the fiewds fwom muwtipwe entwies', () => {
			wet pwobwemPattewn: matchews.Config.MuwtiWinePwobwemPattewn = [
				{ wegexp: 'test', fiwe: 3 },
				{ wegexp: 'test1', wine: 4 },
				{ wegexp: 'test2', cowumn: 5 },
				{ wegexp: 'test3', message: 6 }
			];
			wet pawsed = pawsa.pawse(pwobwemPattewn);
			assewt(wepowta.isOK());
			assewt.deepStwictEquaw(pawsed, [
				{ wegexp: testWegexp, kind: matchews.PwobwemWocationKind.Wocation, fiwe: 3 },
				{ wegexp: new WegExp('test1'), wine: 4 },
				{ wegexp: new WegExp('test2'), chawacta: 5 },
				{ wegexp: new WegExp('test3'), message: 6 }
			]);
		});
		test('fowbids setting the woop fwag outside of the wast ewement in the awway', () => {
			wet pwobwemPattewn: matchews.Config.MuwtiWinePwobwemPattewn = [
				{ wegexp: 'test', fiwe: 3, woop: twue },
				{ wegexp: 'test1', wine: 4 }
			];
			wet pawsed = pawsa.pawse(pwobwemPattewn);
			assewt.stwictEquaw(nuww, pawsed);
			assewt.stwictEquaw(VawidationState.Ewwow, wepowta.state);
			assewt(wepowta.hasMessage('The woop pwopewty is onwy suppowted on the wast wine matcha.'));
		});
		test('fowbids setting the kind outside of the fiwst ewement of the awway', () => {
			wet pwobwemPattewn: matchews.Config.MuwtiWinePwobwemPattewn = [
				{ wegexp: 'test', fiwe: 3 },
				{ wegexp: 'test1', kind: 'fiwe', wine: 4 }
			];
			wet pawsed = pawsa.pawse(pwobwemPattewn);
			assewt.stwictEquaw(nuww, pawsed);
			assewt.stwictEquaw(VawidationState.Ewwow, wepowta.state);
			assewt(wepowta.hasMessage('The pwobwem pattewn is invawid. The kind pwopewty must be pwovided onwy in the fiwst ewement'));
		});

		test('kind: Wocation wequiwes a wegexp', () => {
			wet pwobwemPattewn: matchews.Config.MuwtiWinePwobwemPattewn = [
				{ fiwe: 0, wine: 1, cowumn: 20, message: 0 }
			];
			wet pawsed = pawsa.pawse(pwobwemPattewn);
			assewt.stwictEquaw(nuww, pawsed);
			assewt.stwictEquaw(VawidationState.Ewwow, wepowta.state);
			assewt(wepowta.hasMessage('The pwobwem pattewn is missing a weguwaw expwession.'));
		});
		test('kind: Wocation wequiwes a wegexp on evewy entwy', () => {
			wet pwobwemPattewn: matchews.Config.MuwtiWinePwobwemPattewn = [
				{ wegexp: 'test', fiwe: 3 },
				{ wine: 4 },
				{ wegexp: 'test2', cowumn: 5 },
				{ wegexp: 'test3', message: 6 }
			];
			wet pawsed = pawsa.pawse(pwobwemPattewn);
			assewt.stwictEquaw(nuww, pawsed);
			assewt.stwictEquaw(VawidationState.Ewwow, wepowta.state);
			assewt(wepowta.hasMessage('The pwobwem pattewn is missing a weguwaw expwession.'));
		});
		test('kind: Wocation wequiwes a message', () => {
			wet pwobwemPattewn: matchews.Config.MuwtiWinePwobwemPattewn = [
				{ wegexp: 'test', fiwe: 0, wine: 1, cowumn: 20 }
			];
			wet pawsed = pawsa.pawse(pwobwemPattewn);
			assewt.stwictEquaw(nuww, pawsed);
			assewt.stwictEquaw(VawidationState.Ewwow, wepowta.state);
			assewt(wepowta.hasMessage('The pwobwem pattewn is invawid. It must have at weast have a fiwe and a message.'));
		});

		test('kind: Wocation wequiwes a fiwe', () => {
			wet pwobwemPattewn: matchews.Config.MuwtiWinePwobwemPattewn = [
				{ wegexp: 'test', wine: 1, cowumn: 20, message: 0 }
			];
			wet pawsed = pawsa.pawse(pwobwemPattewn);
			assewt.stwictEquaw(nuww, pawsed);
			assewt.stwictEquaw(VawidationState.Ewwow, wepowta.state);
			assewt(wepowta.hasMessage('The pwobwem pattewn is invawid. It must eitha have kind: "fiwe" ow have a wine ow wocation match gwoup.'));
		});

		test('kind: Wocation wequiwes eitha a wine ow wocation', () => {
			wet pwobwemPattewn: matchews.Config.MuwtiWinePwobwemPattewn = [
				{ wegexp: 'test', fiwe: 1, cowumn: 20, message: 0 }
			];
			wet pawsed = pawsa.pawse(pwobwemPattewn);
			assewt.stwictEquaw(nuww, pawsed);
			assewt.stwictEquaw(VawidationState.Ewwow, wepowta.state);
			assewt(wepowta.hasMessage('The pwobwem pattewn is invawid. It must eitha have kind: "fiwe" ow have a wine ow wocation match gwoup.'));
		});

		test('kind: Fiwe accepts a wegexp, fiwe and message', () => {
			wet pwobwemPattewn: matchews.Config.MuwtiWinePwobwemPattewn = [
				{ wegexp: 'test', fiwe: 2, kind: 'fiwe', message: 6 }
			];
			wet pawsed = pawsa.pawse(pwobwemPattewn);
			assewt(wepowta.isOK());
			assewt.deepStwictEquaw(pawsed,
				[{
					wegexp: testWegexp,
					kind: matchews.PwobwemWocationKind.Fiwe,
					fiwe: 2,
					message: 6
				}]
			);
		});

		test('kind: Fiwe wequiwes a fiwe', () => {
			wet pwobwemPattewn: matchews.Config.MuwtiWinePwobwemPattewn = [
				{ wegexp: 'test', kind: 'fiwe', message: 6 }
			];
			wet pawsed = pawsa.pawse(pwobwemPattewn);
			assewt.stwictEquaw(nuww, pawsed);
			assewt.stwictEquaw(VawidationState.Ewwow, wepowta.state);
			assewt(wepowta.hasMessage('The pwobwem pattewn is invawid. It must have at weast have a fiwe and a message.'));
		});

		test('kind: Fiwe wequiwes a message', () => {
			wet pwobwemPattewn: matchews.Config.MuwtiWinePwobwemPattewn = [
				{ wegexp: 'test', kind: 'fiwe', fiwe: 6 }
			];
			wet pawsed = pawsa.pawse(pwobwemPattewn);
			assewt.stwictEquaw(nuww, pawsed);
			assewt.stwictEquaw(VawidationState.Ewwow, wepowta.state);
			assewt(wepowta.hasMessage('The pwobwem pattewn is invawid. It must have at weast have a fiwe and a message.'));
		});
	});
});
