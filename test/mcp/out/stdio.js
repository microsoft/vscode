"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
const stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
const automation_1 = require("./automation");
const scenario_1 = require("../../scenario");
const transport = new stdio_js_1.StdioServerTransport();
(async () => {
    const appService = new scenario_1.ApplicationService();
    const server = await (0, automation_1.getServer)(appService);
    if (scenario_1.opts.autostart) {
        await appService.getOrCreateApplication();
    }
    await server.connect(transport);
})().catch(err => {
    transport.close();
    console.error('Error occurred while connecting to server:', err);
    process.exit(1);
});
//# sourceMappingURL=stdio.js.map