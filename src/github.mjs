export async function upsertComment(octokit, { owner, repo, pullNumber, body, marker }) {
  const existing = await octokit.paginate(octokit.rest.issues.listComments, {
    owner,
    repo,
    issue_number: pullNumber,
    per_page: 100,
  });

  const previous = existing.find((c) => c.body?.includes(marker));

  if (previous) {
    await octokit.rest.issues.updateComment({ owner, repo, comment_id: previous.id, body });
    return { action: "updated", commentId: previous.id };
  }

  const { data } = await octokit.rest.issues.createComment({ owner, repo, issue_number: pullNumber, body });
  return { action: "created", commentId: data.id };
}
