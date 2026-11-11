---
name: experiments
description: Use when adding, changing, or reviewing a VS Code A/B experiment, either an experiment-controlled setting or a treatment read with the assignment service, and when deciding whether and where to log an `experimentTrigger` event for a triggered ExP scorecard.
---

# Experiments

## Controlling behavior

- **Experiment-controlled setting:** add `experiment: { mode: 'auto' }` to the setting's schema, or `mode: 'startup'` to only pick up changed assignments on startup. ExP then sets the setting's default through the treatment `config.<setting id>` (or `experiment.name`), and code reads the setting with `IConfigurationService` as usual. Values that users set themselves still win. Use this when users could reasonably choose the behavior themselves.
- **Keyed object setting:** treatments can't be objects, so to let separate experiments control separate keys of an object setting, such as one experiment per extension, add `keyed: true` to its `experiment`. ExP then sets each key's default through the treatment `config.<setting id>.<key>`, and the mode applies to each key separately. Treatments can't be enumerated, so a key is only resolved once code requests it with `IExperimentalSettingsService.requestKeys`. Values that users set for a key still win.
- **Treatment:** read a value with `IWorkbenchAssignmentService.getTreatment<T>(name)`. It resolves to `undefined` without an assignment, so keep a fallback, and read it again on `onDidRefetchAssignments`. Use this for values that are not user preferences, such as copy or variant names.

To try an assignment locally, set `experiments.override.<treatment name>` in your user settings, for example `"experiments.override.config.chat.mySetting.enabled": true`.

## Assignment routing

Initialize the core TAS client, cached treatments, and legacy fetching immediately; only new-TAS routing waits for account discovery. A known account can be routed before account initialization completes, but a null account is ambiguous until then. Rebuild the client for an account change only when the old or new routing uses a new-TAS endpoint. Confirmed signed-out sessions, including those configured for GitHub Enterprise/GHES, start with `https://exp.enterprise.githubcopilot.com`, then `https://exp.business.githubcopilot.com`, then `https://exp.individual.githubcopilot.com` (each with `/api/v1/assignments`). These device-only requests overlap only during discovery: launch the next host after 1 second without a valid result, or sooner on a network error, non-success HTTP status, or invalid assignments response. Try each host at most once per fetch, with a single 5-second deadline for the entire discovery. The first valid response wins (including empty assignments); cancel outstanding requests and pending launches. Remember the winning host for the window and try it first on subsequent refreshes without time-based hedging; it fails over only on an error. If the remembered host times out, forget it so the next fetch rediscovers with hedging. If all fail or the deadline expires, reject the provider fetch and retry on the existing refresh schedule. Because tas-client waits for all providers, discovery can delay treatment reads that miss the cache by up to the deadline. Cancellation of a pending request depends on the transport; with the default Copilot Node `https` fetcher, an unanswered losing request can stay open until its socket times out, but its result is ignored. Signed-in accounts never cycle: explicit `exp` remains authoritative, and only confirmed public individual accounts without `exp` use Individual. Signed-in Business, Enterprise, GHE/GHES, and accounts with unknown plans require explicit `exp`; core relies on account-provider updates and its staleness-aware polling, without forcing entitlement requests from assignment refreshes. Copilot re-evaluates routing and both legacy/new targeting on auth/token-data updates, including metadata changes with an unchanged bearer token. The existing token-string event retains its original semantics. Never infer sign-out from a missing token, retain account filters across sign-out, or send cached account identity during anonymous discovery. New assignments still merge with legacy TAS during the transition; legacy is not the routing solution for a missing managed-account endpoint.

Classic vscode.dev without a remote intentionally does not initialize its default-account provider. Core therefore uses device-only discovery there even if another feature has a GitHub session; null account state is not proof of actual sign-out in that environment. Browser TAS requests require the workbench's Content Security Policy (CSP) `connect-src` to allow all three discovery hosts, and each endpoint must support CORS for the page's origin.

