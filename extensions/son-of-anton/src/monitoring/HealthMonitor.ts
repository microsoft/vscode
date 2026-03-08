/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

/**
 * Health status of a monitored component.
 */
export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';

/**
 * Health check result for a single component.
 */
export interface HealthCheckResult {
	component: string;
	status: HealthStatus;
	latencyMs: number;
	lastChecked: number;
	details: string;
	consecutiveFailures: number;
}

/**
 * Alert triggered by health monitoring.
 */
export interface HealthAlert {
	id: string;
	component: string;
	severity: 'critical' | 'warning' | 'info';
	message: string;
	timestamp: number;
	acknowledged: boolean;
	resolvedAt: number | null;
}

/**
 * Alert rule configuration.
 */
export interface AlertRule {
	component: string;
	condition: 'down' | 'stale' | 'error-rate' | 'failure-rate';
	threshold: number;
	severity: 'critical' | 'warning' | 'info';
	message: string;
}

/**
 * Overall system health summary.
 */
export interface SystemHealth {
	overallStatus: HealthStatus;
	components: HealthCheckResult[];
	activeAlerts: HealthAlert[];
	lastFullCheck: number;
}

const DEFAULT_CHECK_INTERVAL_MS = 60_000; // 1 minute
const MAX_CONSECUTIVE_FAILURES = 3;

const DEFAULT_ALERT_RULES: AlertRule[] = [
	{
		component: 'falkordb',
		condition: 'down',
		threshold: 1,
		severity: 'critical',
		message: 'FalkorDB is down — code graph queries will fail',
	},
	{
		component: 'qdrant',
		condition: 'down',
		threshold: 1,
		severity: 'critical',
		message: 'Qdrant is down — semantic search will fail',
	},
	{
		component: 'code-graph',
		condition: 'stale',
		threshold: 3600000, // 1 hour
		severity: 'warning',
		message: 'Code graph more than 1 hour stale — indexer may need attention',
	},
	{
		component: 'mcp-gateway',
		condition: 'down',
		threshold: 1,
		severity: 'critical',
		message: 'MCP server unresponsive — agents cannot access tools',
	},
	{
		component: 'llm-api',
		condition: 'error-rate',
		threshold: 0.05,
		severity: 'warning',
		message: 'LLM API error rate above 5% — check API key and rate limits',
	},
	{
		component: 'agent-tasks',
		condition: 'failure-rate',
		threshold: 0.20,
		severity: 'warning',
		message: 'Agent task failure rate above 20% — review agent configuration',
	},
];

/**
 * HealthMonitor — monitors backend services and triggers alerts.
 *
 * Responsibilities:
 * 1. Periodic health checks for FalkorDB, Qdrant, MCP gateway
 * 2. Code graph staleness detection
 * 3. LLM API error rate monitoring
 * 4. Agent task failure rate monitoring
 * 5. Alert management with acknowledgment
 */
export class HealthMonitor {
	private readonly healthResults = new Map<string, HealthCheckResult>();
	private readonly alerts: HealthAlert[] = [];
	private readonly alertRules: AlertRule[];
	private readonly onAlertCallbacks: Array<(alert: HealthAlert) => void> = [];

	private checkTimer: ReturnType<typeof setInterval> | undefined;
	private readonly checkIntervalMs: number;
	private nextAlertId = 1;

	// Counters for rate-based alerts
	private readonly errorCounters = new Map<string, { errors: number; total: number }>();

	constructor(options?: {
		checkIntervalMs?: number;
		alertRules?: AlertRule[];
	}) {
		this.checkIntervalMs = options?.checkIntervalMs ?? DEFAULT_CHECK_INTERVAL_MS;
		this.alertRules = options?.alertRules ?? [...DEFAULT_ALERT_RULES];
	}

	/**
	 * Start periodic health monitoring.
	 */
	start(): void {
		this.checkTimer = setInterval(() => {
			this.runChecks();
		}, this.checkIntervalMs);

		// Run initial check immediately
		this.runChecks();
	}

	/**
	 * Stop health monitoring.
	 */
	stop(): void {
		if (this.checkTimer) {
			clearInterval(this.checkTimer);
			this.checkTimer = undefined;
		}
	}

	/**
	 * Record a health check result for a component.
	 */
	recordHealthCheck(
		component: string,
		status: HealthStatus,
		latencyMs: number,
		details: string = '',
	): HealthCheckResult {
		const existing = this.healthResults.get(component);
		const consecutiveFailures = status === 'unhealthy'
			? (existing?.consecutiveFailures ?? 0) + 1
			: 0;

		const result: HealthCheckResult = {
			component,
			status,
			latencyMs,
			lastChecked: Date.now(),
			details,
			consecutiveFailures,
		};

		this.healthResults.set(component, result);

		// Check alert rules
		this.evaluateAlertRules(result);

		// Auto-resolve alerts if component recovers
		if (status === 'healthy') {
			this.resolveAlertsForComponent(component);
		}

		return result;
	}

	/**
	 * Record an error for rate-based monitoring.
	 */
	recordError(component: string, isError: boolean): void {
		let counter = this.errorCounters.get(component);
		if (!counter) {
			counter = { errors: 0, total: 0 };
			this.errorCounters.set(component, counter);
		}

		counter.total++;
		if (isError) {
			counter.errors++;
		}

		// Evaluate error rate
		const rate = counter.total > 10 ? counter.errors / counter.total : 0;
		for (const rule of this.alertRules) {
			if (rule.component === component && (rule.condition === 'error-rate' || rule.condition === 'failure-rate')) {
				if (rate > rule.threshold) {
					this.createAlert(component, rule.severity, rule.message);
				}
			}
		}
	}

