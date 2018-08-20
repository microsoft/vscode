// Type definitions for Winreg v1.2.0
// Project: http://fresc81.github.io/node-winreg/
// Definitions by: RX14 <https://github.com/RX14>, BobBuehler <https://github.com/BobBuehler>
// Definitions: https://github.com/DefinitelyTyped/DefinitelyTyped

declare var Winreg: WinregStatic;

interface WinregStatic {
    /**
     * Creates a registry object, which provides access to a single registry key.
     * Note: This class is returned by a call to ```require('winreg')```.
     *
     * @public
     * @class
     *
     * @param {@link Options} options - the options
     *
     * @example
     * var Registry = require('winreg')
     * ,   autoStartCurrentUser = new Registry({
     *       hive: Registry.HKCU,
     *       key:  '\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'
     *     });
     */
    new (options: Winreg.Options): Winreg.Registry;

    /**
     * Registry hive key HKEY_LOCAL_MACHINE.
     * Note: For writing to this hive your program has to run with admin privileges.
     */
    HKLM: string;

    /**
     * Registry hive key HKEY_CURRENT_USER.
     */
    HKCU: string;

    /**
     * Registry hive key HKEY_CLASSES_ROOT.
     * Note: For writing to this hive your program has to run with admin privileges.
     */
    HKCR: string;

    /**
     * Registry hive key HKEY_USERS.
     * Note: For writing to this hive your program has to run with admin privileges.
     */
    HKU: string;

    /**
     * Registry hive key HKEY_CURRENT_CONFIG.
     * Note: For writing to this hive your program has to run with admin privileges.
     */
    HKCC: string;

    /**
     * Collection of available registry hive keys.
     */
    HIVES: Array<string>;

    /**
     * Registry value type STRING.
     *
     * Values of this type contain a string.
     */
    REG_SZ: string;

    /**
     * Registry value type MULTILINE_STRING.
     *
     * Values of this type contain a multiline string.
     */
    REG_MULTI_SZ: string;

    /**
     * Registry value type EXPANDABLE_STRING.
     *
     * Values of this type contain an expandable string.
     */
    REG_EXPAND_SZ: string;

    /**
     * Registry value type DOUBLE_WORD.
     *
     * Values of this type contain a double word (32 bit integer).
     */
    REG_DWORD: string;

    /**
     * Registry value type QUAD_WORD.
     *
     * Values of this type contain a quad word (64 bit integer).
     */
    REG_QWORD: string;

    /**
     * Registry value type BINARY.
     *
     * Values of this type contain a binary value.
     */
    REG_BINARY: string;

    /**
     * Registry value type UNKNOWN.
     *
     * Values of this type contain a value of an unknown type.
     */
    REG_NONE: string;

    /**
     * Collection of available registry value types.
     */
    REG_TYPES: Array<string>;

    /**
     * The name of the default value. May be used instead of the empty string literal for better readability.
     */
    DEFAULT_VALUE: string;
}

declare namespace Winreg {
    export interface Options {
        /**
         * Optional hostname, must start with '\\' sequence.
         */
        host?: string;

        /**
         * Optional hive ID, default is HKLM.
         */
        hive?: string;

        /**
         * Optional key, default is the root key.
         */
        key?: string;

        /**
         * Optional registry hive architecture ('x86' or 'x64'; only valid on Windows 64 Bit Operating Systems).
         */
        arch?: string;
    }

    /**
     * A registry object, which provides access to a single registry key.
     */
    export interface Registry {
        /**
         * The hostname.
         * @readonly
         */
        host: string;

        /**
         * The hive id.
         * @readonly
         */
        hive: string;

        /**
         * The registry key name.
         * @readonly
         */
        key: string;

        /**
         * The full path to the registry key.
         * @readonly
         */
        path: string;

        /**
         * The registry hive architecture ('x86' or 'x64').
         * @readonly
         */
        arch: string;

        /**
         * Creates a new {@link Registry} instance that points to the parent registry key.
         * @readonly
         */
        parent: Registry;

        /**
         * Retrieve all values from this registry key.
         * @param {valuesCallback} cb - callback function
         * @param {error=} cb.err - error object or null if successful
         * @param {array=} cb.items - an array of {@link RegistryItem} objects
         * @returns {Registry} this registry key object
         */
        values(cb: (err: Error, result: Array<Winreg.RegistryItem>) => void): Registry;

