import * as Proto from 'typescript/lib/protocol';
export = Proto;

declare module "typescript/lib/protocol" {
	// TODO: Remove this hardcoded type once we update to TS 3.8+ that brings in the proper types
	interface Response {
		performanceData?: {
			updateGraphDurationMs?: number;
		}
	}
}
