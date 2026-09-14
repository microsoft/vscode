/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Kente Workbench contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { GovernanceOutcome, GovernanceRiskTier, GovernedActionKind } from './governance.js';

/**
 * One decision, as recorded. Entries are append-only and never rewritten: an
 * audit log that can be edited after the fact answers no useful question.
 */
export interface IAuditEntry {
	readonly id: string;
	/** ISO 8601, UTC. */
	readonly timestamp: string;
	readonly sessionId: string;
	readonly kind: GovernedActionKind;
	readonly name: string;
	readonly origin: string;
	readonly tier: GovernanceRiskTier;
	readonly outcome: GovernanceOutcome;
	readonly approvalRequested: boolean;
	readonly reason: string;
	readonly commandLine?: string;
	readonly detail?: Readonly<Record<string, string | number | boolean>>;
}

/**
 * Where audit entries go. Separated from the log itself so the gate can be
 * tested without a file system, and so a deployment can add a second sink
 * (a collector, say) without touching the gate.
 */
export interface IAuditSink {
	append(entry: IAuditEntry): Promise<void>;
}

/** Keeps entries in memory. For tests, and for sessions with no writable log path. */
export class InMemoryAuditSink implements IAuditSink {

	private readonly _entries: IAuditEntry[] = [];

	get entries(): readonly IAuditEntry[] {
		return this._entries;
	}

	async append(entry: IAuditEntry): Promise<void> {
		this._entries.push(entry);
	}
}

/**
 * Fans an entry out to several sinks.
 *
 * A sink that throws must not prevent the others from receiving the entry, nor
 * bring down the caller: the gate treats a failed write as a reason to deny,
 * and it can only do that if the write reports failure rather than escaping.
 */
export class MultiplexAuditSink implements IAuditSink {

	constructor(private readonly sinks: readonly IAuditSink[]) { }

	async append(entry: IAuditEntry): Promise<void> {
		const results = await Promise.allSettled(this.sinks.map(sink => sink.append(entry)));
		const failures = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
		if (failures.length === this.sinks.length && this.sinks.length > 0) {
			throw new Error(`every audit sink failed: ${failures.map(failure => failure.reason).join('; ')}`);
		}
	}
}
