'use client';

import { Edit } from '@/database';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

interface EditFormProps {
	storyUid: string;
	edit?: Edit;
}

const EditForm: React.FC<EditFormProps> = ({ storyUid, edit: initialEdit }) => {
	const [prompt, setPrompt] = useState('');
	const [edit, setEdit] = useState<Edit | null>(initialEdit || null);
	const [isLoading, setIsLoading] = useState(false);
	const [isAccepting, setIsAccepting] = useState(false);
	const [isDiscarding, setIsDiscarding] = useState(false);
	const router = useRouter();

	useEffect(() => {
		if (edit) {
			setPrompt(edit.prompt);
		}
	}, [edit]);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setIsLoading(true);
		const response = await fetch(`/api/updateStory`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ storyUid, prompt }),
		});

		if (!response.ok) {
			console.error('Failed to fetch suggestions');
			setIsLoading(false);
			return;
		}

		const data = await response.json().catch(() => null);
		if (data) {
			setEdit(data);
		} else {
			console.error('Failed to parse JSON response');
		}
		setIsLoading(false);
	};

	const handleAcceptEdits = async () => {
		if (!edit || !edit.operations.length) {
			console.error('No edits to accept');
			return;
		}

		setIsAccepting(true);
		await fetch(`/api/acceptEdits`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ storyUid }),
		});
		setEdit(null);
		setIsAccepting(false);
		router.refresh();
	};

	const handleDiscardEdits = async () => {
		setIsDiscarding(true);
		await fetch(`/api/discardEdits`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ storyUid }),
		});
		setEdit(null);
		setIsDiscarding(false);
		router.refresh();
	};

	const handleFollowupClick = (followup: string) => {
		setPrompt((prevPrompt) => `${prevPrompt.trim()}\n${followup.trim()}`);
	};

	return (
		<div className="fixed top-0 right-0 w-1/3 p-4 bg-white shadow-lg h-full overflow-y-auto">
			<form onSubmit={handleSubmit}>
				<textarea
					value={prompt}
					onChange={(e) => setPrompt(e.target.value)}
					className="w-full h-20 p-2 border border-gray-300 rounded"
					placeholder="Enter your prompt here..."
					disabled={isLoading}
				/>
				<button type="submit" className={`mt-2 p-2 text-white rounded ${isLoading ? 'bg-gray-400' : 'bg-blue-500'}`} disabled={isLoading}>
					{isLoading ? 'Submitting...' : 'Submit'}
				</button>
			</form>
			{edit && (
				<div>
					<div className="flex justify-between items-baseline mt-4">
						<h2 className="text-xl font-bold">Suggestions</h2>
						<div className="flex space-x-2">
							<button onClick={handleAcceptEdits} className={`px-2 text-white rounded ${isAccepting ? 'bg-gray-400' : 'bg-green-500'}`} disabled={isAccepting}>
								{isAccepting ? 'Accepting...' : 'Accept'}
							</button>
							<button onClick={handleDiscardEdits} className={`px-2 text-white rounded ${isDiscarding ? 'bg-gray-400' : 'bg-red-500'}`} disabled={isDiscarding}>
								{isDiscarding ? 'Discarding...' : 'Discard'}
							</button>
						</div>
					</div>
					<div className="bg-gray-100 p-4 rounded">
						<ul className="list-disc ml-4">
							{edit.operations.map((suggestion, idx) => (
								<li key={idx} className="mt-1">
									<a href={`#edit-${idx}`} onMouseOver={() => {
										const element = document.querySelector(`[name=edit-${idx}]`);
										console.log(element);

										element?.classList.add('bg-red-100');
										element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
									}}
										onMouseOut={() => {
											document.querySelector(`[name=edit-${idx}]`)?.classList.remove('bg-red-100');
										}}
										className="font-medium">{suggestion.type}</a> at line {suggestion.line + 1}
									{suggestion.text && (
										<span>: {suggestion.text}</span>
									)}
								</li>
							))}
						</ul>
						<h3 className="mt-4 text-lg font-bold">Follow-up Suggestions</h3>
						<ul className="ml-4">
__SELECTION_HERE__
						</ul>
					</div>
				</div>
			)}
		</div>
	);
};

export default EditForm;