        /**
         * Retrieve all subkeys from this registry key.
         * @param {function (err, items)} cb - callback function
         * @param {error=} cb.err - error object or null if successful
         * @param {array=} cb.items - an array of {@link Registry} objects
         * @returns {Registry} this registry key object
         */
        keys(cb: (err: Error, result: Array<Registry>) => void): Registry;

        /**
         * Gets a named value from this registry key.
         * @param {string} name - the value name, use {@link Registry.DEFAULT_VALUE} or an empty string for the default value
         * @param {function (err, item)} cb - callback function
         * @param {error=} cb.err - error object or null if successful
         * @param {RegistryItem=} cb.item - the retrieved registry item
         * @returns {Registry} this registry key object
         */
        get(name: string, cb: (err: Error, result: Winreg.RegistryItem) => void): Registry;

        /**
         * Sets a named value in this registry key, overwriting an already existing value.
         * @param {string} name - the value name, use {@link Registry.DEFAULT_VALUE} or an empty string for the default value
         * @param {string} type - the value type
         * @param {string} value - the value
         * @param {function (err)} cb - callback function
         * @param {error=} cb.err - error object or null if successful
         * @returns {Registry} this registry key object
         */
        set(name: string, type: string, value: string, cb: (err: Error) => void): Registry;

        /**
         * Remove a named value from this registry key. If name is empty, sets the default value of this key.
         * Note: This key must be already existing.
         * @param {string} name - the value name, use {@link Registry.DEFAULT_VALUE} or an empty string for the default value
         * @param {function (err)} cb - callback function
         * @param {error=} cb.err - error object or null if successful
         * @returns {Registry} this registry key object
         */
        remove(name: string, cb: (err: Error) => void): Registry;

        /**
         * Remove all subkeys and values (including the default value) from this registry key.
         * @param {function (err)} cb - callback function
         * @param {error=} cb.err - error object or null if successful
         * @returns {Registry} this registry key object
         */
        clear(cb: (err: Error) => void): Registry;

        /**
         * Alias for the clear method to keep it backward compatible.
         * @method
         * @deprecated Use {@link Registry#clear} or {@link Registry#destroy} in favour of this method.
         * @param {function (err)} cb - callback function
         * @param {error=} cb.err - error object or null if successful
         * @returns {Registry} this registry key object
         */
        erase(cb: (err: Error) => void): Registry;

        /**
         * Delete this key and all subkeys from the registry.
         * @param {function (err)} cb - callback function
         * @param {error=} cb.err - error object or null if successful
         * @returns {Registry} this registry key object
         */
        destroy(cb: (err: Error) => void): Registry;

        /**
         * Create this registry key. Note that this is a no-op if the key already exists.
         * @param {function (err)} cb - callback function
         * @param {error=} cb.err - error object or null if successful
         * @returns {Registry} this registry key object
         */
        create(cb: (err: Error) => void): Registry;

        /**
         * Checks if this key already exists.
         * @param {function (err, exists)} cb - callback function
         * @param {error=} cb.err - error object or null if successful
         * @param {boolean=} cb.exists - true if a registry key with this name already exists
         * @returns {Registry} this registry key object
         */
        keyExists(cb: (err: Error, exists: boolean) => void): Registry;

        /**
         * Checks if a value with the given name already exists within this key.
         * @param {string} name - the value name, use {@link Registry.DEFAULT_VALUE} or an empty string for the default value
         * @param {function (err, exists)} cb - callback function
         * @param {error=} cb.err - error object or null if successful
         * @param {boolean=} cb.exists - true if a value with the given name was found in this key
         * @returns {Registry} this registry key object
         */
        valueExists(name: string, cb: (err: Error, exists: boolean) => void): Registry;
    }

    /**
     * A single registry value record.
     * Objects of this type are created internally and returned by methods of {@link Registry} objects.
     */
    export interface RegistryItem {
        /**
         * The hostname.
         * @readonly
         */
        host: string;

        /**
         * The hive id.
         * @readonly
         */
        hive: string;

        /**
         * The registry key.
         * @readonly
         */
        key: string;

        /**
         * The value name.
         * @readonly
         */
        name: string;

        /**
         * The value type.
         * @readonly
         */
        type: string;

        /**
         * The value.
         * @readonly
         */
        value: string;

        /**
         * The hive architecture.
         * @readonly
         */
        arch: string;
    }
}

declare module "winreg" {
    export = Winreg;
}