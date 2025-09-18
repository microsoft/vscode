import PlSqlFormatter from "./languages/PlSqlFormatter";
import StandardSqlFormatter from "./languages/StandardSqlFormatter";

interface SqlFormatterConfig {
    language?: 'pl/sql' | 'sql';
    indent?: string;
    params?: Record<string, unknown>;
}

export default {
    /**
     * Format whitespaces in a query to make it easier to read.
     *
     * @param {String} query
     * @param {Object} cfg
     *  @param {String} cfg.language Query language, default is Standard SQL
     *  @param {String} cfg.indent Characters used for indentation, default is "  " (2 spaces)
     *  @param {Object} cfg.params Collection of params for placeholder replacement
     * @return {String}
     */
    format: (query: string, cfg?: SqlFormatterConfig) => {
        cfg = cfg || {};

        switch (cfg.language) {
            case "pl/sql":
                return new PlSqlFormatter(cfg).format(query);
            case "sql":
            case undefined:
                return new StandardSqlFormatter(cfg).format(query);
            default:
                throw Error(`Unsupported SQL dialect: ${cfg.language}`);
        }
    }
};
