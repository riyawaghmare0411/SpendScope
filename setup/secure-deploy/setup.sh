#!/usr/bin/env bash
# One-time setup for approval-gated deploys. Run it YOURSELF (not Claude), from the repo root:
#   bash setup/secure-deploy/setup.sh
# It grants access, so the person who owns the project runs it.
#
# What it creates:
#   Google Cloud: github-deployer account that can ship new server code but has NO access to
#     Secret Manager (database URL, Plaid keys). It has no key file; Google lets GitHub act as
#     it only for this repo + prod branch + the approved spendscope-live environment.
#   GitHub: spendscope-live environment (every deploy waits for your Approve click, prod only)
#     and prod branch protection (changes arrive by pull request, CI must pass, history can't
#     be rewritten or deleted).
# Safe to re-run: anything that already exists is skipped.
set -euo pipefail
# Note: no argument may contain a space -- Windows gcloud.cmd breaks on quoted arguments.
cd "$(dirname "$0")"

G="$(command -v gcloud.cmd || command -v gcloud || echo "/c/Users/riyaw/AppData/Local/Google/Cloud SDK/google-cloud-sdk/bin/gcloud.cmd")"
P=spendscope-app
NUM=579386639091
REPO=riyawaghmare0411/SpendScope
REPO_ID=1180229720
REVIEWER_ID=179628371
SA=github-deployer@$P.iam.gserviceaccount.com
POOL=projects/$NUM/locations/global/workloadIdentityPools/github

echo "== Google Cloud =="
"$G" services enable sts.googleapis.com iamcredentials.googleapis.com --project $P

"$G" iam service-accounts describe $SA --project $P >/dev/null 2>&1 \
  || "$G" iam service-accounts create github-deployer --project $P --display-name github-deployer-no-secret-access

# Deploy new revisions only. Deliberately NOT granted: secretmanager.* (secrets), owner/editor.
"$G" projects add-iam-policy-binding $P --member serviceAccount:$SA --role roles/run.developer --condition None --format none
"$G" artifacts repositories add-iam-policy-binding cloud-run-source-deploy --location us-east1 --project $P \
  --member serviceAccount:$SA --role roles/artifactregistry.writer --format none
# Lets it start revisions that run as the existing runtime account (which alone reads the secrets).
"$G" iam service-accounts add-iam-policy-binding $NUM-compute@developer.gserviceaccount.com --project $P \
  --member serviceAccount:$SA --role roles/iam.serviceAccountUser --format none

"$G" iam workload-identity-pools describe github --location global --project $P >/dev/null 2>&1 \
  || "$G" iam workload-identity-pools create github --location global --project $P --display-name GitHub-Actions
"$G" iam workload-identity-pools providers describe github-oidc --workload-identity-pool github --location global --project $P >/dev/null 2>&1 \
  || "$G" iam workload-identity-pools providers create-oidc github-oidc --workload-identity-pool github \
       --location global --project $P --display-name GitHub-OIDC --flags-file wif-provider.yaml

"$G" iam service-accounts add-iam-policy-binding $SA --project $P --role roles/iam.workloadIdentityUser \
  --member "principalSet://iam.googleapis.com/$POOL/attribute.repository_id/$REPO_ID" --format none

echo "== GitHub =="
gh api -X PUT repos/$REPO/environments/spendscope-live --input - >/dev/null <<EOF
{"reviewers":[{"type":"User","id":$REVIEWER_ID}],"prevent_self_review":false,
 "deployment_branch_policy":{"protected_branches":false,"custom_branch_policies":true}}
EOF
gh api repos/$REPO/environments/spendscope-live/deployment-branch-policies -q '.branch_policies[].name' | grep -qx prod \
  || gh api -X POST repos/$REPO/environments/spendscope-live/deployment-branch-policies -f name=prod -f type=branch >/dev/null

gh api -X PUT repos/$REPO/branches/prod/protection --input - >/dev/null <<EOF
{"required_status_checks":{"strict":false,"contexts":["test","frontend"]},
 "enforce_admins":true,
 "required_pull_request_reviews":{"required_approving_review_count":0},
 "restrictions":null,"allow_force_pushes":false,"allow_deletions":false}
EOF

echo
echo "Done. github-deployer roles (should be run.developer only at project level):"
"$G" projects get-iam-policy $P --flatten bindings --format "value(bindings.role)" --filter "bindings.members:$SA"
