global class TaxEngineContext {
	global TaxEngineContext(commercetax.TaxEngineRequest request, commercetax.RequestType requestType, String namedUri) { }
	global Object clone() { }
	global String getNamedUri() { }
	global commercetax.TaxEngineRequest getRequest() { }
	global commercetax.RequestType getRequestType() { }

}