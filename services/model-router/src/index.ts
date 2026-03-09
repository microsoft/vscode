// Copyright (c) Son-Of-Anton. All rights reserved.
// Licensed under the MIT License.

import { createServer } from './server.js';

const port = parseInt(process.env.MODEL_ROUTER_PORT ?? '3200', 10);

const app = createServer();

app.listen(port, () => {
	console.log(`Model Router listening on port ${port}`);
});
