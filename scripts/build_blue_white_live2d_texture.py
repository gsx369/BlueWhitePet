#!/usr/bin/env python3
"""Build a UV-safe blue/white Live2D texture from an approved image draft.

The image model is used to propose the color regions. This script then clips
those regions to the original texture's opaque white pixels and restores the
original alpha channel, so no UV island can move or change silhouette.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageFilter


BLUE = (74, 152, 223)
BLACK = (0, 0, 0)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--draft", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    return parser.parse_args()


def scaled_box(
    box: tuple[int, int, int, int],
    size: tuple[int, int],
) -> tuple[int, int, int, int]:
    width, height = size
    left, top, right, bottom = box

    return (
        round(left * width / 1024),
        round(top * height / 512),
        round(right * width / 1024),
        round(bottom * height / 512),
    )


def main() -> None:
    args = parse_args()
    source = Image.open(args.source).convert("RGBA")
    draft = Image.open(args.draft).convert("RGB").resize(
        source.size,
        Image.Resampling.LANCZOS,
    )
    output = source.copy()

    head_box = scaled_box((484, 29, 848, 257), source.size)

    source_pixels = source.load()
    draft_pixels = draft.load()
    output_pixels = output.load()
    width, height = source.size

    blue_mask = Image.new("L", source.size)
    blue_pixels = blue_mask.load()

    for y in range(head_box[1], head_box[3]):
        for x in range(head_box[0], head_box[2]):
            red, green, blue = draft_pixels[x, y]

            if blue > 140 and green > 70 and red < 170 and blue - red > 25:
                blue_pixels[x, y] = 255

    blue_neighbourhood = blue_mask.filter(ImageFilter.MaxFilter(7)).load()
    blue_count = 0
    boundary_count = 0

    for y in range(head_box[1], head_box[3]):
        for x in range(head_box[0], head_box[2]):
            source_red, source_green, source_blue, alpha = source_pixels[x, y]

            if alpha <= 16 or min(source_red, source_green, source_blue) <= 200:
                continue

            red, green, blue = draft_pixels[x, y]

            if blue_pixels[x, y]:
                output_pixels[x, y] = (*BLUE, alpha)
                blue_count += 1
            elif blue_neighbourhood[x, y] and max(red, green, blue) < 75:
                output_pixels[x, y] = (*BLACK, alpha)
                boundary_count += 1

    if source.getchannel("A").tobytes() != output.getchannel("A").tobytes():
        raise RuntimeError("Output alpha channel differs from the source texture")

    args.out.parent.mkdir(parents=True, exist_ok=True)
    output.save(args.out)
    print(f"wrote {args.out} ({blue_count=} {boundary_count=})")


if __name__ == "__main__":
    main()