	/**
	 * Get the overall system health.
	 */
	getSystemHealth(): SystemHealth {
		const components = [...this.healthResults.values()];
		const activeAlerts = this.alerts.filter(a => !a.acknowledged && a.resolvedAt === null);

		let overallStatus: HealthStatus = 'healthy';
		for (const component of components) {
			if (component.status === 'unhealthy') {
				overallStatus = 'unhealthy';
				break;
			}
			if (component.status === 'degraded') {
				overallStatus = 'degraded';
			}
		}

		return {
			overallStatus,
			components,
			activeAlerts,
			lastFullCheck: Date.now(),
		};
	}

	/**
	 * Get all active (unresolved) alerts.
	 */
	getActiveAlerts(): HealthAlert[] {
		return this.alerts.filter(a => a.resolvedAt === null && !a.acknowledged);
	}

	/**
	 * Acknowledge an alert.
	 */
	acknowledgeAlert(alertId: string): boolean {
		const alert = this.alerts.find(a => a.id === alertId);
		if (alert) {
			alert.acknowledged = true;
			return true;
		}
		return false;
	}

	/**
	 * Register a callback for new alerts.
	 */
	onAlert(callback: (alert: HealthAlert) => void): void {
		this.onAlertCallbacks.push(callback);
	}

	/**
	 * Format the system health as a human-readable summary.
	 */
	formatSummary(): string {
		const health = this.getSystemHealth();
		const lines: string[] = ['## System Health\n'];

		const statusEmoji: Record<HealthStatus, string> = {
			healthy: '[OK]',
			degraded: '[WARN]',
			unhealthy: '[FAIL]',
			unknown: '[?]',
		};

		lines.push(`**Overall:** ${statusEmoji[health.overallStatus]} ${health.overallStatus.toUpperCase()}\n`);

		// Components
		lines.push('### Components\n');
		lines.push('| Component | Status | Latency | Last Checked |');
		lines.push('|---|---|---|---|');
		for (const c of health.components) {
			const lastChecked = new Date(c.lastChecked).toLocaleTimeString();
			lines.push(
				`| ${c.component} | ${statusEmoji[c.status]} ${c.status} ` +
				`| ${c.latencyMs}ms | ${lastChecked} |`
			);
		}
		lines.push('');

		// Active alerts
		if (health.activeAlerts.length > 0) {
			lines.push('### Active Alerts\n');
			for (const alert of health.activeAlerts) {
				const time = new Date(alert.timestamp).toLocaleString();
				lines.push(`- **[${alert.severity.toUpperCase()}]** ${alert.message} (${time})`);
			}
		} else {
			lines.push('### Alerts\n\nNo active alerts.');
		}

		return lines.join('\n');
	}

	/**
	 * Persist health data to the workspace.
	 */
	async persistHealth(): Promise<void> {
		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders?.length) {
			return;
		}

		const metricsDir = vscode.Uri.joinPath(
			workspaceFolders[0].uri,
			'.son-of-anton',
			'metrics',
		);
		await vscode.workspace.fs.createDirectory(metricsDir);

		const health = this.getSystemHealth();
		const content = Buffer.from(JSON.stringify(health, null, '\t'));
		const fileUri = vscode.Uri.joinPath(metricsDir, 'health-status.json');
		await vscode.workspace.fs.writeFile(fileUri, content);
	}

	/**
	 * Dispose of timers and resources.
	 */
	dispose(): void {
		this.stop();
	}

	private runChecks(): void {
		// Check for stale components
		for (const [component, result] of this.healthResults.entries()) {
			const staleness = Date.now() - result.lastChecked;
			for (const rule of this.alertRules) {
				if (rule.component === component && rule.condition === 'stale') {
					if (staleness > rule.threshold) {
						this.createAlert(component, rule.severity, rule.message);
					}
				}
			}
		}
	}

	private evaluateAlertRules(result: HealthCheckResult): void {
		for (const rule of this.alertRules) {
			if (rule.component !== result.component) {
				continue;
			}

			if (rule.condition === 'down' && result.status === 'unhealthy') {
				if (result.consecutiveFailures >= rule.threshold) {
					this.createAlert(result.component, rule.severity, rule.message);
				}
			}
		}
	}

	private createAlert(component: string, severity: HealthAlert['severity'], message: string): void {
		// Don't duplicate active alerts for the same component
		const existing = this.alerts.find(
			a => a.component === component && a.resolvedAt === null && !a.acknowledged
		);
		if (existing) {
			return;
		}

		const alert: HealthAlert = {
			id: `alert-${this.nextAlertId++}`,
			component,
			severity,
			message,
			timestamp: Date.now(),
			acknowledged: false,
			resolvedAt: null,
		};

		this.alerts.push(alert);

		// Fire callbacks
		for (const cb of this.onAlertCallbacks) {
			cb(alert);
		}

		// Show VS Code notification for critical alerts
		if (severity === 'critical') {
			vscode.window.showErrorMessage(`[Son of Anton] ${message}`);
		} else if (severity === 'warning') {
			vscode.window.showWarningMessage(`[Son of Anton] ${message}`);
		}
	}

	private resolveAlertsForComponent(component: string): void {
		for (const alert of this.alerts) {
			if (alert.component === component && alert.resolvedAt === null) {
				alert.resolvedAt = Date.now();
			}
		}
	}
}
