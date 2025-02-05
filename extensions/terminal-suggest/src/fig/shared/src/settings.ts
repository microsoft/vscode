import { SettingsChangedNotification } from "@aws/amazon-q-developer-cli-proto/fig";
export declare const didChange: {
    // subscribe(handler: (notification: SettingsChangedNotification) => NotificationResponse | undefined): Promise<import("./notifications.js").Subscription> | undefined;
    //TODO@meganrogge
		subscribe(handler: (notification: SettingsChangedNotification) => NotificationResponse | undefined): Promise<string> | undefined;
};
export declare function get(key: string): Promise<import("@aws/amazon-q-developer-cli-proto/fig").GetSettingsPropertyResponse>;
export declare function set(key: string, value: unknown): Promise<void>;
export declare function remove(key: string): Promise<void>;
export declare function current(): Promise<any>;

export type NotificationResponse = {
	unsubscribe: boolean;
  };

