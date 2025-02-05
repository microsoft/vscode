import { Internal, Metadata } from "@fig/autocomplete-shared";
import { Result } from "../../shared/src/fuzzysort";
export type SpecLocation = Fig.SpecLocation & {
	diffVersionedFile?: string;
	privateNamespaceId?: number;
};
type Override<T, S> = Omit<T, keyof S> & S;
export type SuggestionType = Fig.SuggestionType | "history" | "auto-execute";
export type Suggestion<ArgT = Metadata.ArgMeta> = Override<Fig.Suggestion, {
	type?: SuggestionType;
	shouldAddSpace?: boolean;
	separatorToAdd?: string;
	args?: ArgT[];
	generator?: Fig.Generator;
	getQueryTerm?: (x: string) => string;
	fuzzyMatchData?: (Result | null)[];
	originalType?: SuggestionType;
}>;
export type Arg = Metadata.ArgMeta;
export type Option = Internal.Option<Metadata.ArgMeta, Metadata.OptionMeta>;
export type Subcommand = Internal.Subcommand<Metadata.ArgMeta, Metadata.OptionMeta, Metadata.SubcommandMeta>;
export { };
