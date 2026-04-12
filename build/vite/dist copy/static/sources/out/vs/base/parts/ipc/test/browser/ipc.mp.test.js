/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { Client as MessagePortClient } from '../../browser/ipc.mp.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../test/common/utils.js';
suite('IPC, MessagePorts', () => {
    test('message passing', async () => {
        const { port1, port2 } = new MessageChannel();
        const client1 = new MessagePortClient(port1, 'client1');
        const client2 = new MessagePortClient(port2, 'client2');
        client1.registerChannel('client1', {
            call(_, command, arg, cancellationToken) {
                switch (command) {
                    case 'testMethodClient1': return Promise.resolve('success1');
                    default: return Promise.reject(new Error('not implemented'));
                }
            },
            listen(_, event, arg) {
                switch (event) {
                    default: throw new Error('not implemented');
                }
            }
        });
        client2.registerChannel('client2', {
            call(_, command, arg, cancellationToken) {
                switch (command) {
                    case 'testMethodClient2': return Promise.resolve('success2');
                    default: return Promise.reject(new Error('not implemented'));
                }
            },
            listen(_, event, arg) {
                switch (event) {
                    default: throw new Error('not implemented');
                }
            }
        });
        const channelClient1 = client2.getChannel('client1');
        assert.strictEqual(await channelClient1.call('testMethodClient1'), 'success1');
        const channelClient2 = client1.getChannel('client2');
        assert.strictEqual(await channelClient2.call('testMethodClient2'), 'success2');
        client1.dispose();
        client2.dispose();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaXBjLm1wLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9iYXNlL3BhcnRzL2lwYy90ZXN0L2Jyb3dzZXIvaXBjLm1wLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBRzVCLE9BQU8sRUFBRSxNQUFNLElBQUksaUJBQWlCLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUN0RSxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUUzRixLQUFLLENBQUMsbUJBQW1CLEVBQUUsR0FBRyxFQUFFO0lBRS9CLElBQUksQ0FBQyxpQkFBaUIsRUFBRSxLQUFLLElBQUksRUFBRTtRQUNsQyxNQUFNLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxHQUFHLElBQUksY0FBYyxFQUFFLENBQUM7UUFFOUMsTUFBTSxPQUFPLEdBQUcsSUFBSSxpQkFBaUIsQ0FBQyxLQUFLLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFDeEQsTUFBTSxPQUFPLEdBQUcsSUFBSSxpQkFBaUIsQ0FBQyxLQUFLLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFFeEQsT0FBTyxDQUFDLGVBQWUsQ0FBQyxTQUFTLEVBQUU7WUFDbEMsSUFBSSxDQUFDLENBQVUsRUFBRSxPQUFlLEVBQUUsR0FBUSxFQUFFLGlCQUFvQztnQkFDL0UsUUFBUSxPQUFPLEVBQUUsQ0FBQztvQkFDakIsS0FBSyxtQkFBbUIsQ0FBQyxDQUFDLE9BQU8sT0FBTyxDQUFDLE9BQU8sQ0FBQyxVQUFVLENBQUMsQ0FBQztvQkFDN0QsT0FBTyxDQUFDLENBQUMsT0FBTyxPQUFPLENBQUMsTUFBTSxDQUFDLElBQUksS0FBSyxDQUFDLGlCQUFpQixDQUFDLENBQUMsQ0FBQztnQkFDOUQsQ0FBQztZQUNGLENBQUM7WUFFRCxNQUFNLENBQUMsQ0FBVSxFQUFFLEtBQWEsRUFBRSxHQUFTO2dCQUMxQyxRQUFRLEtBQUssRUFBRSxDQUFDO29CQUNmLE9BQU8sQ0FBQyxDQUFDLE1BQU0sSUFBSSxLQUFLLENBQUMsaUJBQWlCLENBQUMsQ0FBQztnQkFDN0MsQ0FBQztZQUNGLENBQUM7U0FDRCxDQUFDLENBQUM7UUFFSCxPQUFPLENBQUMsZUFBZSxDQUFDLFNBQVMsRUFBRTtZQUNsQyxJQUFJLENBQUMsQ0FBVSxFQUFFLE9BQWUsRUFBRSxHQUFRLEVBQUUsaUJBQW9DO2dCQUMvRSxRQUFRLE9BQU8sRUFBRSxDQUFDO29CQUNqQixLQUFLLG1CQUFtQixDQUFDLENBQUMsT0FBTyxPQUFPLENBQUMsT0FBTyxDQUFDLFVBQVUsQ0FBQyxDQUFDO29CQUM3RCxPQUFPLENBQUMsQ0FBQyxPQUFPLE9BQU8sQ0FBQyxNQUFNLENBQUMsSUFBSSxLQUFLLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxDQUFDO2dCQUM5RCxDQUFDO1lBQ0YsQ0FBQztZQUVELE1BQU0sQ0FBQyxDQUFVLEVBQUUsS0FBYSxFQUFFLEdBQVM7Z0JBQzFDLFFBQVEsS0FBSyxFQUFFLENBQUM7b0JBQ2YsT0FBTyxDQUFDLENBQUMsTUFBTSxJQUFJLEtBQUssQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO2dCQUM3QyxDQUFDO1lBQ0YsQ0FBQztTQUNELENBQUMsQ0FBQztRQUVILE1BQU0sY0FBYyxHQUFHLE9BQU8sQ0FBQyxVQUFVLENBQUMsU0FBUyxDQUFDLENBQUM7UUFDckQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLGNBQWMsQ0FBQyxJQUFJLENBQUMsbUJBQW1CLENBQUMsRUFBRSxVQUFVLENBQUMsQ0FBQztRQUUvRSxNQUFNLGNBQWMsR0FBRyxPQUFPLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQ3JELE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxjQUFjLENBQUMsSUFBSSxDQUFDLG1CQUFtQixDQUFDLEVBQUUsVUFBVSxDQUFDLENBQUM7UUFFL0UsT0FBTyxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ2xCLE9BQU8sQ0FBQyxPQUFPLEVBQUUsQ0FBQztJQUNuQixDQUFDLENBQUMsQ0FBQztJQUVILHVDQUF1QyxFQUFFLENBQUM7QUFDM0MsQ0FBQyxDQUFDLENBQUMifQ==