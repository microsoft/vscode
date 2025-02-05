export declare const applySpecDiff: (spec: Fig.Subcommand, diff: Fig.SpecDiff) => Fig.Subcommand;
export declare const diffSpecs: (original: Fig.Subcommand, updated: Fig.Subcommand) => Fig.SpecDiff;
export declare const getVersionFromVersionedSpec: (base: Fig.Subcommand, versions: Fig.VersionDiffMap, target?: string) => {
	version: string;
	spec: Fig.Subcommand;
};
export declare const createVersionedSpec: (specName: string, versionFiles: string[]) => Fig.Spec;
