/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { DefaultURITransformer } from '../../../base/common/uriIpc.js';
import { ProxyChannel } from '../../../base/parts/ipc/common/ipc.js';
import { Server as ChildProcessServer } from '../../../base/parts/ipc/node/ipc.cp.js';
import { Server as UtilityProcessServer } from '../../../base/parts/ipc/node/ipc.mp.js';
import { localize } from '../../../nls.js';
import { OPTIONS, parseArgs } from '../../environment/node/argv.js';
import { NativeEnvironmentService } from '../../environment/node/environmentService.js';
import { getLogLevel } from '../../log/common/log.js';
import { LoggerChannel } from '../../log/common/logIpc.js';
import { LogService } from '../../log/common/logService.js';
import { LoggerService } from '../../log/node/loggerService.js';
import product from '../../product/common/product.js';
import { TerminalIpcChannels } from '../common/terminal.js';
import { HeartbeatService } from './heartbeatService.js';
import { PtyService } from './ptyService.js';
import { isUtilityProcess } from '../../../base/parts/sandbox/node/electronTypes.js';
import { timeout } from '../../../base/common/async.js';
import { DisposableStore } from '../../../base/common/lifecycle.js';
startPtyHost();
async function startPtyHost() {
    // Parse environment variables
    const startupDelay = parseInt(process.env.VSCODE_STARTUP_DELAY ?? '0');
    const simulatedLatency = parseInt(process.env.VSCODE_LATENCY ?? '0');
    const reconnectConstants = {
        graceTime: parseInt(process.env.VSCODE_RECONNECT_GRACE_TIME || '0'),
        shortGraceTime: parseInt(process.env.VSCODE_RECONNECT_SHORT_GRACE_TIME || '0'),
        scrollback: parseInt(process.env.VSCODE_RECONNECT_SCROLLBACK || '100')
    };
    // Sanitize environment
    delete process.env.VSCODE_RECONNECT_GRACE_TIME;
    delete process.env.VSCODE_RECONNECT_SHORT_GRACE_TIME;
    delete process.env.VSCODE_RECONNECT_SCROLLBACK;
    delete process.env.VSCODE_LATENCY;
    delete process.env.VSCODE_STARTUP_DELAY;
    // Delay startup if needed, this must occur before RPC is setup to avoid the channel from timing
    // out.
    if (startupDelay) {
        await timeout(startupDelay);
    }
    // Setup RPC
    const _isUtilityProcess = isUtilityProcess(process);
    let server;
    if (_isUtilityProcess) {
        server = new UtilityProcessServer();
    }
    else {
        server = new ChildProcessServer(TerminalIpcChannels.PtyHost);
    }
    // Services
    const productService = { _serviceBrand: undefined, ...product };
    const environmentService = new NativeEnvironmentService(parseArgs(process.argv, OPTIONS), productService);
    const loggerService = new LoggerService(getLogLevel(environmentService), environmentService.logsHome);
    server.registerChannel(TerminalIpcChannels.Logger, new LoggerChannel(loggerService, () => DefaultURITransformer));
    const logger = loggerService.createLogger('ptyhost', { name: localize('ptyHost', "Pty Host") });
    const logService = new LogService(logger);
    // Log developer config
    if (startupDelay) {
        logService.warn(`Pty Host startup is delayed ${startupDelay}ms`);
    }
    if (simulatedLatency) {
        logService.warn(`Pty host is simulating ${simulatedLatency}ms latency`);
    }
    const disposables = new DisposableStore();
    // Heartbeat responsiveness tracking
    const heartbeatService = new HeartbeatService();
    server.registerChannel(TerminalIpcChannels.Heartbeat, ProxyChannel.fromService(heartbeatService, disposables));
    // Init pty service
    const ptyService = new PtyService(logService, productService, reconnectConstants, simulatedLatency);
    const ptyServiceChannel = ProxyChannel.fromService(ptyService, disposables);
    server.registerChannel(TerminalIpcChannels.PtyHost, ptyServiceChannel);
    // Register a channel for direct communication via Message Port
    if (_isUtilityProcess) {
        server.registerChannel(TerminalIpcChannels.PtyHostWindow, ptyServiceChannel);
    }
    // Clean up
    process.once('exit', () => {
        logService.trace('Pty host exiting');
        logService.dispose();
        heartbeatService.dispose();
        ptyService.dispose();
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHR5SG9zdE1haW4uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS90ZXJtaW5hbC9ub2RlL3B0eUhvc3RNYWluLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ3ZFLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNyRSxPQUFPLEVBQUUsTUFBTSxJQUFJLGtCQUFrQixFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDdEYsT0FBTyxFQUFFLE1BQU0sSUFBSSxvQkFBb0IsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ3hGLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxpQkFBaUIsQ0FBQztBQUMzQyxPQUFPLEVBQUUsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ3BFLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBQ3hGLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUN0RCxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sNEJBQTRCLENBQUM7QUFDM0QsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQzVELE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUNoRSxPQUFPLE9BQU8sTUFBTSxpQ0FBaUMsQ0FBQztBQUV0RCxPQUFPLEVBQXVCLG1CQUFtQixFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFDakYsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFDekQsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLGlCQUFpQixDQUFDO0FBQzdDLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ3JGLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUN4RCxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFFcEUsWUFBWSxFQUFFLENBQUM7QUFFZixLQUFLLFVBQVUsWUFBWTtJQUMxQiw4QkFBOEI7SUFDOUIsTUFBTSxZQUFZLEdBQUcsUUFBUSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsb0JBQW9CLElBQUksR0FBRyxDQUFDLENBQUM7SUFDdkUsTUFBTSxnQkFBZ0IsR0FBRyxRQUFRLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxjQUFjLElBQUksR0FBRyxDQUFDLENBQUM7SUFDckUsTUFBTSxrQkFBa0IsR0FBd0I7UUFDL0MsU0FBUyxFQUFFLFFBQVEsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLDJCQUEyQixJQUFJLEdBQUcsQ0FBQztRQUNuRSxjQUFjLEVBQUUsUUFBUSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsaUNBQWlDLElBQUksR0FBRyxDQUFDO1FBQzlFLFVBQVUsRUFBRSxRQUFRLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQywyQkFBMkIsSUFBSSxLQUFLLENBQUM7S0FDdEUsQ0FBQztJQUVGLHVCQUF1QjtJQUN2QixPQUFPLE9BQU8sQ0FBQyxHQUFHLENBQUMsMkJBQTJCLENBQUM7SUFDL0MsT0FBTyxPQUFPLENBQUMsR0FBRyxDQUFDLGlDQUFpQyxDQUFDO0lBQ3JELE9BQU8sT0FBTyxDQUFDLEdBQUcsQ0FBQywyQkFBMkIsQ0FBQztJQUMvQyxPQUFPLE9BQU8sQ0FBQyxHQUFHLENBQUMsY0FBYyxDQUFDO0lBQ2xDLE9BQU8sT0FBTyxDQUFDLEdBQUcsQ0FBQyxvQkFBb0IsQ0FBQztJQUV4QyxnR0FBZ0c7SUFDaEcsT0FBTztJQUNQLElBQUksWUFBWSxFQUFFLENBQUM7UUFDbEIsTUFBTSxPQUFPLENBQUMsWUFBWSxDQUFDLENBQUM7SUFDN0IsQ0FBQztJQUVELFlBQVk7SUFDWixNQUFNLGlCQUFpQixHQUFHLGdCQUFnQixDQUFDLE9BQU8sQ0FBQyxDQUFDO0lBQ3BELElBQUksTUFBeUQsQ0FBQztJQUM5RCxJQUFJLGlCQUFpQixFQUFFLENBQUM7UUFDdkIsTUFBTSxHQUFHLElBQUksb0JBQW9CLEVBQUUsQ0FBQztJQUNyQyxDQUFDO1NBQU0sQ0FBQztRQUNQLE1BQU0sR0FBRyxJQUFJLGtCQUFrQixDQUFDLG1CQUFtQixDQUFDLE9BQU8sQ0FBQyxDQUFDO0lBQzlELENBQUM7SUFFRCxXQUFXO0lBQ1gsTUFBTSxjQUFjLEdBQW9CLEVBQUUsYUFBYSxFQUFFLFNBQVMsRUFBRSxHQUFHLE9BQU8sRUFBRSxDQUFDO0lBQ2pGLE1BQU0sa0JBQWtCLEdBQUcsSUFBSSx3QkFBd0IsQ0FBQyxTQUFTLENBQUMsT0FBTyxDQUFDLElBQUksRUFBRSxPQUFPLENBQUMsRUFBRSxjQUFjLENBQUMsQ0FBQztJQUMxRyxNQUFNLGFBQWEsR0FBRyxJQUFJLGFBQWEsQ0FBQyxXQUFXLENBQUMsa0JBQWtCLENBQUMsRUFBRSxrQkFBa0IsQ0FBQyxRQUFRLENBQUMsQ0FBQztJQUN0RyxNQUFNLENBQUMsZUFBZSxDQUFDLG1CQUFtQixDQUFDLE1BQU0sRUFBRSxJQUFJLGFBQWEsQ0FBQyxhQUFhLEVBQUUsR0FBRyxFQUFFLENBQUMscUJBQXFCLENBQUMsQ0FBQyxDQUFDO0lBQ2xILE1BQU0sTUFBTSxHQUFHLGFBQWEsQ0FBQyxZQUFZLENBQUMsU0FBUyxFQUFFLEVBQUUsSUFBSSxFQUFFLFFBQVEsQ0FBQyxTQUFTLEVBQUUsVUFBVSxDQUFDLEVBQUUsQ0FBQyxDQUFDO0lBQ2hHLE1BQU0sVUFBVSxHQUFHLElBQUksVUFBVSxDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBRTFDLHVCQUF1QjtJQUN2QixJQUFJLFlBQVksRUFBRSxDQUFDO1FBQ2xCLFVBQVUsQ0FBQyxJQUFJLENBQUMsK0JBQStCLFlBQVksSUFBSSxDQUFDLENBQUM7SUFDbEUsQ0FBQztJQUNELElBQUksZ0JBQWdCLEVBQUUsQ0FBQztRQUN0QixVQUFVLENBQUMsSUFBSSxDQUFDLDBCQUEwQixnQkFBZ0IsWUFBWSxDQUFDLENBQUM7SUFDekUsQ0FBQztJQUVELE1BQU0sV0FBVyxHQUFHLElBQUksZUFBZSxFQUFFLENBQUM7SUFFMUMsb0NBQW9DO0lBQ3BDLE1BQU0sZ0JBQWdCLEdBQUcsSUFBSSxnQkFBZ0IsRUFBRSxDQUFDO0lBQ2hELE1BQU0sQ0FBQyxlQUFlLENBQUMsbUJBQW1CLENBQUMsU0FBUyxFQUFFLFlBQVksQ0FBQyxXQUFXLENBQUMsZ0JBQWdCLEVBQUUsV0FBVyxDQUFDLENBQUMsQ0FBQztJQUUvRyxtQkFBbUI7SUFDbkIsTUFBTSxVQUFVLEdBQUcsSUFBSSxVQUFVLENBQUMsVUFBVSxFQUFFLGNBQWMsRUFBRSxrQkFBa0IsRUFBRSxnQkFBZ0IsQ0FBQyxDQUFDO0lBQ3BHLE1BQU0saUJBQWlCLEdBQUcsWUFBWSxDQUFDLFdBQVcsQ0FBQyxVQUFVLEVBQUUsV0FBVyxDQUFDLENBQUM7SUFDNUUsTUFBTSxDQUFDLGVBQWUsQ0FBQyxtQkFBbUIsQ0FBQyxPQUFPLEVBQUUsaUJBQWlCLENBQUMsQ0FBQztJQUV2RSwrREFBK0Q7SUFDL0QsSUFBSSxpQkFBaUIsRUFBRSxDQUFDO1FBQ3ZCLE1BQU0sQ0FBQyxlQUFlLENBQUMsbUJBQW1CLENBQUMsYUFBYSxFQUFFLGlCQUFpQixDQUFDLENBQUM7SUFDOUUsQ0FBQztJQUVELFdBQVc7SUFDWCxPQUFPLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRSxHQUFHLEVBQUU7UUFDekIsVUFBVSxDQUFDLEtBQUssQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO1FBQ3JDLFVBQVUsQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUNyQixnQkFBZ0IsQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUMzQixVQUFVLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDdEIsQ0FBQyxDQUFDLENBQUM7QUFDSixDQUFDIn0=