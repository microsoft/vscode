global class CPQProductOutputRepresentation {
	global Map<String,Object> additionalFields;
	global List<ConnectApi.CPQAttributeCategoryOutputRepresentation> attributeCategories;
	global Datetime availabilityDate;
	global List<ConnectApi.CPQCatalogOutputRepresentation> catalogs;
	global List<String> childVariationIds;
	global String configureDuringSale;
	global String description;
	global Datetime discontinuedDate;
	global String displayUrl;
	global Datetime endOfLifeDate;
	global String id;
	global Boolean isActive;
	global Boolean isAssetizable;
	global Boolean isComponentRequired;
	global Boolean isDefaultComponent;
	global Boolean isQuantityEditable;
	global Boolean isSoldOnlyWithOtherProds;
	global String name;
	global String nodeType;
	global String productClass;
	global ConnectApi.CPQProductClassificationOutputRepresentation productClassification;
	global String productCode;
	global List<ConnectApi.CPQProductComponentGroupOutputRepresentation> productComponentGroups;
	global String productInformation;
	global String productPricingInformation;
	global ConnectApi.CPQProductQuantityOutputRepresentation productQuantity;
	global ConnectApi.CPQProductRelatedComponentOutputRepresentation productRelatedComponent;
	global List<ConnectApi.CPQProductSellingModelOptionOutputRepresentation> productSellingModelOptions;
	global ConnectApi.CPQProductSpecificationTypeOutputRepresentation productSpecificationType;
	global String productType;
	global ConnectApi.CPQQualificationContextOutputRepresentation qualificationContext;
	global String status;
	global ConnectApi.UnitOfMeasureOutputRepresentation unitOfMeasure;
	global ConnectApi.ProductVariantAttributeSetOutputRepresentation variationAttributeSet;
	global Object clone() { }
	global Boolean equals(Object obj) { }
	global Double getBuildVersion() { }
	global Integer hashCode() { }
	global String toString() { }

}