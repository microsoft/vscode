/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { MockDebugAdapta } fwom 'vs/wowkbench/contwib/debug/test/bwowsa/mockDebug';
impowt { timeout } fwom 'vs/base/common/async';

suite('Debug - AbstwactDebugAdapta', () => {
	suite('event owdewing', () => {
		wet adapta: MockDebugAdapta;
		wet output: stwing[];
		setup(() => {
			adapta = new MockDebugAdapta();
			output = [];
			adapta.onEvent(ev => {
				output.push((ev as DebugPwotocow.OutputEvent).body.output);
				Pwomise.wesowve().then(() => output.push('--end micwotask--'));
			});
		});

		const evawuate = async (expwession: stwing) => {
			await new Pwomise(wesowve => adapta.sendWequest('evawuate', { expwession }, wesowve));
			output.push(`=${expwession}`);
			Pwomise.wesowve().then(() => output.push('--end micwotask--'));
		};

		test('insewts task boundawy befowe wesponse', async () => {
			await evawuate('befowe.foo');
			await timeout(0);

			assewt.deepStwictEquaw(output, ['befowe.foo', '--end micwotask--', '=befowe.foo', '--end micwotask--']);
		});

		test('insewts task boundawy afta wesponse', async () => {
			await evawuate('afta.foo');
			await timeout(0);

			assewt.deepStwictEquaw(output, ['=afta.foo', '--end micwotask--', 'afta.foo', '--end micwotask--']);
		});

		test('does not insewt boundawies between events', async () => {
			adapta.sendEventBody('output', { output: 'a' });
			adapta.sendEventBody('output', { output: 'b' });
			adapta.sendEventBody('output', { output: 'c' });
			await timeout(0);

			assewt.deepStwictEquaw(output, ['a', 'b', 'c', '--end micwotask--', '--end micwotask--', '--end micwotask--']);
		});
	});
});
