"""Native library auto-download and discovery for Talon Python SDK."""

import hashlib
import os
import platform
import sys
import tarfile
import urllib.request


# GitHub Release base URL
_REPO = "darkmice/talon-bin"
_VERSION = "0.1.3"


def _platform_info():
    """Returns (lib_name, platform_dir, release_name)."""
    system = platform.system()
    machine = platform.machine()

    if system == "Darwin":
        lib_name = "libtalon.dylib"
        arch = "arm64" if machine == "arm64" else "amd64"
        plat_dir = f"darwin_{arch}"
        release_name = f"talon-macos-{arch}"
    elif system == "Windows":
        lib_name = "talon.dll"
        plat_dir = "windows_amd64"
        release_name = "talon-windows-amd64"
    else:
        lib_name = "libtalon.so"
        if machine == "aarch64":
            arch = "arm64"
        elif machine == "loongarch64":
            arch = "loongarch64"
        elif machine == "riscv64":
            arch = "riscv64"
        else:
            arch = "amd64"
        plat_dir = f"linux_{arch}"
        release_name = f"talon-linux-{arch}"

    return lib_name, plat_dir, release_name


def _cache_dir():
    """Return the cache directory for downloaded native libraries."""
    base = os.environ.get("TALON_CACHE_DIR")
    if not base:
        if platform.system() == "Darwin":
            base = os.path.join(os.path.expanduser("~"), "Library", "Caches", "talon")
        elif platform.system() == "Windows":
            base = os.path.join(os.environ.get("LOCALAPPDATA", os.path.expanduser("~")), "talon", "cache")
        else:
            xdg = os.environ.get("XDG_CACHE_HOME", os.path.join(os.path.expanduser("~"), ".cache"))
            base = os.path.join(xdg, "talon")
    return os.path.join(base, _VERSION)


def _download_lib(dest_dir):
    """Download the native library from GitHub Releases."""
    lib_name, _, release_name = _platform_info()
    archive_name = f"libtalon-{release_name}.tar.gz"
    url = f"https://github.com/{_REPO}/releases/download/v{_VERSION}/{archive_name}"

    os.makedirs(dest_dir, exist_ok=True)
    archive_path = os.path.join(dest_dir, archive_name)

    print(f"[talon] Downloading native library v{_VERSION} for {release_name}...")
    try:
        # Support proxy from environment
        proxy = os.environ.get("https_proxy") or os.environ.get("HTTPS_PROXY")
        if proxy:
            handler = urllib.request.ProxyHandler({"https": proxy, "http": proxy})
            opener = urllib.request.build_opener(handler)
        else:
            opener = urllib.request.build_opener()
        opener.addheaders = [("User-Agent", "talon-python-sdk")]

        with opener.open(url) as resp, open(archive_path, "wb") as f:
            while True:
                chunk = resp.read(65536)
                if not chunk:
                    break
                f.write(chunk)

        with tarfile.open(archive_path, "r:gz") as tar:
            tar.extractall(dest_dir)

        os.remove(archive_path)
        lib_path = os.path.join(dest_dir, lib_name)
        if os.path.isfile(lib_path):
            print(f"[talon] Native library ready: {lib_path}")
            return lib_path
        else:
            print(f"[talon] Warning: {lib_name} not found after extraction", file=sys.stderr)
            return None
    except Exception as e:
        print(f"[talon] Failed to download native library: {e}", file=sys.stderr)
        if os.path.exists(archive_path):
            os.remove(archive_path)
        return None


def find_lib():
    """Find the libtalon native library, downloading if necessary.

    Search order:
    1. TALON_LIB_PATH environment variable
    2. Package data (platform wheel)
    3. SDK development layout (talon-sdk/lib/{platform}/)
    4. Cache directory (auto-downloaded)
    5. System library path (fallback)
    """
    lib_name, plat_dir, _ = _platform_info()

    # 1. Environment variable
    env_path = os.environ.get("TALON_LIB_PATH")
    if env_path and os.path.isfile(env_path):
        return env_path

    # 2. Package data (installed via platform wheel)
    here = os.path.dirname(os.path.abspath(__file__))
    pkg_lib = os.path.join(here, "native", lib_name)
    if os.path.isfile(pkg_lib):
        return pkg_lib

    # 3. SDK development layout
    sdk_root = os.path.dirname(os.path.dirname(here))
    bundled = os.path.join(sdk_root, "lib", plat_dir, lib_name)
    if os.path.isfile(bundled):
        return bundled

    # 4. Cache directory (auto-download)
    cache = _cache_dir()
    cached = os.path.join(cache, lib_name)
    if os.path.isfile(cached):
        return cached

    # Try downloading
    downloaded = _download_lib(cache)
    if downloaded:
        return downloaded

    # 5. Fallback to system path
    return lib_name
