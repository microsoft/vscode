/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { equals } from '../../../../../../base/common/objects.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import { AGENT_HOST_AUTOMATIONS_ENABLED_CONFIG_KEY, AGENT_HOST_AUTOMATION_MIGRATION_CONFIG_KEY } from '../../../../common/automationMigration.js';
import type { FetchAutomationRunsResult, InitializeResult, ListAutomationTriggerDefinitionsResult, SubscribeResult } from '../../../../common/state/protocol/commands.js';
import { AutomationOperation, type AutomationDefinition, type AutomationEntry } from '../../../../common/state/protocol/state.js';
import { PROTOCOL_VERSION } from '../../../../common/state/protocol/version/registry.js';
import { ActionType, type AutomationRemovedAction, type AutomationSetAction } from '../../../../common/state/sessionActions.js';
import type { AhpNotification } from '../../../../common/state/sessionProtocol.js';
import { AUTOMATION_CATALOG_URI, MessageKind, ROOT_STATE_URI, type AutomationState, type RootState } from '../../../../common/state/sessionState.js';
import { getActionEnvelope, isActionNotification } from '../../serverIntegrationTestHelpers.js';
import { conformanceTest, type IAgentHostE2ETestContext } from './e2eTestContext.js';

/** The migration gate's message, checked before the enablement gate's. */
const MIGRATION_REQUIRED_MESSAGE = 'Automation migration must complete before automations can be accessed or run.';
const AUTOMATIONS_DISABLED_MESSAGE = 'Automations are disabled.';
/** Mirrors the host's advertised `runHistoryLimit`. */
const RUN_HISTORY_LIMIT = 50;

const UNGATED_OPERATIONS = [AutomationOperation.Update, AutomationOperation.Remove];
const GATED_OPERATIONS = [AutomationOperation.Update, AutomationOperation.Remove, AutomationOperation.Run];

/**
 * The host-owned automation catalogue, exercised entirely over AHP.
 *
 * Everything here stays on the host side of the model boundary: an automation
 * is only a durable definition until something starts a run, and no test here
 * runs one. Every definition is therefore manual-only (`triggers: []`), which
 * also keeps the host's cron scheduler — which reads the real clock and has no
 * injectable seam — out of the suite.
 */
