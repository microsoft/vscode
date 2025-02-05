import { createErrorInstance } from '../../shared/src/errors';

// LoadSpecErrors
export const MissingSpecError = createErrorInstance("MissingSpecError");
export const WrongDiffVersionedSpecError = createErrorInstance(
	"WrongDiffVersionedSpecError",
);
export const DisabledSpecError = createErrorInstance("DisabledSpecError");
export const LoadLocalSpecError = createErrorInstance("LoadLocalSpecError");
export const SpecCDNError = createErrorInstance("SpecCDNError");

// ParsingErrors
export const ParsingHistoryError = createErrorInstance("ParsingHistoryError");

export const ParseArgumentsError = createErrorInstance("ParseArgumentsError");
export const UpdateStateError = createErrorInstance("UpdateStateError");
