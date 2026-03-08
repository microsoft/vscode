// Copyright (c) Son of Anton Contributors. All rights reserved.
// Licensed under the MIT License.

/**
 * Status of a background task.
 */
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'timeout';

/**
 * Progress state of a background task.
 */
export interface TaskState {
	percentage: number;
	message: string;
}

/**
 * Resource limits for a background task container.
 */
export interface ResourceLimits {
	memoryMb: number;
	cpuCores: number;
	timeoutMs: number;
	maxTokenBudgetUsd: number;
}

/**
 * Token usage tracking for background tasks.
 */
export interface TaskTokenUsage {
	inputTokens: number;
	outputTokens: number;
	estimatedCostUsd: number;
}

/**
 * Configuration for creating a new background task.
 */
export interface TaskConfig {
	name: string;
	description: string;
	image?: string;
	projectPath?: string;
	instructions?: string;
	branch?: string;
	env?: string[];
	resourceLimits?: Partial<ResourceLimits>;
}

/**
 * Persisted state of a background task.
 */
export interface BackgroundTask {
	id: string;
	name: string;
	description: string;
	status: TaskStatus;
	createdAt: number;
	startedAt: number | null;
	completedAt: number | null;
	containerId: string | null;
	progress: TaskState;
	resultDir: string;
	resourceLimits: ResourceLimits;
	tokenUsage: TaskTokenUsage;
	branch: string | null;
	error: string | null;
}