export function defineAutomationsTests(context: IAgentHostE2ETestContext): void {
	const { config } = context;
	let clientSeq = 1;

	function nextClientSeq(): number {
		return clientSeq++;
	}

	async function initializeRoot(prefix: string): Promise<InitializeResult> {
		return context.client.call<InitializeResult>('initialize', {
			channel: ROOT_STATE_URI,
			protocolVersions: [PROTOCOL_VERSION],
			clientId: `${prefix}-${config.provider}`,
		}, 30_000);
	}

	async function rootConfigValues(): Promise<Readonly<Record<string, unknown>>> {
		const result = await context.client.call<SubscribeResult>('subscribe', { channel: ROOT_STATE_URI });
		return (result.snapshot!.state as RootState).config?.values ?? {};
	}

	/**
	 * Replaces one root-config value, skipping the dispatch when the host already
	 * holds it. An unchanged patch is a deliberate no-op in the state manager: it
	 * emits no action at all, so waiting for the echo would hang. Both automation
	 * gates are durable for the life of the shared host, so tests re-open them
	 * defensively and hit that no-op constantly.
	 */
	async function setRootConfigValue(key: string, value: unknown): Promise<void> {
		if (equals((await rootConfigValues())[key], value)) {
			return;
		}
		const seq = nextClientSeq();
		context.client.dispatch({
			channel: ROOT_STATE_URI,
			clientSeq: seq,
			action: { type: ActionType.RootConfigChanged, config: { [key]: value } },
		});
		await context.client.waitForNotification(notification =>
			isActionNotification(notification, ActionType.RootConfigChanged)
			&& getActionEnvelope(notification).channel === ROOT_STATE_URI
			&& getActionEnvelope(notification).origin?.clientSeq === seq,
		);
	}

	function setAutomationsEnabled(enabled: boolean): Promise<void> {
		return setRootConfigValue(AGENT_HOST_AUTOMATIONS_ENABLED_CONFIG_KEY, enabled);
	}

	/**
	 * Completes automation migration. The host requires this as an isolated
	 * root-config patch and refuses it while automations are disabled, so it is
	 * always dispatched on its own and after {@link setAutomationsEnabled}.
	 */
	function completeAutomationMigration(): Promise<void> {
		return setRootConfigValue(AGENT_HOST_AUTOMATION_MIGRATION_CONFIG_KEY, { version: 1, status: 'complete', resources: [] });
	}

	/** Opens both gates. Idempotent, so each test can stand on its own. */
	async function openAutomationGates(): Promise<void> {
		await setAutomationsEnabled(true);
		await completeAutomationMigration();
	}

	async function subscribeCatalog(): Promise<AutomationState> {
		const result = await context.client.call<SubscribeResult>('subscribe', { channel: AUTOMATION_CATALOG_URI });
		return result.snapshot!.state as AutomationState;
	}

	function automationResource(prefix: string): string {
		return `ahp-automation:/${prefix}-${generateUuid()}`;
	}

	function buildDefinition(title: string): AutomationDefinition {
		return {
			title,
			// An automation message must declare an automation origin, and an empty
			// session template is enough for a definition that is never run.
			message: { text: 'Reply exactly "ran".', origin: { kind: MessageKind.Automation } },
			session: {},
			enabled: false,
			triggers: [],
		};
	}

	function automationSetFor(resource: string, accept: (automation: AutomationEntry) => boolean): (notification: AhpNotification) => boolean {
		return notification => {
			if (!isActionNotification(notification, ActionType.AutomationSet) || getActionEnvelope(notification).channel !== AUTOMATION_CATALOG_URI) {
				return false;
			}
			const { automation } = getActionEnvelope(notification).action as AutomationSetAction;
			return automation.resource === resource && accept(automation);
		};
	}

	/**
	 * Waits for the authoritative `automation/set` the host publishes after it has
	 * persisted a mutation. The client's own `automation/createRequested` is never
	 * echoed back, so this is the only accept signal; a failed mutation instead
	 * comes back as a rejected envelope carrying the request's action type.
	 */
	async function waitForAutomationSet(resource: string, accept: (automation: AutomationEntry) => boolean = () => true): Promise<AutomationEntry> {
		const notification = await context.client.waitForNotification(automationSetFor(resource, accept));
		return (getActionEnvelope(notification).action as AutomationSetAction).automation;
	}

	async function createAutomation(resource: string, definition: AutomationDefinition): Promise<AutomationEntry> {
		context.client.dispatch({
			channel: AUTOMATION_CATALOG_URI,
			clientSeq: nextClientSeq(),
			action: { type: ActionType.AutomationCreateRequested, resource, definition },
		});
		return waitForAutomationSet(resource);
	}

	/** The message a failed request reported, or a marker when it unexpectedly succeeded. */
	async function rejectionMessage(request: Promise<unknown>): Promise<string> {
		try {
			await request;
			return '<request unexpectedly succeeded>';
		} catch (error) {
			return error instanceof Error ? error.message : String(error);
		}
	}

	function listTriggerDefinitions(): Promise<ListAutomationTriggerDefinitionsResult> {
		return context.client.call<ListAutomationTriggerDefinitionsResult>('listAutomationTriggerDefinitions', { channel: ROOT_STATE_URI });
	}

	function entryFor(catalog: AutomationState, resource: string): AutomationEntry | undefined {
		return catalog.entries.find(entry => entry.resource === resource);
	}

	// Registered first, before anything in this file opens a gate or writes an
	// entry: both assertions describe a host that has never had an automation.
	conformanceTest(context, 'a fresh agent host advertises the automation catalogue and its capabilities', async function () {
		const initialized = await initializeRoot('automations-capabilities');

		const catalog = await subscribeCatalog();

		// The catalogue and its commands are advertised before either gate opens:
		// a client can always render the (empty) catalogue and author into it.
		assert.deepStrictEqual({
			automations: initialized.automations,
			entries: catalog.entries,
		}, {
			automations: { create: {}, schedules: {}, runCancellation: {}, runHistoryLimit: RUN_HISTORY_LIMIT },
			entries: [],
		});
	});

	// Migration completion is durable for the life of the host — including across
	// restarts, since it is stored alongside the catalogue — so this is the only
	// test that can observe the pre-migration gate. It must stay registered ahead
	// of every test that calls `openAutomationGates`.
	conformanceTest(context, 'automation commands are rejected until automations are enabled and migration completes', async function () {
		await initializeRoot('automations-gates');

		const beforeAnyGate = await rejectionMessage(listTriggerDefinitions());
		await setAutomationsEnabled(true);
		const afterEnabling = await rejectionMessage(listTriggerDefinitions());
		await completeAutomationMigration();
		const afterMigration = await listTriggerDefinitions();
		await setAutomationsEnabled(false);
		const afterDisabling = await rejectionMessage(listTriggerDefinitions());
		// Leave the host enabled so a later test does not depend on this one's tail.
		await setAutomationsEnabled(true);

		// The migration gate is checked first, so enabling alone changes nothing.
		// Once both are open the host answers, and the answer is deliberately
		// empty: it defines no event triggers today.
		assert.deepStrictEqual({
			beforeAnyGate: beforeAnyGate.includes(MIGRATION_REQUIRED_MESSAGE),
			afterEnabling: afterEnabling.includes(MIGRATION_REQUIRED_MESSAGE),
			afterMigration,
			afterDisabling: afterDisabling.includes(AUTOMATIONS_DISABLED_MESSAGE),
		}, {
			beforeAnyGate: true,
			afterEnabling: true,
			afterMigration: { items: [] },
			afterDisabling: true,
		});
	});

	conformanceTest(context, 'an automation created while automations are disabled gains its run operation when they are enabled', async function () {
		await initializeRoot('automations-run-grant');
		// Granting `run` needs the enablement flag *and* completed migration.
		// Migration cannot be undone on a host that has already migrated, so the
		// enablement flag is the half of the gate a test can reproduce.
		await openAutomationGates();
		await subscribeCatalog();
		await setAutomationsEnabled(false);
		const resource = automationResource('run-grant');

		context.client.clearReceived();
		const whileDisabled = await createAutomation(resource, buildDefinition('Run grant'));
		context.client.clearReceived();
		await setAutomationsEnabled(true);
		const afterEnabling = await waitForAutomationSet(resource, automation => automation.operations.includes(AutomationOperation.Run));

		// The definition is authored either way; only the operations a client may
		// offer for it change, and the host republishes the entry to say so.
		assert.deepStrictEqual({
			whileDisabled: whileDisabled.operations,
			afterEnabling: afterEnabling.operations,
			title: afterEnabling.definition.title,
		}, {
			whileDisabled: UNGATED_OPERATIONS,
			afterEnabling: GATED_OPERATIONS,
			title: 'Run grant',
		});
	});

	conformanceTest(context, 'creating an automation is idempotent only for an identical definition', async function () {
		await initializeRoot('automations-idempotent-create');
		await openAutomationGates();
		await subscribeCatalog();
		const resource = automationResource('idempotent-create');
		const definition = buildDefinition('Stable definition');
		const created = await createAutomation(resource, definition);

		context.client.clearReceived();
		const repeated = await createAutomation(resource, definition);
		const conflictingDefinition = buildDefinition('Conflicting definition');
		context.client.clearReceived();
		context.client.dispatch({
			channel: AUTOMATION_CATALOG_URI,
			clientSeq: nextClientSeq(),
			action: { type: ActionType.AutomationCreateRequested, resource, definition: conflictingDefinition },
		});
		const rejected = await context.client.waitForNotification(notification =>
			isActionNotification(notification, ActionType.AutomationCreateRequested)
			&& getActionEnvelope(notification).channel === AUTOMATION_CATALOG_URI
			&& getActionEnvelope(notification).rejectionReason !== undefined,
		);

		assert.deepStrictEqual({
			createdAtUnchanged: repeated.createdAt === created.createdAt,
			modifiedAtUnchanged: repeated.modifiedAt === created.modifiedAt,
			title: repeated.definition.title,
			rejection: getActionEnvelope(rejected).rejectionReason,
		}, {
			createdAtUnchanged: true,
			modifiedAtUnchanged: true,
			title: 'Stable definition',
			rejection: `Automation already exists: ${resource}`,
		});
	});

	conformanceTest(context, 'updating and removing an automation keeps the catalogue authoritative', async function () {
		await initializeRoot('automations-update-remove');
		await openAutomationGates();
		await subscribeCatalog();
		const resource = automationResource('update-remove');
		await createAutomation(resource, buildDefinition('Original title'));

		context.client.clearReceived();
		context.client.dispatch({
			channel: AUTOMATION_CATALOG_URI,
			clientSeq: nextClientSeq(),
			action: { type: ActionType.AutomationUpdateRequested, resource, changes: { title: 'Renamed title' } },
		});
		const updated = await waitForAutomationSet(resource);
		context.client.clearReceived();
		context.client.dispatch({
			channel: AUTOMATION_CATALOG_URI,
			clientSeq: nextClientSeq(),
			action: { type: ActionType.AutomationRemoved, resource },
		});
		await context.client.waitForNotification(notification => {
			if (!isActionNotification(notification, ActionType.AutomationRemoved) || getActionEnvelope(notification).channel !== AUTOMATION_CATALOG_URI) {
				return false;
			}
			const envelope = getActionEnvelope(notification) as { rejectionReason?: string; action: AutomationRemovedAction };
			return envelope.action.resource === resource && envelope.rejectionReason === undefined;
		});
		const catalog = await subscribeCatalog();

		// A patch replaces only the fields it names, and removal is republished as
		// the same action so every subscriber converges on the host's catalogue.
		assert.deepStrictEqual({
			updatedTitle: updated.definition.title,
			updatedOperations: updated.operations,
			updatedRuns: updated.runs,
			survivesRemoval: entryFor(catalog, resource) !== undefined,
		}, {
			updatedTitle: 'Renamed title',
			updatedOperations: GATED_OPERATIONS,
			updatedRuns: [],
			survivesRemoval: false,
		});
	});

	conformanceTest(context, 'fetchAutomationRuns acknowledges an automation that has never run and rejects an unknown one', async function () {
		await initializeRoot('automations-fetch-runs');
		await openAutomationGates();
		await subscribeCatalog();
		const resource = automationResource('fetch-runs');
		await createAutomation(resource, buildDefinition('Fetch runs'));
		const unknownResource = automationResource('fetch-runs-unknown');

		const acknowledged = await context.client.call<FetchAutomationRunsResult>('fetchAutomationRuns', {
			channel: AUTOMATION_CATALOG_URI,
			automation: resource,
		});
		const rejected = await rejectionMessage(context.client.call('fetchAutomationRuns', {
			channel: AUTOMATION_CATALOG_URI,
			automation: unknownResource,
		}));
		const catalog = await subscribeCatalog();

		// The result is a bare acknowledgement by contract — run history reaches
		// clients through `automation/set` — so an automation with no history has
		// nothing to page and nothing to republish.
		assert.deepStrictEqual({
			acknowledged,
			runs: entryFor(catalog, resource)?.runs,
			runsNextCursor: entryFor(catalog, resource)?.runsNextCursor,
			rejected: rejected.includes(`Automation not found: ${unknownResource}`),
		}, {
			acknowledged: {},
			runs: [],
			runsNextCursor: undefined,
			rejected: true,
		});
	});

	conformanceTest(context, 'a created automation survives an agent host restart', async function () {
		await initializeRoot('automations-restart');
		await openAutomationGates();
		await subscribeCatalog();
		const resource = automationResource('restart');
		const created = await createAutomation(resource, buildDefinition('Survives restart'));

		await context.restartServer();
		await initializeRoot('automations-restart-verify');
		const restored = entryFor(await subscribeCatalog(), resource);

		// The host persists a mutation before it publishes it, so a definition a
		// client has seen is recoverable — with its operations — after a restart.
		assert.deepStrictEqual({
			created: { title: created.definition.title, operations: created.operations },
			restored: restored && { title: restored.definition.title, operations: restored.operations },
		}, {
			created: { title: 'Survives restart', operations: GATED_OPERATIONS },
			restored: { title: 'Survives restart', operations: GATED_OPERATIONS },
		});
	});
}
