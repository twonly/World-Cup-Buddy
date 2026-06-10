#!/usr/bin/env python3
from __future__ import annotations

import json
import shutil
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


MOODS = ("idle", "watch", "cheer", "sad", "flag", "sleep", "dance")
CANVAS = 110
SCALE = 2
ROOT = Path(__file__).resolve().parents[1]
PROJECT_PACK_ROOT = ROOT / "character-packs"
USER_PACK_ROOT = Path.home() / "Library/Application Support/fanshrimp-nba/characters"


TEAMS = {
    "spurs-pixel-shrimp": {
        "name": "Spurs Pixel Shrimp",
        "author": "Codex",
        "initials": "SA",
        "shell": "#d9dde2",
        "shell_shadow": "#a9afb7",
        "primary": "#121417",
        "secondary": "#f1f5f9",
        "accent": "#a6adb7",
        "accent2": "#00b3b8",
        "accent3": "#ef4f9b",
        "trim": "#ffffff",
        "eye": "#111827",
    },
    "knicks-pixel-shrimp": {
        "name": "Knicks Pixel Shrimp",
        "author": "Codex",
        "initials": "NY",
        "shell": "#f58426",
        "shell_shadow": "#c85b17",
        "primary": "#006bb6",
        "secondary": "#f58426",
        "accent": "#ffffff",
        "accent2": "#f5f8ff",
        "accent3": "#ffb84d",
        "trim": "#ffffff",
        "eye": "#13294b",
    },
}


def hex_to_rgba(value: str, alpha: int = 255) -> tuple[int, int, int, int]:
    value = value.lstrip("#")
    return tuple(int(value[i : i + 2], 16) for i in (0, 2, 4)) + (alpha,)


def ellipse(draw: ImageDraw.ImageDraw, xy, fill, outline="#1b1b1f", width=2) -> None:
    draw.ellipse(xy, fill=hex_to_rgba(fill), outline=hex_to_rgba(outline), width=width)


def rect(draw: ImageDraw.ImageDraw, xy, fill, outline="#1b1b1f", width=2) -> None:
    draw.rounded_rectangle(xy, radius=2, fill=hex_to_rgba(fill), outline=hex_to_rgba(outline), width=width)


def polygon(draw: ImageDraw.ImageDraw, points, fill, outline="#1b1b1f") -> None:
    draw.polygon(points, fill=hex_to_rgba(fill))
    draw.line(points + [points[0]], fill=hex_to_rgba(outline), width=2, joint="curve")


def line(draw: ImageDraw.ImageDraw, points, fill="#1b1b1f", width=2) -> None:
    draw.line(points, fill=hex_to_rgba(fill), width=width, joint="curve")


def draw_ball(draw: ImageDraw.ImageDraw, cx: int, cy: int, r: int = 9) -> None:
    ellipse(draw, (cx - r, cy - r, cx + r, cy + r), "#d97706", "#5f2d12", 2)
    line(draw, [(cx - r + 2, cy), (cx + r - 2, cy)], "#5f2d12", 1)
    line(draw, [(cx, cy - r + 2), (cx, cy + r - 2)], "#5f2d12", 1)
    draw.arc((cx - r - 3, cy - r, cx + r - 3, cy + r), 285, 75, fill=hex_to_rgba("#5f2d12"), width=1)
    draw.arc((cx - r + 3, cy - r, cx + r + 3, cy + r), 105, 255, fill=hex_to_rgba("#5f2d12"), width=1)


def draw_eye(draw: ImageDraw.ImageDraw, x: int, y: int, mode: str, team: dict) -> None:
    if mode == "sleep":
        line(draw, [(x - 4, y), (x + 4, y)], team["eye"], 2)
        return
    if mode == "sad":
        line(draw, [(x - 4, y - 2), (x + 4, y + 2)], team["eye"], 2)
        return
    if mode == "cheer":
        line(draw, [(x - 4, y - 3), (x, y + 2), (x + 4, y - 3)], team["eye"], 2)
        return

    ellipse(draw, (x - 5, y - 5, x + 5, y + 5), "#ffffff", "#1b1b1f", 1)
    pupil_shift = -1 if mode == "watch" else 0
    ellipse(draw, (x - 1 + pupil_shift, y - 1, x + 3 + pupil_shift, y + 3), team["eye"], team["eye"], 1)


