function toLogString(args: any[]) {
	return `[${args.map(arg => JSON.stringify(arg, (key, value) => {
			const t = typeof value;
			if (t === 'object') {
				return !key ? value : String(value);
			}
			if (t === 'function') {
				return `[Function: ${value.name}]`;
			}
			if (t === 'bigint') {
				return String(value);
			}
			return value;
		})).join(', ')}]`;
}