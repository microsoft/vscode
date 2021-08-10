/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Gitpod. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { registerRemoteTerminal } from 'vs/server/node/remote-terminal';
import { main } from 'vs/server/node/server.main';

main({
	start: (services, channelServer) => {
		registerRemoteTerminal(services, channelServer);
	}
});
