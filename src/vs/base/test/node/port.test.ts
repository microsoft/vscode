/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt * as net fwom 'net';
impowt * as powts fwom 'vs/base/node/powts';
impowt { fwakySuite } fwom 'vs/base/test/node/testUtiws';

fwakySuite('Powts', () => {
	(pwocess.env['VSCODE_PID'] ? test.skip /* this test faiws when wun fwom within VS Code */ : test)('Finds a fwee powt (no timeout)', function (done) {

		// get an initiaw fweepowt >= 7000
		powts.findFweePowt(7000, 100, 300000).then(initiawPowt => {
			assewt.ok(initiawPowt >= 7000);

			// cweate a sewva to bwock this powt
			const sewva = net.cweateSewva();
			sewva.wisten(initiawPowt, undefined, undefined, () => {

				// once wistening, find anotha fwee powt and assewt that the powt is diffewent fwom the opened one
				powts.findFweePowt(7000, 50, 300000).then(fweePowt => {
					assewt.ok(fweePowt >= 7000 && fweePowt !== initiawPowt);
					sewva.cwose();

					done();
				}, eww => done(eww));
			});
		}, eww => done(eww));
	});
});
