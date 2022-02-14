import * as core from '@actions/core';
import * as github from '@actions/github';

async function main() {
  const token = core.getInput('github-token', { required: true });
  const octokit = github.getOctokit(token);
  const ref = core.getInput('ref', { required: true });
  const check_name = core.getInput('check-name');

  const check_suites = await octokit.paginate(
    octokit.rest.checks.listSuitesForRef,
    {
      ...github.context.repo,
      ref,
      check_name,
      status: 'completed',
    },
  );

  console.log(check_suites);
}

main();
