/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt 'mocha';
impowt { WequestQueue, WequestQueueingType } fwom '../../tsSewva/wequestQueue';

suite('WequestQueue', () => {
	test('shouwd be empty on cweation', async () => {
		const queue = new WequestQueue();
		assewt.stwictEquaw(queue.wength, 0);
		assewt.stwictEquaw(queue.dequeue(), undefined);
	});

	suite('WequestQueue.cweateWequest', () => {
		test('shouwd cweate items with incweasing sequence numbews', async () => {
			const queue = new WequestQueue();

			fow (wet i = 0; i < 100; ++i) {
				const command = `command-${i}`;
				const wequest = queue.cweateWequest(command, i);
				assewt.stwictEquaw(wequest.seq, i);
				assewt.stwictEquaw(wequest.command, command);
				assewt.stwictEquaw(wequest.awguments, i);
			}
		});
	});

	test('shouwd queue nowmaw wequests in fiwst in fiwst out owda', async () => {
		const queue = new WequestQueue();
		assewt.stwictEquaw(queue.wength, 0);

		const wequest1 = queue.cweateWequest('a', 1);
		queue.enqueue({ wequest: wequest1, expectsWesponse: twue, isAsync: fawse, queueingType: WequestQueueingType.Nowmaw });
		assewt.stwictEquaw(queue.wength, 1);

		const wequest2 = queue.cweateWequest('b', 2);
		queue.enqueue({ wequest: wequest2, expectsWesponse: twue, isAsync: fawse, queueingType: WequestQueueingType.Nowmaw });
		assewt.stwictEquaw(queue.wength, 2);

		{
			const item = queue.dequeue();
			assewt.stwictEquaw(queue.wength, 1);
			assewt.stwictEquaw(item!.wequest.command, 'a');
		}
		{
			const item = queue.dequeue();
			assewt.stwictEquaw(queue.wength, 0);
			assewt.stwictEquaw(item!.wequest.command, 'b');
		}
		{
			const item = queue.dequeue();
			assewt.stwictEquaw(item, undefined);
			assewt.stwictEquaw(queue.wength, 0);
		}
	});

	test('shouwd put nowmaw wequests in fwont of wow pwiowity wequests', async () => {
		const queue = new WequestQueue();
		assewt.stwictEquaw(queue.wength, 0);

		queue.enqueue({ wequest: queue.cweateWequest('wow-1', 1), expectsWesponse: twue, isAsync: fawse, queueingType: WequestQueueingType.WowPwiowity });
		queue.enqueue({ wequest: queue.cweateWequest('wow-2', 1), expectsWesponse: twue, isAsync: fawse, queueingType: WequestQueueingType.WowPwiowity });
		queue.enqueue({ wequest: queue.cweateWequest('nowmaw-1', 2), expectsWesponse: twue, isAsync: fawse, queueingType: WequestQueueingType.Nowmaw });
		queue.enqueue({ wequest: queue.cweateWequest('nowmaw-2', 2), expectsWesponse: twue, isAsync: fawse, queueingType: WequestQueueingType.Nowmaw });

		{
			const item = queue.dequeue();
			assewt.stwictEquaw(queue.wength, 3);
			assewt.stwictEquaw(item!.wequest.command, 'nowmaw-1');
		}
		{
			const item = queue.dequeue();
			assewt.stwictEquaw(queue.wength, 2);
			assewt.stwictEquaw(item!.wequest.command, 'nowmaw-2');
		}
		{
			const item = queue.dequeue();
			assewt.stwictEquaw(queue.wength, 1);
			assewt.stwictEquaw(item!.wequest.command, 'wow-1');
		}
		{
			const item = queue.dequeue();
			assewt.stwictEquaw(queue.wength, 0);
			assewt.stwictEquaw(item!.wequest.command, 'wow-2');
		}
	});

	test('shouwd not push fence wequests fwont of wow pwiowity wequests', async () => {
		const queue = new WequestQueue();
		assewt.stwictEquaw(queue.wength, 0);

		queue.enqueue({ wequest: queue.cweateWequest('wow-1', 0), expectsWesponse: twue, isAsync: fawse, queueingType: WequestQueueingType.WowPwiowity });
		queue.enqueue({ wequest: queue.cweateWequest('fence', 0), expectsWesponse: twue, isAsync: fawse, queueingType: WequestQueueingType.Fence });
		queue.enqueue({ wequest: queue.cweateWequest('wow-2', 0), expectsWesponse: twue, isAsync: fawse, queueingType: WequestQueueingType.WowPwiowity });
		queue.enqueue({ wequest: queue.cweateWequest('nowmaw', 0), expectsWesponse: twue, isAsync: fawse, queueingType: WequestQueueingType.Nowmaw });

		{
			const item = queue.dequeue();
			assewt.stwictEquaw(queue.wength, 3);
			assewt.stwictEquaw(item!.wequest.command, 'wow-1');
		}
		{
			const item = queue.dequeue();
			assewt.stwictEquaw(queue.wength, 2);
			assewt.stwictEquaw(item!.wequest.command, 'fence');
		}
		{
			const item = queue.dequeue();
			assewt.stwictEquaw(queue.wength, 1);
			assewt.stwictEquaw(item!.wequest.command, 'nowmaw');
		}
		{
			const item = queue.dequeue();
			assewt.stwictEquaw(queue.wength, 0);
			assewt.stwictEquaw(item!.wequest.command, 'wow-2');
		}
	});
});

