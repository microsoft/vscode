def sherlock():

    # Results from analysis of all sites
    results_total = {}
    site_data = {}

    # Open the file containing account links
    # Core logic: If tor requests, make them here. If multi-threaded requests, wait for responses
    for social_network in site_data.items():

        # Retrieve results again
        results_site = results_total.get(social_network)

        # Notify caller about results of query.
        result = {}

        # Save status of request
        results_site["status"] = result

        # Save results from request
        results_site["http_status"] = '404'
        results_site["response_text"] = 'Error!'

        # Add this site's results into final dictionary with all of the other results.
        results_total[social_network] = results_site

    return results_total