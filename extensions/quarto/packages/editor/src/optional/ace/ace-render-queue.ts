/*
 * ace-render-queue.ts
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

import { AceNodeView } from './ace';
import { EditorEvents } from '../../api/event-types';
import { ScrollEvent, UpdateEvent } from '../../api/event-types';

/**
 * Represents a queue of Ace editor instances that are rendered asynchronously.
 */
export class AceRenderQueue {
  private readonly renderQueue: AceNodeView[] = [];

  private renderCompleted = false;
  private renderTimer = 0;
  private updateTimer = 0;
  private container?: HTMLElement;
  private needsSort = true;
  private bypass = 5;
  private observer?: IntersectionObserver;
  private visible = true;
  private readonly subscriptions: VoidFunction[] = [];

  constructor(events: EditorEvents) {
    // Begin listening for scroll and update events so we can manage the queue
    // accordingly
    this.subscriptions.push(
      events.subscribe(ScrollEvent, () => {
        this.onScroll();
      }),
    );
    this.subscriptions.push(
      events.subscribe(UpdateEvent, () => {
        this.onUpdate();
      }),
    );
  }

  /**
   * Sets (or replaces) the scroll container hosting the render queue. The
   * scroll container is used to prioritize the queue (i.e. objects in the
   * viewport or close to it are to be given more priority).
   *
   * @param container The HTML element of the scroll container
   */
  public setContainer(container: HTMLElement) {
    // Skip if we're already looking at this container
    if (this.container === container) {
      return;
    }

    // Clean up observer on any previous container
    if (this.observer) {
      this.observer.disconnect();
    }

    // Save reference to container
    this.container = container;

    // Create intersection observer to ensure that we don't needlessly churn
    // through renders while offscreen.
    this.observer = new IntersectionObserver(
      (entries: IntersectionObserverEntry[]) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !this.visible) {
            // We just became visible; process the render queue now.
            this.visible = true;
            this.processRenderQueue();
          }
          if (!entry.isIntersecting && this.visible) {
            // We just lost visibility; end processing of the render queue. (Note
            // that we only do this when connected to the DOM as another reason
            // the element can become invisible is ProseMirror swapping it out
            // internally.)
            if (this.container?.parentElement) {
              this.visible = false;
              this.cancelTimer();
            }
          }
        }
      },
      {
        root: null,
      },
    );

    // Begin observing intersection events in container
    this.observer.observe(container);
  }

  /**
   * Invoke when the editor surface is scrolled
   */
  private onScroll() {
    // Whenever a scroll event occurs, we need to re-sort the queue so that
    // objects in or closest to the viewport are given priority.
    this.needsSort = true;

    // If we don't think we're visible but we're scrolling and have height,
    // then we are in fact visible. (This catches a case where the
    // intsersection observer created below doesn't fire for visiblity
    // changes.)
    if (!this.visible && this.container && this.container.offsetHeight > 0) {
      this.visible = true;
      this.processRenderQueue();
    }
  }

  /**
   * Invoke when the document has changed
   */
  private onUpdate() {
    // Debounce update timer. This timer is used to prevent the CPU intensive
    // editor rendering from happening while the user is actively updating the
    // document.
    if (this.updateTimer !== 0) {
      window.clearTimeout(this.updateTimer);
    }
    this.updateTimer = window.setTimeout(() => {
      this.updateTimer = 0;
      // Process queue immediately if we have one
      this.scheduleRender(0);
    }, 1000);
  }

  /**
   * Indicates whether the render queue has a scroll container defined
   */
  public hasContainer(): boolean {
    if (this.container) {
      return true;
    }
    return false;
  }

  /**
   * Indicates whether the rendering is finished.
   */
  public isRenderCompleted(): boolean {
    return this.renderCompleted;
  }

  /**
   * Adds a node view to the render queue
   */
  public add(view: AceNodeView) {
    // We allow the first few code blocks to render synchronously instead of
    // being dumped into the queue for later processing. This slightly increases
    // startup time but prevents the flicker that would otherwise occur as
    // editors render one by one.
    if (this.bypass > 0) {
      this.bypass--;
      view.initEditor();
      return;
    }

    this.renderQueue.push(view);

    // Defer/debounce rendering of editors until event loop finishes
    if (this.renderTimer === 0) {
      this.scheduleRender(0);
    }
  }

  /**
   * Processes the queue of editor instances that need to be rendered.
   */
  private processRenderQueue() {
    // No work to do if queue is empty
    if (this.renderQueue.length === 0) {
      return;
    }

    // Don't render while hidden; it wastes resources plus can result in
    // incorrect sizing calculations
    if (!this.visible) {
      return;
    }

    // Don't render while the user is actively updating the document (it makes
    // the interface sluggish)
    if (this.updateTimer !== 0) {
      return;
    }

    // Compute offset for sorting (based on scroll position)
    let offset = 0;
    if (this.container) {
      offset = this.container.scrollTop;
    }

    // Sort the queue if required
    if (this.needsSort) {
      // Sort the render queue based on distance from the top of the viewport
      this.renderQueue.sort((a, b) => {
        return Math.abs(a.dom.offsetTop - offset) - Math.abs(b.dom.offsetTop - offset);
      });

      // Clear flag so we don't sort the queue on every render
      this.needsSort = false;
    }

    // Pop the next view (editor instance) to be rendered off the stack.
    // Fast-forward past instances that no longer have a position; these can
    // accumulate when NodeViews are added to the render queue but replaced
    // (by a document rebuild) before they have a chance to render.
    let view: AceNodeView | undefined;
    while ((view === null || view === undefined || view.getPos() === undefined) &&
           this.renderQueue.length > 0) {
      view = this.renderQueue.shift();
    }

    // Render this view
    if (view) {
      view.initEditor();
    }

    if (this.renderQueue.length > 0) {
      // There are still remaining editors to be rendered, so process again on
      // the next event loop.
      //
      // If these editors are near the viewport, render them as soon as
      // possible; otherwise, let the render proceed at a slower pace to
      // increase responsiveness.
      let delayMs = 1000;
      if (this.container) {
        const distance = Math.abs(this.renderQueue[0].dom.offsetTop - offset);
        if (distance < this.container.offsetHeight * 2) {
          // Container is near the viewport, so render it ASAP
          delayMs = 0;
        }
      }
      this.scheduleRender(delayMs);
    } else {
      // No remaining editors; we're done.
      this.renderCompleted = true;
      this.destroy();
    }
  }

  /**
   * Cancels the timer that is responsible for triggering the processing of the
   * next unit in the render queue.
   */
  private cancelTimer() {
    if (this.renderTimer !== 0) {
      window.clearTimeout(this.renderTimer);
      this.renderTimer = 0;
    }
  }

  /**
   * Reschedules a pending render, or schedules a new one.
   */
  private scheduleRender(delayMs: number) {
    this.cancelTimer();
    this.renderTimer = window.setTimeout(() => {
      this.processRenderQueue();
      this.renderTimer = 0;
    }, delayMs);
  }

  /**
   * Cleans up the render queue instance
   */
  private destroy() {
    // Cancel any pending renders
    this.cancelTimer();

    // Clear any pending update timer
    if (this.updateTimer !== 0) {
      window.clearTimeout(this.updateTimer);
    }

    // Remove event subscriptions
    this.subscriptions.forEach(unsub => unsub());

    // Clean up resize observer
    if (this.observer) {
      this.observer.disconnect();
    }
  }
}
