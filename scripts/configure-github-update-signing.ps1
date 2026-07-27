param(
  [string]$Repository = "2-sa/Bear",
  [string]$KeyPath = "C:\Users\Windows\Documents\HarborSecrets\harbor-updater.key"
)

$ErrorActionPreference = "Stop"
$environmentName = "release-signing"
$releaseBranch = "main"

if (-not (Test-Path -LiteralPath $KeyPath -PathType Leaf)) {
  throw "Updater private key not found at $KeyPath"
}

gh auth status --hostname github.com *> $null
if ($LASTEXITCODE -ne 0) {
  throw "GitHub CLI is not authenticated. Run: gh auth login --hostname github.com --web"
}

$reviewerId = gh api user --jq ".id"
if ($LASTEXITCODE -ne 0) {
  throw "Could not resolve the authenticated GitHub user"
}

$environment = @{
  wait_timer = 0
  prevent_self_review = $false
  reviewers = @(@{ type = "User"; id = [long]$reviewerId })
  deployment_branch_policy = @{
    protected_branches = $false
    custom_branch_policies = $true
  }
} | ConvertTo-Json -Depth 5 -Compress

$environment |
  gh api --method PUT "repos/$Repository/environments/$environmentName" --input - --silent
if ($LASTEXITCODE -ne 0) {
  throw "Could not configure the $environmentName environment in $Repository"
}

$branchPoliciesJson = gh api "repos/$Repository/environments/$environmentName/deployment-branch-policies"
if ($LASTEXITCODE -ne 0) {
  throw "Could not inspect deployment branch policies"
}
$branchPolicyId = (($branchPoliciesJson | ConvertFrom-Json).branch_policies |
  Where-Object { $_.name -eq $releaseBranch -and $_.type -eq "branch" }).id
if (-not $branchPolicyId) {
  gh api --method POST "repos/$Repository/environments/$environmentName/deployment-branch-policies" -f "name=$releaseBranch" -f "type=branch" --silent
  if ($LASTEXITCODE -ne 0) {
    throw "Could not restrict $environmentName to the $releaseBranch branch"
  }
}

Get-Content -LiteralPath $KeyPath -Raw |
  gh secret set TAURI_SIGNING_PRIVATE_KEY --env $environmentName --repo $Repository
if ($LASTEXITCODE -ne 0) {
  throw "Could not store TAURI_SIGNING_PRIVATE_KEY in the $environmentName environment"
}

Write-Output "GitHub release-signing environment, main-branch policy, reviewer, and updater key configured for $Repository."
