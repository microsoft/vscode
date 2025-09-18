import { DatabaseType } from "../../../common/constants";
import { Node } from "../../../model/interface/node";
import { TriggerDumpOptions } from './interfaces/Options';

interface ShowTriggers {
    Trigger: string;
    Event: 'INSERT' | 'UPDATE' | 'DELETE';
    Table: string;
    Statement: string;
    Timing: 'BEFORE' | 'AFTER';
    sql_mode: string;
    Definer: string;
    character_set_client: string;
    coallation_connection: string;
    'Database Collation': string;
}
interface ShowCreateTrigger {
    Trigger: string;
    sql_mode: string;
    'SQL Original Statement': string;
    character_set_client: string;
    coallation_connection: string;
    'Database Collation': string;
}

async function getTriggerDump(node: Node, sessionId: string, options: Required<TriggerDumpOptions>, triggers: Array<string>): Promise<string> {
    if (triggers.length === 0) {
        return "";
    }
    const output = triggers.map(async trigger => {
        try {
            const r = await node.execute(node.dialect.showTriggerSource(node.schema, trigger), sessionId)
            const res = r[0]
            let sql = `${res['SQL Original Statement']}`;
            if (!options.definer) {
                sql = sql.replace(/CREATE DEFINER=.+?@.+? /, 'CREATE ');
            }
            if (options.dropIfExist) {
                if (node.dbType == DatabaseType.PG) {
                    sql = `DROP TRIGGER IF EXISTS ${res.Trigger} ${sql.match(/ON \S+/)[0]};\n${sql}`;
                } else {
                    sql = `DROP TRIGGER IF EXISTS ${res.Trigger};\n${sql}`;
                }
            }
            return `${sql};`;
        } catch (error) {
            return false;
        }
    });

    return (await Promise.all(output)).filter(s => s).join("\n\n");
}

export { ShowTriggers, ShowCreateTrigger, getTriggerDump };

