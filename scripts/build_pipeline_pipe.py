#!/usr/bin/env python3
"""Builds a longer version of the Pipeline pipe logo without making it taller.

What it is for: brand/pipeline-pipe-blank.svg is a pipe with an empty black label
band. A long heading (for example "CHOOSE YOUR DATA") needs a longer band. Scaling
the whole picture would also make it taller, so this script lengthens only the
middle: it widens the tube and the black band, and slides the flange and the right
end cap along by the same amount. The left end cap and every height stay the same.

Who calls it: run by hand when a longer pipe is needed.
What it touches: reads brand/pipeline-pipe-blank.svg, writes the file you name
(by default brand/pipeline-pipe-blank-wide.svg). Nothing else.

Usage:
  python3 scripts/build_pipeline_pipe.py --extra 1300
  python3 scripts/build_pipeline_pipe.py --extra 2000 --out brand/pipeline-pipe-blank-xl.svg

--extra is in the picture's own units; the original band is 2262 units long, and
the whole pipe is 4770 units wide by 800 high.
"""
import argparse
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "brand" / "pipeline-pipe-blank.svg"

BAND_WIDTH = 2261.90          # the black band, as drawn in the source file
BAND_X = 729.51               # where the band starts
RIGHT_RING_X = "2931.89"      # the ring at the right-hand end of the band
VIEW_W = 4770.0               # original viewBox width
UNIT_PX = 144 / 800           # pixels per unit in the source file's width/height


def build(extra: float) -> str:
    s = SRC.read_text()
    e = f"{extra:g}"

    # 1. the tube body (the first rect after the defs) gets longer
    m = re.search(r'(<rect x="253\.32" y="1250\.22" width=")4702\.38(")', s)
    if not m:
        raise SystemExit("could not find the tube body in the source file")
    s = s[: m.start()] + m.group(1) + f"{4702.38 + extra:.2f}" + m.group(2) + s[m.end():]

    # 2. the black band and its shading get longer
    old = f'width="{BAND_WIDTH:.2f}"'
    if s.count(old) != 2:
        raise SystemExit("expected the band to be drawn twice (colour and shading)")
    s = s.replace(old, f'width="{BAND_WIDTH + extra:.2f}"')

    # 3. the right end cap group slides right (it already has its own offset)
    m = re.search(r'<g transform="translate\((-?[0-9.]+),0\)">\s*<rect x="7583\.68"', s)
    if not m:
        raise SystemExit("could not find the right end cap group")
    new_t = float(m.group(1)) + extra
    s = s.replace(f'<g transform="translate({m.group(1)},0)">', f'<g transform="translate({new_t:.2f},0)">', 1)

    # 4. everything from the band's right-hand ring onward (ring, flange) slides right
    start = s.index(f'<rect x="{RIGHT_RING_X}"')
    end = s.rindex("</svg>")
    s = s[:start] + f'<g transform="translate({e},0)">' + s[start:end] + "</g>\n" + s[end:]

    # 5. the picture gets wider, never taller
    new_w = VIEW_W + extra
    s = re.sub(r'viewBox="225 1100 4770 800"', f'viewBox="225 1100 {new_w:g} 800"', s, count=1)
    s = re.sub(r'width="858"', f'width="{round(new_w * UNIT_PX)}"', s, count=1)
    s = s.replace('aria-label="pipeline pipe, blank label"', 'aria-label="pipeline pipe, long blank label"', 1)
    return s


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--extra", type=float, required=True, help="extra band length in picture units")
    ap.add_argument("--out", default=str(ROOT / "brand" / "pipeline-pipe-blank-wide.svg"))
    a = ap.parse_args()
    Path(a.out).write_text(build(a.extra))
    centre = BAND_X + (BAND_WIDTH + a.extra) / 2
    print(f"wrote {a.out}")
    print(f"band is now {BAND_WIDTH + a.extra:.0f} units long; put live text at x={centre:.1f}, y=1500 (viewBox 225 1100 {VIEW_W + a.extra:g} 800)")


if __name__ == "__main__":
    main()
