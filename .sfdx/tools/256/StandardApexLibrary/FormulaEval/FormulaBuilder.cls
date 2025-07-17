global class FormulaBuilder {
	global formulaeval.FormulaInstance build() { }
	global Object clone() { }
	global formulaeval.FormulaBuilder parseAsTemplate(Boolean templateMode) { }
	global formulaeval.FormulaBuilder treatNumericNullAsZero(Boolean treatNumericNullAsZero) { }
	global formulaeval.FormulaBuilder withFormula(String formulaText) { }
	global formulaeval.FormulaBuilder withGlobalVariables(List<formulaeval.FormulaGlobal> formulaGlobals) { }
	global formulaeval.FormulaBuilder withReturnType(formulaeval.FormulaReturnType returnType) { }
	global formulaeval.FormulaBuilder withType(Schema.SObjectType contextToken) { }
	global formulaeval.FormulaBuilder withType(System.Type contextType) { }

}