Core product experimentation intentionally remains governed by the existing telemetry and experimentation controls, not `chat.disableAIFeatures`. Disabling AI UI does not disable these device-level TAS requests; disabling experiments or the required telemetry level does. Legacy startup/cache results may be consumed before account-specific new assignments arrive, preserving the existing startup behavior rather than gating all experiment lookups on authentication.

## Trigger events for triggered scorecards

A triggered scorecard only compares users who reached the moment where control and treatment behave differently, so users that the experiment never affected don't dilute the result. Log that moment with the helpers in [experimentTrigger.ts](../../../src/vs/platform/telemetry/common/experimentTrigger.ts):

```ts
logSettingExperimentTrigger(telemetryService, MY_SETTING_ID); // experiment-controlled setting
logSettingKeyExperimentTrigger(telemetryService, MY_SETTING_ID, key); // key of a keyed object setting
logExperimentTrigger(telemetryService, 'myTreatment'); // treatment
```

They log the shared `experimentTrigger` event with the treatment name as `treatmentName`, at most once per window or process, so they can run on every evaluation. Base the scorecard's trigger on that event (`monacoworkbench/experimentTrigger`) and its `treatmentName`. Don't add feature-specific trigger events.

### When to use one

Use a trigger when only some assigned users are affected, at an identifiable moment: an action, a surface that only appears in some situations, or a code path that only some sessions reach. Don't use one when:

- nearly every assigned user is affected anyway, like a changed default in a common view;
- no single moment precedes every effect, like a feature switch that also changes commands or agent tools before anything is visible (`chat.agentMerge.enabled`);
- the population is already limited: onboarding experiments (`IOnboardingScenario.experiment`) only attach their assignment context to telemetry from the moment the tour would show.

Prefer no trigger over an approximate one. Dilution only costs statistical power, while a biased trigger gives wrong results.

### When to fire it

Fire it where the code decides between control and treatment behavior, before they differ, under a condition that is the same in every arm.

| The treatment… | Fire when… |
|---|---|
| changes what an action does | the action runs |
| adds UI that control lacks | the UI would render, checked in every arm |
| changes copy or an icon | that UI renders |
| changes a delay | the countdown starts, not when the delayed UI shows |
| changes a default that users can override | the default is visible and no user choice is stored |
| changes background behavior | the diverging code path runs |

```ts
// Checking the setting first would only trigger the treatment arm.
if (isBannerRelevant(context)) {
	logSettingExperimentTrigger(telemetryService, MY_SETTING_ID);
	if (configurationService.getValue<boolean>(MY_SETTING_ID)) {
		showBanner();
	}
}
```

Common pitfalls:

- **State only the treatment writes**, like dismissed or seen flags. Ignore it until the trigger has fired.
- **Data only the treatment computes**, like CI status that is only polled for an indicator. Use an arm-independent superset, or compute it in every arm until the trigger has fired.
- **Missed exposure**, like accessible labels, menus, or features that the setting suppresses. Find every place where the setting or treatment changes behavior, because a user affected before their first trigger biases the result.

Excluding users who can't be affected, such as reduced-motion users for an animation, is fine when the condition is the same in every arm. Agent host telemetry only carries the assignment context once the workbench has forwarded it, so hold earlier triggers until then (see `AgentHostGitStateService`).

Test each trigger in every arm with `TestExperimentTriggerTelemetryService`. After adding or moving a trigger, start a new experiment iteration, because earlier exposures have no trigger events.

## Reporting results

Scorecard results are internal data. A pull request, commit or issue that ships, changes, graduates or removes an experiment describes only the code change. Don't explain the change with the experiment, its rollout or its results, even without numbers, such as "the treatment improved the primary metric" or "the experiment showed no regression"; link its tracking issue instead (see "Public Content" in [copilot-instructions.md](../../copilot-instructions.md)).
