#!/bin/bash
# Ένα αρχείο γραμματοσειράς ανά βάρος, με ελληνικά + λατινικά + σημεία στίξης του σάιτ (αντί για 2 αρχεία ανά βάρος).
# Χρειάζεται: pip install fonttools brotli · και τα πλήρη TTF (Google Fonts, SIL OFL), π.χ.:
#   npm pack @expo-google-fonts/fira-sans @expo-google-fonts/fira-sans-condensed @expo-google-fonts/jetbrains-mono  (και tar xzf)
# Χρήση: site/tools/subset-fonts.sh <φάκελος με τα .ttf>
set -euo pipefail
SRC=$1; OUT=$(dirname "$0")/../src/assets/fonts
U="U+0020-007E,U+00A0-00FF,U+0131,U+0152-0153,U+02C6,U+02DA,U+02DC,U+0370-0377,U+037A-037F,U+0384-038A,U+038C,U+038E-03A1,U+03A3-03FF,U+2010-2027,U+2030-203A,U+20AC,U+2122,U+2190-2193,U+2212,U+2260"
for pair in FiraSans_400Regular:fira-sans-400 FiraSans_500Medium:fira-sans-500 FiraSans_600SemiBold:fira-sans-600 FiraSans_700Bold:fira-sans-700 \
            FiraSansCondensed_600SemiBold:fira-sans-condensed-600 FiraSansCondensed_700Bold:fira-sans-condensed-700 FiraSansCondensed_800ExtraBold:fira-sans-condensed-800 \
            JetBrainsMono_600SemiBold:jetbrains-mono-600; do
  f=$(find "$SRC" -name "${pair%%:*}.ttf" | head -1); dst=${pair##*:}
  pyftsubset "$f" --unicodes="$U" --layout-features='kern,liga,calt,tnum,lnum,case,locl,ccmp,mark,mkmk' \
    --flavor=woff2 --no-hinting --desubroutinize --output-file="$OUT/$dst.woff2"
  echo "$dst.woff2 $(wc -c < "$OUT/$dst.woff2") bytes"
done
