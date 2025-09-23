/*
 * event-types.ts
 *
 * Copyright (C) 2022 by Posit Software, PBC
 *
 * Unless you have received this program directly from Posit Software pursuant
 * to the terms of a commercial license agreement with Posit Software, then
 * this program is licensed to you under the terms of version 3 of the
 * GNU Affero General Public License. This program is distributed WITHOUT
 * ANY EXPRESS OR IMPLIED WARRANTY, INCLUDING THOSE OF NON-INFRINGEMENT,
 * MERCHANTABILITY OR FITNESS FOR A PARTICULAR PURPOSE. Please refer to the
 * AGPL (http://www.gnu.org/licenses/agpl-3.0.txt) for more details.
 *
 */

import { Transaction } from 'prosemirror-state';
import { Node as ProsemirrorNode } from 'prosemirror-model';

import { makeEventType } from './events';
import { Navigation } from './navigation-types';

export const UpdateEvent = makeEventType('Update');
export const OutlineChangeEvent = makeEventType('OutlineChange');
export const StateChangeEvent = makeEventType('StateChange');
export const ResizeEvent = makeEventType('Resize');
export const LayoutEvent = makeEventType('Layout');
export const ScrollEvent = makeEventType('Scroll');
export const BlurEvent = makeEventType('Blur');
export const FocusEvent = makeEventType<ProsemirrorNode>('Focus');
export const DispatchEvent = makeEventType<Transaction>('Dispatch');
export const NavigateEvent = makeEventType<Navigation>('Navigate');
export const PrefsChangedEvent =  makeEventType('PrefsChanged');
export const ThemeChangedEvent = makeEventType('ThemeChanged');

/**
 * Represents an event type; only a single instance of this should exist per
 * event type (akin to PluginKey) and it should be visible to everyone who wants
 * to subscribe to or emit events of that type. Do not create one of these
 * directly, instead use makeEventType().
 */
 export interface EventType<TDetail> {
  readonly eventName: string;
  // This field is needed only to prevent TDetail from being ignored by the type
  // checker; if TDetail isn't used, tsc acts as if EventType isn't generic.
  readonly dummy?: TDetail;
}

/**
 * Type signature of event-handler functions; the TDetail must match with the
 * EventType<TDetail> being subscribed to.
 *
 * (Note that the detail is always optional. I couldn't figure out how to make
 * it mandatory for some event types, forbidden for others, and optional for
 * still others, so it's just optional for everyone.)
 */
export type EventHandler<TDetail> = (detail?: TDetail) => void;

/**
 * Generic interface for objects that support eventing.
 *
 * TODO: I don't see a reason why this interface should support both
 * subscription *and* emitting, the latter seems like something private.
 */
export interface EditorEvents {
  subscribe<TDetail>(event: EventType<TDetail>, handler: EventHandler<TDetail>): VoidFunction;
  emit<TDetail>(event: EventType<TDetail>, detail?: TDetail): void;
}

