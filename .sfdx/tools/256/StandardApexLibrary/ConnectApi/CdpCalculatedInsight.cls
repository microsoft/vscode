global class CdpCalculatedInsight {
	global Object clone() { }
	global static ConnectApi.CdpCalculatedInsightOutput cloneCalculatedInsight(String apiName) { }
	global static ConnectApi.CdpCalculatedInsightOutput createCalculatedInsight(ConnectApi.CdpCalculatedInsightInput input) { }
	global static void deleteCalculatedInsight(String apiName) { }
	global static ConnectApi.CdpCalculatedInsightOutput deployCalculatedInsightFromPackage(String apiName) { }
	global static ConnectApi.CdpCalculatedInsightStandardActionResponseRepresentation disableCalculatedInsight(String apiName) { }
	global static ConnectApi.CdpCalculatedInsightStandardActionResponseRepresentation enableCalculatedInsight(String apiName) { }
	global static ConnectApi.CdpCalculatedInsightOutput getCalculatedInsight(String apiName) { }
	global static ConnectApi.CdpCalculatedInsightPage getCalculatedInsights(String definitionType, Integer batchSize, Integer offset, String orderby, String dataspace, String pageToken) { }
	global static ConnectApi.CdpCalculatedInsightPage getCalculatedInsights(String definitionType, Integer batchSize, Integer offset, String orderby, String dataspace) { }
	global static ConnectApi.CdpCalculatedInsightStandardActionResponseRepresentation refreshStatusCalculatedInsight(String apiName) { }
	global static ConnectApi.CdpCalculatedInsightStandardActionResponseRepresentation runCalculatedInsight(String apiName) { }
	global static ConnectApi.CdpCalculatedInsightOutput updateCalculatedInsight(String apiName, ConnectApi.CdpCalculatedInsightInput input) { }
	global static ConnectApi.CdpCalculatedInsightStandardActionResponseRepresentation validateCalculatedInsight(ConnectApi.CdpCalculatedInsightValidateInput input) { }

}