/*
 * index.ts
 *
 * Copyright (C) 2022 by Emergence Engineering (ISC License)
 * https://gitlab.com/emergence-engineering/prosemirror-codemirror-block
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

import { Node as ProsemirrorNode } from 'prosemirror-model';
import { EditorView as PMEditorView } from "prosemirror-view";

import { Extension, Transaction } from "@codemirror/state";
import { EditorView, KeyBinding } from '@codemirror/view';

import { CodeViewOptions, ExtensionContext } from "editor";

import { langModeBehavior } from './langmode';
import { keyboardBehavior } from './keyboard';
import { findBehavior } from './find';
import { tabBehavior } from './indent';
import { trackSelectionBehavior } from './trackselection';
import { themeBehavior } from './theme';
import { prefsBehavior } from './prefs';
import { completionBehavior } from './completion';
import { yamlOptionBehavior } from './yamloption';
import { toolbarBehavior } from './toolbar';
import { diagramBehavior } from './diagram';
import { diagnosticsBehavior } from './diagnostics';

export interface Behavior {
  extensions?: Extension[];
  keys?: KeyBinding[];
  init?: (pmNode: ProsemirrorNode, cmView: EditorView) => void;
  cmUpdate?: (tr: Transaction, cmView: EditorView, pmNode: ProsemirrorNode) => void;
  pmUpdate?: (prevNode: ProsemirrorNode, updateNode: ProsemirrorNode, cmView: EditorView) => void;
  cleanup?: VoidFunction;
}

export interface BehaviorContext {
  dom: HTMLElement;
  view: PMEditorView;
  getPos: boolean | (() => number);
  options: CodeViewOptions;
  pmContext: ExtensionContext;
  withState: WithState;
}

export enum State { Updating, Escaping };
export type WithState = (state: State, fn: () => void) => void;

export function createBehaviors(context: BehaviorContext): Behavior[] {
  const behaviors = [
    langModeBehavior(context),
    completionBehavior(context),
    findBehavior(context),
    tabBehavior(),
    themeBehavior(context),
    prefsBehavior(context),
    trackSelectionBehavior(context),
    yamlOptionBehavior(context),
    toolbarBehavior(context),
    diagramBehavior(context),
    diagnosticsBehavior(context)
  ];
  behaviors.push(keyboardBehavior(context, behaviors.flatMap(behavior => behavior.keys || [])));
  return behaviors;
}

export function behaviorExtensions(
  behaviors: Behavior[]
): Extension[] {
  return behaviors.flatMap(behavior => (behavior.extensions || []));
}

export function behaviorInit(
  behaviors: Behavior[],
  pmNode: ProsemirrorNode, cmView: EditorView
) {
  behaviors.forEach(behavior => behavior.init?.(pmNode, cmView));
}

export function behaviorCmUpdate(
  behaviors: Behavior[],
  tr: Transaction, cmView: EditorView, pmNode: ProsemirrorNode
) {
  behaviors.forEach(behavior => behavior.cmUpdate?.(tr, cmView, pmNode));
}

export function behaviorPmUpdate(
  behaviors: Behavior[],
  prevNode: ProsemirrorNode, updateNode: ProsemirrorNode, cmView: EditorView
) {
  behaviors.forEach(behavior => behavior.pmUpdate?.(prevNode, updateNode, cmView));
}

export function behaviorCleanup(
  behaviors: Behavior[]
) {
  behaviors.forEach(behavior => behavior.cleanup?.());
}
