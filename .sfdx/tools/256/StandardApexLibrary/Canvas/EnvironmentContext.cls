global interface EnvironmentContext {
	void addEntityField(String param0);
	void addEntityFields(Set<String> param0);
	String getDisplayLocation();
	List<String> getEntityFields();
	String getLocationUrl();
	String getParametersAsJSON();
	String getSublocation();
	void setParametersAsJSON(String param0);

}