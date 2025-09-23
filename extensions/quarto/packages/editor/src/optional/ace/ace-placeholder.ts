/*
 * ace-placeholder.ts
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

/**
 * Represents a placeholder (preview) rendering of an Ace editor. Since Ace
 * editors are somewhat expensive to draw, this placeholder is used in place
 * of a real editor instance to make code visible and allow for correct height
 * computations.
 */
export class AcePlaceholder {
  private readonly element: HTMLElement;

  constructor(content: string) {
    const ele = document.createElement('pre');
    ele.innerText = content;
    ele.className = 'ace_editor';
    this.element = ele;
  }

  public getElement() {
    return this.element;
  }
}
