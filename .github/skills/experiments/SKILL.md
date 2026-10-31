---
name: experiments
description: Use when adding, changing, or reviewing a VS Code A/B experiment, either an experiment-controlled setting or a treatment read with the assignment service, and when deciding whether and where to log an `experimentTrigger` event for a triggered ExP scorecard.
---

# Experiments

## Controlling behavior

- **Experiment-controlled setting:** add `experiment: { mode: 'auto' }` to the setting's schema, or `mode: 'startup'` to only pick up changed assignments on startup. ExP then sets the setting's default through the treatment `config.<setting id>` (or `experiment.name`), and code reads the setting with `IConfigurationService` as usual. Values that users set themselves still win. Use this when users could reasonably choose the behavior themselves.
- **Treatment:** read a value with `IWorkbenchAssignmentService.getTreatment<T>(name)`. It resolves to `undefined` without an assignment, so keep a fallback, and read it again on `onDidRefetchAssignments`. Use this for values that are not user preferences, such as copy or variant names.

To try an assignment locally, set `experiments.override.<treatment name>` in your user settings, for example `"experiments.override.config.chat.mySetting.enabled": true`.

## Trigger events for triggered scorecards

A triggered scorecard only compares users who reached the moment where control and treatment behave differently, so users that the experiment never affected don't dilute the result. Log that moment with the helpers in [experimentTrigger.ts](../../../src/vs/platform/telemetry/common/experimentTrigger.ts):

```ts
logSettingExperimentTrigger(telemetryService, MY_SETTING_ID); // experiment-controlled setting
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
