global interface ClientSidePaymentAdapter {
	String getClientComponentName();
	Map<String,String> getClientConfiguration();
	commercepayments.ClientResponse processClientRequest(commercepayments.ClientRequestContext param0, Map<String,Object> param1);

}