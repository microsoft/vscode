/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAction } from '../../base/common/actions.js';
import Severity from '../../base/common/severity.js';
import { StopWatch } from '../../base/common/stopwatch.js';
import { getNotificationActionTelemetry, INotificationTelemetrySource, NotificationActionTelemetryId } from '../../platform/notification/common/notificationTelemetry.js';
import { ITelemetryService } from '../../platform/telemetry/common/telemetry.js';
import type { INotificationViewItem } from './notifications.js';

export type NotificationTelemetrySurface = 'toast' | 'center' | 'accessibleView';
export type NotificationInteraction = 'primaryAction' | 'secondaryAction' | 'progressCancel' | 'dismiss' | 'clearAll' | 'expand' | 'collapse' | 'copy' | 'configure' | 'link';

export type NotificationShownEvent = INotificationTelemetrySource & {
	instanceId: number;
	surface: NotificationTelemetrySurface | 'unknown';
	severity: 'info' | 'warning' | 'error' | 'unknown';
	hasProgress: boolean;
	cancellable: boolean;
};

export type NotificationShownClassification = {
	owner: 'benibenj';
	comment: 'A workbench notification was rendered in a visible viewport, once per logical notification and surface.';
	origin: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Core, extension, or unknown attribution.' };
	notificationId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Audited code-defined notification or operation type; never a deduplication ID or derived from content.' };
	extensionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Publisher.extension from a trusted extension bridge, or none/unknown. Never a display source.' };
	instanceId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Ephemeral renderer-local sequence for joining exposures and interactions; not persisted.' };
	surface: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Invoking or last observed surface: toast, notification center, accessible view, or unknown.' };
	severity: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Info, warning, error, or unknown.' };
	hasProgress: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the notification currently has active progress.' };
	cancellable: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether an enabled, explicitly annotated progress cancellation action is available.' };
};

export type NotificationInteractionEvent = NotificationShownEvent & {
	interaction: NotificationInteraction;
	actionId: NotificationActionTelemetryId | 'unknown';
	actionRole: 'primary' | 'secondary' | 'none';
	extensionButtonIndex: number;
	timeSinceShownMs: number;
};

export type NotificationInteractionClassification = Omit<NotificationShownClassification, 'comment'> & {
	comment: 'An explicit workbench notification interaction was invoked, not necessarily completed successfully. Do not add legacy workbenchActionExecuted counts.';
	interaction: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Bounded user interaction; automatic removal, layout changes, and timeout are excluded.' };
	actionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Audited action semantic ID or unknown, never an arbitrary IAction.id or label.' };
	actionRole: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Primary, secondary, or none for non-action interactions.' };
	extensionButtonIndex: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Extension message button position, or -1. Position conveys no semantic meaning.' };
	timeSinceShownMs: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Milliseconds since first actual exposure on any surface, or -1 if never exposed.' };
};

interface INotificationTelemetryState {
	readonly instanceId: number;
	readonly shownSurfaces: Set<NotificationTelemetrySurface>;
	firstShown?: StopWatch;
	lastSurface?: NotificationTelemetrySurface;
}

let instanceId = 0;
const states = new WeakMap<INotificationViewItem, INotificationTelemetryState>();

function getState(item: INotificationViewItem): INotificationTelemetryState {
	let state = states.get(item);
	if (!state) {
		state = { instanceId: ++instanceId, shownSurfaces: new Set() };
		states.set(item, state);
	}
	return state;
}

/** Deduplication can replace a view item without presenting a new logical notification. */
export function inheritNotificationTelemetry(duplicate: INotificationViewItem, replacement: INotificationViewItem): void {
	if (duplicate.telemetry.origin === replacement.telemetry.origin && duplicate.telemetry.notificationId === replacement.telemetry.notificationId && duplicate.telemetry.extensionId === replacement.telemetry.extensionId) {
		states.set(replacement, getState(duplicate));
	}
}

function getEvent(item: INotificationViewItem, surface?: NotificationTelemetrySurface): NotificationShownEvent {
	const state = getState(item);
	return {
		origin: item.telemetry.origin,
		notificationId: item.telemetry.notificationId,
		extensionId: item.telemetry.extensionId,
		instanceId: state.instanceId,
		surface: surface ?? state.lastSurface ?? 'unknown',
		severity: item.severity === Severity.Info ? 'info' : item.severity === Severity.Warning ? 'warning' : item.severity === Severity.Error ? 'error' : 'unknown',
		hasProgress: item.hasActiveProgress,
		cancellable: item.hasActiveProgress && !!item.actions?.primary?.some(action => action.enabled && getNotificationActionTelemetry(action) === NotificationActionTelemetryId.ProgressCancel)
	};
}

export function logNotificationShown(telemetryService: ITelemetryService, item: INotificationViewItem, surface: NotificationTelemetrySurface): void {
	const state = getState(item);
	state.lastSurface = surface;
	if (state.shownSurfaces.has(surface)) {
		return;
	}
	state.shownSurfaces.add(surface);
	state.firstShown ??= StopWatch.create();
	telemetryService.publicLog2<NotificationShownEvent, NotificationShownClassification>('notificationShown', getEvent(item, surface));
}

export function logNotificationInteraction(telemetryService: ITelemetryService, item: INotificationViewItem, interaction: NotificationInteraction, surface?: NotificationTelemetrySurface, action?: IAction, actionRole: 'primary' | 'secondary' | 'none' = 'none'): void {
	if (surface) {
		getState(item).lastSurface = surface;
	}
	const metadata = action && getNotificationActionTelemetry(action);
	telemetryService.publicLog2<NotificationInteractionEvent, NotificationInteractionClassification>('notificationInteraction', {
		...getEvent(item, surface),
		interaction,
		actionId: typeof metadata === 'string' ? metadata : 'unknown',
		actionRole,
		extensionButtonIndex: item.telemetry.origin === 'extension' && typeof metadata === 'object' ? metadata.extensionButtonIndex : -1,
		timeSinceShownMs: getState(item).firstShown?.elapsed() ?? -1
	});
}

export function logNotificationAction(telemetryService: ITelemetryService, item: INotificationViewItem, action: IAction, surface?: NotificationTelemetrySurface): void {
	if (!action.enabled) {
		return;
	}
	if (surface) {
		// Toolbar actions can delegate to commands, which receive only the notification.
		getState(item).lastSurface = surface;
	}
	const primary = item.actions?.primary?.some((candidate: IAction & { readonly menu?: readonly IAction[] }) =>
		candidate === action || (Array.isArray(candidate.menu) && candidate.menu.includes(action)));
	const secondary = item.actions?.secondary?.includes(action);
	const metadata = getNotificationActionTelemetry(action);
	if (primary || secondary) {
		logNotificationInteraction(telemetryService, item, metadata === NotificationActionTelemetryId.ProgressCancel ? 'progressCancel' : primary ? 'primaryAction' : 'secondaryAction', surface, action, primary ? 'primary' : 'secondary');
	} else if (metadata === NotificationActionTelemetryId.Copy || metadata === NotificationActionTelemetryId.Configure) {
		logNotificationInteraction(telemetryService, item, metadata === NotificationActionTelemetryId.Copy ? 'copy' : 'configure', surface, action);
	}
}

export function logNotificationExpansion(telemetryService: ITelemetryService, item: INotificationViewItem, expanded: boolean, surface?: NotificationTelemetrySurface): void {
	if (item.canCollapse && item.expanded !== expanded) {
		logNotificationInteraction(telemetryService, item, expanded ? 'expand' : 'collapse', surface);
	}
}
