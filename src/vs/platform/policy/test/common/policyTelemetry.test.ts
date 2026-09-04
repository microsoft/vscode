/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../base/common/event.js';
import { IStringDictionary } from '../../../../base/common/collections.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { PolicyName } from '../../../../base/common/policy.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../platform/telemetry/common/telemetryUtils.js';
import { IPolicyService, PolicyDefinition, PolicyValue } from '../../common/policy.js';
import { PolicyTelemetryReporter } from '../../common/policyTelemetry.js';

/**
 * Lightweight stub implementing IPolicyService directly to avoid
 * extending AbstractPolicyService and exposing its protected members.
 */
class StubPolicyService extends Disposable implements IPolicyService {
readonly _serviceBrand: undefined;

private readonly _emitter = this._register(new Emitter<readonly PolicyName[]>());
readonly onDidChange = this._emitter.event;

policyDefinitions: IStringDictionary<PolicyDefinition> = {};
private readonly _values = new Map<PolicyName, PolicyValue>();

async updatePolicyDefinitions() { return {}; }

getPolicyValue(name: PolicyName): PolicyValue | undefined {
return this._values.get(name);
}

serialize(): IStringDictionary<{ definition: PolicyDefinition; value: PolicyValue }> {
const result: IStringDictionary<{ definition: PolicyDefinition; value: PolicyValue }> = {};
for (const [name, def] of Object.entries(this.policyDefinitions)) {
result[name] = { definition: def, value: this._values.get(name)! };
}
return result;
}

/** Helper for tests: sets a value + definition and fires the change event. */
setValueAndNotify(name: PolicyName, value: PolicyValue): void {
const typeStr = typeof value === 'number' ? 'number' : typeof value === 'boolean' ? 'boolean' : 'string';
this.policyDefinitions[name] = { type: typeStr };
this._values.set(name, value);
this._emitter.fire([name]);
}
}

function createCapturingTelemetryService(): { service: ITelemetryService; logged: Array<{ event: string; payload: any }> } {
const logged: Array<{ event: string; payload: any }> = [];
const service: ITelemetryService = {
...NullTelemetryService,
publicLog() { },
publicLog2(ev: string, data: any) { logged.push({ event: ev, payload: data }); },
publicLogError() { },
publicLogError2() { },
setExperimentProperty() { },
};
return { service, logged };
}

suite('Policy Telemetry', () => {
const ds = ensureNoDisposablesAreLeakedInTestSuite();

test('reports initial snapshot of policies', () => {
const svc = ds.add(new StubPolicyService());
const { service: tel, logged } = createCapturingTelemetryService();

// Populate three policies *before* creating the reporter
svc.setValueAndNotify('A', 'hello');
svc.setValueAndNotify('B', true);
svc.setValueAndNotify('C', 7);

const reporter = ds.add(new PolicyTelemetryReporter(svc, tel));
reporter.reportInitialSnapshot();

const perPolicy = logged.filter(l => l.event === 'policyValueSet');
assert.strictEqual(perPolicy.length, 3, 'one event per active policy');

const snapshots = logged.filter(l => l.event === 'policyConfigurationSnapshot');
assert.strictEqual(snapshots.length, 1);
assert.strictEqual(snapshots[0].payload.count, 3);
});

test('reports policy changes', () => {
const svc = ds.add(new StubPolicyService());
const { service: tel, logged } = createCapturingTelemetryService();

ds.add(new PolicyTelemetryReporter(svc, tel));

svc.setValueAndNotify('X', 'val');

const events = logged.filter(l => l.event === 'policyValueSet');
assert.strictEqual(events.length, 1);
assert.strictEqual(events[0].payload.name, 'X');
assert.strictEqual(events[0].payload.hasValue, true);
assert.strictEqual(events[0].payload.dataType, 'string');
});

test('reports correct data types', () => {
const svc = ds.add(new StubPolicyService());
const { service: tel, logged } = createCapturingTelemetryService();

ds.add(new PolicyTelemetryReporter(svc, tel));

svc.setValueAndNotify('S', 'abc');
svc.setValueAndNotify('N', 42);
svc.setValueAndNotify('F', false);

const events = logged.filter(l => l.event === 'policyValueSet');
assert.strictEqual(events[0].payload.dataType, 'string');
assert.strictEqual(events[1].payload.dataType, 'number');
assert.strictEqual(events[2].payload.dataType, 'boolean');
});
});
