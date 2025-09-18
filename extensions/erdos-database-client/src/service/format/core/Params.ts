/**
 * Handles placeholder replacement with given params.
 */
export default class Params {
    private params: Record<string, unknown>;
    private index: number;

    /**
     * @param {Object} params
     */
    constructor(params: Record<string, unknown> = {}) {
        this.params = params;
        this.index = 0;
    }

    /**
     * Returns param value that matches given placeholder with param key.
     * @param {Object} token
     *   @param {String} token.key Placeholder key
     *   @param {String} token.value Placeholder value
     * @return {String} param or token.value when params are missing
     */
    get({key, value}) {
        if (!this.params) {
            return value;
        }
        if (key) {
            return this.params[key];
        }
        return this.params[this.index ++];
    }
}

