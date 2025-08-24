#!/usr/bin/env bash
set -euo pipefail

# Fails only if core files (members.json, votes.json) are missing/empty.
# Warns if optional files are empty. Set STRICT=1 to fail on them too.

strict="${STRICT:-0}"   # export STRICT=1 to enforce optional as errors

must_exist_and_nonempty() {
  local f="$1"
  local required="$2" # yes/no

  if [ ! -f "$f" ]; then
    if [ "$required" = "no" ] && [ "$strict" != "1" ]; then
      echo "::warning file=$f::missing (optional)"
      return 0
    fi
    echo "::error file=$f::missing"
    return 1
  fi

  local sz
  sz=$(wc -c <"$f")
  if [ "$sz" -le 2 ]; then
    if [ "$required" = "no" ] && [ "$strict" != "1" ]; then
      echo "::warning file=$f::appears empty (size=$sz, optional)"
      return 0
    fi
    echo "::error file=$f::appears empty (size=$sz)"
    return 1
  fi

  echo "OK: $f ($sz bytes)"
}

echo "==> Verifying required data files"
must_exist_and_nonempty data/members.json yes
must_exist_and_nonempty data/votes.json yes

echo "==> Verifying optional data files"
must_exist_and_nonempty data/member-badges.json no
must_exist_and_nonempty data/member-finance-summary.json no

echo "Checks complete."
