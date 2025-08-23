"""
This script fetches open issues from the microsoft/vscode-python repository,
calculates the thumbs-up per day for each issue, and generates a markdown
summary of the issues sorted by highest thumbs-up per day. Issues with zero
thumbs-up are excluded from the summary.
"""

import requests
import os
from datetime import datetime, timezone


GITHUB_API_URL = "https://api.github.com"
REPO = "microsoft/vscode-python"
TOKEN = os.getenv("GITHUB_TOKEN")


def fetch_issues():
    """
    Fetches all open issues from the specified GitHub repository.

    Returns:
        list: A list of dictionaries representing the issues.
    """
    headers = {"Authorization": f"token {TOKEN}"}
    issues = []
    page = 1
    while True:
        query = (
            f"{GITHUB_API_URL}/repos/{REPO}/issues?state=open&per_page=25&page={page}"
        )
        response = requests.get(query, headers=headers)
        if response.status_code == 403:
            raise Exception(
                "Access forbidden: Check your GitHub token and permissions."
            )
        response.raise_for_status()
        page_issues = response.json()
        if not page_issues:
            break
        issues.extend(page_issues)
        page += 1
    return issues


def calculate_thumbs_up_per_day(issue):
    """
    Calculates the thumbs-up per day for a given issue.

    Args:
        issue (dict): A dictionary representing the issue.

    Returns:
        float: The thumbs-up per day for the issue.
    """
    created_at = datetime.strptime(issue["created_at"], "%Y-%m-%dT%H:%M:%SZ").replace(
        tzinfo=timezone.utc
    )
    now = datetime.now(timezone.utc)
    days_open = (now - created_at).days or 1
    thumbs_up = issue["reactions"].get("+1", 0)
    return thumbs_up / days_open


def generate_markdown_summary(issues):
    """
    Generates a markdown summary of the issues.

    Args:
        issues (list): A list of dictionaries representing the issues.

    Returns:
        str: A markdown-formatted string summarizing the issues.
    """
    summary = "| URL | Title | 👍 | Days Open | 👍/day |\n| --- | ----- | --- | --------- | ------ |\n"
    issues_with_thumbs_up = []
    for issue in issues:
        created_at = datetime.strptime(
            issue["created_at"], "%Y-%m-%dT%H:%M:%SZ"
        ).replace(tzinfo=timezone.utc)
        now = datetime.now(timezone.utc)
        days_open = (now - created_at).days or 1
        thumbs_up = issue["reactions"].get("+1", 0)
        if thumbs_up > 0:
            thumbs_up_per_day = thumbs_up / days_open
            issues_with_thumbs_up.append(
                (issue, thumbs_up, days_open, thumbs_up_per_day)
            )

    # Sort issues by thumbs_up_per_day in descending order
    issues_with_thumbs_up.sort(key=lambda x: x[3], reverse=True)

    for issue, thumbs_up, days_open, thumbs_up_per_day in issues_with_thumbs_up:
        summary += f"| {issue['html_url']} | {issue['title']} | {thumbs_up} | {days_open} | {thumbs_up_per_day:.2f} |\n"

    return summary


def main():
    """
    Main function to fetch issues, generate the markdown summary, and write it to a file.
    """
    issues = fetch_issues()
    summary = generate_markdown_summary(issues)
    with open("endorsement_velocity_summary.md", "w") as f:
        f.write(summary)


if __name__ == "__main__":
    main()
