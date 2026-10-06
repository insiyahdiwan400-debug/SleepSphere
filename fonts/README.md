# The Arabic face

`amiri-naskh-v2.woff2` is a subset of **Amiri**, cut to the Arabic letter
repertoire SleepSphere may need to set.

## Why Amiri

The app sets two pieces of Arabic that matter: the bedtime dua and the
verse on the Learn screen. Both carry tashkeel, and both are religious
text, so the face has to be a **Naskh that was designed for pointed
text** — not a UI sans with Arabic bolted on, and not a display face.

Amiri is a revival of the Naskh cut by the Bulaq (Amiria) press in Cairo,
the tradition most printed Qur'ans and prayer books in this part of the
world are set in. Its marks sit where a reader of that tradition expects
them, which is the whole argument: a dua set in a UI font is legible but
reads as a notification.

The system stack it replaces — Al Bayan, Geeza Pro — is what iOS happens
to ship. Geeza Pro is a clear interface face and Al Bayan is heavier and
rounder; neither was drawn for a pointed devotional text, and which one a
participant saw depended on their device.

## What is in the file

Subset with `pyftsubset`, from `@fontsource/amiri`'s Arabic cut:

```bash
pyftsubset amiri-arabic-400-normal.woff2 \
  --text-file=subset.txt \
  --layout-features='*' \
  --flavor=woff2 \
  --output-file=amiri-naskh-v2.woff2 \
  --no-hinting --desubroutinize
```

`subset.txt` is **the whole basic Arabic letter repertoire** — every
letter and hamza form in U+0621–U+064A, every tashkeel mark, the dagger
alif and wasla, all ten Arabic-Indic digits, Arabic punctuation, the
Quranic marks, the joiners, and whatever Arabic happens to be in
`index.html` as a belt-and-braces check.

**The first cut was built only from the characters the file then
contained, and that was a mistake.** Adding the arc label الاستيقاظ
introduced ظ, which was not in it. A missing glyph does not fail: the
browser quietly takes that one letter from the system font, so a single
letter of one word would have been set in Geeza Pro with nothing to show
for it but a faint wrongness. Cutting the full letter set costs 7 KB and
makes that impossible for any Arabic added later.

All ten digits matter for the same reason in reverse: the dua's wake time
is built at runtime, so any digit can turn up in it whether or not it
appears in the source.

`--layout-features='*'` is deliberate. Arabic shaping needs `init`,
`medi`, `fina`, `isol`, `rlig`, `calt`, `mark` and `mkmk` at minimum, and
Amiri does a lot of its mark positioning through features that are easy
to miss when listing them by hand. Restricting the list saved 700 bytes
and risked a misplaced fatha, which is not a trade worth making.

What survived, checked on the cut file:

```
GSUB  ccmp dnom fina init locl medi numr pnum rlig
GPOS  curs kern mark mkmk
GDEF  present      1040 glyphs for 103 codepoints
```

**1040 glyphs for 103 codepoints** is the thing worth understanding before
reading a width measurement. Amiri does not place tashkeel on a fixed
letterform and hope; it substitutes a wider or differently-shaped variant
to make room for the mark it is about to position. So pointed text is
genuinely a little wider than the same text unpointed — about 17% for
`نَوْمَكُمْ` — and that is the font working, not marks failing to attach.
`test/night.js` asserted the opposite at first and was wrong.

**43 KB.** That is the whole cost, it is same-origin, and it is in the
service worker's shell so an installed PWA has it offline from the first
launch.

## If the font never loads

Nothing breaks. `@font-face` carries `font-display: swap` and every rule
that asks for Amiri names the old system stack behind it, so a
participant whose device fails to fetch it sees exactly what they saw
before. This is also why the CSP matters: `font-src 'self'` in `_headers`
allows this file and nothing else, so the font cannot be swapped for one
served from somewhere off-device.

## Licence

Amiri is under the **SIL Open Font License 1.1** — see `OFL.txt`, which
is the licence as shipped with the font and must stay with it. Copyright
2010–2022 The Amiri Project Authors, https://github.com/aliftype/amiri.

The OFL permits embedding and redistribution, including of a subset. It
forbids selling the font on its own and requires the licence to travel
with the file, which is what `OFL.txt` is doing here. The subset is not
renamed, because the OFL's reserved-name clause applies to Amiri only if
a Reserved Font Name were declared; it is not, and a subset is in any
case the same design.
