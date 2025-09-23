/*
 * Copyright 2021 Palantir Technologies, Inc. All rights reserved.
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

import * as React from "react";

import { shallowCompareKeys } from "./compare";
import { HotkeyConfig } from "./config";

interface HotkeysContextState {
  /**
   * Whether the context instance is being used within a tree which has a <HotkeysProvider>.
   * It's technically ok if this is false, but not recommended, since that means any hotkeys
   * bound with that context instance will not show up in the hotkeys help dialog.
   */
  hasProvider: boolean;

  /** List of hotkeys accessible in the current scope, registered by currently mounted components, can be global or local. */
  hotkeys: HotkeyConfig[];

  /** Whether the global hotkeys dialog is open. */
  isDialogOpen: boolean;
}

type HotkeysAction =
  | { type: "ADD_HOTKEYS" | "REMOVE_HOTKEYS"; payload: HotkeyConfig[] };

export type HotkeysContextInstance = [HotkeysContextState, React.Dispatch<HotkeysAction>];

const initialHotkeysState: HotkeysContextState = { hasProvider: false, hotkeys: [], isDialogOpen: false };
const noOpDispatch: React.Dispatch<HotkeysAction> = () => null;

/**
 * A React context used to register and deregister hotkeys as components are mounted and unmounted in an application.
 * Users should take care to make sure that only _one_ of these is instantiated and used within an application, especially
 * if using global hotkeys.
 *
 * You will likely not be using this HotkeysContext directly, except in cases where you need to get a direct handle on an
 * existing context instance for advanced use cases involving nested HotkeysProviders.
 *
 * For more information, see the [HotkeysProvider documentation](https://blueprintjs.com/docs/#core/context/hotkeys-provider).
 */
export const HotkeysContext = React.createContext<HotkeysContextInstance>([initialHotkeysState, noOpDispatch]);

const hotkeysReducer = (state: HotkeysContextState, action: HotkeysAction) => {
  switch (action.type) {
    case "ADD_HOTKEYS":
      // only pick up unique hotkeys which haven't been registered already
      // eslint-disable-next-line no-case-declarations
      const newUniqueHotkeys = [];
      for (const a of action.payload) {
        let isUnique = true;
        for (const b of state.hotkeys) {
          isUnique &&= !shallowCompareKeys(a, b, { exclude: ["onKeyDown", "onKeyUp"] });
        }
        if (isUnique) {
          newUniqueHotkeys.push(a);
        }
      }
      return {
        ...state,
        hotkeys: [...state.hotkeys, ...newUniqueHotkeys],
      };
    case "REMOVE_HOTKEYS":
      return {
        ...state,
        hotkeys: state.hotkeys.filter(key => action.payload.indexOf(key) === -1),
      };
    default:
      return state;
  }
};

export interface HotkeysProviderProps {
  /** The component subtree which will have access to this hotkeys context. */
  children: React.ReactChild;

  /** If provided, we will use this context instance instead of generating our own. */
  value?: HotkeysContextInstance;
}


export const HotkeysProvider = ({ children, value }: HotkeysProviderProps) => {
  const [state, dispatch] = value ?? React.useReducer(hotkeysReducer, { ...initialHotkeysState, hasProvider: true });
  return (
    <HotkeysContext.Provider value={[state, dispatch]}>
      {children}
    </HotkeysContext.Provider>
  );
};

