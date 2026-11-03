							{edit.followup.map((followup, idx) => (
								<li key={idx} className="mt-1">
									<button
										onClick={() => handleFollowupClick(followup)}
										className="text-white text-sm rounded-full"
									>
										{followup}
									</button>
								</li>
							))}