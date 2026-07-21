#!/usr/bin/env python3
"""Rebuild a transparent model cover from a browser-rendered screenshot.

The source cover supplies the trusted alpha channel. The screenshot is
captured on a known solid background, so changed foreground colours can be
recovered without introducing a rectangular background into the cover.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--render", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--background", default="eef3f8")
    return parser.parse_args()


def parse_hex_colour(value: str) -> tuple[int, int, int]:
    value = value.removeprefix("#")

    if len(value) != 6:
        raise ValueError("Background must be a six-digit RGB hex colour")

    return tuple(int(value[index : index + 2], 16) for index in (0, 2, 4))


def main() -> None:
    args = parse_args()
    source = Image.open(args.source).convert("RGBA")
    render = Image.open(args.render).convert("RGB")

    if source.size != render.size:
        raise ValueError(f"Size mismatch: source={source.size}, render={render.size}")

    background = parse_hex_colour(args.background)
    output = source.copy()
    source_pixels = source.load()
    render_pixels = render.load()
    output_pixels = output.load()
    changed_count = 0

    for y in range(source.height):
        for x in range(source.width):
            red, green, blue, alpha = source_pixels[x, y]

            if alpha == 0:
                continue

            composite = tuple(
                round((channel * alpha + bg * (255 - alpha)) / 255)
                for channel, bg in zip((red, green, blue), background)
            )
            rendered = render_pixels[x, y]

            if max(abs(a - b) for a, b in zip(composite, rendered)) <= 8:
                continue

            # Very faint antialiasing pixels amplify screenshot noise when
            # un-premultiplied; retaining their source colour avoids halos.
            if alpha < 16:
                continue

            recovered = tuple(
                max(0, min(255, round((channel * 255 - bg * (255 - alpha)) / alpha)))
                for channel, bg in zip(rendered, background)
            )
            output_pixels[x, y] = (*recovered, alpha)
            changed_count += 1

    if source.getchannel("A").tobytes() != output.getchannel("A").tobytes():
        raise RuntimeError("Output alpha channel differs from the source cover")

    args.out.parent.mkdir(parents=True, exist_ok=True)
    output.save(args.out)
    print(f"wrote {args.out} ({changed_count=})")


if __name__ == "__main__":
    main()
