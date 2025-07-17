global class PageReference {
	global PageReference(SObject sobject) { }
	global PageReference(String url) { }
	global Boolean equals(Object obj) { }
	/**
	 * The name of the anchor located on the page
	 */
	global String getAnchor() { }
	/**
	 * The rendered content for the page
	 */
	global Blob getContent() { }
	/**
	 * The rendered content for the page converted to PDF format
	 */
	global Blob getContentAsPDF() { }
	/**
	 * Get cookies
	 */
	global Map<String,System.Cookie> getCookies() { }
	/**
	 * The HTTP headers
	 */
	global Map<String,String> getHeaders() { }
	/**
	 * The query/form parameters
	 */
	global Map<String,String> getParameters() { }
	/**
	 * The next page to navigate to will be a redirect and the page state will be reset
	 */
	global Boolean getRedirect() { }
	/**
	 * When this PageReference is set up to redirect, the returned HTTP redirect code will be used
	 */
	global Integer getRedirectCode() { }
	/**
	 * The url of this page reference
	 */
	global String getUrl() { }
	global Integer hashCode() { }
	/**
	 * The name of the anchor located on the page
	 */
	global System.PageReference setAnchor(String anchor) { }
	/**
	 * Set cookies
	 */
	global void setCookies(List<System.Cookie> cookies) { }
	/**
	 * The next page to navigate to will be a redirect and the page state will be reset
	 */
	global System.PageReference setRedirect(Boolean redirect) { }
	/**
	 * When this PageReference is set up to redirect, the provided HTTP redirect code will be used instead of a default redirection
	 */
	global System.PageReference setRedirectCode(Integer redirectCode) { }
	global String toString() { }

}