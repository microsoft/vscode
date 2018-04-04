interface DiffHunkRange {
	originalStart: number;
	originalLength: number;
	start: number;
	length: number;

}

interface User {
	id: string;
	login: string;
}
export interface Comment {
	url: string;
	id: string;
	path: string;
	pull_request_review_id: string;
	diff_hunk_range: DiffHunkRange;
	position: number;
	originalPosition: number;
	commit_id: string;
	original_commit_id: string;
	user: User;
	body: string;
	created_at: string;
	updated_at: string;
	html_url: string;
}

