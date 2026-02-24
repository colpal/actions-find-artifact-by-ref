import { writeFile } from 'fs/promises';
import { getBooleanInput, getInput, setOutput } from '@actions/core';
import { context, getOctokit } from '@actions/github';
import { throttling } from "@octokit/plugin-throttling";

function flatten(xs) {
  return xs.flat();
}

async function getCheckRunsForCommit(octokit, ref, check_name) {
  return octokit.paginate(octokit.rest.checks.listForRef, {
    ...context.repo,
    ref,
    check_name,
  });
}

function checkRunToWorkflowID(checkRun) {
  const re = "/runs/([^/]+)/job/"
  const matches = checkRun.details_url.match(re);
  if (!matches) {
    throw new Error(`No Workflow ID found for Check Run ${checkRun.id}!`);
  }
  return matches[1];
}

async function queryWorkflowIDsForCommit(octokit, ref) {
  const response = await octokit.graphql(
    `
      query ($owner: String!, $repo: String!, $ref: String!) {
        repository(owner: $owner, name: $repo) {
          object(expression: $ref) {
            ... on Commit {
              checkSuites(last: 100) {
                nodes {
                  workflowRun {
                    databaseId
                  }
                }
              }
            }
          }
        }
      }
    `,
    { ...context.repo, ref },
  );
  return response
    .repository
    .object
    .checkSuites
    .nodes
    .map((n) => n?.workflowRun?.databaseId)
    .filter(Boolean);
}

async function getAllArtifacts(octokit, workflowIDs) {
  return Promise.all(workflowIDs.map((id) => (
    octokit.paginate(octokit.rest.actions.listWorkflowRunArtifacts, {
      ...context.repo,
      run_id: id,
    })
  ))).then(flatten);
}

async function findWorkflowIDs(octokit, ref, runName) {
  if (runName) {
    const checkRuns = await getCheckRunsForCommit(octokit, ref, runName);
    const workflowIDs = checkRuns.map(checkRunToWorkflowID);
    return Array.from(new Set(workflowIDs))
  } else {
    return queryWorkflowIDsForCommit(octokit, ref);
  }
}

async function downloadArtifact(octokit, { id, name }) {
  const { data } = await octokit.rest.actions.downloadArtifact({
    ...context.repo,
    archive_format: 'zip',
    artifact_id: id,
  });
  return writeFile(`${name}.zip`, Buffer.from(data));
}

function initOctokit(token) {
  return getOctokit(
    token,
    {
      throttle: {
        onRateLimit(retryAfter, _options, octokit, retryCount) {
          octokit.log.warn("Rate Limit Hit", { retryAfter });
          if (retryCount < 1) return true;
        },
        onSecondaryRateLimit(retryAfter, _options, octokit, retryCount) {
          octokit.log.warn("Secondary Rate Limit Hit", { retryAfter });
          if (retryCount < 1) return true;
        },
      },
    },
    throttling,
  );
}

async function main() {
  const octokit = initOctokit(getInput('github_token', { required: true }));

  const workflowIDs = await findWorkflowIDs(
    octokit,
    getInput('ref', { required: true }),
    getInput('run_name', { required: false }),
  )
  const artifacts = await getAllArtifacts(octokit, workflowIDs);

  const artifactName = getInput('artifact_name', { required: true });
  const matchingArtifacts = artifacts.filter((a) => a.name === artifactName);

  switch (matchingArtifacts.length) {
    case 1: {
      const [artifact] = matchingArtifacts;
      setOutput('artifact_id', artifact.id);
      if (getBooleanInput('download')) {
        await downloadArtifact(octokit, artifact);
      }
      break;
    }
    case 0:
      setOutput('error', 'no-artifacts');
      throw new Error(`No artifacts found match the name: ${artifactName}`);
    default: {
      const onDuplicate = getInput("on_duplicate");
      switch (onDuplicate) {
        case "error": {
          setOutput('error', 'multiple-artifacts');
          const urls = matchingArtifacts.map((a) => `'${a.url}'`).join(', ');
          throw new Error(`Multiple artifacts found: [ ${urls} ]`);
        }
        default:
          throw new Error(`Unsupported Option: on_duplicate = ${onDuplicate}`);
      }
    }
  }
}

main();
