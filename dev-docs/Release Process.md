# Release Process

Versioning lives in git branch names and tags, computed in CI.

Branch off `main` as `release/vX.Y[.Z][-suffix]` (for example `release/v2.4`, `release/v2.4-beta`, or `release/v2.4.1-beta`) and push it. The `Release` workflow parses `major.minor[-suffix]` from the branch name, finds the highest existing tag with that prefix, bumps the patch by 1, and force-pushes the new tag. If the branch includes an explicit patch and no matching tag exists, that patch is used as the first version. Pushing again to the same release branch computes the next patch.

It then builds `linux/amd64` and `linux/arm64` images for each deployable service (not `ase-mock-service` or `http-signature-service`), publishes them to GHCR, and creates or updates a GitHub Release.

Images are named `ghcr.io/interledger/rhyza-<package>-<arch>:<version>`. A version such as `v2.4.2` is also tagged as `v2.4` and `v2`, and a multi-arch manifest is published at `ghcr.io/interledger/rhyza-<package>:<version>`. Those aliases are only moved on `release/v*` publishes, not on `workflow_dispatch`.

`workflow_dispatch` on a non-`main` ref builds and pushes images tagged with a sanitized form of the ref name (`/` becomes `_`), with no git tag, GitHub Release, or parent aliases. A push to `main` runs the workflow without publishing. Other branches do not trigger it.

Changelog categories come from PR labels via `.github/release.yml`: `breaking` (Breaking Changes), `dependencies` (Dependency Updates), and every remaining PR (General Changes). Create the `breaking` and `dependencies` labels in the GitHub repo before using them on PRs. Versions ending in `-alpha` are marked prerelease. GitHub picks the highest published semver as the repo's Latest release, so a patch on an older major (for example `v1.0.1` after `v2.0.0`) does not take over Latest. GitHub generates the release notes, including on the first tag when no previous release exists.
