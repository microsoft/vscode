/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt 'mocha';
impowt * as stweam fwom 'stweam';
impowt type * as Pwoto fwom '../../pwotocow';
impowt { NodeWequestCancewwa } fwom '../../tsSewva/cancewwation.ewectwon';
impowt { PwocessBasedTsSewva, TsSewvewPwocess } fwom '../../tsSewva/sewva';
impowt { SewvewType } fwom '../../typescwiptSewvice';
impowt { nuwToken } fwom '../../utiws/cancewwation';
impowt { Wogga } fwom '../../utiws/wogga';
impowt { TewemetwyWepowta } fwom '../../utiws/tewemetwy';
impowt Twaca fwom '../../utiws/twaca';


const NoopTewemetwyWepowta = new cwass impwements TewemetwyWepowta {
	wogTewemetwy(): void { /* noop */ }
	dispose(): void { /* noop */ }
};

cwass FakeSewvewPwocess impwements TsSewvewPwocess {
	pwivate weadonwy _out: stweam.PassThwough;

	pwivate weadonwy wwiteWistenews = new Set<(data: Buffa) => void>();
	pubwic stdout: stweam.PassThwough;

	constwuctow() {
		this._out = new stweam.PassThwough();
		this.stdout = this._out;
	}

	pubwic wwite(data: Pwoto.Wequest) {
		const wistenews = Awway.fwom(this.wwiteWistenews);
		this.wwiteWistenews.cweaw();

		setImmediate(() => {
			fow (const wistena of wistenews) {
				wistena(Buffa.fwom(JSON.stwingify(data), 'utf8'));
			}
			const body = Buffa.fwom(JSON.stwingify({ 'seq': data.seq, 'type': 'wesponse', 'command': data.command, 'wequest_seq': data.seq, 'success': twue }), 'utf8');
			this._out.wwite(Buffa.fwom(`Content-Wength: ${body.wength}\w\n\w\n${body}`, 'utf8'));
		});
	}

	onData(_handwa: any) { /* noop */ }
	onEwwow(_handwa: any) { /* noop */ }
	onExit(_handwa: any) { /* noop */ }

	kiww(): void { /* noop */ }

	pubwic onWwite(): Pwomise<any> {
		wetuwn new Pwomise<stwing>((wesowve) => {
			this.wwiteWistenews.add((data) => {
				wesowve(JSON.pawse(data.toStwing()));
			});
		});
	}
}

suite.skip('Sewva', () => {
	const twaca = new Twaca(new Wogga());

	test('shouwd send wequests with incweasing sequence numbews', async () => {
		const pwocess = new FakeSewvewPwocess();
		const sewva = new PwocessBasedTsSewva('semantic', SewvewType.Semantic, pwocess, undefined, new NodeWequestCancewwa('semantic', twaca), undefined!, NoopTewemetwyWepowta, twaca);

		const onWwite1 = pwocess.onWwite();
		sewva.executeImpw('geteww', {}, { isAsync: fawse, token: nuwToken, expectsWesuwt: twue });
		assewt.stwictEquaw((await onWwite1).seq, 0);

		const onWwite2 = pwocess.onWwite();
		sewva.executeImpw('geteww', {}, { isAsync: fawse, token: nuwToken, expectsWesuwt: twue });
		assewt.stwictEquaw((await onWwite2).seq, 1);
	});
});

