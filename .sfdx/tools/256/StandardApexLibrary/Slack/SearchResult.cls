global class SearchResult {
	global SearchResult() { }
	global Object clone() { }
	global List<Slack.MatchedItem> getMatches() { }
	global Slack.SearchResult.Pagination getPagination() { }
	global Slack.Paging getPaging() { }
	global List<String> getRefinements() { }
	global Integer getTotal() { }
	global void setMatches(List<Slack.MatchedItem> matches) { }
	global void setPagination(Slack.SearchResult.Pagination pagination) { }
	global void setPaging(Slack.Paging paging) { }
	global void setRefinements(List<String> refinements) { }
	global void setTotal(Integer total) { }
	global String toString() { }
global class Pagination {
	global SearchResult.Pagination() { }
	global Object clone() { }
	global Integer getFirst() { }
	global Integer getLast() { }
	global Integer getPage() { }
	global Integer getPageCount() { }
	global Integer getPerPage() { }
	global Integer getTotalCount() { }
	global void setFirst(Integer first) { }
	global void setLast(Integer last) { }
	global void setPage(Integer page) { }
	global void setPageCount(Integer pageCount) { }
	global void setPerPage(Integer perPage) { }
	global void setTotalCount(Integer totalCount) { }

}

}