"""Stream an immutable runtime into a portable tar.gz without user state."""
from __future__ import annotations

import argparse
import gzip
from pathlib import Path
import tarfile


def pack(root: Path, archive: Path) -> None:
    root = root.resolve()
    archive = archive.resolve()
    if archive.is_relative_to(root):
        raise ValueError("Archive must be outside the runtime directory")
    if not (root / "manifest.json").is_file():
        raise ValueError("Official runtime manifest is missing")
    archive.parent.mkdir(parents=True, exist_ok=True)
    with archive.open("xb") as output:
        with gzip.GzipFile(filename="", mode="wb", fileobj=output, mtime=0, compresslevel=6) as compressed:
            with tarfile.open(fileobj=compressed, mode="w|", format=tarfile.PAX_FORMAT) as bundle:
                for item in sorted(root.rglob("*")):
                    relative = item.relative_to(root)
                    if item.is_symlink() or item.is_junction():
                        raise ValueError(f"Payload link is not allowed: {relative}")
                    if any(part in {".env", ".git", ".hermes", "id_rsa", "id_ed25519"}
                           for part in relative.parts):
                        raise ValueError(f"Private state is not allowed: {relative}")
                    if item.is_dir():
                        continue
                    if not item.is_file():
                        raise ValueError(f"Unsupported payload member: {relative}")
                    info = bundle.gettarinfo(str(item), arcname=relative.as_posix())
                    info.uid = info.gid = 0
                    info.uname = info.gname = ""
                    info.mtime = 0
                    info.mode = 0o755 if item.suffix.lower() in {".exe", ".cmd", ".bat", ".sh"} else 0o644
                    with item.open("rb") as source:
                        bundle.addfile(info, source)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", required=True, type=Path)
    parser.add_argument("--archive", required=True, type=Path)
    arguments = parser.parse_args()
    pack(arguments.root, arguments.archive)
    print(arguments.archive)
