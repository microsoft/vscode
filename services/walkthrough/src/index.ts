export { WalkthroughGenerator } from './walkthroughGenerator.js';
export { WalkthroughStorage } from './storage.js';
export type {
	Walkthrough,
	WalkthroughDecision,
	FileChangeSummary,
	WalkthroughGenerateRequest,
	WalkthroughRenderOptions,
} from './types.js';
export { createServer, startServer } from './server.js';

import { startServer } from './server.js';

startServer();
