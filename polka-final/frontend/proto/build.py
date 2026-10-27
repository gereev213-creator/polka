#!/usr/bin/env python3
"""Build a self-contained index.html from template.html (fonts + images inlined)."""
import base64
import mimetypes
from pathlib import Path

ROOT = Path(__file__).resolve().parent
ASSETS = {
    "logo.png": "--logo",
    "iphone.jpg": "--iphone",
    "jacket.jpg": "--jacket",
    "banner-search.png": "--banner",
    "search.png": "--searchicon",
}


def font_css() -> str:
    faces = []
    for filename, weight in (
        ("SFPro-ExpandedBold.woff2", 760),
        ("SFPro-ExpandedHeavy.woff2", 870),
    ):
        data = base64.b64encode((ROOT / "assets" / filename).read_bytes()).decode()
        faces.append(
            "@font-face{font-family:'SF Pro Expanded';font-style:normal;"
            f"font-weight:{weight};font-stretch:132%;font-display:swap;"
            f"src:url(data:font/woff2;base64,{data}) format('woff2');}}"
        )
    return "\n".join(faces)


def main() -> None:
    template = (ROOT / "template.html").read_text(encoding="utf-8")
    fonts = font_css()
    declarations = []
    for filename, variable in ASSETS.items():
        path = ROOT / "assets" / filename
        mime = mimetypes.guess_type(filename)[0] or "application/octet-stream"
        declarations.append(
            f"{variable}:url(data:{mime};base64,{base64.b64encode(path.read_bytes()).decode()});"
        )
    html = template.replace("/*__FONTS__*/", fonts).replace(
        "/*__ASSETS__*/", "".join(declarations)
    )
    assert "__FONTS__" not in html and "__ASSETS__" not in html
    (ROOT / "index.html").write_text(html, encoding="utf-8")
    print(f"built index.html ({len(html) / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
