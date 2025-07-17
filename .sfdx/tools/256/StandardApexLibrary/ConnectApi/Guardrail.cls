global class GuardRail {
	global Object clone() { }
	global static ConnectApi.IndustriesGuardrailRepresentation getIndustriesGuardrail(String component, String product, String name) { }
	global static ConnectApi.IndustriesGuardrailListRepresentation getIndustriesGuardrails(String component, String product) { }
	global static ConnectApi.ValidationMessageRepresentation postValidateGuardrail() { }

}