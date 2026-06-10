#!/usr/bin/env python3
from __future__ import annotations

import argparse
from collections import deque
from pathlib import Path

from PIL import Image


def is_background_candidate(px: tuple[int, int, int, int]) -> bool:
    r, g, b, a = px
    if a == 0:
        return True
    # Chroma-key fallback.
    if g > 210 and r < 90 and b < 90:
        return True
    # GPT-Image often paints a fake transparency checkerboard as light neutral
    # gray/white squares. Remove only connected border pixels matching that.
    if min(r, g, b) >= 188 and max(r, g, b) - min(r, g, b) <= 18:
        return True
    return False


def remove_connected_background(im: Image.Image) -> Image.Image:
    rgba = im.convert("RGBA")
    w, h = rgba.size
    pix = rgba.load()
    visited = bytearray(w * h)
    q: deque[tuple[int, int]] = deque()

    def push(x: int, y: int) -> None:
        idx = y * w + x
        if visited[idx]:
            return
        visited[idx] = 1
        if is_background_candidate(pix[x, y]):
            q.append((x, y))

    for x in range(w):
        push(x, 0)
        push(x, h - 1)
    for y in range(1, h - 1):
        push(0, y)
        push(w - 1, y)

    bg = bytearray(w * h)
    while q:
        x, y = q.popleft()
        bg[y * w + x] = 1
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if nx < 0 or ny < 0 or nx >= w or ny >= h:
                continue
            idx = ny * w + nx
            if visited[idx]:
                continue
            visited[idx] = 1
            if is_background_candidate(pix[nx, ny]):
                q.append((nx, ny))

    out = rgba.copy()
    opix = out.load()
    for y in range(h):
        row = y * w
        for x in range(w):
            if bg[row + x]:
                r, g, b, _ = opix[x, y]
                opix[x, y] = (r, g, b, 0)
    return out


def fit_to_square(im: Image.Image, size: int, padding: int) -> Image.Image:
    alpha = im.getchannel("A")
    bbox = alpha.getbbox()
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    if not bbox:
        return canvas
    subject = im.crop(bbox)
    max_side = size - padding * 2
    scale = min(max_side / subject.width, max_side / subject.height)
    new_size = (max(1, round(subject.width * scale)), max(1, round(subject.height * scale)))
    subject = subject.resize(new_size, Image.Resampling.LANCZOS)
    x = (size - subject.width) // 2
    y = (size - subject.height) // 2
    canvas.alpha_composite(subject, (x, y))
    return canvas


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--size", type=int, default=220)
    parser.add_argument("--padding", type=int, default=10)
    args = parser.parse_args()

    processed = remove_connected_background(Image.open(args.input))
    final = fit_to_square(processed, args.size, args.padding)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    final.save(args.out)


if __name__ == "__main__":
    main()
