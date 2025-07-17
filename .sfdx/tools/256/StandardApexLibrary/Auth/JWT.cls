global class JWT {
	global JWT() { }
	global Object clone() { }
	global Map<String,Object> getAdditionalClaims() { }
	global String getAud() { }
	global String getIss() { }
	global Integer getNbfClockSkew() { }
	global String getSub() { }
	global Integer getValidityLength() { }
	global void setAdditionalClaims(Map<String,Object> additionalClaims) { }
	global void setAud(String aud) { }
	global void setIss(String iss) { }
	global void setNbfClockSkew(Integer nbfClockSkew) { }
	global void setSub(String sub) { }
	global void setValidityLength(Integer validityLength) { }
	global String toJSONString() { }

}