def draw_mouth(draw: ImageDraw.ImageDraw, mood: str, x: int, y: int) -> None:
    color = "#401b12"
    if mood == "sad":
        draw.arc((x - 6, y, x + 6, y + 10), 200, 340, fill=hex_to_rgba(color), width=2)
    elif mood == "cheer":
        ellipse(draw, (x - 4, y - 1, x + 4, y + 7), "#401b12", "#401b12", 1)
    elif mood == "sleep":
        line(draw, [(x - 4, y + 2), (x + 4, y + 2)], color, 1)
    else:
        draw.arc((x - 7, y - 4, x + 7, y + 8), 20, 160, fill=hex_to_rgba(color), width=2)


def draw_spark(draw: ImageDraw.ImageDraw, x: int, y: int, color: str) -> None:
    line(draw, [(x, y - 4), (x, y + 4)], color, 1)
    line(draw, [(x - 4, y), (x + 4, y)], color, 1)
    draw.point((x, y), fill=hex_to_rgba("#ffffff"))


def arm_points(mood: str):
    if mood == "cheer":
        return ((44, 57), (31, 31)), ((76, 57), (91, 31))
    if mood == "flag":
        return ((43, 59), (30, 34)), ((77, 59), (86, 69))
    if mood == "sad":
        return ((43, 63), (33, 76)), ((77, 63), (88, 76))
    if mood == "dance":
        return ((44, 58), (30, 44)), ((76, 58), (90, 52))
    if mood == "watch":
        return ((43, 62), (36, 70)), ((77, 62), (84, 70))
    if mood == "sleep":
        return ((43, 62), (34, 67)), ((77, 62), (85, 66))
    return ((43, 60), (35, 61)), ((77, 60), (87, 62))


def draw_flag(draw: ImageDraw.ImageDraw, team: dict, x: int = 30, y: int = 34) -> None:
    line(draw, [(x, y), (x, y + 28)], "#1b1b1f", 2)
    polygon(draw, [(x + 1, y), (x + 26, y + 4), (x + 1, y + 14)], team["primary"], "#1b1b1f")
    polygon(draw, [(x + 3, y + 4), (x + 18, y + 6), (x + 3, y + 11)], team["secondary"], team["secondary"])


def draw_shrimp(team: dict, mood: str) -> Image.Image:
    im = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    draw = ImageDraw.Draw(im)
    font = ImageFont.load_default()

    # Antennae and team-colored headband live behind the face.
    line(draw, [(62, 31), (53, 16), (48, 13)], team["shell_shadow"], 2)
    line(draw, [(75, 32), (87, 17), (93, 15)], team["shell_shadow"], 2)
    ellipse(draw, (46, 20, 50, 24), team["accent3"], team["accent3"], 1)
    ellipse(draw, (91, 13, 95, 17), team["accent3"], team["accent3"], 1)

    # Tail curl.
    polygon(draw, [(24, 47), (38, 53), (28, 60), (39, 68), (23, 76), (18, 65), (25, 59), (17, 54)], team["shell_shadow"])
    line(draw, [(28, 55), (35, 58), (29, 63), (35, 67)], team["trim"], 1)

    # Arms first, so the body sits naturally on top.
    (l0, l1), (r0, r1) = arm_points(mood)
    line(draw, [l0, l1], team["shell_shadow"], 5)
    line(draw, [r0, r1], team["shell_shadow"], 5)
    ellipse(draw, (l1[0] - 6, l1[1] - 5, l1[0] + 6, l1[1] + 5), team["shell"], "#1b1b1f", 2)
    ellipse(draw, (r1[0] - 6, r1[1] - 5, r1[0] + 6, r1[1] + 5), team["shell"], "#1b1b1f", 2)

    if mood == "flag":
        draw_flag(draw, team, 30, 31)

    # Body and face.
    ellipse(draw, (31, 30, 84, 82), team["shell"], "#1b1b1f", 3)
    draw.arc((30, 34, 82, 82), 190, 320, fill=hex_to_rgba(team["shell_shadow"]), width=2)
    draw.arc((35, 39, 79, 79), 190, 315, fill=hex_to_rgba(team["trim"]), width=1)

    # Jersey panel, designed as a city-initial patch instead of official logos.
    rect(draw, (43, 60, 75, 88), team["primary"], "#1b1b1f", 2)
    line(draw, [(44, 66), (74, 66)], team["secondary"], 2)
    line(draw, [(47, 84), (72, 84)], team["accent"], 1)
    text = team["initials"]
    bbox = draw.textbbox((0, 0), text, font=font)
    tx = 59 - (bbox[2] - bbox[0]) // 2
    draw.text((tx, 69), text, fill=hex_to_rgba(team["trim"]), font=font)

    # Headband accent.
    line(draw, [(53, 36), (80, 38)], team["primary"], 3)
    line(draw, [(53, 39), (80, 41)], team["secondary"], 2)

    # Feet.
    ellipse(draw, (39, 84, 54, 92), team["shell_shadow"], "#1b1b1f", 1)
    ellipse(draw, (67, 84, 82, 92), team["shell_shadow"], "#1b1b1f", 1)

    # Mood-specific face and props.
    eye_y = 47 if mood != "sad" else 50
    draw_eye(draw, 58, eye_y, mood, team)
    draw_eye(draw, 73, eye_y, mood, team)
    if mood == "dance":
        rect(draw, (53, 43, 65, 50), "#111827", "#111827", 1)
        rect(draw, (68, 43, 80, 50), "#111827", "#111827", 1)
        line(draw, [(64, 46), (69, 46)], "#111827", 1)
    draw_mouth(draw, mood, 66, 55)

    if mood == "idle":
        draw_ball(draw, 88, 78, 8)
    elif mood == "watch":
        draw_ball(draw, 23, 83, 7)
        line(draw, [(47, 92), (82, 92)], team["primary"], 3)
    elif mood == "cheer":
        draw_ball(draw, 88, 22, 6)
        for x, y, c in [(22, 25, team["secondary"]), (95, 48, team["accent3"]), (18, 78, team["accent2"])]:
            draw_spark(draw, x, y, c)
    elif mood == "sad":
        ellipse(draw, (76, 55, 80, 61), "#60a5fa", "#60a5fa", 1)
        draw_ball(draw, 90, 88, 6)
    elif mood == "sleep":
        draw.text((84, 23), "Z", fill=hex_to_rgba(team["primary"]), font=font)
        draw.text((93, 13), "z", fill=hex_to_rgba(team["secondary"]), font=font)
    elif mood == "dance":
        draw_spark(draw, 25, 31, team["secondary"])
        draw_spark(draw, 91, 74, team["accent3"])
        draw.text((20, 71), "♪", fill=hex_to_rgba(team["primary"]), font=font)

    return im.resize((CANVAS * SCALE, CANVAS * SCALE), Image.Resampling.NEAREST)


