export interface Walkthrough {
	taskId: string;
	specialist: string;
	summary: string;
	decisions: WalkthroughDecision[];
	filesChanged: FileChangeSummary[];
	specsReferenced: string[];
	graphContext: string[];
	risksAndTradeoffs: string[];
	confidence: 'high' | 'medium' | 'low';
	generatedAt: number;
}

export interface WalkthroughDecision {
	what: string;
	why: string;
	alternatives: string[];
	source: string;
}

export interface FileChangeSummary {
	path: string;
	action: 'create' | 'modify' | 'delete';
	description: string;
	linesAdded: number;
	linesRemoved: number;
}

export interface WalkthroughGenerateRequest {
	taskId: string;
	taskDescription: string;
	specialist: string;
	diff: string;
	graphQueries?: string[];
	specReferences?: string[];
	traceData?: string;
}

export interface WalkthroughRenderOptions {
	format: 'text' | 'markdown' | 'json';
	includeTraces?: boolean;
}
