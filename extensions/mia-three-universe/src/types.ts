// src/types.ts — Shared types for the mia-vscode three-universe system
// These types are used across all mia extensions and integration contracts.

// ─── Three Universe Core ─────────────────────────────────────────

export type Universe = 'engineer' | 'ceremony' | 'story';
export type UniverseFocus = Universe | 'balanced';
export type AnalysisDepth = 'quick' | 'standard' | 'deep';
export type DecorationLevel = 'minimal' | 'moderate' | 'rich';

export interface ThreeUniverseResult {
	fileUri: string;
	timestamp: string;
	engineer: UniverseAnalysis;
	ceremony: UniverseAnalysis;
	story: UniverseAnalysis;
	overallSignificance: number; // 1-5
	sessionId?: string;
}

export interface UniverseAnalysis {
	universe: Universe;
	summary: string;
	insights: Insight[];
	coherenceScore: number; // 0-100
	significance: number;   // 1-5
}

export interface Insight {
	id: string;
	description: string;
	location?: { line: number; column?: number; endLine?: number };
	significance: number;
	actionable: boolean;
	suggestion?: string;
}

// ─── Story Beats ────────────────────────────────────────────────

export interface StoryBeat {
	id: string;
	type: 'engineering' | 'relational' | 'narrative' | 'transition' | 'milestone';
	description: string;
	universe: Universe;
	significance: number;
	sessionId: string;
	timestamp: string;
	metadata?: Record<string, unknown>;
}

export interface CreateBeatRequest {
	type: StoryBeat['type'];
	description: string;
	universe?: Universe;
	significance?: number;
	metadata?: Record<string, unknown>;
}

// ─── STC Charts ─────────────────────────────────────────────────

export interface STCChart {
	id: string;
	title: string;
	desiredOutcome: string;
	currentReality: string;
	actionSteps: ActionStep[];
	created: string;
	modified: string;
}

export interface ActionStep {
	id: string;
	description: string;
	completed: boolean;
	order: number;
}

export interface CreateChartRequest {
	title: string;
	desiredOutcome: string;
	currentReality: string;
	actionSteps?: Omit<ActionStep, 'id'>[];
}

export interface ChartProgress {
	chartId: string;
	title: string;
	completedSteps: number;
	totalSteps: number;
}

// ─── Narrative Events ───────────────────────────────────────────

export interface NarrativeEvent {
	id: string;
	type: string;
	timestamp: string;
	sessionId: string;
	universe?: Universe;
	significance: number;
	payload: unknown;
}

export interface BeatCreatedEvent extends NarrativeEvent {
	type: 'beat.created';
	payload: { beat: StoryBeat };
}

export interface AnalysisCompleteEvent extends NarrativeEvent {
	type: 'analysis.complete';
	payload: { fileUri: string; result: ThreeUniverseResult };
}

export type SessionPhase = 'germination' | 'assimilation' | 'completion';

export interface SessionPhaseEvent extends NarrativeEvent {
	type: 'session.phase';
	payload: { phase: SessionPhase; previous: string };
}

export interface CoherenceScores {
	engineer: number;
	ceremony: number;
	story: number;
}

export interface CoherenceUpdateEvent extends NarrativeEvent {
	type: 'coherence.update';
	payload: CoherenceScores;
}

// ─── Agent Chat ─────────────────────────────────────────────────

export interface ChatRequest {
	message: string;
	universe: UniverseFocus;
	context: ChatContext;
}

export interface ChatContext {
	activeFile?: string;
	selection?: string;
	sessionId?: string;
}

export interface ChatChunk {
	content: string;
	universe?: Universe;
	done: boolean;
}

// ─── Session ────────────────────────────────────────────────────

export interface Session {
	id: string;
	intent?: string;
	phase: SessionPhase;
	startedAt: string;
	beatCount: number;
}

export interface ServerHealth {
	status: 'ok' | 'degraded' | 'error';
	version: string;
	uptime: number;
}

// ─── Decomposition (PDE) ────────────────────────────────────────

export interface DecompositionResult {
	id: string;
	actions: DecomposedAction[];
	implicitIntents: string[];
	dependencies: ActionDependency[];
}

export interface DecomposedAction {
	id: string;
	description: string;
	type: 'explicit' | 'implicit';
	priority: number;
}

export interface ActionDependency {
	actionId: string;
	dependsOn: string;
}

// ─── Connection ─────────────────────────────────────────────────

export type ConnectionState = 'connected' | 'connecting' | 'disconnected' | 'reconnecting';

// ─── Shared API (exported by mia.three-universe extension) ──────

export interface MiaAPI {
	getServerUrl(): string;
	isConnected(): boolean;
	getConnectionState(): ConnectionState;
	analyzeFile(uri: string): Promise<ThreeUniverseResult>;
	onNarrativeEvent(handler: (event: NarrativeEvent) => void): { dispose(): void };
	onConnectionStateChanged(handler: (state: ConnectionState) => void): { dispose(): void };
	getOutputChannel(universe: 'engineer' | 'ceremony' | 'story' | 'narrative' | 'server'): any;
	getHttpClient(): MiaHttpClient;
}

// ─── HTTP Client ────────────────────────────────────────────────

export interface MiaHttpClient {
	analyzeThreeUniverse(fileUri: string, content: string): Promise<ThreeUniverseResult>;
	getCharts(): Promise<STCChart[]>;
	createChart(chart: CreateChartRequest): Promise<STCChart>;
	updateChart(id: string, updates: Partial<STCChart>): Promise<STCChart>;
	createBeat(beat: CreateBeatRequest): Promise<StoryBeat>;
	getSessionBeats(sessionId: string): Promise<StoryBeat[]>;
	sendChatMessage(message: ChatRequest): AsyncGenerator<ChatChunk>;
	decompose(prompt: string): Promise<DecompositionResult>;
	getSession(id: string): Promise<Session>;
	createSession(intent?: string): Promise<Session>;
	healthCheck(): Promise<ServerHealth>;
}

// ─── WebSocket Event Bus ────────────────────────────────────────

export interface NarrativeEventBus {
	on(type: 'beat.created', handler: (event: BeatCreatedEvent) => void): { dispose(): void };
	on(type: 'analysis.complete', handler: (event: AnalysisCompleteEvent) => void): { dispose(): void };
	on(type: 'session.phase', handler: (event: SessionPhaseEvent) => void): { dispose(): void };
	on(type: 'coherence.update', handler: (event: CoherenceUpdateEvent) => void): { dispose(): void };
	on(type: '*', handler: (event: NarrativeEvent) => void): { dispose(): void };
}