def write_pack(root: Path, slug: str, team: dict) -> Path:
    pack_dir = root / slug
    pack_dir.mkdir(parents=True, exist_ok=True)
    (pack_dir / "pack.json").write_text(
        json.dumps({"name": team["name"], "author": team["author"]}, indent=2),
        encoding="utf-8",
    )
    for mood in MOODS:
        draw_shrimp(team, mood).save(pack_dir / f"{mood}.png")
    return pack_dir


def make_preview(pack_root: Path) -> Path:
    cell = 150
    header = 24
    rows = len(TEAMS)
    cols = len(MOODS)
    preview = Image.new("RGBA", (cols * cell, rows * cell + header), "#f6f7f9ff")
    draw = ImageDraw.Draw(preview)
    font = ImageFont.load_default()
    for x in range(0, preview.width, 10):
        for y in range(header, preview.height, 10):
            if ((x // 10) + (y // 10)) % 2 == 0:
                draw.rectangle((x, y, x + 9, y + 9), fill="#e5e7ebff")
    for col, mood in enumerate(MOODS):
        draw.text((col * cell + 8, 7), mood, fill="#111827ff", font=font)
    for row, (slug, team) in enumerate(TEAMS.items()):
        for col, mood in enumerate(MOODS):
            sprite = Image.open(pack_root / slug / f"{mood}.png").resize((116, 116), Image.Resampling.NEAREST)
            x = col * cell + (cell - sprite.width) // 2
            y = header + row * cell + 14
            preview.alpha_composite(sprite, (x, y))
        draw.text((6, header + row * cell + cell - 17), team["name"], fill="#111827ff", font=font)
    out = pack_root / "_preview_spurs_knicks_pixel.png"
    preview.convert("RGB").save(out)
    return out


def main() -> None:
    PROJECT_PACK_ROOT.mkdir(parents=True, exist_ok=True)
    USER_PACK_ROOT.mkdir(parents=True, exist_ok=True)

    generated = []
    for slug, team in TEAMS.items():
        project_dir = write_pack(PROJECT_PACK_ROOT, slug, team)
        user_dir = USER_PACK_ROOT / slug
        if user_dir.exists():
            shutil.rmtree(user_dir)
        shutil.copytree(project_dir, user_dir)
        generated.append((project_dir, user_dir))

    preview = make_preview(PROJECT_PACK_ROOT)
    print(f"preview={preview}")
    for project_dir, user_dir in generated:
        print(f"project={project_dir}")
        print(f"installed={user_dir}")


if __name__ == "__main__":
    main()
