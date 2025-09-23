/*
 * Copyright 2020 Palantir Technologies, Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Checks whether the given element is inside something that looks like a text input.
 * This is particularly useful to determine if a keyboard event inside this element should take priority over hotkey
 * bindings / keyboard shortcut handlers.
 *
 * @returns true if the element is inside a text input
 */
export function elementIsTextInput(elem: HTMLElement) {
  // we check these cases for unit testing, but this should not happen
  // during normal operation
  if (elem == null || elem.closest == null) {
    return false;
  }

  const editable = elem.closest("input, textarea, [contenteditable=true]");

  if (editable == null) {
    return false;
  }

  // don't let checkboxes, switches, and radio buttons prevent hotkey behavior
  if (editable.tagName.toLowerCase() === "input") {
    const inputType = (editable as HTMLInputElement).type;
    if (inputType === "checkbox" || inputType === "radio") {
      return false;
    }
  }

  // don't let read-only fields prevent hotkey behavior
  if ((editable as HTMLInputElement).readOnly) {
    return false;
  }

  return true;
}
