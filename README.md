# actions-find-artifact-by-ref

Search all workflows associated with a particular ref (commit/tag/branch) to
find (and possibly download) a specific artifact. Will fail if zero or more than
one matching artifacts are found.

## Usage

```yaml
- uses: colpal/actions-find-artifact-by-ref@v1
  with:
    # The git ref for which the workflows should be searched
    # Required
    ref: string

    # The name of the artifact to match
    # Required
    artifact_name: string

    # Restrict search to Checks (Jobs) with this name
    # Optional
    # Default: undefined
    check_name: string

    # If true, will download the artifact to the current working directory
    # Optional
    # Default: false
    download: boolean

    # The token to use to authenticate to the GitHub API
    # Optional
    # Default: ${{ github.token }}
    github_token: string
```
