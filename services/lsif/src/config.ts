// Son of Anton — LSIF/SCIP Service Configuration

export interface LsifConfig {
	falkordb: {
		host: string;
		port: number;
		graphName: string;
	};
	project: {
		path: string;
		languages: string[];
	};
	server: {
		port: number;
	};
	lsif: {
		outputDir: string;
		snapshotDir: string;
		preferScip: boolean;
	};
}

function parseLanguages(raw: string): string[] {
	return raw.split(',').map(l => l.trim().toLowerCase()).filter(Boolean);
}

export function loadConfig(): LsifConfig {
	return {
		falkordb: {
			host: process.env.FALKORDB_HOST ?? 'localhost',
			port: parseInt(process.env.FALKORDB_PORT ?? '6379', 10),
			graphName: process.env.FALKORDB_GRAPH ?? 'son-of-anton',
		},
		project: {
			path: process.env.PROJECT_PATH ?? '/workspace',
			languages: parseLanguages(process.env.LANGUAGES ?? 'typescript,python,rust,csharp,cpp'),
		},
		server: {
			port: parseInt(process.env.PORT ?? '8081', 10),
		},
		lsif: {
			outputDir: process.env.LSIF_OUTPUT_DIR ?? '/tmp/soa-lsif',
			snapshotDir: process.env.LSIF_SNAPSHOT_DIR ?? '/data/lsif-snapshots',
			preferScip: process.env.PREFER_SCIP === 'true',
		},
	};
}
