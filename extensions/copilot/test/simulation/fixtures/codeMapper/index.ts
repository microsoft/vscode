import type { RequestHandler } from '@sveltejs/kit';
import fs from 'fs';
import path from 'path';

export const POST: RequestHandler = async ({ request }) => {
	const { respondentId, categories, notActionable, highlight } = await request.json();
	const filePath = path.resolve('data/export.csv');
	const csv = fs.readFileSync(filePath, 'utf-8');
	const rows = csv.split('\n');
	const headers = rows[0];
	const data = rows.slice(1).map(row => {
		const fields = row.split(',');
		if (fields[0] === respondentId) {
			return [
				...fields.slice(0, 21),
				categories.join('|'),
				notActionable,
				highlight
			].join(',');
		}
		return row;
	});
	fs.writeFileSync(filePath, [headers, ...data].join('\n'));
	return new Response(null, { status: 200 });
};