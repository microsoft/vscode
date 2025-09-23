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

import { elementIsTextInput } from "./util";
import { comboMatches, getKeyCombo, IKeyCombo, parseKeyCombo } from "./parser";
import { HotkeysContext } from "./provider";
import { HotkeyConfig } from "./config";

export interface UseHotkeysOptions {
  /**
   * A custom document to reference when binding global event handlers.
   * This can be useful when using iframes in an application.
   *
   * @default window.document
   */
  document?: Document;

  /**
   * The key combo which will trigger the hotkeys dialog to open.
   *
   * @default "?"
   */
  showDialogKeyCombo?: string;
}

export interface UseHotkeysReturnValue {
  handleKeyDown: React.KeyboardEventHandler<HTMLElement>;
  handleKeyUp: React.KeyboardEventHandler<HTMLElement>;
}

/**
 * React hook to register global and local hotkeys for a component.
 *
 * @see https://blueprintjs.com/docs/#core/hooks/use-hotkeys
 * @param keys list of hotkeys to configure
 * @param options hook options
 */
export function useHotkeys(
  keys: readonly HotkeyConfig[],
  options: UseHotkeysOptions = {}
): UseHotkeysReturnValue {
  const { document = getDefaultDocument() } = options;
  const localKeys = React.useMemo(
    () =>
      keys
        .filter((k) => !k.global)
        .map((k) => ({
          combo: parseKeyCombo(k.combo),
          config: k,
        })),
    [keys]
  );
  const globalKeys = React.useMemo(
    () =>
      keys
        .filter((k) => k.global)
        .map((k) => ({
          combo: parseKeyCombo(k.combo),
          config: k,
        })),
    [keys]
  );

  // register keys with global context
  const [state, dispatch] = React.useContext(HotkeysContext);

  if (!state.hasProvider) {
    React.useEffect(() => console.warn("hotkey provider not found"), []);
  }

  // we can still bind the hotkeys if there is no HotkeysProvider, they just won't show up in the dialog
  React.useEffect(() => {
    const payload = [
      ...globalKeys.map((k) => k.config),
      ...localKeys.map((k) => k.config),
    ];
    dispatch({ type: "ADD_HOTKEYS", payload });
    return () => dispatch({ type: "REMOVE_HOTKEYS", payload });
  }, [keys]);

  const invokeNamedCallbackIfComboRecognized = (
    global: boolean,
    combo: IKeyCombo,
    callbackName: "onKeyDown" | "onKeyUp",
    e: KeyboardEvent
  ) => {
    const isTextInput = elementIsTextInput(e.target as HTMLElement);
    for (const key of global ? globalKeys : localKeys) {
      const {
        allowInInput = false,
        disabled = false,
        preventDefault = false,
        stopPropagation = false,
      } = key.config;
      const shouldIgnore = (isTextInput && !allowInInput) || disabled;
      if (!shouldIgnore && comboMatches(key.combo, combo)) {
        if (preventDefault) {
          e.preventDefault();
        }
        if (stopPropagation) {
          // set a flag just for unit testing. not meant to be referenced in feature work.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (e as any).isPropagationStopped = true;
          e.stopPropagation();
        }
        key.config[callbackName]?.(e);
      }
    }
  };

  const handleGlobalKeyDown = React.useCallback(
    (e: KeyboardEvent) => {
      invokeNamedCallbackIfComboRecognized(
        true,
        getKeyCombo(e),
        "onKeyDown",
        e
      );
    },
    [globalKeys]
  );
  const handleGlobalKeyUp = React.useCallback(
    (e: KeyboardEvent) =>
      invokeNamedCallbackIfComboRecognized(true, getKeyCombo(e), "onKeyUp", e),
    [globalKeys]
  );

  const handleLocalKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLElement>) =>
      invokeNamedCallbackIfComboRecognized(
        false,
        getKeyCombo(e.nativeEvent),
        "onKeyDown",
        e.nativeEvent
      ),
    [localKeys]
  );
  const handleLocalKeyUp = React.useCallback(
    (e: React.KeyboardEvent<HTMLElement>) =>
      invokeNamedCallbackIfComboRecognized(
        false,
        getKeyCombo(e.nativeEvent),
        "onKeyUp",
        e.nativeEvent
      ),
    [localKeys]
  );

  React.useEffect(() => {
    // document is guaranteed to be defined inside effects
    document!.addEventListener("keydown", handleGlobalKeyDown);
    document!.addEventListener("keyup", handleGlobalKeyUp);
    return () => {
      document!.removeEventListener("keydown", handleGlobalKeyDown);
      document!.removeEventListener("keyup", handleGlobalKeyUp);
    };
  }, [handleGlobalKeyDown, handleGlobalKeyUp]);

  return { handleKeyDown: handleLocalKeyDown, handleKeyUp: handleLocalKeyUp };
}

function getDefaultDocument(): Document | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }
  return window.document;
}
