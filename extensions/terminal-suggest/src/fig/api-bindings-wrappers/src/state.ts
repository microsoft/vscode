import { State as DefaultState } from "@aws/amazon-q-developer-cli-api-bindings";

export enum States {
  DEVELOPER_API_HOST = "developer.apiHost",
  DEVELOPER_AE_API_HOST = "developer.autocomplete-engine.apiHost",

  IS_FIG_PRO = "user.account.is-fig-pro",
}

export type LocalStateMap = Partial<
  {
    [States.DEVELOPER_API_HOST]: string;
    [States.DEVELOPER_AE_API_HOST]: string;
    [States.IS_FIG_PRO]: boolean;
  } & { [key in States]: unknown }
>;

export type LocalStateSubscriber = {
  initial?: (initialState: LocalStateMap) => void;
  changes: (oldState: LocalStateMap, newState: LocalStateMap) => void;
};

export class State {
  private static state: LocalStateMap = {};

  private static subscribers = new Set<LocalStateSubscriber>();

  static current = () => this.state;

  static subscribe = (subscriber: LocalStateSubscriber) => {
    this.subscribers.add(subscriber);
  };

  static unsubscribe = (subscriber: LocalStateSubscriber) => {
    this.subscribers.delete(subscriber);
  };

  static watch = async () => {
    try {
      const state = await DefaultState.current();
      this.state = state;
      for (const subscriber of this.subscribers) {
        subscriber.initial?.(state);
      }
    } catch {
      // ignore errors
    }
    DefaultState.didChange.subscribe((notification: any) => {
      const oldState = this.state;
      const newState = JSON.parse(
        notification.jsonBlob ?? "{}",
      ) as LocalStateMap;
      for (const subscriber of this.subscribers) {
        subscriber.changes(oldState, newState);
      }
      this.state = newState;
      return undefined;
    });
  };
}
