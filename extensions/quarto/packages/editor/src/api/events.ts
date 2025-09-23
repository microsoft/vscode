/*
 * events.ts
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

import { EditorEvents, EventHandler, EventType } from "./event-types";


/**
 * Creates a new type of event. Use the TDetail type parameter to indicate the
 * type of data, if any, that event handlers can expect.
 */
export function makeEventType<TDetail = void>(eventName: string) {
  return { eventName: `panmirror${eventName}` } as EventType<TDetail>;
}

/**
 * An implementation of EditorEvents, using the DOM event system.
 */
export class DOMEditorEvents implements EditorEvents {
  private readonly el: HTMLElement;

  constructor(el: HTMLElement) {
    this.el = el;
  }

  public emit<TDetail>(eventType: EventType<TDetail>, detail?: TDetail) {
    // Note: CustomEvent requires polyfill for IE, see
    // https://developer.mozilla.org/en-US/docs/Web/API/CustomEvent/CustomEvent
    const event = new CustomEvent(eventType.eventName, { detail });
    return this.el.dispatchEvent(event);
  }

  public subscribe<TDetail>(eventType: EventType<TDetail>, handler: EventHandler<TDetail>) {
    const listener = function(this: unknown, evt: Event) {
      const detail: TDetail | undefined = (evt as CustomEvent).detail;
      handler.call(this, detail);
    };
    this.el.addEventListener(eventType.eventName, listener);
    return () => {
      this.el.removeEventListener(eventType.eventName, listener);
    };
  }
}
