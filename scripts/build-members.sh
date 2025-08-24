#!/usr/bin/env bash
set -euo pipefail

CSV=""
for CAND in config/members.csv config/member.csv; do
  [[ -f "$CAND" ]] && { CSV="$CAND"; break; }
done
[[ -z "${CSV:-}" ]] && { echo "[build-members] ERROR: missing config/members.csv (or config/member.csv)"; exit 1; }
echo "[build-members] CSV: $CSV"

mkdir -p data

TMP_MEMBERS="$(mktemp)"
npx -y csvtojson "$CSV" > "$TMP_MEMBERS"

FINANCE_FILE="data/financial_alignment.json"
DONORS_FILE="data/donors.json"
FINANCE_SRC="$( [[ -f "$FINANCE_FILE" ]] && cat "$FINANCE_FILE" || echo '{}' )"
DONORS_SRC="$(  [[ -f "$DONORS_FILE"  ]] && cat "$DONORS_FILE"  || echo '{}' )"

TMP_FIN="$(mktemp)"; printf '%s' "$FINANCE_SRC" > "$TMP_FIN"
TMP_DON="$(mktemp)"; printf '%s' "$DONORS_SRC"  > "$TMP_DON"

jq -n \
  --slurpfile members "$TMP_MEMBERS" \
  --slurpfile finance "$TMP_FIN" \
  --slurpfile donors  "$TMP_DON" '
  def as_map_by_bioguide($x):
    ( $x[0] // {} ) as $raw
    | if ($raw | type) == "object" then $raw
      elif ($raw | type) == "array" then
        ($raw | map(
           ( .bioguide // .bioguide_id // .Bioguide // .BIOGUIDE ) as $k
           | select($k != null) | { ($k): . }
        ) | add) // {}
      else {} end;

  def slugify(s):
    (s // "")
    | gsub("[^A-Za-z0-9]+"; "-")
    | gsub("(^-|-$)"; "")
    | ascii_downcase;

  (as_map_by_bioguide($finance)) as $F
  | (as_map_by_bioguide($donors )) as $D
  | ($members[0] // []) as $M
  | [ $M[] | . as $m
      | ( .bioguide // .bioguide_id // .Bioguide // .BIOGUIDE // .id // .ID ) as $bg
      | ( .name // .Name // ((.first // .First // "") + " " + (.last // .Last // "")) ) as $nm
      | . + {
          slug: slugify($nm),
          finance: (if $bg != null then ($F[$bg] // null) else null end),
          donors:  (if $bg != null then ($D[$bg] // null) else null end)
        }
    ]
' > data/members.json

echo "[build-members] wrote data/members.json ($(jq 'length' data/members.json) members)"
