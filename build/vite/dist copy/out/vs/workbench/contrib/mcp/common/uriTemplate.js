/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/**
 * Represents an RFC 6570 URI Template.
 */
export class UriTemplate {
    constructor(template, components) {
        this.template = template;
        this.template = template;
        this.components = components;
    }
    /**
     * Parses a URI template string into a UriTemplate instance.
     */
    static parse(template) {
        const components = [];
        const regex = /\{([^{}]+)\}/g;
        let match;
        let lastPos = 0;
        while ((match = regex.exec(template))) {
            const [expression, inner] = match;
            components.push(template.slice(lastPos, match.index));
            lastPos = match.index + expression.length;
            // Handle escaped braces: treat '{{' and '}}' as literals, not expressions
            if (template[match.index - 1] === '{' || template[lastPos] === '}') {
                components.push(inner);
                continue;
            }
            let operator = '';
            let rest = inner;
            if (rest.length > 0 && UriTemplate._isOperator(rest[0])) {
                operator = rest[0];
                rest = rest.slice(1);
            }
            const variables = rest.split(',').map((v) => {
                let name = v;
                let explodable = false;
                let repeatable = false;
                let prefixLength = undefined;
                let optional = false;
                if (name.endsWith('*')) {
                    explodable = true;
                    repeatable = true;
                    name = name.slice(0, -1);
                }
                const prefixMatch = name.match(/^(.*?):(\d+)$/);
                if (prefixMatch) {
                    name = prefixMatch[1];
                    prefixLength = parseInt(prefixMatch[2], 10);
                }
                if (name.endsWith('?')) {
                    optional = true;
                    name = name.slice(0, -1);
                }
                return { explodable, name, optional, prefixLength, repeatable };
            });
            components.push({ expression, operator, variables });
        }
        components.push(template.slice(lastPos));
        return new UriTemplate(template, components);
    }
    static { this._operators = ['+', '#', '.', '/', ';', '?', '&']; }
    static _isOperator(ch) {
        return UriTemplate._operators.includes(ch);
    }
    /**
     * Resolves the template with the given variables.
     */
    resolve(variables) {
        let result = '';
        for (const comp of this.components) {
            if (typeof comp === 'string') {
                result += comp;
            }
            else {
                result += this._expand(comp, variables);
            }
        }
        return result;
    }
    _expand(comp, variables) {
        const op = comp.operator;
        const varSpecs = comp.variables;
        if (varSpecs.length === 0) {
            return comp.expression;
        }
        const vals = [];
        const isNamed = op === ';' || op === '?' || op === '&';
        const isReserved = op === '+' || op === '#';
        const isFragment = op === '#';
        const isLabel = op === '.';
        const isPath = op === '/';
        const isForm = op === '?';
        const isFormCont = op === '&';
        const isParam = op === ';';
        let prefix = '';
        if (op === '+') {
            prefix = '';
        }
        else if (op === '#') {
            prefix = '#';
        }
        else if (op === '.') {
            prefix = '.';
        }
        else if (op === '/') {
            prefix = '';
        }
        else if (op === ';') {
            prefix = ';';
        }
        else if (op === '?') {
            prefix = '?';
        }
        else if (op === '&') {
            prefix = '&';
        }
        for (const v of varSpecs) {
            const value = variables[v.name];
            const defined = Object.prototype.hasOwnProperty.call(variables, v.name);
            if (value === undefined || value === null || (Array.isArray(value) && value.length === 0)) {
                if (isParam) {
                    if (defined && (value === null || value === undefined)) {
                        vals.push(v.name);
                    }
                    continue;
                }
                if (isForm || isFormCont) {
                    if (defined) {
                        vals.push(UriTemplate._formPair(v.name, '', isNamed));
                    }
                    continue;
                }
                continue;
            }
            if (typeof value === 'object' && !Array.isArray(value)) {
                if (v.explodable) {
                    const pairs = [];
                    for (const k in value) {
                        if (Object.prototype.hasOwnProperty.call(value, k)) {
                            const thisVal = String(value[k]);
                            if (isParam) {
                                pairs.push(k + '=' + thisVal);
                            }
                            else if (isForm || isFormCont) {
                                pairs.push(k + '=' + thisVal);
                            }
                            else if (isLabel) {
                                pairs.push(k + '=' + thisVal);
                            }
                            else if (isPath) {
                                pairs.push('/' + k + '=' + UriTemplate._encode(thisVal, isReserved));
                            }
                            else {
                                pairs.push(k + '=' + UriTemplate._encode(thisVal, isReserved));
                            }
                        }
                    }
                    if (isLabel) {
                        vals.push(pairs.join('.'));
                    }
                    else if (isPath) {
                        vals.push(pairs.join(''));
                    }
                    else if (isParam) {
                        vals.push(pairs.join(';'));
                    }
                    else if (isForm || isFormCont) {
                        vals.push(pairs.join('&'));
                    }
                    else {
                        vals.push(pairs.join(','));
                    }
                }
                else {
                    // Not explodable: join as k1,v1,k2,v2,... and assign to variable name
                    const pairs = [];
                    for (const k in value) {
                        if (Object.prototype.hasOwnProperty.call(value, k)) {
                            pairs.push(k);
                            pairs.push(String(value[k]));
                        }
                    }
                    // For label, param, form, join as keys=semi,;,dot,.,comma,, (no encoding of , or ;)
                    const joined = pairs.join(',');
                    if (isLabel) {
                        vals.push(joined);
                    }
                    else if (isParam || isForm || isFormCont) {
                        vals.push(v.name + '=' + joined);
                    }
                    else {
                        vals.push(joined);
                    }
                }
                continue;
            }
            if (Array.isArray(value)) {
                if (v.explodable) {
                    if (isLabel) {
                        vals.push(value.join('.'));
                    }
                    else if (isPath) {
                        vals.push(value.map(x => '/' + UriTemplate._encode(x, isReserved)).join(''));
                    }
                    else if (isParam) {
                        vals.push(value.map(x => v.name + '=' + String(x)).join(';'));
                    }
                    else if (isForm || isFormCont) {
                        vals.push(value.map(x => v.name + '=' + String(x)).join('&'));
                    }
                    else {
                        vals.push(value.map(x => UriTemplate._encode(x, isReserved)).join(','));
                    }
                }
                else {
                    if (isLabel) {
                        vals.push(value.join(','));
                    }
                    else if (isParam) {
                        vals.push(v.name + '=' + value.join(','));
                    }
                    else if (isForm || isFormCont) {
                        vals.push(v.name + '=' + value.join(','));
                    }
                    else {
                        vals.push(value.map(x => UriTemplate._encode(x, isReserved)).join(','));
                    }
                }
                continue;
            }
            let str = String(value);
            if (v.prefixLength !== undefined) {
                str = str.substring(0, v.prefixLength);
            }
            // For simple expansion, encode ! as well (not reserved)
            // Only + and # are reserved
            const enc = UriTemplate._encode(str, op === '+' || op === '#');
            if (isParam) {
                vals.push(v.name + '=' + enc);
            }
            else if (isForm || isFormCont) {
                vals.push(v.name + '=' + enc);
            }
            else if (isLabel) {
                vals.push(enc);
            }
            else if (isPath) {
                vals.push('/' + enc);
            }
            else {
                vals.push(enc);
            }
        }
        let joined = '';
        if (isLabel) {
            // Remove trailing dot for missing values
            const filtered = vals.filter(v => v !== '');
            joined = filtered.length ? prefix + filtered.join('.') : '';
        }
        else if (isPath) {
            // Remove empty segments for undefined/null
            const filtered = vals.filter(v => v !== '');
            joined = filtered.length ? filtered.join('') : '';
            if (joined && !joined.startsWith('/')) {
                joined = '/' + joined;
            }
        }
        else if (isParam) {
            // For param, if value is empty string, just append ;name
            joined = vals.length ? prefix + vals.map(v => v.replace(/=\s*$/, '')).join(';') : '';
        }
        else if (isForm) {
            joined = vals.length ? prefix + vals.join('&') : '';
        }
        else if (isFormCont) {
            joined = vals.length ? prefix + vals.join('&') : '';
        }
        else if (isFragment) {
            joined = prefix + vals.join(',');
        }
        else if (isReserved) {
            joined = vals.join(',');
        }
        else {
            joined = vals.join(',');
        }
        return joined;
    }
    static _encode(str, reserved) {
        return reserved ? encodeURI(str) : pctEncode(str);
    }
    static _formPair(k, v, named) {
        return named ? k + '=' + encodeURIComponent(String(v)) : encodeURIComponent(String(v));
    }
}
function pctEncode(str) {
    let out = '';
    for (let i = 0; i < str.length; i++) {
        const chr = str.charCodeAt(i);
        if (
        // alphanum ranges:
        (chr >= 0x30 && chr <= 0x39 || chr >= 0x41 && chr <= 0x5a || chr >= 0x61 && chr <= 0x7a) ||
            // unreserved characters:
            (chr === 0x2d || chr === 0x2e || chr === 0x5f || chr === 0x7e)) {
            out += str[i];
        }
        else {
            out += '%' + chr.toString(16).toUpperCase();
        }
    }
    return out;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXJpVGVtcGxhdGUuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9tY3AvY29tbW9uL3VyaVRlbXBsYXRlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBZ0JoRzs7R0FFRztBQUNILE1BQU0sT0FBTyxXQUFXO0lBTXZCLFlBQ2lCLFFBQWdCLEVBQ2hDLFVBQXlEO1FBRHpDLGFBQVEsR0FBUixRQUFRLENBQVE7UUFHaEMsSUFBSSxDQUFDLFFBQVEsR0FBRyxRQUFRLENBQUM7UUFDekIsSUFBSSxDQUFDLFVBQVUsR0FBRyxVQUFVLENBQUM7SUFDOUIsQ0FBQztJQUVEOztPQUVHO0lBQ0ksTUFBTSxDQUFDLEtBQUssQ0FBQyxRQUFnQjtRQUNuQyxNQUFNLFVBQVUsR0FBMEMsRUFBRSxDQUFDO1FBQzdELE1BQU0sS0FBSyxHQUFHLGVBQWUsQ0FBQztRQUM5QixJQUFJLEtBQTZCLENBQUM7UUFDbEMsSUFBSSxPQUFPLEdBQUcsQ0FBQyxDQUFDO1FBQ2hCLE9BQU8sQ0FBQyxLQUFLLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQyxFQUFFLENBQUM7WUFDdkMsTUFBTSxDQUFDLFVBQVUsRUFBRSxLQUFLLENBQUMsR0FBRyxLQUFLLENBQUM7WUFDbEMsVUFBVSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLE9BQU8sRUFBRSxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztZQUN0RCxPQUFPLEdBQUcsS0FBSyxDQUFDLEtBQUssR0FBRyxVQUFVLENBQUMsTUFBTSxDQUFDO1lBRTFDLDBFQUEwRTtZQUMxRSxJQUFJLFFBQVEsQ0FBQyxLQUFLLENBQUMsS0FBSyxHQUFHLENBQUMsQ0FBQyxLQUFLLEdBQUcsSUFBSSxRQUFRLENBQUMsT0FBTyxDQUFDLEtBQUssR0FBRyxFQUFFLENB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