global class BuyerGroupResponse {
	global BuyerGroupResponse(Set<String> buyerGroupIds) { }
	global BuyerGroupResponse() { }
	global Object clone() { }
	global Set<String> getBuyerGroupIds() { }
	global void setBuyerGroupIds(Set<String> buyerGroupIds) { }
	global void setError(String errorMessage, String localizedErrorMessage) { }

}